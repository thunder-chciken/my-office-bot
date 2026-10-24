<?php
/**
 * Signed delivery to My Office Bot, with a persistent retry queue.
 *
 * Each submission gets a stable event id before it's queued, so retries are recognized as the same lead.
 * Sending happens after the visitor's page has been answered (never slows the form down). If My Office Bot
 * can't be reached, the item stays queued and is retried on a schedule, on admin visits and after the next
 * submission, so a quiet site still catches up.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Client {

	const QUEUE      = 'mob_queue';
	const FAILED     = 'mob_failed';
	const LAST_SENT  = 'mob_last_sent';
	const CRON_HOOK  = 'mob_flush_queue';
	const MAX_QUEUE  = 200;
	const GIVE_UP    = 3 * DAY_IN_SECONDS;

	private static $flush_scheduled = false;

	public static function init() {
		add_filter( 'cron_schedules', array( __CLASS__, 'cron_schedules' ) );
		add_action( self::CRON_HOOK, array( __CLASS__, 'flush' ) );
		add_action( 'admin_init', array( __CLASS__, 'flush_if_due' ) );
		add_action( 'init', array( __CLASS__, 'ensure_scheduled' ) );
	}

	public static function cron_schedules( $schedules ) {
		$schedules['mob_five_minutes'] = array(
			'interval' => 5 * MINUTE_IN_SECONDS,
			'display'  => 'Every 5 minutes (My Office Bot)',
		);
		return $schedules;
	}

	public static function schedule() {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + MINUTE_IN_SECONDS, 'mob_five_minutes', self::CRON_HOOK );
		}
	}

	public static function ensure_scheduled() {
		self::schedule();
	}

	public static function unschedule() {
		wp_clear_scheduled_hook( self::CRON_HOOK );
	}

	/** The connection code from the app: "MOB1.<site key>.<secret>". Stored only in the database, never output publicly. */
	public static function credentials() {
		$code = (string) get_option( 'mob_connection_code', '' );
		if ( ! preg_match( '/^MOB1\.([0-9a-f]{16,64})\.([0-9a-f]{32,128})$/i', trim( $code ), $m ) ) {
			return null;
		}
		return array(
			'site'   => strtolower( $m[1] ),
			'secret' => strtolower( $m[2] ),
		);
	}

	/** Queue a submission and send it once the visitor's response is on its way. */
	public static function enqueue( array $payload ) {
		$payload['event_id']       = wp_generate_uuid4();
		$payload['plugin_version'] = MOB_VERSION;
		$payload['site_url']       = home_url();

		$queue   = self::get_list( self::QUEUE );
		$queue[] = array(
			'payload'  => $payload,
			'attempts' => 0,
			'next'     => 0,
			'created'  => time(),
		);
		if ( count( $queue ) > self::MAX_QUEUE ) {
			$queue = array_slice( $queue, -self::MAX_QUEUE );
		}
		update_option( self::QUEUE, $queue, false );

		if ( ! self::$flush_scheduled ) {
			self::$flush_scheduled = true;
			add_action( 'shutdown', array( __CLASS__, 'flush_after_response' ), 999 );
		}
	}

	public static function flush_after_response() {
		if ( function_exists( 'fastcgi_finish_request' ) ) {
			fastcgi_finish_request();
		} elseif ( function_exists( 'litespeed_finish_request' ) ) {
			litespeed_finish_request();
		}
		self::flush();
	}

	/** At most once a minute from admin pages, as a backup to WP-Cron on low-traffic sites. */
	public static function flush_if_due() {
		if ( get_transient( 'mob_admin_flush' ) ) {
			return;
		}
		set_transient( 'mob_admin_flush', 1, MINUTE_IN_SECONDS );
		self::flush();
	}

	/** Send everything that's due. Safe to call often; a lock stops two flushes overlapping. */
	public static function flush() {
		if ( get_transient( 'mob_flush_lock' ) ) {
			return;
		}
		set_transient( 'mob_flush_lock', 1, 60 );

		$queue = self::get_list( self::QUEUE );
		$keep  = array();
		$now   = time();
		foreach ( $queue as $item ) {
			if ( $item['next'] > $now ) {
				$keep[] = $item;
				continue;
			}
			$result = self::send( 'submit', $item['payload'] );
			if ( $result['done'] ) {
				if ( $result['ok'] ) {
					update_option( self::LAST_SENT, $now, false );
				} else {
					self::remember_failure( $item, $result['message'] );
				}
				continue;
			}
			$item['attempts']++;
			if ( $now - $item['created'] > self::GIVE_UP ) {
				self::remember_failure( $item, $result['message'] );
				continue;
			}
			$item['next'] = $now + min( 6 * HOUR_IN_SECONDS, 60 * ( 2 ** min( $item['attempts'], 9 ) ) );
			$keep[]       = $item;
		}
		// Items added while we were sending are kept too.
		$latest = self::get_list( self::QUEUE );
		$sent   = array_map( fn( $i ) => $i['payload']['event_id'], $queue );
		foreach ( $latest as $item ) {
			if ( ! in_array( $item['payload']['event_id'], $sent, true ) ) {
				$keep[] = $item;
			}
		}
		update_option( self::QUEUE, $keep, false );
		delete_transient( 'mob_flush_lock' );
	}

	/**
	 * POST a signed request. Returns [ 'ok' => bool, 'done' => bool (no point retrying), 'message' => string, 'body' => array ].
	 */
	public static function send( $endpoint, array $payload ) {
		$creds = self::credentials();
		if ( ! $creds ) {
			return array( 'ok' => false, 'done' => false, 'message' => __( 'Not connected yet. Paste your connection code under My Office Bot in the WordPress sidebar.', 'my-office-bot' ), 'body' => array() );
		}
		$body = wp_json_encode( $payload );
		$ts   = (string) time();
		$res  = wp_remote_post(
			MOB_API . '/' . $endpoint,
			array(
				'timeout' => 8,
				'headers' => array(
					'Content-Type'    => 'application/json',
					'X-MOB-Site'      => $creds['site'],
					'X-MOB-Timestamp' => $ts,
					'X-MOB-Signature' => hash_hmac( 'sha256', $ts . '.' . $body, $creds['secret'] ),
				),
				'body'    => $body,
			)
		);
		if ( is_wp_error( $res ) ) {
			return array( 'ok' => false, 'done' => false, 'message' => $res->get_error_message(), 'body' => array() );
		}
		$code = (int) wp_remote_retrieve_response_code( $res );
		$data = json_decode( wp_remote_retrieve_body( $res ), true );
		$data = is_array( $data ) ? $data : array();
		if ( $code >= 200 && $code < 300 ) {
			return array( 'ok' => true, 'done' => true, 'message' => '', 'body' => $data );
		}
		// 4xx (except 429 and a bad signature, which may be a changed code) won't succeed on retry.
		$final = $code >= 400 && $code < 500 && 429 !== $code && 401 !== $code;
		return array( 'ok' => false, 'done' => $final, 'message' => $data['error'] ?? ( 'HTTP ' . $code ), 'body' => $data );
	}

	private static function remember_failure( array $item, $message ) {
		$failed   = self::get_list( self::FAILED );
		$failed[] = array(
			'at'      => time(),
			'form'    => $item['payload']['form_name'] ?? '',
			'builder' => $item['payload']['builder'] ?? '',
			'message' => (string) $message,
		);
		update_option( self::FAILED, array_slice( $failed, -20 ), false );
	}

	public static function get_list( $option ) {
		$v = get_option( $option, array() );
		return is_array( $v ) ? $v : array();
	}
}

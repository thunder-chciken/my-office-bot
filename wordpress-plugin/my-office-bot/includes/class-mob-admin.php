<?php
/**
 * The My Office Bot screen in WordPress (its own sidebar item, D61). New installs get a four-step setup
 * (connect, catch your forms, chat bubble, who gets alerts); after that it's a small dashboard with
 * Overview, Forms, Chat bubble and Delivery tabs. Styled like the app (assets/admin.css).
 * Admins only (manage_options), every change nonce-checked.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Admin {

	const SLUG  = 'my-office-bot';
	const HOOK  = 'toplevel_page_my-office-bot';
	const SETUP = 'mob_setup';
	const APP   = 'https://myofficebot.app/app';
	const TABS  = array( 'overview', 'forms', 'bubble', 'delivery' );

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'old_url' ) );
		add_action( 'admin_head', array( __CLASS__, 'menu_icon_css' ) );
		add_action( 'load-' . self::HOOK, array( __CLASS__, 'quiet_notices' ) );
		add_action( 'admin_post_mob_save_code', array( __CLASS__, 'save_code' ) );
		add_action( 'admin_post_mob_test', array( __CLASS__, 'test' ) );
		add_action( 'admin_post_mob_flush', array( __CLASS__, 'flush' ) );
		add_action( 'admin_post_mob_save_forms', array( __CLASS__, 'save_forms' ) );
		add_action( 'admin_post_mob_save_bubble', array( __CLASS__, 'save_bubble' ) );
		add_action( 'admin_post_mob_setup', array( __CLASS__, 'setup_step' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( MOB_FILE ), array( __CLASS__, 'links' ) );
	}

	public static function links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( self::url() ) . '">' . esc_html__( 'Open', 'my-office-bot' ) . '</a>' );
		return $links;
	}

	/** Its own place in the sidebar, right under Dashboard. */
	public static function menu() {
		add_menu_page(
			'My Office Bot',
			'My Office Bot',
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'render' ),
			plugins_url( 'assets/menu-icon.png', MOB_FILE ),
			'3.1'
		);
	}

	/** Bookmarks to the old Settings > My Office Bot page land on the new one. */
	public static function old_url() {
		global $pagenow;
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only redirect.
		if ( 'options-general.php' === $pagenow && isset( $_GET['page'] ) && self::SLUG === $_GET['page'] ) {
			wp_safe_redirect( self::url() );
			exit;
		}
	}

	/** The mascot icon in full color and sharp, like the other sidebar icons' size. */
	public static function menu_icon_css() {
		echo '<style>#adminmenu .toplevel_page_my-office-bot .wp-menu-image img{width:20px;height:20px;padding:7px 0 0;opacity:1}</style>';
	}

	/** Other plugins' banners crowd this screen; they still show everywhere else in WordPress. */
	public static function quiet_notices() {
		remove_all_actions( 'admin_notices' );
		remove_all_actions( 'all_admin_notices' );
	}

	public static function assets( $hook ) {
		if ( self::HOOK !== $hook ) {
			return;
		}
		$url = plugins_url( 'assets/', MOB_FILE );
		wp_enqueue_style( 'mob-admin', $url . 'admin.css', array(), MOB_VERSION );
		wp_enqueue_style( 'mob-bubble', $url . 'bubble.css', array(), MOB_VERSION );
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_media();
		wp_enqueue_script( 'mob-admin-bubble', $url . 'admin-bubble.js', array( 'jquery', 'wp-color-picker' ), MOB_VERSION, true );
	}

	private static function url( array $args = array() ) {
		return add_query_arg( array_merge( array( 'page' => self::SLUG ), $args ), admin_url( 'admin.php' ) );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'my-office-bot' ) );
		}
		check_admin_referer( $action );
	}

	private static function done( $msg, $ok = true, array $args = array() ) {
		set_transient( 'mob_notice_' . get_current_user_id(), array( 'msg' => $msg, 'ok' => $ok ), 60 );
		wp_safe_redirect( self::url( $args ) );
		exit;
	}

	/** Where to go back to after saving: the same tab once set up, otherwise the setup steps. */
	private static function back() {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- checked in guard().
		$tab = isset( $_POST['mob_tab'] ) ? sanitize_key( wp_unslash( $_POST['mob_tab'] ) ) : '';
		return in_array( $tab, self::TABS, true ) && self::setup()['done'] ? array( 'tab' => $tab ) : array();
	}

	// ------------------------------------------------------------------ setup state

	public static function setup() {
		$raw = get_option( self::SETUP, false );
		$s   = is_array( $raw ) ? $raw : array();
		// Sites that saved bubble settings before the setup steps existed (0.2.x) count that step as done.
		$legacy_bubble = false === $raw && false !== get_option( MOB_Bubble::OPTION, false );
		return array(
			'forms_skipped' => ! empty( $s['forms_skipped'] ),
			'bubble_seen'   => ! empty( $s['bubble_seen'] ) || $legacy_bubble,
			'done'          => ! empty( $s['done'] ),
		);
	}

	private static function set_setup( array $patch ) {
		update_option( self::SETUP, array_merge( self::setup(), $patch ), false );
	}

	/** Which of the four steps are complete. */
	private static function steps() {
		$s      = self::setup();
		$forms  = array_filter( MOB_Client::get_list( MOB_Capture::FORMS ), fn( $f ) => 'bubble' !== ( $f['builder'] ?? '' ) );
		return array(
			'connect' => (bool) ( MOB_Client::credentials() && get_option( 'mob_business', '' ) ),
			'forms'   => $s['forms_skipped'] || count( $forms ) > 0,
			'bubble'  => $s['bubble_seen'],
			'alerts'  => $s['done'],
		);
	}

	// ------------------------------------------------------------------ actions

	public static function save_code() {
		self::guard( 'mob_save_code' );
		$code = isset( $_POST['mob_code'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['mob_code'] ) ) ) : '';
		if ( '' === $code ) {
			self::done( __( 'Paste your connection code first.', 'my-office-bot' ), false, self::back() );
		}
		if ( ! preg_match( '/^MOB1\.[0-9a-f]{16,64}\.[0-9a-f]{32,128}$/i', $code ) ) {
			self::done( __( "That doesn't look like a My Office Bot connection code. Copy it again from Website & forms in the app.", 'my-office-bot' ), false, self::back() );
		}
		update_option( 'mob_connection_code', $code, false );
		delete_option( 'mob_business' );
		self::test_and_report();
	}

	public static function test() {
		self::guard( 'mob_test' );
		self::test_and_report();
	}

	private static function test_and_report() {
		$r = MOB_Client::send(
			'ping',
			array(
				'plugin_version' => MOB_VERSION,
				'site_url'       => home_url(),
			)
		);
		if ( $r['ok'] ) {
			update_option( 'mob_business', (string) ( $r['body']['business'] ?? '' ), false );
			MOB_Client::flush();
			$msg = sprintf( __( 'Connected to %s. New submissions from your forms will now reach My Office Bot.', 'my-office-bot' ), $r['body']['business'] ?? 'My Office Bot' );
			if ( ! empty( $r['body']['paused'] ) ) {
				$msg .= ' ' . __( 'Note: this account is paused, so new leads are not being accepted right now.', 'my-office-bot' );
			}
			self::done( $msg, true, self::back() );
		}
		self::done( sprintf( __( "Couldn't connect: %s", 'my-office-bot' ), $r['message'] ), false, self::back() );
	}

	public static function flush() {
		self::guard( 'mob_flush' );
		delete_transient( 'mob_flush_lock' );
		$queue = MOB_Client::get_list( MOB_Client::QUEUE );
		foreach ( $queue as &$item ) {
			$item['next'] = 0;
		}
		update_option( MOB_Client::QUEUE, $queue, false );
		MOB_Client::flush();
		$left = count( MOB_Client::get_list( MOB_Client::QUEUE ) );
		self::done( $left ? sprintf( _n( '%d lead is still waiting to send. We will keep trying.', '%d leads are still waiting to send. We will keep trying.', $left, 'my-office-bot' ), $left ) : __( 'Everything waiting has been sent.', 'my-office-bot' ), 0 === $left, self::back() );
	}

	public static function save_forms() {
		self::guard( 'mob_save_forms' );
		foreach ( array_keys( MOB_Integrations::BUILDERS ) as $b ) {
			update_option( 'mob_builder_' . $b, ! empty( $_POST['builder'][ $b ] ), false );
		}
		$forms   = MOB_Client::get_list( MOB_Capture::FORMS );
		$enabled = isset( $_POST['enabled'] ) ? (array) wp_unslash( $_POST['enabled'] ) : array();
		$map     = isset( $_POST['map'] ) ? (array) wp_unslash( $_POST['map'] ) : array();
		$valid   = array_merge( MOB_Mapper::TARGETS, array( 'auto', 'none' ) );
		foreach ( $forms as $id => &$form ) {
			$form['enabled'] = ! empty( $enabled[ $id ] );
			$override        = array();
			foreach ( (array) ( $map[ $id ] ?? array() ) as $field_key => $choice ) {
				$choice = sanitize_key( $choice );
				if ( ! in_array( $choice, $valid, true ) || 'auto' === $choice ) {
					continue;
				}
				$override[ sanitize_text_field( $field_key ) ] = 'none' === $choice ? '' : $choice;
			}
			$form['override'] = $override;
		}
		update_option( MOB_Capture::FORMS, $forms, false );
		self::done( __( 'Saved.', 'my-office-bot' ), true, self::back() );
	}

	public static function save_bubble() {
		self::guard( 'mob_save_bubble' );
		$in = isset( $_POST['bubble'] ) ? (array) wp_unslash( $_POST['bubble'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitized by MOB_Bubble::sanitize().
		$s  = MOB_Bubble::sanitize( $in );
		update_option( MOB_Bubble::OPTION, $s, false );
		self::set_setup( array( 'bubble_seen' => true ) );
		$args = self::setup()['done'] ? array( 'tab' => 'bubble' ) : array();
		if ( $s['enabled'] && ! MOB_Client::credentials() ) {
			self::done( __( 'Saved. The chat bubble will appear on your site once you connect.', 'my-office-bot' ), true, $args );
		}
		self::done( $s['enabled'] ? __( 'Saved. The chat bubble is on your site now.', 'my-office-bot' ) : __( 'Saved. The chat bubble is off.', 'my-office-bot' ), true, $args );
	}

	/** Setup buttons: skip the forms step, "not now" for the bubble, finish, or run setup again. */
	public static function setup_step() {
		self::guard( 'mob_setup' );
		$step = isset( $_POST['step'] ) ? sanitize_key( wp_unslash( $_POST['step'] ) ) : '';
		switch ( $step ) {
			case 'skip_forms':
				self::set_setup( array( 'forms_skipped' => true ) );
				break;
			case 'skip_bubble':
				self::set_setup( array( 'bubble_seen' => true ) );
				break;
			case 'finish':
				self::set_setup( array( 'done' => true ) );
				self::done( __( "You're all set. New leads from this site go straight to My Office Bot.", 'my-office-bot' ) );
				break;
			case 'restart':
				update_option( self::SETUP, array(), false );
				break;
		}
		wp_safe_redirect( self::url() );
		exit;
	}

	// ------------------------------------------------------------------ helpers for the page

	private static function installed() {
		return array(
			'bricks'     => defined( 'BRICKS_VERSION' ),
			'divi'       => defined( 'ET_BUILDER_VERSION' ) || function_exists( 'et_setup_theme' ),
			'cf7'        => defined( 'WPCF7_VERSION' ),
			'wpforms'    => function_exists( 'wpforms' ),
			'gravity'    => class_exists( 'GFForms' ),
			'elementor'  => defined( 'ELEMENTOR_PRO_VERSION' ),
			'fluentform' => defined( 'FLUENTFORM' ) || defined( 'FLUENTFORM_VERSION' ),
		);
	}

	private static function post_form( $action, $inner, $class = '' ) {
		?>
		<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="<?php echo esc_attr( $class ); ?>">
			<?php wp_nonce_field( $action ); ?>
			<input type="hidden" name="action" value="<?php echo esc_attr( $action ); ?>" />
			<?php $inner(); ?>
		</form>
		<?php
	}

	private static function setup_button( $step, $label, $class = 'mob-btn mob-btn-soft' ) {
		self::post_form(
			'mob_setup',
			function () use ( $step, $label, $class ) {
				?>
				<input type="hidden" name="step" value="<?php echo esc_attr( $step ); ?>" />
				<button type="submit" class="<?php echo esc_attr( $class ); ?>"><?php echo esc_html( $label ); ?></button>
				<?php
			},
			'mob-inline'
		);
	}

	private static function ago( $ts ) {
		return $ts ? sprintf( __( '%s ago', 'my-office-bot' ), human_time_diff( (int) $ts ) ) : __( 'not yet', 'my-office-bot' );
	}

	private static function icon( $name ) {
		$paths = array(
			'check'  => '<path d="m5 12 5 5L20 7"/>',
			'link'   => '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
			'plug'   => '<path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/>',
			'form'   => '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>',
			'chat'   => '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
			'people' => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
			'send'   => '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
			'alert'  => '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
		);
		return '<svg class="mob-ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ( $paths[ $name ] ?? '' ) . '</svg>';
	}

	// ------------------------------------------------------------------ page

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$notice = get_transient( 'mob_notice_' . get_current_user_id() );
		delete_transient( 'mob_notice_' . get_current_user_id() );
		$setup = self::setup();
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only navigation.
		$tab = isset( $_GET['tab'] ) ? sanitize_key( wp_unslash( $_GET['tab'] ) ) : 'overview';
		$tab = in_array( $tab, self::TABS, true ) ? $tab : 'overview';
		?>
		<div class="wrap mob-app">
			<h1 class="screen-reader-text">My Office Bot</h1>
			<header class="mob-top">
				<img class="mob-mascot" src="<?php echo esc_url( plugins_url( 'assets/mascot-96.png', MOB_FILE ) ); ?>" alt="" width="48" height="48" />
				<span class="mob-wordmark">My <span>Office</span> Bot</span>
				<a class="mob-btn mob-btn-soft mob-top-link" href="<?php echo esc_url( self::APP ); ?>" target="_blank" rel="noopener"><?php echo self::icon( 'link' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> <?php esc_html_e( 'Open the app', 'my-office-bot' ); ?></a>
			</header>

			<?php if ( $notice ) : ?>
				<div class="mob-toast <?php echo $notice['ok'] ? 'is-ok' : 'is-error'; ?>" role="status">
					<?php echo self::icon( $notice['ok'] ? 'check' : 'alert' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
					<span><?php echo esc_html( $notice['msg'] ); ?></span>
				</div>
			<?php endif; ?>

			<?php
			if ( $setup['done'] ) {
				self::render_dashboard( $tab );
			} else {
				self::render_setup();
			}
			?>
		</div>
		<?php
	}

	// ------------------------------------------------------------------ setup

	private static function render_setup() {
		$steps   = self::steps();
		$order   = array( 'connect', 'forms', 'bubble', 'alerts' );
		$current = 'alerts';
		foreach ( $order as $key ) {
			if ( ! $steps[ $key ] ) {
				$current = $key;
				break;
			}
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only navigation.
		if ( isset( $_GET['step'] ) && 'bubble' === $_GET['step'] && $steps['connect'] ) {
			$current = 'bubble';
		}
		$done_count = count( array_filter( $steps ) );
		$titles     = array(
			'connect' => array( 'plug', __( 'Connect your account', 'my-office-bot' ), __( 'Link this website to your My Office Bot account.', 'my-office-bot' ) ),
			'forms'   => array( 'form', __( 'Catch your forms', 'my-office-bot' ), __( 'Your forms stay exactly as they are. We send a copy of each lead.', 'my-office-bot' ) ),
			'bubble'  => array( 'chat', __( 'Chat bubble (optional)', 'my-office-bot' ), __( 'A "Get a quote" button in the corner of every page.', 'my-office-bot' ) ),
			'alerts'  => array( 'people', __( 'Who gets alerts', 'my-office-bot' ), __( 'Choose who hears about new leads.', 'my-office-bot' ) ),
		);
		?>
		<section class="mob-hero">
			<p class="mob-eyebrow"><?php echo esc_html( sprintf( __( 'Setup · %1$d of %2$d done', 'my-office-bot' ), $done_count, 4 ) ); ?></p>
			<h2><?php esc_html_e( "Let's get your website leads to your phone", 'my-office-bot' ); ?></h2>
			<div class="mob-progress" aria-hidden="true"><span style="width:<?php echo esc_attr( (string) ( $done_count * 25 ) ); ?>%"></span></div>
		</section>

		<ol class="mob-steps">
			<?php foreach ( $order as $i => $key ) : ?>
				<?php
				list( $icon, $title, $sub ) = $titles[ $key ];
				$state                      = $key === $current ? 'is-current' : ( $steps[ $key ] ? 'is-done' : 'is-later' );
				?>
				<li class="mob-step <?php echo esc_attr( $state ); ?>">
					<div class="mob-step-head">
						<span class="mob-step-num"><?php echo $steps[ $key ] && $key !== $current ? self::icon( 'check' ) : esc_html( (string) ( $i + 1 ) ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
						<div>
							<h3><?php echo esc_html( $title ); ?></h3>
							<p><?php echo esc_html( $sub ); ?></p>
						</div>
					</div>
					<?php if ( 'is-current' === $state ) : ?>
						<div class="mob-step-body">
							<?php call_user_func( array( __CLASS__, 'step_' . $key ) ); ?>
						</div>
					<?php endif; ?>
				</li>
			<?php endforeach; ?>
		</ol>
		<?php
	}

	private static function step_connect() {
		?>
		<ol class="mob-howto">
			<li><?php echo wp_kses( __( 'Open <a href="https://myofficebot.app/app" target="_blank" rel="noopener">My Office Bot</a> and go to <b>Website &amp; forms</b>.', 'my-office-bot' ), array( 'a' => array( 'href' => true, 'target' => true, 'rel' => true ), 'b' => array() ) ); ?></li>
			<li><?php echo wp_kses( __( 'Tap <b>Copy code</b> under "Your connection code".', 'my-office-bot' ), array( 'b' => array() ) ); ?></li>
			<li><?php esc_html_e( 'Paste it here and connect.', 'my-office-bot' ); ?></li>
		</ol>
		<?php
		self::connect_form( __( 'Connect', 'my-office-bot' ) );
		?>
		<p class="mob-fine"><?php esc_html_e( "Don't have an account yet? Start free at myofficebot.app. Your connection code is private, like a password.", 'my-office-bot' ); ?></p>
		<?php
	}

	private static function connect_form( $label, $tab = '' ) {
		$creds = MOB_Client::credentials();
		self::post_form(
			'mob_save_code',
			function () use ( $label, $creds, $tab ) {
				?>
				<input type="hidden" name="mob_tab" value="<?php echo esc_attr( $tab ); ?>" />
				<div class="mob-code-row">
					<input type="password" name="mob_code" class="mob-input" autocomplete="off" aria-label="<?php esc_attr_e( 'Connection code', 'my-office-bot' ); ?>"
						placeholder="<?php echo $creds ? esc_attr__( 'Saved. Paste a new code to replace it.', 'my-office-bot' ) : 'MOB1....'; ?>" />
					<button type="submit" class="mob-btn mob-btn-primary"><?php echo esc_html( $label ); ?></button>
				</div>
				<?php
			}
		);
	}

	private static function step_forms() {
		$installed = array_filter( self::installed() );
		$names     = array_map( fn( $k ) => MOB_Integrations::BUILDERS[ $k ], array_keys( $installed ) );
		?>
		<?php if ( $names ) : ?>
			<p class="mob-found"><?php echo self::icon( 'check' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				<?php echo esc_html( sprintf( __( 'We found %s on this site.', 'my-office-bot' ), implode( ', ', $names ) ) ); ?></p>
		<?php else : ?>
			<p class="mob-found is-warn"><?php echo self::icon( 'alert' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				<?php esc_html_e( "We didn't find a form plugin we know. You can still use the chat bubble in the next step.", 'my-office-bot' ); ?></p>
		<?php endif; ?>
		<ol class="mob-howto">
			<li><?php esc_html_e( 'Open your website in another tab and send a test from your contact form (use your own name and phone).', 'my-office-bot' ); ?></li>
			<li><?php esc_html_e( 'Come back here and check. Your form shows up once its first lead comes through.', 'my-office-bot' ); ?></li>
		</ol>
		<div class="mob-actions">
			<a class="mob-btn mob-btn-primary" href="<?php echo esc_url( self::url() ); ?>"><?php esc_html_e( 'I sent a test, check now', 'my-office-bot' ); ?></a>
			<?php self::setup_button( 'skip_forms', __( "Skip, I'll only use the chat bubble", 'my-office-bot' ), 'mob-btn mob-btn-ghost' ); ?>
		</div>
		<?php
	}

	private static function step_bubble() {
		?>
		<p><?php esc_html_e( 'Visitors tap it and leave their name, phone number and what they need. Pick your color, icon or logo and wording below, then save. You can turn it on or off any time.', 'my-office-bot' ); ?></p>
		<?php self::bubble_editor( '' ); ?>
		<div class="mob-actions">
			<?php self::setup_button( 'skip_bubble', __( 'Not now, skip the bubble', 'my-office-bot' ), 'mob-btn mob-btn-ghost' ); ?>
		</div>
		<?php
	}

	private static function step_alerts() {
		?>
		<p><?php esc_html_e( 'Everyone on your Team & alerts list in My Office Bot gets every lead from this site, by email now and by text when it\'s turned on. Add your office manager, a partner or a crew lead there.', 'my-office-bot' ); ?></p>
		<div class="mob-actions">
			<a class="mob-btn mob-btn-soft" href="<?php echo esc_url( self::APP ); ?>" target="_blank" rel="noopener"><?php echo self::icon( 'people' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> <?php esc_html_e( 'Open Team & alerts', 'my-office-bot' ); ?></a>
			<?php self::setup_button( 'finish', __( 'Finish setup', 'my-office-bot' ), 'mob-btn mob-btn-primary' ); ?>
		</div>
		<?php
	}

	// ------------------------------------------------------------------ dashboard

	private static function render_dashboard( $tab ) {
		$labels = array(
			'overview' => __( 'Overview', 'my-office-bot' ),
			'forms'    => __( 'Forms', 'my-office-bot' ),
			'bubble'   => __( 'Chat bubble', 'my-office-bot' ),
			'delivery' => __( 'Delivery', 'my-office-bot' ),
		);
		?>
		<nav class="mob-tabs" aria-label="<?php esc_attr_e( 'My Office Bot sections', 'my-office-bot' ); ?>">
			<?php foreach ( $labels as $key => $label ) : ?>
				<a href="<?php echo esc_url( self::url( array( 'tab' => $key ) ) ); ?>" class="<?php echo $key === $tab ? 'is-active' : ''; ?>" <?php echo $key === $tab ? 'aria-current="page"' : ''; ?>><?php echo esc_html( $label ); ?></a>
			<?php endforeach; ?>
		</nav>
		<?php
		call_user_func( array( __CLASS__, 'tab_' . $tab ) );
	}

	private static function tab_overview() {
		$creds     = MOB_Client::credentials();
		$business  = (string) get_option( 'mob_business', '' );
		$last_sent = (int) get_option( MOB_Client::LAST_SENT, 0 );
		$queue     = MOB_Client::get_list( MOB_Client::QUEUE );
		$failed    = MOB_Client::get_list( MOB_Client::FAILED );
		$forms     = MOB_Client::get_list( MOB_Capture::FORMS );
		$bubble    = MOB_Bubble::settings();
		$live      = $creds && $business;
		?>
		<section class="mob-card mob-status <?php echo $live ? 'is-ok' : 'is-warn'; ?>">
			<span class="mob-dot" aria-hidden="true"></span>
			<div>
				<h2><?php echo $live ? esc_html( sprintf( __( 'Connected to %s', 'my-office-bot' ), $business ) ) : esc_html__( 'Not connected', 'my-office-bot' ); ?></h2>
				<p><?php echo $live ? esc_html( sprintf( __( 'Last lead sent %s', 'my-office-bot' ), self::ago( $last_sent ) ) ) : esc_html__( 'Paste your connection code below so leads reach you.', 'my-office-bot' ); ?></p>
			</div>
			<?php if ( $creds ) : ?>
				<?php
				self::post_form(
					'mob_test',
					function () {
						?>
						<input type="hidden" name="mob_tab" value="overview" />
						<button type="submit" class="mob-btn mob-btn-soft"><?php esc_html_e( 'Test connection', 'my-office-bot' ); ?></button>
						<?php
					},
					'mob-inline'
				);
				?>
			<?php endif; ?>
		</section>

		<div class="mob-stats">
			<a class="mob-stat" href="<?php echo esc_url( self::url( array( 'tab' => 'forms' ) ) ); ?>">
				<span class="mob-stat-num"><?php echo esc_html( (string) count( array_filter( $forms, fn( $f ) => ! empty( $f['enabled'] ) ) ) ); ?></span>
				<span class="mob-stat-label"><?php esc_html_e( 'Forms sending leads', 'my-office-bot' ); ?></span>
			</a>
			<a class="mob-stat" href="<?php echo esc_url( self::url( array( 'tab' => 'bubble' ) ) ); ?>">
				<span class="mob-stat-num"><?php echo $bubble['enabled'] ? esc_html__( 'On', 'my-office-bot' ) : esc_html__( 'Off', 'my-office-bot' ); ?></span>
				<span class="mob-stat-label"><?php esc_html_e( 'Chat bubble', 'my-office-bot' ); ?></span>
			</a>
			<a class="mob-stat <?php echo $queue || $failed ? 'is-warn' : ''; ?>" href="<?php echo esc_url( self::url( array( 'tab' => 'delivery' ) ) ); ?>">
				<span class="mob-stat-num"><?php echo esc_html( (string) count( $queue ) ); ?></span>
				<span class="mob-stat-label"><?php esc_html_e( 'Waiting to send', 'my-office-bot' ); ?></span>
			</a>
		</div>

		<section class="mob-card">
			<h3><?php echo self::icon( 'people' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> <?php esc_html_e( 'Who gets alerts?', 'my-office-bot' ); ?></h3>
			<p><?php esc_html_e( 'Add people in the My Office Bot app under Team & alerts. Everyone on the list gets every lead.', 'my-office-bot' ); ?></p>
			<a class="mob-btn mob-btn-soft" href="<?php echo esc_url( self::APP ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Open My Office Bot', 'my-office-bot' ); ?></a>
		</section>

		<details class="mob-card mob-details">
			<summary><?php esc_html_e( 'Change connection code', 'my-office-bot' ); ?></summary>
			<p><?php esc_html_e( 'Copy a new code from Website & forms in the app (for example after making a new one) and paste it here.', 'my-office-bot' ); ?></p>
			<?php self::connect_form( __( 'Save and test', 'my-office-bot' ), 'overview' ); ?>
		</details>

		<p class="mob-footer">
			<?php echo esc_html( sprintf( __( 'My Office Bot plugin %s', 'my-office-bot' ), MOB_VERSION ) ); ?> ·
			<?php self::setup_button( 'restart', __( 'Run setup again', 'my-office-bot' ), 'mob-link' ); ?>
		</p>
		<?php
	}

	private static function tab_forms() {
		$forms     = MOB_Client::get_list( MOB_Capture::FORMS );
		$installed = self::installed();
		$labels    = array(
			'auto'       => __( 'Automatic', 'my-office-bot' ),
			'name'       => __( 'Name', 'my-office-bot' ),
			'first_name' => __( 'First name', 'my-office-bot' ),
			'last_name'  => __( 'Last name', 'my-office-bot' ),
			'phone'      => __( 'Phone', 'my-office-bot' ),
			'email'      => __( 'Email', 'my-office-bot' ),
			'message'    => __( 'Message', 'my-office-bot' ),
			'service'    => __( 'Service', 'my-office-bot' ),
			'address'    => __( 'Address', 'my-office-bot' ),
			'none'       => __( "Don't send", 'my-office-bot' ),
		);
		self::post_form(
			'mob_save_forms',
			function () use ( $forms, $installed, $labels ) {
				?>
				<input type="hidden" name="mob_tab" value="forms" />
				<section class="mob-card">
					<h3><?php esc_html_e( 'Form plugins to listen to', 'my-office-bot' ); ?></h3>
					<div class="mob-chips">
						<?php foreach ( MOB_Integrations::BUILDERS as $key => $label ) : ?>
							<label class="mob-switch <?php echo $installed[ $key ] ? '' : 'is-missing'; ?>">
								<input type="checkbox" name="builder[<?php echo esc_attr( $key ); ?>]" value="1" <?php checked( get_option( 'mob_builder_' . $key, true ) ); ?> />
								<span class="mob-switch-ui" aria-hidden="true"></span>
								<span><?php echo esc_html( $label ); ?><?php echo $installed[ $key ] ? '' : ' <small>' . esc_html__( 'not installed', 'my-office-bot' ) . '</small>'; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
							</label>
						<?php endforeach; ?>
					</div>
				</section>

				<?php if ( ! $forms ) : ?>
					<section class="mob-card mob-empty">
						<h3><?php esc_html_e( 'No forms yet', 'my-office-bot' ); ?></h3>
						<p><?php esc_html_e( 'Forms show up here after their first submission. Send a test from your contact form and refresh this page. Every form is sent automatically unless you switch it off here.', 'my-office-bot' ); ?></p>
					</section>
				<?php endif; ?>

				<?php foreach ( $forms as $id => $form ) : ?>
					<section class="mob-card mob-form">
						<div class="mob-form-head">
							<label class="mob-switch">
								<input type="checkbox" name="enabled[<?php echo esc_attr( $id ); ?>]" value="1" <?php checked( ! empty( $form['enabled'] ) ); ?> />
								<span class="mob-switch-ui" aria-hidden="true"></span>
								<span class="screen-reader-text"><?php esc_html_e( 'Send leads from this form', 'my-office-bot' ); ?></span>
							</label>
							<div>
								<h3><?php echo esc_html( $form['name'] ? $form['name'] : $form['form_id'] ); ?></h3>
								<p><?php echo esc_html( 'bubble' === $form['builder'] ? __( 'My Office Bot chat bubble', 'my-office-bot' ) : ( MOB_Integrations::BUILDERS[ $form['builder'] ] ?? $form['builder'] ) ); ?>
									· <?php echo esc_html( sprintf( __( 'last lead %s', 'my-office-bot' ), self::ago( (int) ( $form['last_seen'] ?? 0 ) ) ) ); ?></p>
							</div>
						</div>
						<details class="mob-fields">
							<summary><?php echo esc_html( sprintf( _n( '%d field', '%d fields', count( (array) ( $form['fields'] ?? array() ) ), 'my-office-bot' ), count( (array) ( $form['fields'] ?? array() ) ) ) ); ?> · <?php esc_html_e( 'check what we send', 'my-office-bot' ); ?></summary>
							<div class="mob-field-grid">
								<?php foreach ( (array) ( $form['fields'] ?? array() ) as $f ) : ?>
									<?php
									$current = array_key_exists( $f['key'], (array) ( $form['override'] ?? array() ) )
										? ( $form['override'][ $f['key'] ] ? $form['override'][ $f['key'] ] : 'none' )
										: 'auto';
									$guess   = $f['guess'] ? $labels[ $f['guess'] ] : $labels['none'];
									?>
									<label class="mob-field">
										<span><?php echo esc_html( $f['label'] ? $f['label'] : $f['key'] ); ?></span>
										<select class="mob-select" name="map[<?php echo esc_attr( $id ); ?>][<?php echo esc_attr( $f['key'] ); ?>]">
											<?php foreach ( $labels as $value => $label ) : ?>
												<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $current, $value ); ?>>
													<?php echo esc_html( 'auto' === $value ? sprintf( __( 'Automatic (%s)', 'my-office-bot' ), $guess ) : $label ); ?>
												</option>
											<?php endforeach; ?>
										</select>
									</label>
								<?php endforeach; ?>
							</div>
						</details>
					</section>
				<?php endforeach; ?>

				<div class="mob-actions">
					<button type="submit" class="mob-btn mob-btn-primary"><?php esc_html_e( 'Save forms', 'my-office-bot' ); ?></button>
				</div>
				<?php
			}
		);
	}

	private static function tab_bubble() {
		?>
		<section class="mob-card">
			<h3><?php echo self::icon( 'chat' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> <?php esc_html_e( 'Chat bubble', 'my-office-bot' ); ?></h3>
			<p><?php esc_html_e( 'A "Get a quote" button in the corner of every page. Visitors leave their name, phone number and what they need, and it reaches you like any other lead.', 'my-office-bot' ); ?></p>
		</section>
		<?php
		self::bubble_editor( 'bubble' );
	}

	private static function tab_delivery() {
		$queue  = MOB_Client::get_list( MOB_Client::QUEUE );
		$failed = array_reverse( MOB_Client::get_list( MOB_Client::FAILED ) );
		?>
		<section class="mob-card mob-status <?php echo $queue ? 'is-warn' : 'is-ok'; ?>">
			<span class="mob-dot" aria-hidden="true"></span>
			<div>
				<h2>
					<?php
					echo esc_html(
						$queue
							? sprintf( _n( '%d lead is waiting to send', '%d leads are waiting to send', count( $queue ), 'my-office-bot' ), count( $queue ) )
							: __( 'Every lead has been delivered', 'my-office-bot' )
					);
					?>
				</h2>
				<p><?php esc_html_e( "If My Office Bot can't be reached, leads wait here and are retried automatically.", 'my-office-bot' ); ?></p>
			</div>
			<?php if ( $queue ) : ?>
				<?php
				self::post_form(
					'mob_flush',
					function () {
						?>
						<input type="hidden" name="mob_tab" value="delivery" />
						<button type="submit" class="mob-btn mob-btn-primary"><?php echo self::icon( 'send' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?> <?php esc_html_e( 'Send now', 'my-office-bot' ); ?></button>
						<?php
					},
					'mob-inline'
				);
				?>
			<?php endif; ?>
		</section>

		<?php if ( $failed ) : ?>
			<section class="mob-card">
				<h3><?php esc_html_e( "Couldn't deliver (most recent first)", 'my-office-bot' ); ?></h3>
				<ul class="mob-list">
					<?php foreach ( array_slice( $failed, 0, 5 ) as $f ) : ?>
						<li><b><?php echo esc_html( $f['form'] ? $f['form'] : $f['builder'] ); ?></b> · <?php echo esc_html( self::ago( (int) $f['at'] ) ); ?><br /><span><?php echo esc_html( $f['message'] ); ?></span></li>
					<?php endforeach; ?>
				</ul>
			</section>
		<?php endif; ?>

		<section class="mob-card">
			<h3><?php esc_html_e( 'Privacy', 'my-office-bot' ); ?></h3>
			<p><?php esc_html_e( 'Only the name, phone, email, address, service and message fields are sent, plus answers to multiple-choice questions (like budget or start date) added to the message. Never passwords, payment details or uploaded files. Suggested wording for your privacy policy has been added under Settings > Privacy > Policy guide.', 'my-office-bot' ); ?></p>
		</section>
		<?php
	}

	// ------------------------------------------------------------------ chat bubble editor (setup step 3 and its tab)

	private static function bubble_editor( $tab ) {
		$s     = MOB_Bubble::settings();
		$logo  = $s['logo_id'] ? wp_get_attachment_image_url( $s['logo_id'], 'thumbnail' ) : '';
		$icons = array(
			'chat'   => __( 'Chat', 'my-office-bot' ),
			'phone'  => __( 'Phone', 'my-office-bot' ),
			'home'   => __( 'House', 'my-office-bot' ),
			'wrench' => __( 'Wrench', 'my-office-bot' ),
			'logo'   => __( 'Your logo', 'my-office-bot' ),
		);
		$texts = array(
			'label'   => array( __( 'Bubble text', 'my-office-bot' ), 40 ),
			'heading' => array( __( 'Card heading', 'my-office-bot' ), 60 ),
			'button'  => array( __( 'Button text', 'my-office-bot' ), 24 ),
			'thanks'  => array( __( 'Thank-you message', 'my-office-bot' ), 160 ),
		);
		?>
		<div class="mob-bubble-wrap">
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="mob-bubble-form" class="mob-card mob-bubble-form">
				<?php wp_nonce_field( 'mob_save_bubble' ); ?>
				<input type="hidden" name="action" value="mob_save_bubble" />
				<input type="hidden" name="mob_tab" value="<?php echo esc_attr( $tab ); ?>" />

				<label class="mob-switch mob-switch-big">
					<input type="checkbox" name="bubble[enabled]" value="1" <?php checked( $s['enabled'] ); ?> />
					<span class="mob-switch-ui" aria-hidden="true"></span>
					<span><b><?php esc_html_e( 'Show the chat bubble', 'my-office-bot' ); ?></b><br /><small><?php esc_html_e( 'On every page of this site', 'my-office-bot' ); ?></small></span>
				</label>

				<div class="mob-row">
					<label class="mob-label" for="mob-color"><?php esc_html_e( 'Your brand color', 'my-office-bot' ); ?></label>
					<input type="text" id="mob-color" name="bubble[color]" value="<?php echo esc_attr( $s['color'] ); ?>" data-default-color="#0a6cff" />
					<p class="mob-fine"><?php esc_html_e( 'Text on the bubble turns white or dark automatically, whichever is easier to read.', 'my-office-bot' ); ?></p>
				</div>

				<div class="mob-row">
					<span class="mob-label"><?php esc_html_e( 'Icon', 'my-office-bot' ); ?></span>
					<div class="mob-segment">
						<?php foreach ( $icons as $value => $label ) : ?>
							<label><input type="radio" name="bubble[icon]" value="<?php echo esc_attr( $value ); ?>" <?php checked( $s['icon'], $value ); ?> /><span><?php echo esc_html( $label ); ?></span></label>
						<?php endforeach; ?>
					</div>
					<div class="mob-logo-pick">
						<input type="hidden" name="bubble[logo_id]" id="mob-logo-id" value="<?php echo esc_attr( $s['logo_id'] ); ?>" />
						<img id="mob-logo-img" src="<?php echo esc_url( $logo ); ?>" alt="" <?php echo $logo ? '' : 'hidden'; ?> />
						<button type="button" class="mob-btn mob-btn-soft" id="mob-logo-choose"><?php echo $logo ? esc_html__( 'Change logo', 'my-office-bot' ) : esc_html__( 'Choose logo', 'my-office-bot' ); ?></button>
						<button type="button" class="mob-link" id="mob-logo-remove" <?php echo $logo ? '' : 'hidden'; ?>><?php esc_html_e( 'Remove', 'my-office-bot' ); ?></button>
					</div>
					<p class="mob-fine"><?php esc_html_e( 'A square image, at least 120 x 120 pixels. It shows as a circle.', 'my-office-bot' ); ?></p>
					<p class="mob-fine mob-warn" id="mob-logo-warn" hidden></p>
				</div>

				<div class="mob-row">
					<span class="mob-label"><?php esc_html_e( 'Corner', 'my-office-bot' ); ?></span>
					<div class="mob-segment">
						<label><input type="radio" name="bubble[side]" value="right" <?php checked( $s['side'], 'right' ); ?> /><span><?php esc_html_e( 'Bottom right', 'my-office-bot' ); ?></span></label>
						<label><input type="radio" name="bubble[side]" value="left" <?php checked( $s['side'], 'left' ); ?> /><span><?php esc_html_e( 'Bottom left', 'my-office-bot' ); ?></span></label>
					</div>
				</div>

				<div class="mob-text-grid">
					<?php foreach ( $texts as $key => list( $label, $max ) ) : ?>
						<label class="mob-row">
							<span class="mob-label"><?php echo esc_html( $label ); ?></span>
							<input type="text" class="mob-input" id="mob-<?php echo esc_attr( $key ); ?>" name="bubble[<?php echo esc_attr( $key ); ?>]" data-text="<?php echo esc_attr( $key ); ?>" maxlength="<?php echo esc_attr( $max ); ?>" value="<?php echo esc_attr( $s[ $key ] ); ?>" />
						</label>
					<?php endforeach; ?>
				</div>

				<label class="mob-switch">
					<input type="checkbox" name="bubble[powered]" value="1" <?php checked( $s['powered'] ); ?> />
					<span class="mob-switch-ui" aria-hidden="true"></span>
					<span><?php esc_html_e( 'Show "Powered by My Office Bot" under the form', 'my-office-bot' ); ?></span>
				</label>

				<div class="mob-actions">
					<button type="submit" class="mob-btn mob-btn-primary"><?php esc_html_e( 'Save chat bubble', 'my-office-bot' ); ?></button>
				</div>
			</form>
			<div class="mob-preview" aria-label="<?php esc_attr_e( 'Preview', 'my-office-bot' ); ?>">
				<p class="mob-preview-label"><?php esc_html_e( 'Preview', 'my-office-bot' ); ?></p>
				<?php echo MOB_Bubble::markup( $s, true ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in markup(). ?>
			</div>
		</div>
		<?php foreach ( array( 'chat', 'phone', 'home', 'wrench' ) as $icon ) : ?>
			<template id="mob-icon-<?php echo esc_attr( $icon ); ?>"><?php echo MOB_Bubble::icon( $icon ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></template>
		<?php endforeach; ?>
		<?php
	}
}

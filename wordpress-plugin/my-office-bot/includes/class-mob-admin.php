<?php
/**
 * Settings > My Office Bot: connection code, connection test, which form builders and forms to send,
 * per-field corrections, and the delivery queue. Admins only (manage_options), every change nonce-checked.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Admin {

	const SLUG = 'my-office-bot';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_post_mob_save_code', array( __CLASS__, 'save_code' ) );
		add_action( 'admin_post_mob_test', array( __CLASS__, 'test' ) );
		add_action( 'admin_post_mob_flush', array( __CLASS__, 'flush' ) );
		add_action( 'admin_post_mob_save_forms', array( __CLASS__, 'save_forms' ) );
		add_action( 'admin_post_mob_save_bubble', array( __CLASS__, 'save_bubble' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( MOB_FILE ), array( __CLASS__, 'links' ) );
	}

	public static function links( $links ) {
		array_unshift( $links, '<a href="' . esc_url( self::url() ) . '">' . esc_html__( 'Settings', 'my-office-bot' ) . '</a>' );
		return $links;
	}

	public static function menu() {
		add_options_page( 'My Office Bot', 'My Office Bot', 'manage_options', self::SLUG, array( __CLASS__, 'render' ) );
	}

	/** Color picker, media library and the bubble's own styles, on this settings page only. */
	public static function assets( $hook ) {
		if ( 'settings_page_' . self::SLUG !== $hook ) {
			return;
		}
		$url = plugins_url( 'assets/', MOB_FILE );
		wp_enqueue_style( 'wp-color-picker' );
		wp_enqueue_media();
		wp_enqueue_style( 'mob-bubble', $url . 'bubble.css', array(), MOB_VERSION );
		wp_enqueue_script( 'mob-admin-bubble', $url . 'admin-bubble.js', array( 'jquery', 'wp-color-picker' ), MOB_VERSION, true );
	}

	private static function url( array $args = array() ) {
		return add_query_arg( array_merge( array( 'page' => self::SLUG ), $args ), admin_url( 'options-general.php' ) );
	}

	private static function guard( $action ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Sorry, you are not allowed to do that.', 'my-office-bot' ) );
		}
		check_admin_referer( $action );
	}

	private static function done( $msg, $ok = true ) {
		set_transient( 'mob_notice_' . get_current_user_id(), array( 'msg' => $msg, 'ok' => $ok ), 60 );
		wp_safe_redirect( self::url() );
		exit;
	}

	// ------------------------------------------------------------------ actions

	public static function save_code() {
		self::guard( 'mob_save_code' );
		$code = isset( $_POST['mob_code'] ) ? trim( sanitize_text_field( wp_unslash( $_POST['mob_code'] ) ) ) : '';
		if ( '' === $code ) {
			self::done( __( 'Paste your connection code first.', 'my-office-bot' ), false );
		}
		if ( ! preg_match( '/^MOB1\.[0-9a-f]{16,64}\.[0-9a-f]{32,128}$/i', $code ) ) {
			self::done( __( "That doesn't look like a My Office Bot connection code. Copy it again from the Website screen in the app.", 'my-office-bot' ), false );
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
			self::done( $msg, true );
		}
		self::done( sprintf( __( "Couldn't connect: %s", 'my-office-bot' ), $r['message'] ), false );
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
		self::done( $left ? sprintf( _n( '%d lead is still waiting to send. We will keep trying.', '%d leads are still waiting to send. We will keep trying.', $left, 'my-office-bot' ), $left ) : __( 'Everything waiting has been sent.', 'my-office-bot' ), 0 === $left );
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
		self::done( __( 'Saved.', 'my-office-bot' ) );
	}

	public static function save_bubble() {
		self::guard( 'mob_save_bubble' );
		$in = isset( $_POST['bubble'] ) ? (array) wp_unslash( $_POST['bubble'] ) : array(); // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized -- sanitized by MOB_Bubble::sanitize().
		$s  = MOB_Bubble::sanitize( $in );
		update_option( MOB_Bubble::OPTION, $s, false );
		if ( $s['enabled'] && ! MOB_Client::credentials() ) {
			self::done( __( 'Saved. The chat bubble will appear on your site once you connect above.', 'my-office-bot' ) );
		}
		self::done( $s['enabled'] ? __( 'Saved. The chat bubble is on your site now.', 'my-office-bot' ) : __( 'Saved. The chat bubble is off.', 'my-office-bot' ) );
	}

	// ------------------------------------------------------------------ page

	private static function installed() {
		return array(
			'bricks'    => defined( 'BRICKS_VERSION' ),
			'divi'      => defined( 'ET_BUILDER_VERSION' ) || function_exists( 'et_setup_theme' ),
			'cf7'       => defined( 'WPCF7_VERSION' ),
			'wpforms'   => function_exists( 'wpforms' ),
			'gravity'   => class_exists( 'GFForms' ),
			'elementor' => defined( 'ELEMENTOR_PRO_VERSION' ),
		);
	}

	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		$notice    = get_transient( 'mob_notice_' . get_current_user_id() );
		delete_transient( 'mob_notice_' . get_current_user_id() );
		$creds     = MOB_Client::credentials();
		$business  = (string) get_option( 'mob_business', '' );
		$queue     = MOB_Client::get_list( MOB_Client::QUEUE );
		$failed    = array_reverse( MOB_Client::get_list( MOB_Client::FAILED ) );
		$last_sent = (int) get_option( MOB_Client::LAST_SENT, 0 );
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
		?>
		<div class="wrap">
			<h1>My Office Bot</h1>
			<p><?php esc_html_e( 'Sends your existing website forms to My Office Bot so new leads reach your phone in seconds. Your forms, their emails and thank-you messages stay exactly as they are.', 'my-office-bot' ); ?></p>

			<?php if ( $notice ) : ?>
				<div class="notice <?php echo $notice['ok'] ? 'notice-success' : 'notice-error'; ?>"><p><?php echo esc_html( $notice['msg'] ); ?></p></div>
			<?php endif; ?>

			<h2><?php esc_html_e( '1. Connect', 'my-office-bot' ); ?></h2>
			<?php if ( $creds && $business ) : ?>
				<p><strong>&#10003; <?php echo esc_html( sprintf( __( 'Connected to %s', 'my-office-bot' ), $business ) ); ?></strong>
				<?php if ( $last_sent ) : ?>
					&middot; <?php echo esc_html( sprintf( __( 'last lead sent %s ago', 'my-office-bot' ), human_time_diff( $last_sent ) ) ); ?>
				<?php endif; ?></p>
			<?php else : ?>
				<p><?php esc_html_e( 'In the My Office Bot app, open Website & forms and copy your connection code. Paste it here.', 'my-office-bot' ); ?></p>
			<?php endif; ?>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'mob_save_code' ); ?>
				<input type="hidden" name="action" value="mob_save_code" />
				<input type="password" name="mob_code" class="regular-text" autocomplete="off" placeholder="<?php echo $creds ? esc_attr__( 'Saved. Paste a new code to replace it.', 'my-office-bot' ) : 'MOB1....'; ?>" />
				<?php submit_button( __( 'Save and test', 'my-office-bot' ), 'primary', 'submit', false ); ?>
			</form>
			<?php if ( $creds ) : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" style="margin-top:8px">
					<?php wp_nonce_field( 'mob_test' ); ?>
					<input type="hidden" name="action" value="mob_test" />
					<?php submit_button( __( 'Test connection', 'my-office-bot' ), 'secondary', 'submit', false ); ?>
				</form>
			<?php endif; ?>

			<h2><?php esc_html_e( '2. Your forms', 'my-office-bot' ); ?></h2>
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<?php wp_nonce_field( 'mob_save_forms' ); ?>
				<input type="hidden" name="action" value="mob_save_forms" />
				<p>
					<?php foreach ( MOB_Integrations::BUILDERS as $key => $label ) : ?>
						<label style="margin-right:16px">
							<input type="checkbox" name="builder[<?php echo esc_attr( $key ); ?>]" value="1" <?php checked( get_option( 'mob_builder_' . $key, true ) ); ?> />
							<?php echo esc_html( $label ); ?>
							<?php if ( ! $installed[ $key ] ) : ?><span class="description">(<?php esc_html_e( 'not installed', 'my-office-bot' ); ?>)</span><?php endif; ?>
						</label>
					<?php endforeach; ?>
				</p>

				<?php if ( ! $forms ) : ?>
					<p class="description"><?php esc_html_e( 'Forms show up here after their first submission. Send a test from your contact form and refresh this page. Every form is sent automatically unless you switch it off here.', 'my-office-bot' ); ?></p>
				<?php else : ?>
					<table class="widefat striped">
						<thead><tr>
							<th style="width:60px"><?php esc_html_e( 'Send', 'my-office-bot' ); ?></th>
							<th><?php esc_html_e( 'Form', 'my-office-bot' ); ?></th>
							<th><?php esc_html_e( 'Fields we send', 'my-office-bot' ); ?></th>
							<th><?php esc_html_e( 'Last submission', 'my-office-bot' ); ?></th>
						</tr></thead>
						<tbody>
						<?php foreach ( $forms as $id => $form ) : ?>
							<tr>
								<td><input type="checkbox" name="enabled[<?php echo esc_attr( $id ); ?>]" value="1" <?php checked( ! empty( $form['enabled'] ) ); ?> /></td>
								<td><strong><?php echo esc_html( $form['name'] ? $form['name'] : $form['form_id'] ); ?></strong><br /><span class="description"><?php echo esc_html( 'bubble' === $form['builder'] ? __( 'My Office Bot', 'my-office-bot' ) : ( MOB_Integrations::BUILDERS[ $form['builder'] ] ?? $form['builder'] ) ); ?></span></td>
								<td>
									<?php foreach ( (array) ( $form['fields'] ?? array() ) as $f ) : ?>
										<?php
										$current = array_key_exists( $f['key'], (array) ( $form['override'] ?? array() ) )
											? ( $form['override'][ $f['key'] ] ? $form['override'][ $f['key'] ] : 'none' )
											: 'auto';
										$guess   = $f['guess'] ? $labels[ $f['guess'] ] : $labels['none'];
										?>
										<div style="margin:2px 0">
											<code><?php echo esc_html( $f['label'] ? $f['label'] : $f['key'] ); ?></code> &rarr;
											<select name="map[<?php echo esc_attr( $id ); ?>][<?php echo esc_attr( $f['key'] ); ?>]">
												<?php foreach ( $labels as $value => $label ) : ?>
													<option value="<?php echo esc_attr( $value ); ?>" <?php selected( $current, $value ); ?>>
														<?php echo esc_html( 'auto' === $value ? sprintf( __( 'Automatic (%s)', 'my-office-bot' ), $guess ) : $label ); ?>
													</option>
												<?php endforeach; ?>
											</select>
										</div>
									<?php endforeach; ?>
								</td>
								<td><?php echo ! empty( $form['last_seen'] ) ? esc_html( sprintf( __( '%s ago', 'my-office-bot' ), human_time_diff( (int) $form['last_seen'] ) ) ) : '&mdash;'; ?></td>
							</tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
				<?php submit_button( __( 'Save form settings', 'my-office-bot' ) ); ?>
			</form>

			<?php self::render_bubble(); ?>

			<h2><?php esc_html_e( '4. Delivery', 'my-office-bot' ); ?></h2>
			<p>
				<?php
				echo esc_html(
					$queue
						? sprintf( _n( '%d lead is waiting to send (we retry automatically).', '%d leads are waiting to send (we retry automatically).', count( $queue ), 'my-office-bot' ), count( $queue ) )
						: __( 'Nothing waiting. Every lead has been delivered.', 'my-office-bot' )
				);
				?>
			</p>
			<?php if ( $queue ) : ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
					<?php wp_nonce_field( 'mob_flush' ); ?>
					<input type="hidden" name="action" value="mob_flush" />
					<?php submit_button( __( 'Send now', 'my-office-bot' ), 'secondary', 'submit', false ); ?>
				</form>
			<?php endif; ?>
			<?php if ( $failed ) : ?>
				<p><strong><?php esc_html_e( "Couldn't deliver (most recent first):", 'my-office-bot' ); ?></strong></p>
				<ul>
					<?php foreach ( array_slice( $failed, 0, 5 ) as $f ) : ?>
						<li><?php echo esc_html( sprintf( '%s ago - %s: %s', human_time_diff( (int) $f['at'] ), $f['form'] ? $f['form'] : $f['builder'], $f['message'] ) ); ?></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>

			<h2><?php esc_html_e( 'Privacy', 'my-office-bot' ); ?></h2>
			<p class="description"><?php esc_html_e( 'Only the name, phone, email, address, service and message fields are sent, never passwords, payment details or uploaded files. Suggested wording for your privacy policy has been added under Settings > Privacy > Policy guide.', 'my-office-bot' ); ?></p>
		</div>
		<?php
	}

	/** Section 3: the chat bubble's settings, with a live preview beside them. */
	private static function render_bubble() {
		$s    = MOB_Bubble::settings();
		$logo = $s['logo_id'] ? wp_get_attachment_image_url( $s['logo_id'], 'thumbnail' ) : '';
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
		<h2><?php esc_html_e( '3. Chat bubble', 'my-office-bot' ); ?></h2>
		<p><?php esc_html_e( 'A "Get a quote" button in the corner of every page. Visitors leave their name, phone number and what they need, and it reaches you like any other lead.', 'my-office-bot' ); ?></p>
		<style>
			.mob-bubble-wrap { display: flex; flex-wrap: wrap; gap: 24px; align-items: flex-start; }
			.mob-bubble-wrap .form-table { max-width: 640px; }
			.mob-preview { position: relative; flex: 0 0 420px; max-width: 100%; height: 640px; border: 1px solid #dcdcde; border-radius: 8px; overflow: hidden; background: repeating-linear-gradient(180deg, #f6f7f7 0 28px, #fff 28px 56px); }
			.mob-preview-label { position: absolute; top: 10px; left: 12px; margin: 0; color: #646970; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
			.mob-logo-pick img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; vertical-align: middle; margin-right: 10px; border: 1px solid #dcdcde; }
			.mob-logo-warn { color: #b32d2e; }
		</style>
		<div class="mob-bubble-wrap">
			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="mob-bubble-form">
				<?php wp_nonce_field( 'mob_save_bubble' ); ?>
				<input type="hidden" name="action" value="mob_save_bubble" />
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Show the chat bubble', 'my-office-bot' ); ?></th>
						<td><label><input type="checkbox" name="bubble[enabled]" value="1" <?php checked( $s['enabled'] ); ?> /> <?php esc_html_e( 'On every page of this site', 'my-office-bot' ); ?></label></td>
					</tr>
					<tr>
						<th scope="row"><label for="mob-color"><?php esc_html_e( 'Your brand color', 'my-office-bot' ); ?></label></th>
						<td><input type="text" id="mob-color" name="bubble[color]" value="<?php echo esc_attr( $s['color'] ); ?>" data-default-color="#0a6cff" />
							<p class="description"><?php esc_html_e( 'Text on the bubble turns white or dark automatically, whichever is easier to read.', 'my-office-bot' ); ?></p></td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Icon', 'my-office-bot' ); ?></th>
						<td>
							<?php foreach ( $icons as $value => $label ) : ?>
								<label style="margin-right:14px"><input type="radio" name="bubble[icon]" value="<?php echo esc_attr( $value ); ?>" <?php checked( $s['icon'], $value ); ?> /> <?php echo esc_html( $label ); ?></label>
							<?php endforeach; ?>
							<div class="mob-logo-pick" style="margin-top:10px">
								<input type="hidden" name="bubble[logo_id]" id="mob-logo-id" value="<?php echo esc_attr( $s['logo_id'] ); ?>" />
								<img id="mob-logo-img" src="<?php echo esc_url( $logo ); ?>" alt="" <?php echo $logo ? '' : 'hidden'; ?> />
								<button type="button" class="button" id="mob-logo-choose"><?php echo $logo ? esc_html__( 'Change logo', 'my-office-bot' ) : esc_html__( 'Choose logo', 'my-office-bot' ); ?></button>
								<button type="button" class="button-link" id="mob-logo-remove" <?php echo $logo ? '' : 'hidden'; ?>><?php esc_html_e( 'Remove', 'my-office-bot' ); ?></button>
								<p class="description"><?php esc_html_e( 'A square image, at least 120 x 120 pixels. It shows as a circle.', 'my-office-bot' ); ?></p>
								<p class="description mob-logo-warn" id="mob-logo-warn" hidden></p>
							</div>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Corner', 'my-office-bot' ); ?></th>
						<td>
							<label style="margin-right:14px"><input type="radio" name="bubble[side]" value="right" <?php checked( $s['side'], 'right' ); ?> /> <?php esc_html_e( 'Bottom right', 'my-office-bot' ); ?></label>
							<label><input type="radio" name="bubble[side]" value="left" <?php checked( $s['side'], 'left' ); ?> /> <?php esc_html_e( 'Bottom left', 'my-office-bot' ); ?></label>
						</td>
					</tr>
					<?php foreach ( $texts as $key => list( $label, $max ) ) : ?>
						<tr>
							<th scope="row"><label for="mob-<?php echo esc_attr( $key ); ?>"><?php echo esc_html( $label ); ?></label></th>
							<td><input type="text" class="regular-text" id="mob-<?php echo esc_attr( $key ); ?>" name="bubble[<?php echo esc_attr( $key ); ?>]" data-text="<?php echo esc_attr( $key ); ?>" maxlength="<?php echo esc_attr( $max ); ?>" value="<?php echo esc_attr( $s[ $key ] ); ?>" /></td>
						</tr>
					<?php endforeach; ?>
					<tr>
						<th scope="row"><?php esc_html_e( 'Powered by My Office Bot', 'my-office-bot' ); ?></th>
						<td><label><input type="checkbox" name="bubble[powered]" value="1" <?php checked( $s['powered'] ); ?> /> <?php esc_html_e( 'Show a small "Powered by My Office Bot" link under the form', 'my-office-bot' ); ?></label>
							<p class="description"><?php esc_html_e( 'It tells other contractors where the bubble comes from, with your site as the referrer.', 'my-office-bot' ); ?></p></td>
					</tr>
				</table>
				<?php submit_button( __( 'Save chat bubble', 'my-office-bot' ) ); ?>
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

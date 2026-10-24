<?php
/**
 * The chat bubble (D59): a "Get a quote" button in a bottom corner that opens a small card with
 * name, phone and "what do you need help with?". The owner picks the color, icon or logo, wording and
 * corner; the form fields stay fixed.
 *
 * Submissions go to this site's own REST route, then through MOB_Capture like any other form, so they
 * get the same signed delivery and retry queue. The connection secret never reaches the browser.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Bubble {

	const OPTION = 'mob_bubble';
	const ICONS  = array( 'chat', 'phone', 'home', 'wrench', 'logo' );

	/** Visitors can send at most this many messages per 10 minutes. */
	const RATE_LIMIT = 5;

	public static function defaults() {
		return array(
			'enabled' => false,
			'color'   => '#0a6cff',
			'icon'    => 'chat',
			'logo_id' => 0,
			'side'    => 'right',
			'label'   => __( 'Get a quote', 'my-office-bot' ),
			'heading' => __( 'How can we help?', 'my-office-bot' ),
			'button'  => __( 'Send', 'my-office-bot' ),
			'thanks'  => __( "Thanks! We'll get back to you shortly.", 'my-office-bot' ),
			'powered' => true,
		);
	}

	public static function settings() {
		$saved = get_option( self::OPTION, array() );
		return self::sanitize( array_merge( self::defaults(), is_array( $saved ) ? $saved : array() ) );
	}

	/** Cleans settings from the admin form (or storage). Blank wording falls back to the default. */
	public static function sanitize( array $in ) {
		$d    = self::defaults();
		$text = function ( $key, $max ) use ( $in, $d ) {
			$v = trim( sanitize_text_field( (string) ( $in[ $key ] ?? '' ) ) );
			return '' === $v ? $d[ $key ] : mb_substr( $v, 0, $max );
		};
		$color = sanitize_hex_color( (string) ( $in['color'] ?? '' ) );
		$icon  = in_array( $in['icon'] ?? '', self::ICONS, true ) ? $in['icon'] : $d['icon'];
		$logo  = absint( $in['logo_id'] ?? 0 );
		if ( 'logo' === $icon && ! $logo ) {
			$icon = $d['icon'];
		}
		return array(
			'enabled' => ! empty( $in['enabled'] ),
			'color'   => $color ? strtolower( $color ) : $d['color'],
			'icon'    => $icon,
			'logo_id' => $logo,
			'side'    => 'left' === ( $in['side'] ?? '' ) ? 'left' : 'right',
			'label'   => $text( 'label', 40 ),
			'heading' => $text( 'heading', 60 ),
			'button'  => $text( 'button', 24 ),
			'thanks'  => $text( 'thanks', 160 ),
			'powered' => ! empty( $in['powered'] ),
		);
	}

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'wp_footer', array( __CLASS__, 'render' ), 50 );
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	/** On for visitors only: connected, switched on, and not inside a page builder's editor. */
	private static function showing() {
		if ( is_admin() || wp_doing_ajax() || is_customize_preview() || ! MOB_Client::credentials() ) {
			return false;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only checks for builder editors.
		foreach ( array( 'bricks', 'et_fb', 'elementor-preview', 'fl_builder', 'ct_builder' ) as $editor ) {
			if ( isset( $_GET[ $editor ] ) ) {
				return false;
			}
		}
		return self::settings()['enabled'];
	}

	public static function assets() {
		if ( ! self::showing() ) {
			return;
		}
		$url = plugins_url( 'assets/', MOB_FILE );
		wp_enqueue_style( 'mob-bubble', $url . 'bubble.css', array(), MOB_VERSION );
		wp_enqueue_script( 'mob-bubble', $url . 'bubble.js', array(), MOB_VERSION, array( 'in_footer' => true, 'strategy' => 'defer' ) );
	}

	public static function render() {
		if ( ! self::showing() ) {
			return;
		}
		echo self::markup( self::settings(), false ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in markup().
	}

	/**
	 * The bubble and its card. Also used for the live preview on the settings page ($preview = true),
	 * where the form never submits.
	 */
	public static function markup( array $s, $preview ) {
		$creds  = MOB_Client::credentials();
		$logo   = $s['logo_id'] ? wp_get_attachment_image_url( $s['logo_id'], 'thumbnail' ) : '';
		$ref    = add_query_arg(
			array(
				'ref'          => $creds ? $creds['site'] : '',
				'utm_source'   => 'bubble',
				'utm_medium'   => 'referral',
			),
			'https://myofficebot.app/'
		);
		$id     = $preview ? 'mob-bubble-preview' : 'mob-bubble';
		$style  = sprintf( '--mob-c:%s;--mob-on:%s;', $s['color'], self::on_color( $s['color'] ) );
		$badge  = 'logo' === $s['icon'] && $logo
			? '<img class="mob-b__logo" src="' . esc_url( $logo ) . '" alt="" width="40" height="40" />'
			: self::icon( 'logo' === $s['icon'] ? 'chat' : $s['icon'] );

		ob_start();
		?>
		<div id="<?php echo esc_attr( $id ); ?>" class="mob-b mob-b--<?php echo esc_attr( $s['side'] ); ?><?php echo $preview ? ' mob-b--preview is-open' : ''; ?>" style="<?php echo esc_attr( $style ); ?>"
			data-endpoint="<?php echo esc_url( rest_url( 'myofficebot/v1/bubble' ) ); ?>">
			<div class="mob-b__card" id="<?php echo esc_attr( $id ); ?>-card" role="dialog" aria-labelledby="<?php echo esc_attr( $id ); ?>-title" <?php echo $preview ? '' : 'hidden'; ?>>
				<div class="mob-b__head">
					<span class="mob-b__badge" data-badge><?php echo $badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- fixed SVG or escaped img. ?></span>
					<p class="mob-b__title" id="<?php echo esc_attr( $id ); ?>-title" data-text="heading"><?php echo esc_html( $s['heading'] ); ?></p>
					<button type="button" class="mob-b__close" aria-label="<?php esc_attr_e( 'Close', 'my-office-bot' ); ?>"><?php echo self::icon( 'x' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></button>
				</div>
				<form class="mob-b__form" novalidate>
					<label class="mob-b__field"><span><?php esc_html_e( 'Name', 'my-office-bot' ); ?></span>
						<input name="name" type="text" autocomplete="name" maxlength="120" required /></label>
					<label class="mob-b__field"><span><?php esc_html_e( 'Phone number', 'my-office-bot' ); ?></span>
						<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" required /></label>
					<label class="mob-b__field"><span><?php esc_html_e( 'What do you need help with?', 'my-office-bot' ); ?></span>
						<textarea name="message" rows="3" maxlength="2000"></textarea></label>
					<label class="mob-b__hp" aria-hidden="true"><?php esc_html_e( 'Leave this empty', 'my-office-bot' ); ?>
						<input name="company_website" type="text" tabindex="-1" autocomplete="off" /></label>
					<p class="mob-b__error" role="alert" hidden></p>
					<button type="submit" class="mob-b__send" data-text="button"><?php echo esc_html( $s['button'] ); ?></button>
				</form>
				<div class="mob-b__thanks" hidden>
					<?php echo self::icon( 'check' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
					<p data-text="thanks"><?php echo esc_html( $s['thanks'] ); ?></p>
				</div>
				<?php if ( $s['powered'] || $preview ) : ?>
					<p class="mob-b__powered" data-powered <?php echo $s['powered'] ? '' : 'hidden'; ?>>
						<a href="<?php echo esc_url( $ref ); ?>" target="_blank" rel="nofollow sponsored noopener"><?php esc_html_e( 'Powered by My Office Bot', 'my-office-bot' ); ?> &middot; <?php esc_html_e( 'Get it for your business', 'my-office-bot' ); ?></a>
					</p>
				<?php endif; ?>
			</div>
			<button type="button" class="mob-b__btn" aria-expanded="<?php echo $preview ? 'true' : 'false'; ?>" aria-controls="<?php echo esc_attr( $id ); ?>-card">
				<span class="mob-b__badge" data-badge><?php echo $badge; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></span>
				<span class="mob-b__label" data-text="label"><?php echo esc_html( $s['label'] ); ?></span>
			</button>
		</div>
		<?php
		return ob_get_clean();
	}

	/** White or dark text, whichever reads better on the chosen color (WCAG contrast). */
	public static function on_color( $hex ) {
		$h = ltrim( (string) $hex, '#' );
		if ( 3 === strlen( $h ) ) {
			$h = $h[0] . $h[0] . $h[1] . $h[1] . $h[2] . $h[2];
		}
		if ( ! preg_match( '/^[0-9a-f]{6}$/i', $h ) ) {
			return '#ffffff';
		}
		$lin = function ( $c ) {
			$c = $c / 255;
			return $c <= 0.03928 ? $c / 12.92 : ( ( $c + 0.055 ) / 1.055 ) ** 2.4;
		};
		$l = 0.2126 * $lin( hexdec( substr( $h, 0, 2 ) ) ) + 0.7152 * $lin( hexdec( substr( $h, 2, 2 ) ) ) + 0.0722 * $lin( hexdec( substr( $h, 4, 2 ) ) );
		// #0b1a2e has a luminance of about 0.011.
		return ( 1.05 / ( $l + 0.05 ) ) >= ( ( $l + 0.05 ) / 0.061 ) ? '#ffffff' : '#0b1a2e';
	}

	/** Small line icons (Lucide, ISC licence). */
	public static function icon( $name ) {
		$paths = array(
			'chat'   => '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
			'phone'  => '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
			'home'   => '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
			'wrench' => '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
			'x'      => '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
			'check'  => '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
		);
		return '<svg class="mob-b__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' . ( $paths[ $name ] ?? $paths['chat'] ) . '</svg>';
	}

	// ------------------------------------------------------------------ receiving a message

	public static function routes() {
		register_rest_route(
			'myofficebot/v1',
			'/bubble',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'submit' ),
				'permission_callback' => '__return_true', // A public contact form; checked below.
			)
		);
	}

	public static function submit( WP_REST_Request $request ) {
		if ( ! self::settings()['enabled'] || ! MOB_Client::credentials() ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'off' ), 404 );
		}
		$p = $request->get_json_params();
		$p = is_array( $p ) ? $p : array();

		// Bots fill the hidden field or send instantly. Tell them it worked and drop it.
		if ( ! empty( $p['company_website'] ) || (int) ( $p['open_seconds'] ?? 0 ) < 2 ) {
			return new WP_REST_Response( array( 'ok' => true ), 200 );
		}

		$ip  = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ) ) : '';
		$key = 'mob_bubble_rl_' . md5( $ip );
		$n   = (int) get_transient( $key );
		if ( $n >= self::RATE_LIMIT ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => __( 'Please try again in a few minutes.', 'my-office-bot' ) ), 429 );
		}
		set_transient( $key, $n + 1, 10 * MINUTE_IN_SECONDS );

		$name    = mb_substr( trim( sanitize_text_field( (string) ( $p['name'] ?? '' ) ) ), 0, 120 );
		$phone   = mb_substr( trim( sanitize_text_field( (string) ( $p['phone'] ?? '' ) ) ), 0, 30 );
		$message = mb_substr( trim( sanitize_textarea_field( (string) ( $p['message'] ?? '' ) ) ), 0, 2000 );
		$digits  = preg_replace( '/\D/', '', $phone );
		if ( '' === $name ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => __( 'Please add your name.', 'my-office-bot' ) ), 400 );
		}
		if ( strlen( $digits ) < 7 || strlen( $digits ) > 15 ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => __( 'Please add a phone number we can reach you on.', 'my-office-bot' ) ), 400 );
		}

		// Only pages on this site count as where the message came from.
		$page = esc_url_raw( (string) ( $p['page'] ?? '' ) );
		if ( wp_parse_url( $page, PHP_URL_HOST ) !== wp_parse_url( home_url(), PHP_URL_HOST ) ) {
			$page = home_url( '/' );
		}

		MOB_Capture::submission(
			'bubble',
			'bubble',
			__( 'Chat bubble', 'my-office-bot' ),
			array(
				array( 'key' => 'name', 'label' => 'Name', 'name' => 'name', 'type' => 'text', 'value' => $name ),
				array( 'key' => 'phone', 'label' => 'Phone', 'name' => 'phone', 'type' => 'tel', 'value' => $phone ),
				array( 'key' => 'message', 'label' => 'Message', 'name' => 'message', 'type' => 'textarea', 'value' => $message ),
			),
			$page
		);
		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}
}

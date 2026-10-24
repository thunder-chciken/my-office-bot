<?php
/**
 * Plugin Name:       My Office Bot
 * Plugin URI:        https://myofficebot.app
 * Description:       Sends your existing website form submissions (Bricks, Divi, Contact Form 7, WPForms, Gravity Forms, Elementor) to My Office Bot, so new leads reach your phone in seconds. Your forms stay exactly as they are.
 * Version:           0.1.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            My Office Bot
 * Author URI:        https://myofficebot.app
 * License:           GPL-2.0-or-later
 * Text Domain:       my-office-bot
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'MOB_VERSION', '0.1.0' );
define( 'MOB_FILE', __FILE__ );
define( 'MOB_DIR', plugin_dir_path( __FILE__ ) );
define( 'MOB_API', 'https://myofficebot.app/api/v1/wp' );

require_once MOB_DIR . 'includes/class-mob-mapper.php';
require_once MOB_DIR . 'includes/class-mob-client.php';
require_once MOB_DIR . 'includes/class-mob-capture.php';
require_once MOB_DIR . 'includes/integrations.php';

if ( is_admin() ) {
	require_once MOB_DIR . 'includes/class-mob-admin.php';
	MOB_Admin::init();
}

MOB_Client::init();
MOB_Integrations::init();

register_activation_hook( __FILE__, array( 'MOB_Client', 'schedule' ) );
register_deactivation_hook( __FILE__, array( 'MOB_Client', 'unschedule' ) );

// Suggested wording for the site's privacy policy (Settings > Privacy > Policy guide).
add_action(
	'admin_init',
	function () {
		if ( function_exists( 'wp_add_privacy_policy_content' ) ) {
			wp_add_privacy_policy_content(
				'My Office Bot',
				wp_kses_post(
					'<p>' . __( 'When you send us a message through a form on this website, the name, phone number, email address, street address and message you enter are shared with My Office Bot (myofficebot.app), the service we use to receive and respond to inquiries quickly. My Office Bot uses this information only to deliver your request to us.', 'my-office-bot' ) . '</p>'
				)
			);
		}
	}
);

<?php
/**
 * Removes everything My Office Bot stored in this site when the plugin is deleted.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

foreach ( array( 'mob_connection_code', 'mob_business', 'mob_queue', 'mob_failed', 'mob_last_sent', 'mob_forms' ) as $option ) {
	delete_option( $option );
}
foreach ( array( 'bricks', 'divi', 'cf7', 'wpforms', 'gravity', 'elementor' ) as $builder ) {
	delete_option( 'mob_builder_' . $builder );
}
wp_clear_scheduled_hook( 'mob_flush_queue' );

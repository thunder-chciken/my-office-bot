<?php
/**
 * One place every form builder hands its accepted submission to.
 *
 * Remembers each form it has seen (so the settings page can list it with its fields), skips forms the
 * owner switched off, applies any field overrides, and queues the lead. Only the contact fields are sent.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Capture {

	const FORMS = 'mob_forms';

	/**
	 * @param string $builder   bricks | divi | cf7 | wpforms | gravity | elementor.
	 * @param string $form_id   The builder's id for the form.
	 * @param string $form_name A human name, if the builder has one.
	 * @param array  $fields    [ [ 'key' =>, 'label' =>, 'name' =>, 'type' =>, 'value' => ], ... ].
	 * @param string $page_url  Page the form was on, if known.
	 */
	public static function submission( $builder, $form_id, $form_name, array $fields, $page_url = '' ) {
		try {
			$id    = $builder . ':' . $form_id;
			$forms = MOB_Client::get_list( self::FORMS );
			$form  = $forms[ $id ] ?? array(
				'builder'  => $builder,
				'form_id'  => (string) $form_id,
				'enabled'  => true,
				'override' => array(),
			);

			$form['name']      = $form_name ? $form_name : ( $form['name'] ?? '' );
			$form['last_seen'] = time();
			$form['fields']    = array_map(
				fn( $f ) => array(
					'key'   => (string) ( $f['key'] ?? '' ),
					'label' => (string) ( $f['label'] ?? '' ),
					'type'  => (string) ( $f['type'] ?? '' ),
					'guess' => MOB_Mapper::guess( $f['label'] ?? '', $f['name'] ?? ( $f['key'] ?? '' ), $f['type'] ?? '' ),
				),
				array_slice( $fields, 0, 60 )
			);
			$forms[ $id ] = $form;
			if ( count( $forms ) > 100 ) {
				uasort( $forms, fn( $a, $b ) => ( $b['last_seen'] ?? 0 ) <=> ( $a['last_seen'] ?? 0 ) );
				$forms = array_slice( $forms, 0, 100, true );
			}
			update_option( self::FORMS, $forms, false );

			if ( empty( $form['enabled'] ) || ! get_option( 'mob_builder_' . $builder, true ) ) {
				return;
			}

			$mapped = MOB_Mapper::map( $fields, is_array( $form['override'] ?? null ) ? $form['override'] : array() );
			if ( empty( $mapped['phone'] ) && empty( $mapped['email'] ) ) {
				return; // Nothing to reach the homeowner by, so not a lead.
			}

			MOB_Client::enqueue(
				array(
					'builder'   => $builder,
					'form_id'   => (string) $form_id,
					'form_name' => (string) $form['name'],
					'page_url'  => $page_url ? $page_url : self::current_url(),
					'fields'    => $mapped,
				)
			);
		} catch ( \Throwable $e ) {
			// Never break the site's own form because of us.
			error_log( 'My Office Bot: ' . $e->getMessage() );
		}
	}

	/** The page the visitor was on: the referrer for AJAX submissions, otherwise this request. */
	public static function current_url() {
		$ref = wp_get_referer();
		if ( $ref ) {
			return esc_url_raw( $ref );
		}
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? sanitize_text_field( wp_unslash( $_SERVER['REQUEST_URI'] ) ) : '';
		return esc_url_raw( home_url( $uri ) );
	}
}

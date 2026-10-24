<?php
/**
 * Hooks into each form builder's "submission accepted" point and hands the fields to MOB_Capture.
 * Nothing here changes how the site's forms look or behave; if a builder isn't installed, its hook never fires.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Integrations {

	public const BUILDERS = array(
		'bricks'    => 'Bricks',
		'divi'      => 'Divi',
		'cf7'       => 'Contact Form 7',
		'wpforms'   => 'WPForms',
		'gravity'   => 'Gravity Forms',
		'elementor' => 'Elementor Pro',
	);

	/** Bricks can report one submission through two hooks; send it once. */
	private static $bricks_done = array();

	public static function init() {
		// Bricks: runs after every Bricks form's actions, so no change to the form is needed.
		add_filter( 'bricks/form/response', array( __CLASS__, 'bricks_response' ), 20, 2 );
		// Bricks backup: forms with the built-in "Custom" action.
		add_action( 'bricks/form/custom_action', array( __CLASS__, 'bricks_custom' ), 20, 1 );

		// Divi 4 (and Divi 5 if it keeps the legacy hook) contact form, after a submission without errors.
		add_action( 'et_pb_contact_form_submit', array( __CLASS__, 'divi' ), 20, 3 );
		// Divi Engine "Divi Form Builder" plugin.
		add_action( 'df_after_process', array( __CLASS__, 'divi_form_builder' ), 20, 3 );

		// Contact Form 7: after validation passed (mail sent, mail failed or mail skipped), not spam.
		add_action( 'wpcf7_submit', array( __CLASS__, 'cf7' ), 20, 2 );

		// WPForms: after successful processing.
		add_action( 'wpforms_process_complete', array( __CLASS__, 'wpforms' ), 20, 4 );

		// Gravity Forms: after the entry is saved.
		add_action( 'gform_after_submission', array( __CLASS__, 'gravity' ), 20, 2 );

		// Elementor Pro forms: after a new record is accepted.
		add_action( 'elementor_pro/forms/new_record', array( __CLASS__, 'elementor' ), 20, 2 );
	}

	// ------------------------------------------------------------------ Bricks

	public static function bricks_response( $response, $form = null ) {
		if ( is_object( $form ) && is_array( $response ) && 'success' === ( $response['type'] ?? '' ) ) {
			self::bricks( $form );
		}
		return $response;
	}

	public static function bricks_custom( $form ) {
		if ( is_object( $form ) ) {
			self::bricks( $form );
		}
	}

	private static function bricks( $form ) {
		try {
			if ( ! method_exists( $form, 'get_fields' ) || ! method_exists( $form, 'get_settings' ) ) {
				return;
			}
			$key = spl_object_id( $form );
			if ( isset( self::$bricks_done[ $key ] ) ) {
				return;
			}
			self::$bricks_done[ $key ] = true;

			$values   = (array) $form->get_fields();
			$settings = (array) $form->get_settings();
			$fields   = array();
			foreach ( (array) ( $settings['fields'] ?? array() ) as $def ) {
				$fid  = (string) ( $def['id'] ?? '' );
				$name = (string) ( $def['name'] ?? '' );
				$val  = $values[ 'form-field-' . $fid ] ?? ( '' !== $name ? ( $values[ $name ] ?? '' ) : '' );
				$fields[] = array(
					'key'   => $fid,
					'label' => (string) ( $def['label'] ?? ( $def['placeholder'] ?? '' ) ),
					'name'  => $name,
					'type'  => (string) ( $def['type'] ?? '' ),
					'value' => $val,
				);
			}
			$post_id = method_exists( $form, 'get_post_id' ) ? (int) $form->get_post_id() : 0;
			$form_id = method_exists( $form, 'get_id' ) ? (string) $form->get_id() : 'form';
			$name    = $post_id ? sprintf( '%s (%s)', get_the_title( $post_id ), $form_id ) : $form_id;
			MOB_Capture::submission( 'bricks', $post_id . ':' . $form_id, $name, $fields, $post_id ? get_permalink( $post_id ) : '' );
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (Bricks): ' . $e->getMessage() );
		}
	}

	// ------------------------------------------------------------------ Divi

	public static function divi( $values, $has_error = false, $info = array() ) {
		try {
			if ( $has_error || ! is_array( $values ) ) {
				return;
			}
			$fields = array();
			foreach ( $values as $key => $v ) {
				$fields[] = array(
					'key'   => (string) $key,
					'label' => (string) ( is_array( $v ) ? ( $v['label'] ?? $key ) : $key ),
					'name'  => (string) $key,
					'type'  => '',
					'value' => is_array( $v ) ? ( $v['value'] ?? '' ) : $v,
				);
			}
			$info    = is_array( $info ) ? $info : array();
			$post_id = (int) ( $info['post_id'] ?? 0 );
			$form_id = (string) ( $info['contact_form_unique_id'] ?? ( $info['contact_form_id'] ?? ( $info['contact_form_number'] ?? 'contact' ) ) );
			$name    = $post_id ? sprintf( '%s contact form', get_the_title( $post_id ) ) : 'Contact form';
			MOB_Capture::submission( 'divi', $post_id . ':' . $form_id, $name, $fields, $post_id ? get_permalink( $post_id ) : '' );
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (Divi): ' . $e->getMessage() );
		}
	}

	public static function divi_form_builder( $form_id, $post_array = array(), $form_type = '' ) {
		try {
			$fields = array();
			foreach ( (array) $post_array as $key => $value ) {
				if ( is_string( $key ) && 0 !== strpos( $key, '_' ) && ! preg_match( '/nonce|action|form_id|form_type|captcha/i', $key ) ) {
					$fields[] = array( 'key' => $key, 'label' => str_replace( array( '_', '-' ), ' ', $key ), 'name' => $key, 'type' => '', 'value' => $value );
				}
			}
			MOB_Capture::submission( 'divi', 'dfb:' . $form_id, 'Divi Form Builder ' . $form_id, $fields );
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (Divi Form Builder): ' . $e->getMessage() );
		}
	}

	// ------------------------------------------------------------------ Contact Form 7

	public static function cf7( $contact_form, $result ) {
		try {
			$status = is_array( $result ) ? ( $result['status'] ?? '' ) : '';
			if ( ! in_array( $status, array( 'mail_sent', 'mail_failed' ), true ) || ! class_exists( 'WPCF7_Submission' ) ) {
				return;
			}
			$submission = WPCF7_Submission::get_instance();
			if ( ! $submission ) {
				return;
			}
			$data   = (array) $submission->get_posted_data();
			$fields = array();
			foreach ( $contact_form->scan_form_tags() as $tag ) {
				if ( empty( $tag->name ) ) {
					continue;
				}
				$fields[] = array(
					'key'   => (string) $tag->name,
					'label' => (string) $tag->name,
					'name'  => (string) $tag->name,
					'type'  => (string) $tag->basetype,
					'value' => $data[ $tag->name ] ?? '',
				);
			}
			$url = method_exists( $submission, 'get_meta' ) ? (string) $submission->get_meta( 'url' ) : '';
			MOB_Capture::submission( 'cf7', (string) $contact_form->id(), (string) $contact_form->title(), $fields, $url );
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (Contact Form 7): ' . $e->getMessage() );
		}
	}

	// ------------------------------------------------------------------ WPForms

	public static function wpforms( $fields_in, $entry = array(), $form_data = array(), $entry_id = 0 ) {
		try {
			$fields = array();
			foreach ( (array) $fields_in as $id => $f ) {
				$fields[] = array(
					'key'   => (string) $id,
					'label' => (string) ( $f['name'] ?? '' ),
					'name'  => (string) ( $f['name'] ?? $id ),
					'type'  => (string) ( $f['type'] ?? '' ),
					'value' => $f['value'] ?? '',
				);
			}
			$form_id = (string) ( $form_data['id'] ?? '' );
			$title   = (string) ( $form_data['settings']['form_title'] ?? ( 'WPForms ' . $form_id ) );
			MOB_Capture::submission( 'wpforms', $form_id, $title, $fields );
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (WPForms): ' . $e->getMessage() );
		}
	}

	// ------------------------------------------------------------------ Gravity Forms

	public static function gravity( $entry, $form ) {
		try {
			$fields = array();
			foreach ( (array) ( $form['fields'] ?? array() ) as $field ) {
				if ( ! is_object( $field ) ) {
					continue;
				}
				$value = is_callable( array( $field, 'get_value_export' ) )
					? $field->get_value_export( $entry )
					: ( $entry[ (string) $field->id ] ?? '' );
				$fields[] = array(
					'key'   => (string) $field->id,
					'label' => (string) $field->label,
					'name'  => (string) ( $field->inputName ?? '' ),
					'type'  => (string) $field->type,
					'value' => $value,
				);
			}
			MOB_Capture::submission( 'gravity', (string) ( $form['id'] ?? '' ), (string) ( $form['title'] ?? '' ), $fields, (string) ( $entry['source_url'] ?? '' ) );
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (Gravity Forms): ' . $e->getMessage() );
		}
	}

	// ------------------------------------------------------------------ Elementor Pro

	public static function elementor( $record, $handler = null ) {
		try {
			if ( ! is_object( $record ) || ! method_exists( $record, 'get' ) ) {
				return;
			}
			$fields = array();
			foreach ( (array) $record->get( 'fields' ) as $id => $f ) {
				$fields[] = array(
					'key'   => (string) ( $f['id'] ?? $id ),
					'label' => (string) ( $f['title'] ?? '' ),
					'name'  => (string) ( $f['id'] ?? $id ),
					'type'  => (string) ( $f['type'] ?? '' ),
					'value' => $f['value'] ?? '',
				);
			}
			$meta = (array) $record->get( 'meta' );
			$url  = (string) ( $meta['page_url']['value'] ?? '' );
			MOB_Capture::submission(
				'elementor',
				(string) $record->get_form_settings( 'id' ),
				(string) $record->get_form_settings( 'form_name' ),
				$fields,
				$url
			);
		} catch ( \Throwable $e ) {
			error_log( 'My Office Bot (Elementor): ' . $e->getMessage() );
		}
	}
}

<?php
/**
 * Works out which form fields are the name, phone, email, message, address and service.
 * Only those are ever sent to My Office Bot (minimal forwarding). Per-form overrides from the
 * settings page win over the automatic guess.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class MOB_Mapper {

	const TARGETS = array( 'name', 'first_name', 'last_name', 'phone', 'email', 'message', 'service', 'address' );

	/** Choice fields (dropdowns, radios, checkboxes). Unmatched ones, like budget or timeline, are added to the message. */
	const CHOICE = array( 'select', 'select-one', 'select-multiple', 'multiselect', 'radio', 'checkbox', 'dropdown' );

	/** Field types that are never forwarded, whatever their label says. */
	const NEVER = array( 'password', 'file', 'upload', 'fileupload', 'hidden', 'captcha', 'recaptcha', 'hcaptcha', 'turnstile', 'honeypot', 'creditcard', 'credit-card', 'stripe', 'payment', 'signature', 'html', 'divider', 'section', 'page' );

	/**
	 * Guess the target for one field.
	 *
	 * @param string $label Visible label (or placeholder).
	 * @param string $name  Input name / id.
	 * @param string $type  Field type (email, tel, textarea, select ...).
	 * @return string|null One of TARGETS, or null to ignore the field.
	 */
	public static function guess( $label, $name, $type ) {
		$type = strtolower( (string) $type );
		if ( in_array( $type, self::NEVER, true ) ) {
			return null;
		}
		$text = strtolower( trim( $label . ' ' . $name ) );
		$text = preg_replace( '/[^a-z0-9]+/', ' ', $text );

		if ( preg_match( '/\b(password|card|cvv|cvc|ssn|social security|routing|account number|captcha)\b/', $text ) ) {
			return null;
		}
		if ( 'email' === $type || preg_match( '/\be ?mail\b/', $text ) ) {
			return 'email';
		}
		if ( 'tel' === $type || 'phone' === $type || preg_match( '/\b(phone|mobile|cell|tel|telephone|number to reach|call you)\b/', $text ) ) {
			return 'phone';
		}
		// A big text box is the message, even when its label mentions the project or service.
		if ( 'textarea' === $type ) {
			return 'message';
		}
		if ( preg_match( '/\bfirst\b/', $text ) && preg_match( '/\bname\b/', $text ) ) {
			return 'first_name';
		}
		if ( preg_match( '/\b(last|sur)\b/', $text ) && preg_match( '/\bname\b/', $text ) ) {
			return 'last_name';
		}
		if ( preg_match( '/\b(address|street|city|zip|zipcode|postal|location)\b/', $text ) ) {
			return 'address';
		}
		if ( preg_match( '/\b(service|services|project|interested|type of|what do you need|how can we help you with|job type|work needed)\b/', $text ) ) {
			return 'service';
		}
		if ( 'textarea' === $type || preg_match( '/\b(message|comments?|details|describe|description|notes?|questions?|how can we help|tell us)\b/', $text ) ) {
			return 'message';
		}
		if ( preg_match( '/\b(name|full name|your name)\b/', $text ) ) {
			return 'name';
		}
		return null;
	}

	/**
	 * Turn a submission into the contact fields My Office Bot needs.
	 *
	 * @param array $fields   List of [ 'key' => id, 'label' => ..., 'name' => ..., 'type' => ..., 'value' => ... ].
	 * @param array $override Saved per-form choices: field key => target (or '' to ignore).
	 * @return array Target => value (strings only).
	 */
	public static function map( array $fields, array $override = array() ) {
		$out    = array();
		$extras = array();
		foreach ( $fields as $f ) {
			$key        = (string) ( $f['key'] ?? '' );
			$overridden = array_key_exists( $key, $override );
			if ( $overridden ) {
				$target = $override[ $key ] ? $override[ $key ] : null;
			} else {
				$target = self::guess( $f['label'] ?? '', $f['name'] ?? $key, $f['type'] ?? '' );
			}
			$value = $f['value'] ?? '';
			if ( is_array( $value ) ) {
				$value = implode( ', ', array_filter( array_map( 'strval', array_filter( $value, 'is_scalar' ) ) ) );
			}
			$value = trim( wp_strip_all_tags( (string) $value ) );
			if ( '' === $value ) {
				continue;
			}
			if ( ! $target || ! in_array( $target, self::TARGETS, true ) ) {
				// A multiple-choice answer with no contact meaning (budget, timeline, "how did you hear about us")
				// rides along in the message, labelled. Free-text fields never do.
				if ( ! $overridden && in_array( strtolower( (string) ( $f['type'] ?? '' ) ), self::CHOICE, true ) ) {
					$label = trim( (string) preg_replace( '/^[^\p{L}\p{N}]+/u', '', wp_strip_all_tags( (string) ( $f['label'] ?? '' ) ) ) );
					if ( '' !== $label ) {
						$extras[] = $label . ': ' . $value;
					}
				}
				continue;
			}
			// The message joins every message-like field; address parts and services are joined too
			// (street + city, primary + additional services). Anything else: the first field wins.
			if ( 'message' === $target && isset( $out['message'] ) ) {
				$out['message'] .= "\n" . $value;
			} elseif ( in_array( $target, array( 'address', 'service' ), true ) && isset( $out[ $target ] ) ) {
				$have = array_map( 'strtolower', explode( ', ', $out[ $target ] ) );
				foreach ( explode( ', ', $value ) as $part ) {
					if ( '' !== $part && ! in_array( strtolower( $part ), $have, true ) ) {
						$out[ $target ] .= ', ' . $part;
						$have[]          = strtolower( $part );
					}
				}
			} elseif ( ! isset( $out[ $target ] ) ) {
				$out[ $target ] = $value;
			}
		}
		if ( $extras ) {
			$out['message'] = trim( ( $out['message'] ?? '' ) . "\n\n" . implode( "\n", array_slice( $extras, 0, 12 ) ) );
		}
		foreach ( $out as $k => $v ) {
			$out[ $k ] = mb_substr( $v, 0, 'message' === $k ? 4000 : 300 );
		}
		return $out;
	}
}

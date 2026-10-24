=== My Office Bot ===
Contributors: myofficebot
Tags: leads, contact form, bricks, divi, notifications
Requires at least: 6.0
Tested up to: 6.8
Requires PHP: 7.4
Stable tag: 0.2.2
License: GPLv2 or later

Sends your existing website form submissions to My Office Bot, so new leads reach your phone in seconds. Your forms stay exactly as they are.

== Description ==

Works with the forms you already have: Bricks, Divi, Contact Form 7, WPForms, Gravity Forms, Elementor Pro and Fluent Forms. No new form to build.

* Only successful submissions are sent, after the form's own checks pass.
* Your form's emails, thank-you message and design don't change.
* Only the name, phone, email, address, service and message fields are sent, plus answers to multiple-choice questions (like budget or start date), added to the message. Never passwords, payment details or uploaded files.
* If My Office Bot can't be reached, leads wait in a queue on your site and are retried automatically.

Optional chat bubble: a "Get a quote" button in the corner of every page that opens a short form (name, phone number and what the visitor needs). Pick your brand color, an icon or your logo, the wording and the corner under Settings > My Office Bot. It's off until you switch it on. A small "Powered by My Office Bot" link under the form can be switched off there too.

== External service ==

This plugin sends form submissions to My Office Bot (https://myofficebot.app), the service that alerts you about new leads. It sends the contact fields listed above, the page the form was on, and your site address. If you turn on the chat bubble's "Powered by My Office Bot" link, it points to myofficebot.app with your site's public key so sign-ups from your site can be credited to you. Terms: https://myofficebot.app/terms. Privacy: https://myofficebot.app/privacy.

== Installation ==

1. Upload the zip in Plugins > Add New > Upload Plugin, then activate.
2. In the My Office Bot app, open Website & forms and copy your connection code.
3. In WordPress, go to Settings > My Office Bot, paste the code and click Save and test.
4. Send a test from your contact form. It appears in My Office Bot and under Settings > My Office Bot > Your forms.

== Changelog ==

= 0.2.2 =
* Settings page says where to add the people who get lead alerts (Team & alerts in the My Office Bot app).

= 0.2.1 =
* Fluent Forms support.
* Street and city fields are combined into one address, primary and additional services into one service, and multiple-choice answers (budget, timeline, how they heard about you) are added to the message.

= 0.2.0 =
* Chat bubble: an optional "Get a quote" button with a short form, your color, icon or logo, wording and corner, and a live preview in settings.

= 0.1.0 =
* First beta: Bricks, Divi, Contact Form 7, WPForms, Gravity Forms and Elementor Pro; signed delivery; retry queue; per-form on/off and field corrections.

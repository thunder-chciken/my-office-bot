/* Settings > My Office Bot: color picker, logo picker and the live preview of the chat bubble (D59). */
jQuery(function ($) {
	var $form = $('#mob-bubble-form');
	var $preview = $('#mob-bubble-preview');
	if (!$form.length || !$preview.length) {
		return;
	}
	var logoUrl = $('#mob-logo-img').attr('src') || '';

	// Same rule as MOB_Bubble::on_color(): white or dark text, whichever has more contrast.
	function onColor(hex) {
		var h = String(hex || '').replace('#', '');
		if (h.length === 3) {
			h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
		}
		if (!/^[0-9a-f]{6}$/i.test(h)) {
			return '#ffffff';
		}
		function lin(c) {
			c = c / 255;
			return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
		}
		var l = 0.2126 * lin(parseInt(h.substr(0, 2), 16)) + 0.7152 * lin(parseInt(h.substr(2, 2), 16)) + 0.0722 * lin(parseInt(h.substr(4, 2), 16));
		return 1.05 / (l + 0.05) >= (l + 0.05) / 0.061 ? '#ffffff' : '#0b1a2e';
	}

	function setColor(hex) {
		$preview[0].style.setProperty('--mob-c', hex);
		$preview[0].style.setProperty('--mob-on', onColor(hex));
	}

	function setBadge() {
		var icon = $form.find('input[name="bubble[icon]"]:checked').val();
		var html;
		if (icon === 'logo' && logoUrl) {
			html = $('<img class="mob-b__logo" alt="" width="40" height="40" />').attr('src', logoUrl)[0].outerHTML;
		} else {
			html = $('#mob-icon-' + (icon === 'logo' ? 'chat' : icon)).html();
		}
		$preview.find('[data-badge]').html(html);
	}

	$('#mob-color').wpColorPicker({
		change: function (e, ui) {
			setColor(ui.color.toString());
		},
		clear: function () {
			setColor('#0a6cff');
		}
	});

	$form.on('input', '[data-text]', function () {
		var key = $(this).data('text');
		var value = $.trim($(this).val()) || $(this).attr('placeholder') || '';
		if (value) {
			$preview.find('[data-text="' + key + '"]').text(value);
		}
	});
	$form.on('change', 'input[name="bubble[icon]"]', setBadge);
	$form.on('change', 'input[name="bubble[side]"]', function () {
		$preview.toggleClass('mob-b--left', this.value === 'left').toggleClass('mob-b--right', this.value !== 'left');
	});
	$form.on('change', 'input[name="bubble[powered]"]', function () {
		$preview.find('[data-powered]').prop('hidden', !this.checked);
	});

	// The preview is for looking only.
	$preview.on('submit', 'form', function (e) {
		e.preventDefault();
	});
	$preview.on('click', 'a', function (e) {
		e.preventDefault();
	});

	// Logo from the Media Library. WordPress makes a square "thumbnail" copy, which is what the bubble shows.
	var frame;
	$('#mob-logo-choose').on('click', function () {
		if (!frame) {
			frame = wp.media({ title: 'Choose your logo', button: { text: 'Use this logo' }, library: { type: 'image' }, multiple: false });
			frame.on('select', function () {
				var a = frame.state().get('selection').first().toJSON();
				logoUrl = (a.sizes && a.sizes.thumbnail && a.sizes.thumbnail.url) || a.url;
				$('#mob-logo-id').val(a.id);
				$('#mob-logo-img').attr('src', logoUrl).prop('hidden', false);
				$('#mob-logo-remove').prop('hidden', false);
				$('#mob-logo-choose').text('Change logo');
				var warn = '';
				if (a.width < 120 || a.height < 120) {
					warn = 'This image is smaller than 120 x 120 pixels, so it may look blurry.';
				} else if (Math.abs(a.width - a.height) > 2) {
					warn = "This image isn't square, so the middle of it is used.";
				}
				$('#mob-logo-warn').text(warn).prop('hidden', !warn);
				$form.find('input[name="bubble[icon]"][value="logo"]').prop('checked', true);
				setBadge();
			});
		}
		frame.open();
	});
	$('#mob-logo-remove').on('click', function () {
		logoUrl = '';
		$('#mob-logo-id').val('0');
		$('#mob-logo-img').attr('src', '').prop('hidden', true);
		$('#mob-logo-warn').prop('hidden', true);
		$(this).prop('hidden', true);
		$('#mob-logo-choose').text('Choose logo');
		var $logo = $form.find('input[name="bubble[icon]"][value="logo"]');
		if ($logo.is(':checked')) {
			$form.find('input[name="bubble[icon]"][value="chat"]').prop('checked', true);
		}
		setBadge();
	});
});

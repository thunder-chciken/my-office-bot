/* My Office Bot chat bubble (D59): open/close, check the fields, send to this site's REST route. */
(function () {
	var root = document.getElementById('mob-bubble');
	if (!root || !window.fetch) {
		return;
	}
	var btn = root.querySelector('.mob-b__btn');
	var card = root.querySelector('.mob-b__card');
	var form = root.querySelector('.mob-b__form');
	var error = root.querySelector('.mob-b__error');
	var thanks = root.querySelector('.mob-b__thanks');
	var send = root.querySelector('.mob-b__send');
	var openedAt = 0;

	function open() {
		card.hidden = false;
		root.classList.add('is-open');
		btn.setAttribute('aria-expanded', 'true');
		if (!openedAt) {
			openedAt = Date.now();
		}
		if (!form.hidden) {
			setTimeout(function () {
				form.elements.name.focus();
			}, 60);
		}
	}

	function close() {
		card.hidden = true;
		root.classList.remove('is-open');
		btn.setAttribute('aria-expanded', 'false');
		btn.focus();
	}

	function fail(text, field) {
		error.textContent = text;
		error.hidden = false;
		if (field) {
			field.focus();
		}
	}

	btn.addEventListener('click', function () {
		if (card.hidden) {
			open();
		} else {
			close();
		}
	});
	root.querySelector('.mob-b__close').addEventListener('click', close);
	document.addEventListener('keydown', function (e) {
		if (e.key === 'Escape' && !card.hidden) {
			close();
		}
	});

	form.addEventListener('submit', function (e) {
		e.preventDefault();
		error.hidden = true;
		var f = form.elements;
		var name = f.name.value.trim();
		var phone = f.phone.value.trim();
		if (!name) {
			return fail('Please add your name.', f.name);
		}
		if (phone.replace(/\D/g, '').length < 7) {
			return fail('Please add a phone number we can reach you on.', f.phone);
		}

		var label = send.textContent;
		send.disabled = true;
		send.textContent = 'Sending…';
		fetch(root.getAttribute('data-endpoint'), {
			method: 'POST',
			credentials: 'omit',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				name: name,
				phone: phone,
				message: f.message.value.trim(),
				company_website: f.company_website.value,
				open_seconds: Math.round((Date.now() - openedAt) / 1000),
				page: location.href
			})
		})
			.then(function (r) {
				return r.json().catch(function () {
					return {};
				}).then(function (body) {
					if (!r.ok || !body.ok) {
						throw new Error(body.error || '');
					}
				});
			})
			.then(function () {
				form.hidden = true;
				thanks.hidden = false;
				thanks.setAttribute('tabindex', '-1');
				thanks.focus();
			})
			.catch(function (x) {
				fail(x.message || "Couldn't send. Please try again.");
			})
			.then(function () {
				send.disabled = false;
				send.textContent = label;
			});
	});
})();

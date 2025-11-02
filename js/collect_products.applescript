-- Собирает товары с активной вкладки Chrome
-- Возвращает JSON

tell application "Google Chrome"
	set currentTab to active tab of window 1

	set collectJS to "JSON.stringify((function() {
		var products = [];
		var seen = {};
		var tiles = document.querySelectorAll('[data-index]');

		for (var tileIdx = 0; tileIdx < tiles.length; tileIdx++) {
			var tile = tiles[tileIdx];
			var link = tile.querySelector('a[href*=\"/product/\"]');
			if (!link) continue;

			var match = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
			if (!match || seen[match[1]]) continue;
			seen[match[1]] = true;

			var productId = match[1];
			var productUrl = link.href;

			var allSpans = tile.querySelectorAll('span');
			var texts = [];
			for (var i = 0; i < allSpans.length; i++) {
				var t = allSpans[i].textContent.trim();
				if (t) texts.push(t);
			}

			var price = '';
			for (var i = 0; i < texts.length; i++) {
				if (texts[i].indexOf('₽') > -1 && texts[i].match(/\\\\d/)) {
					price = texts[i];
					break;
				}
			}

			var title = '';
			var maxLen = 0;
			for (var i = 0; i < texts.length; i++) {
				if (texts[i].length > maxLen &&
					texts[i].length > 20 &&
					texts[i].indexOf('₽') === -1 &&
					texts[i].indexOf('шт ') === -1 &&
					texts[i].indexOf('%') === -1 &&
					texts[i].indexOf('отзыв') === -1) {
					title = texts[i];
					maxLen = texts[i].length;
				}
			}

			var rating = '';
			for (var i = 0; i < texts.length; i++) {
				if (texts[i].match(/^[0-5]\\\\.[0-9]$/)) {
					rating = texts[i];
					break;
				}
			}

			var reviewsCount = '';
			for (var i = 0; i < texts.length; i++) {
				if (texts[i].indexOf('отзыв') > -1) {
					var num = texts[i].match(/\\\\d+/);
					if (num) reviewsCount = num[0];
					break;
				}
			}

			var buttons = tile.querySelectorAll('button');
			var deliveryDays = '';
			for (var i = 0; i < buttons.length; i++) {
				var t = buttons[i].textContent.trim();
				var tl = t.toLowerCase();
				if (t && (tl.indexOf('ноя') > -1 || tl.indexOf('дек') > -1 ||
						  tl.indexOf('янв') > -1 || tl.indexOf('завтра') > -1 ||
						  tl.indexOf('фев') > -1 || tl.indexOf('мар') > -1)) {
					deliveryDays = t;
					break;
				}
			}

			products.push({
				id: productId,
				url: productUrl,
				title: title || 'Без названия',
				price: price || '',
				rating: rating || '',
				reviews_count: reviewsCount || '0',
				delivery_days: deliveryDays || ''
			});
		}

		return {
			success: true,
			total: products.length,
			products: products
		};
	})());"

	set result to execute currentTab javascript collectJS
	return result
end tell

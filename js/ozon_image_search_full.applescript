on run argv
	if (count of argv) < 1 then
		return "{\"error\": \"No URL provided\"}"
	end if

	set imageURL to item 1 of argv
	set ozonURL to "https://www.ozon.ru/"

	tell application "Safari"
		activate

		if (count of windows) is 0 then
			make new document
		end if

		set currentTab to current tab of window 1
		set URL of currentTab to ozonURL
		delay 5

		-- Click camera button
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 3

		-- Focus input and TYPE URL via JavaScript
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=\"text\"]');
			var targetInput = inputs[inputs.length - 1];
			targetInput.focus();
			targetInput.click();

			var url = '" & imageURL & "';
			var index = 0;

			function typeChar() {
				if (index < url.length) {
					targetInput.value += url[index];
					var event = new Event('input', { bubbles: true });
					targetInput.dispatchEvent(event);
					index++;
					setTimeout(typeChar, 50);
				} else {
					targetInput.dispatchEvent(new Event('change', { bubbles: true }));
					targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
				}
			}

			typeChar();
		" in currentTab

		delay 10

		-- Click "Найти" button
		set buttonCheck to do JavaScript "
			(function() {
				var buttons = document.querySelectorAll('button');
				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var text = btn.textContent.toLowerCase();
					if (rect.width > 0 && rect.height > 0 && (text.includes('найти') || text.includes('search'))) {
						btn.click();
						return JSON.stringify({found: true, clicked: true, buttonText: btn.textContent.trim()});
					}
				}
				var visibleButtons = [];
				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var txt = btn.textContent.trim();
					if (rect.width > 0 && rect.height > 0 && txt.length > 0 && txt.length < 50) {
						visibleButtons.push(txt);
					}
				}
				return JSON.stringify({found: false, visibleButtons: visibleButtons.slice(0, 10)});
			})();
		" in currentTab

		-- Wait for results
		delay 10

		-- Get count of products
		set tilesCount to do JavaScript "document.querySelectorAll('div[data-index]').length;" in currentTab

		-- Collect FULL data for each product (like collect_full_data.sh)
		set productsJSON to "["

		repeat with idx from 0 to (tilesCount - 1)
			-- ID and URL
			set idUrl to do JavaScript ("
				var tile = document.querySelector('[data-index=\"" & idx & "\"]');
				if (!tile) { ''; } else {
					var link = tile.querySelector('a[href*=\"/product/\"]');
					if (!link) { ''; } else {
						var m = link.href.match(/product\\/[^\\/]*-(\\d+)/);
						if (m) { m[1] + '|' + link.href; } else { ''; }
					}
				}
			") in currentTab

			if idUrl is not "" and idUrl is not "missing value" then
				set AppleScript's text item delimiters to "|"
				set idUrlParts to text items of idUrl
				set productId to item 1 of idUrlParts
				set productUrl to item 2 of idUrlParts
				set AppleScript's text item delimiters to ""

				-- Title (longest text, min 10 chars)
				set productTitle to do JavaScript ("
					var tile = document.querySelector('[data-index=\"" & idx & "\"]');
					if (!tile) { ''; } else {
						var spans = tile.querySelectorAll('span');
						var longest = '';
						for (var i = 0; i < spans.length; i++) {
							var t = spans[i].textContent.trim();
							if (t.length > longest.length && t.length > 10 &&
								t.indexOf('₽') === -1 && t.indexOf('шт') === -1 &&
								t.indexOf('%') === -1 && t.indexOf('отзыв') === -1) {
								longest = t;
							}
						}
						longest;
					}
				") in currentTab

				-- Price
				set productPrice to do JavaScript ("
					var tile = document.querySelector('[data-index=\"" & idx & "\"]');
					if (!tile) { ''; } else {
						var spans = tile.querySelectorAll('span');
						var price = '';
						for (var i = 0; i < spans.length; i++) {
							var t = spans[i].textContent.trim();
							if (t.indexOf('₽') > -1 && t.match(/\\d/)) {
								price = t;
								break;
							}
						}
						price;
					}
				") in currentTab

				-- Rating
				set productRating to do JavaScript ("
					var tile = document.querySelector('[data-index=\"" & idx & "\"]');
					if (!tile) { ''; } else {
						var spans = tile.querySelectorAll('span');
						var rating = '';
						for (var i = 0; i < spans.length; i++) {
							var t = spans[i].textContent.trim();
							if (t.match(/^[0-5]\\.[0-9]$/)) {
								rating = t;
								break;
							}
						}
						rating;
					}
				") in currentTab

				-- Reviews count
				set productReviews to do JavaScript ("
					var tile = document.querySelector('[data-index=\"" & idx & "\"]');
					if (!tile) { '0'; } else {
						var spans = tile.querySelectorAll('span');
						var reviews = '0';
						for (var i = 0; i < spans.length; i++) {
							var t = spans[i].textContent.trim();
							if (t.indexOf('отзыв') > -1) {
								var num = t.match(/\\d+/);
								if (num) reviews = num[0];
								break;
							}
						}
						reviews;
					}
				") in currentTab

				-- Delivery
				set productDelivery to do JavaScript ("
					var tile = document.querySelector('[data-index=\"" & idx & "\"]');
					if (!tile) { ''; } else {
						var buttons = tile.querySelectorAll('button');
						var delivery = '';
						for (var i = 0; i < buttons.length; i++) {
							var t = buttons[i].textContent.trim();
							var tl = t.toLowerCase();
							if (tl.indexOf('ноя') > -1 || tl.indexOf('дек') > -1 ||
								tl.indexOf('янв') > -1 || tl.indexOf('завтра') > -1) {
								delivery = t;
								break;
							}
						}
						delivery;
					}
				") in currentTab

				-- Clean "missing value"
				if productTitle is "missing value" then set productTitle to ""
				if productPrice is "missing value" then set productPrice to ""
				if productRating is "missing value" then set productRating to ""
				if productReviews is "missing value" then set productReviews to "0"
				if productDelivery is "missing value" then set productDelivery to ""

				-- Escape JSON
				set productTitle to my replaceText(productTitle, "\"", "\\\"")
				set productTitle to my replaceText(productTitle, "'", "\\'")
				set productPrice to my replaceText(productPrice, "\"", "\\\"")
				set productDelivery to my replaceText(productDelivery, "\"", "\\\"")

				-- Add comma if not first
				if idx > 0 then
					set productsJSON to productsJSON & ","
				end if

				-- Build JSON object
				set productsJSON to productsJSON & "{\"id\":\"" & productId & "\",\"url\":\"" & productUrl & "\",\"title\":\"" & productTitle & "\",\"price\":\"" & productPrice & "\",\"rating\":\"" & productRating & "\",\"reviews_count\":\"" & productReviews & "\",\"delivery_days\":\"" & productDelivery & "\"}"
			end if
		end repeat

		set productsJSON to productsJSON & "]"

		-- Build final result
		set finalJSON to "{\"success\":true,\"total_count\":" & tilesCount & ",\"button_check\":" & buttonCheck & ",\"products\":" & productsJSON & "}"

		return finalJSON
	end tell
end run

-- Helper function to replace text
on replaceText(theText, searchString, replacementString)
	set AppleScript's text item delimiters to searchString
	set theTextItems to text items of theText
	set AppleScript's text item delimiters to replacementString
	set theText to theTextItems as string
	set AppleScript's text item delimiters to ""
	return theText
end replaceText

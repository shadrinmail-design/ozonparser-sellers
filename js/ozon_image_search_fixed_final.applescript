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

		-- Focus input and TYPE URL via JavaScript (avoids keyboard layout issues)
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=\"text\"]');
			var targetInput = inputs[inputs.length - 1];
			targetInput.focus();
			targetInput.click();

			// Simulate typing character by character
			var url = '" & imageURL & "';
			var index = 0;

			function typeChar() {
				if (index < url.length) {
					targetInput.value += url[index];

					// Trigger input event after each character
					var event = new Event('input', { bubbles: true });
					targetInput.dispatchEvent(event);

					index++;
					setTimeout(typeChar, 50); // 50ms delay between characters
				} else {
					// Trigger final events
					targetInput.dispatchEvent(new Event('change', { bubbles: true }));
					targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
				}
			}

			typeChar();
		" in currentTab

		-- Wait for typing to complete and button to appear
		delay 10

		-- Check for and click "Найти" button
		set buttonCheck to do JavaScript "
			(function() {
				var buttons = document.querySelectorAll('button');

				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var text = btn.textContent.toLowerCase();

					if (rect.width > 0 && rect.height > 0 &&
						(text.includes('найти') || text.includes('search'))) {
						btn.click();
						return JSON.stringify({
							found: true,
							clicked: true,
							buttonText: btn.textContent.trim()
						});
					}
				}

				// If button not found, list all visible buttons
				var visibleButtons = [];
				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var txt = btn.textContent.trim();
					if (rect.width > 0 && rect.height > 0 && txt.length > 0 && txt.length < 50) {
						visibleButtons.push(txt);
					}
				}

				return JSON.stringify({
					found: false,
					visibleButtons: visibleButtons.slice(0, 10)
				});
			})();
		" in currentTab

		-- Wait for results
		delay 10

		-- Extract products
		set resultJSON to do JavaScript "
			(function() {
				try {
					var tiles = document.querySelectorAll('div[data-index]');
					var products = [];

					for (var i = 0; i < tiles.length; i++) {
						var tile = tiles[i];
						var link = tile.querySelector('a[href*=\"/product/\"]');
						var url = link ? link.href : '';

						var id = 'N/A';
						if (url) {
							var idMatch = url.match(/product\\/[^/]*-(\\d+)/);
							if (idMatch) id = idMatch[1];
						}

						var spans = tile.querySelectorAll('span');
						var title = 'N/A';
						for (var k = 0; k < spans.length; k++) {
							var txt = spans[k].textContent.trim();
							if (txt.length > 10) {
								title = txt.substring(0, 100);
								break;
							}
						}

						products.push({index: i + 1, id: id, title: title, url: url});
					}

					return JSON.stringify({
						success: true,
						total_count: tiles.length,
						button_check: " & buttonCheck & ",
						products: products
					});
				} catch(e) {
					return JSON.stringify({
						success: false,
						error: e.message,
						button_check: " & buttonCheck & "
					});
				}
			})();
		" in currentTab

		return resultJSON
	end tell
end run

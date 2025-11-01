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
		delay 6

		-- Step 1: Click camera button
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 5

		-- Step 2: Find input and set value directly via JavaScript
		set insertResult to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input[type=text]');
				if (inputs.length === 0) return 'ERROR: No inputs found';

				var lastInput = inputs[inputs.length - 1];
				lastInput.value = '" & imageURL & "';
				lastInput.focus();

				// Trigger input event
				var event = new Event('input', { bubbles: true });
				lastInput.dispatchEvent(event);

				return 'OK: Value set to ' + lastInput.value.substring(0, 50);
			})();
		" in currentTab

		-- Wait for Ozon to validate URL and show "Найти" button
		delay 5

		-- Step 3: Click "Найти" button
		set clickResult to do JavaScript "
			(function() {
				var buttons = document.querySelectorAll('button');

				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						var text = btn.textContent.toLowerCase();
						if (text.includes('найти')) {
							btn.click();
							return 'OK: Clicked search button';
						}
					}
				}

				return 'ERROR: Search button not found';
			})();
		" in currentTab

		-- Wait for results
		delay 12

		-- Step 4: Extract products
		set resultJSON to do JavaScript "
			(function() {
				var tiles = document.querySelectorAll('div[data-index]');
				var products = [];

				for (var i = 0; i < tiles.length && i < 30; i++) {
					var tile = tiles[i];
					var link = tile.querySelector('a[href*=\"/product/\"]');
					if (!link) continue;

					var url = link.href;
					var match = url.match(/product\\/[^\\/]*-(\\d+)/);
					var id = match ? match[1] : 'N/A';

					var spans = tile.querySelectorAll('span');
					var title = 'N/A';
					for (var j = 0; j < spans.length; j++) {
						var txt = spans[j].textContent.trim();
						if (txt.length > 15) {
							title = txt.substring(0, 100);
							break;
						}
					}

					products.push({
						index: i + 1,
						id: id,
						title: title,
						url: url
					});
				}

				return JSON.stringify({
					success: true,
					total_count: tiles.length,
					insertResult: '" & insertResult & "',
					clickResult: '" & clickResult & "',
					products: products
				});
			})();
		" in currentTab

		return resultJSON
	end tell
end run

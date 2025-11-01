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

		-- Step 1: Click camera button
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 3

		-- Step 2: Set URL via JavaScript with ALL necessary events
		set setResult to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input[type=\"text\"]');
				var targetInput = null;

				// Find image URL input (skip main search)
				for (var i = inputs.length - 1; i >= 0; i--) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0 && inp.placeholder !== 'Искать на Ozon') {
						targetInput = inp;
						break;
					}
				}

				if (!targetInput) {
					return JSON.stringify({success: false, error: 'Input not found'});
				}

				// Focus
				targetInput.focus();

				// Set value character by character (simulate typing)
				var url = '" & imageURL & "';
				targetInput.value = url;

				// Trigger ALL possible events
				targetInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
				targetInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
				targetInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' }));
				targetInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
				targetInput.dispatchEvent(new KeyboardEvent('keypress', { bubbles: true }));

				// Blur and refocus (sometimes triggers validation)
				targetInput.blur();
				setTimeout(function() {
					targetInput.focus();
				}, 100);

				return JSON.stringify({
					success: true,
					value: targetInput.value,
					placeholder: targetInput.placeholder || 'empty'
				});
			})();
		" in currentTab

		-- Step 3: Wait for Ozon to validate URL and show button
		delay 10

		-- Step 4: Check for "Найти" button
		set buttonCheck to do JavaScript "
			(function() {
				var buttons = document.querySelectorAll('button');
				var findBtn = null;

				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var text = btn.textContent.toLowerCase();

					if (rect.width > 0 && rect.height > 0) {
						if (text.includes('найти') || text.includes('search') || text.includes('поиск')) {
							findBtn = btn;
							break;
						}
					}
				}

				if (findBtn) {
					findBtn.click();
					return JSON.stringify({found: true, clicked: true, buttonText: findBtn.textContent.trim()});
				}

				// List all visible buttons with text
				var visibleButtons = [];
				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var txt = btn.textContent.trim();
					if (rect.width > 0 && rect.height > 0 && txt.length > 0) {
						visibleButtons.push(txt);
					}
				}

				return JSON.stringify({
					found: false,
					visibleButtonsWithText: visibleButtons
				});
			})();
		" in currentTab

		-- Step 5: Wait for results
		delay 10

		-- Step 6: Extract products
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
						set_result: " & setResult & ",
						button_check: " & buttonCheck & ",
						products: products
					});
				} catch(e) {
					return JSON.stringify({
						success: false,
						error: e.message,
						set_result: " & setResult & ",
						button_check: " & buttonCheck & "
					});
				}
			})();
		" in currentTab

		return resultJSON
	end tell
end run

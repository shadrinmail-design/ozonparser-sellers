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

		-- Step 2: Set URL directly via JavaScript (WORKING METHOD)
		set setUrlResult to do JavaScript "
			(function() {
				// Find the image URL input (last visible text input)
				var inputs = document.querySelectorAll('input[type=\"text\"]');
				var targetInput = null;

				// Get the last visible input (should be the image URL field)
				for (var i = inputs.length - 1; i >= 0; i--) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					// Skip the main search bar (has placeholder 'Искать на Ozon')
					if (rect.width > 0 && rect.height > 0 && inp.placeholder !== 'Искать на Ozon') {
						targetInput = inp;
						break;
					}
				}

				if (!targetInput) {
					return JSON.stringify({success: false, error: 'Image URL input not found'});
				}

				// Focus the input
				targetInput.focus();
				targetInput.click();

				// Set the URL value
				targetInput.value = '" & imageURL & "';

				// Trigger events (important for React/Vue to detect change)
				var inputEvent = new Event('input', { bubbles: true });
				targetInput.dispatchEvent(inputEvent);

				var changeEvent = new Event('change', { bubbles: true });
				targetInput.dispatchEvent(changeEvent);

				// Also try triggering keyup (some sites need this)
				var keyupEvent = new KeyboardEvent('keyup', { bubbles: true });
				targetInput.dispatchEvent(keyupEvent);

				return JSON.stringify({
					success: true,
					value_set: targetInput.value,
					placeholder: targetInput.placeholder || '',
					classList: Array.from(targetInput.classList).join(' ')
				});
			})();
		" in currentTab

		-- Wait for Ozon to validate the URL and show "Найти" button
		delay 8

		-- Step 3: Click "Найти" button
		set clickResult to do JavaScript "
			(function() {
				var buttons = document.querySelectorAll('button');
				var findBtn = null;

				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						var text = btn.textContent.toLowerCase();
						if (text.includes('найти') || text.includes('search')) {
							findBtn = btn;
							break;
						}
					}
				}

				if (findBtn) {
					findBtn.click();
					return 'OK: Found and clicked search button';
				}

				return 'ERROR: Search button not found';
			})();
		" in currentTab

		-- Wait for search results to load
		delay 10

		-- Step 4: Extract products
		set resultJSON to do JavaScript "
			(function() {
				try {
					var tiles = document.querySelectorAll('div[data-index]');
					var products = [];

					for (var i = 0; i < tiles.length; i++) {
						var tile = tiles[i];
						var link = tile.querySelector('a[href*=\"/product/\"]');
						var url = link ? link.href : '';

						// Extract product ID from URL
						var id = 'N/A';
						if (url) {
							var idMatch = url.match(/product\\/[^/]*-(\\d+)/);
							if (idMatch) {
								id = idMatch[1];
							}
						}

						// Get title
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
						set_url_result: " & setUrlResult & ",
						click_result: '" & clickResult & "',
						products: products
					}, null, 2);
				} catch(e) {
					return JSON.stringify({
						success: false,
						error: e.message,
						set_url_result: " & setUrlResult & ",
						click_result: '" & clickResult & "'
					});
				}
			})();
		" in currentTab

		return resultJSON
	end tell
end run

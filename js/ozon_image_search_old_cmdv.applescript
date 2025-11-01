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
		delay 5

		-- Step 2: Focus the image URL input field
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			if (inputs.length > 0) {
				var lastInput = inputs[inputs.length - 1];
				lastInput.focus();
				lastInput.click();
			}
		" in currentTab
		delay 2
	end tell

	-- Step 3: Paste URL using clipboard and Cmd+V
	set the clipboard to imageURL

	tell application "System Events"
		-- First, clear any existing input
		keystroke "a" using command down
		delay 0.5

		-- Then paste
		keystroke "v" using command down
	end tell

	-- Step 4: Wait LONGER for "Найти" button to appear (Ozon needs time to validate URL)
	delay 10

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Step 5: Click "Найти" button (search by image)
		set clickResult to do JavaScript "
			(function() {
				// Wait a bit for button to become active
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

		-- Step 6: Wait for search results to load
		delay 10

		-- Step 7: Extract products
		set resultJSON to do JavaScript "
			(function() {
				try {
					var tiles = document.querySelectorAll('div[data-index]');
					var products = [];

					for (var i = 0; i < tiles.length; i++) {
						var tile = tiles[i];
						var link = tile.querySelector('a[href*=\"/product/\"]');
						var url = link ? link.href : '';

						// Extract product ID from URL (format: /product/name-1234567/)
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
						click_result: '" & clickResult & "',
						products: products
					});
				} catch(e) {
					return JSON.stringify({
						success: false,
						error: e.message,
						click_result: '" & clickResult & "'
					});
				}
			})();
		" in currentTab

		return resultJSON
	end tell
end run

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

		-- Focus input
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=\"text\"]');
			var targetInput = inputs[inputs.length - 1];
			targetInput.focus();
			targetInput.click();
		" in currentTab
		delay 1

		-- Type URL character by character using System Events
		tell application "System Events"
			keystroke imageURL
			delay 0.5
			-- Press Enter to trigger search
			keystroke return
		end tell

		delay 5

		-- Check for "Найти" button
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

				return JSON.stringify({found: false});
			})();
		" in currentTab

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

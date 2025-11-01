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

		-- Focus last input
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			if (inputs.length > 0) {
				inputs[inputs.length - 1].focus();
			}
		" in currentTab
		delay 1
	end tell

	-- Paste URL using clipboard
	set the clipboard to imageURL

	tell application "System Events"
		keystroke "v" using command down
		delay 1
		keystroke return
	end tell

	delay 5

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Click find button
		do JavaScript "
			var buttons = document.querySelectorAll('button');
			for (var i = 0; i < buttons.length; i++) {
				if (buttons[i].textContent.includes('Найти')) {
					buttons[i].click();
					break;
				}
			}
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

						// Extract ID from URL more reliably
						var id = 'N/A';
						if (url) {
							var parts = url.split('/');
							for (var j = 0; j < parts.length; j++) {
								if (parts[j] === 'product' && j + 1 < parts.length) {
									var nextPart = parts[j + 1];
									var idMatch = nextPart.match(/^(\\d+)/);
									if (idMatch) {
										id = idMatch[1];
									}
									break;
								}
							}
						}

						// Get title
						var titleEl = tile.querySelector('span');
						var title = titleEl ? titleEl.textContent.trim().substring(0, 100) : 'N/A';

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
						products: products
					});
				} catch(e) {
					return JSON.stringify({
						success: false,
						error: e.message
					});
				}
			})();
		" in currentTab

		return resultJSON
	end tell
end run

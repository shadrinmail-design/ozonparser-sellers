on run argv
	if (count of argv) < 1 then
		return "{\"error\": \"No URL provided\"}"
	end if

	set imageURL to item 1 of argv
	set ozonURL to "https://www.ozon.ru/"

	set logText to ""

	tell application "Safari"
		activate

		if (count of windows) is 0 then
			make new document
		end if

		set currentTab to current tab of window 1
		set URL of currentTab to ozonURL
		set logText to logText & "✓ Opened ozon.ru" & return
		delay 8

		-- Click camera
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		set logText to logText & "✓ Clicked camera button" & return
		delay 4

		-- Focus input
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			if (inputs.length > 0) {
				var lastInput = inputs[inputs.length - 1];
				lastInput.focus();
				lastInput.click();
			}
		" in currentTab
		set logText to logText & "✓ Focused input field" & return
		delay 2
	end tell

	-- Paste URL
	set the clipboard to imageURL
	set logText to logText & "✓ Set clipboard" & return

	tell application "System Events"
		keystroke "v" using command down
	end tell
	set logText to logText & "✓ Pressed Cmd+V" & return

	-- Wait longer for URL to be validated by Ozon
	delay 5

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Check if pasted
		set pastedValue to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			for (var i = 0; i < inputs.length; i++) {
				if (inputs[i].value && inputs[i].value.includes('http')) {
					return inputs[i].value;
				}
			}
			return '';
		" in currentTab

		if pastedValue is "" then
			return "{\"error\": \"URL not pasted\", \"log\": \"" & logText & "\"}"
		end if

		set logText to logText & "✓ URL pasted: " & (text 1 thru 40 of pastedValue) & "..." & return

		-- Wait for button to appear
		delay 3

		-- Click Find button
		do JavaScript "
			var buttons = document.querySelectorAll('button');
			for (var i = 0; i < buttons.length; i++) {
				if (buttons[i].textContent.includes('Найти')) {
					buttons[i].click();
					break;
				}
			}
		" in currentTab
		set logText to logText & "✓ Clicked Find button" & return

		-- Wait for results
		delay 15

		-- Get results
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
					products: products
				});
			})();
		" in currentTab

		return resultJSON
	end tell
end run

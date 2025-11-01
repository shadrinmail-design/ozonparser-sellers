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
		delay 4

		-- Focus last input and check it's visible
		set focusCheck to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			if (inputs.length > 0) {
				var lastInput = inputs[inputs.length - 1];
				lastInput.focus();
				return 'Focused input ' + inputs.length + ', placeholder: ' + lastInput.placeholder;
			}
			return 'No inputs found';
		" in currentTab

		log "Focus check: " & focusCheck
		delay 2
	end tell

	-- Paste URL using clipboard
	set the clipboard to imageURL
	log "Clipboard set to: " & imageURL

	tell application "System Events"
		keystroke "v" using command down
	end tell

	delay 2

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Check if URL was pasted
		set pasteCheck to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			var values = [];
			for (var i = 0; i < inputs.length; i++) {
				if (inputs[i].value) {
					values.push('Input ' + i + ': ' + inputs[i].value.substring(0, 50));
				}
			}
			return values.length > 0 ? values.join(', ') : 'No values found in inputs';
		" in currentTab

		log "Paste check: " & pasteCheck
		delay 1
	end tell

	-- Press Enter
	tell application "System Events"
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
					return JSON.stringify({
						success: true,
						total_count: tiles.length,
						debug: {
							focusCheck: '" & focusCheck & "',
							pasteCheck: '" & pasteCheck & "'
						}
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

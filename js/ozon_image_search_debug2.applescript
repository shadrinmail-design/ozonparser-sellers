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

		log "Step 1: Waiting for ozon.ru to load..."
		delay 8

		log "Step 2: Looking for camera button..."
		set cameraCheck to do JavaScript "
			var btn = document.querySelector('button.rn6_29');
			if (btn) {
				return 'Camera button found: ' + btn.className;
			}
			return 'ERROR: Camera button not found';
		" in currentTab

		log cameraCheck

		if cameraCheck contains "ERROR" then
			return "{\"error\": \"" & cameraCheck & "\"}"
		end if

		-- Click camera button
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		log "Step 3: Camera button clicked"

		delay 4

		-- Check for input field
		set inputCheck to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			var visible = [];
			for (var i = 0; i < inputs.length; i++) {
				var r = inputs[i].getBoundingClientRect();
				if (r.width > 0 && r.height > 0) {
					visible.push('Input ' + i + ': placeholder=' + inputs[i].placeholder);
				}
			}
			return 'Found ' + visible.length + ' visible inputs: ' + visible.join(', ');
		" in currentTab

		log "Step 4: " & inputCheck

		-- Focus last visible input
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			var visible = [];
			for (var i = 0; i < inputs.length; i++) {
				var r = inputs[i].getBoundingClientRect();
				if (r.width > 0 && r.height > 0) {
					visible.push(inputs[i]);
				}
			}
			if (visible.length > 0) {
				var lastInput = visible[visible.length - 1];
				lastInput.focus();
				lastInput.click();
			}
		" in currentTab

		log "Step 5: Input focused"
		delay 2
	end tell

	-- Copy URL to clipboard
	set the clipboard to imageURL
	log "Step 6: Clipboard set to: " & imageURL

	-- Paste using Cmd+V
	tell application "System Events"
		keystroke "v" using command down
	end tell

	log "Step 7: Cmd+V pressed"
	delay 3

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Check if URL was pasted
		set pasteCheck to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			for (var i = 0; i < inputs.length; i++) {
				if (inputs[i].value && inputs[i].value.length > 10) {
					return 'URL pasted successfully: ' + inputs[i].value.substring(0, 50);
				}
			}
			return 'ERROR: URL not pasted';
		" in currentTab

		log "Step 8: " & pasteCheck

		if pasteCheck contains "ERROR" then
			return "{\"error\": \"" & pasteCheck & "\", \"debug\": true}"
		end if

		-- Wait for "Найти" button
		log "Step 9: Waiting for Find button..."
		delay 3

		-- Look for "Найти" button
		set buttonCheck to do JavaScript "
			var buttons = document.querySelectorAll('button');
			var foundButtons = [];
			for (var i = 0; i < buttons.length; i++) {
				var r = buttons[i].getBoundingClientRect();
				if (r.width > 0 && r.height > 0) {
					var text = buttons[i].textContent.trim();
					if (text) {
						foundButtons.push(text);
					}
				}
			}
			return 'Found ' + foundButtons.length + ' buttons: ' + foundButtons.join(', ');
		" in currentTab

		log "Step 10: " & buttonCheck

		-- Click "Найти" button
		set clickResult to do JavaScript "
			var buttons = document.querySelectorAll('button');
			for (var i = 0; i < buttons.length; i++) {
				var r = buttons[i].getBoundingClientRect();
				if (r.width > 0 && r.height > 0) {
					var text = buttons[i].textContent.toLowerCase();
					if (text.includes('найти') || text.includes('search')) {
						buttons[i].click();
						return 'OK: Clicked button with text: ' + buttons[i].textContent;
					}
				}
			}
			return 'ERROR: No Find button found';
		" in currentTab

		log "Step 11: " & clickResult

		-- Wait for results
		delay 12

		-- Count products
		set productsJSON to do JavaScript "
			(function() {
				var tiles = document.querySelectorAll('div[data-index]');
				return JSON.stringify({
					success: true,
					total_count: tiles.length,
					debug: {
						cameraCheck: '" & cameraCheck & "',
						inputCheck: '" & inputCheck & "',
						pasteCheck: '" & pasteCheck & "',
						buttonCheck: '" & buttonCheck & "',
						clickResult: '" & clickResult & "'
					}
				});
			})();
		" in currentTab

		return productsJSON
	end tell
end run

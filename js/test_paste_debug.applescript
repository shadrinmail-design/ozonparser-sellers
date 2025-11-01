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
		log "Step 1: Clicking camera button"
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 3

		-- Step 2: Find input field
		log "Step 2: Finding input field"
		set inputInfo to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input[type=\"text\"]');
				var result = [];
				for (var i = 0; i < inputs.length; i++) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					result.push({
						index: i,
						placeholder: inp.placeholder || '',
						value: inp.value || '',
						visible: rect.width > 0 && rect.height > 0,
						classList: Array.from(inp.classList).join(' ')
					});
				}
				return JSON.stringify(result, null, 2);
			})();
		" in currentTab

		log "Input fields found: " & inputInfo

		-- Step 3: Focus the image URL input (last visible, NOT main search)
		log "Step 3: Focusing image URL input"
		set focusResult to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input[type=\"text\"]');
				var targetInput = null;

				for (var i = inputs.length - 1; i >= 0; i--) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0 && inp.placeholder !== 'Искать на Ozon') {
						targetInput = inp;
						break;
					}
				}

				if (targetInput) {
					targetInput.focus();
					targetInput.click();
					return JSON.stringify({success: true, placeholder: targetInput.placeholder});
				}
				return JSON.stringify({success: false});
			})();
		" in currentTab

		log "Focus result: " & focusResult
		delay 1
	end tell

	-- Step 4: Set clipboard
	log "Step 4: Setting clipboard to: " & imageURL
	set the clipboard to imageURL
	delay 0.5

	-- Verify clipboard
	set clipboardContent to the clipboard as text
	log "Clipboard verified: " & clipboardContent

	-- Step 5: Paste using Cmd+V
	log "Step 5: Pasting with Cmd+V"
	tell application "System Events"
		keystroke "a" using command down
		delay 0.3
		keystroke "v" using command down
		delay 0.5
	end tell

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Step 6: Check if value was pasted
		log "Step 6: Checking if value was pasted"
		set pasteCheck to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input[type=\"text\"]');
				var values = [];
				for (var i = 0; i < inputs.length; i++) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						values.push({
							index: i,
							value: inp.value,
							valueLength: inp.value.length,
							placeholder: inp.placeholder || ''
						});
					}
				}
				return JSON.stringify(values, null, 2);
			})();
		" in currentTab

		log "After paste - input values: " & pasteCheck

		-- Step 7: Wait for "Найти" button to appear
		log "Step 7: Waiting for 'Найти' button (Ozon validates URL)..."
		delay 5

		-- Step 8: Check for "Найти" button
		set buttonCheck to do JavaScript "
			(function() {
				var buttons = document.querySelectorAll('button');
				var foundButtons = [];

				for (var i = 0; i < buttons.length; i++) {
					var btn = buttons[i];
					var rect = btn.getBoundingClientRect();
					var text = btn.textContent.toLowerCase();

					if (rect.width > 0 && rect.height > 0) {
						foundButtons.push({
							text: btn.textContent.trim(),
							visible: true,
							classList: Array.from(btn.classList).join(' ')
						});

						if (text.includes('найти') || text.includes('search')) {
							return JSON.stringify({
								found: true,
								buttonText: btn.textContent.trim()
							});
						}
					}
				}

				return JSON.stringify({
					found: false,
					allVisibleButtons: foundButtons
				});
			})();
		" in currentTab

		log "Button check result: " & buttonCheck

		return buttonCheck
	end tell
end run

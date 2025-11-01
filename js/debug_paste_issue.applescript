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
		delay 5

		-- Step 2: Find and debug the input field
		log "Step 2: Analyzing input fields"
		set inputDebug to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input');
				var result = {
					total_inputs: inputs.length,
					inputs_info: []
				};

				for (var i = 0; i < inputs.length; i++) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					result.inputs_info.push({
						index: i,
						type: inp.type,
						placeholder: inp.placeholder || '',
						value: inp.value || '',
						visible: rect.width > 0 && rect.height > 0,
						width: rect.width,
						height: rect.height,
						name: inp.name || '',
						id: inp.id || '',
						classList: Array.from(inp.classList).join(' ')
					});
				}

				return JSON.stringify(result, null, 2);
			})();
		" in currentTab

		log "Input fields info: " & inputDebug

		-- Step 3: Try to focus the LAST visible input
		log "Step 3: Focusing last visible input"
		set focusResult to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input');
				var lastVisibleInput = null;

				for (var i = inputs.length - 1; i >= 0; i--) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						lastVisibleInput = inp;
						break;
					}
				}

				if (lastVisibleInput) {
					lastVisibleInput.focus();
					lastVisibleInput.click();

					// Try setting value directly first
					lastVisibleInput.value = '';

					return JSON.stringify({
						success: true,
						focused_input: {
							type: lastVisibleInput.type,
							placeholder: lastVisibleInput.placeholder || '',
							id: lastVisibleInput.id || '',
							classList: Array.from(lastVisibleInput.classList).join(' ')
						}
					});
				}

				return JSON.stringify({success: false, error: 'No visible input found'});
			})();
		" in currentTab

		log "Focus result: " & focusResult
		delay 2
	end tell

	-- Step 4: Copy URL to clipboard and verify
	log "Step 4: Setting clipboard"
	set the clipboard to imageURL
	delay 1

	-- Verify clipboard
	set clipboardContent to the clipboard as text
	log "Clipboard content: " & clipboardContent

	-- Step 5: Paste using Cmd+V
	log "Step 5: Pasting with Cmd+V"
	tell application "System Events"
		-- Clear first
		keystroke "a" using command down
		delay 0.5

		-- Paste
		keystroke "v" using command down
		delay 1
	end tell

	-- Step 6: Check if value was pasted
	tell application "Safari"
		set currentTab to current tab of window 1

		set pasteCheck to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input');
				var values = [];

				for (var i = 0; i < inputs.length; i++) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0 && inp.value) {
						values.push({
							index: i,
							value: inp.value,
							type: inp.type,
							placeholder: inp.placeholder || ''
						});
					}
				}

				return JSON.stringify({
					inputs_with_values: values,
					total: values.length
				}, null, 2);
			})();
		" in currentTab

		log "After paste check: " & pasteCheck

		-- Try alternative: Set value directly via JavaScript
		log "Step 7: Trying direct JavaScript setValue"
		set jsSetResult to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input');
				var targetInput = null;

				for (var i = inputs.length - 1; i >= 0; i--) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						targetInput = inp;
						break;
					}
				}

				if (targetInput) {
					// Clear first
					targetInput.value = '';

					// Set URL
					targetInput.value = '" & imageURL & "';

					// Trigger input event (important for React/Vue)
					var inputEvent = new Event('input', { bubbles: true });
					targetInput.dispatchEvent(inputEvent);

					var changeEvent = new Event('change', { bubbles: true });
					targetInput.dispatchEvent(changeEvent);

					return JSON.stringify({
						success: true,
						value_set: targetInput.value,
						value_length: targetInput.value.length
					});
				}

				return JSON.stringify({success: false, error: 'No input found'});
			})();
		" in currentTab

		log "JavaScript setValue result: " & jsSetResult

		-- Final check
		delay 3

		set finalCheck to do JavaScript "
			(function() {
				var inputs = document.querySelectorAll('input');
				var info = [];

				for (var i = 0; i < inputs.length; i++) {
					var inp = inputs[i];
					var rect = inp.getBoundingClientRect();
					if (rect.width > 0 && rect.height > 0) {
						info.push({
							index: i,
							value: inp.value,
							valueLength: inp.value.length
						});
					}
				}

				return JSON.stringify({
					visible_inputs: info
				}, null, 2);
			})();
		" in currentTab

		return finalCheck
	end tell
end run

on run argv
	if (count of argv) < 1 then
		return "{\"error\": \"No URL provided\"}"
	end if

	set imageURL to item 1 of argv
	set ozonURL to "https://www.ozon.ru/"
	set screenshotDir to (do shell script "echo $HOME") & "/claude/ozonparser/js/screenshots/"

	-- Create screenshots directory
	do shell script "mkdir -p " & screenshotDir

	tell application "Safari"
		activate

		if (count of windows) is 0 then
			make new document
		end if

		set currentTab to current tab of window 1
		set URL of currentTab to ozonURL
		delay 6

		-- Screenshot 1: Ozon homepage
		do shell script "screencapture -w " & screenshotDir & "01_homepage.png"

		-- Click camera button
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 4

		-- Screenshot 2: After camera click
		do shell script "screencapture -w " & screenshotDir & "02_after_camera_click.png"

		-- Focus input
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			if (inputs.length > 0) {
				var lastInput = inputs[inputs.length - 1];
				lastInput.focus();
				lastInput.click();
			}
		" in currentTab
		delay 2

		-- Screenshot 3: After focus
		do shell script "screencapture -w " & screenshotDir & "03_input_focused.png"

		-- Get input info BEFORE paste
		set inputInfoBefore to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			var info = [];
			for (var i = 0; i < inputs.length; i++) {
				var inp = inputs[i];
				var rect = inp.getBoundingClientRect();
				info.push({
					index: i,
					visible: rect.width > 0 && rect.height > 0,
					placeholder: inp.placeholder,
					value: inp.value,
					focused: inp === document.activeElement
				});
			}
			return JSON.stringify(info);
		" in currentTab
	end tell

	-- Copy to clipboard
	set the clipboard to imageURL
	delay 0.5

	-- Verify clipboard
	set clipboardContent to the clipboard as text

	-- Paste
	tell application "System Events"
		keystroke "a" using command down
		delay 0.5
		keystroke "v" using command down
	end tell

	delay 3

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Screenshot 4: After paste
		do shell script "screencapture -w " & screenshotDir & "04_after_paste.png"

		-- Get input info AFTER paste
		set inputInfoAfter to do JavaScript "
			var inputs = document.querySelectorAll('input[type=text]');
			var info = [];
			for (var i = 0; i < inputs.length; i++) {
				var inp = inputs[i];
				var rect = inp.getBoundingClientRect();
				info.push({
					index: i,
					visible: rect.width > 0 && rect.height > 0,
					placeholder: inp.placeholder,
					value: inp.value,
					valueLength: inp.value.length,
					focused: inp === document.activeElement
				});
			}
			return JSON.stringify(info);
		" in currentTab

		delay 5

		-- Screenshot 5: After waiting
		do shell script "screencapture -w " & screenshotDir & "05_after_wait.png"

		-- Check for buttons
		set buttonInfo to do JavaScript "
			var buttons = document.querySelectorAll('button');
			var info = [];
			for (var i = 0; i < buttons.length; i++) {
				var btn = buttons[i];
				var rect = btn.getBoundingClientRect();
				if (rect.width > 0 && rect.height > 0) {
					info.push({
						text: btn.textContent.trim(),
						className: btn.className
					});
				}
			}
			return JSON.stringify(info);
		" in currentTab

		-- Return debug info
		return "{\"success\": true, \"clipboard\": \"" & clipboardContent & "\", \"inputsBefore\": " & inputInfoBefore & ", \"inputsAfter\": " & inputInfoAfter & ", \"buttons\": " & buttonInfo & ", \"screenshotsDir\": \"" & screenshotDir & "\"}"
	end tell
end run

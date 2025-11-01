on run argv
	set imageURL to "https://ir.ozone.ru/s3/multimedia-1-y/wc250/7333735426.jpg"
	set ozonURL to "https://www.ozon.ru/"

	tell application "Safari"
		activate
		if (count of windows) is 0 then make new document

		set currentTab to current tab of window 1
		set URL of currentTab to ozonURL
		delay 6

		-- Click camera
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 4

		-- Get input BEFORE
		set beforeInfo to do JavaScript "
			var inp = document.querySelectorAll('input[type=text]');
			var last = inp[inp.length - 1];
			last.focus();
			return 'Input count: ' + inp.length + ', Last value: [' + last.value + '], Placeholder: ' + last.placeholder;
		" in currentTab

		log "BEFORE PASTE: " & beforeInfo
		delay 1
	end tell

	-- Set clipboard
	set the clipboard to imageURL
	set clipCheck to the clipboard as text
	log "CLIPBOARD: " & clipCheck

	-- Paste
	tell application "System Events"
		keystroke "v" using command down
	end tell

	delay 2

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Get input AFTER
		set afterInfo to do JavaScript "
			var inp = document.querySelectorAll('input[type=text]');
			var last = inp[inp.length - 1];
			return 'Input count: ' + inp.length + ', Last value: [' + last.value + '], Length: ' + last.value.length;
		" in currentTab

		log "AFTER PASTE: " & afterInfo

		-- Try to find the URL in ANY input
		set foundInfo to do JavaScript "
			var inp = document.querySelectorAll('input[type=text]');
			var found = false;
			for (var i = 0; i < inp.length; i++) {
				if (inp[i].value.includes('http')) {
					found = 'Found URL in input ' + i + ': ' + inp[i].value;
					break;
				}
			}
			return found || 'URL not found in any input';
		" in currentTab

		log "SEARCH RESULT: " & foundInfo

		return "{\"before\": \"" & beforeInfo & "\", \"after\": \"" & afterInfo & "\", \"found\": \"" & foundInfo & "\", \"clipboard\": \"" & clipCheck & "\"}"
	end tell
end run

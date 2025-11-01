on run argv
	set imageURL to "https://ir.ozone.ru/s3/multimedia-1-5/wc600/7249026173.jpg"
	set ozonURL to "https://www.ozon.ru/"

	tell application "Safari"
		activate
		if (count of windows) is 0 then make new document
		set currentTab to current tab of window 1
		set URL of currentTab to ozonURL
		delay 5

		-- Click camera
		do JavaScript "document.querySelector('button.rn6_29').click();" in currentTab
		delay 3

		-- Set URL via JS
		do JavaScript "
			var inputs = document.querySelectorAll('input[type=\"text\"]');
			var targetInput = inputs[inputs.length - 1];
			targetInput.value = '" & imageURL & "';
			targetInput.dispatchEvent(new Event('input', { bubbles: true }));
			targetInput.dispatchEvent(new Event('change', { bubbles: true }));
		" in currentTab

		delay 3

		-- Look for button with more detail
		set buttonSearch to do JavaScript "
			(function() {
				var allButtons = document.querySelectorAll('button');
				var result = {
					totalButtons: allButtons.length,
					buttonsWithText: []
				};

				for (var i = 0; i < allButtons.length; i++) {
					var btn = allButtons[i];
					var text = btn.textContent.trim();
					var rect = btn.getBoundingClientRect();

					if (text.length > 0 && rect.width > 0 && rect.height > 0) {
						result.buttonsWithText.push({
							text: text,
							classes: Array.from(btn.classList).join(' '),
							disabled: btn.disabled,
							hidden: btn.hidden || getComputedStyle(btn).display === 'none'
						});
					}
				}

				return JSON.stringify(result, null, 2);
			})();
		" in currentTab

		return buttonSearch
	end tell
end run

-- Ozon Image Search via Safari
-- Автоматизация поиска по изображению на Ozon.ru

on run argv
	if (count of argv) < 1 then
		return "{\"error\": \"Image URL required\"}"
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
		set clickResult to do JavaScript "
			(function() {
				try {
					const btn = document.querySelector('button.rn6_29');
					if (!btn) return 'ERROR: No camera button';
					btn.click();
					return 'OK: Camera clicked';
				} catch(e) {
					return 'ERROR: ' + e.message;
				}
			})();
		" in currentTab

		delay 3

		-- Step 2: Find and focus the new input field
		set focusResult to do JavaScript "
			(function() {
				try {
					const all = Array.from(document.querySelectorAll('input[type=text]'));
					const visible = all.filter(inp => {
						const r = inp.getBoundingClientRect();
						return r.width > 0 && r.height > 0;
					});

					if (visible.length > 0) {
						const newInp = visible[visible.length - 1];
						newInp.focus();
						return 'OK: Input focused';
					}

					return 'ERROR: No input found';
				} catch(e) {
					return 'ERROR: ' + e.message;
				}
			})();
		" in currentTab

		delay 0.5
	end tell

	-- Step 3: Copy URL to clipboard and paste with Cmd+V
	set the clipboard to imageURL

	tell application "System Events"
		keystroke "v" using command down
	end tell

	delay 1

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Verify URL was pasted
		set insertResult to do JavaScript "
			(function() {
				const all = Array.from(document.querySelectorAll('input[type=text]'));
				const urlInp = all.find(inp => inp.value.indexOf('http') >= 0);
				if (urlInp) {
					return 'OK: URL inserted';
				}
				return 'ERROR: URL not found';
			})();
		" in currentTab

		delay 0.5
	end tell

	-- Step 4: Press Enter
	tell application "System Events"
		keystroke return
	end tell

	delay 5

	tell application "Safari"
		set currentTab to current tab of window 1

		-- Step 5: Click "Find" button
		set findButtonResult to do JavaScript "
			(function() {
				try {
					const btns = Array.from(document.querySelectorAll('button')).filter(b => {
						const r = b.getBoundingClientRect();
						return r.width > 0 && r.height > 0;
					});

					let findBtn = btns.find(b => b.textContent.toLowerCase().includes('найти'));

					if (!findBtn) {
						findBtn = btns[btns.length - 1];
					}

					if (findBtn) {
						findBtn.click();
						return 'OK: Find button clicked';
					}

					return 'ERROR: No find button';
				} catch(e) {
					return 'ERROR: ' + e.message;
				}
			})();
		" in currentTab

		-- Step 6: Wait for results and parse products
		delay 10

		set productsJSON to do JavaScript "
			(function() {
				try {
					const tiles = Array.from(document.querySelectorAll('div[data-index]'));
					const products = tiles.map((tile, idx) => {
						const link = tile.querySelector('a[href*=\\"/product/\\"]');
						const url = link ? link.href : '';
						const productId = url.match(/product\\/(\\d+)/);
						const id = productId ? productId[1] : 'N/A';

						const titleEl = tile.querySelector('span');
						const title = titleEl ? titleEl.textContent.trim() : 'N/A';

						const priceEl = tile.querySelector('[class*=price]');
						const price = priceEl ? priceEl.textContent.trim() : 'N/A';

						return {
							index: idx + 1,
							id: id,
							title: title.substring(0, 100),
							price: price,
							url: url
						};
					});

					return JSON.stringify({
						success: true,
						total: tiles.length,
						products: products
					}, null, 2);
				} catch(e) {
					return JSON.stringify({
						success: false,
						error: e.message
					});
				}
			})();
		" in currentTab

		return productsJSON
	end tell
end run

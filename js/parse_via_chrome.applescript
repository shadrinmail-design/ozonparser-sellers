-- Парсинг Ozon через обычный Chrome (без Puppeteer)
-- Использует Chrome который уже открыт

on run argv
	if (count of argv) < 1 then
		return "{\"error\": \"No URL provided\"}"
	end if

	set targetPath to item 1 of argv
	set maxScrolls to 5
	if (count of argv) > 1 then
		set maxScrolls to item 2 of argv as integer
	end if

	set ozonURL to "https://www.ozon.ru" & targetPath

	tell application "Google Chrome"
		activate

		-- Создаем новую вкладку или используем текущую
		if (count of windows) is 0 then
			make new window
		end if

		set currentWindow to window 1
		set currentTab to active tab of currentWindow
		set URL of currentTab to ozonURL

		-- Ждем загрузки
		delay 5

		-- Скроллим и собираем товары
		set allProducts to {}

		repeat maxScrolls times
			-- Извлекаем товары
			set productsJS to "
				(function() {
					var links = Array.from(document.querySelectorAll('a[href*=\"/product/\"]'));
					var products = links.map(function(a) {
						var match = a.href.match(/product\\/[^\\/]*-(\\d+)/);
						if (match) {
							return {
								id: match[1],
								url: a.href,
								title: a.textContent.trim().substring(0, 100)
							};
						}
						return null;
					}).filter(function(p) { return p !== null; });

					// Убираем дубликаты
					var unique = {};
					products.forEach(function(p) {
						unique[p.id] = p;
					});

					return Object.values(unique);
				})();
			"

			set products to execute currentTab javascript productsJS

			-- Прокрутка вниз
			execute currentTab javascript "window.scrollBy(0, window.innerHeight);"
			delay 2
		end repeat

		-- Финальный сбор всех товаров
		set finalJS to "
			(function() {
				var links = Array.from(document.querySelectorAll('a[href*=\"/product/\"]'));
				var products = [];
				var seen = {};

				links.forEach(function(a) {
					var match = a.href.match(/product\\/[^\\/]*-(\\d+)/);
					if (match && !seen[match[1]]) {
						seen[match[1]] = true;

						// Находим родительский элемент товара
						var tile = a.closest('[data-index]') || a.closest('div');
						var title = '';
						var price = '';

						// Пытаемся найти название
						var titleEl = tile.querySelector('span[class*=\"tsBody\"]') || a.querySelector('span');
						if (titleEl) {
							title = titleEl.textContent.trim();
						}

						// Пытаемся найти цену
						var priceEl = tile.querySelector('span[class*=\"tsHeadline\"]');
						if (priceEl) {
							price = priceEl.textContent.trim();
						}

						products.push({
							id: match[1],
							url: a.href,
							title: title.substring(0, 100),
							price: price
						});
					}
				});

				return {
					success: true,
					total: products.length,
					products: products
				};
			})();
		"

		set result to execute currentTab javascript finalJS
		return result
	end tell
end run

-- Парсинг Ozon через обычный Chrome (без Puppeteer)
-- Использует Chrome который уже открыт
-- Собирает ВСЕ поля: название, цена, рейтинг, отзывы, доставка

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

		-- Скроллим страницу
		repeat maxScrolls times
			execute currentTab javascript "window.scrollBy(0, window.innerHeight);"
			delay 2
		end repeat

		-- Финальный сбор всех товаров со ВСЕМИ полями
		set finalJS to "
			(function() {
				var products = [];
				var seen = {};

				// Находим все карточки товаров
				var tiles = document.querySelectorAll('[data-index]');

				tiles.forEach(function(tile) {
					// Находим ссылку на товар
					var link = tile.querySelector('a[href*=\"/product/\"]');
					if (!link) return;

					var match = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
					if (!match || seen[match[1]]) return;
					seen[match[1]] = true;

					var productId = match[1];
					var productUrl = link.href;

					// Название товара - находим самый длинный текстовый элемент
					var title = '';
					var allTexts = tile.querySelectorAll('span');
					var longestText = '';
					for (var i = 0; i < allTexts.length; i++) {
						var text = allTexts[i].textContent.trim();
						// Название - длинный текст без спецсимволов цены
						if (text.length > longestText.length &&
						    text.length > 15 &&
						    !text.match(/^[\\\\d\\\\s₽,.%\\\\/]+$/) &&
						    !text.includes('завтра') &&
						    !text.includes('доставка')) {
							longestText = text;
						}
					}
					title = longestText;

					// Цена - ищем span с tsHeadline и цифрами
					var price = '';
					var priceSpans = tile.querySelectorAll('span[class*=\"tsHeadline\"]');
					for (var i = 0; i < priceSpans.length; i++) {
						var text = priceSpans[i].textContent.trim();
						if (text.match(/\\\\d/) && text.includes('₽')) {
							price = text;
							break;
						}
					}

					// Рейтинг - ищем число от 0 до 5
					var rating = '';
					var smallTexts = tile.querySelectorAll('span[class*=\"tsBodyControl\"], span[class*=\"tsCaption\"]');
					for (var i = 0; i < smallTexts.length; i++) {
						var text = smallTexts[i].textContent.trim();
						if (text.match(/^[0-5]([.,]\\\\d{1,2})?$/)) {
							rating = text;
							break;
						}
					}

					// Количество отзывов - число или \"1.2K\" рядом с рейтингом
					var reviewsCount = '';
					for (var i = 0; i < smallTexts.length; i++) {
						var text = smallTexts[i].textContent.trim();
						// Отзывы: число, K, или • число
						if (text.match(/^•?\\\\s*\\\\d+([.,]\\\\d+)?[KkКк]?$/)) {
							reviewsCount = text.replace('•', '').trim();
							break;
						}
					}

					// Срок доставки - ищем текст с \"завтра\" или датой
					var deliveryDays = '';
					var deliveryTexts = tile.querySelectorAll('span[class*=\"tsBody\"]');
					for (var i = 0; i < deliveryTexts.length; i++) {
						var text = deliveryTexts[i].textContent.trim().toLowerCase();
						if (text.includes('завтра') ||
						    text.includes('доставка') ||
						    text.match(/\\\\d+\\\\s*(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)/) ||
						    text.match(/\\\\d+\\\\s*(дня|дней|день)/)) {
							deliveryDays = deliveryTexts[i].textContent.trim();
							break;
						}
					}

					products.push({
						id: productId,
						url: productUrl,
						title: title || 'Без названия',
						price: price || '',
						rating: rating || '',
						reviews_count: reviewsCount || '0',
						delivery_days: deliveryDays || ''
					});
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

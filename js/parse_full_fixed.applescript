-- Парсинг Ozon через Chrome с ПОЛНЫМИ данными
-- Собирает: ID, URL, название, цену, рейтинг, отзывы, доставку

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

		if (count of windows) is 0 then
			make new window
		end if

		set currentWindow to window 1
		set currentTab to active tab of currentWindow
		set URL of currentTab to ozonURL

		delay 5

		-- Скроллим страницу
		repeat maxScrolls times
			execute currentTab javascript "window.scrollBy(0, window.innerHeight);"
			delay 2
		end repeat

		-- Финальный сбор данных
		set finalJS to "
(function() {
    var products = [];
    var seen = {};
    var tiles = document.querySelectorAll('[data-index]');

    tiles.forEach(function(tile) {
        var link = tile.querySelector('a[href*=\"/product/\"]');
        if (!link) return;

        var match = link.href.match(/product\\\\/[^\\\\/]*-(\\\\d+)/);
        if (!match || seen[match[1]]) return;
        seen[match[1]] = true;

        var productId = match[1];
        var productUrl = link.href;

        // Собираем все тексты
        var allSpans = tile.querySelectorAll('span');
        var texts = [];
        for (var i = 0; i < allSpans.length; i++) {
            var t = allSpans[i].textContent.trim();
            if (t) texts.push(t);
        }

        // ЦЕНА - первый текст с ₽
        var price = '';
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].includes('₽') && texts[i].match(/\\\\d/)) {
                price = texts[i];
                break;
            }
        }

        // НАЗВАНИЕ - самый длинный текст (больше 20 символов)
        var title = '';
        var maxLen = 0;
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].length > maxLen &&
                texts[i].length > 20 &&
                !texts[i].includes('₽') &&
                !texts[i].includes('шт ') &&
                !texts[i].includes('%') &&
                !texts[i].includes('отзыв')) {
                title = texts[i];
                maxLen = texts[i].length;
            }
        }

        // РЕЙТИНГ - число от 0 до 5
        var rating = '';
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].match(/^[0-5]\\\\.[0-9]$/)) {
                rating = texts[i];
                break;
            }
        }

        // ОТЗЫВЫ - текст с \"отзыв\"
        var reviewsCount = '';
        for (var i = 0; i < texts.length; i++) {
            if (texts[i].includes('отзыв')) {
                // Извлекаем число
                var num = texts[i].match(/\\\\d+/);
                if (num) reviewsCount = num[0];
                break;
            }
        }

        // ДОСТАВКА - ищем текст с датой или \"завтра\"
        var deliveryDays = '';
        for (var i = 0; i < texts.length; i++) {
            var t = texts[i].toLowerCase();
            if (t.includes('завтра') ||
                t.includes('доставка') ||
                t.match(/\\\\d+\\\\s*(янв|фев|мар|апр|мая|июн|июл|авг|сен|окт|ноя|дек)/)) {
                deliveryDays = texts[i];
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

#!/bin/bash

# Ступень 3: Проверка товаров в магазинах
# Критерии: отзывы >=1, цена >300р, доставка >15 дней

INPUT_EXCEL="${1:-results/delivery_check_results.xlsx}"
OUTPUT_EXCEL="${2:-results/products_check_results.xlsx}"
MAX_SHOPS="${3:-5}"
MAX_PRODUCTS="${4:-5}"

echo "=== Ступень 3: Проверка товаров ==="
echo "Входной файл: $INPUT_EXCEL"
echo "Выходной файл: $OUTPUT_EXCEL"
echo "Макс магазинов: $MAX_SHOPS"
echo "Макс товаров: $MAX_PRODUCTS"
echo ""

random_sleep() {
    local min=${1:-1}
    local max=${2:-3}
    local delay=$(( (RANDOM % (max - min + 1)) + min ))
    sleep $delay
}

# Счетчик последовательных капч
CONSECUTIVE_CAPTCHAS=0
MAX_CONSECUTIVE_CAPTCHAS=3

# Функция проверки капчи
check_for_captcha() {
    # Проверяем URL в адресной строке
    local current_url=$(osascript -e 'tell application "Google Chrome" to get URL of active tab of window 1' 2>/dev/null)

    if [[ "$current_url" == *"captcha"* ]] || \
       [[ "$current_url" == *"blocked"* ]] || \
       [[ "$current_url" == *"access-denied"* ]] || \
       [[ "$current_url" == *"showcaptcha"* ]]; then
        CONSECUTIVE_CAPTCHAS=$((CONSECUTIVE_CAPTCHAS + 1))
        echo "    ⚠️  Обнаружена капча в URL! ($CONSECUTIVE_CAPTCHAS/$MAX_CONSECUTIVE_CAPTCHAS)"
        echo "    URL: $current_url"

        if [ $CONSECUTIVE_CAPTCHAS -ge $MAX_CONSECUTIVE_CAPTCHAS ]; then
            echo ""
            echo "❌ Обнаружено $MAX_CONSECUTIVE_CAPTCHAS капч подряд - останавливаю сбор"
            exit 1
        fi
        return 1
    fi

    # Проверяем текст на странице
    local page_text=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "document.body.textContent;"' 2>/dev/null | head -1)

    if [[ "$page_text" == *"Проверка"* ]] || \
       [[ "$page_text" == *"Подтвердите, что вы не робот"* ]] || \
       [[ "$page_text" == *"CAPTCHA"* ]] || \
       [[ "$page_text" == *"Доступ ограничен"* ]]; then
        CONSECUTIVE_CAPTCHAS=$((CONSECUTIVE_CAPTCHAS + 1))
        echo "    ⚠️  Обнаружена капча в тексте! ($CONSECUTIVE_CAPTCHAS/$MAX_CONSECUTIVE_CAPTCHAS)"

        if [ $CONSECUTIVE_CAPTCHAS -ge $MAX_CONSECUTIVE_CAPTCHAS ]; then
            echo ""
            echo "❌ Обнаружено $MAX_CONSECUTIVE_CAPTCHAS капч подряд - останавливаю сбор"
            exit 1
        fi
        return 1
    fi

    # Капчи нет - сбрасываем счетчик
    CONSECUTIVE_CAPTCHAS=0
    return 0
}

FIFTEEN_DAYS_DATE=$(date -v+15d +"%Y-%m-%d")
echo "Критерий доставки: > $FIFTEEN_DAYS_DATE"
echo ""

parse_date() {
    local text="$1"
    if [[ "$text" =~ ([0-9]+)[[:space:]]+(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек) ]]; then
        local day="${BASH_REMATCH[1]}"
        local month_str="${BASH_REMATCH[2]}"
        case "$month_str" in
            янв) month="01" ;; фев) month="02" ;; мар) month="03" ;;
            апр) month="04" ;; май) month="05" ;; июн) month="06" ;;
            июл) month="07" ;; авг) month="08" ;; сен) month="09" ;;
            окт) month="10" ;; ноя) month="11" ;; дек) month="12" ;;
            *) return 1 ;;
        esac
        local current_month=$(date +"%m")
        local year=$(date +"%Y")
        if [ "$month" -lt "$current_month" ]; then
            year=$((year + 1))
        fi
        printf "%04d-%02d-%02d" "$year" "$month" "$day"
        return 0
    fi
    return 1
}

export INPUT_EXCEL OUTPUT_EXCEL MAX_SHOPS MAX_PRODUCTS

python3 - <<'PYTHON_INIT'
import sys, os, subprocess

try:
    import openpyxl
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment
except ImportError:
    print("Устанавливаю openpyxl...")
    subprocess.run([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment

INPUT_EXCEL = os.environ['INPUT_EXCEL']
OUTPUT_EXCEL = os.environ['OUTPUT_EXCEL']
MAX_SHOPS = int(os.environ['MAX_SHOPS'])

if not os.path.exists(INPUT_EXCEL):
    print(f"Ошибка: не найден {INPUT_EXCEL}")
    sys.exit(1)

wb_input = load_workbook(INPUT_EXCEL)
ws_input = wb_input.active

good_shops = []
for row in range(2, ws_input.max_row + 1):
    url = ws_input.cell(row, 1).value
    status = ws_input.cell(row, 2).value
    if status == "срок более 15 дней":
        good_shops.append(url)

print(f"Найдено подходящих магазинов: {len(good_shops)}")

if MAX_SHOPS > 0:
    good_shops = good_shops[:MAX_SHOPS]
    print(f"Ограничено для теста: {len(good_shops)}")

excel_path = OUTPUT_EXCEL
os.makedirs(os.path.dirname(excel_path), exist_ok=True)

wb = Workbook()
ws = wb.active
ws.title = "Проверка товаров"

headers = [
    "URL магазина", "URL товара", "Название", "Цена (руб)",
    "Отзывов", "Доставка", "Минимальная цена товара", "Статус", "Дата проверки"
]

for col, header in enumerate(headers, 1):
    cell = ws.cell(1, col)
    cell.value = header
    cell.font = Font(bold=True, size=11, color="FFFFFF")
    cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
    cell.alignment = Alignment(horizontal="center")

ws.column_dimensions['A'].width = 50
ws.column_dimensions['B'].width = 50
ws.column_dimensions['C'].width = 60
ws.column_dimensions['D'].width = 15
ws.column_dimensions['E'].width = 12
ws.column_dimensions['F'].width = 20
ws.column_dimensions['G'].width = 20
ws.column_dimensions['H'].width = 20
ws.column_dimensions['I'].width = 20

wb.save(excel_path)
print(f"Создан Excel: {excel_path}")
print("")

with open('/tmp/shops_stage3.txt', 'w') as f:
    for url in good_shops:
        f.write(url + '\n')
PYTHON_INIT

if [ ! -f /tmp/shops_stage3.txt ]; then
    echo "Ошибка: не создан список магазинов"
    exit 1
fi

SHOP_COUNT=$(wc -l < /tmp/shops_stage3.txt | tr -d ' ')
if [ "$SHOP_COUNT" -eq 0 ]; then
    echo "Нет магазинов для проверки"
    exit 0
fi

echo "Начинаю проверку..."
echo ""

SHOP_NUM=0

while read SHOP_URL; do
    SHOP_NUM=$((SHOP_NUM + 1))
    echo "================================================"
    echo "Магазин $SHOP_NUM/$SHOP_COUNT"
    echo "$SHOP_URL"
    echo ""

    # Добавляем сортировку по рейтингу
    if [[ "$SHOP_URL" == *"?"* ]]; then
        SHOP_URL_SORTED="${SHOP_URL}&sorting=rating"
    else
        SHOP_URL_SORTED="${SHOP_URL}?sorting=rating"
    fi

    osascript -e "tell application \"Google Chrome\" to open location \"$SHOP_URL_SORTED\"" >/dev/null 2>&1
    random_sleep 3 5

    # Проверяем капчу
    check_for_captcha
    if [ $? -ne 0 ]; then
        echo "  ⏭️  Пропускаю магазин из-за капчи"
        continue
    fi

    echo "  Загружаю товары..."
    for ((i=1; i<=10; i++)); do
        osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
        sleep 1
    done
    sleep 3

    PRODUCTS_CHECKED=0
    echo "  Проверяю товары..."

    for ((idx=0; idx<50 && PRODUCTS_CHECKED<MAX_PRODUCTS; idx++)); do
        
        PRODUCT_JSON=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { 'NO_TILE'; } else {
    var result = {};
    var link = tile.querySelector('a[href*=\\\"/product/\\\"]');
    result.url = link ? link.href : '';

    // Парсим название товара из ссылки (более надежный способ)
    var title = '';

    // Способ 1: Атрибут title у ссылки
    if (link && link.getAttribute('title')) {
        title = link.getAttribute('title').trim();
    }

    // Способ 2: Текст внутри ссылки (если атрибута нет)
    if (!title && link) {
        var linkSpan = link.querySelector('span[class*=\\\"tsBody500Medium\\\"]');
        if (linkSpan) {
            title = linkSpan.textContent.trim();
        }
    }

    // Способ 3: Любой span внутри ссылки с текстом > 10 символов (фолбэк)
    if (!title && link) {
        var linkSpans = link.querySelectorAll('span');
        for (var i = 0; i < linkSpans.length; i++) {
            var t = linkSpans[i].textContent.trim();
            // Исключаем цены, остатки и служебную инфу
            if (t.length > 10 &&
                !t.match(/^[0-9\\s]+₽$/) &&
                !t.match(/шт осталось/) &&
                !t.match(/Стало дешевле/) &&
                !t.match(/^[0-9\\s]+$/) &&
                t.length > title.length) {
                title = t;
            }
        }
    }

    result.title = title || 'Название не найдено';
    var priceSpan = tile.querySelector('span[class*=\\\"tsHeadline500Medium\\\"]');
    result.price = priceSpan ? priceSpan.textContent.replace(/[^0-9]/g, '') : '0';
    result.reviews = '0';
    for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent.trim();
        if (t.match(/[0-9]+.*отзыв/)) {
            result.reviews = t.match(/^[0-9]+/)[0];
            break;
        }
    }
    var buttons = tile.querySelectorAll('button');
    result.delivery = '';
    for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent.trim();
        if (t.match(/[0-9]+\\\\s+(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/)) {
            result.delivery = t;
            break;
        }
    }
    JSON.stringify(result);
}
\"" 2>/dev/null | head -1)

        if [ "$PRODUCT_JSON" = "NO_TILE" ] || [ -z "$PRODUCT_JSON" ]; then
            break
        fi

        PRODUCT_URL=$(echo "$PRODUCT_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('url', ''))")
        PRODUCT_TITLE=$(echo "$PRODUCT_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('title', ''))")
        PRODUCT_PRICE=$(echo "$PRODUCT_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('price', '0'))")
        PRODUCT_REVIEWS=$(echo "$PRODUCT_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('reviews', '0'))")
        PRODUCT_DELIVERY=$(echo "$PRODUCT_JSON" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('delivery', ''))")

        if [ "$PRODUCT_REVIEWS" = "0" ] || [ -z "$PRODUCT_REVIEWS" ]; then
            continue
        fi

        if [ "$PRODUCT_PRICE" -le 200 ]; then
            continue
        fi

        if [ -z "$PRODUCT_DELIVERY" ]; then
            continue
        fi

        DELIVERY_DATE=$(parse_date "$PRODUCT_DELIVERY")
        if [ $? -ne 0 ]; then
            continue
        fi

        if ! [[ "$DELIVERY_DATE" > "$FIFTEEN_DAYS_DATE" ]]; then
            continue
        fi

        # Товар прошел базовые проверки - открываем карточку для проверки рейтинга
        echo "    Проверяю: ${PRODUCT_TITLE:0:40}..."

        osascript -e "tell application \"Google Chrome\" to open location \"$PRODUCT_URL\"" >/dev/null 2>&1
        sleep 3

        # Парсим рейтинг в карточке товара
        PRODUCT_RATING=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var spans = document.querySelectorAll(\"span\");
var rating = \"0\";
for (var i = 0; i < spans.length; i++) {
    var t = spans[i].textContent.trim();
    if (t.match(/[0-5]\\.[0-9]/)) {
        var match = t.match(/([0-5]\\.[0-9])/);
        if (match) {
            rating = match[1];
            break;
        }
    }
}
rating;
"' 2>/dev/null | head -1)

        # Проверяем рейтинг >= 4.0
        if [ -z "$PRODUCT_RATING" ] || [ "$PRODUCT_RATING" = "0" ]; then
            echo "      Пропуск: рейтинг не найден"
            osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
            continue
        fi

        RATING_CHECK=$(echo "$PRODUCT_RATING" | python3 -c "import sys; r=float(sys.stdin.read().strip() or '0'); print('ok' if r >= 4.0 else 'low')")
        if [ "$RATING_CHECK" = "low" ]; then
            echo "      Пропуск: рейтинг $PRODUCT_RATING < 4.0"
            osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
            continue
        fi

        # Проверяем модальное окно
        sleep 2
        MODAL_INFO=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var result = {modal: \"none\", price: \"0\"};
var allText = document.body.textContent;
if (allText.includes(\"есть дешевле и быстрее\")) {
    result.modal = \"дешевле и быстрее\";
} else if (allText.includes(\"есть дешевле\")) {
    result.modal = \"дешевле\";
} else if (allText.includes(\"есть быстрее\")) {
    result.modal = \"быстрее\";
}
if (result.modal === \"дешевле\" || result.modal === \"дешевле и быстрее\") {
    var priceSpans = document.querySelectorAll(\"span\");
    for (var i = 0; i < priceSpans.length; i++) {
        var text = priceSpans[i].textContent.trim();
        if (text.match(/^[0-9\\s]+₽$/)) {
            result.price = text.replace(/[^0-9]/g, \"\");
            break;
        }
    }
}
JSON.stringify(result);
"' 2>/dev/null | head -1)

        MODAL_TYPE=$(echo "$MODAL_INFO" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('modal', 'none'))")
        MIN_PRICE=$(echo "$MODAL_INFO" | python3 -c "import sys, json; d=json.loads(sys.stdin.read()); print(d.get('price', '0'))")

        # Закрываем карточку
        osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1

        # Применяем логику фильтрации
        if [ "$PRODUCT_REVIEWS" -le 10 ]; then
            # Отзывов <= 10 → модальное окно ОБЯЗАТЕЛЬНО
            if [ "$MODAL_TYPE" = "none" ]; then
                echo "      Пропуск: отзывов <= 10, но нет модального окна"
                continue
            fi
        fi

        # Товар подходит!
        PRODUCTS_CHECKED=$((PRODUCTS_CHECKED + 1))

        if [ "$MODAL_TYPE" != "none" ]; then
            echo "      ✓ [$PRODUCTS_CHECKED] $PRODUCT_PRICE руб | ⭐$PRODUCT_RATING | $PRODUCT_REVIEWS отз | Модальное: $MODAL_TYPE | Мин.цена: $MIN_PRICE руб"
        else
            echo "      ✓ [$PRODUCTS_CHECKED] $PRODUCT_PRICE руб | ⭐$PRODUCT_RATING | $PRODUCT_REVIEWS отз"
        fi

        export SHOP_URL PRODUCT_URL PRODUCT_TITLE PRODUCT_PRICE PRODUCT_REVIEWS PRODUCT_DELIVERY MIN_PRICE OUTPUT_EXCEL

        python3 - <<PYTHON_SAVE
import openpyxl
from openpyxl.styles import PatternFill
from datetime import datetime
import os

wb = openpyxl.load_workbook(os.environ['OUTPUT_EXCEL'])
ws = wb.active

row = ws.max_row + 1
ws.cell(row, 1).value = os.environ['SHOP_URL']
ws.cell(row, 2).value = os.environ['PRODUCT_URL']
ws.cell(row, 3).value = os.environ['PRODUCT_TITLE']
ws.cell(row, 4).value = int(os.environ['PRODUCT_PRICE'])
ws.cell(row, 5).value = int(os.environ['PRODUCT_REVIEWS'])
ws.cell(row, 6).value = os.environ['PRODUCT_DELIVERY']

min_price = os.environ.get('MIN_PRICE', '0')
if min_price and min_price != '0':
    ws.cell(row, 7).value = int(min_price)
else:
    ws.cell(row, 7).value = '-'

ws.cell(row, 8).value = 'интересный'
ws.cell(row, 9).value = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
ws.cell(row, 8).fill = fill

wb.save(os.environ['OUTPUT_EXCEL'])
PYTHON_SAVE

    done

    echo "  Проверено: $PRODUCTS_CHECKED товаров"
    echo ""

    osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
    sleep 1

done < /tmp/shops_stage3.txt

echo "================================================"
echo "ЗАВЕРШЕНО!"
echo ""
echo "Результаты: $OUTPUT_EXCEL"
echo ""

export OUTPUT_EXCEL
python3 - <<'PYTHON_STATS'
import openpyxl
import os

wb = openpyxl.load_workbook(os.environ['OUTPUT_EXCEL'])
ws = wb.active

total = ws.max_row - 1

print(f"Всего товаров найдено: {total}")
print(f"Все товары имеют статус 'интересный'")
PYTHON_STATS

rm -f /tmp/shops_stage3.txt

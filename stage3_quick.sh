#!/bin/bash

# Stage 3 Quick: Быстрое сканирование магазинов без захода в карточки товаров
# Парсит витрины магазинов, сохраняет товары с фото, определяет местные магазины

INPUT_JSON="${1:-results/sellers_combined_all_3500.json}"
OUTPUT_EXCEL="${2:-results/shops_quick_scan.xlsx}"
MAX_SHOPS="${3:-10}"
MAX_PRODUCTS_PER_SHOP="${4:-50}"

echo "=== Stage 3 Quick: Быстрое сканирование магазинов ==="
echo "Входной файл: $INPUT_JSON"
echo "Выходной файл: $OUTPUT_EXCEL"
echo "Макс магазинов: $MAX_SHOPS"
echo "Макс товаров на магазин: $MAX_PRODUCTS_PER_SHOP"
echo ""

# Обработка прерывания (Ctrl+C)
trap 'echo ""; echo "⚠️  Обработка прервана пользователем"; echo "💾 Все результаты сохранены в: $OUTPUT_EXCEL"; echo "▶️  При следующем запуске обработка продолжится с места остановки"; exit 130' SIGINT SIGTERM

# Проверяем и создаём окно Chrome если нужно
WINDOW_COUNT=$(osascript -e 'tell application "Google Chrome" to count windows' 2>/dev/null || echo "0")
if [ "$WINDOW_COUNT" -eq 0 ]; then
    echo "🌐 Открываю новое окно Chrome..."
    osascript <<APPLESCRIPT >/dev/null 2>&1
tell application "Google Chrome"
    activate
    make new window
    set URL of active tab of window 1 to "about:blank"
end tell
APPLESCRIPT
    sleep 2
    echo "✓ Окно Chrome открыто"
    echo ""
fi

# Закрываем все лишние вкладки (оставляем только 1)
TAB_COUNT=$(osascript -e 'tell application "Google Chrome" to count tabs of window 1' 2>/dev/null || echo "1")
if [ "$TAB_COUNT" -gt 1 ]; then
    echo "🧹 Закрываю $((TAB_COUNT - 1)) лишних вкладок..."
    osascript <<APPLESCRIPT >/dev/null 2>&1
tell application "Google Chrome"
    repeat while (count of tabs of window 1) > 1
        close tab 2 of window 1
    end repeat
end tell
APPLESCRIPT
    echo "✓ Оставлена 1 рабочая вкладка"
    echo ""
fi

# Функция случайной задержки
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
    # Сохраняем текущее активное приложение
    local front_app=$(osascript -e 'tell application "System Events" to return name of first process whose frontmost is true' 2>/dev/null)

    # Проверяем URL в адресной строке
    local current_url=$(osascript -e 'tell application "Google Chrome" to get URL of active tab of window 1' 2>/dev/null)

    # Возвращаем фокус
    if [ "$front_app" != "Google Chrome" ] && [ -n "$front_app" ]; then
        osascript -e "tell application \"$front_app\" to activate" >/dev/null 2>&1
    fi

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

    # Возвращаем фокус снова
    if [ "$front_app" != "Google Chrome" ] && [ -n "$front_app" ]; then
        osascript -e "tell application \"$front_app\" to activate" >/dev/null 2>&1
    fi

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

# Вычисляем дату "сегодня + 9 дней"
THIRTEEN_DAYS_DATE=$(date -v+9d +"%Y-%m-%d")
echo "Критерий доставки: > $THIRTEEN_DAYS_DATE (>9 дней)"
echo ""

# Функция для выполнения команды в Chrome без активации окна
run_chrome_silent() {
    local cmd="$1"

    # Сохраняем текущее активное приложение
    local front_app=$(osascript -e 'tell application "System Events" to return name of first process whose frontmost is true' 2>/dev/null)

    # Выполняем команду в Chrome
    eval "$cmd"

    # Возвращаем фокус обратно (если это не Chrome)
    if [ "$front_app" != "Google Chrome" ] && [ -n "$front_app" ]; then
        osascript -e "tell application \"$front_app\" to activate" >/dev/null 2>&1
    fi
}

# Функция парсинга даты
parse_date() {
    local text="$1"

    if [[ "$text" =~ ([0-9]+)[[:space:]]+(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек) ]]; then
        local day="${BASH_REMATCH[1]}"
        local month_str="${BASH_REMATCH[2]}"

        case "$month_str" in
            янв) month="01" ;;
            фев) month="02" ;;
            мар) month="03" ;;
            апр) month="04" ;;
            май) month="05" ;;
            июн) month="06" ;;
            июл) month="07" ;;
            авг) month="08" ;;
            сен) month="09" ;;
            окт) month="10" ;;
            ноя) month="11" ;;
            дек) month="12" ;;
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

# Инициализация Excel файла
python3 <<PYTHON_INIT
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
import os

output_file = '$OUTPUT_EXCEL'

# Проверяем, существует ли файл
if os.path.exists(output_file):
    print(f"📂 Файл {output_file} существует, будем дополнять")
    wb = openpyxl.load_workbook(output_file)
else:
    print(f"📝 Создаю новый файл {output_file}")
    wb = openpyxl.Workbook()

    # Лист 1: Магазины
    if 'Sheet' in wb.sheetnames:
        ws_shops = wb['Sheet']
        ws_shops.title = 'Магазины'
    else:
        ws_shops = wb.create_sheet('Магазины', 0)

    # Заголовки для магазинов
    headers_shops = [
        'URL магазина', 'Проверено товаров', 'Прошло фильтры',
        'Товаров с доставкой < 13 дней', '% быстрой доставки',
        'Статус', 'Дата проверки'
    ]

    for col, header in enumerate(headers_shops, 1):
        cell = ws_shops.cell(1, col, header)
        cell.font = Font(bold=True, size=12, color='FFFFFF')
        cell.fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
        cell.alignment = Alignment(horizontal='center', vertical='center')

    # Ширина колонок
    ws_shops.column_dimensions['A'].width = 50
    ws_shops.column_dimensions['B'].width = 18
    ws_shops.column_dimensions['C'].width = 15
    ws_shops.column_dimensions['D'].width = 25
    ws_shops.column_dimensions['E'].width = 20
    ws_shops.column_dimensions['F'].width = 20
    ws_shops.column_dimensions['G'].width = 20

    # Лист 2: Товары
    ws_products = wb.create_sheet('Товары', 1)

    headers_products = [
        'Фото', 'Название', 'Цена (руб)', 'Отзывов',
        'Доставка', 'URL товара', 'URL магазина'
    ]

    for col, header in enumerate(headers_products, 1):
        cell = ws_products.cell(1, col, header)
        cell.font = Font(bold=True, size=12, color='FFFFFF')
        cell.fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
        cell.alignment = Alignment(horizontal='center', vertical='center')

    # Ширина колонок
    ws_products.column_dimensions['A'].width = 15  # Фото
    ws_products.column_dimensions['B'].width = 60  # Название
    ws_products.column_dimensions['C'].width = 12  # Цена
    ws_products.column_dimensions['D'].width = 10  # Отзывов
    ws_products.column_dimensions['E'].width = 15  # Доставка
    ws_products.column_dimensions['F'].width = 50  # URL товара
    ws_products.column_dimensions['G'].width = 50  # URL магазина

    # Высота строк для фото (100px примерно = 75 points)
    ws_products.row_dimensions[1].height = 20

wb.save(output_file)
print(f"✅ Excel файл инициализирован")
PYTHON_INIT

# Получаем список уже обработанных магазинов
PROCESSED_SHOPS=$(python3 <<PYTHON_PROCESSED
import openpyxl
import os
import json

output_file = '$OUTPUT_EXCEL'
processed = []

if os.path.exists(output_file):
    wb = openpyxl.load_workbook(output_file)
    ws = wb['Магазины']

    for row in range(2, ws.max_row + 1):
        shop_url = ws.cell(row, 1).value
        if shop_url:
            processed.append(shop_url)

print(json.dumps(processed))
PYTHON_PROCESSED
)

echo "📋 Уже обработано магазинов: $(echo "$PROCESSED_SHOPS" | python3 -c "import sys, json; print(len(json.loads(sys.stdin.read())))")"
echo ""

# Читаем магазины из входного файла
SHOPS_COUNT=0

python3 <<PYTHON_PROCESS
import json
import os

input_file = '$INPUT_JSON'
processed_shops = $PROCESSED_SHOPS
max_shops = $MAX_SHOPS

with open(input_file, 'r', encoding='utf-8') as f:
    data = json.load(f)
    sellers = data.get('sellers', [])

# Фильтруем необработанные
unprocessed = []
for seller in sellers:
    url = seller.get('url', '')
    if url and url not in processed_shops:
        unprocessed.append(url)

# Берем первые max_shops
to_process = unprocessed[:max_shops]

# Сохраняем в временный файл для bash
with open('/tmp/shops_to_process.txt', 'w', encoding='utf-8') as f:
    for url in to_process:
        f.write(url + '\\n')

print(f"📊 Всего магазинов: {len(sellers)}")
print(f"🔄 Необработанных: {len(unprocessed)}")
print(f"✅ Будет обработано: {len(to_process)}")
PYTHON_PROCESS

# Читаем магазины для обработки
SHOPS_TO_PROCESS=$(cat /tmp/shops_to_process.txt)
TOTAL_SHOPS=$(echo "$SHOPS_TO_PROCESS" | wc -l | tr -d ' ')

if [ -z "$SHOPS_TO_PROCESS" ] || [ "$TOTAL_SHOPS" -eq 0 ]; then
    echo "✅ Все магазины уже обработаны!"
    exit 0
fi

echo ""
echo "🚀 Начинаю обработку..."
echo ""

SHOP_NUM=0

while IFS= read -r SHOP_URL; do
    [ -z "$SHOP_URL" ] && continue

    SHOP_NUM=$((SHOP_NUM + 1))
    echo "🏪 Магазин $SHOP_NUM/$TOTAL_SHOPS"
    echo "   $SHOP_URL"

    # Добавляем сортировку по рейтингу
    if [[ "$SHOP_URL" == *"?"* ]]; then
        SHOP_URL_SORTED="${SHOP_URL}&sorting=rating"
    else
        SHOP_URL_SORTED="${SHOP_URL}?sorting=rating"
    fi

    # Открываем витрину магазина (в текущей вкладке, без активации окна)
    run_chrome_silent "osascript -e \"tell application \\\"Google Chrome\\\" to set URL of active tab of window 1 to \\\"$SHOP_URL_SORTED\\\"\" >/dev/null 2>&1"
    random_sleep 3 5

    # Проверяем капчу
    check_for_captcha
    if [ $? -ne 0 ]; then
        echo "  ⏭️  Пропускаю магазин из-за капчи"
        continue
    fi

    # Создаем временный файл для товаров этого магазина
    TEMP_PRODUCTS="/tmp/products_${SHOP_NUM}.json"
    echo "[]" > "$TEMP_PRODUCTS"

    # Проверяем товары партиями по 10 (максимум 100)
    echo "  📜 Проверяю товары партиями по 10..."
    TOTAL_PRODUCTS_CHECKED=0
    CONTINUE_CHECKING=true
    BATCH_NUM=0

    while [ "$CONTINUE_CHECKING" = true ] && [ $BATCH_NUM -lt 10 ]; do
        BATCH_NUM=$((BATCH_NUM + 1))

        # Скроллим для загрузки следующей партии (без активации окна)
        for ((i=1; i<=2; i++)); do
            run_chrome_silent "osascript -e 'tell application \"Google Chrome\" to execute active tab of window 1 javascript \"window.scrollBy(0, window.innerHeight);\"' >/dev/null 2>&1"
            sleep 1
        done
        sleep 2

        # Передаем индексы через window объект
        START_IDX=$TOTAL_PRODUCTS_CHECKED
        END_IDX=$((TOTAL_PRODUCTS_CHECKED + 10))

        run_chrome_silent "osascript -e \"tell application \\\"Google Chrome\\\" to execute active tab of window 1 javascript \\\"window.batchStart = $START_IDX; window.batchEnd = $END_IDX;\\\"\" >/dev/null 2>&1"

        # Создаем JavaScript файл для парсинга партии из 10 товаров (используем window переменные)
        cat > /tmp/parse_products_batch.js <<'JSEOF'
var products = [];
var startIdx = window.batchStart || 0;
var endIdx = window.batchEnd || 10;

for (var idx = startIdx; idx < endIdx; idx++) {
    var tiles = document.querySelectorAll('[data-index]');
    var tile = null;
    for (var z = 0; z < tiles.length; z++) {
        if (tiles[z].getAttribute('data-index') == idx) {
            tile = tiles[z];
            break;
        }
    }
    if (!tile) break;

    var product = {};

    // URL товара (находим ссылку с /product/ в href)
    var link = null;
    var allLinks = tile.querySelectorAll('a');
    for (var k = 0; k < allLinks.length; k++) {
        if (allLinks[k].href && allLinks[k].href.indexOf('/product/') >= 0) {
            link = allLinks[k];
            break;
        }
    }
    product.url = link ? link.href : '';

    // Фото (главное изображение)
    var img = tile.querySelector('img');
    product.photo = img ? img.src : '';

    // Название товара
    var title = '';

    // Способ 1: Атрибут title у ссылки
    if (link && link.getAttribute('title')) {
        title = link.getAttribute('title').trim();
    }

    // Способ 2: Ищем span с классом tsBody500Medium во всем tile (не только в link!)
    if (!title) {
        var allSpans = tile.querySelectorAll('span');
        for (var j = 0; j < allSpans.length; j++) {
            if (allSpans[j].className && allSpans[j].className.indexOf('tsBody500Medium') >= 0) {
                var t = allSpans[j].textContent.trim();
                // Исключаем цены (без $ в regex из-за bash)
                var isPricePattern = /^[0-9\\s]+₽/.test(t) && t.indexOf('₽') === t.length - 1;
                if (t.length > 10 && !isPricePattern) {
                    title = t;
                    break;
                }
            }
        }
    }

    product.title = title || 'Название не найдено';

    // Цена (ищем span с классом tsHeadline500Medium)
    var priceSpan = null;
    var allPriceSpans = tile.querySelectorAll('span');
    for (var m = 0; m < allPriceSpans.length; m++) {
        if (allPriceSpans[m].className && allPriceSpans[m].className.indexOf('tsHeadline500Medium') >= 0) {
            priceSpan = allPriceSpans[m];
            break;
        }
    }
    product.price = priceSpan ? priceSpan.textContent.replace(/[^0-9]/g, '') : '0';

    // Отзывы
    var spans = tile.querySelectorAll('span');
    product.reviews = '0';
    for (var i = 0; i < spans.length; i++) {
        var t = spans[i].textContent.trim();
        if (t.match(/^[0-9]+.*отзыв/)) {
            var num = parseInt(t.match(/^[0-9]+/)[0]);
            product.reviews = num.toString();
            break;
        }
    }

    // Доставка
    var buttons = tile.querySelectorAll('button');
    product.delivery = '';
    for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent.trim();
        // Ищем полные формы месяцев или "завтра" (используем \s+ без экранирования в heredoc)
        if (t.match(/[0-9]+\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i) ||
            t.match(/завтра/i)) {
            product.delivery = t;
            break;
        }
    }

    products.push(product);
}

JSON.stringify(products);
JSEOF

        # Выполняем JavaScript для парсинга партии (без активации окна)
        # Сохраняем текущее активное приложение
        FRONT_APP=$(osascript -e 'tell application "System Events" to return name of first process whose frontmost is true' 2>/dev/null)

        BATCH_DATA=$(osascript <<APPLESCRIPT 2>/dev/null
tell application "Google Chrome"
    set jsCode to do shell script "cat /tmp/parse_products_batch.js"
    execute active tab of window 1 javascript jsCode
end tell
APPLESCRIPT
)

        # Возвращаем фокус обратно
        if [ "$FRONT_APP" != "Google Chrome" ] && [ -n "$FRONT_APP" ]; then
            osascript -e "tell application \"$FRONT_APP\" to activate" >/dev/null 2>&1
        fi


        # Проверяем есть ли товары с отзывами в этой партии
        HAS_REVIEWS=$(echo "$BATCH_DATA" | python3 -c "
import sys, json
try:
    products = json.loads(sys.stdin.read())
    has_reviews = any(int(p.get('reviews', 0)) >= 1 for p in products)
    print('yes' if has_reviews else 'no')
except:
    print('no')
")

        # Добавляем товары из партии к общему списку (используем pipes для кириллицы)
        echo "$BATCH_DATA" | python3 -c "
import json, sys

try:
    with open('$TEMP_PRODUCTS', 'r', encoding='utf-8') as f:
        all_products = json.load(f)

    batch_data = sys.stdin.read().strip()
    if not batch_data:
        batch_products = []
    else:
        batch_products = json.loads(batch_data)

    all_products.extend(batch_products)
    with open('$TEMP_PRODUCTS', 'w', encoding='utf-8') as f:
        json.dump(all_products, f, ensure_ascii=False)
except Exception as e:
    print(f'    ⚠️  Ошибка обработки партии: {e}', file=sys.stderr)
    sys.exit(1)
"

        TOTAL_PRODUCTS_CHECKED=$((TOTAL_PRODUCTS_CHECKED + 10))

        echo "    Партия $BATCH_NUM: проверено $TOTAL_PRODUCTS_CHECKED товаров (отзывы: $HAS_REVIEWS)"

        # Если в партии нет товаров с отзывами - останавливаемся
        if [ "$HAS_REVIEWS" = "no" ]; then
            echo "    ⏹️  Партия без отзывов - останавливаю проверку"
            CONTINUE_CHECKING=false
        fi
    done

    echo "  🔍 Итого проверено: $TOTAL_PRODUCTS_CHECKED товаров"

    # Обрабатываем товары и сохраняем в Excel
    export SHOP_URL TEMP_PRODUCTS OUTPUT_EXCEL THIRTEEN_DAYS_DATE TOTAL_PRODUCTS_CHECKED

    python3 - <<'PYTHON_SAVE'
import json
import os
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.drawing.image import Image as ExcelImage
import urllib.request
from PIL import Image
import io

shop_url = os.environ['SHOP_URL']

# Добавляем параметр сортировки по рейтингу для удобства открытия
if '?' in shop_url:
    shop_url_with_sorting = shop_url + '&sorting=rating'
else:
    shop_url_with_sorting = shop_url + '?sorting=rating'

temp_file = os.environ['TEMP_PRODUCTS']
output_file = os.environ['OUTPUT_EXCEL']
thirteen_days_date = os.environ['THIRTEEN_DAYS_DATE']
total_checked = int(os.environ.get('TOTAL_PRODUCTS_CHECKED', 0))

# Функция парсинга даты
def parse_date(text):
    import re
    from datetime import datetime, timedelta

    if not text or text == '-':
        return None

    # Обработка "завтра"
    if 'завтра' in text.lower():
        tomorrow = datetime.now() + timedelta(days=1)
        return f"{tomorrow.year:04d}-{tomorrow.month:02d}-{tomorrow.day:02d}"

    # Карта полных форм месяцев
    month_map = {
        'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4,
        'мая': 5, 'июня': 6, 'июля': 7, 'августа': 8,
        'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
    }

    # Ищем паттерн "число месяц" (полная форма)
    match = re.search(r'(\d+)\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)', text.lower())
    if not match:
        return None

    day = int(match.group(1))
    month = month_map[match.group(2)]

    current_month = datetime.now().month
    year = datetime.now().year

    if month < current_month:
        year += 1

    return f"{year:04d}-{month:02d}-{day:02d}"

# Функция скачивания и обработки фото
def download_and_resize_image(url, size=(100, 100)):
    try:
        # Скачиваем изображение
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            img_data = response.read()

        # Открываем с помощью PIL
        img = Image.open(io.BytesIO(img_data))

        # Конвертируем в RGB если нужно
        if img.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background

        # Ресайз с сохранением пропорций
        img.thumbnail(size, Image.Resampling.LANCZOS)

        # Сохраняем в bytes
        output = io.BytesIO()
        img.save(output, format='JPEG', quality=85, optimize=True)
        output.seek(0)

        return output
    except Exception as e:
        print(f"    ⚠️  Ошибка загрузки фото: {e}")
        return None

# Загружаем товары
with open(temp_file, 'r', encoding='utf-8') as f:
    products = json.loads(f.read())

# DEBUG: выводим первые 3 товара
print(f"\n  🐛 DEBUG: Первые 3 товара из {len(products)}:")
for i, p in enumerate(products[:3], 1):
    print(f"    {i}. {p.get('title', 'N/A')[:40]}...")
    print(f"       reviews={p.get('reviews', 0)}, price={p.get('price', 0)}, delivery=\"{p.get('delivery', '')}\"")

# Фильтруем товары
failed_products_debug = []
filtered_products = []
fast_delivery_count = 0
no_delivery_count = 0
slow_delivery_count = 0
failed_reviews = 0
failed_price = 0
failed_delivery = 0

for product in products:

    # Парсим дату доставки для проверки "местного магазина"
    delivery_date = None
    if product['delivery']:
        delivery_date = parse_date(product['delivery'])

    # Статистика по доставке
    if not delivery_date:
        no_delivery_count += 1
    elif delivery_date < thirteen_days_date:
        fast_delivery_count += 1
    else:
        slow_delivery_count += 1

    # Применяем фильтры для сохранения
    reviews = int(product.get('reviews', 0))
    price = int(product.get('price', 0))

    if reviews < 1:
        failed_reviews += 1
        failed_products_debug.append((product, 'отзывы < 1'))
        continue
    if price <= 200:
        failed_price += 1
        failed_products_debug.append((product, f'цена <= 200 (найдено: {price})'))
        continue
    if not delivery_date or delivery_date <= thirteen_days_date:
        failed_delivery += 1
        reason = 'нет даты' if not delivery_date else f'доставка <= 11 дней ({product.get("delivery", "")})'
        failed_products_debug.append((product, reason))
        continue

    filtered_products.append(product)

# Определяем статус магазина
percent_fast = (fast_delivery_count / total_checked * 100) if total_checked > 0 else 0
status = 'местный магазин' if percent_fast > 50 else 'интересный'

print(f"  ✅ Проверено: {total_checked} товаров")
print(f"  📦 Доставка: быстрая={fast_delivery_count}, медленная={slow_delivery_count}, нет={no_delivery_count}")
print(f"  ❌ Не прошли: отзывы={failed_reviews}, цена={failed_price}, доставка={failed_delivery}")
print(f"  ⭐ Прошло фильтры: {len(filtered_products)} товаров")

# DEBUG: выводим примеры отклоненных товаров
if failed_products_debug:
    print(f"\n  🐛 DEBUG: Примеры отклоненных товаров (первые 5):")
    for i, (p, reason) in enumerate(failed_products_debug[:5], 1):
        print(f"    {i}. {p.get('title', 'N/A')[:35]}...")
        print(f"       Причина: {reason}")
        print(f"       reviews={p.get('reviews', 0)}, price={p.get('price', 0)}, delivery=\"{p.get('delivery', '')}\"")

print(f"  🏷️  Статус: {status}")

# Загружаем Excel
wb = openpyxl.load_workbook(output_file)
ws_shops = wb['Магазины']
ws_products = wb['Товары']

# Добавляем магазин (новая структура v2)
row_shop = ws_shops.max_row + 1
ws_shops.cell(row_shop, 1, shop_url_with_sorting)          # URL магазина
ws_shops.cell(row_shop, 2, total_checked)                  # Проверено товаров
ws_shops.cell(row_shop, 3, len(filtered_products))         # Прошло фильтры
ws_shops.cell(row_shop, 4, failed_reviews)                 # Не прошло: отзывы
ws_shops.cell(row_shop, 5, failed_price)                   # Не прошло: цена
ws_shops.cell(row_shop, 6, failed_delivery)                # Не прошло: доставка
ws_shops.cell(row_shop, 7, status)                         # Статус
ws_shops.cell(row_shop, 8, datetime.now().strftime('%Y-%m-%d %H:%M:%S'))  # Дата

# Выравнивание
for col in range(2, 9):
    ws_shops.cell(row_shop, col).alignment = Alignment(horizontal='center')

# Цвет статуса (колонка 7 теперь)
if status == 'местный магазин':
    ws_shops.cell(row_shop, 7).fill = PatternFill(start_color='FFC7CE', end_color='FFC7CE', fill_type='solid')
else:
    ws_shops.cell(row_shop, 7).fill = PatternFill(start_color='C6EFCE', end_color='C6EFCE', fill_type='solid')

# Добавляем товары
for product in filtered_products:
    row_prod = ws_products.max_row + 1

    # Устанавливаем высоту строки для фото
    ws_products.row_dimensions[row_prod].height = 75

    # Скачиваем и вставляем фото
    if product['photo']:
        img_data = download_and_resize_image(product['photo'])
        if img_data:
            try:
                excel_img = ExcelImage(img_data)
                excel_img.width = 100
                excel_img.height = 100
                cell_ref = f'A{row_prod}'
                ws_products.add_image(excel_img, cell_ref)
            except Exception as e:
                print(f"    ⚠️  Ошибка вставки фото: {e}")

    # Заполняем данные
    ws_products.cell(row_prod, 2, product['title'])
    ws_products.cell(row_prod, 3, int(product['price']))
    ws_products.cell(row_prod, 4, int(product['reviews']))
    ws_products.cell(row_prod, 5, product['delivery'])
    ws_products.cell(row_prod, 6, product['url'])
    ws_products.cell(row_prod, 7, shop_url_with_sorting)

    # Выравнивание
    ws_products.cell(row_prod, 3).alignment = Alignment(horizontal='right')
    ws_products.cell(row_prod, 4).alignment = Alignment(horizontal='center')
    ws_products.cell(row_prod, 5).alignment = Alignment(horizontal='center')

# Сохраняем
wb.save(output_file)
print(f"  💾 Сохранено в Excel")
PYTHON_SAVE

    # Удаляем временный файл
    rm -f "$TEMP_PRODUCTS"

    echo ""
done <<< "$SHOPS_TO_PROCESS"

echo ""
echo "✅ Обработка завершена!"
echo "📊 Результаты сохранены в: $OUTPUT_EXCEL"
echo ""

# Показываем итоговую статистику
python3 <<PYTHON_STATS
import openpyxl

wb = openpyxl.load_workbook('$OUTPUT_EXCEL')
ws_shops = wb['Магазины']
ws_products = wb['Товары']

total_shops = ws_shops.max_row - 1
local_shops = 0
interesting_shops = 0

for row in range(2, ws_shops.max_row + 1):
    status = ws_shops.cell(row, 5).value
    if status == 'местный магазин':
        local_shops += 1
    elif status == 'интересный':
        interesting_shops += 1

total_products = ws_products.max_row - 1

print("📊 Итоговая статистика:")
print(f"   Всего магазинов: {total_shops}")
print(f"   Местных магазинов: {local_shops}")
print(f"   Интересных магазинов: {interesting_shops}")
print(f"   Всего товаров: {total_products}")
PYTHON_STATS

# Очистка
rm -f /tmp/shops_to_process.txt

# Закрываем вкладку, если открыто больше одной
TAB_COUNT=$(osascript -e 'tell application "Google Chrome" to count tabs of window 1' 2>/dev/null || echo "1")
if [ "$TAB_COUNT" -gt 1 ]; then
    echo ""
    echo "🧹 Закрываю рабочую вкладку (открыто вкладок: $TAB_COUNT)..."
    osascript -e 'tell application "Google Chrome" to close active tab of window 1' 2>/dev/null
fi

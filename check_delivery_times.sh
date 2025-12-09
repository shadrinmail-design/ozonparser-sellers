#!/bin/bash

# Вторая ступень парсера: проверка сроков доставки магазинов
# Проверяет первые 20 карточек каждого магазина
# Критерий: >= 3 карточки с доставкой > 15 дней

INPUT_JSON="${1:-results/sellers_combined_500.json}"
OUTPUT_EXCEL="${2:-results/delivery_check_results.xlsx}"
MAX_SHOPS="${3:-10}"  # Для тестирования, потом можно убрать

echo "🔍 Вторая ступень: проверка сроков доставки"
echo "Входной файл: $INPUT_JSON"
echo "Выходной файл: $OUTPUT_EXCEL"
echo "Проверяем магазинов: $MAX_SHOPS"
echo ""

# Функция случайной задержки
random_sleep() {
    local min=${1:-1}
    local max=${2:-3}
    local delay=$(( (RANDOM % (max - min + 1)) + min ))
    sleep $delay
}

# Вычисляем дату "сегодня + 15 дней"
FIFTEEN_DAYS_DATE=$(date -v+15d +"%Y-%m-%d")
echo "Критерий: доставка позже $FIFTEEN_DAYS_DATE (>15 дней)"
echo ""

# Функция для парсинга даты
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

# Запускаем Python скрипт для проверки магазинов
python3 <<PYTHON
import json
import os
import sys
from datetime import datetime
import subprocess

# Устанавливаем openpyxl если не установлен
try:
    import openpyxl
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment
except ImportError:
    print("📦 Устанавливаю openpyxl...")
    subprocess.run([sys.executable, "-m", "pip", "install", "openpyxl", "-q"])
    import openpyxl
    from openpyxl import Workbook, load_workbook
    from openpyxl.styles import Font, PatternFill, Alignment

# Читаем входной JSON
with open('$INPUT_JSON', 'r', encoding='utf-8') as f:
    data = json.load(f)
    sellers = data.get('sellers', [])

print(f"📋 Загружено магазинов из JSON: {len(sellers)}")

# Создаем или загружаем Excel файл
excel_path = '$OUTPUT_EXCEL'
os.makedirs(os.path.dirname(excel_path), exist_ok=True)

if os.path.exists(excel_path):
    print(f"📂 Найден существующий файл: {excel_path}")
    print(f"   Продолжаю с места остановки...")
    wb = load_workbook(excel_path)
    ws = wb.active

    # Собираем уже проверенные магазины
    checked_urls = set()
    for row in range(2, ws.max_row + 1):
        url = ws.cell(row, 1).value
        status = ws.cell(row, 2).value
        if status and status != "не проверен":
            checked_urls.add(url)

    print(f"   Уже проверено: {len(checked_urls)} магазинов")
else:
    print(f"📝 Создаю новый файл: {excel_path}")
    wb = Workbook()
    ws = wb.active
    ws.title = "Проверка доставки"

    # Заголовки
    headers = ["URL магазина", "Статус", "Карточек с длинной доставкой", "Дата проверки"]
    for col, header in enumerate(headers, 1):
        cell = ws.cell(1, col)
        cell.value = header
        cell.font = Font(bold=True, size=12)
        cell.fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        cell.font = Font(bold=True, color="FFFFFF")
        cell.alignment = Alignment(horizontal="center")

    # Устанавливаем ширину колонок
    ws.column_dimensions['A'].width = 60
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 30
    ws.column_dimensions['D'].width = 20

    # Добавляем все магазины со статусом "не проверен"
    for idx, seller in enumerate(sellers, 2):
        ws.cell(idx, 1).value = seller['url']
        ws.cell(idx, 2).value = "не проверен"
        ws.cell(idx, 3).value = ""
        ws.cell(idx, 4).value = ""

    checked_urls = set()
    wb.save(excel_path)
    print(f"   Создан файл с {len(sellers)} магазинами")

print("")
print("✅ Excel файл готов к работе")
print("")

# Сохраняем информацию о магазинах для bash скрипта
unchecked = []
for seller in sellers:
    if seller['url'] not in checked_urls:
        unchecked.append(seller['url'])

# Ограничиваем количество для проверки
max_shops = int('$MAX_SHOPS')
if max_shops > 0:
    unchecked = unchecked[:max_shops]

print(f"🔄 К проверке: {len(unchecked)} магазинов")
print("")

# Сохраняем список для bash
with open('/tmp/shops_to_check.txt', 'w') as f:
    for url in unchecked:
        f.write(url + '\\n')

print(f"Список сохранен в /tmp/shops_to_check.txt")
PYTHON

# Читаем список магазинов для проверки
if [ ! -f /tmp/shops_to_check.txt ]; then
    echo "❌ Не найден список магазинов для проверки"
    exit 1
fi

SHOP_COUNT=$(wc -l < /tmp/shops_to_check.txt | tr -d ' ')

if [ "$SHOP_COUNT" -eq 0 ]; then
    echo "✅ Все магазины уже проверены!"
    exit 0
fi

echo ""
echo "🚀 Начинаю проверку магазинов..."
echo ""

SHOP_NUM=0

# Проверяем каждый магазин
while read SHOP_URL; do
    SHOP_NUM=$((SHOP_NUM + 1))
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🏪 Магазин $SHOP_NUM/$SHOP_COUNT"
    echo "   $SHOP_URL"
    echo ""

    # Открываем страницу магазина
    osascript -e "tell application \"Google Chrome\" to open location \"$SHOP_URL\"" >/dev/null 2>&1
    random_sleep 3 5

    # Прокручиваем страницу для загрузки карточек
    echo "   📜 Загружаю карточки..."
    for ((scroll=1; scroll<=10; scroll++)); do
        osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
        random_sleep 1 2
    done

    # Ждем загрузки (увеличено до 5 секунд для полной загрузки карточек)
    sleep 5

    # Проверяем первые 20 карточек
    LONG_DELIVERY_COUNT=0
    CHECKED_CARDS=0

    echo "   🔍 Проверяю карточки..."

    for ((card_idx=0; card_idx<20; card_idx++)); do
        # Получаем дату доставки
        DELIVERY_TEXT=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$card_idx\\\"]');
if (!tile) { ''; } else {
    var buttons = tile.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
        var t = buttons[i].textContent.trim();
        if (t.match(/[0-9]+\\\\s+(янв|фев|мар|апр|май|июн|июл|авг|сен|окт|ноя|дек)/)) {
            t;
            break;
        }
    }
}
\"" 2>/dev/null | head -1)

        if [ -z "$DELIVERY_TEXT" ] || [ "$DELIVERY_TEXT" = "missing value" ]; then
            continue
        fi

        CHECKED_CARDS=$((CHECKED_CARDS + 1))

        # Парсим дату
        DELIVERY_DATE=$(parse_date "$DELIVERY_TEXT")

        if [ $? -eq 0 ]; then
            # Сравниваем даты
            if [[ "$DELIVERY_DATE" > "$FIFTEEN_DAYS_DATE" ]]; then
                LONG_DELIVERY_COUNT=$((LONG_DELIVERY_COUNT + 1))
                echo -ne "\r   📦 Проверено карточек: $CHECKED_CARDS/20 | Длинная доставка: $LONG_DELIVERY_COUNT    "
            else
                echo -ne "\r   📦 Проверено карточек: $CHECKED_CARDS/20 | Длинная доставка: $LONG_DELIVERY_COUNT    "
            fi
        fi
    done

    echo ""

    # Определяем статус магазина
    if [ $LONG_DELIVERY_COUNT -ge 3 ]; then
        STATUS="срок более 15 дней"
        echo "   ✅ Результат: $STATUS (найдено $LONG_DELIVERY_COUNT карточек)"
    else
        STATUS="срок до 15 дней"
        echo "   ⚠️  Результат: $STATUS (найдено только $LONG_DELIVERY_COUNT карточек)"
    fi

    # Обновляем Excel файл
    python3 <<PYTHON
import openpyxl
from openpyxl.styles import PatternFill
from datetime import datetime

wb = openpyxl.load_workbook('$OUTPUT_EXCEL')
ws = wb.active

# Ищем строку с этим магазином
for row in range(2, ws.max_row + 1):
    if ws.cell(row, 1).value == '$SHOP_URL':
        ws.cell(row, 2).value = '$STATUS'
        ws.cell(row, 3).value = $LONG_DELIVERY_COUNT
        ws.cell(row, 4).value = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Цветовая маркировка
        if '$STATUS' == 'срок более 15 дней':
            fill = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
        else:
            fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")

        ws.cell(row, 2).fill = fill
        break

wb.save('$OUTPUT_EXCEL')
PYTHON

    echo ""

    # Закрываем вкладку
    osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
    random_sleep 1 2

done < /tmp/shops_to_check.txt

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Проверка завершена!"
echo ""
echo "📊 Результаты сохранены в:"
echo "   $OUTPUT_EXCEL"
echo ""

# Показываем статистику
python3 <<PYTHON
import openpyxl

wb = openpyxl.load_workbook('$OUTPUT_EXCEL')
ws = wb.active

total = 0
checked = 0
long_delivery = 0
short_delivery = 0

for row in range(2, ws.max_row + 1):
    total += 1
    status = ws.cell(row, 2).value
    if status and status != "не проверен":
        checked += 1
        if status == "срок более 15 дней":
            long_delivery += 1
        else:
            short_delivery += 1

print("📈 СТАТИСТИКА:")
print(f"   Всего магазинов: {total}")
print(f"   Проверено: {checked}")
print(f"   ✅ Срок более 15 дней: {long_delivery}")
print(f"   ⚠️  Срок до 15 дней: {short_delivery}")
print(f"   ⏳ Не проверено: {total - checked}")
PYTHON

rm -f /tmp/shops_to_check.txt

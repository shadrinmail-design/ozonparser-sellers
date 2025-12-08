#!/bin/bash

# Финальная версия v3: кнопка "Еще" + небольшие случайные задержки

MAX_SELLERS="${1:-10}"
MAX_MORE_CLICKS="${2:-5}"  # Максимум кликов на "Еще"

echo "🚀 Сбор продавцов Ozon Global (финальная версия)"
echo "Цель: $MAX_SELLERS продавцов"
echo "Максимум кликов 'Еще': $MAX_MORE_CLICKS"
echo ""

# Функция случайной задержки
random_sleep() {
    local min=${1:-1}
    local max=${2:-3}
    local delay=$(( (RANDOM % (max - min + 1)) + min ))
    sleep $delay
}

# Вычисляем дату "сегодня + 21 день"
THREE_WEEKS_DATE=$(date -v+21d +"%Y-%m-%d")
echo "Фильтр: доставка позже $THREE_WEEKS_DATE"
echo ""

# Открываем страницу
echo "⏳ Открываю страницу 'Товары из Китая'..."
osascript -e 'tell application "Google Chrome"
    activate
    if (count of windows) is 0 then make new window
    set URL of active tab of window 1 to "https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/"
end tell'

sleep 8

# Прокручиваем
echo "📜 Прокручиваю страницу..."
for ((i=1; i<=50; i++)); do
    echo -ne "\r  📜 Прокрутка: $i/50    "
    osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "window.scrollBy(0, window.innerHeight);"' >/dev/null 2>&1
    random_sleep 1 2
done
echo ""

# Получаем количество карточек
TILES=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "document.querySelectorAll(\"[data-index]\").length;"' 2>/dev/null)

echo "Найдено карточек: $TILES"
echo ""

SELLERS_FILE="/tmp/sellers_$(date +%s).txt"
> "$SELLERS_FILE"

FOUND=0
CHECKED=0

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

# Обрабатываем каждую карточку
for ((idx=0; idx<$TILES && FOUND<$MAX_SELLERS; idx++)); do
    echo -ne "\r  Проверено: $((idx+1))/$TILES | Найдено: $FOUND/$MAX_SELLERS    "

    # Получаем текст доставки
    DELIVERY_TEXT=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
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

    # Парсим дату доставки
    DELIVERY_DATE=$(parse_date "$DELIVERY_TEXT")

    if [ $? -ne 0 ]; then
        continue
    fi

    # Сравниваем даты
    if [[ "$DELIVERY_DATE" > "$THREE_WEEKS_DATE" ]]; then
        CHECKED=$((CHECKED + 1))

        # Получаем URL товара
        PRODUCT_URL=$(osascript -e "tell application \"Google Chrome\" to execute active tab of window 1 javascript \"
var tile = document.querySelector('[data-index=\\\"$idx\\\"]');
if (!tile) { ''; } else {
    var link = tile.querySelector('a[href*=\\\"/product/\\\"]');
    if (link) { link.href; } else { ''; }
}
\"" 2>/dev/null | head -1)

        if [ -n "$PRODUCT_URL" ] && [ "$PRODUCT_URL" != "missing value" ]; then
            echo ""
            echo "  ✓ Товар: доставка $DELIVERY_TEXT ($DELIVERY_DATE)"

            # Открываем в новой вкладке
            osascript -e "tell application \"Google Chrome\" to open location \"$PRODUCT_URL\"" >/dev/null 2>&1
            random_sleep 4 6

            # Шаг 1: Получаем основного продавца
            SELLER=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var link = document.querySelector(\"a[href*=\\\"/seller/\\\"]\");
if (link) { link.href; } else { \"\"; }
"' 2>/dev/null | head -1)

            if [ -n "$SELLER" ] && [ "$SELLER" != "missing value" ]; then
                echo "    → Основной продавец: $SELLER"
                echo "$SELLER" >> "$SELLERS_FILE"
                FOUND=$((FOUND + 1))
            fi

            # Шаг 2: Проверяем кнопку "Есть дешевле и быстрее"
            echo "    🔍 Ищу кнопку 'дешевле и быстрее'..."

            HAS_CHEAPER=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var buttons = document.querySelectorAll(\"button, a\");
var found = false;
for (var i = 0; i < buttons.length; i++) {
    var text = buttons[i].textContent.toLowerCase();
    if (text.indexOf(\"есть\") > -1 && text.indexOf(\"дешевле\") > -1) {
        found = true;
        break;
    }
}
found ? \"yes\" : \"no\";
"' 2>/dev/null | head -1)

            if [ "$HAS_CHEAPER" = "yes" ]; then
                echo "    ✓ Найдена кнопка! Кликаю..."

                # Кликаем на кнопку
                osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var buttons = document.querySelectorAll(\"button, a\");
for (var i = 0; i < buttons.length; i++) {
    var text = buttons[i].textContent.toLowerCase();
    if (text.indexOf(\"есть\") > -1 && text.indexOf(\"дешевле\") > -1) {
        buttons[i].click();
        break;
    }
}
"' >/dev/null 2>&1

                random_sleep 2 4

                # Теперь кликаем на кнопку "Еще" несколько раз
                echo "    📋 Загружаю дополнительных продавцов через кнопку 'Еще'..."

                for ((click=1; click<=$MAX_MORE_CLICKS; click++)); do
                    # Проверяем наличие кнопки "Еще"
                    HAS_MORE=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var buttons = document.querySelectorAll(\"button\");
var found = false;
for (var i = 0; i < buttons.length; i++) {
    var text = buttons[i].textContent.trim();
    if (text.toLowerCase().indexOf(\"еще\") > -1 && text.match(/\\d+/)) {
        found = true;
        break;
    }
}
found ? \"yes\" : \"no\";
"' 2>/dev/null | head -1)

                    if [ "$HAS_MORE" = "yes" ]; then
                        echo -ne "\r    📋 Клик на 'Еще': $click/$MAX_MORE_CLICKS    "

                        # Кликаем на "Еще"
                        osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var buttons = document.querySelectorAll(\"button\");
for (var i = 0; i < buttons.length; i++) {
    var text = buttons[i].textContent.trim();
    if (text.toLowerCase().indexOf(\"еще\") > -1 && text.match(/\\d+/)) {
        buttons[i].click();
        break;
    }
}
"' >/dev/null 2>&1

                        random_sleep 2 3
                    else
                        echo ""
                        echo "    ✓ Кнопка 'Еще' больше не найдена (все продавцы загружены)"
                        break
                    fi
                done

                echo ""
                echo "    ✓ Загрузка завершена"

                # Теперь собираем всех продавцов из модального окна
                MODAL_SELLERS=$(osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var sellers = [];
var links = document.querySelectorAll(\"a[href*=\\\"/seller/\\\"]\");
for (var i = 0; i < links.length; i++) {
    var url = links[i].href;
    if (sellers.indexOf(url) === -1) {
        sellers.push(url);
    }
}
JSON.stringify(sellers);
"' 2>/dev/null)

                # Обрабатываем продавцов из модального окна
                if [ -n "$MODAL_SELLERS" ] && [ "$MODAL_SELLERS" != "[]" ] && [ "$MODAL_SELLERS" != "missing value" ]; then
                    MODAL_COUNT=$(echo "$MODAL_SELLERS" | python3 -c "import sys, json; print(len(json.loads(sys.stdin.read())))" 2>/dev/null || echo "0")

                    echo "    ✓ Найдено продавцов в модальном окне: $MODAL_COUNT"

                    echo "$MODAL_SELLERS" | python3 -c "
import sys, json
try:
    sellers = json.loads(sys.stdin.read())
    for seller in sellers:
        with open('$SELLERS_FILE', 'a') as f:
            f.write(seller + '\n')
except:
    pass
"
                fi

                # Закрываем модальное окно (ESC)
                osascript -e 'tell application "Google Chrome" to execute active tab of window 1 javascript "
var event = new KeyboardEvent(\"keydown\", {
    key: \"Escape\",
    code: \"Escape\",
    keyCode: 27,
    which: 27,
    bubbles: true
});
document.dispatchEvent(event);
"' >/dev/null 2>&1

                random_sleep 1 2
            else
                echo "    ✗ Кнопка не найдена"
            fi

            # Закрываем вкладку
            osascript -e 'tell application "Google Chrome" to close active tab of window 1' >/dev/null 2>&1
            random_sleep 1 2
        fi
    fi
done

echo ""
echo ""
echo "✅ Сбор завершен!"
echo ""

# Обработка результатов
python3 <<PYTHON
import json
from datetime import datetime
import os

# Читаем продавцов
sellers = []
try:
    with open('$SELLERS_FILE', 'r') as f:
        sellers = list(set([line.strip() for line in f if line.strip()]))
except:
    pass

print(f'Собрано уникальных продавцов: {len(sellers)}')
print()

for i, url in enumerate(sellers, 1):
    print(f'{i}. {url}')

# Сохраняем
os.makedirs('results', exist_ok=True)

result = {
    'success': True,
    'total': len(sellers),
    'parsed_at': datetime.now().isoformat(),
    'filter': 'delivery > 21 days + "Еще" button clicks',
    'max_more_clicks': $MAX_MORE_CLICKS,
    'sellers': [{'url': url} for url in sellers]
}

timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
filename = f'results/sellers_final_v3_{timestamp}.json'

with open(filename, 'w', encoding='utf-8') as f:
    json.dump(result, f, ensure_ascii=False, indent=2)

print()
print(f'💾 Сохранено: {filename}')
PYTHON

rm -f "$SELLERS_FILE"

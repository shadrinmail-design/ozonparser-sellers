#!/bin/bash

# Массовый сбор товаров через Chrome AppleScript
# Использует уже открытый Chrome с вашим профилем

URLS=(
  "/seller/guangzhouganxinmaoyidian-3366398"
  "/seller/uilc-994084"
  "/seller/zavodskoy-magazin-2676335/"
  "/seller/hengkk-3268771"
  "/seller/zl-2287375"
  "/brand/smart-open-84705801/"
)

NAMES=(
  "guangzhouganxinmaoyidian"
  "uilc"
  "zavodskoy-magazin"
  "hengkk"
  "zl"
  "smart-open"
)

SCROLLS=10  # Количество прокруток на каждой странице

mkdir -p results

echo "🚀 Массовый сбор товаров через Chrome"
echo "======================================"
echo ""

for i in "${!URLS[@]}"; do
  url="${URLS[$i]}"
  name="${NAMES[$i]}"

  echo "[$((i+1))/${#URLS[@]}] Парсинг: $name"
  echo "URL: https://www.ozon.ru$url"
  echo "Прокруток: $SCROLLS"

  # Запускаем AppleScript парсер
  osascript parse_via_chrome.applescript "$url" "$SCROLLS" > "results/${name}_raw.txt" 2>&1

  # Проверяем результат
  if grep -q "success:true" "results/${name}_raw.txt"; then
    count=$(grep -o "id:[0-9]*" "results/${name}_raw.txt" | wc -l)
    echo "✅ Найдено товаров: $count"

    # Извлекаем только ID для удобства
    grep -o "id:[0-9]*" "results/${name}_raw.txt" | sed 's/id://' | sort -u > "results/${name}_ids.txt"
  else
    echo "❌ Ошибка парсинга"
    cat "results/${name}_raw.txt"
  fi

  echo ""

  # Пауза между источниками
  if [ $i -lt $((${#URLS[@]} - 1)) ]; then
    echo "⏳ Пауза 5 секунд..."
    sleep 5
  fi
done

echo "======================================"
echo "✅ Сбор завершен!"
echo ""
echo "Результаты:"
total=0
for name in "${NAMES[@]}"; do
  if [ -f "results/${name}_ids.txt" ]; then
    count=$(wc -l < "results/${name}_ids.txt")
    echo "  $name: $count товаров"
    total=$((total + count))
  fi
done

echo ""
echo "Всего товаров: $total"
echo ""
echo "Файлы сохранены в results/"

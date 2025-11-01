#!/bin/bash

# Простой парсер Ozon без браузера
# Использует curl для получения HTML и извлечения ссылок на товары

# URL источников из настроек
URLS=(
  "https://www.ozon.ru/seller/guangzhouganxinmaoyidian-3366398"
  "https://www.ozon.ru/seller/uilc-994084"
  "https://www.ozon.ru/seller/zavodskoy-magazin-2676335/"
  "https://www.ozon.ru/seller/hengkk-3268771"
  "https://www.ozon.ru/seller/zl-2287375"
  "https://www.ozon.ru/brand/smart-open-84705801/"
)

NAMES=(
  "guangzhouganxinmaoyidian"
  "uilc"
  "zavodskoy-magazin"
  "hengkk"
  "zl"
  "smart-open"
)

mkdir -p results

echo "🚀 Starting simple Ozon parser (curl-based)"
echo "=========================================="
echo ""

for i in "${!URLS[@]}"; do
  url="${URLS[$i]}"
  name="${NAMES[$i]}"

  echo "[$((i+1))/${#URLS[@]}] Parsing: $name"
  echo "URL: $url"

  # Выгружаем HTML
  curl -s -L \
    -H "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" \
    -H "Accept: text/html,application/xhtml+xml" \
    -H "Accept-Language: ru-RU,ru;q=0.9" \
    "$url" > "results/${name}_page.html"

  # Извлекаем ссылки на товары
  grep -o 'href="/product/[^"]*"' "results/${name}_page.html" | \
    sed 's/href="//;s/"$//' | \
    sort -u > "results/${name}_links.txt"

  count=$(wc -l < "results/${name}_links.txt")
  echo "✅ Found $count product links"

  # Извлекаем ID товаров
  grep -oE '/product/[^/]*-([0-9]+)' "results/${name}_links.txt" | \
    sed 's/.*-//' | \
    sort -u > "results/${name}_ids.txt"

  id_count=$(wc -l < "results/${name}_ids.txt")
  echo "📦 Unique product IDs: $id_count"
  echo ""

  sleep 2
done

echo "=========================================="
echo "✅ DONE! Results saved in results/"
echo ""
echo "Summary:"
total=0
for name in "${NAMES[@]}"; do
  if [ -f "results/${name}_ids.txt" ]; then
    count=$(wc -l < "results/${name}_ids.txt")
    echo "  $name: $count products"
    total=$((total + count))
  fi
done
echo ""
echo "Total products: $total"

#!/bin/bash

# Массовый сбор ID товаров из всех источников

URLS=(
  "/seller/izbrannye-tovary-iz-univermaga-2741108"
  "/seller/tengliqing-2633179"
  "/seller/mingkang-e-commerce-co-ltd-3301088"
  "/seller/qiulihong-2414542"
  "/seller/tingdong-2436758"
  "/seller/aoxinjie-2251622"
  "/seller/i-like-you-66-2316911"
  "/seller/tochka-schastya-2585143"
  "/seller/mingxuanxiaodian-3301141"
  "/seller/boutique-firm-2481423"
  "/seller/xiaodian-2337211"
  "/seller/yy-shop-3263854"
  "/seller/magiya-3148960"
  "/seller/dark-palace-1609375"
  "/seller/jingfeng-2260324/"
  "/seller/feng-store-2740100"
  "/seller/wujingjing3dian-2734448"
  "/seller/guangzhouganxinmaoyidian-3366398"
  "/seller/uilc-994084"
  "/seller/zavodskoy-magazin-2676335/"
  "/seller/hengkk-3268771"
  "/seller/zl-2287375"
  "/brand/smart-open-84705801/"
)

SCROLLS=10

mkdir -p results

echo "🚀 Массовый сбор ID товаров"
echo "Источников: ${#URLS[@]}"
echo "Прокруток на каждой странице: $SCROLLS"
echo ""

for i in "${!URLS[@]}"; do
  url="${URLS[$i]}"
  name=$(echo "$url" | sed 's/.*\///' | sed 's/-[0-9]*\/*$//')
  
  echo "[$((i+1))/${#URLS[@]}] $name"
  echo "  URL: https://www.ozon.ru$url"
  
  # Используем рабочий AppleScript парсер
  osascript parse_via_chrome.applescript "$url" "$SCROLLS" > "results/${name}_raw.txt" 2>&1
  
  if grep -q "success:true" "results/${name}_raw.txt"; then
    count=$(grep -o "id:[0-9]*" "results/${name}_raw.txt" | wc -l | xargs)
    echo "  ✅ Собрано: $count товаров"
    
    # Извлекаем ID
    grep -o "id:[0-9]*" "results/${name}_raw.txt" | sed 's/id://' | sort -u > "results/${name}_ids.txt"
  else
    echo "  ❌ Ошибка"
  fi
  
  echo ""
  
  if [ $i -lt $((${#URLS[@]} - 1)) ]; then
    sleep 3
  fi
done

echo "======================================"
echo "✅ Сбор завершен!"
echo ""

total=0
for name_file in results/*_ids.txt; do
  if [ -f "$name_file" ]; then
    count=$(wc -l < "$name_file" | xargs)
    name=$(basename "$name_file" _ids.txt)
    echo "  $name: $count"
    total=$((total + count))
  fi
done

echo ""
echo "Всего ID товаров: $total"
echo "Файлы: results/*_ids.txt"

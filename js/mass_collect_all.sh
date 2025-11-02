#!/bin/bash

# Массовый сбор ПОЛНЫХ данных из всех источников

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

echo "🚀 Массовый сбор ПОЛНЫХ данных товаров"
echo "Источников: ${#URLS[@]}"
echo "Прокруток на странице: $SCROLLS"
echo ""

START_TIME=$(date +%s)
TOTAL_PRODUCTS=0

for i in "${!URLS[@]}"; do
  url="${URLS[$i]}"
  name=$(echo "$url" | sed 's/.*\///' | sed 's/-[0-9]*\/*$//')

  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "[$((i+1))/${#URLS[@]}] $name"
  echo "URL: https://www.ozon.ru$url"
  echo ""

  # Запускаем collect_full_data.sh
  ./collect_full_data.sh "$url" "$SCROLLS" 2>&1 | tee "results/${name}_log.txt"

  # Переименовываем последний созданный JSON
  LATEST_JSON=$(ls -t results/full_data_*.json 2>/dev/null | head -1)
  if [ -n "$LATEST_JSON" ]; then
    mv "$LATEST_JSON" "results/${name}_full.json"

    # Подсчитываем товары
    COUNT=$(python3 -c "import json; print(json.load(open('results/${name}_full.json'))['total'])" 2>/dev/null || echo "0")
    echo "✅ Сохранено: results/${name}_full.json ($COUNT товаров)"
    TOTAL_PRODUCTS=$((TOTAL_PRODUCTS + COUNT))
  else
    echo "❌ Ошибка сбора"
  fi

  echo ""

  # Пауза между источниками
  if [ $i -lt $((${#URLS[@]} - 1)) ]; then
    echo "⏳ Пауза 5 секунд..."
    sleep 5
  fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Массовый сбор завершен!"
echo ""
echo "Время работы: ${MINUTES}м ${SECONDS}с"
echo "Всего товаров: $TOTAL_PRODUCTS"
echo ""
echo "Файлы результатов:"
ls -lh results/*_full.json 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
echo ""
echo "Объединить все в один файл:"
echo "  python3 -c \"import json, glob; print(json.dumps({'total': sum(json.load(open(f))['total'] for f in glob.glob('results/*_full.json')), 'products': [p for f in glob.glob('results/*_full.json') for p in json.load(open(f))['products']]}, ensure_ascii=False, indent=2))\" > results/all_products.json"

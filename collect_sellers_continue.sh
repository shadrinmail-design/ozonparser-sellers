#!/bin/bash

# Продолжение сбора продавцов со случайного магазина из уже собранных

MAX_SELLERS="${1:-500}"
MAX_SHOPS_TO_VISIT="${2:-100}"
INPUT_FILE="${3:-results/sellers_combined_500.json}"

echo "🔄 Продолжение сбора продавцов (фаза 2)"
echo "Цель: $MAX_SELLERS новых продавцов"
echo "Входной файл: $INPUT_FILE"
echo "Максимум магазинов для обхода: $MAX_SHOPS_TO_VISIT"
echo ""

# Проверяем входной файл
if [ ! -f "$INPUT_FILE" ]; then
    echo "❌ Ошибка: файл $INPUT_FILE не найден"
    exit 1
fi

# Создаем временный файл с перемешанными продавцами
TEMP_SHUFFLED="/tmp/sellers_shuffled_$$.json"

echo "🎲 Перемешиваю продавцов для случайного старта..."

python3 <<PYTHON
import json
import random

# Загружаем существующих продавцов
with open('$INPUT_FILE', 'r', encoding='utf-8') as f:
    data = json.load(f)
    sellers = data.get('sellers', [])

# Перемешиваем
random.shuffle(sellers)

# Сохраняем в новый файл
shuffled_data = {
    'success': True,
    'total': len(sellers),
    'sellers': sellers,
    'shuffled': True,
    'source': '$INPUT_FILE'
}

with open('$TEMP_SHUFFLED', 'w', encoding='utf-8') as f:
    json.dump(shuffled_data, f, ensure_ascii=False, indent=2)

# Выводим первого продавца для старта
if sellers:
    print(f"✓ Перемешано: {len(sellers)} продавцов")
    print(f"Стартуем с: {sellers[0].get('url', 'нет URL')}")
PYTHON

if [ $? -ne 0 ]; then
    echo "❌ Ошибка при перемешивании продавцов"
    rm -f "$TEMP_SHUFFLED"
    exit 1
fi

echo ""
echo "🚀 Запускаю сбор (фаза 2 only)..."
echo ""

# Запускаем сбор с пропуском фазы 1 и перемешанным списком
./collect_sellers_final_v4.sh \
    "$MAX_SELLERS" \
    10 \
    "unused_start_url" \
    "yes" \
    "$TEMP_SHUFFLED" \
    "$MAX_SHOPS_TO_VISIT"

EXIT_CODE=$?

# Удаляем временный файл
rm -f "$TEMP_SHUFFLED"

if [ $EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Сбор завершен успешно!"
else
    echo ""
    echo "⚠️  Сбор завершился с ошибкой (код: $EXIT_CODE)"
fi

exit $EXIT_CODE

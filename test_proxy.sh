#!/bin/bash

# Тест одного прокси
test_proxy() {
    local ip=$1
    local port=$2
    local proxy="http://${ip}:${port}"

    # Пробуем подключиться к Ozon через прокси
    result=$(timeout 10 curl -x "$proxy" -s -L --max-redirs 1 \
        -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" \
        "https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true" 2>&1)

    # Проверяем результат
    if echo "$result" | grep -qi "доступ ограничен\|access denied"; then
        echo "❌ ${ip}:${port} - BLOCKED by Ozon"
        return 1
    elif echo "$result" | grep -qi "товар\|product\|ozon"; then
        echo "✅ ${ip}:${port} - SUCCESS!"
        echo "${ip}:${port}" >> /tmp/working_proxies.txt
        return 0
    else
        echo "⚠️  ${ip}:${port} - Connection failed or timeout"
        return 2
    fi
}

export -f test_proxy

# Очищаем файл с рабочими прокси
> /tmp/working_proxies.txt

# Читаем JSON и тестируем первые 10 прокси параллельно
cat /home/ozon-parser/test_proxies.json | \
    jq -r '.[] | "\(.ip_address):\(.port)"' | \
    xargs -n 1 -P 5 -I {} bash -c 'IFS=":"; set -- {}; test_proxy "$1" "$2"'

echo ""
echo "=== Working Proxies ==="
if [ -s /tmp/working_proxies.txt ]; then
    cat /tmp/working_proxies.txt
else
    echo "No working proxies found in first batch"
fi

const fs = require('fs');
const https = require('https');
const http = require('http');

// Загружаем список рабочих прокси
let workingProxies = [];
try {
    workingProxies = JSON.parse(fs.readFileSync('working_proxies.json', 'utf8'));
    console.log(`Загружено ${workingProxies.length} рабочих прокси для тестирования на Ozon`);
} catch (err) {
    console.error('Файл working_proxies.json не найден. Подождите завершения основного теста.');
    process.exit(1);
}

const OZON_URL = 'https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true';
const TIMEOUT = 15000; // 15 секунд timeout
const CONCURRENCY = 5; // Одновременно тестируем 5 прокси на Ozon

const results = {
    working: [],
    blocked: [],
    failed: []
};

// Функция для тестирования прокси на Ozon
async function testProxyOnOzon(proxyStr) {
    return new Promise((resolve) => {
        const [ip, port] = proxyStr.split(':');
        const startTime = Date.now();

        try {
            const req = http.request({
                host: ip,
                port: parseInt(port),
                method: 'CONNECT',
                path: 'www.ozon.ru:443',
                timeout: TIMEOUT,
                headers: {
                    'Host': 'www.ozon.ru:443'
                }
            });

            req.on('connect', (res, socket) => {
                if (res.statusCode === 200) {
                    const httpsReq = https.request({
                        host: 'www.ozon.ru',
                        socket: socket,
                        agent: false,
                        path: '/highlight/tovary-iz-kitaya-935133/?from_global=true',
                        timeout: TIMEOUT,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
                            'Accept-Encoding': 'gzip, deflate, br',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1',
                            'Sec-Fetch-Dest': 'document',
                            'Sec-Fetch-Mode': 'navigate',
                            'Sec-Fetch-Site': 'none',
                            'Cache-Control': 'max-age=0'
                        }
                    });

                    let responseData = '';
                    httpsReq.on('response', (httpsRes) => {
                        const responseTime = Date.now() - startTime;

                        // Читаем первые 1000 байт ответа
                        httpsRes.on('data', (chunk) => {
                            responseData += chunk.toString();
                        });

                        httpsRes.on('end', () => {
                            const isBlocked =
                                httpsRes.statusCode === 403 ||
                                responseData.includes('Доступ ограничен') ||
                                responseData.includes('Access denied') ||
                                responseData.includes('incident_id') ||
                                responseData.includes('fab_chlg');

                            const hasProducts =
                                responseData.includes('товары из китая') ||
                                responseData.includes('Товары из Китая') ||
                                responseData.includes('tileWrapper') ||
                                responseData.includes('product');

                            if (isBlocked) {
                                resolve({
                                    success: false,
                                    blocked: true,
                                    proxy: proxyStr,
                                    statusCode: httpsRes.statusCode,
                                    responseTime,
                                    snippet: responseData.substring(0, 200)
                                });
                            } else if (httpsRes.statusCode === 200 || httpsRes.statusCode === 307) {
                                resolve({
                                    success: true,
                                    proxy: proxyStr,
                                    statusCode: httpsRes.statusCode,
                                    responseTime,
                                    hasProducts,
                                    snippet: responseData.substring(0, 200)
                                });
                            } else {
                                resolve({
                                    success: false,
                                    blocked: false,
                                    proxy: proxyStr,
                                    statusCode: httpsRes.statusCode,
                                    responseTime,
                                    snippet: responseData.substring(0, 200)
                                });
                            }
                        });

                        httpsReq.setTimeout(TIMEOUT);
                    });

                    httpsReq.on('error', (err) => {
                        resolve({
                            success: false,
                            proxy: proxyStr,
                            error: err.message
                        });
                    });

                    httpsReq.on('timeout', () => {
                        httpsReq.destroy();
                        resolve({
                            success: false,
                            proxy: proxyStr,
                            error: 'Timeout'
                        });
                    });

                    httpsReq.end();
                } else {
                    resolve({
                        success: false,
                        proxy: proxyStr,
                        error: `CONNECT failed: ${res.statusCode}`
                    });
                }
            });

            req.on('error', (err) => {
                resolve({
                    success: false,
                    proxy: proxyStr,
                    error: err.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    proxy: proxyStr,
                    error: 'Timeout'
                });
            });

            req.end();

        } catch (err) {
            resolve({
                success: false,
                proxy: proxyStr,
                error: err.message
            });
        }
    });
}

// Функция для тестирования с ограничением concurrency
async function testProxiesWithConcurrency(proxies, concurrency) {
    let index = 0;
    let completed = 0;
    const total = proxies.length;

    const runNext = async () => {
        if (index >= total) return;

        const currentIndex = index++;
        const proxy = proxies[currentIndex].proxy;

        const result = await testProxyOnOzon(proxy);
        completed++;

        if (result.success) {
            results.working.push(result);
            console.log(`✓ [${completed}/${total}] ${result.proxy} - OZON OK! (${result.responseTime}ms, status: ${result.statusCode}, hasProducts: ${result.hasProducts})`);
        } else if (result.blocked) {
            results.blocked.push(result);
            console.log(`⊗ [${completed}/${total}] ${result.proxy} - BLOCKED by Ozon (${result.responseTime}ms, status: ${result.statusCode})`);
        } else {
            results.failed.push(result);
            console.log(`✗ [${completed}/${total}] ${result.proxy} - FAILED (${result.error || result.statusCode})`);
        }

        return runNext();
    };

    // Запускаем concurrent workers
    const workers = Array(concurrency).fill(null).map(() => runNext());
    await Promise.all(workers);
}

// Сохранение результатов
function saveResults() {
    const report = {
        timestamp: new Date().toISOString(),
        total: workingProxies.length,
        ozonWorking: results.working.length,
        blocked: results.blocked.length,
        failed: results.failed.length,
        workingProxies: results.working,
        blockedProxies: results.blocked,
        failedProxies: results.failed
    };

    fs.writeFileSync('ozon_proxy_test_results.json', JSON.stringify(report, null, 2));

    // Сохраняем только прокси, работающие с Ozon
    if (results.working.length > 0) {
        fs.writeFileSync('ozon_working_proxies.json', JSON.stringify(results.working, null, 2));
    }
}

// Запуск тестирования
async function main() {
    console.log('Начинаем тестирование рабочих прокси на Ozon...\n');
    const startTime = Date.now();

    await testProxiesWithConcurrency(workingProxies, CONCURRENCY);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(70));
    console.log('РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ НА OZON');
    console.log('='.repeat(70));
    console.log(`Всего протестировано: ${workingProxies.length}`);
    console.log(`Работают с Ozon: ${results.working.length} (${(results.working.length / workingProxies.length * 100).toFixed(2)}%)`);
    console.log(`Заблокированы: ${results.blocked.length} (${(results.blocked.length / workingProxies.length * 100).toFixed(2)}%)`);
    console.log(`Не работают: ${results.failed.length} (${(results.failed.length / workingProxies.length * 100).toFixed(2)}%)`);
    console.log(`Время выполнения: ${duration}s`);
    console.log('='.repeat(70));

    if (results.working.length > 0) {
        console.log('\n🎉 ПРОКСИ, РАБОТАЮЩИЕ С OZON:');
        results.working.forEach((r, i) => {
            console.log(`${i + 1}. ${r.proxy} - ${r.responseTime}ms (status: ${r.statusCode}, products: ${r.hasProducts})`);
        });
        console.log('\n💡 Эти прокси можно использовать для парсинга Ozon!');
    } else {
        console.log('\n⚠️  К сожалению, ни один прокси не прошел проверку на Ozon.');
    }

    saveResults();
    console.log('\nРезультаты сохранены в ozon_proxy_test_results.json');
    if (results.working.length > 0) {
        console.log('Рабочие прокси для Ozon сохранены в ozon_working_proxies.json');
    }
}

main().catch(console.error);

const fs = require('fs');
const https = require('https');
const http = require('http');

// Загружаем список прокси
const proxies = JSON.parse(fs.readFileSync('proxy.js', 'utf8'));

console.log(`Загружено ${proxies.length} прокси для тестирования`);

const TEST_URL = 'https://www.ozon.ru';
const TIMEOUT = 10000; // 10 секунд timeout
const CONCURRENCY = 20; // Одновременно тестируем 20 прокси
const results = {
    working: [],
    failed: []
};

// Функция для тестирования одного прокси
async function testProxy(proxy) {
    return new Promise((resolve) => {
        const proxyUrl = `http://${proxy.ip_address}:${proxy.port}`;
        const startTime = Date.now();

        try {
            const agent = new http.Agent({
                proxy: proxyUrl,
                timeout: TIMEOUT
            });

            const options = {
                hostname: 'www.ozon.ru',
                port: 443,
                path: '/',
                method: 'GET',
                timeout: TIMEOUT,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            };

            // Пробуем HTTP прокси
            const req = http.request({
                host: proxy.ip_address,
                port: proxy.port,
                method: 'CONNECT',
                path: 'www.ozon.ru:443',
                timeout: TIMEOUT
            });

            req.on('connect', (res, socket) => {
                if (res.statusCode === 200) {
                    const httpsReq = https.request({
                        host: 'www.ozon.ru',
                        socket: socket,
                        agent: false,
                        path: '/',
                        timeout: TIMEOUT,
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        }
                    });

                    httpsReq.on('response', (httpsRes) => {
                        const responseTime = Date.now() - startTime;
                        resolve({
                            success: true,
                            proxy: `${proxy.ip_address}:${proxy.port}`,
                            statusCode: httpsRes.statusCode,
                            responseTime,
                            type: 'HTTP'
                        });
                        httpsReq.abort();
                    });

                    httpsReq.on('error', (err) => {
                        resolve({
                            success: false,
                            proxy: `${proxy.ip_address}:${proxy.port}`,
                            error: err.message
                        });
                    });

                    httpsReq.end();
                } else {
                    resolve({
                        success: false,
                        proxy: `${proxy.ip_address}:${proxy.port}`,
                        error: `CONNECT failed: ${res.statusCode}`
                    });
                }
            });

            req.on('error', (err) => {
                resolve({
                    success: false,
                    proxy: `${proxy.ip_address}:${proxy.port}`,
                    error: err.message
                });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({
                    success: false,
                    proxy: `${proxy.ip_address}:${proxy.port}`,
                    error: 'Timeout'
                });
            });

            req.end();

        } catch (err) {
            resolve({
                success: false,
                proxy: `${proxy.ip_address}:${proxy.port}`,
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
        const proxy = proxies[currentIndex];

        const result = await testProxy(proxy);
        completed++;

        if (result.success) {
            results.working.push(result);
            console.log(`✓ [${completed}/${total}] ${result.proxy} - OK (${result.responseTime}ms, status: ${result.statusCode})`);
        } else {
            results.failed.push(result);
            console.log(`✗ [${completed}/${total}] ${result.proxy} - FAILED (${result.error})`);
        }

        // Сохраняем промежуточные результаты каждые 50 прокси
        if (completed % 50 === 0) {
            saveResults();
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
        total: proxies.length,
        working: results.working.length,
        failed: results.failed.length,
        workingProxies: results.working,
        failedProxies: results.failed
    };

    fs.writeFileSync('proxy_test_results.json', JSON.stringify(report, null, 2));

    // Сохраняем только рабочие прокси в отдельный файл
    if (results.working.length > 0) {
        const workingOnly = results.working.map(r => ({
            proxy: r.proxy,
            responseTime: r.responseTime,
            statusCode: r.statusCode,
            type: r.type
        }));
        fs.writeFileSync('working_proxies.json', JSON.stringify(workingOnly, null, 2));
    }
}

// Запуск тестирования
async function main() {
    console.log('Начинаем тестирование прокси...\n');
    const startTime = Date.now();

    await testProxiesWithConcurrency(proxies, CONCURRENCY);

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(60));
    console.log('РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ');
    console.log('='.repeat(60));
    console.log(`Всего протестировано: ${proxies.length}`);
    console.log(`Рабочих: ${results.working.length} (${(results.working.length / proxies.length * 100).toFixed(2)}%)`);
    console.log(`Нерабочих: ${results.failed.length} (${(results.failed.length / proxies.length * 100).toFixed(2)}%)`);
    console.log(`Время выполнения: ${duration}s`);
    console.log('='.repeat(60));

    if (results.working.length > 0) {
        console.log('\nРАБОЧИЕ ПРОКСИ:');
        results.working.forEach((r, i) => {
            console.log(`${i + 1}. ${r.proxy} - ${r.responseTime}ms (status: ${r.statusCode})`);
        });
    }

    saveResults();
    console.log('\nРезультаты сохранены в proxy_test_results.json');
    console.log('Рабочие прокси сохранены в working_proxies.json');
}

main().catch(console.error);

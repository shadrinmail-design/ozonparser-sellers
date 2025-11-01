const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

// Загружаем список рабочих прокси
let workingProxies = [];
try {
    workingProxies = JSON.parse(fs.readFileSync('working_proxies.json', 'utf8'));
    console.log(`Загружено ${workingProxies.length} рабочих прокси для тестирования на Ozon через Puppeteer\n`);
} catch (err) {
    console.error('Файл working_proxies.json не найден. Подождите завершения основного теста.');
    process.exit(1);
}

const OZON_URL = 'https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true';
const TIMEOUT = 30000; // 30 секунд timeout
const CONCURRENCY = 3; // Одновременно тестируем 3 прокси (браузеры тяжелые)

const results = {
    working: [],
    blocked: [],
    failed: []
};

// Функция для тестирования прокси через Puppeteer
async function testProxyWithPuppeteer(proxyStr) {
    const [ip, port] = proxyStr.split(':');
    const startTime = Date.now();

    let browser = null;
    try {
        // Запускаем браузер с прокси
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                `--proxy-server=http://${ip}:${port}`
            ],
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();

        // Устанавливаем таймаут
        page.setDefaultTimeout(TIMEOUT);
        page.setDefaultNavigationTimeout(TIMEOUT);

        // Устанавливаем User-Agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // Устанавливаем viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Переходим на страницу Ozon
        const response = await page.goto(OZON_URL, {
            waitUntil: 'domcontentloaded',
            timeout: TIMEOUT
        });

        const responseTime = Date.now() - startTime;
        const statusCode = response.status();

        // Даем странице немного времени на загрузку
        await page.waitForTimeout(3000);

        // Получаем содержимое страницы
        const content = await page.content();
        const title = await page.title();

        // Проверяем различные признаки блокировки
        const isBlocked =
            statusCode === 403 ||
            content.includes('Доступ ограничен') ||
            content.includes('Access denied') ||
            content.includes('incident_id') ||
            content.includes('fab_chlg') ||
            title.includes('Доступ ограничен') ||
            title.includes('Access Denied');

        // Проверяем наличие товаров
        const hasProducts =
            content.includes('товары из китая') ||
            content.includes('Товары из Китая') ||
            content.includes('tileWrapper') ||
            content.includes('product') ||
            content.includes('data-widget="searchResultsV2"');

        // Делаем скриншот для отладки
        const screenshotPath = `screenshots/proxy_${ip.replace(/\./g, '_')}_${port}.png`;
        try {
            await page.screenshot({ path: screenshotPath, fullPage: false });
        } catch (err) {
            // Игнорируем ошибки скриншота
        }

        await browser.close();

        if (isBlocked) {
            return {
                success: false,
                blocked: true,
                proxy: proxyStr,
                statusCode,
                responseTime,
                title,
                screenshot: screenshotPath
            };
        } else if (statusCode === 200 || statusCode === 307) {
            return {
                success: true,
                proxy: proxyStr,
                statusCode,
                responseTime,
                hasProducts,
                title,
                screenshot: screenshotPath
            };
        } else {
            return {
                success: false,
                blocked: false,
                proxy: proxyStr,
                statusCode,
                responseTime,
                title,
                screenshot: screenshotPath
            };
        }

    } catch (err) {
        if (browser) {
            try {
                await browser.close();
            } catch (e) {
                // Ignore
            }
        }

        return {
            success: false,
            proxy: proxyStr,
            error: err.message
        };
    }
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

        console.log(`⏳ [${completed + 1}/${total}] Тестирую ${proxy} через Puppeteer...`);

        const result = await testProxyWithPuppeteer(proxy);
        completed++;

        if (result.success) {
            results.working.push(result);
            console.log(`✓ [${completed}/${total}] ${result.proxy} - OZON OK! 🎉`);
            console.log(`   └─ ${result.responseTime}ms, status: ${result.statusCode}, products: ${result.hasProducts}`);
            console.log(`   └─ Title: "${result.title}"`);
            console.log(`   └─ Screenshot: ${result.screenshot}\n`);
        } else if (result.blocked) {
            results.blocked.push(result);
            console.log(`⊗ [${completed}/${total}] ${result.proxy} - BLOCKED by Ozon ❌`);
            console.log(`   └─ ${result.responseTime}ms, status: ${result.statusCode}`);
            console.log(`   └─ Title: "${result.title}"`);
            console.log(`   └─ Screenshot: ${result.screenshot}\n`);
        } else {
            results.failed.push(result);
            console.log(`✗ [${completed}/${total}] ${result.proxy} - FAILED`);
            console.log(`   └─ ${result.error || result.statusCode}\n`);
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

    fs.writeFileSync('ozon_puppeteer_test_results.json', JSON.stringify(report, null, 2));

    // Сохраняем только прокси, работающие с Ozon
    if (results.working.length > 0) {
        fs.writeFileSync('ozon_puppeteer_working_proxies.json', JSON.stringify(results.working, null, 2));
    }
}

// Запуск тестирования
async function main() {
    console.log('='.repeat(70));
    console.log('ТЕСТИРОВАНИЕ ПРОКСИ НА OZON ЧЕРЕЗ PUPPETEER');
    console.log('='.repeat(70));
    console.log();

    // Создаем директорию для скриншотов
    try {
        fs.mkdirSync('screenshots', { recursive: true });
    } catch (err) {
        // Ignore
    }

    const startTime = Date.now();
    await testProxiesWithConcurrency(workingProxies, CONCURRENCY);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('\n' + '='.repeat(70));
    console.log('РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ НА OZON (PUPPETEER)');
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
            console.log(`${i + 1}. ${r.proxy}`);
            console.log(`   └─ Время ответа: ${r.responseTime}ms`);
            console.log(`   └─ Статус: ${r.statusCode}`);
            console.log(`   └─ Товары найдены: ${r.hasProducts}`);
            console.log(`   └─ Заголовок: "${r.title}"`);
            console.log(`   └─ Скриншот: ${r.screenshot}`);
            console.log();
        });
        console.log('💡 Эти прокси можно использовать для парсинга Ozon!');
        console.log(`\nКоманда для запуска парсера с рабочим прокси:`);
        console.log(`HTTPS_PROXY=http://${results.working[0].proxy} node src/index.js`);
    } else {
        console.log('\n⚠️  К сожалению, ни один прокси не прошел проверку на Ozon.');
        console.log('Рекомендация: используйте резидентные прокси из России.');
    }

    saveResults();
    console.log('\nРезультаты сохранены в ozon_puppeteer_test_results.json');
    if (results.working.length > 0) {
        console.log('Рабочие прокси для Ozon сохранены в ozon_puppeteer_working_proxies.json');
    }
}

main().catch(console.error);

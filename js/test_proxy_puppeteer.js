const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function testProxy(proxyServer) {
  const [ip, port] = proxyServer.split(':');
  console.log(`\nTesting proxy: ${proxyServer}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        `--proxy-server=http://${proxyServer}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
      ],
      executablePath: '/usr/bin/google-chrome',
    });

    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    await page.goto('https://www.ozon.ru/highlight/tovary-iz-kitaya-935133/?from_global=true', {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });

    const content = await page.content();

    if (content.includes('Доступ ограничен') || content.includes('Access denied')) {
      console.log(`❌ ${proxyServer} - BLOCKED by Ozon`);
      return { proxy: proxyServer, status: 'blocked' };
    } else if (content.includes('товар') || content.includes('product')) {
      console.log(`✅ ${proxyServer} - SUCCESS!`);
      fs.appendFileSync('/tmp/working_proxies_puppeteer.txt', proxyServer + '\n');
      return { proxy: proxyServer, status: 'working' };
    } else {
      console.log(`⚠️  ${proxyServer} - Unknown page content`);
      return { proxy: proxyServer, status: 'unknown' };
    }
  } catch (error) {
    console.log(`⚠️  ${proxyServer} - Error: ${error.message}`);
    return { proxy: proxyServer, status: 'error', error: error.message };
  } finally {
    if (browser) await browser.close();
  }
}

async function main() {
  const proxies = JSON.parse(fs.readFileSync('/home/ozon-parser/test_proxies.json', 'utf8'));

  console.log(`Testing ${proxies.length} proxies with Puppeteer...\n`);

  // Test first 3 proxies sequentially
  for (let i = 0; i < Math.min(3, proxies.length); i++) {
    const proxy = `${proxies[i].ip_address}:${proxies[i].port}`;
    await testProxy(proxy);
  }

  console.log('\n=== Results ===');
  if (fs.existsSync('/tmp/working_proxies_puppeteer.txt')) {
    console.log('Working proxies:');
    console.log(fs.readFileSync('/tmp/working_proxies_puppeteer.txt', 'utf8'));
  } else {
    console.log('No working proxies found');
  }
}

main().catch(console.error);

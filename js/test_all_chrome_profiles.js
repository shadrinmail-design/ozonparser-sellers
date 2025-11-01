const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

const CHROME_BASE_PATH = '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome';

async function testProfile(profileName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing profile: ${profileName}`);
  console.log('='.repeat(60));

  // Используем ВРЕМЕННЫЙ профиль, но копируем куки из реального
  const tempUserDataDir = `/tmp/chrome-test-${profileName.replace(/\s+/g, '_')}`;

  // Удаляем старый временный профиль если есть
  if (fs.existsSync(tempUserDataDir)) {
    fs.rmSync(tempUserDataDir, { recursive: true, force: true });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: tempUserDataDir, // ВРЕМЕННЫЙ профиль
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--lang=ru-RU',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--window-size=1366,768',
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log('🌐 Navigating to Ozon...');
    await page.goto('https://www.ozon.ru/', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const result = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        isBlocked: document.title.includes('Доступ ограничен') ||
                   document.title.includes('Access denied'),
        hasCameraButton: document.querySelectorAll('button.rn6_29, button[class*="rn6"]').length > 0,
        hasSearchBar: document.querySelector('input[type="text"][placeholder*="Искать"]') !== null,
        bodyText: document.body.innerText.substring(0, 200)
      };
    });

    console.log('\n📊 Result:');
    console.log(`   Title: ${result.title}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Blocked: ${result.isBlocked ? '❌ YES' : '✅ NO'}`);
    console.log(`   Camera button: ${result.hasCameraButton ? '✅ YES' : '❌ NO'}`);
    console.log(`   Search bar: ${result.hasSearchBar ? '✅ YES' : '❌ NO'}`);

    if (!result.isBlocked) {
      console.log('\n🎉 SUCCESS! This profile works!');

      // Save screenshot
      const screenshotPath = path.join(__dirname, `success_${profileName.replace(/\s+/g, '_')}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 Screenshot saved: ${screenshotPath}`);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
    await browser.close();

    return {
      profileName,
      success: !result.isBlocked,
      hasCameraButton: result.hasCameraButton,
      title: result.title
    };

  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // ignore
      }
    }

    return {
      profileName,
      success: false,
      error: error.message
    };
  }
}

async function testAllProfiles() {
  console.log('🔍 Finding all Chrome profiles...\n');

  const profiles = fs.readdirSync(CHROME_BASE_PATH)
    .filter(name => name === 'Default' || name.startsWith('Profile'))
    .sort();

  console.log(`Found ${profiles.length} profiles: ${profiles.join(', ')}\n`);

  const results = [];

  for (const profile of profiles) {
    const result = await testProfile(profile);
    results.push(result);

    // Wait between tests to avoid issues
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));

  const working = results.filter(r => r.success);
  const withCamera = results.filter(r => r.hasCameraButton);

  console.log(`\nTotal profiles tested: ${results.length}`);
  console.log(`Working profiles (not blocked): ${working.length}`);
  console.log(`Profiles with camera button: ${withCamera.length}`);

  if (working.length > 0) {
    console.log('\n✅ Working profiles:');
    working.forEach(r => {
      console.log(`   - ${r.profileName} ${r.hasCameraButton ? '📷' : ''}`);
    });
  }

  if (withCamera.length > 0) {
    console.log('\n🎯 Profiles with camera button (BEST):');
    withCamera.forEach(r => {
      console.log(`   - ${r.profileName}`);
    });
  }

  console.log('\n❌ Failed profiles:');
  results.filter(r => !r.success).forEach(r => {
    console.log(`   - ${r.profileName}: ${r.error || r.title}`);
  });

  // Save results to file
  const resultsPath = path.join(__dirname, 'chrome_profiles_test_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);
}

testAllProfiles().catch(console.error);

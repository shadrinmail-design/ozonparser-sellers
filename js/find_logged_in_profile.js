/* eslint-disable no-console */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

puppeteer.use(StealthPlugin());

const CHROME_BASE = '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome';

async function testProfileLogin(profileName) {
  console.log(`\n🔍 Testing ${profileName}...`);

  const tempDir = `/tmp/chrome-test-${profileName.replace(/\s+/g, '_')}`;

  // Удаляем старый временный профиль
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Копируем куки и настройки
  const sourceProfile = path.join(CHROME_BASE, profileName);
  const targetProfile = path.join(tempDir, 'Default');

  if (!fs.existsSync(sourceProfile)) {
    console.log(`⚠️  Profile not found: ${profileName}`);
    return null;
  }

  fs.mkdirSync(targetProfile, { recursive: true });

  const filesToCopy = ['Cookies', 'Local Storage', 'Session Storage', 'Preferences'];

  for (const file of filesToCopy) {
    const source = path.join(sourceProfile, file);
    const target = path.join(targetProfile, file);

    try {
      if (fs.existsSync(source)) {
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        if (fs.statSync(source).isDirectory()) {
          execSync(`cp -r "${source}" "${target}"`, { stdio: 'ignore' });
        } else {
          fs.copyFileSync(source, target);
        }
      }
    } catch (error) {
      // Ignore errors
    }
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: false,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      userDataDir: tempDir,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--lang=ru-RU',
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--enable-automation'],
    });

    await new Promise(resolve => setTimeout(resolve, 2000));

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    await page.goto('https://www.ozon.ru/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    const loginInfo = await page.evaluate(() => {
      // Ищем признаки авторизации
      const accountButton = document.querySelector('[data-widget="profileMenu"], [href*="my/main"]');

      // Ищем кнопку "Войти"
      let loginButton = null;
      const buttons = Array.from(document.querySelectorAll('button, a'));
      loginButton = buttons.find(btn => btn.textContent.toLowerCase().includes('войти'));

      // Ищем имя пользователя
      let userName = null;
      if (accountButton) {
        const profileElements = accountButton.querySelectorAll('*');
        profileElements.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length > 0 && text.length < 50 && !text.includes('Войти')) {
            if (!userName || text.length > userName.length) {
              userName = text;
            }
          }
        });
      }

      return {
        isLoggedIn: !!accountButton && !loginButton,
        userName: userName,
        hasProfileMenu: !!accountButton,
        hasLoginButton: !!loginButton,
        title: document.title,
        bodyPreview: document.body.innerText.substring(0, 200)
      };
    });

    console.log(`   Logged in: ${loginInfo.isLoggedIn ? '✅ YES' : '❌ NO'}`);
    if (loginInfo.userName) {
      console.log(`   User: ${loginInfo.userName}`);
    }

    await browser.close();

    // Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      profileName,
      isLoggedIn: loginInfo.isLoggedIn,
      userName: loginInfo.userName
    };

  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    if (browser) {
      await browser.close();
    }
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    return null;
  }
}

async function findLoggedInProfile() {
  console.log('🔍 Searching for logged-in Ozon profile in Chrome...\n');

  const profiles = fs.readdirSync(CHROME_BASE)
    .filter(name => name === 'Default' || name.startsWith('Profile'))
    .sort();

  console.log(`Found ${profiles.length} profiles\n`);

  const results = [];

  for (const profile of profiles) {
    const result = await testProfileLogin(profile);
    if (result) {
      results.push(result);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 RESULTS');
  console.log('='.repeat(60));

  const loggedIn = results.filter(r => r.isLoggedIn);

  if (loggedIn.length > 0) {
    console.log('\n✅ Logged-in profiles found:');
    loggedIn.forEach(r => {
      console.log(`   - ${r.profileName}${r.userName ? ` (${r.userName})` : ''}`);
    });

    console.log('\n💡 To use this profile, run:');
    console.log(`   node copy_any_profile.js "${loggedIn[0].profileName}"`);
  } else {
    console.log('\n❌ No logged-in profiles found');
    console.log('\n💡 To fix:');
    console.log('   1. Open Chrome and log in to Ozon');
    console.log('   2. Note which profile you used');
    console.log('   3. Run: node copy_any_profile.js "ProfileName"');
  }

  const resultsPath = path.join(__dirname, 'profile_login_results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${resultsPath}`);
}

findLoggedInProfile().catch(console.error);

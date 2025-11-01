/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

async function copyChromeData() {
  console.log('🔧 Copying Chrome profile data...\n');

  const sourceProfile = '/Users/mikhailzhirnov/Library/Application Support/Google/Chrome/Profile 5';
  const targetProfile = '/tmp/chrome-puppeteer-profile/Default';

  // Создаем целевую директорию
  if (!fs.existsSync(targetProfile)) {
    fs.mkdirSync(targetProfile, { recursive: true });
  }

  // Копируем важные файлы
  const filesToCopy = [
    'Cookies',
    'Network/Cookies',
    'Local Storage',
    'Session Storage',
    'Preferences',
  ];

  console.log('📋 Copying files:');
  for (const file of filesToCopy) {
    const source = path.join(sourceProfile, file);
    const target = path.join(targetProfile, file);

    try {
      if (fs.existsSync(source)) {
        // Создаем родительскую директорию если нужно
        const targetDir = path.dirname(target);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Копируем файл или директорию
        if (fs.statSync(source).isDirectory()) {
          execSync(`cp -r "${source}" "${target}"`);
        } else {
          fs.copyFileSync(source, target);
        }
        console.log(`✅ ${file}`);
      } else {
        console.log(`⚠️  ${file} (not found)`);
      }
    } catch (error) {
      console.log(`❌ ${file}: ${error.message}`);
    }
  }

  console.log('\n✅ Profile data copied to /tmp/chrome-puppeteer-profile');
  console.log('');
  console.log('Now run: node test_real_chrome.js');
}

copyChromeData().catch(console.error);

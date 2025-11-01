#!/usr/bin/env node

/**
 * Массовый парсинг всех источников из настроек max.gogocrm.ru/ozon/settings
 * Использует локальный Chrome профиль с куками для обхода блокировки
 * 2025-11-01
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Источники из настроек
const SOURCES = [
  {
    name: 'guangzhouganxinmaoyidian',
    url: 'https://www.ozon.ru/seller/guangzhouganxinmaoyidian-3366398',
    scrolls: 100
  },
  {
    name: 'uilc',
    url: 'https://www.ozon.ru/seller/uilc-994084',
    scrolls: 100
  },
  {
    name: 'zavodskoy-magazin',
    url: 'https://www.ozon.ru/seller/zavodskoy-magazin-2676335/',
    scrolls: 100
  },
  {
    name: 'hengkk',
    url: 'https://www.ozon.ru/seller/hengkk-3268771',
    scrolls: 100
  },
  {
    name: 'zl',
    url: 'https://www.ozon.ru/seller/zl-2287375',
    scrolls: 100
  },
  {
    name: 'smart-open',
    url: 'https://www.ozon.ru/brand/smart-open-84705801/',
    scrolls: 100
  }
];

// Директории
const JS_DIR = __dirname;
const RESULTS_DIR = path.join(JS_DIR, 'results');
const PROFILE_DIR = '/tmp/chrome-puppeteer-profile';

// Проверка Chrome профиля
if (!fs.existsSync(PROFILE_DIR)) {
  console.log('⚠️  Chrome профиль не найден! Копирую куки...');
  try {
    execSync('node copy_chrome_cookies.js', { cwd: JS_DIR, stdio: 'inherit' });
    console.log('✅ Куки скопированы');
  } catch (err) {
    console.error('❌ Ошибка копирования кук:', err.message);
    process.exit(1);
  }
}

// Создание директории для результатов
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Функция парсинга одного источника
function parseSource(source) {
  console.log('\n' + '='.repeat(70));
  console.log(`📦 Парсинг: ${source.name}`);
  console.log(`🔗 URL: ${source.url}`);
  console.log(`📜 Прокруток: ${source.scrolls}`);
  console.log('='.repeat(70));

  const startUrl = source.url.replace('https://www.ozon.ru', '');
  const resultFile = path.join(RESULTS_DIR, `${source.name}_products.json`);

  const env = {
    ...process.env,
    OZON_START_URL: startUrl,
    MAX_SCROLLS: source.scrolls.toString(),
    CHROME_PROFILE: PROFILE_DIR,
    RESULT_FILE: resultFile
  };

  const startTime = Date.now();

  try {
    execSync('node src/index.js', {
      cwd: JS_DIR,
      env: env,
      stdio: 'inherit',
      timeout: 600000 // 10 минут на источник
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ Завершено: ${source.name} (${duration}s)`);

    // Проверка результатов
    if (fs.existsSync(resultFile)) {
      const data = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      console.log(`   📊 Товаров собрано: ${data.length || 0}`);
    }

    return { success: true, duration };

  } catch (err) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`\n❌ Ошибка: ${source.name} (${duration}s)`);
    console.error(`   ${err.message}`);
    return { success: false, error: err.message, duration };
  }
}

// Главная функция
async function main() {
  console.log('\n🚀 Запуск массового парсинга Ozon');
  console.log(`📁 Результаты будут сохранены в: ${RESULTS_DIR}`);
  console.log(`🔑 Используется Chrome профиль: ${PROFILE_DIR}`);
  console.log(`📦 Источников для парсинга: ${SOURCES.length}`);

  const results = [];
  const startTime = Date.now();

  for (let i = 0; i < SOURCES.length; i++) {
    const source = SOURCES[i];
    console.log(`\n[${i + 1}/${SOURCES.length}]`);

    const result = parseSource(source);
    results.push({
      source: source.name,
      url: source.url,
      ...result,
      timestamp: new Date().toISOString()
    });

    // Пауза между источниками (5 секунд)
    if (i < SOURCES.length - 1) {
      console.log('\n⏳ Пауза 5 секунд...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // Итоговая статистика
  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(1);
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  console.log('\n' + '='.repeat(70));
  console.log('📊 ИТОГОВАЯ СТАТИСТИКА');
  console.log('='.repeat(70));
  console.log(`✅ Успешно: ${successCount}`);
  console.log(`❌ Ошибок: ${failCount}`);
  console.log(`⏱️  Общее время: ${totalDuration}s`);
  console.log(`📁 Результаты: ${RESULTS_DIR}`);
  console.log('='.repeat(70));

  // Сохранение отчета
  const reportFile = path.join(RESULTS_DIR, 'parsing_report.json');
  fs.writeFileSync(reportFile, JSON.stringify({
    started_at: new Date(Date.now() - totalDuration * 1000).toISOString(),
    completed_at: new Date().toISOString(),
    total_duration_seconds: parseFloat(totalDuration),
    total_sources: SOURCES.length,
    success_count: successCount,
    fail_count: failCount,
    results: results
  }, null, 2));

  console.log(`\n📄 Отчет сохранен: ${reportFile}\n`);

  // Выход с кодом ошибки если были неудачи
  if (failCount > 0) {
    process.exit(1);
  }
}

// Запуск
if (require.main === module) {
  main().catch(err => {
    console.error('\n❌ Критическая ошибка:', err);
    process.exit(1);
  });
}

module.exports = { SOURCES, parseSource };

/**
 * Инструкция для копирования кук из браузера:
 *
 * 1. Откройте https://www.ozon.ru в вашем обычном браузере
 * 2. Откройте DevTools (F12 или Cmd+Option+I)
 * 3. Перейдите на вкладку Console
 * 4. Вставьте и выполните следующий код:
 *
 * copy(document.cookie)
 *
 * 5. Куки скопированы в буфер обмена
 * 6. Сохраните их в файл: /Users/mikhailzhirnov/claude/ozonparser/js/cookies.txt
 *
 * Или используйте этот альтернативный метод для получения JSON формата:
 *
 * copy(JSON.stringify(document.cookie.split('; ').map(c => {
 *   const [name, ...v] = c.split('=');
 *   return { name, value: v.join('='), domain: '.ozon.ru', path: '/' };
 * }), null, 2))
 */

console.log('📋 Инструкция для копирования кук:');
console.log('');
console.log('1. Откройте https://www.ozon.ru в вашем обычном браузере');
console.log('2. Откройте DevTools (F12 или Cmd+Option+I)');
console.log('3. Перейдите на вкладку Console');
console.log('4. Вставьте и выполните:');
console.log('');
console.log('   copy(document.cookie)');
console.log('');
console.log('5. Куки скопированы в буфер обмена');
console.log('6. Создайте файл cookies.txt в папке js/ и вставьте туда');
console.log('');
console.log('Для JSON формата используйте:');
console.log('');
console.log(`copy(JSON.stringify(document.cookie.split('; ').map(c => {
  const [name, ...v] = c.split('=');
  return { name, value: v.join('='), domain: '.ozon.ru', path: '/' };
}), null, 2))`);
console.log('');
console.log('Сохраните в cookies.json');

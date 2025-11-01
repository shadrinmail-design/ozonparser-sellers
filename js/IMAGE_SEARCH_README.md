# Поиск по изображению на Ozon.ru

Автоматизация поиска товаров по изображению на Ozon.ru через Safari.

## Проблема

Ozon.ru предоставляет функцию поиска по изображению, но:
- Она доступна **только в Safari** (browser detection)
- Блокирует Puppeteer даже с Safari user agent
- Требует реального браузера Safari для работы

## Решение

Используем AppleScript для автоматизации реального Safari браузера.

## Архитектура

```
┌─────────────────┐
│  Web Interface  │  (test_image_search.html)
│  HTTP Request   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Express Server  │  (image_search_server.js)
│  API: POST      │
│  /api/image-    │
│  search         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Node.js        │  (image_search.js)
│  Wrapper        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  AppleScript    │  (ozon_image_search.applescript)
│  Safari         │
│  Automation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Real Safari    │
│  Browser        │
│  (Ozon.ru)      │
└─────────────────┘
```

## Установка

### 1. Настройка Safari

**ВАЖНО!** Перед запуском нужно настроить Safari:

1. Откройте Safari
2. Safari → Settings (⌘,)
3. Advanced → включите "Show features for web developers"
4. Safari → Develop → включите "Allow JavaScript from Apple Events"

### 2. Установка зависимостей

```bash
cd /Users/mikhailzhirnov/claude/ozonparser/js
npm install express
```

## Использование

### Запуск тестового сервера

```bash
node image_search_server.js
```

Сервер запустится на `http://localhost:3001`

### Тестирование через веб-интерфейс

1. Откройте браузер: `http://localhost:3001`
2. Введите URL изображения товара
3. Нажмите "Искать"
4. Safari автоматически откроется и выполнит поиск

### Тестирование через командную строку

```bash
# Прямой запуск AppleScript
osascript ozon_image_search.applescript "https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg"

# Через Node.js wrapper
node image_search.js "https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg"
```

### Тестирование через API

```bash
curl -X POST http://localhost:3001/api/image-search \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg"}'
```

## Файлы проекта

- `ozon_image_search.applescript` - AppleScript для автоматизации Safari
- `image_search.js` - Node.js wrapper для запуска AppleScript
- `image_search_server.js` - Express сервер с API
- `test_image_search.html` - Веб-интерфейс для тестирования
- `IMAGE_SEARCH_README.md` - Эта документация

## Как это работает

1. **Пользователь** вводит URL изображения в веб-интерфейсе
2. **HTTP запрос** отправляется на Express сервер
3. **Node.js wrapper** вызывает AppleScript
4. **AppleScript** управляет Safari:
   - Открывает ozon.ru
   - Находит кнопку камеры (class="rn6_29")
   - Кликает на кнопку
   - Вводит URL изображения
   - Запускает поиск
5. **Результаты** возвращаются обратно

## Технические детали

### Найденные элементы на Ozon.ru

- **Кнопка камеры**: `button.rn6_29`
- **Поле поиска**: `input.ns2_29`
- **Подсказка**: "Теперь товары можно найти по фото"

### Browser Detection

Ozon определяет браузер и показывает кнопку камеры только для Safari.
Chrome не видит эту функцию.

### Anti-bot защита

Puppeteer блокируется Ozon даже с Safari user agent.
Поэтому используется реальный Safari браузер.

## Ограничения

1. **Требуется macOS** - AppleScript работает только на Mac
2. **Safari должен быть настроен** - см. раздел "Настройка Safari"
3. **Видимое окно** - Safari открывается как обычное окно (не headless)
4. **Медленно** - занимает 10-30 секунд на один поиск
5. **Не масштабируется** - только один поиск за раз

## Следующие шаги

- [ ] Парсинг результатов поиска
- [ ] Сохранение найденных товаров в БД
- [ ] Интеграция с основным веб-интерфейсом
- [ ] Обработка ошибок и retry логика
- [ ] Очередь запросов
- [ ] Логирование действий

## Примеры URL для тестирования

```
https://ir.ozone.ru/s3/multimedia-1-y/wc1000/7116784786.jpg
https://ir.ozone.ru/s3/multimedia-1-d/wc1000/7506575617.jpg
https://ir.ozone.ru/s3/multimedia-1-5/wc1000/8111879861.jpg
```

## Troubleshooting

### Ошибка: "Allow JavaScript from Apple Events"

**Решение**: Включите настройку в Safari (см. "Настройка Safari")

### Safari не открывается

**Решение**:
```bash
# Проверьте, что Safari может быть запущен
open -a Safari

# Проверьте permissions
osascript -e 'tell application "Safari" to activate'
```

### Timeout ошибки

**Решение**: Увеличьте timeout в `image_search.js`:
```javascript
timeout: 120000 // 2 минуты
```

## Контакты

Сохранено в: `/Users/mikhailzhirnov/claude/ozonparser/js/`
Документация: `~/.claude/CLAUDE.md`

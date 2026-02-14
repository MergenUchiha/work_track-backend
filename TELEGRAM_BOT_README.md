# WorkTrack Telegram Bot

Интеграция Telegram бота для WorkTrack API.

## Возможности

✅ **Реализовано:**
- `/start` - Регистрация и приветствие
- `/tasks` - Просмотр всех заказов (с учётом роли)
- `/create` - Создание нового заказа (для ADMIN/MANAGER)
- `/my` - Просмотр своих заказов
- `/profile` - Просмотр профиля
- `/stats` - Статистика заказов
- Inline кнопки для управления заказами:
  - 👍 Взять в работу
  - ▶️ Начать работу
  - ✅ Завершить
  - ❌ Отменить
  - ℹ️ Детали

## Установка

### 1. Установить зависимости

```bash
npm install nestjs-telegraf telegraf
```

### 2. Создать бота в Telegram

1. Найдите [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте команду `/newbot`
3. Следуйте инструкциям
4. Получите токен (примерно такой: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 3. Настроить переменные окружения

Добавьте в `.env`:

```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_USE_WEBHOOK=false
```

### 4. Применить миграцию базы данных

```bash
# Применить миграцию для добавления telegram_id
npm run prisma:migrate
```

Или вручную выполнить SQL:

```sql
ALTER TABLE "users" ADD COLUMN "telegram_id" BIGINT;
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id") WHERE "telegram_id" IS NOT NULL;
```

### 5. Запустить приложение

```bash
# Development
npm run start:dev

# Production
npm run build
npm run start:prod
```

## Архитектура

```
src/
 ├─ bot/
 │   ├─ bot.module.ts           # Главный модуль бота
 │   ├─ bot.service.ts          # Сервис бота (утилиты, уведомления)
 │   └─ handlers/
 │       ├─ start.handler.ts    # /start
 │       ├─ tasks.handler.ts    # /tasks
 │       ├─ create-task.handler.ts  # /create
 │       ├─ my-tasks.handler.ts     # /my, /profile, /stats
 │       └─ callback.handler.ts     # Обработка inline кнопок
```

## Использование

### Первый запуск

1. Напишите боту `/start`
2. Бот автоматически создаст вам аккаунт с ролью `WORKER`
3. Используйте команды для работы с заказами

### Основные команды

- `/start` - Начать работу с ботом
- `/tasks` - Показать все заказы
- `/create` - Создать новый заказ (только для ADMIN/MANAGER)
- `/my` - Мои заказы
- `/profile` - Мой профиль
- `/stats` - Статистика

### Работа с заказами

#### Создание заказа

```
/create
→ Введите название
→ Введите описание (или -)
→ Выберите приоритет
→ Введите дедлайн (ДД.ММ.ГГГГ ЧЧ:ММ или -)
```

#### Управление заказом

После каждого заказа отображаются кнопки:
- **👍 Взять в работу** - назначить заказ на себя
- **▶️ Начать работу** - изменить статус на IN_PROGRESS
- **✅ Завершить** - изменить статус на DONE
- **❌ Отменить** - отменить заказ
- **ℹ️ Детали** - показать полную информацию

## Интеграция с backend

Бот использует существующие сервисы:
- `OrdersService` - управление заказами
- `UsersService` - управление пользователями
- `AuditsService` - логирование действий

Все действия через бота записываются в audit logs.

## Роли и права доступа

| Действие | ADMIN | MANAGER | WORKER |
|----------|-------|---------|--------|
| Создание заказов | ✅ | ✅ | ❌ |
| Просмотр всех заказов | ✅ | ✅ | ❌ |
| Просмотр своих заказов | ✅ | ✅ | ✅ |
| Взять в работу | ✅ | ✅ | ✅ (если назначен) |
| Завершить заказ | ✅ | ✅ | ✅ (если назначен) |
| Отменить заказ | ✅ | ✅ | ❌ |

## Webhook vs Polling

### Development (Polling)

```env
TELEGRAM_USE_WEBHOOK=false
```

Бот будет опрашивать Telegram API каждые несколько секунд.

### Production (Webhook)

```env
TELEGRAM_USE_WEBHOOK=true
TELEGRAM_WEBHOOK_DOMAIN=https://yourdomain.com
TELEGRAM_WEBHOOK_PATH=/telegram-webhook
```

Telegram будет отправлять обновления на ваш сервер.

**Требования:**
- HTTPS с валидным сертификатом
- Публично доступный домен

## Уведомления

Бот отправляет уведомления при:
- ✅ Завершении заказа (создателю заказа)
- ❌ Отмене заказа (исполнителю)
- 🆕 Назначении заказа (исполнителю)

Пример использования:

```typescript
// В OrdersService
async changeStatus(...) {
  // ... логика изменения статуса
  
  // Отправить уведомление
  if (order.status === OrderStatus.DONE && order.assignedToId) {
    await this.botService.sendNotification(
      order.createdBy.id,
      `✅ Заказ "${order.title}" завершён пользователем ${order.assignedTo.name}`
    );
  }
}
```

## Troubleshooting

### Бот не отвечает

1. Проверьте токен в `.env`
2. Проверьте логи: `docker-compose logs -f app`
3. Убедитесь, что приложение запущено

### Ошибка "User not found"

1. Напишите боту `/start` для создания аккаунта
2. Проверьте, что применена миграция с `telegram_id`

### Webhook не работает

1. Убедитесь, что домен доступен по HTTPS
2. Проверьте сертификат SSL
3. Проверьте логи Telegram: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Расширение функциональности

### Добавить новую команду

1. Создайте handler в `src/bot/handlers/`
2. Используйте декоратор `@Command('commandname')`
3. Зарегистрируйте в `bot.module.ts`

Пример:

```typescript
@Update()
@Injectable()
export class HelpHandler {
  @Command('help')
  async onHelp(ctx: BotContext) {
    await ctx.reply('Справка по командам...');
  }
}
```

### Добавить inline кнопку

В `callback.handler.ts`:

```typescript
@Action(/^myaction_(.+)$/)
async onMyAction(@Ctx() ctx: any) {
  const param = ctx.match[1];
  // ... ваша логика
}
```

## Лицензия

UNLICENSED — private project
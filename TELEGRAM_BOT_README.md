# WorkTrack Telegram Bot

Optional Telegram interface for the WorkTrack API. The service runs fine without it — everything below applies only when the bot is switched on.

## What it does

- `/start` — registers the Telegram account and shows the command list
- `/tasks` — lists orders, filtered by the caller's role
- `/create` — guided order creation (ADMIN / MANAGER)
- `/my` — orders you created or are assigned to
- `/profile` — your profile and personal statistics
- `/stats` — order statistics
- Inline buttons on every order card:
  - 👍 Pick up
  - ▶️ Start
  - ✅ Complete
  - ❌ Cancel
  - ℹ️ Details

## Setup

### 1. Create a bot

1. Open [@BotFather](https://t.me/BotFather) in Telegram
2. Send `/newbot`
3. Follow the prompts
4. Copy the token — it looks like `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### 2. Configure the environment

Add to `.env`:

```env
TELEGRAM_BOT_ENABLED=true
TELEGRAM_BOT_TOKEN=your-bot-token-here
TELEGRAM_USE_WEBHOOK=false
```

`TELEGRAM_BOT_ENABLED` is the master switch. Startup validation refuses to boot with the bot enabled and no token, rather than silently running without it.

### 3. Apply migrations

The bot needs the `telegram_id` column on `users`:

```bash
npm run prisma:migrate
```

### 4. Run

```bash
npm run start:dev     # development
npm run build && npm run start:prod   # production
```

## Architecture

```text
src/bot/
 ├─ bot.module.ts                # dynamic module, wired only when enabled
 ├─ bot.service.ts               # shared helpers, user lookup, notifications
 └─ handlers/
     ├─ start.handler.ts         # /start
     ├─ tasks.handler.ts         # /tasks
     ├─ create-task.handler.ts   # /create wizard
     ├─ my-tasks.handler.ts      # /my, /profile, /stats
     └─ callback.handler.ts      # inline buttons, cancellation flow
```

The bot calls the same services the REST API uses — `OrdersService`, `UsersService`, `AuditsService` — so role checks, the status machine and the audit trail apply identically. Actions taken in Telegram appear in the audit log exactly like HTTP requests.

## Usage

### First contact

Send `/start`. An account is provisioned automatically with the `WORKER` role and linked to your Telegram id.

> Anyone who can reach the bot gets a WORKER account this way. Keep the bot private, or restrict who may message it, if that is not what you want.

### Creating an order

```text
/create
→ send the title
→ send a description (or "-" to skip)
→ choose a priority
→ send a deadline as DD.MM.YYYY HH:MM (or "-" to skip)
```

Send `/cancel` at any point to abort.

### Cancelling an order

Press ❌ Cancel, then send the reason as the next message — at least 10 characters, the same rule the API enforces. Send `/cancel` instead to abort without changing the order.

## Roles

| Action              | ADMIN | MANAGER | WORKER            |
| ------------------- | :---: | :-----: | :---------------: |
| Create orders       |  ✅   |   ✅    |        ❌         |
| View all orders     |  ✅   |   ✅    |        ❌         |
| View own orders     |  ✅   |   ✅    |        ✅         |
| Pick up an order    |  ✅   |   ✅    |        ❌         |
| Start / complete    |  ✅   |   ✅    | ✅ (if assigned)  |
| Cancel an order     |  ✅   |   ✅    |        ❌         |

## Polling vs webhook

Development — long polling:

```env
TELEGRAM_USE_WEBHOOK=false
```

Production — webhook:

```env
TELEGRAM_USE_WEBHOOK=true
TELEGRAM_WEBHOOK_DOMAIN=https://your-domain.com
TELEGRAM_WEBHOOK_PATH=/telegram-webhook
```

Webhook mode requires a publicly reachable domain with a valid HTTPS certificate. Startup validation rejects webhook mode without a domain.

## Notifications

`BotService.sendNotification(userId, message)` delivers a message to any user who has linked a Telegram account.

Currently one notification is wired up: when an order is completed, its creator is notified. Adding more is a matter of calling the same method from the relevant service.

## Troubleshooting

**The bot does not respond**

1. Check `TELEGRAM_BOT_ENABLED=true` and the token in `.env`
2. Check the logs: `docker compose logs -f app`
3. Confirm the application actually started

**"User not found"**

Send `/start` first — it creates the account and links your Telegram id. Also confirm the `telegram_id` migration was applied.

**Webhook not delivering**

1. Confirm the domain is reachable over HTTPS with a valid certificate
2. Ask Telegram what it thinks: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

## Extending

Add a command:

```typescript
@Update()
@Injectable()
export class HelpHandler {
  @Command('help')
  async onHelp(ctx: BotContext) {
    await ctx.reply('Available commands: ...');
  }
}
```

Register the handler in `bot.module.ts`.

Add an inline button action in `callback.handler.ts`:

```typescript
@Action(/^myaction_(.+)$/)
async onMyAction(@Ctx() ctx: any) {
  const param = ctx.match[1];
  // ...
}
```

## License

UNLICENSED — private project.

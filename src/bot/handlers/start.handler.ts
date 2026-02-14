import { Injectable, Logger } from '@nestjs/common';
import { Start, Update } from 'nestjs-telegraf';
import { BotContext, BotService } from '../bot.service';

@Update()
@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(private readonly botService: BotService) {}

  @Start()
  async onStart(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);

      const welcomeMessage = `
👋 <b>Добро пожаловать в WorkTrack Bot!</b>

Привет, <b>${user.name}</b>!
Ваша роль: ${this.botService.formatRole(user.role)}

<b>Доступные команды:</b>

📋 /tasks - Все заказы
➕ /create - Создать заказ
📝 /my - Мои заказы
👤 /profile - Мой профиль
📊 /stats - Статистика

<b>Что умеет бот:</b>
• Показывать список заказов
• Создавать новые заказы
• Брать заказы в работу
• Завершать заказы
• Отменять заказы
• Получать уведомления

Используйте команды выше для начала работы!
      `.trim();

      await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });

      this.logger.log(`User ${user.id} (@${ctx.from?.username}) started the bot`);
    } catch (error) {
      this.logger.error(`Error in /start handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }
}

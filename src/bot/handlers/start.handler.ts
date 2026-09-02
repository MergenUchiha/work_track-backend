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
👋 <b>Welcome to WorkTrack Bot!</b>

Hi, <b>${user.name}</b>!
Your role: ${this.botService.formatRole(user.role)}

<b>Commands:</b>

📋 /tasks - All orders
➕ /create - Create an order
📝 /my - My orders
👤 /profile - My profile
📊 /stats - Statistics

<b>What this bot can do:</b>
• List orders
• Create new orders
• Pick up orders
• Complete orders
• Cancel orders
• Send notifications

Use one of the commands above to get started.
      `.trim();

      await ctx.reply(welcomeMessage, { parse_mode: 'HTML' });

      this.logger.log(`User ${user.id} (@${ctx.from?.username}) started the bot`);
    } catch (error) {
      this.logger.error(`Error in /start handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Something went wrong. Please try again later.');
    }
  }
}

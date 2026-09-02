import { Injectable, Logger } from '@nestjs/common';
import { Command, Ctx, Update } from 'nestjs-telegraf';
import { BotContext, BotService } from '../bot.service';

@Update()
@Injectable()
export class ClearHandler {
  private readonly logger = new Logger(ClearHandler.name);

  constructor(private readonly botService: BotService) {}

  /**
   * Clears the conversation: the bot's replies and the user's commands alike.
   *
   * Messages older than 48 hours cannot be deleted — a Bot API limit — so a
   * long-running chat may keep some history.
   */
  @Command('clear')
  async onClear(@Ctx() ctx: BotContext) {
    const chatId = ctx.chat?.id;

    if (!chatId) {
      return;
    }

    try {
      const deleted = await this.botService.clearChat(chatId);

      const notice = await ctx.reply(
        deleted > 0
          ? `🧹 Removed ${deleted} message${deleted === 1 ? '' : 's'}.`
          : '🧹 Nothing left to remove.',
      );

      // Clear away the confirmation itself, and the /clear command with it.
      setTimeout(() => {
        void ctx.telegram.deleteMessage(chatId, notice.message_id).catch(() => undefined);

        const commandMessageId = (ctx.message as { message_id?: number } | undefined)?.message_id;
        if (commandMessageId) {
          void ctx.telegram.deleteMessage(chatId, commandMessageId).catch(() => undefined);
        }
      }, 3000);
    } catch (error) {
      this.logger.error(`Error in /clear handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not clear the chat.');
    }
  }
}

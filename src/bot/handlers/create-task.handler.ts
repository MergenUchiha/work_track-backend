import { Injectable, Logger } from '@nestjs/common';
import { Command, Update, Ctx, On } from 'nestjs-telegraf';
import { BotContext, BotService } from '../bot.service';
import { OrderPriority, UserRole } from '@prisma/client';
import { Markup } from 'telegraf';
import { OrdersService } from 'src/modules/orders/orders.service';

interface CreateTaskSession {
  step: 'title' | 'description' | 'priority' | 'deadline';
  data: {
    title?: string;
    description?: string;
    priority?: OrderPriority;
    deadline?: string;
  };
}

@Update()
@Injectable()
export class CreateTaskHandler {
  private readonly logger = new Logger(CreateTaskHandler.name);
  private readonly sessions = new Map<number, CreateTaskSession>();

  constructor(
    private readonly botService: BotService,
    private readonly ordersService: OrdersService,
  ) {}

  @Command('create')
  async onCreate(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);
      ctx.user = user;

      if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
        await ctx.reply('❌ Only administrators and managers can create orders.');
        return;
      }

      // Start a fresh wizard session
      this.sessions.set(ctx.from!.id, {
        step: 'title',
        data: {},
      });

      await ctx.reply(
        '📝 <b>New order</b>\n\n' +
          'Step 1/4: send the order <b>title</b>:\n' +
          '<i>(for example: "Build the authentication module")</i>\n\n' +
          'Send /cancel to stop.',
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in /create handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not start the order wizard.');
    }
  }

  @Command('cancel')
  async onCancel(ctx: BotContext) {
    const session = this.sessions.get(ctx.from!.id);
    if (session) {
      this.sessions.delete(ctx.from!.id);
      await ctx.reply('❌ Order creation cancelled.');
    } else {
      await ctx.reply('ℹ️ There is no order being created right now.');
    }
  }

  @On('text')
  async onText(@Ctx() ctx: BotContext & { message: { text: string } }) {
    const session = this.sessions.get(ctx.from!.id);
    if (!session) return;

    try {
      const text = ctx.message.text;

      switch (session.step) {
        case 'title':
          if (text.length < 3) {
            await ctx.reply('❌ The title must be at least 3 characters.');
            return;
          }
          session.data.title = text;
          session.step = 'description';
          await ctx.reply(
            '📝 Step 2/4: send a <b>description</b>:\n' + '<i>(or send "-" to skip)</i>',
            { parse_mode: 'HTML' },
          );
          break;

        case 'description':
          session.data.description = text === '-' ? undefined : text;
          session.step = 'priority';
          await ctx.reply('🎯 Step 3/4: choose a <b>priority</b>:', {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback('🟢 Low', 'priority_LOW'),
                Markup.button.callback('🟡 Medium', 'priority_MEDIUM'),
                Markup.button.callback('🔴 High', 'priority_HIGH'),
              ],
            ]).reply_markup,
          });
          break;

        case 'deadline': {
          // "-" skips the deadline, as offered in the prompt
          if (text.trim() === '-') {
            session.data.deadline = undefined;
            await this.createOrder(ctx, session);
            break;
          }

          const parsedDate = this.parseDate(text);
          if (!parsedDate) {
            await ctx.reply(
              '❌ Invalid date.\n' +
                'Use the format DD.MM.YYYY HH:MM\n' +
                'For example: 31.12.2026 23:59\n' +
                'The deadline must be in the future.',
            );
            return;
          }

          session.data.deadline = parsedDate.toISOString();
          await this.createOrder(ctx, session);
          break;
        }
      }
    } catch (error) {
      this.logger.error(`Error in text handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Something went wrong. Please try again.');
    }
  }

  @On('callback_query')
  async onCallback(@Ctx() ctx: any) {
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData?.startsWith('priority_')) return;

    const session = this.sessions.get(ctx.from.id);
    if (!session || session.step !== 'priority') return;

    try {
      const priority = callbackData.replace('priority_', '') as OrderPriority;
      session.data.priority = priority;
      session.step = 'deadline';

      await ctx.answerCbQuery();
      await ctx.editMessageText(`🎯 Priority: ${this.botService.formatPriority(priority)}`, {
        parse_mode: 'HTML',
      });

      await ctx.reply(
        '⏰ Step 4/4: send a <b>deadline</b>:\n' +
          'Format: <code>DD.MM.YYYY HH:MM</code>\n' +
          'For example: <code>31.12.2026 23:59</code>\n\n' +
          '<i>(or send "-" to skip)</i>',
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in callback handler: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Error');
    }
  }

  private async createOrder(ctx: BotContext, session: CreateTaskSession) {
    const user = await this.botService.getOrCreateUser(ctx);

    try {
      const order = await this.ordersService.create(
        {
          title: session.data.title!,
          description: session.data.description,
          priority: session.data.priority || OrderPriority.MEDIUM,
          deadline: session.data.deadline,
        },
        user.id,
        user.role,
      );

      await ctx.reply(
        '✅ <b>Order created</b>\n\n' +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Status: ${this.botService.formatStatus(order.status)}\n` +
          `🎯 Priority: ${this.botService.formatPriority(order.priority)}\n` +
          `${order.deadline ? `⏰ Deadline: ${this.botService.formatDate(order.deadline)}\n` : ''}` +
          `\n<code>ID: ${order.id}</code>`,
        { parse_mode: 'HTML' },
      );

      this.sessions.delete(ctx.from!.id);
    } catch (error) {
      this.logger.error(`Failed to create order: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not create the order.\n' + 'Please check the values you entered.');
    }
  }

  private parseDate(text: string): Date | null {
    if (text === '-') return null;

    try {
      // Expected format: DD.MM.YYYY HH:MM
      const regex = /^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/;
      const match = text.match(regex);

      if (!match) return null;

      const [, day, month, year, hours, minutes] = match;
      const date = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hours),
        parseInt(minutes),
      );

      if (isNaN(date.getTime())) return null;
      if (date < new Date()) return null; // a deadline in the past is rejected

      return date;
    } catch {
      return null;
    }
  }
}

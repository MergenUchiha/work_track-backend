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

      // Проверяем права
      if (user.role !== UserRole.ADMIN && user.role !== UserRole.MANAGER) {
        await ctx.reply('❌ Только администраторы и менеджеры могут создавать заказы.');
        return;
      }

      // Инициализируем сессию
      this.sessions.set(ctx.from!.id, {
        step: 'title',
        data: {},
      });

      await ctx.reply(
        '📝 <b>Создание нового заказа</b>\n\n' +
          'Шаг 1/4: Введите <b>название</b> заказа:\n' +
          '<i>(например: "Разработка модуля аутентификации")</i>\n\n' +
          'Отправьте /cancel для отмены.',
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in /create handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Не удалось начать создание заказа.');
    }
  }

  @Command('cancel')
  async onCancel(ctx: BotContext) {
    const session = this.sessions.get(ctx.from!.id);
    if (session) {
      this.sessions.delete(ctx.from!.id);
      await ctx.reply('❌ Создание заказа отменено.');
    } else {
      await ctx.reply('ℹ️ Нет активного процесса создания заказа.');
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
            await ctx.reply('❌ Название должно содержать минимум 3 символа.');
            return;
          }
          session.data.title = text;
          session.step = 'description';
          await ctx.reply(
            '📝 Шаг 2/4: Введите <b>описание</b> заказа:\n' +
              '<i>(или отправьте "-" чтобы пропустить)</i>',
            { parse_mode: 'HTML' },
          );
          break;

        case 'description':
          session.data.description = text === '-' ? undefined : text;
          session.step = 'priority';
          await ctx.reply('🎯 Шаг 3/4: Выберите <b>приоритет</b>:', {
            parse_mode: 'HTML',
            reply_markup: Markup.inlineKeyboard([
              [
                Markup.button.callback('🟢 Низкий', 'priority_LOW'),
                Markup.button.callback('🟡 Средний', 'priority_MEDIUM'),
                Markup.button.callback('🔴 Высокий', 'priority_HIGH'),
              ],
            ]).reply_markup,
          });
          break;

        case 'deadline':
          // Парсим дату
          const parsedDate = this.parseDate(text);
          if (!parsedDate) {
            await ctx.reply(
              '❌ Некорректный формат даты.\n' +
                'Используйте формат: ДД.ММ.ГГГГ ЧЧ:ММ\n' +
                'Например: 31.12.2026 23:59',
            );
            return;
          }

          session.data.deadline = parsedDate.toISOString();

          // Создаём заказ
          await this.createOrder(ctx, session);
          break;
      }
    } catch (error) {
      this.logger.error(`Error in text handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Произошла ошибка. Попробуйте снова.');
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
      await ctx.editMessageText(`🎯 Приоритет: ${this.botService.formatPriority(priority)}`, {
        parse_mode: 'HTML',
      });

      await ctx.reply(
        '⏰ Шаг 4/4: Введите <b>дедлайн</b>:\n' +
          'Формат: <code>ДД.ММ.ГГГГ ЧЧ:ММ</code>\n' +
          'Например: <code>31.12.2026 23:59</code>\n\n' +
          '<i>(или отправьте "-" чтобы пропустить)</i>',
        { parse_mode: 'HTML' },
      );
    } catch (error) {
      this.logger.error(`Error in callback handler: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Ошибка');
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
        '✅ <b>Заказ успешно создан!</b>\n\n' +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Статус: ${this.botService.formatStatus(order.status)}\n` +
          `🎯 Приоритет: ${this.botService.formatPriority(order.priority)}\n` +
          `${order.deadline ? `⏰ Дедлайн: ${this.botService.formatDate(order.deadline)}\n` : ''}` +
          `\n<code>ID: ${order.id}</code>`,
        { parse_mode: 'HTML' },
      );

      this.sessions.delete(ctx.from!.id);
    } catch (error) {
      this.logger.error(`Failed to create order: ${error.message}`, error.stack);
      await ctx.reply('❌ Не удалось создать заказ.\n' + 'Возможно, вы ввели некорректные данные.');
    }
  }

  private parseDate(text: string): Date | null {
    if (text === '-') return null;

    try {
      // Формат: ДД.ММ.ГГГГ ЧЧ:ММ
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

      // Проверяем валидность
      if (isNaN(date.getTime())) return null;
      if (date < new Date()) return null; // Дедлайн не может быть в прошлом

      return date;
    } catch {
      return null;
    }
  }
}

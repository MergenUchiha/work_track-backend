import { Injectable, Logger } from '@nestjs/common';
import { Command, Update } from 'nestjs-telegraf';
import { BotContext, BotService } from '../bot.service';
import { Markup } from 'telegraf';
import { OrdersService } from 'src/modules/orders/orders.service';

@Update()
@Injectable()
export class TasksHandler {
  private readonly logger = new Logger(TasksHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly ordersService: OrdersService,
  ) {}

  @Command('tasks')
  async onTasks(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);
      ctx.user = user;

      // Получаем заказы с учётом роли пользователя
      const result = await this.ordersService.findAll(
        {
          page: 1,
          limit: 10,
          sortBy: 'createdAt',
          sortOrder: 'desc',
        },
        user.id,
        user.role,
      );

      if (result.data.length === 0) {
        await ctx.reply('📋 Заказов пока нет.');
        return;
      }

      const header = `📋 <b>Список заказов</b> (${result.meta.total} шт.)\n\n`;

      for (const order of result.data.slice(0, 5)) {
        const orderMessage = this.formatOrder(order);
        const keyboard = this.createOrderKeyboard(order, user.role);

        await ctx.reply(orderMessage, {
          parse_mode: 'HTML',
          reply_markup: keyboard.reply_markup,
        });
      }

      if (result.meta.total > 5) {
        await ctx.reply(
          `\n<i>Показано 5 из ${result.meta.total} заказов.</i>\n` +
            `Используйте веб-интерфейс для просмотра всех заказов.`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (error) {
      this.logger.error(`Error in /tasks handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Не удалось загрузить заказы. Попробуйте позже.');
    }
  }

  private formatOrder(order: any): string {
    const isOverdue = this.botService.isOverdue(order.deadline, order.status);
    const overdueWarning = isOverdue ? '\n⚠️ <b>ПРОСРОЧЕН!</b>' : '';

    return `
🔹 <b>${order.title}</b>
${order.description ? `\n${order.description.substring(0, 150)}${order.description.length > 150 ? '...' : ''}` : ''}

📊 Статус: ${this.botService.formatStatus(order.status)}
🎯 Приоритет: ${this.botService.formatPriority(order.priority)}
👤 Создатель: ${order.createdBy.name}
${order.assignedTo ? `👷 Исполнитель: ${order.assignedTo.name}` : '👷 Исполнитель: <i>не назначен</i>'}
${order.deadline ? `⏰ Дедлайн: ${this.botService.formatDate(order.deadline)}${overdueWarning}` : ''}

<code>ID: ${order.id}</code>
    `.trim();
  }

  private createOrderKeyboard(order: any, userRole: string) {
    const buttons: ReturnType<typeof Markup.button.callback>[] = [];

    // Кнопка "Взять в работу" (если заказ NEW и не назначен)
    if (order.status === 'NEW' && !order.assignedToId) {
      if (userRole === 'ADMIN' || userRole === 'MANAGER') {
        buttons.push(Markup.button.callback('👍 Взять в работу', `take_${order.id}`));
      }
    }

    // Кнопка "В работу" (если назначен на текущего пользователя и статус NEW)
    if (order.status === 'NEW' && order.assignedToId) {
      buttons.push(Markup.button.callback('▶️ Начать работу', `start_${order.id}`));
    }

    // Кнопка "Завершить" (если в работе и исполнитель - текущий пользователь)
    if (order.status === 'IN_PROGRESS') {
      buttons.push(Markup.button.callback('✅ Завершить', `complete_${order.id}`));
    }

    // Кнопка "Отменить" (для админов и менеджеров)
    if (order.status !== 'DONE' && order.status !== 'CANCELLED') {
      if (userRole === 'ADMIN' || userRole === 'MANAGER') {
        buttons.push(Markup.button.callback('❌ Отменить', `cancel_${order.id}`));
      }
    }

    // Кнопка "Детали"
    buttons.push(Markup.button.callback('ℹ️ Детали', `details_${order.id}`));

    // Группируем по 2 кнопки в ряд
    const keyboard: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }

    return Markup.inlineKeyboard(keyboard);
  }
}

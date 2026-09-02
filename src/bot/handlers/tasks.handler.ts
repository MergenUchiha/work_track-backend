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

      // Role-aware listing: workers only see their own orders
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
        await ctx.reply('📋 There are no orders yet.');
        return;
      }

      const header = `📋 <b>Orders</b> (${result.meta.total})\n\n`;

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
          `\n<i>Showing 5 of ${result.meta.total} orders.</i>\n` +
            `Use the web interface to see all of them.`,
          { parse_mode: 'HTML' },
        );
      }
    } catch (error) {
      this.logger.error(`Error in /tasks handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not load orders. Please try again later.');
    }
  }

  private formatOrder(order: any): string {
    const isOverdue = this.botService.isOverdue(order.deadline, order.status);
    const overdueWarning = isOverdue ? '\n⚠️ <b>OVERDUE</b>' : '';

    return `
🔹 <b>${order.title}</b>
${order.description ? `\n${order.description.substring(0, 150)}${order.description.length > 150 ? '...' : ''}` : ''}

📊 Status: ${this.botService.formatStatus(order.status)}
🎯 Priority: ${this.botService.formatPriority(order.priority)}
👤 Created by: ${order.createdBy.name}
${order.assignedTo ? `👷 Assignee: ${order.assignedTo.name}` : '👷 Assignee: <i>unassigned</i>'}
${order.deadline ? `⏰ Deadline: ${this.botService.formatDate(order.deadline)}${overdueWarning}` : ''}

<code>ID: ${order.id}</code>
    `.trim();
  }

  private createOrderKeyboard(order: any, userRole: string) {
    const buttons: ReturnType<typeof Markup.button.callback>[] = [];

    // Unassigned NEW orders can be picked up by managers
    if (order.status === 'NEW' && !order.assignedToId) {
      if (userRole === 'ADMIN' || userRole === 'MANAGER') {
        buttons.push(Markup.button.callback('👍 Pick up', `take_${order.id}`));
      }
    }

    // Assigned NEW orders can be started
    if (order.status === 'NEW' && order.assignedToId) {
      buttons.push(Markup.button.callback('▶️ Start', `start_${order.id}`));
    }

    // Orders in progress can be completed
    if (order.status === 'IN_PROGRESS') {
      buttons.push(Markup.button.callback('✅ Complete', `complete_${order.id}`));
    }

    // Managers may cancel anything that is not finished
    if (order.status !== 'DONE' && order.status !== 'CANCELLED') {
      if (userRole === 'ADMIN' || userRole === 'MANAGER') {
        buttons.push(Markup.button.callback('❌ Cancel', `cancel_${order.id}`));
      }
    }

    buttons.push(Markup.button.callback('ℹ️ Details', `details_${order.id}`));

    // Two buttons per row
    const keyboard: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      keyboard.push(buttons.slice(i, i + 2));
    }

    return Markup.inlineKeyboard(keyboard);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Action, Update, Ctx, On } from 'nestjs-telegraf';
import { BotService } from '../bot.service';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from 'src/modules/orders/orders.service';

/** Minimum length accepted by CancelOrderDto. */
const MIN_CANCEL_REASON_LENGTH = 10;

@Update()
@Injectable()
export class CallbackHandler {
  private readonly logger = new Logger(CallbackHandler.name);

  /**
   * Telegram user id -> order awaiting a cancellation reason.
   *
   * In-memory on purpose: the state lives for one short exchange. A
   * multi-instance deployment would need Redis here.
   */
  private readonly pendingCancellations = new Map<number, string>();

  constructor(
    private readonly botService: BotService,
    private readonly ordersService: OrdersService,
  ) {}

  /** Assigns the order to whoever pressed the button. */
  @Action(/^take_(.+)$/)
  async onTake(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      const order = await this.ordersService.assign(
        orderId,
        { assignedToId: user.id },
        user.id,
        user.role,
      );

      await ctx.editMessageText(
        `✅ <b>Order assigned to you</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Status: ${this.botService.formatStatus(order.status)}\n\n` +
          `You can start working on it now.\n` +
          `Use /my to see your orders.`,
        { parse_mode: 'HTML' },
      );

      this.logger.log(`User ${user.id} took order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in take action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not assign the order');
      await ctx.reply('❌ ' + (error.message || 'Something went wrong'));
    }
  }

  /** Moves the order to IN_PROGRESS. */
  @Action(/^start_(.+)$/)
  async onStart(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      const order = await this.ordersService.changeStatus(
        orderId,
        { status: OrderStatus.IN_PROGRESS },
        user.id,
        user.role,
      );

      await ctx.editMessageText(
        `⚙️ <b>Order in progress</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Status: ${this.botService.formatStatus(order.status)}\n\n` +
          `Good luck! 💪`,
        { parse_mode: 'HTML' },
      );

      this.logger.log(`User ${user.id} started order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in start action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not start the order');
      await ctx.reply('❌ ' + (error.message || 'Something went wrong'));
    }
  }

  /** Moves the order to DONE and notifies its creator. */
  @Action(/^complete_(.+)$/)
  async onComplete(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      const order = await this.ordersService.changeStatus(
        orderId,
        { status: OrderStatus.DONE },
        user.id,
        user.role,
      );

      await ctx.editMessageText(
        `✅ <b>Order completed</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Status: ${this.botService.formatStatus(order.status)}\n\n` +
          `Nice work! 🎉`,
        { parse_mode: 'HTML' },
      );

      if (order.createdBy.id !== user.id && order.createdBy.telegramId) {
        await this.botService.sendNotification(
          order.createdBy.id,
          `✅ <b>Order completed</b>\n\n` +
            `${user.name} completed the order:\n` +
            `🔹 <b>${order.title}</b>`,
        );
      }

      this.logger.log(`User ${user.id} completed order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in complete action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not complete the order');
      await ctx.reply('❌ ' + (error.message || 'Something went wrong'));
    }
  }

  /**
   * Starts the cancellation flow: the reason arrives in the next message,
   * which onCancellationReason() below picks up.
   */
  @Action(/^cancel_(.+)$/)
  async onCancel(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      this.pendingCancellations.set(ctx.from.id, orderId);

      await ctx.editMessageText(
        '❌ <b>Cancel order</b>\n\n' +
          'Send the reason for cancelling:\n' +
          `<i>(at least ${MIN_CANCEL_REASON_LENGTH} characters)</i>\n\n` +
          'Send /cancel to abort.',
        { parse_mode: 'HTML' },
      );

      this.logger.log(`User ${user.id} initiated cancel for order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in cancel action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not cancel the order');
    }
  }

  /**
   * Second half of the cancellation flow. Ignores every message that does
   * not belong to a pending cancellation, so other text handlers still work.
   */
  @On('text')
  async onCancellationReason(@Ctx() ctx: any) {
    const telegramId = ctx.from?.id;
    const orderId = telegramId ? this.pendingCancellations.get(telegramId) : undefined;

    if (!orderId) {
      return;
    }

    const reason: string = ctx.message?.text ?? '';

    if (reason.trim() === '/cancel') {
      this.pendingCancellations.delete(telegramId);
      await ctx.reply('ℹ️ Cancellation aborted, the order was left unchanged.');
      return;
    }

    if (reason.trim().length < MIN_CANCEL_REASON_LENGTH) {
      await ctx.reply(
        `❌ The reason must be at least ${MIN_CANCEL_REASON_LENGTH} characters. Please try again.`,
      );
      return;
    }

    try {
      const user = await this.botService.getOrCreateUser(ctx);
      const order = await this.ordersService.cancel(
        orderId,
        { reason: reason.trim() },
        user.id,
        user.role,
      );

      this.pendingCancellations.delete(telegramId);

      await ctx.reply(
        `❌ <b>Order cancelled</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Status: ${this.botService.formatStatus(order.status)}\n` +
          `📝 Reason: ${reason.trim()}`,
        { parse_mode: 'HTML' },
      );

      this.logger.log(`User ${user.id} cancelled order ${orderId}`);
    } catch (error) {
      this.pendingCancellations.delete(telegramId);
      this.logger.error(`Failed to cancel order: ${error.message}`, error.stack);
      await ctx.reply('❌ ' + (error.message || 'Could not cancel the order'));
    }
  }

  /** Shows the full order card. */
  @Action(/^details_(.+)$/)
  async onDetails(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      const order = await this.ordersService.findOne(orderId, user.id, user.role);

      const isOverdue = this.botService.isOverdue(order.deadline, order.status);
      const overdueWarning = isOverdue ? '\n⚠️ <b>OVERDUE</b>' : '';

      const detailsMessage = `
📄 <b>Order details</b>

<b>Title:</b>
${order.title}

<b>Description:</b>
${order.description || '<i>not provided</i>'}

📊 <b>Status:</b> ${this.botService.formatStatus(order.status)}
🎯 <b>Priority:</b> ${this.botService.formatPriority(order.priority)}
${order.deadline ? `⏰ <b>Deadline:</b> ${this.botService.formatDate(order.deadline)}${overdueWarning}` : ''}

👤 <b>Created by:</b> ${order.createdBy.name} (${order.createdBy.email})
${order.assignedTo ? `👷 <b>Assignee:</b> ${order.assignedTo.name} (${order.assignedTo.email})` : '👷 <b>Assignee:</b> <i>unassigned</i>'}

📅 <b>Created:</b> ${this.botService.formatDate(order.createdAt)}
📝 <b>Updated:</b> ${this.botService.formatDate(order.updatedAt)}

<code>ID: ${order.id}</code>
      `.trim();

      await ctx.editMessageText(detailsMessage, { parse_mode: 'HTML' });

      this.logger.log(`User ${user.id} viewed details of order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in details action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not load the details');
      await ctx.reply('❌ ' + (error.message || 'Something went wrong'));
    }
  }
}

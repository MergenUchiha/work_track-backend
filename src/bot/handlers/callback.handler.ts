import { Injectable, Logger } from '@nestjs/common';
import { Action, Update, Ctx } from 'nestjs-telegraf';
import { BotService } from '../bot.service';
import { OrderStatus } from '@prisma/client';
import { OrdersService } from 'src/modules/orders/orders.service';

@Update()
@Injectable()
export class CallbackHandler {
  private readonly logger = new Logger(CallbackHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly ordersService: OrdersService,
  ) {}

  /**
   * Взять заказ в работу (назначить себя)
   */
  @Action(/^take_(.+)$/)
  async onTake(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      // Назначаем заказ на пользователя
      const order = await this.ordersService.assign(
        orderId,
        { assignedToId: user.id },
        user.id,
        user.role,
      );

      await ctx.editMessageText(
        `✅ <b>Заказ назначен на вас!</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Статус: ${this.botService.formatStatus(order.status)}\n\n` +
          `Теперь вы можете начать работу над заказом.\n` +
          `Используйте команду /my для просмотра.`,
        { parse_mode: 'HTML' },
      );

      this.logger.log(`User ${user.id} took order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in take action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Не удалось назначить заказ');
      await ctx.reply('❌ ' + (error.message || 'Произошла ошибка'));
    }
  }

  /**
   * Начать работу над заказом (изменить статус на IN_PROGRESS)
   */
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
        `⚙️ <b>Заказ взят в работу!</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Статус: ${this.botService.formatStatus(order.status)}\n\n` +
          `Удачи в выполнении! 💪`,
        { parse_mode: 'HTML' },
      );

      this.logger.log(`User ${user.id} started order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in start action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Не удалось начать работу');
      await ctx.reply('❌ ' + (error.message || 'Произошла ошибка'));
    }
  }

  /**
   * Завершить заказ (изменить статус на DONE)
   */
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
        `✅ <b>Заказ завершён!</b>\n\n` +
          `🔹 <b>${order.title}</b>\n` +
          `📊 Статус: ${this.botService.formatStatus(order.status)}\n\n` +
          `Отличная работа! 🎉`,
        { parse_mode: 'HTML' },
      );

      // Уведомляем создателя заказа
      if (order.createdBy.id !== user.id && order.createdBy.telegramId) {
        await this.botService.sendNotification(
          order.createdBy.id,
          `✅ <b>Заказ завершён!</b>\n\n` +
            `Пользователь ${user.name} завершил заказ:\n` +
            `🔹 <b>${order.title}</b>`,
        );
      }

      this.logger.log(`User ${user.id} completed order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in complete action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Не удалось завершить заказ');
      await ctx.reply('❌ ' + (error.message || 'Произошла ошибка'));
    }
  }

  /**
   * Отменить заказ
   */
  @Action(/^cancel_(.+)$/)
  async onCancel(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      // Просим ввести причину отмены
      await ctx.editMessageText(
        '❌ <b>Отмена заказа</b>\n\n' +
          'Введите причину отмены заказа:\n' +
          '<i>(минимум 10 символов)</i>',
        { parse_mode: 'HTML' },
      );

      // Сохраняем ID заказа в контексте для следующего сообщения
      // Используем простую Map для хранения состояния
      const cancelSessionKey = `cancel_${user.telegramId}_${orderId}`;
      // В production используйте Redis или другое хранилище
      (ctx as any).scene.state = { orderId, waitingForReason: true };

      this.logger.log(`User ${user.id} initiated cancel for order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in cancel action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Не удалось отменить заказ');
    }
  }

  /**
   * Показать детали заказа
   */
  @Action(/^details_(.+)$/)
  async onDetails(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const orderId = ctx.match[1];
      const user = await this.botService.getOrCreateUser(ctx);

      const order = await this.ordersService.findOne(orderId, user.id, user.role);

      const isOverdue = this.botService.isOverdue(order.deadline, order.status);
      const overdueWarning = isOverdue ? '\n⚠️ <b>ПРОСРОЧЕН!</b>' : '';

      const detailsMessage = `
📄 <b>Детали заказа</b>

<b>Название:</b>
${order.title}

<b>Описание:</b>
${order.description || '<i>не указано</i>'}

📊 <b>Статус:</b> ${this.botService.formatStatus(order.status)}
🎯 <b>Приоритет:</b> ${this.botService.formatPriority(order.priority)}
${order.deadline ? `⏰ <b>Дедлайн:</b> ${this.botService.formatDate(order.deadline)}${overdueWarning}` : ''}

👤 <b>Создатель:</b> ${order.createdBy.name} (${order.createdBy.email})
${order.assignedTo ? `👷 <b>Исполнитель:</b> ${order.assignedTo.name} (${order.assignedTo.email})` : '👷 <b>Исполнитель:</b> <i>не назначен</i>'}

📅 <b>Создан:</b> ${this.botService.formatDate(order.createdAt)}
📝 <b>Обновлён:</b> ${this.botService.formatDate(order.updatedAt)}

<code>ID: ${order.id}</code>
      `.trim();

      await ctx.editMessageText(detailsMessage, { parse_mode: 'HTML' });

      this.logger.log(`User ${user.id} viewed details of order ${orderId}`);
    } catch (error) {
      this.logger.error(`Error in details action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Не удалось загрузить детали');
      await ctx.reply('❌ ' + (error.message || 'Произошла ошибка'));
    }
  }
}

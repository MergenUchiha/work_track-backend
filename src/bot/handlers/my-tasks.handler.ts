import { Injectable, Logger } from '@nestjs/common';
import { Command, Update } from 'nestjs-telegraf';
import { BotContext, BotService } from '../bot.service';
import { Markup } from 'telegraf';
import { OrdersService } from 'src/modules/orders/orders.service';

@Update()
@Injectable()
export class MyTasksHandler {
  private readonly logger = new Logger(MyTasksHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly ordersService: OrdersService,
  ) {}

  @Command('my')
  async onMyTasks(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);
      ctx.user = user;

      // Получаем заказы, где пользователь - создатель или исполнитель
      const [createdResult, assignedResult] = await Promise.all([
        this.ordersService.findAll(
          {
            page: 1,
            limit: 5,
            createdById: user.id,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          },
          user.id,
          user.role,
        ),
        this.ordersService.findAll(
          {
            page: 1,
            limit: 5,
            assignedToId: user.id,
            sortBy: 'createdAt',
            sortOrder: 'desc',
          },
          user.id,
          user.role,
        ),
      ]);

      const totalCreated = createdResult.meta.total;
      const totalAssigned = assignedResult.meta.total;
      const total = totalCreated + totalAssigned;

      if (total === 0) {
        await ctx.reply(
          '📝 У вас пока нет заказов.\n\n' +
            (user.role === 'ADMIN' || user.role === 'MANAGER'
              ? 'Используйте /create для создания нового заказа.'
              : 'Администратор или менеджер назначит вам заказ.'),
        );
        return;
      }

      // Формируем сообщение
      let message = '📝 <b>Мои заказы</b>\n\n';

      if (totalCreated > 0) {
        message += `📤 <b>Созданные мной:</b> ${totalCreated} шт.\n`;
      }

      if (totalAssigned > 0) {
        message += `👷 <b>Назначены мне:</b> ${totalAssigned} шт.\n`;
      }

      await ctx.reply(message, { parse_mode: 'HTML' });

      // Показываем созданные заказы
      if (createdResult.data.length > 0) {
        await ctx.reply('📤 <b>Созданные мной:</b>', { parse_mode: 'HTML' });
        for (const order of createdResult.data) {
          await this.sendOrderMessage(ctx, order, user.role);
        }
      }

      // Показываем назначенные заказы
      if (assignedResult.data.length > 0) {
        await ctx.reply('👷 <b>Назначены мне:</b>', { parse_mode: 'HTML' });
        for (const order of assignedResult.data) {
          await this.sendOrderMessage(ctx, order, user.role);
        }
      }

      // Статистика
      const stats = await this.ordersService.getStats(user.id, user.role);
      const statsMessage =
        '\n📊 <b>Статистика:</b>\n' +
        `• Всего: ${stats.total}\n` +
        `• Просрочено: ${stats.overdue}\n` +
        `• Новых: ${stats.byStatus.find((s) => s.status === 'NEW')?.count || 0}\n` +
        `• В работе: ${stats.byStatus.find((s) => s.status === 'IN_PROGRESS')?.count || 0}\n` +
        `• Завершено: ${stats.byStatus.find((s) => s.status === 'DONE')?.count || 0}`;

      await ctx.reply(statsMessage, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /my handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Не удалось загрузить ваши заказы.');
    }
  }

  @Command('profile')
  async onProfile(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);

      const stats = await this.ordersService.getStats(user.id, user.role);

      const profileMessage = `
👤 <b>Ваш профиль</b>

<b>Имя:</b> ${user.name}
<b>Email:</b> ${user.email}
<b>Роль:</b> ${this.botService.formatRole(user.role)}
<b>Статус:</b> ${user.isActive ? '✅ Активен' : '❌ Заблокирован'}

📊 <b>Статистика заказов:</b>
• Всего: ${stats.total}
• Просрочено: ${stats.overdue}
• Новых: ${stats.byStatus.find((s) => s.status === 'NEW')?.count || 0}
• В работе: ${stats.byStatus.find((s) => s.status === 'IN_PROGRESS')?.count || 0}
• Завершено: ${stats.byStatus.find((s) => s.status === 'DONE')?.count || 0}
• Отменено: ${stats.byStatus.find((s) => s.status === 'CANCELLED')?.count || 0}

<code>User ID: ${user.id}</code>
<code>Telegram ID: ${user.telegramId}</code>
      `.trim();

      await ctx.reply(profileMessage, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /profile handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Не удалось загрузить профиль.');
    }
  }

  @Command('stats')
  async onStats(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);
      const stats = await this.ordersService.getStats(user.id, user.role);

      const statsMessage = `
📊 <b>Статистика заказов</b>

<b>Общая информация:</b>
• Всего заказов: ${stats.total}
• Просроченных: ${stats.overdue} ⚠️

<b>По статусам:</b>
${stats.byStatus.map((s) => `• ${this.botService.formatStatus(s.status)}: ${s.count}`).join('\n')}

<b>По приоритетам:</b>
${stats.byPriority.map((p) => `• ${this.botService.formatPriority(p.priority)}: ${p.count}`).join('\n')}
      `.trim();

      await ctx.reply(statsMessage, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /stats handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Не удалось загрузить статистику.');
    }
  }

  private async sendOrderMessage(ctx: BotContext, order: any, userRole: string) {
    const isOverdue = this.botService.isOverdue(order.deadline, order.status);
    const overdueWarning = isOverdue ? '\n⚠️ <b>ПРОСРОЧЕН!</b>' : '';

    const message = `
🔹 <b>${order.title}</b>

📊 Статус: ${this.botService.formatStatus(order.status)}
🎯 Приоритет: ${this.botService.formatPriority(order.priority)}
${order.assignedTo ? `👷 Исполнитель: ${order.assignedTo.name}` : '👷 Исполнитель: <i>не назначен</i>'}
${order.deadline ? `⏰ Дедлайн: ${this.botService.formatDate(order.deadline)}${overdueWarning}` : ''}

<code>ID: ${order.id}</code>
    `.trim();

    const keyboard = this.createOrderKeyboard(order, userRole);

    await ctx.reply(message, {
      parse_mode: 'HTML',
      reply_markup: keyboard.reply_markup,
    });
  }

  private createOrderKeyboard(order: any, userRole: string) {
    const buttons: ReturnType<typeof Markup.button.callback>[] = [];

    // Кнопка "Начать работу"
    if (order.status === 'NEW' && order.assignedToId) {
      buttons.push(Markup.button.callback('▶️ Начать', `start_${order.id}`));
    }

    // Кнопка "Завершить"
    if (order.status === 'IN_PROGRESS') {
      buttons.push(Markup.button.callback('✅ Завершить', `complete_${order.id}`));
    }

    // Кнопка "Отменить"
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

import { Injectable, Logger } from '@nestjs/common';
import { Command, Update } from 'nestjs-telegraf';
import { BotContext, BotService } from '../bot.service';
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

      // Orders the user created, and orders assigned to them
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
          '📝 You have no orders yet.\n\n' +
            (user.role === 'ADMIN' || user.role === 'MANAGER'
              ? 'Use /create to create one.'
              : 'An administrator or manager will assign one to you.'),
        );
        return;
      }

      const summary = ['📝 <b>My orders</b>', ''];
      if (totalCreated > 0) {
        summary.push(`📤 Created by me: <b>${totalCreated}</b>`);
      }
      if (totalAssigned > 0) {
        summary.push(`👷 Assigned to me: <b>${totalAssigned}</b>`);
      }

      await ctx.reply(summary.join('\n'), { parse_mode: 'HTML' });

      // Group headings only make sense when both groups are present;
      // otherwise they just repeat what the summary above already said.
      const showHeadings = createdResult.data.length > 0 && assignedResult.data.length > 0;

      if (createdResult.data.length > 0) {
        if (showHeadings) {
          await ctx.reply('📤 <b>Created by me</b>', { parse_mode: 'HTML' });
        }
        for (const order of createdResult.data) {
          await this.sendOrderMessage(ctx, order, user.role);
        }
      }

      if (assignedResult.data.length > 0) {
        if (showHeadings) {
          await ctx.reply('👷 <b>Assigned to me</b>', { parse_mode: 'HTML' });
        }
        for (const order of assignedResult.data) {
          await this.sendOrderMessage(ctx, order, user.role);
        }
      }

      const stats = await this.ordersService.getStats(user.id, user.role);
      const statsMessage =
        '\n📊 <b>Statistics:</b>\n' +
        `• Total: ${stats.total}\n` +
        `• Overdue: ${stats.overdue}\n` +
        `• New: ${stats.byStatus.find((s) => s.status === 'NEW')?.count || 0}\n` +
        `• In progress: ${stats.byStatus.find((s) => s.status === 'IN_PROGRESS')?.count || 0}\n` +
        `• Done: ${stats.byStatus.find((s) => s.status === 'DONE')?.count || 0}`;

      await ctx.reply(statsMessage, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /my handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not load your orders.');
    }
  }

  @Command('profile')
  async onProfile(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);

      const stats = await this.ordersService.getStats(user.id, user.role);

      const profileMessage = `
👤 <b>Your profile</b>

<b>Name:</b> ${user.name}
<b>Email:</b> ${user.email}
<b>Role:</b> ${this.botService.formatRole(user.role)}
<b>Status:</b> ${user.isActive ? '✅ Active' : '❌ Blocked'}

📊 <b>Order statistics:</b>
• Total: ${stats.total}
• Overdue: ${stats.overdue}
• New: ${stats.byStatus.find((s) => s.status === 'NEW')?.count || 0}
• In progress: ${stats.byStatus.find((s) => s.status === 'IN_PROGRESS')?.count || 0}
• Done: ${stats.byStatus.find((s) => s.status === 'DONE')?.count || 0}
• Cancelled: ${stats.byStatus.find((s) => s.status === 'CANCELLED')?.count || 0}

<code>User ID: ${user.id}</code>
<code>Telegram ID: ${user.telegramId}</code>
      `.trim();

      await ctx.reply(profileMessage, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /profile handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not load your profile.');
    }
  }

  @Command('stats')
  async onStats(ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);
      const stats = await this.ordersService.getStats(user.id, user.role);

      const statsMessage = `
📊 <b>Order statistics</b>

<b>Overview:</b>
• Total orders: ${stats.total}
• Overdue: ${stats.overdue} ⚠️

<b>By status:</b>
${stats.byStatus.map((s) => `• ${this.botService.formatStatus(s.status)}: ${s.count}`).join('\n')}

<b>By priority:</b>
${stats.byPriority.map((p) => `• ${this.botService.formatPriority(p.priority)}: ${p.count}`).join('\n')}
      `.trim();

      await ctx.reply(statsMessage, { parse_mode: 'HTML' });
    } catch (error) {
      this.logger.error(`Error in /stats handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not load statistics.');
    }
  }

  private async sendOrderMessage(ctx: BotContext, order: any, userRole: string) {
    await ctx.reply(this.botService.formatOrderCard(order), {
      parse_mode: 'HTML',
      reply_markup: this.botService.buildOrderKeyboard(order, userRole).reply_markup,
    });
  }
}

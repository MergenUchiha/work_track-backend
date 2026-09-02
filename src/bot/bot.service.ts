import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context as TelegrafContext, Markup } from 'telegraf';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from 'src/modules/prisma/prisma.service';
import { takeMessages } from './sent-messages.store';

export interface BotContext extends TelegrafContext {
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    telegramId: bigint | null;
  };
}

@Injectable()
export class BotService implements OnModuleInit {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<BotContext>,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.registerCommandHints();
  }

  /** Populates the menu Telegram shows when someone types "/". */
  private registerCommandHints() {
    void this.bot.telegram
      .setMyCommands([
        { command: 'start', description: 'Get started and see the commands' },
        { command: 'tasks', description: 'Browse orders' },
        { command: 'my', description: 'Orders you created or are assigned to' },
        { command: 'create', description: 'Create an order (admin, manager)' },
        { command: 'profile', description: 'Your profile and statistics' },
        { command: 'stats', description: 'Order statistics' },
        { command: 'clear', description: "Delete this bot's messages" },
        { command: 'cancel', description: 'Abort the current step' },
      ])
      .then(() => this.logger.log('Command hints registered'))
      .catch((error) => this.logger.warn(`Could not register command hints: ${error.message}`));
  }

  /**
   * Deletes the tracked messages in a chat — both the bot's replies and the
   * user's commands, which Bot API permits in private chats.
   *
   * Failures are expected and ignored: anything older than 48 hours, already
   * deleted, or beyond the bot's rights in a group.
   */
  async clearChat(chatId: number): Promise<number> {
    const ids = takeMessages(chatId);
    let deleted = 0;

    for (const messageId of ids) {
      try {
        await this.bot.telegram.deleteMessage(chatId, messageId);
        deleted++;
      } catch {
        // Too old, already deleted, or not ours.
      }
    }

    return deleted;
  }

  /**
   * Looks up the user behind a Telegram account, creating one on first contact.
   */
  async getOrCreateUser(ctx: BotContext) {
    const telegramUser = ctx.from;
    if (!telegramUser) {
      throw new Error('Telegram user not found in context');
    }

    const telegramId = BigInt(telegramUser.id);

    let user = await this.prisma.users.findUnique({
      where: { telegramId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        telegramId: true,
      },
    });

    // First contact: provision an account
    if (!user) {
      this.logger.log(`Creating new user for Telegram ID: ${telegramUser.id}`);

      const username = telegramUser.username || `user${telegramUser.id}`;
      const email = `${username}@telegram.bot`;
      const displayName =
        telegramUser.first_name + (telegramUser.last_name ? ` ${telegramUser.last_name}` : '');

      // Random password: this account is only ever used through the bot
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      user = await this.prisma.users.create({
        data: {
          email,
          name: displayName,
          passwordHash,
          role: UserRole.WORKER,
          isActive: true,
          telegramId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          telegramId: true,
        },
      });

      this.logger.log(`Created user ${user.id} for Telegram user @${username}`);
    }

    if (!user.isActive) {
      throw new Error('Your account is deactivated. Please contact an administrator.');
    }

    return user;
  }

  /**
   * Middleware that resolves the current user before a handler runs.
   */
  async attachUser(ctx: BotContext, next: () => Promise<void>) {
    try {
      const user = await this.getOrCreateUser(ctx);
      ctx.user = user;
      await next();
    } catch (error) {
      this.logger.error(`Failed to attach user: ${error.message}`, error.stack);
      await ctx.reply(`❌ Error: ${error.message}`);
    }
  }

  /**
   * Sends a message to a user over Telegram, if they linked an account.
   */
  async sendNotification(userId: string, message: string) {
    try {
      const user = await this.prisma.users.findUnique({
        where: { id: userId },
        select: { telegramId: true },
      });

      if (!user?.telegramId) {
        this.logger.warn(`User ${userId} does not have Telegram ID`);
        return false;
      }

      await this.bot.telegram.sendMessage(Number(user.telegramId), message, {
        parse_mode: 'HTML',
      });

      return true;
    } catch (error) {
      this.logger.error(`Failed to send notification to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Human-readable role label.
   */
  formatRole(role: UserRole): string {
    const roleMap = {
      [UserRole.ADMIN]: '👑 Administrator',
      [UserRole.MANAGER]: '👨‍💼 Manager',
      [UserRole.WORKER]: '👷 Worker',
    };
    return roleMap[role] || role;
  }

  /**
   * Human-readable order status.
   */
  formatStatus(status: string): string {
    const statusMap = {
      NEW: '🆕 New',
      IN_PROGRESS: '⚙️ In progress',
      DONE: '✅ Done',
      CANCELLED: '❌ Cancelled',
    };
    return statusMap[status] || status;
  }

  /**
   * Human-readable priority.
   */
  formatPriority(priority: string): string {
    const priorityMap = {
      LOW: '🟢 Low',
      MEDIUM: '🟡 Medium',
      HIGH: '🔴 High',
    };
    return priorityMap[priority] || priority;
  }

  /**
   * Formats a date for display in bot messages.
   */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  /** Short order card used in listings. */
  formatOrderCard(order: any): string {
    const overdueWarning = this.isOverdue(order.deadline, order.status)
      ? '\n⚠️ <b>OVERDUE</b>'
      : '';
    const description = order.description
      ? `\n${order.description.substring(0, 150)}${order.description.length > 150 ? '...' : ''}\n`
      : '';

    return `
🔹 <b>${order.title}</b>
${description}
📊 Status: ${this.formatStatus(order.status)}
🎯 Priority: ${this.formatPriority(order.priority)}
${order.assignedTo ? `👷 Assignee: ${order.assignedTo.name}` : '👷 Assignee: <i>unassigned</i>'}
${order.deadline ? `⏰ Deadline: ${this.formatDate(order.deadline)}${overdueWarning}` : ''}

<code>ID: ${order.id}</code>
    `.trim();
  }

  /** Full order card shown behind the Details button. */
  formatOrderDetails(order: any): string {
    const overdueWarning = this.isOverdue(order.deadline, order.status)
      ? '\n⚠️ <b>OVERDUE</b>'
      : '';

    return `
📄 <b>Order details</b>

<b>Title:</b>
${order.title}

<b>Description:</b>
${order.description || '<i>not provided</i>'}

📊 <b>Status:</b> ${this.formatStatus(order.status)}
🎯 <b>Priority:</b> ${this.formatPriority(order.priority)}
${order.deadline ? `⏰ <b>Deadline:</b> ${this.formatDate(order.deadline)}${overdueWarning}` : ''}

👤 <b>Created by:</b> ${order.createdBy?.name ?? '—'}
${order.assignedTo ? `👷 <b>Assignee:</b> ${order.assignedTo.name}` : '👷 <b>Assignee:</b> <i>unassigned</i>'}

📅 <b>Created:</b> ${this.formatDate(order.createdAt)}
📝 <b>Updated:</b> ${this.formatDate(order.updatedAt)}

<code>ID: ${order.id}</code>
    `.trim();
  }

  /**
   * Buttons available for an order, given who is looking at it.
   *
   * Every edit of an order message must pass this back: editMessageText
   * without a reply_markup wipes the keyboard and leaves the order a dead end.
   */
  buildOrderKeyboard(
    order: any,
    userRole: string,
    view: 'card' | 'details' = 'card',
    fromPage = 0,
  ) {
    const isManager = userRole === 'ADMIN' || userRole === 'MANAGER';
    const buttons: ReturnType<typeof Markup.button.callback>[] = [];

    if (order.status === 'NEW' && !order.assignedToId && isManager) {
      buttons.push(Markup.button.callback('👍 Pick up', `take_${order.id}`));
    }

    if (order.status === 'NEW' && order.assignedToId) {
      buttons.push(Markup.button.callback('▶️ Start', `start_${order.id}`));
    }

    if (order.status === 'IN_PROGRESS') {
      buttons.push(Markup.button.callback('✅ Complete', `complete_${order.id}`));
    }

    if (order.status !== 'DONE' && order.status !== 'CANCELLED' && isManager) {
      buttons.push(Markup.button.callback('❌ Cancel', `cancel_${order.id}`));
    }

    if (view === 'card') {
      buttons.push(Markup.button.callback('ℹ️ Details', `details_${fromPage}_${order.id}`));
      // Only orders opened from a list can go back to it.
      if (fromPage > 0) {
        buttons.push(Markup.button.callback('⬅️ To list', `orders_page_${fromPage}`));
      }
    } else {
      buttons.push(
        fromPage > 0
          ? Markup.button.callback('⬅️ Back', `open_${fromPage}_${order.id}`)
          : Markup.button.callback('⬅️ Back', `card_${order.id}`),
      );
    }

    const rows: ReturnType<typeof Markup.button.callback>[][] = [];
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2));
    }

    return Markup.inlineKeyboard(rows);
  }

  /**
   * True when the deadline has passed and the order is still open.
   */
  isOverdue(deadline: Date | null, status: string): boolean {
    if (!deadline) return false;
    if (status === 'DONE' || status === 'CANCELLED') return false;
    return new Date(deadline) < new Date();
  }
}

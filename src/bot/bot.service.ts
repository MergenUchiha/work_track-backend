import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context as TelegrafContext } from 'telegraf';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from 'src/modules/prisma/prisma.service';

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
export class BotService {
  private readonly logger = new Logger(BotService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<BotContext>,
    private readonly prisma: PrismaService,
  ) {}

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

  /**
   * True when the deadline has passed and the order is still open.
   */
  isOverdue(deadline: Date | null, status: string): boolean {
    if (!deadline) return false;
    if (status === 'DONE' || status === 'CANCELLED') return false;
    return new Date(deadline) < new Date();
  }
}

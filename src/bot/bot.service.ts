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
   * Получить или создать пользователя по Telegram ID
   */
  async getOrCreateUser(ctx: BotContext) {
    const telegramUser = ctx.from;
    if (!telegramUser) {
      throw new Error('Telegram user not found in context');
    }

    const telegramId = BigInt(telegramUser.id);

    // Ищем существующего пользователя
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

    // Если пользователь не найден - создаём
    if (!user) {
      this.logger.log(`Creating new user for Telegram ID: ${telegramUser.id}`);

      const username = telegramUser.username || `user${telegramUser.id}`;
      const email = `${username}@telegram.bot`;
      const displayName =
        telegramUser.first_name + (telegramUser.last_name ? ` ${telegramUser.last_name}` : '');

      // Генерируем случайный пароль (пользователь всё равно войдёт через бота)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const bcrypt = await import('bcrypt');
      const passwordHash = await bcrypt.hash(randomPassword, 10);

      user = await this.prisma.users.create({
        data: {
          email,
          name: displayName,
          passwordHash,
          role: UserRole.WORKER, // По умолчанию WORKER
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

    // Проверяем активность
    if (!user.isActive) {
      throw new Error('Ваш аккаунт деактивирован. Обратитесь к администратору.');
    }

    return user;
  }

  /**
   * Middleware для автоматической проверки пользователя
   */
  async attachUser(ctx: BotContext, next: () => Promise<void>) {
    try {
      const user = await this.getOrCreateUser(ctx);
      ctx.user = user;
      await next();
    } catch (error) {
      this.logger.error(`Failed to attach user: ${error.message}`, error.stack);
      await ctx.reply(`❌ Ошибка: ${error.message}`);
    }
  }

  /**
   * Отправить уведомление пользователю
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
   * Форматировать роль для отображения
   */
  formatRole(role: UserRole): string {
    const roleMap = {
      [UserRole.ADMIN]: '👑 Администратор',
      [UserRole.MANAGER]: '👨‍💼 Менеджер',
      [UserRole.WORKER]: '👷 Работник',
    };
    return roleMap[role] || role;
  }

  /**
   * Форматировать статус заказа
   */
  formatStatus(status: string): string {
    const statusMap = {
      NEW: '🆕 Новый',
      IN_PROGRESS: '⚙️ В работе',
      DONE: '✅ Завершён',
      CANCELLED: '❌ Отменён',
    };
    return statusMap[status] || status;
  }

  /**
   * Форматировать приоритет
   */
  formatPriority(priority: string): string {
    const priorityMap = {
      LOW: '🟢 Низкий',
      MEDIUM: '🟡 Средний',
      HIGH: '🔴 Высокий',
    };
    return priorityMap[priority] || priority;
  }

  /**
   * Форматировать дату
   */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  /**
   * Проверить просрочен ли заказ
   */
  isOverdue(deadline: Date | null, status: string): boolean {
    if (!deadline) return false;
    if (status === 'DONE' || status === 'CANCELLED') return false;
    return new Date(deadline) < new Date();
  }
}

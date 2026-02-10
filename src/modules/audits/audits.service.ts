import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { GetAuditLogsQueryDto } from './dto/get-audit-logs-query.dto';

export interface CreateAuditLogDto {
  orderId: string;
  action: string;
  changedById: string;
  oldValue?: any;
  newValue?: any;
}

@Injectable()
export class AuditsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Создать запись в аудит логе
   */
  async createLog(data: CreateAuditLogDto) {
    return this.prisma.orderAuditLogs.create({
      data: {
        orderId: data.orderId,
        action: data.action,
        changedById: data.changedById,
        oldValue: data.oldValue || null,
        newValue: data.newValue || null,
      },
    });
  }

  /**
   * Получить аудит логи с фильтрацией и пагинацией
   */
  async getLogs(query: GetAuditLogsQueryDto) {
    const {
      page = 1,
      limit = 10,
      orderId,
      changedById,
      action,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // Формируем условия фильтрации
    const where: Prisma.OrderAuditLogsWhereInput = {};

    if (orderId) {
      where.orderId = orderId;
    }

    if (changedById) {
      where.changedById = changedById;
    }

    if (action) {
      where.action = { contains: action, mode: 'insensitive' };
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    // Подсчитываем общее количество
    const total = await this.prisma.orderAuditLogs.count({ where });

    // Получаем логи с пагинацией
    const logs = await this.prisma.orderAuditLogs.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        changedBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    });

    return {
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Получить логи для конкретного заказа
   */
  async getOrderLogs(orderId: string) {
    return this.prisma.orderAuditLogs.findMany({
      where: { orderId },
      include: {
        changedBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Получить логи для конкретного пользователя
   */
  async getUserLogs(userId: string, limit: number = 50) {
    return this.prisma.orderAuditLogs.findMany({
      where: { changedById: userId },
      include: {
        order: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Получить статистику по действиям
   */
  async getActionStats(dateFrom?: string, dateTo?: string) {
    const where: Prisma.OrderAuditLogsWhereInput = {};

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(dateTo);
      }
    }

    const [total, byAction, byUser] = await Promise.all([
      this.prisma.orderAuditLogs.count({ where }),
      this.prisma.orderAuditLogs.groupBy({
        by: ['action'],
        where,
        _count: true,
        orderBy: {
          _count: {
            action: 'desc',
          },
        },
      }),
      this.prisma.orderAuditLogs.groupBy({
        by: ['changedById'],
        where,
        _count: true,
        orderBy: {
          _count: {
            changedById: 'desc',
          },
        },
        take: 10,
      }),
    ]);

    // Получаем информацию о топ пользователях
    const userIds = byUser.map((item) => item.changedById);
    const topUsers = await this.prisma.users.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    return {
      total,
      byAction: byAction.map((item) => ({
        action: item.action,
        count: item._count,
      })),
      topUsers: byUser.map((item) => {
        const user = topUsers.find((u) => u.id === item.changedById);
        return {
          user,
          count: item._count,
        };
      }),
    };
  }

  /**
   * Получить последние N действий
   */
  async getRecentLogs(limit: number = 20) {
    return this.prisma.orderAuditLogs.findMany({
      include: {
        order: {
          select: {
            id: true,
            title: true,
            status: true,
          },
        },
        changedBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Получить историю изменений конкретного поля
   */
  async getFieldHistory(orderId: string, field: string) {
    const logs = await this.prisma.orderAuditLogs.findMany({
      where: {
        orderId,
        OR: [
          {
            oldValue: {
              path: [field],
              not: Prisma.DbNull,
            },
          },
          {
            newValue: {
              path: [field],
              not: Prisma.DbNull,
            },
          },
        ],
      },
      include: {
        changedBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return logs.map((log) => ({
      id: log.id,
      action: log.action,
      oldValue: log.oldValue?.[field],
      newValue: log.newValue?.[field],
      changedBy: log.changedBy,
      createdAt: log.createdAt,
    }));
  }

  /**
   * Очистка старых логов (для maintenance)
   */
  async cleanupOldLogs(daysToKeep: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await this.prisma.orderAuditLogs.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return {
      message: `Удалено ${result.count} старых логов`,
      deletedCount: result.count,
      cutoffDate,
    };
  }
}
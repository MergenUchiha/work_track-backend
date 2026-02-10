import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, OrderPriority, UserRole, Prisma } from '@prisma/client';
import { AuditsService } from '../audits/audits.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AssignOrderDto } from './dto/assign-order.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { GetOrdersQueryDto } from './dto/get-orders-query.dto';

/**
 * Finite State Machine (FSM) для переходов между статусами
 */
const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.NEW]: [OrderStatus.IN_PROGRESS, OrderStatus.CANCELLED],
  [OrderStatus.IN_PROGRESS]: [OrderStatus.DONE, OrderStatus.CANCELLED],
  [OrderStatus.DONE]: [], // Из DONE переходов нет
  [OrderStatus.CANCELLED]: [], // Из CANCELLED переходов нет
};

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditsService,
  ) {}

  /**
   * Создать новый заказ
   */
  async create(dto: CreateOrderDto, createdById: string, userRole: string) {
    // Только админы и менеджеры могут создавать заказы
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new ForbiddenException('Только администраторы и менеджеры могут создавать заказы');
    }

    // Если указан assignedToId, проверяем что пользователь существует и активен
    if (dto.assignedToId) {
      await this.validateAssignee(dto.assignedToId);
    }

    // Создаём заказ
    const order = await this.prisma.orders.create({
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority || OrderPriority.MEDIUM,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        status: OrderStatus.NEW,
        createdById,
        assignedToId: dto.assignedToId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Создаём запись в audit log
    await this.createAuditLog({
      orderId: order.id,
      action: 'ORDER_CREATED',
      changedById: createdById,
      oldValue: null,
      newValue: {
        title: order.title,
        status: order.status,
        priority: order.priority,
      },
    });

    return this.formatOrder(order);
  }

  /**
   * Получить список заказов с фильтрацией и пагинацией
   */
  async findAll(query: GetOrdersQueryDto, userId: string, userRole: string) {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      createdById,
      assignedToId,
      search,
      deadlineFrom,
      deadlineTo,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      overdue,
      unassigned,
    } = query;

    // Формируем условия фильтрации
    const where: Prisma.OrdersWhereInput = {};

    // Обычные работники видят только свои заказы
    if (userRole === UserRole.WORKER) {
      where.OR = [
        { createdById: userId },
        { assignedToId: userId },
      ];
    }

    if (status) {
      where.status = status;
    }

    if (priority) {
      where.priority = priority;
    }

    if (createdById) {
      where.createdById = createdById;
    }

    if (assignedToId) {
      where.assignedToId = assignedToId;
    }

    if (unassigned) {
      where.assignedToId = null;
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (deadlineFrom || deadlineTo) {
      const deadlineFilter: Prisma.DateTimeFilter = {};
      if (deadlineFrom) {
        deadlineFilter.gte = new Date(deadlineFrom);
      }
      if (deadlineTo) {
        deadlineFilter.lte = new Date(deadlineTo);
      }
      where.deadline = deadlineFilter;
    }

    if (overdue) {
      const existingDeadline = (where.deadline as Prisma.DateTimeFilter) || {};
      where.deadline = {
        ...existingDeadline,
        lt: new Date(),
      };
      where.status = {
        notIn: [OrderStatus.DONE, OrderStatus.CANCELLED],
      };
    }

    // Подсчитываем общее количество
    const total = await this.prisma.orders.count({ where });

    // Получаем заказы с пагинацией
    const orders = await this.prisma.orders.findMany({
      where,
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
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
      data: orders.map((order) => this.formatOrder(order)),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Получить заказ по ID
   */
  async findOne(id: string, userId: string, userRole: string) {
    const order = await this.prisma.orders.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    // Проверка прав доступа
    this.checkAccessPermission(order, userId, userRole);

    return this.formatOrder(order);
  }

  /**
   * Обновить заказ
   */
  async update(
    id: string,
    dto: UpdateOrderDto,
    userId: string,
    userRole: string,
  ) {
    const order = await this.findOne(id, userId, userRole);

    // Только создатель или админ/менеджер могут обновлять заказ
    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      order.createdBy.id !== userId
    ) {
      throw new ForbiddenException('Недостаточно прав для обновления заказа');
    }

    // Нельзя обновлять завершённые или отменённые заказы
    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException(
        'Нельзя обновлять завершённые или отменённые заказы',
      );
    }

    const oldValues = {
      title: order.title,
      description: order.description,
      priority: order.priority,
      deadline: order.deadline,
    };

    const updatedOrder = await this.prisma.orders.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.deadline !== undefined && {
          deadline: dto.deadline ? new Date(dto.deadline) : null,
        }),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Создаём запись в audit log
    await this.createAuditLog({
      orderId: id,
      action: 'ORDER_UPDATED',
      changedById: userId,
      oldValue: oldValues,
      newValue: {
        title: updatedOrder.title,
        description: updatedOrder.description,
        priority: updatedOrder.priority,
        deadline: updatedOrder.deadline,
      },
    });

    return this.formatOrder(updatedOrder);
  }

  /**
   * Назначить/снять исполнителя
   */
  async assign(
    id: string,
    dto: AssignOrderDto,
    userId: string,
    userRole: string,
  ) {
    const order = await this.findOne(id, userId, userRole);

    // Только админы и менеджеры могут назначать исполнителей
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new ForbiddenException('Только администраторы и менеджеры могут назначать исполнителей');
    }

    // Нельзя назначать на завершённые или отменённые заказы
    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException(
        'Нельзя назначать исполнителя на завершённые или отменённые заказы',
      );
    }

    // Если назначаем нового исполнителя, проверяем что он существует и активен
    if (dto.assignedToId) {
      await this.validateAssignee(dto.assignedToId);
    }

    const updatedOrder = await this.prisma.orders.update({
      where: { id },
      data: {
        assignedToId: dto.assignedToId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Создаём запись в audit log
    await this.createAuditLog({
      orderId: id,
      action: dto.assignedToId ? 'ASSIGNED' : 'UNASSIGNED',
      changedById: userId,
      oldValue: { assignedToId: order.assignedTo?.id || null },
      newValue: { assignedToId: dto.assignedToId },
    });

    return this.formatOrder(updatedOrder);
  }

  /**
   * Изменить статус заказа (FSM)
   */
  async changeStatus(
    id: string,
    dto: ChangeStatusDto,
    userId: string,
    userRole: string,
  ) {
    const order = await this.findOne(id, userId, userRole);

    // Проверяем возможность перехода (FSM)
    const allowedTransitions = STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Невозможно изменить статус с "${order.status}" на "${dto.status}". ` +
        `Допустимые переходы: ${allowedTransitions.join(', ') || 'нет'}`,
      );
    }

    // Только исполнитель может переводить в IN_PROGRESS и DONE
    if (
      ([OrderStatus.IN_PROGRESS, OrderStatus.DONE] as OrderStatus[]).includes(dto.status) &&
      order.assignedTo?.id !== userId &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Только назначенный исполнитель или менеджер может изменить статус на IN_PROGRESS или DONE',
      );
    }

    const updatedOrder = await this.prisma.orders.update({
      where: { id },
      data: { status: dto.status },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Создаём запись в audit log
    await this.createAuditLog({
      orderId: id,
      action: 'STATUS_CHANGED',
      changedById: userId,
      oldValue: { status: order.status },
      newValue: { status: dto.status },
    });

    return this.formatOrder(updatedOrder);
  }

  /**
   * Отменить заказ с указанием причины
   */
  async cancel(
    id: string,
    dto: CancelOrderDto,
    userId: string,
    userRole: string,
  ) {
    const order = await this.findOne(id, userId, userRole);

    // Только создатель или админ/менеджер могут отменять заказ
    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      order.createdBy.id !== userId
    ) {
      throw new ForbiddenException('Недостаточно прав для отмены заказа');
    }

    // Проверяем возможность перехода в CANCELLED
    const allowedTransitions = STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions.includes(OrderStatus.CANCELLED)) {
      throw new BadRequestException(
        `Невозможно отменить заказ в статусе "${order.status}"`,
      );
    }

    const updatedOrder = await this.prisma.orders.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
      include: {
        createdBy: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
          },
        },
      },
    });

    // Создаём запись в audit log с причиной отмены
    await this.createAuditLog({
      orderId: id,
      action: 'ORDER_CANCELLED',
      changedById: userId,
      oldValue: { status: order.status },
      newValue: {
        status: OrderStatus.CANCELLED,
        cancelReason: dto.reason,
      },
    });

    return this.formatOrder(updatedOrder);
  }

  /**
   * Удалить заказ (только админ)
   */
  async remove(id: string, userId: string, userRole: string) {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Только администраторы могут удалять заказы');
    }

    const order = await this.findOne(id, userId, userRole);

    await this.prisma.orders.delete({ where: { id } });

    return { message: 'Заказ успешно удалён' };
  }

  /**
   * Получить статистику по заказам
   */
  async getStats(userId: string, userRole: string) {
    const where: Prisma.OrdersWhereInput = {};

    // Обычные работники видят только свою статистику
    if (userRole === UserRole.WORKER) {
      where.OR = [
        { createdById: userId },
        { assignedToId: userId },
      ];
    }

    const [total, byStatus, byPriority, overdue] = await Promise.all([
      this.prisma.orders.count({ where }),
      this.prisma.orders.groupBy({
        by: ['status'],
        where,
        _count: true,
      }),
      this.prisma.orders.groupBy({
        by: ['priority'],
        where,
        _count: true,
      }),
      this.prisma.orders.count({
        where: {
          ...where,
          deadline: { lt: new Date() },
          status: { notIn: [OrderStatus.DONE, OrderStatus.CANCELLED] },
        },
      }),
    ]);

    return {
      total,
      overdue,
      byStatus: byStatus.map((item) => ({
        status: item.status,
        count: item._count,
      })),
      byPriority: byPriority.map((item) => ({
        priority: item.priority,
        count: item._count,
      })),
    };
  }

  // ============================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================================

  /**
   * Проверка прав доступа к заказу
   */
  private checkAccessPermission(order: any, userId: string, userRole: string) {
    // Админы и менеджеры видят все заказы
    if (userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) {
      return;
    }

    // Обычные работники видят только свои заказы
    const hasAccess =
      order.createdById === userId || order.assignedToId === userId;

    if (!hasAccess) {
      throw new ForbiddenException('Недостаточно прав для просмотра этого заказа');
    }
  }

  /**
   * Валидация исполнителя
   */
  private async validateAssignee(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    if (!user.isActive) {
      throw new BadRequestException('Нельзя назначить деактивированного пользователя');
    }

    return user;
  }

  /**
   * Создание записи в audit log
   */
  private async createAuditLog(data: {
    orderId: string;
    action: string;
    changedById: string;
    oldValue: any;
    newValue: any;
  }) {
    await this.auditService.createLog({
      orderId: data.orderId,
      action: data.action,
      changedById: data.changedById,
      oldValue: data.oldValue,
      newValue: data.newValue,
    });
  }

  /**
   * Форматирование заказа с добавлением isOverdue
   */
  private formatOrder(order: any) {
    const isOverdue =
      order.deadline &&
      new Date(order.deadline) < new Date() &&
      ![OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status);

    return {
      ...order,
      isOverdue: !!isOverdue,
    };
  }
}
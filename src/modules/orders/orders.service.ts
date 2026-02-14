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
  [OrderStatus.DONE]: [],
  [OrderStatus.CANCELLED]: [],
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
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new ForbiddenException('Только администраторы и менеджеры могут создавать заказы');
    }

    if (dto.assignedToId) {
      await this.validateAssignee(dto.assignedToId);
    }

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
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

    await this.createAuditLog({
      orderId: order.id,
      action: 'ORDER_CREATED',
      changedById: createdById,
      oldValue: null,
      newValue: { title: order.title, status: order.status, priority: order.priority },
    });

    return this.formatOrder(order);
  }

  /**
   * Получить список заказов с фильтрацией и пагинацией
   *
   * FIX: Исправлен баг перезаписи where.OR.
   * Ранее при одновременном использовании:
   *   - фильтра по роли WORKER (where.OR = [{createdById}, {assignedToId}])
   *   - параметра search (where.OR = [{title}, {description}])
   * второй where.OR полностью перезаписывал первый, и работник видел чужие заказы.
   * Теперь оба условия объединяются через where.AND.
   *
   * FIX: Исправлен баг конфликта overdue + status.
   * Ранее overdue устанавливал where.status = {notIn: [...]}, что перезаписывало
   * явный фильтр по status из query params. Теперь фильтры объединяются.
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

    const andConditions: Prisma.OrdersWhereInput[] = [];

    // ✅ FIX: Фильтр для WORKER — добавляем в AND, не перезаписываем OR
    if (userRole === UserRole.WORKER) {
      andConditions.push({
        OR: [{ createdById: userId }, { assignedToId: userId }],
      });
    }

    if (status) {
      andConditions.push({ status });
    }

    if (priority) {
      andConditions.push({ priority });
    }

    if (createdById) {
      andConditions.push({ createdById });
    }

    // assignedToId и unassigned взаимоисключающие — unassigned имеет приоритет
    if (unassigned) {
      andConditions.push({ assignedToId: null });
    } else if (assignedToId) {
      andConditions.push({ assignedToId });
    }

    // ✅ FIX: search добавляем в AND, не перезаписываем OR
    if (search) {
      andConditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      });
    }

    if (deadlineFrom || deadlineTo) {
      const deadlineFilter: Prisma.DateTimeNullableFilter = {};
      if (deadlineFrom) deadlineFilter.gte = new Date(deadlineFrom);
      if (deadlineTo) deadlineFilter.lte = new Date(deadlineTo);
      andConditions.push({ deadline: deadlineFilter });
    }

    // ✅ FIX: overdue — добавляем отдельные условия в AND, не перезаписываем status
    if (overdue) {
      andConditions.push({ deadline: { lt: new Date() } });
      // Только если не задан явный status фильтр
      if (!status) {
        andConditions.push({
          status: { notIn: [OrderStatus.DONE, OrderStatus.CANCELLED] },
        });
      }
    }

    const where: Prisma.OrdersWhereInput = andConditions.length > 0 ? { AND: andConditions } : {};

    const total = await this.prisma.orders.count({ where });

    const orders = await this.prisma.orders.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
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
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Заказ не найден');
    }

    this.checkAccessPermission(order, userId, userRole);

    return this.formatOrder(order);
  }

  /**
   * Обновить заказ
   */
  async update(id: string, dto: UpdateOrderDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      order.createdBy.id !== userId
    ) {
      throw new ForbiddenException('Недостаточно прав для обновления заказа');
    }

    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('Нельзя обновлять завершённые или отменённые заказы');
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
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

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
  async assign(id: string, dto: AssignOrderDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Только администраторы и менеджеры могут назначать исполнителей',
      );
    }

    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException(
        'Нельзя назначать исполнителя на завершённые или отменённые заказы',
      );
    }

    if (dto.assignedToId) {
      await this.validateAssignee(dto.assignedToId);
    }

    const updatedOrder = await this.prisma.orders.update({
      where: { id },
      data: { assignedToId: dto.assignedToId },
      include: {
        createdBy: {
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

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
  async changeStatus(id: string, dto: ChangeStatusDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    const allowedTransitions = STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Невозможно изменить статус с "${order.status}" на "${dto.status}". ` +
          `Допустимые переходы: ${allowedTransitions.join(', ') || 'нет'}`,
      );
    }

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
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

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
  async cancel(id: string, dto: CancelOrderDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      order.createdBy.id !== userId
    ) {
      throw new ForbiddenException('Недостаточно прав для отмены заказа');
    }

    const allowedTransitions = STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions.includes(OrderStatus.CANCELLED)) {
      throw new BadRequestException(`Невозможно отменить заказ в статусе "${order.status}"`);
    }

    const updatedOrder = await this.prisma.orders.update({
      where: { id },
      data: { status: OrderStatus.CANCELLED },
      include: {
        createdBy: {
          select: { id: true, email: true, name: true, role: true },
        },
        assignedTo: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
    });

    await this.createAuditLog({
      orderId: id,
      action: 'ORDER_CANCELLED',
      changedById: userId,
      oldValue: { status: order.status },
      newValue: { status: OrderStatus.CANCELLED, cancelReason: dto.reason },
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

    await this.findOne(id, userId, userRole);
    await this.prisma.orders.delete({ where: { id } });

    return { message: 'Заказ успешно удалён' };
  }

  /**
   * Получить статистику по заказам
   */
  async getStats(userId: string, userRole: string) {
    const where: Prisma.OrdersWhereInput = {};

    if (userRole === UserRole.WORKER) {
      where.OR = [{ createdById: userId }, { assignedToId: userId }];
    }

    const [total, byStatus, byPriority, overdue] = await Promise.all([
      this.prisma.orders.count({ where }),
      this.prisma.orders.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.orders.groupBy({ by: ['priority'], where, _count: true }),
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
      byStatus: byStatus.map((item) => ({ status: item.status, count: item._count })),
      byPriority: byPriority.map((item) => ({ priority: item.priority, count: item._count })),
    };
  }

  // ============================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================================

  private checkAccessPermission(order: any, userId: string, userRole: string) {
    if (userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) {
      return;
    }

    const hasAccess = order.createdById === userId || order.assignedToId === userId;

    if (!hasAccess) {
      throw new ForbiddenException('Недостаточно прав для просмотра этого заказа');
    }
  }

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

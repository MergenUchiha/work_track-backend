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
 * Allowed order status transitions.
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
   * Creates an order. Admins and managers only.
   */
  async create(dto: CreateOrderDto, createdById: string, userRole: string) {
    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new ForbiddenException('Only admins and managers can create orders');
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
   * Lists orders with filtering, search and pagination.
   *
   * Role and search conditions are collected into a single AND array:
   * assigning them to `where.OR` separately used to overwrite one another,
   * which let a worker see orders belonging to other people.
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

    // Workers only see orders they created or are assigned to
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

    // assignedToId and unassigned are mutually exclusive; unassigned wins
    if (unassigned) {
      andConditions.push({ assignedToId: null });
    } else if (assignedToId) {
      andConditions.push({ assignedToId });
    }

    // Free-text search across title and description
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

    // `overdue` must not clobber an explicit status filter
    if (overdue) {
      andConditions.push({ deadline: { lt: new Date() } });
      // Only when no explicit status filter was given
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
   * Returns an order by id, subject to role rules.
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
      throw new NotFoundException('Order not found');
    }

    this.checkAccessPermission(order, userId, userRole);

    return this.formatOrder(order);
  }

  /**
   * Updates an order.
   */
  async update(id: string, dto: UpdateOrderDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      order.createdBy.id !== userId
    ) {
      throw new ForbiddenException('Insufficient permissions to update this order');
    }

    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('Completed or cancelled orders cannot be updated');
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
   * Assigns or unassigns a worker. Admins and managers only.
   */
  async assign(id: string, dto: AssignOrderDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    if (userRole !== UserRole.ADMIN && userRole !== UserRole.MANAGER) {
      throw new ForbiddenException('Only admins and managers can assign workers');
    }

    if ([OrderStatus.DONE, OrderStatus.CANCELLED].includes(order.status)) {
      throw new BadRequestException('Completed or cancelled orders cannot be reassigned');
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
   * Moves an order to a new status, guarded by the state machine.
   */
  async changeStatus(id: string, dto: ChangeStatusDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    const allowedTransitions = STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot change status from "${order.status}" to "${dto.status}". ` +
          `Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`,
      );
    }

    if (
      ([OrderStatus.IN_PROGRESS, OrderStatus.DONE] as OrderStatus[]).includes(dto.status) &&
      order.assignedTo?.id !== userId &&
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER
    ) {
      throw new ForbiddenException(
        'Only the assignee or a manager can move an order to IN_PROGRESS or DONE',
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
   * Cancels an order and records the reason.
   */
  async cancel(id: string, dto: CancelOrderDto, userId: string, userRole: string) {
    const order = await this.findOne(id, userId, userRole);

    if (
      userRole !== UserRole.ADMIN &&
      userRole !== UserRole.MANAGER &&
      order.createdBy.id !== userId
    ) {
      throw new ForbiddenException('Insufficient permissions to cancel this order');
    }

    const allowedTransitions = STATUS_TRANSITIONS[order.status];
    if (!allowedTransitions.includes(OrderStatus.CANCELLED)) {
      throw new BadRequestException(`An order in status "${order.status}" cannot be cancelled`);
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
   * Deletes an order. Admin only.
   */
  async remove(id: string, userId: string, userRole: string) {
    if (userRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admins can delete orders');
    }

    await this.findOne(id, userId, userRole);
    await this.prisma.orders.delete({ where: { id } });

    return { message: 'Order deleted successfully' };
  }

  /**
   * Aggregate order statistics.
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
  // HELPERS
  // ============================================================

  private checkAccessPermission(order: any, userId: string, userRole: string) {
    if (userRole === UserRole.ADMIN || userRole === UserRole.MANAGER) {
      return;
    }

    const hasAccess = order.createdById === userId || order.assignedToId === userId;

    if (!hasAccess) {
      throw new ForbiddenException('Insufficient permissions to view this order');
    }
  }

  private async validateAssignee(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.isActive) {
      throw new BadRequestException('A deactivated user cannot be assigned');
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

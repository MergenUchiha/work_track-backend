import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus, OrderPriority, UserRole } from '@prisma/client';

describe('OrdersService', () => {
  let service: OrdersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    orders: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    },
    users: {
      findUnique: jest.fn(),
    },
    orderAuditLogs: {
      create: jest.fn(),
    },
  };

  const mockOrder = {
    id: 'order-id-1',
    title: 'Test Order',
    description: 'Test Description',
    status: OrderStatus.NEW,
    priority: OrderPriority.MEDIUM,
    deadline: new Date('2024-12-31'),
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: 'user-id-1',
    assignedToId: 'user-id-2',
    createdBy: {
      id: 'user-id-1',
      email: 'manager@example.com',
      name: 'Manager',
      role: UserRole.MANAGER,
    },
    assignedTo: {
      id: 'user-id-2',
      email: 'worker@example.com',
      name: 'Worker',
      role: UserRole.WORKER,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('должен создать заказ для админа/менеджера', async () => {
      const dto = {
        title: 'New Order',
        description: 'Description',
        priority: OrderPriority.HIGH,
      };

      mockPrismaService.orders.create.mockResolvedValue(mockOrder);
      mockPrismaService.orderAuditLogs.create.mockResolvedValue({});

      const result = await service.create(dto, 'user-id-1', UserRole.MANAGER);

      expect(result).toBeDefined();
      expect(prisma.orders.create).toHaveBeenCalled();
      expect(prisma.orderAuditLogs.create).toHaveBeenCalled();
    });

    it('должен выбросить ForbiddenException для работника', async () => {
      const dto = { title: 'New Order' };

      await expect(
        service.create(dto as any, 'user-id-1', UserRole.WORKER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('должен вернуть заказ для админа', async () => {
      mockPrismaService.orders.findUnique.mockResolvedValue(mockOrder);

      const result = await service.findOne('order-id-1', 'any-user', UserRole.ADMIN);

      expect(result).toBeDefined();
      expect(result.id).toBe('order-id-1');
    });

    it('должен выбросить NotFoundException если заказ не найден', async () => {
      mockPrismaService.orders.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', 'user-id', UserRole.ADMIN),
      ).rejects.toThrow(NotFoundException);
    });

    it('должен выбросить ForbiddenException если работник пытается посмотреть чужой заказ', async () => {
      mockPrismaService.orders.findUnique.mockResolvedValue(mockOrder);

      await expect(
        service.findOne('order-id-1', 'other-user', UserRole.WORKER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('changeStatus (FSM)', () => {
    it('должен изменить статус с NEW на IN_PROGRESS', async () => {
      const order = { ...mockOrder, status: OrderStatus.NEW };
      mockPrismaService.orders.findUnique.mockResolvedValue(order);
      mockPrismaService.orders.update.mockResolvedValue({
        ...order,
        status: OrderStatus.IN_PROGRESS,
      });
      mockPrismaService.orderAuditLogs.create.mockResolvedValue({});

      const result = await service.changeStatus(
        'order-id-1',
        { status: OrderStatus.IN_PROGRESS },
        'user-id-2',
        UserRole.WORKER,
      );

      expect(result.status).toBe(OrderStatus.IN_PROGRESS);
    });

    it('должен выбросить BadRequestException при невозможном переходе', async () => {
      const order = { ...mockOrder, status: OrderStatus.DONE };
      mockPrismaService.orders.findUnique.mockResolvedValue(order);

      await expect(
        service.changeStatus(
          'order-id-1',
          { status: OrderStatus.NEW },
          'user-id-2',
          UserRole.WORKER,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('должен выбросить ForbiddenException если не исполнитель пытается изменить на IN_PROGRESS', async () => {
      const order = { ...mockOrder, status: OrderStatus.NEW };
      mockPrismaService.orders.findUnique.mockResolvedValue(order);

      await expect(
        service.changeStatus(
          'order-id-1',
          { status: OrderStatus.IN_PROGRESS },
          'other-user',
          UserRole.WORKER,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('должен отменить заказ с причиной', async () => {
      mockPrismaService.orders.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.orders.update.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.CANCELLED,
      });
      mockPrismaService.orderAuditLogs.create.mockResolvedValue({});

      const result = await service.cancel(
        'order-id-1',
        { reason: 'Test cancellation reason' },
        'user-id-1',
        UserRole.MANAGER,
      );

      expect(result.status).toBe(OrderStatus.CANCELLED);
      expect(prisma.orderAuditLogs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ORDER_CANCELLED',
            newValue: expect.objectContaining({
              cancelReason: 'Test cancellation reason',
            }),
          }),
        }),
      );
    });

    it('должен выбросить BadRequestException если заказ уже завершён', async () => {
      const order = { ...mockOrder, status: OrderStatus.DONE };
      mockPrismaService.orders.findUnique.mockResolvedValue(order);

      await expect(
        service.cancel(
          'order-id-1',
          { reason: 'Reason' },
          'user-id-1',
          UserRole.MANAGER,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('assign', () => {
    it('должен назначить исполнителя', async () => {
      const user = {
        id: 'user-id-3',
        isActive: true,
      };

      mockPrismaService.orders.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.users.findUnique.mockResolvedValue(user);
      mockPrismaService.orders.update.mockResolvedValue({
        ...mockOrder,
        assignedToId: 'user-id-3',
      });
      mockPrismaService.orderAuditLogs.create.mockResolvedValue({});

      const result = await service.assign(
        'order-id-1',
        { assignedToId: 'user-id-3' },
        'user-id-1',
        UserRole.MANAGER,
      );

      expect(result).toBeDefined();
      expect(prisma.orderAuditLogs.create).toHaveBeenCalled();
    });

    it('должен выбросить BadRequestException если пользователь неактивен', async () => {
      const user = {
        id: 'user-id-3',
        isActive: false,
      };

      mockPrismaService.orders.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.users.findUnique.mockResolvedValue(user);

      await expect(
        service.assign(
          'order-id-1',
          { assignedToId: 'user-id-3' },
          'user-id-1',
          UserRole.MANAGER,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    it('должен обновить заказ', async () => {
      mockPrismaService.orders.findUnique.mockResolvedValue(mockOrder);
      mockPrismaService.orders.update.mockResolvedValue({
        ...mockOrder,
        title: 'Updated Title',
      });
      mockPrismaService.orderAuditLogs.create.mockResolvedValue({});

      const result = await service.update(
        'order-id-1',
        { title: 'Updated Title' },
        'user-id-1',
        UserRole.MANAGER,
      );

      expect(result.title).toBe('Updated Title');
    });

    it('должен выбросить BadRequestException если заказ завершён', async () => {
      const order = { ...mockOrder, status: OrderStatus.DONE };
      mockPrismaService.orders.findUnique.mockResolvedValue(order);

      await expect(
        service.update('order-id-1', { title: 'New' }, 'user-id-1', UserRole.MANAGER),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
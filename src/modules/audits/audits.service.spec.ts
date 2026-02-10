import { Test, TestingModule } from '@nestjs/testing';
import { AuditsService } from './audits.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuditsService', () => {
  let service: AuditsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    orderAuditLogs: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
    },
    users: {
      findMany: jest.fn(),
    },
  };

  const mockLog = {
    id: 'log-id-1',
    orderId: 'order-id-1',
    action: 'STATUS_CHANGED',
    oldValue: { status: 'NEW' },
    newValue: { status: 'IN_PROGRESS' },
    changedById: 'user-id-1',
    createdAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuditsService>(AuditsService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createLog', () => {
    it('должен создать запись в аудит логе', async () => {
      const dto = {
        orderId: 'order-id-1',
        action: 'STATUS_CHANGED',
        changedById: 'user-id-1',
        oldValue: { status: 'NEW' },
        newValue: { status: 'IN_PROGRESS' },
      };

      mockPrismaService.orderAuditLogs.create.mockResolvedValue(mockLog);

      const result = await service.createLog(dto);

      expect(result).toEqual(mockLog);
      expect(prisma.orderAuditLogs.create).toHaveBeenCalledWith({
        data: {
          orderId: dto.orderId,
          action: dto.action,
          changedById: dto.changedById,
          oldValue: dto.oldValue,
          newValue: dto.newValue,
        },
      });
    });

    it('должен создать лог без old/new values', async () => {
      const dto = {
        orderId: 'order-id-1',
        action: 'ORDER_CREATED',
        changedById: 'user-id-1',
      };

      mockPrismaService.orderAuditLogs.create.mockResolvedValue({
        ...mockLog,
        oldValue: null,
        newValue: null,
      });

      await service.createLog(dto);

      expect(prisma.orderAuditLogs.create).toHaveBeenCalledWith({
        data: {
          orderId: dto.orderId,
          action: dto.action,
          changedById: dto.changedById,
          oldValue: null,
          newValue: null,
        },
      });
    });
  });

  describe('getLogs', () => {
    it('должен вернуть пагинированный список логов', async () => {
      const query = { page: 1, limit: 10 };
      const logs = [mockLog];

      mockPrismaService.orderAuditLogs.count.mockResolvedValue(1);
      mockPrismaService.orderAuditLogs.findMany.mockResolvedValue(logs);

      const result = await service.getLogs(query);

      expect(result.data).toEqual(logs);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it('должен фильтровать логи по orderId', async () => {
      const query = { orderId: 'order-id-1', page: 1, limit: 10 };

      mockPrismaService.orderAuditLogs.count.mockResolvedValue(5);
      mockPrismaService.orderAuditLogs.findMany.mockResolvedValue([mockLog]);

      await service.getLogs(query);

      expect(prisma.orderAuditLogs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orderId: 'order-id-1',
          }),
        }),
      );
    });
  });

  describe('getOrderLogs', () => {
    it('должен вернуть логи для конкретного заказа', async () => {
      mockPrismaService.orderAuditLogs.findMany.mockResolvedValue([mockLog]);

      const result = await service.getOrderLogs('order-id-1');

      expect(result).toEqual([mockLog]);
      expect(prisma.orderAuditLogs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { orderId: 'order-id-1' },
        }),
      );
    });
  });

  describe('getUserLogs', () => {
    it('должен вернуть логи для конкретного пользователя', async () => {
      mockPrismaService.orderAuditLogs.findMany.mockResolvedValue([mockLog]);

      const result = await service.getUserLogs('user-id-1', 50);

      expect(result).toEqual([mockLog]);
      expect(prisma.orderAuditLogs.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { changedById: 'user-id-1' },
          take: 50,
        }),
      );
    });
  });

  describe('getActionStats', () => {
    it('должен вернуть статистику по действиям', async () => {
      mockPrismaService.orderAuditLogs.count.mockResolvedValue(100);
      mockPrismaService.orderAuditLogs.groupBy.mockResolvedValueOnce([
        { action: 'STATUS_CHANGED', _count: 50 },
        { action: 'ORDER_CREATED', _count: 30 },
      ]);
      mockPrismaService.orderAuditLogs.groupBy.mockResolvedValueOnce([
        { changedById: 'user-id-1', _count: 60 },
      ]);
      mockPrismaService.users.findMany.mockResolvedValue([
        {
          id: 'user-id-1',
          email: 'user@example.com',
          name: 'User',
          role: 'ADMIN',
        },
      ]);

      const result = await service.getActionStats();

      expect(result.total).toBe(100);
      expect(result.byAction).toHaveLength(2);
      expect(result.topUsers).toHaveLength(1);
    });
  });

  describe('cleanupOldLogs', () => {
    it('должен удалить старые логи', async () => {
      mockPrismaService.orderAuditLogs.deleteMany.mockResolvedValue({
        count: 150,
      });

      const result = await service.cleanupOldLogs(90);

      expect(result.deletedCount).toBe(150);
      expect(result.message).toContain('150');
      expect(prisma.orderAuditLogs.deleteMany).toHaveBeenCalled();
    });
  });

  describe('getFieldHistory', () => {
    it('должен вернуть историю изменений поля', async () => {
      const logs = [
        {
          ...mockLog,
          oldValue: { status: 'NEW' },
          newValue: { status: 'IN_PROGRESS' },
          changedBy: {
            id: 'user-id-1',
            email: 'user@example.com',
            name: 'User',
            role: 'WORKER',
          },
        },
      ];

      mockPrismaService.orderAuditLogs.findMany.mockResolvedValue(logs);

      const result = await service.getFieldHistory('order-id-1', 'status');

      expect(result).toBeDefined();
      expect(result[0].oldValue).toBe('NEW');
      expect(result[0].newValue).toBe('IN_PROGRESS');
    });
  });
});
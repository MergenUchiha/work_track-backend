import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    users: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    refreshTokens: {
      deleteMany: jest.fn(),
    },
  };

  const mockUser = {
    id: 'user-id-1',
    email: 'user@example.com',
    name: 'Test User',
    role: UserRole.WORKER,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);

    // Очищаем моки перед каждым тестом
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getProfile', () => {
    it('должен вернуть профиль пользователя', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);

      const result = await service.getProfile('user-id-1');

      expect(result).toEqual(mockUser);
      expect(prisma.users.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        select: expect.any(Object),
      });
    });

    it('должен выбросить NotFoundException если пользователь не найден', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(null);

      await expect(service.getProfile('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getUserById', () => {
    it('должен вернуть пользователя для админа', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserById(
        'user-id-1',
        'admin-id',
        UserRole.ADMIN,
      );

      expect(result).toEqual(mockUser);
    });

    it('должен вернуть пользователя если это его собственный профиль', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);

      const result = await service.getUserById(
        'user-id-1',
        'user-id-1',
        UserRole.WORKER,
      );

      expect(result).toEqual(mockUser);
    });

    it('должен выбросить ForbiddenException если worker пытается посмотреть чужой профиль', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.getUserById('user-id-1', 'other-user-id', UserRole.WORKER),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateProfile', () => {
    it('должен обновить профиль пользователя', async () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...mockUser, ...updateDto };

      mockPrismaService.users.update.mockResolvedValue(updatedUser);

      const result = await service.updateProfile('user-id-1', updateDto);

      expect(result).toEqual(updatedUser);
      expect(prisma.users.update).toHaveBeenCalledWith({
        where: { id: 'user-id-1' },
        data: updateDto,
        select: expect.any(Object),
      });
    });

    it('должен выбросить ConflictException если email уже используется', async () => {
      const updateDto = { email: 'existing@example.com' };
      const existingUser = { ...mockUser, id: 'other-id' };

      mockPrismaService.users.findUnique.mockResolvedValue(existingUser);

      await expect(service.updateProfile('user-id-1', updateDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('changeRole', () => {
    it('должен изменить роль пользователя', async () => {
      const changeRoleDto = { role: UserRole.MANAGER };
      const updatedUser = { ...mockUser, role: UserRole.MANAGER };

      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.users.update.mockResolvedValue(updatedUser);

      const result = await service.changeRole('user-id-1', changeRoleDto, 'admin-id');

      expect(result.role).toBe(UserRole.MANAGER);
    });

    it('должен выбросить BadRequestException если админ пытается изменить свою роль', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.changeRole('admin-id', { role: UserRole.WORKER }, 'admin-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('toggleActive', () => {
    it('должен заблокировать пользователя и отозвать токены', async () => {
      const toggleDto = { isActive: false };
      const updatedUser = { ...mockUser, isActive: false };

      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.users.update.mockResolvedValue(updatedUser);
      mockPrismaService.refreshTokens.deleteMany.mockResolvedValue({ count: 2 });

      const result = await service.toggleActive('user-id-1', toggleDto, 'admin-id');

      expect(result.isActive).toBe(false);
      expect(prisma.refreshTokens.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-id-1' },
      });
    });

    it('должен выбросить BadRequestException если админ пытается заблокировать себя', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);

      await expect(
        service.toggleActive('admin-id', { isActive: false }, 'admin-id'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getUsers', () => {
    it('должен вернуть пагинированный список пользователей', async () => {
      const query = { page: 1, limit: 10 };
      const users = [mockUser];

      mockPrismaService.users.count.mockResolvedValue(1);
      mockPrismaService.users.findMany.mockResolvedValue(users);

      const result = await service.getUsers(query);

      expect(result.data).toEqual(users);
      expect(result.meta).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('getUsersStats', () => {
    it('должен вернуть статистику по пользователям', async () => {
      mockPrismaService.users.count.mockResolvedValueOnce(100);
      mockPrismaService.users.count.mockResolvedValueOnce(85);
      mockPrismaService.users.count.mockResolvedValueOnce(15);
      mockPrismaService.users.groupBy.mockResolvedValue([
        { role: UserRole.ADMIN, _count: 5 },
        { role: UserRole.MANAGER, _count: 10 },
        { role: UserRole.WORKER, _count: 85 },
      ]);

      const result = await service.getUsersStats();

      expect(result.total).toBe(100);
      expect(result.active).toBe(85);
      expect(result.inactive).toBe(15);
      expect(result.byRole).toHaveLength(3);
    });
  });
});
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, Prisma } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { GetUsersQueryDto } from './dto/get-users-query.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Получить профиль текущего пользователя
   */
  async getProfile(userId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    return user;
  }

  /**
   * Получить пользователя по ID
   */
  async getUserById(userId: string, requestUserId: string, requestUserRole: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Обычные пользователи могут видеть только свой профиль
    if (
      requestUserRole !== UserRole.ADMIN &&
      requestUserRole !== UserRole.MANAGER &&
      userId !== requestUserId
    ) {
      throw new ForbiddenException('Недостаточно прав для просмотра этого пользователя');
    }

    return user;
  }

  /**
   * Получить список всех пользователей (только для админов и менеджеров)
   * С пагинацией, фильтрацией и поиском
   */
  async getUsers(query: GetUsersQueryDto) {
    const { page = 1, limit = 10, role, isActive, search, sortBy = 'createdAt', sortOrder = 'desc' } = query;

    // Формируем условия фильтрации
    const where: Prisma.UsersWhereInput = {};

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Подсчитываем общее количество
    const total = await this.prisma.users.count({ where });

    // Получаем пользователей с пагинацией
    const users = await this.prisma.users.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { [sortBy]: sortOrder },
    });

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Обновить свой профиль
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Если обновляется email, проверяем уникальность
    if (dto.email) {
      const existingUser = await this.prisma.users.findUnique({
        where: { email: dto.email },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('Пользователь с таким email уже существует');
      }
    }

    const updatedUser = await this.prisma.users.update({
      where: { id: userId },
      data: dto,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Изменить роль пользователя (только админ)
   */
  async changeRole(userId: string, dto: ChangeRoleDto, adminId: string) {
    // Проверяем, что пользователь существует
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Запрещаем админу изменять свою роль
    if (userId === adminId) {
      throw new BadRequestException('Невозможно изменить собственную роль');
    }

    // Обновляем роль
    const updatedUser = await this.prisma.users.update({
      where: { id: userId },
      data: { role: dto.role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Заблокировать/разблокировать пользователя (только админ)
   */
  async toggleActive(userId: string, dto: ToggleActiveDto, adminId: string) {
    // Проверяем, что пользователь существует
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Запрещаем админу блокировать самого себя
    if (userId === adminId) {
      throw new BadRequestException('Невозможно изменить статус собственного аккаунта');
    }

    // Обновляем статус
    const updatedUser = await this.prisma.users.update({
      where: { id: userId },
      data: { isActive: dto.isActive },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Если пользователь заблокирован, отзываем все его refresh токены
    if (!dto.isActive) {
      await this.prisma.refreshTokens.deleteMany({
        where: { userId },
      });
    }

    return updatedUser;
  }

  /**
   * Получить статистику по пользователям (для админов)
   */
  async getUsersStats() {
    const [total, active, inactive, byRole] = await Promise.all([
      this.prisma.users.count(),
      this.prisma.users.count({ where: { isActive: true } }),
      this.prisma.users.count({ where: { isActive: false } }),
      this.prisma.users.groupBy({
        by: ['role'],
        _count: true,
      }),
    ]);

    return {
      total,
      active,
      inactive,
      byRole: byRole.map((item) => ({
        role: item.role,
        count: item._count,
      })),
    };
  }

  /**
   * Удалить пользователя (мягкое удаление - деактивация)
   */
  async softDeleteUser(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new BadRequestException('Невозможно удалить собственный аккаунт');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    // Деактивируем пользователя
    await this.prisma.users.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Отзываем все refresh токены
    await this.prisma.refreshTokens.deleteMany({
      where: { userId },
    });

    return { message: 'Пользователь успешно деактивирован' };
  }
}
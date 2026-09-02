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
   * Returns the profile of the current user.
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
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Returns a user by id, subject to role rules.
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
      throw new NotFoundException('User not found');
    }

    // Workers may only read their own profile
    if (
      requestUserRole !== UserRole.ADMIN &&
      requestUserRole !== UserRole.MANAGER &&
      userId !== requestUserId
    ) {
      throw new ForbiddenException('Insufficient permissions to view this user');
    }

    return user;
  }

  /**
   * Lists users with pagination, filtering and search. Admins and managers only.
   */
  async getUsers(query: GetUsersQueryDto) {
    const {
      page = 1,
      limit = 10,
      role,
      isActive,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    // Build the filter
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

    // Total count for pagination metadata
    const total = await this.prisma.users.count({ where });

    // Page of users
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
   * Updates the current user's own profile.
   */
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    // Email must stay unique
    if (dto.email) {
      const existingUser = await this.prisma.users.findUnique({
        where: { email: dto.email },
      });

      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('A user with this email already exists');
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
   * Changes a user's role. Admin only.
   */
  async changeRole(userId: string, dto: ChangeRoleDto, adminId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // An admin must not be able to demote themselves
    if (userId === adminId) {
      throw new BadRequestException('You cannot change your own role');
    }

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
   * Blocks or unblocks a user. Admin only.
   */
  async toggleActive(userId: string, dto: ToggleActiveDto, adminId: string) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // An admin must not be able to lock themselves out
    if (userId === adminId) {
      throw new BadRequestException('You cannot change your own status');
    }

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

    // Blocking a user must also end their active sessions
    if (!dto.isActive) {
      await this.prisma.refreshTokens.deleteMany({
        where: { userId },
      });
    }

    return updatedUser;
  }

  /**
   * Aggregate user statistics. Admin only.
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
   * Soft-deletes a user by deactivating the account.
   */
  async softDeleteUser(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.users.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // End all sessions
    await this.prisma.refreshTokens.deleteMany({
      where: { userId },
    });

    return { message: 'User deactivated successfully' };
  }
}

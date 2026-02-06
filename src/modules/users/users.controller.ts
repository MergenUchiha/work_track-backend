import {
  Controller,
  Get,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ToggleActiveDto } from './dto/toggle-active.dto';
import { GetUsersQueryDto, PaginatedUsersDto } from './dto/get-users-query.dto';
import { UserDto } from './dto/user.dto';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Получить свой профиль
   */
  @Get('profile')
  @ApiOperation({ summary: 'Получить свой профиль' })
  @ApiResponse({
    status: 200,
    description: 'Профиль текущего пользователя',
    type: UserDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Не авторизован',
  })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.usersService.getProfile(userId);
  }

  /**
   * Обновить свой профиль
   */
  @Put('profile')
  @ApiOperation({ summary: 'Обновить свой профиль' })
  @ApiResponse({
    status: 200,
    description: 'Профиль успешно обновлён',
    type: UserDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email уже используется',
  })
  async updateProfile(
    @CurrentUser('sub') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  /**
   * Получить список всех пользователей (админы и менеджеры)
   */
  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Получить список пользователей с пагинацией и фильтрацией',
    description: 'Доступно только администраторам и менеджерам',
  })
  @ApiResponse({
    status: 200,
    description: 'Список пользователей',
    type: PaginatedUsersDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.usersService.getUsers(query);
  }

  /**
   * Получить пользователя по ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Получить пользователя по ID',
    description: 'Пользователи могут видеть только свой профиль. Админы и менеджеры - любой.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID пользователя',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'Данные пользователя',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Пользователь не найден',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async getUserById(
    @Param('id') userId: string,
    @CurrentUser() currentUser: JwtPayload,
  ) {
    return this.usersService.getUserById(userId, currentUser.sub, currentUser.role);
  }

  /**
   * Изменить роль пользователя (только админ)
   */
  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Изменить роль пользователя',
    description: 'Доступно только администраторам. Нельзя изменить собственную роль.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Роль успешно изменена',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Невозможно изменить собственную роль',
  })
  @ApiResponse({
    status: 404,
    description: 'Пользователь не найден',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async changeRole(
    @Param('id') userId: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.usersService.changeRole(userId, dto, adminId);
  }

  /**
   * Заблокировать/разблокировать пользователя (только админ)
   */
  @Patch(':id/active')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Заблокировать или разблокировать пользователя',
    description: 'Доступно только администраторам. Нельзя изменить статус собственного аккаунта. При блокировке все refresh токены пользователя отзываются.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Статус успешно изменён',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Невозможно изменить статус собственного аккаунта',
  })
  @ApiResponse({
    status: 404,
    description: 'Пользователь не найден',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async toggleActive(
    @Param('id') userId: string,
    @Body() dto: ToggleActiveDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.usersService.toggleActive(userId, dto, adminId);
  }

  /**
   * Получить статистику по пользователям (только админ)
   */
  @Get('stats/overview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Получить статистику по пользователям',
    description: 'Доступно только администраторам',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика пользователей',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 100 },
        active: { type: 'number', example: 85 },
        inactive: { type: 'number', example: 15 },
        byRole: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', example: 'ADMIN' },
              count: { type: 'number', example: 5 },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async getUsersStats() {
    return this.usersService.getUsersStats();
  }

  /**
   * Удалить пользователя (мягкое удаление - деактивация)
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Удалить пользователя (деактивация)',
    description: 'Доступно только администраторам. Выполняется мягкое удаление (isActive = false). Нельзя удалить собственный аккаунт.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID пользователя',
  })
  @ApiResponse({
    status: 200,
    description: 'Пользователь успешно деактивирован',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Пользователь успешно деактивирован' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Невозможно удалить собственный аккаунт',
  })
  @ApiResponse({
    status: 404,
    description: 'Пользователь не найден',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async softDeleteUser(
    @Param('id') userId: string,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.usersService.softDeleteUser(userId, adminId);
  }
}
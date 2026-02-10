import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  Delete,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AuditsService } from './audits.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import {
  GetAuditLogsQueryDto,
  PaginatedAuditLogsDto,
} from './dto/get-audit-logs-query.dto';
import { AuditLogDto } from './dto/audit-log.dto';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  /**
   * Получить все аудит логи (только админ)
   */
  @Get('logs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Получить все аудит логи с фильтрацией',
    description: 'Доступно только администраторам',
  })
  @ApiResponse({
    status: 200,
    description: 'Список аудит логов',
    type: PaginatedAuditLogsDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async getLogs(@Query() query: GetAuditLogsQueryDto) {
    return this.auditsService.getLogs(query);
  }

  /**
   * Получить логи для конкретного заказа
   */
  @Get('logs/order/:orderId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Получить логи для конкретного заказа',
    description: 'Доступно администраторам и менеджерам',
  })
  @ApiParam({
    name: 'orderId',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'История изменений заказа',
    type: [AuditLogDto],
  })
  async getOrderLogs(@Param('orderId') orderId: string) {
    return this.auditsService.getOrderLogs(orderId);
  }

  /**
   * Получить логи для конкретного пользователя
   */
  @Get('logs/user/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Получить логи действий конкретного пользователя',
    description: 'Доступно только администраторам',
  })
  @ApiParam({
    name: 'userId',
    description: 'UUID пользователя',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Максимальное количество логов (по умолчанию 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'История действий пользователя',
    type: [AuditLogDto],
  })
  async getUserLogs(
    @Param('userId') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditsService.getUserLogs(userId, limit);
  }

  /**
   * Получить мои действия
   */
  @Get('logs/my-activity')
  @ApiOperation({
    summary: 'Получить историю своих действий',
    description: 'Пользователь видит свою активность',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Максимальное количество логов (по умолчанию 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'История моих действий',
    type: [AuditLogDto],
  })
  async getMyActivity(
    @CurrentUser('sub') userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.auditsService.getUserLogs(userId, limit);
  }

  /**
   * Получить статистику по действиям
   */
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Получить статистику по действиям',
    description: 'Доступно только администраторам',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Начальная дата (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'Конечная дата (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика действий',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 1000 },
        byAction: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              action: { type: 'string', example: 'STATUS_CHANGED' },
              count: { type: 'number', example: 250 },
            },
          },
        },
        topUsers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  email: { type: 'string' },
                  name: { type: 'string' },
                  role: { type: 'string' },
                },
              },
              count: { type: 'number', example: 150 },
            },
          },
        },
      },
    },
  })
  async getStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    return this.auditsService.getActionStats(dateFrom, dateTo);
  }

  /**
   * Получить последние действия
   */
  @Get('logs/recent')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Получить последние действия в системе',
    description: 'Доступно администраторам и менеджерам',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Количество логов (по умолчанию 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Последние действия',
    type: [AuditLogDto],
  })
  async getRecentLogs(@Query('limit') limit?: number) {
    return this.auditsService.getRecentLogs(limit);
  }

  /**
   * Получить историю изменений конкретного поля
   */
  @Get('logs/order/:orderId/field/:field')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Получить историю изменений конкретного поля заказа',
    description: 'Доступно администраторам и менеджерам',
  })
  @ApiParam({
    name: 'orderId',
    description: 'UUID заказа',
  })
  @ApiParam({
    name: 'field',
    description: 'Название поля (например: status, priority, assignedToId)',
  })
  @ApiResponse({
    status: 200,
    description: 'История изменений поля',
  })
  async getFieldHistory(
    @Param('orderId') orderId: string,
    @Param('field') field: string,
  ) {
    return this.auditsService.getFieldHistory(orderId, field);
  }

  /**
   * Очистить старые логи (только админ)
   */
  @Delete('logs/cleanup')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Очистить старые логи',
    description: 'Удаляет логи старше указанного количества дней. Доступно только администраторам.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Количество дней для хранения логов (по умолчанию 90)',
  })
  @ApiResponse({
    status: 200,
    description: 'Логи успешно очищены',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Удалено 150 старых логов' },
        deletedCount: { type: 'number', example: 150 },
        cutoffDate: { type: 'string', example: '2023-10-01T00:00:00.000Z' },
      },
    },
  })
  async cleanupOldLogs(@Query('days') days?: number) {
    return this.auditsService.cleanupOldLogs(days);
  }
}
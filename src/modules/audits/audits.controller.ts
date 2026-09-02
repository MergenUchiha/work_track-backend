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
import { GetAuditLogsQueryDto, PaginatedAuditLogsDto } from './dto/get-audit-logs-query.dto';
import { AuditLogDto } from './dto/audit-log.dto';

@ApiTags('Audit')
@Controller('audit')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AuditsController {
  constructor(private readonly auditsService: AuditsService) {}

  @Get('logs')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List audit log entries with filtering',
    description: 'Admins only',
  })
  @ApiResponse({
    status: 200,
    description: 'Audit log entries',
    type: PaginatedAuditLogsDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async getLogs(@Query() query: GetAuditLogsQueryDto) {
    return this.auditsService.getLogs(query);
  }

  /**
   * Returns the full audit trail of one order.
   */
  @Get('logs/order/:orderId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Get the audit trail of an order',
    description: 'Admins and managers only',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Order change history',
    type: [AuditLogDto],
  })
  async getOrderLogs(@Param('orderId') orderId: string) {
    return this.auditsService.getOrderLogs(orderId);
  }

  /**
   * Returns the recent actions of one user.
   */
  @Get('logs/user/:userId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get the action history of a user',
    description: 'Admins only',
  })
  @ApiParam({
    name: 'userId',
    description: 'User UUID',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of entries (default 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'User action history',
    type: [AuditLogDto],
  })
  async getUserLogs(@Param('userId') userId: string, @Query('limit') limit?: number) {
    return this.auditsService.getUserLogs(userId, limit);
  }

  @Get('logs/my-activity')
  @ApiOperation({
    summary: 'Get your own action history',
    description: 'Returns the current user activity',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of entries (default 50)',
  })
  @ApiResponse({
    status: 200,
    description: 'Your action history',
    type: [AuditLogDto],
  })
  async getMyActivity(@CurrentUser('sub') userId: string, @Query('limit') limit?: number) {
    return this.auditsService.getUserLogs(userId, limit);
  }

  /**
   * Aggregates actions by type over a date range.
   */
  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get action statistics',
    description: 'Admins only',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    type: String,
    description: 'Start date (YYYY-MM-DD)',
  })
  @ApiQuery({
    name: 'dateTo',
    required: false,
    type: String,
    description: 'End date (YYYY-MM-DD)',
  })
  @ApiResponse({
    status: 200,
    description: 'Action statistics',
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
  async getStats(@Query('dateFrom') dateFrom?: string, @Query('dateTo') dateTo?: string) {
    return this.auditsService.getActionStats(dateFrom, dateTo);
  }

  @Get('logs/recent')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Get the most recent actions',
    description: 'Admins and managers only',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Number of entries (default 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Recent actions',
    type: [AuditLogDto],
  })
  async getRecentLogs(@Query('limit') limit?: number) {
    return this.auditsService.getRecentLogs(limit);
  }

  /**
   * Returns how one field of an order changed over time.
   */
  @Get('logs/order/:orderId/field/:field')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Get the change history of one order field',
    description: 'Admins and managers only',
  })
  @ApiParam({
    name: 'orderId',
    description: 'Order UUID',
  })
  @ApiParam({
    name: 'field',
    description: 'Field name, e.g. status, priority, assignedToId',
  })
  @ApiResponse({
    status: 200,
    description: 'Field change history',
  })
  async getFieldHistory(@Param('orderId') orderId: string, @Param('field') field: string) {
    return this.auditsService.getFieldHistory(orderId, field);
  }

  @Delete('logs/cleanup')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete old audit entries',
    description: 'Deletes entries older than the given number of days. Admins only.',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Retention window in days (default 90)',
  })
  @ApiResponse({
    status: 200,
    description: 'Old entries removed',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Removed 150 old audit entries' },
        deletedCount: { type: 'number', example: 150 },
        cutoffDate: { type: 'string', example: '2023-10-01T00:00:00.000Z' },
      },
    },
  })
  async cleanupOldLogs(@Query('days') days?: number) {
    return this.auditsService.cleanupOldLogs(days);
  }
}

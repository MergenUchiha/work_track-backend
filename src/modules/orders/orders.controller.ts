import {
  Controller,
  Get,
  Post,
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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser, JwtPayload } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { AssignOrderDto } from './dto/assign-order.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { GetOrdersQueryDto, PaginatedOrdersDto } from './dto/get-orders-query.dto';
import { OrderDto } from './dto/order.dto';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * Creates an order. Admins and managers only. (Admin, Manager)
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create an order',
    description: 'Admins and managers only',
  })
  @ApiResponse({
    status: 201,
    description: 'Order created',
    type: OrderDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.create(dto, user.sub, user.role);
  }

  @Get()
  @ApiOperation({
    summary: 'List orders',
    description:
      'Admins and managers see every order. Workers see only orders they created or are assigned to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Orders',
    type: PaginatedOrdersDto,
  })
  async findAll(@Query() query: GetOrdersQueryDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.findAll(query, user.sub, user.role);
  }

  /**
   * Aggregate order statistics.
   */
  @Get('stats/overview')
  @ApiOperation({
    summary: 'Get order statistics',
    description: 'Workers see only their own statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Order statistics',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 100 },
        overdue: { type: 'number', example: 5 },
        byStatus: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'IN_PROGRESS' },
              count: { type: 'number', example: 25 },
            },
          },
        },
        byPriority: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              priority: { type: 'string', example: 'HIGH' },
              count: { type: 'number', example: 15 },
            },
          },
        },
      },
    },
  })
  async getStats(@CurrentUser() user: JwtPayload) {
    return this.ordersService.getStats(user.sub, user.role);
  }

  /**
   * Returns an order by id, subject to role rules.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get an order by ID',
    description: 'Workers can only read their own orders; admins and managers can read any.',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Order',
    type: OrderDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.findOne(id, user.sub, user.role);
  }

  /**
   * Updates an order.
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Update an order',
    description:
      'The creator, an admin or a manager may update an order. Completed and cancelled orders cannot be updated.',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Order updated',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Completed or cancelled orders cannot be updated',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.update(id, dto, user.sub, user.role);
  }

  /**
   * Assigns or unassigns a worker. Admins and managers only.
   */
  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Assign or unassign a worker',
    description: 'Admins and managers only. Set assignedToId to null to unassign.',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Assignee updated',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Completed or cancelled orders cannot be reassigned',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.assign(id, dto, user.sub, user.role);
  }

  /**
   * Moves an order to a new status, guarded by the state machine.
   */
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change the order status',
    description:
      'Transitions are guarded by a state machine: NEW → IN_PROGRESS/CANCELLED, IN_PROGRESS → DONE/CANCELLED. Only the assignee may move an order to IN_PROGRESS or DONE.',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Status changed',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Illegal status transition',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.changeStatus(id, dto, user.sub, user.role);
  }

  /**
   * Cancels an order and records the reason.
   */
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an order with a reason',
    description:
      'The creator, an admin or a manager may cancel an order. The reason is written to the audit log.',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Order cancelled',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'The order cannot be cancelled in its current status',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.cancel(id, dto, user.sub, user.role);
  }

  /**
   * Deletes an order. Admin only.
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete an order',
    description: 'Admins only',
  })
  @ApiParam({
    name: 'id',
    description: 'Order UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Order deleted',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Order deleted successfully' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.remove(id, user.sub, user.role);
  }
}

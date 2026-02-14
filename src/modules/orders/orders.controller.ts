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
   * Создать новый заказ (Admin, Manager)
   */
  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Создать новый заказ',
    description: 'Доступно только администраторам и менеджерам',
  })
  @ApiResponse({
    status: 201,
    description: 'Заказ успешно создан',
    type: OrderDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async create(@Body() dto: CreateOrderDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.create(dto, user.sub, user.role);
  }

  /**
   * Получить список заказов с фильтрацией
   */
  @Get()
  @ApiOperation({
    summary: 'Получить список заказов',
    description:
      'Админы и менеджеры видят все заказы. Работники видят только свои заказы (созданные или назначенные им).',
  })
  @ApiResponse({
    status: 200,
    description: 'Список заказов',
    type: PaginatedOrdersDto,
  })
  async findAll(@Query() query: GetOrdersQueryDto, @CurrentUser() user: JwtPayload) {
    return this.ordersService.findAll(query, user.sub, user.role);
  }

  /**
   * Получить статистику по заказам
   */
  @Get('stats/overview')
  @ApiOperation({
    summary: 'Получить статистику по заказам',
    description: 'Работники видят только свою статистику',
  })
  @ApiResponse({
    status: 200,
    description: 'Статистика заказов',
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
   * Получить заказ по ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Получить заказ по ID',
    description: 'Работники могут видеть только свои заказы. Админы и менеджеры видят все.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Данные заказа',
    type: OrderDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Заказ не найден',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.findOne(id, user.sub, user.role);
  }

  /**
   * Обновить заказ
   */
  @Put(':id')
  @ApiOperation({
    summary: 'Обновить заказ',
    description:
      'Создатель заказа или админ/менеджер могут обновлять заказ. Нельзя обновлять завершённые или отменённые заказы.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно обновлён',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Нельзя обновлять завершённые или отменённые заказы',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.update(id, dto, user.sub, user.role);
  }

  /**
   * Назначить/снять исполнителя
   */
  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'Назначить или снять исполнителя',
    description:
      'Доступно только администраторам и менеджерам. Установите assignedToId в null для снятия назначения.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Исполнитель успешно назначен/снят',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Нельзя назначать на завершённые или отменённые заказы',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async assign(
    @Param('id') id: string,
    @Body() dto: AssignOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.assign(id, dto, user.sub, user.role);
  }

  /**
   * Изменить статус заказа (FSM)
   */
  @Patch(':id/status')
  @ApiOperation({
    summary: 'Изменить статус заказа',
    description:
      'Переходы контролируются FSM. NEW → IN_PROGRESS/CANCELLED, IN_PROGRESS → DONE/CANCELLED. Только исполнитель может перевести в IN_PROGRESS или DONE.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Статус успешно изменён',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Невозможный переход статуса',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.changeStatus(id, dto, user.sub, user.role);
  }

  /**
   * Отменить заказ с указанием причины
   */
  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Отменить заказ с указанием причины',
    description:
      'Создатель заказа или админ/менеджер могут отменять заказ. Причина сохраняется в audit log.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно отменён',
    type: OrderDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Невозможно отменить заказ в текущем статусе',
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async cancel(
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.ordersService.cancel(id, dto, user.sub, user.role);
  }

  /**
   * Удалить заказ (только админ)
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Удалить заказ',
    description: 'Доступно только администраторам',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID заказа',
  })
  @ApiResponse({
    status: 200,
    description: 'Заказ успешно удалён',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Заказ успешно удалён' },
      },
    },
  })
  @ApiResponse({
    status: 403,
    description: 'Недостаточно прав',
  })
  async remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ordersService.remove(id, user.sub, user.role);
  }
}

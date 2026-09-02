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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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

  @Get('profile')
  @ApiOperation({ summary: 'Get your own profile' })
  @ApiResponse({
    status: 200,
    description: 'Current user profile',
    type: UserDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getProfile(@CurrentUser('sub') userId: string) {
    return this.usersService.getProfile(userId);
  }

  /**
   * Updates the current user's own profile.
   */
  @Put('profile')
  @ApiOperation({ summary: 'Update your own profile' })
  @ApiResponse({
    status: 200,
    description: 'Profile updated',
    type: UserDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
  })
  async updateProfile(@CurrentUser('sub') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({
    summary: 'List users with pagination and filtering',
    description: 'Admins and managers only',
  })
  @ApiResponse({
    status: 200,
    description: 'Users',
    type: PaginatedUsersDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async getUsers(@Query() query: GetUsersQueryDto) {
    return this.usersService.getUsers(query);
  }

  /**
   * Returns a user by id, subject to role rules.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a user by ID',
    description: 'Workers can only read their own profile; admins and managers can read any.',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @ApiResponse({
    status: 200,
    description: 'User',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async getUserById(@Param('id') userId: string, @CurrentUser() currentUser: JwtPayload) {
    return this.usersService.getUserById(userId, currentUser.sub, currentUser.role);
  }

  /**
   * Changes a user's role. Admin only.
   */
  @Patch(':id/role')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Change a user role',
    description: 'Admins only. You cannot change your own role.',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Role changed',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'You cannot change your own role',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async changeRole(
    @Param('id') userId: string,
    @Body() dto: ChangeRoleDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.usersService.changeRole(userId, dto, adminId);
  }

  /**
   * Blocks or unblocks a user. Admin only.
   */
  @Patch(':id/active')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Block or unblock a user',
    description:
      'Admins only. You cannot change your own status. Blocking a user revokes all of their refresh tokens.',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'Status changed',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'You cannot change your own status',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async toggleActive(
    @Param('id') userId: string,
    @Body() dto: ToggleActiveDto,
    @CurrentUser('sub') adminId: string,
  ) {
    return this.usersService.toggleActive(userId, dto, adminId);
  }

  @Get('stats/overview')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get user statistics',
    description: 'Admins only',
  })
  @ApiResponse({
    status: 200,
    description: 'User statistics',
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
    description: 'Insufficient permissions',
  })
  async getUsersStats() {
    return this.usersService.getUsersStats();
  }

  /**
   * Soft-deletes a user by deactivating the account.
   */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete a user (soft delete)',
    description:
      'Admins only. Performs a soft delete (isActive = false). You cannot delete your own account.',
  })
  @ApiParam({
    name: 'id',
    description: 'User UUID',
  })
  @ApiResponse({
    status: 200,
    description: 'User deactivated',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'User deactivated successfully' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'You cannot delete your own account',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @ApiResponse({
    status: 403,
    description: 'Insufficient permissions',
  })
  async softDeleteUser(@Param('id') userId: string, @CurrentUser('sub') adminId: string) {
    return this.usersService.softDeleteUser(userId, adminId);
  }
}

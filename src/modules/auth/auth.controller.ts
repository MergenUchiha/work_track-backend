import { Controller, Post, Body, HttpCode, HttpStatus, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AuthResponseDto, RefreshResponseDto, UserResponseDto } from './dto/auth-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser, JwtPayload } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Регистрация нового пользователя
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Регистрация нового пользователя' })
  @ApiResponse({
    status: 201,
    description: 'Пользователь успешно зарегистрирован',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Пользователь с таким email уже существует',
  })
  @ApiResponse({
    status: 400,
    description: 'Некорректные данные',
  })
  async register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * Вход пользователя
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход в систему' })
  @ApiResponse({
    status: 200,
    description: 'Успешный вход',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Неверный email или пароль',
  })
  async login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  /**
   * Обновление токенов
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновление access и refresh токенов' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({
    status: 200,
    description: 'Токены успешно обновлены',
    type: RefreshResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Недействительный refresh токен',
  })
  async refresh(@Body() dto: RefreshDto): Promise<RefreshResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  /**
   * Выход из системы
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выход из системы (отзыв refresh токена)' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({
    status: 200,
    description: 'Успешный выход',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Успешный выход из системы' },
      },
    },
  })
  async logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  /**
   * Завершение всех сессий пользователя
   */
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Завершить все сессии (отозвать все refresh токены)' })
  @ApiResponse({
    status: 200,
    description: 'Все сессии завершены',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Все сессии завершены' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Не авторизован',
  })
  async logoutAll(@CurrentUser('sub') userId: string) {
    return this.authService.logoutAll(userId);
  }

  /**
   * Получение информации о текущем пользователе
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить профиль текущего пользователя' })
  @ApiResponse({
    status: 200,
    description: 'Профиль пользователя',
    type: UserResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Не авторизован',
  })
  getProfile(@CurrentUser() user: JwtPayload) {
    return user;
  }
}

import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  /**
   * Регистрация нового пользователя
   */
  async register(dto: RegisterDto) {
    // Проверяем, существует ли пользователь с таким email
    const existingUser = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    // Хешируем пароль
    const saltRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    // Создаём пользователя
    const user = await this.prisma.users.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: UserRole.WORKER, // По умолчанию WORKER
        isActive: true,
      },
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

    // Генерируем токены
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user,
    };
  }

  /**
   * Вход пользователя
   */
  async login(dto: LoginDto) {
    // Ищем пользователя
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Проверяем пароль
    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    // Проверяем, активен ли аккаунт
    if (!user.isActive) {
      throw new UnauthorizedException('Аккаунт деактивирован');
    }

    // Генерируем токены
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Обновление токенов (refresh)
   */
  async refresh(refreshToken: string) {
    // Проверяем JWT signature и срок действия
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Недействительный refresh токен');
    }

    // Хешируем токен для поиска в БД
    const tokenHash = this.hashToken(refreshToken);

    // Ищем токен в БД
    const storedToken = await this.prisma.refreshTokens.findFirst({
      where: {
        tokenHash,
        userId: payload.sub,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh токен не найден');
    }

    // Проверяем, не отозван ли токен
    if (storedToken.revoked) {
      throw new UnauthorizedException('Refresh токен был отозван');
    }

    // Проверяем срок действия
    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Срок действия refresh токена истёк');
    }

    // Получаем пользователя
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Пользователь не найден или деактивирован');
    }

    // Удаляем старый refresh токен (one-time use)
    await this.prisma.refreshTokens.delete({
      where: { id: storedToken.id },
    });

    // Генерируем новую пару токенов
    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return tokens;
  }

  /**
   * Выход (logout) - отзываем refresh токен
   */
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    // Ищем и удаляем токен
    const storedToken = await this.prisma.refreshTokens.findFirst({
      where: { tokenHash },
    });

    if (storedToken) {
      await this.prisma.refreshTokens.delete({
        where: { id: storedToken.id },
      });
    }

    return { message: 'Успешный выход из системы' };
  }

  /**
   * Отзыв всех refresh токенов пользователя
   */
  async logoutAll(userId: string) {
    await this.prisma.refreshTokens.deleteMany({
      where: { userId },
    });

    return { message: 'Все сессии завершены' };
  }

  /**
   * Генерация пары токенов (access + refresh)
   */
  private async generateTokens(userId: string, email: string, role: UserRole) {
    // Payload для Access Token
    const accessPayload = {
      sub: userId,
      email,
      role,
    };

    // Генерируем Access Token
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_ACCESS_EXPIRATION') || '30m') as any,
    });

    // Payload для Refresh Token
    const refreshPayload = {
      sub: userId,
      tokenId: crypto.randomUUID(), // Уникальный ID для токена
    };

    // Генерируем Refresh Token
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRATION') || '30d') as any,
    });

    // Хешируем refresh токен перед сохранением
    const tokenHash = this.hashToken(refreshToken);

    // Вычисляем дату истечения
    const expiresAt = new Date();
    const expirationDays = parseInt(
      this.configService.get<string>('JWT_REFRESH_EXPIRATION')?.replace('d', '') || '30',
    );
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

    // Сохраняем refresh токен в БД
    await this.prisma.refreshTokens.create({
      data: {
        tokenHash,
        expiresAt,
        userId,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Хеширование токена (SHA-256)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

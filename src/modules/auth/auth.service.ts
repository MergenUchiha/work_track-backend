import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
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
    const existingUser = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const saltRounds = this.configService.get<number>('BCRYPT_ROUNDS') || 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.users.create({
      data: {
        email: dto.email,
        name: dto.name,
        passwordHash,
        role: UserRole.WORKER,
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
    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Неверный email или пароль');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Аккаунт деактивирован');
    }

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
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Недействительный refresh токен');
    }

    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshTokens.findFirst({
      where: {
        tokenHash,
        userId: payload.sub,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh токен не найден');
    }

    if (storedToken.revoked) {
      throw new UnauthorizedException('Refresh токен был отозван');
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Срок действия refresh токена истёк');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Пользователь не найден или деактивирован');
    }

    await this.prisma.refreshTokens.delete({
      where: { id: storedToken.id },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return tokens;
  }

  /**
   * Выход (logout)
   */
  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

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
   *
   * FIX: Использует корректные имена переменных из .env:
   *   JWT_ACCESS_EXPIRES_IN (было: JWT_ACCESS_EXPIRATION)
   *   JWT_REFRESH_EXPIRES_IN (было: JWT_REFRESH_EXPIRATION)
   */
  private async generateTokens(userId: string, email: string, role: UserRole) {
    const accessPayload = {
      sub: userId,
      email,
      role,
    };

    // ✅ FIX: JWT_ACCESS_EXPIRES_IN (соответствует .env.example)
    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn as any,
    });

    const refreshPayload = {
      sub: userId,
      tokenId: crypto.randomUUID(),
    };

    // ✅ FIX: JWT_REFRESH_EXPIRES_IN (соответствует .env.example)
    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn as any,
    });

    const tokenHash = this.hashToken(refreshToken);

    // ✅ FIX: Корректное вычисление даты истечения из JWT_REFRESH_EXPIRES_IN
    const expiresAt = new Date();
    const expirationDays = parseInt(refreshExpiresIn.replace('d', '') || '7');
    expiresAt.setDate(expiresAt.getDate() + expirationDays);

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

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtAccessPayload {
  sub: string; // userId
  email: string;
  role: string;
}

/**
 * Стратегия для валидации JWT Access Token
 * Автоматически проверяет подпись и срок действия токена
 */
@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET')
    });
  }

  /**
   * Метод validate вызывается автоматически после успешной проверки токена
   * Здесь можно добавить дополнительные проверки (например, активен ли пользователь)
   */
  async validate(payload: JwtAccessPayload) {
    // Проверяем, существует ли пользователь и активен ли он
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true
      }
    });

    if (!user) {
      throw new UnauthorizedException('Пользователь не найден');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Аккаунт деактивирован');
    }

    // Возвращаемый объект будет доступен в req.user
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role
    };
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

export interface JwtRefreshPayload {
  sub: string; // userId
  tokenId: string; // ID refresh токена в БД
}

/**
 * Стратегия для валидации JWT Refresh Token
 * Извлекает токен из body запроса
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromBodyField('refreshToken'),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_REFRESH_SECRET'),
      passReqToCallback: true // Передаём req в validate
    });
  }

  /**
   * Validate вызывается после успешной проверки JWT
   * Получаем payload и сам токен для дальнейшей валидации в БД
   */
  async validate(req: Request, payload: JwtRefreshPayload) {
    const refreshToken = req.body?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh токен отсутствует');
    }

    // Возвращаем payload + сам токен для проверки в сервисе
    return {
      sub: payload.sub,
      tokenId: payload.tokenId,
      refreshToken // Сам токен для проверки хеша в БД
    };
  }
}

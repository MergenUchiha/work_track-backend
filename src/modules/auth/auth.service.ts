import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UserRole } from '@prisma/client';
import { LoginAttemptsService } from './login-attempts.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private loginAttempts: LoginAttemptsService,
  ) {}

  /** Registers a new user and signs them in. */
  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists');
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
   * Authenticates a user by email and password.
   *
   * `clientIp` scopes the failure counter, so guessing one account never
   * locks out other people signing in from the same address.
   */
  async login(dto: LoginDto, clientIp = 'unknown') {
    const attemptKey = this.loginAttempts.buildKey(clientIp, dto.email);
    this.loginAttempts.assertNotLocked(attemptKey);

    const user = await this.prisma.users.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      this.loginAttempts.recordFailure(attemptKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);

    if (!isPasswordValid) {
      this.loginAttempts.recordFailure(attemptKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Correct credentials clear the budget, so a legitimate user who mistyped
    // a few times is never locked out.
    this.loginAttempts.reset(attemptKey);

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

  /** Rotates a refresh token: the old one is consumed, a new pair is issued. */
  async refresh(refreshToken: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(refreshToken);

    const storedToken = await this.prisma.refreshTokens.findFirst({
      where: {
        tokenHash,
        userId: payload.sub,
      },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found');
    }

    if (storedToken.revoked) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    await this.prisma.refreshTokens.delete({
      where: { id: storedToken.id },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);

    return tokens;
  }

  /** Revokes a single refresh token. */
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

    return { message: 'Signed out successfully' };
  }

  /** Revokes every refresh token belonging to a user. */
  async logoutAll(userId: string) {
    await this.prisma.refreshTokens.deleteMany({
      where: { userId },
    });

    return { message: 'All sessions have been ended' };
  }

  /**
   * Issues an access/refresh token pair and records the refresh token.
   */
  private async generateTokens(userId: string, email: string, role: UserRole) {
    const accessPayload = {
      sub: userId,
      email,
      role,
    };

    const accessExpiresIn = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN') || '15m';
    const accessToken = this.jwtService.sign(accessPayload, {
      secret: this.configService.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: accessExpiresIn,
    });

    const refreshPayload = {
      sub: userId,
      tokenId: crypto.randomUUID(),
    };

    const refreshExpiresIn = this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d';
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshExpiresIn,
    });

    const tokenHash = this.hashToken(refreshToken);

    // Read the expiry from the signed token rather than re-parsing the
    // configured duration: any format jsonwebtoken accepts ("7d", "12h",
    // "30m") stays in sync with the database row automatically.
    const expiresAt = this.getTokenExpiry(refreshToken);

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

  /** Expiry of a signed JWT, taken from its own `exp` claim. */
  private getTokenExpiry(token: string): Date {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;

    if (!decoded?.exp) {
      throw new Error('Signed refresh token has no exp claim');
    }

    return new Date(decoded.exp * 1000);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}

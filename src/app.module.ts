import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './modules/auth/auth.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { OrdersModule } from './modules/orders/orders.module';
import { AuditsModule } from './modules/audits/audits.module';
import { HealthModule } from './common/health/health.module';
import { BotModule } from './bot/bot.module';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { throttlerConfig } from './common/config/throttler.config';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    // Global environment configuration, validated at startup
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
      validate: validateEnv,
    }),

    // Rate limiting
    ThrottlerModule.forRoot(throttlerConfig),

    // Application modules
    AuthModule,
    PrismaModule,
    UsersModule,
    OrdersModule,
    AuditsModule,
    HealthModule,

    // Telegram bot (optional)
    BotModule.forRoot(),
  ],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Attach a request id to every route, for traceable logs
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

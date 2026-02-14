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
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { throttlerConfig } from './common/config/throttler.config';

@Module({
  imports: [
    // Глобальная конфигурация environment variables
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      cache: true,
    }),

    // Rate Limiting (защита от DDoS и чрезмерного использования)
    ThrottlerModule.forRoot(throttlerConfig),

    // Основные модули приложения
    AuthModule,
    PrismaModule,
    UsersModule,
    OrdersModule,
    AuditsModule,
    HealthModule,
  ],
  providers: [
    // Глобальный guard для rate limiting
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Применяем middleware для добавления Request ID ко всем маршрутам
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

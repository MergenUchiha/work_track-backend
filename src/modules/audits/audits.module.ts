import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AuditsController } from './audits.controller';
import { AuditsService } from './audits.service';
import { AuditMiddleware } from './middleware/audit.middleware';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AuditsController],
  providers: [AuditsService],
  exports: [AuditsService],
})
export class AuditsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Применяем middleware ко всем роутам
    consumer.apply(AuditMiddleware).forRoutes('*');
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { PrismaService } from '../../modules/prisma/prisma.service';
import { SkipThrottle } from '../decorators/throttle-custom.decorator';

/**
 * Health Check Controller
 * Предоставляет эндпоинты для проверки здоровья приложения
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle() // Пропускаем rate limiting для health checks
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private prisma: PrismaService,
  ) {}

  /**
   * Базовая проверка здоровья
   */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Базовая проверка здоровья приложения' })
  @ApiResponse({
    status: 200,
    description: 'Приложение работает',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        info: { type: 'object' },
        error: { type: 'object' },
        details: { type: 'object' },
      },
    },
  })
  check() {
    return this.health.check([
      // Проверка подключения к базе данных
      () => this.prismaHealth.pingCheck('database', this.prisma),

      // Проверка использования памяти (heap не должна превышать 150MB)
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),

      // Проверка использования RSS памяти (не должна превышать 150MB)
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024),

      // Проверка свободного места на диске (должно быть минимум 1GB)
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9, // 90% заполнения - критично
        }),
    ]);
  }

  /**
   * Детальная проверка здоровья
   */
  @Get('detailed')
  @HealthCheck()
  @ApiOperation({ summary: 'Детальная проверка здоровья приложения' })
  @ApiResponse({
    status: 200,
    description: 'Детальная информация о здоровье',
  })
  detailedCheck() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () => this.memory.checkHeap('memory_heap', 200 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 200 * 1024 * 1024),
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9,
        }),
    ]);
  }

  /**
   * Простая проверка живости (liveness probe)
   * Для Kubernetes и других оркестраторов
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness probe - проверка, что приложение запущено' })
  @ApiResponse({
    status: 200,
    description: 'Приложение живо',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
      },
    },
  })
  liveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Проверка готовности (readiness probe)
   * Для Kubernetes и других оркестраторов
   */
  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe - проверка, что приложение готово принимать запросы',
  })
  @ApiResponse({
    status: 200,
    description: 'Приложение готово',
  })
  readiness() {
    return this.health.check([() => this.prismaHealth.pingCheck('database', this.prisma)]);
  }
}

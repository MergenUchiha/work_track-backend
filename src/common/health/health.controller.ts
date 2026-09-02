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
import { SkipThrottle } from '@nestjs/throttler';

/**
 * Health Check Controller
 * Health endpoints for load balancers and orchestrators.
 */
@ApiTags('Health')
@Controller('health')
@SkipThrottle() // health probes are never rate limited
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private prisma: PrismaService,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({
    status: 200,
    description: 'Application is up',
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
      // Database connectivity
      () => this.prismaHealth.pingCheck('database', this.prisma),

      // Heap usage must stay under 150 MB
      () => this.memory.checkHeap('memory_heap', 150 * 1024 * 1024),

      // RSS must stay under 150 MB
      () => this.memory.checkRSS('memory_rss', 150 * 1024 * 1024),

      // Disk must not be nearly full
      () =>
        this.disk.checkStorage('storage', {
          path: '/',
          thresholdPercent: 0.9, // 90% full is critical
        }),
    ]);
  }

  @Get('detailed')
  @HealthCheck()
  @ApiOperation({ summary: 'Detailed health check' })
  @ApiResponse({
    status: 200,
    description: 'Detailed health information',
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

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe — the process is running' })
  @ApiResponse({
    status: 200,
    description: 'Application is alive',
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

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Readiness probe — the application can serve traffic',
  })
  @ApiResponse({
    status: 200,
    description: 'Application is ready',
  })
  readiness() {
    return this.health.check([() => this.prismaHealth.pingCheck('database', this.prisma)]);
  }
}

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CustomLoggerService } from './common/logger/custom-logger.service';
import { getCorsConfig } from './common/config/cors.config';
import { helmetConfig } from './common/config/helmet.config';

/**
 * Swagger is served unless it is explicitly switched off. When
 * SWAGGER_ENABLED is unset it follows the environment: on in development,
 * off in production, so the API surface is not published by accident.
 */
function isSwaggerEnabled(nodeEnv: string): boolean {
  const flag = process.env.SWAGGER_ENABLED;
  if (flag !== undefined) {
    return flag.trim().toLowerCase() === 'true';
  }
  return nodeEnv !== 'production';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new CustomLoggerService('Bootstrap'),
    bufferLogs: true,
  });

  const logger = new CustomLoggerService('Main');
  const nodeEnv = process.env.NODE_ENV || 'development';

  // ===== SECURITY =====

  app.use(helmet(helmetConfig));
  logger.log('✓ Helmet security headers configured');

  app.enableCors(getCorsConfig());
  logger.log('✓ CORS configured');

  // ===== GLOBAL VALIDATION =====

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: nodeEnv === 'production',
      validationError: {
        target: false,
        value: false,
      },
    }),
  );
  logger.log('✓ Global validation pipe configured');

  // ===== GLOBAL FILTERS & INTERCEPTORS =====

  app.useGlobalFilters(new AllExceptionsFilter());
  logger.log('✓ Global exception filter configured');

  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());
  logger.log('✓ Global interceptors configured');

  // ===== API PREFIX =====

  app.setGlobalPrefix('api', {
    exclude: ['health', 'health/live', 'health/ready', 'health/detailed'],
  });
  logger.log('✓ Global API prefix set to /api');

  // ===== SWAGGER DOCUMENTATION =====

  const swaggerEnabled = isSwaggerEnabled(nodeEnv);

  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('WorkTrack API')
      .setDescription(
        `
      # WorkTrack API Documentation

      Order and task management with role-based access and an audit trail.

      ## Authentication
      JWT-based authentication with refresh tokens.
      Access tokens live **15 minutes**, refresh tokens **7 days**.

      ## Rate limiting
      The API is protected against excessive use:
      - 10 requests per second
      - 100 requests per minute
      - 1000 requests per hour

      Authentication endpoints have stricter limits.

      ## Roles
      - **ADMIN**: full access to every feature
      - **MANAGER**: manages orders and users
      - **WORKER**: works on their own orders
    `,
      )
      .setVersion('1.0.0')
      .setLicense('MIT', 'https://opensource.org/licenses/MIT')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT access token',
          in: 'header',
        },
        'JWT-auth',
      )
      .addTag('Authentication', 'Authentication and authorization endpoints')
      .addTag('Users', 'User management')
      .addTag('Orders', 'Order management')
      .addTag('Audit', 'Audit trail and action logging')
      .addTag('Health', 'Application health checks')
      .addServer('http://localhost:3000', 'Development server')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'none',
        filter: true,
        showRequestDuration: true,
        tryItOutEnabled: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'WorkTrack API Docs',
      customCss: '.swagger-ui .topbar { display: none }',
    });
    logger.log('✓ Swagger documentation configured at /api/docs');
  } else {
    logger.log('✓ Swagger documentation disabled');
  }

  // ===== GRACEFUL SHUTDOWN =====

  app.enableShutdownHooks();
  logger.log('✓ Graceful shutdown hooks enabled');

  // ===== START SERVER =====

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log('');
  logger.log('='.repeat(60));
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  if (swaggerEnabled) {
    logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  }
  logger.log(`💚 Health check: http://localhost:${port}/health`);
  logger.log(`🔒 Environment: ${nodeEnv}`);
  logger.log('='.repeat(60));
  logger.log('');

  process.on('SIGTERM', () => {
    logger.warn('SIGTERM signal received: closing HTTP server');
  });

  process.on('SIGINT', () => {
    logger.warn('SIGINT signal received: closing HTTP server');
  });
}

bootstrap().catch((error) => {
  const logger = new CustomLoggerService('Bootstrap');
  logger.error('Failed to start application', error.stack);
  process.exit(1);
});

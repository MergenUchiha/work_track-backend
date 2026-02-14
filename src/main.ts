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

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new CustomLoggerService('Bootstrap'),
    bufferLogs: true,
  });

  const logger = new CustomLoggerService('Main');

  // ===== SECURITY =====

  // FIX: Используем import helmet from 'helmet' (требует esModuleInterop: true в tsconfig)
  // Было: import * as helmet from 'helmet' + helmet.default(helmetConfig)
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
      disableErrorMessages: process.env.NODE_ENV === 'production',
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

  const config = new DocumentBuilder()
    .setTitle('WorkTrack API')
    .setDescription(
      `
      # WorkTrack API Documentation
      
      Система управления заказами и задачами с поддержкой ролей и аудита.
      
      ## Аутентификация
      Используется JWT-based аутентификация с refresh токенами.
      Access Token действует **15 минут**, Refresh Token — **7 дней**.
      
      ## Rate Limiting
      API защищено от чрезмерного использования:
      - 10 запросов в секунду
      - 100 запросов в минуту
      - 1000 запросов в час
      
      Для аутентификации установлены более строгие лимиты.
      
      ## Роли
      - **ADMIN**: Полный доступ ко всем функциям
      - **MANAGER**: Управление заказами и пользователями
      - **WORKER**: Работа со своими заказами
    `,
    )
    .setVersion('1.0.0')
    .setContact('API Support', 'https://example.com/support', 'support@example.com')
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
    .addTag('Authentication', 'Эндпоинты для аутентификации и авторизации')
    .addTag('Users', 'Управление пользователями')
    .addTag('Orders', 'Управление заказами')
    .addTag('Audit', 'Аудит и логирование действий')
    .addTag('Health', 'Проверка здоровья приложения')
    .addServer('http://localhost:3000', 'Development server')
    .addServer('https://api.example.com', 'Production server')
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

  // ===== GRACEFUL SHUTDOWN =====

  app.enableShutdownHooks();
  logger.log('✓ Graceful shutdown hooks enabled');

  // ===== START SERVER =====

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log('');
  logger.log('='.repeat(60));
  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
  logger.log(`💚 Health check: http://localhost:${port}/health`);
  logger.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
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

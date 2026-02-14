import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { CustomLoggerService } from './common/logger/custom-logger.service';
import { getCorsConfig } from './common/config/cors.config';
import { helmetConfig } from './common/config/helmet.config';

async function bootstrap() {
  // Создаем приложение с custom logger
  const app = await NestFactory.create(AppModule, {
    logger: new CustomLoggerService('Bootstrap'),
    bufferLogs: true,
  });

  const logger = new CustomLoggerService('Main');

  // ===== SECURITY =====

  // Helmet - защита HTTP headers
  app.use(helmet.default(helmetConfig));
  logger.log('✓ Helmet security headers configured');

  // CORS - защита от cross-origin запросов
  app.enableCors(getCorsConfig());
  logger.log('✓ CORS configured');

  // ===== GLOBAL VALIDATION =====

  // Глобальная валидация DTO с улучшенными настройками
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Удаляет свойства, не описанные в DTO
      forbidNonWhitelisted: true, // Выбрасывает ошибку при лишних свойствах
      transform: true, // Автоматически преобразует типы
      transformOptions: {
        enableImplicitConversion: true, // Включает неявное преобразование типов
      },
      disableErrorMessages: process.env.NODE_ENV === 'production', // Скрываем детали в production
      validationError: {
        target: false, // Не включаем target в ошибки валидации
        value: false, // Не включаем value в ошибки валидации
      },
    }),
  );
  logger.log('✓ Global validation pipe configured');

  // ===== GLOBAL FILTERS & INTERCEPTORS =====

  // Глобальный exception filter
  app.useGlobalFilters(new AllExceptionsFilter());
  logger.log('✓ Global exception filter configured');

  // Глобальные interceptors
  app.useGlobalInterceptors(
    new LoggingInterceptor(), // Логирование запросов/ответов
    new TransformInterceptor(), // Трансформация ответов
  );
  logger.log('✓ Global interceptors configured');

  // ===== API PREFIX =====

  // Устанавливаем глобальный префикс для всех роутов (кроме health checks)
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
        description: 'Enter JWT token',
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
      persistAuthorization: true, // Сохраняем авторизацию между обновлениями
      docExpansion: 'none', // Сворачиваем все секции по умолчанию
      filter: true, // Включаем поиск
      showRequestDuration: true, // Показываем время выполнения запросов
      tryItOutEnabled: true, // Включаем "Try it out" по умолчанию
      tagsSorter: 'alpha', // Сортировка тегов по алфавиту
      operationsSorter: 'alpha', // Сортировка операций по алфавиту
    },
    customSiteTitle: 'WorkTrack API Docs',
    customfavIcon: 'https://example.com/favicon.ico',
    customCss: '.swagger-ui .topbar { display: none }', // Скрываем topbar
  });
  logger.log('✓ Swagger documentation configured at /api/docs');

  // ===== GRACEFUL SHUTDOWN =====

  // Настраиваем graceful shutdown
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

  // Логируем при завершении работы
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

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Глобальная валидация DTO
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Удаляет свойства, не описанные в DTO
      forbidNonWhitelisted: true, // Выбрасывает ошибку при лишних свойствах
      transform: true, // Автоматически преобразует типы
    }),
  );

  // Настройка CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Swagger документация
  const config = new DocumentBuilder()
    .setTitle('WorkTrack API')
    .setDescription('API для системы управления заказами WorkTrack')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Authentication', 'Эндпоинты для аутентификации и авторизации')
    .addTag('Users', 'Управление пользователями')
    .addTag('Orders', 'Управление заказами')
    .addTag('Audit', 'Аудит и логирование действий')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
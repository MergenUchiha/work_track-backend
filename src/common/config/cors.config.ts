import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Конфигурация CORS
 * Управляет доступом к API с различных доменов
 */
export const getCorsConfig = (): CorsOptions => {
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    : ['http://localhost:3000', 'http://localhost:3001'];

  return {
    origin: (origin, callback) => {
      // Разрешаем запросы без origin (например, из Postman, мобильных приложений)
      if (!origin) {
        callback(null, true);
        return;
      }

      // Проверяем, есть ли origin в списке разрешенных
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },

    // Разрешенные HTTP методы
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    // Разрешенные headers
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Request-ID',
    ],

    // Headers которые будут доступны в ответе
    exposedHeaders: ['X-Request-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],

    // Разрешить отправку credentials (cookies, authorization headers)
    credentials: true,

    // Время кеширования preflight запросов (24 часа)
    maxAge: 86400,

    // Разрешить preflight requests
    preflightContinue: false,

    // Ответ 204 на OPTIONS requests
    optionsSuccessStatus: 204,
  };
};

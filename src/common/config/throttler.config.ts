import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Конфигурация rate limiting
 * Защищает API от DDoS атак и чрезмерного использования
 */
export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'short',
      ttl: 1000, // 1 секунда
      limit: 10, // 10 запросов в секунду
    },
    {
      name: 'medium',
      ttl: 60000, // 1 минута
      limit: 100, // 100 запросов в минуту
    },
    {
      name: 'long',
      ttl: 3600000, // 1 час
      limit: 1000, // 1000 запросов в час
    },
  ],
};

/**
 * Специальные лимиты для различных эндпоинтов
 */
export const RATE_LIMIT_CUSTOM = {
  // Аутентификация (более строгие лимиты)
  auth: {
    login: {
      ttl: 900000, // 15 минут
      limit: 5, // 5 попыток входа в 15 минут
    },
    register: {
      ttl: 3600000, // 1 час
      limit: 3, // 3 регистрации в час
    },
    refresh: {
      ttl: 60000, // 1 минута
      limit: 10, // 10 обновлений токена в минуту
    },
  },

  // Критичные операции
  critical: {
    ttl: 60000, // 1 минута
    limit: 20, // 20 запросов в минуту
  },

  // Публичные эндпоинты
  public: {
    ttl: 60000, // 1 минута
    limit: 60, // 60 запросов в минуту
  },
};

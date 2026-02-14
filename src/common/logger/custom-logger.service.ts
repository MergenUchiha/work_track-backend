import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

/**
 * Custom Logger Service с поддержкой Winston
 * Предоставляет расширенные возможности логирования
 */
@Injectable({ scope: Scope.TRANSIENT })
export class CustomLoggerService implements LoggerService {
  private logger: WinstonLogger;
  private context?: string;

  constructor(context?: string) {
    this.context = context;

    // Конфигурация Winston logger
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.splat(),
        format.json(),
      ),
      defaultMeta: { service: 'worktrack-backend' },
      transports: [
        // Консоль для всех уровней
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.printf(({ timestamp, level, message, context, ...meta }) => {
              const ctx = context || this.context || 'Application';
              const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
              return `${timestamp} [${ctx}] ${level}: ${message} ${metaStr}`;
            }),
          ),
        }),

        // Файл для ошибок
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: format.combine(format.timestamp(), format.json()),
        }),

        // Файл для всех логов
        new transports.File({
          filename: 'logs/combined.log',
          format: format.combine(format.timestamp(), format.json()),
        }),
      ],

      // Обработка необработанных исключений
      exceptionHandlers: [new transports.File({ filename: 'logs/exceptions.log' })],

      // Обработка необработанных промисов
      rejectionHandlers: [new transports.File({ filename: 'logs/rejections.log' })],
    });
  }

  /**
   * Установить контекст для логгера
   */
  setContext(context: string) {
    this.context = context;
  }

  /**
   * Логирование информационного сообщения
   */
  log(message: any, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  /**
   * Логирование ошибки
   */
  error(message: any, trace?: string, context?: string) {
    this.logger.error(message, {
      trace,
      context: context || this.context,
    });
  }

  /**
   * Логирование предупреждения
   */
  warn(message: any, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  /**
   * Логирование отладочной информации
   */
  debug(message: any, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }

  /**
   * Логирование подробной информации
   */
  verbose(message: any, context?: string) {
    this.logger.verbose(message, { context: context || this.context });
  }

  /**
   * Логирование с произвольным уровнем
   */
  logWithLevel(level: string, message: any, meta?: any) {
    this.logger.log(level, message, { ...meta, context: this.context });
  }

  /**
   * Создать child logger с дополнительным контекстом
   */
  child(meta: any): CustomLoggerService {
    const childLogger = new CustomLoggerService(this.context);
    childLogger.logger = this.logger.child(meta);
    return childLogger;
  }
}

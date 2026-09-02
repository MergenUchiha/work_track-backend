import { Injectable, LoggerService, Scope } from '@nestjs/common';
import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';

/**
 * Application logger backed by Winston: console output plus rotating files.
 */
@Injectable({ scope: Scope.TRANSIENT })
export class CustomLoggerService implements LoggerService {
  private logger: WinstonLogger;
  private context?: string;

  constructor(context?: string) {
    this.context = context;

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
        // Console: everything
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

        // File: errors only
        new transports.File({
          filename: 'logs/error.log',
          level: 'error',
          format: format.combine(format.timestamp(), format.json()),
        }),

        // File: everything
        new transports.File({
          filename: 'logs/combined.log',
          format: format.combine(format.timestamp(), format.json()),
        }),
      ],

      // Uncaught exceptions
      exceptionHandlers: [new transports.File({ filename: 'logs/exceptions.log' })],

      // Unhandled promise rejections
      rejectionHandlers: [new transports.File({ filename: 'logs/rejections.log' })],
    });
  }

  /**
   * Sets the context label used in log lines.
   */
  setContext(context: string) {
    this.context = context;
  }

  /**
   * Logs an informational message.
   */
  log(message: any, context?: string) {
    this.logger.info(message, { context: context || this.context });
  }

  /**
   * Logs an error, optionally with a stack trace.
   */
  error(message: any, trace?: string, context?: string) {
    this.logger.error(message, {
      trace,
      context: context || this.context,
    });
  }

  /**
   * Logs a warning.
   */
  warn(message: any, context?: string) {
    this.logger.warn(message, { context: context || this.context });
  }

  /**
   * Logs a debug message.
   */
  debug(message: any, context?: string) {
    this.logger.debug(message, { context: context || this.context });
  }

  /**
   * Logs a verbose message.
   */
  verbose(message: any, context?: string) {
    this.logger.verbose(message, { context: context || this.context });
  }

  /**
   * Logs at an arbitrary level.
   */
  logWithLevel(level: string, message: any, meta?: any) {
    this.logger.log(level, message, { ...meta, context: this.context });
  }

  /**
   * Creates a child logger with its own context.
   */
  child(meta: any): CustomLoggerService {
    const childLogger = new CustomLoggerService(this.context);
    childLogger.logger = this.logger.child(meta);
    return childLogger;
  }
}

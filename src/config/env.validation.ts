import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Verbose = 'verbose',
}

/**
 * Environment variables always arrive as strings, so every conversion here is
 * explicit. class-transformer's `enableImplicitConversion` is deliberately not
 * used: it turns the string "false" into the boolean true.
 */
const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase() === 'true';
};

const toInt = ({ value }: { value: unknown }) => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
};

export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT: number = 3000;

  // ----- Database -----

  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL is required' })
  DATABASE_URL: string;

  // ----- JWT -----

  // 32 characters is the minimum that makes an HS256 secret worth having.
  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET must be at least 32 characters' })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, { message: 'JWT_REFRESH_SECRET must be at least 32 characters' })
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  // ----- Security -----

  @Transform(toInt)
  @IsInt()
  @Min(10)
  @Max(15)
  @IsOptional()
  BCRYPT_ROUNDS: number = 10;

  @IsString()
  @IsOptional()
  CORS_ORIGINS?: string;

  // ----- Observability -----

  @IsEnum(LogLevel)
  @IsOptional()
  LOG_LEVEL: LogLevel = LogLevel.Info;

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  SWAGGER_ENABLED?: boolean;

  // ----- Telegram bot (optional feature) -----

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  TELEGRAM_BOT_ENABLED: boolean = false;

  @IsString()
  @IsOptional()
  TELEGRAM_BOT_TOKEN?: string;

  @Transform(toBoolean)
  @IsBoolean()
  @IsOptional()
  TELEGRAM_USE_WEBHOOK: boolean = false;

  @IsString()
  @IsOptional()
  TELEGRAM_WEBHOOK_DOMAIN?: string;

  @IsString()
  @IsOptional()
  TELEGRAM_WEBHOOK_PATH?: string;
}

/**
 * Runs at startup via ConfigModule. A misconfigured deployment fails here
 * with a readable message instead of somewhere deep inside Passport or Prisma.
 */
export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('\n  - ');

    throw new Error(`Invalid environment configuration:\n  - ${details}`);
  }

  // The bot cannot start without a token, and silently disabling it would
  // hide a deployment mistake.
  if (validated.TELEGRAM_BOT_ENABLED && !validated.TELEGRAM_BOT_TOKEN) {
    throw new Error(
      'Invalid environment configuration:\n  - TELEGRAM_BOT_TOKEN is required when TELEGRAM_BOT_ENABLED=true',
    );
  }

  if (validated.TELEGRAM_USE_WEBHOOK && !validated.TELEGRAM_WEBHOOK_DOMAIN) {
    throw new Error(
      'Invalid environment configuration:\n  - TELEGRAM_WEBHOOK_DOMAIN is required when TELEGRAM_USE_WEBHOOK=true',
    );
  }

  return validated;
}

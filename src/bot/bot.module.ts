import { Module, DynamicModule, Logger } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BotService } from './bot.service';
import { StartHandler } from './handlers/start.handler';
import { TasksHandler } from './handlers/tasks.handler';
import { CreateTaskHandler } from './handlers/create-task.handler';
import { MyTasksHandler } from './handlers/my-tasks.handler';
import { CallbackHandler } from './handlers/callback.handler';
import { PrismaModule } from 'src/modules/prisma/prisma.module';
import { OrdersModule } from 'src/modules/orders/orders.module';
import { UsersModule } from 'src/modules/users/users.module';
import { AuditsModule } from 'src/modules/audits/audits.module';

@Module({})
export class BotModule {
  private static readonly logger = new Logger(BotModule.name);

  /**
   * Dynamic module for the Telegram bot.
   *
   * The bot is optional: with TELEGRAM_BOT_ENABLED unset or false the API
   * runs without it and no Telegraf connection is opened.
   */
  static forRoot(): DynamicModule {
    const isBotEnabled = process.env.TELEGRAM_BOT_ENABLED === 'true';
    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    // Feature flag
    if (!isBotEnabled) {
      this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.warn('⚠️  TELEGRAM BOT IS DISABLED');
      this.logger.warn('   To enable: set TELEGRAM_BOT_ENABLED=true in .env');
      this.logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        module: BotModule,
        imports: [ConfigModule],
        providers: [],
        exports: [],
      };
    }

    // A bot without a token cannot start
    if (!botToken || botToken === 'your-bot-token-here' || botToken.trim() === '') {
      this.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      this.logger.error('❌ TELEGRAM BOT ERROR: Token not configured!');
      this.logger.error('   1. Get token from @BotFather in Telegram');
      this.logger.error('   2. Add to .env: TELEGRAM_BOT_TOKEN=your-token');
      this.logger.error('   3. Or disable bot: TELEGRAM_BOT_ENABLED=false');
      this.logger.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return {
        module: BotModule,
        imports: [ConfigModule],
        providers: [],
        exports: [],
      };
    }

    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    this.logger.log('✅ TELEGRAM BOT IS ENABLED');
    // Only the bot id, never any part of the secret: logs get shipped,
    // grepped and scanned for exactly this pattern.
    this.logger.log(`📱 Bot id: ${botToken.split(':')[0]}`);
    this.logger.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return {
      module: BotModule,
      imports: [
        ConfigModule,
        PrismaModule,
        OrdersModule,
        UsersModule,
        AuditsModule,
        TelegrafModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
            const useWebhook = configService.get<string>('TELEGRAM_USE_WEBHOOK') === 'true';

            const config: any = {
              token,
              launchOptions: {
                dropPendingUpdates: true,
              },
            };

            // Webhook mode, used in production behind HTTPS
            if (useWebhook) {
              const domain = configService.get<string>('TELEGRAM_WEBHOOK_DOMAIN');
              const path = configService.get<string>('TELEGRAM_WEBHOOK_PATH', '/telegram-webhook');

              if (!domain) {
                BotModule.logger.error(
                  '❌ TELEGRAM_WEBHOOK_DOMAIN required when TELEGRAM_USE_WEBHOOK=true',
                );
                throw new Error('TELEGRAM_WEBHOOK_DOMAIN is required for webhook mode');
              }

              config.launchOptions.webhook = {
                domain,
                path,
              };

              BotModule.logger.log(`📡 Webhook mode: ${domain}${path}`);
            } else {
              BotModule.logger.log('🔄 Polling mode enabled');
            }

            return config;
          },
          inject: [ConfigService],
        }),
      ],
      providers: [
        BotService,
        StartHandler,
        TasksHandler,
        CreateTaskHandler,
        MyTasksHandler,
        CallbackHandler,
      ],
      exports: [BotService],
    };
  }
}

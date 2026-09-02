import { Injectable, Logger } from '@nestjs/common';
import { Action, Command, Ctx, Update } from 'nestjs-telegraf';
import { Markup } from 'telegraf';
import { BotContext, BotService } from '../bot.service';
import { OrdersService } from 'src/modules/orders/orders.service';

/** Orders listed on one page. Keeps the message short and the keyboard usable. */
const PAGE_SIZE = 5;

@Update()
@Injectable()
export class TasksHandler {
  private readonly logger = new Logger(TasksHandler.name);

  constructor(
    private readonly botService: BotService,
    private readonly ordersService: OrdersService,
  ) {}

  @Command('tasks')
  async onTasks(@Ctx() ctx: BotContext) {
    try {
      const user = await this.botService.getOrCreateUser(ctx);
      ctx.user = user;

      const page = await this.renderPage(1, user.id, user.role);

      if (!page) {
        await ctx.reply('📋 There are no orders yet.');
        return;
      }

      await ctx.reply(page.text, {
        parse_mode: 'HTML',
        reply_markup: page.keyboard.reply_markup,
      });
    } catch (error) {
      this.logger.error(`Error in /tasks handler: ${error.message}`, error.stack);
      await ctx.reply('❌ Could not load orders. Please try again later.');
    }
  }

  /** Page navigation: rewrites the same message instead of sending a new one. */
  @Action(/^orders_page_(\d+)$/)
  async onPage(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const pageNumber = Number(ctx.match[1]);
      const user = await this.botService.getOrCreateUser(ctx);
      const page = await this.renderPage(pageNumber, user.id, user.role);

      if (!page) {
        await ctx.editMessageText('📋 There are no orders yet.');
        return;
      }

      await ctx.editMessageText(page.text, {
        parse_mode: 'HTML',
        reply_markup: page.keyboard.reply_markup,
      });
    } catch (error) {
      this.logger.error(`Error in page action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not load that page');
    }
  }

  /**
   * Opens one order from the list. The page number travels in the callback
   * data so the Back button returns to the page the user came from.
   */
  @Action(/^open_(\d+)_(.+)$/)
  async onOpenOrder(@Ctx() ctx: any) {
    try {
      await ctx.answerCbQuery();

      const fromPage = Number(ctx.match[1]);
      const orderId = ctx.match[2];
      const user = await this.botService.getOrCreateUser(ctx);
      const order = await this.ordersService.findOne(orderId, user.id, user.role);

      await ctx.editMessageText(this.botService.formatOrderCard(order), {
        parse_mode: 'HTML',
        reply_markup: this.botService.buildOrderKeyboard(order, user.role, 'card', fromPage)
          .reply_markup,
      });
    } catch (error) {
      this.logger.error(`Error in open action: ${error.message}`, error.stack);
      await ctx.answerCbQuery('❌ Could not open that order');
    }
  }

  /**
   * Builds one page: a compact list plus a keyboard with one button per
   * order and previous/next navigation. Returns null when there is nothing
   * to show.
   */
  private async renderPage(page: number, userId: string, userRole: string) {
    const result = await this.ordersService.findAll(
      { page, limit: PAGE_SIZE, sortBy: 'createdAt', sortOrder: 'desc' },
      userId,
      userRole,
    );

    if (result.meta.total === 0) {
      return null;
    }

    const totalPages = Math.max(1, Math.ceil(result.meta.total / PAGE_SIZE));
    const offset = (page - 1) * PAGE_SIZE;

    const lines = result.data.map((order: any, index: number) => {
      const overdue = this.botService.isOverdue(order.deadline, order.status) ? ' ⚠️' : '';
      return (
        `<b>${offset + index + 1}.</b> ${order.title}${overdue}\n` +
        `    ${this.botService.formatStatus(order.status)} · ` +
        `${this.botService.formatPriority(order.priority)}`
      );
    });

    const text =
      `📋 <b>Orders</b> — ${result.meta.total} total\n` +
      `<i>Page ${page} of ${totalPages}</i>\n\n` +
      lines.join('\n\n') +
      `\n\nTap a number to open an order.`;

    // One button per order on this page, numbered to match the list above.
    const orderButtons = result.data.map((order: any, index: number) =>
      Markup.button.callback(String(offset + index + 1), `open_${page}_${order.id}`),
    );

    const navigation: ReturnType<typeof Markup.button.callback>[] = [];
    if (page > 1) {
      navigation.push(Markup.button.callback('⬅️ Prev', `orders_page_${page - 1}`));
    }
    if (page < totalPages) {
      navigation.push(Markup.button.callback('Next ➡️', `orders_page_${page + 1}`));
    }

    const rows: ReturnType<typeof Markup.button.callback>[][] = [orderButtons];
    if (navigation.length > 0) {
      rows.push(navigation);
    }

    return { text, keyboard: Markup.inlineKeyboard(rows) };
  }
}

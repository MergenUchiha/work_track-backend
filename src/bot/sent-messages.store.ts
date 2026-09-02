/**
 * Message ids the bot sent, per chat.
 *
 * Deliberately outside the DI container: the tracking middleware is built in
 * the TelegrafModule factory, which runs before BotService exists. Keeping the
 * store standalone lets both reach the same data.
 *
 * Telegram only lets a bot delete its own messages in a private chat, and only
 * for 48 hours, so /clear works from this list instead of guessing ids.
 */
const sentMessages = new Map<number, number[]>();

/** Upper bound per chat, so a busy chat cannot grow this without limit. */
const MAX_TRACKED_PER_CHAT = 200;

export function rememberMessage(chatId: number, messageId: number): void {
  const ids = sentMessages.get(chatId) ?? [];
  ids.push(messageId);

  if (ids.length > MAX_TRACKED_PER_CHAT) {
    ids.splice(0, ids.length - MAX_TRACKED_PER_CHAT);
  }

  sentMessages.set(chatId, ids);
}

/** Returns the tracked ids for a chat and forgets them. */
export function takeMessages(chatId: number): number[] {
  const ids = sentMessages.get(chatId) ?? [];
  sentMessages.set(chatId, []);
  return ids;
}

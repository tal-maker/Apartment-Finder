// Lets a user connect their own Telegram to the alert bot from the website: the
// site gives a t.me link with a one-time code, the user presses Start, and the
// bot receives "/start <code>" from that user's chat.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { telegram } from './notifier.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const pending = new Map(); // code -> { key, expires, chat }
let offset = 0;
let botUsername = null;
let polling = Promise.resolve();

export const chatsKey = (key) => `telegram:${key}`;

export async function startLink(key, call = telegram) {
  if (config.notify.provider !== 'telegram' || !config.notify.telegramBotToken) {
    throw new Error('בוט הטלגרם לא מוגדר (NOTIFY_PROVIDER=telegram ו-TELEGRAM_BOT_TOKEN).');
  }
  botUsername ??= (await call('getMe')).username;
  for (const [code, entry] of pending) if (entry.expires < Date.now()) pending.delete(code);
  const code = crypto.randomBytes(6).toString('hex');
  pending.set(code, { key, expires: Date.now() + CODE_TTL_MS, chat: null });
  return { code, url: `https://t.me/${botUsername}?start=${code}` };
}

// Long-polls the bot (one poll at a time: Telegram rejects parallel ones) and
// connects every chat that sent a pending code.
async function poll(store, call, timeoutSec) {
  const updates = await call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] });
  for (const update of updates) {
    offset = update.update_id + 1;
    const code = update.message?.text?.match(/^\/start\s+([0-9a-f]+)/)?.[1];
    const entry = code && pending.get(code);
    if (!entry || entry.expires < Date.now()) continue;
    const chat = update.message.chat;
    const saved = store.getSetting(chatsKey(entry.key), []);
    store.setSetting(chatsKey(entry.key), [...new Set([...saved, String(chat.id)])]);
    entry.chat = { id: String(chat.id), name: [chat.first_name, chat.last_name].filter(Boolean).join(' ') || chat.title || chat.username || '' };
    await call('sendMessage', { chat_id: chat.id, text: '✅ מחובר! כאן יגיעו התראות על דירות חדשות שמתאימות לחיפושים שלך.' }).catch(() => {});
  }
}

export async function waitForLink(store, code, { key, call = telegram, timeoutSec = 20 } = {}) {
  const entry = pending.get(code);
  if (!entry || entry.expires < Date.now() || (key !== undefined && entry.key !== key)) return { status: 'expired' };
  if (!entry.chat) {
    polling = polling.then(() => (entry.chat ? null : poll(store, call, timeoutSec))).catch(() => {});
    await polling;
  }
  return entry.chat ? { status: 'connected', name: entry.chat.name } : { status: 'waiting' };
}

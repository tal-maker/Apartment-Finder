// Connects people's Telegram to the alert bot. A bot can only write to someone who
// pressed Start in it, so each person gets a t.me link with a one-time code; when
// they press Start, the bot receives "/start <code>" from their chat and that chat
// is saved under the person's key ("telegram:<key>").
//
// Codes are kept in the database, so a link sent to a friend still works after the
// app restarts, and the bot is checked in the background for people who press
// Start later.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { telegram } from './notifier.js';

const SELF_TTL_MS = 10 * 60 * 1000; // a logged-in user connecting themselves
const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a link sent to someone else
const INVITES = 'telegramInvites'; // { code: { key, expires } }
const PEOPLE = 'telegramPeople'; // names of people added by the admin

let offset = 0;
let botUsername = null;
let polling = Promise.resolve();

export const chatsKey = (key) => `telegram:${key}`;
export const telegramReady = () => config.notify.provider === 'telegram' && Boolean(config.notify.telegramBotToken);

async function botLink(code, call) {
  if (!telegramReady()) throw new Error('בוט הטלגרם לא מוגדר (NOTIFY_PROVIDER=telegram ו-TELEGRAM_BOT_TOKEN).');
  botUsername ??= (await call('getMe')).username;
  return `https://t.me/${botUsername}?start=${code}`;
}

function liveInvites(store) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(store.getSetting(INVITES, {})).filter(([, v]) => v.expires > now));
}

export async function startLink(store, key, { ttlMs = SELF_TTL_MS, call = telegram } = {}) {
  const invites = liveInvites(store);
  // Reuse a person's open invite, so a link already sent keeps working.
  let code = Object.entries(invites).find(([, v]) => v.key === key && v.expires - Date.now() > ttlMs / 2)?.[0];
  if (!code) {
    code = crypto.randomBytes(6).toString('hex');
    invites[code] = { key, expires: Date.now() + ttlMs };
    store.setSetting(INVITES, invites);
  }
  return { code, url: await botLink(code, call) };
}

// Reads new messages to the bot (one read at a time: Telegram rejects parallel
// ones) and connects every chat that sent a valid code. Returns the keys connected.
export function checkBot(store, { call = telegram, timeoutSec = 0 } = {}) {
  const run = async () => {
    const invites = liveInvites(store);
    if (!Object.keys(invites).length) return [];
    const updates = await call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] });
    const connected = [];
    for (const update of updates) {
      offset = update.update_id + 1;
      const code = update.message?.text?.match(/^\/start\s+([0-9a-f]+)/)?.[1];
      const invite = code && invites[code];
      if (!invite) continue;
      const chat = update.message.chat;
      const saved = store.getSetting(chatsKey(invite.key), []);
      store.setSetting(chatsKey(invite.key), [...new Set([...saved, String(chat.id)])]);
      delete invites[code];
      connected.push(invite.key);
      await call('sendMessage', { chat_id: chat.id, text: '✅ מחובר! כאן יגיעו התראות על דירות חדשות שמתאימות לחיפוש שלך.' }).catch(() => {});
    }
    store.setSetting(INVITES, invites);
    return connected;
  };
  const result = polling.then(run);
  polling = result.catch(() => {});
  return result;
}

export async function waitForLink(store, code, { key, call = telegram, timeoutSec = 20 } = {}) {
  const invite = liveInvites(store)[code];
  if (!invite || (key !== undefined && invite.key !== key)) {
    // Already used: connected if this key now has a chat.
    return key !== undefined && store.getSetting(chatsKey(key), []).length ? { status: 'connected' } : { status: 'expired' };
  }
  const connected = await checkBot(store, { call, timeoutSec }).catch(() => []);
  return connected.includes(invite.key) ? { status: 'connected' } : { status: 'waiting' };
}

// ---------- people the admin sends alerts to (no login of their own)

export const personKey = (name) => `person:${name}`;

export async function listPeople(store, call = telegram) {
  const people = store.getSetting(PEOPLE, []);
  return Promise.all(
    people.map(async (name) => {
      const connected = store.getSetting(chatsKey(personKey(name)), []).length > 0;
      return { name, connected, url: connected || !telegramReady() ? null : (await startLink(store, personKey(name), { ttlMs: INVITE_TTL_MS, call })).url };
    }),
  );
}

export async function addPerson(store, rawName, call = telegram) {
  const name = String(rawName ?? '').trim().slice(0, 40);
  if (!name) throw new Error('צריך שם');
  const people = store.getSetting(PEOPLE, []);
  if (!people.includes(name)) store.setSetting(PEOPLE, [...people, name]);
  return (await listPeople(store, call)).find((p) => p.name === name);
}

export function removePerson(store, name) {
  store.setSetting(PEOPLE, store.getSetting(PEOPLE, []).filter((n) => n !== name));
  store.setSetting(chatsKey(personKey(name)), []);
  store.setSetting(INVITES, Object.fromEntries(Object.entries(liveInvites(store)).filter(([, v]) => v.key !== personKey(name))));
}

// People often press Start long after getting the link: check every half minute
// while invites are open.
export function startBackgroundCheck(store, { intervalMs = 30000, log = console } = {}) {
  if (!telegramReady()) return null;
  return setInterval(() => {
    checkBot(store)
      .then((keys) => keys.forEach((key) => log.log(`[telegram] connected ${key}`)))
      .catch(() => {});
  }, intervalMs).unref?.();
}

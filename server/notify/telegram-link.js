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

// Handles "/start <code>" from someone pressing Start on an invite link: saves
// their chat under the invite's key. Returns that key, or null if the message
// wasn't a valid code. The bot (server/bot.js) calls this for every message.
// The key an invite link was made for (null if the code isn't valid).
export function inviteKey(store, text) {
  const code = String(text ?? '').match(/^\/start\s+([0-9a-f]+)/)?.[1];
  return (code && liveInvites(store)[code]?.key) ?? null;
}

export async function handleStartCode(store, message, call = telegram) {
  const code = message?.text?.match(/^\/start\s+([0-9a-f]+)/)?.[1];
  if (!code) return null;
  const invites = liveInvites(store);
  const invite = invites[code];
  if (!invite) return null;
  const chat = message.chat;
  const saved = store.getSetting(chatsKey(invite.key), []);
  store.setSetting(chatsKey(invite.key), [...new Set([...saved, String(chat.id)])]);
  delete invites[code];
  store.setSetting(INVITES, invites);
  return invite.key;
}

// Reads the bot's new messages once and handles invite codes (tests and the setup
// flow use this; while the app runs, the bot's own loop reads the messages).
export function checkBot(store, { call = telegram, timeoutSec = 0 } = {}) {
  const run = async () => {
    const updates = await call('getUpdates', { offset, timeout: timeoutSec, allowed_updates: ['message'] });
    const connected = [];
    for (const update of updates) {
      offset = update.update_id + 1;
      const key = await handleStartCode(store, update.message, call);
      if (key) connected.push(key);
    }
    return connected;
  };
  const result = polling.then(run);
  polling = result.catch(() => {});
  return result;
}

// The site asks repeatedly while someone connects; the bot's loop does the work.
export async function waitForLink(store, code, { key, waitMs = 3000 } = {}) {
  const deadline = Date.now() + waitMs;
  do {
    const invite = liveInvites(store)[code];
    if (!invite || (key !== undefined && invite.key !== key)) {
      return key !== undefined && store.getSetting(chatsKey(key), []).length ? { status: 'connected' } : { status: 'expired' };
    }
    await new Promise((r) => setTimeout(r, 500));
  } while (Date.now() < deadline);
  return { status: 'waiting' };
}

// Which key a chat belongs to: a person added by the admin, a logged-in user, or
// the admin. Undefined for strangers.
export function keyForChat(store, chatId, adminChats) {
  const id = String(chatId);
  if (adminChats.includes(id)) return null;
  for (const name of store.getSetting(PEOPLE, [])) {
    if (store.getSetting(chatsKey(personKey(name)), []).includes(id)) return personKey(name);
  }
  for (const [key] of store.listSettings('telegram:')) {
    const owner = key.slice('telegram:'.length);
    if (owner !== '@admin' && store.getSetting(key, []).includes(id)) return owner;
  }
  return undefined;
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

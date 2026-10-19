// Telegram. Two modes:
//  - Public channels are read from the web preview (https://t.me/s/<name>), no login.
//  - Groups and private chats need a user session (MTProto via the `telegram`
//    package): set TELEGRAM_API_ID / TELEGRAM_API_HASH and create TELEGRAM_SESSION
//    with `npm run telegram:login`.
import * as cheerio from 'cheerio';
import { config } from '../config.js';
import { USER_AGENT } from '../browser.js';

export function mtprotoConfigured() {
  return Boolean(config.telegram.apiId && config.telegram.apiHash && config.telegram.session);
}

// Accepts "name", "@name", "https://t.me/name", "t.me/s/name", or a numeric chat id.
export function normalizeChat(entry) {
  const s = String(entry).trim();
  const m = s.match(/(?:t\.me\/(?:s\/)?)?@?([A-Za-z0-9_+-]+)\/?$/);
  return m ? m[1] : s;
}

export function parseWebPreview(html, channel) {
  const $ = cheerio.load(html);
  const posts = [];
  $('.tgme_widget_message[data-post]').each((_, el) => {
    const node = $(el);
    const post = node.attr('data-post');
    const textNode = node.find('.tgme_widget_message_text').first();
    textNode.find('br').replaceWith('\n');
    const text = textNode.text().trim();
    if (!text) return;
    const images = node
      .find('.tgme_widget_message_photo_wrap')
      .map((_, img) => ($(img).attr('style') ?? '').match(/url\(['"]?([^'")]+)/)?.[1])
      .get()
      .filter(Boolean);
    posts.push({
      externalId: post,
      url: `https://t.me/${post}`,
      text,
      postedAt: node.find('time[datetime]').attr('datetime') ?? null,
      author: node.find('.tgme_widget_message_owner_name').first().text().trim() || null,
      images,
      sourceName: `טלגרם · ${channel}`,
    });
  });
  return posts;
}

async function fetchWebPreview(channel) {
  const res = await fetch(`https://t.me/s/${encodeURIComponent(channel)}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'he-IL,he;q=0.9' },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`t.me/s/${channel}: HTTP ${res.status}`);
  const posts = parseWebPreview(await res.text(), channel);
  if (!posts.length) {
    throw new Error(`No public preview for "${channel}". Groups and private chats need TELEGRAM_SESSION (npm run telegram:login).`);
  }
  return posts;
}

let clientPromise;

async function getClient() {
  clientPromise ??= (async () => {
    const { TelegramClient } = await import('telegram');
    const { StringSession } = await import('telegram/sessions/index.js');
    const client = new TelegramClient(new StringSession(config.telegram.session), config.telegram.apiId, config.telegram.apiHash, {
      connectionRetries: 3,
    });
    client.setLogLevel?.('error');
    await client.connect();
    return client;
  })().catch((err) => {
    clientPromise = undefined;
    throw err;
  });
  return clientPromise;
}

async function fetchMtproto(chat) {
  const client = await getClient();
  const target = /^-?\d+$/.test(chat) ? BigInt(chat) : chat;
  const entity = await client.getEntity(target);
  const messages = await client.getMessages(entity, { limit: config.telegram.messagesPerChat });
  const username = entity.username;
  const title = entity.title ?? username ?? chat;
  return messages
    .filter((m) => m.message)
    .map((m) => ({
      externalId: `${entity.id}/${m.id}`,
      url: username ? `https://t.me/${username}/${m.id}` : `https://t.me/c/${String(entity.id).replace(/^-100/, '')}/${m.id}`,
      text: m.message,
      postedAt: new Date(m.date * 1000).toISOString(),
      author: null,
      images: [],
      sourceName: `טלגרם · ${title}`,
    }));
}

export async function fetchTelegram(chats) {
  const results = [];
  const errors = [];
  for (const entry of chats) {
    const chat = normalizeChat(entry);
    try {
      const posts = mtprotoConfigured() ? await fetchMtproto(chat) : await fetchWebPreview(chat);
      results.push(...posts.map((p) => ({ ...p, id: `telegram:${p.externalId}`, source: 'telegram' })));
    } catch (err) {
      errors.push(`${chat}: ${err.message}`);
    }
  }
  if (errors.length && !results.length) throw new Error(errors.join('; '));
  return { posts: results, errors };
}

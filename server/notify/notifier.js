// Alerts for new matches. Providers:
//  - telegram:  a Telegram bot (free). Create one with @BotFather, then run
//               `npm run telegram:bot-setup` to find your chat id.
//  - callmebot: free, for personal alerts to your own number (https://www.callmebot.com/blog/free-api-whatsapp-messages/)
//  - twilio:    Twilio WhatsApp (sandbox or approved sender)
//  - meta:      WhatsApp Cloud API. Free-form text only reaches recipients who wrote to
//               the bot in the last 24h; otherwise set META_WA_TEMPLATE to an approved
//               template with one body parameter.
//  - console:   prints to the log (development)
import { config } from '../config.js';
import { areaName } from '../neighborhoods.js';
import { CONDITION_LABELS, KIND_LABELS, SOURCE_LABELS } from '../listing.js';

// Order and icons of the features line ("🔑 פיצ׳רים: 🛗 מעלית | ☀️ מרפסת").
const FEATURES = [
  ['mamad', '🛡️', 'ממ״ד'],
  ['shelter', '☢️', 'מקלט'],
  ['elevator', '🛗', 'מעלית'],
  ['balcony', '☀️', 'מרפסת'],
  ['aircon', '❄️', 'מזגן'],
  ['parking', '🚗', 'חניה'],
  ['storage', '📦', 'מחסן'],
  ['furnished', '🛋️', 'מרוהטת'],
  ['pets', '🐾', 'חיות מחמד'],
];
const UNKNOWN_LABELS = {
  ...Object.fromEntries(FEATURES.map(([key, , label]) => [key, label])),
  price: 'מחיר', rooms: 'חדרים', area: 'מיקום', size: 'גודל', floor: 'קומה', condition: 'מצב', entryDate: 'תאריך כניסה', broker: 'תיווך',
};
// Telegram allows 1024 characters under a photo; longer messages go as text.
const CAPTION_LIMIT = 1024;
const DESCRIPTION_LIMIT = 420;

export function notifierConfigured() {
  const w = config.notify;
  switch (w.provider) {
    case 'telegram': return Boolean(w.telegramBotToken && w.telegramChatIds.length);
    case 'callmebot': return w.callmebotRecipients.length > 0;
    case 'twilio': return Boolean(w.twilioSid && w.twilioToken && w.twilioFrom && w.twilioTo.length);
    case 'meta': return Boolean(w.metaToken && w.metaPhoneNumberId && w.metaTo.length);
    case 'console': return true;
    default: return false;
  }
}

const fmtPrice = (n) => `${Number(n).toLocaleString('en-US')} ₪`;
// 2026-12-01 → 1.12.2026
const fmtDate = (d) => {
  if (d === 'immediate') return 'מיידית';
  const m = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${Number(m[3])}.${Number(m[2])}.${m[1]}` : d;
};
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function mapsUrl(listing) {
  if (listing.lat != null && listing.lng != null && listing.geoPrecision === 'exact') {
    return `https://maps.google.com/?q=${listing.lat},${listing.lng}`;
  }
  const address = [listing.street, listing.houseNumber, 'תל אביב'].filter(Boolean).join(' ');
  return `https://maps.google.com/?q=${encodeURIComponent(address)}`;
}

function description(text, limit) {
  const cleaned = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 3).trimEnd()}...` : cleaned;
}

// Builds the alert in two forms: `html` for Telegram (bold labels, linked address,
// sent with the listing's photos) and `text` for WhatsApp.
export function formatListingMessage(listing, { searchName, unknown = [] } = {}) {
  const lines = []; // [plain, html]
  const add = (plain, html = escapeHtml(plain)) => lines.push([plain, html]);
  const field = (icon, label, value) => add(`${icon} ${label}: ${value}`, `${icon} <b>${label}:</b> ${escapeHtml(value)}`);

  const rooms = listing.rooms == null ? 'דירה' : listing.rooms === 1 ? 'חדר אחד' : `${listing.rooms} חדרים`;
  const kind = listing.kind && listing.kind !== 'rent' ? ` (${KIND_LABELS[listing.kind]})` : '';
  const place = [listing.neighborhood ?? (listing.area ? areaName(listing.area) : null), listing.city === 'other' ? null : 'תל אביב']
    .filter(Boolean)
    .join(', ');
  const title = `${rooms}${kind}${place ? ` · ${place}` : ''}`;
  add(`🏠 *${title}*`, `🏠 <b>${escapeHtml(title)}</b>`);

  if (listing.street) {
    const address = `${listing.street}${listing.houseNumber ? ` ${listing.houseNumber}` : ''}`;
    add(`📍 ${address}`, `📍 <a href="${escapeHtml(mapsUrl(listing))}">${escapeHtml(address)}</a>`);
  }
  field('💰', 'מחיר', listing.price ? fmtPrice(listing.price) : 'לא צוין');
  if (listing.sizeSqm) field('📏', 'שטח', `${listing.sizeSqm} מ״ר`);
  if (listing.floor != null) field('🏢', 'קומה', listing.floor === 0 ? 'קרקע' : String(listing.floor));
  if (listing.entryDate) field('📅', 'כניסה', fmtDate(listing.entryDate));
  if (listing.condition) field('🔨', 'מצב', CONDITION_LABELS[listing.condition]);
  if (listing.broker != null) field('🤝', 'תיווך', listing.broker ? 'כן' : 'ללא תיווך');

  const has = FEATURES.filter(([key]) => listing[key] === true);
  if (has.length) {
    const list = has.map(([, icon, label]) => `${icon} ${label}`).join(' | ');
    add(`🔑 פיצ׳רים: ${list}`, `🔑 <b>פיצ׳רים:</b> ${escapeHtml(list)}`);
  }
  const without = FEATURES.filter(([key]) => listing[key] === false).map(([, , label]) => label);
  if (without.length) field('🚫', 'אין', without.join(', '));
  const missing = unknown.filter((u) => UNKNOWN_LABELS[u]).map((u) => UNKNOWN_LABELS[u]);
  if (missing.length) field('❔', 'לא צוין במודעה', missing.join(', '));

  const footer = [];
  const sourceLabel = listing.sourceName ?? SOURCE_LABELS[listing.source] ?? listing.source;
  footer.push([`🔗 ${listing.url}`, `🔗 <a href="${escapeHtml(listing.url)}">למודעה · ${escapeHtml(sourceLabel)}</a>`]);
  if (listing.contact) footer.push([`📞 ${listing.contact}`, `📞 ${escapeHtml(listing.contact)}`]);
  if (searchName) footer.push([`🔔 ${searchName}`, `🔔 ${escapeHtml(searchName)}`]);

  // The description gets whatever room is left under the photos.
  const used = [...lines, ...footer].reduce((n, [plain]) => n + plain.length + 1, 0) + 4;
  const body = description(listing.text, Math.max(120, Math.min(DESCRIPTION_LIMIT, CAPTION_LIMIT - used - 3)));
  const blocks = [lines, body ? [[`📝 ${body}`, `📝 ${escapeHtml(body)}`]] : [], footer].filter((b) => b.length);
  const join = (i) => blocks.map((b) => b.map((l) => l[i]).join('\n')).join('\n\n');

  return {
    text: join(0),
    html: join(1),
    images: (listing.images ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 5),
  };
}

// Plain strings (test messages, "more matches") are sent as-is.
export function toMessage(message) {
  if (typeof message === 'string') return { text: message, html: escapeHtml(message), images: [] };
  return message;
}

export async function telegram(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${config.notify.telegramBotToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`Telegram bot: ${data.description ?? `HTTP ${res.status}`}`);
  return data.result;
}

// Photos first (an album, like a listing card) with the details as the caption.
// If Telegram can't fetch the photos, or the text is too long for a caption, the
// details go in a separate text message.
export async function sendTelegram(chatId, message, call = telegram) {
  const { html, text, images = [] } = message;
  const sendText = () => call('sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', link_preview_options: { is_disabled: images.length > 0 } });
  if (!images.length) return sendText();
  const fits = text.length <= CAPTION_LIMIT;
  const caption = fits ? { caption: html, parse_mode: 'HTML' } : {};
  try {
    if (images.length === 1) await call('sendPhoto', { chat_id: chatId, photo: images[0], ...caption });
    else await call('sendMediaGroup', { chat_id: chatId, media: images.map((url, i) => ({ type: 'photo', media: url, ...(i === 0 ? caption : {}) })) });
  } catch {
    return sendText();
  }
  if (!fits) await sendText();
}

async function postForm(url, body, auth) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${Buffer.from(auth).toString('base64')}` },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Twilio HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

async function sendOne(input, { telegramChatIds } = {}) {
  const message = toMessage(input);
  const { text } = message;
  const w = config.notify;
  switch (w.provider) {
    case 'console':
      console.log(`[alert]\n${text}\n`);
      return;
    case 'telegram':
      for (const chatId of telegramChatIds ?? w.telegramChatIds) await sendTelegram(chatId, message);
      return;
    case 'callmebot':
      for (const recipient of w.callmebotRecipients) {
        const [phone, apikey] = recipient.split(':');
        const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(phone)}&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(apikey)}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        const body = await res.text();
        if (!res.ok || /error|invalid/i.test(body.slice(0, 300))) throw new Error(`CallMeBot: HTTP ${res.status} ${body.replace(/<[^>]+>/g, ' ').trim().slice(0, 200)}`);
      }
      return;
    case 'twilio':
      for (const to of w.twilioTo) {
        await postForm(
          `https://api.twilio.com/2010-04-01/Accounts/${w.twilioSid}/Messages.json`,
          { From: `whatsapp:${w.twilioFrom.replace(/^whatsapp:/, '')}`, To: `whatsapp:${to.replace(/^whatsapp:/, '')}`, Body: text },
          `${w.twilioSid}:${w.twilioToken}`,
        );
      }
      return;
    case 'meta':
      for (const to of w.metaTo) {
        const message = w.metaTemplate
          ? {
              type: 'template',
              template: {
                name: w.metaTemplate,
                language: { code: w.metaTemplateLang },
                // Template parameters can't contain newlines.
                components: [{ type: 'body', parameters: [{ type: 'text', text: text.replace(/\n+/g, ' | ').slice(0, 1000) }] }],
              },
            }
          : { type: 'text', text: { body: text, preview_url: true } };
        const res = await fetch(`https://graph.facebook.com/v21.0/${w.metaPhoneNumberId}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${w.metaToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to, ...message }),
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) throw new Error(`WhatsApp Cloud API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      return;
    default:
      throw new Error('Alerts are not configured (set NOTIFY_PROVIDER).');
  }
}

// Sends messages one at a time with a pause, since CallMeBot and the sandbox
// providers rate-limit bursts.
export function createNotifier({ send = sendOne, delayMs = config.notify.provider === 'telegram' ? 500 : 3000 } = {}) {
  let queue = Promise.resolve();
  return {
    configured: () => notifierConfigured() || send !== sendOne,
    // options.telegramChatIds: who gets it (default: TELEGRAM_ALERT_CHAT_IDS).
    send(message, options) {
      const task = queue.then(async () => {
        await send(message, options);
        await new Promise((r) => setTimeout(r, delayMs));
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}

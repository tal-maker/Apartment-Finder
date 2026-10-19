// WhatsApp alerts. Providers:
//  - callmebot: free, for personal alerts to your own number (https://www.callmebot.com/blog/free-api-whatsapp-messages/)
//  - twilio:    Twilio WhatsApp (sandbox or approved sender)
//  - meta:      WhatsApp Cloud API. Free-form text only reaches recipients who wrote to
//               the bot in the last 24h; otherwise set META_WA_TEMPLATE to an approved
//               template with one body parameter.
//  - console:   prints to the log (development)
import { config } from '../config.js';
import { areaName } from '../neighborhoods.js';
import { CONDITION_LABELS, KIND_LABELS, SOURCE_LABELS } from '../listing.js';

const FEATURE_LABELS = { mamad: 'ממ"ד', parking: 'חניה', storage: 'מחסן', elevator: 'מעלית', balcony: 'מרפסת', furnished: 'ריהוט', pets: 'בע"ח' };
const UNKNOWN_LABELS = { ...FEATURE_LABELS, price: 'מחיר', rooms: 'חדרים', area: 'מיקום', size: 'גודל', floor: 'קומה', condition: 'מצב', entryDate: 'תאריך כניסה', broker: 'תיווך' };

export function whatsappConfigured() {
  const w = config.whatsapp;
  switch (w.provider) {
    case 'callmebot': return w.callmebotRecipients.length > 0;
    case 'twilio': return Boolean(w.twilioSid && w.twilioToken && w.twilioFrom && w.twilioTo.length);
    case 'meta': return Boolean(w.metaToken && w.metaPhoneNumberId && w.metaTo.length);
    case 'console': return true;
    default: return false;
  }
}

const fmtPrice = (n) => `${Number(n).toLocaleString('en-US')} ₪`;
const fmtDate = (d) => (d === 'immediate' ? 'מיידית' : d ? d.split('-').reverse().join('/') : null);

export function formatListingMessage(listing, { searchName, unknown = [] } = {}) {
  const lines = [`🏠 *דירה חדשה* – ${searchName ?? 'התאמה'}`];
  const place = [listing.street && `${listing.street}${listing.houseNumber ? ` ${listing.houseNumber}` : ''}`, listing.neighborhood ?? (listing.area && areaName(listing.area))]
    .filter(Boolean)
    .join(', ');
  if (place) lines.push(`📍 ${place}`);
  const facts = [
    listing.price && `💰 ${fmtPrice(listing.price)}`,
    listing.rooms && `🛏 ${listing.rooms} חד׳`,
    listing.sizeSqm && `📐 ${listing.sizeSqm} מ״ר`,
    listing.floor != null && `🏢 קומה ${listing.floor}`,
  ].filter(Boolean);
  if (facts.length) lines.push(facts.join(' · '));
  const features = Object.entries(FEATURE_LABELS)
    .filter(([key]) => listing[key] != null)
    .map(([key, label]) => `${listing[key] ? '✅' : '❌'} ${label}`);
  if (features.length) lines.push(features.join('  '));
  const extra = [
    listing.condition && `🔨 ${CONDITION_LABELS[listing.condition]}`,
    listing.entryDate && `📅 כניסה: ${fmtDate(listing.entryDate)}`,
    listing.broker != null && (listing.broker ? '🤝 תיווך' : '👤 ללא תיווך'),
    listing.kind && listing.kind !== 'rent' && `🏷 ${KIND_LABELS[listing.kind]}`,
  ].filter(Boolean);
  if (extra.length) lines.push(extra.join(' · '));
  const missing = unknown.filter((u) => UNKNOWN_LABELS[u]).map((u) => UNKNOWN_LABELS[u]);
  if (missing.length) lines.push(`❔ לא צוין במודעה: ${missing.join(', ')}`);
  if (listing.source !== 'yad2' && listing.text) {
    const snippet = listing.text.replace(/\s+/g, ' ').trim();
    lines.push(`📝 ${snippet.length > 220 ? `${snippet.slice(0, 217)}…` : snippet}`);
  }
  if (listing.contact) lines.push(`📞 ${listing.contact}`);
  lines.push(`מקור: ${listing.sourceName ?? SOURCE_LABELS[listing.source] ?? listing.source}`);
  lines.push(listing.url);
  return lines.join('\n');
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

async function sendOne(text) {
  const w = config.whatsapp;
  switch (w.provider) {
    case 'console':
      console.log(`[whatsapp]\n${text}\n`);
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
      throw new Error('WhatsApp is not configured (set WHATSAPP_PROVIDER).');
  }
}

// Sends messages one at a time with a pause, since CallMeBot and the sandbox
// providers rate-limit bursts.
export function createWhatsAppNotifier({ send = sendOne, delayMs = 3000 } = {}) {
  let queue = Promise.resolve();
  return {
    configured: () => whatsappConfigured() || send !== sendOne,
    send(text) {
      const task = queue.then(async () => {
        await send(text);
        await new Promise((r) => setTimeout(r, delayMs));
      });
      queue = task.catch(() => {});
      return task;
    },
  };
}

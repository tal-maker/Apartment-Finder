// The Telegram bot's conversations. People who connected through an invite link
// (or the admin's own chats) can build a saved search by answering questions with
// buttons, list their searches, pause and delete them. Strangers are turned away.
//
// One loop reads all of the bot's messages (Telegram allows one reader at a time),
// so invite codes are handled here too.
import { config } from './config.js';
import { AREAS } from './neighborhoods.js';
import { normalizeFilters } from './match.js';
import { formatListingMessage, sendTelegram, telegram } from './notify/notifier.js';
import { handleStartCode, keyForChat, telegramReady } from './notify/telegram-link.js';
import { isAdmin, telegramChatsFor } from './users.js';

const FEATURES = [
  ['mamad', '🛡️ ממ״ד'], ['shelter', '☢️ מקלט'], ['parking', '🚗 חניה'], ['elevator', '🛗 מעלית'], ['balcony', '☀️ מרפסת'],
  ['aircon', '❄️ מזגן'], ['storage', '📦 מחסן'], ['furnished', '🛋️ מרוהטת'], ['pets', '🐾 חיות מחמד'],
];
const KINDS = { rent: ['rent'], roommate: ['rent', 'roommate'], sublet: ['rent', 'sublet'], all: ['rent', 'roommate', 'sublet'] };
const NEIGHBORHOODS = AREAS.flatMap((a) => a.neighborhoods.map((n) => ({ area: a.id, name: n.name })));
const STEPS = 7;

const btn = (text, data) => ({ text, callback_data: data });
const rows = (buttons, perRow) => buttons.reduce((acc, b, i) => (i % perRow ? acc[acc.length - 1].push(b) : acc.push([b]), acc), []);
const fmt = (n) => Number(n).toLocaleString('en-US');
const areaName = (id) => AREAS.find((a) => a.id === id)?.name ?? id;

export function describeFilters(f) {
  const lines = [];
  const where = [...f.areas.map(areaName), ...f.neighborhoods];
  lines.push(`📍 איפה: ${where.length ? where.join(', ') : 'כל תל אביב'}`);
  const price = f.priceMin && f.priceMax ? `${fmt(f.priceMin)}–${fmt(f.priceMax)} ₪` : f.priceMax ? `עד ${fmt(f.priceMax)} ₪` : f.priceMin ? `מ־${fmt(f.priceMin)} ₪` : 'לא משנה';
  lines.push(`💰 מחיר: ${price}`);
  const rooms = f.roomsMin && f.roomsMax ? `${f.roomsMin}–${f.roomsMax}` : f.roomsMin ? `${f.roomsMin} ומעלה` : f.roomsMax ? `עד ${f.roomsMax}` : 'לא משנה';
  lines.push(`🛏 חדרים: ${rooms}`);
  if (f.entryTo) lines.push(`📅 כניסה עד: ${f.entryTo.split('-').reverse().join('.')}`);
  const must = FEATURES.filter(([k]) => f.features[k] === 'required').map(([, label]) => label);
  if (must.length) lines.push(`🔑 חובה: ${must.join(' · ')}`);
  lines.push(`🤝 תיווך: ${f.broker === 'no_broker' ? 'רק בלי תיווך' : 'לא משנה'}`);
  const kinds = f.kinds.length === 1 ? 'דירה שלמה' : f.kinds.length === 3 ? 'דירה שלמה, שותפים וסאבלט' : f.kinds.includes('roommate') ? 'דירה שלמה או שותפים' : 'דירה שלמה או סאבלט';
  lines.push(`🏠 סוג: ${kinds}`);
  return lines.join('\n');
}

export function createBot({ store, scanner, call = telegram, log = console, now = () => new Date() }) {
  const sessions = new Map(); // chatId -> { key, name, step, filters, messageId }
  let offset = 0;
  let running = false;

  const adminChats = () => telegramChatsFor(store, null);
  const send = (chatId, text, keyboard) =>
    call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}) });
  const owns = (key, search) => (key === null ? isAdmin(search.owner) : search.owner === key);

  // ---------- the questions

  function stepView(s) {
    const f = s.filters;
    switch (s.step) {
      case 'areas':
        return [
          `<b>1/${STEPS} 📍 באילו אזורים בתל אביב לחפש?</b>\nאפשר לבחור כמה אזורים, ואז ✔️ המשך.`,
          [
            ...rows(AREAS.map((a) => btn(`${f.areas.includes(a.id) ? '✅ ' : ''}${a.name}`, `a:${a.id}`)), 2),
            [btn('🌍 כל העיר', 'a:*'), btn('✔️ המשך', 'next')],
          ],
        ];
      case 'refine':
        return [`לדייק לשכונות מסוימות בתוך האזורים שבחרת?`, [[btn('כן, לבחור שכונות', 'refine:yes'), btn('לא, כל השכונות', 'refine:no')]]];
      case 'hoods':
        return [
          `<b>📍 אילו שכונות?</b>\nבחרו, ואז ✔️ המשך.`,
          [
            ...rows(
              NEIGHBORHOODS.map((n, i) => [n, i])
                .filter(([n]) => s.pickedAreas.includes(n.area))
                .map(([n, i]) => btn(`${f.neighborhoods.includes(n.name) ? '✅ ' : ''}${n.name}`, `n:${i}`)),
              2,
            ),
            [btn('✔️ המשך', 'next')],
          ],
        ];
      case 'price':
        return [
          `<b>2/${STEPS} 💰 מה התקציב המקסימלי לחודש?</b>\nאפשר גם לכתוב מספר, או טווח כמו 6000-9000.`,
          [
            ...rows([5000, 6000, 7000, 8000, 9000, 10000, 12000, 15000].map((p) => btn(`עד ${fmt(p)}`, `p:${p}`)), 3),
            [btn('ללא הגבלה', 'p:0')],
          ],
        ];
      case 'roomsMin':
        return [
          `<b>3/${STEPS} 🛏 כמה חדרים לפחות?</b>`,
          [...rows([1, 1.5, 2, 2.5, 3, 3.5, 4, 5].map((r) => btn(String(r), `r:${r}`)), 4), [btn('לא משנה', 'r:0')]],
        ];
      case 'roomsMax':
        return [
          `ועד כמה חדרים?`,
          [
            ...rows([1.5, 2, 2.5, 3, 3.5, 4, 5, 6].filter((r) => !f.roomsMin || r >= f.roomsMin).map((r) => btn(String(r), `R:${r}`)), 4),
            [btn('לא משנה', 'R:0')],
          ],
        ];
      case 'entry':
        return [
          `<b>4/${STEPS} 📅 עד מתי צריך להיכנס?</b>`,
          [[btn('תוך חודש', 'e:31'), btn('תוך חודשיים', 'e:61')], [btn('תוך 3 חודשים', 'e:92'), btn('לא משנה', 'e:0')]],
        ];
      case 'features':
        return [
          `<b>5/${STEPS} 🔑 מה חובה שיהיה בדירה?</b>\nאפשר לבחור כמה, או ✔️ המשך אם לא משנה.`,
          [...rows(FEATURES.map(([k, label]) => btn(`${f.features[k] ? '✅ ' : ''}${label}`, `f:${k}`)), 3), [btn('✔️ המשך', 'next')]],
        ];
      case 'broker':
        return [`<b>6/${STEPS} 🤝 גם דירות דרך תיווך?</b>`, [[btn('כן, לא משנה', 'b:any'), btn('רק בלי תיווך', 'b:no_broker')]]];
      case 'kinds':
        return [
          `<b>7/${STEPS} 🏠 מה מחפשים?</b>`,
          [[btn('דירה שלמה', 'k:rent'), btn('+ שותפים', 'k:roommate')], [btn('+ סאבלט', 'k:sublet'), btn('הכל', 'k:all')]],
        ];
      case 'confirm':
        return [
          `<b>✅ סיכום החיפוש:</b>\n\n${describeFilters(normalizeFilters(f))}\n\nלהפעיל?`,
          [[btn('✅ הפעל את החיפוש', 'save'), btn('🔄 מהתחלה', 'restart')]],
        ];
      default:
        return null;
    }
  }

  async function showStep(chatId, s) {
    const [text, keyboard] = stepView(s);
    const sent = await send(chatId, text, keyboard);
    s.messageId = sent?.message_id;
  }

  // Redraws the current question's buttons after a toggle.
  async function refreshButtons(chatId, s) {
    const [, keyboard] = stepView(s);
    await call('editMessageReplyMarkup', { chat_id: chatId, message_id: s.messageId, reply_markup: { inline_keyboard: keyboard } }).catch(() => {});
  }

  async function go(chatId, s, step) {
    s.step = step;
    await showStep(chatId, s);
  }

  function startWizard(chatId, rawKey, name) {
    const key = rawKey === '@admin' ? null : rawKey; // the admin's searches have no owner
    const s = { key, name, step: 'areas', pickedAreas: [], filters: normalizeFilters({}) };
    sessions.set(String(chatId), s);
    return showStep(chatId, s);
  }

  function inDays(days) {
    const d = now();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  async function answer(chatId, s, data) {
    const f = s.filters;
    const [kind, value] = data.split(/:(.*)/s);
    if (s.step === 'areas' && kind === 'a') {
      if (value === '*') {
        f.areas = [];
        return go(chatId, s, 'price');
      }
      f.areas = f.areas.includes(value) ? f.areas.filter((a) => a !== value) : [...f.areas, value];
      return refreshButtons(chatId, s);
    }
    if (s.step === 'areas' && kind === 'next') {
      if (!f.areas.length) return go(chatId, s, 'price');
      s.pickedAreas = [...f.areas];
      return go(chatId, s, 'refine');
    }
    if (s.step === 'refine' && kind === 'refine') return go(chatId, s, value === 'yes' ? 'hoods' : 'price');
    if (s.step === 'hoods' && kind === 'n') {
      const name = NEIGHBORHOODS[Number(value)]?.name;
      if (name) f.neighborhoods = f.neighborhoods.includes(name) ? f.neighborhoods.filter((n) => n !== name) : [...f.neighborhoods, name];
      return refreshButtons(chatId, s);
    }
    if (s.step === 'hoods' && kind === 'next') {
      // Specific neighborhoods replace their whole areas.
      if (f.neighborhoods.length) f.areas = [];
      return go(chatId, s, 'price');
    }
    if (s.step === 'price' && kind === 'p') {
      f.priceMax = Number(value) || null;
      return go(chatId, s, 'roomsMin');
    }
    if (s.step === 'roomsMin' && kind === 'r') {
      f.roomsMin = Number(value) || null;
      return go(chatId, s, 'roomsMax');
    }
    if (s.step === 'roomsMax' && kind === 'R') {
      f.roomsMax = Number(value) || null;
      return go(chatId, s, 'entry');
    }
    if (s.step === 'entry' && kind === 'e') {
      f.entryTo = Number(value) ? inDays(Number(value)) : null;
      return go(chatId, s, 'features');
    }
    if (s.step === 'features' && kind === 'f') {
      if (f.features[value]) delete f.features[value];
      else f.features[value] = 'required';
      return refreshButtons(chatId, s);
    }
    if (s.step === 'features' && kind === 'next') return go(chatId, s, 'broker');
    if (s.step === 'broker' && kind === 'b') {
      f.broker = value;
      return go(chatId, s, 'kinds');
    }
    if (s.step === 'kinds' && kind === 'k') {
      f.kinds = KINDS[value] ?? ['rent'];
      return go(chatId, s, 'confirm');
    }
    if (s.step === 'confirm' && kind === 'restart') return startWizard(chatId, s.key, s.name);
    if (s.step === 'confirm' && kind === 'save') return save(chatId, s);
    return null; // a button from an older question
  }

  // Typed answers: a budget ("8000", "6000-9000", "8.5k") on the price question.
  async function typed(chatId, s, text) {
    if (s.step !== 'price') return showStep(chatId, s);
    const nums = [...text.replace(/,/g, '').matchAll(/(\d+(?:\.\d+)?)\s*(k|K|אלף)?/g)].map((m) => Number(m[1]) * (m[2] || Number(m[1]) < 100 ? 1000 : 1));
    if (!nums.length) return send(chatId, 'לא הבנתי את הסכום 🙂 כתבו מספר, למשל 8000, או טווח, למשל 6000-9000.');
    s.filters.priceMin = nums.length > 1 ? Math.min(...nums) : null;
    s.filters.priceMax = Math.max(...nums);
    return go(chatId, s, 'roomsMin');
  }

  async function save(chatId, s) {
    sessions.delete(String(chatId));
    const filters = normalizeFilters(s.filters);
    const where = [...filters.areas.map(areaName), ...filters.neighborhoods].slice(0, 2).join(', ') || 'כל העיר';
    const title = [where, filters.priceMax && `עד ${fmt(filters.priceMax)}`, filters.roomsMin && `${filters.roomsMin}+ חד׳`].filter(Boolean).join(' · ');
    const search = store.createSearch({ name: s.name ? `${s.name}: ${title}` : title, filters, owner: s.key });
    scanner?.backfill(search);
    const count = store.matchedListingIds(search.id).size;
    log.log?.(`[bot] new search "${search.name}" for ${s.key ?? 'admin'}`);
    return send(
      chatId,
      `🎉 <b>החיפוש פעיל!</b>\nעל כל דירה חדשה שמתאימה תקבלו כאן הודעה.${count ? `\n\nכבר עכשיו יש ${count} דירות מתאימות מהימים האחרונים.` : ''}`,
      [
        ...(count ? [[btn('👀 הצג עד 5 מהן', `show:${search.id}`)]] : []),
        [btn('📋 החיפושים שלי', 'list'), btn('🔍 חיפוש נוסף', 'new')],
      ],
    );
  }

  // ---------- searches list

  async function listSearches(chatId, key) {
    const mine = store.listSearches().filter((s) => owns(key, s));
    if (!mine.length) return send(chatId, 'עוד אין לך חיפושים.', [[btn('🔍 חיפוש חדש', 'new')]]);
    for (const s of mine) {
      await send(chatId, `<b>${s.active ? '🟢' : '⏸'} ${s.name}</b>\n${describeFilters(normalizeFilters(s.filters))}\n${s.matchCount} התאמות`, [
        [btn(s.active ? '⏸ השהה' : '▶️ הפעל', `tog:${s.id}`), btn('🗑 מחק', `del:${s.id}`)],
      ]);
    }
    return null;
  }

  async function searchAction(chatId, key, data) {
    const [kind, idText] = data.split(':');
    const search = store.getSearch(Number(idText));
    if (!search || !owns(key, search)) return send(chatId, 'החיפוש הזה כבר לא קיים.');
    if (kind === 'tog') {
      store.updateSearch(search.id, { active: !search.active });
      return send(chatId, search.active ? `⏸ "${search.name}" מושהה – לא יגיעו עליו התראות.` : `▶️ "${search.name}" פעיל שוב.`);
    }
    if (kind === 'del') {
      store.deleteSearch(search.id);
      return send(chatId, `🗑 "${search.name}" נמחק.`);
    }
    if (kind === 'show') {
      const ids = store.matchedListingIds(search.id);
      const listings = store.listListings({ sinceDays: config.keepDays }).filter((l) => ids.has(l.id)).slice(0, 5);
      for (const listing of listings) await sendTelegram(chatId, formatListingMessage(listing, { searchName: search.name }), call).catch(() => {});
      return null;
    }
    return null;
  }

  const menu = (chatId, text) => send(chatId, text, [[btn('🔍 חיפוש חדש', 'new'), btn('📋 החיפושים שלי', 'list')]]);

  // ---------- updates

  async function handleUpdate(update) {
    const message = update.message;
    const query = update.callback_query;
    const chat = message?.chat ?? query?.message?.chat;
    if (!chat || chat.type && chat.type !== 'private' && !adminChats().includes(String(chat.id))) return;
    const chatId = String(chat.id);
    const firstName = (message ?? query)?.from?.first_name ?? chat.first_name ?? '';

    if (query) await call('answerCallbackQuery', { callback_query_id: query.id }).catch(() => {});

    // Invite links: connect, then go straight to building a search.
    if (message?.text?.startsWith('/start ')) {
      const connectedKey = await handleStartCode(store, message, call);
      if (connectedKey !== null) {
        log.log?.(`[telegram] connected ${connectedKey}`);
        await send(chatId, `👋 היי ${firstName}! מחובר. מעכשיו יגיעו לכאן התראות על דירות להשכרה בתל אביב.\nבוא נגדיר מה אתה מחפש – כמה שאלות קצרות:`);
        return startWizard(chatId, connectedKey, firstName);
      }
    }

    const key = keyForChat(store, chatId, adminChats());
    if (key === undefined) {
      if (message) await send(chatId, '🔒 זה בוט פרטי. כדי להשתמש בו צריך קישור הזמנה ממי שמפעיל אותו.');
      return;
    }

    if (message) {
      const text = (message.text ?? '').trim();
      if (/^\/(search|new)\b/.test(text)) return startWizard(chatId, key, firstName);
      if (/^\/(mysearches|list)\b/.test(text)) return listSearches(chatId, key);
      if (/^\/(start|help|menu)\b/.test(text)) {
        sessions.delete(chatId);
        return menu(chatId, 'מה תרצו לעשות?\n/search – חיפוש חדש\n/mysearches – החיפושים שלי');
      }
      const session = sessions.get(chatId);
      if (session) return typed(chatId, session, text);
      return menu(chatId, 'מה תרצו לעשות?');
    }

    const data = query.data ?? '';
    if (data === 'new') return startWizard(chatId, key, firstName);
    if (data === 'list') return listSearches(chatId, key);
    if (/^(tog|del|show):\d+$/.test(data)) return searchAction(chatId, key, data);
    const session = sessions.get(chatId);
    if (session) return answer(chatId, session, data);
    return menu(chatId, 'השאלון הזה כבר לא פעיל. מה תרצו לעשות?');
  }

  async function loop() {
    await call('setMyCommands', {
      commands: [
        { command: 'search', description: 'חיפוש חדש' },
        { command: 'mysearches', description: 'החיפושים שלי' },
      ],
    }).catch(() => {});
    while (running) {
      try {
        const updates = await call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
        for (const update of updates) {
          offset = update.update_id + 1;
          await handleUpdate(update).catch((err) => log.error?.('[bot]', err.message));
        }
      } catch (err) {
        log.warn?.(`[bot] ${err.message}`);
        await new Promise((r) => setTimeout(r, 10000));
      }
    }
  }

  return {
    handleUpdate,
    start() {
      if (running || !telegramReady()) return;
      running = true;
      loop();
    },
    stop() {
      running = false;
    },
  };
}

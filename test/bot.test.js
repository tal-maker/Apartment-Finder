import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { config } from '../server/config.js';
import { createBot } from '../server/bot.js';
import { addPerson, listPeople, personKey } from '../server/notify/telegram-link.js';

config.notify.provider = 'telegram';
config.notify.telegramBotToken = 'x';
config.notify.telegramChatIds = ['111'];

function setup() {
  const store = openDb(':memory:');
  const sent = [];
  let messageId = 1;
  const call = async (method, body) => {
    if (method === 'getMe') return { username: 'tlv_apartments_bot' };
    sent.push({ method, ...body });
    return { message_id: messageId++ };
  };
  const bot = createBot({ store, scanner: { backfill() {} }, call, log: { log() {}, warn() {}, error() {} }, now: () => new Date('2026-11-10T00:00:00Z') });
  let id = 1;
  const chat = { id: 777, type: 'private', first_name: 'דני' };
  const say = (text) => bot.handleUpdate({ update_id: id++, message: { text, chat, from: chat } });
  const press = (data) => bot.handleUpdate({ update_id: id++, callback_query: { id: 'q', data, from: chat, message: { chat } } });
  const last = () => sent.filter((m) => m.method === 'sendMessage').at(-1);
  return { store, sent, call, say, press, last };
}

test('a friend presses Start on the invite and builds a search by answering', async () => {
  const { store, call, say, press, last } = setup();
  const { url } = await addPerson(store, 'דני', call);
  await say(`/start ${url.split('start=')[1]}`);
  assert.match(last().text, /1\/8 📍 באילו אזורים/);

  await press('a:new_north');
  await press('a:old_north');
  await press('a:old_north'); // toggled off again
  await press('next');
  assert.match(last().text, /לדייק לשכונות/);
  await press('refine:yes');
  const hoods = last().reply_markup.inline_keyboard.flat().map((b) => b.text);
  assert.ok(hoods.includes('כיכר המדינה') && !hoods.includes('פלורנטין'));
  const kikar = last().reply_markup.inline_keyboard.flat().find((b) => b.text === 'כיכר המדינה').callback_data;
  await press(kikar);
  await press('next');
  assert.match(last().text, /2\/8 💰/);
  await say('7000-9500');
  assert.match(last().text, /3\/8 🛏/);
  await press('r:2.5');
  await press('R:4');
  assert.match(last().text, /4\/8 🏚️ באיזה מצב/);
  await press('c:new');
  await press('c:renovated');
  await press('c:good');
  await press('c:good'); // toggled off again
  await press('next');
  assert.match(last().text, /5\/8 📅/);
  await press('e:61');
  await press('f:mamad');
  await press('f:elevator');
  await press('next');
  await press('b:no_broker');
  await press('k:rent');
  assert.match(last().text, /סיכום החיפוש/);
  assert.match(last().text, /📍 איפה: כיכר המדינה/);
  assert.match(last().text, /💰 מחיר: 7,000–9,500 ₪/);
  assert.match(last().text, /🏚️ מצב: חדשה \/ משופצת/);
  await press('save');
  assert.match(last().text, /החיפוש פעיל/);

  const [search] = store.listSearches();
  assert.equal(search.owner, personKey('דני'));
  assert.deepEqual(search.filters.neighborhoods, ['כיכר המדינה']);
  assert.deepEqual(search.filters.areas, []);
  assert.deepEqual([search.filters.priceMin, search.filters.priceMax, search.filters.roomsMin, search.filters.roomsMax], [7000, 9500, 2.5, 4]);
  assert.deepEqual(search.filters.conditions, ['new', 'renovated']);
  assert.equal(search.filters.entryTo, '2027-01-10');
  assert.deepEqual(search.filters.features, { mamad: 'required', elevator: 'required' });
  assert.equal(search.filters.broker, 'no_broker');
  assert.deepEqual(search.filters.kinds, ['rent']);
});

test('my searches: pause and delete only your own; strangers are turned away', async () => {
  const { store, call, say, press, last } = setup();
  const { url } = await addPerson(store, 'דני', call);
  await say(`/start ${url.split('start=')[1]}`);
  const mine = store.createSearch({ name: 'של דני', filters: {}, owner: personKey('דני') });
  const admins = store.createSearch({ name: 'של טל', filters: {} });
  await say('/mysearches');
  assert.match(last().text, /של דני/);
  await press(`tog:${mine.id}`);
  assert.equal(store.getSearch(mine.id).active, false);
  await press(`del:${admins.id}`);
  assert.ok(store.getSearch(admins.id), "can't delete someone else's search");
  await press(`del:${mine.id}`);
  assert.equal(store.getSearch(mine.id), null);

  const stranger = setup();
  await stranger.say('/start');
  assert.match(stranger.last().text, /בוט פרטי/);
  assert.equal(stranger.store.listSearches().length, 0);
});

test("the admin opening a friend's invite link is not linked to the friend", async () => {
  const { store, call, sent } = setup();
  const { url } = await addPerson(store, 'דני', call);
  const bot = createBot({ store, scanner: { backfill() {} }, call, log: { log() {}, warn() {}, error() {} } });
  // Chat 111 is the admin's (TELEGRAM_ALERT_CHAT_IDS).
  const admin = { id: 111, type: 'private', first_name: 'טל' };
  await bot.handleUpdate({ update_id: 1, message: { text: `/start ${url.split('start=')[1]}`, chat: admin, from: admin } });
  assert.match(sent.filter((m) => m.method === 'sendMessage').at(-1).text, /הקישור הזה מיועד לדני/);
  assert.deepEqual(store.getSetting(`telegram:${personKey('דני')}`, []), []);
  // The link still works when the friend opens it.
  assert.equal((await listPeople(store, call))[0].connected, false);
});

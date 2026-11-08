import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { Scanner } from '../server/scanner.js';

const quietLog = { error() {}, warn() {}, log() {} };
const yad2Listing = (id, price) => ({
  id: `yad2:${id}`, source: 'yad2', externalId: id, url: `https://www.yad2.co.il/realestate/item/${id}`, title: 'דירה', text: '',
  kind: 'rent', price, rooms: 3, area: 'old_north', neighborhood: 'הצפון הישן - צפון', city: 'תל אביב יפו',
  street: 'דיזנגוף', houseNumber: 200, mamad: true, broker: false, images: [], sourceName: 'יד2',
});

function setup({ yad2 = [], telegram = [] }) {
  const store = openDb(':memory:');
  store.setSetting('sources', { yad2: { enabled: true }, telegram: { enabled: true, chats: ['x'] }, facebook: { enabled: false } });
  const sent = [];
  const notifier = { configured: () => true, send: async (text) => sent.push(text) };
  const feeds = { yad2, telegram };
  const scanner = new Scanner({
    store, notifier, log: quietLog, extract: null,
    fetchers: { yad2: async () => feeds.yad2, telegram: async () => ({ posts: feeds.telegram, errors: [] }), facebook: async () => [] },
  });
  return { store, scanner, sent, feeds };
}

test('first scan is a silent baseline, later new matches alert once', async () => {
  const { store, scanner, sent, feeds } = setup({ yad2: [yad2Listing('a', 7000)] });
  const search = store.createSearch({ name: 'צפון', filters: { areas: ['old_north'], priceMax: 8000 } });

  await scanner.scan();
  assert.equal(sent.length, 0);
  assert.equal(store.matchedListingIds(search.id).size, 1);

  feeds.yad2 = [yad2Listing('a', 7000), yad2Listing('b', 7500), yad2Listing('c', 9900)];
  const result = await scanner.scan();
  assert.equal(result.newListings, 2);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /צפון/);
  assert.match(sent[0].text, /7,500/);

  await scanner.scan();
  assert.equal(sent.length, 1);
});

test('telegram posts are parsed, and the same apartment on two sources alerts once', async () => {
  const post = (id) => ({
    id: `telegram:ch/${id}`, source: 'telegram', externalId: `ch/${id}`, url: `https://t.me/ch/${id}`,
    text: 'להשכרה בצפון הישן 3 חדרים, 7,200 ₪, ממ"ד. 052-1112233', sourceName: 'טלגרם · ch', images: [],
  });
  const { store, scanner, sent, feeds } = setup({ telegram: [post(1)] });
  store.createSearch({ name: 'ממד', filters: { features: { mamad: 'required' }, priceMax: 8000 } });
  await scanner.scan();
  feeds.telegram = [post(1), post(2), post(3)];
  await scanner.scan();
  assert.equal(sent.length, 1);
  assert.equal(store.getListing('telegram:ch/2').price, 7200);
});

test('seeking posts never match', async () => {
  const { store, scanner, sent, feeds } = setup({ telegram: [] });
  store.createSearch({ name: 'הכל', filters: {} });
  await scanner.scan();
  feeds.telegram = [{ id: 'telegram:ch/9', source: 'telegram', externalId: 'ch/9', url: 'u', text: 'מחפש דירת 2 חדרים בפלורנטין עד 6000 ש"ח', images: [] }];
  store.setSetting('sources', { yad2: { enabled: false }, telegram: { enabled: true, chats: ['x'] }, facebook: { enabled: false } });
  await scanner.scan();
  assert.equal(sent.length, 0);
});

test('stored posts are re-parsed and stale matches dropped', async () => {
  const { store, scanner } = setup({});
  const text = 'למכירה דירת 4 חדרים בפלורנטין 2,950,000 ₪';
  store.insertListing({
    id: 'facebook:1', source: 'facebook', externalId: '1', url: 'u', title: text, text, kind: 'rent', price: 50000, rooms: 4,
    area: 'south', neighborhood: 'פלורנטין', images: [], sourceName: 'פייסבוק · קבוצה',
  });
  const search = store.createSearch({ name: 'הכל', filters: {} });
  store.addMatch(search.id, 'facebook:1');
  assert.equal(scanner.reparseStoredPosts(), 1);
  const listing = store.getListing('facebook:1');
  assert.equal(listing.kind, 'sale');
  assert.equal(listing.price, null);
  assert.equal(store.matchedListingIds(search.id).size, 0);
});

test('a post stored under an old id is updated, not announced again', async () => {
  const text = 'להשכרה בצפון הישן 3 חדרים, 7,200 ₪, ממ"ד';
  const post = (id, url, aliasIds) => ({ id, aliasIds, source: 'telegram', externalId: id, url, text, images: [] });
  const { store, scanner, sent, feeds } = setup({ telegram: [post('telegram:old', 'https://group/feed')] });
  store.createSearch({ name: 'הכל', filters: {} });
  await scanner.scan();
  feeds.telegram = [post('telegram:new', 'https://group/posts/1/', ['telegram:old'])];
  const result = await scanner.scan();
  assert.equal(result.newListings, 0);
  assert.equal(sent.length, 0);
  assert.equal(store.getListing('telegram:old').url, 'https://group/posts/1/');
});

test("each user's alerts go to that user's Telegram only", async () => {
  const { store, sent: _ } = setup({});
  const sent = [];
  const notifier = { configured: () => true, send: async (message, options) => sent.push({ message, to: options?.telegramChatIds }) };
  const feeds = { yad2: [yad2Listing('a', 7000)] };
  const recipients = { dani: ['222'], noa: [] };
  const scanner = new Scanner({
    store, notifier, log: quietLog, extract: null, recipientsFor: (owner) => (owner ? recipients[owner] : ['111']),
    fetchers: { yad2: async () => feeds.yad2, telegram: async () => ({ posts: [], errors: [] }), facebook: async () => [] },
  });
  store.createSearch({ name: 'שלי', filters: { areas: ['old_north'] } });
  store.createSearch({ name: 'של דני', filters: { areas: ['old_north'] }, owner: 'dani' });
  store.createSearch({ name: 'של נועה', filters: { areas: ['old_north'] }, owner: 'noa' });
  store.createSearch({ name: 'דני בדרום', filters: { areas: ['south'] }, owner: 'dani' });
  await scanner.scan();
  feeds.yad2 = [yad2Listing('a', 7000), yad2Listing('b', 7500)];
  await scanner.scan();
  assert.deepEqual(sent.map((s) => [s.to, s.message.text.match(/🔔 (.+)$/)[1]]), [[['111'], 'שלי'], [['222'], 'של דני']]);
});

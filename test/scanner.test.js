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
  assert.match(sent[0], /צפון/);
  assert.match(sent[0], /7,500/);

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

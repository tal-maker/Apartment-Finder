import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatListingMessage, sendTelegram } from '../server/notify/notifier.js';

const listing = {
  source: 'facebook', sourceName: 'פייסבוק · דירות להשכרה', kind: 'rent', rooms: 3, neighborhood: 'הצפון החדש', area: 'new_north',
  city: 'תל אביב יפו', street: 'בארי', houseNumber: 11, price: 8700, sizeSqm: 75, floor: 3, entryDate: '2026-12-01',
  elevator: true, balcony: true, shelter: true, aircon: true, parking: false, url: 'https://www.facebook.com/groups/1/posts/2/',
  text: '🏚️דירה להשכרה בסמטת בארי 11\n• תאריך כניסה ב־1.12\n\n\n\n• דירת 75 מ"ר, מוארת <מאוד>',
  images: ['https://img/1.jpg', 'https://img/2.jpg', 'data:x'],
};

test('alert follows the listing-card layout', () => {
  const { text, html, images } = formatListingMessage(listing, { searchName: 'צפון' });
  const lines = text.split('\n');
  assert.equal(lines[0], '🏠 *3 חדרים · הצפון החדש, תל אביב*');
  assert.equal(lines[1], '📍 בארי 11');
  assert.equal(lines[2], '💰 מחיר: 8,700 ₪');
  assert.equal(lines[3], '📏 שטח: 75 מ״ר');
  assert.equal(lines[4], '🏢 קומה: 3');
  assert.equal(lines[5], '📅 כניסה: 1.12.2026');
  assert.equal(lines[6], '🔑 פיצ׳רים: ☢️ מקלט | 🛗 מעלית | ☀️ מרפסת | ❄️ מזגן');
  assert.equal(lines[7], '🚫 אין: חניה');
  assert.match(text, /\n\n📝 🏚️דירה להשכרה בסמטת בארי 11\n• תאריך כניסה ב־1\.12\n\n• דירת 75/);
  assert.match(html, /^🏠 <b>3 חדרים · הצפון החדש, תל אביב<\/b>/);
  assert.match(html, /📍 <a href="https:\/\/maps\.google\.com\/\?q=%D7%91%D7%90%D7%A8%D7%99%2011%20%D7%AA%D7%9C%20%D7%90%D7%91%D7%99%D7%91">בארי 11<\/a>/);
  assert.match(html, /💰 <b>מחיר:<\/b> 8,700 ₪/);
  assert.match(html, /&lt;מאוד&gt;/);
  assert.match(html, /🔗 <a href="https:\/\/www\.facebook\.com\/groups\/1\/posts\/2\/">למודעה · פייסבוק · דירות להשכרה<\/a>/);
  assert.match(text, /🔔 צפון$/);
  assert.deepEqual(images, ['https://img/1.jpg', 'https://img/2.jpg']);
});

test('long descriptions are cut to fit under the photos', () => {
  const { text } = formatListingMessage({ ...listing, text: 'א'.repeat(3000) });
  assert.ok(text.length <= 1024, `caption is ${text.length} chars`);
  assert.match(text, /א\.\.\.\n/);
});

test('telegram: album with caption, text fallback when photos fail', async () => {
  const calls = [];
  const message = formatListingMessage(listing);
  await sendTelegram(7, message, async (method, body) => calls.push([method, body]));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 'sendMediaGroup');
  assert.equal(calls[0][1].media.length, 2);
  assert.equal(calls[0][1].media[0].caption, message.html);
  assert.equal(calls[0][1].media[1].caption, undefined);

  const fallback = [];
  await sendTelegram(7, message, async (method, body) => {
    fallback.push(method);
    if (method !== 'sendMessage') throw new Error('Bad Request: failed to get HTTP URL content');
  });
  assert.deepEqual(fallback, ['sendMediaGroup', 'sendMessage']);

  const noPhotos = [];
  await sendTelegram(7, { ...message, images: [] }, async (method) => noPhotos.push(method));
  assert.deepEqual(noPhotos, ['sendMessage']);
});

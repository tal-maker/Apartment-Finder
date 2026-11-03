import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseItemPage, parseSearchPage, extractNextData, BlockedError } from '../server/sources/yad2.js';
import { parseWebPreview, normalizeChat } from '../server/sources/telegram.js';
import { groupFeedUrl } from '../server/sources/facebook.js';

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('yad2 search page', () => {
  const listings = parseSearchPage(fixture('yad2-search.html'));
  assert.equal(listings.length, 2);
  const [a, b] = listings;
  assert.equal(a.id, 'yad2:abc123');
  assert.equal(a.price, 7200);
  assert.equal(a.rooms, 3);
  assert.equal(a.area, 'old_north');
  assert.equal(a.neighborhood, 'הצפון הישן - צפון');
  assert.equal(a.condition, 'renovated');
  assert.equal(a.broker, false);
  assert.equal(a.mamad, true);
  assert.equal(a.parking, true);
  assert.deepEqual(a.images, ['https://img.yad2.co.il/a.jpg', 'https://img.yad2.co.il/b.jpg']);
  assert.equal(b.broker, true);
  assert.equal(b.condition, 'new');
  assert.equal(b.area, 'south');
});

test('yad2 item page details', () => {
  const d = parseItemPage(fixture('yad2-item.html'));
  assert.equal(d.parking, true);
  assert.equal(d.mamad, true);
  assert.equal(d.storage, false);
  assert.equal(d.entryDate, '2026-12-01');
  assert.equal(d.pets, true);
  assert.match(d.text, /משופצת/);
});

test('yad2 captcha page is reported as blocked', () => {
  assert.throws(() => extractNextData('<html>Are you for real? captcha</html>'), BlockedError);
});

test('telegram web preview', () => {
  const posts = parseWebPreview(fixture('telegram.html'), 'tlv_rentals');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].url, 'https://t.me/tlv_rentals/501');
  assert.match(posts[0].text, /2\.5 חדרים/);
  assert.match(posts[0].text, /\n/);
  assert.deepEqual(posts[0].images, ['https://cdn4.telesco.pe/file/x.jpg']);
  assert.equal(posts[0].postedAt, '2026-10-19T08:30:00+00:00');
});

test('source config normalization', () => {
  assert.equal(normalizeChat('https://t.me/s/tlv_rentals'), 'tlv_rentals');
  assert.equal(normalizeChat('@tlv_rentals'), 'tlv_rentals');
  assert.equal(groupFeedUrl('https://www.facebook.com/groups/12345/?ref=share'), 'https://www.facebook.com/groups/12345/?sorting_setting=CHRONOLOGICAL');
});

test('facebook links and ids', async () => {
  const { cleanPermalink, postId, legacyPostIds } = await import('../server/sources/facebook.js');
  assert.equal(cleanPermalink('https://www.facebook.com/groups/358/posts/111/?__cft__[0]=x&__tn__=R'), 'https://www.facebook.com/groups/358/posts/111/');
  const g = 'https://www.facebook.com/groups/358/';
  const short = { text: 'דירת 3 חדרים בבזל 11,000 '.repeat(6), permalink: null };
  const expanded = { text: `${short.text}\nעוד פרטים שנפתחו אחרי לחיצה על "עוד"`, permalink: null };
  assert.equal(postId(g, short), postId(g, expanded));
  assert.ok(legacyPostIds(g, short).includes(postId(g, short)));
});

test('madlan-style embedded listings', async () => {
  const { parseEmbeddedListings } = await import('../server/sources/sites.js');
  const listings = parseEmbeddedListings('madlan', fixture('madlan-search.html'));
  assert.deepEqual(listings.map((l) => l.id), ['madlan:Xa1b2c3', 'madlan:Yd4e5f6', 'madlan:Wj1k2l3']);
  const [a, b, c] = listings;
  assert.equal(a.url, 'https://www.madlan.co.il/listings/Xa1b2c3');
  assert.equal(a.price, 8500);
  assert.equal(a.rooms, 3);
  assert.equal(a.sizeSqm, 80);
  assert.equal(a.area, 'old_north');
  assert.equal(a.street, 'בזל');
  assert.equal(a.houseNumber, 12);
  assert.equal(a.broker, true);
  assert.equal(a.condition, 'renovated');
  assert.equal(a.parking, true);
  assert.equal(a.mamad, false);
  assert.equal(a.lat, 32.0905);
  assert.equal(a.geoPrecision, 'exact');
  assert.deepEqual(a.images, ['https://images2.madlan.co.il/1.jpg']);
  assert.equal(b.broker, false);
  assert.equal(b.floor, 0);
  assert.equal(b.area, 'south');
  assert.equal(c.city, 'other');
});

test('table cells give rooms and address', async () => {
  const { hintsFromCells } = await import('../server/sources/sites.js');
  assert.deepEqual(hintsFromCells(['דירה', 'תל אביב', 'פלורנטין', 'ויטל 5', '3', 'קומה 2', '6,500 ₪']), { rooms: 3, street: 'ויטל', houseNumber: 5 });
  assert.deepEqual(hintsFromCells(['2.5', 'בן יהודה 120']), { rooms: 2.5, street: 'בן יהודה', houseNumber: 120 });
});

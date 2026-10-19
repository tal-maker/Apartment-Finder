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

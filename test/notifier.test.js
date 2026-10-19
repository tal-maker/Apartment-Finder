import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatListingMessage, toTelegramHtml } from '../server/notify/notifier.js';

test('telegram message is HTML with a bold header and escaped content', () => {
  const text = formatListingMessage(
    { source: 'telegram', price: 6500, rooms: 3, neighborhood: 'פלורנטין', text: 'מחיר <6,500> & ממ"ד', url: 'https://t.me/x/1', mamad: true },
    { searchName: 'דרום' },
  );
  const html = toTelegramHtml(text);
  assert.match(html, /^🏠 <b>דירה חדשה<\/b> – דרום/);
  assert.match(html, /&lt;6,500&gt; &amp; ממ"ד/);
  assert.match(html, /https:\/\/t\.me\/x\/1$/);
});

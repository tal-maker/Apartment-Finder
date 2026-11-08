import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { config } from '../server/config.js';
import { startLink, waitForLink } from '../server/notify/telegram-link.js';

test('a user connects Telegram by pressing Start on the coded link', async () => {
  config.notify.provider = 'telegram';
  config.notify.telegramBotToken = 'x';
  const store = openDb(':memory:');
  const sent = [];
  let updates = [];
  const call = async (method, body) => {
    if (method === 'getMe') return { username: 'tlv_apartments_bot' };
    if (method === 'getUpdates') return updates.splice(0);
    if (method === 'sendMessage') sent.push(body);
    return true;
  };
  const { code, url } = await startLink('dani', call);
  assert.equal(url, `https://t.me/tlv_apartments_bot?start=${code}`);
  assert.deepEqual(await waitForLink(store, code, { call }), { status: 'waiting' });
  updates = [
    { update_id: 1, message: { text: '/start someone-else', chat: { id: 5 } } },
    { update_id: 2, message: { text: `/start ${code}`, chat: { id: 4242, first_name: 'דני' } } },
  ];
  assert.deepEqual(await waitForLink(store, code, { call }), { status: 'connected', name: 'דני' });
  assert.deepEqual(store.getSetting('telegram:dani'), ['4242']);
  assert.equal(sent[0].chat_id, 4242);
  assert.deepEqual(await waitForLink(store, 'unknown', { call }), { status: 'expired' });
});

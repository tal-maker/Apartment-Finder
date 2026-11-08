import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { config } from '../server/config.js';
import { addPerson, checkBot, listPeople, personKey, startLink, waitForLink } from '../server/notify/telegram-link.js';
import { telegramChatsFor } from '../server/users.js';

function fakeBot() {
  const bot = { updates: [], sent: [] };
  bot.call = async (method, body) => {
    if (method === 'getMe') return { username: 'tlv_apartments_bot' };
    if (method === 'getUpdates') return bot.updates.splice(0);
    if (method === 'sendMessage') bot.sent.push(body);
    return true;
  };
  return bot;
}

config.notify.provider = 'telegram';
config.notify.telegramBotToken = 'x';
let nextUpdate = 1;
const start = (code, chatId, name) => ({ update_id: nextUpdate++, message: { text: `/start ${code}`, chat: { id: chatId, first_name: name } } });

test('a logged-in user connects their own Telegram', async () => {
  const store = openDb(':memory:');
  const bot = fakeBot();
  const { code, url } = await startLink(store, 'dani', { call: bot.call });
  assert.equal(url, `https://t.me/tlv_apartments_bot?start=${code}`);
  assert.deepEqual(await waitForLink(store, code, { key: 'dani', call: bot.call }), { status: 'waiting' });
  bot.updates.push(start('someone-else', 5), start(code, 4242, 'דני'));
  assert.deepEqual(await waitForLink(store, code, { key: 'dani', call: bot.call }), { status: 'connected' });
  assert.deepEqual(store.getSetting('telegram:dani'), ['4242']);
  assert.equal(bot.sent[0].chat_id, 4242);
});

test('a friend added by name gets a link, presses Start later, and receives their search alerts', async () => {
  const store = openDb(':memory:');
  const bot = fakeBot();
  const person = await addPerson(store, 'דני', bot.call);
  assert.equal(person.connected, false);
  const code = person.url.split('start=')[1];
  // The same link is shown again until it is used.
  assert.equal((await listPeople(store, bot.call))[0].url, person.url);
  bot.updates.push(start(code, 777, 'דני'));
  assert.deepEqual(await checkBot(store, { call: bot.call }), [personKey('דני')]);
  assert.deepEqual(await listPeople(store, bot.call), [{ name: 'דני', connected: true, url: null }]);
  assert.deepEqual(telegramChatsFor(store, personKey('דני')), ['777']);
  assert.deepEqual(telegramChatsFor(store, null), []); // the admin's chats are separate
});

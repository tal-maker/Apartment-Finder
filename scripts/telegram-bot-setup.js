// Finds the chat id(s) your alert bot should write to.
// 1. Create a bot with @BotFather in Telegram and put its token in TELEGRAM_BOT_TOKEN.
// 2. Run this script, then send /start to your bot (or add it to a group and write there).
// It prints the TELEGRAM_ALERT_CHAT_IDS line for your .env and sends a test message.
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Set TELEGRAM_BOT_TOKEN in .env first (create a bot with @BotFather).');
  process.exit(1);
}

async function call(method, params = {}) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const body = await res.json();
  if (!body.ok) throw new Error(body.description);
  return body.result;
}

const me = await call('getMe').catch((err) => {
  console.error(`The token didn't work: ${err.message}`);
  process.exit(1);
});
console.log(`\nBot: @${me.username}`);
console.log(`Open https://t.me/${me.username} in Telegram and press Start (or send any message).`);
console.log('Waiting up to 2 minutes…\n');

const chats = new Map();
let offset = 0;
const deadline = Date.now() + 120000;
while (Date.now() < deadline && chats.size === 0) {
  const updates = await call('getUpdates', { offset, timeout: 20 });
  for (const update of updates) {
    offset = update.update_id + 1;
    const chat = (update.message ?? update.my_chat_member ?? update.channel_post)?.chat;
    if (chat) chats.set(chat.id, chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' '));
  }
}
if (!chats.size) {
  console.error('No message received. Run the script again and send /start to the bot while it waits.');
  process.exit(1);
}
await call('getUpdates', { offset }); // mark as read

for (const [id, name] of chats) {
  console.log(`Found chat: ${name} (${id})`);
  await call('sendMessage', { chat_id: id, text: '✅ הבוט מחובר! כאן יגיעו התראות על דירות חדשות.' });
}
console.log('\nAdd these lines to your .env and restart the app:\n');
console.log('NOTIFY_PROVIDER=telegram');
console.log(`TELEGRAM_ALERT_CHAT_IDS=${[...chats.keys()].join(',')}\n`);

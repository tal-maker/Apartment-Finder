// Logs in to Telegram once and prints a session string for TELEGRAM_SESSION.
// Needs TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org/apps
import readline from 'node:readline/promises';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
if (!apiId || !apiHash) {
  console.error('Set TELEGRAM_API_ID and TELEGRAM_API_HASH first (https://my.telegram.org/apps).');
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
await client.start({
  phoneNumber: () => rl.question('Phone number (e.g. +972501234567): '),
  phoneCode: () => rl.question('Code you received in Telegram: '),
  password: () => rl.question('2FA password (if set): '),
  onError: (err) => console.error(err.message),
});
console.log('\nAdd this line to your .env (keep it secret – it gives access to your account):\n');
console.log(`TELEGRAM_SESSION=${client.session.save()}\n`);
rl.close();
await client.disconnect();
process.exit(0);

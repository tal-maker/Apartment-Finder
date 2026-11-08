import path from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { Scanner } from './scanner.js';
import { createNotifier } from './notify/notifier.js';
import { createGeocoder } from './geocode.js';
import { telegramChatsFor, users } from './users.js';

const store = openDb(path.join(config.dataDir, 'apartments.db'));
store.markInterruptedRuns();
const notifier = createNotifier();
const geocoder = createGeocoder({ store });
// With Telegram, each search's alerts go to its owner's chats (admins: TELEGRAM_ALERT_CHAT_IDS too).
const recipientsFor = (owner) => (config.notify.provider === 'telegram' ? telegramChatsFor(store, owner) : null);
const scanner = new Scanner({ store, notifier, geocoder, recipientsFor });
const app = createApp({ store, scanner, notifier });
const reparsed = scanner.reparseStoredPosts();
if (reparsed) console.log(`Re-read ${reparsed} stored Facebook/Telegram posts with the current rules`);
// Listings stored before the map existed get their positions now.
geocoder.locate(store.listListings({ sinceDays: config.keepDays, limit: 100000 }).filter((l) => l.lat == null)).catch(() => {});

app.listen(config.port, () => {
  console.log(`Apartment finder on http://localhost:${config.port}${config.mockSources ? ' (mock sources)' : ''}`);
  console.log(users.length ? `Users: ${users.map((u) => `${u.name}${u.admin ? ' (admin)' : ''}`).join(', ')}` : 'No users defined: open only on this computer (set APP_USERS to share it)');
  console.log(`Scanning every ${config.scanIntervalMinutes} min · Alerts: ${config.notify.provider || 'off'} · Claude extraction: ${config.llm.enabled ? 'on' : 'off'}`);
  scanner.start();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    scanner.stop();
    process.exit(0);
  });
}

import path from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { Scanner } from './scanner.js';
import { createNotifier } from './notify/notifier.js';
import { createGeocoder } from './geocode.js';

const store = openDb(path.join(config.dataDir, 'apartments.db'));
store.markInterruptedRuns();
const notifier = createNotifier();
const geocoder = createGeocoder({ store });
const scanner = new Scanner({ store, notifier, geocoder });
const app = createApp({ store, scanner, notifier });
const reparsed = scanner.reparseStoredPosts();
if (reparsed) console.log(`Re-read ${reparsed} stored Facebook/Telegram posts with the current rules`);
// Listings stored before the map existed get their positions now.
geocoder.locate(store.listListings({ sinceDays: config.keepDays, limit: 100000 }).filter((l) => l.lat == null)).catch(() => {});

app.listen(config.port, () => {
  console.log(`Apartment finder on http://localhost:${config.port}${config.mockSources ? ' (mock sources)' : ''}`);
  console.log(`Scanning every ${config.scanIntervalMinutes} min · Alerts: ${config.notify.provider || 'off'} · Claude extraction: ${config.llm.enabled ? 'on' : 'off'}`);
  scanner.start();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    scanner.stop();
    process.exit(0);
  });
}

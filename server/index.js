import path from 'node:path';
import { config } from './config.js';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { Scanner } from './scanner.js';
import { createNotifier } from './notify/notifier.js';

const store = openDb(path.join(config.dataDir, 'apartments.db'));
const notifier = createNotifier();
const scanner = new Scanner({ store, notifier });
const app = createApp({ store, scanner, notifier });

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

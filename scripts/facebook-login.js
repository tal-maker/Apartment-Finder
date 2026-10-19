// Opens a visible browser so you can log in to Facebook, then saves the session
// (cookies) to FACEBOOK_STATE_PATH (default data/facebook-state.json).
// Run it on your own computer, then copy the file to the server's data/ folder.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../server/config.js';
import { launchBrowser, USER_AGENT } from '../server/browser.js';

const browser = await launchBrowser({ headless: false });
const context = await browser.newContext({ userAgent: USER_AGENT, locale: 'he-IL', viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto('https://www.facebook.com/login');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Log in in the browser window (and approve any 2FA), then press Enter here… ');
rl.close();

fs.mkdirSync(path.dirname(config.facebook.statePath), { recursive: true });
await context.storageState({ path: config.facebook.statePath });
console.log(`Saved Facebook session to ${config.facebook.statePath}`);
await browser.close();

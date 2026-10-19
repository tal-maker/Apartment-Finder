// Opens the app's browser in a visible window so you can log in to Facebook once.
// The login is kept in the browser profile (data/browser-profile) and reused by scans.
// Stop the app before running this (both can't use the profile at the same time).
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { config } from '../server/config.js';
import { launchPersistent } from '../server/browser.js';

const context = await launchPersistent({ headless: false });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto('https://www.facebook.com/');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('Log in to Facebook in the browser window (approve any 2FA), then press Enter here… ');
rl.close();

const loggedIn = (await context.cookies('https://www.facebook.com')).some((c) => c.name === 'c_user');
if (loggedIn) {
  fs.mkdirSync(path.dirname(config.facebook.loginMarker), { recursive: true });
  fs.writeFileSync(config.facebook.loginMarker, JSON.stringify({ loggedInAt: new Date().toISOString() }));
  console.log('Logged in. Start the app again with: npm start');
} else {
  console.log('Not logged in yet. Run the command again and finish logging in before pressing Enter.');
}
await context.close();

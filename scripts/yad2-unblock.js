// Opens Yad2 in a visible browser window that uses the app's browser profile.
// If Yad2 shows a captcha, solve it there; the cookies are kept and later scans reuse them.
// Stop the app before running this (both can't use the profile at the same time).
import readline from 'node:readline/promises';
import { launchPersistent } from '../server/browser.js';
import { searchUrl } from '../server/sources/yad2.js';

const context = await launchPersistent({ headless: false });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto(searchUrl(1), { waitUntil: 'domcontentloaded' });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
await rl.question('If Yad2 shows a captcha, solve it until you see apartment listings. Then press Enter here… ');
rl.close();

const ok = await page.evaluate(() => Boolean(document.querySelector('#__NEXT_DATA__')));
console.log(ok ? 'Yad2 listings loaded. Start the app again with: npm start' : 'Listings still not visible. Try again, or wait a while before scanning.');
await context.close();

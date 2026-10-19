// Headless Chromium (via playwright-core) for Facebook, and for Yad2 when its bot
// protection blocks plain HTTP requests. Optional: only loaded when needed.
import fs from 'node:fs';
import { config } from './config.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export async function launchBrowser({ headless = config.browser.headless } = {}) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    throw new Error('playwright-core is not installed. Run `npm install` (or use the Docker image).');
  }
  return chromium.launch({
    headless,
    executablePath: config.browser.executablePath,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });
}

export async function withContext(fn, { storageState } = {}) {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      viewport: { width: 1280, height: 900 },
      storageState: storageState && fs.existsSync(storageState) ? storageState : undefined,
    });
    return await fn(context);
  } finally {
    await browser.close();
  }
}

export async function fetchHtmlWithBrowser(url) {
  return withContext(async (context) => {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    return page.content();
  });
}

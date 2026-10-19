// Headless Chromium (via playwright-core) for Facebook, and for Yad2 when its bot
// protection blocks plain HTTP requests. Optional: only loaded when needed.
import fs from 'node:fs';
import { config } from './config.js';

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

async function loadChromium() {
  try {
    return (await import('playwright-core')).chromium;
  } catch {
    throw new Error('playwright-core is not installed. Run `npm install` (or use the Docker image).');
  }
}

const launchOptions = (headless) => ({
  headless,
  channel: config.browser.channel,
  executablePath: config.browser.executablePath,
  args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
});

function explainLaunchError(err) {
  if (/Executable doesn't exist|is not found|Chromium distribution/i.test(err.message)) {
    const hint = config.browser.channel
      ? `The "${config.browser.channel}" browser was not found. Install it, or set BROWSER_CHANNEL=chrome / CHROMIUM_PATH.`
      : 'No browser found. Run `npx playwright-core install chromium`, or set BROWSER_CHANNEL=chrome (or msedge) to use an installed browser.';
    return new Error(hint);
  }
  return err;
}

export async function launchBrowser({ headless = config.browser.headless } = {}) {
  const chromium = await loadChromium();
  return chromium.launch(launchOptions(headless)).catch((err) => {
    throw explainLaunchError(err);
  });
}

// A browser with a profile on disk (data/browser-profile), so cookies survive between runs.
export async function launchPersistent({ headless = config.browser.headless } = {}) {
  const chromium = await loadChromium();
  return chromium
    .launchPersistentContext(config.browser.profileDir, {
      ...launchOptions(headless),
      userAgent: config.browser.channel ? undefined : USER_AGENT,
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      viewport: { width: 1280, height: 900 },
    })
    .catch((err) => {
      if (/ProcessSingleton|profile.*in use|user data directory is already in use/i.test(err.message)) {
        throw new Error('The browser profile is in use. Close the other window (or stop the app) and try again.');
      }
      throw explainLaunchError(err);
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

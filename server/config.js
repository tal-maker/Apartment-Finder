import path from 'node:path';

const env = process.env;

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};
const list = (value) => (value ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: int(env.PORT, 3000),
  dataDir: path.resolve(env.DATA_DIR || 'data'),
  appUser: env.APP_USER || '',
  appPassword: env.APP_PASSWORD || '',
  mockSources: env.MOCK_SOURCES === '1',

  scanIntervalMinutes: int(env.SCAN_INTERVAL_MINUTES, 5),
  // Without this, the first scan of each source only records what is already
  // posted, so you are not flooded with hundreds of old listings.
  notifyOnFirstScan: env.NOTIFY_ON_FIRST_SCAN === '1',
  maxAlertsPerScan: int(env.MAX_ALERTS_PER_SCAN, 10),
  keepDays: int(env.KEEP_DAYS, 45),

  yad2: {
    city: env.YAD2_CITY || '5000', // 5000 = Tel Aviv-Yafo
    baseUrl: env.YAD2_BASE_URL || 'https://www.yad2.co.il',
    pages: int(env.YAD2_PAGES, 2),
    maxDetails: int(env.YAD2_MAX_DETAILS, 20),
    // auto: plain HTTP first, switch to the browser once Yad2 shows a captcha.
    useBrowser: env.YAD2_USE_BROWSER === '1' ? 'always' : env.YAD2_USE_BROWSER === '0' ? 'never' : 'auto',
  },

  telegram: {
    apiId: int(env.TELEGRAM_API_ID, 0),
    apiHash: env.TELEGRAM_API_HASH || '',
    session: env.TELEGRAM_SESSION || '',
    messagesPerChat: int(env.TELEGRAM_MESSAGES_PER_CHAT, 30),
  },

  facebook: {
    // Written by `npm run facebook:login`; the session itself lives in the browser profile.
    loginMarker: path.resolve(env.DATA_DIR || 'data', 'facebook-login.json'),
    scrolls: int(env.FACEBOOK_SCROLLS, 3),
  },

  browser: {
    executablePath: env.CHROMIUM_PATH || undefined,
    // Installed browser to use instead of Playwright's Chromium. Edge ships with Windows.
    channel: env.BROWSER_CHANNEL || (process.platform === 'win32' && !env.CHROMIUM_PATH ? 'msedge' : undefined),
    // Keeps cookies between scans, so a captcha solved once stays solved.
    profileDir: path.resolve(env.BROWSER_PROFILE_DIR || path.join(env.DATA_DIR || 'data', 'browser-profile')),
    headless: env.BROWSER_HEADLESS !== '0',
  },

  llm: {
    enabled: Boolean(env.ANTHROPIC_API_KEY) && env.LLM_EXTRACTION !== '0',
    model: env.ANTHROPIC_MODEL || 'claude-opus-5-5',
  },

  notify: {
    // telegram | callmebot | twilio | meta | console. WHATSAPP_PROVIDER is the older name.
    provider: (env.NOTIFY_PROVIDER || env.WHATSAPP_PROVIDER || '').toLowerCase(),
    telegramBotToken: env.TELEGRAM_BOT_TOKEN || '',
    telegramChatIds: list(env.TELEGRAM_ALERT_CHAT_IDS),
    callmebotRecipients: list(env.CALLMEBOT_RECIPIENTS), // "972501234567:apikey"
    twilioSid: env.TWILIO_ACCOUNT_SID || '',
    twilioToken: env.TWILIO_AUTH_TOKEN || '',
    twilioFrom: env.TWILIO_WHATSAPP_FROM || '',
    twilioTo: list(env.TWILIO_WHATSAPP_TO),
    metaToken: env.META_WA_TOKEN || '',
    metaPhoneNumberId: env.META_WA_PHONE_NUMBER_ID || '',
    metaTo: list(env.META_WA_TO),
    metaTemplate: env.META_WA_TEMPLATE || '',
    metaTemplateLang: env.META_WA_TEMPLATE_LANG || 'he',
  },

  publicUrl: env.PUBLIC_URL || '',
};

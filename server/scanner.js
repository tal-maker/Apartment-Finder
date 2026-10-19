// Runs every source on a schedule, stores new listings, matches them against the
// saved searches and sends alerts (Telegram/WhatsApp) for new matches.
import { config } from './config.js';
import { fingerprint, mergeExtraction, textPostToListing } from './listing.js';
import { matchListing } from './match.js';
import { formatListingMessage } from './notify/notifier.js';
import { extractWithLlm, llmEnabled } from './parse/llm.js';
import { fetchYad2 } from './sources/yad2.js';
import { fetchTelegram } from './sources/telegram.js';
import { fetchFacebook } from './sources/facebook.js';
import { mockTextPosts, mockYad2 } from './sources/mock.js';

export const DEFAULT_SOURCE_SETTINGS = {
  yad2: { enabled: true },
  telegram: { enabled: false, chats: [] },
  facebook: { enabled: false, groups: [] },
};

export function sourceSettings(store) {
  const saved = store.getSetting('sources', {});
  return {
    yad2: { ...DEFAULT_SOURCE_SETTINGS.yad2, ...saved.yad2 },
    telegram: { ...DEFAULT_SOURCE_SETTINGS.telegram, ...saved.telegram },
    facebook: { ...DEFAULT_SOURCE_SETTINGS.facebook, ...saved.facebook },
  };
}

// Default fetchers; tests pass their own.
export function defaultFetchers() {
  if (config.mockSources) {
    return {
      yad2: async () => mockYad2(),
      telegram: async () => ({ posts: mockTextPosts(), errors: [] }),
      facebook: async () => ({ posts: [], errors: [] }),
    };
  }
  return {
    yad2: (_settings, { isKnown }) => fetchYad2({ isKnown }),
    telegram: (settings) => fetchTelegram(settings.chats),
    facebook: (settings) => fetchFacebook(settings.groups),
  };
}

export class Scanner {
  constructor({ store, notifier, fetchers = defaultFetchers(), extract = llmEnabled() ? extractWithLlm : null, log = console }) {
    this.store = store;
    this.notifier = notifier;
    this.fetchers = fetchers;
    this.extract = extract;
    this.log = log;
    this.running = null;
    this.timer = null;
    this.lastScanAt = null;
    this.nextScanAt = null;
  }

  start(intervalMinutes = config.scanIntervalMinutes) {
    const loop = async () => {
      await this.scan().catch((err) => this.log.error('scan failed', err));
      const jitter = Math.round((Math.random() - 0.5) * 30000);
      const delay = intervalMinutes * 60000 + jitter;
      this.nextScanAt = new Date(Date.now() + delay).toISOString();
      this.timer = setTimeout(loop, delay);
    };
    loop();
  }

  stop() {
    clearTimeout(this.timer);
  }

  // Concurrent calls share one run.
  scan() {
    this.running ??= this.#scan().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async #scan() {
    const settings = sourceSettings(this.store);
    const newListings = [];
    const baselineSources = new Set();

    for (const source of ['yad2', 'telegram', 'facebook']) {
      const sourceConfig = settings[source];
      if (!sourceConfig.enabled) continue;
      if (source === 'telegram' && !sourceConfig.chats?.length && !config.mockSources) continue;
      if (source === 'facebook' && !sourceConfig.groups?.length && !config.mockSources) continue;

      const firstScan = this.store.countBySource(source) === 0;
      const runId = this.store.startRun(source);
      try {
        const isKnown = (id) => this.store.hasListing(id);
        const result = await this.fetchers[source](sourceConfig, { isKnown });
        const { items, errors } = Array.isArray(result) ? { items: result, errors: [] } : { items: result.posts, errors: result.errors ?? [] };
        let newCount = 0;
        for (const item of items) {
          const listing = await this.#toListing(item, isKnown(item.id));
          if (!listing) continue;
          if (this.#save(listing)) {
            newCount++;
            newListings.push(listing);
            if (firstScan && !config.notifyOnFirstScan) baselineSources.add(source);
          }
        }
        this.store.finishRun(runId, { ok: true, found: items.length, newCount, error: errors.length ? errors.join('; ') : null });
      } catch (err) {
        this.log.error(`[${source}]`, err.message);
        this.store.finishRun(runId, { ok: false, error: err.message });
      }
    }

    const alerts = this.#matchNew(newListings, baselineSources);
    await this.#sendAlerts(alerts);
    this.store.pruneOlderThan(config.keepDays);
    this.lastScanAt = new Date().toISOString();
    return { newListings: newListings.length, alerts: alerts.length };
  }

  async #toListing(item, known) {
    if (item.source === 'yad2' || item.kind) return { ...item, fingerprint: fingerprint(item) };
    let listing = textPostToListing(item);
    // Claude only reads posts we haven't stored yet, to keep API usage low.
    if (!known && this.extract && listing.kind !== 'seeking') {
      try {
        listing = mergeExtraction(listing, await this.extract(item.text, { postedAt: item.postedAt }));
      } catch (err) {
        this.log.warn('LLM extraction failed:', err.message);
      }
    }
    return { ...listing, fingerprint: fingerprint(listing) };
  }

  // Returns true when the listing is new.
  #save(listing) {
    const existing = this.store.getListing(listing.id);
    if (!existing) {
      this.store.insertListing(listing);
      return true;
    }
    // Keep enriched fields from the first time we saw it when a later scan lacks them.
    const merged = { ...listing };
    for (const [key, value] of Object.entries(existing)) if (merged[key] == null && value != null) merged[key] = value;
    this.store.updateListing(merged);
    return false;
  }

  #matchNew(listings, baselineSources) {
    const alerts = [];
    const searches = this.store.listSearches().filter((s) => s.active);
    for (const search of searches) {
      const announced = new Set();
      for (const listing of listings) {
        const result = matchListing(listing, search.filters);
        if (!result.match || !this.store.addMatch(search.id, listing.id)) continue;
        if (!search.notify || baselineSources.has(listing.source)) continue;
        // Same apartment already announced from another post/source.
        const duplicates = listing.fingerprint ? this.store.findByFingerprint(listing.fingerprint, listing.id) : [];
        if (this.store.wasNotified(search.id, duplicates) || announced.has(listing.fingerprint)) continue;
        if (listing.fingerprint) announced.add(listing.fingerprint);
        alerts.push({ search, listing, unknown: result.unknown });
      }
    }
    return alerts;
  }

  async #sendAlerts(alerts) {
    if (!alerts.length || !this.notifier?.configured()) return;
    const max = config.maxAlertsPerScan;
    for (const { search, listing, unknown } of alerts.slice(0, max)) {
      try {
        await this.notifier.send(formatListingMessage(listing, { searchName: search.name, unknown }));
        this.store.markNotified(search.id, listing.id);
      } catch (err) {
        this.log.error('Alert send failed:', err.message);
      }
    }
    if (alerts.length > max) {
      const link = config.publicUrl ? `\n${config.publicUrl}` : '';
      await this.notifier.send(`➕ ועוד ${alerts.length - max} התאמות חדשות – פתחו את האפליקציה כדי לראות את כולן.${link}`).catch(() => {});
    }
  }

  // Fills matches for a new or edited search from what's already stored (no alerts).
  backfill(search) {
    for (const listing of this.store.listListings({ sinceDays: config.keepDays })) {
      if (matchListing(listing, search.filters).match) this.store.addMatch(search.id, listing.id, listing.firstSeenAt);
    }
  }
}

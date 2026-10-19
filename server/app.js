import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { AREAS } from './neighborhoods.js';
import { FEATURES, matchListing, normalizeFilters } from './match.js';
import { formatListingMessage, notifierConfigured } from './notify/notifier.js';
import { sourceSettings } from './scanner.js';
import { mtprotoConfigured } from './sources/telegram.js';
import { facebookConfigured } from './sources/facebook.js';

const here = path.dirname(fileURLToPath(import.meta.url));

function basicAuth(user, password) {
  const expected = Buffer.from(`${user}:${password}`);
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const given = Buffer.from(header.startsWith('Basic ') ? Buffer.from(header.slice(6), 'base64').toString() : '');
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return next();
    res.set('WWW-Authenticate', 'Basic realm="apartment-finder"').status(401).send('Authentication required');
  };
}

const cleanList = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/)).map((s) => String(s).trim()).filter(Boolean);

export function createApp({ store, scanner, notifier }) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  if (config.appUser && config.appPassword) app.use(basicAuth(config.appUser, config.appPassword));

  app.get('/api/meta', (_req, res) => {
    res.json({
      areas: AREAS,
      features: FEATURES,
      mock: config.mockSources,
      intervalMinutes: config.scanIntervalMinutes,
      scanner: { lastScanAt: scanner.lastScanAt, nextScanAt: scanner.nextScanAt, running: Boolean(scanner.running) },
      telegram: { mode: mtprotoConfigured() ? 'mtproto' : 'web' },
      facebook: { loggedIn: facebookConfigured() },
      notify: { provider: config.notify.provider || null, configured: notifierConfigured() },
      llm: { enabled: config.llm.enabled, model: config.llm.enabled ? config.llm.model : null },
      lastRuns: store.lastRunPerSource(),
    });
  });

  app.get('/api/listings', (req, res) => {
    let listings = store.listListings({ sinceDays: config.keepDays });
    let filters = null;
    if (req.query.searchId) {
      const search = store.getSearch(Number(req.query.searchId));
      if (!search) return res.status(404).json({ error: 'search not found' });
      const ids = store.matchedListingIds(search.id);
      listings = listings.filter((l) => ids.has(l.id));
      filters = search.filters;
    } else if (req.query.filters) {
      try {
        filters = normalizeFilters(JSON.parse(req.query.filters));
      } catch {
        return res.status(400).json({ error: 'bad filters' });
      }
    }
    const status = req.query.status;
    const items = [];
    for (const listing of listings) {
      if (status === 'favorite' && listing.userStatus !== 'favorite') continue;
      if (status !== 'hidden' && listing.userStatus === 'hidden') continue;
      if (status === 'hidden' && listing.userStatus !== 'hidden') continue;
      const result = filters ? matchListing({ ...listing, userStatus: null }, filters) : { match: true, unknown: [] };
      if (result.match) items.push({ ...listing, unknown: result.unknown });
    }
    const sort = req.query.sort ?? 'new';
    if (sort === 'price_asc') items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    if (sort === 'price_desc') items.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
    res.json({ total: items.length, items: items.slice(0, 300) });
  });

  app.post('/api/listings/:id/status', (req, res) => {
    const status = req.body?.status ?? null;
    if (![null, 'favorite', 'hidden'].includes(status)) return res.status(400).json({ error: 'bad status' });
    store.setUserStatus(req.params.id, status);
    res.json({ ok: true });
  });

  app.get('/api/searches', (_req, res) => res.json(store.listSearches()));

  app.post('/api/searches', (req, res) => {
    const { name, filters, notify = true, active = true } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const search = store.createSearch({ name: name.trim(), filters: normalizeFilters(filters), notify, active });
    scanner.backfill(search);
    res.status(201).json(store.getSearch(search.id));
  });

  app.put('/api/searches/:id', (req, res) => {
    const { name, filters, notify, active } = req.body ?? {};
    const search = store.updateSearch(Number(req.params.id), {
      name: name?.trim() || undefined,
      filters: filters ? normalizeFilters(filters) : undefined,
      notify,
      active,
    });
    if (!search) return res.status(404).json({ error: 'not found' });
    if (filters) scanner.backfill(search);
    res.json(store.getSearch(search.id));
  });

  app.delete('/api/searches/:id', (req, res) => {
    if (!store.deleteSearch(Number(req.params.id))) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });

  app.post('/api/searches/:id/test', async (req, res) => {
    const search = store.getSearch(Number(req.params.id));
    if (!search) return res.status(404).json({ error: 'not found' });
    if (!notifier.configured()) return res.status(400).json({ error: 'ההתראות לא מוגדרות (NOTIFY_PROVIDER). ראו README.' });
    const ids = store.matchedListingIds(search.id);
    const listing = store.listListings({ sinceDays: config.keepDays }).find((l) => ids.has(l.id));
    const text = listing
      ? `🧪 הודעת בדיקה\n${formatListingMessage(listing, { searchName: search.name, unknown: matchListing(listing, search.filters).unknown })}`
      : `🧪 הודעת בדיקה – החיפוש "${search.name}" מחובר. עוד אין דירות שמתאימות לו.`;
    try {
      await notifier.send(text);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/settings/sources', (_req, res) => res.json(sourceSettings(store)));

  app.put('/api/settings/sources', (req, res) => {
    const body = req.body ?? {};
    const current = sourceSettings(store);
    const next = {
      yad2: { enabled: Boolean(body.yad2?.enabled ?? current.yad2.enabled) },
      telegram: {
        enabled: Boolean(body.telegram?.enabled ?? current.telegram.enabled),
        chats: body.telegram?.chats !== undefined ? cleanList(body.telegram.chats) : current.telegram.chats,
      },
      facebook: {
        enabled: Boolean(body.facebook?.enabled ?? current.facebook.enabled),
        groups: body.facebook?.groups !== undefined ? cleanList(body.facebook.groups) : current.facebook.groups,
      },
    };
    store.setSetting('sources', next);
    res.json(next);
  });

  app.get('/api/scans', (_req, res) => res.json(store.recentRuns(40)));

  app.post('/api/scan', async (_req, res) => {
    try {
      res.json(await scanner.scan());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use(express.static(path.join(here, '..', 'public')));
  return app;
}

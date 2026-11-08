import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { config } from './config.js';
import { AREAS } from './neighborhoods.js';
import { FEATURES, matchListing, normalizeFilters } from './match.js';
import { formatListingMessage, notifierConfigured } from './notify/notifier.js';
import { sourceSettings } from './scanner.js';
import { SITES } from './sources/sites.js';
import { mtprotoConfigured } from './sources/telegram.js';
import { facebookConfigured } from './sources/facebook.js';
import { authMiddleware, telegramChatsFor, userKey } from './users.js';
import { chatsKey, startLink, waitForLink } from './notify/telegram-link.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const cleanList = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/)).map((s) => String(s).trim()).filter(Boolean);

export function createApp({ store, scanner, notifier }) {
  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use(authMiddleware());

  const adminOnly = (req, res, next) => (req.user.admin ? next() : res.status(403).json({ error: 'רק למנהל' }));
  // Admins see every search; other users only their own.
  const canAccess = (req, search) => Boolean(search) && (req.user.admin || search.owner === req.user.name);
  const telegramReady = () => config.notify.provider === 'telegram' && Boolean(config.notify.telegramBotToken);

  app.get('/api/me', (req, res) => {
    res.json({
      name: req.user.name,
      admin: req.user.admin,
      telegram: { available: telegramReady(), connected: telegramReady() ? telegramChatsFor(store, req.user.admin ? null : req.user.name).length : 0 },
    });
  });

  app.post('/api/telegram/link', async (req, res) => {
    try {
      res.json(await startLink(userKey(req.user)));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/telegram/link/:code/wait', async (req, res) => {
    res.json(await waitForLink(store, req.params.code, { key: userKey(req.user) }));
  });

  app.delete('/api/telegram/chats', (req, res) => {
    store.setSetting(chatsKey(userKey(req.user)), []);
    res.json({ ok: true });
  });

  app.get('/api/meta', (_req, res) => {
    res.json({
      areas: AREAS,
      sites: Object.fromEntries(Object.entries(SITES).map(([key, s]) => [key, { label: s.label, defaultUrl: s.defaultUrl }])),
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
    const statuses = store.statusesFor(userKey(req.user));
    let listings = store.listListings({ sinceDays: config.keepDays }).map((l) => ({ ...l, userStatus: statuses.get(l.id) ?? null }));
    let filters = null;
    if (req.query.searchId) {
      const search = store.getSearch(Number(req.query.searchId));
      if (!canAccess(req, search)) return res.status(404).json({ error: 'search not found' });
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
    store.setUserStatus(userKey(req.user), req.params.id, status);
    res.json({ ok: true });
  });

  app.get('/api/searches', (req, res) => res.json(store.listSearches().filter((s) => canAccess(req, s))));

  app.post('/api/searches', (req, res) => {
    const { name, filters, notify = true, active = true } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'name is required' });
    const search = store.createSearch({ name: name.trim(), filters: normalizeFilters(filters), notify, active, owner: req.user.name });
    scanner.backfill(search);
    res.status(201).json(store.getSearch(search.id));
  });

  app.put('/api/searches/:id', (req, res) => {
    if (!canAccess(req, store.getSearch(Number(req.params.id)))) return res.status(404).json({ error: 'not found' });
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
    if (!canAccess(req, store.getSearch(Number(req.params.id)))) return res.status(404).json({ error: 'not found' });
    if (!store.deleteSearch(Number(req.params.id))) return res.status(404).json({ error: 'not found' });
    res.status(204).end();
  });

  app.post('/api/searches/:id/test', async (req, res) => {
    const search = store.getSearch(Number(req.params.id));
    if (!canAccess(req, search)) return res.status(404).json({ error: 'not found' });
    const recipients = telegramReady() ? telegramChatsFor(store, search.owner) : null;
    if (recipients && !recipients.length) return res.status(400).json({ error: 'קודם צריך לחבר טלגרם (הכפתור "חבר את הטלגרם שלי" למעלה).' });
    if (!notifier.configured()) return res.status(400).json({ error: 'ההתראות לא מוגדרות (NOTIFY_PROVIDER). ראו README.' });
    const ids = store.matchedListingIds(search.id);
    const listing = store.listListings({ sinceDays: config.keepDays }).find((l) => ids.has(l.id));
    let text = `🧪 הודעת בדיקה – החיפוש "${search.name}" מחובר. עוד אין דירות שמתאימות לו.`;
    if (listing) {
      const message = formatListingMessage(listing, { searchName: search.name, unknown: matchListing(listing, search.filters).unknown });
      text = { ...message, text: `🧪 הודעת בדיקה\n${message.text}`, html: `🧪 <i>הודעת בדיקה</i>\n${message.html}` };
    }
    try {
      await notifier.send(text, recipients ? { telegramChatIds: recipients } : undefined);
      res.json({ ok: true });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/api/settings/sources', adminOnly, (_req, res) => res.json(sourceSettings(store)));

  app.put('/api/settings/sources', adminOnly, (req, res) => {
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
      ...Object.fromEntries(
        Object.keys(SITES).map((key) => [
          key,
          {
            enabled: Boolean(body[key]?.enabled ?? current[key].enabled),
            url: body[key]?.url !== undefined ? String(body[key].url).trim() : current[key].url,
          },
        ]),
      ),
    };
    store.setSetting('sources', next);
    res.json(next);
  });

  app.get('/api/scans', adminOnly, (_req, res) => res.json(store.recentRuns(40)));

  app.post('/api/scan', adminOnly, async (_req, res) => {
    try {
      res.json(await scanner.scan());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use('/vendor/leaflet', express.static(path.join(here, '..', 'node_modules', 'leaflet', 'dist')));
  app.use(express.static(path.join(here, '..', 'public')));
  return app;
}

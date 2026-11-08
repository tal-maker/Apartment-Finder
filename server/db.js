import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const LISTING_FIELDS = [
  'source', 'external_id', 'url', 'title', 'text', 'kind', 'price', 'rooms', 'size_sqm', 'floor',
  'neighborhood', 'area', 'city', 'street', 'house_number', 'entry_date', 'condition',
  'mamad', 'parking', 'storage', 'elevator', 'balcony', 'furnished', 'pets', 'broker',
  'shelter', 'aircon',
  'images', 'contact', 'author', 'source_name', 'posted_at', 'fingerprint', 'raw',
  'lat', 'lng', 'geo_precision',
];
const REAL_FIELDS = ['price', 'rooms', 'size_sqm', 'floor', 'house_number', 'lat', 'lng'];
const columnType = (f) => (REAL_FIELDS.includes(f) ? 'REAL' : BOOLEANS.includes(f) ? 'INTEGER' : 'TEXT');

const CAMEL = {
  external_id: 'externalId', size_sqm: 'sizeSqm', house_number: 'houseNumber', entry_date: 'entryDate',
  source_name: 'sourceName', posted_at: 'postedAt', first_seen_at: 'firstSeenAt', updated_at: 'updatedAt',
  user_status: 'userStatus', geo_precision: 'geoPrecision',
};
const BOOLEANS = ['mamad', 'parking', 'storage', 'elevator', 'balcony', 'furnished', 'pets', 'broker', 'shelter', 'aircon'];

const toBool = (v) => (v == null ? null : Boolean(v));
const fromBool = (v) => (v == null ? null : v ? 1 : 0);

function rowToListing(row) {
  if (!row) return null;
  const out = {};
  for (const [key, value] of Object.entries(row)) out[CAMEL[key] ?? key] = value;
  for (const key of BOOLEANS) out[key] = toBool(out[key]);
  out.images = out.images ? JSON.parse(out.images) : [];
  delete out.raw;
  return out;
}

function listingToRow(listing) {
  const row = {};
  for (const field of LISTING_FIELDS) {
    const value = listing[CAMEL[field] ?? field];
    row[field] = value === undefined ? null : value;
  }
  for (const key of BOOLEANS) row[key] = fromBool(listing[key]);
  row.images = JSON.stringify(listing.images ?? []);
  row.raw = listing.raw ? JSON.stringify(listing.raw) : null;
  return row;
}

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY,
      ${LISTING_FIELDS.map((f) => `${f} ${columnType(f)}`).join(',\n      ')},
      user_status TEXT,
      first_seen_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS listings_first_seen ON listings(first_seen_at);
    CREATE INDEX IF NOT EXISTS listings_fingerprint ON listings(fingerprint);
    CREATE TABLE IF NOT EXISTS searches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filters TEXT NOT NULL,
      notify INTEGER NOT NULL DEFAULT 1,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS matches (
      search_id INTEGER NOT NULL,
      listing_id TEXT NOT NULL,
      matched_at TEXT NOT NULL,
      notified_at TEXT,
      PRIMARY KEY (search_id, listing_id)
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS scan_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      ok INTEGER,
      found INTEGER,
      new_count INTEGER,
      error TEXT
    );
  `);
  // Databases created by older versions lack newer columns.
  const existing = new Set(db.prepare('PRAGMA table_info(listings)').all().map((c) => c.name));
  for (const field of LISTING_FIELDS) {
    if (!existing.has(field)) db.exec(`ALTER TABLE listings ADD COLUMN ${field} ${columnType(field)}`);
  }
  db.exec('CREATE TABLE IF NOT EXISTS geocache (query TEXT PRIMARY KEY, lat REAL, lng REAL, at TEXT NOT NULL)');
  // Saved searches belong to a user (null: created before there were users, i.e. the admin).
  if (!db.prepare('PRAGMA table_info(searches)').all().some((c) => c.name === 'owner')) db.exec('ALTER TABLE searches ADD COLUMN owner TEXT');
  // Favorites and hidden listings, per user. Older versions kept one status on the
  // listing itself; those become the admin's.
  db.exec(`CREATE TABLE IF NOT EXISTS listing_status (
    user TEXT NOT NULL, listing_id TEXT NOT NULL, status TEXT NOT NULL, PRIMARY KEY (user, listing_id))`);
  db.exec(`INSERT OR IGNORE INTO listing_status (user, listing_id, status)
    SELECT '@admin', id, user_status FROM listings WHERE user_status IS NOT NULL;
    UPDATE listings SET user_status = NULL WHERE user_status IS NOT NULL;`);
  return new Store(db);
}

export class Store {
  constructor(db) {
    this.db = db;
    const cols = ['id', ...LISTING_FIELDS, 'first_seen_at', 'updated_at'];
    this.insertListingStmt = db.prepare(
      `INSERT INTO listings (${cols.join(', ')}) VALUES (${cols.map((c) => `:${c}`).join(', ')})`,
    );
    this.updateListingStmt = db.prepare(
      // Re-scans don't carry coordinates found later by the geocoder, so keep those.
      `UPDATE listings SET ${LISTING_FIELDS.filter((f) => f !== 'source' && f !== 'external_id')
        .map((f) => (['lat', 'lng', 'geo_precision'].includes(f) ? `${f} = COALESCE(:${f}, ${f})` : `${f} = :${f}`))
        .join(', ')}, updated_at = :updated_at WHERE id = :id`,
    );
  }

  // ---- listings
  getListing(id) {
    return rowToListing(this.db.prepare('SELECT * FROM listings WHERE id = ?').get(id));
  }

  hasListing(id) {
    return Boolean(this.db.prepare('SELECT 1 FROM listings WHERE id = ?').get(id));
  }

  countBySource(source) {
    return this.db.prepare('SELECT COUNT(*) AS n FROM listings WHERE source = ?').get(source).n;
  }

  insertListing(listing, now = new Date().toISOString()) {
    const row = listingToRow(listing);
    this.insertListingStmt.run({ ...row, id: listing.id, first_seen_at: now, updated_at: now });
  }

  updateListing(listing, now = new Date().toISOString()) {
    const row = listingToRow(listing);
    delete row.source;
    delete row.external_id;
    this.updateListingStmt.run({ ...row, id: listing.id, updated_at: now });
  }

  listListings({ sinceDays = 30, limit = 2000 } = {}) {
    const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
    return this.db
      .prepare('SELECT * FROM listings WHERE first_seen_at >= ? ORDER BY first_seen_at DESC LIMIT ?')
      .all(since, limit)
      .map(rowToListing);
  }

  setUserStatus(user, id, status) {
    if (status) {
      this.db
        .prepare('INSERT INTO listing_status (user, listing_id, status) VALUES (?, ?, ?) ON CONFLICT(user, listing_id) DO UPDATE SET status = excluded.status')
        .run(user, id, status);
    } else {
      this.db.prepare('DELETE FROM listing_status WHERE user = ? AND listing_id = ?').run(user, id);
    }
  }

  statusesFor(user) {
    return new Map(this.db.prepare('SELECT listing_id, status FROM listing_status WHERE user = ?').all(user).map((r) => [r.listing_id, r.status]));
  }

  findByFingerprint(fingerprint, excludeId) {
    return this.db
      .prepare('SELECT id FROM listings WHERE fingerprint = ? AND id != ?')
      .all(fingerprint, excludeId)
      .map((r) => r.id);
  }

  pruneOlderThan(days) {
    const before = new Date(Date.now() - days * 86400000).toISOString();
    this.db
      .prepare("DELETE FROM listings WHERE first_seen_at < ? AND id NOT IN (SELECT listing_id FROM listing_status WHERE status = 'favorite')")
      .run(before);
    this.db.prepare('DELETE FROM matches WHERE listing_id NOT IN (SELECT id FROM listings)').run();
    this.db.prepare('DELETE FROM listing_status WHERE listing_id NOT IN (SELECT id FROM listings)').run();
  }

  setLocation(id, { lat, lng, geoPrecision }) {
    this.db.prepare('UPDATE listings SET lat = ?, lng = ?, geo_precision = ? WHERE id = ?').run(lat, lng, geoPrecision, id);
  }

  getGeocache(query) {
    return this.db.prepare('SELECT lat, lng FROM geocache WHERE query = ?').get(query) ?? null;
  }

  setGeocache(query, point) {
    this.db
      .prepare('INSERT INTO geocache (query, lat, lng, at) VALUES (?, ?, ?, ?) ON CONFLICT(query) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, at = excluded.at')
      .run(query, point?.lat ?? null, point?.lng ?? null, new Date().toISOString());
  }

  // ---- searches
  listSearches() {
    return this.db.prepare('SELECT * FROM searches ORDER BY id').all().map(this.#searchRow);
  }

  getSearch(id) {
    const row = this.db.prepare('SELECT * FROM searches WHERE id = ?').get(id);
    return row ? this.#searchRow(row) : null;
  }

  #searchRow = (row) => ({
    id: row.id,
    name: row.name,
    owner: row.owner ?? null,
    filters: JSON.parse(row.filters),
    notify: Boolean(row.notify),
    active: Boolean(row.active),
    createdAt: row.created_at,
    matchCount: this.db.prepare('SELECT COUNT(*) AS n FROM matches WHERE search_id = ?').get(row.id).n,
  });

  createSearch({ name, filters, notify = true, active = true, owner = null }) {
    const result = this.db
      .prepare('INSERT INTO searches (name, filters, notify, active, created_at, owner) VALUES (?, ?, ?, ?, ?, ?)')
      .run(name, JSON.stringify(filters ?? {}), notify ? 1 : 0, active ? 1 : 0, new Date().toISOString(), owner);
    return this.getSearch(Number(result.lastInsertRowid));
  }

  updateSearch(id, { name, filters, notify, active, owner }) {
    const current = this.getSearch(id);
    if (!current) return null;
    this.db
      .prepare('UPDATE searches SET name = ?, filters = ?, notify = ?, active = ?, owner = ? WHERE id = ?')
      .run(
        name ?? current.name,
        JSON.stringify(filters ?? current.filters),
        (notify ?? current.notify) ? 1 : 0,
        (active ?? current.active) ? 1 : 0,
        owner === undefined ? current.owner : owner,
        id,
      );
    if (filters) this.db.prepare('DELETE FROM matches WHERE search_id = ? AND notified_at IS NULL').run(id);
    return this.getSearch(id);
  }

  deleteSearch(id) {
    this.db.prepare('DELETE FROM matches WHERE search_id = ?').run(id);
    return this.db.prepare('DELETE FROM searches WHERE id = ?').run(id).changes > 0;
  }

  // ---- matches
  addMatch(searchId, listingId, now = new Date().toISOString()) {
    return this.db
      .prepare('INSERT OR IGNORE INTO matches (search_id, listing_id, matched_at) VALUES (?, ?, ?)')
      .run(searchId, listingId, now).changes > 0;
  }

  removeUnnotifiedMatch(searchId, listingId) {
    this.db.prepare('DELETE FROM matches WHERE search_id = ? AND listing_id = ? AND notified_at IS NULL').run(searchId, listingId);
  }

  markNotified(searchId, listingId, now = new Date().toISOString()) {
    this.db.prepare('UPDATE matches SET notified_at = ? WHERE search_id = ? AND listing_id = ?').run(now, searchId, listingId);
  }

  wasNotified(searchId, listingIds) {
    if (!listingIds.length) return false;
    const row = this.db
      .prepare(`SELECT 1 FROM matches WHERE search_id = ? AND notified_at IS NOT NULL AND listing_id IN (${listingIds.map(() => '?').join(',')})`)
      .get(searchId, ...listingIds);
    return Boolean(row);
  }

  matchedListingIds(searchId) {
    return new Set(this.db.prepare('SELECT listing_id FROM matches WHERE search_id = ?').all(searchId).map((r) => r.listing_id));
  }

  // ---- settings
  getSetting(key, fallback) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  listSettings(prefix) {
    return this.db
      .prepare('SELECT key, value FROM settings WHERE key LIKE ?')
      .all(`${prefix}%`)
      .map((r) => [r.key, JSON.parse(r.value)]);
  }

  setSetting(key, value) {
    this.db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  }

  // ---- scan runs
  startRun(source) {
    return Number(this.db.prepare('INSERT INTO scan_runs (source, started_at) VALUES (?, ?)').run(source, new Date().toISOString()).lastInsertRowid);
  }

  finishRun(id, { ok, found = 0, newCount = 0, error = null }) {
    this.db
      .prepare('UPDATE scan_runs SET finished_at = ?, ok = ?, found = ?, new_count = ?, error = ? WHERE id = ?')
      .run(new Date().toISOString(), ok ? 1 : 0, found, newCount, error, id);
  }

  // Runs still open from a previous process were cut off when it stopped.
  markInterruptedRuns() {
    return this.db
      .prepare("UPDATE scan_runs SET finished_at = ?, ok = 0, error = 'הסריקה הופסקה באמצע: האפליקציה נסגרה או הופעלה מחדש לפני שהסתיימה' WHERE finished_at IS NULL")
      .run(new Date().toISOString()).changes;
  }

  recentRuns(limit = 30) {
    return this.db
      .prepare('SELECT * FROM scan_runs ORDER BY id DESC LIMIT ?')
      .all(limit)
      .map((r) => ({
        id: r.id, source: r.source, startedAt: r.started_at, finishedAt: r.finished_at,
        ok: r.ok == null ? null : Boolean(r.ok), found: r.found, newCount: r.new_count, error: r.error,
      }));
  }

  lastRunPerSource() {
    return this.db
      .prepare('SELECT * FROM scan_runs WHERE id IN (SELECT MAX(id) FROM scan_runs GROUP BY source)')
      .all()
      .map((r) => ({ source: r.source, finishedAt: r.finished_at, ok: r.ok == null ? null : Boolean(r.ok), found: r.found, newCount: r.new_count, error: r.error }));
  }
}

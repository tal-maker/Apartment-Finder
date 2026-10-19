import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const LISTING_FIELDS = [
  'source', 'external_id', 'url', 'title', 'text', 'kind', 'price', 'rooms', 'size_sqm', 'floor',
  'neighborhood', 'area', 'city', 'street', 'house_number', 'entry_date', 'condition',
  'mamad', 'parking', 'storage', 'elevator', 'balcony', 'furnished', 'pets', 'broker',
  'images', 'contact', 'author', 'source_name', 'posted_at', 'fingerprint', 'raw',
];

const CAMEL = {
  external_id: 'externalId', size_sqm: 'sizeSqm', house_number: 'houseNumber', entry_date: 'entryDate',
  source_name: 'sourceName', posted_at: 'postedAt', first_seen_at: 'firstSeenAt', updated_at: 'updatedAt',
  user_status: 'userStatus',
};
const BOOLEANS = ['mamad', 'parking', 'storage', 'elevator', 'balcony', 'furnished', 'pets', 'broker'];

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
      ${LISTING_FIELDS.map((f) => `${f} ${['price', 'rooms', 'size_sqm', 'floor', 'house_number'].includes(f) ? 'REAL' : BOOLEANS.includes(f) ? 'INTEGER' : 'TEXT'}`).join(',\n      ')},
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
      `UPDATE listings SET ${LISTING_FIELDS.filter((f) => f !== 'source' && f !== 'external_id').map((f) => `${f} = :${f}`).join(', ')}, updated_at = :updated_at WHERE id = :id`,
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

  setUserStatus(id, status) {
    this.db.prepare('UPDATE listings SET user_status = ? WHERE id = ?').run(status, id);
  }

  findByFingerprint(fingerprint, excludeId) {
    return this.db
      .prepare('SELECT id FROM listings WHERE fingerprint = ? AND id != ?')
      .all(fingerprint, excludeId)
      .map((r) => r.id);
  }

  pruneOlderThan(days) {
    const before = new Date(Date.now() - days * 86400000).toISOString();
    this.db.prepare("DELETE FROM listings WHERE first_seen_at < ? AND (user_status IS NULL OR user_status != 'favorite')").run(before);
    this.db.prepare('DELETE FROM matches WHERE listing_id NOT IN (SELECT id FROM listings)').run();
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
    filters: JSON.parse(row.filters),
    notify: Boolean(row.notify),
    active: Boolean(row.active),
    createdAt: row.created_at,
    matchCount: this.db.prepare('SELECT COUNT(*) AS n FROM matches WHERE search_id = ?').get(row.id).n,
  });

  createSearch({ name, filters, notify = true, active = true }) {
    const result = this.db
      .prepare('INSERT INTO searches (name, filters, notify, active, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(name, JSON.stringify(filters ?? {}), notify ? 1 : 0, active ? 1 : 0, new Date().toISOString());
    return this.getSearch(Number(result.lastInsertRowid));
  }

  updateSearch(id, { name, filters, notify, active }) {
    const current = this.getSearch(id);
    if (!current) return null;
    this.db
      .prepare('UPDATE searches SET name = ?, filters = ?, notify = ?, active = ? WHERE id = ?')
      .run(
        name ?? current.name,
        JSON.stringify(filters ?? current.filters),
        (notify ?? current.notify) ? 1 : 0,
        (active ?? current.active) ? 1 : 0,
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

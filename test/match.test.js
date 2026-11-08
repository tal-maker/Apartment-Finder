import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchListing } from '../server/match.js';

const base = {
  kind: 'rent', source: 'yad2', city: 'תל אביב יפו', area: 'old_north', neighborhood: 'הצפון הישן - צפון',
  price: 7000, rooms: 3, sizeSqm: 70, floor: 2, condition: 'renovated', entryDate: '2026-12-01',
  mamad: true, parking: null, storage: false, broker: false,
};

test('matches on area, price, rooms and features', () => {
  const r = matchListing(base, { areas: ['old_north'], priceMax: 8000, roomsMin: 2.5, features: { mamad: 'required' }, broker: 'no_broker' });
  assert.equal(r.match, true);
  assert.deepEqual(r.unknown, []);
});

test('fails on price, area, excluded feature, broker', () => {
  assert.equal(matchListing(base, { priceMax: 6000 }).match, false);
  assert.equal(matchListing(base, { areas: ['south'] }).match, false);
  assert.equal(matchListing(base, { features: { mamad: 'excluded' } }).match, false);
  assert.equal(matchListing(base, { broker: 'only_broker' }).match, false);
  assert.equal(matchListing(base, { neighborhoods: ['הצפון הישן - צפון'] }).match, true);
});

test('unknown fields pass unless strict', () => {
  const r = matchListing(base, { features: { parking: 'required' } });
  assert.equal(r.match, true);
  assert.deepEqual(r.unknown, ['parking']);
  assert.equal(matchListing(base, { features: { parking: 'required' }, strictUnknown: true }).match, false);
});

test('entry dates, kinds, other cities, keywords', () => {
  assert.equal(matchListing(base, { entryFrom: '2026-11-15', entryTo: '2026-12-15' }).match, true);
  assert.equal(matchListing(base, { entryTo: '2026-11-01' }).match, false);
  assert.equal(matchListing({ ...base, entryDate: 'immediate' }, { entryTo: '2030-01-01' }, { today: new Date('2026-10-19') }).match, true);
  assert.equal(matchListing({ ...base, kind: 'seeking' }, {}).match, false);
  assert.equal(matchListing({ ...base, kind: 'roommate' }, { kinds: ['rent', 'roommate'] }).match, true);
  assert.equal(matchListing({ ...base, city: 'other' }, {}).match, false);
  assert.equal(matchListing({ ...base, text: 'דירת מרתף' }, { excludeKeywords: ['מרתף'] }).match, false);
});

test('listings without a price are hidden unless asked for', () => {
  const noPrice = { ...base, price: null };
  assert.equal(matchListing(noPrice, {}).match, false);
  assert.equal(matchListing(noPrice, { includeNoPrice: true }).match, true);
  assert.deepEqual(matchListing(noPrice, { includeNoPrice: true, priceMax: 8000 }).unknown, ['price']);
});

test('posts that are not offers never match, even with no kind selected', () => {
  for (const kind of ['other', 'seeking', 'sale']) {
    assert.equal(matchListing({ ...base, kind }, { kinds: [] }).match, false);
    assert.equal(matchListing({ ...base, kind }, { kinds: ['rent', kind] }).match, false);
  }
  assert.equal(matchListing(base, { kinds: [] }).match, true);
});

test('with areas chosen, an unknown location is hidden unless asked for', () => {
  const nowhere = { ...base, area: null, neighborhood: null };
  assert.equal(matchListing(nowhere, { areas: ['new_north'] }).match, false);
  assert.equal(matchListing(nowhere, { areas: ['new_north'], includeUnknownLocation: true }).match, true);
  assert.equal(matchListing(nowhere, {}).match, true);
});

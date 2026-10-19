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

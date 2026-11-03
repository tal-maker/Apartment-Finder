import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createGeocoder } from '../server/geocode.js';

function setup(responses) {
  const store = openDb(':memory:');
  const queries = [];
  const fetchImpl = async (url) => {
    const q = new URL(url).searchParams.get('q');
    queries.push(q);
    return { ok: true, json: async () => responses[q] ?? [] };
  };
  return { store, queries, geocoder: createGeocoder({ store, fetchImpl, enabled: true, delayMs: 0, log: { warn() {} } }) };
}

const listing = (id, extra) => ({ id, source: 'facebook', externalId: id, url: 'u', title: 't', text: 't', kind: 'rent', images: [], ...extra });

test('street address is geocoded, neighborhood-only posts get the neighborhood center', async () => {
  const { store, geocoder, queries } = setup({ 'בזל 12, תל אביב-יפו, ישראל': [{ lat: '32.0907', lon: '34.7760' }] });
  const a = listing('a', { street: 'בזל', houseNumber: 12, area: 'old_north' });
  const b = listing('b', { neighborhood: 'פלורנטין', area: 'south' });
  const c = listing('c', {});
  for (const l of [a, b, c]) store.insertListing(l);
  await geocoder.locate([a, b, c]);
  assert.deepEqual([store.getListing('a').lat, store.getListing('a').geoPrecision], [32.0907, 'exact']);
  assert.equal(store.getListing('b').geoPrecision, 'neighborhood');
  assert.equal(store.getListing('c').lat, null);
  // Cached: the same address isn't looked up twice.
  const d = listing('d', { street: 'בזל', houseNumber: 12 });
  store.insertListing(d);
  await geocoder.locate([d]);
  assert.equal(queries.length, 1);
  assert.equal(store.getListing('d').lat, 32.0907);
});

test('results outside Tel Aviv are ignored, and re-scans keep found coordinates', async () => {
  const { store, geocoder } = setup({ 'הרצל 5, תל אביב-יפו, ישראל': [{ lat: '31.25', lon: '34.79' }] });
  const a = listing('a', { street: 'הרצל', houseNumber: 5, area: 'south' });
  store.insertListing(a);
  await geocoder.locate([a]);
  assert.equal(store.getListing('a').geoPrecision, 'area');
  store.setLocation('a', { lat: 32.06, lng: 34.77, geoPrecision: 'exact' });
  store.updateListing({ ...a, price: 5000 });
  assert.equal(store.getListing('a').lat, 32.06);
});

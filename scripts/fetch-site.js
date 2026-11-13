// Reads one search results page from Madlan, Komo or Homeless and saves the listings
// to JSON and CSV (opens in Excel). Uses the same browser and reader as the app.
//
//   npm run fetch-site -- madlan "https://www.madlan.co.il/for-rent/..."
//
// Stop the app first: both use the same browser profile.
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../server/config.js';
import { textPostToListing } from '../server/listing.js';
import { SITES, fetchSite } from '../server/sources/sites.js';

const [site, url] = process.argv.slice(2);
if (!SITES[site]) {
  console.error(`Usage: npm run fetch-site -- <${Object.keys(SITES).join('|')}> ["search page URL"]`);
  process.exit(1);
}

const result = await fetchSite(site, url);
// Pages with embedded data give listings directly; otherwise the card texts are parsed.
const listings = Array.isArray(result) ? result : result.posts.map((post) => textPostToListing(post));

const COLUMNS = [
  'price', 'rooms', 'sizeSqm', 'floor', 'street', 'houseNumber', 'neighborhood', 'area', 'city', 'entryDate', 'condition',
  'broker', 'mamad', 'shelter', 'parking', 'storage', 'elevator', 'balcony', 'aircon', 'furnished', 'pets', 'lat', 'lng', 'url',
];
const cell = (v) => (v == null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = [COLUMNS.join(','), ...listings.map((l) => COLUMNS.map((c) => cell(l[c])).join(','))].join('\n');

const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
const base = path.join(config.dataDir, `${site}-${stamp}`);
fs.mkdirSync(config.dataDir, { recursive: true });
fs.writeFileSync(`${base}.json`, JSON.stringify(listings, null, 2));
// The BOM makes Excel read the Hebrew correctly.
fs.writeFileSync(`${base}.csv`, `﻿${csv}`);

console.log(`${listings.length} listings from ${SITES[site].label}${Array.isArray(result) ? ' (page data)' : ' (card text)'}`);
for (const l of listings.slice(0, 5)) {
  console.log(`  ${l.price ? `${l.price.toLocaleString('en-US')} ₪` : '?'} · ${l.rooms ?? '?'} rooms · ${[l.street, l.houseNumber].filter(Boolean).join(' ') || l.neighborhood || '?'}`);
}
console.log(`Saved ${base}.json and ${base}.csv`);
process.exit(0);

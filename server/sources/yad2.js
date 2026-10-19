// Yad2 rentals. The site is a Next.js app: the search page and each item page carry
// their data as JSON in <script id="__NEXT_DATA__">. Parsing walks that JSON for
// objects that look like listings, so small changes in nesting don't break it.
import { config } from '../config.js';
import { USER_AGENT, fetchHtmlWithBrowser } from '../browser.js';
import { findNeighborhood } from '../neighborhoods.js';
import { parseRentalText } from '../parse/text.js';

export class BlockedError extends Error {}

const CONDITION_BY_ID = { 1: 'new', 2: 'new', 3: 'renovated', 4: 'good', 5: 'needs_renovation' };
const CONDITION_BY_TEXT = [
  [/חדש מקבלן|חדש \(גרו בו\)|חדש/, 'new'],
  [/משופץ/, 'renovated'],
  [/שמור/, 'good'],
  [/דרוש שיפוץ/, 'needs_renovation'],
];

export function searchUrl(page = 1) {
  const url = new URL('https://www.yad2.co.il/realestate/rent');
  url.searchParams.set('city', config.yad2.city);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export const itemUrl = (token) => `https://www.yad2.co.il/realestate/item/${token}`;

async function fetchHtml(url) {
  if (config.yad2.useBrowser) return fetchHtmlWithBrowser(url);
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(30000),
  });
  const html = await res.text();
  if (!res.ok && !html.includes('__NEXT_DATA__')) {
    throw new BlockedError(`Yad2 answered HTTP ${res.status}`);
  }
  return html;
}

export function extractNextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) {
    if (/captcha|shieldsquare|perimeterx|are you for real|validate\.perfdrive/i.test(html)) {
      throw new BlockedError('Yad2 bot protection (captcha) blocked the request. Set YAD2_USE_BROWSER=1 or slow down scans.');
    }
    throw new Error('Yad2 page has no __NEXT_DATA__ (page layout changed?)');
  }
  return JSON.parse(m[1]);
}

function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  visit(node);
  for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value, visit, seen);
}

const text = (v) => (v && typeof v === 'object' ? v.text ?? v.name ?? null : v ?? null);
const num = (v) => {
  if (v == null || v === '') return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

function isNewFeedItem(o) {
  return typeof o.token === 'string' && o.address && typeof o.address === 'object' && ('price' in o || 'additionalDetails' in o);
}

function isLegacyFeedItem(o) {
  return (o.link_token || o.id) && ('row_1' in o || 'Rooms_text' in o) && 'price' in o;
}

export function normalizeFeedItem(item) {
  if (isLegacyFeedItem(item) && !isNewFeedItem(item)) return normalizeLegacyItem(item);
  const address = item.address ?? {};
  const details = item.additionalDetails ?? {};
  const meta = item.metaData ?? {};
  const neighborhoodText = text(address.neighborhood);
  const location = findNeighborhood(neighborhoodText ?? '') ?? findNeighborhood(text(address.area) ?? '');
  const tags = (item.tags ?? []).map((t) => text(t)).filter(Boolean).join(' · ');
  const tagFlags = tags ? parseRentalText(tags) : {};
  const conditionId = details.propertyCondition?.id ?? details.propertyCondition;
  const street = text(address.street);
  const houseNumber = num(address.house?.number);
  const property = text(details.property);

  return {
    id: `yad2:${item.token}`,
    source: 'yad2',
    externalId: item.token,
    url: itemUrl(item.token),
    title: [property, street && `${street}${houseNumber ? ` ${houseNumber}` : ''}`, neighborhoodText].filter(Boolean).join(', '),
    text: tags,
    kind: 'rent',
    price: num(item.price),
    rooms: num(details.roomsCount),
    sizeSqm: num(details.squareMeter ?? meta.squareMeterBuild),
    floor: address.house?.floor ?? null,
    neighborhood: location?.neighborhood ?? neighborhoodText,
    area: location?.area ?? null,
    city: text(address.city) ?? 'תל אביב יפו',
    street,
    houseNumber,
    entryDate: null,
    condition: CONDITION_BY_ID[conditionId] ?? null,
    mamad: tagFlags.mamad ?? null,
    parking: tagFlags.parking ?? null,
    storage: tagFlags.storage ?? null,
    elevator: tagFlags.elevator ?? null,
    balcony: tagFlags.balcony ?? null,
    furnished: tagFlags.furnished ?? null,
    pets: tagFlags.pets ?? null,
    broker: item.adType ? item.adType !== 'private' : item.customer?.agencyName ? true : null,
    images: [meta.coverImage, ...(meta.images ?? [])].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).slice(0, 6),
    sourceName: 'יד2',
    postedAt: null,
    raw: item,
  };
}

function normalizeLegacyItem(item) {
  const token = item.link_token || item.id;
  const neighborhoodText = item.neighborhood || null;
  const location = findNeighborhood(neighborhoodText ?? item.row_2 ?? '');
  const desc = [item.row_1, item.row_2, item.row_3, item.title_1, item.title_2].filter(Boolean).join(' · ');
  const flags = parseRentalText(desc);
  const entry = item.date_of_entry;
  return {
    id: `yad2:${token}`,
    source: 'yad2',
    externalId: String(token),
    url: itemUrl(token),
    title: [item.row_1, neighborhoodText].filter(Boolean).join(', '),
    text: desc,
    kind: 'rent',
    price: num(item.price),
    rooms: num(item.Rooms_text ?? item.rooms),
    sizeSqm: num(item.square_meters),
    floor: num(item.Floor_text) ?? null,
    neighborhood: location?.neighborhood ?? neighborhoodText,
    area: location?.area ?? null,
    city: item.city || 'תל אביב יפו',
    street: item.street || null,
    houseNumber: num(item.address_home_number),
    entryDate: /מיידי/.test(entry ?? '') ? 'immediate' : parseDmy(entry),
    condition: null,
    mamad: flags.mamad,
    parking: flags.parking,
    storage: flags.storage,
    elevator: flags.elevator,
    balcony: flags.balcony,
    furnished: flags.furnished,
    pets: flags.pets,
    broker: item.merchant != null ? Boolean(item.merchant) : item.feed_source ? item.feed_source !== 'private' : null,
    images: Object.values(item.images ?? {}).map((i) => i?.src ?? i).filter((v) => typeof v === 'string').slice(0, 6),
    sourceName: 'יד2',
    postedAt: item.date_added ? new Date(item.date_added.replace(' ', 'T') + '+03:00').toISOString() : null,
    raw: item,
  };
}

function parseDmy(value) {
  const m = String(value ?? '').match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/);
  if (!m) {
    const iso = String(value ?? '').match(/\d{4}-\d{2}-\d{2}/);
    return iso ? iso[0] : null;
  }
  const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return new Date(Date.UTC(year, Number(m[2]) - 1, Number(m[1]))).toISOString().slice(0, 10);
}

export function parseSearchPage(html) {
  const data = extractNextData(html);
  const items = new Map();
  walk(data, (node) => {
    if (isNewFeedItem(node) || isLegacyFeedItem(node)) {
      const listing = normalizeFeedItem(node);
      if (!items.has(listing.id)) items.set(listing.id, listing);
    }
  });
  return [...items.values()];
}

// Item pages keep amenities as booleans named include*, usually under `inProperty`.
const BOOL_KEYS = {
  mamad: ['includeSecurityRoom', 'includeMamad'],
  parking: ['includeParking', 'parkingSpacesCount'],
  storage: ['includeWarehouse', 'includeStorage'],
  elevator: ['includeElevator'],
  balcony: ['includeBalcony', 'balconiesCount'],
  furnished: ['includeFurniture'],
  pets: ['includePets', 'includeAnimals'],
};

// Fills details that only the item page has (amenities, entry date, description).
export function parseItemPage(html) {
  const data = extractNextData(html);
  const out = {};
  let description = null;
  walk(data, (node) => {
    for (const [field, keys] of Object.entries(BOOL_KEYS)) {
      if (out[field] != null) continue;
      for (const key of keys) {
        if (key in node && (typeof node[key] === 'boolean' || typeof node[key] === 'number')) {
          out[field] = Boolean(node[key]);
          break;
        }
      }
    }
    if (out.entryDate == null) {
      for (const key of ['entranceDate', 'entrance', 'dateOfEntry', 'entryDate']) {
        const v = node[key];
        if (typeof v === 'string' && v) {
          out.entryDate = /מיידי|immediate/i.test(v) ? 'immediate' : parseDmy(v);
          break;
        }
      }
      if (node.isImmediateEntrance === true || node.immediateEntrance === true) out.entryDate = 'immediate';
    }
    if (!description && typeof node.description === 'string' && node.description.length > 10) description = node.description;
    if (out.condition == null && node.propertyCondition) {
      const id = node.propertyCondition.id ?? node.propertyCondition;
      const label = text(node.propertyCondition);
      out.condition = CONDITION_BY_ID[id] ?? CONDITION_BY_TEXT.find(([re]) => re.test(label ?? ''))?.[1] ?? null;
    }
  });
  if (description) {
    out.text = description;
    const flags = parseRentalText(description);
    for (const key of [...Object.keys(BOOL_KEYS), 'entryDate', 'condition']) {
      if (out[key] == null && flags[key] != null) out[key] = flags[key];
    }
    if (flags.broker != null) out.brokerHint = flags.broker;
  }
  return out;
}

export async function fetchYad2({ isKnown = () => false } = {}) {
  const listings = new Map();
  for (let page = 1; page <= config.yad2.pages; page++) {
    const html = await fetchHtml(searchUrl(page));
    for (const listing of parseSearchPage(html)) listings.set(listing.id, listing);
    if (page < config.yad2.pages) await sleep(1500 + Math.random() * 1500);
  }
  // Item pages only for listings we haven't seen, to keep the request count low.
  let details = 0;
  for (const listing of listings.values()) {
    if (details >= config.yad2.maxDetails || isKnown(listing.id)) continue;
    details++;
    try {
      await sleep(800 + Math.random() * 1200);
      const extra = parseItemPage(await fetchHtml(listing.url));
      const { brokerHint, text: description, ...fields } = extra;
      for (const [key, value] of Object.entries(fields)) if (value != null) listing[key] = value;
      if (description) listing.text = [listing.text, description].filter(Boolean).join('\n');
      if (listing.broker == null && brokerHint != null) listing.broker = brokerHint;
    } catch (err) {
      if (err instanceof BlockedError) break;
    }
  }
  return [...listings.values()];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

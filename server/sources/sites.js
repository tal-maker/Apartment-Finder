// Madlan, Komo and Homeless. Each is read from a search results page (the user pastes
// their own search URL in the settings) in the app's browser. The page's embedded
// listing data is used when there is any (Next.js __NEXT_DATA__, window.__…__ state,
// JSON-LD); otherwise each result card's text goes through the Hebrew text parser.
import { acquireContext } from '../browser.js';
import { config } from '../config.js';
import { findAreaByStreet, findNeighborhood, mentionsOtherCity } from '../neighborhoods.js';
import { parseRentalText } from '../parse/text.js';

export const SITES = {
  madlan: {
    label: 'מדלן',
    defaultUrl: 'https://www.madlan.co.il/for-rent/%D7%AA%D7%9C-%D7%90%D7%91%D7%99%D7%91-%D7%99%D7%A4%D7%95-%D7%99%D7%A9%D7%A8%D7%90%D7%9C',
    detail: 'madlan\\.co\\.il/listings/([A-Za-z0-9_-]{5,})',
    itemUrl: (id) => `https://www.madlan.co.il/listings/${id}`,
  },
  komo: {
    label: 'קומו',
    defaultUrl: 'https://www.komo.co.il/code/nadlan/apartments-for-rent.asp',
    detail: 'komo\\.co\\.il/code/nadlan/[^"\'\\s]*?(?:modaaNum|modaa)=(\\d{4,})',
    itemUrl: (id) => `https://www.komo.co.il/code/nadlan/details/?modaaNum=${id}`,
  },
  homeless: {
    label: 'הומלס',
    defaultUrl: 'https://www.homeless.co.il/rent/',
    detail: 'homeless\\.co\\.il/rent/viewad,(\\d{4,})\\.aspx',
    itemUrl: (id) => `https://www.homeless.co.il/rent/viewad,${id}.aspx`,
  },
};

const CAPTCHA_RE = /captcha|are you (?:a )?(?:human|robot)|אני לא רובוט|perimeterx|shieldsquare|cf-challenge/i;

// ---------- embedded data

export function extractEmbeddedJson(html) {
  const blobs = [];
  const tryParse = (text) => {
    try {
      blobs.push(JSON.parse(text));
    } catch {}
  };
  for (const m of html.matchAll(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g)) tryParse(m[1]);
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) tryParse(m[1]);
  for (const m of html.matchAll(/window\.(__[A-Z0-9_]+__)\s*=\s*([\s\S]*?)<\/script>/g)) tryParse(m[2].trim().replace(/;\s*$/, ''));
  return blobs;
}

const num = (v) => {
  if (v == null || v === '' || typeof v === 'boolean' || typeof v === 'object') return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const firstString = (...values) => values.find((v) => typeof v === 'string' && v.trim())?.trim() ?? null;

function walk(node, visit, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  visit(node);
  for (const value of Array.isArray(node) ? node : Object.values(node)) walk(value, visit, seen);
}

const idOf = (o) => o.id ?? o.listingId ?? o.token ?? o.adId ?? o.modaaNum ?? null;
const priceOf = (o) => num(o.price ?? o.monthlyPrice ?? o.rent ?? o.offers?.price);
const roomsOf = (o) => num(o.beds ?? o.rooms ?? o.roomsCount ?? o.numberOfRooms ?? o.bedrooms ?? o.roomsNum);

function looksLikeListing(o) {
  if (Array.isArray(o) || idOf(o) == null) return false;
  const price = priceOf(o);
  if (price == null || price < 1000 || price > 100000) return false;
  return roomsOf(o) != null || 'address' in o || 'locationPoint' in o || 'addressDetails' in o;
}

function pointOf(o) {
  const candidates = [o.locationPoint, o.location, o.coordinates, o.coords, o.geo, o.address?.geo, o];
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const lat = Number(c.lat ?? c.latitude);
    const lng = Number(c.lng ?? c.lon ?? c.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 29 && lat < 34 && lng > 34 && lng < 36) return { lat, lng, geoPrecision: 'exact' };
  }
  return {};
}

function imagesOf(o) {
  const list = [].concat(o.images ?? o.photos ?? o.image ?? []);
  return list
    .map((i) => (typeof i === 'string' ? i : i?.imageUrl ?? i?.url ?? i?.src ?? i?.contentUrl))
    .filter((u) => typeof u === 'string' && /^https?:\/\//.test(u))
    .slice(0, 6);
}

const AMENITY_KEYS = {
  mamad: /secure|mamad|safe.?room|ממ"?ד/i,
  shelter: /shelter|bomb|מקלט/i,
  aircon: /air.?cond|מזגן|מיזוג/i,
  parking: /parking|חני/i,
  storage: /storage|warehouse|מחסן/i,
  elevator: /elevator|lift|מעלית/i,
  balcony: /balcon|מרפסת/i,
  furnished: /furni|ריהוט|מרוהט/i,
  pets: /pet|חיות/i,
};

function amenitiesOf(o) {
  const out = {};
  const source = o.amenities ?? o.features ?? o.inProperty ?? null;
  if (!source) return out;
  const entries = Array.isArray(source) ? source.map((name) => [typeof name === 'string' ? name : name?.name ?? name?.text, true]) : Object.entries(source);
  for (const [key, value] of entries) {
    if (typeof key !== 'string') continue;
    for (const [field, re] of Object.entries(AMENITY_KEYS)) {
      if (re.test(key) && (typeof value === 'boolean' || typeof value === 'number')) out[field] = Boolean(value);
    }
  }
  return out;
}

function conditionOf(o) {
  const v = firstString(o.generalCondition, o.condition, o.propertyCondition?.text, typeof o.propertyCondition === 'string' ? o.propertyCondition : null);
  if (!v) return null;
  if (/new|חדש/i.test(v)) return 'new';
  if (/renovated|משופצ/i.test(v)) return 'renovated';
  if (/needs|require|דרוש|שיפוץ/i.test(v)) return 'needs_renovation';
  if (/good|preserved|שמור/i.test(v)) return 'good';
  return null;
}

function addressOf(o) {
  const a = o.addressDetails ?? (o.address && typeof o.address === 'object' ? o.address : {});
  const street = firstString(a.streetName, a.street?.text, a.street, o.streetName, o.street);
  const houseNumber = num(a.streetNumber ?? a.houseNumber ?? a.house?.number ?? o.streetNumber);
  const neighborhood = firstString(a.neighbourhood, a.neighborhood?.text, a.neighborhood, o.neighbourhood, o.neighborhood);
  const city = firstString(a.city?.text, a.city, a.addressLocality, o.city);
  const text = [typeof o.address === 'string' ? o.address : null, street && `${street}${houseNumber ? ` ${houseNumber}` : ''}`, neighborhood, city]
    .filter(Boolean)
    .join(', ');
  return { street, houseNumber, neighborhood, city, text };
}

export function normalizeEmbedded(siteKey, o) {
  const site = SITES[siteKey];
  const id = String(idOf(o));
  const address = addressOf(o);
  if (/buy|sale|מכירה/i.test(String(o.dealType ?? ''))) return null;
  const description = firstString(o.description, o.text, o.comments) ?? '';
  const parsed = parseRentalText(`${address.text}\n${description}`);
  // A stated city wins: "ביאליק, רמת גן" is not the Tel Aviv street.
  const statesTelAviv = /תל.?אביב|tel.?aviv/i.test(`${address.city ?? ''} ${address.text}`);
  const otherCity = (address.city && !statesTelAviv) || (!statesTelAviv && mentionsOtherCity(address.text));
  const location = otherCity
    ? null
    : findNeighborhood(address.neighborhood ?? '') ?? findNeighborhood(address.text) ?? findAreaByStreet(`${address.street ?? ''} ${address.houseNumber ?? ''}`);
  const telAviv = !otherCity && (statesTelAviv || Boolean(location));
  const url = typeof o.url === 'string' && o.url.startsWith('http') ? o.url : site.itemUrl(id);
  const broker =
    o.poc?.type != null ? o.poc.type !== 'private' : typeof o.isAgent === 'boolean' ? o.isAgent : o.adType ? o.adType !== 'private' : parsed.broker;

  return {
    id: `${siteKey}:${id}`,
    source: siteKey,
    externalId: id,
    url,
    title: [address.street && `${address.street}${address.houseNumber ? ` ${address.houseNumber}` : ''}`, address.neighborhood].filter(Boolean).join(', ') || parsed.street || site.label,
    text: description,
    kind: parsed.kind === 'roommate' || parsed.kind === 'sublet' ? parsed.kind : 'rent',
    price: priceOf(o),
    rooms: roomsOf(o) ?? parsed.rooms,
    sizeSqm: num(typeof o.area === 'number' ? o.area : null) ?? num(o.squareMeter ?? o.size ?? o.floorSize?.value) ?? parsed.sizeSqm,
    floor: Number.isFinite(Number(o.floor)) && o.floor !== null && o.floor !== '' ? Number(o.floor) : parsed.floor,
    neighborhood: location?.neighborhood ?? (otherCity ? null : address.neighborhood ?? parsed.neighborhood),
    area: location?.area ?? (otherCity ? null : parsed.area),
    city: otherCity ? 'other' : telAviv ? 'תל אביב יפו' : parsed.city,
    street: address.street ?? parsed.street,
    houseNumber: address.houseNumber ?? parsed.houseNumber,
    entryDate: firstString(o.entryDate, o.dateOfEntry)?.slice(0, 10) ?? parsed.entryDate,
    condition: conditionOf(o) ?? parsed.condition,
    ...Object.fromEntries(['mamad', 'shelter', 'parking', 'storage', 'elevator', 'balcony', 'aircon', 'furnished', 'pets'].map((k) => [k, parsed[k] ?? null])),
    ...amenitiesOf(o),
    broker,
    images: imagesOf(o),
    contact: parsed.contact,
    sourceName: site.label,
    postedAt: null,
    ...pointOf(o),
  };
}

export function parseEmbeddedListings(siteKey, html) {
  const found = new Map();
  for (const blob of extractEmbeddedJson(html)) {
    walk(blob, (node) => {
      if (!looksLikeListing(node)) return;
      const listing = normalizeEmbedded(siteKey, node);
      if (listing && !found.has(listing.id)) found.set(listing.id, listing);
    });
  }
  return [...found.values()];
}

// ---------- result cards (fallback)

// Runs in the page. Finds links to listing pages (also in onclick/data-href, as
// on table-style sites) and takes the largest element around each one that holds
// only that listing.
export function extractCardsInPage(pattern) {
  const re = new RegExp(pattern, 'i');
  const targetOf = (el) => {
    const onclick = (el.getAttribute('onclick') ?? '').match(/['"]((?:https?:)?\/[^'"]+)['"]/)?.[1];
    const raw = el.getAttribute('href') ?? el.getAttribute('data-href') ?? onclick ?? '';
    if (!raw || raw.startsWith('javascript:') || raw === '#') return onclick ? new URL(onclick, location.href).href : null;
    return new URL(raw, location.href).href;
  };
  const idOf = (el) => {
    const target = targetOf(el);
    const m = target && target.match(re);
    return m ? { id: m[1], url: target } : null;
  };
  const linkSelector = 'a[href], [onclick], [data-href]';
  const cards = new Map();
  for (const el of document.querySelectorAll(linkSelector)) {
    const hit = idOf(el);
    if (!hit || cards.has(hit.id)) continue;
    let card = el;
    for (let node = el.parentElement, depth = 0; node && node !== document.body && depth < 8; node = node.parentElement, depth++) {
      const ids = new Set([...node.querySelectorAll(linkSelector)].map((e) => idOf(e)?.id).filter(Boolean));
      if (ids.size > 1 || node.innerText.length > 1500) break;
      card = node;
    }
    const text = card.innerText.replace(/\n{3,}/g, '\n\n').trim();
    if (text.length < 15) continue;
    const images = [...card.querySelectorAll('img')]
      .map((i) => i.currentSrc || i.src)
      .filter((src) => /^https?:\/\//.test(src) && !/sprite|logo|icon|placeholder/i.test(src))
      .slice(0, 4);
    // Table-style results put rooms and address in bare cells ("3", "ויטל 5").
    const cells = [...card.querySelectorAll('td')].map((td) => td.innerText.trim()).filter(Boolean);
    cards.set(hit.id, { id: hit.id, url: hit.url, text, images, cells });
  }
  return [...cards.values()];
}

export function hintsFromCells(cells) {
  const hints = {};
  for (const cell of cells) {
    if (hints.rooms == null && /^\d(?:\.5)?$/.test(cell) && Number(cell) >= 1 && Number(cell) <= 8) hints.rooms = Number(cell);
    const address = cell.match(/^([א-ת"'׳\- ]{2,25}?)\s+(\d{1,3})$/);
    if (hints.street == null && address && !/קומה|חדרים|מ"ר/.test(cell)) {
      hints.street = address[1].trim();
      hints.houseNumber = Number(address[2]);
    }
  }
  return hints;
}

// ---------- fetching

export async function fetchSite(siteKey, url) {
  const site = SITES[siteKey];
  const { context, release } = await acquireContext();
  const page = await context.newPage();
  try {
    await page.goto(url || site.defaultUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    if (CAPTCHA_RE.test(await page.evaluate(() => document.body?.innerText?.slice(0, 3000) ?? ''))) {
      if (config.browser.headless) throw new Error(`${site.label} is showing a captcha. Set BROWSER_HEADLESS=0 and solve it in the browser window.`);
      // In a visible window, wait for the captcha to be solved there.
      await page
        .waitForFunction((src) => !new RegExp(src, 'i').test(document.body?.innerText?.slice(0, 3000) ?? ''), CAPTCHA_RE.source, { timeout: 180000 })
        .catch(() => {});
    }
    // Results often load as you scroll.
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 2500);
      await page.waitForTimeout(1200);
    }
    const embedded = parseEmbeddedListings(siteKey, await page.content());
    if (embedded.length >= 3) return embedded;

    const cards = await page.evaluate(extractCardsInPage, site.detail);
    if (!cards.length) {
      throw new Error(`No listings found on ${site.label}. Check the search URL in the settings (open it in a browser: does it show apartment results?).`);
    }
    return {
      posts: cards.map((card) => ({
        id: `${siteKey}:${card.id}`,
        source: siteKey,
        externalId: card.id,
        url: card.url,
        text: card.text,
        images: card.images,
        hints: hintsFromCells(card.cells ?? []),
        sourceName: site.label,
        postedAt: null,
      })),
      errors: [],
    };
  } finally {
    await page.close().catch(() => {});
    await release();
  }
}

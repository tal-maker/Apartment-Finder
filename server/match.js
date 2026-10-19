// Decides whether a listing fits a saved search. Posts often leave things out, so a
// filter on a field the listing doesn't state passes by default and the field is
// reported in `unknown`; `strictUnknown` makes those listings fail instead.

export const FEATURES = ['mamad', 'parking', 'storage', 'elevator', 'balcony', 'furnished', 'pets'];

export const DEFAULT_FILTERS = {
  areas: [],
  neighborhoods: [],
  priceMin: null,
  priceMax: null,
  roomsMin: null,
  roomsMax: null,
  sizeMin: null,
  floorMin: null,
  floorMax: null,
  conditions: [],
  entryFrom: null,
  entryTo: null,
  features: {}, // { mamad: 'required' | 'excluded' | 'any' }
  broker: 'any', // any | no_broker | only_broker
  kinds: ['rent'],
  sources: [],
  includeKeywords: [],
  excludeKeywords: [],
  strictUnknown: false,
};

export function normalizeFilters(input = {}) {
  const f = { ...DEFAULT_FILTERS, ...input, features: { ...(input.features ?? {}) } };
  for (const key of ['priceMin', 'priceMax', 'roomsMin', 'roomsMax', 'sizeMin', 'floorMin', 'floorMax']) {
    const n = f[key] === '' || f[key] == null ? null : Number(f[key]);
    f[key] = Number.isFinite(n) ? n : null;
  }
  for (const key of ['areas', 'neighborhoods', 'conditions', 'kinds', 'sources', 'includeKeywords', 'excludeKeywords']) {
    if (typeof f[key] === 'string') f[key] = f[key].split(',');
    f[key] = (f[key] ?? []).map((s) => String(s).trim()).filter(Boolean);
  }
  return f;
}

export function matchListing(listing, rawFilters, { today = new Date() } = {}) {
  const f = normalizeFilters(rawFilters);
  const failed = [];
  const unknown = [];

  const check = (name, value, test) => {
    if (value == null) unknown.push(name);
    else if (!test(value)) failed.push(name);
  };

  if (listing.userStatus === 'hidden') failed.push('hidden');
  if (listing.city === 'other') failed.push('city');
  if (f.kinds.length && !f.kinds.includes(listing.kind)) failed.push('kind');
  if (f.sources.length && !f.sources.includes(listing.source)) failed.push('source');

  if (f.areas.length || f.neighborhoods.length) {
    const inArea = listing.area && f.areas.includes(listing.area);
    const inNeighborhood = listing.neighborhood && f.neighborhoods.includes(listing.neighborhood);
    if (!listing.area && !listing.neighborhood) unknown.push('area');
    else if (!inArea && !inNeighborhood) failed.push('area');
  }

  if (f.priceMin != null || f.priceMax != null) {
    check('price', listing.price, (p) => (f.priceMin == null || p >= f.priceMin) && (f.priceMax == null || p <= f.priceMax));
  }
  if (f.roomsMin != null || f.roomsMax != null) {
    check('rooms', listing.rooms, (r) => (f.roomsMin == null || r >= f.roomsMin) && (f.roomsMax == null || r <= f.roomsMax));
  }
  if (f.sizeMin != null) check('size', listing.sizeSqm, (s) => s >= f.sizeMin);
  if (f.floorMin != null || f.floorMax != null) {
    check('floor', listing.floor, (fl) => (f.floorMin == null || fl >= f.floorMin) && (f.floorMax == null || fl <= f.floorMax));
  }
  if (f.conditions.length) check('condition', listing.condition, (c) => f.conditions.includes(c));

  if (f.entryFrom || f.entryTo) {
    check('entryDate', listing.entryDate, (d) => {
      const date = d === 'immediate' ? today.toISOString().slice(0, 10) : d;
      return (!f.entryFrom || date >= f.entryFrom) && (!f.entryTo || date <= f.entryTo);
    });
  }

  for (const feature of FEATURES) {
    const want = f.features[feature];
    if (want === 'required') check(feature, listing[feature], (v) => v === true);
    else if (want === 'excluded') check(feature, listing[feature], (v) => v === false);
  }

  if (f.broker === 'no_broker') check('broker', listing.broker, (b) => b === false);
  else if (f.broker === 'only_broker') check('broker', listing.broker, (b) => b === true);

  const haystack = `${listing.title ?? ''}\n${listing.text ?? ''}\n${listing.street ?? ''}`.toLowerCase();
  if (f.includeKeywords.length && !f.includeKeywords.some((k) => haystack.includes(k.toLowerCase()))) failed.push('keywords');
  if (f.excludeKeywords.some((k) => haystack.includes(k.toLowerCase()))) failed.push('excludeKeywords');

  if (f.strictUnknown && unknown.length) failed.push(...unknown.map((u) => `unknown:${u}`));
  return { match: failed.length === 0, failed, unknown };
}

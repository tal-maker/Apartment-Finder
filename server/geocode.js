// Puts listings on the map. Exact coordinates come from the source when it has them
// (Yad2, Madlan); otherwise the street address is looked up in OpenStreetMap's free
// geocoder (Nominatim, max 1 request/second, results cached), and posts with only a
// neighborhood or area get that area's approximate center.
import { config } from './config.js';
import { CENTROIDS, areaCentroid } from './neighborhoods.js';

// Tel Aviv-Yafo, with some margin.
const BOUNDS = { south: 32.02, north: 32.15, west: 34.73, east: 34.86 };
export const inTelAviv = (lat, lng) => lat >= BOUNDS.south && lat <= BOUNDS.north && lng >= BOUNDS.west && lng <= BOUNDS.east;

export function approximateLocation(listing) {
  const point = CENTROIDS[listing.neighborhood];
  if (point) return { lat: point[0], lng: point[1], geoPrecision: 'neighborhood' };
  const area = listing.area && areaCentroid(listing.area);
  if (area) return { lat: area[0], lng: area[1], geoPrecision: 'area' };
  return null;
}

export function geocodeQuery(listing) {
  if (!listing.street || listing.city === 'other') return null;
  return `${listing.street}${listing.houseNumber ? ` ${listing.houseNumber}` : ''}, תל אביב-יפו, ישראל`;
}

export function createGeocoder({ store, fetchImpl = (...args) => fetch(...args), enabled = config.geocode.enabled, delayMs = 1100, log = console }) {
  const queue = [];
  let working = false;

  async function lookup(query) {
    const cached = store.getGeocache(query);
    if (cached) return cached.lat == null ? null : cached;
    const url = new URL(config.geocode.url);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'il');
    url.searchParams.set('q', query);
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'apartment-finder/0.1 (personal apartment search tool)', 'Accept-Language': 'he' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`geocoder HTTP ${res.status}`);
    const [hit] = await res.json();
    const point = hit && inTelAviv(Number(hit.lat), Number(hit.lon)) ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    store.setGeocache(query, point);
    await new Promise((r) => setTimeout(r, delayMs));
    return point;
  }

  async function work() {
    if (working) return;
    working = true;
    try {
      while (queue.length) {
        const { id, query, exact } = queue.shift();
        try {
          const point = await lookup(query);
          if (point) store.setLocation(id, { ...point, geoPrecision: exact ? 'exact' : 'street' });
        } catch (err) {
          log.warn?.(`Geocoding "${query}" failed: ${err.message}`);
          break; // try the rest on the next scan
        }
      }
    } finally {
      working = false;
    }
  }

  return {
    // Gives each listing a location now (approximate if needed) and queues an
    // address lookup for the ones that name a street.
    locate(listings) {
      for (const listing of listings) {
        if (listing.lat != null && listing.geoPrecision !== 'neighborhood' && listing.geoPrecision !== 'area') continue;
        if (listing.lat == null) {
          const approx = approximateLocation(listing);
          if (approx) store.setLocation(listing.id, approx);
        }
        const query = enabled && geocodeQuery(listing);
        if (query && !queue.some((q) => q.id === listing.id)) queue.push({ id: listing.id, query, exact: Boolean(listing.houseNumber) });
      }
      return work();
    },
    pending: () => queue.length,
  };
}

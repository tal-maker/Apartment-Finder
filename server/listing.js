import { findNeighborhood } from './neighborhoods.js';
import { parseRentalText } from './parse/text.js';

// Turns a Facebook/Telegram post into a listing using the rule-based parser.
export function textPostToListing(post, { reference } = {}) {
  const parsed = parseRentalText(post.text, { reference: reference ?? (post.postedAt ? new Date(post.postedAt) : new Date()) });
  const firstLine = post.text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  return {
    id: post.id,
    source: post.source,
    externalId: post.externalId,
    url: post.url,
    title: firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine,
    text: post.text,
    ...parsed,
    images: post.images ?? [],
    author: post.author ?? null,
    sourceName: post.sourceName ?? post.source,
    postedAt: post.postedAt ?? null,
    raw: null,
  };
}

// Claude's extraction wins where it found a value; the regex result fills the rest.
export function mergeExtraction(listing, extracted) {
  if (!extracted) return listing;
  const merged = { ...listing };
  for (const [key, value] of Object.entries(extracted)) {
    if (key === 'isTelAviv' || key === 'neighborhood') continue;
    if (value != null) merged[key] = value;
  }
  if (extracted.neighborhood) {
    const location = findNeighborhood(extracted.neighborhood);
    if (location) {
      merged.neighborhood = location.neighborhood;
      merged.area = location.area;
    } else if (!merged.neighborhood) {
      merged.neighborhood = extracted.neighborhood;
    }
  }
  if (extracted.isTelAviv === false) merged.city = 'other';
  else if (extracted.isTelAviv === true) merged.city = 'תל אביב יפו';
  return merged;
}

// The same apartment is often posted on several sources. The fingerprint lets us
// send one alert per apartment instead of one per post.
export function fingerprint(listing) {
  const rooms = listing.rooms ?? '';
  if (listing.contact) return `phone:${listing.contact}:${rooms}`;
  if (listing.street && listing.price) {
    return `addr:${listing.street.replace(/\s+/g, '')}:${listing.houseNumber ?? ''}:${rooms}:${Math.round(listing.price / 100)}`;
  }
  if (listing.area && listing.price && listing.rooms && listing.sizeSqm) {
    return `approx:${listing.area}:${rooms}:${listing.sizeSqm}:${Math.round(listing.price / 100)}`;
  }
  return null;
}

export const SOURCE_LABELS = { yad2: 'יד2', facebook: 'פייסבוק', telegram: 'טלגרם', mock: 'דמו' };
export const CONDITION_LABELS = { new: 'חדשה', renovated: 'משופצת', good: 'במצב שמור', needs_renovation: 'דורשת שיפוץ' };
export const KIND_LABELS = { rent: 'השכרה', roommate: 'שותפים', sublet: 'סאבלט', seeking: 'מחפשים דירה', sale: 'מכירה', other: 'אחר' };

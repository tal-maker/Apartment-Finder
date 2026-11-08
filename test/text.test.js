import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRentalText } from '../server/parse/text.js';
import { findNeighborhood } from '../server/neighborhoods.js';

const reference = new Date('2026-10-19T00:00:00Z');
const parse = (text) => parseRentalText(text, { reference });

test('full Hebrew post', () => {
  const r = parse('להשכרה בפלורנטין! דירת 3 חדרים משופצת, 70 מ"ר, קומה 2 עם מעלית, ממ"ד, ללא חניה. מחיר: 6,800 ₪ כניסה ב-1.12. ללא תיווך 052-1234567');
  assert.equal(r.kind, 'rent');
  assert.equal(r.price, 6800);
  assert.equal(r.rooms, 3);
  assert.equal(r.sizeSqm, 70);
  assert.equal(r.floor, 2);
  assert.equal(r.area, 'south');
  assert.equal(r.condition, 'renovated');
  assert.equal(r.mamad, true);
  assert.equal(r.parking, false);
  assert.equal(r.elevator, true);
  assert.equal(r.broker, false);
  assert.equal(r.entryDate, '2026-12-01');
  assert.equal(r.contact, '0521234567');
});

test('prices in different formats, phone numbers ignored', () => {
  assert.equal(parse('2 חדרים 7.5k לחודש').price, 7500);
  assert.equal(parse('שכירות 5500, טלפון 0541234567').price, 5500);
  assert.equal(parse('דירה 4,200 ש"ח').price, 4200);
  assert.equal(parse('להתקשר 054-123-4567').price, null);
});

test('rooms variants', () => {
  assert.equal(parse('2.5 חד\' בבן יהודה').rooms, 2.5);
  assert.equal(parse('סטודיו בנווה צדק').rooms, 1);
  assert.equal(parse('שלושה חדרים מוארים').rooms, 3);
  assert.equal(parse('חדר וחצי חמוד').rooms, 1.5);
});

test('post kinds', () => {
  assert.equal(parse('מחפשת דירת 2 חדרים בצפון הישן עד 6000').kind, 'seeking');
  assert.equal(parse('מחפשים שותף/ה לדירת 4 חדרים בלב העיר, חדר 3200 ש"ח').kind, 'roommate');
  assert.equal(parse('סאבלט לחודשיים בפלורנטין 5000 ש"ח').kind, 'sublet');
});

test('entry dates', () => {
  assert.equal(parse('כניסה מיידית').entryDate, 'immediate');
  assert.equal(parse('כניסה בתחילת נובמבר').entryDate, '2026-11-01');
  assert.equal(parse('כניסה 15/1').entryDate, '2027-01-15');
  assert.equal(parse('פנויה מ-01.12.2026').entryDate, '2026-12-01');
});

test('street, broker and other cities', () => {
  const r = parse('2.5 חד\' ברחוב בן יהודה 120, הצפון הישן. תיווך');
  assert.equal(r.street, 'בן יהודה');
  assert.equal(r.houseNumber, 120);
  assert.equal(r.broker, true);
  assert.equal(parse('דירה בגבעתיים 3 חדרים 6000 ש"ח').city, 'other');
});

test('neighborhood lookup', () => {
  assert.equal(findNeighborhood('הצפון הישן החלק הדרומי').neighborhood, 'הצפון הישן - דרום');
  assert.equal(findNeighborhood('דירה ברמת אביב ג').area, 'ramat_aviv');
  assert.equal(findNeighborhood('בעג׳מי').area, 'jaffa');
  assert.equal(findNeighborhood('גבעתיים'), null);
});

test('negation only applies to the word right after it', () => {
  const r = parse('3 חדרים, ללא ממ"ד, חניה בטאבו, 6000 ש"ח');
  assert.equal(r.mamad, false);
  assert.equal(r.parking, true);
  assert.equal(parse('ללא חניה').parking, false);
  assert.equal(parse('אין אפשרות לחניה').parking, false);
});

test('sale posts and their prices', () => {
  assert.equal(parse('למכירה דירת 4 חדרים בפלורנטין 2,950,000 ₪').kind, 'sale');
  assert.equal(parse('למכירה דירת 4 חדרים בפלורנטין 2,950,000 ₪').price, null);
  assert.equal(parse('דירת 3 חדרים 3,200,000 ש"ח בלב העיר').kind, 'sale');
  assert.equal(parse('דירה 3 חד ברמת אביב 3.2 מיליון').kind, 'sale');
  assert.equal(parse('מוכרים את הדירה שלנו בנווה צדק, 4 חדרים').kind, 'sale');
  const rent = parse('להשכרה 2 חדרים, ריהוט למכירה, 6,000 ₪ לחודש');
  assert.equal(rent.kind, 'rent');
  assert.equal(rent.price, 6000);
});

test('rent is picked over other costs, sizes and years', () => {
  assert.equal(parse('3 חדרים, ארנונה 650 ₪, ועד 250, שכ"ד 7,200').price, 7200);
  assert.equal(parse('3 חדרים, פיקדון 15,000 ₪, מחיר 6,800').price, 6800);
  assert.equal(parse('4 חדרים 95 מ"ר בניין משנת 2015, 9500 ש"ח').price, 9500);
  assert.equal(parse('דירה 4 חד׳ ב-₪8,900').price, 8900);
  assert.equal(parse('2 חדרים בכרם התימנים, מחיר בפרטי').price, null);
  assert.equal(parse('דירה ברחוב 2015 קומה 3').price, null);
});

test('bare thousands-formatted price and street-only location', () => {
  const r = parse('3 חדרים בבזל ללא תיווך\nקומה 4 ללא מעלית, גג ענקי. דירה משופצת. מקלט בבניין. 11,000.\nמוכרים חלק מהציוד שלנו');
  assert.equal(r.kind, 'rent');
  assert.equal(r.price, 11000);
  assert.equal(r.area, 'old_north');
  assert.equal(r.city, 'תל אביב יפו');
  assert.equal(parse('דירה ברחוב ויטל 3 חדרים 6,500').area, 'south');
  assert.equal(parse('3 חדרים בבלפור, פיקדון 20,000').price, null);
  assert.equal(parse('2 חדרים ברמת גן ברחוב ביאליק 5,000 ₪').city, 'other');
  assert.equal(parse('דירה בשבזי, נווה צדק 9,000 ש"ח').neighborhood, 'נווה צדק');
});

test('long streets are placed by house number', () => {
  assert.equal(parse('להשכרה 3 חדרים ברחוב אמיל זולא 12, 8,500 ₪').area, 'old_north');
  assert.equal(parse('דירת 2.5 חדרים בהירקון 180, 9,000 ש"ח').area, 'old_north');
  assert.equal(parse('דירת 3 חדרים ברחוב הירקון 40 מול הים 9,500 ₪').area, 'center');
  assert.equal(parse('דירה בהירקון, 3 חדרים 9,500 ₪').area, null);
  assert.equal(parse('דירה בהירקון 3 חדרים 9,500 ₪').area, null);
  assert.equal(parse('דירה בארלוזורוב 150, 3 חדרים 9,000 ₪').area, 'new_north');
  assert.equal(parse('דירה באבן גבירול 160 3 חדרים 9,500 ₪').area, 'new_north');
  assert.equal(parse('דירה באבן גבירול 100 3 חדרים 9,500 ₪').area, null);
});

// Fake sources for development (MOCK_SOURCES=1): a few fixed listings plus one new
// post per scan, so you can watch matching and alerts work without scraping.
const STREETS = ['דיזנגוף', 'בן יהודה', 'אבן גבירול', 'הירקון', 'פרישמן', 'גורדון', 'שינקין', 'פלורנטין', 'ויטל', 'יהודה הלוי'];
const PLACES = ['הצפון הישן', 'לב העיר', 'פלורנטין', 'כרם התימנים', 'נווה צדק', 'רמת אביב', 'יד אליהו', 'הצפון החדש'];

let counter = 0;

function randomPost() {
  counter++;
  const rooms = [1.5, 2, 2.5, 3, 3.5, 4][counter % 6];
  const price = 4500 + ((counter * 731) % 7000);
  const street = STREETS[counter % STREETS.length];
  const place = PLACES[counter % PLACES.length];
  const extras = [counter % 2 ? 'ממ"ד' : 'ללא ממ"ד', counter % 3 ? 'חניה בטאבו' : 'ללא חניה', counter % 4 === 0 ? 'מחסן' : '', counter % 5 ? 'משופצת' : 'דורשת שיפוץ קל']
    .filter(Boolean)
    .join(', ');
  return `להשכרה ב${place}! ${rooms} חדרים ברחוב ${street} ${10 + counter}, ${55 + rooms * 10} מ"ר, קומה ${counter % 5}. ${extras}. ${price.toLocaleString('en-US')} ₪ לחודש. כניסה ב-1.${[11, 12, 1][counter % 3]}. ${counter % 2 ? 'ללא תיווך' : 'תיווך'}`;
}

export function mockYad2() {
  return [
    {
      id: 'yad2:mock-1', source: 'yad2', externalId: 'mock-1', url: 'https://www.yad2.co.il/realestate/item/mock-1',
      title: 'דירה, בן יהודה 120, הצפון הישן - צפון', text: '', kind: 'rent', price: 7800, rooms: 3, sizeSqm: 75, floor: 3,
      neighborhood: 'הצפון הישן - צפון', area: 'old_north', city: 'תל אביב יפו', street: 'בן יהודה', houseNumber: 120,
      entryDate: '2026-12-01', condition: 'renovated', mamad: true, parking: false, storage: true, elevator: true, balcony: true,
      furnished: false, pets: null, broker: false, images: [], sourceName: 'יד2', postedAt: null,
    },
    {
      id: 'yad2:mock-2', source: 'yad2', externalId: 'mock-2', url: 'https://www.yad2.co.il/realestate/item/mock-2',
      title: 'דירה, פלורנטין 8, פלורנטין', text: '', kind: 'rent', price: 6200, rooms: 2, sizeSqm: 50, floor: 1,
      neighborhood: 'פלורנטין', area: 'south', city: 'תל אביב יפו', street: 'פלורנטין', houseNumber: 8,
      entryDate: 'immediate', condition: 'good', mamad: false, parking: false, storage: false, elevator: false, balcony: true,
      furnished: true, pets: true, broker: true, images: [], sourceName: 'יד2', postedAt: null,
    },
  ];
}

export function mockTextPosts() {
  const text = randomPost();
  const id = `mock-${Date.now()}`;
  return [{ id: `telegram:${id}`, source: 'telegram', externalId: id, url: 'https://t.me/s/example', text, postedAt: new Date().toISOString(), images: [], sourceName: 'טלגרם · דמו' }];
}

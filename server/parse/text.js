// Rule-based extraction of rental details from free Hebrew text (Facebook and
// Telegram posts, Yad2 descriptions). Every field is null when the text doesn't say.
import { findNeighborhood, mentionsOtherCity, normalizeHebrew } from '../neighborhoods.js';

const NEG = '(?:ללא|בלי|אין|לא כולל|לא כוללת|אין אפשרות ל|ללא אפשרות ל)';

const HEBREW_NUMBERS = {
  'אחד': 1, 'אחת': 1, 'שני': 2, 'שתי': 2, 'שניים': 2, 'שלושה': 3, 'שלוש': 3, 'ארבעה': 4, 'ארבע': 4,
  'חמישה': 5, 'חמש': 5, 'שישה': 6, 'שש': 6,
};

const MONTHS = {
  'ינואר': 1, 'פברואר': 2, 'מרץ': 3, 'מרס': 3, 'אפריל': 4, 'מאי': 5, 'יוני': 6, 'יולי': 7,
  'אוגוסט': 8, 'ספטמבר': 9, 'אוקטובר': 10, 'נובמבר': 11, 'דצמבר': 12,
};

const PHONE_RE = /(?:\+?972[-\s]?|0)(?:5\d|[2-489]|7\d)[-\s]?\d{3}[-\s]?\d{4}/g;

function flag(text, positive, { negativeExtra } = {}) {
  const pos = new RegExp(positive);
  if (!pos.test(text)) return null;
  const neg = new RegExp(`${NEG}\\s*(?:[^\\s,.;!]+\\s+)?(?:${positive})`);
  if (neg.test(text)) return false;
  if (negativeExtra && new RegExp(negativeExtra).test(text)) return false;
  return true;
}

function toNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[,\s]/g, '');
  let mult = 1;
  if (/[kK]$|אלף$/.test(s)) {
    mult = 1000;
    s = s.replace(/([kK]|אלף)$/, '');
  }
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n * mult : null;
}

export function extractPrice(text) {
  const t = text.replace(PHONE_RE, ' ');
  const patterns = [
    /(?:מחיר|שכירות|שכ"ד|שכ״ד|שכר דירה|מבקשים|מבקש|עלות)[^\d\n]{0,15}(\d{1,2}[,.]?\d{3}|\d{1,2}(?:\.\d)?\s?(?:k|K|אלף))/,
    /(\d{1,2}[,.]?\d{3}|\d{1,2}(?:\.\d)?\s?(?:k|K|אלף))\s*(?:₪|ש"ח|ש״ח|שח|שקל|nis|NIS)/,
    /(?:₪|ש"ח|ש״ח)\s*(\d{1,2}[,.]?\d{3})/,
    /(\d{1,2}[,.]?\d{3}|\d{1,2}(?:\.\d)?\s?(?:k|K|אלף))\s*(?:לחודש|בחודש|לח'|לחו')/,
    /(?:^|\s)(\d{1,2}(?:\.\d)?[kK])(?=\s|$|[,.!])/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    let n = toNumber(m[1].replace(/\.(?=\d{3}\b)/, ''));
    if (n != null && n < 100) n *= 1000; // "6.5k" already handled; "6.5 אלף" too
    if (n != null && n >= 1500 && n <= 60000) return Math.round(n);
  }
  return null;
}

export function extractRooms(text) {
  if (/סטודיו|יחידת דיור|יח"ד|יח״ד|חדר אחד|דירת חדר\b/.test(text)) {
    if (!/\d(?:\.\d)?\s*(?:חדרים|חד')/.test(text)) return 1;
  }
  if (/חדר וחצי/.test(text)) return 1.5;
  let m = text.match(/(\d(?:[.,]5)?)\s*(?:חדרים|חד'|חד׳|חד\b|ח'|rooms?)/);
  if (m) return Number.parseFloat(m[1].replace(',', '.'));
  m = text.match(/(\d)\s*(?:ו?חצי)\s*(?:חדרים|חד')/);
  if (m) return Number(m[1]) + 0.5;
  m = text.match(/(אחד|אחת|שני|שתי|שניים|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש)\s*(?:וחצי\s*)?חדרים/);
  if (m) return HEBREW_NUMBERS[m[1]] + (/וחצי\s*חדרים/.test(m[0]) ? 0.5 : 0);
  m = text.match(/דירת\s*(\d(?:\.5)?)\b/);
  if (m) return Number.parseFloat(m[1]);
  return null;
}

export function extractSize(text) {
  const m = text.match(/(\d{2,3})\s*(?:מ"ר|מ״ר|מטר|מ'|מר\b|sqm|m2)/);
  const n = m ? Number(m[1]) : null;
  return n && n >= 15 && n <= 400 ? n : null;
}

export function extractFloor(text) {
  if (/קומת קרקע|קומה קרקע|בקומת הקרקע/.test(text)) return 0;
  const m = text.match(/קומה\s*(\d{1,2})/) || text.match(/(\d{1,2})\s*(?:קומה|בקומה)/);
  return m ? Number(m[1]) : null;
}

export function extractCondition(text) {
  if (/חדשה מקבלן|חדש מקבלן|בניין חדש|בנין חדש|בנייה חדשה|בניה חדשה|פרויקט חדש|לא גרו בה/.test(text)) return 'new';
  if (/דורשת שיפוץ|צריכה שיפוץ|דרוש שיפוץ|טעונה שיפוץ|לשיפוץ\b/.test(text)) return 'needs_renovation';
  if (/משופצ|שופצה|שיפוץ מלא|לאחר שיפוץ|אחרי שיפוץ|שיפוץ יסודי|שיפוץ אדריכלי|מחודשת|renovated/.test(text)) return 'renovated';
  if (/שמורה|מצב טוב|מצב מצוין|מצב מעולה|מתוחזקת/.test(text)) return 'good';
  return null;
}

function nextDate(month, day, reference) {
  const year = reference.getUTCFullYear();
  let date = new Date(Date.UTC(year, month - 1, day));
  // Dates more than two months in the past are assumed to be next year.
  if (date.getTime() < reference.getTime() - 60 * 86400000) date = new Date(Date.UTC(year + 1, month - 1, day));
  return date.toISOString().slice(0, 10);
}

export function extractEntryDate(text, reference = new Date()) {
  if (/כניסה\s*(?:מ?י?ידית|מיידי|מידי|מיד|באופן מיידי)|כניסה:\s*מיידית|פנויה\s*(?:מיד|כבר עכשיו)|זמינה מיד/.test(text)) {
    return 'immediate';
  }
  const ctx = text.match(/(?:כניסה|פנויה|זמינה|מתפנה|החל מ|מתאריך)[^\n]{0,40}/);
  if (!ctx) return null;
  const s = ctx[0];
  let m = s.match(/(\d{1,2})[./-](\d{1,2})(?:[./-](\d{2,4}))?/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      if (m[3]) {
        const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
      }
      return nextDate(month, day, reference);
    }
  }
  const monthName = Object.keys(MONTHS).find((name) => s.includes(name));
  if (monthName) {
    const month = MONTHS[monthName];
    let day = 1;
    if (/אמצע/.test(s)) day = 15;
    if (/סוף/.test(s)) day = 28;
    const dayMatch = s.match(new RegExp(`(\\d{1,2})\\s*(?:ב|ל)?${monthName}`));
    if (dayMatch) day = Number(dayMatch[1]);
    return nextDate(month, day, reference);
  }
  return null;
}

export function extractBroker(text) {
  if (/ללא תיווך|בלי תיווך|לא תיווך|ללא דמי תיווך|ללא עמלת תיווך|ללא מתווכים|בלי מתווכים|מבעלים|מבעל הדירה|ישירות מהבעלים|ישירות מבעל|פרטי בלבד|no broker|no agents/i.test(text)) return false;
  if (/תיווך|מתווך|מתווכת|דמי תיווך|עמלת תיווך|נדל"ן|נדל״ן|realty|re\/max|רימקס|אנגלו סכסון|broker/i.test(text)) return true;
  return null;
}

export function extractKind(text) {
  const head = text.slice(0, 160);
  if (/(?:^|\s)(?:מחפש|מחפשת|מחפשים|מחפשות|דרושה|דרוש)\s+(?:דירה|דירת|יחידת|סטודיו|חדר)|looking for an? (?:apartment|room|flat)/i.test(head)) return 'seeking';
  if (/למכירה|דירה למכירה|for sale/i.test(head)) return 'sale';
  if (/סאבלט|סבלט|sublet|תת השכרה|לתקופה קצרה|לחודש-חודשיים/i.test(text)) return 'sublet';
  if (/מחפש(?:ת|ים|ות)?\s+שות(?:ף|פה|פים|פות)|שותף לדירה|שותפה לדירה|חדר בדירת שותפים|מחליף|מחליפה|roommate|flatmate/i.test(text)) return 'roommate';
  return null;
}

const STREET_PREFIX = `(?:ברחוב|ברח'|ברח׳|רחוב|רח'|רח׳)`;

export function extractStreet(text) {
  let m = text.match(new RegExp(`${STREET_PREFIX}\\s+([א-ת"׳'\\-]+(?:\\s[א-ת"׳'\\-]+){0,2}?)\\s+(\\d{1,3})\\b`));
  if (!m) m = text.match(new RegExp(`${STREET_PREFIX}\\s+([א-ת"׳'\\-]+(?:\\s[א-ת"׳'\\-]+)?)`));
  if (!m) return { street: null, houseNumber: null };
  const street = m[1].trim().replace(/\s+(?:ב|פינת|ליד)\S*$/, '');
  return { street: street || null, houseNumber: m[2] ? Number(m[2]) : null };
}

export function extractPhone(text) {
  const m = text.match(PHONE_RE);
  return m ? m[0].replace(/[\s-]/g, '') : null;
}

export function parseRentalText(text, { reference = new Date() } = {}) {
  const raw = String(text ?? '');
  const t = raw.replace(/‏|‎/g, '');
  const location = findNeighborhood(t);
  const { street, houseNumber } = extractStreet(t);
  const price = extractPrice(t);
  const rooms = extractRooms(t);
  let kind = extractKind(t);
  if (!kind) kind = price != null || rooms != null ? 'rent' : 'other';

  return {
    kind,
    price,
    rooms,
    sizeSqm: extractSize(t),
    floor: extractFloor(t),
    neighborhood: location?.neighborhood ?? null,
    area: location?.area ?? null,
    city: location ? 'תל אביב יפו' : mentionsOtherCity(t) ? 'other' : null,
    street,
    houseNumber,
    entryDate: extractEntryDate(t, reference),
    condition: extractCondition(t),
    mamad: flag(t, 'ממ"ד|ממ״ד|ממד\\b|מרחב מוגן|חדר ביטחון|חדר בטחון'),
    parking: flag(t, 'חני(?:י)?ה|חניית|מקום חניה|parking', { negativeExtra: 'חני(?:י)?ה (?:ברחוב|בכחול לבן|ציבורית)' }),
    storage: flag(t, 'מחסן'),
    elevator: flag(t, 'מעלית'),
    balcony: flag(t, 'מרפסת|גזוזטרה'),
    furnished: flag(t, 'מרוהטת|מרוהט|ריהוט מלא|כולל ריהוט|furnished', { negativeExtra: 'לא מרוהטת|ללא ריהוט' }),
    pets: flag(t, 'חיות מחמד|בעלי חיים|בע"ח|ידידותית לכלבים|כלבים|עם כלב|חתולים|pet friendly|pets'),
    broker: extractBroker(t),
    contact: extractPhone(t),
  };
}

export { normalizeHebrew };

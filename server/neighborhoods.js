// Tel Aviv-Yafo areas and their neighborhoods. Aliases are matched as substrings of
// normalized text, so they cover both Yad2's official names ("הצפון הישן החלק
// הצפוני") and how people write in Facebook/Telegram posts ("בצפון הישן").

export const AREAS = [
  {
    id: 'old_north',
    name: 'הצפון הישן',
    neighborhoods: [
      { name: 'הצפון הישן - צפון', aliases: ['הצפון הישן החלק הצפוני', 'הצפון הישן צפון'] },
      { name: 'הצפון הישן - דרום', aliases: ['הצפון הישן החלק הדרומי', 'הצפון הישן דרום'] },
      { name: 'הצפון הישן', aliases: ['הצפון הישן', 'צפון הישן', 'צפון ישן', 'נמל תל אביב', 'כיכר רבין', 'גן העיר'] },
    ],
  },
  {
    id: 'new_north',
    name: 'הצפון החדש',
    neighborhoods: [
      { name: 'הצפון החדש - צפון', aliases: ['הצפון החדש החלק הצפוני', 'הצפון החדש צפון'] },
      { name: 'הצפון החדש - דרום', aliases: ['הצפון החדש החלק הדרומי', 'הצפון החדש דרום'] },
      { name: 'כיכר המדינה', aliases: ['כיכר המדינה', 'ככר המדינה', 'הצפון החדש סביבת כיכר המדינה'] },
      { name: 'הצפון החדש', aliases: ['הצפון החדש', 'צפון החדש', 'צפון חדש'] },
      { name: 'בבלי', aliases: ['בבלי', 'שיכון בבלי'] },
    ],
  },
  {
    id: 'center',
    name: 'לב העיר ומרכז',
    neighborhoods: [
      { name: 'לב העיר', aliases: ['לב העיר', 'לב תל אביב', 'לב תא', 'מרכז העיר', 'מרכז תל אביב', 'רוטשילד', 'שינקין', 'שוק הכרמל', 'כיכר דיזנגוף', 'אלנבי'] },
      { name: 'כרם התימנים', aliases: ['כרם התימנים', 'הכרם'] },
      { name: 'נווה צדק', aliases: ['נווה צדק', 'נוה צדק'] },
      { name: 'מונטיפיורי', aliases: ['מונטיפיורי', 'מונטיפיורי'] },
      { name: 'הקריה ושרונה', aliases: ['שרונה', 'הקריה'] },
    ],
  },
  {
    id: 'south',
    name: 'דרום העיר',
    neighborhoods: [
      { name: 'פלורנטין', aliases: ['פלורנטין'] },
      { name: 'נווה שאנן', aliases: ['נווה שאנן', 'נוה שאנן', 'התחנה המרכזית'] },
      { name: 'שפירא', aliases: ['שפירא'] },
      { name: 'קריית שלום', aliases: ['קריית שלום', 'קרית שלום'] },
      { name: 'התקווה', aliases: ['שכונת התקווה', 'התקווה', 'התקוה'] },
      { name: 'נווה עופר / תל כביר', aliases: ['נווה עופר', 'תל כביר'] },
    ],
  },
  {
    id: 'jaffa',
    name: 'יפו',
    neighborhoods: [
      { name: 'יפו העתיקה ונמל יפו', aliases: ['יפו העתיקה', 'נמל יפו'] },
      { name: 'עג׳מי', aliases: ['עגמי', 'גבעת עלייה', 'גבעת עליה'] },
      { name: 'צפון יפו', aliases: ['צפון יפו', 'שוק הפשפשים', 'שדרות ירושלים'] },
      { name: 'יפו ג׳ / ד׳', aliases: ['יפו ג', 'יפו ד', 'צהלון', 'דקר', 'יפו'] },
    ],
  },
  {
    id: 'east',
    name: 'מזרח העיר',
    neighborhoods: [
      { name: 'יד אליהו', aliases: ['יד אליהו'] },
      { name: 'נחלת יצחק', aliases: ['נחלת יצחק'] },
      { name: 'ביצרון ורמת ישראל', aliases: ['ביצרון', 'רמת ישראל'] },
      { name: 'תל חיים', aliases: ['תל חיים'] },
      { name: 'ניר אביב', aliases: ['ניר אביב'] },
      { name: 'עזרא והארגזים', aliases: ['שכונת עזרא', 'הארגזים'] },
      { name: 'כפר שלם', aliases: ['כפר שלם', 'נווה ברבור', 'נווה צהל'] },
    ],
  },
  {
    id: 'ramat_aviv',
    name: 'רמת אביב והסביבה',
    neighborhoods: [
      { name: 'רמת אביב', aliases: ['רמת אביב'] },
      { name: 'רמת אביב ג׳', aliases: ['רמת אביב ג'] },
      { name: 'רמת אביב החדשה', aliases: ['רמת אביב החדשה'] },
      { name: 'נווה אביבים', aliases: ['נווה אביבים', 'נוה אביבים'] },
      { name: 'אפקה', aliases: ['אפקה', 'נאות אפקה'] },
      { name: 'הגוש הגדול', aliases: ['הגוש הגדול'] },
      { name: 'תל ברוך', aliases: ['תל ברוך'] },
      { name: 'כוכב הצפון', aliases: ['כוכב הצפון'] },
      { name: 'המשתלה', aliases: ['המשתלה'] },
      { name: 'שיכון למד', aliases: ['תוכנית ל', 'תכנית ל', 'שיכון למד', 'נופי ים', 'מעוז אביב', 'אזורי חן'] },
    ],
  },
  {
    id: 'north_east',
    name: 'צפון מזרח',
    neighborhoods: [
      { name: 'רמת החייל', aliases: ['רמת החייל', 'רמת החיל'] },
      { name: 'הדר יוסף', aliases: ['הדר יוסף'] },
      { name: 'צהלה', aliases: ['צהלה', 'גני צהלה'] },
      { name: 'שיכון דן', aliases: ['שיכון דן'] },
      { name: 'נווה שרת', aliases: ['נווה שרת', 'נוה שרת'] },
      { name: 'קריית שאול', aliases: ['קריית שאול', 'קרית שאול'] },
      { name: 'רביבים', aliases: ['רביבים'] },
    ],
  },
];

// Streets that lie (almost) entirely inside one area, for posts that name the street
// but not the neighborhood ("3 חדרים בבזל"). Long streets that cross several areas
// (דיזנגוף, בן יהודה, אבן גבירול, הירקון...) are left out on purpose.
export const STREETS = {
  old_north: ['אמיל זולא', 'שפינוזה', 'בלוך', 'חובבי ציון', 'ארנון', 'בזל', 'נורדאו', 'שדרות נורדאו', 'ירמיהו', 'זבוטינסקי', 'אוסישקין', 'יהושע בן נון', 'ארנון', 'שלמה המלך', 'דוד המלך', 'מאנה', 'סמטת שלוה', 'ישעיהו', 'ברנדייס הישן'],
  new_north: ['יהודה המכבי', 'פנקס', 'ברנדייס', 'ויצמן', 'בני דן', 'ליסין', 'שטרן', 'פיכמן', 'נמיר מרדכי'],
  center: ['אחד העם', 'נחלת בנימין', 'מזאה', 'בלפור', 'יהודה הלוי', 'המלך גורג', 'קינג גורג', 'בוגרשוב', 'טשרניחובסקי', 'ביאליק', 'ברנר', 'מאפו', 'יוסף אליהו', 'נחמני', 'לילינבלום', 'הכובשים', 'פרישמן', 'גורדון', 'מלצט', 'שבזי', 'רוקח', 'שד חן', 'שדרות חן', 'שדרות רוטשילד', 'קלישר', 'בצלאל יפה'],
  south: ['ויטל', 'אברבנאל', 'וולפסון', 'מטלון', 'קומפרט', 'הקישון', 'לוינסקי', 'צלנוב', 'הגדוד העברי', 'ראש פינה', 'פלורנטין', 'שוקן', 'אליפלט'],
  jaffa: ['יפת', 'יהודה הימית', 'שבטי ישראל', 'רזיאל', 'עולי ציון', 'שדרות ירושלים', 'הדולפין', 'קדם', 'יהודה מרגוזה', 'מרגוזה', 'ארליך'],
  ramat_aviv: ['איינשטיין', 'אינשטיין', 'ברודצקי', 'חיים לבנון', 'טאגור', 'אחימאיר', 'אופנהיימר', 'קהילת סלוניקי', 'משה סנה', 'בית"ר', 'רפידים', 'מבצע קדש'],
  east: ['לה גוארדיה', 'לגוארדיה', 'יצחק שדה', 'משה דיין', 'ההגנה', 'בית אל'],
  north_east: ['ראול ולנברג', 'הברזל', 'דבורה הנביאה', 'קהילת ציון'],
};

// Approximate center of each neighborhood [lat, lng], for listings whose exact
// address is unknown. Accurate to a few hundred meters; the map marks them as approximate.
export const CENTROIDS = {
  'הצפון הישן - צפון': [32.0905, 34.7745], 'הצפון הישן - דרום': [32.0832, 34.7735], 'הצפון הישן': [32.0870, 34.7742],
  'הצפון החדש - צפון': [32.0958, 34.7850], 'הצפון החדש - דרום': [32.0890, 34.7860], 'כיכר המדינה': [32.0870, 34.7895],
  'הצפון החדש': [32.0920, 34.7862], 'בבלי': [32.0978, 34.7955],
  'לב העיר': [32.0700, 34.7740], 'כרם התימנים': [32.0680, 34.7665], 'נווה צדק': [32.0612, 34.7650],
  'מונטיפיורי': [32.0660, 34.7810], 'הקריה ושרונה': [32.0730, 34.7860],
  'פלורנטין': [32.0565, 34.7700], 'נווה שאנן': [32.0560, 34.7780], 'שפירא': [32.0500, 34.7740],
  'קריית שלום': [32.0400, 34.7820], 'התקווה': [32.0530, 34.7930], 'נווה עופר / תל כביר': [32.0420, 34.7620],
  'יפו העתיקה ונמל יפו': [32.0535, 34.7520], 'עג׳מי': [32.0470, 34.7510], 'צפון יפו': [32.0520, 34.7600],
  'יפו ג׳ / ד׳': [32.0400, 34.7600],
  'יד אליהו': [32.0600, 34.7960], 'נחלת יצחק': [32.0680, 34.7970], 'ביצרון ורמת ישראל': [32.0640, 34.8030],
  'תל חיים': [32.0560, 34.8060], 'ניר אביב': [32.0590, 34.8010], 'עזרא והארגזים': [32.0470, 34.7940],
  'כפר שלם': [32.0480, 34.8050],
  'רמת אביב': [32.1130, 34.7980], 'רמת אביב ג׳': [32.1260, 34.8000], 'רמת אביב החדשה': [32.1180, 34.7880],
  'נווה אביבים': [32.1180, 34.8050], 'אפקה': [32.1100, 34.8150], 'הגוש הגדול': [32.1160, 34.7930],
  'תל ברוך': [32.1250, 34.8070], 'כוכב הצפון': [32.1080, 34.7850], 'המשתלה': [32.1210, 34.8180],
  'שיכון למד': [32.1060, 34.7920],
  'רמת החייל': [32.1100, 34.8380], 'הדר יוסף': [32.1030, 34.8280], 'צהלה': [32.1110, 34.8250],
  'שיכון דן': [32.1020, 34.8180], 'נווה שרת': [32.1170, 34.8300], 'קריית שאול': [32.1160, 34.8330],
  'רביבים': [32.0990, 34.8250],
};

export function areaCentroid(areaId) {
  const area = AREAS.find((a) => a.id === areaId);
  const points = (area?.neighborhoods ?? []).map((n) => CENTROIDS[n.name]).filter(Boolean);
  if (!points.length) return null;
  return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
}

export const OTHER_CITIES = [
  'רמת גן', 'גבעתיים', 'בת ים', 'חולון', 'בני ברק', 'הרצליה', 'רמת השרון', 'פתח תקווה', 'פתח תקוה',
  'ראשון לציון', 'ירושלים', 'חיפה', 'קריית אונו', 'קרית אונו', 'אור יהודה', 'גבעת שמואל', 'רעננה', 'כפר סבא',
];

export function normalizeHebrew(text) {
  return ` ${String(text ?? '')
    .replace(/[֑-ׇ]/g, '') // niqqud
    .replace(/["'`׳״]/g, '')
    .replace(/[-–—_/\\|,.;:!?()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

const INDEX = AREAS.flatMap((area) =>
  area.neighborhoods.flatMap((n) =>
    n.aliases.map((alias) => ({ alias: normalizeHebrew(alias), neighborhood: n.name, area: area.id })),
  ),
).sort((a, b) => b.alias.length - a.alias.length);

// Matches only on word boundaries; a leading ב/ל/מ/ה/ו prefix is allowed ("בפלורנטין").
function containsAlias(normalized, alias) {
  const core = alias.trim();
  if (normalized.includes(` ${core} `)) return true;
  for (const prefix of ['ב', 'ל', 'מ', 'ו', 'וב', 'ש', 'שב']) {
    if (normalized.includes(` ${prefix}${core} `)) return true;
  }
  return false;
}

export function findNeighborhood(text) {
  const normalized = normalizeHebrew(text);
  for (const entry of INDEX) {
    if (containsAlias(normalized, entry.alias)) return { neighborhood: entry.neighborhood, area: entry.area };
  }
  return null;
}

// Long streets that cross areas: the house number decides. Each entry is
// [first number of the stretch, area], in order. Without a number they stay unknown.
// Stretches are approximate, but the borders between them are not near the new north.
export const STREET_RANGES = {
  'הירקון': [[1, 'center'], [100, 'old_north']],
  'בן יהודה': [[1, 'center'], [70, 'old_north']],
  'דיזנגוף': [[1, 'center'], [100, 'old_north']],
  'ארלוזורוב': [[1, 'old_north'], [100, 'new_north']],
  'אבן גבירול': [[1, 'center'], [150, 'new_north']],
};

function areaByRange(text) {
  // Punctuation is kept here, so "בהירקון, 3 חדרים" doesn't read as house number 3.
  const spaced = ` ${String(text).replace(/[\u0591-\u05C7"'`׳״]/g, '').replace(/([,.;:!?()\n])/g, ' $1 ').replace(/\s+/g, ' ')} `;
  for (const [street, ranges] of Object.entries(STREET_RANGES)) {
    const name = normalizeHebrew(street).trim();
    const m = spaced.match(new RegExp(` (?:ב|ל|ו|מ|ש|רחוב |רח |ברחוב |ברח )?${name} (\\d{1,3}) (?!חד|קומה|קומות|מר |מטר)`));
    if (!m) continue;
    const n = Number(m[1]);
    // A number between the stretches above (e.g. אבן גבירול 60-149, where one side is
    // the old north and the other the new) stays unknown.
    if (street === 'אבן גבירול' && n >= 60 && n < 150) return null;
    const area = ranges.filter(([from]) => n >= from).at(-1)?.[1];
    if (area) return { neighborhood: null, area };
  }
  return null;
}

const STREET_INDEX = Object.entries(STREETS)
  .flatMap(([area, streets]) => streets.map((street) => ({ alias: normalizeHebrew(street), area })))
  .sort((a, b) => b.alias.length - a.alias.length);

// Only used when no neighborhood is named. Returns the area; the neighborhood is left empty.
export function findAreaByStreet(text) {
  const normalized = normalizeHebrew(text);
  const ranged = areaByRange(text);
  if (ranged) return ranged;
  for (const entry of STREET_INDEX) {
    if (containsAlias(normalized, entry.alias) || normalized.includes(` רחוב ${entry.alias.trim()} `) || normalized.includes(` רח ${entry.alias.trim()} `)) {
      return { neighborhood: null, area: entry.area };
    }
  }
  return null;
}

export function mentionsOtherCity(text) {
  const normalized = normalizeHebrew(text);
  return OTHER_CITIES.some((city) => containsAlias(normalized, normalizeHebrew(city)));
}

export function areaName(id) {
  return AREAS.find((a) => a.id === id)?.name ?? id;
}

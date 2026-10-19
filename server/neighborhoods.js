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

export function mentionsOtherCity(text) {
  const normalized = normalizeHebrew(text);
  return OTHER_CITIES.some((city) => containsAlias(normalized, normalizeHebrew(city)));
}

export function areaName(id) {
  return AREAS.find((a) => a.id === id)?.name ?? id;
}

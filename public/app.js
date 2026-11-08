const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const FEATURE_LABELS = { mamad: 'ממ"ד', shelter: 'מקלט', parking: 'חניה', storage: 'מחסן', elevator: 'מעלית', balcony: 'מרפסת', aircon: 'מזגן', furnished: 'מרוהטת', pets: 'חיות מחמד' };
const CONDITION_LABELS = { new: 'חדשה', renovated: 'משופצת', good: 'במצב שמור', needs_renovation: 'דורשת שיפוץ' };
const KIND_LABELS = { rent: 'דירה להשכרה', roommate: 'שותפים', sublet: 'סאבלט', seeking: 'מחפשים דירה', sale: 'מכירה', other: 'אחר' };
const SOURCE_LABELS = { yad2: 'יד2', madlan: 'מדלן', komo: 'קומו', homeless: 'הומלס', facebook: 'פייסבוק', telegram: 'טלגרם' };
const SOURCE_COLORS = { yad2: '#e8590c', madlan: '#7048e8', komo: '#2f9e44', homeless: '#c2255c', facebook: '#1877f2', telegram: '#229ed9' };
const VIEW_KEY = 'apartment-finder:view';
const PROVIDER_LABELS = { telegram: 'בוט טלגרם', callmebot: 'וואטסאפ · CallMeBot', twilio: 'וואטסאפ · Twilio', meta: 'וואטסאפ · Meta', console: 'הדפסה ללוג' };
const UNKNOWN_LABELS = { ...FEATURE_LABELS, price: 'מחיר', rooms: 'חדרים', area: 'מיקום', size: 'גודל', floor: 'קומה', condition: 'מצב', entryDate: 'כניסה', broker: 'תיווך' };
const STORAGE_KEY = 'apartment-finder:filters';

let meta = null;
let searches = [];

// ---------- helpers
async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
    body: options.body && typeof options.body !== 'string' ? JSON.stringify(options.body) : options.body,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = `show${isError ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.className = ''), 3500);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtPrice = (n) => (n ? `${Number(n).toLocaleString('he-IL')} ₪` : 'מחיר לא צוין');
const fmtDate = (d) => (d === 'immediate' ? 'מיידית' : d ? d.split('-').reverse().join('/') : null);

function timeAgo(iso) {
  if (!iso) return '';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'עכשיו';
  if (minutes < 60) return `לפני ${minutes} ד׳`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `לפני ${hours} ש׳`;
  return `לפני ${Math.round(hours / 24)} ימים`;
}

// ---------- filter form (used in the listings sidebar and the search dialog)
function renderFilterForm(root, filters = {}) {
  const f = { areas: [], neighborhoods: [], conditions: [], kinds: ['rent'], sources: [], features: {}, broker: 'any', ...filters };
  const checked = (list, value) => (list?.includes(value) ? 'checked' : '');
  const val = (v) => (v == null ? '' : esc(v));

  root.innerHTML = `
    <details open class="group"><summary>אזורים ושכונות</summary>
      <div class="areas">
        ${meta.areas
          .map(
            (area) => `
          <div class="area">
            <label class="area-label"><input type="checkbox" name="areas" value="${area.id}" ${checked(f.areas, area.id)}> ${esc(area.name)}</label>
            <details class="hoods"><summary>שכונות</summary>
              <div class="hoods-list">
                ${area.neighborhoods.map((n) => `<label><input type="checkbox" name="neighborhoods" value="${esc(n.name)}" ${checked(f.neighborhoods, n.name)}> ${esc(n.name)}</label>`).join('')}
              </div>
            </details>
          </div>`,
          )
          .join('')}
      </div>
      <p class="hint">בלי סימון = כל העיר. סימון אזור כולל את כל השכונות שבו.</p>
      <label class="inline"><input type="checkbox" name="includeUnknownLocation" ${f.includeUnknownLocation ? 'checked' : ''}> כולל מודעות שהמיקום שלהן לא זוהה</label>
    </details>

    <details open class="group"><summary>מחיר, חדרים וגודל</summary>
      <div class="pair"><label>מחיר מ־<input type="number" name="priceMin" step="100" min="0" value="${val(f.priceMin)}"></label>
        <label>עד <input type="number" name="priceMax" step="100" min="0" value="${val(f.priceMax)}"></label></div>
      <label class="inline"><input type="checkbox" name="includeNoPrice" ${f.includeNoPrice ? 'checked' : ''}> כולל מודעות שלא מציינות מחיר</label>
      <div class="pair"><label>חדרים מ־<input type="number" name="roomsMin" step="0.5" min="1" value="${val(f.roomsMin)}"></label>
        <label>עד <input type="number" name="roomsMax" step="0.5" min="1" value="${val(f.roomsMax)}"></label></div>
      <div class="pair"><label>גודל מינ׳ (מ״ר) <input type="number" name="sizeMin" min="0" value="${val(f.sizeMin)}"></label>
        <label>קומה מ־<input type="number" name="floorMin" min="0" value="${val(f.floorMin)}"></label></div>
      <div class="pair"><label>קומה עד <input type="number" name="floorMax" min="0" value="${val(f.floorMax)}"></label><span></span></div>
    </details>

    <details open class="group"><summary>מצב הדירה וכניסה</summary>
      <div class="chips">
        ${Object.entries(CONDITION_LABELS).map(([k, label]) => `<label class="chip"><input type="checkbox" name="conditions" value="${k}" ${checked(f.conditions, k)}> ${label}</label>`).join('')}
      </div>
      <div class="pair"><label>כניסה מתאריך <input type="date" name="entryFrom" value="${val(f.entryFrom)}"></label>
        <label>עד תאריך <input type="date" name="entryTo" value="${val(f.entryTo)}"></label></div>
    </details>

    <details open class="group"><summary>מאפיינים</summary>
      <div class="features">
        ${meta.features
          .map((k) => {
            const v = f.features?.[k] ?? 'any';
            return `<label>${FEATURE_LABELS[k]}
              <select name="feature:${k}">
                <option value="any" ${v === 'any' ? 'selected' : ''}>לא משנה</option>
                <option value="required" ${v === 'required' ? 'selected' : ''}>חובה</option>
                <option value="excluded" ${v === 'excluded' ? 'selected' : ''}>בלי</option>
              </select></label>`;
          })
          .join('')}
        <label>תיווך
          <select name="broker">
            <option value="any" ${f.broker === 'any' ? 'selected' : ''}>לא משנה</option>
            <option value="no_broker" ${f.broker === 'no_broker' ? 'selected' : ''}>ללא תיווך בלבד</option>
            <option value="only_broker" ${f.broker === 'only_broker' ? 'selected' : ''}>תיווך בלבד</option>
          </select></label>
      </div>
    </details>

    <details class="group"><summary>סוג מודעה, מקורות ומילות מפתח</summary>
      <div class="chips">
        ${['rent', 'roommate', 'sublet'].map((k) => `<label class="chip"><input type="checkbox" name="kinds" value="${k}" ${checked(f.kinds, k)}> ${KIND_LABELS[k]}</label>`).join('')}
      </div>
      <div class="chips">
        ${Object.entries(SOURCE_LABELS).map(([k, label]) => `<label class="chip"><input type="checkbox" name="sources" value="${k}" ${checked(f.sources, k)}> ${label}</label>`).join('')}
      </div>
      <p class="hint">בלי סימון מקור = כל המקורות.</p>
      <label class="block">חייב לכלול אחת מהמילים (מופרדות בפסיק)<input name="includeKeywords" value="${val(f.includeKeywords?.join(', '))}" placeholder="גינה, גג"></label>
      <label class="block">לא לכלול (מופרדות בפסיק)<input name="excludeKeywords" value="${val(f.excludeKeywords?.join(', '))}" placeholder="מרתף, חצי קומה"></label>
    </details>

    <label class="strict"><input type="checkbox" name="strictUnknown" ${f.strictUnknown ? 'checked' : ''}>
      הצג רק מודעות שמציינות במפורש את כל מה שסיננתי
      <span class="hint">(בלי הסימון, מודעה שלא מציינת למשל חניה עדיין תופיע, עם סימן ❔)</span></label>
  `;
}

function readFilterForm(root) {
  const all = (name) => $$(`[name="${name}"]:checked`, root).map((i) => i.value);
  const num = (name) => {
    const v = $(`[name="${name}"]`, root).value;
    return v === '' ? null : Number(v);
  };
  const words = (name) => $(`[name="${name}"]`, root).value.split(',').map((s) => s.trim()).filter(Boolean);
  const features = {};
  for (const k of meta.features) {
    const v = $(`[name="feature:${k}"]`, root).value;
    if (v !== 'any') features[k] = v;
  }
  return {
    areas: all('areas'),
    neighborhoods: all('neighborhoods'),
    priceMin: num('priceMin'),
    priceMax: num('priceMax'),
    includeNoPrice: $('[name="includeNoPrice"]', root).checked,
    includeUnknownLocation: $('[name="includeUnknownLocation"]', root).checked,
    roomsMin: num('roomsMin'),
    roomsMax: num('roomsMax'),
    sizeMin: num('sizeMin'),
    floorMin: num('floorMin'),
    floorMax: num('floorMax'),
    conditions: all('conditions'),
    entryFrom: $('[name="entryFrom"]', root).value || null,
    entryTo: $('[name="entryTo"]', root).value || null,
    features,
    broker: $('[name="broker"]', root).value,
    kinds: all('kinds'),
    sources: all('sources'),
    includeKeywords: words('includeKeywords'),
    excludeKeywords: words('excludeKeywords'),
    strictUnknown: $('[name="strictUnknown"]', root).checked,
  };
}

// ---------- listings
function listingCard(l) {
  const areaLabel = l.neighborhood ?? meta.areas.find((a) => a.id === l.area)?.name;
  const place = [l.street && `${l.street}${l.houseNumber ? ` ${l.houseNumber}` : ''}`, areaLabel].filter(Boolean).join(', ');
  const facts = [
    l.rooms && `${l.rooms} חד׳`,
    l.sizeSqm && `${l.sizeSqm} מ״ר`,
    l.floor != null && `קומה ${l.floor}`,
    l.condition && CONDITION_LABELS[l.condition],
    l.entryDate && `כניסה ${fmtDate(l.entryDate)}`,
    l.broker != null && (l.broker ? 'תיווך' : 'ללא תיווך'),
    l.kind && l.kind !== 'rent' && KIND_LABELS[l.kind],
  ].filter(Boolean);
  const features = Object.entries(FEATURE_LABELS)
    .filter(([k]) => l[k] != null)
    .map(([k, label]) => `<span class="feat ${l[k] ? 'yes' : 'no'}">${l[k] ? '✓' : '✗'} ${label}</span>`)
    .join('');
  const unknown = (l.unknown ?? []).filter((u) => UNKNOWN_LABELS[u]);
  const snippet = l.source !== 'yad2' && l.text ? esc(l.text.length > 260 ? `${l.text.slice(0, 257)}…` : l.text) : '';
  const image = l.images?.[0] ? `<img class="thumb" src="${esc(l.images[0])}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '';

  return `
    <article class="card ${l.userStatus === 'favorite' ? 'fav' : ''}" data-id="${esc(l.id)}">
      ${image}
      <div class="card-body">
        <div class="card-top">
          <span class="price">${fmtPrice(l.price)}</span>
          <span class="badge src-${l.source}">${esc(l.sourceName ?? SOURCE_LABELS[l.source] ?? l.source)}</span>
        </div>
        <h3>${esc(place || l.title || 'ללא כתובת')}</h3>
        <p class="facts">${facts.map(esc).join(' · ')}</p>
        <div class="feats">${features}</div>
        ${unknown.length ? `<p class="unknown">❔ לא צוין: ${unknown.map((u) => UNKNOWN_LABELS[u]).join(', ')}</p>` : ''}
        ${snippet ? `<p class="snippet">${snippet}</p>` : ''}
        ${l.contact ? `<p class="contact">📞 <a href="tel:${esc(l.contact)}">${esc(l.contact)}</a></p>` : ''}
        <div class="card-actions">
          <a class="btn small primary" href="${esc(l.url)}" target="_blank" rel="noopener">למודעה ↗</a>
          <button class="btn small ghost" data-action="favorite">${l.userStatus === 'favorite' ? '★ במועדפים' : '☆ מועדף'}</button>
          <button class="btn small ghost" data-action="hide">${l.userStatus === 'hidden' ? 'החזר' : 'הסתר'}</button>
          <span class="muted when">${timeAgo(l.firstSeenAt)}</span>
        </div>
      </div>
    </article>`;
}

let currentFilters = loadSavedFilters();

function loadSavedFilters() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
}

async function loadListings() {
  const view = $('#view-select').value;
  const params = new URLSearchParams({ sort: $('#sort-select').value });
  if (view.startsWith('search:')) params.set('searchId', view.slice(7));
  else {
    params.set('filters', JSON.stringify(currentFilters));
    if (view !== 'all') params.set('status', view);
  }
  const container = $('#listings');
  try {
    const { total, items } = await api(`/api/listings?${params}`);
    lastItems = items;
    $('#results-count').textContent = `${total} דירות`;
    if (currentView === 'map') renderMap(items);
    container.innerHTML = items.length
      ? items.map(listingCard).join('')
      : `<div class="empty">אין עדיין דירות שמתאימות. ${meta.lastRuns.length ? 'נסו להרחיב את הסינון.' : 'הסריקה הראשונה רצה ברקע – זה לוקח דקה או שתיים.'}</div>`;
  } catch (err) {
    container.innerHTML = `<div class="empty error">שגיאה בטעינה: ${esc(err.message)}</div>`;
  }
}

// ---------- map
let lastItems = [];
let currentView = (() => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'map' ? 'map' : 'list';
  } catch {
    return 'list';
  }
})();
let map = null;
let markers = null;
let fittedFor = '';

function setView(view) {
  currentView = view;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {}
  $$('.view-toggle button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  $('#listings').hidden = view === 'map';
  $('#map-wrap').hidden = view !== 'map';
  if (view === 'map') renderMap(lastItems);
}
$$('.view-toggle button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// Approximate points share a neighborhood center; spread them a little so each can be clicked.
function jitter(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return [((h & 0xffff) / 0xffff - 0.5) * 0.004, (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.004];
}

function popupHtml(l) {
  const areaLabel = l.neighborhood ?? meta.areas.find((a) => a.id === l.area)?.name;
  const place = [l.street && `${l.street}${l.houseNumber ? ` ${l.houseNumber}` : ''}`, areaLabel].filter(Boolean).join(', ');
  const facts = [l.rooms && `${l.rooms} חד׳`, l.sizeSqm && `${l.sizeSqm} מ״ר`, l.floor != null && `קומה ${l.floor}`].filter(Boolean).join(' · ');
  const approx = l.geoPrecision === 'neighborhood' || l.geoPrecision === 'area';
  return `<div class="popup" dir="rtl">
    <strong>${fmtPrice(l.price)}</strong> <span class="muted">· ${esc(l.sourceName ?? SOURCE_LABELS[l.source] ?? l.source)}</span>
    <div>${esc(place || l.title || '')}</div>
    ${facts ? `<div class="muted">${esc(facts)}</div>` : ''}
    ${approx ? '<div class="muted">📍 מיקום משוער</div>' : ''}
    <a href="${esc(l.url)}" target="_blank" rel="noopener">למודעה ↗</a>
  </div>`;
}

function renderMap(items) {
  if (!window.L) {
    $('#map').textContent = 'טעינת המפה נכשלה.';
    return;
  }
  if (!map) {
    map = L.map('map', { center: [32.08, 34.785], zoom: 13 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);
    markers = L.layerGroup().addTo(map);
  }
  requestAnimationFrame(() => map.invalidateSize());
  markers.clearLayers();
  const points = [];
  let missing = 0;
  for (const l of items) {
    if (l.lat == null || l.lng == null) {
      missing++;
      continue;
    }
    const approx = l.geoPrecision === 'neighborhood' || l.geoPrecision === 'area';
    const [dLat, dLng] = approx ? jitter(l.id) : [0, 0];
    const latlng = [l.lat + dLat, l.lng + dLng];
    const color = SOURCE_COLORS[l.source] ?? '#555';
    L.circleMarker(latlng, approx
      ? { radius: 9, color, weight: 1.5, dashArray: '3 3', fillColor: color, fillOpacity: 0.2 }
      : { radius: 7, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.95 })
      .bindPopup(popupHtml(l))
      .addTo(markers);
    points.push(latlng);
  }
  const sources = [...new Set(items.filter((l) => l.lat != null).map((l) => l.source))];
  $('#map-sources').innerHTML = sources
    .map((src) => `<span class="dot" style="background:${SOURCE_COLORS[src] ?? '#555'}"></span>${esc(SOURCE_LABELS[src] ?? src)}`)
    .join(' ');
  $('#map-missing').textContent = missing ? ` · ${missing} מודעות בלי מיקום לא מוצגות` : '';
  // Re-fit only when the result set changes, not on every refresh.
  const key = items.map((l) => l.id).join(',');
  if (points.length && key !== fittedFor) {
    map.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
    fittedFor = key;
  }
}

$('#listings').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.card');
  const fav = card.classList.contains('fav');
  const action = button.dataset.action;
  const hidden = button.textContent.trim() === 'החזר';
  const status = action === 'favorite' ? (fav ? null : 'favorite') : hidden ? null : 'hidden';
  await api(`/api/listings/${encodeURIComponent(card.dataset.id)}/status`, { method: 'POST', body: { status } });
  loadListings();
});

$('#apply-filters').addEventListener('click', () => {
  currentFilters = readFilterForm($('#listing-filters'));
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentFilters));
  } catch {}
  if ($('#view-select').value.startsWith('search:')) $('#view-select').value = 'all';
  loadListings();
  if (matchMedia('(max-width: 900px)').matches) $('.filters-panel').classList.add('collapsed');
});
$('#reset-filters').addEventListener('click', () => {
  currentFilters = {};
  renderFilterForm($('#listing-filters'), currentFilters);
});
$('#save-search').addEventListener('click', () => openSearchDialog(null, readFilterForm($('#listing-filters'))));
$('#toggle-filters').addEventListener('click', () => $('.filters-panel').classList.toggle('collapsed'));
$('#view-select').addEventListener('change', loadListings);
$('#sort-select').addEventListener('change', loadListings);

// ---------- saved searches
function describeFilters(f) {
  const parts = [];
  const areaNames = f.areas?.map((id) => meta.areas.find((a) => a.id === id)?.name ?? id) ?? [];
  if (areaNames.length || f.neighborhoods?.length) parts.push([...areaNames, ...f.neighborhoods].join(', '));
  if (f.priceMin || f.priceMax) parts.push(`${f.priceMin ? fmtPrice(f.priceMin) : ''}–${f.priceMax ? fmtPrice(f.priceMax) : ''}`);
  if (f.includeNoPrice) parts.push('כולל בלי מחיר');
  if (f.includeUnknownLocation && (f.areas?.length || f.neighborhoods?.length)) parts.push('כולל מיקום לא ידוע');
  if (f.roomsMin || f.roomsMax) parts.push(`${f.roomsMin ?? ''}–${f.roomsMax ?? ''} חד׳`);
  if (f.sizeMin) parts.push(`מ־${f.sizeMin} מ״ר`);
  if (f.conditions?.length) parts.push(f.conditions.map((c) => CONDITION_LABELS[c]).join('/'));
  if (f.entryFrom || f.entryTo) parts.push(`כניסה ${fmtDate(f.entryFrom) ?? ''}–${fmtDate(f.entryTo) ?? ''}`);
  for (const [k, v] of Object.entries(f.features ?? {})) parts.push(`${v === 'required' ? 'עם' : 'בלי'} ${FEATURE_LABELS[k]}`);
  if (f.broker === 'no_broker') parts.push('ללא תיווך');
  if (f.broker === 'only_broker') parts.push('תיווך בלבד');
  if (f.strictUnknown) parts.push('קפדני');
  return parts.join(' · ') || 'כל הדירות';
}

async function loadSearches() {
  searches = await api('/api/searches');
  const select = $('#view-select');
  $$('option[value^="search:"]', select).forEach((o) => o.remove());
  for (const s of searches) select.insertAdjacentHTML('beforeend', `<option value="search:${s.id}">🔔 ${esc(s.name)}</option>`);

  $('#searches').innerHTML = searches.length
    ? searches
        .map(
          (s) => `
      <div class="search-row ${s.active ? '' : 'inactive'}" data-id="${s.id}">
        <div class="search-main">
          <h3>${esc(s.name)} <span class="badge">${s.matchCount} התאמות</span></h3>
          <p class="muted">${esc(describeFilters(s.filters))}</p>
        </div>
        <div class="search-controls">
          <label><input type="checkbox" data-toggle="active" ${s.active ? 'checked' : ''}> פעיל</label>
          <label><input type="checkbox" data-toggle="notify" ${s.notify ? 'checked' : ''}> התראות</label>
          <button class="btn small" data-action="matches">הצג התאמות</button>
          <button class="btn small" data-action="edit">עריכה</button>
          <button class="btn small" data-action="test">שלח הודעת בדיקה</button>
          <button class="btn small danger" data-action="delete">מחק</button>
        </div>
      </div>`,
        )
        .join('')
    : '<div class="empty">אין עדיין חיפושים שמורים. הגדירו סינון בלשונית "דירות" ולחצו "שמור כחיפוש עם התראות", או צרו חיפוש חדש כאן.</div>';
}

$('#searches').addEventListener('change', async (e) => {
  const toggle = e.target.closest('[data-toggle]');
  if (!toggle) return;
  const id = toggle.closest('.search-row').dataset.id;
  await api(`/api/searches/${id}`, { method: 'PUT', body: { [toggle.dataset.toggle]: toggle.checked } });
  loadSearches();
});

$('#searches').addEventListener('click', async (e) => {
  const button = e.target.closest('button[data-action]');
  if (!button) return;
  const id = Number(button.closest('.search-row').dataset.id);
  const search = searches.find((s) => s.id === id);
  try {
    if (button.dataset.action === 'edit') openSearchDialog(search);
    if (button.dataset.action === 'matches') {
      $('#view-select').value = `search:${id}`;
      showTab('listings');
      loadListings();
    }
    if (button.dataset.action === 'test') {
      await api(`/api/searches/${id}/test`, { method: 'POST' });
      toast('הודעת בדיקה נשלחה ✅');
    }
    if (button.dataset.action === 'delete' && confirm(`למחוק את "${search.name}"?`)) {
      await api(`/api/searches/${id}`, { method: 'DELETE' });
      loadSearches();
    }
  } catch (err) {
    toast(err.message, true);
  }
});

let editingId = null;
function openSearchDialog(search, filters) {
  editingId = search?.id ?? null;
  const form = $('#search-dialog-form');
  $('#search-dialog-title').textContent = search ? 'עריכת חיפוש' : 'חיפוש חדש';
  form.name.value = search?.name ?? '';
  form.notify.checked = search?.notify ?? true;
  form.active.checked = search?.active ?? true;
  renderFilterForm($('#search-dialog-filters'), search?.filters ?? filters ?? {});
  $('#search-dialog').showModal();
}

$('#search-dialog').addEventListener('close', async () => {
  if ($('#search-dialog').returnValue !== 'save') return;
  const form = $('#search-dialog-form');
  const body = { name: form.name.value, notify: form.notify.checked, active: form.active.checked, filters: readFilterForm($('#search-dialog-filters')) };
  try {
    if (editingId) await api(`/api/searches/${editingId}`, { method: 'PUT', body });
    else await api('/api/searches', { method: 'POST', body });
    toast('החיפוש נשמר ✅');
    await loadSearches();
    showTab('searches');
  } catch (err) {
    toast(err.message, true);
  }
});
$('#new-search').addEventListener('click', () => openSearchDialog(null, {}));

// ---------- sources & status
async function loadSources() {
  const s = await api('/api/settings/sources');
  const form = $('#sources-form');
  form.yad2.checked = s.yad2.enabled;
  for (const key of Object.keys(meta.sites)) {
    form[`site-${key}`].checked = s[key]?.enabled ?? false;
    form[`site-url-${key}`].value = s[key]?.url ?? '';
  }
  form.telegram.checked = s.telegram.enabled;
  form.facebook.checked = s.facebook.enabled;
  form.telegramChats.value = s.telegram.chats.join('\n');
  form.facebookGroups.value = s.facebook.groups.join('\n');
}

$('#sources-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  try {
    await api('/api/settings/sources', {
      method: 'PUT',
      body: {
        yad2: { enabled: form.yad2.checked },
        ...Object.fromEntries(
          Object.keys(meta.sites).map((key) => [key, { enabled: form[`site-${key}`].checked, url: form[`site-url-${key}`].value }]),
        ),
        telegram: { enabled: form.telegram.checked, chats: form.telegramChats.value },
        facebook: { enabled: form.facebook.checked, groups: form.facebookGroups.value },
      },
    });
    toast('המקורות נשמרו. ייסרקו בסריקה הבאה.');
  } catch (err) {
    toast(err.message, true);
  }
});

function renderStatus() {
  $('#telegram-mode').textContent =
    meta.telegram.mode === 'mtproto'
      ? '✅ מחובר עם חשבון טלגרם – אפשר להוסיף גם קבוצות פרטיות.'
      : 'ערוצים ציבוריים בלבד (דרך t.me/s). לקבוצות צריך חיבור חשבון – ראו README.';
  $('#facebook-mode').textContent = meta.facebook.loggedIn
    ? '✅ נמצא חיבור שמור לפייסבוק.'
    : '⚠️ אין חיבור לפייסבוק. הריצו npm run facebook:login (ראו README).';

  const items = [
    [meta.notify.configured, `התראות: ${meta.notify.configured ? `מוגדרות (${PROVIDER_LABELS[meta.notify.provider] ?? meta.notify.provider})` : 'לא מוגדרות – לא יישלחו הודעות'}`],
    [meta.llm.enabled, `ניתוח מודעות טקסט עם Claude: ${meta.llm.enabled ? 'פעיל' : 'כבוי (משתמש בזיהוי לפי ביטויים)'}`],
    [true, `סריקה כל ${meta.intervalMinutes} דקות${meta.mock ? ' · מצב דמו (MOCK_SOURCES)' : ''}`],
    ...meta.lastRuns.map((r) => [
      r.ok !== false,
      `${SOURCE_LABELS[r.source] ?? r.source}: ${r.ok == null ? 'נסרק עכשיו…' : r.ok ? `תקין, ${timeAgo(r.finishedAt)}` : `שגיאה – ${r.error}`}`,
    ]),
  ];
  $('#status-list').innerHTML = items.map(([ok, text]) => `<li class="${ok ? 'ok' : 'bad'}">${esc(text)}</li>`).join('');
  $$('.interval').forEach((el) => (el.textContent = meta.intervalMinutes));

  const info = meta.scanner.running ? 'סורק עכשיו…' : meta.scanner.lastScanAt ? `סריקה אחרונה ${timeAgo(meta.scanner.lastScanAt)}` : '';
  $('#scan-info').textContent = info;
}

async function loadRuns() {
  const runs = await api('/api/scans');
  $('#runs tbody').innerHTML = runs
    .map(
      (r) => `<tr class="${r.ok === false ? 'bad' : ''}"><td>${SOURCE_LABELS[r.source] ?? r.source}</td><td>${new Date(r.startedAt).toLocaleString('he-IL')}</td>
      <td>${r.found ?? ''}</td><td>${r.newCount ?? ''}</td><td class="err">${esc(r.ok == null ? 'נסרק עכשיו…' : r.error ?? '')}</td></tr>`,
    )
    .join('');
}

async function refreshMeta() {
  meta = await api('/api/meta');
  renderStatus();
}

$('#scan-now').addEventListener('click', async () => {
  const button = $('#scan-now');
  button.disabled = true;
  $('#scan-info').textContent = 'סורק עכשיו…';
  try {
    const result = await api('/api/scan', { method: 'POST' });
    toast(`הסריקה הסתיימה: ${result.newListings} מודעות חדשות, ${result.alerts} התראות`);
    await Promise.all([refreshMeta(), loadListings(), loadSearches(), loadRuns()]);
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
  }
});

// ---------- tabs
function showTab(name) {
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${name}`));
  if (name === 'sources') {
    loadSources();
    loadRuns();
    refreshMeta();
  }
}
$$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

function renderSiteSources() {
  $('#site-sources').innerHTML = Object.entries(meta.sites)
    .map(
      ([key, site]) => `
    <fieldset>
      <legend><label><input type="checkbox" name="site-${key}"> ${esc(site.label)}</label></legend>
      <label class="block">כתובת עמוד החיפוש
        <input name="site-url-${key}" type="url" dir="ltr" placeholder="${esc(site.defaultUrl)}">
      </label>
      <p class="muted">היכנסו ל${esc(site.label)}, סננו דירות להשכרה בתל אביב (ומחיר/חדרים אם רוצים), והדביקו כאן את הכתובת משורת הכתובת. בלי כתובת נסרק עמוד ברירת המחדל.</p>
    </fieldset>`,
    )
    .join('');
}

// ---------- start
if (matchMedia('(max-width: 900px)').matches) $('.filters-panel').classList.add('collapsed');
await refreshMeta();
renderSiteSources();
renderFilterForm($('#listing-filters'), currentFilters);
setView(currentView);
await loadSearches();
await loadListings();
setInterval(async () => {
  await refreshMeta();
  if ($('#tab-listings').classList.contains('active')) loadListings();
}, 60000);

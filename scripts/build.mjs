// Builds data/forecast.json for every location and copies the website into _site/.
// Locations: a published Google Sheet CSV (LOCATIONS_CSV_URL) or data/locations.json.
// Forecasts: Open-Meteo weather + air quality (free, CC BY 4.0), one batched request each.
import {readFile, writeFile, mkdir, cp, access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createSign} from 'node:crypto';
import {windowStats, goIndex, runScore, advice, band, aqiCategory, wbgtProxy, healthNotes} from './index-rules.mjs';
import {marineWindow, seaScore, poolScore} from './swim-rules.mjs';

const TZ = 'America/Jamaica';
const OUT = resolve(process.env.OUTPUT_DIR || '_site');
const WINDOWS = {am: {label: 'Morning', start: 4.5, end: 7}, pm: {label: 'Evening', start: 16.5, end: 18.5}};
// Territories (islands). All use UTC-5 all year for now (Jamaica and Cayman), so one time zone works.
const TERRITORIES = JSON.parse(await readFile('data/territories.json', 'utf8'));
const SWIM_WINDOWS = {am: {label: 'Morning', start: 5.5, end: 8}, pm: {label: 'Evening', start: 16.5, end: 18.5}};
const MARINE = ['wave_height', 'wave_period', 'wave_direction', 'swell_wave_height', 'swell_wave_period', 'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction'];
const DAYS = 7;
const MOCK = process.env.MOCK === '1';

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Same Google Sheet as Marine Weather Jamaica, read with the same service account (read only).
const SHEET_ID = process.env.SHEET_ID || '1JA-38rcUE6yudktWxqHf9ijZtlX9pfLYbDocLKQmHpA';
const SHEET_TAB = process.env.SHEET_TAB || 'exercise';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
async function sheetToken() {
  const cred = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  if (!cred.client_email || !cred.private_key) throw Error('service-account JSON is missing its email or private key');
  const now = Math.floor(Date.now() / 1000);
  const head = b64({alg: 'RS256', typ: 'JWT'}), body = b64({iss: cred.client_email, scope: 'https://www.googleapis.com/auth/spreadsheets.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3500});
  const signer = createSign('RSA-SHA256'); signer.update(head + '.' + body); signer.end();
  const res = await fetch('https://oauth2.googleapis.com/token', {method: 'POST', headers: {'content-type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + body + '.' + signer.sign(cred.private_key, 'base64url')}), signal: AbortSignal.timeout(20000)});
  if (!res.ok) throw Error(`Google sign-in failed (HTTP ${res.status})`);
  return (await res.json()).access_token;
}
function rowsToLocations(head, rows) {
  const col = Object.fromEntries(head.map((h, i) => [String(h).trim().toLowerCase(), i]));
  for (const k of ['name', 'lat', 'lon']) if (!(k in col)) throw Error(`the "${SHEET_TAB}" tab is missing a "${k}" column`);
  return rows.map(r => ({name: String(r[col.name] ?? '').trim(), lat: Number(r[col.lat]), lon: Number(r[col.lon]),
    area: col.area != null ? String(r[col.area] ?? '').trim() : '', sport: col.sport != null ? String(r[col.sport] ?? '').trim().toLowerCase() : 'both',
    key: col.key != null && r[col.key] ? slug(r[col.key]) : null,
    type: col.type != null ? String(r[col.type] ?? '').trim().toLowerCase() : '', facing: col.facing != null && String(r[col.facing] ?? '').trim() !== '' ? Number(r[col.facing]) : null,
    territory: col.territory != null ? String(r[col.territory] ?? '').trim().toUpperCase() : ''}));
}

async function loadLocations() {
  let list = [];
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !MOCK) {
    try {
      const token = await sheetToken();
      const auth = {headers: {authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(30000)};
      // Find the tab whatever its capitalisation or stray spaces.
      const meta = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SHEET_ID)}?fields=sheets.properties.title`, auth);
      if (!meta.ok) throw Error(`could not open the sheet (HTTP ${meta.status}): ${(await meta.text()).slice(0, 200)}`);
      const titles = ((await meta.json()).sheets || []).map(x => x.properties.title);
      const tab = titles.find(t => t.trim().toLowerCase() === SHEET_TAB.trim().toLowerCase());
      if (!tab) throw Error(`no tab named "${SHEET_TAB}". Tabs found: ${titles.join(', ')}`);
      const range = `'${tab.replace(/'/g, "''")}'!A1:G500`;
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SHEET_ID)}/values/${encodeURIComponent(range)}`, auth);
      if (!res.ok) throw Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const [head = [], ...rows] = (await res.json()).values || [];
      list = rowsToLocations(head, rows.filter(r => r.some(x => String(x).trim())));
      console.log(`LOCATIONS: ${list.length} rows from the "${SHEET_TAB}" tab`);
    } catch (e) { console.warn(`LOCATIONS: sheet tab unavailable (${e.message})`); }
  }
  const url = process.env.LOCATIONS_CSV_URL;
  if (!list.length && url && !MOCK) {
    try {
      const res = await fetch(url, {redirect: 'follow'});
      if (!res.ok) throw Error('HTTP ' + res.status);
      const [head, ...rows] = parseCsv(await res.text());
      const col = Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase(), i]));
      for (const k of ['name', 'lat', 'lon']) if (!(k in col)) throw Error(`sheet is missing a "${k}" column`);
      list = rows.map(r => ({name: r[col.name]?.trim(), lat: Number(r[col.lat]), lon: Number(r[col.lon]),
        area: col.area != null ? r[col.area]?.trim() : '', sport: col.sport != null ? (r[col.sport] || '').trim().toLowerCase() : 'both',
        key: col.key != null && r[col.key] ? slug(r[col.key]) : null,
        type: col.type != null ? (r[col.type] || '').trim().toLowerCase() : '', facing: col.facing != null && (r[col.facing] || '').trim() !== '' ? Number(r[col.facing]) : null,
        territory: col.territory != null ? (r[col.territory] || '').trim().toUpperCase() : ''}));
      console.log(`LOCATIONS: ${list.length} rows from the Google Sheet`);
    } catch (e) { console.warn(`LOCATIONS: sheet unavailable (${e.message}); using data/locations.json`); }
  }
  if (!list.length) list = JSON.parse(await readFile('data/locations.json', 'utf8'));
  // Starter places: for each island and mode (run & ride / swim) that has no rows in the sheet yet, use the
  // starter list (data/swim-spots.json for Jamaica swimming, data/cayman.json for Cayman). Sheet rows win.
  const group = l => `${String(l.territory || 'JM').toUpperCase()}:${String(l.sport || '').toLowerCase() === 'swim' ? 'swim' : 'land'}`;
  const inSheet = new Set(list.map(group));
  for (const file of ['data/swim-spots.json', ...Object.values(TERRITORIES).map(t => t.starter).filter(Boolean)]) {
    const starter = JSON.parse(await readFile(file, 'utf8')).filter(l => !inSheet.has(group(l)));
    if (starter.length) { console.log(`STARTER: ${starter.length} places from ${file} (${[...new Set(starter.map(group))].join(', ')})`); list = list.concat(starter); }
  }
  const seen = new Set();
  return list.filter(l => {
    if (!l.name || !Number.isFinite(l.lat) || !Number.isFinite(l.lon) || Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180) { console.warn('LOCATION SKIPPED (bad name or coordinates):', l.name); return false; }
    l.key = l.key || slug(l.name);
    if (!['run', 'cycle', 'both', 'swim'].includes(l.sport)) l.sport = 'both';
    l.territory = TERRITORIES[String(l.territory || '').toUpperCase()] ? String(l.territory).toUpperCase() : 'JM';
    if (l.sport === 'swim') {
      l.type = l.type === 'pool' ? 'pool' : 'sea';
      l.facing = Number.isFinite(Number(l.facing)) && l.facing !== null && l.facing !== '' ? ((Number(l.facing) % 360) + 360) % 360 : null;
      if (l.type === 'sea' && l.facing == null) console.warn('SWIM: no "facing" for', l.name, '- treating all wind as onshore');
    }
    if (seen.has(l.key)) { console.warn('LOCATION SKIPPED (duplicate):', l.name); return false; }
    seen.add(l.key); return true;
  });
}

async function getJson(url, label) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res.json();
      console.warn(`${label}: HTTP ${res.status} (attempt ${attempt})`);
      if (res.status === 400) throw Error(`${label} rejected the request: ${await res.text()}`);
    } catch (e) { if (attempt === 4 || /rejected/.test(e.message)) throw e; console.warn(`${label}: ${e.message} (attempt ${attempt})`); }
    await new Promise(r => setTimeout(r, 4000 * attempt));
  }
  throw Error(`${label}: no response after 4 attempts`);
}

const HOURLY = ['temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'apparent_temperature', 'precipitation_probability',
  'precipitation', 'weather_code', 'cloud_cover', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'uv_index', 'surface_pressure'];

async function fetchForecasts(locs, tz = TZ) {
  if (MOCK) { const {mockForecast, mockMarine} = await import('./mock.mjs'); return {...mockForecast(locs, DAYS), marine: mockMarine(locs, DAYS)}; }
  const lat = locs.map(l => l.lat.toFixed(4)).join(','), lon = locs.map(l => l.lon.toFixed(4)).join(',');
  const wx = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${HOURLY.join(',')}`
    + `&daily=sunrise,sunset&timezone=${encodeURIComponent(tz)}&forecast_days=${DAYS}&past_days=2&wind_speed_unit=kmh`, 'FORECAST');
  let aq = null;
  try {
    aq = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}`
      + `&hourly=pm2_5,ozone,dust,us_aqi,us_aqi_pm2_5,us_aqi_ozone&timezone=${encodeURIComponent(tz)}&forecast_days=5`, 'AIR QUALITY');
  } catch (e) { console.warn('AIR QUALITY unavailable:', e.message); }
  const arr = x => Array.isArray(x) ? x : [x];
  // Sea conditions for open-water swim spots (Open-Meteo Marine; cell_selection=sea picks the nearest sea cell).
  const marine = locs.map(() => null);
  const seaIdx = locs.map((l, i) => l.sport === 'swim' && l.type === 'sea' ? i : -1).filter(i => i >= 0);
  if (seaIdx.length) {
    try {
      const mlat = seaIdx.map(i => locs[i].lat.toFixed(4)).join(','), mlon = seaIdx.map(i => locs[i].lon.toFixed(4)).join(',');
      const m = arr(await getJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${mlat}&longitude=${mlon}&hourly=${MARINE.join(',')}`
        + `&timezone=${encodeURIComponent(tz)}&forecast_days=${DAYS}&cell_selection=sea`, 'MARINE'));
      seaIdx.forEach((li, k) => { marine[li] = m[k] || null; });
    } catch (e) { console.warn('MARINE unavailable:', e.message); }
  }
  return {wx: arr(wx), aq: aq ? arr(aq) : [], marine};
}

function aqWindow(a, day, start, end) {
  if (!a || !a.hourly) return {hasData: false};
  const h = a.hourly, idx = [];
  h.time.forEach((t, i) => { const hr = Number(t.slice(11, 13)); if (t.startsWith(day) && hr >= start && hr <= end) idx.push(i); });
  const mean = k => { const xs = idx.map(i => h[k]?.[i]).filter(x => x != null); return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null; };
  const aqi = mean('us_aqi');
  if (aqi == null) return {hasData: false};
  const pm = mean('us_aqi_pm2_5') ?? 0, o3 = mean('us_aqi_ozone') ?? 0;
  return {hasData: true, aqi: Math.round(aqi), driver: o3 > pm ? 'O3' : 'PM25', category: aqiCategory(Math.round(aqi)),
    pm25: mean('pm2_5') != null ? Math.round(mean('pm2_5') * 10) / 10 : null, ozone: mean('ozone') != null ? Math.round(mean('ozone') * 10) / 10 : null, dust: mean('dust') != null ? Math.round(mean('dust')) : null};
}

function hourlyForDay(h, day, mh) {
  const out = [];
  const mIdx = {}; if (mh && mh.time) mh.time.forEach((t, i) => { mIdx[t] = i; });
  h.time.forEach((t, i) => {
    const hr = Number(t.slice(11, 13));
    if (!t.startsWith(day) || hr < 4 || hr > 20) return;
    out.push({t: t.slice(11, 16), temp: h.temperature_2m[i], feels: h.apparent_temperature[i], rh: h.relative_humidity_2m[i],
      pop: h.precipitation_probability[i], mm: h.precipitation[i], wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i],
      dir: h.wind_direction_10m[i], uv: h.uv_index[i], code: h.weather_code[i],
      ...(mh && mIdx[t] != null ? {wave: mh.wave_height?.[mIdx[t]] ?? null, period: mh.wave_period?.[mIdx[t]] ?? null, sst: mh.sea_surface_temperature?.[mIdx[t]] ?? null} : {})});
  });
  return out;
}

// Rain in the 48 hours before a window starts (for open-water quality).
function rainBefore(h, day, startH) {
  const startMs = Date.parse(`${day}T${String(Math.floor(startH)).padStart(2, '0')}:00:00Z`);
  let mm = 0;
  h.time.forEach((t, i) => { const ms = Date.parse(t + ':00Z'); if (ms < startMs && ms >= startMs - 48 * 3600e3) mm += h.precipitation[i] ?? 0; });
  return mm;
}

function swimLocation(loc, w, mar, today) {
  const mh = mar && mar.hourly;
  if (loc.type === 'sea' && !mh) console.warn('NO SEA FORECAST for', loc.name);
  const days = (w.daily?.time || []).filter(d => d >= today).slice(0, DAYS).map(day => {
    const sunIdx = w.daily.time.indexOf(day);
    const entry = {date: day, sunrise: w.daily.sunrise?.[sunIdx]?.slice(11, 16) || null, sunset: w.daily.sunset?.[sunIdx]?.slice(11, 16) || null, windows: {}, hourly: hourlyForDay(w.hourly, day, mh)};
    for (const r of entry.hourly) {
      const hr = Number(r.t.slice(0, 2)), m1 = windowStats(w.hourly, day, hr, hr);
      if (!m1.hasData) continue;
      if (loc.type === 'pool') r.s = poolScore(m1).index;
      else { const sea1 = marineWindow(mh, day, hr, hr); if (sea1.hasData) r.s = seaScore(m1, sea1, rainBefore(w.hourly, day, hr), loc.facing).index; }
    }
    for (const [key, win] of Object.entries(SWIM_WINDOWS)) {
      const m = windowStats(w.hourly, day, win.start, win.end);
      if (loc.type === 'pool') {
        const sc = poolScore(m);
        entry.windows[key] = {label: win.label, metrics: m.hasData ? m : null, scores: {swim: sc}};
      } else {
        const sea = marineWindow(mh, day, win.start, win.end);
        const sc = seaScore(m, sea, rainBefore(w.hourly, day, win.start), loc.facing);
        entry.windows[key] = {label: win.label, metrics: m.hasData ? m : null, sea: sea.hasData ? sea : null, scores: {swim: sc}};
      }
    }
    return entry;
  });
  console.log(`${loc.name} (swim, ${loc.type}): ${days.map(d => `${d.date.slice(5)} AM ${d.windows.am.scores.swim.index} PM ${d.windows.pm.scores.swim.index}`).join(' | ')}`);
  return {key: loc.key, name: loc.name, area: loc.area || '', territory: loc.territory, sport: 'swim', type: loc.type, facing: loc.facing, lat: loc.lat, lon: loc.lon, days};
}

// One page per island. Jamaica is index.html; every other island gets <path>/index.html (e.g. cayman/),
// built from the same page with its own name, hero photo and colours (style.css [data-territory=..]).
async function islandPages() {
  const base = await readFile('site/index.html', 'utf8');
  const exists = async f => { try { await access(resolve('site', f)); return true; } catch { return false; } };
  const links = Object.entries(TERRITORIES).map(([code, t]) => ({code, t}));
  const other = code => links.filter(l => l.code !== code).map(l => `<a href="${l.t.path ? l.t.path + '/' : './'}">${l.t.name}</a>`).join(' · ');
  for (const {code, t} of links) {
    let html = base.replace(/<html lang="en"[^>]*>/, `<html lang="en" data-territory="${code}" data-tz="${t.tz}">`)
      .replace(/Jamaica We Outside/g, `${t.brand} We Outside`).replace(/around Jamaica/g, `around ${t.name}`)
      .replace('JAMAICA <i>WE</i> <b>OUTSIDE</b>', `${t.brand.toUpperCase()} <i>WE</i> <b>OUTSIDE</b>`)
      .replace('aria-label="Jamaica We Outside home"', `aria-label="${t.brand} We Outside home"`)
      .replace('<meta name="theme-color" content="#242428">', `<meta name="theme-color" content="${t.theme}">`)
      .replace(/assets\/flags\/jm\.svg/g, `assets/flags/${code.toLowerCase()}.svg`)
      .replace('<!--ISLANDS-->', `<p class="islands">Other islands: ${other(code)}</p>`);
    if (code !== 'JM' && await exists(t.hero)) {
      html = html.replace('src="assets/hero.jpg"', `src="${t.hero}"`)
        .replace('srcset="assets/hero-900.jpg 900w, assets/hero.jpg 1800w"', (await exists(t.hero900)) ? `srcset="${t.hero900} 900w, ${t.hero} 1800w"` : `srcset="${t.hero} 1800w"`)
        .replace(/alt="A cyclist in a helmet[^"]*"/, `alt="${t.heroAlt}"`);
    }
    if (!t.path) { await writeFile(resolve(OUT, 'index.html'), html); continue; }
    // Sub-folder page: <base> keeps assets/ and data/ pointing at the shared files one level up.
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<base href="../">').replace('class="brand" href="./"', `class="brand" href="${t.path}/"`);
    await mkdir(resolve(OUT, t.path), {recursive: true});
    await writeFile(resolve(OUT, t.path, 'index.html'), html);
    console.log(`PAGE ${t.path}/ for ${t.name}`);
  }
}

async function main() {
  const locs = await loadLocations();
  if (!locs.length) throw Error('No valid locations');
  // Islands can be in different time zones (Jamaica/Cayman UTC-5, Barbados/Trinidad UTC-4): fetch each zone separately
  // so every forecast is in local time.
  const tzOf = l => (TERRITORIES[l.territory] && TERRITORIES[l.territory].tz) || TZ;
  const wx = [], aq = [], marine = [];
  for (const tz of [...new Set(locs.map(tzOf))]) {
    const idx = locs.map((l, i) => tzOf(l) === tz ? i : -1).filter(i => i >= 0);
    const part = await fetchForecasts(idx.map(i => locs[i]), tz);
    idx.forEach((li, k) => { wx[li] = part.wx[k]; aq[li] = part.aq[k]; marine[li] = part.marine[k]; });
  }
  const todayIn = tz => new Intl.DateTimeFormat('en-CA', {timeZone: tz}).format(new Date());
  const result = {generatedAt: new Date().toISOString(), timezone: TZ, windows: WINDOWS,
    swimWindows: SWIM_WINDOWS, territories: TERRITORIES, source: 'Open-Meteo weather, marine and air quality (CC BY 4.0)', locations: []};
  locs.forEach((loc, li) => {
    const w = wx[li]; if (!w || !w.hourly) { console.warn('NO FORECAST for', loc.name); return; }
    const today = todayIn(tzOf(loc));
    if (loc.sport === 'swim') { result.locations.push(swimLocation(loc, w, marine[li], today)); return; }
    const days = (w.daily?.time || []).filter(d => d >= today).slice(0, DAYS).map((day, di) => {
      const sunIdx = w.daily.time.indexOf(day);
      const entry = {date: day, sunrise: w.daily.sunrise?.[sunIdx]?.slice(11, 16) || null, sunset: w.daily.sunset?.[sunIdx]?.slice(11, 16) || null, windows: {}, hourly: hourlyForDay(w.hourly, day)};
      // A score for every hour (4 AM–8 PM) for the hour-by-hour strip.
      for (const r of entry.hourly) {
        const hr = Number(r.t.slice(0, 2)), mh1 = windowStats(w.hourly, day, hr, hr);
        if (mh1.hasData) r.s = goIndex(mh1, aqWindow(aq[li], day, hr, hr), hr >= 12, 'mixed').index;
      }
      for (const [key, win] of Object.entries(WINDOWS)) {
        const m = windowStats(w.hourly, day, win.start, win.end);
        const air = aqWindow(aq[li], day, win.start, win.end);
        const isPm = key === 'pm';
        const scores = {};
        for (const sport of ['mixed', 'run', 'cycle']) {
          const g = goIndex(m, air, isPm, sport);
          scores[sport] = {index: g.index, band: band(g.index), reasons: g.reasons, advice: advice(g.index, !isPm, m)};
        }
        entry.windows[key] = {label: win.label, metrics: m.hasData ? {...m, wbgt: wbgtProxy(m.tempC, m.rh)} : null, air,
          runScore10: Math.round(runScore(m, air, isPm) / 10), scores, health: healthNotes(m, air)};
      }
      return entry;
    });
    result.locations.push({key: loc.key, name: loc.name, area: loc.area || '', territory: loc.territory, sport: loc.sport, lat: loc.lat, lon: loc.lon, days});
    console.log(`${loc.name}: ${days.map(d => `${d.date.slice(5)} AM ${d.windows.am.scores.mixed.index} PM ${d.windows.pm.scores.mixed.index}`).join(' | ')}`);
  });
  await mkdir(resolve(OUT, 'data'), {recursive: true});
  await cp('site', OUT, {recursive: true});
  await writeFile(resolve(OUT, 'data', 'forecast.json'), JSON.stringify(result));
  // One smaller file per island (each island page loads only its own), plus a tiny summary for the home page.
  const summary = {generatedAt: result.generatedAt, islands: []};
  for (const [code, t] of Object.entries(TERRITORIES)) {
    const locsT = result.locations.filter(l => (l.territory || 'JM') === code);
    await writeFile(resolve(OUT, 'data', code.toLowerCase() + '.json'), JSON.stringify({...result, locations: locsT}));
    const main = locsT.find(l => l.sport !== 'swim');
    const brief = s => s ? {index: s.index, band: s.band, advice: s.advice} : null;
    if (main) summary.islands.push({code, name: t.name, tz: t.tz, path: t.path, place: main.name,
      days: main.days.map(d => ({date: d.date, am: brief(d.windows.am?.scores?.mixed), pm: brief(d.windows.pm?.scores?.mixed)}))});
  }
  await writeFile(resolve(OUT, 'data', 'summary.json'), JSON.stringify(summary));
  // Place list for the lightning watch (Apps Script), so storm tracks are checked near every place on the site.
  await writeFile(resolve(OUT, 'data', 'places.json'), JSON.stringify({generatedAt: result.generatedAt,
    places: result.locations.map(l => ({t: l.territory || 'JM', name: l.name, sport: l.sport, lat: l.lat, lon: l.lon}))}));
  await islandPages();
  console.log(`WROTE ${resolve(OUT, 'data', 'forecast.json')} (${result.locations.length} locations)`);
}

main().catch(e => { console.error(e); process.exit(1); });

// Builds data/forecast.json for every location and copies the website into _site/.
// Locations: a published Google Sheet CSV (LOCATIONS_CSV_URL) or data/locations.json.
// Forecasts: Open-Meteo weather + air quality (free, CC BY 4.0), one batched request each.
import {readFile, writeFile, mkdir, cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createSign} from 'node:crypto';
import {windowStats, goIndex, runScore, advice, band, aqiCategory, wbgtProxy} from './index-rules.mjs';

const TZ = 'America/Jamaica';
const OUT = resolve(process.env.OUTPUT_DIR || '_site');
const WINDOWS = {am: {label: 'Morning', start: 4.5, end: 7}, pm: {label: 'Evening', start: 16.5, end: 18.5}};
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
    key: col.key != null && r[col.key] ? slug(r[col.key]) : null}));
}

async function loadLocations() {
  let list = [];
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && !MOCK) {
    try {
      const token = await sheetToken();
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(SHEET_ID)}/values/${encodeURIComponent(SHEET_TAB + '!A1:G500')}`,
        {headers: {authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(30000)});
      if (!res.ok) throw Error(`HTTP ${res.status}`);
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
        key: col.key != null && r[col.key] ? slug(r[col.key]) : null}));
      console.log(`LOCATIONS: ${list.length} rows from the Google Sheet`);
    } catch (e) { console.warn(`LOCATIONS: sheet unavailable (${e.message}); using data/locations.json`); }
  }
  if (!list.length) list = JSON.parse(await readFile('data/locations.json', 'utf8'));
  const seen = new Set();
  return list.filter(l => {
    if (!l.name || !Number.isFinite(l.lat) || !Number.isFinite(l.lon) || Math.abs(l.lat) > 90 || Math.abs(l.lon) > 180) { console.warn('LOCATION SKIPPED (bad name or coordinates):', l.name); return false; }
    l.key = l.key || slug(l.name);
    if (!['run', 'cycle', 'both'].includes(l.sport)) l.sport = 'both';
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

async function fetchForecasts(locs) {
  if (MOCK) { const {mockForecast} = await import('./mock.mjs'); return mockForecast(locs, DAYS); }
  const lat = locs.map(l => l.lat.toFixed(4)).join(','), lon = locs.map(l => l.lon.toFixed(4)).join(',');
  const wx = await getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=${HOURLY.join(',')}`
    + `&daily=sunrise,sunset&timezone=${encodeURIComponent(TZ)}&forecast_days=${DAYS}&past_days=1&wind_speed_unit=kmh`, 'FORECAST');
  let aq = null;
  try {
    aq = await getJson(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}`
      + `&hourly=pm2_5,ozone,us_aqi,us_aqi_pm2_5,us_aqi_ozone&timezone=${encodeURIComponent(TZ)}&forecast_days=5`, 'AIR QUALITY');
  } catch (e) { console.warn('AIR QUALITY unavailable:', e.message); }
  const arr = x => Array.isArray(x) ? x : [x];
  return {wx: arr(wx), aq: aq ? arr(aq) : []};
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
    pm25: mean('pm2_5') != null ? Math.round(mean('pm2_5') * 10) / 10 : null, ozone: mean('ozone') != null ? Math.round(mean('ozone') * 10) / 10 : null};
}

function hourlyForDay(h, day) {
  const out = [];
  h.time.forEach((t, i) => {
    const hr = Number(t.slice(11, 13));
    if (!t.startsWith(day) || hr < 4 || hr > 20) return;
    out.push({t: t.slice(11, 16), temp: h.temperature_2m[i], feels: h.apparent_temperature[i], rh: h.relative_humidity_2m[i],
      pop: h.precipitation_probability[i], mm: h.precipitation[i], wind: h.wind_speed_10m[i], gust: h.wind_gusts_10m[i],
      dir: h.wind_direction_10m[i], uv: h.uv_index[i], code: h.weather_code[i]});
  });
  return out;
}

async function main() {
  const locs = await loadLocations();
  if (!locs.length) throw Error('No valid locations');
  const {wx, aq} = await fetchForecasts(locs);
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: TZ}).format(new Date());
  const result = {generatedAt: new Date().toISOString(), timezone: TZ, windows: WINDOWS,
    source: 'Open-Meteo weather and air quality (CC BY 4.0)', locations: []};
  locs.forEach((loc, li) => {
    const w = wx[li]; if (!w || !w.hourly) { console.warn('NO FORECAST for', loc.name); return; }
    const days = (w.daily?.time || []).filter(d => d >= today).slice(0, DAYS).map((day, di) => {
      const sunIdx = w.daily.time.indexOf(day);
      const entry = {date: day, sunrise: w.daily.sunrise?.[sunIdx]?.slice(11, 16) || null, sunset: w.daily.sunset?.[sunIdx]?.slice(11, 16) || null, windows: {}, hourly: hourlyForDay(w.hourly, day)};
      for (const [key, win] of Object.entries(WINDOWS)) {
        const m = windowStats(w.hourly, day, win.start, win.end);
        const air = aqWindow(aq[li], day, win.start, win.end);
        const isPm = key === 'pm';
        const scores = {};
        for (const sport of ['run', 'cycle']) {
          const g = goIndex(m, air, isPm, sport);
          scores[sport] = {index: g.index, band: band(g.index), reasons: g.reasons, advice: advice(g.index, !isPm, m)};
        }
        entry.windows[key] = {label: win.label, metrics: m.hasData ? {...m, wbgt: wbgtProxy(m.tempC, m.rh)} : null, air,
          runScore10: Math.round(runScore(m, air, isPm) / 10), scores};
      }
      return entry;
    });
    result.locations.push({key: loc.key, name: loc.name, area: loc.area || '', sport: loc.sport, lat: loc.lat, lon: loc.lon, days});
    console.log(`${loc.name}: ${days.map(d => `${d.date.slice(5)} AM ${d.windows.am.scores.run.index} PM ${d.windows.pm.scores.run.index}`).join(' | ')}`);
  });
  await mkdir(resolve(OUT, 'data'), {recursive: true});
  await cp('site', OUT, {recursive: true});
  await writeFile(resolve(OUT, 'data', 'forecast.json'), JSON.stringify(result));
  console.log(`WROTE ${resolve(OUT, 'data', 'forecast.json')} (${result.locations.length} locations)`);
}

main().catch(e => { console.error(e); process.exit(1); });

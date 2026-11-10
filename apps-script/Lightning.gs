/**
 * Jamaica We Active! – Lightning watch (Xweather)
 * -------------------------------------------------
 * Add this as a new file (Lightning.gs) in the existing Wx-Exercise5day Apps Script project.
 * From 5 AM to 8 PM Jamaica time it asks Xweather for the last 5 minutes of lightning in two
 * 100 km circles that cover Jamaica: every 5 minutes while there has been lightning in the last
 * 20 minutes, every 10 minutes when it is quiet. It keeps 45 minutes of history on a ~2 km grid
 * and serves it to the website at  …/exec?action=lightning
 * When lightning comes within 30 km of any Jamaican place on the website, it also asks Xweather's
 * Lightning Threats feed (at most every 10 minutes) where each storm is heading over the next hour,
 * so the website can say "likely to reach Kingston in about 30 minutes".
 * The website works out the distance on the visitor's phone, so their GPS never leaves it.
 *
 * Setup (once):
 *  1. Add this file to the Wx-Exercise5day project.
 *  2. In Code.gs doGet, add the lightning route as the FIRST line after "action" is read,
 *     before setupExwxOps() and the forecast build, so it stays fast:
 *        if (action === 'lightning') return lightningFeed_();
 *  3. Project Settings → Script Properties → add XWEATHER_ID and XWEATHER_SECRET
 *     (optional: LIGHTNING_MONTHLY_CAP, default 14000).
 *  4. Run testLightning() and allow the new permission. The log shows whether data comes back.
 *     Run testLightningThreats() once to check your Xweather plan includes the storm-track feed.
 *  5. Run installLightningTrigger().
 *  6. Deploy → Manage deployments → edit the existing web app → Version: New version → Deploy.
 *     The /exec URL stays the same. Access must be "Anyone" for the website to read it.
 *
 * Budget (15 hours a day, 2 calls a poll):
 *   quiet hours 6 polls an hour = 12 calls; lightning hours 12 polls = 24 calls.
 *   A month with no lightning ≈ 5,600 calls; every hour of lightning adds 12.
 *   Each storm-track (Threats) request counts as 10 calls, at most 6 an hour while a storm is within 30 km.
 * It stops calling for the rest of the month if the counter would pass the cap.
 * All keys here start with LW_ so nothing clashes with the email script's cache or properties.
 */

const LW = {
  CIRCLES: [[18.15, -77.75], [18.10, -76.80]],   // west + east Jamaica, 100 km each (standard plan maximum)
  RADIUS_KM: 100,
  KEEP_MIN: 45,                                   // history kept for the 30-minute rule
  GRID: 0.02,                                     // ~2 km cells keep the stored data small
  START_HOUR: 5,                                  // first poll 5:00 AM
  END_HOUR: 20,                                   // last poll 7:55 PM
  ACTIVE_MIN: 20,                                 // lightning this recent → poll every 5 minutes
  QUIET_GAP_MIN: 9,                               // otherwise wait at least this long between polls (≈ every 10 min)
  THREAT_KM: 30,                                  // ask for storm tracks when lightning is this close to a place
  THREAT_RECENT_MIN: 10,                          // …and that lightning is this recent
  THREAT_GAP_MIN: 9,                              // at most one storm-track request every ~10 minutes
  THREAT_COST: 10,                                // Xweather counts each Threats request as 10 calls
  THREAT_KEEP_MIN: 15,                            // storm tracks older than this are dropped
  PLACES_URL: 'https://active.islandsoutside.com/data/places.json',
  // Used if the website's place list can't be read.
  FALLBACK_PLACES: [['Kingston', 18.012, -76.797], ['Montego Bay', 18.476, -77.893], ['Ocho Rios', 18.408, -77.103],
    ['Negril', 18.268, -78.348], ['Mandeville', 18.041, -77.507], ['Port Antonio', 18.177, -76.452],
    ['Morant Bay', 17.882, -76.409], ['Spanish Town', 17.991, -76.957], ['Portmore', 17.95, -76.883]],
  CAP_DEFAULT: 14000,
  TZ: 'America/Jamaica',
};

/** Web app route: GET …/exec?action=lightning returns the current lightning picture. */
function lightningFeed_() {
  const props = PropertiesService.getScriptProperties();
  const meta = JSON.parse(props.getProperty('LW_META') || '{}');
  const cells = lwLoadCells_();
  const nowSec = Math.floor(Date.now() / 1000);
  const out = {
    status: meta.status || 'unknown',             // live | sleeping | paused | error | unknown
    updated: meta.updated || null,                // last successful poll (ISO)
    checked: meta.checked || null,                // last poll attempt (ISO)
    message: meta.message || '',
    used: Number(props.getProperty('LW_USED') || 0),
    cap: lwCap_(props),
    now: new Date(nowSec * 1000).toISOString(),
    // [lat, lon, last strike (unix s), strikes in cell, any cloud-to-ground 1/0]
    cells: Object.keys(cells).map(k => { const [la, lo] = k.split(',').map(Number); const c = cells[k]; return [la, lo, c[0], c[1], c[2]]; }),
    // Storm tracks for the next hour: [{dirTo, dirToDEG, kph, reliability, severe, periods: [[start s, end s, [[lat, lon], …]], …]}]
    threats: lwLoadThreats_(),
    source: 'Xweather',
  };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Time trigger: every 5 minutes. */
function lwPoll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = new Date();
    const hour = Number(Utilities.formatDate(now, LW.TZ, 'H'));
    lwRollMonth_(props, now);
    if (hour < LW.START_HOUR || hour >= LW.END_HOUR) return lwMeta_(props, 'sleeping', 'Lightning watch runs 5 AM–8 PM.');
    const used = Number(props.getProperty('LW_USED') || 0), cap = lwCap_(props);
    if (used + LW.CIRCLES.length > cap) return lwMeta_(props, 'paused', `Monthly limit reached (${used}/${cap}).`);

    const cells = lwLoadCells_();
    // Quiet: no lightning in the last 20 minutes → only poll about every 10 minutes.
    const nowSec = Math.floor(now.getTime() / 1000);
    const active = Object.keys(cells).some(k => cells[k][0] >= nowSec - LW.ACTIVE_MIN * 60);
    const lastPoll = Number(props.getProperty('LW_LAST_POLL') || 0);
    const meta0 = JSON.parse(props.getProperty('LW_META') || '{}');
    if (!active && meta0.status === 'live' && now.getTime() - lastPoll < LW.QUIET_GAP_MIN * 60000) return;
    props.setProperty('LW_LAST_POLL', String(now.getTime()));
    const cache = CacheService.getScriptCache();
    const seenBefore = new Set(JSON.parse(cache.get('LW_SEEN') || '[]'));
    const seenNow = [];
    let added = 0;
    for (const [lat, lon] of LW.CIRCLES) {
      for (const s of lwFetch_(props, lat, lon)) {
        const id = s.id, la = s.loc && s.loc.lat, lo = s.loc && s.loc.long, ts = s.ob && s.ob.timestamp;
        if (la == null || lo == null || !ts) continue;
        if (id) { if (seenBefore.has(id) || seenNow.indexOf(id) >= 0) continue; seenNow.push(id); }
        const key = (Math.round(la / LW.GRID) * LW.GRID).toFixed(2) + ',' + (Math.round(lo / LW.GRID) * LW.GRID).toFixed(2);
        const cg = s.ob.pulse && s.ob.pulse.type === 'cg' ? 1 : 0;
        const c = cells[key] || [0, 0, 0];
        cells[key] = [Math.max(c[0], ts), c[1] + 1, c[2] || cg];
        added++;
      }
    }
    cache.put('LW_SEEN', JSON.stringify(seenNow.slice(-3000)), 900);
    lwSaveCells_(cells);
    lwMeta_(props, 'live', `${added} new strikes`, true);
    try { lwMaybeThreats_(props, cells, now); } catch (e) { console.warn('[LW threats] ' + e); }
  } catch (err) {
    lwMeta_(PropertiesService.getScriptProperties(), 'error', String(err && err.message || err).slice(0, 200));
    console.error(err);
  } finally {
    lock.releaseLock();
  }
}

function lwFetch_(props, lat, lon) {
  const clean = v => String(v || '').trim().replace(/^["']+|["']+$/g, '');   // ignore stray spaces or quotes
  const id = clean(props.getProperty('XWEATHER_ID')), secret = clean(props.getProperty('XWEATHER_SECRET'));
  if (!id || !secret) throw Error('Add XWEATHER_ID and XWEATHER_SECRET in Script Properties');
  const url = 'https://data.api.xweather.com/lightning/closest?p=' + lat + ',' + lon +
    '&radius=' + LW.RADIUS_KM + 'km&limit=1000' +
    '&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(secret);
  const res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  props.setProperty('LW_USED', String(Number(props.getProperty('LW_USED') || 0) + 1));
  const code = res.getResponseCode();
  let j; try { j = JSON.parse(res.getContentText()); } catch (e) { throw Error('Xweather HTTP ' + code + ' (not JSON)'); }
  const warnNoData = j.error && j.error.code === 'warn_no_data';
  if (!j.success && !warnNoData) throw Error('Xweather: ' + (j.error ? j.error.code + ' – ' + j.error.description : 'HTTP ' + code));
  if (!j.response) return [];
  return Array.isArray(j.response) ? j.response : [j.response];
}

// ---------- Storm tracks (Xweather Lightning Threats) ----------

/** Asks for storm tracks when recent lightning is within 30 km of a place on the website. */
function lwMaybeThreats_(props, cells, now) {
  const nowSec = Math.floor(now.getTime() / 1000);
  if (Number(props.getProperty('LW_THREAT_OFF_UNTIL') || 0) > now.getTime()) return;
  if (now.getTime() - Number(props.getProperty('LW_THREAT_AT') || 0) < LW.THREAT_GAP_MIN * 60000) return;
  const places = lwPlaces_(props);
  let best = null;                                // the place with the closest recent strike
  Object.keys(cells).forEach(k => {
    if (cells[k][0] < nowSec - LW.THREAT_RECENT_MIN * 60) return;
    const [la, lo] = k.split(',').map(Number);
    places.forEach(p => { const d = lwKm_(la, lo, p[1], p[2]); if (d <= LW.THREAT_KM && (!best || d < best.d)) best = {d, p}; });
  });
  if (!best) return;
  const used = Number(props.getProperty('LW_USED') || 0);
  if (used + LW.THREAT_COST > lwCap_(props)) return;
  props.setProperty('LW_THREAT_AT', String(now.getTime()));
  const res = lwFetchThreats_(props, best.p[1], best.p[2]);
  if (res.denied) {                               // plan doesn't include the feed: stop asking for a day
    props.setProperty('LW_THREAT_OFF_UNTIL', String(now.getTime() + 24 * 3600000));
    console.warn('[LW threats] not available on this plan: ' + res.message);
    return;
  }
  lwSaveThreats_(res.list, nowSec);
  console.log(`[LW threats] ${res.list.length} storm(s) near ${best.p[0]} (strike ${best.d.toFixed(1)} km away)`);
}

function lwFetchThreats_(props, lat, lon) {
  const clean = v => String(v || '').trim().replace(/^["']+|["']+$/g, '');
  const id = clean(props.getProperty('XWEATHER_ID')), secret = clean(props.getProperty('XWEATHER_SECRET'));
  if (!id || !secret) throw Error('Add XWEATHER_ID and XWEATHER_SECRET in Script Properties');
  const url = 'https://data.api.xweather.com/lightning/threats/closest?p=' + lat + ',' + lon +
    '&radius=' + LW.RADIUS_KM + 'km&limit=10' +
    '&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(secret);
  const res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  props.setProperty('LW_USED', String(Number(props.getProperty('LW_USED') || 0) + LW.THREAT_COST));
  const code = res.getResponseCode();
  let j; try { j = JSON.parse(res.getContentText()); } catch (e) { throw Error('Threats HTTP ' + code + ' (not JSON)'); }
  if (j.error && j.error.code === 'warn_no_data') return {list: []};
  if (!j.success) {
    const message = j.error ? j.error.code + ' – ' + j.error.description : 'HTTP ' + code;
    if (code === 401 || code === 403 || /access|unauthori|permission|not.*(allowed|available)|invalid_client/i.test(message)) return {denied: true, message};
    throw Error('Threats: ' + message);
  }
  const raw = !j.response ? [] : Array.isArray(j.response) ? j.response : [j.response];
  return {list: raw, code};
}

/** Keeps a small copy: direction, speed and each 10-minute area as a simplified [lat, lon] outline. */
function lwSaveThreats_(raw, nowSec) {
  const r3 = v => Math.round(v * 1000) / 1000;
  const ring = poly => {
    const pts = (poly && poly.coordinates && poly.coordinates[0]) || [];
    const step = Math.max(1, Math.ceil(pts.length / 40));
    return pts.filter((_, i) => i % step === 0).map(c => [r3(c[1]), r3(c[0])]);
  };
  const storms = raw.map(t => {
    const d = t.details || {}, m = d.movement || {};
    return {
      id: t.id, issued: d.issuedTimestamp || nowSec, severe: !!d.severe,
      dirTo: m.dirTo || '', dirToDEG: m.dirToDEG, kph: m.speedKPH != null ? Math.round(m.speedKPH) : null, reliability: m.reliability || '',
      periods: (t.periods || []).map(p => [p.range && p.range.minTimestamp, p.range && p.range.maxTimestamp, ring(p.polygon)]).filter(p => p[2].length >= 3),
    };
  }).filter(s => s.periods.length);
  CacheService.getScriptCache().put('LW_THREATS', JSON.stringify({at: nowSec, storms}), 3600);
}

function lwLoadThreats_() {
  const t = JSON.parse(CacheService.getScriptCache().get('LW_THREATS') || 'null');
  if (!t || Math.floor(Date.now() / 1000) - t.at > LW.THREAT_KEEP_MIN * 60) return null;
  return t;
}

/** The website's Jamaican places (run & ride and swim), refreshed once a day. */
function lwPlaces_(props) {
  const cached = JSON.parse(props.getProperty('LW_PLACES') || 'null');
  if (cached && Date.now() - cached.at < 24 * 3600000 && cached.list.length) return cached.list;
  try {
    const res = UrlFetchApp.fetch(LW.PLACES_URL, {muteHttpExceptions: true});
    if (res.getResponseCode() === 200) {
      const list = JSON.parse(res.getContentText()).places.filter(p => p.t === 'JM').map(p => [p.name, p.lat, p.lon]);
      if (list.length) { props.setProperty('LW_PLACES', JSON.stringify({at: Date.now(), list})); return list; }
    }
  } catch (e) { console.warn('[LW places] ' + e); }
  return cached && cached.list.length ? cached.list : LW.FALLBACK_PLACES;
}

function lwKm_(a, b, c, d) {
  const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(x));
}

function lwLoadCells_() {
  const cells = JSON.parse(CacheService.getScriptCache().get('LW_CELLS') || '{}');
  const cutoff = Math.floor(Date.now() / 1000) - LW.KEEP_MIN * 60;
  Object.keys(cells).forEach(k => { if (cells[k][0] < cutoff) delete cells[k]; });
  return cells;
}

function lwSaveCells_(cells) {
  let keys = Object.keys(cells);
  // Cache values are limited to 100 KB: in a very large outbreak keep the most recent cells.
  if (keys.length > 2500) { keys.sort((a, b) => cells[b][0] - cells[a][0]); const keep = {}; keys.slice(0, 2500).forEach(k => keep[k] = cells[k]); cells = keep; }
  CacheService.getScriptCache().put('LW_CELLS', JSON.stringify(cells), 6 * 3600);
}

function lwMeta_(props, status, message, ok) {
  const meta = JSON.parse(props.getProperty('LW_META') || '{}');
  const iso = new Date().toISOString();
  meta.status = status; meta.message = message; meta.checked = iso;
  if (ok) meta.updated = iso;
  props.setProperty('LW_META', JSON.stringify(meta));
}

function lwCap_(props) { return Number(props.getProperty('LIGHTNING_MONTHLY_CAP') || LW.CAP_DEFAULT); }

function lwRollMonth_(props, now) {
  const month = Utilities.formatDate(now, LW.TZ, 'yyyy-MM');
  if (props.getProperty('LW_MONTH') !== month) props.setProperties({LW_MONTH: month, LW_USED: '0'});
}

/** Run by hand: one call for the west circle, logs what comes back (uses 1 call). */
function testLightning() {
  const props = PropertiesService.getScriptProperties();
  lwRollMonth_(props, new Date());
  const list = lwFetch_(props, LW.CIRCLES[0][0], LW.CIRCLES[0][1]);
  console.log('Strikes in the last 5 minutes within 100 km of west Jamaica: ' + list.length);
  if (list.length) console.log(JSON.stringify(list[0]));
  console.log('Calls used this month: ' + props.getProperty('LW_USED') + ' / ' + lwCap_(props));
}

/** Run by hand once: checks your Xweather plan includes storm tracks (uses 10 calls). */
function testLightningThreats() {
  const props = PropertiesService.getScriptProperties();
  lwRollMonth_(props, new Date());
  const res = lwFetchThreats_(props, 18.012, -76.797);      // Kingston, 100 km around
  if (res.denied) console.error('Storm tracks are NOT included in your Xweather plan: ' + res.message);
  else {
    props.deleteProperty('LW_THREAT_OFF_UNTIL');
    console.log('Storm tracks work. Storms near Jamaica right now: ' + res.list.length + ' (0 is normal when skies are clear).');
    if (res.list.length) console.log(JSON.stringify(res.list[0].details));
  }
  console.log('Places watched: ' + lwPlaces_(props).map(p => p[0]).join(', '));
  console.log('Calls used this month: ' + props.getProperty('LW_USED') + ' / ' + lwCap_(props));
}

/** Run by hand: shows the month's usage and the last status. */
function lightningStatus() {
  const props = PropertiesService.getScriptProperties();
  console.log('Used ' + (props.getProperty('LW_USED') || 0) + ' / ' + lwCap_(props) + ' in ' + props.getProperty('LW_MONTH'));
  console.log(props.getProperty('LW_META'));
}

/** Run once: runs every 5 minutes (outside 5 AM–8 PM, and on quiet in-between runs, it returns without calling Xweather). */
function installLightningTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'lwPoll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lwPoll').timeBased().everyMinutes(5).create();
  console.log('Lightning trigger installed (every 5 minutes).');
}

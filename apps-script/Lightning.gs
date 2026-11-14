/**
 * Jamaica We Active! – Lightning watch (Xweather)
 * -------------------------------------------------
 * Add this as a new file (Lightning.gs) in the existing Wx-Exercise5day Apps Script project.
 * For Jamaica (two 100 km circles) and Trinidad (one), from 5 AM to 8 PM local time, it asks Xweather for
 * the last 5 minutes of lightning: every 5 minutes while there has been lightning within 50 km of one of
 * that island's places on the website in the last 20 minutes, every 10 minutes otherwise. It keeps 45 minutes
 * of history on a ~2 km grid and serves it to the website at  …/exec?action=lightning
 * When lightning comes within 20 km of a watched place, it also asks Xweather's
 * Lightning Threats feed (at most every 20 minutes) where each storm is heading over the next hour,
 * so the website can say "likely to reach Kingston in about 30 minutes".
 *
 * Forecast pace: when the site's forecast shows no rain or thunderstorms at any place on an island from an
 * hour ago to 2 hours ahead (data/storm-risk.json, refreshed with each site build), that island is checked
 * only about once an hour. As soon as any lightning shows up around the island, or rain/storms are forecast,
 * it goes back to every 10 minutes (every 5 within 50 km of a watched place). No forecast file → normal pace.
 *
 * "Check now": a visitor can ask for an immediate check for the place shown on their card
 * (…/exec?action=lightning&check=1&t=JM&k=place-key&lat=…&lon=…). Each place can be checked at most once
 * every 60 minutes, whoever presses it, and each island at most 4 times an hour and 24 times a day.
 * If lightning is found, the place joins the watched places for an hour, so the normal pace takes over
 * (every 5 minutes within 50 km, every 10 otherwise).
 *
 * Watched places: the faster checks and storm tracks are triggered only by the places people use most
 * (each island's default place plus its top places from the anonymous tally, Tally.gs, over the last
 * 30 days), not every place on the site. Lightning itself is still collected for the whole island, so
 * every place on the site still shows nearby strikes. Until an island has enough tally counts, all of
 * its places are watched. The list is refreshed once a day.
 * The website works out the distance on the visitor's phone, so their GPS never leaves it.
 *
 * Setup (once):
 *  1. Add this file to the Wx-Exercise5day project.
 *  2. In Code.gs doGet, add the lightning route as the FIRST line after "action" is read,
 *     before setupExwxOps() and the forecast build, so it stays fast:
 *        if (action === 'lightning') return lightningFeed_(e);
 *     (pass e so the website's "Check now" button works)
 *  3. Project Settings → Script Properties → add XWEATHER_ID and XWEATHER_SECRET
 *     (optional: LIGHTNING_MONTHLY_CAP, default 14000).
 *  4. Run testLightning() and allow the new permission. The log shows whether data comes back.
 *     Run testLightningThreats() once to check your Xweather plan includes the storm-track feed.
 *  5. Run installLightningTrigger().
 *  6. Deploy → Manage deployments → edit the existing web app → Version: New version → Deploy.
 *     The /exec URL stays the same. Access must be "Anyone" for the website to read it.
 *
 * Regions: Jamaica (2 circles) and Trinidad (1 circle), each checked 5 AM–8 PM in its own local time,
 * each with its own quiet/active pace.
 * Budget (15 hours a day per region, 1 call per circle per poll):
 *   Jamaica: quiet 12 calls an hour, 24 with lightning within 50 km of a place.
 *   Trinidad: quiet 6 calls an hour, 12 with lightning.
 *   A month with no lightning ≈ 5,600 (Jamaica) + 2,800 (Trinidad) calls.
 *   Each storm-track (Threats) request counts as 10 calls, at most 3 an hour while lightning is within 20 km of a watched place.
 * It stops calling for the rest of the month if the counter would pass the cap.
 * All keys here start with LW_ so nothing clashes with the email script's cache or properties.
 */

const LW = {
  // Each region: its own clock and 100 km circles (standard plan maximum). Trinidad's circle covers the whole
  // island (not Tobago, which has no places on the site yet).
  REGIONS: {
    JM: {name: 'Jamaica', tz: 'America/Jamaica', circles: [[18.15, -77.75], [18.10, -76.80]]},
    TT: {name: 'Trinidad', tz: 'America/Port_of_Spain', circles: [[10.45, -61.30]], suspended: true},   // suspended to save Xweather tokens; set false to resume
  },
  RADIUS_KM: 100,
  KEEP_MIN: 45,                                   // history kept for the 30-minute rule
  GRID: 0.02,                                     // ~2 km cells keep the stored data small
  START_HOUR: 5,                                  // first poll 5:00 AM
  END_HOUR: 20,                                   // last poll 7:55 PM
  ACTIVE_MIN: 20,                                 // lightning this recent…
  ACTIVE_KM: 50,                                  // …and this close to a watched place → poll every 5 minutes
  QUIET_GAP_MIN: 9,                               // otherwise wait at least this long between polls (≈ every 10 min)
  CALM_GAP_MIN: 59,                               // …and this long (≈ hourly) when no rain or storms are forecast
  RISK_BEFORE_H: 1,                               // forecast hours counted: from this many hours ago…
  RISK_AHEAD_H: 2,                                // …to this many hours ahead
  CHECK_GAP_MIN: 60,                              // "Check now": once per place per this many minutes (all visitors)
  CHECK_MAX_HOUR: 4,                              // …and at most this many per island per hour
  CHECK_MAX_DAY: 24,                              // …and per day
  CHECK_KEEP_MIN: 60,                             // a checked place with lightning nearby stays watched this long
  RISK_URL: 'https://active.islandsoutside.com/data/storm-risk.json',
  THREAT_KM: 20,                                  // ask for storm tracks when lightning is this close to a watched place
  THREAT_RECENT_MIN: 10,                          // …and that lightning is this recent
  THREAT_GAP_MIN: 19,                             // at most one storm-track request every ~20 minutes
  LIMIT_PAUSE_H: 6,                               // after Xweather says the limit is reached, wait this long before trying again
  LOW_REMAINING: 300,                             // pause when Xweather reports fewer tokens left than this
  THREAT_COST: 10,                                // Xweather counts each Threats request as 10 calls
  THREAT_KEEP_MIN: 15,                            // storm tracks older than this are dropped
  WATCH_TOP: 6,                                   // watched places per island: its default place + this many of the most used
  WATCH_DAYS: 30,                                 // …counted over this many days of the place tally
  WATCH_MIN_COUNT: 3,                             // a place needs at least this many opens + picks to count as "used"
  WATCH_MIN_TOTAL: 20,                            // until an island has this many counts in total, watch all its places
  PLACES_URL: 'https://active.islandsoutside.com/data/places.json',
  // Used if the website's place list can't be read.
  FALLBACK_PLACES: [['Kingston', 18.012, -76.797], ['Montego Bay', 18.476, -77.893], ['Ocho Rios', 18.408, -77.103],
    ['Negril', 18.268, -78.348], ['Mandeville', 18.041, -77.507], ['Port Antonio', 18.177, -76.452],
    ['Morant Bay', 17.882, -76.409], ['Spanish Town', 17.991, -76.957], ['Portmore', 17.95, -76.883]],
  CAP_DEFAULT: 14000,
  CYCLE_DAY: 9,                                   // Xweather's free allowance resets on this day of the month
  TZ: 'America/Jamaica',                          // the monthly counter rolls over on Jamaica's calendar
};
const lwRegionMeta_ = (props, r) => JSON.parse(props.getProperty('LW_META_' + r) || (r === 'JM' ? props.getProperty('LW_META') || '{}' : '{}'));

/** Web app route: GET …/exec?action=lightning returns the current lightning picture. */
function lightningFeed_(e) {
  const props = PropertiesService.getScriptProperties();
  const q = (e && e.parameter) || {};
  const check = q.check ? lwCheckNow_(props, q) : null;
  const meta = JSON.parse(props.getProperty('LW_META') || '{}');
  const cells = lwLoadCells_();
  const nowSec = Math.floor(Date.now() / 1000);
  const regions = {};
  Object.keys(LW.REGIONS).forEach(r => {
    const m = lwRegionMeta_(props, r);
    regions[r] = {name: LW.REGIONS[r].name, everyMin: m.every || 10, status: m.status || 'unknown', updated: m.updated || null, checked: m.checked || null, message: m.message || '', circles: LW.REGIONS[r].circles};
  });
  const out = {
    // Top level is Jamaica (older pages read it); each region's own status is under "regions".
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
    regions, radiusKm: LW.RADIUS_KM,
    checks: lwChecks_(props).list,                // {"JM:cherry-gardens": last check (unix s)} for the last hour
    checkGapMin: LW.CHECK_GAP_MIN,
    ...(check ? {check} : {}),
    source: 'Xweather',
  };
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Time trigger: every 5 minutes. Each region runs on its own clock and pace. */
function lwPoll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const now = new Date(), nowSec = Math.floor(now.getTime() / 1000);
    lwRollMonth_(props, now);
    const cells = lwLoadCells_();
    const places = lwWatchedNow_(props);
    const cache = CacheService.getScriptCache();
    const seenBefore = new Set(JSON.parse(cache.get('LW_SEEN') || '[]'));
    const seenNow = [];
    let polled = false;
    for (const r of Object.keys(LW.REGIONS)) {
      const R = LW.REGIONS[r];
      try {
        if (R.suspended) { lwMeta_(props, r, 'suspended', 'Lightning watch is paused for this island for now.'); continue; }
        const pausedUntil = Number(props.getProperty('LW_PAUSED_UNTIL') || 0);
        if (pausedUntil > now.getTime()) { lwMeta_(props, r, 'paused', 'Xweather data limit reached; trying again later.'); continue; }
        const hour = Number(Utilities.formatDate(now, R.tz, 'H'));
        if (hour < LW.START_HOUR || hour >= LW.END_HOUR) { lwMeta_(props, r, 'sleeping', 'Lightning watch runs 5 AM–8 PM.'); continue; }
        const used = Number(props.getProperty('LW_USED') || 0), cap = lwCap_(props);
        if (used + R.circles.length > cap) { lwMeta_(props, r, 'paused', `Monthly limit reached (${used}/${cap}).`); continue; }
        // Active: lightning within 50 km of a watched place in the last 20 minutes → every 5 minutes.
        // Otherwise every 10 minutes, or about hourly when no rain or storms are forecast and none is around.
        const mine = places.filter(p => (p[3] || 'JM') === r);
        const active = Object.keys(cells).some(k => {
          if (cells[k][0] < nowSec - LW.ACTIVE_MIN * 60) return false;
          const [la, lo] = k.split(',').map(Number);
          return mine.some(p => lwKm_(la, lo, p[1], p[2]) <= LW.ACTIVE_KM);
        });
        const storm = active || lwStormy_(props, r, now, cells);
        const every = active ? 5 : storm ? 10 : 60;
        const lastPoll = Number(props.getProperty('LW_LAST_POLL_' + r) || 0);
        if (!active && lwRegionMeta_(props, r).status === 'live' && now.getTime() - lastPoll < (storm ? LW.QUIET_GAP_MIN : LW.CALM_GAP_MIN) * 60000) {
          if (lwRegionMeta_(props, r).every !== every) lwMeta_(props, r, 'live', lwRegionMeta_(props, r).message || '', false, every);
          continue;
        }
        props.setProperty('LW_LAST_POLL_' + r, String(now.getTime()));
        let added = 0;
        for (const [lat, lon] of R.circles) {
          for (const s of lwFetch_(props, lat, lon, r)) {
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
        polled = true;
        lwMeta_(props, r, 'live', `${added} new strikes`, true, every);
      } catch (err) {
        const limited = err && err.limit;
        lwMeta_(props, r, limited ? 'paused' : 'error', String(err && err.message || err).slice(0, 200));
        console.error(r + ': ' + err);
      }
    }
    if (polled) {
      cache.put('LW_SEEN', JSON.stringify(seenNow.concat([...seenBefore]).slice(0, 3000)), 900);
      lwSaveCells_(cells);
      try { lwMaybeThreats_(props, cells, now); } catch (e) { console.warn('[LW threats] ' + e); }
    }
  } finally {
    lock.releaseLock();
  }
}

function lwFetch_(props, lat, lon, region) {
  const clean = v => String(v || '').trim().replace(/^["']+|["']+$/g, '');   // ignore stray spaces or quotes
  const id = clean(props.getProperty('XWEATHER_ID')), secret = clean(props.getProperty('XWEATHER_SECRET'));
  if (!id || !secret) throw Error('Add XWEATHER_ID and XWEATHER_SECRET in Script Properties');
  const url = 'https://data.api.xweather.com/lightning/closest?p=' + lat + ',' + lon +
    '&radius=' + LW.RADIUS_KM + 'km&limit=1000' +
    '&client_id=' + encodeURIComponent(id) + '&client_secret=' + encodeURIComponent(secret);
  const res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
  const code = res.getResponseCode();
  let j; try { j = JSON.parse(res.getContentText()); } catch (e) { throw Error('Xweather HTTP ' + code + ' (not JSON)'); }
  lwCharge_(props, res, code, j, 1, region || 'JM');
  const warnNoData = j.error && j.error.code === 'warn_no_data';
  if (!j.success && !warnNoData) throw Error('Xweather: ' + (j.error ? j.error.code + ' – ' + j.error.description : 'HTTP ' + code));
  if (!j.response) return [];
  return Array.isArray(j.response) ? j.response : [j.response];
}

// ---------- Storm tracks (Xweather Lightning Threats) ----------

/** Asks for storm tracks when recent lightning is within 20 km of a watched place. */
function lwMaybeThreats_(props, cells, now) {
  const nowSec = Math.floor(now.getTime() / 1000);
  if (Number(props.getProperty('LW_THREAT_OFF_UNTIL') || 0) > now.getTime()) return;
  if (Number(props.getProperty('LW_PAUSED_UNTIL') || 0) > now.getTime()) return;
  if (now.getTime() - Number(props.getProperty('LW_THREAT_AT') || 0) < LW.THREAT_GAP_MIN * 60000) return;
  const places = lwWatchedNow_(props).filter(p => lwRegionMeta_(props, p[3] || 'JM').status === 'live');
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
  const code = res.getResponseCode();
  let j; try { j = JSON.parse(res.getContentText()); } catch (e) { throw Error('Threats HTTP ' + code + ' (not JSON)'); }
  lwCharge_(props, res, code, j, LW.THREAT_COST, 'tracks');
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

/** The website's places in the watched regions (run & ride and swim) as [name, lat, lon, region, key, main], refreshed once a day. */
function lwPlaces_(props) {
  const cached = JSON.parse(props.getProperty('LW_PLACES3') || 'null');
  if (cached && Date.now() - cached.at < 24 * 3600000 && cached.list.length) return cached.list;
  try {
    const res = UrlFetchApp.fetch(LW.PLACES_URL, {muteHttpExceptions: true});
    if (res.getResponseCode() === 200) {
      const list = JSON.parse(res.getContentText()).places.filter(p => LW.REGIONS[p.t]).map(p => [p.name, p.lat, p.lon, p.t, p.key || '', p.main ? 1 : 0]);
      if (list.length) { props.setProperty('LW_PLACES3', JSON.stringify({at: Date.now(), list})); return list; }
    }
  } catch (e) { console.warn('[LW places] ' + e); }
  return cached && cached.list.length ? cached.list : LW.FALLBACK_PLACES.map(p => p.concat('JM'));
}

/**
 * The places that trigger faster checks and storm tracks: per island, its default place plus the most-used
 * places from the tally. An island without enough counts yet keeps all its places. Refreshed once a day.
 */
function lwWatched_(props) {
  const cached = JSON.parse(props.getProperty('LW_WATCH') || 'null');
  if (cached && Date.now() - cached.at < 24 * 3600000 && cached.list.length) return cached.list;
  const places = lwPlaces_(props);
  let counts = {};
  try { counts = lwTallyCounts_(props, LW.WATCH_DAYS); } catch (e) { console.warn('[LW watch] tally not read: ' + e); }
  const list = [], why = {};
  Object.keys(LW.REGIONS).forEach(r => {
    const mine = places.filter(p => (p[3] || 'JM') === r);
    const total = mine.reduce((n, p) => n + (counts[r + '|' + p[4]] || 0), 0);
    if (total < LW.WATCH_MIN_TOTAL) { mine.forEach(p => list.push(p)); why[r] = `all ${mine.length} places (only ${total} tally counts so far)`; return; }
    const top = mine.filter(p => !p[5] && (counts[r + '|' + p[4]] || 0) >= LW.WATCH_MIN_COUNT)
      .sort((a, b) => (counts[r + '|' + b[4]] || 0) - (counts[r + '|' + a[4]] || 0)).slice(0, LW.WATCH_TOP);
    const pick = mine.filter(p => p[5]).concat(top);
    pick.forEach(p => list.push(p));
    why[r] = `${pick.length} of ${mine.length} places`;
  });
  props.setProperty('LW_WATCH', JSON.stringify({at: Date.now(), list, why}));
  return list;
}

/** Opens + picks per place over the last N days, from the tally sheet and today's counts: {'JM|cherry-gardens': 42, …} */
function lwTallyCounts_(props, days) {
  const tz = LW.TZ, since = Utilities.formatDate(new Date(Date.now() - days * 86400000), tz, 'yyyy-MM-dd');
  const out = {};
  const add = (t, p, c) => { if (!t || t === 'XX' || !p) return; const k = t + '|' + p; out[k] = (out[k] || 0) + (Number(c[0]) || 0) + (Number(c[1]) || 0); };
  const id = props.getProperty('TALLY_SHEET_ID');
  if (id) {
    const sh = SpreadsheetApp.openById(id).getSheetByName('Daily');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(r => {
      const day = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd') : String(r[0]);
      if (day >= since) add(String(r[1]), String(r[3]), [r[4], r[5]]);
    });
  }
  let d = {}; try { d = JSON.parse(props.getProperty('TALLY_TODAY') || '{}') || {}; } catch (e) {}
  Object.keys(d.c || {}).forEach(k => { const [t, , p] = k.split('|'); add(t, p, d.c[k]); });
  return out;
}

/** Run by hand: refreshes and lists the watched places now (otherwise it refreshes once a day by itself). */
function lightningWatchedPlaces() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('LW_WATCH');
  props.deleteProperty('LW_PLACES3');
  const list = lwWatched_(props), why = JSON.parse(props.getProperty('LW_WATCH')).why;
  Object.keys(LW.REGIONS).forEach(r => console.log(`${LW.REGIONS[r].name}: ${why[r]} → ` + list.filter(p => p[3] === r).map(p => p[0] + (p[5] ? ' (default)' : '')).join(', ')));
}

// ---------- "Check now" from the website ----------

/** Last checks per place (unix s), dropped after an hour, plus counts per island for the hour and the day. */
function lwChecks_(props) {
  let c = {}; try { c = JSON.parse(props.getProperty('LW_CHECKS') || '{}') || {}; } catch (e) {}
  const nowS = Math.floor(Date.now() / 1000), list = {};
  Object.keys(c.list || {}).forEach(k => { if (nowS - c.list[k] < LW.CHECK_GAP_MIN * 60) list[k] = c.list[k]; });
  return {list, hour: c.hour || {}, day: c.day || {}};
}

/** Runs one check for a place if the limits allow it. Returns {result, found, nearestKm, next}. */
function lwCheckNow_(props, q) {
  const r = String(q.t || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2), R = LW.REGIONS[r];
  const key = String(q.k || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 60);
  const lat = Number(q.lat), lon = Number(q.lon);
  if (!R || !key || !isFinite(lat) || !isFinite(lon) || !R.circles.some(([a, b]) => lwKm_(lat, lon, a, b) <= LW.RADIUS_KM)) return {result: 'invalid'};
  const id = r + ':' + key, now = new Date(), nowS = Math.floor(now.getTime() / 1000);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return {result: 'busy'};
  try {
    const c = lwChecks_(props);
    if (c.list[id]) return {result: 'recent', at: c.list[id], next: c.list[id] + LW.CHECK_GAP_MIN * 60};
    const meta = lwRegionMeta_(props, r);
    const hour = Number(Utilities.formatDate(now, R.tz, 'H'));
    if (R.suspended || Number(props.getProperty('LW_PAUSED_UNTIL') || 0) > now.getTime() || hour < LW.START_HOUR || hour >= LW.END_HOUR) return {result: 'off'};
    if (meta.every === 5) return {result: 'fast'};                       // already checking every 5 minutes
    const hKey = r + Utilities.formatDate(now, R.tz, 'yyyyMMddHH'), dKey = r + Utilities.formatDate(now, R.tz, 'yyyyMMdd');
    if ((c.hour[hKey] || 0) >= LW.CHECK_MAX_HOUR || (c.day[dKey] || 0) >= LW.CHECK_MAX_DAY) return {result: 'limit'};
    const used = Number(props.getProperty('LW_USED') || 0);
    if (used + 1 > lwCap_(props)) return {result: 'off'};
    // Record first, so a failed request still counts against the limits.
    c.list[id] = nowS;
    c.hour = {[hKey]: (c.hour[hKey] || 0) + 1};
    c.day = {[dKey]: (c.day[dKey] || 0) + 1};
    props.setProperty('LW_CHECKS', JSON.stringify(c));
    const cells = lwLoadCells_();
    const cache = CacheService.getScriptCache(), seen = new Set(JSON.parse(cache.get('LW_SEEN') || '[]'));
    let list;
    try { list = lwFetch_(props, lat, lon, r); } catch (err) { console.warn('[LW check] ' + err); return {result: 'error'}; }
    let nearest = null;
    for (const s of list) {
      const sid = s.id, la = s.loc && s.loc.lat, lo = s.loc && s.loc.long, ts = s.ob && s.ob.timestamp;
      if (la == null || lo == null || !ts) continue;
      const d = lwKm_(lat, lon, la, lo); if (nearest == null || d < nearest) nearest = d;
      if (sid) { if (seen.has(sid)) continue; seen.add(sid); }
      const ck = (Math.round(la / LW.GRID) * LW.GRID).toFixed(2) + ',' + (Math.round(lo / LW.GRID) * LW.GRID).toFixed(2);
      const cg = s.ob.pulse && s.ob.pulse.type === 'cg' ? 1 : 0;
      const old = cells[ck] || [0, 0, 0];
      cells[ck] = [Math.max(old[0], ts), old[1] + 1, old[2] || cg];
    }
    lwSaveCells_(cells);
    cache.put('LW_SEEN', JSON.stringify([...seen].slice(-3000)), 900);
    lwMeta_(props, r, 'live', `check now: ${list.length} strikes`, true, meta.every || 10);
    if (list.length) {                                                   // lightning around: watch this place for an hour
      let extra = []; try { extra = JSON.parse(props.getProperty('LW_EXTRA') || '[]'); } catch (e) {}
      extra = extra.filter(p => p[6] > now.getTime() && !(p[3] === r && p[4] === key));
      extra.push(['Visitor check: ' + key, lat, lon, r, key, 0, now.getTime() + LW.CHECK_KEEP_MIN * 60000]);
      props.setProperty('LW_EXTRA', JSON.stringify(extra.slice(-20)));
    }
    console.log(`[LW check] ${id}: ${list.length} strikes, nearest ${nearest == null ? '–' : nearest.toFixed(1) + ' km'}`);
    return {result: 'done', found: list.length, nearestKm: nearest == null ? null : Math.round(nearest), at: nowS, next: nowS + LW.CHECK_GAP_MIN * 60};
  } finally {
    lock.releaseLock();
  }
}

/** Watched places plus places a visitor checked that had lightning around (for an hour). */
function lwWatchedNow_(props) {
  let extra = []; try { extra = JSON.parse(props.getProperty('LW_EXTRA') || '[]'); } catch (e) {}
  return lwWatched_(props).concat(extra.filter(p => p[6] > Date.now()));
}

/** True when this island needs the normal pace: lightning seen around it recently, or rain/storms forecast near now. */
function lwStormy_(props, r, now, cells) {
  const R = LW.REGIONS[r];
  if (Object.keys(cells).some(k => { const [la, lo] = k.split(',').map(Number); return R.circles.some(([a, b]) => lwKm_(la, lo, a, b) <= LW.RADIUS_KM); })) return true;
  const f = lwRisk_(props);
  const days = f && f.regions && f.regions[r];
  if (!days || now.getTime() - Date.parse(f.generatedAt) > 30 * 3600000) return true;     // no forecast → don't slow down
  const hour = Number(Utilities.formatDate(now, R.tz, 'H'));
  const hrs = days[Utilities.formatDate(now, R.tz, 'yyyy-MM-dd')];
  if (!hrs) return true;
  return hrs.some(h => h >= hour - LW.RISK_BEFORE_H && h <= hour + LW.RISK_AHEAD_H);
}

/** The site's rain/storm hours (data/storm-risk.json), re-read at most every 30 minutes. */
function lwRisk_(props) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('LW_RISK');
  if (hit) return JSON.parse(hit);
  let f = null;
  try {
    const res = UrlFetchApp.fetch(LW.RISK_URL, {muteHttpExceptions: true});
    if (res.getResponseCode() === 200) { f = JSON.parse(res.getContentText()); props.setProperty('LW_RISK_COPY', res.getContentText()); }
  } catch (e) { console.warn('[LW risk] ' + e); }
  if (!f) { try { f = JSON.parse(props.getProperty('LW_RISK_COPY') || 'null'); } catch (e) {} }
  if (f) cache.put('LW_RISK', JSON.stringify(f), 1800);
  return f;
}

/** Run by hand: shows, for each island, whether rain or storms are forecast now and the pace that gives. */
function lightningPace() {
  const props = PropertiesService.getScriptProperties();
  CacheService.getScriptCache().remove('LW_RISK');
  const f = lwRisk_(props), now = new Date(), cells = lwLoadCells_();
  if (!f) console.log('No forecast file yet: every island runs at the normal pace.');
  else console.log('Forecast built ' + Utilities.formatDate(new Date(f.generatedAt), LW.TZ, 'EEE d MMM h:mm a'));
  Object.keys(LW.REGIONS).forEach(r => {
    const R = LW.REGIONS[r], day = Utilities.formatDate(now, R.tz, 'yyyy-MM-dd');
    const hrs = f && f.regions && f.regions[r] && f.regions[r][day];
    console.log(`${R.name}${R.suspended ? ' (suspended)' : ''}: rain/storm hours today ${hrs ? (hrs.length ? hrs.join(', ') : 'none') : 'unknown'} → ` +
      (lwStormy_(props, r, now, cells) ? 'every 10 minutes (5 within 50 km)' : 'about hourly'));
  });
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

function lwMeta_(props, region, status, message, ok, every) {
  const meta = lwRegionMeta_(props, region);
  const iso = new Date().toISOString();
  meta.status = status; meta.message = message; meta.checked = iso;
  if (ok) meta.updated = iso;
  if (every) meta.every = every;
  props.setProperty('LW_META_' + region, JSON.stringify(meta));
  if (region === 'JM') props.setProperty('LW_META', JSON.stringify(meta));   // older pages read the top-level status
}

/**
 * Adds what Xweather actually charged for a request (X-Cost-Tokens header; fallback when missing) to the monthly
 * counter and a daily log, keeps Xweather's own "remaining" figure, and pauses everything when the limit is reached.
 */
function lwCharge_(props, res, code, j, fallback, bucket) {
  const h = {};
  const raw = res.getAllHeaders ? res.getAllHeaders() : res.getHeaders();
  Object.keys(raw || {}).forEach(k => { h[k.toLowerCase()] = String(raw[k]); });
  const limit = code === 429 || (j && j.error && /maxhits|limit/i.test(j.error.code || ''));
  if (limit) {
    props.setProperty('LW_PAUSED_UNTIL', String(Date.now() + LW.LIMIT_PAUSE_H * 3600000));
    const e = Error('Xweather: ' + (j && j.error ? j.error.code + ' – ' + j.error.description : 'HTTP 429')); e.limit = true; throw e;
  }
  if (code >= 400) return;                       // Xweather doesn't charge for errors
  const tokens = Number(h['x-cost-tokens']) || fallback;
  props.setProperty('LW_USED', String(Number(props.getProperty('LW_USED') || 0) + tokens));
  const remaining = h['x-ratelimit-remaining-period'];
  if (remaining != null && remaining !== '') {
    props.setProperty('LW_XW_REMAINING', remaining);
    if (Number(remaining) < LW.LOW_REMAINING) props.setProperty('LW_PAUSED_UNTIL', String(Date.now() + LW.LIMIT_PAUSE_H * 3600000));
  }
  if (h['x-cost-multipliers']) props.setProperty('LW_XW_MULT_' + (bucket === 'tracks' ? 'TRACKS' : 'STRIKES'), h['x-cost-multipliers'] + ' = ' + tokens);
  // Daily log of tokens by island / storm tracks (last 40 days).
  const day = Utilities.formatDate(new Date(), LW.TZ, 'yyyy-MM-dd');
  let log = {}; try { log = JSON.parse(props.getProperty('LW_DAYLOG') || '{}'); } catch (e) {}
  log[day] = log[day] || {}; log[day][bucket] = (log[day][bucket] || 0) + tokens;
  Object.keys(log).sort().slice(0, -40).forEach(d => delete log[d]);
  props.setProperty('LW_DAYLOG', JSON.stringify(log));
}

function lwCap_(props) { return Number(props.getProperty('LIGHTNING_MONTHLY_CAP') || LW.CAP_DEFAULT); }

/** The counter follows Xweather's billing cycle, which resets on the 9th (key = the month the cycle started in). */
function lwRollMonth_(props, now) {
  const month = Utilities.formatDate(new Date(now.getTime() - (LW.CYCLE_DAY - 1) * 86400000), LW.TZ, 'yyyy-MM');
  if (props.getProperty('LW_MONTH') !== month) props.setProperties({LW_MONTH: month, LW_USED: '0'});
}

/** Run by hand: one call for the first circle of each region, logs what comes back (uses 1 call per region). */
function testLightning() {
  const props = PropertiesService.getScriptProperties();
  lwRollMonth_(props, new Date());
  Object.keys(LW.REGIONS).filter(r => !LW.REGIONS[r].suspended).forEach(r => {
    const [lat, lon] = LW.REGIONS[r].circles[0];
    const list = lwFetch_(props, lat, lon, r);
    console.log(`Strikes in the last 5 minutes within 100 km of ${LW.REGIONS[r].name} (${lat}, ${lon}): ${list.length}`);
    if (list.length) console.log(JSON.stringify(list[0]));
  });
  const pl = lwWatched_(props);
  Object.keys(LW.REGIONS).forEach(r => console.log(`${LW.REGIONS[r].name} places watched: ${pl.filter(p => (p[3] || 'JM') === r).map(p => p[0]).join(', ')}`));
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
  console.log('Places watched: ' + lwWatched_(props).map(p => p[0]).join(', '));
  console.log('Calls used this month: ' + props.getProperty('LW_USED') + ' / ' + lwCap_(props));
}

/** Run by hand: shows the month's usage and the last status. */
function lightningStatus() {
  const props = PropertiesService.getScriptProperties();
  console.log('Used ' + (props.getProperty('LW_USED') || 0) + ' / ' + lwCap_(props) + ' tokens in ' + props.getProperty('LW_MONTH') + ' (counted from Xweather\'s own charges)');
  const rem = props.getProperty('LW_XW_REMAINING'); if (rem) console.log('Xweather says remaining this period: ' + rem);
  const until = Number(props.getProperty('LW_PAUSED_UNTIL') || 0);
  if (until > Date.now()) console.log('Paused (Xweather limit) until ' + Utilities.formatDate(new Date(until), LW.TZ, 'EEE d MMM h:mm a'));
  ['STRIKES', 'TRACKS'].forEach(k => { const m = props.getProperty('LW_XW_MULT_' + k); if (m) console.log(`Cost of one ${k === 'TRACKS' ? 'storm-track' : 'strike'} request (endpoint × time × area): ${m}`); });
  try { const w = JSON.parse(props.getProperty('LW_WATCH') || 'null'); if (w) Object.keys(LW.REGIONS).forEach(r => console.log(`${LW.REGIONS[r].name} watched: ${w.why[r]} → ` + w.list.filter(p => p[3] === r).map(p => p[0]).join(', '))); } catch (e) {}
  Object.keys(LW.REGIONS).forEach(r => console.log(LW.REGIONS[r].name + (LW.REGIONS[r].suspended ? ' (suspended)' : '') + ': ' + JSON.stringify(lwRegionMeta_(props, r))));
  let log = {}; try { log = JSON.parse(props.getProperty('LW_DAYLOG') || '{}'); } catch (e) {}
  Object.keys(log).sort().slice(-7).forEach(d => console.log(`${d}: ` + Object.keys(log[d]).map(b => `${b === 'tracks' ? 'storm tracks' : (LW.REGIONS[b] ? LW.REGIONS[b].name : b)} ${log[d][b]}`).join(' · ')));
}

/** Run once: runs every 5 minutes (outside each region's 5 AM–8 PM, and on quiet in-between runs, it skips that region). */
function installLightningTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'lwPoll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lwPoll').timeBased().everyMinutes(5).create();
  console.log('Lightning trigger installed (every 5 minutes).');
}

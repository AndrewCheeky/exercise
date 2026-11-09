/**
 * Jamaica We Active! – Lightning watch (Xweather)
 * -------------------------------------------------
 * A small, separate Apps Script project. Every 5 minutes (4 AM–9 PM Jamaica time) it asks
 * Xweather for the last 5 minutes of lightning in two 100 km circles that cover Jamaica,
 * keeps 45 minutes of history on a ~2 km grid, and serves it as JSON to the website.
 * The website works out the distance on the visitor's phone, so their GPS never leaves it.
 *
 * Setup (once):
 *  1. script.google.com → New project → paste this file.
 *  2. Project Settings → Script Properties → add XWEATHER_ID and XWEATHER_SECRET
 *     (optional: LIGHTNING_MONTHLY_CAP, default 14000).
 *  3. Run testLightning() and allow access. The log shows whether data comes back.
 *  4. Run installLightningTrigger().
 *  5. Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 *     Send the /exec URL (it is not secret).
 *
 * Budget: 17 hours × 12 polls × 2 calls = 408 calls a day ≈ 12,650 in a 31-day month.
 * It stops calling for the rest of the month if the counter would pass the cap.
 */

const LW = {
  CIRCLES: [[18.15, -77.75], [18.10, -76.80]],   // west + east Jamaica, 100 km each (standard plan maximum)
  RADIUS_KM: 100,
  KEEP_MIN: 45,                                   // history kept for the 30-minute rule
  GRID: 0.02,                                     // ~2 km cells keep the stored data small
  START_HOUR: 4,                                  // first poll 4:00 AM
  END_HOUR: 21,                                   // last poll 8:55 PM
  CAP_DEFAULT: 14000,
  TZ: 'America/Jamaica',
};

/** Web app: GET …/exec returns the current lightning picture. */
function doGet() {
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
    if (hour < LW.START_HOUR || hour >= LW.END_HOUR) return lwMeta_(props, 'sleeping', 'Lightning watch runs 4 AM–9 PM.');
    const used = Number(props.getProperty('LW_USED') || 0), cap = lwCap_(props);
    if (used + LW.CIRCLES.length > cap) return lwMeta_(props, 'paused', `Monthly limit reached (${used}/${cap}).`);

    const cells = lwLoadCells_();
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
  } catch (err) {
    lwMeta_(PropertiesService.getScriptProperties(), 'error', String(err && err.message || err).slice(0, 200));
    console.error(err);
  } finally {
    lock.releaseLock();
  }
}

function lwFetch_(props, lat, lon) {
  const id = props.getProperty('XWEATHER_ID'), secret = props.getProperty('XWEATHER_SECRET');
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

/** Run by hand: shows the month's usage and the last status. */
function lightningStatus() {
  const props = PropertiesService.getScriptProperties();
  console.log('Used ' + (props.getProperty('LW_USED') || 0) + ' / ' + lwCap_(props) + ' in ' + props.getProperty('LW_MONTH'));
  console.log(props.getProperty('LW_META'));
}

/** Run once: polls every 5 minutes (outside 4 AM–9 PM it returns without calling Xweather). */
function installLightningTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'lwPoll').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('lwPoll').timeBased().everyMinutes(5).create();
  console.log('Lightning trigger installed (every 5 minutes).');
}

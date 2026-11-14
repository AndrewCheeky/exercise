/**
 * One Caribbean We Outside – anonymous place tally
 * -------------------------------------------------
 * Counts which places and modes people look at on the Active site, so you can see what is used
 * (e.g. Cherry Gardens, the Grenada beaches) and what to add next.
 *
 * What is recorded: island, mode (land = run & ride, swim), place, and the kind of event:
 *   open – the place shown when the page opened (default or the visitor's saved place)
 *   pick – the visitor chose this place from the list
 *   mode – the visitor switched Run & Ride / Swim (counted against the place then shown)
 * Nothing about the person: no IP address, no ID, no cookie, no time of day. Counts are per day.
 *
 * Today's counts are kept in Script Properties; once a day they are written to a Google Sheet
 * ("One Caribbean – place tally", created automatically the first time).
 *
 * Setup (once), in the Wx-Exercise5day project:
 *  1. Add this file (Tally.gs).
 *  2. In Code.gs doGet, next to the lightning line, add:
 *        if (action === 'tally') return tallyHit_(e);
 *     (e is the doGet parameter: function doGet(e) { … })
 *  3. Run testTally() and allow the new permission (Google Sheets). The log shows the sheet's link.
 *  4. Run installTallyTrigger().
 *  5. Deploy → Manage deployments → edit the web app → Version: New version → Deploy.
 * Any time: run tallyReport() to see the most-used places for the last 30 days.
 */

const TALLY = {
  TZ: 'America/Jamaica',
  KINDS: ['open', 'pick', 'mode'],
  MODES: ['land', 'swim'],
  MAX_KEYS: 300,                                  // places × modes per day (keeps the property small)
  SHEET_NAME: 'One Caribbean – place tally',
  HEADER: ['Date', 'Island', 'Mode', 'Place', 'Opened', 'Picked', 'Mode switches'],
};

/** Web app route: GET …/exec?action=tally&t=JM&m=land&p=cherry-gardens&k=pick */
function tallyHit_(e) {
  const out = ContentService.createTextOutput('ok').setMimeType(ContentService.MimeType.TEXT);
  const q = (e && e.parameter) || {};
  const clean = (v, n) => String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, n);
  const t = clean(q.t, 2).toUpperCase(), m = clean(q.m, 5), p = clean(q.p, 60), k = clean(q.k, 5);
  if (!/^[A-Z]{2}$/.test(t) || TALLY.MODES.indexOf(m) < 0 || !p || TALLY.KINDS.indexOf(k) < 0) return out;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return out;
  try {
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), TALLY.TZ, 'yyyy-MM-dd');
    let d = tallyToday_(props);
    if (d.day && d.day !== day) { tallyFlush_(props, d); d = {day, c: {}}; }
    d.day = day; d.c = d.c || {};
    const key = [t, m, p].join('|');
    if (!d.c[key] && Object.keys(d.c).length >= TALLY.MAX_KEYS) return out;
    const row = d.c[key] || [0, 0, 0];
    row[TALLY.KINDS.indexOf(k)]++;
    d.c[key] = row;
    props.setProperty('TALLY_TODAY', JSON.stringify(d));
  } finally {
    lock.releaseLock();
  }
  return out;
}

function tallyToday_(props) {
  try { return JSON.parse(props.getProperty('TALLY_TODAY') || '{}') || {}; } catch (e) { return {}; }
}

/** Writes a finished day to the sheet. */
function tallyFlush_(props, d) {
  const keys = Object.keys((d && d.c) || {});
  if (!d.day || !keys.length) return;
  const sh = tallySheet_(props);
  const rows = keys.sort().map(key => { const [t, m, p] = key.split('|'); const c = d.c[key]; return [d.day, t, m, p, c[0], c[1], c[2]]; });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, TALLY.HEADER.length).setValues(rows);
}

function tallySheet_(props) {
  let id = props.getProperty('TALLY_SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(TALLY.SHEET_NAME);
    props.setProperty('TALLY_SHEET_ID', ss.getId());
    const sh = ss.getSheets()[0];
    sh.setName('Daily');
    sh.getRange(1, 1, 1, TALLY.HEADER.length).setValues([TALLY.HEADER]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return ss.getSheetByName('Daily') || ss.getSheets()[0];
}

/** Daily trigger (just after midnight Jamaica time): moves yesterday's counts into the sheet. */
function tallyDaily() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const day = Utilities.formatDate(new Date(), TALLY.TZ, 'yyyy-MM-dd');
    const d = tallyToday_(props);
    if (d.day && d.day !== day) { tallyFlush_(props, d); props.setProperty('TALLY_TODAY', JSON.stringify({day, c: {}})); }
  } finally {
    lock.releaseLock();
  }
}

/** Run once: installs the daily trigger (leaves the other triggers alone). */
function installTallyTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'tallyDaily').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tallyDaily').timeBased().everyDays(1).atHour(0).nearMinute(15).inTimezone(TALLY.TZ).create();
  console.log('Installed the daily tally trigger (about 12:15 AM Jamaica time).');
}

/** Run by hand once: creates the sheet and records one test count (island XX, removed by tallyReport). */
function testTally() {
  const props = PropertiesService.getScriptProperties();
  const sh = tallySheet_(props);
  tallyHit_({parameter: {t: 'XX', m: 'land', p: 'test', k: 'open'}});
  console.log('Tally sheet: ' + sh.getParent().getUrl());
  console.log('Today so far: ' + props.getProperty('TALLY_TODAY'));
}

/** Run by hand: the most-used places over the last N days (sheet + today). */
function tallyReport(days) {
  days = days || 30;
  const props = PropertiesService.getScriptProperties();
  const since = Utilities.formatDate(new Date(Date.now() - days * 86400000), TALLY.TZ, 'yyyy-MM-dd');
  const totals = {};
  const add = (t, m, p, c) => { if (t === 'XX') return; const key = `${t} · ${m === 'swim' ? 'Swim' : 'Run & Ride'} · ${p}`; const r = totals[key] || [0, 0, 0]; for (let i = 0; i < 3; i++) r[i] += Number(c[i]) || 0; totals[key] = r; };
  const sh = tallySheet_(props);
  const vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, TALLY.HEADER.length).getValues() : [];
  vals.forEach(r => { const day = r[0] instanceof Date ? Utilities.formatDate(r[0], TALLY.TZ, 'yyyy-MM-dd') : String(r[0]); if (day >= since) add(r[1], r[2], r[3], [r[4], r[5], r[6]]); });
  const d = tallyToday_(props);
  Object.keys(d.c || {}).forEach(key => { const [t, m, p] = key.split('|'); add(t, m, p, d.c[key]); });
  const list = Object.keys(totals).map(k => [k].concat(totals[k])).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
  console.log(`Last ${days} days – opened / picked / mode switches (most used first):`);
  list.slice(0, 60).forEach(r => console.log(`${r[0]}: ${r[1]} / ${r[2]} / ${r[3]}`));
  if (!list.length) console.log('No counts yet.');
}

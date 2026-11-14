/**
 * One Caribbean We Outside – weekly email (Sunday evening)
 * --------------------------------------------------------
 * Every Sunday at about 6 PM Jamaica time, emails you a summary of the last 7 days:
 *   • visits and page views for islandsoutside.com, active. and marine. (Cloudflare Web Analytics)
 *   • the most-visited island pages, where visitors came from, countries and phone vs computer
 *   • the most-used places from the anonymous place tally (Tally.gs)
 *   • lightning watch: Xweather units used in the last 7 days and this billing cycle (resets on the 9th)
 * It goes to the Google account that owns this script.
 *
 * Setup (once), in the Wx-Exercise5day project:
 *  1. Add this file (WeeklyReport.gs). Tally.gs must already be in the project.
 *  2. In Cloudflare: My Profile → API Tokens → Create Token → Custom token, with one READ-ONLY permission:
 *        Analytics & Logs · Account Analytics · Read
 *     Account Resources: your account. Copy the token.
 *  3. Your Account ID: Cloudflare dashboard → any domain → Overview → right-hand column "Account ID".
 *  4. Project Settings → Script Properties: CF_API_TOKEN = the token, CF_ACCOUNT_ID = the Account ID.
 *     (Never paste the token anywhere else.)
 *  5. Run testWeeklyReport() and allow the email permission. The email arrives within a minute.
 *  6. Run installWeeklyReportTrigger().
 */

const WR = {
  TZ: 'America/Jamaica',
  SITES: [                                         // host → label (matched against your Web Analytics sites)
    ['islandsoutside.com', 'Home (One Caribbean)'],
    ['active.islandsoutside.com', 'Active (run, ride, swim)'],
    ['marine.islandsoutside.com', 'Marine Weather'],
  ],
  ISLAND_PATHS: [['/cayman/', 'Cayman'], ['/barbados/', 'Barbados'], ['/trinidad/', 'Trinidad'], ['/grenada/', 'Grenada'], ['/', 'Jamaica']],
  GQL: 'https://api.cloudflare.com/client/v4/graphql',
};

function weeklyReport() {
  const props = PropertiesService.getScriptProperties();
  const token = (props.getProperty('CF_API_TOKEN') || '').trim(), account = (props.getProperty('CF_ACCOUNT_ID') || '').trim();
  const now = new Date(), weekAgo = new Date(now.getTime() - 7 * 86400000), twoWeeksAgo = new Date(now.getTime() - 14 * 86400000);
  const fmt = d => Utilities.formatDate(d, WR.TZ, 'EEE d MMM');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const parts = [];

  // ---- Visits (Cloudflare Web Analytics) ----
  if (!token || !account) {
    parts.push('<p><b>Visits:</b> add CF_API_TOKEN and CF_ACCOUNT_ID in Script Properties to include Cloudflare numbers.</p>');
  } else {
    const islandViews = {}, refs = {}, countries = {}, devices = {};
    const rows = [];
    for (const [host, label] of WR.SITES) {
      try {
        // Looked up by web address, so the token only needs Account Analytics: Read.
        const cur = wrQuery_(token, account, host, weekAgo, now), prev = wrQuery_(token, account, host, twoWeeksAgo, weekAgo);
        const change = prev.views ? Math.round((cur.views - prev.views) / prev.views * 100) : null;
        rows.push([label, cur.visits != null ? cur.visits : '–', cur.views, change == null ? 'new' : (change >= 0 ? '+' : '') + change + '% vs last week']);
        cur.paths.forEach(([p, n]) => {
          if (host === 'active.islandsoutside.com') { const isl = WR.ISLAND_PATHS.find(([pre]) => p === pre || (pre !== '/' && p.indexOf(pre) === 0) || (pre === '/' && /^\/(index\.html)?(\?.*)?$/.test(p))); if (isl) islandViews[isl[1]] = (islandViews[isl[1]] || 0) + n; }
        });
        cur.refs.forEach(([r, n]) => { if (/islandsoutside\.com$/.test(r)) return; const k = r === '(none)' ? 'Direct or app (no link)' : r; refs[k] = (refs[k] || 0) + n; });
        cur.countries.forEach(([c, n]) => { countries[c] = (countries[c] || 0) + n; });
        cur.devices.forEach(([d, n]) => { devices[d] = (devices[d] || 0) + n; });
      } catch (e) { rows.push([label, '–', '–', 'error: ' + esc(e.message).slice(0, 120)]); }
    }
    const top = (o, n) => Object.keys(o).map(k => [k, o[k]]).sort((a, b) => b[1] - a[1]).slice(0, n);
    parts.push('<h3 style="margin:18px 0 6px">Visits</h3>' + wrTable_(['Site', 'Visits', 'Page views', 'Trend'], rows));
    if (Object.keys(islandViews).length) parts.push('<h3 style="margin:18px 0 6px">Island pages (page views)</h3>' + wrTable_(['Island', 'Views'], top(islandViews, 10)));
    if (Object.keys(refs).length) parts.push('<h3 style="margin:18px 0 6px">Where visitors came from</h3>' + wrTable_(['Site', 'Page views'], top(refs, 8)));
    if (Object.keys(countries).length) parts.push('<h3 style="margin:18px 0 6px">Countries</h3>' + wrTable_(['Country', 'Page views'], top(countries, 8)));
    if (Object.keys(devices).length) parts.push('<p style="margin:10px 0">Devices: ' + top(devices, 5).map(([d, n]) => `${esc(d)} ${n}`).join(' · ') + '</p>');
  }

  // ---- Places (anonymous tally) ----
  try {
    const places = wrTally_(props, 7);
    parts.push('<h3 style="margin:18px 0 6px">Most-used places</h3>' + (places.length
      ? wrTable_(['Place', 'Opened', 'Picked', 'Mode switches'], places.slice(0, 15))
      : '<p>No place counts yet.</p>'));
  } catch (e) { parts.push(`<p><b>Places:</b> ${esc(e.message)}</p>`); }

  // ---- Lightning watch (Xweather units) ----
  try { parts.push(wrLightning_(props, fmt)); } catch (e) { parts.push(`<p><b>Lightning watch:</b> ${esc(e.message)}</p>`); }

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1f252b;max-width:640px">
    <h2 style="margin:0 0 4px">One Caribbean We Outside – your week</h2>
    <p style="margin:0;color:#5b6570">${fmt(weekAgo)} – ${fmt(now)}</p>${parts.join('')}
    <p style="margin:22px 0 0;color:#8a939c;font-size:12px">Sent by the Wx-Exercise5day Apps Script every Sunday evening. Visit counts come from Cloudflare Web Analytics; place counts are anonymous.</p></div>`;
  MailApp.sendEmail({to: Session.getEffectiveUser().getEmail(), subject: 'One Caribbean We Outside – week to ' + fmt(now), htmlBody: html});
}

/** Xweather units (what Xweather bills: each request × its multiplier) for the last 7 days and this billing cycle. */
function wrLightning_(props, fmt) {
  let log = {}; try { log = JSON.parse(props.getProperty('LW_DAYLOG') || '{}'); } catch (e) {}
  const names = {JM: 'Jamaica', TT: 'Trinidad', tracks: 'Storm tracks'};
  const since = Utilities.formatDate(new Date(Date.now() - 7 * 86400000), WR.TZ, 'yyyy-MM-dd');
  const week = {}; let weekTotal = 0;
  Object.keys(log).filter(d => d > since).forEach(d => Object.keys(log[d]).forEach(b => { week[b] = (week[b] || 0) + log[d][b]; weekTotal += log[d][b]; }));
  const used = Number(props.getProperty('LW_USED') || 0), cap = Number(props.getProperty('LIGHTNING_MONTHLY_CAP') || 14000);
  const remaining = props.getProperty('LW_XW_REMAINING'), until = Number(props.getProperty('LW_PAUSED_UNTIL') || 0);
  const n = v => Number(v).toLocaleString();
  const lines = [];
  const paused = until > Date.now();
  lines.push(weekTotal ? `Last 7 days: <b>${n(weekTotal)} units</b> (` + Object.keys(week).sort().map(b => `${names[b] || b} ${n(week[b])}`).join(' · ') + ')'
    : `Last 7 days: no units used${paused ? ' (no checks ran while paused)' : ''}.`);
  lines.push(`This billing cycle (since the 9th), as counted by the script: ${n(used)} units · it stops at ${n(cap)}` + (remaining != null ? ` · Xweather says ${n(remaining)} left` : '') +
    '. Xweather\'s dashboard has the official figure.');
  if (paused) lines.push(`Paused: Xweather's free allowance is used up. It tries again every 6 hours (next ${Utilities.formatDate(new Date(until), WR.TZ, 'EEE d MMM h:mm a')}) and resumes when the allowance resets on the 9th.`);
  return '<h3 style="margin:18px 0 6px">Lightning watch (Xweather)</h3><p style="margin:0;line-height:1.6">' + lines.join('<br>') + '</p>';
}

function wrTable_(head, rows) {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const th = head.map((h, i) => `<th style="text-align:${i ? 'right' : 'left'};padding:4px 8px;border-bottom:2px solid #e3e6e9">${esc(h)}</th>`).join('');
  const tr = rows.map(r => '<tr>' + r.map((c, i) => `<td style="text-align:${i ? 'right' : 'left'};padding:4px 8px;border-bottom:1px solid #eef0f2">${esc(typeof c === 'number' ? c.toLocaleString() : c)}</td>`).join('') + '</tr>').join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:13px"><tr>${th}</tr>${tr}</table>`;
}

/** One site, one period: totals plus top pages, referrers, countries and devices. */
function wrQuery_(token, account, host, from, to) {
  const f = `{requestHost: "${host}", datetime_geq: "${from.toISOString()}", datetime_lt: "${to.toISOString()}"}`;
  const group = (alias, dim) => `${alias}: rumPageloadEventsAdaptiveGroups(filter: ${f}, limit: 10, orderBy: [count_DESC]) { count dimensions { ${dim} } }`;
  const body = withVisits => `query { viewer { accounts(filter: {accountTag: "${account}"}) {
    total: rumPageloadEventsAdaptiveGroups(filter: ${f}, limit: 1) { count ${withVisits ? 'sum { visits }' : ''} }
    ${group('paths', 'requestPath')} ${group('refs', 'refererHost')} ${group('countries', 'countryName')} ${group('devices', 'deviceType')}
  } } }`;
  const run = q => JSON.parse(UrlFetchApp.fetch(WR.GQL, {method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: {Authorization: 'Bearer ' + token}, payload: JSON.stringify({query: q})}).getContentText());
  let j = run(body(true));
  if (j.errors && j.errors.length && /visits|sum/i.test(j.errors[0].message || '')) j = run(body(false));
  if (j.errors && j.errors.length) throw Error(j.errors[0].message);
  const a = j.data.viewer.accounts[0] || {};
  const pairs = (list, dim) => (list || []).map(g => [g.dimensions[dim] || '(none)', g.count]);
  const t = (a.total || [])[0] || {};
  return {views: t.count || 0, visits: t.sum ? t.sum.visits : null,
    paths: pairs(a.paths, 'requestPath'), refs: pairs(a.refs, 'refererHost'), countries: pairs(a.countries, 'countryName'), devices: pairs(a.devices, 'deviceType')};
}

/** Place tally totals for the last N days: [[label, opened, picked, mode], …] most used first. */
function wrTally_(props, days) {
  const since = Utilities.formatDate(new Date(Date.now() - days * 86400000), WR.TZ, 'yyyy-MM-dd');
  const names = {JM: 'Jamaica', KY: 'Cayman', BB: 'Barbados', TT: 'Trinidad', GD: 'Grenada'};
  const totals = {};
  const add = (t, m, p, c) => { if (t === 'XX') return; const k = `${names[t] || t} · ${m === 'swim' ? 'Swim' : 'Run & Ride'} · ${p}`; const r = totals[k] || [0, 0, 0]; for (let i = 0; i < 3; i++) r[i] += Number(c[i]) || 0; totals[k] = r; };
  const id = props.getProperty('TALLY_SHEET_ID');
  if (id) {
    const sh = SpreadsheetApp.openById(id).getSheetByName('Daily');
    if (sh && sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues().forEach(r => {
      const day = r[0] instanceof Date ? Utilities.formatDate(r[0], WR.TZ, 'yyyy-MM-dd') : String(r[0]);
      if (day >= since) add(r[1], r[2], r[3], [r[4], r[5], r[6]]);
    });
  }
  const d = JSON.parse(props.getProperty('TALLY_TODAY') || '{}');
  Object.keys(d.c || {}).forEach(k => { const [t, m, p] = k.split('|'); add(t, m, p, d.c[k]); });
  return Object.keys(totals).map(k => [k].concat(totals[k])).sort((a, b) => (b[1] + b[2]) - (a[1] + a[2]));
}

function testWeeklyReport() { weeklyReport(); console.log('Sent to ' + Session.getEffectiveUser().getEmail()); }

/** Run once: every Sunday at about 6 PM Jamaica time. */
function installWeeklyReportTrigger() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'weeklyReport').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('weeklyReport').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(18).inTimezone(WR.TZ).create();
  console.log('Weekly report trigger installed: Sundays at about 6 PM Jamaica time.');
}

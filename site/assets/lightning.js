// Lightning watch: reads the Apps Script feed and works out distance on this device.
// The visitor's GPS position is never sent anywhere.
(() => {
  'use strict';
  const me = document.currentScript;
  const URL_ = me && me.dataset.url;
  const box = document.getElementById('lightning');
  if (!box || !URL_) return;                       // feature off until the feed URL is set

  const store = {get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }};
  const P = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const BOLT = P('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'), GPS = P('<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="7"/>');
  const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const STALE_MIN = 15;
  // Areas the lightning feed checks (the feed can send its own list). A place must sit well inside one.
  const COVER = [[18.15, -77.75], [18.10, -76.80]], COVER_KM = 100, EDGE_KM = 20;
  const covered = ref => (feed && Array.isArray(feed.circles) ? feed.circles : COVER).some(([la, lo]) => km(ref.lat, ref.lon, la, lo) <= ((feed && feed.radiusKm) || COVER_KM) - EDGE_KM);

  let feed = null, place = null, gps = null, useGps = store.get('jwa.gps', '0') === '1', gpsMsg = '';

  const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const bearing = (a, b, c, d) => { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; };
  const dir = deg => COMPASS[Math.round(deg / 45) % 8];
  const clock = ms => new Intl.DateTimeFormat('en-US', {timeZone: document.documentElement.dataset.tz || 'America/Jamaica', hour: 'numeric', minute: '2-digit'}).format(new Date(ms));
  const ago = min => min < 1 ? 'just now' : `${Math.round(min)} min ago`;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

  function assess(ref) {
    const now = Date.now();
    const pts = feed.cells.map(([la, lo, ts, n, cg]) => ({d: km(ref.lat, ref.lon, la, lo), b: bearing(ref.lat, ref.lon, la, lo), age: (now - ts * 1000) / 60000, ts: ts * 1000, n, cg}))
      .filter(p => p.age <= 45);
    const within = (dk, m) => pts.filter(p => p.d <= dk && p.age <= m);
    const nearest = list => list.reduce((a, p) => !a || p.d < a.d ? p : a, null);
    const close = within(10, 30);
    if (close.length) {
      const last = Math.max(...close.map(p => p.ts)), n = nearest(close);
      return {level: 'danger', title: 'Lightning close. Get indoors now.',
        text: `Strikes ${Math.max(1, Math.round(n.d))} km to the ${dir(n.b)}, last one ${ago((now - last) / 60000)}. Wait 30 minutes after the last close strike: earliest all clear ${clock(last + 30 * 60000)}.`};
    }
    const near = within(20, 20);
    if (near.length) { const n = nearest(near); return {level: 'warn', title: 'Storm nearby. Head back now.', text: `Lightning ${Math.round(n.d)} km to the ${dir(n.b)}, ${ago(n.age)}. Storms can move 10 km in 15 minutes.`}; }
    const watch = within(40, 30);
    if (watch.length) { const n = nearest(watch), count = watch.reduce((s, p) => s + p.n, 0); return {level: 'watch', title: `Storms ${Math.round(n.d)} km to the ${dir(n.b)}.`, text: `${count} strike${count === 1 ? '' : 's'} within 40 km in the last 30 minutes. Keep an eye on the sky and know where you'd shelter.`}; }
    return {level: 'clear', title: 'No lightning within 40 km.', text: 'Nothing detected in the last 30 minutes.'};
  }

  // Storm tracks (Xweather Lightning Threats): where each storm is expected over the next hour, in 10-minute areas.
  const inRing = (la, lo, ring) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [ai, bi] = ring[i], [aj, bj] = ring[j]; if ((bi > lo) !== (bj > lo) && la < (aj - ai) * (lo - bi) / (bj - bi) + ai) inside = !inside; } return inside; };
  const nearRing = (la, lo, ring) => Math.min(...ring.map(([a, b]) => km(la, lo, a, b)));
  function track(ref) {
    const t = feed && feed.threats;
    if (!t || !Array.isArray(t.storms) || !t.storms.length) return null;
    const now = Date.now() / 1000;
    let hit = null, near = null;
    for (const st of t.storms) {
      for (const [t0, t1, ring] of st.periods) {
        if (!ring || ring.length < 3 || t1 < now) continue;
        if (inRing(ref.lat, ref.lon, ring) || nearRing(ref.lat, ref.lon, ring) <= 3) {
          if (!hit || t0 < hit.t0) hit = {st, t0};
          break;
        }
      }
      const d = Math.min(...st.periods.filter(p => p[1] >= now).map(p => nearRing(ref.lat, ref.lon, p[2])));
      if (isFinite(d) && (!near || d < near.d)) near = {st, d};
    }
    const moving = st => st.kph != null && st.dirToDEG != null ? `moving ${dir(st.dirToDEG)} at ${st.kph} km/h` : 'on the move';
    if (hit) {
      const min = Math.max(0, (hit.t0 - now) / 60);
      return {eta: min, line: `Storm ${moving(hit.st)}, ${min < 7 ? 'likely over you within minutes' : `likely to reach you in about ${Math.round(min / 5) * 5} minutes`}${hit.st.severe ? ' (a strong storm)' : ''}.`};
    }
    if (near && near.d <= 40 && /HIGH|MEDIUM/.test(near.st.reliability || '')) return {eta: null, line: `The nearest storm is ${moving(near.st)}; its forecast track keeps it away from you for the next hour.`};
    return null;
  }

  function render() {
    if (!place && !gps) return;
    const ref = useGps && gps ? {lat: gps.lat, lon: gps.lon, name: 'you'} : place;
    if (!ref) return;
    let s;
    const updated = feed && feed.updated ? new Date(feed.updated).getTime() : 0;
    const fresh = feed && feed.status === 'live' && Date.now() - updated < STALE_MIN * 60000;
    if (!feed) s = {level: 'off', title: 'Checking for lightning…', text: ''};
    else if (!covered(ref)) s = {level: 'off', title: 'Lightning watch doesn\'t cover this area yet.', text: 'Live lightning is checked around Jamaica only for now. Watch the sky and listen for thunder.'};
    else if (!fresh) s = {level: 'off', title: 'Lightning watch is off right now.',
      text: feed.status === 'sleeping' ? 'It runs from 5 AM to 8 PM.' : feed.status === 'paused' ? 'It has reached this month\'s data limit and restarts on the 1st.' : feed.status === 'unknown' ? 'It is starting up. The first check runs within 5 minutes.' : 'Live lightning data isn\'t available at the moment.'};
    else s = assess(ref);
    const where = useGps && gps ? 'your location' : esc(ref.name);
    const tr = fresh && covered(ref) ? track(ref) : null;
    if (tr) {
      const line = useGps && gps ? tr.line : tr.line.replace(/\byou\b/g, ref.name);
      if (s.level === 'clear' && tr.eta != null) s = {level: 'watch', title: 'Storm heading your way.', text: line + ' Plan to be indoors before it arrives.'};
      else if (s.level !== 'clear' && s.level !== 'off') s = {...s, text: s.text + ' ' + line};
    }
    const gpsBtn = `<button type="button" class="lw-gps" aria-pressed="${useGps && !!gps}">${GPS}<span>${useGps && gps ? 'Using your location' : 'Use my location'}</span></button>`;
    // Nothing nearby (or watch not running): one slim line, so the forecast cards come first.
    if (s.level === 'clear' || s.level === 'off') {
      const sub = s.level === 'clear' ? `${where}${fresh ? ` · updated ${clock(updated)}` : ''}` : (s.text || where);
      box.className = 'lightning lw-slim lw-' + s.level;
      box.innerHTML = `<div class="lw-icon">${BOLT}</div><div class="lw-body"><h2>${esc(s.title)}</h2><p class="lw-kicker">${gpsMsg ? esc(gpsMsg) + ' · ' : ''}${sub}</p></div>${s.level === 'clear' ? gpsBtn : ''}`;
      const b = box.querySelector('.lw-gps'); if (b) b.addEventListener('click', toggleGps);
      box.hidden = false;
      return;
    }
    box.className = 'lightning lw-' + s.level;
    box.innerHTML = `
      <div class="lw-icon">${BOLT}</div>
      <div class="lw-body">
        <p class="lw-kicker">Lightning watch · ${where}${fresh && covered(ref) ? ` · updated ${clock(updated)}` : ''}</p>
        <h2>${esc(s.title)}</h2>
        ${s.text ? `<p>${esc(s.text)}</p>` : ''}
        <p class="lw-note">${gpsMsg ? esc(gpsMsg) + ' ' : ''}No detector catches every strike. If you hear thunder, you're close enough to be struck.</p>
      </div>
      ${gpsBtn}`;
    box.querySelector('.lw-gps').addEventListener('click', toggleGps);
    box.hidden = false;
  }

  function locate() {
    if (!navigator.geolocation) { gpsMsg = 'Location isn\'t available on this device.'; useGps = false; render(); return; }
    navigator.geolocation.getCurrentPosition(p => { gps = {lat: p.coords.latitude, lon: p.coords.longitude}; gpsMsg = ''; render(); },
      () => { useGps = false; store.set('jwa.gps', '0'); gpsMsg = 'Location was not shared, so this uses the place you picked.'; render(); },
      {enableHighAccuracy: false, timeout: 15000, maximumAge: 120000});
  }
  function toggleGps() {
    useGps = !(useGps && gps); store.set('jwa.gps', useGps ? '1' : '0');
    if (useGps) locate(); else { gps = null; gpsMsg = ''; render(); }
  }

  async function pull() {
    try { const r = await fetch(URL_, {cache: 'no-store'}); if (r.ok) feed = await r.json(); } catch {}
    if (useGps) locate(); else render();
  }

  document.addEventListener('jwa:place', e => { place = e.detail; render(); });
  pull();
  setInterval(() => { if (!document.hidden) pull(); }, 2 * 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
})();

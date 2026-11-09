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

  let feed = null, place = null, gps = null, useGps = store.get('jwa.gps', '0') === '1', gpsMsg = '';

  const km = (a, b, c, d) => { const r = Math.PI / 180, x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2; return 12742 * Math.asin(Math.sqrt(x)); };
  const bearing = (a, b, c, d) => { const r = Math.PI / 180, y = Math.sin((d - b) * r) * Math.cos(c * r), x = Math.cos(a * r) * Math.sin(c * r) - Math.sin(a * r) * Math.cos(c * r) * Math.cos((d - b) * r); return (Math.atan2(y, x) / r + 360) % 360; };
  const dir = deg => COMPASS[Math.round(deg / 45) % 8];
  const clock = ms => new Intl.DateTimeFormat('en-US', {timeZone: 'America/Jamaica', hour: 'numeric', minute: '2-digit'}).format(new Date(ms));
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

  function render() {
    if (!place && !gps) return;
    const ref = useGps && gps ? {lat: gps.lat, lon: gps.lon, name: 'you'} : place;
    if (!ref) return;
    let s;
    const updated = feed && feed.updated ? new Date(feed.updated).getTime() : 0;
    const fresh = feed && feed.status === 'live' && Date.now() - updated < STALE_MIN * 60000;
    if (!feed) s = {level: 'off', title: 'Checking for lightning…', text: ''};
    else if (!fresh) s = {level: 'off', title: 'Lightning watch is off right now.',
      text: feed.status === 'sleeping' ? 'It runs from 4 AM to 9 PM.' : feed.status === 'paused' ? 'It has reached this month\'s data limit and restarts on the 1st.' : feed.status === 'unknown' ? 'It is starting up. The first check runs within 5 minutes.' : 'Live lightning data isn\'t available at the moment.'};
    else s = assess(ref);
    const where = useGps && gps ? 'your location' : esc(ref.name);
    box.className = 'lightning lw-' + s.level;
    box.innerHTML = `
      <div class="lw-icon">${BOLT}</div>
      <div class="lw-body">
        <p class="lw-kicker">Lightning watch · ${where}${fresh ? ` · updated ${clock(updated)}` : ''}</p>
        <h2>${esc(s.title)}</h2>
        ${s.text ? `<p>${esc(s.text)}</p>` : ''}
        <p class="lw-note">${gpsMsg ? esc(gpsMsg) + ' ' : ''}No detector catches every strike. If you hear thunder, you're close enough to be struck.</p>
      </div>
      <button type="button" class="lw-gps" aria-pressed="${useGps && !!gps}">${GPS}<span>${useGps && gps ? 'Using your location' : 'Use my location'}</span></button>`;
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

(() => {
  'use strict';
  const TZ = 'America/Jamaica';
  const $ = id => document.getElementById(id);
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  // Simple line icons (24×24, drawn for this site).
  const P = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    bike: P('<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-7h5l3 7M10 9l3 7h-3M14 6h2"/>'),
    pin: P('<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
    sunrise: P('<path d="M17 18a5 5 0 0 0-10 0M12 3v6M8.5 6.5 12 3l3.5 3.5M3 18h18M4.2 12.2l1.4 1.4M18.4 13.6l1.4-1.4"/>'),
    sunset: P('<path d="M17 18a5 5 0 0 0-10 0M12 9V3M8.5 5.5 12 9l3.5-3.5M3 18h18M4.2 12.2l1.4 1.4M18.4 13.6l1.4-1.4"/>'),
    thermo: P('<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'),
    drop: P('<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>'),
    rain: P('<path d="M7 15a4 4 0 0 1-.6-7.96A5 5 0 0 1 16 6a4 4 0 0 1 1 7.9"/><path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2"/>'),
    wind: P('<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h7"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
    leaf: P('<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19c3-4 6-6 10-8"/>'),
    clock: P('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    light: P('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>'),
    bottle: P('<path d="M10 2h4M10.5 2v3L8 8v13h8V8l-2.5-3V2"/><path d="M8 12h8"/>'),
    cap: P('<path d="M3 15c0-5 4-9 9-9s9 4 9 9H3z"/><path d="M3 15h18l-3 3H6z"/>'),
    bolt: P('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
    road: P('<path d="M7 21 10 3M17 21 14 3M12 6v2M12 11v2M12 16v2"/>'),
    feels: P('<path d="M10 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M14 8c1.5 1 1.5 3 0 4M17 6c3 2 3 6 0 8"/>'),
    arrow: P('<path d="M12 20V4M6 10l6-6 6 6"/>'),
    compass: P('<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13.5 13.5 8.5 15.5 10.5 10.5z"/>'),
    heart: P('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M5 12h3l2-3 2 5 2-2h5"/>'),
    swim: P('<path d="M2 18c2 0 2-1.5 4-1.5S8 18 10 18s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><path d="M2 21.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5"/><circle cx="16.5" cy="6.5" r="2"/><path d="M5 14.5 10 9l3 2.5 2-2"/>'),
    wave: P('<path d="M2 12c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 17c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/><path d="M2 7c2 0 2-2 4-2s2 2 4 2 2-2 4-2 2 2 4 2 2-2 4-2"/>'),
    rip: P('<path d="M3 20c2-2 3-2 5 0M16 20c2-2 3-2 5 0"/><path d="M12 21V5M8 9l4-4 4 4"/>'),
    current: P('<path d="M3 9h12a3 3 0 0 0 0-6M3 15h14a3 3 0 0 1 0 6M3 12h18M18 9l3 3-3 3"/>'),
    flask: P('<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7 15h10"/>'),
    float: P('<rect x="7" y="3" width="10" height="15" rx="5"/><path d="M12 18v3M9 9h6"/>'),
    smile: P('<circle cx="12" cy="12" r="9"/><path d="M8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01"/>'),
  };
  const icon = name => { const s = document.createElement('span'); s.className = 'ico'; s.innerHTML = ICONS[name] || ''; return s; };
  document.querySelectorAll('[data-icon]').forEach(n => { n.innerHTML = ICONS[n.dataset.icon] || ''; });

  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (v != null) n.setAttribute(k, v); }
    kids.flat().forEach(k => k != null && n.append(k));
    return n;
  };
  const jaNow = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'}).formatToParts(new Date()).map(x => [x.type, x.value])); return {date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) + Number(p.minute) / 60}; };
  const dayName = (iso, opts) => new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', ...opts}).format(new Date(iso + 'T12:00:00Z'));
  const clock = hm => { if (!hm) return '—'; let [h, m] = hm.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const hours = hm => { const [h, m] = (hm || '0:0').split(':').map(Number); return h + m / 60; };
  const WORD = {go: 'Go', caution: 'Take care', avoid: 'Skip it'};
  const COLOR = {go: '#1f9d55', caution: '#e08a00', avoid: '#d63b2f'};
  const WIN = {am: {label: 'Morning', times: '4:30–7:00 AM', start: 4.5, end: 7, icon: 'sunrise'}, pm: {label: 'Evening', times: '4:30–6:30 PM', start: 16.5, end: 18.5, icon: 'sunset'}};
  const compass = d => d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8];
  const wmo = c => ({0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'})[c] || '—';

  // Score ring.
  function ring(n, b, size = 64, light = false) {
    const r = size / 2 - 6, c = 2 * Math.PI * r, frac = Math.max(0, Math.min(10, n)) / 10;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'ring'); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${n} out of 10, ${WORD[b]}`);
    svg.innerHTML = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${light ? 'rgba(255,255,255,.25)' : '#ececf1'}" stroke-width="7"/>`
      + (frac > 0 ? `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${COLOR[b]}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c * frac} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>` : '')
      + `<text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" font-size="${size * 0.36}" fill="${light ? '#fff' : '#242428'}">${n}</text>`;
    return svg;
  }

  // Two modes: run & ride (one shared score, the email's mixed mode) and swim (sea or pool).
  // Each island has its own page (index.html = Jamaica, cayman/ = Cayman Islands …), set by <html data-territory>.
  const TERR = document.documentElement.dataset.territory || 'JM';
  let mode = store.get('jwa.mode', 'land') === 'swim' ? 'swim' : 'land';
  const placeKey = () => TERR === 'JM' ? (mode === 'swim' ? 'jwa.swimPlace' : 'rr.place') : `jwa.${TERR}.${mode}Place`;
  let data = null, place = store.get(placeKey(), ''), dayIdx = 0;
  let sport = mode === 'swim' ? 'swim' : 'mixed';
  const inMode = l => (l.territory || 'JM') === TERR && (mode === 'swim' ? l.sport === 'swim' : l.sport !== 'swim');
  const places = () => data ? data.locations.filter(inMode) : [];
  const loc = () => { const list = places(); return list.find(l => l.key === place) || list[0]; };
  const SWIM_WIN = {am: {label: 'Morning', times: '5:30–8:00 AM', start: 5.5, end: 8, icon: 'sunrise'}, pm: {label: 'Evening', times: '4:30–6:30 PM', start: 16.5, end: 18.5, icon: 'sunset'}};
  const W = () => mode === 'swim' ? SWIM_WIN : WIN;

  // Practical, friendly tips for a window (max 3), from the forecast numbers.
  function tips(key, w, day) {
    const m = w.metrics || {}, out = [];
    const sunrise = hours(day.sunrise), sunset = hours(day.sunset);
    if (key === 'am' && day.sunrise && W().am.start < sunrise) out.push(['light', `It's dark until ${clock(day.sunrise)}. Wear something bright; riders, lights on front and back.`]);
    if (key === 'pm' && day.sunset && W().pm.end > sunset) out.push(['light', `Sunset is ${clock(day.sunset)}. Be seen on the way home; riders, pack lights.`]);
    if (m.lightningPct >= 50) out.push(['bolt', 'Thunder is forecast. Stay close to shelter, or take it indoors.']);
    else if (m.thunderHours > 0) out.push(['bolt', 'A thunderstorm is possible. Keep an eye on the sky and know where to shelter.']);
    else if (m.precipPct >= 50) out.push(['road', 'Showers likely. Watch for slippery spots; riders, brake earlier and avoid painted lines.']);
    if (m.wbgt >= 28) out.push(['bottle', 'Heat stress risk. Go shorter, sip water often, rest in the shade.']);
    else if (m.dewPointC >= 24 || (m.rh >= 80 && m.tempC >= 28)) out.push(['bottle', `Warm, humid air (${m.rh}% at ${Math.round(m.tempC)}°C). Bring water and ease the pace a little.`]);
    if (m.uvEffective >= 6) out.push(['cap', 'Strong sun. Cap, sunglasses and sunscreen.']);
    if (m.windGustKmh >= 30 || m.gustDelta >= 10) out.push(['wind', `Gusts to ${m.windGustKmh} km/h. Riders, keep a firm grip on descents.`]);
    if (w.air && w.air.hasData && w.air.aqi > 50) out.push(['leaf', `Air quality is ${w.air.category.toLowerCase()}. Take it easier if you're sensitive.`]);
    if (!out.length || (out.length === 1 && out[0][0] === 'light' && w.scores[sport].band === 'go')) out.push(['smile', 'Conditions look kind. Enjoy getting out!']);
    return out.slice(0, 3);
  }

  function hero() {
    const L = loc(); if (!L) return;
    const now = jaNow();
    const greet = now.hour < 12 ? 'Good morning' : now.hour < 17 ? 'Good afternoon' : 'Good evening';
    $('greeting').textContent = `${greet}, ${L.name}`;
    // Upcoming windows over the next ~day and a half.
    const upcoming = [];
    L.days.slice(0, 3).forEach((d, di) => ['am', 'pm'].forEach(k => {
      const w = d.windows[k], s = w && w.scores && w.scores[sport];
      if (!s || !w.metrics) return;
      if (d.date === now.date && W()[k].end <= now.hour) return;
      upcoming.push({d, di, k, s, w});
    }));
    const next = upcoming[0];
    if (!next) { $('headline').textContent = 'No forecast yet for your next window.'; $('next').hidden = true; return; }
    const when = x => `${x.d.date === now.date ? (x.k === 'am' ? 'This morning' : 'This evening') : x.di === 1 || x.d.date > now.date ? (x.k === 'am' ? (x.d.date === nextDate(now.date) ? 'Tomorrow morning' : dayName(x.d.date, {weekday: 'long'}) + ' morning') : (x.d.date === nextDate(now.date) ? 'Tomorrow evening' : dayName(x.d.date, {weekday: 'long'}) + ' evening')) : ''}`;
    const best = upcoming.slice(0, 3).reduce((a, b) => b.s.index > a.s.index ? b : a, next);
    $('headline').textContent = next.s.band === 'go' ? `Great time ${mode === 'swim' ? 'for a swim' : 'to get out'}: ${when(next).toLowerCase()}.` : next.s.band === 'caution' ? `${when(next)} is doable, with care.` : `${when(next)} looks rough. Plan around it.`;
    const box = $('next');
    box.replaceChildren(ring(next.s.index, next.s.band, 60, true),
      el('div', {}, el('strong', {}, `${when(next)} · ${W()[next.k].times}`), el('span', {}, next.s.advice),
        best !== next && best.s.index > next.s.index ? el('span', {}, el('em', {}, `Better: ${when(best).toLowerCase()} (${best.s.index}/10)`)) : null));
    box.hidden = false;
  }
  const nextDate = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

  function renderDays() {
    const L = loc(); if (!L) return;
    const today = jaNow().date;
    $('days').replaceChildren(...L.days.map((d, i) => {
      const dot = k => { const s = d.windows[k]?.scores?.[sport]; return el('span', {class: 'dot ' + (s ? s.band : 'none'), title: `${W()[k].label}: ${s ? s.index + '/10, ' + WORD[s.band] : 'no data'}`}, s ? String(s.index) : '–'); };
      const b = el('button', {type: 'button', class: 'day', 'aria-pressed': String(i === dayIdx), 'aria-label': `${dayName(d.date, {weekday: 'long', day: 'numeric', month: 'long'})}`},
        el('b', {}, d.date === today ? 'Today' : dayName(d.date, {weekday: 'short'})),
        el('small', {}, dayName(d.date, {day: 'numeric', month: 'short'})),
        el('span', {class: 'dots'}, dot('am'), dot('pm')));
      b.addEventListener('click', () => { dayIdx = i; render(); });
      return b;
    }));
  }

  const COMPASS16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const NAMES = {N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west'};
  const feelsWord = m => { const f = m.feelsC ?? m.heatIndexC, t = m.tempC; if (f == null) return ''; if (f - t >= 3) return 'hotter than it reads'; if (f >= 32) return 'hot'; if (f >= 28) return 'warm'; if (f >= 22) return 'pleasant'; return 'cool'; };
  // Wind direction: an arrow pointing where the wind is going, labelled with where it comes from.
  function windDir(deg) {
    if (deg == null) return stat('compass', 'Wind from', '—');
    const c16 = COMPASS16[Math.round(deg / 22.5) % 16], c8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
    const arrow = el('span', {class: 'ico dir', title: `Wind from the ${NAMES[c8]}`});
    arrow.innerHTML = ICONS.arrow; arrow.style.transform = `rotate(${(deg + 180) % 360}deg)`;
    return el('div', {class: 'stat'}, arrow, el('dl', {}, el('dt', {}, 'Wind from'), el('dd', {}, c16, el('small', {}, `${NAMES[c8]} · ${deg}°`))));
  }
  // Which tile each "Why this score" reason belongs to, so those tiles can be shaded.
  const REASON_TILE = [[/thunder|rain|wet from|downpour/i, 'rain'], [/heat stress/i, 'feels'], [/humid|sticky|oppressive/i, 'humidity'],
    [/hot|warm/i, 'temp'], [/windy|gust/i, 'wind'], [/sun/i, 'uv'], [/air quality/i, 'air']];
  const flaggedTiles = reasons => new Set(reasons.flatMap(r => REASON_TILE.filter(([re]) => re.test(r)).slice(0, 1).map(([, k]) => k)));
  let FLAG = new Set();
  const stat = (ic, label, value, sub, key) => el('div', {class: 'stat' + (key && FLAG.has(key) ? ' flag' : ''), title: key && FLAG.has(key) ? 'This lowered the score' : null}, icon(ic), el('dl', {}, el('dt', {}, label), el('dd', {}, value ?? '—', sub ? el('small', {}, sub) : null)));

  // Notes for people with asthma or heart conditions (they don't change the score).
  function healthBox(h) {
    if (!h || !h.notes || !h.notes.length) return null;
    return el('div', {class: 'health ' + h.level},
      el('p', {class: 'health-head'}, icon('heart'), el('b', {}, h.level === 'high' ? 'Asthma or heart condition: take extra care' : 'Asthma or heart condition?')),
      el('ul', {}, h.notes.map(n => el('li', {}, n.text))),
      h.stop ? el('p', {class: 'health-stop'}, 'Stop and rest if you feel chest pain, dizziness or unusual breathlessness.') : null);
  }

  function card(key, w, day) {
    const s = w && w.scores && w.scores[sport], m = w && w.metrics;
    const WN = W(), head = el('div', {class: 'when'}, el('h3', {}, icon(WN[key].icon), WN[key].label), el('p', {}, `${WN[key].times}${m && m.condition ? ' · ' + m.condition : ''}`));
    if (mode === 'swim') return swimCard(key, w, day, head);
    if (!s || !m) return el('article', {class: 'win'}, el('div', {class: 'win-top'}, head), el('p', {class: 'why'}, 'No forecast for this window yet.'));
    FLAG = flaggedTiles(s.reasons);
    return el('article', {class: 'win ' + s.band},
      el('div', {class: 'win-top'}, head, ring(s.index, s.band, 64)),
      el('p', {class: 'verdict'}, `${WORD[s.band]} · ${s.advice}`),
      el('ul', {class: 'tips'}, tips(key, w, day).map(([ic, t]) => el('li', {}, icon(ic), el('span', {}, t)))),
      healthBox(w.health),
      s.reasons.length ? el('p', {class: 'why'}, el('b', {}, 'Why this score: '), s.reasons.join(' · '), FLAG.size ? el('span', {class: 'flag-key'}, 'Shaded tiles below lowered the score.') : null) : null,
      el('dl', {class: 'stats'},
        stat('thermo', 'Temperature', `${Math.round(m.tempC)}°C`, `dew point ${Math.round(m.dewPointC)}°C`, 'temp'),
        stat('feels', 'Feels like', `${Math.round(m.feelsC ?? m.heatIndexC)}°C`, feelsWord(m), 'feels'),
        stat('drop', 'Humidity', `${m.rh}%`, m.rh >= 85 && m.tempC >= 30 ? 'hot and humid' : m.rh >= 80 && m.tempC >= 28 ? 'warm and humid' : m.rh >= 75 ? 'normal for Jamaica' : 'comfortable', 'humidity'),
        stat('rain', 'Rain', `${m.precipPct}%`, m.rainAccumMm > 0 ? `${m.rainAccumMm} mm` : 'dry', 'rain'),
        stat('wind', 'Wind', `${m.windKmh} km/h`, m.windGustKmh != null ? `gusts ${m.windGustKmh}` : '', 'wind'),
        windDir(m.windDirDeg),
        stat('sun', 'UV', m.uvEffective ?? '—', m.cloud != null ? `${m.cloud}% cloud` : '', 'uv'),
        stat('leaf', 'Air', w.air && w.air.hasData ? w.air.category : '—', w.air && w.air.hasData ? `AQI ${w.air.aqi}` : '', 'air')));
  }

  // ---------- Swim cards ----------
  const DIR8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  function swimTips(key, w, day) {
    const m = w.metrics || {}, s = w.scores.swim, sea = w.sea, out = [], pool = loc().type === 'pool';
    if (key === 'am' && day.sunrise && SWIM_WIN.am.start < hours(day.sunrise)) out.push(['float', `Low light until ${clock(day.sunrise)}. Bright cap${pool ? '' : ' and a tow float'}.`]);
    if (m.thunderHours > 0) out.push(['bolt', 'Thunder possible. Get out of the water at the first rumble.']);
    if (!pool && (s.rip === 'High' || s.rip === 'Moderate')) out.push(['rip', 'If a rip pulls you out, swim parallel to the shore, then back in.']);
    if (!pool && s.windRel === 'offshore' && m.windKmh >= 15) out.push(['wind', `Offshore wind (${m.windKmh} km/h) can push you out. Stay close to shore.`]);
    if (!pool && s.waterQuality && s.waterQuality !== 'Clean') out.push(['flask', `${s.rain48} mm of rain in the last 48 hours. Keep away from gully and river mouths.`]);
    if (m.uvEffective >= 6) out.push(['cap', 'Strong sun. Water-resistant sunscreen and a rash vest.']);
    if (pool && (m.feelsC ?? 0) >= 30) out.push(['bottle', 'Drink between sets. You still sweat in the pool.']);
    if (!out.length || (out.length === 1 && out[0][0] === 'float' && s.band === 'go')) out.push(['smile', pool ? 'Enjoy your swim!' : 'Enjoy the water, and swim with a buddy.']);
    return out.slice(0, 3);
  }
  function swimCard(key, w, day, head) {
    const s = w && w.scores && w.scores.swim, m = w && w.metrics, L = loc(), pool = L.type === 'pool';
    if (!s || !m || (!pool && !w.sea)) return el('article', {class: 'win'}, el('div', {class: 'win-top'}, head), el('p', {class: 'why'}, 'No forecast for this window yet.'));
    FLAG = new Set(s.flags || []);
    const sea = w.sea || {};
    const windSub = s.windRel ? `${s.windRel}${m.windDirDeg != null ? ' · from ' + compass(m.windDirDeg) : ''}` : (m.windDirDeg != null ? 'from ' + compass(m.windDirDeg) : '');
    const tiles = pool ? [
      stat('thermo', 'Temperature', `${Math.round(m.tempC)}°C`, `humidity ${m.rh}%`, 'temp'),
      stat('feels', 'Feels like', `${Math.round(m.feelsC ?? m.heatIndexC)}°C`, feelsWord(m), 'feels'),
      stat('rain', 'Rain', `${m.precipPct}%`, m.rainAccumMm > 0 ? `${m.rainAccumMm} mm` : 'dry', 'rain'),
      stat('bolt', 'Thunder', m.thunderHours > 0 ? 'Possible' : 'None', m.thunderHours > 0 ? 'pools clear the water' : 'forecast', 'lightning'),
      stat('wind', 'Wind', `${m.windKmh} km/h`, m.windDirDeg != null ? 'from ' + compass(m.windDirDeg) : '', 'wind'),
      stat('sun', 'UV', m.uvEffective ?? '—', m.cloud != null ? `${m.cloud}% cloud` : '', 'uv'),
      stat('sunrise', 'Sunrise', clock(day.sunrise), '', null),
      stat('sunset', 'Sunset', clock(day.sunset), '', null),
    ] : [
      stat('wave', 'Waves', sea.waveM != null ? `${sea.waveM} m` : '—', sea.periodS != null ? `${Math.round(sea.swellPeriodS ?? sea.periodS)} s period` : '', 'waves'),
      stat('wind', 'Wind', `${m.windKmh} km/h`, windSub, 'wind'),
      stat('rip', 'Rip risk', s.rip || '—', s.rip === 'Low' ? 'calm' : s.rip === 'High' ? 'stay out' : 'take care', 'rip'),
      stat('current', 'Current', sea.currentKmh != null ? `${sea.currentKmh} km/h` : '—', sea.currentDirDeg != null ? `to the ${DIR8[Math.round(sea.currentDirDeg / 45) % 8]}` : '', 'current'),
      stat('thermo', 'Sea', sea.seaTempC != null ? `${sea.seaTempC}°C` : '—', sea.seaTempC > 30 ? 'very warm' : 'comfortable', 'sea'),
      stat('flask', 'Water quality', s.waterQuality || '—', s.rain48 != null ? `${s.rain48} mm rain, 48 h` : '', 'water'),
      stat('bolt', 'Thunder', m.thunderHours > 0 ? 'Possible' : 'None', 'forecast', 'lightning'),
      stat('sun', 'UV', m.uvEffective ?? '—', m.cloud != null ? `${m.cloud}% cloud` : '', 'uv'),
    ];
    return el('article', {class: 'win ' + s.band},
      el('div', {class: 'win-top'}, head, ring(s.index, s.band, 64)),
      el('p', {class: 'verdict'}, `${WORD[s.band]} · ${s.advice}`),
      el('ul', {class: 'tips'}, swimTips(key, w, day).map(([ic, t]) => el('li', {}, icon(ic), el('span', {}, t)))),
      s.reasons.length ? el('p', {class: 'why'}, el('b', {}, 'Why this score: '), s.reasons.join(' · '), FLAG.size ? el('span', {class: 'flag-key'}, 'Shaded tiles below lowered the score.') : null) : null,
      el('dl', {class: 'stats'}, ...tiles));
  }

  function renderHourly(day) {
    const WN = W(), inWin = t => { const h = hours(t); return (h >= WN.am.start && h <= WN.am.end) || (h >= WN.pm.start && h <= WN.pm.end); };
    if (mode === 'swim' && loc().type !== 'pool') {
      $('hourly').replaceChildren(
        el('thead', {}, el('tr', {}, ['Time', 'Waves', 'Period', 'Sea', 'Wind', 'Rain', 'UV', 'Sky'].map(h => el('th', {scope: 'col'}, h)))),
        el('tbody', {}, (day.hourly || []).map(r => el('tr', {class: inWin(r.t) ? 'in-window' : ''},
          el('td', {}, clock(r.t)), el('td', {}, r.wave != null ? `${r.wave.toFixed(1)} m` : '—'), el('td', {}, r.period != null ? `${Math.round(r.period)} s` : '—'),
          el('td', {}, r.sst != null ? `${r.sst.toFixed(1)}°` : '—'), el('td', {}, `${Math.round(r.wind)} ${compass(r.dir)}`),
          el('td', {}, `${r.pop ?? '—'}%`), el('td', {}, r.uv != null ? Math.round(r.uv) : '—'), el('td', {}, wmo(r.code))))));
      return;
    }
    $('hourly').replaceChildren(
      el('thead', {}, el('tr', {}, ['Time', 'Temp', 'Feels', 'Humidity', 'Rain', 'mm', 'Wind', 'Gust', 'UV', 'Sky'].map(h => el('th', {scope: 'col'}, h)))),
      el('tbody', {}, (day.hourly || []).map(r => el('tr', {class: inWin(r.t) ? 'in-window' : ''},
        el('td', {}, clock(r.t)), el('td', {}, `${Math.round(r.temp)}°`), el('td', {}, `${Math.round(r.feels)}°`), el('td', {}, `${r.rh}%`),
        el('td', {}, `${r.pop ?? '—'}%`), el('td', {}, (r.mm ?? 0).toFixed(1)), el('td', {}, `${Math.round(r.wind)} ${compass(r.dir)}`),
        el('td', {}, `${Math.round(r.gust)}`), el('td', {}, r.uv != null ? Math.round(r.uv) : '—'), el('td', {}, wmo(r.code))))));
  }

  // "Jamaica We Active!" or "Cayman We Active!" depending on the island of the place picked.
  function brandFor(L) {
    const t = (data.territories && data.territories[L.territory || 'JM']) || {brand: 'Jamaica'};
    const b = document.querySelector('.brand > span:last-child');
    if (b) b.innerHTML = `${t.brand.toUpperCase()} <i>WE</i> <b>ACTIVE!</b>`;
    document.title = `${t.brand} We Active! | Your best time to run, walk, ride or swim`;
  }

  function render() {
    const L = loc(); if (!L) return;
    if (dayIdx >= L.days.length) dayIdx = 0;
    brandFor(L); hero(); renderDays();
    document.dispatchEvent(new CustomEvent('jwa:place', {detail: {name: L.name, lat: L.lat, lon: L.lon}}));
    const day = L.days[dayIdx];
    $('windows').replaceChildren(card('am', day.windows.am, day), card('pm', day.windows.pm, day));
    renderHourly(day);
  }

  const EXPLAIN = {
    land: ['Each window starts at 10 and loses points for heat, rain, thunderstorms, muggy heat, strong sun, gusts, wet roads and poor air quality. Humidity only counts with heat (80% from 28°C, 85% from 30°C), and humidity, dew point and heat stress share one penalty so they don\'t stack. Thunderstorms or dangerous heat cap it at 4. Separate notes appear for people with asthma or heart conditions; they don\'t change the score.',
      'Morning window 4:30–7:00 AM, evening window 4:30–6:30 PM, Jamaica time.'],
    swim: ['Open water starts at 10 and loses points for swell, rip risk, onshore wind, rain in the last 48 hours (water quality) and very warm water. Thunder, seas over 1.5 m or a high rip risk cap it at 4. Pools lose points for thunder, heavy showers, heat on deck and strong sun.',
      'Morning window 5:30–8:00 AM, evening window 4:30–6:30 PM, Jamaica time. Sea forecasts are models: always look at the water before you get in.'],
  };
  function fillPlaces() {
    const sel = $('place'), list = places();
    const opt = l => el('option', {value: l.key}, l.area ? `${l.name}, ${l.area}` : l.name);
    const terrs = [...new Set(list.map(l => l.territory || 'JM'))];
    // More than one island: group the places under each island's name.
    sel.replaceChildren(...(terrs.length > 1
      ? terrs.map(t => el('optgroup', {label: (data.territories && data.territories[t] && data.territories[t].name) || t}, ...list.filter(l => (l.territory || 'JM') === t).map(opt)))
      : list.map(opt)));
    if (!list.some(l => l.key === place)) {
      // First visit (or the saved place is gone): Kingston for run & ride, the National Aquatic Centre for swimming.
      const def = mode === 'swim' ? list.find(l => /aquatic/i.test(l.name)) : list.find(l => l.key === 'kingston') || list.find(l => /^kingston/i.test(l.name));
      place = (def || list[0])?.key || '';
    }
    sel.value = place;
    document.querySelectorAll('#mode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('explain-1').textContent = EXPLAIN[mode][0]; $('explain-2').textContent = EXPLAIN[mode][1];
  }
  function setMode(m) {
    if (m === mode) return;
    mode = m; sport = mode === 'swim' ? 'swim' : 'mixed'; store.set('jwa.mode', mode);
    place = store.get(placeKey(), ''); dayIdx = 0; fillPlaces(); render();
  }

  async function load() {
    try {
      const res = await fetch('data/forecast.json?t=' + Date.now(), {cache: 'no-store'});
      if (!res.ok) throw Error('HTTP ' + res.status);
      data = await res.json();
    } catch { $('headline').textContent = 'The forecast could not be loaded. Please try again shortly.'; $('updated').textContent = ''; return; }
    const sel = $('place');
    if (!data.locations.some(l => l.sport === 'swim' && (l.territory || 'JM') === TERR)) { $('mode').hidden = true; mode = 'land'; sport = 'mixed'; }
    fillPlaces();
    sel.addEventListener('change', () => { place = sel.value; store.set(placeKey(), place); dayIdx = 0; render(); });
    document.querySelectorAll('#mode button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    const gen = new Date(data.generatedAt);
    $('updated').textContent = 'Updated ' + new Intl.DateTimeFormat('en-US', {timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit'}).format(gen);
    if (Date.now() - gen.getTime() > 13 * 3600e3) { $('stale').textContent = '⚠ This forecast is more than 13 hours old. The latest update may have failed.'; $('stale').hidden = false; }
    render();
  }
  load();
})();

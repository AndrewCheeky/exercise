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
    shoe: P('<path d="M3 16h15.5a2.5 2.5 0 0 0 0-5L13 9.5 11 6H8l.5 3.5L5 11v5"/><path d="M3 19h18"/>'),
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

  let data = null, place = store.get('rr.place', ''), sport = store.get('rr.sport', 'run'), dayIdx = 0;
  const loc = () => data && (data.locations.find(l => l.key === place) || data.locations[0]);
  const verb = () => sport === 'cycle' ? 'ride' : 'run';

  // Practical, friendly tips for a window (max 3), from the forecast numbers.
  function tips(key, w, day) {
    const m = w.metrics || {}, out = [], ride = sport === 'cycle';
    const sunrise = hours(day.sunrise), sunset = hours(day.sunset);
    if (key === 'am' && day.sunrise && WIN.am.start < sunrise) out.push(['light', ride ? `Lights on, front and back: it's dark until ${clock(day.sunrise)}.` : `It's dark until ${clock(day.sunrise)}. Wear something bright or reflective.`]);
    if (key === 'pm' && day.sunset && WIN.pm.end > sunset) out.push(['light', ride ? `Sunset is ${clock(day.sunset)}. Pack lights for the ride home.` : `Sunset is ${clock(day.sunset)}. Be seen on the last stretch.`]);
    if (m.lightningPct >= 50) out.push(['bolt', 'Thunder is forecast. Stay close to shelter, or take it indoors.']);
    else if (m.precipPct >= 50) out.push(['road', ride ? 'Wet roads likely. Brake earlier and steer clear of painted lines.' : 'Showers likely. A light layer helps, and watch for slippery spots.']);
    if (m.wbgt >= 28) out.push(['bottle', 'Heat stress risk. Go shorter, sip water often, rest in the shade.']);
    else if (m.dewPointC >= 22 || m.rh >= 82) out.push(['bottle', `Sticky air (${m.rh}% humidity). Bring water and ease the pace a little.`]);
    if (m.uvEffective >= 6) out.push(['cap', 'Strong sun. Cap, sunglasses and sunscreen.']);
    if (ride && (m.windGustKmh >= 30 || m.gustDelta >= 10)) out.push(['wind', `Gusts to ${m.windGustKmh} km/h. Keep a firm grip on descents.`]);
    if (w.air && w.air.hasData && w.air.aqi > 50) out.push(['leaf', `Air quality is ${w.air.category.toLowerCase()}. Take it easier if you're sensitive.`]);
    if (!out.length || (out.length === 1 && out[0][0] === 'light' && w.scores[sport].band === 'go')) out.push(['smile', `Conditions look kind. Enjoy your ${verb()}!`]);
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
      if (d.date === now.date && WIN[k].end <= now.hour) return;
      upcoming.push({d, di, k, s, w});
    }));
    const next = upcoming[0];
    if (!next) { $('headline').textContent = `No forecast yet for your next ${verb()}.`; $('next').hidden = true; return; }
    const when = x => `${x.d.date === now.date ? (x.k === 'am' ? 'This morning' : 'This evening') : x.di === 1 || x.d.date > now.date ? (x.k === 'am' ? (x.d.date === nextDate(now.date) ? 'Tomorrow morning' : dayName(x.d.date, {weekday: 'long'}) + ' morning') : (x.d.date === nextDate(now.date) ? 'Tomorrow evening' : dayName(x.d.date, {weekday: 'long'}) + ' evening')) : ''}`;
    const best = upcoming.slice(0, 3).reduce((a, b) => b.s.index > a.s.index ? b : a, next);
    $('headline').textContent = next.s.band === 'go' ? `Great time for a ${verb()}: ${when(next).toLowerCase()}.` : next.s.band === 'caution' ? `${when(next)} is doable, with care.` : `${when(next)} looks rough. Plan around it.`;
    const box = $('next');
    box.replaceChildren(ring(next.s.index, next.s.band, 60, true),
      el('div', {}, el('strong', {}, `${when(next)} · ${WIN[next.k].times}`), el('span', {}, next.s.advice),
        best !== next && best.s.index > next.s.index ? el('span', {}, el('em', {}, `Better: ${when(best).toLowerCase()} (${best.s.index}/10)`)) : null));
    box.hidden = false;
  }
  const nextDate = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

  function renderDays() {
    const L = loc(); if (!L) return;
    const today = jaNow().date;
    $('days').replaceChildren(...L.days.map((d, i) => {
      const dot = k => { const s = d.windows[k]?.scores?.[sport]; return el('span', {class: 'dot ' + (s ? s.band : 'none'), title: `${WIN[k].label}: ${s ? s.index + '/10, ' + WORD[s.band] : 'no data'}`}, s ? String(s.index) : '–'); };
      const b = el('button', {type: 'button', class: 'day', 'aria-pressed': String(i === dayIdx), 'aria-label': `${dayName(d.date, {weekday: 'long', day: 'numeric', month: 'long'})}`},
        el('b', {}, d.date === today ? 'Today' : dayName(d.date, {weekday: 'short'})),
        el('small', {}, dayName(d.date, {day: 'numeric', month: 'short'})),
        el('span', {class: 'dots'}, dot('am'), dot('pm')));
      b.addEventListener('click', () => { dayIdx = i; render(); });
      return b;
    }));
  }

  const stat = (ic, label, value, sub) => el('div', {class: 'stat'}, icon(ic), el('dl', {}, el('dt', {}, label), el('dd', {}, value ?? '—', sub ? el('small', {}, sub) : null)));

  function card(key, w, day) {
    const s = w && w.scores && w.scores[sport], m = w && w.metrics;
    const head = el('div', {class: 'when'}, el('h3', {}, icon(WIN[key].icon), WIN[key].label), el('p', {}, `${WIN[key].times}${m && m.condition ? ' · ' + m.condition : ''}`));
    if (!s || !m) return el('article', {class: 'win'}, el('div', {class: 'win-top'}, head), el('p', {class: 'why'}, 'No forecast for this window yet.'));
    return el('article', {class: 'win ' + s.band},
      el('div', {class: 'win-top'}, head, ring(s.index, s.band, 64)),
      el('p', {class: 'verdict'}, `${WORD[s.band]} · ${s.advice}`),
      el('ul', {class: 'tips'}, tips(key, w, day).map(([ic, t]) => el('li', {}, icon(ic), el('span', {}, t)))),
      s.reasons.length ? el('p', {class: 'why'}, el('b', {}, 'Why this score: '), s.reasons.join(' · ')) : null,
      el('dl', {class: 'stats'},
        stat('thermo', 'Temperature', `${Math.round(m.tempC)}°C`, `feels ${Math.round(m.feelsC ?? m.heatIndexC)}°C`),
        stat('drop', 'Humidity', `${m.rh}%`, `dew point ${Math.round(m.dewPointC)}°C`),
        stat('rain', 'Rain', `${m.precipPct}%`, m.rainAccumMm > 0 ? `${m.rainAccumMm} mm` : 'dry'),
        stat('wind', 'Wind', `${m.windKmh} km/h`, m.windGustKmh != null ? `gusts ${m.windGustKmh}` : ''),
        stat('sun', 'UV', m.uvEffective ?? '—', m.cloud != null ? `${m.cloud}% cloud` : ''),
        stat('leaf', 'Air', w.air && w.air.hasData ? w.air.category : '—', w.air && w.air.hasData ? `AQI ${w.air.aqi}` : '')));
  }

  function renderHourly(day) {
    const inWin = t => { const h = hours(t); return (h >= 4.5 && h <= 7) || (h >= 16.5 && h <= 18.5); };
    $('hourly').replaceChildren(
      el('thead', {}, el('tr', {}, ['Time', 'Temp', 'Feels', 'Humidity', 'Rain', 'mm', 'Wind', 'Gust', 'UV', 'Sky'].map(h => el('th', {scope: 'col'}, h)))),
      el('tbody', {}, (day.hourly || []).map(r => el('tr', {class: inWin(r.t) ? 'in-window' : ''},
        el('td', {}, clock(r.t)), el('td', {}, `${Math.round(r.temp)}°`), el('td', {}, `${Math.round(r.feels)}°`), el('td', {}, `${r.rh}%`),
        el('td', {}, `${r.pop ?? '—'}%`), el('td', {}, (r.mm ?? 0).toFixed(1)), el('td', {}, `${Math.round(r.wind)} ${compass(r.dir)}`),
        el('td', {}, `${Math.round(r.gust)}`), el('td', {}, r.uv != null ? Math.round(r.uv) : '—'), el('td', {}, wmo(r.code))))));
  }

  function render() {
    const L = loc(); if (!L) return;
    if (dayIdx >= L.days.length) dayIdx = 0;
    hero(); renderDays();
    const day = L.days[dayIdx];
    $('windows').replaceChildren(card('am', day.windows.am, day), card('pm', day.windows.pm, day));
    renderHourly(day);
  }

  function setSport(s) {
    sport = s === 'cycle' ? 'cycle' : 'run'; store.set('rr.sport', sport);
    document.body.dataset.sport = sport;
    $('hero-art').src = sport === 'cycle' ? 'assets/hero-ride.svg' : 'assets/hero-run.svg';
    document.querySelectorAll('.sport button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sport === sport)));
    render();
  }
  document.querySelectorAll('.sport button').forEach(b => b.addEventListener('click', () => setSport(b.dataset.sport)));

  async function load() {
    try {
      const res = await fetch('data/forecast.json?t=' + Date.now(), {cache: 'no-store'});
      if (!res.ok) throw Error('HTTP ' + res.status);
      data = await res.json();
    } catch { $('headline').textContent = 'The forecast could not be loaded. Please try again shortly.'; $('updated').textContent = ''; return; }
    const sel = $('place');
    sel.replaceChildren(...data.locations.map(l => el('option', {value: l.key}, l.area ? `${l.name}, ${l.area}` : l.name)));
    if (!data.locations.some(l => l.key === place)) place = data.locations[0]?.key || '';
    sel.value = place;
    sel.addEventListener('change', () => { place = sel.value; store.set('rr.place', place); dayIdx = 0; render(); });
    const gen = new Date(data.generatedAt);
    $('updated').textContent = 'Updated ' + new Intl.DateTimeFormat('en-US', {timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit'}).format(gen);
    if (Date.now() - gen.getTime() > 8 * 3600e3) { $('stale').textContent = '⚠ This forecast is more than 8 hours old. The latest update may have failed.'; $('stale').hidden = false; }
    setSport(sport);
  }
  load();
})();

(() => {
  'use strict';
  const TZ = 'America/Jamaica';
  const $ = id => document.getElementById(id);
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (v != null) n.setAttribute(k, v); }
    kids.flat().forEach(k => k != null && n.append(k));
    return n;
  };
  const jaDate = () => new Intl.DateTimeFormat('en-CA', {timeZone: TZ}).format(new Date());
  const dayName = (iso, opts) => new Intl.DateTimeFormat('en-GB', {timeZone: 'UTC', ...opts}).format(new Date(iso + 'T12:00:00Z'));
  const clock = hm => { if (!hm) return '—'; let [h, m] = hm.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
  const word = b => ({go: 'GO', caution: 'CAUTION', avoid: 'AVOID'})[b] || '—';
  const compass = d => d == null ? '' : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((d % 360) + 360) % 360 / 45) % 8];
  const wmo = c => ({0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 80: 'Showers', 81: 'Showers', 82: 'Heavy showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm'})[c] || '—';

  let data = null, place = store.get('rr.place', ''), sport = store.get('rr.sport', 'run'), dayIdx = 0;

  function setSport(s) {
    sport = s === 'cycle' ? 'cycle' : 'run'; store.set('rr.sport', sport);
    document.querySelectorAll('.sport button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sport === sport)));
    render();
  }
  document.querySelectorAll('.sport button').forEach(b => b.addEventListener('click', () => setSport(b.dataset.sport)));

  const loc = () => data && (data.locations.find(l => l.key === place) || data.locations[0]);

  function renderDays() {
    const L = loc(); if (!L) return;
    $('days').replaceChildren(...L.days.map((d, i) => {
      const dot = w => { const s = d.windows[w]?.scores?.[sport]; return el('span', {class: 'dot ' + (s ? s.band : 'none'), title: (w === 'am' ? 'Morning ' : 'Evening ') + (s ? s.index + '/10' : 'no data')}, s ? String(s.index) : '–'); };
      const b = el('button', {type: 'button', class: 'day', 'aria-pressed': String(i === dayIdx)},
        el('b', {}, i === 0 && d.date === jaDate() ? 'Today' : dayName(d.date, {weekday: 'short'})),
        el('small', {}, dayName(d.date, {day: 'numeric', month: 'short'})),
        el('span', {class: 'dots'}, dot('am'), dot('pm')));
      b.addEventListener('click', () => { dayIdx = i; render(); });
      return b;
    }));
  }

  function stat(label, value, sub) { return el('div', {}, el('dt', {}, label), el('dd', {}, value ?? '—', sub ? el('small', {}, sub) : null)); }

  function windowCard(key, w, day) {
    const s = w.scores?.[sport];
    const m = w.metrics;
    if (!s || !m) return el('article', {class: 'win'}, el('div', {class: 'win-head'}, el('h2', {}, w.label)), el('p', {}, 'No forecast for this window yet.'));
    const times = key === 'am' ? '4:30–7:00 AM' : '4:30–6:30 PM';
    const air = w.air && w.air.hasData ? `${w.air.category} (AQI ${w.air.aqi})` : 'Not available';
    return el('article', {class: 'win ' + s.band},
      el('div', {class: 'win-head'},
        el('div', {}, el('h2', {}, w.label), el('p', {}, `${times} · ${m.condition || ''}`)),
        el('div', {class: 'score ' + s.band}, el('b', {}, `${s.index}`), el('span', {}, word(s.band)))),
      el('p', {class: 'advice'}, s.advice),
      s.reasons.length ? el('ul', {class: 'reasons', 'aria-label': 'What lowered the score'}, s.reasons.map(r => el('li', {}, r))) : el('p', {class: 'reasons-none'}, 'Nothing significant lowers this window.'),
      el('dl', {class: 'stats'},
        stat('Temperature', `${m.tempC}°C`, `feels ${m.feelsC ?? m.heatIndexC}°C`),
        stat('Humidity', `${m.rh}%`, `dew point ${m.dewPointC}°C`),
        stat('Rain chance', `${m.precipPct}%`, `${m.rainAccumMm} mm in window`),
        stat('Wind', `${m.windKmh} km/h`, m.windGustKmh != null ? `gusts ${m.windGustKmh}` : ''),
        stat('UV', m.uvEffective ?? '—', m.cloud != null ? `${m.cloud}% cloud` : ''),
        stat('Air quality', w.air && w.air.hasData ? w.air.category : '—', w.air && w.air.hasData ? `AQI ${w.air.aqi}` : '')),
      key === 'am' ? el('p', {class: 'sun'}, `Sunrise ${clock(day.sunrise)}`) : el('p', {class: 'sun'}, `Sunset ${clock(day.sunset)}`));
  }

  function renderHourly(day) {
    const rows = day.hourly || [];
    const inWin = t => { const h = Number(t.slice(0, 2)) + Number(t.slice(3, 5)) / 60; return (h >= 4.5 && h <= 7) || (h >= 16.5 && h <= 18.5); };
    $('hourly').replaceChildren(
      el('thead', {}, el('tr', {}, ['Time', 'Temp', 'Feels', 'Humidity', 'Rain', 'mm', 'Wind', 'Gust', 'UV', 'Sky'].map(h => el('th', {scope: 'col'}, h)))),
      el('tbody', {}, rows.map(r => el('tr', {class: inWin(r.t) ? 'in-window' : ''},
        el('td', {}, clock(r.t)), el('td', {}, `${Math.round(r.temp)}°`), el('td', {}, `${Math.round(r.feels)}°`), el('td', {}, `${r.rh}%`),
        el('td', {}, `${r.pop ?? '—'}%`), el('td', {}, (r.mm ?? 0).toFixed(1)), el('td', {}, `${Math.round(r.wind)} ${compass(r.dir)}`),
        el('td', {}, `${Math.round(r.gust)}`), el('td', {}, r.uv != null ? Math.round(r.uv) : '—'), el('td', {}, wmo(r.code))))));
  }

  function render() {
    const L = loc(); if (!L) return;
    if (dayIdx >= L.days.length) dayIdx = 0;
    renderDays();
    const day = L.days[dayIdx];
    $('windows').replaceChildren(windowCard('am', day.windows.am, day), windowCard('pm', day.windows.pm, day));
    renderHourly(day);
  }

  async function load() {
    try {
      const res = await fetch('data/forecast.json?t=' + Date.now(), {cache: 'no-store'});
      if (!res.ok) throw Error('HTTP ' + res.status);
      data = await res.json();
    } catch (e) { $('updated').textContent = 'The forecast could not be loaded. Please try again shortly.'; return; }
    const sel = $('place');
    sel.replaceChildren(...data.locations.map(l => el('option', {value: l.key}, l.area ? `${l.name} · ${l.area}` : l.name)));
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

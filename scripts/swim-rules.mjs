// Swim score (0–10) for open water and pools. Same bands as running and riding:
// 7–10 Go · 5–6 Take care · 0–4 Skip it. Rules follow the "Swimming Concept" sheet.
import {band} from './index-rules.mjs';

const r1 = x => x == null ? null : Math.round(x * 10) / 10;

/** Marine averages for a window (Open-Meteo Marine hourly, local time). */
export function marineWindow(mh, day, start, end) {
  if (!mh || !mh.time) return {hasData: false};
  const idx = [];
  mh.time.forEach((t, i) => { if (!t.startsWith(day)) return; const h = Number(t.slice(11, 13)) + Number(t.slice(14, 16)) / 60; if (h >= start && h <= end) idx.push(i); });
  const val = (k, i) => { const x = mh[k]?.[i]; return x == null || Number.isNaN(Number(x)) ? null : Number(x); };
  const mean = k => { const xs = idx.map(i => val(k, i)).filter(x => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const max = k => { const xs = idx.map(i => val(k, i)).filter(x => x != null); return xs.length ? Math.max(...xs) : null; };
  const dirMean = (k, w) => { let x = 0, y = 0, n = 0; idx.forEach(i => { const d = val(k, i), s = w ? (val(w, i) ?? 1) : 1; if (d == null) return; x += Math.sin(d * Math.PI / 180) * s; y += Math.cos(d * Math.PI / 180) * s; n++; }); return n ? Math.round((Math.atan2(x, y) * 180 / Math.PI + 360) % 360) : null; };
  const waveM = max('wave_height');
  if (waveM == null) return {hasData: false};
  return {
    hasData: true,
    waveM: r1(waveM), periodS: r1(mean('wave_period')), waveDirDeg: dirMean('wave_direction', 'wave_height'),
    swellM: r1(max('swell_wave_height')), swellPeriodS: r1(mean('swell_wave_period')),
    seaTempC: r1(mean('sea_surface_temperature')),
    currentKmh: r1(mean('ocean_current_velocity')), currentDirDeg: dirMean('ocean_current_direction', 'ocean_current_velocity'),
  };
}

/** Wind relative to a beach that faces `facing` degrees (the way you look out to sea). */
export function windVsBeach(windFromDeg, windKmh, facing) {
  if (windFromDeg == null || facing == null || !Number.isFinite(facing)) return {rel: null, onshoreKmh: windKmh ?? 0};
  const diff = Math.abs(((windFromDeg - facing) % 360 + 540) % 360 - 180);   // 0 = straight onshore, 180 = straight offshore
  const onshoreKmh = diff < 90 ? Math.round((windKmh ?? 0) * Math.cos(diff * Math.PI / 180)) : 0;
  return {rel: diff <= 60 ? 'onshore' : diff >= 120 ? 'offshore' : 'cross-shore', onshoreKmh};
}

export function ripRisk(waveM, periodS, onshoreKmh) {
  const hs = waveM ?? 0, t = periodS ?? 0;
  if ((hs >= 1.2 && t >= 10) || (hs >= 1.5 && onshoreKmh >= 25) || hs >= 2) return 'High';
  if ((hs >= 0.8 && t >= 9) || (hs >= 1 && onshoreKmh >= 20) || hs >= 1.2) return 'Moderate';
  return 'Low';
}

export function waterQuality(rain48Mm) {
  if (rain48Mm >= 40) return 'Avoid';
  if (rain48Mm >= 20) return 'Caution';
  return 'Clean';
}

/** Open-water score. m = weather window (windowStats), sea = marineWindow, rain48 = mm in the 48 h before. */
export function seaScore(m, sea, rain48, facing) {
  if (!m || !m.hasData || !sea || !sea.hasData) return {index: 0, band: 'avoid', reasons: ['No sea forecast'], flags: [], advice: 'No sea forecast for this window yet.'};
  let s = 10, cap = 10;
  const reasons = [], flags = new Set();
  const hit = (n, why, tile) => { s -= n; reasons.push(why); if (tile) flags.add(tile); };
  const capAt = (n, why, tile) => { cap = Math.min(cap, n); if (why && !reasons.includes(why)) reasons.push(why); if (tile) flags.add(tile); };
  const wind = windVsBeach(m.windDirDeg, m.windKmh, facing);
  const period = sea.swellPeriodS ?? sea.periodS;
  const rip = ripRisk(sea.waveM, period, wind.onshoreKmh);
  const wq = waterQuality(rain48);
  const thunder = m.thunderHours > 0;

  if (thunder) capAt(4, 'Thunder forecast', 'lightning');
  if (sea.waveM > 1.5) { hit(3, `Rough sea (${sea.waveM} m)`, 'waves'); capAt(4, null, 'waves'); }
  else if (sea.waveM >= 1) hit(3, `Rough water (${sea.waveM} m)`, 'waves');
  else if (sea.waveM >= 0.5) hit(1, `Some swell (${sea.waveM} m)`, 'waves');
  if (rip === 'High') capAt(4, 'High rip risk', 'rip');
  else if (rip === 'Moderate') hit(1, 'Moderate rip risk', 'rip');
  if (rain48 >= 20) hit(2, `Heavy rain in the last 48 h (${Math.round(rain48)} mm)`, 'water');
  if (wind.onshoreKmh >= 30) hit(2, `Strong onshore wind (${wind.onshoreKmh} km/h)`, 'wind');
  else if (wind.onshoreKmh >= 20) hit(1, `Onshore wind (${wind.onshoreKmh} km/h)`, 'wind');
  if (sea.seaTempC > 30) hit(1, `Warm water (${sea.seaTempC}°C)`, 'sea');

  const index = Math.max(0, Math.min(cap, Math.round(s)));
  const b = band(index);
  let advice;
  if (thunder && index <= 4) advice = 'Thunder forecast. Stay out of the water.';
  else if (rip === 'High') advice = 'Rip currents likely. Stay out, or swim parallel to shore if caught.';
  else if (b === 'avoid' && sea.waveM > 1.5) advice = 'Too rough for open water today.';
  else if (b === 'avoid' && wq !== 'Clean') advice = 'Water quality is poor after heavy rain. Wait a day or two.';
  else if (b === 'avoid') advice = 'Not a good window for open water.';
  else if (b === 'caution') advice = 'Swimmable with care. Stay near shore and swim with a buddy.';
  else if (sea.waveM < 0.5 && rip === 'Low') advice = 'Calm and clear. Good for a long swim.';
  else advice = 'Good swimming. Sight often and swim with a buddy.';
  return {index, band: b, reasons, flags: [...flags], advice, rip, windRel: wind.rel, onshoreKmh: wind.onshoreKmh, waterQuality: wq, rain48: r1(rain48)};
}

/** Outdoor pool score: lightning first, then showers, heat on deck and sun. */
export function poolScore(m) {
  if (!m || !m.hasData) return {index: 0, band: 'avoid', reasons: ['No forecast data'], flags: [], advice: 'No forecast for this window yet.'};
  let s = 10, cap = 10;
  const reasons = [], flags = new Set();
  const hit = (n, why, tile) => { s -= n; reasons.push(why); flags.add(tile); };
  const thunder = m.thunderHours > 0;
  if (thunder) { cap = 4; reasons.push('Thunder forecast'); flags.add('lightning'); }
  if (m.precipPct >= 70) hit(1, `Heavy showers likely (${m.precipPct}%)`, 'rain');
  if ((m.feelsC ?? m.heatIndexC) >= 35) hit(1, `Hot on deck (feels ${Math.round(m.feelsC ?? m.heatIndexC)}°C)`, 'feels');
  if (m.uvEffective >= 6) hit(1, `Strong sun (UV ${m.uvEffective})`, 'uv');
  const index = Math.max(0, Math.min(cap, Math.round(s)));
  const b = band(index);
  const advice = thunder && index <= 4 ? 'Thunder forecast. Pools clear the water when lightning is near.'
    : b === 'go' ? 'Good conditions for the pool.' : b === 'caution' ? 'Fine for the pool, with care.' : 'Not a good window for the pool.';
  return {index, band: b, reasons, flags: [...flags], advice};
}

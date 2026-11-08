// Go Run Index rules, ported from the Wx-Exercise5day Apps Script (v2.7.0).
// Thresholds and penalties are unchanged; each penalty also records a short plain reason.

export const RULES = {
  LIGHTNING_ALERT_THRESHOLD: 50, LIGHTNING_INDEX_DOWNGRADE: 2, LIGHTNING_CAP: 4,
  POST_RAIN_POP_THRESHOLD: 90, POST_RAIN_RATE_MM_H: 20,
  DEWPOINT_WARN: 24, DEWPOINT_DANGER: 26,
  WBGT_WARN: 28, WBGT_DANGER: 30,
  UV_EFF_WARN: 6, UV_EFF_HIGH: 8,
  GUST_DELTA_WARN: 10, GUST_DELTA_HIGH: 20,
  RECENT_RAIN_MM_6H: 10, HEAVY_HOURLY_MM: 15,
};

const r1 = x => x == null ? null : Math.round(x * 10) / 10;

export function wetBulbC(tC, rh) {
  if (tC == null || rh == null) return null;
  const RH = Math.max(0, Math.min(100, rh));
  const tw = tC * Math.atan(0.151977 * Math.sqrt(RH + 8.313659))
    + Math.atan(tC + RH) - Math.atan(RH - 1.676331)
    + 0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) - 4.686035;
  return Math.round(tw * 10) / 10;
}
export function dewPointC(tC, rh) {
  if (tC == null || rh == null) return null;
  const a = 17.62, b = 243.12;
  const g = (a * tC) / (b + tC) + Math.log(Math.max(1e-6, rh / 100));
  return Math.round((b * g) / (a - g) * 10) / 10;
}
export function heatIndexC(tC, rh) {
  if (tC == null || rh == null) return null;
  const T = tC * 9 / 5 + 32, R = rh;
  let HI = -42.379 + 2.04901523 * T + 10.14333127 * R - 0.22475541 * T * R
    - 0.00683783 * T * T - 0.05481717 * R * R + 0.00122874 * T * T * R
    + 0.00085282 * T * R * R - 0.00000199 * T * T * R * R;
  if (R < 13 && T >= 80 && T <= 112) HI -= ((13 - R) / 4) * Math.sqrt((17 - Math.abs(T - 95)) / 17);
  if (R > 85 && T >= 80 && T <= 87) HI += ((R - 85) / 10) * ((87 - T) / 5);
  const HIc = (HI - 32) * 5 / 9;
  return T < 80 ? Math.round(0.5 * (tC + HIc) * 10) / 10 : Math.round(HIc * 10) / 10;
}
export function airDensity(tC, rh, p_hPa) {
  if (tC == null || rh == null || p_hPa == null) return null;
  const T = tC + 273.15, p = p_hPa * 100;
  const es = 6.112 * Math.exp((17.67 * tC) / (tC + 243.5));
  const e = Math.max(0, Math.min(rh, 100)) / 100 * es;
  return (p - e * 100) / (287.05 * T) + (e * 100) / (461.5 * T);
}
export function airDensityScore(rho) {
  const ratio = (1.25 - rho) / (1.25 - 1.10);
  return 1 + Math.round(Math.max(0, Math.min(1, ratio)) * 9);
}
export const wbgtProxy = (tC, rh) => {
  const tw = wetBulbC(tC, rh);
  return tw != null && tC != null ? Math.round((0.7 * tw + 0.3 * tC) * 10) / 10 : null;
};

export function aqiPenalty(aqi, isEvening, driver, windKmh, isHeat) {
  let p = 0;
  if (aqi <= 50) p = 0; else if (aqi <= 100) p = -1; else if (aqi <= 150) p = -2;
  else if (aqi <= 200) p = -4; else if (aqi <= 300) p = -6; else p = -8;
  if (isEvening && driver === 'O3' && aqi >= 101) p -= 1;
  if (driver === 'PM25' && windKmh >= 20) p += 0.5;
  if (isHeat && driver === 'O3' && aqi >= 101) p -= 1;
  return p;
}
export function aqiCategory(aqi) {
  if (aqi == null) return null;
  return aqi <= 50 ? 'Good' : aqi <= 100 ? 'Moderate' : aqi <= 150 ? 'Unhealthy for sensitive groups'
    : aqi <= 200 ? 'Unhealthy' : aqi <= 300 ? 'Very unhealthy' : 'Hazardous';
}

/** Go Index 0–10 (7–10 Go, 5–6 Caution, 0–4 Avoid) with the reasons that lowered it. sport: 'run' | 'cycle' */
export function goIndex(m, aq, isEvening, sport = 'run') {
  if (!m || !m.hasData) return {index: 0, reasons: ['No forecast data']};
  const R = RULES, reasons = [];
  let s = 10;
  const hit = (n, why) => { s -= n; reasons.push(why); };
  if (m.tempC >= 32) hit(3, `Hot (${m.tempC}°C)`); else if (m.tempC >= 30) hit(2, `Hot (${m.tempC}°C)`); else if (m.tempC >= 27) hit(1, `Warm (${m.tempC}°C)`);
  if (m.rh >= 85) hit(2, `Very humid (${m.rh}%)`); else if (m.rh >= 75) hit(1, `Humid (${m.rh}%)`);
  if (m.windKmh >= 30) hit(1, `Windy (${m.windKmh} km/h)`);
  if (m.precipPct >= 70) hit(3, `Rain likely (${m.precipPct}%)`); else if (m.precipPct >= 50) hit(2, `Rain possible (${m.precipPct}%)`); else if (m.precipPct >= 30) hit(1, `Chance of rain (${m.precipPct}%)`);
  const lightning = m.lightningPct != null && m.lightningPct >= R.LIGHTNING_ALERT_THRESHOLD;
  if (lightning) hit(R.LIGHTNING_INDEX_DOWNGRADE, 'Thunderstorms likely');
  if (aq && aq.hasData) {
    const p = aqiPenalty(aq.aqi, isEvening, aq.driver, m.windKmh || 0, m.tempC >= 32);
    if (p < 0) { s += p; reasons.push(`Air quality ${aqiCategory(aq.aqi).toLowerCase()} (AQI ${aq.aqi})`); } else s += p;
  }
  const wbgt = wbgtProxy(m.tempC, m.rh);
  if (wbgt != null) { if (wbgt >= R.WBGT_DANGER) hit(4, `Dangerous heat stress (WBGT ${wbgt})`); else if (wbgt >= R.WBGT_WARN) hit(2, `Heat stress (WBGT ${wbgt})`); }
  if (m.dewPointC != null) { if (m.dewPointC >= R.DEWPOINT_DANGER) hit(2, `Oppressive (dew point ${m.dewPointC}°C)`); else if (m.dewPointC >= R.DEWPOINT_WARN) hit(1, `Sticky (dew point ${m.dewPointC}°C)`); }
  if (m.uvEffective != null) { if (m.uvEffective >= R.UV_EFF_HIGH) hit(2, `Very strong sun (UV ${m.uvEffective})`); else if (m.uvEffective >= R.UV_EFF_WARN) hit(1, `Strong sun (UV ${m.uvEffective})`); }
  if (m.gustDelta != null) { if (m.gustDelta >= R.GUST_DELTA_HIGH) hit(2, `Very gusty (+${m.gustDelta} km/h)`); else if (m.gustDelta >= R.GUST_DELTA_WARN) hit(1, `Gusty (+${m.gustDelta} km/h)`); }
  if (m.rainRecentMm6h != null && m.rainRecentMm6h >= R.RECENT_RAIN_MM_6H) hit(1, `Wet from earlier rain (${m.rainRecentMm6h} mm)`);
  if (m.rainMaxMm != null && m.rainMaxMm >= R.HEAVY_HOURLY_MM) hit(2, `Heavy downpours (${m.rainMaxMm} mm/h)`);
  if (m.postRainPopMax != null && m.postRainPopMax >= R.POST_RAIN_POP_THRESHOLD) {
    const nudge = sport === 'cycle' ? 1 : 0;
    if (m.postRainMmMax != null && m.postRainMmMax >= R.POST_RAIN_RATE_MM_H) hit(1 + nudge, 'Heavy rain just after');
    else if (nudge) hit(nudge, 'Rain just after');
  }
  if (m.airDensityScore != null) {
    if (sport === 'cycle') { if (m.airDensityScore >= 8) s += 1; if (m.airDensityScore <= 3) hit(1, 'Dense air (more drag)'); }
    else if (m.airDensityScore >= 8) hit(1, 'Thin, warm air');
  }
  if (lightning) s = Math.min(s, R.LIGHTNING_CAP);
  return {index: Math.max(0, Math.min(10, Math.round(s))), reasons};
}

/** RunScore 0–100 (shown as /10), unchanged from the original. */
export function runScore(m, aq, isEvening) {
  if (!m || !m.hasData) return 0;
  let score = 100;
  const tw = wetBulbC(m.tempC, m.rh);
  if (tw != null) {
    if (tw <= 10) { if (tw < 5) score -= 5; if (tw < 0) score -= 10; }
    else if (tw <= 15) { /* neutral */ }
    else if (tw <= 20) score -= 15; else if (tw <= 24) score -= 35; else score -= 60;
  }
  if (m.dewPointC != null) { const dp = m.dewPointC; if (dp >= 24) score -= 12; else if (dp >= 22) score -= 8; else if (dp >= 20) score -= 5; else if (dp >= 18) score -= 3; }
  if (m.heatIndexC != null) { const hi = m.heatIndexC; if (hi >= 41) score -= 20; else if (hi >= 38) score -= 12; else if (hi >= 32) score -= 5; }
  if (m.uv != null) {
    const cf = Math.max(0, Math.min(1, 1 - (m.cloud ?? 0) / 100));
    let up = m.uv >= 8 ? 10 : m.uv >= 6 ? 6 : m.uv >= 3 ? 3 : 0;
    score -= Math.round(up * cf) || 0;
  }
  if (m.windKmh != null) { const w = m.windKmh; if (w > 0 && w <= 15) score += 3; else if (w > 30 && w <= 40) score -= 3; else if (w > 40) score -= 8; }
  if (m.precipPct != null) { const p = m.precipPct; if (p >= 30 && p < 50) score -= 5; else if (p >= 50 && p < 70) score -= 10; else if (p >= 70) score -= 20; }
  if (aq && aq.hasData) {
    let ap = aq.aqi <= 50 ? 0 : aq.aqi <= 100 ? 5 : aq.aqi <= 150 ? 10 : aq.aqi <= 200 ? 18 : aq.aqi <= 300 ? 25 : 30;
    if (isEvening && aq.driver === 'O3' && aq.aqi >= 101) ap += 2;
    score -= ap;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

/** Advice line, as in the original email (lightning or dangerous heat caps the index at 4 first). */
export function advice(n, isAm, m = {}) {
  const wbgt = wbgtProxy(m.tempC, m.rh);
  if ((m.lightningPct != null && m.lightningPct >= RULES.LIGHTNING_ALERT_THRESHOLD) || (wbgt != null && wbgt >= RULES.WBGT_DANGER)) n = Math.min(n, RULES.LIGHTNING_CAP);
  if (m.condition && /thunder/i.test(m.condition)) {
    if (n >= 7) return 'Storm risk. Shorten and stay near shelter.';
    if (n >= 5) return 'Storm risk. Wet roads. Consider rescheduling.';
    return 'Thunder likely. Better to skip or go indoors.';
  }
  if (m.precipPct != null && m.precipPct >= 60) {
    const cooled = m.tempC != null && m.tempC <= 28 && m.windKmh != null && m.windKmh >= 10;
    if (n >= 7) return cooled ? 'Rain-cooled. Good if you don’t mind getting wet.' : 'Showery but fine if prepared.';
    if (n >= 5) return 'Wet roads. Keep it controlled.';
    return 'Heavy rain risk. Safer to skip or go indoors.';
  }
  if (n >= 7) return isAm ? 'Best morning. Enjoy.' : 'Solid evening window.';
  if (n >= 5) return isAm ? 'Manageable. Hydrate and pace.' : 'Warm and humid. Keep it light.';
  return isAm ? 'Tough morning. Consider easy or indoors.' : 'Heat or storms likely. Safer to skip.';
}

export const band = n => n >= 7 ? 'go' : n >= 5 ? 'caution' : 'avoid';
export const bandWord = n => n >= 7 ? 'GO' : n >= 5 ? 'CAUTION' : 'AVOID';

// WMO weather codes (Open-Meteo) to the plain phrases the original condition logic expects.
export function wmoPhrase(code) {
  const c = Number(code);
  if ([95, 96, 99].includes(c)) return 'Thunderstorm';
  if ([65, 82].includes(c)) return 'Heavy Rain';
  if ([61, 63, 80, 81].includes(c)) return 'Rain Showers';
  if ([51, 53, 55, 56, 57].includes(c)) return 'Drizzle';
  if (c === 3) return 'Overcast';
  if (c === 2) return 'Partly Cloudy';
  if (c === 1) return 'Mostly Clear';
  if (c === 0) return 'Clear';
  if ([45, 48].includes(c)) return 'Fog';
  return null;
}
export function selectCondition(phrases, avgPop, lightningPct) {
  const hay = phrases.filter(Boolean).join(' | ').toLowerCase();
  if (lightningPct != null && lightningPct >= RULES.LIGHTNING_ALERT_THRESHOLD) return 'Thunderstorms';
  if (/(t[- ]?storm|thunder)/.test(hay)) return 'Thunderstorms';
  if (/(heavy rain|downpour)/.test(hay)) return 'Heavy Rain';
  if (/(rain|showers)/.test(hay)) return avgPop != null && avgPop >= 70 ? 'Rain' : 'Showers';
  if (/drizzle|sprinkle/.test(hay)) return 'Light Drizzle';
  if (/overcast/.test(hay)) return 'Overcast';
  if (/partly (cloudy|sunny)/.test(hay)) return 'Partly Cloudy';
  if (/mostly clear|clear|sunny/.test(hay)) return 'Clear';
  if (avgPop != null) { if (avgPop >= 80) return 'Rain'; if (avgPop >= 40) return 'Chance of Showers'; }
  return phrases.find(Boolean) || 'Variable Clouds';
}

/**
 * Window statistics, as windowStatsForDay_ in the original. h is one location's hourly arrays in
 * Open-Meteo shape (local time strings). Window [start,end] in decimal hours, inclusive.
 */
export function windowStats(h, day, start, end, postLookaheadH = 1) {
  const idx = [], recent = [], post = [];
  const hourOf = t => Number(t.slice(11, 13)) + Number(t.slice(14, 16)) / 60;
  const dayIndex = h.time.findIndex(t => t.startsWith(day));
  h.time.forEach((t, i) => {
    if (t.slice(0, 10) !== day) return;
    const hr = hourOf(t);
    if (hr >= start && hr <= end) idx.push(i);
    else if (hr > end && hr <= end + postLookaheadH) post.push(i);
  });
  // Recent 6 h before the window (may reach into the previous day).
  if (dayIndex >= 0) h.time.forEach((t, i) => {
    const abs = (i - dayIndex) + 0; // hours since local midnight of `day` (hourly series)
    if (abs >= start - 6 && abs < start) recent.push(i);
  });
  const v = (k, i) => { const a = h[k]; const x = a ? a[i] : null; return x == null || Number.isNaN(Number(x)) ? null : Number(x); };
  const rows = idx.filter(i => v('temperature_2m', i) != null && v('relative_humidity_2m', i) != null && v('wind_speed_10m', i) != null);
  const cnt = rows.length;
  if (!cnt) return {hasData: false};
  const mean = k => { const xs = rows.map(i => v(k, i)).filter(x => x != null); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  const tempC = mean('temperature_2m'), rh = mean('relative_humidity_2m'), wind = mean('wind_speed_10m'), gust = mean('wind_gusts_10m');
  const pop = mean('precipitation_probability'), uv = mean('uv_index'), cloud = mean('cloud_cover');
  const pressures = rows.map(i => v('surface_pressure', i)).filter(x => x != null).sort((a, b) => a - b);
  const pressure = pressures.length ? pressures[Math.floor(pressures.length / 2)] : null;
  const rains = rows.map(i => v('precipitation', i) ?? 0);
  const phrases = rows.map(i => wmoPhrase(v('weather_code', i)));
  const thunderHits = phrases.filter(p => p === 'Thunderstorm').length;
  const lightningPct = Math.round(thunderHits / cnt * 100);
  const dp = mean('dew_point_2m') ?? dewPointC(tempC, rh);
  const rho = airDensity(tempC, rh, pressure);
  const uvEffective = uv != null ? Math.round(uv * (1 - Math.max(0, Math.min(100, cloud ?? 0)) / 100)) : null;
  return {
    hasData: true, hours: cnt,
    tempC: r1(tempC), rh: Math.round(rh), windKmh: Math.round(wind),
    windGustKmh: gust != null ? Math.round(gust) : null,
    gustDelta: gust != null ? Math.round(Math.max(0, gust - wind)) : 0,
    feelsC: r1(mean('apparent_temperature')),
    precipPct: pop != null ? Math.round(pop) : 0,
    uv: uv != null ? Math.round(uv) : null, cloud: cloud != null ? Math.round(cloud) : null, uvEffective,
    heatIndexC: heatIndexC(tempC, rh), dewPointC: r1(dp),
    pressure_hPa: pressure != null ? Math.round(pressure) : null,
    airDensity: rho != null ? Math.round(rho * 1000) / 1000 : null,
    airDensityScore: rho != null ? airDensityScore(rho) : null,
    rainRecentMm6h: r1(recent.reduce((a, i) => a + (v('precipitation', i) ?? 0), 0)),
    rainMaxMm: r1(Math.max(...rains)), rainAccumMm: r1(rains.reduce((a, b) => a + b, 0)),
    lightningPct, condition: selectCondition(phrases, pop, lightningPct),
    postRainPopMax: Math.round(Math.max(0, ...post.map(i => v('precipitation_probability', i) ?? 0))),
    postRainMmMax: r1(Math.max(0, ...post.map(i => v('precipitation', i) ?? 0))),
    confidence: pop == null || cnt < 2 ? 'Low' : (pop <= 20 || pop >= 80) ? 'High' : 'Medium',
  };
}

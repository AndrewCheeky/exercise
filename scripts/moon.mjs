// Moon phase, % lit, moonrise and moonset for any place and day, worked out locally (no API).
// Formulas after SunCalc (V. Agafonkin, BSD licence), the same maths as the marlin lab's sky.js.
const PI = Math.PI, rad = PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, e = rad * 23.4397;
const toDays = d => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
const altitude = (H, phi, dc) => Math.asin(Math.sin(phi) * Math.sin(dc) + Math.cos(phi) * Math.cos(dc) * Math.cos(H));
function sunCoords(d) {
  const M = rad * (357.5291 + 0.98560028 * d);
  const L = M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + PI;
  return {dec: dec(L, 0), ra: ra(L, 0)};
}
function moonCoords(d) {
  const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
  const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dt = 385001 - 20905 * Math.cos(M);
  return {ra: ra(l, b), dec: dec(l, b), dist: dt};
}
function moonAlt(date, lat, lng) {
  const d = toDays(date), c = moonCoords(d), H = sidereal(d, rad * -lng) - c.ra;
  let h = altitude(H, rad * lat, c.dec);
  return h + rad * 0.017 / Math.tan(h + rad * 10.26 / (h + rad * 5.10));   // refraction
}
export function moonIllum(date) {
  const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
  const ang = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return {fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (ang < 0 ? -1 : 1) / PI};
}
export const phaseName = p => p < .03 || p > .97 ? 'New moon' : p < .23 ? 'Waxing crescent' : p < .27 ? 'First quarter' : p < .47 ? 'Waxing gibbous'
  : p < .53 ? 'Full moon' : p < .73 ? 'Waning gibbous' : p < .77 ? 'Last quarter' : 'Waning crescent';

// UTC instant of local midnight for a yyyy-mm-dd date in an IANA time zone.
export function localMidnight(date, tz) {
  const guess = Date.parse(date + 'T00:00:00Z');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  const asLocal = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return guess - (asLocal - guess);
}
const hhmm = (ms, tz) => new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(ms));

// One local day: % lit (at 9 PM local, when it matters for evening outings), phase name, waxing or waning,
// and moonrise / moonset as HH:MM local (null when the moon doesn't rise or set that day).
export function moonForDay(date, tz, lat, lon) {
  const t0 = localMidnight(date, tz), step = 3e5;
  let rise = null, set = null, prev = moonAlt(new Date(t0), lat, lon);
  for (let t = t0 + step; t <= t0 + dayMs; t += step) {
    const h = moonAlt(new Date(t), lat, lon);
    if (prev < 0 && h >= 0 && rise == null) rise = t - step * (h / (h - prev));
    if (prev >= 0 && h < 0 && set == null) set = t - step * (h / (h - prev));
    prev = h;
  }
  const il = moonIllum(new Date(t0 + 21 * 36e5));
  return {lit: Math.round(il.fraction * 100), phase: phaseName(il.phase), waxing: il.phase < 0.5,
    rise: rise != null ? hhmm(rise, tz) : null, set: set != null ? hhmm(set, tz) : null};
}

// Next full moon on or after a local date (within 32 days): its local date and moonrise.
export function nextFullMoon(fromDate, tz, lat, lon) {
  const t0 = localMidnight(fromDate, tz), f = t => moonIllum(new Date(t)).fraction;
  let peak = null;
  for (let t = t0; t <= t0 + 32 * dayMs; t += 36e5) {
    const v = f(t);
    if (v > 0.98 && v >= f(t - 36e5) && v >= f(t + 36e5)) { peak = t; break; }   // the hour the moon is fullest
  }
  if (peak == null) return null;
  const date = new Intl.DateTimeFormat('en-CA', {timeZone: tz}).format(new Date(peak));
  return {date, rise: moonForDay(date, tz, lat, lon).rise};
}

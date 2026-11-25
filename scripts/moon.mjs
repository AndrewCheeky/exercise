// Moon phase, % lit, moonrise and moonset for any place and day.
// Uses Astronomy Engine (vendor/astronomy.cjs, MIT), which matches published tables (e.g. timeanddate.com)
// to the minute: topocentric position, refraction and the moon's size are all taken into account.
import {createRequire} from 'node:module';
const A = createRequire(import.meta.url)('./vendor/astronomy.cjs');
const dayMs = 864e5;

// UTC instant of local midnight for a yyyy-mm-dd date in an IANA time zone.
export function localMidnight(date, tz) {
  const guess = Date.parse(date + 'T00:00:00Z');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'}).formatToParts(new Date(guess)).map(x => [x.type, x.value]));
  return guess - (Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) - guess);
}
const hhmm = (d, tz) => new Intl.DateTimeFormat('en-GB', {timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(d);
const localDate = (d, tz) => new Intl.DateTimeFormat('en-CA', {timeZone: tz}).format(d);

export function phaseName(angle) {        // ecliptic longitude difference moon − sun, 0..360
  const a = ((angle % 360) + 360) % 360;
  return a < 6 || a > 354 ? 'New moon' : a < 84 ? 'Waxing crescent' : a < 96 ? 'First quarter' : a < 174 ? 'Waxing gibbous'
    : a < 186 ? 'Full moon' : a < 264 ? 'Waning gibbous' : a < 276 ? 'Last quarter' : 'Waning crescent';
}

// One local day: % lit (when the moon crosses the meridian that day, as moon tables give it; otherwise at 9 PM),
// phase name, waxing or waning, and moonrise / moonset as HH:MM local (null when it doesn't rise or set that day).
export function moonForDay(date, tz, lat, lon) {
  const t0 = new Date(localMidnight(date, tz)), t1 = new Date(t0.getTime() + dayMs), obs = new A.Observer(lat, lon, 0);
  const within = ev => ev && ev.date >= t0 && ev.date < t1 ? hhmm(ev.date, tz) : null;
  const rise = within(A.SearchRiseSet(A.Body.Moon, obs, +1, t0, 1));
  const set = within(A.SearchRiseSet(A.Body.Moon, obs, -1, t0, 1));
  const tr = A.SearchHourAngle(A.Body.Moon, obs, 0, t0);
  const at = tr && tr.time.date < t1 ? tr.time.date : new Date(t0.getTime() + 21 * 36e5);
  const angle = A.MoonPhase(at);
  return {lit: Math.round(A.Illumination(A.Body.Moon, at).phase_fraction * 100), phase: phaseName(angle), waxing: angle < 180, rise, set};
}

// Next full moon on or after a local date: its local date, time and that day's moonrise.
export function nextFullMoon(fromDate, tz, lat, lon) {
  const fm = A.SearchMoonPhase(180, new Date(localMidnight(fromDate, tz)), 40);
  if (!fm) return null;
  const date = localDate(fm.date, tz);
  return {date, time: hhmm(fm.date, tz), rise: moonForDay(date, tz, lat, lon).rise};
}

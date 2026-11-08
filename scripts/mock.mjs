// Sample data in Open-Meteo's shape, for local testing only (MOCK=1). Not real weather.
export function mockForecast(locs, days) {
  const TZ = 'America/Jamaica';
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: TZ}).format(new Date());
  const dates = [];
  for (let d = -1; d < days; d++) { const x = new Date(today + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + d); dates.push(x.toISOString().slice(0, 10)); }
  const time = dates.flatMap(d => Array.from({length: 24}, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
  const wx = locs.map((l, li) => {
    const H = {time};
    const f = fn => time.map((t, i) => fn(Number(t.slice(11, 13)), Math.floor(i / 24) - 1, li));
    H.temperature_2m = f((h, d) => +(24 + 5 * Math.sin((h - 9) / 24 * 2 * Math.PI) + d * 0.3).toFixed(1));
    H.relative_humidity_2m = f(h => Math.round(80 - 12 * Math.sin((h - 9) / 24 * 2 * Math.PI)));
    H.dew_point_2m = f(() => 21.5);
    H.apparent_temperature = f((h, d) => +(25 + 6 * Math.sin((h - 9) / 24 * 2 * Math.PI) + d * 0.3).toFixed(1));
    H.precipitation_probability = f((h, d) => h >= 15 && h <= 19 ? 60 + d * 5 : 15);
    H.precipitation = f((h, d) => h >= 16 && h <= 18 ? (d === 3 ? 16 : 0.6) : 0);
    H.weather_code = f((h, d) => h >= 16 && h <= 18 ? (d === 3 ? 95 : 80) : (h < 8 ? 1 : 2));
    H.cloud_cover = f(h => h >= 15 ? 70 : 30);
    H.wind_speed_10m = f(h => h >= 11 && h <= 17 ? 18 : 7);
    H.wind_gusts_10m = f((h, d) => h >= 11 && h <= 17 ? 30 + d : 12);
    H.wind_direction_10m = f(() => 110);
    H.uv_index = f(h => h >= 9 && h <= 15 ? 9 : h >= 7 && h <= 17 ? 3 : 0);
    H.surface_pressure = f(() => 1012);
    return {hourly: H, daily: {time: dates, sunrise: dates.map(d => d + 'T06:09'), sunset: dates.map(d => d + 'T17:32')}};
  });
  const aq = locs.map(() => {
    const H = {time, us_aqi: time.map(() => 28), us_aqi_pm2_5: time.map(() => 15), us_aqi_ozone: time.map(() => 28), pm2_5: time.map(() => 3.7), ozone: time.map(() => 32.4)};
    return {hourly: H};
  });
  return {wx, aq};
}

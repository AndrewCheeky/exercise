# RunRide Jamaica

Morning and evening running and cycling forecasts for places around Jamaica, published as a website on GitHub Pages.

## How it works
- **Locations** come from a Google Sheet published as CSV (repository variable `LOCATIONS_CSV_URL`), or from `data/locations.json` if the sheet isn't set or can't be read.
  Sheet columns: `name`, `lat`, `lon`, and optionally `area`, `sport` (`run`, `cycle` or `both`) and `key`.
- **Forecasts**: Open-Meteo weather and air quality (CC BY 4.0), one batched request each, every 3 hours (`.github/workflows/build.yml`).
- **Scoring**: the Go Run Index from the Wx-Exercise5day Apps Script v2.7.0, ported unchanged in `scripts/index-rules.mjs` (0–10: 7–10 Go, 5–6 Caution, 0–4 Avoid), for morning 4:30–7:00 and evening 4:30–6:30 Jamaica time, 7 days.
- **Website**: `site/` (plain HTML, CSS and JavaScript). The build writes `_site/data/forecast.json`.

## Run locally
```
MOCK=1 node scripts/build.mjs      # sample data, no network
node scripts/build.mjs             # real Open-Meteo data
```

## One-time setup
1. Settings → Pages → Source: **GitHub Actions**.
2. Optional: Settings → Secrets and variables → Actions → Variables → `LOCATIONS_CSV_URL` = your sheet's published CSV link.
3. Actions → **Build forecast and publish site** → Run workflow.

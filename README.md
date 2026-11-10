# Jamaica Active

Morning and evening forecasts for running, walking and cycling for places around Jamaica, published as a website on GitHub Pages.

## How it works
- **Locations** come from the `exercise` tab of the Marine Weather Jamaica Google Sheet, read with the same Google service account (secret `GOOGLE_SERVICE_ACCOUNT_JSON`). If that can't be read, a published CSV link (`LOCATIONS_CSV_URL`) or `data/locations.json` is used.
  Columns: `name`, `lat`, `lon`, and optionally `area`, `sport` (`run`, `cycle` or `both`) and `key`.
- **Forecasts**: Open-Meteo weather and air quality (CC BY 4.0), one batched request each, three times a day at 3:40 AM, 12:00 PM and 4:00 PM Jamaica time (`.github/workflows/build.yml`).
- **Scoring**: the Go Run Index from the Wx-Exercise5day Apps Script v2.7.0, ported unchanged in `scripts/index-rules.mjs` (0–10: 7–10 Go, 5–6 Caution, 0–4 Avoid; one 'mixed' score for everyone, as in the email), for morning 4:30–7:00 and evening 4:30–6:30 Jamaica time, 7 days.
- **Website**: `site/` (plain HTML, CSS and JavaScript). The build writes `_site/data/forecast.json`.

## Run locally
```
MOCK=1 node scripts/build.mjs      # sample data, no network
node scripts/build.mjs             # real Open-Meteo data
```

## One-time setup
1. Settings → Pages → Source: **GitHub Actions**.
2. Settings → Secrets and variables → Actions → **New repository secret** `GOOGLE_SERVICE_ACCOUNT_JSON`: the same service-account JSON the marine-weather repository uses.
3. In the Marine Weather sheet, add a tab named **exercise** with the columns above (a different tab name can be set with the variable `SHEET_TAB`).
4. Actions → **Build forecast and publish site** → Run workflow.

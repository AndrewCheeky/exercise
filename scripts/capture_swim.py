"""Swim walkthrough of active.islandsoutside.com: phone-size screenshots + manifest (temporary)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]; os.makedirs(f'{OUT}/frames', exist_ok=True); shots = []
SITE = 'https://active.islandsoutside.com/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 432, 'height': 768}, device_scale_factor=2.5, is_mobile=True, has_touch=True, timezone_id='America/Jamaica')
        pg = await ctx.new_page()
        async def center(sel, i=0):
            els = await pg.query_selector_all(sel)
            if len(els) <= i: return None
            bx = await els[i].bounding_box()
            return [round(bx['x'] + bx['width'] / 2, 1), round(bx['y'] + bx['height'] / 2, 1)] if bx else None
        async def shot(name, caption, tap=None, hold=4.0):
            await pg.screenshot(path=f'{OUT}/frames/{name}.jpg', type='jpeg', quality=92)
            shots.append({'name': name, 'caption': caption, 'tap': tap, 'hold': hold, 'new': False}); print('shot', name, tap)
        async def scroll_to(sel, i=0, off=-12):
            await pg.evaluate(f"(() => {{ const e = document.querySelectorAll({json.dumps(sel)})[{i}]; if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY + {off}); }})()")
            await pg.wait_for_timeout(500)
        tidy = "document.getElementById('newhere')?.setAttribute('hidden','');"
        await pg.goto(SITE, wait_until='networkidle'); await pg.wait_for_timeout(2500); await pg.evaluate(tidy)
        t = await center('[data-mode="swim"]'); await pg.click('[data-mode="swim"]'); await pg.wait_for_timeout(1500)
        # pick a beach: prefer Hellshire or Negril, otherwise the first place that shows waves
        opts = await pg.evaluate("[...document.getElementById('place').options].map(o => [o.value, o.textContent])")
        print('places:', opts)
        pick = next((v for v, n in opts if 'Hellshire' in n), None) or next((v for v, n in opts if 'Negril' in n or 'Beach' in n), None)
        if pick:
            await pg.select_option('#place', pick); await pg.wait_for_timeout(1500)
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
        await shot('s1-hero', 'Switch to Swim: your best time in the water today.', tap=t)
        await scroll_to('.win', 0)
        await shot('s2-card', 'Score out of 10 for each swim window, with safety notes.', tap=await center('.win .ring, .win .score', 0))
        await pg.evaluate("document.querySelectorAll('.win .more')[0]?.click()"); await pg.wait_for_timeout(600)
        await scroll_to('.win .stats', 0, off=-120)
        await shot('s3-details', 'Waves, swell period, rip risk, wind, water temperature and water quality.', tap=await center('.win .more', 0))
        await pg.mouse.move(420, 760); await pg.evaluate("document.getElementById('htip')?.setAttribute('hidden','')")
        await scroll_to('#hstrip', 0, off=-70)
        await shot('s4-hourly', 'Score by the hour: pick the calmest time.', tap=await center('.hstrip-row > *', 2))
        pool = next((v for v, n in opts if 'Aquatic' in n or 'Pool' in n or 'pool' in n), None)
        if pool:
            await pg.select_option('#place', pool); await pg.wait_for_timeout(1500)
            await scroll_to('.win', 0)
            await shot('s5-pool', 'Pool swimmers: thunder, showers, deck heat and sun.', tap=None)
        await scroll_to('.section-head')
        await shot('s6-week', 'Plan the week: tap a day to see its swim windows.', tap=await center('.days .day', 2))
        json.dump(shots, open(f'{OUT}/manifest.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())

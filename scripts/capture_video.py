"""How-to walkthrough of active.islandsoutside.com: phone-size screenshots + manifest (temporary)."""
import asyncio, json, os, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]; os.makedirs(f'{OUT}/frames', exist_ok=True); shots = []
SITE = 'https://active.islandsoutside.com/'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 432, 'height': 768}, device_scale_factor=2.5, is_mobile=True, has_touch=True, timezone_id='America/Jamaica')
        await ctx.add_init_script("try { localStorage.setItem('wo.newhere', '1'); } catch (e) {}")
        pg = await ctx.new_page()
        async def center(sel, i=0):
            els = await pg.query_selector_all(sel)
            if len(els) <= i: return None
            bx = await els[i].bounding_box()
            return [round(bx['x'] + bx['width'] / 2, 1), round(bx['y'] + bx['height'] / 2, 1)] if bx else None
        async def shot(name, caption, tap=None, hold=3.8, new=False):
            await pg.screenshot(path=f'{OUT}/frames/{name}.jpg', type='jpeg', quality=92)
            shots.append({'name': name, 'caption': caption, 'tap': tap, 'hold': hold, 'new': new}); print('shot', name, tap)
        async def scroll_to(sel, i=0, block='start', off=-12):
            await pg.evaluate(f"(() => {{ const e = document.querySelectorAll({json.dumps(sel)})[{i}]; if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY + {off}); }})()")
            await pg.wait_for_timeout(500)
        tidy = "document.getElementById('newhere')?.setAttribute('hidden',''); document.querySelector('.cookie, .consent')?.remove();"

        await pg.goto(SITE, wait_until='networkidle'); await pg.wait_for_timeout(3000); await pg.evaluate(tidy)
        await shot('01-open', 'Open the site: your best time today to run, walk or ride, at a glance.', hold=4.0)
        await shot('02-place', 'Pick your area. Over 60 places across five islands.', tap=await center('#place'), hold=3.6)
        await scroll_to('.section-head'); await pg.evaluate("document.querySelectorAll('.days .day')[1]?.click()"); await pg.wait_for_timeout(600)
        await scroll_to('.section-head')
        await shot('03-week', 'Plan the week: tap a day. Dots show how good each morning and evening looks.', tap=await center('.days .day', 1), hold=4.2)
        await pg.evaluate("document.querySelectorAll('.days .day')[0]?.click()"); await pg.wait_for_timeout(600)
        await scroll_to('.win', 0)
        await shot('04-window', 'Every morning and evening gets a score out of 10, a verdict and plain tips.', tap=await center('.win .ring, .win .score', 0), hold=4.4)
        await pg.evaluate("document.querySelectorAll('.win .more')[0]?.click()"); await pg.wait_for_timeout(600)
        await scroll_to('.win .stats', 0, off=-140)
        await shot('05-details', 'More details: heat, rain, wind, UV, air quality, and now the moon.', tap=await center('.win .more', 0), hold=4.0)
        # moon: the evening card's moon note or tiles, and the full-moon line
        has_note = await pg.evaluate("!!document.querySelector('.moon-tip')")
        if has_note:
            await scroll_to('.moon-tip', 0, off=-260)
            await shot('06-moon', 'New: moon notes for moonlit runs and rides, with a cloud check.', tap=await center('.moon-tip'), hold=4.4, new=True)
        await scroll_to('.section-head')
        await shot('07-fullmoon', 'New: % of moon lit for each day, and the next full moon, to plan group runs.', tap=await center('#fullmoon'), hold=4.4, new=True)
        await scroll_to('#hstrip', 0)
        await shot('08-hourly', 'Score by the hour: fine-tune your start time.', tap=await center('.hstrip-row > *', 3), hold=3.8)
        await pg.evaluate("window.scrollTo(0,0)"); await pg.wait_for_timeout(300)
        t = await center('[data-mode="swim"]'); await pg.click('[data-mode="swim"]'); await pg.wait_for_timeout(1800)
        await shot('09-swim', 'Swimmers: switch to Swim for beach and pool conditions.', tap=t, hold=4.0)
        await scroll_to('.win', 0)
        await shot('10-swimcard', 'Beach or pool: conditions and safety notes for each swim window.', hold=4.0)
        await pg.goto(SITE + 'barbados/', wait_until='networkidle'); await pg.wait_for_timeout(2500); await pg.evaluate(tidy)
        await shot('11-islands', 'Same features for Cayman, Barbados, Trinidad and Tobago, and Grenada.', hold=4.2)
        await pg.goto(SITE + 'how-it-works.html', wait_until='networkidle'); await pg.wait_for_timeout(1200)
        await shot('12-how', 'How it works explains every score, in plain language.', hold=3.6)
        json.dump(shots, open(f'{OUT}/manifest.json', 'w'), indent=1)
        await b.close()
asyncio.run(main())

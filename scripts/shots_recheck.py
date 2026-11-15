"""0.4.4 re-check fix screenshots → /workspace/pd-buddy-shots/recheck-v8-*.png.
Serve the repo on :18437 first (python3 -m http.server 18437). External hosts blocked."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
URL = "http://127.0.0.1:18437/"
async def shot(page, name):
    await page.wait_for_timeout(300); await page.screenshot(path=str(OUT / name)); print("wrote", OUT / name)
async def scroll_to(page, sel, dy=12):
    await page.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); window.scrollTo({{top: e.getBoundingClientRect().top + window.scrollY - {dy}, behavior: 'instant'}}); }})()")
async def go(page, n):
    await page.click(f'#stepper [data-go="{n}"]'); await page.wait_for_timeout(300)
async def new(b, w=390, h=844):
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers="block")
    async def route(r):
        if r.request.url.startswith(URL): await r.continue_()
        else: await r.abort()
    await ctx.route("**/*", route)
    page = await ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    await page.goto(URL, wait_until="networkidle")
    return ctx, page, errs
async def patient_cm(page, age, cm, kg, sex="male"):
    await go(page, 1)
    await page.click(f'#p-sex [data-sex="{sex}"]'); await page.click('#p-hunit [data-hunit="cm"]')
    for k, v in [("#p-age", age), ("#p-cm", cm), ("#p-wt", kg)]: await page.fill(k, v)
    await page.click('#pet-type [data-ptype="high-average"]'); await page.evaluate("document.activeElement.blur()")
tops = "['top-capd','top-ccpd'].map(id => Array.from(document.querySelectorAll('#'+id+' .top-item')).map(b => b.querySelector('.top-name').innerText + ' | ' + b.querySelector('.top-nums').innerText.replace(/\\n+/g,' ')))"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        errs_all = []
        ctx, page, errs = await new(b); errs_all.append(errs)
        for tag, cm, kg in [("150cm-40kg", "150", "40"), ("145cm-38kg", "145", "38")]:
            await patient_cm(page, "70", cm, kg); await go(page, 2)
            print("==", tag, await page.text_content("#sum-line"))
            print(json.dumps(await page.evaluate(tops), ensure_ascii=False, indent=1))
            await scroll_to(page, "#top-capd-card"); await shot(page, f"recheck-v8-small-{tag}-capd.png")
            await scroll_to(page, "#top-ccpd-card"); await shot(page, f"recheck-v8-small-{tag}-ccpd.png")
        # no fit: 60 cm / 20 kg (BSA 0.58)
        await patient_cm(page, "30", "60", "20"); await go(page, 2)
        print("== no-fit basis:", await page.text_content("#rank-basis"))
        print("   cards:", await page.evaluate("Array.from(document.querySelectorAll('#top-capd .top-empty, #top-ccpd .top-empty')).map(e=>e.textContent)"))
        await page.evaluate("window.scrollTo(0,0)"); await shot(page, "recheck-v8-nofit-step2.png")
        await scroll_to(page, "#top-capd-card"); await shot(page, "recheck-v8-nofit-cards.png")
        await go(page, 4); print("   step 4:", await page.text_content("#ts-cur"))
        # height block: 1,780 cm
        await patient_cm(page, "55", "1780", "80")
        print("== height block:", await page.text_content("#p-msg"), "| V:", await page.text_content("#o-v"))
        print("   step-2 reachable?", await page.evaluate("(document.getElementById('step-next').click(), document.getElementById('step-2').classList.contains('is-on'))"))
        print("   options rendered:", await page.evaluate("document.querySelectorAll('.top-item').length"), "| amber notes visible:", await page.evaluate("Array.from(document.querySelectorAll('.amber-note')).filter(e=>getComputedStyle(e).display!=='none' || e.textContent).length"))
        await scroll_to(page, "#patient-card"); await shot(page, "recheck-v8-height-block-cm.png")
        await page.click('#p-hunit [data-hunit="ftin"]'); await page.fill("#p-ft", "8"); await page.fill("#p-in", "11.9"); await page.evaluate("document.activeElement.blur()")
        print("== ft/in block:", await page.text_content("#p-msg"))
        await scroll_to(page, "#patient-card"); await shot(page, "recheck-v8-height-block-ftin.png")
        await ctx.close()
        # iPhone SE
        ctx, page, errs = await new(b, 375, 667); errs_all.append(errs)
        await page.click("#try-example"); await page.wait_for_timeout(400)
        geo = await page.evaluate("(() => { const n = document.querySelector('#top-capd .top-nums').getBoundingClientRect(); const bar = document.querySelector('.step-bar').getBoundingClientRect(); return {numsBottom: Math.round(n.bottom), barTop: Math.round(bar.top)}; })()")
        print("== SE:", geo); await shot(page, "recheck-v8-se-step2.png")
        await ctx.close()
        ctx, page, errs = await new(b, 375, 667); errs_all.append(errs)
        await patient_cm(page, "70", "150", "40"); await go(page, 2); await shot(page, "recheck-v8-se-step2-150cm-40kg.png")
        await ctx.close()
        print("JS errors:", [e for es in errs_all for e in es]); await b.close()
asyncio.run(main())

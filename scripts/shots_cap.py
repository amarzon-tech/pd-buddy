"""0.4.2 fill-cap screenshots (390x844) → /workspace/pd-buddy-shots/cap-v6-*.png.
Serve the repo on :18437 first (python3 -m http.server 18437). External hosts blocked."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
async def shot(page, name):
    await page.wait_for_timeout(250); await page.screenshot(path=str(OUT / name)); print("wrote", OUT / name)
async def scroll_to(page, sel):
    await page.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); window.scrollTo({{top: e.getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'}}); }})()")
async def go(page, n):
    await page.click(f'#stepper [data-go="{n}"]'); await page.wait_for_timeout(250)
async def tops(page):
    return await page.evaluate("['top-capd','top-ccpd'].map(id => Array.from(document.querySelectorAll('#'+id+' .top-item')).map(b => b.innerText.replace(/\\n+/g,' | ')))")
async def patient(page, tag, ft, inch, kg):
    await go(page, 1)
    for k, v in [("#p-age", "55"), ("#p-ft", ft), ("#p-in", inch), ("#p-wt", kg)]:
        await page.fill(k, v)
    await page.click('#pet-type [data-ptype="high-average"]')
    await page.fill("#l-uvol", "500")
    await page.evaluate("document.activeElement.blur(); window.scrollTo({top: 0, behavior: 'instant'})")
    await scroll_to(page, "#p-out"); await page.evaluate("window.scrollBy({top: -260, behavior: 'instant'})"); await shot(page, f"cap-v6-{tag}-step1.png")
    print(f"\n### {tag}: ", await page.inner_text("#p-out"))
async def step2(page, tag):
    await go(page, 2)
    print("==", tag, "==", await page.text_content("#sum-line"))
    for i, l in enumerate(await tops(page)): print(" ", ["CAPD", "CCPD"][i], json.dumps(l, ensure_ascii=False))
    await shot(page, f"cap-v6-{tag}-capd.png")
    await scroll_to(page, "#top-ccpd-card"); await shot(page, f"cap-v6-{tag}-ccpd.png")
    await scroll_to(page, "#top-ccpd-card .cap-note"); await page.evaluate("window.scrollBy({top: -560, behavior: 'instant'})"); await shot(page, f"cap-v6-{tag}-ccpd-capnote.png")
async def pet(page, on):
    await go(page, 1)
    if on:
        if not await page.evaluate("document.getElementById('pet-nums').open"): await page.click("#pet-nums summary")
        await page.fill("#pet-dpcr", "0.70"); await page.fill("#pet-dpu", "0.75")
    else:
        await page.evaluate("['pet-dpcr','pet-dpu'].forEach(id => { const e = document.getElementById(id); e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); })")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, color_scheme="light", is_mobile=True, has_touch=True, service_workers="block")
        external = []
        async def route(r):
            if r.request.url.startswith("http://127.0.0.1:18437/"): await r.continue_()
            else: external.append(r.request.url); await r.abort()
        await ctx.route("**/*", route)
        page = await ctx.new_page(); errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:18437/", wait_until="networkidle")
        for tag, ft, inch, kg in [("example", "5", "10", "80"), ("large", "6", "2", "100")]:
            await patient(page, tag, ft, inch, kg)
            await pet(page, False); await step2(page, tag + "-type-only")
            await pet(page, True); await step2(page, tag + "-pet")
        # Small patient: the cap binds; troubleshoot shows "fill cap reached"
        await patient(page, "small", "5", "2", "55")
        await pet(page, False); await step2(page, "small-type-only")
        await go(page, 3); await page.select_option("#cur-rx", "capd-4x2.0")
        print("cur-rx above cap:", await page.evaluate("Array.from(document.querySelectorAll('#cur-rx option')).filter(o => /above fill cap/.test(o.textContent)).length"))
        await go(page, 4); await page.click('#ts-problem [data-problem="clearance"]')
        print("ts:", (await page.inner_text("#ts-sugg")).replace("\n", " / "))
        await scroll_to(page, "#ts-sugg"); await page.evaluate("window.scrollBy({top: -60, behavior: 'instant'})"); await shot(page, "cap-v6-small-troubleshoot.png")
        print("\nexternal requests attempted:", external); print("errors:", errs)
        await b.close()
asyncio.run(main())

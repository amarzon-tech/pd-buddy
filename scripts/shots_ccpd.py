"""0.4.1 CCPD screenshots (390x844) → /workspace/pd-buddy-shots/ccpd-v5-*.png.
Serve the repo on :18437 first (python3 -m http.server 18437). External hosts blocked."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
async def shot(page, name, full=False):
    await page.wait_for_timeout(250)
    await page.screenshot(path=str(OUT / name), full_page=full); print("wrote", OUT / name)
async def scroll_to(page, sel):
    await page.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); window.scrollTo({{top: e.getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'}}); }})()")
async def go(page, n):
    await page.click(f'#stepper [data-go="{n}"]'); await page.wait_for_timeout(250)
async def ccpd(page, tag):
    await go(page, 2)
    print("\n==", tag, "==\nbasis:", await page.text_content("#rank-basis"))
    print("note:", await page.text_content("#top-ccpd-note"))
    items = await page.evaluate("Array.from(document.querySelectorAll('#top-ccpd .top-item')).map(b => b.innerText.replace(/\\n+/g,' | '))")
    print(json.dumps(items, indent=1, ensure_ascii=False))
    await scroll_to(page, "#top-ccpd-card"); await shot(page, f"ccpd-v5-{tag}-top3.png")
    await page.evaluate("window.scrollBy(0, 600)"); await shot(page, f"ccpd-v5-{tag}-top3-more.png")
    await page.evaluate("document.getElementById('all-opts').open = true")
    await scroll_to(page, "#opt-table .op-row.grp:nth-of-type(n+2)")
    await page.evaluate("(() => { const g = Array.from(document.querySelectorAll('#opt-table .op-row.grp')).find(x => /CCPD/.test(x.textContent)); window.scrollTo({top: g.getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'}); })()")
    await shot(page, f"ccpd-v5-{tag}-all-options.png")
    await page.evaluate("document.getElementById('all-opts').open = false")
    first = page.locator("#top-ccpd [data-pick]").first
    await first.click(); await page.wait_for_timeout(250)
    await scroll_to(page, "#rx-card"); await shot(page, f"ccpd-v5-{tag}-rx.png")
    print("rx:", (await page.inner_text("#rx-sheet")).replace("\n", " / "))
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
        for k, v in [("#p-age", "55"), ("#p-ft", "5"), ("#p-in", "10"), ("#p-wt", "80")]:
            await page.fill(k, v)
        await page.click('#pet-type [data-ptype="high-average"]')
        await page.fill("#l-uvol", "500")
        await ccpd(page, "type-only")
        await go(page, 1)
        await page.click("#pet-nums summary")
        await page.fill("#pet-dpcr", "0.70"); await page.fill("#pet-dpu", "0.75")
        await ccpd(page, "pet-numbers")
        # Troubleshoot from CCPD 5 x 2.5 L, 9 h + day dwell (the 0.4.0 best CCPD)
        await go(page, 3)
        await page.select_option("#cur-rx", "ccpd-5x2.5-day")
        await go(page, 4)
        await page.click('#ts-problem [data-problem="clearance"]')
        print("\n== troubleshoot ==\n", await page.text_content("#ts-cur"))
        print((await page.inner_text("#ts-sugg")).replace("\n", " / "))
        await scroll_to(page, "#ts-sugg"); await shot(page, "ccpd-v5-troubleshoot-clearance.png")
        await page.evaluate("window.scrollBy(0, 650)"); await shot(page, "ccpd-v5-troubleshoot-clearance-more.png")
        print("\nexternal requests attempted:", external)
        print("errors:", errs)
        await b.close()
asyncio.run(main())

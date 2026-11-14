"""Mobile screenshots of the redesign (390x844). Serve the repo on :18437 first:
   python3 -m http.server 18437   then   python3 scripts/shots.py"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
async def shot(page, name, full=False):
    await page.wait_for_timeout(300)
    await page.screenshot(path=str(OUT / name), full_page=full); print("wrote", OUT / name)
async def tops(page):
    return await page.evaluate("""() => ['top-capd','top-ccpd'].map(id => ({id, note: document.getElementById(id+'-note').classList.contains('hidden') ? '' : document.getElementById(id+'-note').textContent,
      items: Array.from(document.querySelectorAll('#'+id+' .top-item')).map(b => b.innerText.replace(/\\n+/g,' | '))}))""")
async def results(page, tag):
    await page.click("#step-next")
    await page.wait_for_timeout(300)
    print("\n==", tag, "==\nsummary:", await page.text_content("#sum-line"))
    print("basis:", await page.text_content("#rank-basis"))
    print(json.dumps(await tops(page), indent=1, ensure_ascii=False))
    await shot(page, f"results-{tag}-top.png")
    await page.locator("#top-ccpd-card").scroll_into_view_if_needed()
    await page.evaluate("window.scrollTo({top: document.getElementById('top-ccpd-card').getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'})")
    await shot(page, f"results-{tag}-ccpd.png")
    await shot(page, f"results-{tag}-full.png", full=True)
    await page.click("#step-back")
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3, color_scheme="light", is_mobile=True, has_touch=True)
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:18437/", wait_until="networkidle")
        await shot(page, "inputs-empty.png")
        # Example: male, 55 y, 5 ft 10 in, 80 kg, high-average, 500 mL urine
        for k, v in [("#p-age", "55"), ("#p-ft", "5"), ("#p-in", "10"), ("#p-wt", "80")]:
            await page.fill(k, v)
        await page.click('#pet-type [data-ptype="high-average"]')
        await page.fill("#l-uvol", "500")
        await page.evaluate("document.activeElement.blur(); window.scrollTo({top: 0, behavior: 'instant'})")
        await shot(page, "inputs-type-only.png")
        await page.evaluate("window.scrollTo({top: document.getElementById('pet-card').getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'})")
        await shot(page, "inputs-type-only-lower.png")
        await shot(page, "inputs-type-only-full.png", full=True)
        print("V", await page.text_content("#o-v"), "BSA", await page.text_content("#o-bsa"))
        print("pet:", await page.text_content("#pet-msg")); print("rkf:", await page.text_content("#rkf-msg"))
        await results(page, "type-only")
        # With PET numbers: D/P urea 0.75, D/P Cr 0.70 (drain blank -> typical)
        await page.click("#pet-nums summary")
        await page.fill("#pet-dpcr", "0.70"); await page.fill("#pet-dpu", "0.75")
        await page.locator("#pet-card").scroll_into_view_if_needed()
        await page.evaluate("window.scrollTo({top: document.getElementById('pet-card').getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'})")
        await shot(page, "inputs-pet-numbers.png")
        print("pet:", await page.text_content("#pet-msg"))
        await results(page, "pet-numbers")
        # Illustration only: residual details (illustrative labs, not from Dr D)
        await page.click("#rkf-details summary")
        for k, v in [("#l-uu", "400"), ("#l-pu", "60"), ("#l-ucr", "60"), ("#l-pcr", "8")]:
            await page.fill(k, v)
        print("rkf:", await page.text_content("#rkf-msg"))
        await results(page, "pet-numbers-with-rkf-illustrative")
        print("errors:", errs)
        await b.close()
asyncio.run(main())

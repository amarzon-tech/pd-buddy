"""Mobile screenshots of the 0.4 four-step workflow (390x844). Serve the repo on :18437 first:
   python3 -m http.server 18437   then   python3 scripts/shots.py
Blocks every host except 127.0.0.1:18437 and reports any attempt (OCR must stay on device)."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
ROOT = Path(__file__).resolve().parent.parent
async def shot(page, name, full=False):
    await page.wait_for_timeout(250)
    await page.screenshot(path=str(OUT / name), full_page=full); print("wrote", OUT / name)
async def scroll_to(page, el_id):
    await page.evaluate(f"window.scrollTo({{top: document.getElementById('{el_id}').getBoundingClientRect().top + window.scrollY - 12, behavior: 'instant'}})")
async def tops(page, ids=("top-capd", "top-ccpd")):
    return await page.evaluate("""(ids) => ids.map(id => ({id, items: Array.from(document.querySelectorAll('#'+id+' .top-item')).map(b => b.innerText.replace(/\\n+/g,' | '))}))""", list(ids))
async def go(page, n):
    await page.click(f'#stepper [data-go="{n}"]'); await page.wait_for_timeout(250)
async def step2(page, tag):
    await go(page, 2)
    print("\n==", tag, "== step 2\nsummary:", await page.text_content("#sum-line"))
    print("basis:", await page.text_content("#rank-basis"))
    print(json.dumps(await tops(page), indent=1, ensure_ascii=False))
    print("grid:", await page.text_content("#grid-key")); print((await page.inner_text("#grid-body")).replace("\n", " / "))
    await shot(page, f"step2-{tag}-top.png")
    await scroll_to(page, "top-ccpd-card"); await shot(page, f"step2-{tag}-ccpd.png")
    await scroll_to(page, "grid-card"); await shot(page, f"step2-{tag}-grid.png")
    await shot(page, f"step2-{tag}-full.png", full=True)
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
        # Example: male, 55 y, 5 ft 10 in, 80 kg, high-average, 500 mL urine (type only)
        for k, v in [("#p-age", "55"), ("#p-ft", "5"), ("#p-in", "10"), ("#p-wt", "80")]:
            await page.fill(k, v)
        await page.click('#pet-type [data-ptype="high-average"]')
        await page.fill("#l-uvol", "500")
        await page.evaluate("document.activeElement.blur(); window.scrollTo({top: 0, behavior: 'instant'})")
        await shot(page, "step1-patient.png")
        await scroll_to(page, "pet-card"); await shot(page, "step1-patient-pet.png")
        print("pet:", await page.text_content("#pet-msg")); print("rkf:", await page.text_content("#rkf-msg"))
        await step2(page, "type-only")
        # Same patient with PET numbers: D/P Cr 0.70, D/P urea 0.75 (drain typical)
        await go(page, 1)
        await page.click("#pet-nums summary")
        await page.fill("#pet-dpcr", "0.70"); await page.fill("#pet-dpu", "0.75")
        print("pet:", await page.text_content("#pet-msg"))
        await step2(page, "pet-numbers")
        # Step 3: scan the synthetic lab report (on-device OCR), confirm, re-rank
        await go(page, 3)
        await page.select_option("#cur-rx", "capd-4x2.5")  # the prescription the patient is on now
        await shot(page, "step3-adequacy-empty.png")
        await page.set_input_files("#scan-file", str(ROOT / "tests/fixtures/sample-lab-report.png"))
        await page.wait_for_function("/found|No recognizable|Could not/.test(document.getElementById('scan-msg').textContent)", timeout=120000)
        print("\n== step 3 ==\nscan:", await page.text_content("#scan-msg"))
        await scroll_to(page, "labs-card"); await shot(page, "step3-scanned-unconfirmed.png")
        print("adequacy before confirm:", (await page.inner_text("#adeq-body")).replace("\n", " / "))
        n = await page.locator("[data-confirm]").count()
        for _ in range(n):
            await page.locator("[data-confirm]").first.click()
        await scroll_to(page, "adeq-card"); await shot(page, "step3-adequacy-measured.png")
        print("adequacy:", (await page.inner_text("#adeq-body")).replace("\n", " / "))
        print("updated basis:", await page.text_content("#upd-basis"))
        print("diff:", (await page.inner_text("#upd-diff")).replace("\n", " / "))
        print(json.dumps(await tops(page, ("upd-capd", "upd-ccpd")), indent=1, ensure_ascii=False))
        await scroll_to(page, "update-card"); await shot(page, "step3-updated-choices.png")
        await shot(page, "step3-full.png", full=True)
        # Step 4: troubleshoot each problem (current Rx = picked option)
        await go(page, 4)
        for prob in ["clearance", "uf", "rkf"]:
            await page.click(f'#ts-problem [data-problem="{prob}"]')
            if prob == "rkf":
                await page.fill("#ts-uvol", "100"); await page.fill("#ts-ktvr", "0.05")
            print(f"\n== step 4 {prob} ==\n", await page.text_content("#ts-cur"))
            print((await page.inner_text("#ts-sugg")).replace("\n", " / ")[:900])
            await shot(page, f"step4-{prob}.png")
            await scroll_to(page, "ts-guide-card"); await shot(page, f"step4-{prob}-guidance.png")
            await page.evaluate("window.scrollTo(0,0)")
        # Loop: adopt labs as baseline, then step 2 again
        await go(page, 3)
        await page.click("#lab-adopt")
        print("\nadopted:", await page.text_content("#scan-msg"))
        await step2(page, "after-labs")
        print("\nexternal requests attempted:", external)
        print("errors:", errs)
        await b.close()
asyncio.run(main())

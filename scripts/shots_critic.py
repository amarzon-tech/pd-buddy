"""0.4.3 App Critic fix screenshots → /workspace/pd-buddy-shots/critic-v7-*.png.
Serve the repo on :18437 first (python3 -m http.server 18437). External hosts blocked."""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
URL = "http://127.0.0.1:18437/"
async def shot(page, name, full=False):
    await page.wait_for_timeout(300); await page.screenshot(path=str(OUT / name), full_page=full); print("wrote", OUT / name)
async def scroll_to(page, sel, dy=12):
    await page.evaluate(f"(() => {{ const e = document.querySelector('{sel}'); window.scrollTo({{top: e.getBoundingClientRect().top + window.scrollY - {dy}, behavior: 'instant'}}); }})()")
async def go(page, n):
    await page.click(f'#stepper [data-go="{n}"]'); await page.wait_for_timeout(250)
async def ctx_page(b, w=390, h=844, scheme="light"):
    ctx = await b.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, color_scheme=scheme, is_mobile=True, has_touch=True, service_workers="block")
    async def route(r):
        if r.request.url.startswith(URL): await r.continue_()
        else: await r.abort()
    await ctx.route("**/*", route)
    page = await ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    await page.goto(URL, wait_until="networkidle")
    return ctx, page, errs
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        allerr = []
        # 1. first run: no card numbers, nothing-saved note, try example
        ctx, page, errs = await ctx_page(b); allerr.append(errs)
        await scroll_to(page, "#patient-card"); await shot(page, "critic-v7-01-step1-first-run.png")
        # 2. input blocks: 178 in the ft box, age 16
        await page.fill("#p-age", "16"); await page.fill("#p-ft", "178"); await page.fill("#p-wt", "80")
        await page.evaluate("document.activeElement.blur()")
        await scroll_to(page, "#patient-card"); await shot(page, "critic-v7-02-input-blocked.png")
        print("p-msg:", await page.text_content("#p-msg"))
        # cm option
        await page.fill("#p-age", "55"); await page.click('#p-hunit [data-hunit="cm"]'); await page.fill("#p-cm", "178")
        await page.evaluate("document.activeElement.blur()")
        await scroll_to(page, "#patient-card"); await shot(page, "critic-v7-03-height-cm.png")
        # 3. D/P 70 → Did you mean 0.70
        await page.click('#pet-type [data-ptype="high-average"]')
        if not await page.evaluate("document.getElementById('pet-nums').open"): await page.click("#pet-nums summary")
        await page.fill("#pet-dpcr", "70"); await page.evaluate("document.activeElement.blur()")
        await scroll_to(page, "#pet-card"); await shot(page, "critic-v7-04-dp-did-you-mean.png")
        print("pet-msg:", await page.text_content("#pet-msg"))
        await page.click("[data-dpfix]"); print("after fix:", await page.input_value("#pet-dpcr"))
        await page.evaluate("['pet-dpcr','pet-dpu'].forEach(id => { const e = document.getElementById(id); e.value = ''; e.dispatchEvent(new Event('input', {bubbles: true})); })")
        await ctx.close()
        # 4. example patient → step 2 neutral cards
        ctx, page, errs = await ctx_page(b); allerr.append(errs)
        await page.click("#try-example"); await page.wait_for_timeout(300)
        print("sum:", await page.text_content("#sum-line"))
        await shot(page, "critic-v7-05-step2-top.png")
        await scroll_to(page, "#top-capd-card"); await shot(page, "critic-v7-06-capd-options.png")
        print("CAPD:", json.dumps(await page.evaluate("Array.from(document.querySelectorAll('#top-capd .top-item')).map(b => b.innerText.replace(/\\n+/g,' | '))"), ensure_ascii=False))
        await scroll_to(page, "#top-ccpd-card"); await shot(page, "critic-v7-07-ccpd-options.png")
        print("CCPD:", json.dumps(await page.evaluate("Array.from(document.querySelectorAll('#top-ccpd .top-item')).map(b => b.innerText.replace(/\\n+/g,' | '))"), ensure_ascii=False))
        await scroll_to(page, "#grid-card"); await shot(page, "critic-v7-08-grid-heading.png")
        await scroll_to(page, "#rx-card"); await shot(page, "critic-v7-09-rx-card.png")
        print("rx text:\n" + await page.evaluate("document.getElementById('rx-sheet').dataset.text"))
        # print preview
        await page.emulate_media(media="print"); await page.evaluate("window.scrollTo(0,0)")
        await shot(page, "critic-v7-10-print-preview.png", full=True)
        print("print visible text:", (await page.evaluate("document.body.innerText"))[:400].replace("\n", " / "))
        await page.emulate_media(media="screen")
        # footer trademark
        await page.evaluate("window.scrollTo({top: document.body.scrollHeight, behavior: 'instant'})"); await shot(page, "critic-v7-11-footer.png")
        # 5. step 3 OCR: source line, unit pick, blocked confirm
        await go(page, 3)
        txt = "Weekly Kt/V: renal 0.52, peritoneal 1.61, total 2.13\nSerum creatinine (ref 0.7-1.3) 9.4 mg/dL\nDialysate creatinine 5.1\nDialysate urea 40 mg/dL\nSerum urea 12 mmol/L\n24h dialysate volume 9.6 L"
        await page.evaluate("(t) => { const d = document.getElementById('scan-text').closest('details'); if (d) d.open = true; }", txt)
        await page.fill("#scan-text", txt); await page.click("#scan-parse"); await page.wait_for_timeout(300)
        await scroll_to(page, "#lab-dcr-wrap", 140); await shot(page, "critic-v7-12-ocr-unit-pick.png")
        await scroll_to(page, "#lab-surea-wrap", 140); await shot(page, "critic-v7-13-ocr-unit-conflict.png")
        print("confirm disabled:", await page.evaluate("Array.from(document.querySelectorAll('.confirm-btn')).map(b => b.dataset.confirm + ':' + b.disabled).join(' ')"))
        await page.select_option('[data-unitpick="dialCr"]', "mg/dl"); await page.wait_for_timeout(150)
        print("after unit pick:", await page.evaluate("Array.from(document.querySelectorAll('.confirm-btn')).map(b => b.dataset.confirm + ':' + b.disabled).join(' ')"))
        await scroll_to(page, "#cur-rx", 120); await shot(page, "critic-v7-14-current-closest-match.png")
        await ctx.close()
        # 6. dark mode step 2 button
        ctx, page, errs = await ctx_page(b, scheme="dark"); allerr.append(errs)
        await page.click("#try-example"); await page.wait_for_timeout(300)
        await page.evaluate("window.scrollTo({top: 0, behavior: 'instant'})"); await shot(page, "critic-v7-15-dark-step2.png")
        await ctx.close()
        # 7. iPhone SE step 2
        ctx, page, errs = await ctx_page(b, 375, 667); allerr.append(errs)
        await page.click("#try-example"); await page.wait_for_timeout(300); await shot(page, "critic-v7-16-se-step2.png")
        await ctx.close()
        # 8. BSA outside 1.7–2.0 with typical values
        ctx, page, errs = await ctx_page(b); allerr.append(errs)
        for k, v in [("#p-age", "55"), ("#p-ft", "6"), ("#p-in", "4"), ("#p-wt", "120")]: await page.fill(k, v)
        await page.click('#pet-type [data-ptype="high-average"]'); await page.fill("#l-uvol", "500"); await page.evaluate("document.activeElement.blur()")
        await scroll_to(page, "#pet-card"); await shot(page, "critic-v7-17-bsa-outside.png")
        await go(page, 2); await shot(page, "critic-v7-18-step2-bsa-rkf-notes.png")
        print("basis:", await page.text_content("#rank-basis"))
        await ctx.close()
        print("JS errors:", [e for es in allerr for e in es])
        await b.close()
asyncio.run(main())

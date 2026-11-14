import asyncio
from pathlib import Path
from playwright.async_api import async_playwright
OUT = Path("/workspace/pd-buddy-shots"); OUT.mkdir(exist_ok=True)
async def shot(page, name, full=False):
    await page.wait_for_timeout(250)
    await page.screenshot(path=str(OUT / name), full_page=full); print("wrote", OUT / name)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = await b.new_context(viewport={"width": 430, "height": 932}, device_scale_factor=2, color_scheme="light")
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await page.goto("http://127.0.0.1:18437/", wait_until="networkidle")
        # Male 60 y, 5 ft 9 in, 80 kg
        for k, v in [("#p-age", "60"), ("#p-ft", "5"), ("#p-in", "9"), ("#p-wt", "80")]:
            await page.fill(k, v)
        await shot(page, "step1-patient.png")
        print("V", await page.text_content("#o-v"), "BSA", await page.text_content("#o-bsa"))
        await page.click("#step-next")
        await page.click('#pet-type [data-ptype="high-average"]')
        await shot(page, "step2-type.png")
        print("cat", await page.text_content("#o-cat"), "MTAC", await page.text_content("#o-mtac"))
        await page.click("#step-next")
        await page.click("#step-next")
        await page.locator("#o-ktv-pred").scroll_into_view_if_needed()
        await shot(page, "step4-capd-type-estimate.png")
        print("CAPD 4x2 ktv", await page.text_content("#o-ktv-pred"), "crcl", await page.text_content("#o-crcl-pred"))
        print("reg-msg", await page.text_content("#reg-msg"))
        await page.click("#step-next")
        await page.wait_for_timeout(400)
        await page.evaluate("window.scrollTo(0,0)")
        await shot(page, "step5-options.png")
        await shot(page, "step5-full.png", full=True)
        print("rx text:\n", await page.get_attribute("#rx-sheet", "data-text"))
        # Numbers win + disagreement flag
        await page.click('.stepper-item[data-go="2"]')
        await page.click("#pet-nums summary")
        for k, v in [("#pet-dpcr", "0.85"), ("#pet-drain", "2000"), ("#pet-dpu", "0.95")]:
            await page.fill(k, v)
        await shot(page, "step2-numbers-flag.png")
        print("flag:", await page.text_content("#pet-msg"), "| cat", await page.text_content("#o-cat"))
        print("errors:", errs)
        await b.close()
asyncio.run(main())

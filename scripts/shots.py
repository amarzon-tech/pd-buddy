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
        await page.fill("#p-age", "60"); await page.fill("#p-ht", "175"); await page.fill("#p-wt", "80")
        await shot(page, "step1-patient.png")
        await page.click("#step-next")
        for k, v in [("#pet-dpcr", "0.70"), ("#pet-dd0", "0.35"), ("#pet-drain", "2200"), ("#pet-dpu", "0.90")]:
            await page.fill(k, v)
        await shot(page, "step2-pet.png")
        await page.click("#step-next")
        for k, v in [("#l-pu", "60"), ("#l-pcr", "8"), ("#l-uvol", "500"), ("#l-uu", "300"), ("#l-ucr", "40")]:
            await page.fill(k, v)
        await shot(page, "step3-labs.png")
        await page.click("#step-next")
        await shot(page, "step4-capd.png")
        await page.locator("#o-ktv-pred").scroll_into_view_if_needed()
        await shot(page, "step4-capd-estimate.png")
        print("CAPD ktv", await page.text_content("#o-ktv-pred"), "crcl", await page.text_content("#o-crcl-pred"))
        await page.click('#r-mod [data-mod="apd"]')
        for k, v in [("#a-n", "5"), ("#a-fill", "2.0"), ("#a-ttt", "9"), ("#a-last", "2.0")]:
            await page.fill(k, v)
        await page.evaluate("window.scrollTo(0,0)")
        await shot(page, "step4-apd.png")
        await page.locator("#dwell-table").scroll_into_view_if_needed()
        await shot(page, "step4-apd-estimate.png")
        print("APD ktv", await page.text_content("#o-ktv-pred"))
        await page.click("#step-next")
        await page.wait_for_timeout(500)
        await page.evaluate("window.scrollTo(0,0)")
        await shot(page, "step5-prescription.png")
        await page.locator("#rx-card").scroll_into_view_if_needed()
        await shot(page, "step5-rx-card.png")
        await shot(page, "step5-full.png", full=True)
        await page.click('#cmp-card [data-about="targets"]')
        await page.wait_for_timeout(400)
        await shot(page, "about-targets.png")
        print("rx text:\n", await page.get_attribute("#rx-sheet", "data-text"))
        print("errors:", errs)
        await b.close()
asyncio.run(main())

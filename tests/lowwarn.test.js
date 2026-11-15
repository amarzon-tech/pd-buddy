/**
 * Low-transporter CrCl warning (0.4.8-draft).
 * Dr D, Nov 15 2026 (relayed by App Critic): "Add a warning now"; 7:55 AM ET: "Low-transporter warning wording is OK as written".
 * Run: node tests/lowwarn.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const RX = require("../js/prescription.js");
const { eq, isTrue, section, done } = require("./_h.js");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const app = read("js/app.js"), html = read("index.html"), css = read("css/pd.css");

section("Wording (approved by Dr D)");
{
  eq(RX.LOW_TRANSPORT_WARNING, "Low transport: the model probably underestimates creatinine clearance (CrCl). It credits the large PET drain volume to ultrafiltration rather than diffusion, then predicts each option without that ultrafiltration. Do not rely on the estimated CrCl; confirm with a measured 24-h collection.", "full text");
  eq(RX.LOW_TRANSPORT_SHORT, "Low transport: estimated CrCl is probably too low (model limit)", "compact text");
  isTrue(!/\d/.test(RX.LOW_TRANSPORT_WARNING.replace("24-h", "")), "no clinical numbers in the warning");
}

section("Trigger");
{
  eq(F.petCategoryCr(0.44).key, "low", "PET D/P Cr 0.44 → Low band");
  eq(F.petCategoryCr(0.40).key, "low", "0.40 (the block cutoff) → Low band");
  eq(F.petCategoryCr(0.50).key, "low-average", "0.50 → Low-average (no warning)");
  isTrue(/r\.lowTransport = !!\(r\.cat && r\.cat\.key === "low" && r\.crSource !== "fitted"\)/.test(app), "Low by type or PET band; not when fitted to a 24-h collection");
}

section("Where it shows");
{
  isTrue(/id="sum-low"/.test(html), "step 2 summary card slot");
  isTrue(/const on = !!\(r\.lowTransport && !r\.blocked && r\.ready\)/.test(app), "hidden when blocked or not ready");
  isTrue(/@media \(max-height: 760px\), \(max-width: 400px\) \{\s*#sum-low \.low-full \{ display: none; \}\s*#sum-low \.low-short \{ display: block; \}/.test(css), "compact + disclosure on small screens, full on large");
  isTrue(/<details class="low-short"><summary>/.test(app), "compact version opens the full text");
  isTrue(/R\.lowTransport \? RX\.LOW_TRANSPORT_WARNING/.test(app), "step 4 current prescription: full text");
  const on = RX.build({ modality: "capd", capd: { exchanges: 5, fillL: 2.5, longDwellH: 8 }, estimate: { ktvTotal: 1.83, crcl: 14.5 }, lowTransport: true });
  const i = on.lines.findIndex((l) => /^Weekly CrCl/.test(l));
  eq(on.lines[i + 1], "Warning: " + RX.LOW_TRANSPORT_WARNING, "Copy/Print: full text right after the CrCl line");
  const off = RX.build({ modality: "capd", capd: { exchanges: 5, fillL: 2.5, longDwellH: 8 }, estimate: { ktvTotal: 1.83, crcl: 40 } });
  isTrue(!/Low transport/.test(off.text), "no warning when not Low");
  isTrue(/if \(\/\^Warning: \/\.test\(t\)\)/.test(app), "sheet renders every Warning line in amber");
  isTrue(/@media print \{ #sum-low \{ display: none !important; \} \}/.test(css), "print uses the sheet line, not the screen note");
}

section("Review");
{
  const rv = read("CONTENT_REVIEW.md");
  isTrue(/^- \[ \] Sign-off: low-transporter warning wording .*wording approved by Dr D Nov 15 2026, full sign-off pending$/m.test(rv), "wording item marked approved");
  isTrue(/^- \[ \] Sign-off: placement, including the iPhone SE placement above the first option .*wording approved by Dr D Nov 15 2026, full sign-off pending$/m.test(rv), "SE placement item marked approved");
  isTrue(!/- \[x\]/i.test(rv), "nothing ticked");
}

done("lowwarn");

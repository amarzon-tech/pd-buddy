/**
 * 0.4.4 (Dr D, Nov 15 2026: "Fill can be as small as 1 l - agree with the other solutions"):
 * small fills, the no-fit message, the height block, the stale-note fix, the iPhone SE
 * layout and the CCPD UF wording.
 * Run: node tests/smallfill.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const W = require("../js/workflow.js");
const RX = require("../js/prescription.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const app = read("js/app.js");
const html = read("index.html");
const pd = read("css/pd.css");

const run = (sex, age, cm, kg, type) => {
  const t = F.typicalPet(type || "high-average");
  const V = F.watsonV(sex, age, cm, kg), bsa = F.bsaMosteller(cm, kg);
  const rows = F.candidateOptions({ mtacUrea: t.mtacUrea, mtacCr: t.mtacCr, V, bsa, ufFn: (o, s) => T.regimenUf(o, type || "high-average", s) });
  return { V, bsa, rows, capd: F.rankOptions(rows, { mod: "capd" }), ccpd: F.rankOptions(rows, { mod: "ccpd" }) };
};

section("1. Candidate fills from 1.0 L");
{
  eq(F.CANDIDATE_FILLS.join(","), "1,1.25,1.5,1.75,2,2.5,3", "fills 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0 L");
  eq(F.SMALL_FILLS.join(","), "1,1.25,1.5,1.75", "new steps below 2.0 L");
  const C = F.CANDIDATE_OPTIONS;
  F.SMALL_FILLS.forEach((f) => {
    isTrue(C.some((o) => o.mod === "capd" && o.fillL === f), "CAPD has " + f + " L");
    isTrue(C.some((o) => o.mod === "ccpd" && o.fillL === f), "CCPD has " + f + " L");
  });
  eq(new Set(C.map((o) => o.id)).size, C.length, "ids unique");
  isTrue(C.some((o) => o.id === "capd-4x1.25" && o.label === "CAPD 4 × 1.25 L"), "1.25 L shown as 1.25, not 1.3");
  isTrue(C.some((o) => o.id === "ccpd-5x1.5-10h-mid" && o.lastFillL === 1.5 && o.dayDwells === 2), "small CCPD midday uses 2 × night fill");
  ["capd-4x3.0", "ccpd-5x2.5-day", "ccpd-5x3.0-10h-day", "ccpd-4x2.0-mid2.5"].forEach((id) => isTrue(C.some((o) => o.id === id), "old id kept: " + id));
  eq(F.fmtL(1), "1.0", "fmtL 1.0"); eq(F.fmtL(1.25), "1.25", "fmtL 1.25"); eq(F.fmtL(2.5), "2.5", "fmtL 2.5");
}

section("1. Small adults now get options (all fills within the cap)");
{
  [["male", 70, 150, 40], ["male", 70, 145, 38], ["female", 70, 150, 40], ["female", 70, 145, 38]].forEach((a) => {
    const r = run(...a);
    const tag = a.join(" ");
    isTrue(r.capd.top.length === 3 && r.ccpd.top.length === 3, tag + ": 3 CAPD and 3 CCPD options");
    eq(r.capd.metric, "ktv", tag + ": ranked by Kt/V (not the CrCl fallback)");
    isTrue(r.capd.top.concat(r.ccpd.top).every((o) => F.withinFillCap(o.opt, r.bsa)), tag + ": every shown fill ≤ 1.5 × BSA + 0.05 L");
    isTrue(r.capd.top.concat(r.ccpd.top).every((o) => F.optionMaxFillL(o.opt) < 2), tag + ": options use the new fills below 2.0 L");
  });
  const a = run("male", 70, 150, 40);
  approx(a.bsa, 1.29, 0.005, "150 cm / 40 kg: BSA 1.29");
  eq(a.capd.top.map((o) => o.id).join(" "), "capd-4x1.75 capd-5x1.25 capd-5x1.5", "150/40 male CAPD order");
  eq(a.ccpd.top.map((o) => o.id).join(" "), "ccpd-5x1.75-dry ccpd-5x1.5-10h-dry ccpd-5x1.75-10h-dry", "150/40 male CCPD order");
  const b = run("male", 70, 145, 38);
  approx(b.bsa, 1.24, 0.005, "145 cm / 38 kg: BSA 1.24");
  eq(b.capd.top.map((o) => o.id).join(" "), "capd-4x1.5 capd-4x1.75 capd-5x1.25", "145/38 male CAPD order");
  eq(b.ccpd.top.map((o) => o.id).join(" "), "ccpd-5x1.5-dry ccpd-5x1.75-dry ccpd-4x1.75-10h-dry", "145/38 male CCPD order");
}

section("1. Example patient unchanged; no-fit case");
{
  const e = run("male", 55, F.ftInToCm(5, 10), 80);
  eq(e.capd.top.map((o) => o.id).join(" "), "capd-4x3.0 capd-5x2.5 capd-5x3.0", "5 ft 10 in / 80 kg CAPD unchanged from 0.4.3");
  eq(e.ccpd.top.map((o) => o.id).join(" "), "ccpd-5x3.0-10h-day ccpd-4x3.0-11h-day ccpd-5x2.5-11h-day", "CCPD unchanged from 0.4.3");
  const n = run("male", 30, 60, 20);
  isTrue(n.rows.every((o) => o.overCap), "60 cm / 20 kg (BSA 0.58, max 0.87 L): no candidate fits");
  eq(n.capd.top.length + n.ccpd.top.length, 0, "nothing ranked");
  isTrue(/No fill volume fits under this patient's fill cap of /.test(app), "plain no-fit message");
  isTrue(/r\.noFit = !!\(r\.options && r\.options\.length && r\.options\.every\(\(o\) => o\.overCap\)\)/.test(app), "noFit when every candidate is over the cap");
  isTrue(/else if \(r\.noFit\) basis = noFitText\(r\)/.test(app) && app.indexOf("else if (r.noFit) basis") < app.indexOf("Ordered by weekly CrCl"), "no-fit wins over the CrCl fallback text");
  isTrue(/r && r\.noFit \? esc\(noFitText\(r\)\)/.test(app), "cards show the no-fit message, not 'Enter body size'");
  isTrue(/R\.noFit \? noFitText\(R\)/.test(app), "step 4 shows the no-fit message");
}

section("1. Step 4 steps with small fills");
{
  const r = run("male", 70, 150, 40);
  const cur = r.rows.find((o) => o.id === "capd-4x1.25");
  const nb = W.neighbours(cur, r.rows);
  const lf = nb.find((s) => s.kind === "larger-fill");
  isTrue(lf && lf.row && lf.row.id === "capd-4x1.5" && /1\.5 L/.test(lf.label), "CAPD larger fill steps 1.25 → 1.5 L");
  const c2 = r.rows.find((o) => o.id === "ccpd-4x1.5-day");
  const n2 = W.neighbours(c2, r.rows);
  const lf2 = n2.find((s) => s.kind === "larger-fill");
  isTrue(lf2 && lf2.row && lf2.row.id === "ccpd-4x1.75-day", "CCPD 1.5 L + 1.5 L day → 1.75 L + 1.75 L day");
  const n3 = W.neighbours(r.rows.find((o) => o.id === "ccpd-4x1.75-dry"), r.rows);
  const dd = n3.find((s) => s.kind === "day-dwell");
  isTrue(dd && /Add a 1\.75 L day dwell/.test(dd.label) && dd.row.opt.lastFillL === 1.75, "small dry CCPD: add a day dwell of the night-fill volume");
  const md = n3.find((s) => s.kind === "midday");
  isTrue(md && md.row && md.row.opt.lastFillL === 1.75 && md.row.opt.dayDwells === 2, "small CCPD midday 2 × 1.75 L");
  const lf3 = n3.find((s) => s.kind === "larger-fill");
  isTrue(lf3 && lf3.capReached, "1.75 → 2.0 L at BSA 1.29 reported as fill cap reached");
  const big = run("male", 55, F.ftInToCm(5, 10), 80);
  const n4 = W.neighbours(big.rows.find((o) => o.id === "ccpd-4x2.0-day"), big.rows);
  isTrue(n4.find((s) => s.kind === "larger-fill").row.id === "ccpd-4x2.5-day", "2.0 → 2.5 L unchanged for ≥ 2.0 L fills");
  isTrue(/Add a 2\.0 L day dwell/.test(W.neighbours(big.rows.find((o) => o.id === "ccpd-4x2.0-dry"), big.rows).find((s) => s.kind === "day-dwell").label), "2.0 L day dwell unchanged for ≥ 2.0 L fills");
}

section("2. Height hard block (cm and ft + in)");
{
  const has = (o) => F.checkPatient(Object.assign({ age: 50, weight: 70 }, o)).length > 0;
  eq(F.HEIGHT_LIMITS_CM.min, 54.6, "min 54.6 cm (Guinness: shortest adult ever)");
  eq(F.HEIGHT_LIMITS_CM.max, 272, "max 272 cm (Guinness: tallest man ever)");
  isTrue(has({ hunit: "cm", cm: 1780 }), "1,780 cm blocked");
  isTrue(/outside the recorded range of adult height/.test(F.checkPatient({ hunit: "cm", cm: 1780 })[0].msg), "1,780 cm message");
  isTrue(has({ hunit: "cm", cm: 273 }), "273 cm blocked");
  isTrue(!has({ hunit: "cm", cm: 272 }), "272 cm allowed");
  isTrue(has({ hunit: "cm", cm: 50 }), "50 cm blocked");
  isTrue(!has({ hunit: "cm", cm: 150 }) && !has({ hunit: "cm", cm: 145 }), "150 and 145 cm allowed");
  isTrue(has({ hunit: "ftin", ft: 1, inch: 0 }), "1 ft 0 in blocked");
  isTrue(has({ hunit: "ftin", ft: 8, inch: 11.9 }), "8 ft 11.9 in (274 cm) blocked");
  isTrue(!has({ hunit: "ftin", ft: 8, inch: 0 }), "8 ft 0 in allowed");
  isTrue(!has({ hunit: "ftin", ft: 5, inch: 11.9 }), "5 ft 11.9 in allowed");
  isTrue(has({ hunit: "ftin", ft: 0, inch: 0 }), "0 ft 0 in blocked");
  isTrue(has({ hunit: "ftin", ft: 178 }), "178 in the ft box still blocked");
}

section("3. Stale amber note hidden when blocked");
{
  isTrue(/if \(note && \(!r \|\| r\.blocked \|\| !r\.ready \|\| !rank \|\| !rank\.top\.length\)\) \{ note\.classList\.add\("hidden"\); note\.textContent = ""; \}/.test(app), "note hidden and emptied when blocked or empty");
  isTrue(/if \(!r \|\| r\.blocked \|\| !rank \|\| !rank\.top\.length\)/.test(app), "blocked inputs never render options");
}

section("4. iPhone SE layout");
{
  isTrue(/id="basis-card"/.test(html) && html.indexOf('id="rank-basis"') > html.indexOf('id="top-ccpd-card"'), "basis text moved below the option cards");
  isTrue(html.indexOf('id="sum-card"') < html.indexOf('id="top-capd-card"'), "summary still first");
  isTrue(/id="ispd-line"/.test(html.slice(html.indexOf('id="sum-card"'), html.indexOf('id="top-capd-card"'))), "ISPD line still above the options");
  isTrue(/@media \(max-height: 760px\)/.test(pd) && /\.on-results \.top-row \{ display: none; \}/.test(pd), "short screens: brand row hidden on steps 2–4");
}

section("5. CCPD UF wording");
{
  const l = (s) => RX.build(s).lines.find((x) => /^Predicted daily UF/.test(x));
  eq(l({ modality: "apd", apd: { cycles: 5, fillL: 2, therapyH: 9, lastFillL: 2 }, uf: { dailyUfMl: 300, longSource: "model" } }), "Predicted daily UF (experimental three-pore model): 0.30 L, assuming 1.5% dextrose cycles and a 2.5% dextrose day dwell", "CCPD day dwell");
  eq(l({ modality: "apd", apd: { cycles: 5, fillL: 2, therapyH: 9, lastFillL: 2, lastSolution: "ico" }, uf: { dailyUfMl: 900, longSource: "published" } }), "Predicted daily UF (experimental three-pore model): 0.90 L, assuming 1.5% dextrose cycles; icodextrin day dwell = published value for 2 L, 9 h/15 h, not adjusted", "CCPD icodextrin day dwell");
  eq(l({ modality: "capd", capd: { exchanges: 4, fillL: 2 }, uf: { dailyUfMl: 300, longSource: "model" } }), "Predicted daily UF (experimental three-pore model): 0.30 L, assuming 1.5% dextrose exchanges and a 2.5% dextrose long dwell", "CAPD unchanged");
  const t = RX.build({ modality: "apd", apd: { cycles: 4, fillL: 1.25, therapyH: 9, lastFillL: 1.25 } }).text;
  isTrue(/Night cycles: 4 × 1\.25 L/.test(t) && /Last fill: 1\.25 L/.test(t), "1.25 L printed as 1.25 L");
}

section("Release and review");
{
  const rv = read("CONTENT_REVIEW.md");
  ["small fills 1.0–1.75 L", "no-fit message", "height hard block", "stale amber note", "iPhone SE step 2", "CCPD UF wording", "release 0.4.4-draft"].forEach((k) => {
    const line = rv.split("\n").find((x) => x.startsWith("- [ ] Sign-off: " + k));
    isTrue(!!line && /approved by Dr D Nov 15 2026, full sign-off pending/.test(line), "unticked review item: " + k);
  });
}

done("smallfill");

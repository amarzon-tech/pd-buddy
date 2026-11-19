/**
 * 0.4.3 App Critic review fixes (M1–M7, S1–S8, N1–N3).
 * Run: node tests/critic.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const LP = require("../js/labparse.js");
const RX = require("../js/prescription.js");
const W = require("../js/workflow.js");
const G = require("../js/rxgrid.js");
const { eq, isTrue, section, done } = require("./_h.js");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const html = read("index.html");
const app = read("js/app.js");
const review = read("CONTENT_REVIEW.md");
const css = read("css/standalone.css") + read("css/pd.css") + read("css/styles.css");
const DISC = "Not a medical device. Not cleared or approved by FDA. Estimates do not replace measured adequacy or clinical judgment.";
const TM = "PD Adequest and Extraneal are trademarks of Baxter International Inc.; PD Buddy is not affiliated with or endorsed by Baxter.";

section("M1 neutral framing");
{
  isTrue(/CAPD options to consider/.test(html) && /CCPD options to consider/.test(html), "cards are options to consider");
  isTrue(!/Top 3/.test(html), "no 'Top 3' in the page");
  isTrue(/Reference Kt\/V \(optional\)/.test(html) && !/Ranking target/.test(html), "Reference Kt/V card");
  isTrue(/" ≥ your reference value \("/.test(app) && /" below your reference value \("/.test(app), "badge wording");
  isTrue(!/Meets target|Below target|Meets Kt\/V target|Below Kt\/V target|"Met"|"Not met"/.test(app), "no pass/fail wording");
  isTrue(/There is no specific clearance target that guarantees sufficient dialysis for an individual\./.test(html.match(/id="ispd-line"[^\n]*/)[0]), "ISPD 2020 quote on the summary card");
  isTrue(/No option's estimate reaches your reference value/.test(app), "neutral 'none reach' note");
}

section("M2 input bounds");
{
  const ok = { age: 55, hunit: "ftin", ft: 5, inch: 10, weight: 80 };
  eq(F.checkPatient(ok).length, 0, "valid adult passes");
  const has = (o, field) => F.checkPatient(Object.assign({}, ok, o)).some((e) => e.field === field);
  isTrue(has({ age: 17 }, "age"), "age < 18 blocked (adult-only)");
  isTrue(!has({ age: 18 }, "age"), "age 18 allowed");
  isTrue(has({ ft: 178 }, "ft"), "178 in the ft box blocked");
  isTrue(has({ ft: 9 }, "ft"), "ft > 8 blocked");
  isTrue(!has({ ft: 8 }, "ft"), "ft 8 allowed");
  isTrue(has({ inch: 12 }, "inch"), "inches ≥ 12 blocked");
  isTrue(!has({ inch: 11.5 }, "inch"), "inches 11.5 allowed");
  isTrue(has({ inch: -1 }, "inch"), "negative inches blocked");
  isTrue(has({ weight: 0 }, "weight"), "weight 0 blocked");
  isTrue(has({ weight: -5 }, "weight"), "negative weight blocked");
  isTrue(has({ hunit: "cm", cm: 0 }, "cm"), "height 0 cm blocked");
  eq(F.checkPatient({ age: 55, hunit: "cm", cm: 178, weight: 80 }).length, 0, "cm height accepted");
  isTrue(/id="p-cm"/.test(html) && /data-hunit="cm"/.test(html), "cm height option in the page");
  isTrue(/r\.ready = !r\.blocked &&/.test(app), "options hidden while inputs are blocked");
}

section("M3 D/P checks");
{
  eq(F.checkDp(0.7, "D/P creatinine"), null, "0.70 accepted");
  eq(F.checkDp(0.99, "D/P creatinine"), null, "0.99 accepted");
  const p = F.checkDp(70, "D/P creatinine");
  isTrue(p && p.block, "70 blocked");
  eq(p.suggest, 0.7, "70 → suggest 0.70");
  isTrue(/Did you mean 0\.70\?/.test(p.msg), "message reads 'Did you mean 0.70?'");
  isTrue(F.checkDp(1.4, "D/P creatinine").block, "1.4 blocked");
  isTrue(F.checkDp(1.1, "D/P urea").block, "1.1 blocked");
  isTrue(F.checkDp(1.0, "D/P urea").block, "1.0 blocked (Garred needs D/P < 1)");
  isTrue(F.checkDp(0, "D/P urea").block, "0 blocked");
  eq(F.checkDp(null, "D/P urea"), null, "empty is fine");
  isTrue(/Fix the inputs flagged on step 1 to see options\./.test(app), "empty state names the real problem");
}

section("M4 OCR parser (report strings)");
{
  const v = (t, k) => (LP.parse(t).values[k] || {}).value;
  eq(v("Weekly Kt/V: renal 0.52, peritoneal 1.61, total 2.13", "measuredKtv"), 2.13, "Kt/V takes the total, not 0.52");
  eq(v("Total Kt/V 2.05 (renal 0.40)", "measuredKtv"), 2.05, "Kt/V total first");
  eq(v("Serum creatinine (ref 0.7-1.3) 9.4 mg/dL", "serumCr"), 9.4, "reference range skipped: 9.4 not 0.7");
  eq(v("Serum creatinine 9.4 mg/dL (0.7–1.3)", "serumCr"), 9.4, "trailing range skipped");
  eq(v("24h dialysate volume 9.6 L", "dialVolL"), 9.6, "24h skipped: 9.6 L not 24");
  eq(v("24-h urine volume 850 mL", "urineMl"), 850, "24-h skipped for urine");
  eq(v("PET drain volume 2,350 mL", "petDrain"), 2350, "2,350 read as 2350");
  eq(LP.cleanNumber("0,72"), "0.72", "comma decimal still read");
  eq(LP.cleanNumber("1,5"), "1.5", "one-digit comma decimal");
  const u = LP.parse("Dialysate creatinine 5.1\nSerum creatinine 725");
  isTrue(u.values.dialCr.needsUnit && u.values.serumCr.needsUnit, "no unit printed → needsUnit on both");
  isTrue(u.warnings.some((w) => /no unit printed/.test(w)), "missing-unit warning");
  eq(LP.unitConflicts(u.values, { dialCr: "mg/dl", serumCr: "µmol/l" }).length, 1, "chosen units that differ → conflict");
  eq(LP.unitConflicts(u.values, { dialCr: "µmol/l", serumCr: "µmol/l" }).length, 0, "same chosen units → no conflict");
  const c = LP.parse("Dialysate urea 40 mg/dL\nSerum urea 12 mmol/L");
  eq(c.conflicts.length, 1, "printed units that differ → conflict returned");
  isTrue(/Confirm stays blocked|confirmBlock/.test(app) && /b\.disabled = !!block/.test(app), "app blocks Confirm on unit problems");
  isTrue(/From report: “/.test(app), "source line shown under each unconfirmed value");
  eq(u.values.dialCr.line, "Dialysate creatinine 5.1", "source line is the original report line");
}

section("M5 print and copy");
{
  const r = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, longDwellH: 8, longSolution: "same" }, estimate: { ktvTotal: 1.8 } });
  eq(r.lines[0], "PD regimen summary (model estimate)", "title");
  eq(r.lines[1], "DRAFT – model estimate, not an order – verify before use", "DRAFT line first");
  isTrue(r.text.indexOf("DRAFT – model estimate") < r.text.indexOf("Modality"), "DRAFT before the regimen");
  isTrue(/#step-2 #rx-card \{ display: block !important; \}/.test(css), "print targets the step 2 card");
  isTrue(/\.draft-banner \{ display: block !important;/.test(read("css/standalone.css")), "draft banner kept in print");
  isTrue(!/#step-4 > :not\(#rx-card\)/.test(css), "old step 4 print rule removed");
}

section("M6 not a medical device");
{
  ["index.html", "privacy.html", "support.html"].forEach((f) => isTrue(read(f).includes(DISC), f + ": disclaimer"));
  isTrue(/rx-disc[^>]*>Not a medical device\. Not cleared or approved by FDA/.test(html), "summary card disclaimer");
  isTrue(RX.build({ modality: "capd", capd: {} }).text.includes(DISC), "copied text disclaimer");
}

section("M7 naming and trademarks");
{
  const ui = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const strip = (s) => s.split(TM).join("").replace("(e.g., Extraneal®)", "");
  ["index.html", "js/app.js", "js/workflow.js", "js/rxgrid.js", "js/prescription.js"].forEach((f) => {
    const t = strip(ui(read(f)));
    isTrue(!/Extraneal/.test(t), f + ": no Extraneal outside the trademark notice / About");
    isTrue(!/Adequest/.test(t), f + ": no Adequest outside the trademark notice");
  });
  eq((app.match(/\(e\.g\., Extraneal®\)/g) || []).length, 1, "'(e.g., Extraneal®)' once in About");
  isTrue(html.includes(TM), "trademark notice in the footer");
  isTrue(/Published prescription grid \(Akonur et al\. 2016\)/.test(html), "grid heading");
  isTrue(!/Baxter|Quick Reference/.test(read("js/rxgrid.js").match(/const GRID_SOURCE = [^;]*;/)[0]), "grid cited from PDI figures only");
  isTrue(Object.values(G.GRID_FLAGS).every((t) => !/guide/i.test(t)), "flags no longer name the guide");
  eq(Object.keys(G.GRID_FLAGS).length, 9, "still 9 unverified cells");
  isTrue(/ico: "icodextrin 7\.5%"/.test(read("js/rxgrid.js")), "grid icodextrin label");
  eq(F.TYPICAL_LABEL, "typical-patient estimate from published parameters (Akonur et al. 2016), not measured", "type-only label");
}

section("S1–S8");
{
  eq(F.TYPICAL_BSA_RANGE.join("–"), "1.7–2", "typical BSA range 1.7–2.0 m² (Akonur 2016 Table 1)");
  isTrue(/Typical values come from patients with BSA 1\.7–2\.0 m²/.test(app) && /estimate less reliable/.test(app), "S1 BSA warning");
  isTrue(/published value for 2 L, 9 h\/15 h; not adjusted to this regimen/.test(app), "S2 card wording");
  isTrue(/Suggestions for UF are ordered by the experimental UF model\./.test(app), "S3 note");
  isTrue(!/never changes Kt\/V or the ranking/.test(app + html), "S3 'ranking' claim removed");
  isTrue(/Ranking assumes no residual kidney function: <button type="button" class="link-btn" id="go-rkf">add urine and serum urea to include it\.<\/button>/.test(html) && /id="go-rkf"/.test(html), "S5 note and link");
  isTrue(/<optgroup label=/.test(app) && /closest match/.test(html), "S6 groups and closest match");
  isTrue(/aria-label="Height, inches"/.test(html) && !/aria-label="&nbsp;"/.test(html), "S7 inch label");
  isTrue(/<main id="main">/.test(html) && /<\/main>/.test(html), "S7 main landmark");
  isTrue(/--ink-tertiary: #4a5b70;/.test(read("css/styles.css")), "S7 tertiary grey darkened");
  isTrue(/\[data-theme="dark"\] \.step-btn\.primary[^{]*\{ color: #0b1a33; \}/.test(read("css/pd.css")), "S7 dark-mode button text");
  isTrue(/min-height: 44px; \}/.test(read("css/pd.css")), "S7 44 px controls");
  eq(RX.modelAssumed({ modality: "capd", capd: { longSolution: "same" } }), "1.5% dextrose exchanges, 2.5% dextrose long dwell", "S8 assumption line");
  isTrue(W.troubleshoot && /"Icodextrin 7\.5% for the overnight long dwell"/.test(read("js/workflow.js")), "step 4 labels use icodextrin 7.5%");
}

section("N1–N3");
{
  isTrue(!/Akonur 2016\)/.test(html) || /Akonur 2016, PDI/.test(html), "N1 page cites PDI pages");
  isTrue(!/class="qn"/.test(html), "N2 card numbers removed");
  isTrue(/Nothing is saved; reloading clears the form\./.test(html), "N2 nothing-saved note");
  isTrue(/id="try-example"/.test(html) && /Try an example patient/.test(html), "N2 example patient");
  isTrue(/short-dwell net UF counted as 0 underestimates clearance; CCPD fill\/drain time counted as 0 overestimates it/.test(app), "N3 opposite-direction note");
  isTrue(/1\.74 \/ 1\.61 \/ 1\.44/.test(app), "N3 Akonur 2013 check numbers");
  isTrue(/assumed 0 \(no 24-h urine with urea entered\)/.test(app), "N3 renal Kt/V assumed 0");
}

section("CONTENT_REVIEW");
{
  const dec = /Decided by Dr D, Nov 14 2026:\*\* keep the 0\.05 L fill tolerance, 3\.0 L fills \(within the 1\.5 L\/m² BSA cap\) and 9–11 h cycler time despite the AJKD Core Curriculum 2023 limits/;
  ["0.05 L tolerance", "Core Curriculum 2023", "10- and 11-h cycler time"].forEach((k) => {
    const line = review.split("\n").find((l) => l.startsWith("- [x] Sign-off: " + k));
    isTrue(!!line && dec.test(line), "decision recorded and signed off: " + k);
  });
  isTrue((review.match(/^- \[ \] Sign-off/gm) || []).length === 2, "two iOS listing items still open");
  ["M1 neutral wording", "M2 hard blocks", "M3 D/P blocks", "M4 OCR parser", "M5 summary title", "M6 not-a-medical-device", "M7 naming", "S1 BSA", "S2 icodextrin", "S3 step 4", "S4 CCPD CrCl", "S5 residual", "S6 current prescription", "S7 accessibility", "S8 model solution", "N1 Akonur", "N2 first-run", "N3 model documentation", "release 0.4.3-draft"].forEach((k) =>
    isTrue(review.includes("- [x] Sign-off: " + k), "signed-off 0.4.3 item: " + k));
}

done("critic");

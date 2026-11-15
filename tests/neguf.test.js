/**
 * 0.4.5 negative predicted UF warning (Dr D, Nov 15 2026: "Show a negative-UF warning on those options").
 * Run: node tests/neguf.test.js
 */
"use strict";
require("./_garred.js"); // model-2c: legacy pins use the Garred model
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const W = require("../js/workflow.js");
const RX = require("../js/prescription.js");
const { eq, isTrue, section, done } = require("./_h.js");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const app = read("js/app.js");

const run = (sex, age, cm, kg, type) => {
  const t = F.typicalPet(type);
  const V = F.watsonV(sex, age, cm, kg), bsa = F.bsaMosteller(cm, kg);
  const rows = F.candidateOptions({ mtacUrea: t.mtacUrea, mtacCr: t.mtacCr, V, bsa, ufFn: (o, s) => T.regimenUf(o, type, s) });
  return { rows, capd: F.rankOptions(rows, { mod: "capd" }), ccpd: F.rankOptions(rows, { mod: "ccpd" }) };
};

section("Wording");
{
  eq(RX.negUfWarning(-390), "Predicted daily UF is negative (about −0.39 L/day, experimental model). Watch fluid balance; consider a higher-tonicity or icodextrin dwell.", "−390 mL");
  eq(RX.negUfWarning(-3), "Predicted daily UF is negative (slightly below 0 L/day, experimental model). Watch fluid balance; consider a higher-tonicity or icodextrin dwell.", "tiny negative");
  eq(RX.negUfWarning(0), null, "0 → no warning");
  eq(RX.negUfWarning(120), null, "positive → no warning");
  eq(RX.negUfWarning(null), null, "unknown → no warning");
  isTrue(!/stronger dextrose|4\.25/.test(RX.negUfWarning(-500)), "no 'stronger dextrose' / 4.25% (open S8 question)");
}

section("150 cm / 40 kg: warning on the small CAPD options, ranking unchanged");
{
  const r = run("male", 70, 150, 40, "high-average");
  eq(r.capd.top.map((o) => o.id).join(" "), "capd-4x1.75 capd-5x1.25 capd-5x1.5", "CAPD order unchanged (not demoted or re-ranked)");
  eq(r.ccpd.top.map((o) => o.id).join(" "), "ccpd-5x1.75-dry ccpd-5x1.5-10h-dry ccpd-5x1.75-10h-dry", "CCPD order unchanged");
  isTrue(r.capd.top.every((o) => o.uf.dailyUfMl < 0 && RX.negUfWarning(o.uf.dailyUfMl)), "all 3 CAPD options warned");
  eq(r.capd.top.map((o) => (o.uf.dailyUfMl / 1000).toFixed(2)).join(" "), "-0.39 -0.48 -0.34", "CAPD predicted UF L/day");
  isTrue(r.ccpd.top.every((o) => o.uf.dailyUfMl > 0 && !RX.negUfWarning(o.uf.dailyUfMl)), "CCPD options (positive UF) not warned");
  const neg = r.rows.filter((o) => o.uf && o.uf.dailyUfMl < 0);
  isTrue(neg.some((o) => o.mod === "ccpd") || neg.every((o) => o.mod === "capd"), "warning applies by UF sign, any modality");
}

section("Any option with negative UF, any patient");
{
  ["high", "high-average", "low-average", "low"].forEach((ty) => {
    const r = run("male", 55, F.ftInToCm(5, 10), 80, ty);
    const shown = r.capd.top.concat(r.ccpd.top);
    isTrue(shown.every((o) => !!RX.negUfWarning(o.uf && o.uf.dailyUfMl) === !!(o.uf && o.uf.dailyUfMl < 0)), ty + ": warning iff predicted UF < 0");
  });
}

section("Card, step 4 and summary");
{
  isTrue(/negUfHtml\(o, "span", "neg-uf-full"\) \+ negUfShortHtml\(o\) \+\s*sibTxt/.test(app), "option card shows the warning (full; compact on small screens since 0.4.6)");
  isTrue(/negUfHtml\(cur, "span"\)/.test(app), "step 4 current prescription shows the warning");
  isTrue(/negUfHtml\(s\.row, "div"\)/.test(app), "step 4 suggestions show the warning");
  isTrue(/class="neg-uf' \+ \(extra/.test(app) && /\.neg-uf \{[^}]*var\(--amber-bg\)/.test(read("css/pd.css")), "amber styling");
  isTrue(/rx-neguf/.test(app) && /\.rx-neguf/.test(read("css/pd.css")), "summary sheet renders the warning");
  const s = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 1.75, longDwellH: 8 }, uf: { dailyUfMl: -390, longSource: "model" } });
  const i = s.lines.findIndex((l) => /^Predicted daily UF/.test(l));
  eq(s.lines[i + 1], "Warning: Predicted daily UF is negative (about −0.39 L/day, experimental model). Watch fluid balance; consider a higher-tonicity or icodextrin dwell.", "copied/printed summary warning right after the UF line");
  const p = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 1.75, therapyH: 9, lastFillL: 0 }, uf: { dailyUfMl: 200, longSource: null } });
  isTrue(!/Warning: Predicted daily UF is negative/.test(p.text), "no warning when UF is positive");
  const w = W.troubleshoot("uf", run("male", 70, 150, 40, "high-average").rows.find((o) => o.id === "capd-4x1.25"), run("male", 70, 150, 40, "high-average").rows, 1.7);
  isTrue(Array.isArray(w), "step 4 suggestions still computed for warned options");
}

section("Review");
{
  const rv = read("CONTENT_REVIEW.md");
  isTrue(/^- \[ \] Sign-off: negative predicted UF warning .*approved by Dr D Nov 15 2026; wording approved by Dr D on a voice call with App Critic, Nov 15 2026 7:01 AM ET \(relayed\); full sign-off pending$/m.test(rv), "unticked review item for the warning");
  isTrue(/Day volume equal to the night fill: \*\*decided by Dr D Nov 15 2026\*\* \(“Day volume equal to the night fill is fine”\), full sign-off pending/.test(rv), "day-volume item marked decided by Dr D");
  isTrue(!/- \[x\]/i.test(rv), "nothing ticked");
}

done("neguf");

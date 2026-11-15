/**
 * 0.4.2 fill-volume cap: every fill ≤ 1.5 L/m² BSA (Mosteller) + 0.05 L tolerance.
 * Run: node tests/fillcap.test.js
 */
"use strict";
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const W = require("../js/workflow.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");

const C = F.CANDIDATE_OPTIONS;
const byId = (id) => C.find((o) => o.id === id);
const typ = F.typicalPet("high-average");
const ufFn = (o, s) => T.regimenUf(o, "high-average", s);
const pt = (ft, inch, kg) => {
  const ht = F.ftInToCm(ft, inch);
  return { V: F.watsonV("male", 55, ht, kg), bsa: F.bsaMosteller(ht, kg) };
};
const rowsFor = (p, pet) => {
  const mCr = pet ? F.garredMtac(0.7, 2, typ.drainMl / 1000, 240) : typ.mtacCr;
  const mU = pet ? F.garredMtac(0.75, 2, typ.drainMl / 1000, 240) : typ.mtacUrea;
  return F.candidateOptions({ mtacUrea: mU, mtacCr: mCr, V: p.V, bsa: p.bsa, ufFn });
};

section("Cap definition");
{
  eq(F.FILL_CAP.lPerM2, 1.5, "1.5 L/m² BSA (Teitelbaum CJASN 2018: 1.25–1.5 L/m²)");
  eq(F.FILL_CAP.toleranceL, 0.05, "0.05 L rounding tolerance");
  approx(F.maxFillL(2), 3.0, 1e-12, "BSA 2.00 → 3.00 L");
  eq(F.maxFillL(null), null, "no BSA → no cap value");
  isTrue(F.withinFillCap(byId("capd-5x3.0"), null), "no BSA → nothing excluded");
  eq(F.optionMaxFillL(byId("ccpd-4x2.0-mid2.5")), 2.5, "midday 2.5 L day dwells count (night 2.0 L)");
  eq(F.optionMaxFillL(byId("ccpd-4x2.0-day")), 2.0, "2.0 L day dwell");
  isTrue(F.withinFillCap({ fillL: 3.0 }, 1.97), "3.0 L at BSA 1.97 (max 2.955 + 0.05 = 3.005) allowed");
  isTrue(!F.withinFillCap({ fillL: 3.0 }, 1.96), "3.0 L at BSA 1.96 (max 2.94 + 0.05 = 2.99) excluded");
  isTrue(!F.withinFillCap({ fillL: 2.0, lastFillL: 2.5 }, 1.6), "day dwell above cap excludes the option (BSA 1.6 → 2.45 L)");
}

section("Example patient (5 ft 10 in, 80 kg, BSA 1.99 → 2.98 L)");
{
  const p = pt(5, 10, 80);
  approx(p.bsa, 1.988, 0.001, "BSA 1.988 m²");
  approx(F.maxFillL(p.bsa), 2.982, 0.001, "max fill 2.98 L");
  const rows = rowsFor(p, false);
  isTrue(!rows.some((r) => r.overCap), "with the 0.05 L tolerance 3.0 L fills are allowed");
  const strict = rows.filter((r) => F.optionMaxFillL(r.opt) <= F.maxFillL(p.bsa));
  isTrue(strict.every((r) => r.opt.fillL <= 2.5 && (r.opt.lastFillL || 0) <= 2.5), "without tolerance 3.0 L would be excluded");
  const c = F.rankOptions(rows, { mod: "capd" });
  eq(c.top.map((x) => x.baseId).join(","), "capd-4x3.0,capd-5x2.5,capd-5x3.0", "type-only CAPD Top 3 unchanged");
}

section("Small patient (5 ft 2 in, 55 kg): 2.5 and 3.0 L excluded");
{
  const p = pt(5, 2, 55);
  const m = F.maxFillL(p.bsa);
  isTrue(m + 0.05 < 2.5, "max fill + tolerance below 2.5 L (" + m.toFixed(2) + " L)");
  const rows = rowsFor(p, false);
  isTrue(rows.filter((r) => !r.overCap).every((r) => F.optionMaxFillL(r.opt) <= 2.0), "only 2.0 L options remain");
  ["capd", "ccpd"].forEach((mod) => {
    const r = F.rankOptions(rows, { mod });
    isTrue(r.all.length > 0 && r.all.every((x) => !x.overCap && F.optionMaxFillL(x.opt) <= m + 0.05), mod + ": no ranked option above the cap");
  });
  isTrue(rows.filter((r) => r.opt.midday && r.opt.lastFillL === 2.5).every((r) => r.overCap), "2 × 2.5 L midday options excluded");
}

section("Large patient (6 ft 2 in, 100 kg, BSA 2.28 → 3.43 L)");
{
  const p = pt(6, 2, 100);
  approx(p.bsa, 2.285, 0.001, "BSA 2.285 m²");
  const rows = rowsFor(p, false);
  isTrue(!rows.some((r) => r.overCap), "all candidate fills (≤ 3.0 L) within the cap");
  const c = F.rankOptions(rows, { mod: "capd" }), d = F.rankOptions(rows, { mod: "ccpd" });
  eq(c.meetCount, 1, "type-only CAPD: only 5 × 3.0 L meets 1.7");
  approx(c.top[0].ktv, 1.79, 0.005, "CAPD 5 × 3.0 L Kt/V 1.79");
  isTrue(d.anyMeet && d.top.every((x) => x.opt.midday), "type-only CCPD: Top 3 meet, all with a midday exchange");
  const pr = rowsFor(p, true);
  isTrue(!F.rankOptions(pr, { mod: "capd" }).anyMeet && !F.rankOptions(pr, { mod: "ccpd" }).anyMeet, "PET numbers: neither modality reaches 1.7");
}

section("Troubleshoot respects the cap");
{
  const small = pt(5, 2, 55);
  const rows = rowsFor(small, false);
  const cur = rows.find((r) => r.id === "capd-4x2.0");
  const list = W.troubleshoot("clearance", cur, rows, 1.7);
  const lf = list.find((s) => s.kind === "larger-fill");
  isTrue(lf && lf.capReached && lf.row === null, "larger fill → cap reached, no row");
  eq(lf.cappedFillL, 2.5, "the capped step names 2.5 L");
  isTrue(list.filter((s) => !s.capReached).every((s) => !s.row.overCap), "no suggestion above the cap");
  isTrue(list[list.length - 1].capReached, "cap-reached items listed after the real suggestions");
  const ccur = rows.find((r) => r.id === "ccpd-4x2.0-day");
  const cl = W.troubleshoot("clearance", ccur, rows, 1.7);
  isTrue(cl.some((s) => s.kind === "larger-fill" && s.capReached), "CCPD larger fill → cap reached");
  const mid = rows.find((r) => r.id === "ccpd-4x2.0-mid2.0");
  const ml = W.troubleshoot("clearance", mid, rows, 1.7);
  isTrue(ml.some((s) => s.kind === "midday-larger" && s.capReached), "larger midday volumes → cap reached");
  const big = rowsFor(pt(6, 2, 100), false);
  const bl = W.troubleshoot("clearance", big.find((r) => r.id === "capd-4x2.0"), big, 1.7);
  isTrue(bl.some((s) => s.kind === "larger-fill" && !s.capReached && s.row.id === "capd-4x2.5"), "large patient: larger fill still suggested");
}

done("fillcap");

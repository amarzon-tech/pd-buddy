/**
 * Below-model-range block for very low PET D/P (App Critic N-M2; Dr D Nov 15 2026: "Block very low
 * D/P with a 'below model range' message"). Cutoffs (F.DP_MODEL_MIN) decided by Dr D Nov 15 2026: "D/P creatinine cutoff 0.40", "D/P urea cutoff 0.70".
 * Run: node tests/lowdp.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");
const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
const MIN = F.DP_MODEL_MIN;

section("Root cause: Garred zero-diffusion floor 1 − V0/Vt");
{
  const low = F.typicalPet("low");
  approx(low.drainMl, 2988.5, 1e-9, "typical Low drain = Twardowski band midpoint");
  approx(1 - 2 / 2.9885, 0.3308, 1e-3, "floor at the typical Low drain");
  isTrue(F.garredMtac(0.34, 2, 2.989, 240) < 0.2, "D/P Cr 0.34 at 2,989 mL → MTAC < 0.2 mL/min (collapse)");
  let threw = false; try { F.garredMtac(0.33, 2, 2.989, 240); } catch (e) { threw = true; }
  isTrue(threw, "D/P under the floor → no positive MTAC");
  const d = F.capdDwells({ exchanges: 5, fillL: 2.5, longDwellH: 8, ufPerExchangeMl: 0, longDwellUfMl: 0 });
  isTrue(d.every((x) => x.ufMl === 0), "regimen dwells are predicted with net UF 0 (no convective credit given back)");
  const p = F.predictDaily(d, 15.92, F.garredMtac(0.34, 2, 2.989, 240));
  isTrue(p.rows.every((r) => r.dpCr < 0.05), "so predicted D/P Cr per dwell is < 0.05");
  approx(1 - 2000 / 3326, 0.399, 1e-3, "floor at the top of the Twardowski Low drain band (3,326 mL)");
}

section("One config constant, decided values");
{
  isTrue(Object.isFrozen(MIN), "DP_MODEL_MIN frozen");
  eq(MIN.cr, 0.40, "creatinine cutoff 0.40 (decided by Dr D)");
  eq(MIN.urea, 0.70, "urea cutoff 0.70 (decided by Dr D)");
  isTrue(MIN.cr >= +(1 - 2000 / 3326).toFixed(2), "cr cutoff at or above the Garred floor for every published Low drain");
}

section("checkDp");
{
  const a = F.checkDp(0.34, "D/P creatinine");
  isTrue(a && a.block && a.belowModel, "D/P Cr 0.34 blocked");
  isTrue(a.msg.includes("below model range") && a.msg.includes("0.40 or more"), "message names 'below model range' and the cutoff");
  eq(F.checkDp(0.39, "D/P creatinine").belowModel, true, "0.39 blocked");
  eq(F.checkDp(0.40, "D/P creatinine"), null, "0.40 accepted (at cutoff)");
  eq(F.checkDp(0.44, "D/P creatinine"), null, "TARGET Low mean 0.44 accepted");
  eq(F.checkDp(0.40, "D/P urea").belowModel, true, "D/P urea 0.40 blocked");
  eq(F.checkDp(0.69, "D/P urea").belowModel, true, "D/P urea 0.69 blocked");
  eq(F.checkDp(0.70, "D/P urea"), null, "D/P urea 0.70 accepted (at cutoff)");
  eq(F.checkDp(0.91, "D/P urea"), null, "adult mean 0.91 accepted");
  isTrue(F.checkDp(1.2, "D/P urea").block && !F.checkDp(1.2, "D/P urea").belowModel, "high-side blocks unchanged");
  isTrue(F.checkDp(0, "D/P urea").block, "0 still blocked");
}

section("Results at the cutoff are regimen-dependent (no collapse), 170 cm / 70 kg");
{
  const V = F.watsonV("male", 55, 170, 70), bsa = F.bsaMosteller(170, 70);
  const rows = (mu, mc) => F.candidateOptions({ mtacUrea: mu, mtacCr: mc, V, bsa, ufFn: (o, s) => T.regimenUf(o, "low", s) }).filter((r) => !r.overCap && r.longSolution !== "icodextrin");
  const mc = F.garredMtac(MIN.cr, 2, 2.9885, 240), mu = F.garredMtac(MIN.urea, 2, 2.9885, 240);
  const r = rows(mu, mc);
  const k = r.map((o) => o.ktv), c = r.map((o) => o.crcl);
  isTrue(Math.max(...k) - Math.min(...k) > 0.5, "Kt/V differs between regimens at the urea cutoff");
  isTrue(Math.max(...c) - Math.min(...c) > 5, "CrCl differs between regimens at the cr cutoff");
  isTrue(Math.max(...c) > 10, "best CrCl at the cutoff above 10 L/wk (was 1.6 at D/P 0.34)");
}

section("Block wiring: no ranked options, step 4, Rx / Copy / Print");
{
  isTrue(/r\.belowModel = r\.dpErrors\.some\(\(x\) => x\[1\]\.belowModel\)/.test(app), "belowModel flag");
  isTrue(/r\.blocked = r\.inputErrors\.length > 0 \|\| r\.dpErrors\.length > 0/.test(app), "a below-model D/P blocks (options null)");
  isTrue(/r && r\.belowModel \? esc\(belowModelText\(r\)\)/.test(app), "option cards show the message");
  isTrue(/if \(r\.belowModel\) basis = belowModelText\(r\)/.test(app), "basis shows the message");
  isTrue(/basis: r\.belowModel \? belowModelText\(r\)/.test(app), "Rx sheet (and so Copy/Print) carries the message");
  isTrue(/R\.belowModel \? belowModelText\(R\)/.test(app), "step 4 shows the message");
  isTrue(/r\.numCat && !F\.isNum\(r\.mtacCr\) && !dpBlocked\("dpcr"\)/.test(app), "drain-dependent floor also blocks (no positive MTAC)");
  isTrue(/r\.ureaSource === "invalid" && !dpBlocked\("dpu"\)/.test(app), "invalid urea MTAC blocks instead of silently dropping Kt/V");
}

section("Decided, not proposed");
{
  const src = fs.readFileSync(path.join(__dirname, "..", "js/formulas.js"), "utf8");
  isTrue(!/PROPOSED/.test(src.slice(src.indexOf("Lowest 4-h PET D/P") - 200, src.indexOf("const DP_MODEL_MIN"))), "constant no longer marked PROPOSED");
  isTrue(/DECIDED by Dr D, Nov 15 2026/.test(src), "constant marked decided by Dr D");
  const rv = fs.readFileSync(path.join(__dirname, "..", "CONTENT_REVIEW.md"), "utf8");
  ["D/P creatinine cutoff 0.40", "D/P urea cutoff 0.70", "below model range", "default Low drain", "over-cap current prescription"].forEach((k) =>
    isTrue(new RegExp("^- \\[ \\] Sign-off: [^\\n]*" + k.replace(/[/.]/g, "\\$&") + "[^\\n]*decided by Dr D Nov 15 2026, full sign-off pending", "m").test(rv), "§29 item decided: " + k));
}

done("lowdp");

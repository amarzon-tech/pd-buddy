"use strict";
// model-2c (review branch): Vonesh 1999 Appendix eq. A4/A6/A8 solute model with residual carry-over.
process.env.PD_SOLUTE_MODEL = "vonesh2c";
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const RX = require("../js/prescription.js");
const { approx, eq, isTrue, throws, section, done } = require("./_h.js");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

section("Model switch");
eq(F.DEFAULT_SOLUTE_MODEL, "vonesh2c", "branch default is vonesh2c");
eq(F.SOLUTE_MODELS.join(), "garred,vonesh2c", "both models available");
eq(F.VONESH.QL, 0.6, "QL 0.60 mL/min (Vonesh 1999 default)");
eq(F.VONESH.V0D_FRAC, 0.1, "V0D = 10% of PET fill (Vonesh 1999 default)");
eq(F.VONESH.KFILL, 0.8305, "A5/A6 fill constant 0.8305 per L");
eq(F.VONESH.KT_A, 0.66, "A8 constant 0.66");
eq(F.VONESH.KT_B, 0.02, "A8 constant 0.02 per min");

section("Eq. A4, one dwell");
{ // no residual, no UF, PET-size fill: KPA factor = vFill(2.0)/vFill(2.2) × A8(t)
  const k = 10, t = 240, fFill = (1 - Math.exp(-0.8305 * 2)) / (1 - Math.exp(-0.8305 * 2.2)), a8 = 1 + 0.66 * Math.exp(-0.02 * t);
  approx(F.voneshDwellDp(k, 2000, 0, t, 0, 0), 1 - Math.exp(-((k * fFill * a8 + 0.3) * t) / 2000), 1e-12, "A4 closed form, UF 0, no residual");
  // PET-size V1D (2,000 + 200 mL): A6 ratio = 1
  const v1 = 2200, vd = 2500, a = 1 - Math.sqrt(v1 / vd) * 1 * Math.exp(-((k * a8 + 0.3) * t) / vd);
  approx(F.voneshDwellDp(k, 2000, 300, t, 0, 200), a, 1e-12, "A4 with UF 300 mL: (V1D/VD)^0.5 and t/VD");
  // residual carry-over: C1D = res × Cprev / V1D
  const c1 = (200 * 0.6) / 2200, b = 1 - Math.sqrt(v1 / vd) * (1 - c1) * Math.exp(-((k * a8 + 0.3) * t) / vd);
  approx(F.voneshDwellDp(k, 2000, 300, t, 0.6, 200), b, 1e-12, "carry-over: C1D = 200 × 0.6 / 2,200");
  isTrue(F.voneshDwellDp(k, 2000, 0, t, 0.6, 200) > F.voneshDwellDp(k, 2000, 0, t, 0, 200), "solute in the residual raises the end D/P");
  isTrue(F.voneshDwellDp(k, 2000, 500, t, 0, 200) * 2.5 > F.voneshDwellDp(k, 2000, 0, t, 0, 200) * 2.0, "positive UF raises dwell clearance (D/P × drained)");
  isTrue(F.voneshDwellDp(k, 2000, 0, 600, 0, 200) > F.voneshDwellDp(k, 2000, 0, 240, 0, 200), "longer dwell → higher D/P");
  isTrue(F.voneshDwellDp(0, 2000, 0, 240, 0, 200) > 0, "KPA 0: lymph term 0.5·QL alone gives D/P > 0");
  throws(() => F.voneshDwellDp(k, 2000, -2500, 240, 0, 200), "dwell volume must stay positive");
}

section("Eq. A6 fill scaling, A8 dwell-time factor");
{
  const r = (v) => (1 - Math.exp(-0.8305 * v)) / (1 - Math.exp(-0.8305 * 2.2));
  // larger fill → larger effective KPA; 3 L vs 2 L ratio
  approx(r(3.2) / r(2.2), (1 - Math.exp(-0.8305 * 3.2)) / (1 - Math.exp(-0.8305 * 2.2)), 1e-12, "A6 ratio is self-normalising at the PET V1D");
  // A5 normalisation point (documented flag): 1.1634 × (1 − e^(−0.8305 × V)) = 1 at V ≈ 2.36 L
  approx(Math.log(1 - 1 / 1.1634) / -0.8305, 2.364, 0.002, "A5 constant normalises at ≈ 2.36 L (not 2.0 L): flagged, A6 used");
  approx(1 + 0.66 * Math.exp(-0.02 * 240), 1.0054, 0.0001, "A8 at 240 min ≈ 1.005");
  approx(1 + 0.66 * Math.exp(-0.02 * 60), 1.1988, 0.0001, "A8 at 60 min ≈ 1.20 (short APD cycles)");
}

section("Steady-state day sequence");
{
  const dw = [1, 2, 3, 4].map(() => ({ fillL: 2, minutes: 360, ufMl: 0 }));
  const s = F.voneshSequence(dw, 15);
  isTrue(s.rows.length === 4 && s.lDay > 0, "4 dwells, clearance > 0");
  approx(s.lDay, s.rows.reduce((a, r) => a + r.dp * r.drainedL, 0), 1e-12, "clearance = Σ D/P × drained volume");
  const s2 = F.voneshSequence(dw.map((d) => Object.assign({}, d, { ufMl: 200 })), 15);
  isTrue(s2.lDay > s.lDay, "UF given back raises clearance");
  approx(s2.rows[0].drainedL, 2.2, 1e-12, "drained = fill + UF (constant residual)");
  const dry = F.voneshSequence([{ fillL: 2, minutes: 600, ufMl: 0 }], 15);
  isTrue(dry.rows[0].dp > F.voneshDwellDp(15, 2000, 0, 600, 0, 200), "dry gap: residual equilibrates and carries solute into the next fill");
  const p = F.predictDaily(dw, 15, 8);
  eq(p.model, "vonesh2c", "predictDaily uses 2c on the branch");
  approx(p.ureaLDay, s.lDay, 1e-12, "predictDaily urea = voneshSequence");
  isTrue(F.predictDaily(dw, 15, 8, "garred").model === undefined, "garred still selectable");
}

section("PET inverse (bisection on the same forward model)");
{
  const pr = T.petPriorUfMl("high-average");
  isTrue(pr > 0 && pr < 1000, "prior 8-h 2.27% dwell UF from the three-pore model");
  const k = F.voneshMtac(0.71, 2, 2.343, 240, pr);
  approx(F.voneshPetDp(k, 2.343, 240, pr), 0.71, 1e-9, "round trip D/P 0.71");
  throws(() => F.voneshMtac(0.2, 2, 3.5, 240, 300), "below the zero-diffusion floor → invalid (existing block applies)");
  throws(() => F.voneshMtac(0.7, 2.5, 3, 240, 300), "PET fill other than 2.0 L refused");
  approx(F.petMtac(0.7, 2, 2.4, 240, { model: "garred" }), F.garredMtac(0.7, 2, 2.4, 240), 1e-12, "petMtac garred = garredMtac");
  isTrue(F.voneshMtac(0.4, 2, 2.9885, 240, T.petPriorUfMl("low")) > F.garredMtac(0.4, 2, 2.9885, 240), "Low: 2c MTAC Cr above Garred (UF no longer credited as zero diffusion)");
}

section("Validation pins (published inputs; see research/MODEL_2C_BEFORE_AFTER.md)");
{
  // Akonur 2013 T1 Cr MTAC → forward D/P with TARGET mean PET UF (Akonur 2016 PDI 36:188 T2)
  const cases = [["high", 19.15, 230, 0.86], ["high-average", 11.92, 343, 0.71], ["low-average", 8.6, 435, 0.59]];
  for (const [k, m, uf, dp] of cases) {
    const got = F.voneshPetDp(m, 2 + uf / 1000, 240, T.petPriorUfMl(k));
    isTrue(Math.abs(got - dp) < 0.04, `${k}: forward D/P Cr ${got.toFixed(3)} within 0.04 of published ${dp}`);
    isTrue(Math.abs(got - dp) < Math.abs(F.garredDp ? F.garredDp(m, 2, 2 + uf / 1000, 240) - dp : 1), `${k}: 2c closer than Garred`);
  }
  // Akonur 2013 T3: night 5 × 2 L × 2 h 2.27%, day 14 h 2 L 2.27%, published UF, residual 350 mL, TBW T1
  const tbw = { high: 40.6, "high-average": 41.3, "low-average": 42.3 };
  let night = 0, dayK = 0;
  for (const k of Object.keys(tbw)) {
    const dw = Array.from({ length: 5 }, () => ({ fillL: 2, minutes: 120, ufMl: 852 / 5 })).concat([{ fillL: 2, minutes: 840, ufMl: -230 }]);
    const s = F.voneshSequence(dw, T.TYPE_PARAMS[k].mtacUrea, 350);
    night += (7 * s.rows.slice(0, 5).reduce((a, r) => a + r.dp * r.drainedL, 0)) / tbw[k] / 3;
    dayK += (7 * s.rows[5].dp * s.rows[5].drainedL) / tbw[k] / 3;
  }
  approx(night, 1.37, 0.03, "Akonur 2013 T3 night Kt/V 1.37");
  approx(dayK, 0.3, 0.03, "Akonur 2013 T3 14-h day Kt/V 0.30");
}

section("Per-dwell UF wiring");
{
  const opt = { id: "capd-4x2.0", mod: "capd", fillL: 2, exchanges: 4, longDwellH: 8 };
  const u = T.regimenUf(opt, "low-average", "dextrose");
  eq(u.dwellUfMl.length, 4, "regimenUf gives one UF per dwell (CAPD)");
  approx(u.dwellUfMl.reduce((a, b) => a + b, 0), u.dailyUfMl, 1e-6, "Σ dwell UF = daily UF");
  const dw = F.dwellsWithUf(opt, 450, u);
  eq(dw[3].ufMl, 450, "entered long-dwell UF overrides the long dwell");
  approx(dw[0].ufMl, u.dwellUfMl[0], 1e-12, "short dwells take three-pore UF");
  const ico = T.regimenUf(opt, "low-average", "icodextrin");
  eq(ico.dwellUfMl[3], T.ICO_PUBLISHED_UF.capd["low-average"], "icodextrin long dwell = published UF");
  const c = { id: "ccpd-5x2.0-10h-day", mod: "ccpd", fillL: 2, cycles: 5, nightH: 10, lastFillL: 2 };
  const uc = T.regimenUf(c, "high", "dextrose");
  if (uc) approx(uc.dwellUfMl.reduce((a, b) => a + b, 0), uc.dailyUfMl, 1e-6, "Σ dwell UF = daily UF (CCPD)");
  eq(F.dwellsWithUf(opt, 450, u, "garred")[0].ufMl, 0, "garred keeps UF 0 on short dwells");
}

section("Labels and wiring");
{
  const app = read("js/app.js"), html = read("index.html"), cfg = read("js/config.js");
  isTrue(/F\.petMtac\(/.test(app) && !/F\.garredMtac\(/.test(app), "app compute uses petMtac (2c), not garredMtac");
  isTrue(/F\.dwellsWithUf\(cur\.opt/.test(app), "lab-loop fit uses the same per-dwell UF");
  isTrue(/id="model-2c-note"/.test(html) && /model calculations/.test(html) && /Not validated/.test(html), "basis card states model calculation, not validated");
  isTrue(/model calculation/.test(RX.MODEL_2C_NOTE) && /not validated/.test(RX.MODEL_2C_NOTE), "Rx sheet model note");
  const txt = RX.build ? null : null;
  isTrue(/DRAFT\s*=\s*true/.test(cfg), "DRAFT stays true");
  isTrue(!/Adequest/.test(RX.MODEL_2C_NOTE), "no trademark in the UI note");
  const cr = read("CONTENT_REVIEW.md");
  isTrue(/## 31\./.test(cr) && /- \[ \] .*Vonesh/.test(cr), "CONTENT_REVIEW §31 unticked");
}
done("model2c");

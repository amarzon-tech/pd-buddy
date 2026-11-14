/**
 * Open three-pore model: unit checks and VALIDATION against the published
 * PD Adequest-based UF predictions of Akonur A et al. Perit Dial Int 2016;36:79-84
 * (doi:10.3747/pdi.2013.00081) Tables 3-5 — typical anuric patients per transport type,
 * 2 L fills, residual volume 350 mL (as stated in that paper), 1.36% / 2.27% glucose.
 * The comparison table is printed on every run.
 * Run: node tests/threepore.test.js
 */
"use strict";
const T = require("../js/threepore.js");
const F = require("../js/formulas.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");

const TYPES = ["high", "high-average", "low-average", "low"];
const SHORT = { high: "H", "high-average": "HA", "low-average": "LA", low: "L" };
const G = T.GLUCOSE_MMOL;
const VALID = { residualMl: 350 }; // Akonur 2016: "residual volume of 350 mL"; QL 0.6 (Adequest default)

section("Constants are the published values");
{
  eq(T.TYPE_PARAMS.high.a0dx, 40398, "A0/dX High (Akonur 2016 Table 1)");
  eq(T.TYPE_PARAMS.low.lpa, 0.0554, "LPA Low (Akonur 2016 Table 1)");
  eq(T.TYPE_PARAMS["high-average"].mtacGlu, 11.71, "glucose MTAC HA");
  eq(T.TPM.alphaC, 0.02, "aquaporin fraction (Öberg & Rippe 2017 Table 1)");
  eq(T.TPM.dPi, 22, "protein oncotic gradient 22 mmHg");
  eq(T.TPM.lymph, 0.6, "fluid absorption 0.6 mL/min (Vonesh 1999 Adequest default)");
  eq(T.TPM.residualFrac, 0.1, "residual volume 10% of fill (Vonesh 1999 Adequest default)");
  eq(G["1.5"], 75.49, "1.36% glucose = 75.49 mmol/L (Morelle 2018)");
  eq(G["4.25"], 214.25, "3.86% glucose = 214.25 mmol/L (Morelle 2018)");
  approx(G["2.5"], 22.7 / 180.16 * 1000, 0.1, "2.27% glucose from molar mass");
  approx(T.areaFactor(2250), 1, 0.002, "area factor = 1 at 2.25 L (Öberg & Rippe eq. 13)");
  eq(T.ICO_PUBLISHED_UF.ccpd.high, 465, "icodextrin APD 15-h UF High (Akonur 2016 Table 3)");
  eq(T.ICO_PUBLISHED_UF.capd.low, 389, "icodextrin CAPD 9-h UF Low (Akonur 2016 Table 3)");
}

section("Physics sanity");
{
  const p = T.TYPE_PARAMS["high-average"];
  const iso = T.simulateDwell(p, { fillMl: 2000, residualMl: 200, minutes: 240, glucoseMmol: T.TPM.gluPlasma, lymph: 0 });
  isTrue(iso.ufMl < 0, "glucose-free dialysate is absorbed (net negative UF)");
  const a = T.simulateDwell(p, { fillMl: 2000, residualMl: 200, minutes: 240, glucoseMmol: G["1.5"] });
  const b = T.simulateDwell(p, { fillMl: 2000, residualMl: 200, minutes: 240, glucoseMmol: G["2.5"] });
  const c = T.simulateDwell(p, { fillMl: 2000, residualMl: 200, minutes: 240, glucoseMmol: G["4.25"] });
  isTrue(a.ufMl < b.ufMl && b.ufMl < c.ufMl, "UF rises with glucose strength");
  isTrue(c.ufMl > 400, "3.86% 4-h dwell gives clearly positive UF");
  const hi = T.simulateDwell(T.TYPE_PARAMS.high, { fillMl: 2000, residualMl: 200, minutes: 480, glucoseMmol: G["2.5"] });
  const lo = T.simulateDwell(T.TYPE_PARAMS.low, { fillMl: 2000, residualMl: 200, minutes: 480, glucoseMmol: G["2.5"] });
  isTrue(hi.ufMl < lo.ufMl, "high transporters lose long-dwell UF (faster glucose absorption)");
  isTrue(a.end.glu < G["1.5"] && a.end.glu > T.TPM.gluPlasma, "dialysate glucose falls toward plasma");
  isTrue(a.end.urea > 0 && a.end.urea < T.TPM.ureaPlasma, "dialysate urea rises toward plasma");
  isTrue(a.end.na < T.TPM.naDial + 1, "sodium sieving: dialysate Na does not rise early");
  // diffusion-only limit of Patlak
  approx(T.patlak(0, 0, 10, 20, 5), 150, 1e-9, "Patlak → PS·ΔC when Jv = 0");
}

section("Validation vs Akonur 2016 Tables 3-4 (UF, mL)");
const PUB = {
  "APD day 15 h 2.27% (T3)": { v: [-416, -291, -135, 71], run: (p) => T.simulateSequence(p, [{ fillMl: 2000, minutes: 900, glucoseMmol: G["2.5"] }], VALID).ufMl },
  "CAPD night 9 h 2.27% (T3)": { v: [-108, 13, 147, 299], run: (p) => T.simulateSequence(p, [{ fillMl: 2000, minutes: 540, glucoseMmol: G["2.5"] }], VALID).ufMl },
  "APD night 9 h ×3 1.36% (T4)": { v: [20, 103, 171, 266], run: (p) => cyc(p, 3) },
  "APD night 9 h ×5 1.36% (T4)": { v: [168, 230, 276, 357], run: (p) => cyc(p, 5) },
  "APD night 9 h ×7 1.36% (T4)": { v: [246, 287, 316, 386], run: (p) => cyc(p, 7) },
  "CAPD day 3×5 h 1.36% (T4)": { v: [-223, -75, 61, 233], run: (p) => day(p, G["1.5"]) },
  "CAPD day 3×5 h 2.27% (T4)": { v: [262, 520, 771, 1040], run: (p) => day(p, G["2.5"]) },
};
function cyc(p, n) {
  return T.simulateSequence(p, Array.from({ length: n }, () => ({ fillMl: 2000, minutes: 540 / n, glucoseMmol: G["1.5"] })), VALID).ufMl;
}
function day(p, g) {
  return T.simulateSequence(p, Array.from({ length: 3 }, () => ({ fillMl: 2000, minutes: 300, glucoseMmol: g })), VALID).ufMl;
}
const errs = [];
const table = [];
for (const [name, row] of Object.entries(PUB)) {
  const model = TYPES.map((k) => row.run(T.TYPE_PARAMS[k]));
  model.forEach((m, i) => errs.push(m - row.v[i]));
  table.push(name.padEnd(30) + TYPES.map((k, i) => (SHORT[k] + " " + Math.round(model[i]) + " vs " + row.v[i]).padEnd(18)).join(""));
  // ordering across transport types must match the published ordering
  const pubOrder = row.v.slice().map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join();
  const modOrder = model.slice().map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join();
  eq(modOrder, pubOrder, name + ": transport-type ordering matches Akonur");
}
const rmse = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
const maxAbs = Math.max(...errs.map(Math.abs));
const mean = errs.reduce((a, e) => a + e, 0) / errs.length;
console.log("  model vs published (mL):");
table.forEach((l) => console.log("   " + l));
console.log("  cells " + errs.length + " · RMSE " + rmse.toFixed(0) + " mL · max |error| " + maxAbs.toFixed(0) + " mL · mean bias " + mean.toFixed(0) + " mL");
// Regression guards: these are the reported numbers. If the model changes, update the report.
isTrue(rmse < 120, "RMSE below 120 mL (got " + rmse.toFixed(0) + ")");
isTrue(maxAbs < 260, "max error below 260 mL (got " + maxAbs.toFixed(0) + ")");
// Decision rule (CONTENT_REVIEW §17): "validated" only if every cell is within ±100 mL.
const validated = errs.every((e) => Math.abs(e) <= 100);
eq(T.UF_STATUS, validated ? "validated" : "experimental", "UF status label follows the ±100 mL rule");

section("Validation vs Akonur 2016 Table 5 (UF efficiency, mL per g carbohydrate absorbed)");
{
  // Only the glucose-only cells whose UF and carbohydrate both come from the model.
  const UFE = {
    "APD day 2.27%": { v: [-9.6, -6.8, -3.2, 1.8], dw: [{ fillMl: 2000, minutes: 900, glucoseMmol: G["2.5"] }] },
    "CAPD night 2.27%": { v: [-2.6, 0.3, 4.0, 9.1], dw: [{ fillMl: 2000, minutes: 540, glucoseMmol: G["2.5"] }] },
    "CAPD day 2.27%": { v: [2.3, 5.0, 8.8, 14.5], dw: Array.from({ length: 3 }, () => ({ fillMl: 2000, minutes: 300, glucoseMmol: G["2.5"] })) },
  };
  for (const [name, row] of Object.entries(UFE)) {
    const m = TYPES.map((k) => {
      const r = T.simulateSequence(T.TYPE_PARAMS[k], row.dw, VALID);
      return r.ufMl / r.gluAbsorbedG;
    });
    console.log("   " + name.padEnd(20) + TYPES.map((k, i) => (SHORT[k] + " " + m[i].toFixed(1) + " vs " + row.v[i]).padEnd(16)).join(""));
    isTrue(m[0] < m[3], name + ": UFE lower in High than Low, as published");
  }
}

section("Regimen UF for the app");
{
  const capd = F.CANDIDATE_OPTIONS.find((o) => o.id === "capd-4x2.0");
  const dry = F.CANDIDATE_OPTIONS.find((o) => o.id === "ccpd-4x2.0-dry");
  const day = F.CANDIDATE_OPTIONS.find((o) => o.id === "ccpd-5x2.0-day");
  const a = T.regimenUf(capd, "high-average", "dextrose");
  const b = T.regimenUf(capd, "high-average", "icodextrin");
  eq(a.longSource, "model", "dextrose long dwell is simulated");
  eq(b.longSource, "published", "Extraneal long dwell uses the published value");
  eq(b.longUfMl, 386, "Extraneal CAPD HA = 386 mL (Akonur 2016 Table 3, 9-h)");
  approx(b.dailyUfMl - b.shortUfMl, 386, 1e-9, "daily = short + Extraneal long");
  isTrue(b.dailyUfMl > a.dailyUfMl, "Extraneal improves daily UF for high-average");
  eq(T.regimenUf(dry, "low", "dextrose").longUfMl, null, "dry day has no long dwell");
  const dI = T.regimenUf(day, "high", "icodextrin");
  eq(dI.longUfMl, 465, "Extraneal CCPD day dwell High = 465 mL (Akonur 2016 Table 3, 15-h)");
  eq(T.regimenUf(capd, "nope", "dextrose"), null, "unknown type → null");
}

done("threepore");

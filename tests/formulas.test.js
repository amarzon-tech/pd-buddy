/**
 * Worked-example tests for PD Buddy formulas.
 * Run: node tests/formulas.test.js
 * Expectations are either published values (Twardowski bands, KDOQI 2006,
 * ISPD 2021 thresholds, Asghar 2003 and Pannekeet 1995 cohort MTACs, the
 * Fresenius PET worked example) or hand arithmetic of the cited equations.
 */
"use strict";
const F = require("../js/formulas.js");
const { approx, eq, isTrue, throws, section, done } = require("./_h.js");

section("Watson V (Watson 1980)");
// Male 60 y, 175 cm, 80 kg: 2.447 − 0.09516×60 + 0.1074×175 + 0.3362×80
approx(F.watsonV("male", 60, 175, 80), 2.447 - 5.7096 + 18.795 + 26.896, 1e-9, "male 60 y 175 cm 80 kg = 42.4284 L");
approx(F.watsonV("male", 60, 175, 80), 42.4284, 1e-9, "male example in litres");
// Female 165 cm 65 kg: −2.097 + 0.1069×165 + 0.2466×65 = 31.5705
approx(F.watsonV("female", 60, 165, 65), 31.5705, 1e-9, "female 165 cm 65 kg = 31.5705 L");
approx(F.watsonV("female", 20, 165, 65), F.watsonV("female", 80, 165, 65), 1e-12, "female Watson has no age term");
isTrue(F.watsonV("male", 70, 175, 80) < F.watsonV("male", 40, 175, 80), "male Watson falls with age");
approx(F.watsonV("male", 61, 175, 80) - F.watsonV("male", 60, 175, 80), -0.09516, 1e-9, "published male age coefficient 0.09516");
throws(() => F.watsonV("male", null, 175, 80), "male Watson needs age");
throws(() => F.watsonV("male", 60, 175, 0), "weight must be > 0");

section("Hume-Weyers V (Hume & Weyers 1971)");
approx(F.humeWeyersV("male", 175, 80), 0.194786 * 175 + 0.296785 * 80 - 14.012934, 1e-9, "male formula");
approx(F.humeWeyersV("male", 175, 80), 43.817416, 1e-6, "male 175 cm 80 kg = 43.817 L");
approx(F.humeWeyersV("female", 165, 65), 33.527719, 1e-6, "female 165 cm 65 kg = 33.528 L");

section("BSA (Mosteller 1987, Du Bois 1916)");
approx(F.bsaMosteller(175, 80), Math.sqrt(14000 / 3600), 1e-12, "Mosteller 175 cm 80 kg");
approx(F.bsaMosteller(175, 80), 1.9720, 1e-4, "Mosteller ≈ 1.972 m²");
approx(F.bsaMosteller(180, 80), 2.0, 1e-12, "Mosteller 180 × 80 / 3600 = 4 → 2.00 m²");
approx(F.bsaDuBois(175, 80), 1.95606, 1e-4, "Du Bois 175 cm 80 kg ≈ 1.956 m²");

section("PET categories, 4-h D/P creatinine (Twardowski 1987)");
[[0.34, "low"], [0.49, "low"], [0.5, "low-average"], [0.64, "low-average"], [0.65, "high-average"], [0.81, "high-average"], [0.82, "high"], [1.03, "high"]].forEach(([x, k]) =>
  eq(F.petCategoryCr(x).key, k, "D/P Cr " + x + " → " + k)
);
eq(F.petCategoryCr(0.3).key, "low", "below 0.34 reported as low");
eq(F.petCategoryCr(0.3).outside, "below", "below range is flagged");
eq(F.petCategoryCr(1.1).outside, "above", "above 1.03 is flagged");
eq(F.petCategoryCr(0.7).outside, null, "in-range value not flagged");
throws(() => F.petCategoryCr(null), "D/P Cr required");

section("PET categories, 4-h D/D0 glucose (Twardowski)");
[[0.12, "high"], [0.25, "high"], [0.26, "high-average"], [0.38, "high-average"], [0.39, "low-average"], [0.49, "low-average"], [0.5, "low"], [0.61, "low"]].forEach(([x, k]) =>
  eq(F.petCategoryGlucose(x).key, k, "D/D0 " + x + " → " + k)
);
// Fresenius Medical Care worked example: D/P Cr 0.59 and D/D0 0.47 → low average.
eq(F.petCategoryCr(0.59).key, "low-average", "worked example D/P Cr 0.59 is low average");
eq(F.petCategoryGlucose(0.47).key, "low-average", "worked example D/D0 0.47 is low average");
eq(F.petConcordant(0.59, 0.47), true, "worked example is concordant");
eq(F.petConcordant(0.85, 0.45), false, "high D/P Cr with low-average D/D0 is discordant");

section("PET net UF and ISPD 2021 screen (Morelle 2021, GRADE 1B)");
approx(F.petNetUfMl(2, 2200), 200, 1e-9, "2 L fill, 2200 mL drain = +200 mL");
approx(F.petNetUfMl(2, 1900), -100, 1e-9, "negative UF allowed");
eq(F.petUfScreen(350, "4.25").insufficient, true, "350 mL on 4.25% is insufficient (< 400)");
eq(F.petUfScreen(400, "4.25").insufficient, false, "400 mL on 4.25% is not insufficient");
eq(F.petUfScreen(90, "2.5").insufficient, true, "90 mL on 2.5% is insufficient (< 100)");
eq(F.petUfScreen(100, "2.5").insufficient, false, "100 mL on 2.5% is not insufficient");
eq(F.petUfScreen(50, "1.5").applicable, false, "no ISPD threshold for 1.5%");
eq(F.TARGETS.PET_UF_MIN_425, 400, "ISPD 2021 400 mL");
eq(F.TARGETS.PET_UF_MIN_25, 100, "ISPD 2021 100 mL");
eq(F.TARGETS.PET_MINUTES, 240, "PET is a 4-hour dwell");
eq(F.TARGETS.PET_FILL_L, 2.0, "PET fill is 2 L");

section("Garred MTAC (Garred 1983; form in Asghar 2003)");
// Hand arithmetic: D/P 0.70, V0 2 L, Vt 2.2 L, 240 min:
// (2200/240) × ln(2000 / (2200 × 0.30)) = 9.1667 × ln(3.0303) = 10.1627
approx(F.garredMtac(0.7, 2, 2.2, 240), (2200 / 240) * Math.log(2000 / (2200 * 0.3)), 1e-9, "formula as written");
approx(F.garredMtac(0.7, 2, 2.2, 240), 10.1627, 1e-3, "worked example ≈ 10.16 mL/min");
// Without UF (V0 = Vt) the model reduces to MTAC = (V/t) ln(1/(1 − D/P))
approx(F.garredMtac(0.6, 2, 2, 240), (2000 / 240) * Math.log(1 / 0.4), 1e-9, "no-UF reduction");
// Asghar 2003 (Kidney Int 64:1911): mean IP volume 1957 mL at 2 h, creatinine
// time constant 178 min, urea 115 min; reported MTAC creatinine 10.5 ± 2.04,
// urea 18.2 ± 2.3 mL/min. With D(t) = P(1 − e^(−t/τ)) at 120 min and constant
// volume, Garred returns V/τ, which must fall within 1 SD of the reported means.
{
  const dpCr = 1 - Math.exp(-120 / 178);
  const dpU = 1 - Math.exp(-120 / 115);
  const mCr = F.garredMtac(dpCr, 1.957, 1.957, 120);
  const mU = F.garredMtac(dpU, 1.957, 1.957, 120);
  approx(mCr, 1957 / 178, 1e-9, "creatinine: Garred gives V/τ = 10.99 mL/min");
  approx(mU, 1957 / 115, 1e-9, "urea: Garred gives V/τ = 17.02 mL/min");
  isTrue(Math.abs(mCr - 10.5) <= 2.04, "creatinine within Asghar 2003 mean ± SD (10.5 ± 2.04)");
  isTrue(Math.abs(mU - 18.2) <= 2.3, "urea within Asghar 2003 mean ± SD (18.2 ± 2.3)");
}
// Pannekeet 1995 (Kidney Int 48:866): median D/P Cr 0.76, median NUF −75 mL,
// MTAC creatinine median 10.4 (range 5.7–19.3) mL/min. Garred on those medians
// (2 L, 240 min) must land inside the published range.
{
  const m = F.garredMtac(0.76, 2, 1.925, 240);
  approx(m, 11.753, 1e-3, "Pannekeet medians → 11.75 mL/min");
  isTrue(m >= 5.7 && m <= 19.3, "inside Pannekeet 1995 MTAC Cr range 5.7–19.3");
}
throws(() => F.garredMtac(1, 2, 2, 240), "D/P of 1 is outside the model");
throws(() => F.garredMtac(0.1, 2, 2.5, 240), "UF so large that MTAC ≤ 0 is rejected");
throws(() => F.garredMtac(0.7, 2, null, 240), "drain volume required");

section("Garred forward D/P (same equation solved for D(td))");
{
  const m = F.garredMtac(0.7, 2, 2.2, 240);
  approx(F.garredDp(m, 2, 2.2, 240), 0.7, 1e-12, "round trip returns the PET D/P exactly");
  const mU = F.garredMtac(0.9, 2, 2.2, 240);
  approx(F.garredDp(mU, 2, 2.2, 240), 0.9, 1e-12, "round trip urea");
  isTrue(F.garredDp(m, 2, 2, 120) < F.garredDp(m, 2, 2, 240), "shorter dwell, lower D/P");
  isTrue(F.garredDp(m, 2, 2, 600) < 1 && F.garredDp(m, 2, 2, 600) > 0.95, "long dwell approaches equilibrium");
  isTrue(F.garredDp(m, 2.5, 2.5, 240) < F.garredDp(m, 2, 2, 240), "larger fill with same MTAC, lower D/P");
  approx(F.garredDp(m, 2, 2, 360), 1 - Math.exp((-m * 360) / 2000), 1e-12, "no-UF forward form");
  eq(F.garredDp(5, 2, 1.5, 1), 0, "floored at 0 when absorption exceeds transfer");
}

section("CAPD dwells");
{
  const d = F.capdDwells({ exchanges: 4, fillL: 2 });
  eq(d.length, 4, "4 exchanges");
  approx(d[0].minutes, 360, 1e-9, "24 h / 4 = 6 h each");
  const l = F.capdDwells({ exchanges: 4, fillL: 2, longDwellH: 9 });
  approx(l[0].minutes, 300, 1e-9, "other 3 share 15 h = 5 h each");
  approx(l[3].minutes, 540, 1e-9, "long dwell 9 h");
  eq(l[3].kind, "long", "long dwell marked");
  approx(l.reduce((s, x) => s + x.minutes, 0), 1440, 1e-9, "dwells add to 24 h");
  eq(F.capdDwells({ exchanges: 4, fillL: 2, ufPerExchangeMl: 200 })[0].ufMl, 200, "UF per exchange carried");
  throws(() => F.capdDwells({ exchanges: 3.5, fillL: 2 }), "whole exchanges only");
  throws(() => F.capdDwells({ exchanges: 4, fillL: 2, longDwellH: 24 }), "long dwell < 24 h");
}

section("APD dwells");
{
  const d = F.apdDwells({ cycles: 5, fillL: 2, therapyH: 9 });
  eq(d.length, 5, "dry day: 5 night cycles only");
  approx(d[0].minutes, 108, 1e-9, "9 h / 5 = 108 min");
  const o = F.apdDwells({ cycles: 5, fillL: 2, therapyH: 9, fillDrainMin: 10 });
  approx(o[0].minutes, 98, 1e-9, "(540 − 5 × 10) / 5 = 98 min");
  const w = F.apdDwells({ cycles: 5, fillL: 2, therapyH: 9, lastFillL: 2 });
  eq(w.length, 6, "last fill adds a day dwell");
  approx(w[5].minutes, 900, 1e-9, "day dwell = 24 − 9 = 15 h");
  approx(F.apdDwells({ cycles: 5, fillL: 2, therapyH: 9, lastFillL: 2, dayDwellH: 12 })[5].minutes, 720, 1e-9, "day dwell override");
  throws(() => F.apdDwells({ cycles: 5, fillL: 2, therapyH: 1, fillDrainMin: 20 }), "overhead leaving no dwell is rejected");
  throws(() => F.apdDwells({ cycles: 5, fillL: 2 }), "therapy time required");
}

section("Predicted daily clearance and weekly Kt/V");
{
  const mU = F.garredMtac(0.9, 2, 2.2, 240);
  const mC = F.garredMtac(0.7, 2, 2.2, 240);
  const p = F.predictDaily(F.capdDwells({ exchanges: 4, fillL: 2 }), mU, mC);
  const dpU = 1 - Math.exp((-mU * 360) / 2000);
  approx(p.ureaLDay, 4 * 2 * dpU, 1e-9, "Σ D/P × drain, 4 × 2 L at 6 h");
  approx(p.ureaLDay, 7.7904, 1e-3, "≈ 7.79 L/day");
  approx(p.drainLDay, 8, 1e-12, "drain = instilled when UF 0");
  approx(F.weeklyKtv(p.ureaLDay, 42.4284), 1.2853, 1e-3, "peritoneal weekly Kt/V ≈ 1.29");
  const pu = F.predictDaily(F.capdDwells({ exchanges: 4, fillL: 2, ufPerExchangeMl: 250 }), mU, mC);
  isTrue(pu.ureaLDay > p.ureaLDay, "entered UF raises clearance");
  approx(pu.netUfMlDay, 1000, 1e-9, "4 × 250 mL net UF = 1000 mL/day");
  const ap = F.predictDaily(F.apdDwells({ cycles: 5, fillL: 2, therapyH: 9, lastFillL: 2 }), mU, mC);
  approx(ap.rows[0].dpUrea, 1 - Math.exp((-mU * 108) / 2000), 1e-12, "APD night cycle D/P urea");
  isTrue(ap.rows[5].dpUrea > 0.99, "15-h day dwell near equilibrium");
  const onlyCr = F.predictDaily(F.capdDwells({ exchanges: 4, fillL: 2 }), null, mC);
  eq(onlyCr.ureaLDay, null, "no D/P urea → no urea estimate");
  isTrue(onlyCr.crLDay > 0, "creatinine estimate still given");
}

section("Transport type only: Twardowski band midpoints");
{
  const t = F.typicalPet("high-average");
  approx(t.dpCr, 0.73, 1e-9, "high-average D/P Cr = (0.65 + 0.81) / 2");
  approx(t.drainMl, 2226, 1e-9, "high-average PET drain = (2085 + 2367) / 2");
  eq(t.dpUrea, null, "no typical D/P urea (none published per category)");
  approx(F.typicalPet("low").dpCr, 0.415, 1e-9, "low D/P Cr midpoint");
  approx(F.typicalPet("low-average").dpCr, 0.57, 1e-9, "low-average D/P Cr midpoint");
  approx(F.typicalPet("high").dpCr, 0.925, 1e-9, "high D/P Cr midpoint");
  approx(F.typicalPet("low").drainMl, 2988.5, 1e-9, "low drain midpoint");
  approx(F.typicalPet("low-average").drainMl, 2509.5, 1e-9, "low-average drain midpoint");
  approx(F.typicalPet("high").drainMl, 1832, 1e-9, "high drain midpoint");
  ["low", "low-average", "high-average", "high"].forEach((k) => {
    const x = F.typicalPet(k);
    eq(F.petCategoryCr(x.dpCr).key, k, k + ": typical D/P Cr falls in its own band");
    eq(x.fillL, 2.0, k + ": PET fill 2.0 L");
  });
  throws(() => F.typicalPet("medium"), "unknown type rejected");
  // High-average typical MTAC creatinine (Garred): (2.226/240) × ln[2 / (2.226 × 0.27)] × 1000
  approx(F.garredMtac(0.73, 2.0, 2.226, 240), (2226 / 240) * Math.log(2000 / (2226 * 0.27)), 1e-9, "typical MTAC Cr");
  // Faster type → higher MTAC
  const m = ["low", "low-average", "high-average", "high"].map((k) => { const x = F.typicalPet(k); return F.garredMtac(x.dpCr, 2, x.drainMl / 1000, 240); });
  isTrue(m[0] < m[1] && m[1] < m[2] && m[2] < m[3], "typical MTAC rises with transport type");
}

section("Height ft/in and weight lb");
{
  approx(F.ftInToCm(5, 9), 175.26, 1e-9, "5 ft 9 in = 175.26 cm");
  approx(F.ftInToCm(6, 0), 182.88, 1e-9, "6 ft = 182.88 cm");
  approx(F.ftInToCm(5, null), 152.4, 1e-9, "inches blank = 0");
  approx(F.ftInToCm(null, 69), 175.26, 1e-9, "inches only");
  throws(() => F.ftInToCm(null, null), "height required");
  throws(() => F.ftInToCm(-5, 0), "negative rejected");
  approx(F.lbToKg(176.37), 80.0, 0.001, "176.37 lb ≈ 80 kg");
  approx(F.lbToKg(1), 0.45359237, 1e-12, "1 lb = 0.45359237 kg");
  approx(F.watsonV("male", 60, F.ftInToCm(5, 9), 80), 2.447 - 0.09516 * 60 + 0.1074 * 175.26 + 0.3362 * 80, 1e-9, "Watson with converted height");
}

section("Standard regimen options (CAPD, CCPD, Extraneal)");
{
  eq(F.REGIMEN_OPTIONS.length, 7, "7 standard regimens");
  isTrue(F.REGIMEN_OPTIONS.every((o) => o.fillL >= 2.0 && o.fillL <= 2.5), "fills 2.0–2.5 L (Handbook)");
  isTrue(F.REGIMEN_OPTIONS.filter((o) => o.mod === "ccpd").every((o) => o.cycles <= 5 && o.therapyH === 9), "CCPD ≤ 5 cycles over 9 h");
  const d = F.optionDwells(F.REGIMEN_OPTIONS[1]);
  eq(d.length, 4, "CAPD 4 × 2 L has 4 dwells");
  approx(d[3].minutes, 480, 1e-9, "8-h overnight long dwell");
  approx(d[0].minutes, 320, 1e-9, "day dwells share 16 h");
  const cd = F.optionDwells(F.REGIMEN_OPTIONS[4]);
  approx(cd[4].minutes, 900, 1e-9, "CCPD day dwell 15 h");
  eq(F.optionDwells(F.REGIMEN_OPTIONS[3]).length, 4, "dry-day CCPD has no day dwell");
  const mC = F.garredMtac(0.73, 2, 2.226, 240);
  const base = { mtacUrea: null, mtacCr: mC, V: 42.5, bsa: 1.97 };
  const rows = F.regimenOptions(base);
  eq(rows.length, 13, "7 regimens + 6 Extraneal variants (dry day has none)");
  isTrue(rows.every((r) => r.ktv === null), "no Kt/V without urea MTAC");
  isTrue(rows.every((r) => Number.isFinite(r.crcl)), "CrCl for every row");
  const dex = rows.find((r) => r.id === "capd-4x2"), ico = rows.find((r) => r.id === "capd-4x2-ico");
  approx(ico.crcl, dex.crcl, 1e-12, "Extraneal = dextrose when no UF entered (icodextrin not modeled)");
  const withUf = F.regimenOptions(Object.assign({}, base, { longUfIcodextrinMl: 500 }));
  isTrue(withUf.find((r) => r.id === "capd-4x2-ico").crcl > dex.crcl, "entered Extraneal UF raises CrCl");
  const p = F.predictDaily(F.capdDwells({ exchanges: 4, fillL: 2, longDwellH: 8 }), null, mC);
  approx(dex.crcl, F.weeklyCrCl173(p.crLDay, 1.97), 1e-9, "option = custom CAPD 4 × 2 L with 8-h long dwell");
  const mU = F.garredMtac(0.9, 2, 2.2, 240);
  const k = F.regimenOptions({ mtacUrea: mU, mtacCr: mC, V: 42.5, bsa: 1.97, ktvRenal: 0.3, rkfLDay: 5 });
  const kd = k.find((r) => r.id === "capd-4x2");
  approx(kd.ktv, kd.ktvP + 0.3, 1e-12, "total Kt/V includes renal");
  isTrue(k.find((r) => r.id === "capd-4x2.5").ktv > kd.ktv, "4 × 2.5 L > 4 × 2.0 L");
  isTrue(k.find((r) => r.id === "ccpd-4x2-day").ktv > k.find((r) => r.id === "ccpd-4x2-dry").ktv, "day dwell adds clearance");
}

section("Measured clearances (KDOQI 2006 CPG 2 definitions)");
approx(F.clearanceLDay(0.9 * 60, 60, 10), 9, 1e-12, "D/P urea 0.9 × 10 L drain = 9 L/day");
approx(F.weeklyKtv(9, 35), 1.8, 1e-12, "7 × 9 / 35 = 1.80");
approx(F.weeklyKtv(9 + 2.5, 35), 2.3, 1e-12, "with renal 2.5 L/day, total 2.30");
{
  const r = F.residual({ urineMl: 500, urineUrea: 300, plasmaUrea: 60, urineCr: 40, plasmaCr: 8 });
  approx(r.ureaLDay, 2.5, 1e-12, "U/P urea 5 × 0.5 L = 2.5 L/day");
  approx(r.crLDay, 2.5, 1e-12, "U/P Cr 5 × 0.5 L = 2.5 L/day");
  approx(r.rkfLDay, 2.5, 1e-12, "RKF mean = 2.5 L/day");
  approx(r.rkfMlMin, 2500 / 1440, 1e-12, "RKF ≈ 1.74 mL/min");
  eq(r.significant, true, "500 mL > 100 mL/day is significant RKF");
  const r2 = F.residual({ urineMl: 1000, urineUrea: 300, plasmaUrea: 60, urineCr: 80, plasmaCr: 8 });
  approx(r2.rkfLDay, 0.5 * (5 + 10), 1e-12, "mean of urea 5 and Cr 10 L/day = 7.5");
  eq(F.residual({ urineMl: 100, urineUrea: 300, plasmaUrea: 60 }).significant, false, "100 mL/day is negligible (KDOQI: ≤ 100)");
  eq(F.residual({ urineMl: 500, urineUrea: 300, plasmaUrea: 60 }).rkfLDay, null, "no creatinine → no mean RKF");
}
approx(F.weeklyCrCl173(10, 1.73), 70, 1e-12, "10 L/day at BSA 1.73 = 70 L/week/1.73 m²");
approx(F.weeklyCrCl173(10, 2.0), (70 * 1.73) / 2, 1e-12, "normalised by 1.73 / BSA");
throws(() => F.clearanceLDay(10, 0, 1), "plasma 0 rejected");
throws(() => F.weeklyKtv(9, 0), "V 0 rejected");

section("Targets (KDOQI 2006, ISPD 2020) — informational only");
eq(F.TARGETS.KTV_HISTORICAL_MIN, 1.7, "KDOQI 2006 minimum 1.7");
eq(F.TARGETS.RKF_URINE_SIGNIFICANT_ML, 100, "KDOQI 2006 RKF significant > 100 mL/day");
eq(F.TARGETS.CRCL_HISTORICAL_CAPD, 60, "historical CANUSA-based CrCl 60 L/wk/1.73 m²");
eq(F.TARGETS.BSA_REF, 1.73, "normalisation 1.73 m²");
eq(F.ktvReading(1.7).state, "ok", "1.7 reads at or above");
eq(F.ktvReading(1.69).state, "warn", "1.69 reads below");

done("formulas");

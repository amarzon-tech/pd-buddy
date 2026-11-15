/**
 * PD Buddy — formulas. Pure functions, no DOM, no storage, no network.
 *
 * Every constant below carries its source. This file does not reproduce or
 * contain any proprietary kinetic-modeling program; it cites published
 * parameters derived with one (Akonur 2013/2016). The regimen estimate uses the
 * published Garred simple diffusion model (volume-corrected form), fitted
 * to the patient's own 4-hour PET and then run forward for each dwell.
 * It is NOT a validated prescription model; see CONTENT_REVIEW.md.
 */
(function (global) {
  "use strict";

  function isNum(x) {
    return typeof x === "number" && Number.isFinite(x);
  }
  function req(name, x) {
    if (!isNum(x)) throw new Error(name + " is required");
    return x;
  }
  function pos(name, x) {
    req(name, x);
    if (x <= 0) throw new Error(name + " must be greater than 0");
    return x;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Published constants (each cited)
   * ═══════════════════════════════════════════════════════════════════════ */
  const TARGETS = Object.freeze({
    // KDOQI 2006 PD Adequacy CPG 2.1.1 / 2.2.1: minimal delivered total (or
    // peritoneal, if no RKF) weekly Kt/V urea "of at least 1.7 per week".
    // ISPD 2020 (Brown et al.): no specific target guarantees sufficient dialysis.
    KTV_HISTORICAL_MIN: 1.7,
    // KDOQI 2006 CPG 2.1: RKF "considered to be significant when urine volume is > 100 mL/d".
    RKF_URINE_SIGNIFICANT_ML: 100,
    // KDOQI 2006 CPG 2 rationale: prior (CANUSA-based) guideline of "creatinine
    // clearance (CCr) of 60 L/wk/1.73 m2 for CAPD patients"; ADEMEX intervention
    // arm targeted peritoneal CCr 60 L/wk/1.73 m2. Shown as history only.
    CRCL_HISTORICAL_CAPD: 60,
    // ISPD 2021 (Morelle et al., GRADE 1B): insufficient UF on a 4-h PET is
    // net UF < 400 mL with 4.25% dextrose / 3.86% glucose, < 100 mL with 2.5% / 2.27%.
    PET_UF_MIN_425: 400,
    PET_UF_MIN_25: 100,
    // Twardowski 1987: PET is a 4-hour dwell with 2 L of 2.5% dextrose.
    PET_MINUTES: 240,
    PET_FILL_L: 2.0,
    // Normalisation surface area used by KDOQI/ISPD for CrCl.
    BSA_REF: 1.73,
  });

  /* ═══════════════════════════════════════════════════════════════════════
   * Urea distribution volume (V) and BSA
   * KDOQI 2006 CPR 2.6: "When calculating Kt/V urea, one should estimate V
   * from either the Watson or Hume equation in adults."
   * ═══════════════════════════════════════════════════════════════════════ */

  /**
   * Watson PE, Watson ID, Batt RD. Am J Clin Nutr. 1980;33:27-39. doi:10.1093/ajcn/33.1.27
   *   Male:   2.447 − 0.09516×age + 0.1074×height_cm + 0.3362×weight_kg
   *   Female: −2.097 + 0.1069×height_cm + 0.2466×weight_kg   (no age term)
   */
  function watsonV(sex, age, heightCm, weightKg) {
    pos("height", heightCm);
    pos("weight", weightKg);
    if (sex === "female") return -2.097 + 0.1069 * heightCm + 0.2466 * weightKg;
    pos("age", age);
    return 2.447 - 0.09516 * age + 0.1074 * heightCm + 0.3362 * weightKg;
  }

  /**
   * Hume R, Weyers E. J Clin Pathol. 1971;24:234-238. doi:10.1136/jcp.24.3.234
   *   Male:   0.194786×H + 0.296785×W − 14.012934
   *   Female: 0.344547×H + 0.183809×W − 35.270121
   */
  function humeWeyersV(sex, heightCm, weightKg) {
    pos("height", heightCm);
    pos("weight", weightKg);
    if (sex === "female") return 0.344547 * heightCm + 0.183809 * weightKg - 35.270121;
    return 0.194786 * heightCm + 0.296785 * weightKg - 14.012934;
  }

  /** Mosteller RD. N Engl J Med. 1987;317:1098.  BSA = √(H_cm × W_kg / 3600) */
  function bsaMosteller(heightCm, weightKg) {
    pos("height", heightCm);
    pos("weight", weightKg);
    return Math.sqrt((heightCm * weightKg) / 3600);
  }

  /** Du Bois D, Du Bois EF. Arch Intern Med. 1916;17:863-871.  0.007184 × W^0.425 × H^0.725 */
  function bsaDuBois(heightCm, weightKg) {
    pos("height", heightCm);
    pos("weight", weightKg);
    return 0.007184 * Math.pow(weightKg, 0.425) * Math.pow(heightCm, 0.725);
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * PET (Twardowski 1987) — 4-h D/P creatinine and D/D0 glucose
   * Twardowski ZJ, Nolph KD, Khanna R, et al. Peritoneal equilibration test.
   *   Perit Dial Bull. 1987;7:138-147. Bands as reproduced in Twardowski,
   *   Blood Purif. 1989;7:95-108 (mean ± 1 SD cut-offs, min–max range).
   * ═══════════════════════════════════════════════════════════════════════ */
  const PET_CR_BANDS = Object.freeze([
    { key: "low", label: "Low", lo: 0.34, hi: 0.49 },
    { key: "low-average", label: "Low-average", lo: 0.5, hi: 0.64 },
    { key: "high-average", label: "High-average", lo: 0.65, hi: 0.81 },
    { key: "high", label: "High", lo: 0.82, hi: 1.03 },
  ]);
  const PET_GLU_BANDS = Object.freeze([
    { key: "high", label: "High", lo: 0.12, hi: 0.25 },
    { key: "high-average", label: "High-average", lo: 0.26, hi: 0.38 },
    { key: "low-average", label: "Low-average", lo: 0.39, hi: 0.49 },
    { key: "low", label: "Low", lo: 0.5, hi: 0.61 },
  ]);

  // Published bands are reported to 2 decimals; a value between two bands
  // (e.g. 0.645) is assigned by rounding to 2 decimals first.
  function band(bands, x) {
    const r = Math.round(x * 100) / 100;
    for (const b of bands) if (r >= b.lo && r <= b.hi) return { band: b, outside: null };
    const sorted = bands.slice().sort((a, b) => a.lo - b.lo);
    if (r < sorted[0].lo) return { band: sorted[0], outside: "below" };
    return { band: sorted[sorted.length - 1], outside: "above" };
  }

  function petCategoryCr(dpCr) {
    pos("4-h D/P creatinine", dpCr);
    const { band: b, outside } = band(PET_CR_BANDS, dpCr);
    return { key: b.key, label: b.label, outside };
  }

  function petCategoryGlucose(dd0) {
    pos("4-h D/D0 glucose", dd0);
    const { band: b, outside } = band(PET_GLU_BANDS, dd0);
    return { key: b.key, label: b.label, outside };
  }

  /** Concordance between creatinine and glucose categories (same key). */
  function petConcordant(dpCr, dd0) {
    return petCategoryCr(dpCr).key === petCategoryGlucose(dd0).key;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Transport type only (no PET numbers) — typical values per category
   *  D/P creatinine: midpoint of the Twardowski 4-h band above
   *    (Twardowski, Blood Purif. 1989;7:95-108).
   *  PET drain volume: midpoint of the 4-h drain-volume range listed for the
   *    same transport class in Twardowski ZJ. The fast peritoneal equilibration
   *    test. Semin Dial. 1990;3:141-142 (2 L of 2.5% dextrose):
   *    Low 2651–3326, Low-average 2369–2650, High-average 2085–2367, High 1580–2084 mL.
   *  D/P urea: no published per-category value was found. Instead, when the
   *    patient's own D/P urea is not known, the published per-category urea MTAC
   *    below is used in the same Garred model (approved by Dr D, CONTENT_REVIEW §16).
   * ═══════════════════════════════════════════════════════════════════════ */

  /* Published typical-patient MTACs (mL/min) by transport type, estimated with
   * PD Adequest 2.0 in the TARGET cohort:
   *  urea:       Akonur A, Sloand J, Davis I, Leypoldt J. Perit Dial Int. 2016;36:79-84,
   *              doi:10.3747/pdi.2013.00081, Table 1: H 27.71, HA 23.14, LA 18.40, L 15.92.
   *  creatinine: Akonur A, Guest S, Sloand JA, Leypoldt JK. Perit Dial Int. 2013;33:646-654,
   *              doi:10.3747/pdi.2012.00261, Table 1: H 19.15, HA 11.92, LA 8.60
   *              (no Low value published → Low keeps the D/P-midpoint Garred method).
   * Used only when the patient's own D/P urea (or D/P creatinine) is not entered. */
  const ADEQUEST_TYPICAL_MTAC = Object.freeze({
    high: Object.freeze({ urea: 27.71, cr: 19.15 }),
    "high-average": Object.freeze({ urea: 23.14, cr: 11.92 }),
    "low-average": Object.freeze({ urea: 18.4, cr: 8.6 }),
    low: Object.freeze({ urea: 15.92, cr: null }),
  });
  // 0.4.3 (App Critic M7, approved by Dr D): no product name in the UI wording.
  const TYPICAL_LABEL = "typical-patient estimate from published parameters (Akonur et al. 2016), not measured";
  /** Akonur 2016 (PDI 36:79-84) Table 1: "typical patients with BSA between 1.7 and 2.0 m²". */
  const TYPICAL_BSA_RANGE = Object.freeze([1.7, 2.0]);
  const PET_DRAIN_BANDS_ML = Object.freeze({
    low: [2651, 3326],
    "low-average": [2369, 2650],
    "high-average": [2085, 2367],
    high: [1580, 2084],
  });

  function typicalPet(key) {
    const b = PET_CR_BANDS.find((x) => x.key === key);
    if (!b) throw new Error("unknown transport type");
    const d = PET_DRAIN_BANDS_ML[key];
    return {
      key: b.key,
      label: b.label,
      dpCr: Math.round(((b.lo + b.hi) / 2) * 1000) / 1000,
      drainMl: (d[0] + d[1]) / 2,
      fillL: TARGETS.PET_FILL_L,
      dpUrea: null,
      mtacUrea: ADEQUEST_TYPICAL_MTAC[key].urea,
      mtacCr: ADEQUEST_TYPICAL_MTAC[key].cr,
    };
  }

  /* Height and weight unit conversion (exact by definition:
   * 1 in = 2.54 cm; 1 lb = 0.45359237 kg). */
  /* ═══════════════════════════════════════════════════════════════════════
   * Input checks (0.4.3, App Critic M2/M3, approved by Dr D). Only hard blocks
   * for impossible or out-of-scope entries; no clinical plausibility ranges
   * (those are Dr D's call and are not set here).
   *  age < 18: Watson is an adult equation (KDOQI 2006 CPR 2.6 "in adults").
   *  feet > 8 or inches ≥ 12: not a height in ft + in (e.g. cm typed into feet).
   *  weight ≤ 0, height ≤ 0.
   *  D/P ≥ 1.0: the Garred model needs D/P < 1. A value > 1.5 is read as a
   *  percent slip and the /100 value is offered ("Did you mean 0.70?").
   * ═══════════════════════════════════════════════════════════════════════ */
  /**
   * 0.4.4 (App Critic re-check): height outside the recorded range of adult human height is
   * impossible and blocked, in cm and in ft + in. Guinness World Records: shortest adult ever
   * Chandra Bahadur Dangi 54.6 cm (26 Feb 2012); tallest man ever Robert Wadlow 272 cm
   * (27 Jun 1940). This is an impossible-value block only; amber plausibility ranges are
   * still Dr D's open question.
   */
  const HEIGHT_LIMITS_CM = Object.freeze({ min: 54.6, max: 272 });
  function checkPatient(o) {
    const errors = [];
    const hl = HEIGHT_LIMITS_CM;
    const outside = (cm) => isNum(cm) && cm > 0 && (cm < hl.min || cm > hl.max);
    if (isNum(o.age) && o.age < 18) errors.push({ field: "age", msg: "Adults only (18 years or older): the Watson volume equation is for adults." });
    if (o.hunit === "cm") {
      if (isNum(o.cm) && o.cm <= 0) errors.push({ field: "cm", msg: "Height must be more than 0 cm." });
      else if (outside(o.cm)) errors.push({ field: "cm", msg: "Height " + o.cm + " cm is outside the recorded range of adult height (54.6–272 cm). " + (o.cm > hl.max ? "Check for an extra digit or a value in mm." : "Entering inches? Switch height to ft + in.") });
    } else {
      const ftBad = isNum(o.ft) && (o.ft > 8 || o.ft < 0);
      const inBad = isNum(o.inch) && (o.inch >= 12 || o.inch < 0);
      if (ftBad) errors.push({ field: "ft", msg: "Feet must be between 0 and 8. Entering centimetres? Switch height to cm." });
      if (inBad) errors.push({ field: "inch", msg: "Inches must be 0 to 11.9." });
      if (!ftBad && !inBad && (isNum(o.ft) || isNum(o.inch))) {
        const cm = ((isNum(o.ft) ? o.ft : 0) * 12 + (isNum(o.inch) ? o.inch : 0)) * 2.54;
        if (cm <= 0) errors.push({ field: "ft", msg: "Height must be more than 0." });
        else if (outside(cm)) errors.push({ field: "ft", msg: "Height " + (Math.round(cm * 10) / 10) + " cm is outside the recorded range of adult height (54.6–272 cm, 1 ft 9.5 in to 8 ft 11.1 in)." });
      }
    }
    if (isNum(o.weight) && o.weight <= 0) errors.push({ field: "weight", msg: "Weight must be more than 0." });
    return errors;
  }
  /**
   * Lowest 4-h PET D/P the model accepts. DECIDED by Dr D, Nov 15 2026 (relayed by App Critic,
   * 7:26 AM ET): "D/P creatinine cutoff 0.40", "D/P urea cutoff 0.70" (full sign-off pending).
   * Earlier, 7:16 AM ET: "Block very low D/P with a 'below model range' message". Basis:
   *  - cr 0.40: Garred's volume-corrected form has zero diffusion at D/P = 1 − V0/Vt; with a 2.0 L
   *    fill and the top of the Twardowski Low drain band (3,326 mL; Twardowski, Semin Dial
   *    1990;3:141-142) that is 1 − 2000/3326 = 0.399, so lower D/P Cr cannot give a positive MTAC
   *    for every published Low drain volume.
   *  - urea 0.70: no published adult D/P urea floor; Twardowski's adult mean 0.91 ± 0.07 (as cited
   *    by Teixidó, Adv Perit Dial 1992;8:177-180) minus 3 SD (an inference, not a published band).
   */
  const DP_MODEL_MIN = Object.freeze({ cr: 0.40, urea: 0.70 });
  const DP_KEY = { "D/P creatinine": "cr", "D/P urea": "urea" };
  function belowModelMsg(label, x, min) {
    return label + " " + (+x).toFixed(2) + " is below model range (the estimate needs " + min.toFixed(2) + " or more at 4 h). At values this low the diffusion model gives clearance close to zero for every regimen, so no options, prescription summary or troubleshooting are shown. Check the PET result.";
  }
  function checkDp(x, label, key) {
    if (!isNum(x)) return null;
    if (x <= 0) return { block: true, msg: label + " must be more than 0." };
    const k = key || DP_KEY[label];
    if (k && x < DP_MODEL_MIN[k]) return { block: true, belowModel: true, min: DP_MODEL_MIN[k], msg: belowModelMsg(label, x, DP_MODEL_MIN[k]) };
    if (x > 1.5) {
      const s = x / 100;
      return { block: true, suggest: s < 1 ? Math.round(s * 100) / 100 : null, msg: label + " " + x + " is not a ratio." + (s < 1 ? " Did you mean " + (Math.round(s * 100) / 100).toFixed(2) + "?" : "") };
    }
    if (x >= 1.1) return { block: true, msg: label + " " + x + " is 1.1 or more; check the value (a D/P ratio is below 1)." };
    if (x >= 1.0) return { block: true, msg: label + " " + x + " is 1 or more. The Garred diffusion model needs D/P below 1, so no MTAC can be fitted; recheck the value or pick the transport type instead." };
    return null;
  }

  function ftInToCm(ft, inch) {
    const f = isNum(ft) ? ft : 0;
    const i = isNum(inch) ? inch : 0;
    if (!isNum(ft) && !isNum(inch)) throw new Error("height is required");
    if (f < 0 || i < 0) throw new Error("height cannot be negative");
    const cm = (f * 12 + i) * 2.54;
    return pos("height", cm);
  }
  function lbToKg(lb) {
    pos("weight", lb);
    return lb * 0.45359237;
  }

  /** PET net UF (mL) = drain − fill. */
  function petNetUfMl(fillL, drainMl) {
    pos("PET fill volume", fillL);
    pos("PET drain volume", drainMl);
    return drainMl - fillL * 1000;
  }

  /**
   * ISPD 2021 UF screen (Morelle J et al. Perit Dial Int. 2021;41:352-372.
   * doi:10.1177/0896860820982218). strength: "4.25" | "2.5" (dextrose %).
   */
  function petUfScreen(netUfMl, strength) {
    req("net UF", netUfMl);
    let threshold = null;
    if (strength === "4.25") threshold = TARGETS.PET_UF_MIN_425;
    else if (strength === "2.5") threshold = TARGETS.PET_UF_MIN_25;
    if (threshold === null) return { applicable: false, threshold: null, insufficient: null };
    return { applicable: true, threshold, insufficient: netUfMl < threshold };
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Garred simple model (volume-corrected form)
   * Garred LJ, Canaud B, Farrell PC. ASAIO J. 1983;6:131-137.
   * Form as written in Asghar RB, Diskin AM, Spanel P, Smith D, Davies SJ.
   *   Kidney Int. 2003;64:1911-1915. doi:10.1046/j.1523-1755.2003.00253.x
   *     MTAC = (V(td) / td) × ln[ V(0)·(P − D(0)) / ( V(td)·(P − D(td)) ) ]
   * Fresh dialysate contains no urea or creatinine, so D(0) = 0 and
   *     MTAC = (Vt / t) × ln[ V0 / ( Vt × (1 − D/P) ) ]
   * Waniewski J et al. Blood Purif. 1991;9:129-141: Garred is the F = 0 member
   *   of a family of simple models; "The differences between the simple models
   *   were small from the clinical point of view for urea, creatinine".
   * ═══════════════════════════════════════════════════════════════════════ */

  /** MTAC (mL/min) from one dwell. fillL, drainL in litres; minutes > 0; 0 < dp < 1. */
  function garredMtac(dp, fillL, drainL, minutes) {
    pos("D/P", dp);
    if (dp >= 1) throw new Error("D/P must be below 1 for the Garred model");
    pos("fill volume", fillL);
    pos("drain volume", drainL);
    pos("dwell time", minutes);
    const v0 = fillL * 1000;
    const vt = drainL * 1000;
    const arg = v0 / (vt * (1 - dp));
    if (arg <= 1) throw new Error("PET values give a non-positive MTAC (check D/P and drain volume)");
    return (vt / minutes) * Math.log(arg);
  }

  /**
   * Inverse of garredMtac: end-of-dwell D/P for a dwell of `minutes` with fill
   * fillL and end volume endL, given MTAC (mL/min). Same equation solved for D(td):
   *   D/P = 1 − (V0 / Vt) × exp(−MTAC × t / Vt)
   * Floored at 0 (the model can go negative for short dwells with net absorption).
   */
  function garredDp(mtac, fillL, endL, minutes) {
    pos("MTAC", mtac);
    pos("fill volume", fillL);
    pos("end volume", endL);
    pos("dwell time", minutes);
    const v0 = fillL * 1000;
    const vt = endL * 1000;
    const dp = 1 - (v0 / vt) * Math.exp((-mtac * minutes) / vt);
    return Math.max(0, dp);
  }

  /**
   * Lab loop: the MTAC that makes the same Garred regimen model reproduce a
   * measured 24-h peritoneal clearance (L/day) for the prescription the patient
   * is on. Bisection on MTAC in [0.1, 200] mL/min. Returns null if the measured
   * value is outside what the model can produce for that regimen.
   */
  function fitMtacToClearance(dwells, measuredLDay, which) {
    pos("measured clearance", measuredLDay);
    const f = (m) => {
      const p = predictDaily(dwells, which === "cr" ? null : m, which === "cr" ? m : null);
      return (which === "cr" ? p.crLDay : p.ureaLDay) - measuredLDay;
    };
    let lo = 0.1, hi = 200;
    if (f(lo) > 0 || f(hi) < 0) return null;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (f(mid) > 0) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Regimen → dwells
   * No dwell durations are assumed beyond the user's entries:
   *  CAPD: 24 h split equally across exchanges, or one long dwell of the
   *        entered length with the rest split equally.
   *  APD:  night dwell = (total therapy time − cycles × fill/drain time) / cycles;
   *        fill/drain time defaults to 0 (stated: this overstates dwell time).
   *        Last fill (day dwell) lasts 24 h − total therapy time unless entered.
   * ═══════════════════════════════════════════════════════════════════════ */

  function capdDwells(o) {
    const n = pos("exchanges", o.exchanges);
    if (!Number.isInteger(n)) throw new Error("exchanges must be a whole number");
    const fill = pos("fill volume", o.fillL);
    const uf = isNum(o.ufPerExchangeMl) ? o.ufPerExchangeMl : 0;
    const longUf = isNum(o.longDwellUfMl) ? o.longDwellUfMl : uf;
    const longFill = isNum(o.longFillL) && o.longFillL > 0 ? o.longFillL : fill;
    const dwells = [];
    if (isNum(o.longDwellH) && o.longDwellH > 0 && n >= 2) {
      if (o.longDwellH >= 24) throw new Error("long dwell must be shorter than 24 h");
      const rest = ((24 - o.longDwellH) * 60) / (n - 1);
      for (let i = 0; i < n - 1; i++) dwells.push({ kind: "exchange", fillL: fill, minutes: rest, ufMl: uf });
      dwells.push({ kind: "long", fillL: longFill, minutes: o.longDwellH * 60, ufMl: longUf });
    } else {
      const each = (24 * 60) / n;
      for (let i = 0; i < n; i++) dwells.push({ kind: "exchange", fillL: fill, minutes: each, ufMl: uf });
    }
    return dwells;
  }

  function apdDwells(o) {
    const n = pos("cycles", o.cycles);
    if (!Number.isInteger(n)) throw new Error("cycles must be a whole number");
    const fill = pos("fill volume", o.fillL);
    const ttt = pos("total therapy time", o.therapyH);
    if (ttt > 24) throw new Error("total therapy time must be 24 h or less");
    const overhead = isNum(o.fillDrainMin) && o.fillDrainMin > 0 ? o.fillDrainMin : 0;
    const nightMin = (ttt * 60 - n * overhead) / n;
    if (nightMin <= 0) throw new Error("fill/drain time leaves no dwell time");
    const uf = isNum(o.ufPerCycleMl) ? o.ufPerCycleMl : 0;
    const dwells = [];
    for (let i = 0; i < n; i++) dwells.push({ kind: "cycle", fillL: fill, minutes: nightMin, ufMl: uf });
    if (isNum(o.lastFillL) && o.lastFillL > 0) {
      const dayH = isNum(o.dayDwellH) && o.dayDwellH > 0 ? o.dayDwellH : 24 - ttt;
      // dayDwells 2 = last fill plus one manual midday exchange; the day is split equally
      // (e.g. 24 − 9 h = 15 h → 2 × 7.5 h). The entered long-dwell UF goes on the second
      // (midday) dwell only; the first counts net UF 0, like other short dwells.
      const nDay = o.dayDwells === 2 ? 2 : 1;
      if (dayH > 0) {
        for (let i = 0; i < nDay; i++) {
          dwells.push({
            kind: nDay === 2 ? (i === 0 ? "day" : "midday") : "day",
            fillL: o.lastFillL,
            minutes: (dayH * 60) / nDay,
            ufMl: i === nDay - 1 && isNum(o.lastFillUfMl) ? o.lastFillUfMl : 0,
          });
        }
      }
    }
    return dwells;
  }

  /**
   * Predicted daily peritoneal clearance (L/day) for urea and creatinine:
   *   Σ over dwells of D/P_end × drain volume   (drain = fill + net UF)
   * Same definition as a measured 24-h collection (KDOQI 2006 CPG 2 definitions:
   * "the total drained effluent volume ... adding ultrafiltration with the infused
   * dialysate volume").
   */
  function predictDaily(dwells, mtacUrea, mtacCr) {
    let ureaL = 0;
    let crL = 0;
    let drainL = 0;
    let instilledL = 0;
    const rows = dwells.map((d) => {
      const endL = d.fillL + (d.ufMl || 0) / 1000;
      if (endL <= 0) throw new Error("drain volume must be positive");
      const dpU = isNum(mtacUrea) ? garredDp(mtacUrea, d.fillL, endL, d.minutes) : null;
      const dpC = isNum(mtacCr) ? garredDp(mtacCr, d.fillL, endL, d.minutes) : null;
      if (dpU !== null) ureaL += dpU * endL;
      if (dpC !== null) crL += dpC * endL;
      drainL += endL;
      instilledL += d.fillL;
      return Object.assign({}, d, { endL, dpUrea: dpU, dpCr: dpC });
    });
    return {
      rows,
      ureaLDay: isNum(mtacUrea) ? ureaL : null,
      crLDay: isNum(mtacCr) ? crL : null,
      drainLDay: drainL,
      instilledLDay: instilledL,
      netUfMlDay: (drainL - instilledL) * 1000,
    };
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Standard regimen options (compared side by side)
   * Typical prescriptions: DeVita MV. Peritoneal dialysis modalities (ISPD North
   * American Chapter teaching slides, May 2011), CAPD section citing Daugirdas JT,
   * Blake PG, Ing TS. Handbook of Dialysis, 4th ed. 2006:
   *  CAPD "4 ( number of exchanges) x 2L ( dwell volumes) is the typical
   *    prescription. 4 x 2.5L in larger patients with small RRF or anuric patients
   *    who weigh >75 kg. 3 x 2L in smaller patients or in patients with good RRF."
   *  ADEMEX (Paniagua R et al. J Am Soc Nephrol. 2002;13:1307-1320) control arm:
   *    "four daily exchanges with 2 L of standard PD solution".
   *  CCPD (same slides): "3 to 7 cycles of 1.5 to 2.5 L delivered over 9 hours";
   *    "Cycle frequency- 3 to 5 cycles per 9 hour cycling session"; "Cycler dwell
   *    volumes - 2 to 2.5 L"; "Can start with NIPD if patient has good residual
   *    volume." Core Curriculum 2023 (Am J Kidney Dis): "Patients should not receive
   *    more than 5 exchanges per night on the cycler".
   *  Overnight CAPD long dwell 8 h; CCPD day dwell = 24 h − 9 h = 15 h.
   *  Extraneal (icodextrin 7.5%): one long dwell per day (label: "single daily
   *    exchange for the long (8- to 16-hour) dwell").
   * Icodextrin kinetics are NOT modeled: the Extraneal long dwell is the same
   * Garred diffusive dwell; any UF difference counts only if the user enters it.
   * Short dwells assume net UF 0 (UF is not predicted).
   * ═══════════════════════════════════════════════════════════════════════ */
  const REGIMEN_OPTIONS = Object.freeze([
    { id: "capd-3x2", mod: "capd", label: "CAPD 3 × 2.0 L", exchanges: 3, fillL: 2.0, longDwellH: 8 },
    { id: "capd-4x2", mod: "capd", label: "CAPD 4 × 2.0 L", exchanges: 4, fillL: 2.0, longDwellH: 8 },
    { id: "capd-4x2.5", mod: "capd", label: "CAPD 4 × 2.5 L", exchanges: 4, fillL: 2.5, longDwellH: 8 },
    { id: "ccpd-4x2-dry", mod: "ccpd", label: "CCPD 4 × 2.0 L, 9 h, dry day", cycles: 4, fillL: 2.0, therapyH: 9, lastFillL: 0 },
    { id: "ccpd-4x2-day", mod: "ccpd", label: "CCPD 4 × 2.0 L, 9 h + 2.0 L day dwell", cycles: 4, fillL: 2.0, therapyH: 9, lastFillL: 2.0 },
    { id: "ccpd-5x2-day", mod: "ccpd", label: "CCPD 5 × 2.0 L, 9 h + 2.0 L day dwell", cycles: 5, fillL: 2.0, therapyH: 9, lastFillL: 2.0 },
    { id: "ccpd-5x2.5-day", mod: "ccpd", label: "CCPD 5 × 2.5 L, 9 h + 2.0 L day dwell", cycles: 5, fillL: 2.5, therapyH: 9, lastFillL: 2.0 },
  ]);

  function optionDwells(opt, longUfMl) {
    const uf = isNum(longUfMl) ? longUfMl : 0;
    if (opt.mod === "capd") return capdDwells({ exchanges: opt.exchanges, fillL: opt.fillL, longDwellH: opt.longDwellH, longDwellUfMl: uf, ufPerExchangeMl: 0 });
    return apdDwells({ cycles: opt.cycles, fillL: opt.fillL, therapyH: opt.therapyH, lastFillL: opt.lastFillL, dayDwells: opt.dayDwells, lastFillUfMl: uf, ufPerCycleMl: 0 });
  }

  /**
   * Estimated weekly Kt/V (total) and CrCl for each standard option, each with a
   * dextrose long dwell and (where there is a long dwell) an Extraneal long dwell.
   * o: { mtacUrea, mtacCr, V, bsa, ktvRenal, rkfLDay, longUfDextroseMl, longUfIcodextrinMl }
   */
  function regimenOptions(o) {
    const out = [];
    const ktvR = isNum(o.ktvRenal) ? o.ktvRenal : 0;
    const rkfL = isNum(o.rkfLDay) ? o.rkfLDay : 0;
    const est = (opt, ufMl) => {
      const p = predictDaily(optionDwells(opt, ufMl), o.mtacUrea, o.mtacCr);
      const ktvP = isNum(p.ureaLDay) && isNum(o.V) && o.V > 0 ? weeklyKtv(p.ureaLDay, o.V) : null;
      return {
        ktvP,
        ktv: isNum(ktvP) ? ktvP + ktvR : null,
        crcl: isNum(p.crLDay) && isNum(o.bsa) && o.bsa > 0 ? weeklyCrCl173(p.crLDay + rkfL, o.bsa) : null,
      };
    };
    for (const opt of REGIMEN_OPTIONS) {
      const hasLong = opt.mod === "capd" || opt.lastFillL > 0;
      out.push(Object.assign({ id: opt.id, mod: opt.mod, label: opt.label, longSolution: hasLong ? "dextrose" : null }, est(opt, o.longUfDextroseMl)));
      if (hasLong) out.push(Object.assign({ id: opt.id + "-ico", mod: opt.mod, label: opt.label, longSolution: "icodextrin" }, est(opt, o.longUfIcodextrinMl)));
    }
    return out;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Candidate set for the "Top 3" ranking (redesign agreed with Dr D)
   * Same dwell rules and same Garred model as REGIMEN_OPTIONS; only the grid
   * is wider. Judgment to confirm (CONTENT_REVIEW §13):
   *  CAPD 3, 4, 5 exchanges × 2.0 / 2.5 / 3.0 L, 8-h overnight long dwell
   *    (3.0 L and 5 exchanges go beyond the Handbook quote in REGIMEN_OPTIONS).
   *  CCPD 4, 5 cycles × 2.0 / 2.5 L over 9 h, dry day or 2.0 L day dwell (15 h)
   *    (Core Curriculum 2023: no more than 5 exchanges per night).
   *  Every option with a long dwell also has an Extraneal variant (icodextrin
   *    NOT modeled: identical unless the user enters a long-dwell UF).
   * ═══════════════════════════════════════════════════════════════════════ */
  // 0.4.4 (Dr D, Nov 15 2026: "Fill can be as small as 1 l"): fills from 1.0 L, in 0.25 L
  // steps below 2.0 L, for CAPD exchanges and CCPD night fills. Still capped per patient at
  // 1.5 L/m² BSA + 0.05 L (FILL_CAP). Ids and labels of the 2.0 / 2.5 / 3.0 L options unchanged.
  const SMALL_FILLS = Object.freeze([1.0, 1.25, 1.5, 1.75]);
  const CANDIDATE_FILLS = Object.freeze(SMALL_FILLS.concat([2.0, 2.5, 3.0]));
  /** Volume text: 1.0, 1.25, 1.5, 1.75, 2.0 … (two decimals only when needed). */
  function fmtL(v) {
    return Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? v.toFixed(1) : v.toFixed(2);
  }
  const CANDIDATE_OPTIONS = Object.freeze(
    (function () {
      const out = [];
      [3, 4, 5].forEach((n) =>
        CANDIDATE_FILLS.forEach((f) =>
          out.push(Object.freeze({ id: "capd-" + n + "x" + fmtL(f), mod: "capd", label: "CAPD " + n + " × " + fmtL(f) + " L", exchanges: n, fillL: f, longDwellH: 8 }))
        )
      );
      // CCPD (0.4.1, approved by Dr D because no 9-h, ≤ 2.5 L option reached Kt/V 1.7 for the
      // example patient): 4–5 cycles × 2.0 / 2.5 / 3.0 L, 9 / 10 / 11 h on the cycler, with
      //   dry day | one 2.0 L day dwell (24 h − cycler time) |
      //   midday exchange: last fill + one manual exchange, 2 × 2.0 L or 2 × 2.5 L,
      //   the day split equally (9 h → 2 × 7.5 h; 10 h → 2 × 7 h; 11 h → 2 × 6.5 h).
      // Midday split: Akonur 2016 Figs 4-5 APD rows "…+2x2L" (last fill plus one daytime
      // exchange) and Akonur 2013 Table 3 "midday exch" column. Fills above 1.5 L/m² BSA are
      // excluded per patient (FILL_CAP, 0.4.2). Judgment to confirm (CONTENT_REVIEW §23-24).
      const DAYS = [
        { key: "dry", lastFillL: 0, dayDwells: 0 },
        { key: "day", lastFillL: 2.0, dayDwells: 1 },
        { key: "mid2.0", lastFillL: 2.0, dayDwells: 2 },
        { key: "mid2.5", lastFillL: 2.5, dayDwells: 2 },
      ];
      const ccpd = (h, d, n, f) => {
        const dayH = 24 - h;
        const dayTxt =
          d.dayDwells === 0
            ? ", dry day"
            : d.dayDwells === 1
            ? " + " + fmtL(d.lastFillL) + " L day dwell"
            : " + midday exchange (2 × " + fmtL(d.lastFillL) + " L day dwells, " + String(dayH / 2) + " h each)";
        return Object.freeze({
          // 9-h ids unchanged from 0.4.0 (ccpd-5x2.5-day etc.)
          id: "ccpd-" + n + "x" + fmtL(f) + (h === 9 ? "" : "-" + h + "h") + "-" + d.key,
          mod: "ccpd",
          label: "CCPD " + n + " × " + fmtL(f) + " L, " + h + " h" + dayTxt,
          cycles: n,
          fillL: f,
          therapyH: h,
          lastFillL: d.lastFillL,
          dayDwells: d.dayDwells,
          midday: d.dayDwells === 2,
        });
      };
      [9, 10, 11].forEach((h) => DAYS.forEach((d) => [4, 5].forEach((n) => [2.0, 2.5, 3.0].forEach((f) => out.push(ccpd(h, d, n, f))))));
      // Night fills below 2.0 L (0.4.4) pair with day volumes equal to the night fill
      // (dry | one day dwell | midday 2 × fill), so a small patient's day dwells also fit
      // under the cap. Judgment to confirm (CONTENT_REVIEW §26).
      const SMALL_DAYS = (f) => [
        { key: "dry", lastFillL: 0, dayDwells: 0 },
        { key: "day", lastFillL: f, dayDwells: 1 },
        { key: "mid", lastFillL: f, dayDwells: 2 },
      ];
      [9, 10, 11].forEach((h) => SMALL_FILLS.forEach((f) => SMALL_DAYS(f).forEach((d) => [4, 5].forEach((n) => out.push(ccpd(h, d, n, f))))));
      return out;
    })()
  );

  /**
   * Burden order (lower = less burdensome), compared left to right:
   *  CAPD: exchanges/day, then fill volume.
   *  CCPD: midday manual exchange (no before yes), then dry day before a day dwell,
   *    then cycler time (9 < 10 < 11 h), then cycles, then night fill volume, then
   *    day-dwell volume.
   */
  function burdenKey(opt) {
    if (opt.mod === "capd") return [opt.exchanges, opt.fillL];
    return [opt.dayDwells === 2 ? 1 : 0, opt.lastFillL > 0 ? 1 : 0, opt.therapyH || 9, opt.cycles, opt.fillL, opt.lastFillL || 0];
  }
  function cmpKey(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Fill-volume cap (0.4.2, Dr D's decision): every fill — CAPD exchanges, CCPD
   * night fills, day dwells, midday exchanges — at most 1.5 L/m² BSA (Mosteller),
   * with a 0.05 L tolerance for rounding (fill ≤ 1.5 × BSA + 0.05 L).
   *  Teitelbaum I. Crafting the prescription for patients starting peritoneal dialysis.
   *    Clin J Am Soc Nephrol. 2018;13(3):483-485 (PMC5967680): "Patients are generally
   *    able to tolerate intraperitoneal volumes of 1.25–1.5 L/m2 BSA."
   *  Auguste BL, Bargman JM. Core Curriculum 2023. Am J Kidney Dis. 2023;81(1):100-109:
   *    "an IPP of greater than 18 cm of H2O is usually associated with discomfort."
   *  ISPD 2020 (Brown EA et al.) gives no numeric fill limit.
   * ═══════════════════════════════════════════════════════════════════════ */
  const FILL_CAP = Object.freeze({ lPerM2: 1.5, toleranceL: 0.05 });
  /** Largest allowed fill (L) for a BSA, before tolerance. */
  function maxFillL(bsa) {
    return isNum(bsa) && bsa > 0 ? FILL_CAP.lPerM2 * bsa : null;
  }
  /** Largest single fill in an option (night fill, exchange, day dwell or midday exchange). */
  function optionMaxFillL(opt) {
    return Math.max(opt.fillL || 0, opt.longFillL || 0, opt.lastFillL || 0);
  }
  /** true when every fill is within 1.5 × BSA + 0.05 L (or BSA unknown). */
  function withinFillCap(opt, bsa) {
    const m = maxFillL(bsa);
    if (!isNum(m)) return true;
    return optionMaxFillL(opt) <= m + FILL_CAP.toleranceL + 1e-9;
  }

  /** Same estimate as regimenOptions, over any option list (default: CANDIDATE_OPTIONS). */
  function candidateOptions(o, list) {
    const opts = list || CANDIDATE_OPTIONS;
    const out = [];
    const ktvR = isNum(o.ktvRenal) ? o.ktvRenal : 0;
    const rkfL = isNum(o.rkfLDay) ? o.rkfLDay : 0;
    const est = (opt, ufMl) => {
      const p = predictDaily(optionDwells(opt, ufMl), o.mtacUrea, o.mtacCr);
      const ktvP = isNum(p.ureaLDay) && isNum(o.V) && o.V > 0 ? weeklyKtv(p.ureaLDay, o.V) : null;
      return {
        ktvP,
        ktvR,
        ktv: isNum(ktvP) ? ktvP + ktvR : null,
        crcl: isNum(p.crLDay) && isNum(o.bsa) && o.bsa > 0 ? weeklyCrCl173(p.crLDay + rkfL, o.bsa) : null,
      };
    };
    for (const opt of opts) {
      // Extraneal only where there is ONE long dwell: the split midday dwells (6.5–7.5 h)
      // are shorter than the labelled 8–16-h long dwell and have no published icodextrin UF.
      const hasLong = opt.mod === "capd" || (opt.lastFillL > 0 && opt.dayDwells !== 2);
      const hasDay = opt.mod === "ccpd" && opt.lastFillL > 0;
      const base = { baseId: opt.id, mod: opt.mod, label: opt.label, opt, burden: burdenKey(opt), overCap: o.fillCap === false ? false : !withinFillCap(opt, o.bsa) };
      // Predicted UF (optional): o.ufFn(opt, longSolution) → { dailyUfMl, ... } from js/threepore.js.
      // Kt/V deliberately does NOT use the predicted UF (it stays the Garred estimate with
      // short-dwell UF 0 and the long-dwell UF the user enters), so an experimental UF
      // prediction never changes the clearance ranking.
      const uf = (sol) => (typeof o.ufFn === "function" ? o.ufFn(opt, sol) : null);
      out.push(Object.assign({ id: opt.id }, base, { longSolution: hasLong || hasDay ? "dextrose" : null, uf: uf(hasLong || hasDay ? "dextrose" : null) }, est(opt, o.longUfDextroseMl)));
      if (hasLong) out.push(Object.assign({ id: opt.id + "-ico" }, base, { longSolution: "icodextrin", uf: uf("icodextrin") }, est(opt, o.longUfIcodextrinMl)));
    }
    return out;
  }

  /**
   * Rank one modality's rows and return the top n.
   *  Metric: total weekly Kt/V when every row has one; otherwise weekly CrCl
   *  (L/week/1.73 m²) — e.g. transport type only, no D/P urea.
   *  Targets: Kt/V ≥ ktvTarget (default 1.7, KDOQI 2006 CPG 2.1.1);
   *    CrCl ≥ crclTarget (default 60, the historical KDOQI/ADEMEX CAPD figure).
   *  Dextrose and Extraneal variants of one regimen count once: the dextrose
   *    row unless only the Extraneal row meets target (or, below target, is higher).
   *  Order: rows meeting target first, least burdensome first (ties: higher
   *    metric); then rows below target, highest metric first.
   */
  function rankOptions(rows, opts) {
    const o = opts || {};
    const ktvTarget = isNum(o.ktvTarget) ? o.ktvTarget : TARGETS.KTV_HISTORICAL_MIN;
    const crclTarget = isNum(o.crclTarget) ? o.crclTarget : TARGETS.CRCL_HISTORICAL_CAPD;
    const n = isNum(o.n) ? o.n : 3;
    // Options above the fill cap (overCap) are never ranked.
    const list = (rows || []).filter((r) => (!o.mod || r.mod === o.mod) && !r.overCap);
    if (!list.length) return { metric: null, target: null, top: [], meetCount: 0, anyMeet: false, all: [] };
    const metric = list.every((r) => isNum(r.ktv)) ? "ktv" : list.every((r) => isNum(r.crcl)) ? "crcl" : null;
    if (!metric) return { metric: null, target: null, top: [], meetCount: 0, anyMeet: false, all: [] };
    const target = metric === "ktv" ? ktvTarget : crclTarget;
    const val = (r) => r[metric];
    const byBase = new Map();
    list.forEach((r) => {
      const e = Object.assign({}, r, { value: val(r), meets: val(r) >= target - 1e-9 });
      const prev = byBase.get(r.baseId);
      if (!prev) return byBase.set(r.baseId, e);
      const better = (e.meets && !prev.meets) || (e.meets === prev.meets && !prev.meets && e.value > prev.value + 1e-9);
      if (better) byBase.set(r.baseId, e);
    });
    const uniq = Array.from(byBase.values());
    const meet = uniq.filter((r) => r.meets).sort((a, b) => cmpKey(a.burden, b.burden) || b.value - a.value);
    const below = uniq.filter((r) => !r.meets).sort((a, b) => b.value - a.value || cmpKey(a.burden, b.burden));
    const all = meet.concat(below);
    return { metric, target, top: all.slice(0, n), meetCount: meet.length, anyMeet: meet.length > 0, all };
  }

  /* ═══════════════════════════════════════════════════════════════════════
   * Measured clearances (24-h collections) — KDOQI 2006 CPG 2 definitions
   *   Peritoneal Kt (L/day) = (D_urea / P_urea) × 24-h drain volume
   *   Renal urea clearance (L/day) = (U_urea / P_urea) × 24-h urine volume
   *   Weekly Kt/V = 7 × (Kt_p + Kt_r) / V
   *   RKF for CrCl = mean of renal urea and creatinine clearance
   *   ("RKF ... measured as the average of CCr and urea nitrogen clearance")
   *   CrCl L/week/1.73 m² = 7 × L/day × 1.73 / BSA
   * ═══════════════════════════════════════════════════════════════════════ */

  function clearanceLDay(conc, plasma, volumeL) {
    req("concentration", conc);
    pos("plasma concentration", plasma);
    req("volume", volumeL);
    if (conc < 0 || volumeL < 0) throw new Error("values cannot be negative");
    return (conc / plasma) * volumeL;
  }

  function weeklyKtv(ktLDay, vL) {
    req("Kt", ktLDay);
    pos("V", vL);
    return (7 * ktLDay) / vL;
  }

  function weeklyCrCl173(lDay, bsa) {
    req("clearance", lDay);
    pos("BSA", bsa);
    return (7 * lDay * TARGETS.BSA_REF) / bsa;
  }

  /** Residual kidney function from a 24-h urine. Units of U and P must match. */
  function residual(o) {
    const urineL = req("urine volume", o.urineMl) / 1000;
    const ureaLDay = clearanceLDay(o.urineUrea, o.plasmaUrea, urineL);
    const out = { urineL, ureaLDay, crLDay: null, rkfLDay: null, ureaMlMin: (ureaLDay * 1000) / 1440 };
    if (isNum(o.urineCr) && isNum(o.plasmaCr)) {
      out.crLDay = clearanceLDay(o.urineCr, o.plasmaCr, urineL);
      out.rkfLDay = 0.5 * (ureaLDay + out.crLDay);
      out.rkfMlMin = (out.rkfLDay * 1000) / 1440;
    }
    out.significant = o.urineMl > TARGETS.RKF_URINE_SIGNIFICANT_ML;
    return out;
  }

  /** Informational comparison with the KDOQI 2006 minimum; never pass/fail. */
  function ktvReading(total) {
    req("Kt/V", total);
    return total >= TARGETS.KTV_HISTORICAL_MIN
      ? { state: "ok", text: "At or above the KDOQI 2006 minimum of 1.7" }
      : { state: "warn", text: "Below the KDOQI 2006 minimum of 1.7" };
  }

  const F = {
    isNum,
    TARGETS,
    PET_CR_BANDS,
    PET_GLU_BANDS,
    watsonV,
    humeWeyersV,
    bsaMosteller,
    bsaDuBois,
    petCategoryCr,
    petCategoryGlucose,
    petConcordant,
    PET_DRAIN_BANDS_ML,
    ADEQUEST_TYPICAL_MTAC,
    TYPICAL_LABEL,
    TYPICAL_BSA_RANGE,
    checkPatient,
    checkDp,
    DP_MODEL_MIN,
    belowModelMsg,
    typicalPet,
    fitMtacToClearance,
    ftInToCm,
    lbToKg,
    REGIMEN_OPTIONS,
    optionDwells,
    FILL_CAP,
    maxFillL,
    optionMaxFillL,
    withinFillCap,
    regimenOptions,
    CANDIDATE_OPTIONS,
    CANDIDATE_FILLS,
    HEIGHT_LIMITS_CM,
    SMALL_FILLS,
    fmtL,
    burdenKey,
    candidateOptions,
    rankOptions,
    petNetUfMl,
    petUfScreen,
    garredMtac,
    garredDp,
    capdDwells,
    apdDwells,
    predictDaily,
    clearanceLDay,
    weeklyKtv,
    weeklyCrCl173,
    residual,
    ktvReading,
  };
  global.PdFormulas = F;
  if (typeof module !== "undefined" && module.exports) module.exports = F;
})(typeof globalThis !== "undefined" ? globalThis : this);

/**
 * PD Buddy — formulas. Pure functions, no DOM, no storage, no network.
 *
 * Every constant below carries its source. Nothing here reproduces any
 * proprietary kinetic-modeling program. The regimen estimate uses the
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
      if (dayH > 0) {
        dwells.push({
          kind: "day",
          fillL: o.lastFillL,
          minutes: dayH * 60,
          ufMl: isNum(o.lastFillUfMl) ? o.lastFillUfMl : 0,
        });
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

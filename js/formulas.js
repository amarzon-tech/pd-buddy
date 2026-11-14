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

  /* ═══════════════════════════════════════════════════════════════════════
   * Transport type only (no PET numbers) — typical values per category
   *  D/P creatinine: midpoint of the Twardowski 4-h band above
   *    (Twardowski, Blood Purif. 1989;7:95-108).
   *  PET drain volume: midpoint of the 4-h drain-volume range listed for the
   *    same transport class in Twardowski ZJ. The fast peritoneal equilibration
   *    test. Semin Dial. 1990;3:141-142 (2 L of 2.5% dextrose):
   *    Low 2651–3326, Low-average 2369–2650, High-average 2085–2367, High 1580–2084 mL.
   *  D/P urea: NO published per-category value was found, so none is used.
   *    Kt/V is therefore not estimated from transport type alone.
   * ═══════════════════════════════════════════════════════════════════════ */
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
    };
  }

  /* Height and weight unit conversion (exact by definition:
   * 1 in = 2.54 cm; 1 lb = 0.45359237 kg). */
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
    return apdDwells({ cycles: opt.cycles, fillL: opt.fillL, therapyH: opt.therapyH, lastFillL: opt.lastFillL, lastFillUfMl: uf, ufPerCycleMl: 0 });
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
  const CANDIDATE_OPTIONS = Object.freeze(
    (function () {
      const out = [];
      [3, 4, 5].forEach((n) =>
        [2.0, 2.5, 3.0].forEach((f) =>
          out.push(Object.freeze({ id: "capd-" + n + "x" + f.toFixed(1), mod: "capd", label: "CAPD " + n + " × " + f.toFixed(1) + " L", exchanges: n, fillL: f, longDwellH: 8 }))
        )
      );
      [false, true].forEach((day) =>
        [4, 5].forEach((n) =>
          [2.0, 2.5].forEach((f) =>
            out.push(
              Object.freeze({
                id: "ccpd-" + n + "x" + f.toFixed(1) + (day ? "-day" : "-dry"),
                mod: "ccpd",
                label: "CCPD " + n + " × " + f.toFixed(1) + " L, 9 h" + (day ? " + 2.0 L day dwell" : ", dry day"),
                cycles: n,
                fillL: f,
                therapyH: 9,
                lastFillL: day ? 2.0 : 0,
              })
            )
          )
        )
      );
      return out;
    })()
  );

  /**
   * Burden order (lower = less burdensome), compared left to right:
   *  CAPD: exchanges/day, then fill volume.
   *  CCPD: dry day before a day dwell, then cycles, then fill volume.
   */
  function burdenKey(opt) {
    if (opt.mod === "capd") return [opt.exchanges, opt.fillL];
    return [opt.lastFillL > 0 ? 1 : 0, opt.cycles, opt.fillL];
  }
  function cmpKey(a, b) {
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const d = (a[i] || 0) - (b[i] || 0);
      if (d !== 0) return d;
    }
    return 0;
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
      const hasLong = opt.mod === "capd" || opt.lastFillL > 0;
      const base = { baseId: opt.id, mod: opt.mod, label: opt.label, opt, burden: burdenKey(opt) };
      out.push(Object.assign({ id: opt.id }, base, { longSolution: hasLong ? "dextrose" : null }, est(opt, o.longUfDextroseMl)));
      if (hasLong) out.push(Object.assign({ id: opt.id + "-ico" }, base, { longSolution: "icodextrin" }, est(opt, o.longUfIcodextrinMl)));
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
    const list = (rows || []).filter((r) => !o.mod || r.mod === o.mod);
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
    typicalPet,
    ftInToCm,
    lbToKg,
    REGIMEN_OPTIONS,
    optionDwells,
    regimenOptions,
    CANDIDATE_OPTIONS,
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

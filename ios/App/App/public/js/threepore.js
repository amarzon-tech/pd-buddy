/**
 * PD Buddy — open three-pore model (TPM) of peritoneal fluid transport.
 * Written from published equations only (no code copied from any program):
 *
 *  Volume (Öberg CM, Rippe B. Kidney Int Rep. 2017;2:943-951, eq. 1, 10-12;
 *          Bergling K. Lund University doctoral thesis 2023, eq. 9-12):
 *    dV/dt = Jv,C + Jv,S + Jv,L − L
 *    Jv,i  = α_i · LpS · af(V) · [ ΔP − σ_prot,i·Δπ − RT Σ_s φ_s σ_i,s (C_P,s − C_D,s) ]
 *  Solute (Patlak; Öberg & Rippe 2017 eq. 2, 8-9; Bergling eq. 13-15):
 *    J_s,S = Jv,S (1 − σ_S) (C_P − C_D e^(−Pe)) / (1 − e^(−Pe)),  Pe = Jv,S(1 − σ_S)/PS
 *    J_s,L = Jv,L · C_P (large pores, σ ≈ 0 for small solutes); lymph removes L · C_D
 *    d(V·C_D)/dt = J_s,S + J_s,L − L·C_D
 *  Area factor (Keshaviah 1994, as written in Öberg & Rippe 2017 eq. 13):
 *    af = 16.18·(1 − e^(−0.00077·V))/13.3187   applied to every PS and to LpS
 *
 * Constants and sources:
 *  α_S 0.90, α_L 0.08, α_C 0.02 ............ Öberg & Rippe 2017 Table 1
 *  σ glucose: small 0.028, large 0.0010, AQP 1.0;  σ albumin: small 0.950,
 *    large 0.085, AQP 1 .................... Rippe B, Davies S. Perit Dial Int. 2011;31:249-258, Table 2
 *  Δπ protein 22 mmHg; φ Na⁺+anion 0.93; dialysate Na 132 mmol/L;
 *    plasma urea 20 mmol/L, glucose 6.5 mmol/L .. Öberg & Rippe 2017 Table 1
 *  PS Na⁺ 4.5 mL/min at A0/Δx 25,000 cm, "scaled according to A0/Δx" .. Öberg & Rippe 2017 Table 1
 *  ΔP 8 mmHg ("about 8 or 9 mmHg") ........ Bergling 2023 thesis p. 20
 *  RT 19.3 mmHg per mmol/L ................. Bergling 2023 thesis p. 20 (van 't Hoff)
 *  Plasma Na 137 mmol/L .................... Akonur 2013 (Perit Dial Int 33:646-654, doi:10.3747/pdi.2012.00261) simulation setting
 *  Per transport type LPA, MTAC glucose/urea, A0/dX: Akonur A, Sloand J, Davis I, Leypoldt J. Perit Dial Int. 2016;36:79-84,
 *    doi:10.3747/pdi.2013.00081, Table 1 (PD Adequest 2.0 estimates, TARGET cohort, BSA 1.7–2.0 m²).
 *  Fluid absorption 0.6 mL/min and residual volume 10% of fill: PD Adequest 2.0
 *    defaults (Vonesh EF et al. Perit Dial Int. 1999;19:556-571, Appendix).
 *
 * Simplifications (CONTENT_REVIEW): small-pore σ for urea and Na⁺ set to 0
 * (Rippe 2008: small-solute σ < 0.1); creatinine ignored osmotically; plasma
 * concentrations constant; instant fill and drain; ΔP constant.
 * Icodextrin is NOT simulated here (fraction composition not published); the app
 * shows the published Akonur 2016 Table 3 values for Extraneal long dwells instead.
 */
(function (global) {
  "use strict";

  const TPM = Object.freeze({
    alphaS: 0.9, alphaL: 0.08, alphaC: 0.02,
    sigGluS: 0.028, sigGluL: 0.001, sigGluC: 1.0,
    sigProtS: 0.95, sigProtL: 0.085, sigProtC: 1.0,
    dPi: 22, dP: 8, RT: 19.3, phiNa: 0.93,
    naDial: 132, naPlasma: 137, ureaPlasma: 20, gluPlasma: 6.5,
    psNaRef: 4.5, a0dxRef: 25000,
    lymph: 0.6, residualFrac: 0.1,
  });

  // Glucose concentration of fresh dialysate, mmol/L. 1.36% and 3.86% anhydrous glucose
  // (1.5% and 4.25% dextrose monohydrate): 75.49 and 214.25 mmol/L (Morelle J et al.
  // J Am Soc Nephrol. 2018;29:1875-1886, solution table). 2.27% (2.5% monohydrate):
  // 22.7 g/L ÷ 180.16 g/mol = 126.0 mmol/L (molar mass of glucose).
  const GLUCOSE_MMOL = Object.freeze({ "1.5": 75.49, "2.5": 126.0, "4.25": 214.25 });

  /* Per transport type membrane parameters — Akonur 2016 Table 1 (verbatim). */
  const TYPE_PARAMS = Object.freeze({
    high: { lpa: 0.0575, a0dx: 40398, mtacGlu: 16.34, mtacUrea: 27.71 },
    "high-average": { lpa: 0.056, a0dx: 29362, mtacGlu: 11.71, mtacUrea: 23.14 },
    "low-average": { lpa: 0.0563, a0dx: 21942, mtacGlu: 8.35, mtacUrea: 18.4 },
    low: { lpa: 0.0554, a0dx: 16402, mtacGlu: 5.96, mtacUrea: 15.92 },
  });

  function areaFactor(vMl) {
    return (16.18 * (1 - Math.exp(-0.00077 * vMl))) / 13.3187;
  }

  // Patlak small-pore flux; tends to diffusion PS(C_P − C_D) as Jv → 0.
  function patlak(jv, sigma, ps, cp, cd) {
    const conv = jv * (1 - sigma);
    if (ps <= 0) return conv > 0 ? conv * cp : conv * cd;
    const pe = conv / ps;
    if (Math.abs(pe) < 1e-6) return ps * (cp - cd) + conv * (cp + cd) / 2;
    const e = Math.exp(-pe);
    return (conv * (cp - cd * e)) / (1 - e);
  }

  /**
   * Simulate one dwell. p: membrane params {lpa, a0dx, mtacGlu, mtacUrea};
   * o: { fillMl, residualMl, minutes, glucoseMmol, startResidual: {glu, urea, na} | null,
   *      lymph, dP }. Returns { ufMl, endVolMl, drainMl, gluAbsorbedG, naRemovedMmol, end: {glu, urea, na} }.
   */
  function simulateDwell(p, o) {
    const c = TPM;
    const L = Number.isFinite(o.lymph) ? o.lymph : c.lymph;
    const dP = Number.isFinite(o.dP) ? o.dP : c.dP;
    const vr = o.residualMl;
    const r0 = o.startResidual || { glu: c.gluPlasma, urea: c.ureaPlasma, na: c.naPlasma };
    const v0 = o.fillMl + vr;
    let V = v0;
    let G = (o.fillMl * o.glucoseMmol + vr * r0.glu) / v0;
    let U = (vr * r0.urea) / v0;
    let N = (o.fillMl * c.naDial + vr * r0.na) / v0;
    const psNa = c.psNaRef * (p.a0dx / c.a0dxRef);
    const gluIn = o.fillMl * o.glucoseMmol + vr * r0.glu;
    const naIn = o.fillMl * c.naDial + vr * r0.na;

    // Time-dependent MTAC (Vonesh 1999 Appendix eq. A7): KPA(t) = KPA × [1 + 0.66·exp(−0.02·t)],
    // t = minutes since fill; KPA is the steady-state MTAC (~2 h after infusion).
    // "per-exchange" = eq. A8 (evaluated once at t_dwell, as PD Adequest does); "none" = constant.
    const mtacMode = o.mtacTime || "continuous";
    const fDwell = mtacMode === "none" ? 1 : 1 + 0.66 * Math.exp(-0.02 * o.minutes);
    let tNow = 0;
    function deriv(V, G, U, N) {
      const af = areaFactor(V) * (mtacMode === "continuous" ? 1 + 0.66 * Math.exp(-0.02 * tNow) : fDwell);
      const lps = p.lpa * areaFactor(V);
      // Crystalloid osmotic difference C_P − C_D weighted by σ for each pathway
      const dG = c.gluPlasma - G, dU = c.ureaPlasma - U, dN = 2 * c.phiNa * (c.naPlasma - N);
      const oncS = c.sigProtS * c.dPi, oncL = c.sigProtL * c.dPi, oncC = c.sigProtC * c.dPi;
      const jvC = c.alphaC * lps * (dP - oncC - c.RT * (c.sigGluC * dG + dU + dN));
      const jvS = c.alphaS * lps * (dP - oncS - c.RT * (c.sigGluS * dG));
      const jvL = c.alphaL * lps * (dP - oncL - c.RT * (c.sigGluL * dG));
      const dV = jvC + jvS + jvL - L;
      const jG = patlak(jvS, c.sigGluS, p.mtacGlu * af, c.gluPlasma, G) + jvL * c.gluPlasma - L * G;
      const jU = patlak(jvS, 0, p.mtacUrea * af, c.ureaPlasma, U) + jvL * c.ureaPlasma - L * U;
      const jN = patlak(jvS, 0, psNa * af, c.naPlasma, N) + jvL * c.naPlasma - L * N;
      // d(VC)/dt = J  →  dC/dt = (J − C dV/dt)/V
      return [dV, (jG - G * dV) / V, (jU - U * dV) / V, (jN - N * dV) / V];
    }

    const dt = 1; // min, RK4
    const steps = Math.max(1, Math.round(o.minutes / dt));
    const h = o.minutes / steps;
    for (let i = 0; i < steps; i++) {
      tNow = i * h;
      const k1 = deriv(V, G, U, N);
      const k2 = deriv(V + (h / 2) * k1[0], G + (h / 2) * k1[1], U + (h / 2) * k1[2], N + (h / 2) * k1[3]);
      const k3 = deriv(V + (h / 2) * k2[0], G + (h / 2) * k2[1], U + (h / 2) * k2[2], N + (h / 2) * k2[3]);
      const k4 = deriv(V + h * k3[0], G + h * k3[1], U + h * k3[2], N + h * k3[3]);
      V += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
      G += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
      U += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
      N += (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
      if (V < vr * 0.5) V = vr * 0.5; // cannot absorb below half the residual volume
    }
    const drain = V - vr;
    return {
      ufMl: V - v0,
      endVolMl: V,
      drainMl: drain,
      gluAbsorbedG: ((gluIn - (drain * G + vr * G)) * 180.16) / 1e6,
      naRemovedMmol: (drain * N + vr * N - naIn) / 1000,
      end: { glu: G, urea: U, na: N },
    };
  }

  /**
   * Simulate a sequence of dwells (one treatment period), carrying the residual
   * volume composition from each drain into the next fill.
   * dwells: [{ fillMl, minutes, glucoseMmol }]
   */
  function simulateSequence(p, dwells, opts) {
    const o = opts || {};
    let carry = null;
    let uf = 0, glu = 0, na = 0;
    const rows = dwells.map((d) => {
      const vr = Number.isFinite(o.residualMl) ? o.residualMl : TPM.residualFrac * d.fillMl;
      const r = simulateDwell(p, { fillMl: d.fillMl, residualMl: vr, minutes: d.minutes, glucoseMmol: d.glucoseMmol, startResidual: carry, lymph: o.lymph, dP: o.dP, mtacTime: o.mtacTime });
      carry = r.end;
      uf += r.ufMl; glu += r.gluAbsorbedG; na += r.naRemovedMmol;
      return r;
    });
    return { rows, ufMl: uf, gluAbsorbedG: glu, naRemovedMmol: na };
  }

  /* ═════ Published icodextrin long-dwell UF (not simulated) ═════
   * Akonur 2016 (Perit Dial Int 36:79-84) Table 3, PD Adequest-based 3-pore model,
   * 2 L 7.5% icodextrin, residual 350 mL, anuric typical patients:
   *   APD 15-h day dwell:  H 465 · HA 488 · LA 501 · L 524 mL
   *   CAPD 9-h night dwell: H 388 · HA 386 · LA 382 · L 389 mL                       */
  const ICO_PUBLISHED_UF = Object.freeze({
    ccpd: { high: 465, "high-average": 488, "low-average": 501, low: 524, dwellH: 15 },
    capd: { high: 388, "high-average": 386, "low-average": 382, low: 389, dwellH: 9 },
  });

  /* Validation status, from tests/threepore.test.js against Akonur 2016 Tables 3-4
   * (28 glucose cells): RMSE ≈ 111 mL, largest error ≈ 245 mL (High, APD 15-h 2.27%), mean bias −26 mL.
   * Direction and transport-type ordering match, magnitude does not match closely
   * enough to present as a validated prediction → shown as "experimental". */
  const UF_STATUS = "experimental";

  /**
   * Predicted daily peritoneal UF for one candidate regimen (formulas.js option object).
   *  Glucose: 1.36% (1.5% dextrose) for every short exchange/cycle; 2.27% (2.5% dextrose)
   *  for a dextrose long dwell (CAPD overnight, CCPD day dwell) — the two strengths used in
   *  the Akonur 2016 prescription grid. Icodextrin long dwell: published Akonur 2016 Table 3
   *  value for the transport type (2 L fill; CAPD 9-h, APD 15-h dwell), not simulated.
   *  Steady state: the day is simulated twice and the second day is reported.
   */
  function regimenUf(opt, typeKey, longSolution, opts) {
    const p = TYPE_PARAMS[typeKey];
    if (!p || !opt) return null;
    const o = opts || {};
    const g15 = GLUCOSE_MMOL["1.5"], g25 = GLUCOSE_MMOL["2.5"];
    const fillMl = opt.fillL * 1000;
    let shortDwells = [], longDwell = null, dayPair = null, mod = opt.mod;
    if (mod === "capd") {
      const n = opt.exchanges, longH = opt.longDwellH || 8;
      const restMin = ((24 - longH) * 60) / (n - 1);
      for (let i = 0; i < n - 1; i++) shortDwells.push({ fillMl, minutes: restMin, glucoseMmol: g15 });
      longDwell = { fillMl, minutes: longH * 60, glucoseMmol: g25 };
    } else {
      const nightMin = (opt.therapyH * 60) / opt.cycles;
      for (let i = 0; i < opt.cycles; i++) shortDwells.push({ fillMl, minutes: nightMin, glucoseMmol: g15 });
      if (opt.lastFillL > 0 && opt.dayDwells === 2) {
        // Midday exchange: two equal 2.5% day dwells (Akonur 2016 Figs 4-5 "2x2L(g)").
        const half = ((24 - opt.therapyH) * 60) / 2;
        dayPair = [0, 1].map(() => ({ fillMl: opt.lastFillL * 1000, minutes: half, glucoseMmol: g25 }));
      } else if (opt.lastFillL > 0) longDwell = { fillMl: opt.lastFillL * 1000, minutes: (24 - opt.therapyH) * 60, glucoseMmol: g25 };
    }
    if (dayPair) {
      if (longSolution === "icodextrin") return null; // no published icodextrin UF for split day dwells
      const seqM = shortDwells.concat(dayPair);
      const twoM = simulateSequence(p, seqM.concat(seqM), o);
      const d2 = twoM.rows.slice(seqM.length);
      const sh = d2.slice(0, shortDwells.length).reduce((a, r) => a + r.ufMl, 0);
      const dayUf = d2.slice(shortDwells.length).reduce((a, r) => a + r.ufMl, 0);
      return {
        dailyUfMl: sh + dayUf,
        shortUfMl: sh,
        longUfMl: dayUf,
        longSource: "model",
        dayDwells: 2,
        icoDwellH: null,
        glucoseAbsorbedG: d2.reduce((a, r) => a + r.gluAbsorbedG, 0),
        status: UF_STATUS,
      };
    }
    const ico = longSolution === "icodextrin" && longDwell;
    const seq = shortDwells.concat(longDwell && !ico ? [longDwell] : []);
    const two = simulateSequence(p, seq.concat(seq), o);
    const day2 = two.rows.slice(seq.length);
    const shortUf = day2.slice(0, shortDwells.length).reduce((a, r) => a + r.ufMl, 0);
    let longUf = 0, longSource = null;
    if (longDwell && !ico) { longUf = day2[day2.length - 1].ufMl; longSource = "model"; }
    if (ico) { longUf = ICO_PUBLISHED_UF[mod === "capd" ? "capd" : "ccpd"][typeKey]; longSource = "published"; }
    const glu = day2.reduce((a, r) => a + r.gluAbsorbedG, 0);
    return {
      dailyUfMl: shortUf + longUf,
      shortUfMl: shortUf,
      longUfMl: longDwell ? longUf : null,
      longSource,
      icoDwellH: ico ? ICO_PUBLISHED_UF[mod === "capd" ? "capd" : "ccpd"].dwellH : null,
      glucoseAbsorbedG: ico ? null : glu,
      status: UF_STATUS,
    };
  }

  const T = { TPM, UF_STATUS, regimenUf, GLUCOSE_MMOL, TYPE_PARAMS, ICO_PUBLISHED_UF, areaFactor, patlak, simulateDwell, simulateSequence };
  global.PdThreePore = T;
  if (typeof module !== "undefined" && module.exports) module.exports = T;
})(typeof globalThis !== "undefined" ? globalThis : this);

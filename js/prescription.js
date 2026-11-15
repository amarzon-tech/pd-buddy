/**
 * PD Buddy — prescription summary text. Formatting only; no new math.
 */
(function (global) {
  "use strict";

  const isNum = (x) => typeof x === "number" && Number.isFinite(x);
  const L = (x) => (isNum(x) ? (Math.abs(x * 10 - Math.round(x * 10)) < 1e-9 ? x.toFixed(1) : x.toFixed(2)) + " L" : "____"); // 1.25 L stays 1.25 (0.4.4)
  const H = (x) => (isNum(x) ? String(Math.round(x * 10) / 10) + " h" : "____");
  const n2 = (x) => (isNum(x) ? x.toFixed(2) : "____");
  const n1 = (x) => (isNum(x) ? x.toFixed(1) : "____");

  // Standard bag labels (dextrose monohydrate %, icodextrin 7.5%).
  const SOLUTIONS = Object.freeze({
    "1.5": "1.5% dextrose",
    "2.5": "2.5% dextrose",
    "4.25": "4.25% dextrose",
    ico: "Icodextrin 7.5%",
  });
  function sol(key) {
    return SOLUTIONS[key] || "____";
  }

  // App Critic M5: the copied/printed text keeps its draft and model-estimate status. Exact wording: Dr D.
  const TITLE = "PD regimen summary (model estimate)";
  const DRAFT_LINE = "DRAFT – model estimate, not an order – verify before use";
  const DISCLAIMER = "Not a medical device. Not cleared or approved by FDA. Estimates do not replace measured adequacy or clinical judgment.";

  /**
   * 0.4.5 (Dr D, Nov 15 2026: "Show a negative-UF warning on those options"): warning text when
   * the experimental UF model predicts negative daily UF. "Stronger dextrose" is avoided because
   * 4.25% is still an open question (S8). Returns null when UF is not negative or unknown.
   */
  function negUfWarning(dailyUfMl) {
    if (!isNum(dailyUfMl) || dailyUfMl >= 0) return null;
    const l = Math.abs(dailyUfMl) / 1000;
    const amt = l < 0.005 ? "slightly below 0 L/day" : "about −" + l.toFixed(2) + " L/day";
    return "Predicted daily UF is negative (" + amt + ", experimental model). Watch fluid balance; consider a higher-tonicity or icodextrin dwell.";
  }

  /** App Critic S8: the solutions the estimate assumed, printed with the sheet. */
  function modelAssumed(s) {
    if (s.modality === "apd") {
      const a = s.apd || {};
      if (!(isNum(a.lastFillL) && a.lastFillL > 0)) return "1.5% dextrose cycles, dry day";
      if (a.lastSolution === "ico") return "1.5% dextrose cycles, icodextrin 7.5% day dwell";
      return "1.5% dextrose cycles, 2.5% dextrose " + (a.dayDwells === 2 ? "for both day dwells" : "day dwell");
    }
    const c = s.capd || {};
    return "1.5% dextrose exchanges, " + (c.longSolution === "ico" ? "icodextrin 7.5%" : "2.5% dextrose") + " long dwell";
  }

  function build(s) {
    const lines = [TITLE, DRAFT_LINE, "Patient: ____", "Date: ____", "Prescriber: ____", ""];
    if (s.modality === "apd") {
      const a = s.apd || {};
      lines.push("Modality: CCPD");
      lines.push("Night cycles: " + (isNum(a.cycles) ? a.cycles : "__") + " × " + L(a.fillL));
      lines.push("Total therapy time: " + H(a.therapyH));
      lines.push("Night solution: " + sol(a.solution));
      if (isNum(a.lastFillL) && a.lastFillL > 0) {
        lines.push("Last fill: " + L(a.lastFillL) + ", " + sol(a.lastSolution));
        const dayH = isNum(a.dayDwellH) && a.dayDwellH > 0 ? a.dayDwellH : isNum(a.therapyH) ? 24 - a.therapyH : null;
        if (a.dayDwells === 2) {
          lines.push("Day dwell 1 (last fill): " + H(isNum(dayH) ? dayH / 2 : null));
          lines.push("Midday exchange (manual): drain, then " + L(a.lastFillL) + ", " + sol(a.lastSolution));
          lines.push("Day dwell 2: " + H(isNum(dayH) ? dayH / 2 : null) + ", drained at the start of the next cycler session");
        } else {
          lines.push("Day dwell: " + H(dayH));
        }
      } else {
        lines.push("Last fill: None (dry day)");
      }
    } else {
      const c = s.capd || {};
      lines.push("Modality: CAPD");
      lines.push("Exchanges: " + (isNum(c.exchanges) ? c.exchanges : "__") + " × " + L(c.fillL) + " per day");
      lines.push("Solution: " + sol(c.solution));
      if (isNum(c.longDwellH) && c.longDwellH > 0) {
        const longSol = c.longSolution === "ico" ? sol("ico") : sol(c.solution);
        lines.push("Long dwell: " + H(c.longDwellH) + ", " + longSol);
      }
    }
    const e = s.estimate || {};
    if (isNum(e.ktvTotal) || isNum(e.crcl)) {
      lines.push("");
      lines.push(e.measured ? "Measured clearance (24-h collections)" : "Estimated clearance (model, not measured)");
      if (isNum(e.ktvTotal)) {
        let t = n2(e.ktvTotal);
        if (isNum(e.ktvR) && e.ktvR > 0) t += " (peritoneal " + n2(e.ktvP) + " + renal " + n2(e.ktvR) + ")";
        lines.push("Weekly Kt/V urea: " + t);
      }
      if (isNum(e.crcl)) lines.push("Weekly CrCl: " + n1(e.crcl) + " L/week/1.73 m²");
    }
    lines.push("Model assumed: " + modelAssumed(s) + " (solution strengths are the model's assumptions, not a choice)");
    const u = s.uf;
    if (u && isNum(u.dailyUfMl)) {
      // 0.4.4 (App Critic re-check): CCPD wording is cycles / day dwell, matching "Model assumed".
      const apd = s.modality === "apd";
      const assume =
        u.longSource === "published"
          ? apd ? ", assuming 1.5% dextrose cycles; icodextrin day dwell = published value for 2 L, 9 h/15 h, not adjusted" : ", assuming 1.5% dextrose exchanges; icodextrin long dwell = published value for 2 L, 9 h/15 h, not adjusted"
          : u.longSource === "model" && u.dayDwells === 2
          ? ", assuming 1.5% dextrose cycles and two 2.5% dextrose day dwells"
          : u.longSource === "model"
          ? apd ? ", assuming 1.5% dextrose cycles and a 2.5% dextrose day dwell" : ", assuming 1.5% dextrose exchanges and a 2.5% dextrose long dwell"
          : ", assuming 1.5% dextrose cycles";
      lines.push("Predicted daily UF (experimental three-pore model): " + (u.dailyUfMl / 1000).toFixed(2) + " L" + assume);
      const neg = negUfWarning(u.dailyUfMl);
      if (neg) lines.push("Warning: " + neg);
    }
    if (s.transport) lines.push("PET transport: " + s.transport + (s.basis ? " (typical values)" : ""));
    if (s.basis) lines.push(s.basis);
    const footer = DISCLAIMER + " Confirm with a measured 24-h collection.";
    lines.push("");
    lines.push(footer);
    return { title: TITLE, lines, text: lines.join("\n"), footer, draftLine: DRAFT_LINE };
  }

  const RX = { build, SOLUTIONS, TITLE, DRAFT_LINE, DISCLAIMER, modelAssumed, negUfWarning };
  global.PdPrescription = RX;
  if (typeof module !== "undefined" && module.exports) module.exports = RX;
})(typeof globalThis !== "undefined" ? globalThis : this);

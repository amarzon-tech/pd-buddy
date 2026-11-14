/**
 * PD Buddy — prescription summary text. Formatting only; no new math.
 */
(function (global) {
  "use strict";

  const isNum = (x) => typeof x === "number" && Number.isFinite(x);
  const L = (x) => (isNum(x) ? x.toFixed(1) + " L" : "____");
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

  function build(s) {
    const lines = ["PD PRESCRIPTION"];
    if (s.modality === "apd") {
      const a = s.apd || {};
      lines.push("Modality: CCPD");
      lines.push("Night cycles: " + (isNum(a.cycles) ? a.cycles : "__") + " × " + L(a.fillL));
      lines.push("Total therapy time: " + H(a.therapyH));
      lines.push("Night solution: " + sol(a.solution));
      if (isNum(a.lastFillL) && a.lastFillL > 0) {
        lines.push("Last fill: " + L(a.lastFillL) + ", " + sol(a.lastSolution));
        lines.push("Day dwell: " + H(isNum(a.dayDwellH) && a.dayDwellH > 0 ? a.dayDwellH : isNum(a.therapyH) ? 24 - a.therapyH : null));
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
    const u = s.uf;
    if (u && isNum(u.dailyUfMl)) {
      lines.push("Predicted daily UF (experimental three-pore model): " + (u.dailyUfMl / 1000).toFixed(2) + " L" + (u.longSource === "published" ? ", assuming 1.5% dextrose exchanges; Extraneal long dwell = published value" : u.longSource === "model" ? ", assuming 1.5% dextrose exchanges and a 2.5% dextrose long dwell" : ", assuming 1.5% dextrose cycles"));
    }
    if (s.transport) lines.push("PET transport: " + s.transport + (s.basis ? " (typical values)" : ""));
    if (s.basis) lines.push(s.basis);
    const footer = "Educational estimate only. Confirm with a measured 24-h collection.";
    lines.push("");
    lines.push(footer);
    return { title: "PD PRESCRIPTION", lines, text: lines.join("\n"), footer };
  }

  const RX = { build, SOLUTIONS };
  global.PdPrescription = RX;
  if (typeof module !== "undefined" && module.exports) module.exports = RX;
})(typeof globalThis !== "undefined" ? globalThis : this);

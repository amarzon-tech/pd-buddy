/**
 * Prescription summary tests (formatting only).
 * Run: node tests/prescription.test.js
 */
"use strict";
const RX = require("../js/prescription.js");
const { eq, isTrue, section, done } = require("./_h.js");

section("CAPD");
{
  const r = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5" }, estimate: { ktvTotal: 1.7, ktvP: 1.29, ktvR: 0.41, crcl: 56.6 }, transport: "High-average" });
  isTrue(r.lines.includes("Modality: CAPD"), "modality line");
  isTrue(r.lines.includes("Exchanges: 4 × 2.0 L per day"), "exchanges line");
  isTrue(r.lines.includes("Solution: 2.5% dextrose"), "solution line");
  isTrue(!r.text.includes("Long dwell"), "no long dwell when not entered");
  isTrue(r.lines.includes("Estimated clearance (model, not measured)"), "estimate is labelled as a model");
  isTrue(r.lines.includes("Weekly Kt/V urea: 1.70 (peritoneal 1.29 + renal 0.41)"), "Kt/V split");
  isTrue(r.lines.includes("Weekly CrCl: 56.6 L/week/1.73 m²"), "CrCl line");
  isTrue(r.lines.includes("PET transport: High-average"), "transport line");
  isTrue(/Educational estimate only/.test(r.text), "educational footer");
  const l = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "1.5", longDwellH: 9, longSolution: "ico" } });
  isTrue(l.lines.includes("Long dwell: 9 h, Icodextrin 7.5%"), "icodextrin long dwell");
  const s = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5", longDwellH: 9, longSolution: "same" } });
  isTrue(s.lines.includes("Long dwell: 9 h, 2.5% dextrose"), "same-solution long dwell");
  const b = RX.build({ modality: "capd", capd: {} });
  isTrue(b.lines.includes("Exchanges: __ × ____ per day"), "blank fields are write-in lines");
  isTrue(!b.text.includes("clearance"), "no clearance section without numbers");
}

section("APD");
{
  const r = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2, therapyH: 9, solution: "1.5", lastFillL: 2, lastSolution: "ico" } });
  isTrue(r.lines.includes("Modality: APD"), "modality APD");
  isTrue(r.lines.includes("Night cycles: 5 × 2.0 L"), "cycles");
  isTrue(r.lines.includes("Total therapy time: 9 h"), "therapy time");
  isTrue(r.lines.includes("Night solution: 1.5% dextrose"), "night solution");
  isTrue(r.lines.includes("Last fill: 2.0 L, Icodextrin 7.5%"), "last fill");
  isTrue(r.lines.includes("Day dwell: 15 h"), "day dwell defaults to 24 − therapy");
  const d = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2, therapyH: 9, solution: "1.5", lastFillL: 0 } });
  isTrue(d.lines.includes("Last fill: None (dry day)"), "dry day");
  const m = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2, therapyH: 9, solution: "1.5" }, estimate: { measured: true, ktvTotal: 1.8, ktvP: 1.8, ktvR: 0 } });
  isTrue(m.lines.includes("Measured clearance (24-h collections)"), "measured label");
  isTrue(m.lines.includes("Weekly Kt/V urea: 1.80"), "no split when renal 0");
}

section("No electrolyte or uncited content");
{
  const r = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5" } });
  isTrue(!/sodium|potassium|calcium|magnesium/i.test(r.text), "no electrolyte composition");
  eq(Object.keys(RX.SOLUTIONS).length, 4, "four labelled solutions");
}

done("prescription");

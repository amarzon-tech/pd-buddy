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
  isTrue(/Not a medical device\. Not cleared or approved by FDA\./.test(r.text), "not-a-medical-device footer (App Critic M6)");
  isTrue(r.lines[0] === "PD regimen summary (model estimate)", "title is a model-estimate summary, not PD PRESCRIPTION (M5)");
  isTrue(r.lines[1] === "DRAFT – model estimate, not an order – verify before use", "copied text starts with the DRAFT line (M5)");
  isTrue(/^DRAFT – model estimate/.test(r.text.split("\n")[1]), "DRAFT line in text");
  isTrue(["Patient: ____", "Date: ____", "Prescriber: ____"].every((x) => r.lines.includes(x)), "blank patient, date and prescriber lines (M5)");
  isTrue(!/PD PRESCRIPTION/.test(r.text), "no PD PRESCRIPTION title");
  isTrue(r.lines.some((l) => /^Model assumed: /.test(l)), "model solution assumption printed (S8)");
  const l = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "1.5", longDwellH: 9, longSolution: "ico" } });
  isTrue(l.lines.includes("Long dwell: 9 h, Icodextrin 7.5%"), "icodextrin long dwell");
  const s = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5", longDwellH: 9, longSolution: "same" } });
  isTrue(s.lines.includes("Long dwell: 9 h, 2.5% dextrose"), "same-solution long dwell");
  const b = RX.build({ modality: "capd", capd: {} });
  isTrue(b.lines.includes("Exchanges: __ × ____ per day"), "blank fields are write-in lines");
  isTrue(!b.text.includes("clearance"), "no clearance section without numbers");
}

section("CCPD (cycler)");
{
  const r = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2, therapyH: 9, solution: "1.5", lastFillL: 2, lastSolution: "ico" } });
  isTrue(r.lines.includes("Modality: CCPD"), "modality shown as CCPD");
  isTrue(!/APD/.test(r.text), "no APD label in the summary");
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

section("Transport type only (typical values)");
{
  const basis = "Estimated from typical values for high-average transporters — enter PET numbers for a patient-specific estimate.";
  const r = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5" }, estimate: { crcl: 42.5 }, transport: "High-average", basis });
  isTrue(r.lines.includes("PET transport: High-average (typical values)"), "transport marked typical");
  isTrue(r.lines.includes(basis), "basis sentence in summary");
  isTrue(!r.text.includes("Kt/V"), "no Kt/V line when not estimable");
  const n = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5" }, transport: "High" });
  isTrue(!/typical/.test(n.text), "no typical label when PET numbers used");
}

section("No electrolyte or uncited content");
{
  const r = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2, solution: "2.5" } });
  isTrue(!/sodium|potassium|calcium|magnesium/i.test(r.text), "no electrolyte composition");
  eq(Object.keys(RX.SOLUTIONS).length, 4, "four labelled solutions");
}

section("Predicted UF line (0.4)");
{
  const r = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2 }, uf: { dailyUfMl: 420, longSource: "published" } });
  isTrue(r.lines.some((l) => /^Predicted daily UF \(experimental three-pore model\): 0\.42 L, assuming 1\.5% dextrose exchanges; icodextrin long dwell = published value for 2 L, 9 h\/15 h, not adjusted$/.test(l)), "UF line labelled experimental with assumptions");
  {
    const RX2 = require("../js/prescription.js");
    isTrue(RX2.modelAssumed({ modality: "capd", capd: { longSolution: "ico" } }) === "1.5% dextrose exchanges, icodextrin 7.5% long dwell", "S8 CAPD icodextrin assumption");
    isTrue(RX2.modelAssumed({ modality: "capd", capd: {} }) === "1.5% dextrose exchanges, 2.5% dextrose long dwell", "S8 CAPD dextrose assumption");
    isTrue(RX2.modelAssumed({ modality: "apd", apd: { lastFillL: 0 } }) === "1.5% dextrose cycles, dry day", "S8 CCPD dry");
    isTrue(RX2.modelAssumed({ modality: "apd", apd: { lastFillL: 2, dayDwells: 2 } }) === "1.5% dextrose cycles, 2.5% dextrose for both day dwells", "S8 CCPD midday");
    isTrue(RX2.modelAssumed({ modality: "apd", apd: { lastFillL: 2, lastSolution: "ico" } }) === "1.5% dextrose cycles, icodextrin 7.5% day dwell", "S8 CCPD icodextrin");
  }
  const r2 = RX.build({ modality: "capd", capd: { exchanges: 4, fillL: 2 } });
  isTrue(!r2.lines.some((l) => /Predicted daily UF/.test(l)), "no UF line without a prediction");
}

done("prescription");

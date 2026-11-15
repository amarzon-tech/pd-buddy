/**
 * Workflow tests: type-only Kt/V from published typical MTACs (Akonur 2016) (option 1),
 * prescription grid look-up (option 3), lab loop (measured adequacy, MTAC fit,
 * diff), troubleshooting and cited guidance.
 * Run: node tests/workflow.test.js
 */
"use strict";
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const G = require("../js/rxgrid.js");
const W = require("../js/workflow.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");

const ht = F.ftInToCm(5, 10);
const V = F.watsonV("male", 55, ht, 80);
const bsa = F.bsaMosteller(ht, 80);

section("Option 1: published typical MTACs (Akonur 2016 / 2013)");
{
  const M = F.ADEQUEST_TYPICAL_MTAC;
  eq(M.high.urea, 27.71, "urea MTAC H 27.71");
  eq(M["high-average"].urea, 23.14, "urea MTAC HA 23.14");
  eq(M["low-average"].urea, 18.4, "urea MTAC LA 18.40");
  eq(M.low.urea, 15.92, "urea MTAC L 15.92");
  eq(M.high.cr, 19.15, "creatinine MTAC H 19.15");
  eq(M["high-average"].cr, 11.92, "creatinine MTAC HA 11.92");
  eq(M["low-average"].cr, 8.6, "creatinine MTAC LA 8.60");
  eq(M.low.cr, null, "no published Low creatinine MTAC");
  eq(F.typicalPet("low").mtacCr, null, "typicalPet(low) has no creatinine MTAC → midpoint method");
  eq(F.TYPICAL_LABEL, "typical-patient estimate from published parameters (Akonur et al. 2016), not measured", "label wording");
  // Type-only example patient → Kt/V available → ranked by Kt/V
  const typ = F.typicalPet("high-average");
  const rows = F.candidateOptions({ mtacUrea: typ.mtacUrea, mtacCr: typ.mtacCr, V, bsa, ktvRenal: 0, rkfLDay: 0 });
  isTrue(rows.every((r) => F.isNum(r.ktv)), "every option has Kt/V from type alone");
  const rk = F.rankOptions(rows, { mod: "capd", ktvTarget: 1.7 });
  eq(rk.metric, "ktv", "type-only ranking uses the Kt/V target");
  // Garred D/P at 4 h implied by the published urea MTAC is in a plausible range
  const dp = F.garredDp(typ.mtacUrea, 2, typ.drainMl / 1000, 240);
  isTrue(dp > 0.8 && dp < 0.97, "implied 4-h D/P urea plausible for HA (" + dp.toFixed(3) + ")");
}

section("Option 3: prescription grid look-up");
{
  eq(G.vBand(33.9), "V1", "V < 34 → V1");
  eq(G.vBand(34), "V2", "34 → V2");
  eq(G.vBand(41.99), "V2", "< 42 → V2");
  eq(G.vBand(42), "V3", "42 → V3");
  eq(G.rkfBand(1.99), "lt2", "< 2 mL/min");
  eq(G.rkfBand(2), "ge2", "≥ 2 mL/min");
  let cells = 0;
  ["lt2", "ge2"].forEach((rb) => ["V1", "V2", "V3"].forEach((vb) => ["low", "low-average", "high-average", "high"].forEach((t) => {
    const c = G.GRID[rb][vb][t];
    isTrue(c && c.capd.length >= 1 && c.ccpd.length >= 1, rb + " " + vb + " " + t + " has CAPD and APD rows");
    c.capd.concat(c.ccpd).forEach((s) => G.parseRow(s));
    cells++;
  })));
  eq(cells, 24, "24 cells (4 types × 3 V bands × 2 RKF bands)");
  const c = G.lookup("high-average", V, 0);
  eq(c.vBand, "V3", "example patient V " + V.toFixed(1) + " L → V3");
  eq(c.capd[0].text, "3L(g)+4x3L(m)", "HA V3 RKF<2 CAPD row 1 (Akonur Fig 4)");
  eq(c.ccpd[0].text, "4x2.5L(g)+2x2.5L(g)", "HA V3 RKF<2 APD row 1");
  eq(G.lookup("low", 30, 3).ccpd[2].text, "4x2L(g)+dry", "dry-day row parses");
  isTrue(G.lookup("low", 30, 3).ccpd[2].day.dry, "dry flag");
  eq(Object.keys(G.GRID_FLAGS).length, 9, "9 flagged (unverified) rows");
  isTrue(!!G.lookup("high", 45, 3).ccpd[2].flag, "flag surfaces on the looked-up row");
  eq(G.lookup(null, 40, 0), null, "no type → null");
}

section("Lab loop: measured adequacy");
{
  const labs = { dialVolL: 10.6, dialUrea: 18.2, serumUrea: 21, dialCr: 520, serumCr: 810, urineMl: 450, urineUrea: 210, urineCr: 6800 };
  const m = W.measuredAdequacy(labs, V, bsa, 1.7);
  approx(m.ktLDay, 18.2 / 21 * 10.6, 1e-9, "Kt_p = D/P × drain");
  approx(m.ktvP, 7 * (18.2 / 21 * 10.6) / V, 1e-9, "peritoneal Kt/V");
  approx(m.ktvR, 7 * (210 / 21 * 0.45) / V, 1e-9, "renal Kt/V");
  approx(m.ktv, m.ktvP + m.ktvR, 1e-12, "total");
  eq(m.source, "collection", "source collection");
  eq(m.meets, m.ktv >= 1.7, "target comparison");
  isTrue(F.isNum(m.crcl), "CrCl with creatinine");
  const e = W.measuredAdequacy({ measuredKtv: 1.55 }, V, bsa, 1.7);
  eq(e.source, "entered", "reported Kt/V used when no collection");
  eq(e.meets, false, "1.55 < 1.7 not met");
  approx(W.measuredPeritonealKt(e, V, 0.2), (1.35 * V) / 7, 1e-9, "peritoneal Kt from reported total minus renal");
}

section("Lab loop: fit MTAC to a measured clearance");
{
  const opt = F.CANDIDATE_OPTIONS.find((o) => o.id === "capd-4x2.0");
  const dw = F.optionDwells(opt, null);
  const target = F.predictDaily(dw, 20, null).ureaLDay;
  approx(F.fitMtacToClearance(dw, target, "urea"), 20, 1e-6, "recovers the MTAC that produced the clearance");
  eq(F.fitMtacToClearance(dw, 50, "urea"), null, "impossible clearance (above total drain) → null");
}

section("Diff between rankings");
{
  const a = { metric: "ktv", top: [{ id: "a" }, { id: "b" }, { id: "c" }], all: [{ id: "a", value: 1.8 }, { id: "b", value: 1.9 }, { id: "c", value: 2 }] };
  const b = { metric: "ktv", top: [{ id: "b" }, { id: "c" }, { id: "d" }], all: [{ id: "b", value: 1.7 }, { id: "c", value: 1.8 }, { id: "d", value: 1.75 }] };
  const d = W.diffTop(a, b);
  eq(d.added.join(), "d", "added");
  eq(d.removed.join(), "a", "removed");
  eq(d.kept.join(), "b,c", "kept");
}

section("Troubleshooting suggestions are model-computed one-step changes");
{
  const typ = F.typicalPet("high");
  const ufFn = (opt, sol) => T.regimenUf(opt, "high", sol);
  const rows = F.candidateOptions({ mtacUrea: typ.mtacUrea, mtacCr: typ.mtacCr, V, bsa, ktvRenal: 0, rkfLDay: 0, ufFn });
  const cur = rows.find((r) => r.id === "capd-4x2.0");
  const s = W.troubleshoot("clearance", cur, rows, 1.7);
  const kinds = s.map((x) => x.kind).sort().join();
  eq(kinds, "add-exchange,icodextrin,larger-fill", "CAPD: add exchange, larger fill, Extraneal");
  isTrue(s[0].dKtv >= s[s.length - 1].dKtv, "sorted by Kt/V gain for low clearance");
  const add = s.find((x) => x.kind === "add-exchange");
  approx(add.dKtv, add.row.ktv - cur.ktv, 1e-12, "Δ Kt/V computed from the model rows");
  const u = W.troubleshoot("uf", cur, rows, 1.7);
  eq(u[0].kind, "icodextrin", "high transporter, fluid problem: Extraneal gives the largest UF gain");
  isTrue(u[0].dUfMl > 0, "positive UF gain");
  const dry = rows.find((r) => r.id === "ccpd-4x2.0-dry");
  const c = W.troubleshoot("clearance", dry, rows, 1.7).map((x) => x.kind);
  isTrue(c.includes("day-dwell") && c.includes("day-dwell-ico"), "CCPD dry day: day-dwell options offered");
}

section("Guidance is quoted and cited");
{
  ["clearance", "uf", "rkf"].forEach((k) => {
    isTrue(W.GUIDANCE[k].length >= 4, k + ": at least 4 quoted statements");
    W.GUIDANCE[k].forEach((g) => isTrue(/^G-[CUR]\d$/.test(g.id) && /Perit Dial Int\. 202[01]/.test(g.src) && g.text.length > 40, g.id + " has id, source and text"));
  });
}

done("workflow");

/**
 * 0.4.1 stronger CCPD candidates: midday exchange (2 day dwells), 3.0 L night fills,
 * 10- and 11-h cycler time; burden order; Extraneal rules; UF (experimental);
 * troubleshooting steps; prescription text; example patient re-run.
 * Run: node tests/ccpd.test.js
 */
"use strict";
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const W = require("../js/workflow.js");
const RX = require("../js/prescription.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");

const C = F.CANDIDATE_OPTIONS;
const byId = (id) => C.find((o) => o.id === id);
const ht = F.ftInToCm(5, 10);
const V = F.watsonV("male", 55, ht, 80);
const bsa = F.bsaMosteller(ht, 80);
const typ = F.typicalPet("high-average");
const ufFn = (o, s) => T.regimenUf(o, "high-average", s);

section("Midday-exchange dwells");
{
  const m = byId("ccpd-4x2.0-mid2.5");
  eq(m.label, "CCPD 4 × 2.0 L, 9 h + midday exchange (2 × 2.5 L day dwells, 7.5 h each)", "label");
  const d = F.optionDwells(m, 0);
  eq(d.map((x) => x.kind).join(","), "cycle,cycle,cycle,cycle,day,midday", "4 cycles, last fill, midday exchange");
  approx(d.reduce((a, x) => a + x.minutes, 0), 24 * 60, 1e-9, "dwells fill 24 h");
  isTrue(d.slice(4).every((x) => x.fillL === 2.5), "both day dwells 2.5 L");
  eq(byId("ccpd-5x2.0-10h-mid2.0").label, "CCPD 5 × 2.0 L, 10 h + midday exchange (2 × 2.0 L day dwells, 7 h each)", "10-h label: 7 h each");
  eq(byId("ccpd-5x2.0-11h-mid2.0").label, "CCPD 5 × 2.0 L, 11 h + midday exchange (2 × 2.0 L day dwells, 6.5 h each)", "11-h label: 6.5 h each");
  const one = F.predictDaily(F.optionDwells(byId("ccpd-4x2.0-day"), 0), 18, 10);
  const two = F.predictDaily(F.optionDwells(byId("ccpd-4x2.0-mid2.0"), 0), 18, 10);
  isTrue(two.ureaLDay > one.ureaLDay, "splitting the day dwell raises urea clearance (Garred)");
}

section("Large fills and cycler time");
{
  eq(F.optionMaxFillL(byId("ccpd-5x3.0-day")), 3.0, "largest fill of 5 × 3.0 L + 2.0 L day = 3.0 L");
  isTrue(C.filter((o) => o.mod === "ccpd").every((o) => o.cycles <= 5), "≤ 5 cycles");
  const k = (h) => F.predictDaily(F.optionDwells(byId("ccpd-5x2.5" + (h === 9 ? "" : "-" + h + "h") + "-day"), 0), 18, 10).ureaLDay;
  isTrue(k(10) > k(9) && k(11) > k(10), "longer cycler time raises clearance (same cycles)");
}

section("Extraneal rules");
{
  const rows = F.candidateOptions({ mtacUrea: typ.mtacUrea, mtacCr: typ.mtacCr, V, bsa, ufFn });
  isTrue(rows.filter((r) => r.opt.midday).every((r) => r.longSolution === "dextrose" && r.uf && r.uf.dayDwells === 2), "midday rows: dextrose, both day dwells simulated");
  isTrue(!rows.some((r) => r.opt.midday && r.longSolution === "icodextrin"), "no Extraneal midday rows");
  eq(T.regimenUf(byId("ccpd-4x2.0-mid2.0"), "high", "icodextrin"), null, "no Extraneal UF for split day dwells");
  const i10 = rows.find((r) => r.id === "ccpd-5x2.5-10h-day-ico");
  eq(i10.uf.longUfMl, 488, "10-h day: published 15-h Extraneal HA value 488 mL (Akonur 2016 Table 3)");
  const mU = T.regimenUf(byId("ccpd-5x2.5-mid2.5"), "high-average", "dextrose");
  approx(mU.dailyUfMl, mU.shortUfMl + mU.longUfMl, 1e-9, "midday daily UF = cycles + both day dwells");
  eq(mU.status, "experimental", "UF still experimental");
}

section("Example patient — type only (typical HA MTACs, Kt/V)");
{
  const rows = F.candidateOptions({ mtacUrea: typ.mtacUrea, mtacCr: typ.mtacCr, V, bsa, ufFn });
  const r = F.rankOptions(rows, { mod: "ccpd" });
  eq(r.metric, "ktv", "ranked by Kt/V");
  isTrue(r.anyMeet, "now some CCPD options reach 1.7");
  eq(r.top.map((x) => x.baseId).join(","), "ccpd-5x3.0-10h-day,ccpd-4x3.0-11h-day,ccpd-5x2.5-11h-day", "Top 3: least burdensome meeting 1.7");
  approx(r.top[0].ktv, 1.79, 0.005, "5 × 3.0 L, 10 h + day: Kt/V 1.79");
  approx(r.top[1].ktv, 1.72, 0.005, "4 × 3.0 L, 11 h + day: Kt/V 1.72");
  approx(r.top[2].ktv, 1.75, 0.005, "5 × 2.5 L, 11 h + day: Kt/V 1.75");
  isTrue(r.top.every((x) => x.meets && !x.opt.midday), "all meet without a midday exchange");
  const best9 = r.all.filter((x) => x.opt.therapyH === 9 && !x.opt.midday && x.opt.fillL <= 2.5);
  isTrue(best9.every((x) => !x.meets), "no 9-h, ≤ 2.5 L, no-midday option meets (as in 0.4.0)");
}

section("Example patient — PET D/P Cr 0.70, D/P urea 0.75");
{
  const mCr = F.garredMtac(0.7, 2, typ.drainMl / 1000, 240), mU = F.garredMtac(0.75, 2, typ.drainMl / 1000, 240);
  const rows = F.candidateOptions({ mtacUrea: mU, mtacCr: mCr, V, bsa, ufFn });
  const r = F.rankOptions(rows, { mod: "ccpd" });
  isTrue(!r.anyMeet, "still no CCPD option reaches 1.7");
  approx(r.top[0].ktv, 1.67, 0.005, "best: 5 × 3.0 L, 11 h + midday 2 × 2.5 L, Kt/V 1.67");
  isTrue(r.top.every((x) => x.opt.midday), "Top 3 all use a midday exchange");
}

section("Troubleshooting steps for CCPD");
{
  const rows = F.candidateOptions({ mtacUrea: typ.mtacUrea, mtacCr: typ.mtacCr, V, bsa, ufFn });
  const cur = rows.find((r) => r.id === "ccpd-5x2.5-day");
  const n = W.neighbours(cur, rows);
  const g = (k) => n.find((x) => x.kind === k);
  eq(g("longer-time").row.id, "ccpd-5x2.5-10h-day", "longer cycler time: 10 h, same cycles/fill/day");
  eq(g("midday").row.id, "ccpd-5x2.5-mid2.0", "midday exchange: 2 × 2.0 L, same 9 h");
  eq(g("larger-fill").row.id, "ccpd-5x3.0-day", "larger fill keeps 9 h");
  eq(g("icodextrin").row.id, "ccpd-5x2.5-day-ico", "Extraneal for the day dwell");
  isTrue(!g("add-exchange"), "no 6th cycle");
  const mid = rows.find((r) => r.id === "ccpd-5x2.5-mid2.0");
  const nm = W.neighbours(mid, rows);
  eq(nm.find((x) => x.kind === "midday-larger").row.id, "ccpd-5x2.5-mid2.5", "midday 2.0 → 2.5 L");
  isTrue(!nm.some((x) => x.kind === "icodextrin"), "no Extraneal step from a midday regimen");
  const t11 = W.neighbours(rows.find((r) => r.id === "ccpd-5x2.5-11h-day"), rows);
  isTrue(!t11.some((x) => x.kind === "longer-time"), "11 h is the longest");
}

section("Prescription text");
{
  const r = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2.5, therapyH: 10, lastFillL: 2.0, dayDwells: 2 } });
  isTrue(r.lines.includes("Total therapy time: 10 h"), "therapy time 10 h");
  isTrue(r.lines.includes("Day dwell 1 (last fill): 7 h"), "day dwell 1: 7 h");
  isTrue(r.lines.some((l) => /^Midday exchange \(manual\): drain, then 2\.0 L/.test(l)), "midday exchange line");
  isTrue(r.lines.includes("Day dwell 2: 7 h, drained at the start of the next cycler session"), "day dwell 2: 7 h");
  const s = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2.5, therapyH: 11, lastFillL: 2.0 } });
  isTrue(s.lines.includes("Day dwell: 13 h"), "single day dwell after 11 h: 13 h");
  const u = RX.build({ modality: "apd", apd: { cycles: 5, fillL: 2.5, therapyH: 9, lastFillL: 2.5, dayDwells: 2 }, uf: { dailyUfMl: 800, longSource: "model", dayDwells: 2 } });
  isTrue(u.lines.some((l) => /0\.80 L, assuming 1\.5% dextrose cycles and two 2\.5% dextrose day dwells$/.test(l)), "midday UF line states both day dwells");
}

done("ccpd");

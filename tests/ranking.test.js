/**
 * Top 3 ranking tests: candidate set, burden order, meets-target ordering,
 * fallback when none meet, CrCl fallback without D/P urea, Extraneal dedupe.
 * Run: node tests/ranking.test.js
 */
"use strict";
const F = require("../js/formulas.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");

// Example patient: male 55 y, 5 ft 10 in, 80 kg, high-average.
const ht = F.ftInToCm(5, 10);
const V = F.watsonV("male", 55, ht, 80);
const bsa = F.bsaMosteller(ht, 80);
const typ = F.typicalPet("high-average");
const mCrTyp = F.garredMtac(typ.dpCr, 2, typ.drainMl / 1000, 240);
const mCrNum = F.garredMtac(0.7, 2, typ.drainMl / 1000, 240);
const mU = F.garredMtac(0.75, 2, typ.drainMl / 1000, 240);

section("Candidate set");
{
  const c = F.CANDIDATE_OPTIONS;
  const capd = c.filter((o) => o.mod === "capd"), ccpd = c.filter((o) => o.mod === "ccpd");
  eq(capd.length, 9, "CAPD 3–5 exchanges × 2.0/2.5/3.0 L");
  eq(ccpd.length, 72, "CCPD 4–5 cycles × 2.0/2.5/3.0 L × 9/10/11 h × dry / day dwell / 2 midday variants");
  isTrue(capd.every((o) => [3, 4, 5].includes(o.exchanges) && [2, 2.5, 3].includes(o.fillL) && o.longDwellH === 8), "CAPD grid with 8-h overnight dwell");
  isTrue(ccpd.every((o) => [4, 5].includes(o.cycles) && [2, 2.5, 3].includes(o.fillL) && [9, 10, 11].includes(o.therapyH) && [0, 2, 2.5].includes(o.lastFillL)), "CCPD grid: 2.0/2.5/3.0 L, 9/10/11 h, dry / 2.0 / 2.5 L day");
  isTrue(ccpd.every((o) => (o.dayDwells === 2) === o.midday && (o.dayDwells === 0) === (o.lastFillL === 0)), "dayDwells consistent with midday / dry day");
  isTrue(ccpd.filter((o) => o.dayDwells === 1).every((o) => o.lastFillL === 2.0), "single day dwell is 2.0 L (as before)");
  eq(ccpd.filter((o) => o.midday).length, 2 * 3 * 3 * 2, "midday variants: 2.0 and 2.5 L day dwells");
  isTrue(ccpd.every((o) => o.largeFill === undefined), "no largeFill flag (replaced by the 0.4.2 fill cap)");
  eq(new Set(c.map((o) => o.id)).size, c.length, "unique ids");
  ["ccpd-4x2.0-dry", "ccpd-4x2.0-day", "ccpd-5x2.0-day", "ccpd-5x2.5-day", "ccpd-4x2.5-dry"].forEach((id) => isTrue(c.some((o) => o.id === id && o.therapyH === 9), "0.4.0 id kept: " + id));
  {
    const m = c.find((o) => o.id === "ccpd-5x2.5-mid2.0");
    const d = F.optionDwells(m, 0);
    eq(d.length, 7, "midday option: 5 cycles + 2 day dwells");
    approx(d[5].minutes, 450, 1e-9, "9-h cycler: day dwells 7.5 h each");
    approx(d[6].minutes, 450, 1e-9, "second day dwell 7.5 h");
    eq(d[6].kind, "midday", "second day dwell is the manual midday exchange");
    const m11 = F.optionDwells(c.find((o) => o.id === "ccpd-5x2.5-11h-mid2.5"), 0);
    approx(m11[5].minutes, 390, 1e-9, "11-h cycler: day dwells 6.5 h each");
    approx(m11[0].minutes, 132, 1e-9, "11-h cycler, 5 cycles: night dwells 132 min");
    const d10 = F.optionDwells(c.find((o) => o.id === "ccpd-4x2.0-10h-day"), 0);
    approx(d10[4].minutes, 14 * 60, 1e-9, "10-h cycler: single day dwell 14 h");
    const uf = F.optionDwells(m, 300);
    eq(uf[5].ufMl + "," + uf[6].ufMl, "0,300", "entered long-dwell UF on the midday dwell only");
  }
  isTrue(ccpd.every((o) => o.cycles <= 5), "≤ 5 cycles per night (Core Curriculum 2023)");
  isTrue(F.REGIMEN_OPTIONS.every((s) => c.some((o) => o.mod === s.mod && o.fillL === s.fillL && (o.exchanges || o.cycles) === (s.exchanges || s.cycles) && (o.lastFillL || 0) === (s.lastFillL || 0))), "every original option is in the candidate set");
  const rows = F.candidateOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa });
  // CAPD 9 × 2; CCPD 72 + Extraneal for the 18 single-day-dwell options (none for dry or midday).
  eq(rows.length, 9 * 2 + 72 + 18, "rows: Extraneal variant for every single long dwell");
  isTrue(!rows.some((r) => r.longSolution === "icodextrin" && r.opt.midday), "no Extraneal variant for split midday dwells");
  isTrue(rows.filter((r) => r.opt.midday).every((r) => r.longSolution === "dextrose"), "midday rows are dextrose day dwells");
  const orig = F.regimenOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa });
  const a = orig.find((o) => o.id === "capd-4x2"), b = rows.find((o) => o.id === "capd-4x2.0");
  approx(b.ktv, a.ktv, 1e-12, "same model as the original options table (Kt/V)");
  approx(b.crcl, a.crcl, 1e-12, "same model as the original options table (CrCl)");
}

section("Burden order");
{
  const k = (id) => F.burdenKey(F.CANDIDATE_OPTIONS.find((o) => o.id === id));
  const lt = (x, y) => { const a = k(x), b = k(y); for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i]; return false; };
  isTrue(lt("capd-3x3.0", "capd-4x2.0"), "CAPD: fewer exchanges first");
  isTrue(lt("capd-4x2.0", "capd-4x2.5"), "CAPD: smaller fill next");
  isTrue(lt("ccpd-5x2.5-dry", "ccpd-4x2.0-day"), "CCPD: dry day before a day dwell");
  isTrue(lt("ccpd-4x2.5-day", "ccpd-5x2.0-day"), "CCPD: fewer cycles next");
  isTrue(lt("ccpd-4x2.0-dry", "ccpd-4x2.5-dry"), "CCPD: smaller fill");
  isTrue(lt("ccpd-4x2.5-dry", "ccpd-4x3.0-dry"), "CCPD: 3.0 L fill after 2.5 L");
  isTrue(lt("ccpd-5x3.0-11h-day", "ccpd-4x2.0-mid2.0"), "CCPD: midday exchange is the most burdensome step");
  isTrue(lt("ccpd-5x3.0-day", "ccpd-4x2.0-10h-day"), "CCPD: longer cycler time is more burden than more cycles / larger fill");
  isTrue(lt("ccpd-4x2.0-10h-day", "ccpd-4x2.0-11h-day"), "CCPD: 10 h before 11 h");
  isTrue(lt("ccpd-5x3.0-11h-dry", "ccpd-4x2.0-day"), "CCPD: dry day still before a day dwell");
  isTrue(lt("ccpd-4x2.0-mid2.0", "ccpd-4x2.0-mid2.5"), "CCPD: smaller midday volume first");
}

section("Meets-target ordering (least burdensome first)");
{
  // Synthetic rows: metric known, check ordering only.
  const mk = (id, mod, burden, ktv, crcl) => ({ id, baseId: id, mod, burden, ktv, crcl, longSolution: "dextrose" });
  const rows = [
    mk("a", "capd", [5, 2.5], 2.3, 80),
    mk("b", "capd", [3, 2.0], 1.75, 60),
    mk("c", "capd", [4, 2.0], 1.9, 65),
    mk("d", "capd", [3, 2.5], 1.6, 55),
    mk("e", "capd", [4, 2.5], 2.1, 70),
  ];
  const r = F.rankOptions(rows, { mod: "capd" });
  eq(r.metric, "ktv", "Kt/V metric when every row has Kt/V");
  eq(r.target, 1.7, "default Kt/V target 1.7");
  eq(r.top.map((x) => x.id).join(","), "b,c,e", "meeting rows, least burden first (not highest Kt/V)");
  isTrue(r.top.every((x) => x.meets), "all three badged meets target");
  eq(r.meetCount, 4, "4 rows meet");
  const r2 = F.rankOptions(rows, { mod: "capd", ktvTarget: 2.0 });
  eq(r2.top.map((x) => x.id).join(","), "e,a,c", "target 2.0: two meet (burden order), then the highest below target");
  eq(r2.meetCount, 2, "2 rows meet target 2.0");
  isTrue(r2.top[0].meets && r2.top[1].meets && !r2.top[2].meets, "badges follow the target");
  const tie = F.rankOptions([mk("x", "capd", [4, 2.0], 1.8, 60), mk("y", "capd", [4, 2.0], 1.95, 60)], { mod: "capd" });
  eq(tie.top[0].id, "y", "equal burden: higher Kt/V first");
}

section("Fallback when none meet the target");
{
  const rows = F.candidateOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa });
  const capd = F.rankOptions(rows, { mod: "capd" });
  const ccpd = F.rankOptions(rows, { mod: "ccpd" });
  eq(capd.metric, "ktv", "example with D/P urea ranks by Kt/V");
  isTrue(!capd.anyMeet && !ccpd.anyMeet, "anuric example: no option reaches 1.7");
  eq(capd.top.length, 3, "still shows 3 CAPD");
  eq(capd.top.map((x) => x.baseId).join(","), "capd-5x3.0,capd-5x2.5,capd-4x3.0", "CAPD: 3 highest Kt/V");
  isTrue(capd.top[0].ktv >= capd.top[1].ktv && capd.top[1].ktv >= capd.top[2].ktv, "descending Kt/V");
  approx(capd.top[0].ktv, 1.6, 0.005, "CAPD 5 × 3.0 L Kt/V 1.60");
  eq(ccpd.top.map((x) => x.baseId).join(","), "ccpd-5x3.0-11h-mid2.5,ccpd-5x2.5-11h-mid2.5,ccpd-5x3.0-10h-mid2.5", "CCPD (PET example): 3 highest are midday-exchange options");
  approx(ccpd.top[0].ktv, 1.671, 0.005, "CCPD 5 × 3.0 L, 11 h + midday 2 × 2.5 L Kt/V 1.67 (still below 1.7)");
  const old9 = rows.find((x) => x.id === "ccpd-5x2.5-day");
  approx(old9.ktv, 1.13, 0.005, "0.4.0 best CCPD (5 × 2.5 L, 9 h + day) unchanged at 1.13");
  isTrue(capd.top.every((x) => !x.meets), "badged below target");
  // Renal Kt/V lifts options over the target, then burden order applies.
  const withR = F.candidateOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa, ktvRenal: 0.6 });
  const rr = F.rankOptions(withR, { mod: "capd" });
  isTrue(rr.anyMeet, "renal Kt/V 0.6: some CAPD options meet 1.7");
  const lowest = rr.top[0];
  isTrue(rr.all.filter((x) => x.meets).every((x) => F.burdenKey(x.opt)[0] >= lowest.opt.exchanges), "top pick has the fewest exchanges among those meeting");
}

section("CrCl fallback without D/P urea");
{
  const rows = F.candidateOptions({ mtacUrea: null, mtacCr: mCrTyp, V, bsa });
  isTrue(rows.every((o) => o.ktv === null), "no Kt/V from type only");
  const r = F.rankOptions(rows, { mod: "capd" });
  eq(r.metric, "crcl", "ranked by CrCl");
  eq(r.target, 60, "CrCl reference 60 L/week/1.73 m²");
  isTrue(!r.anyMeet, "type-only anuric example: none reach 60");
  eq(r.top.map((x) => x.baseId).join(","), "capd-5x3.0,capd-5x2.5,capd-4x3.0", "CAPD: 3 highest CrCl");
  approx(r.top[0].crcl, 58.4, 0.05, "CAPD 5 × 3.0 L CrCl 58.4");
  const c = F.rankOptions(rows, { mod: "ccpd" });
  eq(c.top[0].baseId, "ccpd-5x3.0-11h-mid2.5", "CCPD: highest CrCl is 5 × 3.0 L, 11 h + midday 2 × 2.5 L");
  isTrue(c.top[0].crcl >= c.top[1].crcl && c.top[1].crcl >= c.top[2].crcl, "CCPD: descending CrCl");
  approx(rows.find((x) => x.id === "ccpd-5x2.5-day").crcl, 41.2, 0.05, "CCPD 5 × 2.5 L + day CrCl 41.2 (unchanged)");
  const lowT = F.rankOptions(rows, { mod: "capd", crclTarget: 40 });
  isTrue(lowT.anyMeet && lowT.top[0].meets, "custom CrCl target applies");
  eq(lowT.top[0].baseId, "capd-3x2.5", "CrCl target 40: least burdensome option meeting it first");
}

section("Extraneal variants count once");
{
  const rows = F.candidateOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa });
  const r = F.rankOptions(rows, { mod: "capd" });
  eq(new Set(r.all.map((x) => x.baseId)).size, r.all.length, "no duplicate regimens");
  isTrue(r.top.every((x) => x.longSolution === "dextrose"), "dextrose row when Extraneal is identical (no UF entered)");
  const ico = F.candidateOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa, longUfIcodextrinMl: 600 });
  const ri = F.rankOptions(ico, { mod: "capd" });
  isTrue(ri.top.every((x) => x.longSolution === "icodextrin"), "entered Extraneal UF: higher Extraneal row chosen below target");
  eq(F.rankOptions([], { mod: "capd" }).top.length, 0, "empty input → empty result");
}

done("ranking");

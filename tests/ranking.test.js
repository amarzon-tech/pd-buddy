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
  eq(ccpd.length, 8, "CCPD 4–5 cycles × 2.0/2.5 L × dry/day dwell");
  isTrue(capd.every((o) => [3, 4, 5].includes(o.exchanges) && [2, 2.5, 3].includes(o.fillL) && o.longDwellH === 8), "CAPD grid with 8-h overnight dwell");
  isTrue(ccpd.every((o) => [4, 5].includes(o.cycles) && [2, 2.5].includes(o.fillL) && o.therapyH === 9 && [0, 2].includes(o.lastFillL)), "CCPD grid, 9 h, 2.0 L day dwell or dry");
  isTrue(ccpd.every((o) => o.cycles <= 5), "≤ 5 cycles per night (Core Curriculum 2023)");
  isTrue(F.REGIMEN_OPTIONS.every((s) => c.some((o) => o.mod === s.mod && o.fillL === s.fillL && (o.exchanges || o.cycles) === (s.exchanges || s.cycles) && (o.lastFillL || 0) === (s.lastFillL || 0))), "every original option is in the candidate set");
  const rows = F.candidateOptions({ mtacUrea: mU, mtacCr: mCrNum, V, bsa });
  eq(rows.length, 9 * 2 + 4 + 4 * 2, "rows: Extraneal variant for every long dwell");
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
  isTrue(lt("ccpd-4x2.0-dry", "ccpd-4x2.5-dry"), "CCPD: smaller fill last");
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
  eq(ccpd.top[0].baseId, "ccpd-5x2.5-day", "CCPD: highest is 5 × 2.5 L + day dwell");
  approx(ccpd.top[0].ktv, 1.13, 0.005, "CCPD 5 × 2.5 L + day Kt/V 1.13");
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
  eq(c.top.map((x) => x.baseId).join(","), "ccpd-5x2.5-day,ccpd-4x2.5-day,ccpd-5x2.0-day", "CCPD: highest CrCl, tie broken by burden");
  approx(c.top[0].crcl, 41.2, 0.05, "CCPD 5 × 2.5 L + day CrCl 41.2");
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

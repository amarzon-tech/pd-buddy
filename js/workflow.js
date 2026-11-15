/**
 * PD Buddy — clinician workflow logic (pure; no DOM, no storage, no network).
 *  Step 3: measured adequacy from labs, lab-calibrated re-ranking, diff vs previous.
 *  Step 4: troubleshooting — model-computed one-step regimen changes + cited guidance.
 * Every guidance sentence is a verbatim quote with its source (CONTENT_REVIEW §20).
 */
(function (global) {
  "use strict";
  const F = global.PdFormulas || (typeof require !== "undefined" ? require("./formulas.js") : null);
  const isNum = (x) => typeof x === "number" && Number.isFinite(x);

  /* ═════ Measured adequacy (KDOQI 2006 CPG 2 definitions, same as formulas.js) ═════
   * labs: { dialVolL, dialUrea, dialCr, urineMl, urineUrea, urineCr, serumUrea, serumCr, measuredKtv }
   * Urea and creatinine units must match between fluid and serum (ratios only). */
  function measuredAdequacy(labs, V, bsa, ktvTarget) {
    const L = labs || {};
    const out = { ktvP: null, ktvR: null, ktv: null, crcl: null, source: null, meets: null, ktLDay: null, crLDay: null, rkf: null };
    const haveDial = isNum(L.dialVolL) && L.dialVolL > 0 && isNum(L.dialUrea) && isNum(L.serumUrea) && L.serumUrea > 0;
    if (haveDial && isNum(V) && V > 0) {
      out.ktLDay = F.clearanceLDay(L.dialUrea, L.serumUrea, L.dialVolL);
      out.ktvP = F.weeklyKtv(out.ktLDay, V);
      if (isNum(L.dialCr) && isNum(L.serumCr) && L.serumCr > 0) out.crLDay = F.clearanceLDay(L.dialCr, L.serumCr, L.dialVolL);
    }
    if (isNum(L.urineMl) && L.urineMl > 0 && isNum(L.urineUrea) && isNum(L.serumUrea) && L.serumUrea > 0) {
      out.rkf = F.residual({ urineMl: L.urineMl, urineUrea: L.urineUrea, plasmaUrea: L.serumUrea, urineCr: L.urineCr, plasmaCr: L.serumCr });
      if (isNum(V) && V > 0) out.ktvR = F.weeklyKtv(out.rkf.ureaLDay, V);
    }
    if (isNum(out.ktvP)) {
      out.ktv = out.ktvP + (isNum(out.ktvR) ? out.ktvR : 0);
      out.source = "collection";
      if (isNum(out.crLDay) && isNum(bsa) && bsa > 0) out.crcl = F.weeklyCrCl173(out.crLDay + (out.rkf && isNum(out.rkf.rkfLDay) ? out.rkf.rkfLDay : 0), bsa);
    } else if (isNum(L.measuredKtv) && L.measuredKtv > 0) {
      out.ktv = L.measuredKtv;
      out.source = "entered";
    }
    if (isNum(out.ktv) && isNum(ktvTarget)) out.meets = out.ktv >= ktvTarget - 1e-9;
    return out;
  }

  /**
   * Peritoneal Kt (L/day) implied by the labs for calibration:
   *  collection → measured Kt_p; entered total Kt/V → (Kt/V − renal Kt/V) × V / 7.
   */
  function measuredPeritonealKt(m, V, ktvRenal) {
    if (!m) return null;
    if (m.source === "collection") return m.ktLDay;
    if (m.source === "entered" && isNum(V)) {
      const kr = isNum(ktvRenal) ? ktvRenal : 0;
      const ktvP = m.ktv - kr;
      return ktvP > 0 ? (ktvP * V) / 7 : null;
    }
    return null;
  }

  /* ═════ What changed between two rankings ═════ */
  function diffTop(prev, next) {
    const ids = (r) => (r && r.top ? r.top.map((o) => o.id) : []);
    const p = ids(prev), n = ids(next);
    const byId = (r, id) => (r && r.all ? r.all.find((o) => o.id === id || o.baseId === id) : null);
    return {
      added: n.filter((id) => !p.includes(id)),
      removed: p.filter((id) => !n.includes(id)),
      kept: n.filter((id) => p.includes(id)),
      metricChanged: !!(prev && next && prev.metric !== next.metric),
      changes: n.map((id) => {
        const a = byId(prev, id), b = byId(next, id);
        return { id, before: a ? a.value : null, after: b ? b.value : null };
      }),
    };
  }

  /* ═════ Troubleshooting: one-step changes from the current regimen ═════
   * Candidates are rows of formulas.candidateOptions (same model, same assumptions). */
  function neighbours(current, rows) {
    if (!current || !rows) return [];
    const p = current.opt;
    const ico = current.longSolution === "icodextrin";
    const findAny = (pred, sol) => rows.find((r) => pred(r.opt) && (sol === undefined ? r.longSolution === current.longSolution || (!r.longSolution && !current.longSolution) : r.longSolution === sol));
    // Fill cap (0.4.2): a step whose fill is above 1.5 L/m² BSA is not suggested; it is
    // reported as "cap reached" instead (row null, capReached true).
    const find = (pred, sol) => {
      const r = findAny(pred, sol);
      if (r && r.overCap) return { capped: r };
      return r;
    };
    const out = [];
    const push = (kind, label, row) => {
      if (!row) return;
      if (row.capped) return out.push({ kind, label, row: null, capReached: true, cappedFillL: F.optionMaxFillL(row.capped.opt) });
      if (row.id !== current.id) out.push({ kind, label, row });
    };
    if (p.mod === "capd") {
      push("add-exchange", "Add an exchange (" + (p.exchanges + 1) + " a day)", find((o) => o.mod === "capd" && o.exchanges === p.exchanges + 1 && o.fillL === p.fillL));
      push("larger-fill", "Larger fill (" + (p.fillL + 0.5).toFixed(1) + " L)", find((o) => o.mod === "capd" && o.exchanges === p.exchanges && Math.abs(o.fillL - (p.fillL + 0.5)) < 1e-9));
      if (!ico) push("icodextrin", "Icodextrin 7.5% for the overnight long dwell", find((o) => o.id === p.id, "icodextrin"));
    } else {
      // Same cycler time, day pattern and volumes unless the change is that step.
      const th = (o) => o.therapyH || 9;
      const same = (o, keep) =>
        o.mod === "ccpd" &&
        (keep.cycles === false || o.cycles === p.cycles) &&
        (keep.fill === false || Math.abs(o.fillL - p.fillL) < 1e-9) &&
        (keep.time === false || th(o) === th(p)) &&
        (keep.day === false || ((o.dayDwells || 0) === (p.dayDwells || 0) && (o.lastFillL || 0) === (p.lastFillL || 0)));
      push("add-exchange", "Add a cycle (" + (p.cycles + 1) + " cycles)", find((o) => same(o, { cycles: false }) && o.cycles === p.cycles + 1));
      push("larger-fill", "Larger fill (" + (p.fillL + 0.5).toFixed(1) + " L)", find((o) => same(o, { fill: false }) && Math.abs(o.fillL - (p.fillL + 0.5)) < 1e-9));
      push("longer-time", "Longer cycler time (" + (th(p) + 1) + " h)", find((o) => same(o, { time: false }) && th(o) === th(p) + 1));
      if (!(p.lastFillL > 0)) push("day-dwell", "Add a 2.0 L day dwell", find((o) => same(o, { day: false }) && o.dayDwells === 1, "dextrose"));
      if (p.lastFillL > 0 && p.dayDwells !== 2 && !ico) push("icodextrin", "Icodextrin 7.5% for the day dwell", find((o) => o.id === p.id, "icodextrin"));
      if (!(p.lastFillL > 0)) push("day-dwell-ico", "Add a 2.0 L icodextrin 7.5% day dwell", find((o) => same(o, { day: false }) && o.dayDwells === 1, "icodextrin"));
      if (p.dayDwells !== 2) push("midday", "Add a midday exchange (2 × 2.0 L day dwells)", find((o) => same(o, { day: false }) && o.dayDwells === 2 && o.lastFillL === 2.0, "dextrose"));
      else if (p.lastFillL < 2.5) push("midday-larger", "Larger midday volumes (2 × 2.5 L)", find((o) => same(o, { day: false }) && o.dayDwells === 2 && o.lastFillL === 2.5, "dextrose"));
    }
    return out;
  }

  /**
   * problem: "clearance" | "uf" | "rkf". Returns suggestions with model deltas.
   * clearance → sorted by Kt/V gain; uf → by predicted daily UF gain.
   */
  function troubleshoot(problem, current, rows, ktvTarget) {
    const all = neighbours(current, rows);
    const capped = all.filter((s) => s.capReached);
    const n = all.filter((s) => !s.capReached).map((s) => {
      const dK = isNum(s.row.ktv) && isNum(current.ktv) ? s.row.ktv - current.ktv : null;
      const dC = isNum(s.row.crcl) && isNum(current.crcl) ? s.row.crcl - current.crcl : null;
      const uf0 = current.uf && isNum(current.uf.dailyUfMl) ? current.uf.dailyUfMl : null;
      const uf1 = s.row.uf && isNum(s.row.uf.dailyUfMl) ? s.row.uf.dailyUfMl : null;
      const dU = isNum(uf0) && isNum(uf1) ? uf1 - uf0 : null;
      return Object.assign({}, s, { dKtv: dK, dCrcl: dC, dUfMl: dU, meetsKtv: isNum(s.row.ktv) && isNum(ktvTarget) ? s.row.ktv >= ktvTarget - 1e-9 : null });
    });
    const key = problem === "uf" ? "dUfMl" : isNum(current.ktv) ? "dKtv" : "dCrcl";
    return n.sort((a, b) => (isNum(b[key]) ? b[key] : -1e9) - (isNum(a[key]) ? a[key] : -1e9)).concat(capped);
  }

  /* ═════ Cited guidance (verbatim) ═════ */
  const BROWN = "Brown EA et al. ISPD practice recommendations: prescribing high-quality goal-directed peritoneal dialysis. Perit Dial Int. 2020;40(3):244-253. doi:10.1177/0896860819895364";
  const MORELLE = "Morelle J et al. ISPD recommendations for the evaluation of peritoneal membrane dysfunction in adults. Perit Dial Int. 2021;41(4):352-372. doi:10.1177/0896860820982218";
  const GUIDANCE = Object.freeze({
    clearance: [
      { id: "G-C1", src: BROWN + ", §3.4b", text: "There is no specific clearance target that guarantees sufficient dialysis for an individual. Increasing small solute clearance to a Kt/V > 1.7 may improve uraemia-related symptoms, if present, but there is only low certainty evidence showing that increasing urea clearance has any impact on quality of life, technique survival or mortality (practice point)." },
      { id: "G-C2", src: BROWN + ", §3.4d", text: "If symptoms, nutrition and volume are all controlled, no PD prescription change is needed for the sole purpose of reaching an arbitrary clearance target (practice point)." },
      { id: "G-C3", src: BROWN + ", Table 2 (Other factors beyond urea clearance, 1)", text: "Patients who remain symptomatic despite a Kt/Vurea > 1.7 should have other dialysis and non-dialysis-related factors considered as possible contributing factors. A trial of increasing dialysis dose may be indicated (practice point)." },
      { id: "G-C4", src: BROWN + ", §3.4a", text: "Small solute clearance should be routinely measured using Kt/Vurea or creatinine clearance to provide a quantitative measure of the amount of dialysis delivered. This can guide the amount of dialysis prescribed, while recognizing the limitations of accuracy of these measurements in individuals (practice point)." },
    ],
    uf: [
      { id: "G-U1", src: MORELLE + ", Guideline 3", text: "Insufficient UF should be suspected when either (a) the net UF from a 4-h PET is <400 ml (3.86% glucose/4.25% dextrose) or <100 ml (2.27% glucose /2.5% dextrose), (GRADE 1B) and/or (b) the daily UF is insufficient to maintain adequate fluid status. (practice point) Besides membrane dysfunction, low UF capacity can also result from mechanical problems, leaks or increased fluid absorption across the peritoneal membrane not explained by fast PSTR." },
      { id: "G-U2", src: MORELLE + ", Guideline 2b", text: "The resulting lower net UF can be avoided by shortening glucose-based exchanges, using a polyglucose solution (icodextrin), and/or prescribing higher glucose concentrations. (GRADE 1A) Compared to glucose, use of icodextrin can translate into improved fluid status and fewer episodes of fluid overload. (GRADE 1A)" },
      { id: "G-U3", src: BROWN + ", Which dialysis solution? A", text: "Once-daily icodextrin should be considered as an alternative to hypertonic glucose solutions for long dwells in people doing PD who are experiencing difficulties maintaining euvolemia due to insufficient peritoneal ultrafiltration, taking into account the individual’s peritoneal transport state (GRADE 1B)." },
      { id: "G-U4", src: MORELLE + ", Table (fast PSTR, management)", text: "If long dwells required use icodextrin (daytime for APD, overnight for CAPD). Shorten glucose-based overnight dwells (e.g. 90–180 min) when using APD coupled with icodextrin during the day long dwell." },
      { id: "G-U5", src: MORELLE + ", text underpinning Guideline 2b", text: "There is also a risk of underestimating the problem in continuous ambulatory peritoneal dialysis (CAPD) patients, as bags are typically overfilled (to account for evaporation and the flush-before-fill procedure), which might – unless subtracted – lead to a significant overestimate in actual UF of 400–800 mL per day." },
    ],
    rkf: [
      { id: "G-R1", src: BROWN + ", §4", text: "Residual kidney function should be determined for all individuals doing PD and management should focus on preserving this function (practice point)." },
      { id: "G-R2", src: BROWN + ", §3.4c", text: "The presence of residual kidney function at the start of PD may enable individuals to start on a low dose prescription that may be increased incrementally as residual kidney function declines or as clinically indicated." },
      { id: "G-R3", src: BROWN + ", Table 2 (RKF, 3)", text: "Caution should be taken to avoid volume depletion and hypotension based on low certainty evidence that this may adversely affect RKF (practice point)." },
      { id: "G-R4", src: BROWN + ", Which dialysis solution? B", text: "Use of neutral pH, low GDP PD solutions improves preservation of residual kidney function and urine output (GRADE 1A)." },
      { id: "G-R5", src: BROWN + ", §3.2a", text: "High-quality PD prescription should aim to achieve and maintain clinical euvolaemia taking residual kidney function and its preservation into account, so that both fluid removal from peritoneal ultrafiltration and urine output are considered and residual kidney function is not compromised (practice point)." },
    ],
  });

  const W = { measuredAdequacy, measuredPeritonealKt, diffTop, neighbours, troubleshoot, GUIDANCE, BROWN, MORELLE };
  global.PdWorkflow = W;
  if (typeof module !== "undefined" && module.exports) module.exports = W;
})(typeof globalThis !== "undefined" ? globalThis : this);

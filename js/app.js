/**
 * PD Buddy — UI. Four-step clinician workflow: Patient → Start prescription (Top 3 CAPD / CCPD,
 * Kt/V, predicted UF, published grid) → Check adequacy (new labs, scan, re-rank, diff) → Troubleshoot.
 * Inputs are never stored. No network after first load.
 */
(function () {
  "use strict";

  const F = window.PdFormulas;
  const CFG = window.PdConfig;
  const RX = window.PdPrescription;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const TOTAL_STEPS = 4;
  let currentStep = 1;

  function num(id) {
    const el = $(id);
    if (!el) return null;
    let s = String(el.value || "").trim().replace(/,/g, ".");
    s = s.replace("−", "-").replace("–", "-");
    if (s === "" || s === "." || s === "-") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function fmt(n, d) {
    if (!F.isNum(n)) return "—";
    return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function setText(id, t) {
    const el = $(id);
    if (el) el.textContent = t;
  }
  function metricState(id, state) {
    const el = $(id);
    if (!el) return;
    el.classList.remove("ok", "warn", "bad");
    if (state) el.classList.add(state);
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function safe(fn) {
    try {
      return fn();
    } catch (e) {
      return null;
    }
  }


  /* chip groups (in-memory state only) */
  const state = { sex: "male", wunit: "kg", ptype: null, pick: null, cur: null, calib: null, problem: "clearance", parseWarnings: [] };
  function bindChips(groupId, key) {
    const g = $(groupId);
    g.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      state[key] = b.getAttribute("data-" + key);
      $$(".chip", g).forEach((c) => {
        const on = c === b;
        c.classList.toggle("is-on", on);
        c.setAttribute("aria-checked", on ? "true" : "false");
      });
      recalc();
    });
  }
  bindChips("p-sex", "sex");
  bindChips("p-wunit", "wunit");
  bindChips("pet-type", "ptype");

  /* ── calculations ── */
  const TPM = window.PdThreePore;
  const GRID = window.PdRxGrid;
  const W = window.PdWorkflow;
  const LP = window.PdLabParse;
  let last = {};
  const KTV_DEFAULT = F.TARGETS.KTV_HISTORICAL_MIN;
  const CRCL_TARGET = F.TARGETS.CRCL_HISTORICAL_CAPD;
  const ufCache = new Map();
  function ufFor(typeKey) {
    return (opt, sol) => {
      const k = typeKey + "|" + opt.id + "|" + sol;
      if (!ufCache.has(k)) ufCache.set(k, safe(() => TPM.regimenUf(opt, typeKey, sol)));
      return ufCache.get(k);
    };
  }

  /* Lab fields (step 3). OCR-filled values stay UNCONFIRMED until the clinician confirms. */
  const LAB_IDS = { dpcr: "lab-dpcr", dpu: "lab-dpu", petDrain: "lab-petdrain", dialVolL: "lab-dvol", dialUrea: "lab-durea", dialCr: "lab-dcr", urineMl: "lab-uvol", urineUrea: "lab-uurea", urineCr: "lab-ucr", serumUrea: "lab-surea", serumCr: "lab-scr", measuredKtv: "lab-ktv" };
  const unconfirmed = new Set(); // lab keys filled by OCR and not yet confirmed
  function readLabs() {
    const L = {};
    Object.keys(LAB_IDS).forEach((k) => {
      if (unconfirmed.has(k)) return;
      const v = num(LAB_IDS[k]);
      if (F.isNum(v)) L[k] = v;
    });
    return L;
  }
  const anyKey = (o, keys) => keys.some((k) => F.isNum(o[k]));

  function readInputs() {
    return {
      sex: state.sex, age: num("p-age"), ft: num("p-ft"), inch: num("p-in"), wIn: num("p-wt"), wunit: state.wunit, ptype: state.ptype,
      dpcr: num("pet-dpcr"), dpu: num("pet-dpu"), drainIn: num("pet-drain"),
      uvol: num("l-uvol"), uu: num("l-uu"), pu: num("l-pu"), ucr: num("l-ucr"), pcr: num("l-pcr"),
      ktvTarget: num("t-ktv"), ufDex: num("o-uf-dex"), ufIco: num("o-uf-ico"), calib: state.calib,
    };
  }

  /** The whole model for one set of inputs (no DOM writes). */
  function compute(inp) {
    const r = { inp };
    r.ht = safe(() => F.ftInToCm(inp.ft, inp.inch));
    r.htCm = r.ht;
    r.wtKg = inp.wunit === "lb" ? safe(() => F.lbToKg(inp.wIn)) : inp.wIn;
    r.V = safe(() => F.watsonV(inp.sex, inp.age, r.ht, r.wtKg));
    if (F.isNum(r.V) && r.V <= 0) r.V = null;
    r.bsa = safe(() => F.bsaMosteller(r.ht, r.wtKg));

    // Transport: picked type, or PET numbers (numbers win)
    const dpcr = inp.dpcr, dpu = inp.dpu, drainIn = inp.drainIn;
    r.numCat = safe(() => F.petCategoryCr(dpcr));
    r.typeCat = inp.ptype ? safe(() => F.typicalPet(inp.ptype)) : null;
    r.cat = r.numCat ? r.numCat : r.typeCat ? { key: r.typeCat.key, label: r.typeCat.label, outside: null } : null;
    const typ = r.cat ? F.typicalPet(r.cat.key) : null;
    r.typ = typ;
    r.drainMlUsed = F.isNum(drainIn) && drainIn > 0 ? drainIn : typ ? typ.drainMl : null;
    r.drainTypical = !(F.isNum(drainIn) && drainIn > 0);
    const fillL = F.TARGETS.PET_FILL_L;
    const drainL = F.isNum(r.drainMlUsed) ? r.drainMlUsed / 1000 : null;
    // Creatinine MTAC: measured D/P Cr → Garred; else published Adequest-derived (H/HA/LA); else band midpoint (Low)
    r.crSource = null;
    if (r.numCat) { r.mtacCr = safe(() => F.garredMtac(dpcr, fillL, drainL, F.TARGETS.PET_MINUTES)); r.crSource = "pet"; }
    else if (typ && F.isNum(typ.mtacCr)) { r.mtacCr = typ.mtacCr; r.crSource = "typical"; }
    else if (typ) { r.mtacCr = safe(() => F.garredMtac(typ.dpCr, fillL, drainL, F.TARGETS.PET_MINUTES)); r.crSource = "midpoint"; }
    else r.mtacCr = null;
    // Urea MTAC: measured D/P urea → Garred; else published Adequest-derived typical value
    r.ureaSource = null;
    r.mtacU = null;
    if (F.isNum(dpu) && F.isNum(drainL)) { r.mtacU = safe(() => F.garredMtac(dpu, fillL, drainL, F.TARGETS.PET_MINUTES)); r.ureaSource = F.isNum(r.mtacU) ? "pet" : "invalid"; }
    if (!F.isNum(r.mtacU) && typ && r.ureaSource !== "invalid") { r.mtacU = typ.mtacUrea; r.ureaSource = "typical"; }
    // Lab-loop calibration (fitted to a measured 24-h clearance) wins
    if (inp.calib) {
      if (F.isNum(inp.calib.mtacU)) { r.mtacU = inp.calib.mtacU; r.ureaSource = "fitted"; }
      if (F.isNum(inp.calib.mtacCr)) { r.mtacCr = inp.calib.mtacCr; r.crSource = "fitted"; }
    }
    r.typical = r.ureaSource === "typical";
    r.typeOnly = !!r.typeCat && !r.numCat && !F.isNum(dpu) && r.drainTypical;
    r.basis = "";
    if (r.ureaSource === "fitted") r.basis = "Estimated from the measured 24-h clearance: the model's urea MTAC (" + fmt(r.mtacU, 1) + " mL/min) was fitted to it" + (inp.calib && inp.calib.on ? " on " + inp.calib.on : "") + ".";
    else if (r.typical && r.cat) {
      r.basis = "Estimated from typical values for " + r.cat.label.toLowerCase() + " transporters: " + F.TYPICAL_LABEL + " (urea MTAC " + fmt(typ.mtacUrea, 2) + " mL/min, Akonur 2016";
      if (r.crSource === "typical") r.basis += "; creatinine MTAC " + fmt(typ.mtacCr, 2) + " mL/min, Akonur 2013";
      r.basis += ")." + (r.crSource === "midpoint" ? " Creatinine uses the Twardowski D/P band midpoint (no published Low value)." : "") + " Enter PET numbers for a patient-specific estimate.";
    }

    // Residual urine (renal clearance only with urine + serum values)
    r.urineMl = F.isNum(inp.uvol) && inp.uvol > 0 ? inp.uvol : 0;
    r.res = r.urineMl > 0 ? safe(() => F.residual({ urineMl: r.urineMl, urineUrea: inp.uu, plasmaUrea: inp.pu, urineCr: inp.ucr, plasmaCr: inp.pcr })) : null;
    r.ktvR = r.res && F.isNum(r.V) ? F.weeklyKtv(r.res.ureaLDay, r.V) : null;
    if (F.isNum(inp.ktvROverride)) r.ktvR = inp.ktvROverride;
    r.rkfLDay = r.res && F.isNum(r.res.rkfLDay) ? r.res.rkfLDay : 0;
    r.rkfCrcl = r.res && F.isNum(r.res.rkfLDay) && F.isNum(r.bsa) ? F.weeklyCrCl173(r.res.rkfLDay, r.bsa) : null;
    r.kruMlMin = r.urineMl === 0 ? 0 : r.res ? r.res.ureaMlMin : null;

    r.ktvTarget = F.isNum(inp.ktvTarget) && inp.ktvTarget > 0 ? inp.ktvTarget : KTV_DEFAULT;
    r.ready = F.isNum(r.V) && F.isNum(r.bsa) && F.isNum(r.mtacCr);
    r.options = r.ready
      ? safe(() => F.candidateOptions({ mtacUrea: r.mtacU, mtacCr: r.mtacCr, V: r.V, bsa: r.bsa, ktvRenal: r.ktvR, rkfLDay: r.rkfLDay, longUfDextroseMl: inp.ufDex, longUfIcodextrinMl: inp.ufIco, ufFn: r.cat ? ufFor(r.cat.key) : null }))
      : null;
    if (r.options) {
      r.rankCapd = F.rankOptions(r.options, { mod: "capd", ktvTarget: r.ktvTarget, crclTarget: CRCL_TARGET });
      r.rankCcpd = F.rankOptions(r.options, { mod: "ccpd", ktvTarget: r.ktvTarget, crclTarget: CRCL_TARGET });
    }
    r.grid = r.cat && F.isNum(r.V) ? GRID.lookup(r.cat.key, r.V, F.isNum(r.kruMlMin) ? r.kruMlMin : 0) : null;
    r.gridRkfAssumed = r.urineMl > 0 && !F.isNum(r.kruMlMin);
    return r;
  }

  /** Step 3: apply confirmed labs on top of the baseline inputs and re-run. */
  function computeWithLabs(inp, base, labs, curId) {
    const out = { labs, any: Object.keys(labs).length > 0, m: null, r: null, curRow: null, fit: null, msgs: [] };
    if (!out.any || !base.ready) return out;
    const inpL = Object.assign({}, inp);
    if (anyKey(labs, ["dpcr", "dpu", "petDrain"])) {
      if (F.isNum(labs.dpcr)) inpL.dpcr = labs.dpcr;
      if (F.isNum(labs.dpu)) inpL.dpu = labs.dpu;
      if (F.isNum(labs.petDrain)) inpL.drainIn = labs.petDrain;
      inpL.calib = null; // a new PET supersedes an older fitted clearance
      out.msgs.push("New PET used for transport and MTACs.");
    }
    if (F.isNum(labs.urineMl)) {
      inpL.uvol = labs.urineMl;
      inpL.uu = labs.urineUrea; inpL.ucr = labs.urineCr; inpL.pu = labs.serumUrea; inpL.pcr = labs.serumCr;
      out.msgs.push("New 24-h urine used for residual function.");
    }
    let r = compute(inpL);
    out.m = W.measuredAdequacy(labs, r.V, r.bsa, r.ktvTarget);
    // Fit the urea (and creatinine) MTAC so the model reproduces the measured clearance on the current Rx
    const cur = r.options ? r.options.find((o) => o.id === curId) : null;
    if (cur && out.m && (out.m.source === "collection" || out.m.source === "entered")) {
      const ufMl = cur.longSolution === "icodextrin" ? inp.ufIco : inp.ufDex;
      const dw = F.optionDwells(cur.opt, ufMl);
      const ktP = W.measuredPeritonealKt(out.m, r.V, r.ktvR);
      const mU = F.isNum(ktP) ? safe(() => F.fitMtacToClearance(dw, ktP, "urea")) : null;
      const mC = F.isNum(out.m.crLDay) ? safe(() => F.fitMtacToClearance(dw, out.m.crLDay, "cr")) : null;
      if (F.isNum(mU) || F.isNum(mC)) {
        out.fit = { mtacU: mU, mtacCr: mC, on: shortName(cur) + (cur.longSolution === "icodextrin" ? " · Extraneal" : "") };
        inpL.calib = out.fit;
        r = compute(inpL);
        out.msgs.push("Clearance fitted to the measured " + (out.m.source === "collection" ? "24-h collection" : "weekly Kt/V") + " on " + out.fit.on + ".");
      } else out.msgs.push("The measured clearance is outside what the model can produce for the current prescription; not fitted.");
    }
    out.inp = inpL;
    out.r = r;
    out.curRow = r.options ? r.options.find((o) => o.id === curId) : null;
    out.diffCapd = W.diffTop(base.rankCapd, r.rankCapd);
    out.diffCcpd = W.diffTop(base.rankCcpd, r.rankCcpd);
    return out;
  }

  function recalc() {
    const wp = document.querySelector("#p-wt-wrap .unit-pill");
    if (wp) wp.textContent = state.wunit;
    const inp = readInputs();
    const r = compute(inp);

    setText("o-v", F.isNum(r.V) ? fmt(r.V, 1) + " L" : "—");
    setText("o-bsa", F.isNum(r.bsa) ? fmt(r.bsa, 2) + " m²" : "—");
    const conv = [];
    if (F.isNum(r.ht)) conv.push(fmt(r.ht, 1) + " cm");
    if (F.isNum(r.wtKg) && state.wunit === "lb") conv.push(fmt(r.wtKg, 1) + " kg");
    setText("p-msg", conv.length ? "= " + conv.join(", ") + "." : "");
    $("p-msg").classList.remove("warn-text");

    // PET message
    let petMsg = "", flag = false;
    const typ = r.typ;
    if (!r.cat) petMsg = F.isNum(inp.dpu) ? "Pick a transport type or enter D/P creatinine as well." : "Pick a transport type, or open PET numbers.";
    else if (r.typeOnly) petMsg = "Typical " + r.cat.label.toLowerCase() + " values. Kt/V: " + F.TYPICAL_LABEL + " (urea MTAC " + fmt(typ.mtacUrea, 2) + " mL/min" + (F.isNum(typ.mtacCr) ? ", creatinine MTAC " + fmt(typ.mtacCr, 2) : ", creatinine from D/P band midpoint " + fmt(typ.dpCr, 3)) + "). Enter PET numbers for a patient-specific estimate.";
    else {
      const used = [];
      if (r.numCat) used.push("D/P creatinine " + fmt(inp.dpcr, 2));
      if (r.ureaSource === "pet") used.push("D/P urea " + fmt(inp.dpu, 2));
      used.push("drain " + fmt(r.drainMlUsed, 0) + " mL" + (r.drainTypical ? " (typical for " + r.cat.label.toLowerCase() + ")" : ""));
      petMsg = r.cat.label + " transport. Using " + used.join(", ") + ".";
      if (r.numCat && r.numCat.outside) petMsg += " D/P creatinine is " + r.numCat.outside + " the published range (0.34–1.03).";
      if (r.numCat && r.typeCat && r.numCat.key !== r.typeCat.key) { petMsg += " PET numbers give " + r.numCat.label + ", not the picked " + r.typeCat.label + ". Using the numbers."; flag = true; }
      if (r.ureaSource === "invalid") { petMsg += " D/P urea and drain give no valid urea MTAC; check the values."; flag = true; }
      if (r.ureaSource === "typical") petMsg += " No D/P urea: Kt/V is a " + F.TYPICAL_LABEL + ".";
    }
    if (r.ureaSource === "fitted") petMsg += " Clearance fitted to the last measured 24-h collection.";
    setText("pet-msg", petMsg);
    $("pet-msg").classList.toggle("flag-text", flag);
    $("pet-msg").classList.toggle("basis-note", !!r.typeOnly);

    // RKF message
    let rm = "", rflag = false;
    if (r.urineMl === 0) rm = "Anuric: ranking uses peritoneal clearance only.";
    else if (!r.res) { rm = "Not counted yet: urine volume alone does not give a clearance. Add urine and serum urea (and creatinine for CrCl) under Residual clearance details."; rflag = true; }
    else {
      rm = "Renal Kt/V " + (F.isNum(r.ktvR) ? fmt(r.ktvR, 2) : "—") + " added to every option";
      rm += F.isNum(r.rkfCrcl) ? "; RKF ≈ " + fmt(r.rkfCrcl, 1) + " L/week/1.73 m² added to CrCl." : "; add urine and serum creatinine to add RKF to CrCl.";
      if (!r.res.significant) rm += " Urine 100 mL/day or less: KDOQI 2006 treats RKF as negligible.";
    }
    setText("rkf-msg", rm);
    $("rkf-msg").classList.toggle("flag-text", rflag);

    // current prescription (step 3/4)
    fillCurrentSelect(r);
    const curId = currentId(r);
    const labs = readLabs();
    r.lab = computeWithLabs(inp, r, labs, curId);
    last = r;
    setText("step-hint", r.ready ? "" : "Fill in body size and transport type");
    renderResults(r);
    renderAdequacy(r);
    renderTroubleshoot(r);
  }

  /* plain-words regimen */
  function words(o) {
    const p = o.opt;
    const ico = o.longSolution === "icodextrin";
    if (p.mod === "capd") return p.exchanges + " exchanges a day × " + fmt(p.fillL, 1) + " L, one 8-h overnight dwell" + (ico ? " with Extraneal" : "");
    return p.cycles + " cycles × " + fmt(p.fillL, 1) + " L over 9 h, " + (p.lastFillL > 0 ? "plus a " + fmt(p.lastFillL, 1) + " L day dwell (15 h)" + (ico ? " with Extraneal" : "") : "dry day");
  }
  function shortName(o) {
    const p = o.opt;
    if (p.mod === "capd") return "CAPD " + p.exchanges + " × " + fmt(p.fillL, 1) + " L";
    return "CCPD " + p.cycles + " × " + fmt(p.fillL, 1) + " L" + (p.lastFillL > 0 ? " + day dwell" : ", dry day");
  }
  function fullName(o) {
    return shortName(o) + (o.longSolution === "icodextrin" ? " · Extraneal" : "");
  }
  function ufText(o) {
    if (!o.uf || !F.isNum(o.uf.dailyUfMl)) return "—";
    return fmt(o.uf.dailyUfMl / 1000, 2);
  }

  function icoSibling(o, r) {
    if (!r || !r.options || o.longSolution !== "dextrose") return null;
    return r.options.find((x) => x.id === o.baseId + "-ico") || null;
  }
  function topItemHtml(o, i, rank, pickable, r) {
    const sib = icoSibling(o, r);
    const sibTxt = sib && sib.uf && F.isNum(sib.uf.dailyUfMl) ? '<span class="ico-line">With Extraneal long dwell: UF ' + fmt(sib.uf.dailyUfMl / 1000, 2) + " L/day (published long-dwell value" + (F.isNum(sib.ktv) ? "; Kt/V " + fmt(sib.ktv, 2) : "") + ")</span>" : "";
    const sel = state.pick === o.id;
    const ktv = F.isNum(o.ktv) ? fmt(o.ktv, 2) : "—";
    const badge = o.meets ? '<span class="badge-ok">Meets target</span>' : '<span class="badge-warn">Below target</span>';
    const ufSub = o.uf ? (o.uf.longSource === "published" ? "UF L/day · Extraneal published" : "UF L/day") : "UF L/day";
    const tag = pickable ? "button" : "div";
    return (
      "<li><" + tag + (pickable ? ' type="button"' : "") + ' class="top-item' + (sel && pickable ? " is-sel" : "") + '"' + (pickable ? ' data-pick="' + esc(o.id) + '"' : "") + ">" +
      '<span class="top-rank">' + (i + 1) + "</span>" +
      '<span class="top-body"><span class="top-name">' + esc(fullName(o)) + "</span>" +
      '<span class="top-words">' + esc(words(o)) + "</span>" +
      '<span class="top-nums three"><span class="tn' + (rank.metric === "ktv" ? " lead" : "") + '"><b class="' + (rank.metric === "ktv" ? (o.meets ? "v-ok" : "v-warn") : "") + '">' + esc(ktv) + "</b><i>weekly Kt/V</i></span>" +
      '<span class="tn' + (rank.metric === "crcl" ? " lead" : "") + '"><b class="' + (rank.metric === "crcl" ? (o.meets ? "v-ok" : "v-warn") : "") + '">' + fmt(o.crcl, 1) + "</b><i>CrCl L/wk/1.73 m²</i></span>" +
      '<span class="tn uf"><b>' + esc(ufText(o)) + "</b><i>" + esc(ufSub) + ' <em class="exp">experimental</em></i></span></span>' +
      sibTxt +
      '<span class="top-foot">' + badge + '<span class="est-mini">model estimate, not measured</span></span></span></' + tag + "></li>"
    );
  }

  function renderTop(listId, noteId, rank, r, pickable) {
    const el = $(listId);
    const note = noteId ? $(noteId) : null;
    if (!rank || !rank.top.length) {
      el.innerHTML = '<li class="top-empty">Enter body size and transport type to see options.</li>';
      if (note) note.classList.add("hidden");
      return;
    }
    const tgtTxt = rank.metric === "ktv" ? "Kt/V " + fmt(rank.target, 1) : "CrCl " + fmt(rank.target, 0);
    if (note) {
      if (!rank.anyMeet) { note.textContent = "None of these options reaches the target (" + tgtTxt + "). Showing the 3 highest-clearance options."; note.classList.remove("hidden"); }
      else if (rank.meetCount < rank.top.length) { note.textContent = "Only " + rank.meetCount + " option" + (rank.meetCount === 1 ? "" : "s") + " reach" + (rank.meetCount === 1 ? "es" : "") + " the target (" + tgtTxt + "); the rest are the highest-clearance options below it."; note.classList.remove("hidden"); }
      else note.classList.add("hidden");
    }
    el.innerHTML = rank.top.map((o, i) => topItemHtml(o, i, rank, pickable !== false, r)).join("");
  }

  function renderResults(r) {
    const bits = [];
    if (F.isNum(r.V)) bits.push(state.sex === "female" ? "Female" : "Male");
    if (F.isNum(r.inp.age)) bits.push(r.inp.age + " y");
    if (F.isNum(r.htCm)) bits.push(r.inp.ft + " ft " + (r.inp.inch || 0) + " in");
    if (F.isNum(r.wtKg)) bits.push(fmt(r.wtKg, 1) + " kg");
    if (F.isNum(r.V)) bits.push("V " + fmt(r.V, 1) + " L");
    if (F.isNum(r.bsa)) bits.push("BSA " + fmt(r.bsa, 2) + " m²");
    if (r.cat) bits.push(r.cat.label + (r.typeOnly ? " (typical)" : r.numCat ? " (PET)" : ""));
    bits.push(r.urineMl > 0 ? fmt(r.urineMl, 0) + " mL/day urine" + (r.res ? "" : " (not counted)") : "anuric");
    setText("sum-line", bits.join(" · "));
    const rb = $("rank-basis");
    const anyRank = r.rankCapd || r.rankCcpd;
    let basis = "";
    if (!r.ready) basis = "Enter body size and a transport type (or PET numbers) on step 1.";
    else if (anyRank && anyRank.metric === "ktv") basis = "Ranked by estimated total weekly Kt/V against your target of " + fmt(r.ktvTarget, 2).replace(/0$/, "") + " (CrCl shown alongside)." + (r.basis ? " " + r.basis : "");
    else basis = "Ranked by weekly CrCl: Kt/V could not be estimated. Reference " + CRCL_TARGET + " L/week/1.73 m² (historical CAPD figure).";
    rb.textContent = basis;
    rb.classList.toggle("warn-note", r.ready && (!!r.typical || (!!anyRank && anyRank.metric === "crcl")));

    renderTop("top-capd", "top-capd-note", r.rankCapd, r);
    renderTop("top-ccpd", "top-ccpd-note", r.rankCcpd, r);
    renderUfNote(r);
    renderGrid(r);
    renderOptions(r);
    renderRx(r);
  }

  function renderUfNote(r) {
    const el = $("uf-note");
    if (!r.cat) { el.textContent = "Pick a transport type to see predicted UF."; return; }
    el.innerHTML =
      "Daily peritoneal UF on the cards comes from an open three-pore model (Rippe; Öberg &amp; Rippe 2017) with the published typical-patient membrane parameters for a " + esc(r.cat.label.toLowerCase()) + " transporter (Akonur 2016). It assumes 1.5% dextrose for exchanges and cycles and 2.5% dextrose for the long dwell, fluid absorption 0.6 mL/min and residual volume 10% of fill (PD Adequest defaults). " +
      "<b>Experimental:</b> against the published Akonur 2016 predictions it differs by up to about 250 mL per period (RMSE about 110 mL), so it is not validated. Extraneal UF is the published typical value for the long dwell (" + TPM.ICO_PUBLISHED_UF.capd[r.cat.key] + " mL CAPD 9-h; " + TPM.ICO_PUBLISHED_UF.ccpd[r.cat.key] + " mL APD 15-h; Akonur 2016 Table 3), not simulated. UF never changes Kt/V or the ranking.";
  }

  function renderGrid(r) {
    const body = $("grid-body");
    const key = $("grid-key");
    if (!r.grid) {
      key.textContent = "Needs body size (for the urea-volume band) and a transport type.";
      body.innerHTML = "";
      setText("grid-src", "");
      return;
    }
    const g = r.grid;
    const vTxt = { V1: "V < 34 L", V2: "V 34 to < 42 L", V3: "V ≥ 42 L" }[g.vBand];
    key.textContent = r.cat.label + " transport · " + vTxt + " (Watson " + fmt(r.V, 1) + " L) · residual urea clearance " + (g.rkfBand === "lt2" ? "< 2" : "≥ 2") + " mL/min" + (r.gridRkfAssumed ? " (assumed: urine entered without urine and serum urea)" : F.isNum(r.kruMlMin) && r.kruMlMin > 0 ? " (" + fmt(r.kruMlMin, 1) + " mL/min)" : " (anuric)") + ".";
    const rows = (mod) =>
      g[mod].map((x) => '<li class="gr-row' + (x.flag ? " flagged" : "") + '"><span>' + esc(x.label) + "</span>" + (x.flag ? '<span class="gr-flag">Unverified: ' + esc(x.flag) + "</span>" : "") + "</li>").join("");
    body.innerHTML =
      '<h3 class="sub-h">CAPD (8-h overnight)</h3><ul class="gr-list">' + rows("capd") + "</ul>" +
      '<h3 class="sub-h">APD (9-h cycler)</h3><ul class="gr-list">' + rows("ccpd") + "</ul>";
    setText("grid-src", "Published PD Adequest 2.0 modelling, shown as published, not computed here. Targets: Kt/V ≥ 1.7 and UF ≥ 1 L/day; 1.5%/2.5% dextrose and icodextrin only. Source: " + g.source + ".");
  }

  function renderOptions(r) {
    const el = $("opt-table");
    const basis = $("opt-basis");
    if (!r.options) {
      el.innerHTML = "";
      basis.textContent = "Enter body size and a transport type to compare options.";
      return;
    }
    const kt = (v) => (F.isNum(v) ? '<span class="' + (v >= r.ktvTarget - 1e-9 ? "ok-v" : "warn-v") + '">' + fmt(v, 2) + "</span>" : "—");
    const out = ['<div class="op-row head four"><span>Option</span><span>Kt/V</span><span>CrCl</span><span>UF L/d*</span></div>'];
    let grp = "";
    r.options.forEach((o) => {
      if (o.mod !== grp) {
        grp = o.mod;
        out.push('<div class="op-row grp"><span>' + (grp === "capd" ? "CAPD · 8-h overnight long dwell" : "CCPD · 9 h on cycler") + "</span></div>");
      }
      const ico = o.longSolution === "icodextrin";
      const label = ico ? "+ Extraneal long dwell" : o.label.replace(/^(CAPD|CCPD) /, "").replace(", 9 h", "").replace(" + 2.0 L day dwell", " + 2 L day") + (o.longSolution === "dextrose" ? " · dextrose" : "");
      out.push('<div class="op-row four' + (ico ? " ico" : "") + '"><span class="ol">' + esc(label) + "</span><span>" + kt(o.ktv) + "</span><span>" + fmt(o.crcl, 1) + "</span><span>" + esc(ufText(o)) + "</span></div>");
    });
    el.innerHTML = out.join("");
    let b = "Weekly totals (renal included when entered). Kt/V green at or above your target, amber below; CrCl in L/week/1.73 m². *UF: experimental three-pore prediction (Extraneal rows: published long-dwell value).";
    if (r.basis) b = r.basis + " " + b;
    basis.textContent = b;
  }

  function pickedRow(r) {
    if (!r.options) return null;
    return r.options.find((o) => o.id === state.pick) || (r.rankCapd && r.rankCapd.top[0]) || null;
  }

  function renderRx(r) {
    const o = pickedRow(r);
    const est = o ? { measured: false, ktvTotal: o.ktv, ktvP: o.ktvP, ktvR: o.ktvR, crcl: o.crcl } : {};
    const ico = o && o.longSolution === "icodextrin";
    const p = o ? o.opt : null;
    const rx = RX.build({
      modality: p && p.mod === "ccpd" ? "apd" : "capd",
      capd: p && p.mod === "capd" ? { exchanges: p.exchanges, fillL: p.fillL, longDwellH: p.longDwellH, longSolution: ico ? "ico" : "same" } : {},
      apd: p && p.mod === "ccpd" ? { cycles: p.cycles, fillL: p.fillL, therapyH: p.therapyH, lastFillL: p.lastFillL, lastSolution: ico ? "ico" : null } : {},
      estimate: est,
      uf: o && o.uf ? o.uf : null,
      transport: r.cat ? r.cat.label : null,
      basis: r.basis || null,
    });
    renderSheet($("rx-sheet"), rx);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    state.pick = b.getAttribute("data-pick");
    state.cur = state.pick;
    recalc();
    const card = $("rx-card");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ── Step 3: current prescription, labs, adequacy, updated choices ── */
  function currentId(r) {
    if (!r.options) return null;
    if (state.cur && r.options.some((o) => o.id === state.cur)) return state.cur;
    const p = pickedRow(r);
    return p ? p.id : null;
  }
  function fillCurrentSelect(r) {
    const sel = $("cur-rx");
    if (!r.options) { sel.innerHTML = '<option value="">Complete step 1 first</option>'; return; }
    const id = currentId(r);
    const sig = r.options.map((o) => o.id).join();
    if (sel.dataset.sig !== sig) {
      sel.innerHTML = r.options.map((o) => '<option value="' + esc(o.id) + '">' + esc(fullName(o) + (o.opt.mod === "capd" ? "" : "")) + "</option>").join("");
      sel.dataset.sig = sig;
    }
    if (id) sel.value = id;
  }
  $("cur-rx").addEventListener("change", (e) => {
    state.cur = e.target.value;
    recalc();
  });

  function kv(k, v, cls) {
    return '<div class="rx-row"><span class="rk">' + esc(k) + '</span><span class="rv ' + (cls || "") + '">' + v + "</span></div>";
  }

  function renderAdequacy(r) {
    const body = $("adeq-body");
    const L = r.lab;
    const cur = r.options ? r.options.find((o) => o.id === currentId(r)) : null;
    const curModel = L && L.curRow ? L.curRow : cur;
    const pendingN = unconfirmed.size;
    const warn = [];
    if (pendingN) warn.push(pendingN + " scanned value" + (pendingN === 1 ? " is" : "s are") + " waiting for confirmation and not used yet.");
    if (state.parseWarnings && state.parseWarnings.length) warn.push.apply(warn, state.parseWarnings);
    setText("lab-warn", warn.join(" "));
    if (!L || !L.any) {
      body.innerHTML = '<p class="note">Enter or scan new labs above. The model estimate for the current prescription is ' +
        (cur ? "weekly Kt/V " + fmt(cur.ktv, 2) + " and CrCl " + fmt(cur.crcl, 1) + "." : "not available until step 1 is complete.") + "</p>";
      $("adeq-chip").textContent = "no labs yet";
      renderUpdate(r);
      return;
    }
    const m = L.m || {};
    const rows = [];
    if (F.isNum(m.ktv)) {
      const met = m.meets;
      rows.push(kv("Measured weekly Kt/V", "<b>" + fmt(m.ktv, 2) + "</b>" + (m.source === "collection" ? " (peritoneal " + fmt(m.ktvP, 2) + (F.isNum(m.ktvR) ? " + renal " + fmt(m.ktvR, 2) : "") + ")" : " (as reported)")));
      rows.push(kv("Target", fmt(r.ktvTarget, 2) + ' <span class="' + (met ? "badge-ok" : "badge-warn") + '">' + (met ? "Met" : "Not met") + "</span>"));
      if (F.isNum(m.crcl)) rows.push(kv("Measured weekly CrCl", fmt(m.crcl, 1) + " L/week/1.73 m²"));
      if (cur) rows.push(kv("Model estimate for " + fullName(cur) + " before these labs", "Kt/V " + fmt(cur.ktv, 2)));
    } else rows.push(kv("Measured weekly Kt/V", "needs 24-h dialysate volume, dialysate urea and serum urea, or a reported Kt/V"));
    if (F.isNum(L.labs.dialVolL) && cur) {
      const instilled = F.optionDwells(cur.opt, null).reduce((a, d) => a + d.fillL, 0);
      const ufMeas = (L.labs.dialVolL - instilled) * 1000;
      rows.push(kv("Measured daily UF", fmt(ufMeas / 1000, 2) + " L (drain " + fmt(L.labs.dialVolL, 2) + " − instilled " + fmt(instilled, 1) + " L)" + (cur.uf ? " · predicted " + ufText(cur) + " L (experimental)" : "")));
      if (ufMeas < 0) rows.push('<p class="note flag-text">The 24-h drain is less than the volume instilled by the selected current prescription. Check that the right current prescription is selected and that the collection is complete before using the fitted clearance.</p>');
    }
    if (m.rkf) rows.push(kv("Renal urea clearance", fmt(m.rkf.ureaMlMin, 2) + " mL/min" + (F.isNum(m.ktvR) ? " · renal Kt/V " + fmt(m.ktvR, 2) : "")));
    L.msgs.forEach((t) => rows.push('<p class="note">' + esc(t) + "</p>"));
    body.innerHTML = '<div class="rx-rows">' + rows.join("") + "</div>";
    $("adeq-chip").textContent = m.source === "collection" ? "measured 24-h" : m.source === "entered" ? "reported" : "labs entered";
    renderUpdate(r);
  }

  function renderUpdate(r) {
    const L = r.lab;
    const basis = $("upd-basis");
    const diff = $("upd-diff");
    if (!L || !L.any || !L.r) {
      basis.textContent = "New prescription choices appear here once confirmed labs are entered.";
      diff.innerHTML = "";
      renderTop("upd-capd", null, r.rankCapd, r, false);
      renderTop("upd-ccpd", null, r.rankCcpd, r, false);
      $("lab-adopt").disabled = true;
      return;
    }
    const nr = L.r;
    basis.textContent = (nr.basis || "Using the new labs.") + " Ranked by " + (nr.rankCapd && nr.rankCapd.metric === "crcl" ? "weekly CrCl" : "weekly Kt/V") + ".";
    const name = (id) => {
      const o = (nr.options || []).concat(r.options || []).find((x) => x.id === id);
      return o ? fullName(o) : id;
    };
    const d = (lbl, df) => {
      const parts = [];
      if (df.added.length) parts.push("<b>New:</b> " + df.added.map((id) => esc(name(id))).join("; "));
      if (df.removed.length) parts.push("<b>Dropped:</b> " + df.removed.map((id) => esc(name(id))).join("; "));
      if (!parts.length) parts.push("Same top 3 as before.");
      return '<p class="note diff-line"><span class="diff-h">' + lbl + "</span> " + parts.join(" · ") + "</p>";
    };
    let curTxt = "";
    const curId = currentId(r);
    const before = r.options ? r.options.find((o) => o.id === curId) : null;
    const after = L.curRow;
    if (before && after) curTxt = '<p class="note diff-line"><span class="diff-h">Current Rx</span> ' + esc(fullName(after)) + ": Kt/V " + fmt(before.ktv, 2) + " → <b>" + fmt(after.ktv, 2) + "</b> (" + (after.meets !== undefined ? "" : "") + (F.isNum(after.ktv) && after.ktv >= nr.ktvTarget - 1e-9 ? "meets" : "below") + " target)</p>";
    diff.innerHTML = curTxt + d("CAPD", L.diffCapd) + d("CCPD", L.diffCcpd);
    renderTop("upd-capd", null, nr.rankCapd, nr, false);
    renderTop("upd-ccpd", null, nr.rankCcpd, nr, false);
    $("lab-adopt").disabled = false;
  }

  // OCR / paste → UNCONFIRMED values
  function applyParsed(res) {
    const keys = Object.keys(res.values);
    keys.forEach((k) => {
      const id = LAB_IDS[k];
      if (!id) return;
      $(id).value = String(res.values[k].value);
      unconfirmed.add(k);
      markField(k);
    });
    state.parseWarnings = res.warnings;
    setText("scan-msg", keys.length ? keys.length + " value" + (keys.length === 1 ? "" : "s") + " found. Check each highlighted value against the report and tap Confirm." : "No recognizable lab values found. Enter them by hand.");
    recalc();
  }
  function markField(k) {
    const wrap = $(LAB_IDS[k] + "-wrap");
    if (!wrap) return;
    const on = unconfirmed.has(k);
    wrap.classList.toggle("unconfirmed", on);
    let b = wrap.querySelector(".confirm-btn");
    if (on && !b) {
      b = document.createElement("button");
      b.type = "button";
      b.className = "confirm-btn";
      b.textContent = "Confirm";
      b.setAttribute("data-confirm", k);
      wrap.appendChild(b);
    }
    if (!on && b) b.remove();
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-confirm]");
    if (!b) return;
    e.preventDefault();
    unconfirmed.delete(b.getAttribute("data-confirm"));
    markField(b.getAttribute("data-confirm"));
    recalc();
  });
  $("scan-parse").addEventListener("click", () => applyParsed(LP.parse($("scan-text").value)));
  $("scan-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    setText("scan-msg", "Loading the on-device reader (first use about 10 MB from this app)…");
    window.PdOcr.recognize(f, (p, s) => setText("scan-msg", (s || "Reading") + "… " + Math.round(p * 100) + "%"))
      .then((text) => {
        $("scan-text").value = text;
        applyParsed(LP.parse(text));
      })
      .catch((err) => setText("scan-msg", "Could not read the photo: " + (err && err.message ? err.message : err) + ". Enter the values by hand."));
  });
  // Typing in a lab field by hand confirms that field.
  document.addEventListener("input", (e) => {
    const wrap = e.target && e.target.closest && e.target.closest(".lab-field");
    if (wrap && unconfirmed.has(wrap.dataset.lab)) {
      unconfirmed.delete(wrap.dataset.lab);
      markField(wrap.dataset.lab);
    }
  }, true);

  // Loop: adopt confirmed labs as the new baseline, then clear the lab form.
  $("lab-adopt").addEventListener("click", () => {
    const L = last.lab;
    if (!L || !L.any) return;
    const labs = L.labs;
    const setv = (id, v) => { if (F.isNum(v)) $(id).value = String(v); };
    if (anyKey(labs, ["dpcr", "dpu", "petDrain"])) {
      $("pet-nums").open = true;
      setv("pet-dpcr", labs.dpcr); setv("pet-dpu", labs.dpu); setv("pet-drain", labs.petDrain);
    }
    if (F.isNum(labs.urineMl)) {
      $("rkf-details").open = true;
      setv("l-uvol", labs.urineMl); setv("l-uu", labs.urineUrea); setv("l-pu", labs.serumUrea); setv("l-ucr", labs.urineCr); setv("l-pcr", labs.serumCr);
    }
    state.calib = L.fit ? L.fit : anyKey(labs, ["dpcr", "dpu", "petDrain"]) ? null : state.calib;
    Object.values(LAB_IDS).forEach((id) => ($(id).value = ""));
    unconfirmed.clear();
    Object.keys(LAB_IDS).forEach(markField);
    state.parseWarnings = [];
    $("scan-text").value = "";
    setText("scan-msg", "Labs adopted. Step 2 now shows the updated choices; enter the next labs here when available.");
    recalc();
  });

  /* ── Step 4: troubleshoot ── */
  $("ts-problem").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    state.problem = b.getAttribute("data-problem");
    $$(".chip", $("ts-problem")).forEach((c) => {
      const on = c === b;
      c.classList.toggle("is-on", on);
      c.setAttribute("aria-checked", on ? "true" : "false");
    });
    recalc();
  });
  function renderTroubleshoot(r) {
    const problem = state.problem || "clearance";
    $("ts-rkf").classList.toggle("hidden", problem !== "rkf");
    // Work from the newest data: labs if entered, else baseline
    let R = r.lab && r.lab.r ? r.lab.r : r;
    let note = "";
    if (problem === "rkf") {
      const nu = num("ts-uvol"), nk = num("ts-ktvr");
      if (F.isNum(nu) || F.isNum(nk)) {
        const inp2 = Object.assign({}, r.lab && r.lab.inp ? r.lab.inp : r.inp);
        if (F.isNum(nu)) inp2.uvol = nu;
        inp2.ktvROverride = F.isNum(nk) ? nk : F.isNum(nu) && nu === 0 ? 0 : undefined;
        if (inp2.ktvROverride === undefined) delete inp2.ktvROverride;
        R = compute(inp2);
        note = "Recomputed with the new residual function" + (F.isNum(R.ktvR) ? " (renal Kt/V " + fmt(R.ktvR, 2) + ")" : "") + ".";
      } else note = "Enter the new urine output and renal Kt/V to recompute.";
    }
    const curId = currentId(r);
    const cur = R.options ? R.options.find((o) => o.id === curId) : null;
    setText("ts-cur", cur ? "Current prescription: " + fullName(cur) + " — model Kt/V " + fmt(cur.ktv, 2) + ", CrCl " + fmt(cur.crcl, 1) + ", predicted UF " + ufText(cur) + " L/day (experimental). " + note : "Complete steps 1–2 (and pick the current prescription on step 3).");
    const sg = $("ts-sugg");
    if (!cur) { sg.innerHTML = ""; }
    else {
      const list = W.troubleshoot(problem === "rkf" ? "clearance" : problem, cur, R.options, R.ktvTarget);
      const sign = (x, d, u) => (F.isNum(x) ? (x >= 0 ? "+" : "−") + fmt(Math.abs(x), d) + (u || "") : "—");
      sg.innerHTML = list.length
        ? '<div class="ts-list">' + list.map((s) =>
            '<div class="ts-row"><div class="ts-h"><b>' + esc(s.label) + "</b> → " + esc(fullName(s.row)) + "</div>" +
            '<div class="ts-n"><span>Kt/V ' + fmt(s.row.ktv, 2) + " (" + sign(s.dKtv, 2) + ")</span><span>CrCl " + fmt(s.row.crcl, 1) + " (" + sign(s.dCrcl, 1) + ")</span><span>UF " + ufText(s.row) + " L/d (" + sign(F.isNum(s.dUfMl) ? s.dUfMl / 1000 : null, 2) + ")*</span></div>" +
            (s.meetsKtv === true ? '<span class="badge-ok">Meets Kt/V target</span>' : s.meetsKtv === false ? '<span class="badge-warn">Below Kt/V target</span>' : "") + "</div>").join("") +
          '</div><p class="note">Same model and assumptions as step 2, one change at a time from the current prescription. *UF is the experimental three-pore prediction (Extraneal: published long-dwell value). Model estimates, not measured; confirm with a 24-h collection.</p>'
        : '<p class="note">No one-step change in the candidate set (CAPD up to 5 × 3.0 L; CCPD up to 5 × 2.5 L).</p>';
    }
    $("ts-guide").innerHTML = W.GUIDANCE[problem].map((g) => '<blockquote class="gq"><p>“' + esc(g.text) + '”</p><cite>' + esc(g.src) + "</cite></blockquote>").join("");
  }

  /* theme (in-memory only) */
  function currentTheme() {
    if (document.documentElement.hasAttribute("data-theme")) return document.documentElement.getAttribute("data-theme");
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  $("theme-btn").addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    $("theme-icon").innerHTML =
      next === "dark"
        ? '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4"/>'
        : '<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>';
  });

  /* About sheets: equations and sources (same text as CONTENT_REVIEW.md) */
  const ABOUT = {
    v: {
      title: "Urea volume (V) and BSA",
      html: `<h4>Equations</h4>
        <p class="eq">Watson (used), male: 2.447 − 0.09516×age + 0.1074×H + 0.3362×W<br>Watson, female: −2.097 + 0.1069×H + 0.2466×W<br>
        Hume-Weyers, male: 0.194786×H + 0.296785×W − 14.012934<br>Hume-Weyers, female: 0.344547×H + 0.183809×W − 35.270121<br>
        BSA (Mosteller) = √(H × W / 3600)</p>
        <p>H in cm, W in kg, V in litres.</p>
        <h4>Sources</h4>
        <p>KDOQI 2006 PD Adequacy CPR 2.6: “When calculating Kt/V urea, one should estimate V from either the Watson or Hume equation in adults.” It adds that ideal or standard weight should be considered.</p>
        <p>Watson PE et al. <em>Am J Clin Nutr.</em> 1980;33:27-39. Hume R, Weyers E. <em>J Clin Pathol.</em> 1971;24:234-238. Mosteller RD. <em>N Engl J Med.</em> 1987;317:1098.</p>
        <h4>Caveats</h4><p>Anthropometric estimates, not measured water. The app uses the weight you enter.</p>`,
    },
    pet: {
      title: "PET transport categories",
      html: `<h4>4-h D/P creatinine (Twardowski)</h4>
        <p class="eq">Low 0.34–0.49 · Low-average 0.50–0.64 · High-average 0.65–0.81 · High 0.82–1.03</p>
        <h4>4-h D/D₀ glucose</h4>
        <p class="eq">High 0.12–0.25 · High-average 0.26–0.38 · Low-average 0.39–0.49 · Low 0.50–0.61</p>
        <p>Category follows D/P creatinine; D/D₀ is supportive and discordance is flagged.</p>
        <h4>Transport type only</h4>
        <p>Picking a type without PET numbers uses typical values for that type: the midpoint of the Twardowski D/P creatinine band (Low 0.415 · Low-average 0.57 · High-average 0.73 · High 0.925) and the midpoint of the 4-h drain volume listed for the same class (Low 2,989 · Low-average 2,510 · High-average 2,226 · High 1,832 mL; Twardowski, <em>Semin Dial.</em> 1990;3:141-142). No published typical D/P urea by type was found. Instead Kt/V uses the published typical-patient urea MTAC for the type (PD Adequest 2.0 estimates, TARGET cohort; Akonur A et al. <em>Perit Dial Int.</em> 2016;36:79-84, Table 1: High 27.71 · High-average 23.14 · Low-average 18.40 · Low 15.92 mL/min) and creatinine MTAC (Akonur A et al. <em>Perit Dial Int.</em> 2013;33:646-654, Table 1: High 19.15 · High-average 11.92 · Low-average 8.60 mL/min; no Low value, so Low uses the band midpoint) in the same Garred model. This is a typical-patient estimate from published Adequest-derived parameters, not measured. Entered PET numbers always win.</p>
        <h4>UF screen (ISPD 2021, GRADE 1B)</h4>
        <p>Insufficient UF if 4-h net UF &lt; 400 mL on 4.25% dextrose, or &lt; 100 mL on 2.5% dextrose.</p>
        <h4>Sources</h4>
        <p>Twardowski ZJ et al. Peritoneal equilibration test. <em>Perit Dial Bull.</em> 1987;7:138-147 (2 L of 2.5% dextrose, 4-h dwell); bands as in Twardowski, <em>Blood Purif.</em> 1989;7:95-108. Morelle J et al. ISPD recommendations for the evaluation of peritoneal membrane dysfunction in adults. <em>Perit Dial Int.</em> 2021;41:352-372.</p>
        <h4>Caveats</h4><p>ISPD 2021 prefers local distributions over historical bands. Correct dialysate creatinine for glucose if your lab requires it.</p>`,
    },
    rkf: {
      title: "Residual kidney function",
      html: `<h4>Equations</h4>
        <p class="eq">Renal urea clearance (L/day) = U<sub>urea</sub>/P<sub>urea</sub> × urine L<br>
        Renal weekly Kt/V = 7 × renal urea clearance / V<br>
        RKF = mean of renal urea and creatinine clearance<br>
        CrCl (L/week/1.73 m²) = 7 × L/day × 1.73 / BSA</p>
        <h4>Source</h4>
        <p>KDOQI 2006 PD Adequacy, Guideline 2 definitions: “The term RKF is used to refer to estimated GFR, measured as the average of C<sub>Cr</sub> and urea nitrogen clearance based on a 24-hour urine collection. Urine volume in 24 hours of 100 mL or less is considered to represent negligible RKF.”</p>`,
    },
    model: {
      title: "How the regimen estimate works",
      html: `<h4>Model</h4>
        <p>Garred simple diffusion model, volume-corrected form. The PET gives each solute's mass transfer area coefficient (MTAC); the same equation then estimates the end-of-dwell D/P for every dwell in the regimen.</p>
        <p class="eq">MTAC = (Vt / t) × ln[ V0 / (Vt × (1 − D/P)) ]<br>
        D/P = 1 − (V0 / Vt) × e<sup>−MTAC × t / Vt</sup><br>
        Daily Kt = Σ D/P × drain volume · Weekly Kt/V = 7 × Kt / V</p>
        <p>V0 = fill, Vt = drain (fill + net UF), t = dwell minutes, D<sub>0</sub> = 0 for fresh dialysate.</p>
        <h4>Sources</h4>
        <p>Garred LJ, Canaud B, Farrell PC. <em>ASAIO J.</em> 1983;6:131-137. Equation as written in Asghar RB et al. <em>Kidney Int.</em> 2003;64:1911-1915. Waniewski J et al. <em>Blood Purif.</em> 1991;9:129-141: “The differences between the simple models were small from the clinical point of view for urea, creatinine”.</p>
        <h4>What it does not do</h4>
        <ul><li>It is not a validated prescribing model and is not a copy of any commercial program. It cites published parameters derived with PD Adequest 2.0 (Akonur 2013/2016).</li>
        <li>Kt/V uses short-dwell UF 0 and the long-dwell UF you enter; the predicted (experimental) UF is shown separately and never changes Kt/V.</li>
        <li>MTAC is held constant: no fill-volume, posture or recruitment effect, no residual volume, no lymphatic absorption.</li>
        <li>No middle-molecule or sodium estimate.</li></ul>`,
    },
    options: {
      title: "Options compared and how they are ranked",
      html: `<h4>Candidate set</h4>
        <p class="eq">CAPD 3, 4 or 5 exchanges × 2.0, 2.5 or 3.0 L, 8-h overnight long dwell<br>
        CCPD 4 or 5 cycles × 2.0 or 2.5 L over 9 h, dry day or a 2.0 L day dwell (15 h)<br>
        Each option with a long dwell also with an Extraneal long dwell</p>
        <h4>Ranking</h4>
        <p>Metric: total weekly Kt/V (peritoneal + renal) when a D/P urea is available; otherwise weekly CrCl (L/week/1.73 m²). Target: Kt/V ≥ 1.7 by default (KDOQI 2006 minimum), or CrCl ≥ 60 (historical CANUSA-based CAPD figure, also used for CCPD here).</p>
        <p>Options meeting the target come first, least burdensome first. CAPD: fewer exchanges, then smaller fills. CCPD: dry day before a day dwell, then fewer cycles, then smaller fills. If fewer than 3 meet it, the rest are the highest-clearance options below target. The dextrose and Extraneal versions of a regimen count once (dextrose unless only Extraneal meets the target).</p>
        <h4>Sources</h4>
        <p>Handbook of Dialysis, 4th ed. (Daugirdas, Blake, Ing 2006), as reproduced in ISPD teaching slides: “4 x 2L ... is the typical prescription. 4 x 2.5L in larger patients with small RRF or anuric patients who weigh &gt;75 kg. 3 x 2L in smaller patients or in patients with good RRF.” CCPD: “3 to 5 cycles per 9 hour cycling session”, “Cycler dwell volumes - 2 to 2.5 L”, “Can start with NIPD if patient has good residual volume.” ADEMEX (Paniagua R et al. <em>J Am Soc Nephrol.</em> 2002;13:1307-1320) control arm: “four daily exchanges with 2 L”. Core Curriculum 2023 (<em>Am J Kidney Dis</em>): no more than 5 exchanges per night on the cycler. 3.0 L fills and 5 CAPD exchanges go beyond these quotes and are awaiting Dr D’s review.</p>
        <h4>Extraneal (icodextrin 7.5%)</h4>
        <p>Used once a day for the long dwell (CAPD overnight, CCPD day dwell). For Kt/V the Extraneal dwell is the same diffusion dwell (differs only if you enter a measured long-dwell UF). Its UF on the cards is the published typical-patient value by transport type (Akonur 2016 Table 3), not simulated.</p>
        <h4>Caveats</h4><p>Same Garred model and limits as the estimate. For Kt/V, short-dwell net UF counts as 0. CCPD fill/drain time counts as 0, which overstates dwell time. The 8-h CAPD overnight dwell is the low end of the usual 8–10 h. Burden ordering is a judgment, not a published rule.</p>`,
    },
    uf: {
      title: "Predicted UF (experimental)",
      html: `<h4>Model</h4>
        <p>Open three-pore model written from published equations (Rippe B et al. <em>Kidney Int.</em> 1991;40:315-325; Öberg CM, Rippe B. <em>Kidney Int Rep.</em> 2017;2:943-951; Bergling K, Lund University thesis 2023). Water crosses aquaporins (2%), small pores (90%) and large pores (8%) of LpS, driven by ΔP, protein oncotic pressure and the crystalloid osmotic gradient; glucose, urea and sodium follow the Patlak equation; lymphatic/fluid absorption is constant.</p>
        <p class="eq">J<sub>v,i</sub> = α<sub>i</sub>·LpS·[ΔP − σ<sub>prot,i</sub>·Δπ − RT Σ φσ<sub>i</sub>(C<sub>P</sub> − C<sub>D</sub>)]<br>dV/dt = ΣJ<sub>v,i</sub> − L<br>J<sub>s</sub> = J<sub>v,S</sub>(1−σ)(C<sub>P</sub> − C<sub>D</sub>e<sup>−Pe</sup>)/(1 − e<sup>−Pe</sup>)</p>
        <h4>Parameters</h4>
        <p>Per transport type LpS (LPA 0.0554–0.0575 mL/min/mmHg), A0/Δx and glucose MTAC: Akonur 2016 Table 1. σ glucose 0.028 / 0.001 / 1 and σ albumin 0.95 / 0.085 / 1 (small / large / aquaporin): Rippe B, Davies S. <em>Perit Dial Int.</em> 2011;31:249-258. Δπ 22 mmHg, dialysate Na 132 mmol/L, φ 0.93, plasma urea 20 mmol/L and glucose 6.5 mmol/L: Öberg &amp; Rippe 2017. ΔP 8 mmHg (“about 8 or 9 mmHg”): Bergling 2023. Time-dependent MTAC [1 + 0.66·e<sup>−0.02t</sup>]: Vonesh 1999 eq. A7. Fluid absorption 0.6 mL/min and residual volume 10% of fill: PD Adequest 2.0 defaults (Vonesh EF et al. <em>Perit Dial Int.</em> 1999;19:556-571).</p>
        <h4>Validation</h4>
        <p>Against the published PD Adequest-based predictions in Akonur 2016 Tables 3–4 (28 glucose cells, 2 L, residual 350 mL): RMSE about 111 mL, largest error about 245 mL (High transporter, 15-h 2.27% day dwell), and the order across transport types matches in every row. That is not close enough to call validated, so UF is labelled experimental and never changes Kt/V or the ranking.</p>
        <h4>Extraneal</h4><p>Not simulated (icodextrin fraction data are not published). Long-dwell UF is the published value: CAPD 9-h H 388 · HA 386 · LA 382 · L 389 mL; APD 15-h H 465 · HA 488 · LA 501 · L 524 mL (Akonur 2016 Table 3, 2 L fill). The app’s CAPD long dwell is 8 h.</p>`,
    },
    grid: {
      title: "Published Adequest prescription grid",
      html: `<h4>What it is</h4>
        <p>Feasible prescriptions found by PD Adequest 2.0 modelling of TARGET-cohort patients, by transport type × urea volume band (V1 &lt; 34 L, V2 34 to &lt; 42 L, V3 ≥ 42 L) × residual urea clearance (&lt; 2 or ≥ 2 mL/min). Targets: weekly urea Kt/V 1.7 and 1 L daily UF; only 1.5%/2.5% dextrose and icodextrin; CAPD 8-h overnight exchange; APD 9-h cycler time.</p>
        <h4>Sources</h4>
        <p>Akonur A, Firanek C, Gellens M, Hutchcraft A, Kathuria P, Sloand JA. Volume-based peritoneal dialysis prescription guide to achieve adequacy targets. <em>Perit Dial Int.</em> 2016;36:188-195, Figures 4–5. The same grid is in the Baxter PD Prescription Management Quick Reference Guide, pp. 10–11.</p>
        <h4>Verification</h4>
        <p>Transcribed from the paper’s figures and checked cell by cell against the text and colour squares of the guide. 9 rows differ or lack a colour square in the guide; they are marked “Unverified” with both readings. The paper’s reading is shown.</p>`,
    },
    labs: {
      title: "Labs and the loop",
      html: `<h4>Measured adequacy</h4>
        <p class="eq">Peritoneal Kt (L/day) = D<sub>urea</sub>/P<sub>urea</sub> × 24-h drain volume<br>Renal Kt (L/day) = U<sub>urea</sub>/P<sub>urea</sub> × urine volume<br>Weekly Kt/V = 7 × (Kt<sub>p</sub> + Kt<sub>r</sub>) / V (Watson)</p>
        <p>KDOQI 2006 PD Adequacy CPG 2 definitions (same as step 1).</p>
        <h4>Updated choices</h4>
        <p>A new PET replaces the transport category and MTACs. A 24-h collection (or a reported total Kt/V minus renal Kt/V) on the current prescription is used to fit the model’s urea MTAC, and creatinine MTAC when dialysate creatinine is given, so the same Garred model reproduces the measured clearance; every option is then re-estimated and re-ranked. “Use these labs as the new baseline” keeps the fit for the next round.</p>
        <h4>Caveats</h4><p>Fitting assumes the patient did the current prescription as written during the collection. Measured UF uses drain minus the nominal instilled volume; ISPD 2021 notes CAPD bag overfill can overstate UF by 400–800 mL/day.</p>`,
    },
    scan: {
      title: "Scan lab report",
      html: `<h4>On this device only</h4>
        <p>Text recognition runs in your browser with Tesseract.js 5.1.1 (Apache-2.0) and the tessdata_fast English model (Apache-2.0), bundled with the app (about 10 MB, loaded only on first scan). No upload, no network call to any other server, nothing saved: the photo and text are discarded after reading.</p>
        <h4>Confirm every value</h4>
        <p>The reader recognises labels such as D/P creatinine, D/P urea, dialysate / urine / serum urea and creatinine, volumes and Kt/V. Values found are highlighted and are not used until you tap Confirm (or type over them). Check units: dialysate, urine and serum must use the same units.</p>`,
    },
    targets: {
      title: "Targets",
      html: `<h4>ISPD 2020</h4>
        <p>Brown EA et al. <em>Perit Dial Int.</em> 2020;40:244-253. “There is no specific clearance target that guarantees sufficient dialysis for an individual. Increasing small solute clearance to a Kt/V &gt; 1.7 may improve uraemia-related symptoms, if present…” and “If symptoms, nutrition and volume are all controlled, no PD prescription change is needed for the sole purpose of reaching an arbitrary clearance target.”</p>
        <h4>KDOQI 2006</h4>
        <p>CPG 2.1.1: “The minimal ‘delivered’ dose of total small-solute clearance should be a total (peritoneal and kidney) Kt/V urea of at least 1.7 per week.” CPR 2.7: peritoneal C<sub>Cr</sub> “is of little added value for predicting risk for death; therefore, for simplicity, adequacy targets are based on urea kinetics only.” The older CANUSA-based C<sub>Cr</sub> figure of 60 L/wk/1.73 m² for CAPD is shown as history only.</p>`,
    },
  };
  const overlay = $("overlay");
  const sheet = $("sheet");
  let lastFocus = null;
  function openSheet(key) {
    const a = ABOUT[key];
    if (!a) return;
    lastFocus = document.activeElement;
    $("sheet-title").textContent = a.title;
    $("sheet-body").innerHTML = a.html;
    overlay.hidden = false;
    sheet.hidden = false;
    requestAnimationFrame(() => {
      overlay.classList.add("open");
      sheet.classList.add("open");
    });
    $("sheet-close").focus();
  }
  function closeSheet() {
    overlay.classList.remove("open");
    sheet.classList.remove("open");
    setTimeout(() => {
      overlay.hidden = true;
      sheet.hidden = true;
    }, 280);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-about]");
    if (btn) openSheet(btn.getAttribute("data-about"));
  });
  overlay.addEventListener("click", closeSheet);
  $("sheet-close").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && sheet.classList.contains("open")) closeSheet();
  });


  function renderSheet(el, rx) {
    const bits = [];
    rx.lines.forEach((line) => {
      const t = line.trim();
      if (!t || t === rx.title) return;
      const i = t.indexOf(":");
      if (i < 0) {
        bits.push('<div class="' + (t === rx.footer || /^Estimated from typical/.test(t) ? "rx-note" : "rx-section") + '">' + esc(t) + "</div>");
        return;
      }
      const v = t.slice(i + 1).trim();
      const rv = /^_+/.test(v) ? '<span class="line"></span>' : esc(v);
      bits.push('<div class="rx-row"><span class="rk">' + esc(t.slice(0, i)) + '</span><span class="rv">' + rv + "</span></div>");
    });
    el.innerHTML = '<div class="rx-rows machine">' + bits.join("") + "</div>";
    el.dataset.text = rx.text;
  }

  $("rx-copy").addEventListener("click", () => {
    const btn = $("rx-copy");
    const text = $("rx-sheet").dataset.text || "";
    const done = () => {
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy"), 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(() => {});
  });
  $("rx-print").addEventListener("click", () => window.print());


  document.addEventListener("input", (e) => {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") && e.target.id !== "scan-text") recalc();
  });

  /* ── steps ── */
  const NEXT_LABEL = { 1: "Start prescription", 2: "Check adequacy", 3: "Troubleshoot" };
  function canLeaveStep(n) {
    if (n === 1 && !(F.isNum(last.V) && F.isNum(last.bsa))) {
      setText("p-msg", "Enter age, height and weight to continue.");
      $("p-msg").classList.add("warn-text");
      $("patient-card").scrollIntoView && $("patient-card").scrollIntoView({ block: "start" });
      return false;
    }
    if (n === 1 && !last.cat) {
      setText("pet-msg", "Pick a transport type, or enter the 4-h D/P creatinine, to continue.");
      $("pet-msg").classList.add("flag-text");
      $("pet-card").scrollIntoView && $("pet-card").scrollIntoView({ block: "start" });
      return false;
    }
    if (n === 1 && !last.ready) {
      setText("pet-msg", "These PET values give no valid MTAC; check D/P creatinine and drain volume.");
      $("pet-msg").classList.add("flag-text");
      return false;
    }
    return true;
  }
  function showStep(n) {
    currentStep = n;
    $$(".step").forEach((s) => s.classList.toggle("is-on", Number(s.dataset.step) === n));
    $$(".stepper-item", $("stepper")).forEach((btn) => {
      const g = Number(btn.dataset.go);
      btn.classList.toggle("is-on", g === n);
      btn.classList.toggle("is-done", g < n);
      if (g === n) btn.setAttribute("aria-current", "step");
      else btn.removeAttribute("aria-current");
    });
    document.body.classList.toggle("on-results", n > 1);
    $("step-back").disabled = n === 1;
    $("step-next").hidden = n === TOTAL_STEPS;
    $("step-next").textContent = NEXT_LABEL[n] || "Next";
    $("step-hint").hidden = n !== 1;
    window.scrollTo(0, 0);
  }
  $("step-back").addEventListener("click", () => currentStep > 1 && showStep(currentStep - 1));
  $("step-next").addEventListener("click", () => {
    if (currentStep < TOTAL_STEPS && canLeaveStep(currentStep)) showStep(currentStep + 1);
  });
  $("stepper").addEventListener("click", (e) => {
    const btn = e.target.closest(".stepper-item");
    if (!btn) return;
    const go = Number(btn.dataset.go);
    if (go < currentStep) return showStep(go);
    for (let i = currentStep; i < go; i++) if (!canLeaveStep(i)) return;
    showStep(go);
  });

  if (!CFG.DRAFT) {
    const b = $("draft-banner");
    if (b) b.remove();
  }
  showStep(1);
  recalc();
})();

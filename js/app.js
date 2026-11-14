/**
 * PD Buddy — UI. Five inputs → Top 3 CAPD and Top 3 CCPD. Live results, no Calculate button.
 * Inputs are never stored. No network after first load.
 */
(function () {
  "use strict";

  const F = window.PdFormulas;
  const CFG = window.PdConfig;
  const RX = window.PdPrescription;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const TOTAL_STEPS = 2;
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
  const state = { sex: "male", wunit: "kg", ptype: null, pick: null };
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
  let last = {};
  const KTV_DEFAULT = F.TARGETS.KTV_HISTORICAL_MIN;
  const CRCL_TARGET = F.TARGETS.CRCL_HISTORICAL_CAPD;

  function recalc() {
    const r = {};
    const wp = document.querySelector("#p-wt-wrap .unit-pill");
    if (wp) wp.textContent = state.wunit;

    // 1–2. Body size → V (Watson) and BSA (Mosteller)
    const age = num("p-age");
    const ht = safe(() => F.ftInToCm(num("p-ft"), num("p-in")));
    const wIn = num("p-wt");
    const wt = state.wunit === "lb" ? safe(() => F.lbToKg(wIn)) : wIn;
    r.htCm = ht;
    r.wtKg = wt;
    r.V = safe(() => F.watsonV(state.sex, age, ht, wt));
    if (F.isNum(r.V) && r.V <= 0) r.V = null;
    r.bsa = safe(() => F.bsaMosteller(ht, wt));
    setText("o-v", F.isNum(r.V) ? fmt(r.V, 1) + " L" : "—");
    setText("o-bsa", F.isNum(r.bsa) ? fmt(r.bsa, 2) + " m²" : "—");
    const conv = [];
    if (F.isNum(ht)) conv.push(fmt(ht, 1) + " cm");
    if (F.isNum(wt) && state.wunit === "lb") conv.push(fmt(wt, 1) + " kg");
    setText("p-msg", conv.length ? "= " + conv.join(", ") + "." : "");
    $("p-msg").classList.remove("warn-text");

    // 3. Transport: picked type, or PET numbers (numbers win)
    const dpcr = num("pet-dpcr"), dpu = num("pet-dpu"), drainIn = num("pet-drain");
    r.numCat = safe(() => F.petCategoryCr(dpcr));
    r.typeCat = state.ptype ? safe(() => F.typicalPet(state.ptype)) : null;
    r.cat = r.numCat ? r.numCat : r.typeCat ? { key: r.typeCat.key, label: r.typeCat.label, outside: null } : null;
    const typ = r.cat ? F.typicalPet(r.cat.key) : null; // typical values for the category in use
    r.dpCrUsed = r.numCat ? dpcr : typ ? typ.dpCr : null;
    r.drainMlUsed = F.isNum(drainIn) && drainIn > 0 ? drainIn : typ ? typ.drainMl : null;
    r.drainTypical = !(F.isNum(drainIn) && drainIn > 0);
    r.dpCrTypical = !r.numCat;
    r.typical = !!r.typeCat && !r.numCat && !F.isNum(dpu) && r.drainTypical;
    const fillL = F.TARGETS.PET_FILL_L;
    const drainL = F.isNum(r.drainMlUsed) ? r.drainMlUsed / 1000 : null;
    r.mtacCr = F.isNum(r.dpCrUsed) ? safe(() => F.garredMtac(r.dpCrUsed, fillL, drainL, F.TARGETS.PET_MINUTES)) : null;
    r.mtacU = F.isNum(dpu) && F.isNum(drainL) ? safe(() => F.garredMtac(dpu, fillL, drainL, F.TARGETS.PET_MINUTES)) : null;
    r.basis = r.typical ? "Estimated from typical values for " + r.typeCat.label.toLowerCase() + " transporters — enter PET numbers for a patient-specific estimate." : "";
    let petMsg = "";
    let flag = false;
    if (!r.cat) petMsg = F.isNum(dpu) ? "Pick a transport type or enter D/P creatinine as well." : "Pick a transport type, or open PET numbers.";
    else if (r.typical) petMsg = "Typical " + r.typeCat.label.toLowerCase() + " values: D/P creatinine " + fmt(typ.dpCr, 3) + ", PET drain " + fmt(typ.drainMl, 0) + " mL (Twardowski band midpoints). No typical D/P urea exists, so Kt/V needs your PET numbers; options are ranked by CrCl.";
    else {
      const used = [];
      used.push("D/P creatinine " + fmt(r.dpCrUsed, 2) + (r.dpCrTypical ? " (typical)" : ""));
      if (F.isNum(dpu)) used.push("D/P urea " + fmt(dpu, 2));
      used.push("drain " + fmt(r.drainMlUsed, 0) + " mL" + (r.drainTypical ? " (typical for " + r.cat.label.toLowerCase() + ")" : ""));
      petMsg = r.cat.label + " transport. Using " + used.join(", ") + ".";
      if (r.numCat && r.numCat.outside) petMsg += " D/P creatinine is " + r.numCat.outside + " the published range (0.34–1.03).";
      if (r.numCat && r.typeCat && r.numCat.key !== r.typeCat.key) {
        petMsg += " PET numbers give " + r.numCat.label + ", not the picked " + r.typeCat.label + ". Using the numbers.";
        flag = true;
      }
      if (F.isNum(dpu) && !F.isNum(r.mtacU)) {
        petMsg += " D/P urea and drain give no valid urea MTAC; check the values.";
        flag = true;
      }
      if (!F.isNum(dpu)) petMsg += " Add D/P urea to rank by Kt/V.";
    }
    setText("pet-msg", petMsg);
    $("pet-msg").classList.toggle("flag-text", flag);
    $("pet-msg").classList.toggle("basis-note", !!r.typical);

    // 4. Residual urine (renal clearance only with urine + serum values)
    const uvol = num("l-uvol");
    r.urineMl = F.isNum(uvol) && uvol > 0 ? uvol : 0;
    const uu = num("l-uu"), pu = num("l-pu"), ucr = num("l-ucr"), pcr = num("l-pcr");
    r.res = r.urineMl > 0 ? safe(() => F.residual({ urineMl: r.urineMl, urineUrea: uu, plasmaUrea: pu, urineCr: ucr, plasmaCr: pcr })) : null;
    r.ktvR = r.res && F.isNum(r.V) ? F.weeklyKtv(r.res.ureaLDay, r.V) : null;
    r.rkfLDay = r.res && F.isNum(r.res.rkfLDay) ? r.res.rkfLDay : 0;
    r.rkfCrcl = r.res && F.isNum(r.res.rkfLDay) && F.isNum(r.bsa) ? F.weeklyCrCl173(r.res.rkfLDay, r.bsa) : null;
    let rm = "";
    let rflag = false;
    if (r.urineMl === 0) rm = "Anuric: ranking uses peritoneal clearance only.";
    else if (!r.res) {
      rm = "Not counted yet: urine volume alone does not give a clearance. Add urine and serum urea (and creatinine for CrCl) under Residual clearance details.";
      rflag = true;
    } else {
      rm = "Renal Kt/V " + (F.isNum(r.ktvR) ? fmt(r.ktvR, 2) : "—") + " added to every option";
      rm += F.isNum(r.rkfCrcl) ? "; RKF ≈ " + fmt(r.rkfCrcl, 1) + " L/week/1.73 m² added to CrCl." : "; add urine and serum creatinine to add RKF to CrCl.";
      if (!r.res.significant) rm += " Urine 100 mL/day or less: KDOQI 2006 treats RKF as negligible.";
    }
    setText("rkf-msg", rm);
    $("rkf-msg").classList.toggle("flag-text", rflag);

    // 5. Target
    const tk = num("t-ktv");
    r.ktvTarget = F.isNum(tk) && tk > 0 ? tk : KTV_DEFAULT;

    // Options and ranking
    r.ready = F.isNum(r.V) && F.isNum(r.bsa) && F.isNum(r.mtacCr);
    r.options = r.ready
      ? safe(() => F.candidateOptions({ mtacUrea: r.mtacU, mtacCr: r.mtacCr, V: r.V, bsa: r.bsa, ktvRenal: r.ktvR, rkfLDay: r.rkfLDay, longUfDextroseMl: num("o-uf-dex"), longUfIcodextrinMl: num("o-uf-ico") }))
      : null;
    if (r.options) {
      r.rankCapd = F.rankOptions(r.options, { mod: "capd", ktvTarget: r.ktvTarget, crclTarget: CRCL_TARGET });
      r.rankCcpd = F.rankOptions(r.options, { mod: "ccpd", ktvTarget: r.ktvTarget, crclTarget: CRCL_TARGET });
    }
    last = r;
    setText("step-hint", r.ready ? "" : "Fill in body size and transport type");
    renderResults(r);
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

  function renderTop(listId, noteId, rank, r) {
    const el = $(listId);
    const note = $(noteId);
    if (!rank || !rank.top.length) {
      el.innerHTML = '<li class="top-empty">Enter body size and transport type to see options.</li>';
      note.classList.add("hidden");
      return;
    }
    const tgtTxt = rank.metric === "ktv" ? "Kt/V " + fmt(rank.target, 1) : "CrCl " + fmt(rank.target, 0);
    if (!rank.anyMeet) {
      note.textContent = "None of these options reaches the target (" + tgtTxt + "). Showing the 3 highest-clearance options.";
      note.classList.remove("hidden");
    } else if (rank.meetCount < rank.top.length) {
      note.textContent = "Only " + rank.meetCount + " option" + (rank.meetCount === 1 ? "" : "s") + " reach" + (rank.meetCount === 1 ? "es" : "") + " the target (" + tgtTxt + "); the rest are the highest-clearance options below it.";
      note.classList.remove("hidden");
    } else note.classList.add("hidden");
    el.innerHTML = rank.top
      .map((o, i) => {
        const sel = state.pick === o.id;
        const ktv = F.isNum(o.ktv) ? fmt(o.ktv, 2) : "needs D/P urea";
        const badge = o.meets ? '<span class="badge-ok">Meets target</span>' : '<span class="badge-warn">Below target</span>';
        return (
          '<li><button type="button" class="top-item' + (sel ? " is-sel" : "") + '" data-pick="' + esc(o.id) + '">' +
          '<span class="top-rank">' + (i + 1) + "</span>" +
          '<span class="top-body"><span class="top-name">' + esc(shortName(o)) + (o.longSolution === "icodextrin" ? " · Extraneal" : "") + "</span>" +
          '<span class="top-words">' + esc(words(o)) + "</span>" +
          '<span class="top-nums"><span class="tn' + (rank.metric === "ktv" ? " lead" : "") + '"><b class="' + (F.isNum(o.ktv) ? (rank.metric === "ktv" ? (o.meets ? "v-ok" : "v-warn") : "") : "muted") + '">' + esc(ktv) + "</b><i>weekly Kt/V</i></span>" +
          '<span class="tn' + (rank.metric === "crcl" ? " lead" : "") + '"><b class="' + (rank.metric === "crcl" ? (o.meets ? "v-ok" : "v-warn") : "") + '">' + fmt(o.crcl, 1) + "</b><i>CrCl L/wk/1.73 m²</i></span></span>" +
          '<span class="top-foot">' + badge + '<span class="est-mini">model estimate, not measured</span></span></span></button></li>'
        );
      })
      .join("");
  }

  function renderResults(r) {
    // summary line
    const bits = [];
    if (F.isNum(r.V)) bits.push(state.sex === "female" ? "Female" : "Male");
    if (F.isNum(num("p-age"))) bits.push(num("p-age") + " y");
    if (F.isNum(r.htCm)) bits.push(num("p-ft") + " ft " + (num("p-in") || 0) + " in");
    if (F.isNum(r.wtKg)) bits.push(fmt(r.wtKg, 1) + " kg");
    if (F.isNum(r.V)) bits.push("V " + fmt(r.V, 1) + " L");
    if (F.isNum(r.bsa)) bits.push("BSA " + fmt(r.bsa, 2) + " m²");
    if (r.cat) bits.push(r.cat.label + (r.typical ? " (typical)" : r.numCat ? " (PET)" : ""));
    bits.push(r.urineMl > 0 ? fmt(r.urineMl, 0) + " mL/day urine" + (r.res ? "" : " (not counted)") : "anuric");
    setText("sum-line", bits.join(" · "));
    const rb = $("rank-basis");
    const anyRank = r.rankCapd || r.rankCcpd;
    let basis = "";
    if (!r.ready) basis = "Enter body size and a transport type (or PET numbers) on step 1.";
    else if (anyRank && anyRank.metric === "ktv") basis = "Ranked by estimated total weekly Kt/V against your target of " + fmt(r.ktvTarget, 2).replace(/0$/, "") + " (CrCl shown alongside).";
    else basis = "Ranked by weekly CrCl: Kt/V can’t be estimated without a 4-h D/P urea. Reference " + CRCL_TARGET + " L/week/1.73 m² (historical CAPD figure)." + (r.typical ? " Typical " + r.typeCat.label.toLowerCase() + " values, not this patient’s PET." : "");
    rb.textContent = basis;
    rb.classList.toggle("warn-note", r.ready && !!anyRank && anyRank.metric === "crcl");

    renderTop("top-capd", "top-capd-note", r.rankCapd, r);
    renderTop("top-ccpd", "top-ccpd-note", r.rankCcpd, r);
    renderOptions(r);
    renderRx(r);
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
    const out = ['<div class="op-row head"><span>Option</span><span>Kt/V</span><span>CrCl</span></div>'];
    let grp = "";
    r.options.forEach((o) => {
      if (o.mod !== grp) {
        grp = o.mod;
        out.push('<div class="op-row grp"><span>' + (grp === "capd" ? "CAPD · 8-h overnight long dwell" : "CCPD · 9 h on cycler") + "</span></div>");
      }
      const ico = o.longSolution === "icodextrin";
      const label = ico ? "+ Extraneal long dwell" : o.label.replace(/^(CAPD|CCPD) /, "").replace(", 9 h", "").replace(" + 2.0 L day dwell", " + 2 L day") + (o.longSolution === "dextrose" ? " · dextrose" : "");
      out.push('<div class="op-row' + (ico ? " ico" : "") + '"><span class="ol">' + esc(label) + "</span><span>" + kt(o.ktv) + "</span><span>" + fmt(o.crcl, 1) + "</span></div>");
    });
    el.innerHTML = out.join("");
    const noKtv = r.options.every((o) => !F.isNum(o.ktv));
    let b = "Weekly totals (renal included when entered). Kt/V green at or above your target, amber below; CrCl in L/week/1.73 m².";
    if (r.typical) b = r.basis + " Kt/V needs a measured 4-h D/P urea.";
    else if (noKtv) b += " Add 4-h D/P urea for Kt/V.";
    basis.textContent = b;
  }

  function pickedRow(r) {
    if (!r.options) return null;
    const all = (r.rankCapd ? r.rankCapd.top : []).concat(r.rankCcpd ? r.rankCcpd.top : []);
    return all.find((o) => o.id === state.pick) || (r.rankCapd && r.rankCapd.top[0]) || null;
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
      transport: r.cat ? r.cat.label : null,
      basis: r.basis || null,
    });
    renderSheet($("rx-sheet"), rx);
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-pick]");
    if (!b) return;
    state.pick = b.getAttribute("data-pick");
    renderResults(last);
    const card = $("rx-card");
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });


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
        <p>Picking a type without PET numbers uses typical values for that type: the midpoint of the Twardowski D/P creatinine band (Low 0.415 · Low-average 0.57 · High-average 0.73 · High 0.925) and the midpoint of the 4-h drain volume listed for the same class (Low 2,989 · Low-average 2,510 · High-average 2,226 · High 1,832 mL; Twardowski, <em>Semin Dial.</em> 1990;3:141-142). No published typical D/P urea by type was found, so Kt/V is not estimated from type alone. Entered PET numbers always win.</p>
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
        <ul><li>It is not a validated prescribing model and does not reproduce any commercial program.</li>
        <li>UF is not predicted; enter expected UF if you know it.</li>
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
        <p>Used once a day for the long dwell (CAPD overnight, CCPD day dwell). Icodextrin kinetics are not modeled: the Extraneal dwell is the same diffusion dwell, so it differs only if you enter an expected long-dwell UF. UF is the point of icodextrin and is not predicted here.</p>
        <h4>Caveats</h4><p>Same Garred model and limits as the estimate. Short-dwell net UF counts as 0. CCPD fill/drain time counts as 0, which overstates dwell time. The 8-h CAPD overnight dwell is the low end of the usual 8–10 h. Burden ordering is a judgment, not a published rule.</p>`,
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
    if (e.target && e.target.tagName === "INPUT") recalc();
  });

  /* ── steps ── */
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
    document.body.classList.toggle("on-results", n === TOTAL_STEPS);
    $("step-back").disabled = n === 1;
    $("step-next").hidden = n === TOTAL_STEPS;
    $("step-hint").hidden = n === TOTAL_STEPS;
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

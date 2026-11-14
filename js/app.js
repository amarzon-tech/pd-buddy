/**
 * PD Buddy — UI. Live results, no Calculate button.
 * Inputs are never stored. No network after first load.
 */
(function () {
  "use strict";

  const F = window.PdFormulas;
  const CFG = window.PdConfig;
  const RX = window.PdPrescription;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const TOTAL_STEPS = 5;
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
  const state = { sex: "male", vm: "watson", wunit: "kg", ptype: null, petsol: "2.5", mod: "capd", sol: "2.5", lsol: "same", asol: "1.5", alsol: "ico" };
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
      syncUi();
      recalc();
    });
  }
  bindChips("p-sex", "sex");
  bindChips("p-vmethod", "vm");
  bindChips("p-wunit", "wunit");
  bindChips("pet-type", "ptype");
  bindChips("pet-sol", "petsol");
  bindChips("r-mod", "mod");
  bindChips("c-sol", "sol");
  bindChips("c-longsol", "lsol");
  bindChips("a-sol", "asol");
  bindChips("a-lsol", "alsol");

  function syncUi() {
    $("capd-block").classList.toggle("hidden", state.mod !== "capd");
    $("apd-block").classList.toggle("hidden", state.mod !== "apd");
    $("c-longsol-wrap").classList.toggle("hidden", !(F.isNum(num("c-long")) && num("c-long") > 0));
    const wp = document.querySelector("#p-wt-wrap .unit-pill");
    if (wp) wp.textContent = state.wunit;
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
        <p class="eq">Watson, male: 2.447 − 0.09516×age + 0.1074×H + 0.3362×W<br>Watson, female: −2.097 + 0.1069×H + 0.2466×W<br>
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
      title: "Regimen options",
      html: `<h4>Options compared</h4>
        <p class="eq">CAPD 3 × 2.0 L · 4 × 2.0 L · 4 × 2.5 L, 8-h overnight long dwell<br>
        CCPD 4 × 2.0 L dry day · 4 × 2.0 L, 5 × 2.0 L, 5 × 2.5 L with a 2.0 L day dwell (15 h), 9 h on the cycler</p>
        <h4>Sources</h4>
        <p>Handbook of Dialysis, 4th ed. (Daugirdas, Blake, Ing 2006), as reproduced in ISPD teaching slides: “4 x 2L ... is the typical prescription. 4 x 2.5L in larger patients with small RRF or anuric patients who weigh &gt;75 kg. 3 x 2L in smaller patients or in patients with good RRF.” CCPD: “3 to 5 cycles per 9 hour cycling session”, “Cycler dwell volumes - 2 to 2.5 L”, “Can start with NIPD if patient has good residual volume.” ADEMEX (Paniagua R et al. <em>J Am Soc Nephrol.</em> 2002;13:1307-1320) control arm: “four daily exchanges with 2 L”. Core Curriculum 2023 (<em>Am J Kidney Dis</em>): no more than 5 exchanges per night on the cycler.</p>
        <h4>Extraneal (icodextrin 7.5%)</h4>
        <p>Used once a day for the long dwell (CAPD overnight, CCPD day dwell). Icodextrin kinetics are not modeled: the Extraneal dwell is the same diffusion dwell, so it differs only if you enter an expected long-dwell UF. Do not read identical rows as “no benefit”; UF is the point of icodextrin and is not predicted here.</p>
        <h4>Caveats</h4><p>Same Garred model and limits as the regimen estimate. Short-dwell net UF counts as 0. CCPD fill/drain time counts as 0, which overstates dwell time. The 8-h CAPD overnight dwell is the low end of the usual 8–10 h.</p>`,
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

  /* ── calculations ── */
  let last = {};

  function recalc() {
    syncUi();
    const r = {};
    // Step 1
    const age = num("p-age");
    const ht = safe(() => F.ftInToCm(num("p-ft"), num("p-in")));
    const wIn = num("p-wt");
    const wt = state.wunit === "lb" ? safe(() => F.lbToKg(wIn)) : wIn;
    r.htCm = ht;
    r.wtKg = wt;
    r.V = safe(() => (state.vm === "hume" ? F.humeWeyersV(state.sex, ht, wt) : F.watsonV(state.sex, age, ht, wt)));
    if (F.isNum(r.V) && r.V <= 0) r.V = null;
    r.bsa = safe(() => F.bsaMosteller(ht, wt));
    setText("o-v", F.isNum(r.V) ? fmt(r.V, 1) + " L" : "—");
    setText("o-bsa", F.isNum(r.bsa) ? fmt(r.bsa, 2) + " m²" : "—");
    const conv = [];
    if (F.isNum(ht)) conv.push(fmt(ht, 1) + " cm");
    if (F.isNum(wt) && state.wunit === "lb") conv.push(fmt(wt, 1) + " kg");
    if (F.isNum(r.V)) setText("p-msg", (conv.length ? "= " + conv.join(", ") + ". " : "") + "KDOQI 2006 accepts Watson or Hume for V in adults.");

    // Step 2
    const dpcr = num("pet-dpcr"), dd0 = num("pet-dd0"), fill = num("pet-fill"), drainMl = num("pet-drain"), dpu = num("pet-dpu");
    // Numbers win over the picked type when a D/P creatinine is entered.
    r.numCat = safe(() => F.petCategoryCr(dpcr));
    r.typeCat = state.ptype ? safe(() => F.typicalPet(state.ptype)) : null;
    r.typical = !r.numCat && !!r.typeCat;
    r.cat = r.numCat ? r.numCat : r.typeCat ? { key: r.typeCat.key, label: r.typeCat.label, outside: null } : null;
    r.gcat = safe(() => F.petCategoryGlucose(dd0));
    setText("o-cat", r.cat ? r.cat.label + (r.typical ? " (typical)" : "") : "—");
    setText("o-gcat", r.gcat ? r.gcat.label : "—");
    let petMsg = r.cat ? "" : "Pick a transport type, or enter PET numbers.";
    let flag = false;
    if (r.numCat && r.numCat.outside) petMsg = "D/P creatinine is " + r.numCat.outside + " the published range (0.34–1.03); reported as " + r.numCat.label.toLowerCase() + ".";
    if (r.numCat && r.typeCat && r.numCat.key !== r.typeCat.key) {
      petMsg += (petMsg ? " " : "") + "PET numbers give " + r.numCat.label + ", not the picked " + r.typeCat.label + ". Using the numbers.";
      flag = true;
    } else if (r.numCat && r.typeCat) petMsg += (petMsg ? " " : "") + "PET numbers agree with the picked type.";
    if (r.numCat && r.gcat && r.numCat.key !== r.gcat.key) {
      petMsg += (petMsg ? " " : "") + "Creatinine and glucose categories disagree; consider repeating the PET.";
      flag = true;
    }
    setText("pet-msg", petMsg);
    $("pet-msg").classList.toggle("flag-text", flag);
    if (r.cat) $("pet-msg").classList.remove("warn-text");
    r.petUf = safe(() => F.petNetUfMl(fill, drainMl));
    setText("o-petuf", F.isNum(r.petUf) ? (r.petUf > 0 ? "+" : "") + fmt(r.petUf, 0) + " mL" : "—");
    const scr = F.isNum(r.petUf) ? F.petUfScreen(r.petUf, state.petsol) : null;
    metricState("m-o-petuf", scr && scr.applicable ? (scr.insufficient ? "warn" : "ok") : null);
    setText(
      "pet-uf-msg",
      scr && scr.applicable
        ? scr.insufficient
          ? "Net UF below " + scr.threshold + " mL on " + state.petsol + "% dextrose: insufficient UF by the ISPD 2021 screen."
          : "Net UF meets the ISPD 2021 screen (" + scr.threshold + " mL on " + state.petsol + "% dextrose)."
        : ""
    );
    const drainL = F.isNum(drainMl) ? drainMl / 1000 : null;
    if (r.typical) {
      // Twardowski band midpoints (D/P Cr and PET drain volume, 2 L 2.5% PET). No typical D/P urea.
      r.mtacCr = safe(() => F.garredMtac(r.typeCat.dpCr, r.typeCat.fillL, r.typeCat.drainMl / 1000, F.TARGETS.PET_MINUTES));
    } else {
      r.mtacCr = safe(() => F.garredMtac(dpcr, fill, drainL, F.TARGETS.PET_MINUTES));
    }
    r.mtacU = r.typical ? null : safe(() => F.garredMtac(dpu, fill, drainL, F.TARGETS.PET_MINUTES));
    r.basis = r.typical ? "Estimated from typical values for " + r.typeCat.label.toLowerCase() + " transporters — enter PET numbers for a patient-specific estimate." : "";
    setText("o-mtac", F.isNum(r.mtacCr) ? fmt(r.mtacCr, 1) + " mL/min" : "—");
    let mm = "";
    if (r.typical)
      mm = r.basis + " Typical D/P creatinine " + fmt(r.typeCat.dpCr, 3) + " and PET drain " + fmt(r.typeCat.drainMl, 0) + " mL (Twardowski band midpoints). No published typical D/P urea, so Kt/V needs your PET numbers.";
    else if (F.isNum(r.mtacCr)) mm = "MTAC creatinine " + fmt(r.mtacCr, 1) + " mL/min" + (F.isNum(r.mtacU) ? ", urea " + fmt(r.mtacU, 1) + " mL/min" : "; add D/P urea for a Kt/V estimate") + " (Garred).";
    else if (r.numCat) mm = "Add the PET drain volume to estimate regimens (Garred model).";
    setText("pet-model-msg", mm);
    $("pet-model-msg").classList.toggle("basis-note", r.typical);

    // Step 3
    const pu = num("l-pu"), pcr = num("l-pcr"), uvol = num("l-uvol"), uu = num("l-uu"), ucr = num("l-ucr");
    r.res = safe(() => F.residual({ urineMl: uvol, urineUrea: uu, plasmaUrea: pu, urineCr: ucr, plasmaCr: pcr }));
    r.ktvR = r.res && F.isNum(r.V) ? F.weeklyKtv(r.res.ureaLDay, r.V) : null;
    r.rkfCrcl = r.res && F.isNum(r.res.rkfLDay) && F.isNum(r.bsa) ? F.weeklyCrCl173(r.res.rkfLDay, r.bsa) : null;
    setText("o-ktvr", F.isNum(r.ktvR) ? fmt(r.ktvR, 2) : "—");
    setText("o-rkf", r.res && F.isNum(r.res.rkfMlMin) ? fmt(r.res.rkfMlMin, 1) + " mL/min" : "—");
    let rm = "";
    if (r.res && !r.res.significant) rm = "Urine 100 mL/day or less: KDOQI 2006 treats RKF as negligible.";
    if (F.isNum(r.rkfCrcl)) rm += (rm ? " " : "") + "RKF ≈ " + fmt(r.rkfCrcl, 1) + " L/week/1.73 m².";
    setText("rkf-msg", rm);
    const mdrain = num("m-drain"), mdu = num("m-du"), mdcr = num("m-dcr");
    r.measU = safe(() => F.clearanceLDay(mdu, pu, mdrain));
    r.measCr = safe(() => F.clearanceLDay(mdcr, pcr, mdrain));
    r.ktvPmeas = F.isNum(r.measU) && F.isNum(r.V) ? F.weeklyKtv(r.measU, r.V) : null;
    const rkfL = r.res && F.isNum(r.res.rkfLDay) ? r.res.rkfLDay : 0;
    r.crclMeas = F.isNum(r.measCr) && F.isNum(r.bsa) ? F.weeklyCrCl173(r.measCr + rkfL, r.bsa) : null;
    setText("o-ktvp-meas", F.isNum(r.ktvPmeas) ? fmt(r.ktvPmeas, 2) : "—");
    setText("o-crcl-meas", F.isNum(r.crclMeas) ? fmt(r.crclMeas, 1) + " L/wk" : "—");

    // Step 4
    let dwells = null;
    let regErr = "";
    try {
      if (state.mod === "capd") {
        dwells = F.capdDwells({
          exchanges: num("c-n"),
          fillL: num("c-fill"),
          longDwellH: num("c-long"),
          ufPerExchangeMl: num("c-uf"),
          longDwellUfMl: num("c-long-uf"),
        });
      } else {
        dwells = F.apdDwells({
          cycles: num("a-n"),
          fillL: num("a-fill"),
          therapyH: num("a-ttt"),
          fillDrainMin: num("a-fd"),
          ufPerCycleMl: num("a-uf"),
          lastFillL: num("a-last"),
          dayDwellH: num("a-day"),
          lastFillUfMl: num("a-last-uf"),
        });
      }
    } catch (e) {
      regErr = "Regimen: " + e.message + ".";
    }
    r.pred = dwells && (F.isNum(r.mtacCr) || F.isNum(r.mtacU)) ? safe(() => F.predictDaily(dwells, r.mtacU, r.mtacCr)) : null;
    r.ktvPpred = r.pred && F.isNum(r.pred.ureaLDay) && F.isNum(r.V) ? F.weeklyKtv(r.pred.ureaLDay, r.V) : null;
    r.ktvTpred = F.isNum(r.ktvPpred) ? r.ktvPpred + (F.isNum(r.ktvR) ? r.ktvR : 0) : null;
    r.crclPred = r.pred && F.isNum(r.pred.crLDay) && F.isNum(r.bsa) ? F.weeklyCrCl173(r.pred.crLDay + rkfL, r.bsa) : null;
    setText("o-ktv-pred", F.isNum(r.ktvTpred) ? fmt(r.ktvTpred, 2) : "—");
    setText("o-crcl-pred", F.isNum(r.crclPred) ? fmt(r.crclPred, 1) + " L/wk" : "—");
    metricState("m-o-ktv-pred", F.isNum(r.ktvTpred) ? F.ktvReading(r.ktvTpred).state : null);
    const tbl = $("dwell-table");
    if (r.pred) {
      const name = { exchange: "Exchange", long: "Long dwell", cycle: "Night cycle", day: "Day dwell" };
      tbl.innerHTML =
        '<div class="dw-row head"><span>Dwell</span><span>Time</span><span>D/P urea</span><span>D/P Cr</span></div>' +
        r.pred.rows
          .map(
            (d) =>
              '<div class="dw-row"><span>' + esc(name[d.kind]) + " · " + fmt(d.fillL, 1) + " L</span><span>" +
              fmt(d.minutes / 60, 1) + " h</span><span>" + fmt(d.dpUrea, 2) + "</span><span>" + fmt(d.dpCr, 2) + "</span></div>"
          )
          .join("");
    } else tbl.innerHTML = "";
    let rmsg = regErr;
    if (!regErr && !F.isNum(r.mtacCr)) rmsg = "Add PET drain volume (step 2) to estimate this regimen.";
    else if (!regErr && r.typical && r.pred) rmsg = r.basis + " Kt/V needs a measured 4-h D/P urea; CrCl shown.";
    else if (!regErr && !F.isNum(r.mtacU)) rmsg = "Add 4-h D/P urea (step 2) for a Kt/V estimate.";
    else if (!regErr && r.pred) rmsg = "Estimate only (Garred model). Total includes renal Kt/V when entered. UF counts only as entered.";
    setText("reg-msg", rmsg);
    $("reg-msg").classList.toggle("basis-note", !!(r.typical && r.pred && !regErr));
    if (F.isNum(r.ktvPpred) === false && r.typical) setText("o-ktv-pred", "needs D/P urea");

    // Step 5: standard regimen options
    r.options = F.isNum(r.mtacCr) || F.isNum(r.mtacU)
      ? safe(() => F.regimenOptions({ mtacUrea: r.mtacU, mtacCr: r.mtacCr, V: r.V, bsa: r.bsa, ktvRenal: r.ktvR, rkfLDay: rkfL, longUfDextroseMl: num("o-uf-dex"), longUfIcodextrinMl: num("o-uf-ico") }))
      : null;

    last = r;
    renderResults(r);
  }

  function renderResults(r) {
    const rows = [];
    const row = (k, pred, meas, cls) =>
      '<div class="result-row' + (cls ? " " + cls : "") + '"><span class="rk">' + esc(k) + '</span><span class="rv">' + pred + '</span><span class="rv">' + meas + "</span></div>";
    rows.push(row("", "Estimated", "Measured", "head"));
    const ktvTmeas = F.isNum(r.ktvPmeas) ? r.ktvPmeas + (F.isNum(r.ktvR) ? r.ktvR : 0) : null;
    rows.push(row("Peritoneal Kt/V", fmt(r.ktvPpred, 2), fmt(r.ktvPmeas, 2)));
    rows.push(row("Renal Kt/V", fmt(r.ktvR, 2), fmt(r.ktvR, 2)));
    const chip = (v) => (F.isNum(v) ? ' <span class="status-chip ' + F.ktvReading(v).state + '">' + (v >= F.TARGETS.KTV_HISTORICAL_MIN ? "≥ 1.7" : "< 1.7") + "</span>" : "");
    rows.push(row("Total weekly Kt/V", fmt(r.ktvTpred, 2) + chip(r.ktvTpred), fmt(ktvTmeas, 2) + chip(ktvTmeas)));
    rows.push(row("CrCl, L/week/1.73 m²", fmt(r.crclPred, 1), fmt(r.crclMeas, 1)));
    rows.push(row("Transport (PET)", r.cat ? esc(r.cat.label) + (r.typical ? '<span class="sub">typical values</span>' : "") : "—", ""));
    $("cmp-rows").innerHTML = rows.join("");
    renderOptions(r);

    const useMeas = !F.isNum(r.ktvTpred) && F.isNum(ktvTmeas);
    const est = useMeas
      ? { measured: true, ktvTotal: ktvTmeas, ktvP: r.ktvPmeas, ktvR: r.ktvR, crcl: r.crclMeas }
      : { measured: false, ktvTotal: r.ktvTpred, ktvP: r.ktvPpred, ktvR: r.ktvR, crcl: r.crclPred };
    const rx = RX.build({
      modality: state.mod,
      capd: { exchanges: num("c-n"), fillL: num("c-fill"), solution: state.sol, longDwellH: num("c-long"), longSolution: state.lsol },
      apd: { cycles: num("a-n"), fillL: num("a-fill"), therapyH: num("a-ttt"), solution: state.asol, lastFillL: num("a-last"), lastSolution: state.alsol, dayDwellH: num("a-day") },
      estimate: est,
      transport: r.cat ? r.cat.label : null,
      basis: r.basis || null,
    });
    renderSheet($("rx-sheet"), rx);
  }

  function renderOptions(r) {
    const el = $("opt-table");
    const basis = $("opt-basis");
    if (!r.options) {
      el.innerHTML = "";
      basis.textContent = "Pick a transport type (step 2) or enter PET numbers with drain volume to compare options.";
      basis.classList.remove("basis-note");
      return;
    }
    const kt = (v) => (F.isNum(v) ? '<span class="' + (v >= F.TARGETS.KTV_HISTORICAL_MIN ? "ok-v" : "warn-v") + '">' + fmt(v, 2) + "</span>" : "—");
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
    let b = "Weekly totals (renal included when entered). Kt/V shown against the KDOQI 2006 reference of 1.7 (green ≥ 1.7, amber below); CrCl in L/week/1.73 m².";
    if (r.typical) b = r.basis + (noKtv ? " Kt/V needs a measured 4-h D/P urea." : "");
    else if (noKtv) b += " Add 4-h D/P urea (step 2) for Kt/V.";
    basis.textContent = b;
    basis.classList.toggle("basis-note", !!r.typical);
  }

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
    if (n === 1 && !F.isNum(last.V)) {
      setText("p-msg", "Enter age, height and weight to continue.");
      $("p-msg").classList.add("warn-text");
      return false;
    }
    if (n === 2 && !last.cat) {
      setText("pet-msg", "Pick a transport type, or enter the 4-hour D/P creatinine, to continue.");
      $("pet-msg").classList.add("warn-text");
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
    $("step-back").disabled = n === 1;
    $("step-next").hidden = n === TOTAL_STEPS;
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
  syncUi();
  showStep(1);
  recalc();
})();

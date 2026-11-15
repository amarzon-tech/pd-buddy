/**
 * PD Buddy — lab-report text parser (pure; no DOM, no storage, no network).
 * Input: plain text (from on-device OCR or pasted). Output: candidate values for the
 * Step 3 lab fields. Every value is returned UNCONFIRMED; the app highlights it and
 * uses it only after the clinician confirms it. Nothing is guessed: a value is returned
 * only when a recognizable label and a number appear on the same line.
 * 0.4.3 (App Critic M4): reference ranges and "24 h"-style numbers are skipped, the value
 * after the label is taken, thousands separators are read, Kt/V takes the number nearest
 * "total", concentrations with no printed unit are flagged (the app makes the user pick
 * one), and fluid/serum unit conflicts are returned so the app can block confirmation.
 */
(function (global) {
  "use strict";

  const FIELDS = Object.freeze({
    dpcr: "4-h D/P creatinine",
    dpu: "4-h D/P urea",
    petDrain: "PET drain volume (mL)",
    dialVolL: "24-h dialysate volume (L)",
    dialUrea: "Dialysate urea",
    dialCr: "Dialysate creatinine",
    urineMl: "24-h urine volume (mL)",
    urineUrea: "Urine urea",
    urineCr: "Urine creatinine",
    serumUrea: "Serum urea / BUN",
    serumCr: "Serum creatinine",
    measuredKtv: "Weekly Kt/V (total)",
  });

  // OCR clean-up inside numbers only: O→0, l/I→1, thousands separator (a comma followed by
  // exactly 3 digits, not after a lone 0) dropped, other comma decimals → point.
  function cleanNumber(s) {
    return s
      .replace(/[Oo](?=[\d.,])|(?<=[\d.,])[Oo]/g, "0")
      .replace(/(?<=\d)[lI]|[lI](?=\d)/g, "1")
      .replace(/(?<![\d.,])([1-9]\d{0,2}),(\d{3})(?![\d,.])/g, "$1$2")
      .replace(/(\d),(\d)/g, "$1.$2");
  }
  // Remove reference ranges so their numbers are never read as the result.
  function stripRanges(s) {
    return s
      .replace(/[(\[][^)\]]*(?:ref|reference|normal|range|n\s*=|\d\s*[-–]\s*\d)[^)\]]*[)\]]/gi, " ")
      .replace(/\b(?:ref(?:erence)?(?:\s*range)?|normal(?:\s*range)?)\s*:?\s*[<>≤≥]?\s*\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?/gi, " ")
      .replace(/(?<![\w.])\d+(?:[.,]\d+)?\s*[-–]\s*\d+(?:[.,]\d+)?(?![\w.])/g, " ");
  }
  // Numbers that are durations ("24h", "24 h", "4-h", "24 hr") are not results.
  const DURATION = /^\s*-?\s*(?:h|hr|hrs|hour|hours)\b/i;
  const NUM = /(?<![\w.])(\d+(?:[.,]\d+)?|[.,]\d+)(?![\d.,]*\d)/g;

  function numbersIn(line) {
    const out = [];
    let m;
    const s = cleanNumber(line);
    NUM.lastIndex = 0;
    while ((m = NUM.exec(s))) {
      if (DURATION.test(s.slice(m.index + m[0].length))) continue;
      out.push({ v: Number(m[1].replace(",", ".")), idx: m.index, raw: m[1] });
    }
    return out;
  }
  // First number after the end of the label match (else the first number on the line).
  function afterLabel(nums, line, re) {
    const m = re.exec(line);
    if (!m) return nums[0] || null;
    const end = m.index + m[0].length;
    return nums.find((n) => n.idx >= end) || nums[0] || null;
  }
  const CONC_KEYS = ["dialUrea", "dialCr", "urineUrea", "urineCr", "serumUrea", "serumCr"];
  function unitAfter(line, idx) {
    const rest = line.slice(idx, idx + 40);
    const m = /\d\s*(mg\/dl|mmol\/l|µmol\/l|umol\/l|μmol\/l|mg\/l|g\/l|ml\/day|ml\/24\s*h|ml|l\/day|l\/24\s*h|l)\b/i.exec(rest);
    return m ? m[1].replace(/[uμ]mol/i, "µmol").toLowerCase() : null;
  }

  const SPEC = {
    dial: /\b(dialysate|effluent|pd\s*fluid|peritoneal\s*fluid|drain(?:ed)?\s*fluid|bag)\b/i,
    urine: /\b(urine|urinary|u-)\b/i,
    serum: /\b(serum|plasma|blood|s-|p-)\b|\bbun\b/i,
  };
  const ANALYTE = {
    urea: /\b(urea(?:\s*nitrogen)?|bun)\b/i,
    cr: /\b(creatinine|creat|crea|cr)\b/i,
    vol: /\b(volume|vol|total\s*volume|output)\b/i,
  };

  /**
   * parse(text) → { values: { key: { value, unit, line, confirmed: false, needsUnit } }, warnings: [], conflicts: [[a, b]] }
   */
  function parse(text) {
    const values = {};
    const warnings = [];
    let section = null; // last specimen header seen
    const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const conflicts = [];
    const set = (key, value, unit, line) => {
      if (!Number.isFinite(value)) return;
      if (values[key] && values[key].value !== value) warnings.push(FIELDS[key] + ": more than one value found (" + values[key].value + ", " + value + "); kept the first.");
      if (!values[key]) values[key] = { value, unit, line, confirmed: false };
    };
    for (const orig of lines) {
      const line = cleanNumber(stripRanges(orig)).replace(/\s+/g, " ").trim();
      const low = line.toLowerCase();
      const nums = numbersIn(line);
      const keep = (key, value, unit) => set(key, value, unit, orig);
      // Section headers (no number on the line)
      if (!nums.length) {
        if (SPEC.dial.test(line)) section = "dial";
        else if (SPEC.urine.test(line)) section = "urine";
        else if (SPEC.serum.test(line) || /chemistry|biochemistry/i.test(line)) section = "serum";
        continue;
      }
      // Ratios and Kt/V first (explicit labels)
      const first = nums[0];
      const lastNum = (pred) => nums.find(pred) || null;
      if (/\bd\s*\/\s*p\b|\bd:p\b|dialysate\s*\/\s*plasma/i.test(line)) {
        const ratio = lastNum((n) => n.v > 0 && n.v < 1.5 && !/^\d{2,}$/.test(n.raw));
        if (ratio) {
          if (ANALYTE.urea.test(line)) keep("dpu", ratio.v, null);
          else if (ANALYTE.cr.test(line)) keep("dpcr", ratio.v, null);
        }
        continue;
      }
      if (/kt\s*\/\s*v/i.test(line)) {
        // take the number nearest "total" when the line has several
        const cand = nums.filter((n) => n.v > 0.2 && n.v < 6);
        const t = /total/i.exec(line);
        let k = null;
        if (t && cand.length) {
          const after = cand.filter((n) => n.idx >= t.index);
          k = after.length ? after[0] : cand.reduce((a, b) => (Math.abs(b.idx - t.index) < Math.abs(a.idx - t.index) ? b : a));
        } else if (!/(peritoneal|renal|residual)/i.test(line)) k = afterLabel(cand, line, /kt\s*\/\s*v/i);
        if (k) keep("measuredKtv", k.v, null);
        continue;
      }
      if (/\bpet\b/i.test(line) && /drain/i.test(line)) {
        const d = lastNum((n) => n.v >= 500 && n.v <= 5000);
        if (d) keep("petDrain", d.v, "ml");
        continue;
      }
      const spec = SPEC.dial.test(line) ? "dial" : SPEC.urine.test(line) ? "urine" : /\bbun\b/i.test(line) || SPEC.serum.test(line) ? "serum" : section;
      if (!spec) continue;
      if (ANALYTE.vol.test(low) && !ANALYTE.cr.test(line) && !ANALYTE.urea.test(line)) {
        const first = afterLabel(nums, line, ANALYTE.vol);
        const u = unitAfter(line, first.idx);
        if (spec === "dial") {
          // litres expected; values ≥ 100 are mL
          const v = u === "ml" || u === "ml/day" || u === "ml/24 h" || first.v >= 100 ? first.v / 1000 : first.v;
          keep("dialVolL", Math.round(v * 1000) / 1000, "l");
        } else if (spec === "urine") {
          const v = u === "l" || u === "l/day" || u === "l/24 h" || first.v < 10 ? first.v * 1000 : first.v;
          keep("urineMl", Math.round(v), "ml");
        }
        continue;
      }
      const key = ANALYTE.urea.test(line) ? "Urea" : ANALYTE.cr.test(line) ? "Cr" : null;
      if (!key) continue;
      const n = afterLabel(nums, line, key === "Urea" ? ANALYTE.urea : ANALYTE.cr);
      if (!n) continue;
      keep(spec + key, n.v, unitAfter(line, n.idx));
    }
    // Concentrations need a unit: flag the ones printed without one (the app asks for it).
    CONC_KEYS.forEach((k) => {
      if (values[k] && !values[k].unit) {
        values[k].needsUnit = true;
        warnings.push(FIELDS[k] + ": no unit printed; choose the unit before confirming.");
      }
    });
    // Unit consistency for ratios (fluid vs serum must match): returned as conflicts so the app blocks confirmation.
    unitConflicts(values, {}).forEach(([a, b]) => {
      conflicts.push([a, b]);
      warnings.push(FIELDS[a] + " (" + values[a].unit + ") and " + FIELDS[b] + " (" + values[b].unit + ") use different units; ratios need the same units. Convert before confirming.");
    });
    // Plausibility (flag, never drop)
    if (values.dpcr && (values.dpcr.value < 0.2 || values.dpcr.value > 1.1)) warnings.push("D/P creatinine " + values.dpcr.value + " is outside the usual 0.2–1.1 range; check it.");
    if (values.dpu && (values.dpu.value < 0.3 || values.dpu.value > 1.1)) warnings.push("D/P urea " + values.dpu.value + " is outside the usual 0.3–1.1 range; check it.");
    if (values.dialVolL && (values.dialVolL.value < 2 || values.dialVolL.value > 30)) warnings.push("24-h dialysate volume " + values.dialVolL.value + " L looks unusual; check it.");
    return { values, warnings, conflicts };
  }

  const PAIRS = [["dialUrea", "serumUrea"], ["urineUrea", "serumUrea"], ["dialCr", "serumCr"], ["urineCr", "serumCr"]];
  /** Pairs whose (printed or chosen) units differ. picked: { key: unit } from the user. */
  function unitConflicts(values, picked) {
    const unit = (k) => (values[k] && (values[k].unit || (picked && picked[k]))) || null;
    return PAIRS.filter(([a, b]) => values[a] && values[b] && unit(a) && unit(b) && unit(a) !== unit(b));
  }

  const P = { FIELDS, CONC_KEYS, parse, numbersIn, cleanNumber, stripRanges, unitConflicts };
  global.PdLabParse = P;
  if (typeof module !== "undefined" && module.exports) module.exports = P;
})(typeof globalThis !== "undefined" ? globalThis : this);

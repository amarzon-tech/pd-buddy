/**
 * PD Buddy — lab-report text parser (pure; no DOM, no storage, no network).
 * Input: plain text (from on-device OCR or pasted). Output: candidate values for the
 * Step 3 lab fields. Every value is returned UNCONFIRMED; the app highlights it and
 * uses it only after the clinician confirms it. Nothing is guessed: a value is returned
 * only when a recognizable label and a number appear on the same line.
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

  // OCR clean-up inside numbers only: O→0, l/I→1, comma decimal → point.
  function cleanNumber(s) {
    return s.replace(/[Oo](?=[\d.,])|(?<=[\d.,])[Oo]/g, "0").replace(/(?<=\d)[lI]|[lI](?=\d)/g, "1").replace(/(\d),(\d)/g, "$1.$2");
  }
  const NUM = /(?<![\w.])(\d+(?:[.,]\d+)?|[.,]\d+)(?![\d.,]*\d)/g;

  function numbersIn(line) {
    const out = [];
    let m;
    const s = cleanNumber(line);
    NUM.lastIndex = 0;
    while ((m = NUM.exec(s))) out.push({ v: Number(m[1].replace(",", ".")), idx: m.index, raw: m[1] });
    return out;
  }
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
   * parse(text) → { values: { key: { value, unit, line, confirmed: false } }, warnings: [] }
   */
  function parse(text) {
    const values = {};
    const warnings = [];
    let section = null; // last specimen header seen
    const lines = String(text || "").split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    const set = (key, value, unit, line) => {
      if (!Number.isFinite(value)) return;
      if (values[key] && values[key].value !== value) warnings.push(FIELDS[key] + ": more than one value found (" + values[key].value + ", " + value + "); kept the first.");
      if (!values[key]) values[key] = { value, unit, line, confirmed: false };
    };
    for (const line of lines) {
      const low = line.toLowerCase();
      const nums = numbersIn(line);
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
          if (ANALYTE.urea.test(line)) set("dpu", ratio.v, null, line);
          else if (ANALYTE.cr.test(line)) set("dpcr", ratio.v, null, line);
        }
        continue;
      }
      if (/kt\s*\/\s*v/i.test(line)) {
        // prefer a "total" value when the line has several
        const k = lastNum((n) => n.v > 0.2 && n.v < 6);
        if (k && (!/(peritoneal|renal|residual)/i.test(line) || /total/i.test(line))) set("measuredKtv", k.v, null, line);
        continue;
      }
      if (/\bpet\b/i.test(line) && /drain/i.test(line)) {
        const d = lastNum((n) => n.v >= 500 && n.v <= 5000);
        if (d) set("petDrain", d.v, "ml", line);
        continue;
      }
      const spec = SPEC.dial.test(line) ? "dial" : SPEC.urine.test(line) ? "urine" : /\bbun\b/i.test(line) || SPEC.serum.test(line) ? "serum" : section;
      if (!spec) continue;
      const u = unitAfter(line, first.idx);
      if (ANALYTE.vol.test(low) && !ANALYTE.cr.test(line) && !ANALYTE.urea.test(line)) {
        if (spec === "dial") {
          // litres expected; values ≥ 100 are mL
          const v = u === "ml" || u === "ml/day" || u === "ml/24 h" || first.v >= 100 ? first.v / 1000 : first.v;
          set("dialVolL", Math.round(v * 1000) / 1000, "l", line);
        } else if (spec === "urine") {
          const v = u === "l" || u === "l/day" || u === "l/24 h" || first.v < 10 ? first.v * 1000 : first.v;
          set("urineMl", Math.round(v), "ml", line);
        }
        continue;
      }
      const key = ANALYTE.urea.test(line) ? "Urea" : ANALYTE.cr.test(line) ? "Cr" : null;
      if (!key) continue;
      set(spec + key, first.v, u, line);
    }
    // Unit consistency for ratios (fluid vs serum must match)
    [["dialUrea", "serumUrea"], ["urineUrea", "serumUrea"], ["dialCr", "serumCr"], ["urineCr", "serumCr"]].forEach(([a, b]) => {
      if (values[a] && values[b] && values[a].unit && values[b].unit && values[a].unit !== values[b].unit)
        warnings.push(FIELDS[a] + " (" + values[a].unit + ") and " + FIELDS[b] + " (" + values[b].unit + ") use different units; ratios need the same units. Convert before confirming.");
    });
    // Plausibility (flag, never drop)
    if (values.dpcr && (values.dpcr.value < 0.2 || values.dpcr.value > 1.1)) warnings.push("D/P creatinine " + values.dpcr.value + " is outside the usual 0.2–1.1 range; check it.");
    if (values.dpu && (values.dpu.value < 0.3 || values.dpu.value > 1.1)) warnings.push("D/P urea " + values.dpu.value + " is outside the usual 0.3–1.1 range; check it.");
    if (values.dialVolL && (values.dialVolL.value < 2 || values.dialVolL.value > 30)) warnings.push("24-h dialysate volume " + values.dialVolL.value + " L looks unusual; check it.");
    return { values, warnings };
  }

  const P = { FIELDS, parse, numbersIn, cleanNumber };
  global.PdLabParse = P;
  if (typeof module !== "undefined" && module.exports) module.exports = P;
})(typeof globalThis !== "undefined" ? globalThis : this);

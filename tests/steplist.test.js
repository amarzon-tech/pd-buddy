/**
 * 0.4.9: step 3 current-prescription list is rebuilt after a blocked D/P is corrected
 * (App Critic: list stayed at "Complete step 1 first" after 0.44 → 0.34 (blocked) → 0.44).
 * Runs the real fillCurrentSelect/currentId from js/app.js against a stub <select>.
 * Run: node tests/steplist.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const { eq, isTrue, section, done } = require("./_h.js");
const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");

const start = app.indexOf("  function currentId(r) {"), end = app.indexOf('  $("cur-rx").addEventListener("change"');
isTrue(start > 0 && end > start, "found currentId/fillCurrentSelect in js/app.js");
const src = app.slice(start, end);

function makeEnv() {
  const sel = {
    dataset: {}, value: "", _html: "", builds: 0,
    set innerHTML(h) { this._html = h; this.value = ""; if (/<optgroup/.test(h)) this.builds++; }, // like a real <select>: new options reset the value
    get innerHTML() { return this._html; },
    get options() { return (this._html.match(/<option /g) || []).length; },
    get placeholder() { return /Complete step 1 first/.test(this._html); },
  };
  const ctx = { F, state: { cur: null, curExplicit: false }, $: (id) => (id === "cur-rx" ? sel : null),
    pickedRow: () => null, esc: (s) => String(s), fullName: (o) => o.id };
  vm.createContext(ctx);
  vm.runInContext(src + "; this.fillCurrentSelect = fillCurrentSelect; this.currentId = currentId;", ctx);
  return { sel, ctx };
}
const rowsLow = () => {
  const t = F.typicalPet("low");
  const V = F.watsonV("male", 55, 170, 70), bsa = F.bsaMosteller(170, 70);
  const mCr = F.garredMtac(0.44, 2, t.drainMl / 1000, 240);
  return F.candidateOptions({ mtacUrea: t.mtacUrea, mtacCr: mCr, V, bsa, ufFn: (o, s) => T.regimenUf(o, "low", s) });
};

section("Below-model-range D/P: 0.44 → 0.34 (blocked) → 0.44");
{
  isTrue(F.checkDp(0.34, "D/P creatinine").block, "0.34 is blocked (below model range)");
  const { sel, ctx } = makeEnv();
  const rows = rowsLow();
  ctx.fillCurrentSelect({ options: rows });
  eq(sel.options, rows.length, "list built with every option");
  ctx.fillCurrentSelect({ options: null }); // blocked: no options
  isTrue(sel.placeholder && sel.options === 1, "blocked: placeholder only");
  ctx.fillCurrentSelect({ options: rowsLow() }); // corrected: same option ids → same signature
  eq(sel.options, rows.length, "corrected: list rebuilt and populated");
  isTrue(!sel.placeholder, "corrected: placeholder gone");
  eq(sel.builds, 2, "list rebuilt once after the block");
}

section("Drain guard: blocked then corrected, current pick kept");
{
  const { sel, ctx } = makeEnv();
  const rows = rowsLow();
  ctx.state.cur = rows[0].id; ctx.state.curExplicit = true;
  ctx.fillCurrentSelect({ options: rows });
  eq(sel.value, rows[0].id, "pick shown");
  ctx.fillCurrentSelect({ options: null });
  eq(sel.value, "", "blocked: no selection shown");
  ctx.fillCurrentSelect({ options: rows });
  eq(sel.options, rows.length, "corrected: list repopulated");
  eq(sel.value, rows[0].id, "corrected: the explicit pick is selected again");
}

section("Unchanged behaviour");
{
  const { sel, ctx } = makeEnv();
  const rows = rowsLow();
  ctx.fillCurrentSelect({ options: rows });
  ctx.fillCurrentSelect({ options: rows });
  eq(sel.builds, 1, "same options without a block: list not rebuilt (no flicker)");
  isTrue(/delete sel\.dataset\.sig/.test(src), "placeholder path clears the list signature");
}
done("steplist");

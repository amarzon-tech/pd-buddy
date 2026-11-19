/**
 * 0.4.6: stale pick (App Critic N-M1), one-page print, compact negative-UF warning on small screens.
 * Run: node tests/stalepick.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
global.PdFormulas = require("../js/formulas.js");
const F = global.PdFormulas;
const T = require("../js/threepore.js");
const W = require("../js/workflow.js");
const RX = require("../js/prescription.js");
const { eq, isTrue, section, done } = require("./_h.js");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const app = read("js/app.js");
const css = read("css/pd.css");

const rowsFor = (cm, kg) => {
  const t = F.typicalPet("high-average");
  const V = F.watsonV("male", 70, cm, kg), bsa = F.bsaMosteller(cm, kg);
  const rows = F.candidateOptions({ mtacUrea: t.mtacUrea, mtacCr: t.mtacCr, V, bsa, ufFn: (o, s) => T.regimenUf(o, "high-average", s) });
  return { rows, capd: F.rankOptions(rows, { mod: "capd" }), ccpd: F.rankOptions(rows, { mod: "ccpd" }) };
};
const sig = (rows) => rows.map((o) => o.id + (o.overCap ? "!" : "")).join(",");

section("Repro: 178/80 pick CCPD #1, then 150/40");
{
  const a = rowsFor(178, 80);
  const pick = a.ccpd.top[0].id;
  isTrue(/3\.0/.test(pick), "178/80 CCPD #1 is a 3.0 L night fill (" + pick + ")");
  const b = rowsFor(150, 40);
  const stale = b.rows.find((o) => o.id === pick);
  isTrue(stale && stale.overCap, "the same id is above the 150/40 cap");
  const v = W.revalidate({ pick, cur: pick, curExplicit: false, sig: sig(a.rows) }, b.rows, sig(b.rows));
  eq(v.pick, null, "pick cleared");
  eq(v.cur, null, "current prescription cleared");
  eq(b.capd.top[0].id, "capd-4x1.75", "falls back to the #1 CAPD option (Rx card, summary, step 4)");
  isTrue(b.capd.top[0].ktv < 2.5, "fallback Kt/V is the 150/40 value (" + b.capd.top[0].ktv.toFixed(2) + "), not 3.05");
}

section("No-fit 60 cm / 20 kg after a pick");
{
  const a = rowsFor(178, 80), n = rowsFor(60, 20);
  const pick = a.ccpd.top[0].id;
  isTrue(n.rows.every((o) => o.overCap), "every row above the cap (no-fit)");
  const v = W.revalidate({ pick, cur: pick, curExplicit: false, sig: sig(a.rows) }, n.rows, sig(n.rows));
  eq(v.pick, null, "pick cleared");
  eq(v.cur, null, "current cleared → step 4 shows the no-fit message");
  eq(n.capd.top.length, 0, "no fallback option, so no Kt/V 6.06");
  isTrue(/R\.noFit \? noFitText\(R\)/.test(app), "step 4 uses the no-fit message when nothing is current");
  isTrue(/r\.noFit \? noFitText\(r\) : \(r\.basis/.test(app), "summary sheet carries the no-fit message");
}

section("Valid picks are kept and recomputed");
{
  const a = rowsFor(150, 40), b = rowsFor(152, 42);
  const pick = a.ccpd.top[0].id;
  const v = W.revalidate({ pick, cur: pick, sig: sig(a.rows) }, b.rows, sig(b.rows));
  eq(v.pick, pick, "still under the cap → kept");
  isTrue(b.rows.find((o) => o.id === pick).ktv !== a.rows.find((o) => o.id === pick).ktv, "values come from the new rows");
  eq(W.validSelection("nope", b.rows), null, "unknown id cleared");
  eq(W.validSelection(pick, null), null, "blocked inputs: nothing valid");
}

section("Explicit above-cap current prescription (step 3)");
{
  const a = rowsFor(150, 40);
  const over = a.rows.find((o) => o.overCap && /3\.0/.test(o.id)).id;
  const s = sig(a.rows);
  const v = W.revalidate({ pick: null, cur: over, curExplicit: true, sig: s }, a.rows, s);
  eq(v.cur, over, "kept while the inputs are unchanged (user chose it)");
  const b = rowsFor(152, 42);
  const v2 = W.revalidate({ pick: null, cur: over, curExplicit: true, sig: s }, b.rows, sig(b.rows));
  eq(v2.cur, null, "cleared once inputs change");
  isTrue(/cur\.overCap \? "Above the fill cap for this patient/.test(app), "step 4 flags an above-cap current prescription");
}

section("App wiring");
{
  isTrue(/W\.revalidate\(/.test(app) && /selectionSig\(r\)/.test(app), "recalc re-validates on input change");
  isTrue(/o\.id === state\.pick && !o\.overCap/.test(app), "Rx card never renders an above-cap pick");
  isTrue(/o\.id === state\.cur && \(!o\.overCap \|\| state\.curExplicit\)/.test(app), "step 4 ignores an above-cap current unless chosen in step 3");
  isTrue(/sel\.value = id \|\| ""/.test(app), "step 3 dropdown shows no stale entry");
}

section("One-page print");
{
  const i = css.indexOf("0.4.6: one-page print");
  const pr = css.slice(i);
  isTrue(i > 0 && /@page \{ margin: 12mm; \}/.test(pr), "@page margin");
  isTrue(/#step-2 #rx-card \{ break-inside: auto !important/.test(pr), "Rx card may break (no blank first page)");
  isTrue(/html, body \{ min-height: 0 !important/.test(pr), "no screen min-height in print");
  isTrue(/\.draft-banner \{ display: block !important/.test(read("css/standalone.css")), "draft banner still printed");
  isTrue(/\.rx-neguf/.test(pr) && /\.neg-uf-short, \.neg-uf-more \{ display: none !important; \}/.test(css), "print keeps the full warning, never the compact one");
}

section("Compact warning on small screens");
{
  eq(RX.negUfShort(-390), "Negative UF predicted (about −0.39 L/day, experimental)", "compact wording");
  eq(RX.negUfShort(150), null, "positive → none");
  eq(RX.negUfWarning(-390), "Predicted daily UF is negative (about −0.39 L/day, experimental model). Watch fluid balance; consider a higher-tonicity or icodextrin dwell.", "full wording unchanged from f38a61e");
  isTrue(/@media \(max-height: 760px\), \(max-width: 400px\) \{\s*\.neg-uf-full \{ display: none; \}\s*\.neg-uf-short \{ display: block;[^}]*\}\s*\.neg-uf-more \{ display: block;/.test(css), "small screens: compact + disclosure; large screens: full");
  isTrue(/<details class="neg-uf-more"><summary>Full UF warning<\/summary>/.test(app), "disclosure shows the full wording");
  isTrue(/\+ ">" \+ negUfCompact\(o\) \+ "<\/li>"/.test(app), "disclosure sits outside the pick button (no nested controls)");
  isTrue(/negUfHtml\(cur, "span"\)/.test(app) && /negUfHtml\(s\.row, "div"\)/.test(app) && !/negUfShort/.test(app.slice(app.indexOf('$("ts-cur")'), app.indexOf('$("ts-cur")') + 4000)), "step 4 keeps the full wording");
}

section("Review");
{
  const rv = read("CONTENT_REVIEW.md");
  ["stale pick", "one-page print", "compact negative-UF warning"].forEach((k) =>
    isTrue(new RegExp("^- \\[x\\] Sign-off: " + k, "m").test(rv), "signed-off item: " + k));
  isTrue(!/^- \[ \] Sign-off/m.test(rv), "no unticked sign-off boxes");
}

done("stalepick");

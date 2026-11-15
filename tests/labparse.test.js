/**
 * Lab-report parser tests (sample lab text, including OCR-style noise).
 * Run: node tests/labparse.test.js
 */
"use strict";
const P = require("../js/labparse.js");
const { approx, eq, isTrue, section, done } = require("./_h.js");

section("Sectioned 24-h adequacy report (SI units)");
{
  const t = `SAMPLE HOSPITAL LABORATORY (synthetic test report)
PD ADEQUACY - 24 HOUR COLLECTION
DIALYSATE
Total volume 10.6L
Urea 18.2 mmol/L
Creatinine 520 umol/L
URINE 24 HOUR
Urine volume 450 mL
Urine urea 210 mmol/L
Urine creatinine 6800 umol/L
SERUM CHEMISTRY
Urea 21.0 mmol/L H
Creatinine 810 umol/L H`;
  const r = P.parse(t);
  const v = (k) => (r.values[k] ? r.values[k].value : null);
  eq(v("dialVolL"), 10.6, "dialysate volume 10.6 L (no space before unit)");
  eq(v("dialUrea"), 18.2, "dialysate urea from section");
  eq(v("dialCr"), 520, "dialysate creatinine from section");
  eq(v("urineMl"), 450, "urine volume mL");
  eq(v("urineUrea"), 210, "urine urea");
  eq(v("urineCr"), 6800, "urine creatinine");
  eq(v("serumUrea"), 21, "serum urea (flag letter ignored)");
  eq(v("serumCr"), 810, "serum creatinine");
  eq(r.values.dialCr.unit, "µmol/l", "umol/L normalised to µmol/l");
  isTrue(Object.values(r.values).every((x) => x.confirmed === false), "every parsed value starts UNCONFIRMED");
  eq(r.warnings.length, 0, "no warnings for a consistent report");
}

section("PET lines, Kt/V, US units, OCR noise");
{
  const t = `PERITONEAL EQUILIBRATION TEST
4 hr D/P Creatinine: 0.7l
D/P urea .88
PET drain volume 2,210 mL
Weekly Kt/V (total) 1.82
Renal Kt/V 0.31
BUN 62 mg/dL
Serum creatinine 9.1 mg/dL`;
  const r = P.parse(t);
  const v = (k) => (r.values[k] ? r.values[k].value : null);
  approx(v("dpcr"), 0.71, 1e-9, "OCR 'l' read as 1 inside a number");
  approx(v("dpu"), 0.88, 1e-9, "leading-decimal ratio");
  eq(v("measuredKtv"), 1.82, "total weekly Kt/V; renal-only line ignored");
  eq(v("serumUrea"), 62, "BUN maps to serum urea");
  eq(r.values.serumUrea.unit, "mg/dl", "BUN unit kept");
  eq(v("serumCr"), 9.1, "serum creatinine mg/dL");
  isTrue(v("petDrain") === 2210 || v("petDrain") === null, "thousands separator does not create a wrong drain value");
}

section("Inline specimen labels and unit mismatch warning");
{
  const t = `Dialysate urea 55 mg/dL
Dialysate volume 9800 mL
Plasma urea 20 mmol/L
Urine output 1.2 L`;
  const r = P.parse(t);
  eq(r.values.dialUrea.value, 55, "inline 'Dialysate urea'");
  eq(r.values.dialVolL.value, 9.8, "dialysate volume in mL converted to L");
  eq(r.values.urineMl.value, 1200, "urine output in L converted to mL");
  eq(r.values.serumUrea.value, 20, "plasma urea is serum urea");
  isTrue(r.warnings.some((w) => /different units/.test(w)), "mg/dL vs mmol/L flagged");
}

section("Nothing invented");
{
  const r = P.parse("Patient name: Test\nMRN 123456\nHemoglobin 10.2 g/dL\nPotassium 4.1 mmol/L");
  eq(Object.keys(r.values).length, 0, "unrelated analytes give no values");
  const r2 = P.parse("D/P creatinine 1.4");
  isTrue(r2.warnings.some((w) => /outside the usual/.test(w)), "implausible D/P flagged, not dropped");
  eq(P.parse("").warnings.length, 0, "empty text is fine");
}

section("App Critic M4 strings (0.4.3)");
{
  const v = (t, k) => (P.parse(t).values[k] || {}).value;
  eq(v("Weekly Kt/V: renal 0.52, peritoneal 1.61, total 2.13", "measuredKtv"), 2.13, "total Kt/V 2.13, not renal 0.52");
  eq(v("Serum creatinine (ref 0.7-1.3) 9.4 mg/dL", "serumCr"), 9.4, "serum creatinine 9.4, not the reference 0.7");
  eq((P.parse("Serum creatinine (ref 0.7-1.3) 9.4 mg/dL").values.serumCr || {}).unit, "mg/dl", "unit after the value");
  eq(v("24h dialysate volume 9.6 L", "dialVolL"), 9.6, "dialysate 9.6 L, not 24");
  eq(v("PET drain volume 2,350 mL", "petDrain"), 2350, "PET drain 2,350 mL kept");
  const r = P.parse("Dialysate creatinine 5.1\nSerum creatinine 725");
  isTrue(r.values.dialCr.needsUnit && r.values.serumCr.needsUnit, "no units printed → unit must be chosen");
  isTrue(r.warnings.filter((w) => /no unit printed/.test(w)).length === 2, "one missing-unit warning per value");
  eq(P.parse("Dialysate urea 40 mg/dL\nSerum urea 12 mmol/L").conflicts.length, 1, "unit conflict returned for blocking");
  eq(P.parse("Dialysate urea 40 mg/dL\nSerum urea 12 mmol/L").values.serumUrea.line, "Serum urea 12 mmol/L", "source line kept");
}

done("labparse");

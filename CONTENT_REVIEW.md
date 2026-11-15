# Content review — PD Buddy (draft)

**App:** PD Buddy, v0.3.0-draft · `DRAFT=true` · noindex · robots `Disallow: /`
**Preview:** https://amarzon-tech.github.io/pd-buddy/
**For:** Dr D (Amar Damodar). Nothing here is signed off. Every box below is unticked until Dr D ticks it in his own words.

Educational PD prescribing tool for nephrologists. No login, ads, analytics or data collection; inputs are never stored.

---

## 0. What model this is, and what it is not

Dr D asked for Adequest-style modeling (predict weekly Kt/V, CrCl and UF for CAPD/APD regimens from a PET). The commercial program's equations are proprietary and not published, so **this app does not reproduce it** and does not use its name in the app.

What the app implements instead, from published sources only:

1. **Transparent calculators** — V (Watson or Hume-Weyers), BSA (Mosteller), PET classification (Twardowski), ISPD 2021 UF screen, and measured weekly Kt/V and CrCl from 24-h dialysate and urine (KDOQI 2006 definitions).
2. **A simple published-method regimen estimate** — the Garred simple diffusion model (volume-corrected form). The patient's own 4-h PET gives a mass transfer area coefficient (MTAC) for creatinine and, if D/P urea is entered, urea. The same equation is then solved forward for each dwell of a CAPD or APD regimen.

**Why this model:** it is the one fully published, single-equation small-solute model that can be fitted from the PET values clinicians already have (D/P, fill, drain, 4 h). The three-pore model (Rippe) needs membrane parameters (hydraulic conductance, small/large pore fractions, lymphatic flow) that a standard PET does not give, so fitting it per patient would mean assuming population values; we did not do that.

**What the app could NOT do from public data (shown in the app under “Limits of the estimate”):**

- **No validated predictive model.** KDOQI 2006 notes that commercial kinetic-modeling programs “have been validated for clinical use”; this Garred-based estimate has **not** been validated against measured clearances.
- **No UF prediction.** Regimen UF depends on osmotic conductance, glucose absorption and lymphatic flow (three-pore model). The app counts UF only when you enter it (default 0, which understates clearance).
- **No urea MTAC without D/P urea.** There is no published fixed ratio from creatinine MTAC to urea MTAC that we could cite, so Kt/V is estimated only if 4-h D/P urea is entered.
- **MTAC held constant:** no effect of fill volume, posture, or recruitment; no residual intraperitoneal volume; APD fill/drain time counts as 0 unless entered.
- No icodextrin-specific kinetics, no middle-molecule, sodium or glucose-absorption estimates.

- [ ] Sign-off: model choice (Garred, volume-corrected) and the stated limitations

---

## 1. Urea distribution volume (V)

**Watson** (Watson PE, Watson ID, Batt RD. *Am J Clin Nutr.* 1980;33:27-39. doi:10.1093/ajcn/33.1.27)

```
Male:   V = 2.447 − 0.09516 × age + 0.1074 × height_cm + 0.3362 × weight_kg
Female: V = −2.097 + 0.1069 × height_cm + 0.2466 × weight_kg   (no age term)
```

The male age coefficient is the published 0.09516 (a circulated variant uses 0.09156; not used).

**Hume-Weyers** (Hume R, Weyers E. *J Clin Pathol.* 1971;24:234-238. doi:10.1136/jcp.24.3.234). Paper text: “The linear regression of total body water in litres on height (H) in centimetres and on weight (W) in kilograms is 0·194786H + 0·296785W − 14·012934” (males) and “0·344547H + 0·183809W − 35·270121” (females).

**Guideline:** KDOQI 2006 PD Adequacy CPR 2.6: “When calculating Kt/V urea, one should estimate V from either the Watson or Hume equation in adults. In the absence of evidence, use of the patients' ideal or standard (rather than actual) weight should be considered in the calculation of V.” The app uses the weight entered (Watson default); Dr D to decide whether to label “use standard weight”.

Worked examples (tests): male 60 y, 175 cm, 80 kg → Watson 42.43 L, Hume 43.82 L; female 165 cm, 65 kg → Watson 31.57 L, Hume 33.53 L.

- [ ] Sign-off: Watson (default) and Hume-Weyers coefficients; actual weight used

---

## 2. Body surface area and normalisation

- Mosteller RD. *N Engl J Med.* 1987;317:1098: BSA = √(height_cm × weight_kg / 3600). Used for CrCl normalisation.
- Du Bois D, Du Bois EF. *Arch Intern Med.* 1916;17:863-871: 0.007184 × W^0.425 × H^0.725 (in formulas.js and tests; not shown on screen).
- CrCl normalised to **1.73 m²**: CrCl (L/week/1.73 m²) = 7 × L/day × 1.73 / BSA (KDOQI 2006 units, “L/wk/1.73 m²”).

- [ ] Sign-off: Mosteller BSA, 1.73 m² normalisation, 7 days/week

---

## 3. PET protocol and transport categories

**Protocol** — Twardowski ZJ, Nolph KD, Khanna R, et al. Peritoneal equilibration test. *Perit Dial Bull.* 1987;7:138-147 (doi:10.1177/089686088700700306). Abstract: “Equilibration test was performed over a 4-hour dwell exchange with 2 L of 2.5% Dianeal solution.” → app constants: 240 min, 2.0 L default fill, 2.5% default PET solution.

**4-h D/P creatinine** (Twardowski; table as reproduced by QxMD “PET calculations”, citing Twardowski ZJ, *Blood Purif.* 1989;7:95-108):

| Category | D/P creatinine |
|---|---|
| High | 0.82–1.03 |
| High-average | 0.65–0.81 |
| Low-average | 0.50–0.64 |
| Low | 0.34–0.49 |

**4-h D/D₀ glucose** (Twardowski 1987 bands as reproduced in secondary PET references):

| Category | D/D₀ glucose |
|---|---|
| High | 0.12–0.25 |
| High-average | 0.26–0.38 |
| Low-average | 0.39–0.49 |
| Low | 0.50–0.61 |

**Note for Dr D:** the earlier CRRT & PD Dosing draft used 0.12–0.26 / 0.27–0.38 for the top two glucose bands. Secondary sources found this time give 0.12–0.25 / 0.26–0.38, which this app uses. Please confirm against the original 1987 figure.

Rules (judgment, stated): values are rounded to 2 decimals before banding; values below 0.34 or above 1.03 are reported in the end band with a note; category follows D/P creatinine, and disagreement with D/D₀ is flagged with “consider repeating the PET” (QxMD: “If discordance in D/P creatinine and D/D0 glucose is noted, it is recommended to repeat the PET.”).

Worked example (Fresenius Medical Care, “Interpreting the PET”): “if the 4-hour D/P creatinine is 0.59 and the 4-hour D/D0 glucose is 0.47, the patient would be classified as low average.” — in tests.

Context (Twardowski 1987 abstract, not used as advice text): “Patients with high peritoneal solute transfer rates were likely to have inadequate ultrafiltration on standard CAPD… Patients with low average, and particularly low peritoneal transport rates were likely to develop symptoms and signs of inadequate dialysis as their residual renal function became negligible”.

Caveat: ISPD 2021 Guideline 2A uses the term PSTR and recommends a 4-h PET “using either 2.5%/2.27% or 4.25%/3.86% dextrose/glucose concentration and creatinine as the index solute.”

- [ ] Sign-off: PET protocol constants, D/P creatinine bands, D/D₀ bands (please confirm 0.25/0.26), discordance flag

---

## 4. PET ultrafiltration screen

Morelle J, Stachowska-Pietka J, Öberg C, et al. ISPD recommendations for the evaluation of peritoneal membrane dysfunction in adults. *Perit Dial Int.* 2021;41(4):352-372. doi:10.1177/0896860820982218. Guideline 3 (verbatim): “Insufficient UF should be suspected when either (a) the net UF from a 4-h PET is <400 ml (3.86% glucose/4.25% dextrose) or <100 ml (2.27% glucose /2.5% dextrose), (GRADE 1B) and/or (b) the daily UF is insufficient to maintain adequate fluid status.”

App: net UF = drain − fill. Flag if < 400 mL (4.25%) or < 100 mL (2.5%).

- [ ] Sign-off: PET net UF and ISPD 2021 thresholds 400 / 100 mL

---

## 5. Regimen estimate — Garred model

**Equation.** Garred LJ, Canaud B, Farrell PC. A simple kinetic model for assessing peritoneal mass transfer in chronic ambulatory peritoneal dialysis. *ASAIO J.* 1983;6:131-137. Volume-corrected form as written in Asghar RB, Diskin AM, Spanel P, Smith D, Davies SJ. Measuring transport of water across the peritoneal membrane. *Kidney Int.* 2003;64:1911-1915 (doi:10.1046/j.1523-1755.2003.00253.x):

```
MTAC = (V(td) / td) × ln[ V(0) × (P − D(0)) / ( V(td) × (P − D(td)) ) ]
```

With fresh dialysate D(0) = 0 for urea and creatinine:

```
Fit from PET:   MTAC = (Vt / 240) × ln[ V0 / (Vt × (1 − D/P₄ₕ)) ]          (mL/min; volumes in mL)
Each dwell:     D/P  = 1 − (V0 / Vt) × exp(−MTAC × t / Vt)                    (same equation solved for D)
Daily Kt (L):   Σ D/P × drain volume, drain = fill + entered net UF
Weekly Kt/V:    7 × (peritoneal Kt + renal urea clearance) / V
Weekly CrCl:    7 × (Σ D/P_Cr × drain + RKF mean) × 1.73 / BSA
```

V0 = fill, Vt = end-of-dwell volume (PET: measured drain), t = dwell minutes. D/P is floored at 0.

**Model family.** Waniewski J, Werynski A, Heimbürger O, Lindholm B. Simple models for description of small-solute transport in peritoneal dialysis. *Blood Purif.* 1991;9:129-141. Abstract: Garred is the “F = 0 (as in the widely used model of Garred and coworkers)” member; “The differences between the simple models were small from the clinical point of view for urea, creatinine, glucose, and potassium… For urea and creatinine the model with F = 0.5 yielded the best fit”. We use Garred (F = 0) because its form is the one written out in a retrievable source; Dr D may prefer F = 0.5.

**Plausibility checks against published cohorts (tests, not validation):**

- Asghar 2003 (full text, Results): mean intraperitoneal volume at 2 h “1957 ± 151 mL”; time constants “urea … 115 ± 21 minutes, creatinine … 178 ± 54 minutes”; MTAC “urea 18.2 ± 2.3 mL/min, creatinine 10.5 ± 2.04 mL/min”. Garred on a constant 1957 mL at 120 min returns V/τ = 17.0 (urea) and 11.0 (creatinine) mL/min, each within 1 SD of the reported means.
- Pannekeet MM, Imholz AL, Struijk DG, et al. The standard peritoneal permeability analysis. *Kidney Int.* 1995;48:866-875 (doi:10.1038/ki.1995.363). Abstract: “MTACCr, 10.4 ml/min (5.7 to 19.3) … D/PCr, 0.76 (0.53 to 1.14) … NUF, −75 ml”. Garred on those medians (2 L, 4 h) gives 11.75 mL/min, inside the published range. Caveat: SPA used 1.36% glucose with dextran, and the medians are not from one patient.
- Round trip: the fitted MTAC run forward on the PET dwell returns the PET D/P exactly.

**Hand worked example (in tests):** D/P Cr 0.70, D/P urea 0.90, fill 2 L, drain 2.2 L → MTAC Cr 10.16, urea 20.23 mL/min. CAPD 4 × 2 L, 6-h dwells, UF 0 → peritoneal urea Kt 7.79 L/day → weekly peritoneal Kt/V 1.29 with V 42.43 L.

**Guideline context.** KDOQI 2006 CPG 2 definitions: “‘Delivered’ peritoneal Kt/V urea refers to the actual dose the patient is receiving based on measurement… This is distinct from an estimated peritoneal Kt/V urea using a kinetic modeling program.” The app labels every model value “Estimated … (model, not measured)”.

- [ ] Sign-off: Garred equation, D(0)=0, forward solution, Σ D/P × drain, labelled as estimate

---

## 6. Regimen inputs and dwell construction (no numbers invented)

- **CAPD:** exchanges/day, fill (L), solution, optional long dwell (h), optional net UF per exchange and for the long dwell. No long dwell → 24 h split equally; with a long dwell → the other exchanges share 24 h − long dwell.
- **APD (labelled CCPD in the UI since §11):** night cycles, fill, total therapy time, optional fill + drain time per cycle (blank = 0, stated on screen as overstating dwell time), net UF per cycle, last fill (0 = dry day), day dwell (default 24 h − therapy time), last-fill UF.
- **Defaults to confirm (Dr D):** CAPD 4 exchanges × 2.0 L. Source: the ADEMEX control arm, per KDOQI 2006: “CAPD patients were randomized to continue on 4 exchanges using 2 L per exchange”. APD numeric fields have no defaults (required). Net UF defaults to 0.
- **Default solution chips (judgment, to confirm):** CAPD 2.5% dextrose; APD night 1.5%; last fill icodextrin; long dwell “same”. Solutions affect only the printed prescription, not the clearance estimate.
- **Solution labels:** 1.5%, 2.5%, 4.25% dextrose and icodextrin 7.5% (standard bag labels).

- [ ] Sign-off: dwell construction rules, 4 × 2.0 L CAPD default, default solution chips, UF default 0

---

## 7. Measured clearances and residual kidney function

KDOQI 2006 PD Adequacy, Guideline 2 definitions (verbatim): total clearance “is based on a 24-hour collection of urine (kidney Kt/V urea; if volume >100 mL/d) and a 24-hour collection of effluent for CAPD and APD, a sample of the effluent, and the total drained effluent volume (peritoneal Kt/V urea; adding ultrafiltration with the infused dialysate volume). The term RKF is used to refer to estimated GFR, measured as the average of CCr and urea nitrogen clearance based on a 24-hour urine collection. Urine volume in 24 hours of 100 mL or less is considered to represent negligible RKF”.

```
Peritoneal Kt (L/day) = D_urea / P_urea × 24-h drain (L)
Renal urea clearance (L/day) = U_urea / P_urea × 24-h urine (L)
Weekly Kt/V = 7 × (peritoneal + renal) / V
RKF (L/day) = ½ × (renal urea + renal creatinine clearance)  → added to CrCl
mL/min = L/day × 1000 / 1440
```

Units: any, as long as urine/dialysate and plasma use the same unit (ratios only). Worked examples: D/P urea 0.9 × 10 L = 9 L/day, V 35 L → 1.80; U/P 5 × 0.5 L = 2.5 L/day; 10 L/day at BSA 1.73 → 70 L/week/1.73 m².

Caveat: renal Kt/V uses urea clearance (not the mean), as in the KDOQI definition of kidney Kt/V urea; the mean is used for the CrCl total. No glucose correction of dialysate creatinine is applied (lab-dependent).

- [ ] Sign-off: measured Kt/V, renal Kt/V, RKF mean for CrCl, 100 mL/day threshold

---

## 8. Targets (informational, never pass/fail)

- **ISPD 2020** — Brown EA, Blake PG, Boudville N, et al. International Society for Peritoneal Dialysis practice recommendations: Prescribing high-quality goal-directed peritoneal dialysis. *Perit Dial Int.* 2020;40(3):244-253. doi:10.1177/0896860819895364. §3.4: “There is no specific clearance target that guarantees sufficient dialysis for an individual. Increasing small solute clearance to a Kt/V > 1.7 may improve uraemia-related symptoms, if present, but there is only low certainty evidence…” and “If symptoms, nutrition and volume are all controlled, no PD prescription change is needed for the sole purpose of reaching an arbitrary clearance target (practice point).”
- **KDOQI 2006** CPG 2.1.1: “The minimal ‘delivered’ dose of total small-solute clearance should be a total (peritoneal and kidney) Kt/V urea of at least 1.7 per week. (B)” CPG 2.2.1 (no RKF): “a peritoneal Kt/V urea of at least 1.7 per week”. → app shows a “≥ 1.7” / “< 1.7” chip only.
- **CrCl:** KDOQI 2006 CPR 2.7: peritoneal CCr “is of little added value for predicting risk for death; therefore, for simplicity, adequacy targets are based on urea kinetics only.” The older figure (“creatinine clearance (CCr) of 60 L/wk/1.73 m2 for CAPD patients”, from CANUSA extrapolations, quoted in KDOQI 2006) is in the About sheet as history only; CrCl has no on-screen target.

- [ ] Sign-off: ISPD 2020 framing, 1.7 reference chip, CrCl shown without a target

---

## 9. Prescription summary

Prints modality and regimen (exchanges × fill and solution, or cycles × fill, therapy time, night solution, last fill and day dwell), then “Estimated clearance (model, not measured)” — or “Measured clearance (24-h collections)” when only measured values exist — with weekly Kt/V (peritoneal + renal) and CrCl, the PET transport category, and the footer “Educational estimate only. Confirm with a measured 24-h collection.” No electrolyte composition. Blank values print as write-in lines.

- [ ] Sign-off: prescription summary wording

---

## 10. Transport type only (no PET numbers) — added after Dr D asked “Do we need actual pet no or just broad types would do”

**Design.** Step 2 now starts with a transport-type picker (High, High-average, Low-average, Low). The PET numbers (solution, D/P creatinine, D/D₀ glucose, fill, drain, D/P urea) sit in an optional “Have PET numbers?” section. If a D/P creatinine is entered, **the numbers win**: the category is computed from them, and if it differs from the picked type the app says so (“PET numbers give X, not the picked Y. Using the numbers.”).

**What is used when only a type is picked (every value from a citable table; nothing invented):**

| Type | Typical 4-h D/P creatinine (band midpoint) | Typical 4-h PET drain volume (band midpoint) | Typical D/P urea |
|---|---|---|---|
| Low | (0.34 + 0.49) / 2 = **0.415** | (2651 + 3326) / 2 = **2,988.5 mL** | none |
| Low-average | (0.50 + 0.64) / 2 = **0.57** | (2369 + 2650) / 2 = **2,509.5 mL** | none |
| High-average | (0.65 + 0.81) / 2 = **0.73** | (2085 + 2367) / 2 = **2,226 mL** | none |
| High | (0.82 + 1.03) / 2 = **0.925** | (1580 + 2084) / 2 = **1,832 mL** | none |

Fill 2.0 L, 4-h dwell (Twardowski 1987 PET protocol, §3).

Sources:
- **D/P creatinine bands:** Twardowski ZJ. Clinical value of standardized equilibration tests in CAPD patients. *Blood Purif.* 1989;7:95-108, as reproduced (with permission) in the QxMD PET reference: “HIGH 0.82 - 1.03 · HIGH-AVERAGE 0.65 - 0.81 · LOW-AVERAGE 0.50 - 0.64 · LOW 0.34 - 0.49” — the same bands already used in §3.
- **Drain volume by transport class:** Twardowski ZJ. The fast peritoneal equilibration test. *Semin Dial.* 1990;3:141-142, as tabulated in the Ascend Laboratories reference manual (“PET STANDARD AND PET MODIFIED”; the column is headed “Ultrafiltration Volume” but the values are 4-h drain volumes in mL for a 2 L dwell): “Low 0.34-0.49 0.50-0.61 2651-3326 · Low average 0.50-0.64 0.39-0.49 2369-2650 · Mean 0.65 0.38 2368 · High average 0.66-0.81 0.27-0.37 2085-2367 · High 0.82-1.03 0.12-0.26 1580-2084”, with the note “Membrane Transport Rate valid only for 2 liter 2.5% dialysis solution.” (That table lists High-average from 0.66; the app keeps the Blood Purif 1989 lower bound of 0.65, so the High-average midpoint is 0.73. With 0.66 it would be 0.735.)
- **D/P urea:** no published table giving a typical 4-h D/P urea **per transport category** was found. The only citable figure found is the overall Twardowski mean, “PET D/P urea at 240': 0.91 +/- 0.07(T)” (quoted in the abstract of *Peritoneal function tests: usefulness of simplified methods*, PubMed 1361780), which is a population mean, not a per-category value. It is **not** used. ERBP 2010 (van Biesen W et al. *Nephrol Dial Transplant.* 2010;25:2052-2062): “D/P urea shows far less variability between patients than D/P of larger molecules.”

**Consequence:** from a type alone the app estimates **creatinine clearance only**. Kt/V shows “needs D/P urea” and the options table shows “—” for Kt/V. Every type-only estimate carries: “Estimated from typical values for <type> transporters — enter PET numbers for a patient-specific estimate.” (Step 2, Step 4, the options table, and the printed prescription, which also marks “PET transport: <type> (typical values)”.)

**Worked example (screenshots):** male, 60 y, 5 ft 9 in (175.26 cm), 80 kg → Watson V 42.46 L, BSA 1.97 m². High-average typical → MTAC creatinine (2226/240) × ln[2000 / (2226 × 0.27)] = **11.15 mL/min**. Custom CAPD 4 × 2.0 L, 6-h dwells, UF 0 → peritoneal creatinine clearance 6.93 L/day → **CrCl 42.5 L/week/1.73 m²**; Kt/V not estimated.

**Question for Dr D — drain volume.** Pairing each type with the drain-volume midpoint of the same class is citable, but it assumes drain volume moves with creatinine transport. With UF 0 in the regimen, the large typical PET drain for Low (2,989 mL) gives a low MTAC creatinine (1.68 mL/min; Low-average 6.45, High-average 11.15, High 20.44). The alternative is to assume drain = fill (2.0 L), which gives Low 4.47, Low-average 7.03, High-average 10.91, High 21.59 mL/min. The app currently uses the cited drain midpoints. Tell me which you prefer.

- [ ] Sign-off: transport-type-only input — creatinine band midpoints, drain-volume midpoints (or drain = fill), no typical D/P urea (Kt/V unavailable from type alone), “numbers win” rule and disagreement flag, label wording

---

## 11. Regimen options (CAPD, CCPD, with and without Extraneal) — added after Dr D asked “Give both capd options and ccpd options and also options with extraneal”

Step 5 now shows a compact table of standard regimens for the patient, with estimated weekly total Kt/V (green ≥ 1.7, amber below; KDOQI 2006 reference, informational) and CrCl (L/week/1.73 m²). The user's own regimen in Step 4 is unchanged. In the UI, **APD is now called CCPD**.

| Option | Dwells modeled |
|---|---|
| CAPD 3 × 2.0 L | 2 day dwells sharing 16 h + 8-h overnight long dwell |
| CAPD 4 × 2.0 L | 3 day dwells sharing 16 h + 8-h overnight long dwell |
| CAPD 4 × 2.5 L | as above, 2.5 L |
| CCPD 4 × 2.0 L, 9 h, dry day | 4 night cycles of 135 min |
| CCPD 4 × 2.0 L, 9 h + 2.0 L day dwell | + 15-h day dwell |
| CCPD 5 × 2.0 L, 9 h + 2.0 L day dwell | 5 cycles of 108 min + 15-h day dwell |
| CCPD 5 × 2.5 L, 9 h + 2.0 L day dwell | as above, 2.5 L cycles |

Each option with a long dwell (all CAPD; CCPD with a day dwell) also appears as “+ Extraneal long dwell”.

Sources for the option set:
- **CAPD volumes and exchanges:** Daugirdas JT, Blake PG, Ing TS. *Handbook of Dialysis*, 4th ed. 2006, as reproduced in DeVita MV, *Peritoneal dialysis modalities* (ISPD North American Chapter teaching slides, May 2011): “4 ( number of exchanges) x 2L ( dwell volumes) is the typical prescription. 4 x 2.5L in larger patients with small RRF or anuric patients who weigh >75 kg. 3 x 2L in smaller patients or in patients with good RRF.”
- **ADEMEX** (Paniagua R et al. *J Am Soc Nephrol.* 2002;13:1307-1320): control group “four daily exchanges with 2 L of standard PD solution”; the intervention group was modified “to achieve a peritoneal creatinine clearance (pCrCl) of 60 L/wk per 1.73 m(2)”.
- **CCPD:** same slides: “Continuous cycled peritoneal dialysis 3 to 7 cycles of 1.5 to 2.5 L delivered over 9 hours at nighttime”; “Cycle frequency- 3 to 5 cycles per 9 hour cycling session”; “Cycler dwell volumes - 2 to 2.5 L”; “Can start with NIPD if patient has good residual volume.” *Peritoneal Dialysis Prescription and Adequacy in Clinical Practice: Core Curriculum 2023* (Am J Kidney Dis): “Patients should not receive more than 5 exchanges per night on the cycler”.
- **Overnight CAPD dwell 8 h:** “8 to 10 hours during the overnight exchange” (IHE/dialysisinterop *Peritoneal Dialysis Therapy and Devices*); the app uses the low end, 8 h. CCPD day dwell = 24 h − 9 h = 15 h. Day-dwell volume 2.0 L is the typical exchange volume above (judgment, to confirm).
- **Extraneal (icodextrin 7.5%):** prescribing information: “indicated for a single daily exchange for the long (8- to 16- hour) dwell during continuous ambulatory peritoneal dialysis (CAPD) or automated peritoneal dialysis (APD)”. Both long dwells in the table (8 h, 15 h) are within that range.

Verification note: the slide deck PDF returned an error (HTTP 500/502) when I tried to open it directly on 14 Nov 2026; the quotes above are from its indexed text. Please check them against your copy of the Handbook.

**Icodextrin is not modeled.** No published relationship that converts icodextrin into a small-solute clearance change for this model was used. The Extraneal long dwell is the same Garred diffusive dwell. Its clearance differs from the dextrose row only if the user enters an expected long-dwell UF (optional fields “Long-dwell UF, dextrose” and “Long-dwell UF, Extraneal”). With nothing entered, the two rows are identical, and the screen says “icodextrin’s UF advantage is not modeled”. No UF numbers are assumed. Short dwells count net UF as 0. CCPD fill/drain time counts as 0, which overstates dwell time.

**Worked example (same patient, High-average typical, no urine data), CrCl L/week/1.73 m²:** CAPD 3 × 2.0 L 34.3 · CAPD 4 × 2.0 L 42.1 · CAPD 4 × 2.5 L 48.5 · CCPD 4 × 2.0 L dry day 26.0 · CCPD 4 × 2.0 L + day 38.2 · CCPD 5 × 2.0 L + day 40.0 · CCPD 5 × 2.5 L + day 41.5. Each Extraneal row matches its dextrose row (no UF entered). Kt/V “—” (needs D/P urea).

- [ ] Sign-off: regimen option set and sources, 8-h CAPD overnight / 15-h CCPD day dwell, 2.0 L day-dwell volume, Extraneal rows with icodextrin not modeled, CCPD naming

---

## 12. Height in feet and inches; weight in kg or lb — added after Dr D asked “Height should be in ft and inches”

Height is entered as feet + inches and converted internally: cm = (ft × 12 + in) × 2.54 (exact by definition of the international inch). Weight can be entered in kg (default) or lb: kg = lb × 0.45359237 (exact by definition of the international pound). Watson, Hume-Weyers and Mosteller still use cm and kg. Example: 5 ft 9 in = 175.26 cm.

- [ ] Sign-off: ft/in height entry, optional lb weight entry, conversions

---

## 13. Redesign: five inputs → Top 3 CAPD and Top 3 CCPD — added after Dr D asked to “redesign app with the above in mind” (minimum inputs, 3 best CAPD and 3 best CCPD options)

**Screen 1 (one scroll): the minimum inputs.**
1. Sex, age, height (ft + in), weight (kg or lb) → V (Watson, §1) and BSA (Mosteller, §2). Hume-Weyers is still in the code but no longer offered on screen.
2. PET transport type (4 buttons, typical values as in §10), with an optional “I have PET numbers” expander: 4-h D/P creatinine, 4-h D/P urea, and 4-h drain volume. Numbers win (§10). Fill is fixed at the PET protocol 2.0 L, 4 h (§3).
3. Residual urine output, mL/day (blank/0 = anuric), labelled “can change the ranking a lot”, with an optional “Residual clearance details” expander for urine and serum urea and creatinine (§7 equations).
4. Ranking target: weekly Kt/V ≥ 1.7 by default (editable); CrCl shown alongside.
5. Optional “Expected long-dwell UF” expander (dextrose / Extraneal), unchanged from §11.

**Removed from the screen (still in the code and tests):** D/D₀ glucose, PET solution and the ISPD 2021 UF screen (§3–4), the Hume-Weyers choice, the measured 24-h dialysate card (§7), and the custom regimen builder (§6). Please say if you want any of them back, e.g. behind an “Advanced” expander.

**Screen 2: results.** A summary line, then **Top 3 CAPD** and **Top 3 CCPD** cards. Each option shows the regimen in plain words, weekly Kt/V (or “needs D/P urea”), weekly CrCl in L/week/1.73 m², a “Meets target” / “Below target” badge, and “model estimate, not measured”. Tapping an option fills the prescription summary (§9; solution strengths are left as write-in lines). The full table of every candidate is under “See all options”.

**Judgment calls in the inputs (to confirm):**
- **D/P numbers without a drain volume.** If D/P creatinine or D/P urea is entered without a 4-h drain volume, the app uses the typical drain-volume midpoint for the transport category (the same Twardowski 1990 values as §10). The screen says “drain … (typical for <type>)”.
- **D/P urea without D/P creatinine.** Allowed: the picked type gives the typical D/P creatinine and drain; the entered D/P urea gives the urea MTAC, so Kt/V can be ranked.
- **Urine volume alone is not converted to clearance.** No published conversion from urine volume to renal urea clearance is used. With urine volume but no urine and serum urea, residual function is **not counted** and the screen says so in amber. With urea values, renal Kt/V is added to every option (§7); with creatinine as well, RKF is added to CrCl.

### Ranking rule

**Candidate set (same Garred model and dwell rules as §6 and §11; only the grid is wider):**

| Modality | Grid | Count |
|---|---|---|
| CAPD | 3, 4 or 5 exchanges × 2.0, 2.5 or 3.0 L; 8-h overnight long dwell, the rest share 16 h | 9 |
| CCPD | 4 or 5 cycles × 2.0 or 2.5 L over 9 h; dry day or a 2.0 L 15-h day dwell | 8 |

Each option with a long dwell (all CAPD; CCPD with a day dwell) also has an Extraneal variant (icodextrin not modeled, §11). Every original §11 option is in the set. **New beyond the §11 sources:** 3.0 L CAPD fills and 5 CAPD exchanges a day (the Handbook quote covers 3–4 × 2.0–2.5 L); please confirm or trim. CCPD stays within “3 to 5 cycles”, “2 to 2.5 L” and “no more than 5 exchanges per night”.

**Metric and target.**
- Rank by **total weekly Kt/V** (peritoneal + renal when urea values are entered) against the target, default **1.7** (KDOQI 2006 CPG 2.1.1, §8). ISPD 2020 framing is unchanged: the target is a reference, not a guarantee.
- **CrCl fallback:** if Kt/V can’t be estimated (type only, or no D/P urea), rank by **weekly CrCl (L/week/1.73 m²)** against **60**, the historical CANUSA-based CAPD figure already shown in §8, and say so plainly (“Ranked by weekly CrCl: Kt/V can’t be estimated without a 4-h D/P urea.”). 60 is also applied to CCPD; no separate cycler CrCl figure is used. KDOQI 2006 CPR 2.7 says CrCl “is of little added value for predicting risk for death”, and ADEMEX raising peritoneal CrCl to 60 did not improve survival, so this is a weak fallback.

**Order.**
1. Options that meet the target come first, **least burdensome first**: CAPD by fewer exchanges, then smaller fill. CCPD by dry day before a day dwell, then fewer cycles, then smaller fill. Ties go to the higher clearance.
2. If fewer than 3 meet the target, the rest of the 3 are the highest-clearance options below it (badged “Below target”, with an amber note).
3. If none meet it, the 3 highest-clearance options are shown with the amber note “None of these options reaches the target (…). Showing the 3 highest-clearance options.”
4. The dextrose and Extraneal versions of one regimen count once: the dextrose row, unless only the Extraneal row meets the target (or, below target, is higher because an Extraneal UF was entered).

The burden order is a judgment, not a published rule. For example, it puts CAPD 3 × 3.0 L ahead of CAPD 4 × 2.0 L, and CCPD 5 × 2.5 L dry day ahead of 4 × 2.0 L with a day dwell.

**Worked example (screenshots):** male, 55 y, 5 ft 10 in (177.8 cm), 80 kg → Watson V 43.2 L, BSA 1.99 m²; high-average; urine 500 mL/day with no urine/serum values (not counted).
- Type only (ranked by CrCl, none reach 60): CAPD 5 × 3.0 L 58.4 · 5 × 2.5 L 53.5 · 4 × 3.0 L 53.3. CCPD 5 × 2.5 L + day 41.2 · 4 × 2.5 L + day 39.7 · 5 × 2.0 L + day 39.7.
- D/P creatinine 0.70, D/P urea 0.75, drain typical 2,226 mL (ranked by Kt/V, none reach 1.7): CAPD 5 × 3.0 L 1.60 / 55.4 · 5 × 2.5 L 1.47 / 51.1 · 4 × 3.0 L 1.46 / 51.0. CCPD 5 × 2.5 L + day 1.13 / 39.1 · 4 × 2.5 L + day 1.09 / 37.8 · 5 × 2.0 L + day 1.09 / 37.8.

- [ ] Sign-off: ranking — target Kt/V 1.7 (default, editable), total = peritoneal + renal, informational framing
- [ ] Sign-off: ranking — burden ordering (CAPD exchanges then fill; CCPD dry day, then cycles, then fill), meeting-target first, fill with highest-clearance below target, Extraneal counted once
- [ ] Sign-off: ranking — candidate set (CAPD 3–5 × 2.0/2.5/3.0 L with 8-h overnight; CCPD 4–5 × 2.0/2.5 L, 9 h, dry or 2.0 L 15-h day dwell; Extraneal variants), including the new 3.0 L and 5-exchange CAPD options
- [ ] Sign-off: ranking — CrCl fallback when there is no D/P urea (60 L/week/1.73 m² for CAPD and CCPD, stated plainly on screen)
- [ ] Sign-off: minimal input screen — removed inputs (D/D₀, PET solution and UF screen, Hume-Weyers, measured dialysate, custom regimen), typical drain when D/P numbers lack a drain volume, urine volume not counted without urine/serum values

---

## 14. Version 0.4: what changed and why (approved by Dr D: options 1, 2 and 3; then the 4-step workflow, then the lab loop with scanning)

Dr D approved three uses of published Adequest data. He then asked for a “useful pd workflow for nephrologist prescribing pd” and for clinicians to “scan information labs and things when available and new prescription choices are given”. PD Buddy cites PD Adequest-derived numbers from peer-reviewed papers. It does not contain, copy or reproduce PD Adequest. No code was copied from any program; the GitHub repo carliercomputationallab/PD-comparison-paper has no licence and was not used.

Sections 10, 11 and 13 above describe 0.3 behaviour. Where they say Kt/V is unavailable from type alone, that icodextrin is not modeled, or that UF is not predicted, §15–16 supersede them.

- [ ] Sign-off: citing Adequest-derived published parameters and the Baxter/Akonur grid in a free educational tool (wording “published Adequest-derived parameters”, never “Adequest”)

## 15. Option 1: Kt/V from transport type alone (published typical MTACs)

When the patient’s own 4-h D/P urea is not entered, the Garred estimate uses the published typical-patient urea MTAC for the transport type. These are PD Adequest 2.0 estimates in the TARGET cohort.
- Urea MTAC (mL/min): High 27.71 · High-average 23.14 · Low-average 18.40 · Low 15.92. Source: Akonur A, Sloand J, Davis I, Leypoldt J. *Perit Dial Int.* 2016;36(1):79-84, doi:10.3747/pdi.2013.00081, Table 1.
- Creatinine MTAC (mL/min), used only when no D/P creatinine is entered: High 19.15 · High-average 11.92 · Low-average 8.60. Source: Akonur A, Guest S, Sloand JA, Leypoldt JK. *Perit Dial Int.* 2013;33(6):646-654, doi:10.3747/pdi.2012.00261, Table 1.
- Low transport has no published creatinine MTAC, so it keeps the 0.3 method: Garred MTAC from the Twardowski D/P creatinine band midpoint and the drain midpoint.
- With D/P creatinine but no D/P urea, the urea MTAC is the published value for the category the D/P creatinine falls in.
- Label on screen: “typical-patient estimate from published Adequest-derived parameters, not measured”.
- Ranking now uses the Kt/V target whenever an urea MTAC exists, which includes type-only. The CrCl fallback remains only if Kt/V cannot be estimated.
- Plausibility check (tests/workflow.test.js): the 4-h D/P urea implied by the HA urea MTAC with the typical HA drain is about 0.92.

- [ ] Sign-off: urea MTACs 27.71 / 23.14 / 18.40 / 15.92 mL/min (Akonur 2016 Table 1) used in the Garred model when D/P urea is missing
- [ ] Sign-off: creatinine MTACs 19.15 / 11.92 / 8.60 mL/min (Akonur 2013 Table 1) used when D/P creatinine is missing; Low keeps the band-midpoint method
- [ ] Sign-off: D/P creatinine without D/P urea → published urea MTAC of that category
- [ ] Sign-off: label wording “typical-patient estimate from published Adequest-derived parameters, not measured”
- [ ] Sign-off: rank by Kt/V target for type-only input (replaces the 0.3 CrCl ranking for type-only)
- [ ] Sign-off: TARGET-cohort typical patients (BSA 1.84–1.87 m², TBW 40.6–42.3 L) applied to any body size through V and BSA only

## 16. Option 2: open three-pore model for UF (experimental)

`js/threepore.js` is written from published equations: Öberg CM, Rippe B. *Kidney Int Rep.* 2017;2:943-951 (doi:10.1016/j.ekir.2017.04.010), eq. 1–13; Bergling K, Lund University doctoral thesis 2023 (ISBN 978-91-8021-370-7), eq. 9–15; Rippe B, Stelin G, Haraldsson B. *Kidney Int.* 1991;40:315-325; and Vonesh EF et al. *Perit Dial Int.* 1999;19:556-571, Appendix.

Each number used, with its source:
- Fractional hydraulic conductance by pore: small 0.90, large 0.08, aquaporin 0.02 (Öberg & Rippe 2017 Table 1).
- Reflection coefficients: glucose small 0.028, large 0.0010, aquaporin 1.0; albumin small 0.950, large 0.085, aquaporin 1 (Rippe B, Davies S. *Perit Dial Int.* 2011;31(3):249-258, doi:10.3747/pdi.2010.00124, Table 2).
- Protein oncotic pressure gradient 22 mmHg; dialysate Na 132 mmol/L; Na osmotic coefficient 0.93; plasma urea 20 mmol/L; plasma glucose 6.5 mmol/L; PS Na 4.5 mL/min at A0/Δx 25,000, scaled by A0/Δx (Öberg & Rippe 2017 Table 1).
- Plasma Na 137 mmol/L (Akonur 2013 simulation setting).
- Hydrostatic gradient ΔP 8 mmHg. Bergling 2023 says “about 8 or 9 mmHg”; 8 was chosen because the fit is better (RMSE 111 vs 162 mL at 9). This is a choice for review.
- RT 19.3 mmHg per mmol/L (van ’t Hoff; Bergling 2023).
- Area factor 16.18·(1 − e^(−0.00077·V))/13.3187, applied to PS and LpS (Keshaviah, as written in Öberg & Rippe 2017).
- Time-dependent MTAC ×[1 + 0.66·e^(−0.02·t)], with t in minutes since fill (Vonesh 1999 eq. A7). Vonesh eq. A8 (one value per exchange) fits worse (RMSE 131 mL).
- Per transport type (Akonur 2016 Table 1): LpS 0.0575 / 0.0560 / 0.0563 / 0.0554 mL/min/mmHg; A0/Δx 40,398 / 29,362 / 21,942 / 16,402 cm; glucose MTAC 16.34 / 11.71 / 8.35 / 5.96 mL/min; urea MTAC as in §15 (H / HA / LA / L).
- Glucose in fresh dialysate: 1.36% = 75.49 and 3.86% = 214.25 mmol/L (Morelle J et al. *J Am Soc Nephrol.* 2018;29:1875-1886). 2.27% = 22.7 g/L ÷ 180.16 g/mol = 126.0 mmol/L.
- PD Adequest 2.0 defaults (Vonesh 1999 Appendix): fluid absorption 0.6 mL/min, and in the app residual volume 10% of fill. Validation runs use Akonur’s stated 350 mL instead.

Simplifications:
- Small-pore σ for urea and Na⁺ is set to 0.
- Creatinine is ignored osmotically.
- Plasma concentrations are constant.
- Fill and drain are instant.
- Volume is floored at half the residual.
- RK4 integration with a 1-min step.

**Validation vs Akonur 2016 Tables 3–4.** 28 glucose cells; 2 L fill, 350 mL residual, anuric typical patients. Printed by `node tests/threepore.test.js`:

| Model vs published UF (mL) | H | HA | LA | L |
|---|---|---|---|---|
| APD day 15 h 2.27% | −661 vs −416 | −490 vs −291 | −264 vs −135 | 2 vs 71 |
| CAPD night 9 h 2.27% | −225 vs −108 | −64 vs 13 | 129 vs 147 | 317 vs 299 |
| APD night 9 h, 3 cycles 1.36% | −71 vs 20 | 58 vs 103 | 183 vs 171 | 283 vs 266 |
| APD night 9 h, 5 cycles 1.36% | 131 vs 168 | 247 vs 230 | 357 vs 276 | 437 vs 357 |
| APD night 9 h, 7 cycles 1.36% | 258 vs 246 | 359 vs 287 | 456 vs 316 | 520 vs 386 |
| CAPD day 3 × 5 h 1.36% | −434 vs −223 | −226 vs −75 | −9 vs 61 | 186 vs 233 |
| CAPD day 3 × 5 h 2.27% | 162 vs 262 | 518 vs 520 | 899 vs 771 | 1221 vs 1040 |

- RMSE 111 mL; largest error 245 mL; mean bias −26 mL.
- The order across transport types matches in all 7 rows.
- The model absorbs more than Akonur in High/HA long dwells and gives more UF in short dwells for LA/L.
- Table 5 UF efficiency (UF ÷ carbohydrate absorbed) has the same direction (High lowest, Low highest), e.g. CAPD night 2.27%: −5.3 / −1.6 / 3.4 / 9.8 vs published −2.6 / 0.3 / 4.0 / 9.1 mL/g.
- **Decision rule:** UF counts as “validated” only if every cell is within ±100 mL. It is not, so UF is shown as **experimental**. It never changes Kt/V or the ranking.

**App use.**
- Daily UF per option assumes 1.5% dextrose for every exchange or cycle and 2.5% dextrose for a dextrose long dwell (the strengths in the Akonur grid).
- The day is simulated twice and the second day is reported.
- Extraneal long-dwell UF is not simulated. It is the published Akonur 2016 Table 3 value (2 L icodextrin): CAPD 9-h H 388 · HA 386 · LA 382 · L 389 mL; APD 15-h H 465 · HA 488 · LA 501 · L 524 mL. The app’s CAPD long dwell is 8 h, not 9.

- [ ] Sign-off: three-pore equations and sources (Öberg & Rippe 2017; Bergling 2023; Rippe 1991; Vonesh 1999 A7)
- [ ] Sign-off: pore fractions 0.90 / 0.08 / 0.02 and σ glucose 0.028 / 0.001 / 1, σ albumin 0.95 / 0.085 / 1 (Rippe & Davies 2011)
- [ ] Sign-off: Δπ 22 mmHg, ΔP 8 mmHg (choice within “about 8 or 9”), RT 19.3, Na 132/137 mmol/L, φ 0.93, plasma urea 20 / glucose 6.5 mmol/L
- [ ] Sign-off: per-type LpS, A0/Δx and glucose MTAC from Akonur 2016 Table 1
- [ ] Sign-off: PD Adequest defaults used: fluid absorption 0.6 mL/min and residual volume 10% of fill (review item requested by Dr D)
- [ ] Sign-off: glucose 75.49 / 126.0 / 214.25 mmol/L for 1.36 / 2.27 / 3.86%
- [ ] Sign-off: simplifications (σ small solutes 0, constant plasma, instant fill/drain, ΔP constant)
- [ ] Sign-off: validation vs Akonur 2016 Tables 3–5 (RMSE 111 mL, max 245 mL) and the ±100 mL rule → UF shown as experimental
- [ ] Sign-off: UF assumptions on the cards (1.5% exchanges/cycles, 2.5% long dwell, steady-state second day)
- [ ] Sign-off: Extraneal UF = published Akonur 2016 Table 3 values (not simulated), shown for 8-h CAPD although published for 9 h
- [ ] Sign-off: predicted UF never changes Kt/V or ranking; Kt/V keeps short-dwell UF 0 plus any entered long-dwell UF
- [ ] Sign-off: “Measured long-dwell UF” inputs now described as measured values used in the Kt/V drain volume

## 17. Option 3: published prescription grid (Akonur 2016 Figs 4–5 = Baxter Quick Reference Guide pp. 10–11)

Shown on step 2 next to the Top 3, for the patient’s transport type × Watson V band × residual urea clearance band.
- Bands: V1 < 34 L, V2 34 to < 42 L, V3 ≥ 42 L. RKF < 2 or ≥ 2 mL/min, from the renal urea clearance in mL/min. Anuric counts as < 2. Urine without urine and serum urea is assumed < 2 and labelled.
- Source: Akonur A, Firanek C, Gellens M, Hutchcraft A, Kathuria P, Sloand JA. Volume-based peritoneal dialysis prescription guide to achieve adequacy targets. *Perit Dial Int.* 2016;36(2):188-195, doi:10.3747/pdi.2014.00255 (PMC4803365), Figures 4–5. Baxter PD Prescription Management Quick Reference Guide (USMP/81/17-0004), pp. 10–11.
- Source assumptions: PD Adequest 2.0; Kt/V 1.7 and UF 1 L/day; 1.5%/2.5% dextrose and icodextrin only; CAPD 8-h overnight; APD 9-h cycler.

**Re-verification.**
- The paper’s figures (PMC images) were transcribed.
- Every row was checked against the Baxter guide PDF. Text and colour squares were extracted from the vector PDF: green = 2.5%, green+yellow = mixed 1.5/2.5%, purple = icodextrin.
- 41 of 48 cell lists (CAPD and APD for each of the 24 type × band × RKF combinations) agree exactly.
- In the other 7, 9 rows are flagged **Unverified** on screen with both readings. The paper’s reading is shown.
  1. RKF < 2, V2, HA, CAPD row 2: the guide shows no colour for the 2.5 L night; the paper shows icodextrin.
  2. RKF ≥ 2, V1, Low, APD row 1: day 1.5 L is 2.5% in the paper and mixed in the guide.
  3. RKF ≥ 2, V2, LA, CAPD row 2: no colour in the guide; icodextrin in the paper.
  4. RKF ≥ 2, V2, HA, CAPD row 2: no colour in the guide; icodextrin in the paper.
  5. RKF ≥ 2, V3, LA, APD row 1: day 2.5 L in the paper; 2 × 2.5 L in the guide.
  6. RKF ≥ 2, V3, LA, APD row 2: day 2.5 L in the paper; 2 × 3 L in the guide.
  7. RKF ≥ 2, V3, LA, APD row 3: day 2 × 2 L in the paper; 2 × 2.5 L in the guide.
  8. RKF ≥ 2, V3, HA, APD row 2: no colour for the 5 × 2.5 L night in the guide; 2.5% in the paper.
  9. RKF ≥ 2, V3, High, APD row 3: day 2.5 L icodextrin in the paper; 2 L icodextrin in the guide.

- [ ] Sign-off: show the published grid alongside the Top 3 (as published, not computed), with source and assumptions
- [ ] Sign-off: band rules (Watson V for V1/V2/V3; renal urea clearance mL/min for RKF band; anuric → < 2; unknown → assumed < 2 with label)
- [ ] Sign-off: transcription of all 24 cells (js/rxgrid.js)
- [ ] Sign-off: the 9 unverified rows and the choice to show the paper’s reading with a warning

## 18. Four-step clinician workflow (Dr D: “I need useful pd workflow for nephrologist prescribing pd”)

1. **Patient.** Sex, age, height, weight, urine and residual clearance, and transport type or PET numbers. Unchanged inputs.
2. **Start prescription.** Top 3 CAPD and Top 3 CCPD with Kt/V, CrCl and predicted UF (experimental). The Extraneal alternative’s UF and Kt/V are shown on each dextrose card. The published grid, the full options table and the prescription summary are also on this step.
3. **Check adequacy.** Current prescription (defaults to the option picked on step 2), Scan lab report, new labs, measured Kt/V versus target (Met / Not met), measured versus predicted UF, then updated choices and what changed.
4. **Troubleshoot.** Low clearance, inadequate UF / fluid overload, or declining RKF. Model-computed one-step changes from the current prescription, each with ΔKt/V, ΔCrCl and ΔUF:
   - add an exchange or cycle;
   - larger fill (+0.5 L);
   - Extraneal long dwell;
   - for a CCPD dry day, a 2.0 L day dwell (dextrose or Extraneal).

   Cited guidance is quoted below the changes.

- [ ] Sign-off: four-step structure and step names (Patient · Start Rx · Adequacy · Troubleshoot)
- [ ] Sign-off: current prescription defaults to the picked option and can be chosen from the candidate list
- [ ] Sign-off: troubleshooting change set (add exchange/cycle, +0.5 L fill, Extraneal long dwell, CCPD day dwell; bounded by the candidate set) and ordering (Kt/V gain for clearance; UF gain for UF)
- [ ] Sign-off: declining RKF tool (new urine output and renal Kt/V re-run all options; 0 = anuric)
- [ ] Sign-off: measured daily UF = 24-h drain − nominal instilled volume, shown next to predicted UF

## 19. Lab loop (Dr D: “they scan information labs and things when available and new prescription choices are given”)

- Step 3 accepts:
  - a new PET: D/P creatinine, D/P urea, drain;
  - 24-h dialysate volume, urea and creatinine;
  - 24-h urine volume, urea and creatinine;
  - serum urea and creatinine;
  - or a reported weekly Kt/V.
- Measured adequacy uses the KDOQI 2006 CPG 2 definitions (§7).
- **Re-ranking with measured values:**
  - A new PET replaces the transport category and MTACs.
  - A 24-h collection on the current prescription fits the Garred urea MTAC by bisection (0.1–200 mL/min), so the model reproduces the measured peritoneal Kt. Creatinine is fitted too when dialysate creatinine is given.
  - A reported total Kt/V uses Kt/V − renal Kt/V.
  - All options are then re-estimated and re-ranked.
- Screen shows the updated Top 3 CAPD and CCPD, the current prescription’s Kt/V before → after, and which options are new or dropped versus the previous Top 3.
- “Use these labs as the new baseline” copies confirmed PET and urine values into step 1, keeps the fitted MTAC, and clears the form for the next round (the loop).

- [ ] Sign-off: lab fields accepted in step 3 and the measured-adequacy formulas
- [ ] Sign-off: fitting the model MTAC to a measured 24-h clearance on the current prescription (assumes the prescription was done as written)
- [ ] Sign-off: reported total Kt/V → peritoneal = total − renal for fitting
- [ ] Sign-off: precedence — fitted clearance > PET > typical; a new PET clears an older fit
- [ ] Sign-off: diff display (new / dropped options, current Rx Kt/V before → after) and the adopt-as-baseline loop

## 20. Scan lab report (on-device OCR)

- **Engine.** Tesseract.js 5.1.1 (Apache-2.0) plus tesseract.js-core 5.1.1 LSTM builds (SIMD and non-SIMD, Apache-2.0), and the tessdata_fast English model (Apache-2.0, gzip). All are bundled in `vendor/tesseract/` with licence files. Apache-2.0 is compatible with this project.
- **Size.** About 10.1 MB:
  - core 7.9 MB
  - language data 2.0 MB
  - scripts 0.19 MB

  It is lazy-loaded on the first scan and is not in index.html. The service worker caches it in the background after install so scanning works offline.
- **Privacy.** No network calls outside the app’s own folder, verified in headless Chrome with all other hosts blocked. No uploads. `cacheMethod: "none"`, so nothing goes to IndexedDB. The photo and text stay in memory and are discarded.
- **Parser.** `js/labparse.js` recognises labelled lines: D/P creatinine, D/P urea, PET drain, dialysate/urine/serum urea and creatinine (also by section headers), volumes and weekly Kt/V. It cleans O→0 and l/I→1 inside numbers and comma decimals. It warns on fluid/serum unit mismatch and implausible ratios. It never guesses a value without a label.
- **Confirmation.** Every scanned value is filled in **UNCONFIRMED** (yellow highlight and label) and is not used until the clinician taps Confirm or types over it.
- **Tests.** `tests/labparse.test.js` covers sample lab text. `tests/fixtures/sample-lab-report.png` is a synthetic report; OCR read 11 of 11 values correctly in headless Chrome.

- [ ] Sign-off: bundling Tesseract.js / tesseract.js-core / tessdata_fast (Apache-2.0) and the ~10 MB lazy download
- [ ] Sign-off: OCR privacy (on device, no upload, no IndexedDB, background offline cache of the engine only)
- [ ] Sign-off: recognised labels and the clean-up rules; units must match (no unit conversion is done)
- [ ] Sign-off: every scanned value unconfirmed until confirmed; typing over a value confirms it
- [ ] Sign-off: background caching of the OCR engine by the service worker (app code only, no patient data)

## 21. Guidance statements (verbatim, each shown in step 4)

Sources:
- **Brown 2020:** Brown EA et al. ISPD practice recommendations: prescribing high-quality goal-directed peritoneal dialysis. *Perit Dial Int.* 2020;40(3):244-253, doi:10.1177/0896860819895364.
- **Morelle 2021:** Morelle J et al. ISPD recommendations for the evaluation of peritoneal membrane dysfunction in adults. *Perit Dial Int.* 2021;41(4):352-372, doi:10.1177/0896860820982218.

The quotes were checked against the full-text PDFs.

- [ ] Sign-off: G-C1 (Brown 2020 §3.4b) “There is no specific clearance target that guarantees sufficient dialysis for an individual. Increasing small solute clearance to a Kt/V > 1.7 may improve uraemia-related symptoms, if present, but there is only low certainty evidence…”
- [ ] Sign-off: G-C2 (Brown 2020 §3.4d) “If symptoms, nutrition and volume are all controlled, no PD prescription change is needed for the sole purpose of reaching an arbitrary clearance target (practice point).”
- [ ] Sign-off: G-C3 (Brown 2020 Table 2) “Patients who remain symptomatic despite a Kt/Vurea > 1.7 should have other dialysis and non-dialysis-related factors considered as possible contributing factors. A trial of increasing dialysis dose may be indicated (practice point).”
- [ ] Sign-off: G-C4 (Brown 2020 §3.4a) “Small solute clearance should be routinely measured using Kt/Vurea or creatinine clearance … while recognizing the limitations of accuracy of these measurements in individuals (practice point).”
- [ ] Sign-off: G-U1 (Morelle 2021 Guideline 3) insufficient UF thresholds (< 400 mL 3.86% / < 100 mL 2.27% PET, or daily UF insufficient) and other causes (mechanical problems, leaks, increased absorption)
- [ ] Sign-off: G-U2 (Morelle 2021 Guideline 2b) “The resulting lower net UF can be avoided by shortening glucose-based exchanges, using a polyglucose solution (icodextrin), and/or prescribing higher glucose concentrations. (GRADE 1A) …”
- [ ] Sign-off: G-U3 (Brown 2020, solutions A) “Once-daily icodextrin should be considered as an alternative to hypertonic glucose solutions for long dwells … (GRADE 1B).”
- [ ] Sign-off: G-U4 (Morelle 2021 table, fast PSTR) “If long dwells required use icodextrin (daytime for APD, overnight for CAPD). Shorten glucose-based overnight dwells (e.g. 90–180 min) when using APD coupled with icodextrin during the day long dwell.”
- [ ] Sign-off: G-U5 (Morelle 2021 text) CAPD bag overfill “might – unless subtracted – lead to a significant overestimate in actual UF of 400–800 mL per day.”
- [ ] Sign-off: G-R1 (Brown 2020 §4) “Residual kidney function should be determined for all individuals doing PD and management should focus on preserving this function (practice point).”
- [ ] Sign-off: G-R2 (Brown 2020 §3.4c) “…start on a low dose prescription that may be increased incrementally as residual kidney function declines or as clinically indicated.”
- [ ] Sign-off: G-R3 (Brown 2020 Table 2, RKF 3) “Caution should be taken to avoid volume depletion and hypotension based on low certainty evidence that this may adversely affect RKF (practice point).”
- [ ] Sign-off: G-R4 (Brown 2020, solutions B) “Use of neutral pH, low GDP PD solutions improves preservation of residual kidney function and urine output (GRADE 1A).”
- [ ] Sign-off: G-R5 (Brown 2020 §3.2a) euvolaemia “so that both fluid removal from peritoneal ultrafiltration and urine output are considered and residual kidney function is not compromised (practice point).”

## 22. Release housekeeping (0.4.0-draft)

- [ ] Sign-off: version 0.4.0-draft, service-worker cache pd-buddy-v4 (+ pd-buddy-ocr-v1), DRAFT=true, noindex unchanged
- [ ] Sign-off: About sheets updated (PET, model, options) and new sheets (UF, grid, labs, scanning); limits list updated
- [ ] Sign-off: prescription summary adds the predicted daily UF line (labelled experimental, with its glucose assumptions)


## 23. Stronger CCPD candidates (0.4.1-draft)

Approved by Dr D after the 0.4.0 example showed no CCPD option reaching Kt/V 1.7. Same Garred model, same targets; the candidate set (js/formulas.js `CANDIDATE_OPTIONS`) grows from 8 to 72 CCPD regimens: 4 or 5 cycles × 2.0 / 2.5 / 3.0 L night fills × 9 / 10 / 11 h on the cycler × {dry day; 2.0 L day dwell of 24 h − cycler time; midday exchange 2 × 2.0 L; midday exchange 2 × 2.5 L}. Night dwell = cycler time ÷ cycles (fill/drain time 0, as before).

- **Midday exchange.** Last fill plus one manual daytime exchange; the day (24 h − cycler time) is split equally: 9 h → 2 × 7.5 h, 10 h → 2 × 7 h, 11 h → 2 × 6.5 h. Published basis: Akonur 2016 Figs 4–5 APD rows with “2x2L” day dwells (Baxter guide: “an extra daytime exchange (in addition to the last bag fill) was also included in selected situations”), and the “midday exch” column of Akonur 2013 Table 3 (average H/HA/LA anuric typical patient, quoted 24-h weekly Kt/V 2.07 vs 1.67 standard). The equal split and the 2.0 / 2.5 L volumes are judgment.
- **Extraneal.** Offered as before for every option with ONE long day dwell (dry and midday options excluded). The split midday dwells (6.5–7.5 h) are shorter than the labelled “long (8- to 16- hour) dwell” and no icodextrin UF is published for them, so no Extraneal variant is shown. For 10- and 11-h cycler days the day dwell is 14 / 13 h; its Extraneal UF is the published APD 15-h value (Akonur 2016 Table 3), not adjusted.
- **UF (experimental).** Midday options simulate both day dwells as 2.5% dextrose (Akonur grid code “(g)”), cycles 1.5%, same three-pore model and defaults. For Kt/V, an entered long-dwell UF is applied to the second (midday) dwell only.
- **3.0 L night fills.** Beyond the quoted cycler volumes (“Cycler dwell volumes - 2 to 2.5 L”, ISPD teaching slides / Handbook of Dialysis). Flagged on every card (“Large fill … check tolerance”) and in the prescription choices; not excluded from ranking.
- **Burden order (CCPD).** No midday exchange before a midday exchange → dry day before a day dwell → cycler time 9 < 10 < 11 h → fewer cycles → smaller night fill → smaller day volume. Large fill is not ranked as extra burden (only flagged).
- **Troubleshoot (step 4).** New one-step CCPD changes: longer cycler time (+1 h), add a midday exchange (2 × 2.0 L), larger midday volumes (2 × 2.5 L). Other steps keep cycler time and day pattern unchanged.
- **Example patient** (male 55 y, 5 ft 10 in, 80 kg, high-average, 500 mL urine not counted; V 43.2 L, BSA 1.99 m²):
  - Type only (typical HA MTACs urea 23.14, Cr 11.92): CCPD Top 3 now meet 1.7 — 5 × 3.0 L 10 h + 2.0 L day (Kt/V 1.79, CrCl 46.8, UF 0.06 L/d; Extraneal 0.96); 4 × 3.0 L 11 h + day (1.72, 47.2, 0.03; Extraneal 0.86); 5 × 2.5 L 11 h + day (1.75, 47.6, 0.03; Extraneal 0.85). All rely on a 3.0 L fill or 11 h.
  - PET D/P Cr 0.70, D/P urea 0.75: none reach 1.7; best 5 × 3.0 L 11 h + midday 2 × 2.5 L (1.67, 57.2, 0.92), 5 × 2.5 L 11 h + midday 2 × 2.5 L (1.63, 55.9, 0.81), 5 × 3.0 L 10 h + midday 2 × 2.5 L (1.62, 55.5, 0.86).
  - Tests: `tests/ccpd.test.js`, `tests/ranking.test.js`.

- [ ] Sign-off: CCPD midday-exchange candidates (last fill + one manual exchange, 2 × 2.0 L and 2 × 2.5 L, day split equally 7.5 / 7 / 6.5 h) and their sources
- [ ] Sign-off: 3.0 L CCPD night fills (large fills, flagged on cards, still ranked) — superseded in 0.4.2 by the BSA fill cap (§24)
- [ ] Sign-off: 10- and 11-h cycler time candidates (in addition to 9 h) — **Decided by Dr D, Nov 14 2026:** keep the 0.05 L fill tolerance, 3.0 L fills (within the 1.5 L/m² BSA cap) and 9–11 h cycler time despite the AJKD Core Curriculum 2023 limits, because adequacy targets are hard to reach with those restrictions. This records the decision only; full sign-off pending.
- [ ] Sign-off: CCPD burden order (midday > day dwell > cycler time > cycles > night fill > day volume); large fill not counted as burden
- [ ] Sign-off: no Extraneal variant for split midday dwells; published 15-h Extraneal UF reused for 13–14-h day dwells
- [ ] Sign-off: midday UF modelled with two 2.5% dextrose day dwells; entered long-dwell UF applied to the midday dwell only (Kt/V)
- [ ] Sign-off: new troubleshoot steps (longer cycler time, add midday exchange, larger midday volumes)
- [ ] Sign-off: prescription summary for midday exchange (day dwell 1, manual midday exchange, day dwell 2)
- [ ] Sign-off: release 0.4.1-draft, service-worker cache pd-buddy-v5, DRAFT=true, noindex unchanged

## 24. Fill-volume cap 1.5 L/m² BSA (0.4.2-draft)

Dr D's decision; replaces the 0.4.1 "Large fill" flag (§23 3.0 L item is superseded). Every fill — CAPD exchanges, CCPD night fills, the day dwell and both midday-exchange dwells — must be ≤ 1.5 L/m² × BSA (Mosteller, the app's BSA) + 0.05 L. Options with any fill above that are left out of the Top 3, the options table and the troubleshoot suggestions (the step-3 "current prescription" list still shows them, marked "above fill cap", so a patient already on one can be entered). Step 1 shows "Max fill (1.5 L/m²)"; step 2 shows BSA and max fill in the summary line; each Top 3 list carries: "Fill volumes capped at 1.5 L/m² BSA; individualize to comfort and intraperitoneal pressure (<18 cm H2O)."

- **Sources.**
  - Teitelbaum I. Crafting the prescription for patients starting peritoneal dialysis. *Clin J Am Soc Nephrol.* 2018;13(3):483-485. doi:10.2215/CJN.10770917 (PMC5967680): “Patients are generally able to tolerate intraperitoneal volumes of 1.25–1.5 L/m 2 BSA. As intraperitoneal pressure is lowest when supine, intermediate when erect, and highest when sitting, patients will often tolerate larger volumes when recumbent at night than when upright during the day.” (read from PMC this session)
  - Auguste BL, Bargman JM. Peritoneal dialysis prescription and adequacy in clinical practice: Core Curriculum 2023. *Am J Kidney Dis.* 2023;81(1):100-109. doi:10.1053/j.ajkd.2022.07.004: “Most patients can tolerate a maximum fill volume of 1,250-1,500 L/m2 or about 2,000-2,500 mL per exchange. In the average adult patient, this will result in intraperitoneal hydrostatic pressures of less than 18 cm of H2O. … an IPP of greater than 18 cm of H2O is usually associated with discomfort.” (“L/m2” is as printed; mL/m² is meant.) Text taken from the AJKD full-text page as returned by a search index; the page itself blocked direct download, so re-check against the article.
  - ISPD 2020 (Brown EA et al. *Perit Dial Int.* 2020;40:244-253) gives no numeric fill limit (per Dr D; the full text was not re-read this session).
- **Same Core Curriculum, not applied (decided by Dr D, Nov 14 2026, to keep; see the items below):** “fill volumes beyond 2,000-2,500 mL are not usually recommended given the increased risk of patient discomfort” and “Patients should not be routinely prescribed >8 hours on cycler therapy”. The app still offers 3.0 L fills (within the BSA cap) and 9–11 h cycler time.
- **Tolerance 0.05 L.** Allows for rounding of BSA and bag volumes. Effect at the edge: the example patient (BSA 1.988 m² → 2.98 L) keeps 3.0 L fills (3.0 ≤ 3.03); without tolerance they would be excluded. 3.0 L is allowed from BSA 1.967 m²; 2.5 L from 1.634 m²; 2.0 L from 1.30 m².
- **Example patient re-run** (male 55 y, high-average, 500 mL urine not counted):
  - 5 ft 10 in, 80 kg (BSA 1.99, max 2.98 L): unchanged from 0.4.1 because of the tolerance. Without it: type-only CAPD 5 × 2.5 L (1.84) only one meeting; CCPD 5 × 2.5 L 11 h + day (1.75).
  - 6 ft 2 in, 100 kg (V 51.0 L, BSA 2.28, max 3.43 L): no candidate excluded. Type-only CAPD: only 5 × 3.0 L meets (1.79); CCPD Top 3 meet, all with a midday exchange. PET D/P Cr 0.70 / urea 0.75: none reach 1.7 (best CAPD 1.36, CCPD 1.42).
- Tests: `tests/fillcap.test.js`.

- [ ] Sign-off: fill cap 1.5 L/m² BSA applied to every fill (CAPD exchanges, CCPD night fills, day dwell, both midday dwells); options above it excluded from ranking, table and troubleshoot
- [ ] Sign-off: 0.05 L tolerance (fill ≤ 1.5 × BSA + 0.05 L); keeps 3.0 L for BSA ≥ 1.967 m² (incl. the example patient at 1.988) — **Decided by Dr D, Nov 14 2026:** keep the 0.05 L fill tolerance, 3.0 L fills (within the 1.5 L/m² BSA cap) and 9–11 h cycler time despite the AJKD Core Curriculum 2023 limits, because adequacy targets are hard to reach with those restrictions. This records the decision only; full sign-off pending.
- [ ] Sign-off: fill-cap sources (Teitelbaum CJASN 2018 1.25–1.5 L/m²; Auguste & Bargman AJKD 2023 IPP < 18 cm H2O; ISPD 2020 no numeric limit) and the note text on the Top 3 lists
- [ ] Sign-off: Core Curriculum 2023 “fill volumes beyond 2,000-2,500 mL are not usually recommended” and “>8 hours on cycler” not applied (3.0 L fills and 9–11 h still offered) — **Decided by Dr D, Nov 14 2026:** keep the 0.05 L fill tolerance, 3.0 L fills (within the 1.5 L/m² BSA cap) and 9–11 h cycler time despite the AJKD Core Curriculum 2023 limits, because adequacy targets are hard to reach with those restrictions. This records the decision only; full sign-off pending.
- [ ] Sign-off: troubleshoot respects the fill cap (larger fill / larger midday volumes shown as “fill cap reached”, not suggested)
- [ ] Sign-off: current-prescription list still includes regimens above the cap, marked “above fill cap”
- [ ] Sign-off: BSA and max fill shown on step 1 and in the step 2 summary
- [ ] Sign-off: release 0.4.2-draft, service-worker cache pd-buddy-v6, DRAFT=true, noindex unchanged

## 25. App Critic review fixes (0.4.3-draft)

Dr D approved all 18 items of the App Critic review (`pd-buddy-review/REPORT.md`, reviewed at 7a03a68); each was re-checked against 0d7f71e (CCPD candidates and fill cap) before the change. Wording proposed by the reviewer is used where it was given; no clinical number was added or changed. Items marked **[Dr D]** still need a clinical choice and are listed as questions.

- **M1 Kt/V framing.** "Top 3 CAPD / CCPD" → "CAPD / CCPD options to consider" (card header chip "model estimate"). Badges "Meets target / Below target" → "Est. Kt/V ≥ your reference value (1.7)" / "Est. Kt/V below your reference value (1.7)" (CrCl the same way). The "none reach" note, step 3 ("Measured ≥ reference" / "Measured below reference"), step 3 diff and step 4 badges use the same wording. Step 1 card "Ranking target" → "Reference Kt/V (optional)". Step 2 summary quotes ISPD 2020 (Brown EA et al. *Perit Dial Int.* 2020;40:244-253): “There is no specific clearance target that guarantees sufficient dialysis for an individual.” Order unchanged: options at or above the reference value still come first **[Dr D: keep ordering by the reference value?]**.
- **M2 Input bounds.** Hard blocks (`checkPatient` in js/formulas.js): age < 18 ("adult-only"; Watson is an adult equation, KDOQI CPR 2.6), ft > 8 or < 0, inches ≥ 12 or < 0, height in cm ≤ 0, weight ≤ 0. Options stay hidden and the step cannot be left until fixed. New height unit: cm (ft + in stays the default). Amber plausibility ranges for height, weight, urine volume and the Kt/V reference value were **not** added: the report leaves the ranges to Dr D **[Dr D]**.
- **M3 D/P checks.** `checkDp`: ≤ 0 blocked; > 1.5 blocked with "Did you mean 0.70?" (value ÷ 100, button fills it in); ≥ 1.1 blocked; 1.0–1.1 blocked because the Garred model needs D/P < 1 (no MTAC can be fitted) **[Dr D: the Twardowski High band runs to 1.03; is blocking 1.00–1.03 right, or should those fall back to the type?]**. The "none reach" note never shows with the empty state.
- **M4 OCR parser.** Reference ranges ("(ref 0.7-1.3)", "0.7–1.3") stripped; numbers attached to h/hr ("24h", "4-h") skipped; the number after the label is used; "2,350" read as 2350 (comma + exactly 3 digits); Kt/V takes the number after/nearest "total". Concentrations printed without a unit need a unit chosen (mg/dL, mmol/L, µmol/L) before Confirm; Confirm is blocked while fluid and serum units differ. Each unconfirmed value shows the report line it came from. All five report strings are in `tests/labparse.test.js`.
- **M5 Print / copy.** Print CSS now prints the step 2 summary card (was pointed at a step 4 card from another app, so printed blank) and keeps the draft banner. Title "PD PRESCRIPTION" → "PD regimen summary (model estimate)"; the text starts "DRAFT – model estimate, not an order – verify before use" and has blank Patient / Date / Prescriber lines **[Dr D: exact wording]**.
- **M6 Not a medical device.** "Not a medical device. Not cleared or approved by FDA. Estimates do not replace measured adequacy or clinical judgment." on the footer, the summary card, the copied/printed text, privacy and support. A regulatory opinion before any non-draft release is still needed **[Dr D]**.
- **M7 Naming.** UI label "icodextrin 7.5%" (the About options sheet says "(e.g., Extraneal®)" once); "Published Adequest grid" → "Published prescription grid (Akonur et al. 2016)"; "PD Adequest" removed from on-screen text (kept only in the trademark notice and the code comments that cite the source). Notice in the footer and About sheets: "PD Adequest and Extraneal are trademarks of Baxter International Inc.; PD Buddy is not affiliated with or endorsed by Baxter." The grid source line now cites the PDI figures only; the 9 "Unverified" flags say "a second published version" instead of naming the guide (they still come from that comparison) **[Dr D: keep the flags, or drop the cross-check?]**. Type-only label is now "typical-patient estimate from published parameters (Akonur et al. 2016), not measured" (it replaces the earlier "Adequest-derived" wording Dr D saw) **[Dr D: OK?]**.
- **S1 BSA range.** When typical (type-only) values are used and BSA is outside 1.7–2.0 m² (Akonur 2016, PDI 36:79-84, Table 1: “typical patients with BSA between 1.7 and 2.0 m²”), step 1 and step 2 say "Typical values come from patients with BSA 1.7–2.0 m²; estimate less reliable". Not blocked **[Dr D: block?]**.
- **S2 Icodextrin UF.** Card line: "published value for 2 L, 9 h/15 h; not adjusted to this regimen". UF card, options table, prescription text and About say the same, with the 350 mL residual volume.
- **S3 UF order.** Step 4 note: "Suggestions for UF are ordered by the experimental UF model." Elsewhere "never changes … the ranking" → "never changes Kt/V or the step 2 order".
- **S4 Fill flag / CrCl.** The CCPD-only "Large fill" flag no longer exists (0.4.2 fill cap applies to both modalities), so the first point does not apply. **[Dr D]**: CCPD CrCl reference 60 vs 45 L/wk/1.73 m²; Low transport creatinine by D/P band midpoint vs published MTAC for the other types.
- **S5 Residual function.** When urine is entered without urine and serum urea, step 2 says "Ranking assumes no residual kidney function: add urine and serum urea to include it" with a button to those fields.
- **S6 Current prescription.** Step 3 list grouped with `<optgroup>` (CAPD; CCPD 9 / 10 / 11 h) and labelled "closest match … the fit is approximate". Free regimen fields not added (partial) **[Dr D: add them?]**.
- **S7 Accessibility.** Dark-mode primary buttons use dark text (#0b1a33 on #7eb0ff); light-mode tertiary grey #5a6e86 → #4a5b70; small text raised to 12 px; buttons, chips, About buttons, Copy/Print, Confirm, theme toggle and footer links at least 44 px; inch input labelled "Height, inches" (feet "Height, feet"); steps wrapped in `<main>`.
- **S8 Solutions.** The summary text prints "Model assumed: 1.5% dextrose exchanges, 2.5% dextrose long dwell (or icodextrin)…"; solution lines stay blank for the clinician. 4.25% in UF troubleshooting **[Dr D]**.
- **N1 Citations.** On-screen "Akonur 2016" now says PDI 36:79-84 (MTACs, icodextrin UF, three-pore checks) or names the grid paper (PDI 36:188-195).
- **N2 First run.** Step 1 card numbers (1–2, 3, 4, 5) removed; "Nothing is saved; reloading clears the form."; step 1 shows "Try an example patient" until anything is typed (step 2 cannot be opened empty, so the button sits on step 1 and opens step 2) (male 55 y, 5 ft 10 in, 80 kg, high-average, 500 mL/day urine: the example used in §23–24; not a real patient).
- **N3 Model documentation.** About "How the regimen estimate works": short-dwell UF 0 underestimates, CCPD fill/drain time 0 overestimates; check against Akonur 2013 (PDI 33:646-654) standard APD, assumed as 5 × 2 L over 10 h plus a 2 L 14-h day dwell with the typical TBW 40.6 / 41.3 / 42.3 L: this model 1.74 / 1.61 / 1.44 vs a published average of about 1.67 (about 4% lower; the reviewer's run gave about −5%). Step 3 shows "Renal Kt/V assumed 0" when a reported total Kt/V is entered without a 24-h urine **[Dr D: the regimen assumed for the Akonur 2013 check]**.
- Tests: `tests/critic.test.js` (new), `tests/labparse.test.js`, `tests/prescription.test.js`, `tests/static.test.js`.

- [ ] Sign-off: M1 neutral wording (options to consider, reference-value badges, ISPD 2020 line, Reference Kt/V card); ordering by the reference value kept
- [ ] Sign-off: M2 hard blocks (age < 18, ft > 8, inches ≥ 12, height/weight ≤ 0) and the cm height option; plausibility ranges still to be set
- [ ] Sign-off: M3 D/P blocks (≤ 0, > 1.5 with "Did you mean", ≥ 1.1, 1.0–1.1 not fittable)
- [ ] Sign-off: M4 OCR parser rules, unit choice and blocked Confirm on unit conflict, source line under each value
- [ ] Sign-off: M5 summary title, DRAFT line, blank Patient / Date / Prescriber, print of the step 2 card with the draft banner
- [ ] Sign-off: M6 not-a-medical-device statement (footer, summary card, copied text, privacy, support); regulatory opinion pending
- [ ] Sign-off: M7 naming (icodextrin 7.5%, grid heading, trademark notice, grid cited from PDI figures only, type-only label wording)
- [ ] Sign-off: S1 BSA 1.7–2.0 m² warning for typical values (warn, not block)
- [ ] Sign-off: S2 icodextrin UF labelled "published value for 2 L, 9 h/15 h; not adjusted to this regimen"
- [ ] Sign-off: S3 step 4 UF suggestions ordered by the experimental UF model (stated)
- [ ] Sign-off: S4 CCPD CrCl reference (60 vs 45) and Low creatinine method
- [ ] Sign-off: S5 residual-function assumption note and link on step 2
- [ ] Sign-off: S6 current prescription as closest match with groups; free regimen fields not added
- [ ] Sign-off: S7 accessibility changes (contrast, 12 px, 44 px, labels, main landmark)
- [ ] Sign-off: S8 model solution assumption printed; 4.25% in UF troubleshooting
- [ ] Sign-off: N1 Akonur 2016 citations disambiguated
- [ ] Sign-off: N2 first-run changes (no card numbers, nothing-saved note, Try an example patient)
- [ ] Sign-off: N3 model documentation (UF 0 / fill-drain 0, Akonur 2013 check, renal Kt/V assumed 0)
- [ ] Sign-off: release 0.4.3-draft, service-worker cache pd-buddy-v7, DRAFT=true, noindex unchanged

## 26. Small fills and App Critic re-check fixes (0.4.4-draft)

Dr D, Nov 15 2026, 6:33 AM ET, in his own words: “Fill can be as small as 1 l - agree with the other solutions”. The App Critic re-check of bed91b4 (`pd-buddy-review/RECHECK-bed91b4.md`) found R1: at BSA below about 1.30 m² every candidate (smallest fill 2.0 L) was above the 1.5 L/m² cap, so small adults got no options and a wrong reason. Not changed in this batch (still Dr D's open questions): the ranking order (M1), the amber plausibility ranges (M2), CrCl 60 vs 45 and the Low creatinine method (S4), 4.25% in UF troubleshooting (S8).

- **Small fills.** Candidate fills now 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0 L for CAPD exchanges and CCPD night fills (21 CAPD, 144 CCPD regimens). The 1.5 L/m² BSA + 0.05 L cap still applies to every fill. For CCPD night fills below 2.0 L the day volumes equal the night fill (dry day; one day dwell of the fill volume; or a midday exchange of 2 × the fill volume); at 2.0 L and above the day patterns are unchanged (2.0 L day dwell; midday 2 × 2.0 or 2 × 2.5 L). Pairing small night fills with equal day volumes is a judgment, not a published rule; decided by Dr D Nov 15 2026 (“Day volume equal to the night fill is fine”), full sign-off pending. The icodextrin UF stays the published 2 L value and is labelled “not adjusted” (S2), which matters more at 1.0–1.75 L. Step 4: “Larger fill” steps to the next candidate fill (1.25 → 1.5 L …); for small CCPD fills “Add a day dwell” and “Add a midday exchange” use the night-fill volume.
- **Small-adult results** (male 70 y, high-average, typical values, anuric, reference Kt/V 1.7):
  - 150 cm / 40 kg (V 25.3 L, BSA 1.29 m², max fill 1.94 L): CAPD 4 × 1.75 L (Kt/V 1.91, CrCl 59.5) · 5 × 1.25 L (1.71, 53.8) · 5 × 1.5 L (2.03, 61.7). CCPD 5 × 1.75 L 9 h dry (1.84, 42.7) · 5 × 1.5 L 10 h dry (1.75, 43.2) · 5 × 1.75 L 10 h dry (1.92, 45.8).
  - 145 cm / 38 kg (V 24.1 L, BSA 1.24 m², max fill 1.86 L): CAPD 4 × 1.5 L (1.73, 54.9) · 4 × 1.75 L (2.01, 62.1) · 5 × 1.25 L (1.80, 56.1). CCPD 5 × 1.5 L 9 h dry (1.76, 42.3) · 5 × 1.75 L 9 h dry (1.93, 44.6) · 4 × 1.75 L 10 h dry (1.75, 43.9).
  - The experimental UF model predicts negative daily UF for these small CAPD regimens (about −0.4 to −0.5 L/day with 1.5% exchanges and an 8-h 2.5% overnight dwell): for Dr D, not validated. Dr D (Nov 15 2026): “Show a negative-UF warning on those options” (§27).
  - Example patient (5 ft 10 in, 80 kg): CAPD and CCPD options unchanged from 0.4.3.
- **No-fit message.** When every candidate is above the cap: “No fill volume fits under this patient's fill cap of X L (1.5 L/m² × BSA Y m², + 0.05 L tolerance). The smallest fill offered is 1.0 L.” on step 2 (basis and both cards) and step 4, instead of “Kt/V could not be estimated” or “Enter body size and transport type”. With 1.0 L fills this needs BSA below about 0.63 m².
- **Height hard block.** Height outside the recorded range of adult human height is blocked in cm and in ft + in: 54.6 cm (Guinness World Records, shortest adult ever, Chandra Bahadur Dangi, measured 26 Feb 2012) to 272 cm (Guinness World Records, tallest man ever, Robert Wadlow, measured 27 Jun 1940). 1,780 cm and 8 ft 11.9 in are blocked with no ranked options. This is an impossible-value block only; 70 cm (inches typed into cm) is still accepted, pending Dr D's amber ranges (M2).
- **Stale amber note.** The “No option's estimate reaches your reference value” / “Only n options…” note is hidden and emptied whenever inputs are blocked or no option is shown. (In the browser the note was already hidden; the re-check read it from the hidden step's text. Now the text is cleared too.)
- **iPhone SE step 2.** At 375 × 667 the first CAPD option (name, plain words, Kt/V, CrCl, UF) is above the step bar: the “Ordered by … / typical values” basis moved to a new “How these are estimated” card below the CCPD options; summary text is smaller; on screens up to 760 px tall the brand row is hidden on steps 2–4 (the dark-mode toggle stays on step 1). The ISPD line and the residual-function note stay above the options.
- **CCPD UF wording.** The CCPD copy/print UF line now reads “assuming 1.5% dextrose cycles and a 2.5% dextrose day dwell” (icodextrin: “icodextrin day dwell = published value…”), matching “Model assumed”. CAPD unchanged.
- Tests: `tests/smallfill.test.js` (new), `tests/ranking.test.js`, `tests/static.test.js`, `tests/critic.test.js`.

- [ ] Sign-off: small fills 1.0–1.75 L (CAPD and CCPD, still capped at 1.5 L/m² BSA + 0.05 L; small CCPD night fills paired with equal day volumes) — approved by Dr D Nov 15 2026, full sign-off pending. Day volume equal to the night fill: **decided by Dr D Nov 15 2026** (“Day volume equal to the night fill is fine”), full sign-off pending
- [ ] Sign-off: no-fit message when every candidate is above the fill cap — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: height hard block outside 54.6–272 cm (cm and ft + in) — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: stale amber note hidden and emptied when inputs are blocked — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: iPhone SE step 2 layout (basis card below the options, compact header on short screens) — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: CCPD UF wording “cycles / day dwell” in the copied and printed summary — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: release 0.4.4-draft, service-worker cache pd-buddy-v8, DRAFT=true, noindex unchanged — approved by Dr D Nov 15 2026, full sign-off pending

## 27. Negative predicted UF warning (0.4.5-draft)

Dr D, Nov 15 2026, 6:45 AM ET, in his own words: “Show a negative-UF warning on those options”. On any option where the experimental three-pore UF model predicts negative daily UF (the small CAPD options, and any other option, CAPD or CCPD, dextrose or icodextrin row), an amber warning reads: “Predicted daily UF is negative (about −X L/day, experimental model). Watch fluid balance; consider a higher-tonicity or icodextrin dwell.” “Higher-tonicity” is used instead of “stronger dextrose” because offering 4.25% is still an open question (S8). Shown on the step 2 option cards, in step 4 (current prescription and each suggestion) and in the copied and printed summary (“Warning: …”). The options are not demoted, hidden or re-ranked (Kt/V ranking unchanged; UF never changes the step 2 order). Example: 150 cm / 40 kg male, high-average, typical values: CAPD 4 × 1.75 L (about −0.39 L/day), 5 × 1.25 L (−0.48), 5 × 1.5 L (−0.34) carry the warning; the CCPD options (+0.12 to +0.20 L/day) do not.
- Tests: `tests/neguf.test.js`.

- [ ] Sign-off: negative predicted UF warning (cards, step 4, copied/printed summary; wording; no re-ranking) — approved by Dr D Nov 15 2026; wording approved by Dr D on a voice call with App Critic, Nov 15 2026 7:01 AM ET (relayed); full sign-off pending
- [ ] Sign-off: release 0.4.5-draft, service-worker cache pd-buddy-v9, DRAFT=true, noindex unchanged — approved by Dr D Nov 15 2026, full sign-off pending

## 28. Stale pick, one-page print, compact warning on small phones (0.4.6-draft)

Dr D, Nov 15 2026, 7:01 AM ET, relayed by App Critic, in his own words: “Send the stale-pick fix and the 3-page print fix to App Builder” (RECHECK-e9f0214.md, N-M1 and the print note). Dr D's answer to the iPhone SE question, relayed by App Critic from a voice call at 7:02 AM ET: a shorter warning is OK on small phones.

- **Stale pick (N-M1, present since 0.4.2).** Whenever the inputs change which options exist or which are above the fill cap, the picked option and the current prescription are re-validated against the newly computed rows (`PdWorkflow.revalidate`). A selection that is gone or above the cap is cleared; the Rx card, Copy/Print and step 4 fall back to the #1 CAPD option, or to the no-fit message when nothing fits. A valid selection is kept and shown with the new patient's values. An above-cap regimen chosen on purpose as the current prescription in step 3 stays for those inputs, is flagged “Above the fill cap for this patient” in step 4, and is cleared once the inputs change. The Rx card never renders an above-cap pick. Example: 178 cm/80 kg, pick CCPD 5 × 3.0 L (Kt/V 3.05 at 150/40 before the fix), change to 150 cm/40 kg → CAPD 4 × 1.75 L, Kt/V 1.91 everywhere; 60 cm/20 kg → the no-fit message in step 4 and on the sheet (no Kt/V 6.06).
- **One-page print.** Print had grown to 3 pages (blank first page, because the Rx card was not allowed to break and was taller than a page). Print CSS now uses 12 mm margins, compact 11–12 px rows, no screen min-height, and lets the card break if ever needed. Headless Chrome PDFs (example patient and 150/40, CAPD and CCPD, phone and desktop widths) are 1 page on Letter and A4, keeping the draft banner, the “DRAFT – model estimate, not an order – verify before use” line, the not-a-medical-device statement and the negative-UF warning.
- **Compact negative-UF warning (small screens only).** At up to 760 px tall or 400 px wide, the step 2 option-card warning reads “Negative UF predicted (about −X L/day, experimental)”, amber, with a “Full UF warning” disclosure under the card that shows the full approved wording. Larger screens keep the full wording on the cards; step 4 and Copy/Print always use the full wording. iPhone SE 375×667, 150/40: the first option's name, numbers and compact warning end at y = 566, above the step bar (y = 596). The icodextrin line, the badge and the disclosure are below the fold, as the badge already was in 0.4.4.
- Tests: `tests/stalepick.test.js`.

- [ ] Sign-off: stale pick re-validated on input change (Rx card, Copy/Print, step 4; no-fit message) — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: one-page print on Letter and A4 (draft banner, DRAFT line, not-a-medical-device statement, negative-UF warning kept) — approved by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: compact negative-UF warning on small screens with a full-wording disclosure (full wording on large screens, step 4 and print) — approved by Dr D via App Critic, Nov 15 2026, full sign-off pending
- [ ] Sign-off: release 0.4.6-draft, service-worker cache pd-buddy-v10, DRAFT=true, noindex unchanged — approved by Dr D Nov 15 2026, full sign-off pending

## 29. Below-model-range block for very low PET D/P (0.4.7-draft)

App Critic N-M2 (re-check of c5ab8b9). Dr D, Nov 15 2026, 7:16 AM ET, relayed by App Critic, in his own words: “Block very low D/P with a 'below model range' message”. His answers at 7:26 AM ET, relayed by App Critic, in his own words: “D/P creatinine cutoff 0.40”; “D/P urea cutoff 0.70”; “The below-model-range message wording is OK as written”; “Keep the default Low drain at 2,988.5 mL”; “Add a warning now, and have App Builder propose the model fix for my review”; on App Critic's partial item 1d (re-check of c5ab8b9): “Keeping the flagged over-cap Rx is fine”.
- Cause: the volume-corrected Garred fit (Asghar 2003 form) has zero diffusion at D/P = 1 − V0/Vt; with a 2.0 L fill and the typical Low drain (2,988.5 mL, Twardowski band midpoint) that is 0.331, so D/P Cr 0.34 gives a creatinine MTAC of 0.17 mL/min. Regimens are then predicted with net UF 0 per dwell, so the UF credit taken in the fit is never given back and clearance is close to zero for every regimen.
- One constant, `PdFormulas.DP_MODEL_MIN = { cr: 0.40, urea: 0.70 }`. Basis: cr 0.40 = 1 − 2000/3326 (Garred zero-diffusion floor at the top of the Twardowski Low drain band, 3,326 mL); urea 0.70 = Twardowski adult mean 0.91 ± 0.07 (as cited by Teixidó 1992) minus 3 SD, an inference (no published adult floor). Below it: hard block, no ranked options, a “below model range” message on step 1, the cards, the basis, the Rx sheet (Copy/Print) and step 4. The block also fires when the entered drain leaves no positive MTAC.
- Not in this release: the low-transporter warning (new clinical wording, needs Dr D's OK; drafted on local branch `low-warning`) and the model fix (proposal in `research/MODEL_FIX_PROPOSAL.md`, not implemented).
- Tests: `tests/lowdp.test.js`.

- [ ] Sign-off: D/P creatinine cutoff 0.40 — decided by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: D/P urea cutoff 0.70 (no published adult floor; mean − 3 SD is an inference) — decided by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: “below model range” message wording (as written) and where it shows — decided by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: default Low drain kept at 2,988.5 mL (Twardowski Low band midpoint) — decided by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: flagged over-cap current prescription chosen on purpose in step 3 is kept after small input changes (App Critic 1d; no change) — decided by Dr D Nov 15 2026, full sign-off pending
- [ ] Sign-off: release 0.4.7-draft, service-worker cache pd-buddy-v11, DRAFT=true, noindex unchanged — approved by Dr D Nov 15 2026, full sign-off pending

## 30. Low-transporter CrCl warning (DRAFT, branch `low-warning`, not shipped)

Dr D, Nov 15 2026, 7:26 AM ET, relayed by App Critic: “Add a warning now, and have App Builder propose the model fix for my review”. The wording below is App Builder's draft and needs Dr D's OK before it ships.
- Full: “Low transport: the model probably underestimates creatinine clearance (CrCl). It credits the large PET drain volume to ultrafiltration rather than diffusion, then predicts each option without that ultrafiltration. Do not rely on the estimated CrCl; confirm with a measured 24-h collection.”
- Compact (small screens, with a Details disclosure to the full text): “Low transport: estimated CrCl is probably too low (model limit)”.
- Trigger: the transport category used is Low, by picked type or by a PET D/P creatinine in the Twardowski Low band (0.40–0.49 after the below-model-range block; 0.50 and above is Low-average). Not shown when the creatinine MTAC was fitted to a measured 24-h collection, or when inputs are blocked.
- Where: step 2 summary card (full; compact on small screens), the Rx sheet and Copy/Print (“Warning: …” after the CrCl line), step 4 current prescription (full).
- iPhone SE (375×667), 170 cm/70 kg Low: with the compact warning the first CAPD option's numbers end at y = 674, below the step bar (y = 596); without it they end at 592. Needs Dr D's choice.
- Tests: `tests/lowwarn.test.js`.

- [ ] Sign-off: low-transporter warning wording (full and compact) — needs Dr D's OK
- [ ] Sign-off: trigger (Low by type or PET D/P Cr < 0.50; not when fitted) — needs Dr D's OK
- [ ] Sign-off: placement, including the iPhone SE fold trade-off — needs Dr D's OK

---

## Status

`DRAFT=true`. Not signed off. Draft banner, noindex and robots `Disallow: /` stay until Dr D signs off and asks, in his own words, to publish.

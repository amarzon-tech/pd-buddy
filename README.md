# PD Buddy (draft)

Educational PD prescribing workflow for nephrologists. Published by Wellness Tech LLC.

Preview: https://amarzon-tech.github.io/pd-buddy/ · `DRAFT=true` (draft banner, noindex, robots Disallow) until Dr D signs off.

Offline progressive web app: no login, ads, analytics or data collection; inputs are never stored.

## Workflow (0.4.6-draft)

1. **Patient** (adults only; impossible entries are blocked, including height outside 54.6–272 cm): sex, age, height (ft + in or cm), weight (kg or lb) → V (Watson) and BSA (Mosteller); transport type or PET numbers; residual urine (optional urine / serum urea and creatinine); Kt/V reference value (1.7 by default; for comparison only).
2. **Start prescription**: CAPD and CCPD options to consider (3 each; fills 1.0–3.0 L: 1.0/1.25/1.5/1.75/2.0/2.5/3.0 L) (CCPD candidates: 4–5 cycles × 1.0–3.0 L over 9, 10 or 11 h; dry day, a 2.0 L day dwell, or a manual midday exchange with 2 × 2.0 or 2 × 2.5 L day dwells; every fill capped at 1.5 L/m² BSA + 0.05 L, so larger fills are left out per patient) with estimated weekly Kt/V, CrCl and predicted daily UF (experimental open three-pore model; icodextrin 7.5% long-dwell UF from published values for 2 L, 9 h / 15 h, not adjusted), next to the published prescription grid (Akonur et al. PDI 2016;36:188-195, Figs 4–5) for the patient's transport type, urea-volume band and RKF band. Without PET numbers, Kt/V is a typical-patient estimate from published parameters (Akonur 2016, PDI 36:79-84; Akonur 2013), not measured. The summary card can be copied or printed as a "PD regimen summary (model estimate)" marked DRAFT.
3. **Check adequacy**: current prescription; new labs (PET, 24-h dialysate and urine, serum, or reported Kt/V), typed or read from a photo with on-device OCR (Tesseract.js, bundled, lazy-loaded, values unconfirmed until confirmed, each shown with its report line; unit choice required when none is printed; Confirm blocked on fluid/serum unit conflicts); measured Kt/V vs the reference value; re-ranked choices and what changed; adopt as the new baseline and repeat.
4. **Troubleshoot**: low clearance, inadequate UF / fluid overload, declining RKF → model-computed one-step changes (add exchange or cycle, larger fill, icodextrin long dwell, CCPD day dwell, longer cycler time, midday exchange) with quoted ISPD 2020 / 2021 guidance.

Kt/V uses the published Garred simple diffusion model. It is not a validated prescribing model and does not contain or reproduce PD Adequest or any other commercial program; it cites published parameters from studies that used it. Not a medical device. Not cleared or approved by FDA. Estimates do not replace measured adequacy or clinical judgment. Options with a negative predicted daily UF carry an amber warning (not re-ranked; compact with a full-wording disclosure on small phones). Changing the patient re-validates the picked option against the fill cap. Predicted UF is experimental (validation against Akonur 2016 in `tests/threepore.test.js`). See [CONTENT_REVIEW.md](CONTENT_REVIEW.md) for every number, source quote and limitation. Third-party OCR files and licences: `vendor/tesseract/README.md`.

PD Adequest and Extraneal are trademarks of Baxter International Inc.; PD Buddy is not affiliated with or endorsed by Baxter.

## Tests

```bash
node tests/formulas.test.js
node tests/prescription.test.js
node tests/ranking.test.js
node tests/static.test.js
node tests/threepore.test.js
node tests/workflow.test.js
node tests/labparse.test.js
node tests/ccpd.test.js
node tests/fillcap.test.js
node tests/critic.test.js
node tests/smallfill.test.js
node tests/neguf.test.js
node tests/stalepick.test.js
```

Support and privacy: amardamodar@gmail.com

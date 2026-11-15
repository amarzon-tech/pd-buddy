# PD Buddy (draft)

Educational PD prescribing workflow for nephrologists. Published by Wellness Tech LLC.

Preview: https://amarzon-tech.github.io/pd-buddy/ · `DRAFT=true` (draft banner, noindex, robots Disallow) until Dr D signs off.

Offline progressive web app: no login, ads, analytics or data collection; inputs are never stored.

## Workflow (0.4.2-draft)

1. **Patient**: sex, age, height (ft + in), weight (kg or lb) → V (Watson) and BSA (Mosteller); transport type or PET numbers; residual urine (optional urine / serum urea and creatinine); Kt/V target (1.7 by default).
2. **Start prescription**: Top 3 CAPD and Top 3 CCPD (CCPD candidates: 4–5 cycles × 2.0/2.5/3.0 L over 9, 10 or 11 h; dry day, a 2.0 L day dwell, or a manual midday exchange with 2 × 2.0 or 2 × 2.5 L day dwells; every fill capped at 1.5 L/m² BSA + 0.05 L, so larger fills are left out per patient) with estimated weekly Kt/V, CrCl and predicted daily UF (experimental open three-pore model; Extraneal long-dwell UF from published values), next to the published Adequest prescription grid (Akonur 2016 / Baxter Quick Reference Guide) for the patient's transport type, urea-volume band and RKF band. Without PET numbers, Kt/V is a typical-patient estimate from published Adequest-derived parameters (Akonur 2016/2013), not measured.
3. **Check adequacy**: current prescription; new labs (PET, 24-h dialysate and urine, serum, or reported Kt/V), typed or read from a photo with on-device OCR (Tesseract.js, bundled, lazy-loaded, values unconfirmed until confirmed); measured Kt/V vs target; re-ranked choices and what changed; adopt as the new baseline and repeat.
4. **Troubleshoot**: low clearance, inadequate UF / fluid overload, declining RKF → model-computed one-step changes (add exchange or cycle, larger fill, Extraneal long dwell, CCPD day dwell, longer cycler time, midday exchange) with quoted ISPD 2020 / 2021 guidance.

Kt/V uses the published Garred simple diffusion model. It is not a validated prescribing model and does not contain or reproduce PD Adequest or any other commercial program; it cites published Adequest-derived parameters. Predicted UF is experimental (validation against Akonur 2016 in `tests/threepore.test.js`). See [CONTENT_REVIEW.md](CONTENT_REVIEW.md) for every number, source quote and limitation. Third-party OCR files and licences: `vendor/tesseract/README.md`.

n.

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
```

Support and privacy: amardamodar@gmail.com

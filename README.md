# PD Buddy (draft)

Educational PD prescribing tool for nephrologists. Published by Wellness Tech LLC.

Preview: https://amarzon-tech.github.io/pd-buddy/ · `DRAFT=true` (draft banner, noindex, robots Disallow) until Dr D signs off.

Offline progressive web app: no login, ads, analytics or data collection; inputs are never stored.

## Screens

1. **Patient & PET** — the five inputs on one screen: sex and age, height (ft + in) and weight (kg or lb) → V (Watson) and BSA (Mosteller); PET transport type (optional D/P creatinine, D/P urea and drain volume; numbers win); residual urine output (optional urine / serum urea and creatinine for renal clearance); ranking target (weekly Kt/V ≥ 1.7 by default).
2. **Top options** — Top 3 CAPD and Top 3 CCPD from a candidate set (CAPD 3–5 × 2.0/2.5/3.0 L; CCPD 4–5 × 2.0/2.5 L, dry or with a day dwell; Extraneal variants, icodextrin not modeled). Options meeting the target come first, least burdensome first; otherwise the highest-clearance options with an amber note. Ranked by weekly CrCl when there is no D/P urea. Full table under “See all options”; Copy / Print summary of the picked option.

The regimen estimate is the published Garred simple diffusion model fitted to the patient's PET. It is not a validated prescribing model and does not reproduce any commercial program. UF is not predicted. See [CONTENT_REVIEW.md](CONTENT_REVIEW.md) for every number, source quote and limitation.

## Tests

```bash
node tests/formulas.test.js
node tests/prescription.test.js
node tests/ranking.test.js
node tests/static.test.js
```

Support and privacy: amardamodar@gmail.com

# PD Buddy (draft)

Educational PD prescribing tool for nephrologists. Published by Wellness Tech LLC.

Preview: https://amarzon-tech.github.io/pd-buddy/ · `DRAFT=true` (draft banner, noindex, robots Disallow) until Dr D signs off.

Offline progressive web app: no login, ads, analytics or data collection; inputs are never stored.

## Steps

1. **Patient** — sex, age, height, weight → V (Watson default, Hume-Weyers option) and BSA (Mosteller).
2. **PET** — 4-h D/P creatinine (required), D/D₀ glucose, fill, drain, D/P urea → Twardowski category, ISPD 2021 UF screen, Garred MTAC.
3. **Labs & urine** — plasma and 24-h urine urea / creatinine → renal Kt/V and RKF; optional measured 24-h dialysate → measured Kt/V and CrCl.
4. **Regimen** — CAPD or APD → per-dwell D/P and estimated weekly Kt/V and CrCl (Garred model).
5. **Prescription** — estimated vs measured vs targets (informational), Copy / Print summary, limits.

The regimen estimate is the published Garred simple diffusion model fitted to the patient's PET. It is not a validated prescribing model and does not reproduce any commercial program. UF is not predicted. See [CONTENT_REVIEW.md](CONTENT_REVIEW.md) for every number, source quote and limitation.

## Tests

```bash
node tests/formulas.test.js
node tests/prescription.test.js
node tests/static.test.js
```

Support and privacy: amardamodar@gmail.com

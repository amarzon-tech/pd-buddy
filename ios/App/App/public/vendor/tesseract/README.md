# Bundled on-device OCR (lazy-loaded)

Loaded only when the clinician taps **Scan lab report**. Everything is served from this
folder; nothing is fetched from the internet and nothing is uploaded.

| File | Source | Version | License |
|---|---|---|---|
| tesseract.min.js, worker.min.js | npm `tesseract.js` (dist) | 5.1.1 | Apache-2.0 (LICENSE-tesseract.js.md); bundled helpers MIT/BSD-3 (see *.LICENSE.txt) |
| core/tesseract-core-lstm.wasm.js, core/tesseract-core-simd-lstm.wasm.js | npm `tesseract.js-core` | 5.1.1 | Apache-2.0 (LICENSE-tesseract.js-core) |
| lang/eng.traineddata.gz | github.com/tesseract-ocr/tessdata_fast `eng.traineddata`, gzip -9 | main (4.1 MB → 1.98 MB) | Apache-2.0 (LICENSE-tessdata_fast) |

Source-map comments were removed from the two dist files (maps are not shipped).
The worker is created with `cacheMethod: "none"` so the language data is never written
to IndexedDB; images and recognized text stay in memory for the session only.

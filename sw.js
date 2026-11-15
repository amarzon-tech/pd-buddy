/* Offline cache for PD Buddy. No network after first load. */
const CACHE = "pd-buddy-v11";
// On-device OCR engine (~10 MB). Cached in the background after install so "Scan lab
// report" also works offline; it is app code only — no patient data is ever cached.
const OCR_CACHE = "pd-buddy-ocr-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./css/standalone.css",
  "./css/pd.css",
  "./js/config.js",
  "./js/formulas.js",
  "./js/threepore.js",
  "./js/rxgrid.js",
  "./js/workflow.js",
  "./js/labparse.js",
  "./js/ocr.js",
  "./js/prescription.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon.png",
  "./icons/apple-touch-icon.png",
  "./privacy.html",
  "./support.html",
];
const OCR_ASSETS = [
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/lang/eng.traineddata.gz",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
  // Background, non-blocking: failures are ignored (OCR then loads on first use).
  caches.open(OCR_CACHE).then((c) => c.addAll(OCR_ASSETS)).catch(() => {});
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).catch(() => caches.match("./index.html")))
  );
});

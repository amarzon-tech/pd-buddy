/**
 * PD Buddy — on-device OCR for "Scan lab report" (browser only).
 * Lazy-loads the bundled Tesseract.js 5.1.1 from ./vendor/tesseract/ the first time the
 * clinician picks a photo. No network beyond this app's own folder (served offline by the
 * service worker after first use), no uploads, and cacheMethod "none" so nothing is written
 * to IndexedDB. The image and text live in memory only and are discarded after parsing.
 */
(function (global) {
  "use strict";
  const BASE = "./vendor/tesseract/";
  let loading = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load the OCR engine (" + src + ")."));
      document.head.appendChild(s);
    });
  }
  function engine() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    if (!loading) loading = loadScript(BASE + "tesseract.min.js").then(() => global.Tesseract);
    return loading;
  }

  /** Recognize text in an image File/Blob. onProgress(0..1, status). Resolves to plain text. */
  async function recognize(file, onProgress) {
    const T = await engine();
    const worker = await T.createWorker("eng", 1, {
      workerPath: BASE + "worker.min.js",
      corePath: BASE + "core/",
      langPath: BASE + "lang/",
      gzip: true,
      cacheMethod: "none",
      workerBlobURL: false,
      logger: (m) => onProgress && m && typeof m.progress === "number" && onProgress(m.progress, m.status || ""),
    });
    try {
      const res = await worker.recognize(file);
      return (res && res.data && res.data.text) || "";
    } finally {
      await worker.terminate();
    }
  }

  global.PdOcr = { recognize, BASE };
})(typeof globalThis !== "undefined" ? globalThis : this);

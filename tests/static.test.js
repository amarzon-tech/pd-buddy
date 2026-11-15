/**
 * Static checks for PD Buddy: draft state (DRAFT=true, banner, noindex,
 * robots Disallow), offline / no tracking, Adequest/Baxter cited but never claimed,
 * four-step workflow, lab loop and on-device OCR.
 * Run: node tests/static.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { isTrue, section, done } = require("./_h.js");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const html = read("index.html");
const cfg = require("../js/config.js");
const sw = read("sw.js");
const shipped = ["index.html", "404.html", "privacy.html", "support.html", "js/app.js", "js/formulas.js", "js/threepore.js", "js/rxgrid.js", "js/workflow.js", "js/labparse.js", "js/ocr.js", "js/prescription.js", "js/config.js", "css/styles.css", "css/standalone.css", "css/pd.css", "manifest.json", "sw.js"];

section("Draft state");
isTrue(cfg.DRAFT === true, "DRAFT is true until Dr D signs off");
isTrue(/id="draft-banner"/.test(html), "draft banner present");
isTrue(/Draft – not for clinical use until reviewed by Dr D/.test(html), "draft banner wording");
["index.html", "404.html", "privacy.html", "support.html"].forEach((f) =>
  isTrue(/<meta name="robots" content="noindex, nofollow">/.test(read(f)), f + ": noindex, nofollow")
);
isTrue(/User-agent: \*\s+Disallow: \//.test(read("robots.txt")), "robots.txt disallows all");
isTrue(/<title>PD Buddy — Draft<\/title>/.test(html), "title marks draft");
isTrue(/Educational PD prescribing workflow for nephrologists/.test(html), "educational positioning for nephrologists");
isTrue(/Educational use only; not a substitute for clinical judgment/.test(html), "educational disclaimer");
isTrue(/Not a medical device\. Not cleared or approved by FDA\./.test(html), "not-a-medical-device statement (0.4.3)");
isTrue(!fs.existsSync(path.join(root, "CNAME")), "no custom domain");
isTrue(/amardamodar@gmail\.com/.test(html) && cfg.SUPPORT_EMAIL === "amardamodar@gmail.com", "support email");

section("Adequest / Baxter: cited, never claimed (Dr D approved citing, 0.4)");
const CLAIM = /(reproduc(?:e|es|ing)|replicat(?:e|es|ing)|implement(?:s|ing)?|equivalent to|same as|powered by|based on|version of|clone of|is)\s+(?:the\s+)?(?:pd\s+)?adequest/i;
shipped.forEach((f) => isTrue(!CLAIM.test(read(f).replace(/not (?:a copy of|reproduce or contain)[^.]*\./gi, "")), f + ": no claim to be or reproduce PD Adequest"));
shipped.forEach((f) => isTrue(!/baxter/i.test(read(f)) || /Quick Reference Guide|Akonur|not affiliated with or endorsed by Baxter/.test(read(f)), f + ": Baxter named only as a cited source or in the trademark notice"));
["js/formulas.js", "js/threepore.js", "js/rxgrid.js"].forEach((f) => isTrue(/Akonur/.test(read(f)) && /doi:10\.3747\/pdi\./.test(read(f)), f + ": Adequest-derived numbers carry Akonur citations with DOI"));
isTrue(/typical-patient estimate from published parameters \(Akonur et al\. 2016\), not measured/.test(read("js/formulas.js")), "type-only Kt/V label wording (0.4.3, App Critic M7)");
isTrue(/not a validated prescribing model/i.test(read("js/app.js")) || /not been validated/i.test(html), "app states the estimate is not validated");

section("On-device OCR: bundled, lazy, no network, no storage");
const ocr = read("js/ocr.js");
isTrue(/cacheMethod: "none"/.test(ocr), "Tesseract cacheMethod none (no IndexedDB)");
isTrue(/workerPath: BASE/.test(ocr) && /corePath: BASE/.test(ocr) && /langPath: BASE/.test(ocr), "worker, core and language data served from the app");
isTrue(/const BASE = "\.\/vendor\/tesseract\/"/.test(ocr), "local base path");
["vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js", "vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js", "vendor/tesseract/core/tesseract-core-lstm.wasm.js", "vendor/tesseract/lang/eng.traineddata.gz", "vendor/tesseract/LICENSE-tesseract.js.md", "vendor/tesseract/LICENSE-tesseract.js-core", "vendor/tesseract/LICENSE-tessdata_fast"].forEach((f) => isTrue(fs.existsSync(path.join(root, f)), "bundled: " + f));
const ocrBytes = ["tesseract.min.js", "worker.min.js", "core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js", "lang/eng.traineddata.gz"].reduce((a, f) => a + fs.statSync(path.join(root, "vendor/tesseract", f)).size, 0);
isTrue(ocrBytes < 15e6, "OCR bundle under 15 MB (" + (ocrBytes / 1e6).toFixed(1) + " MB)");
isTrue(!/<script[^>]+vendor\/tesseract/.test(html), "OCR engine is lazy-loaded, not in index.html");
isTrue(/Apache-2\.0/.test(read("vendor/tesseract/LICENSE-tesseract.js.md") + read("vendor/tesseract/README.md")), "Apache-2.0 license recorded");

section("Offline, no login, no tracking, no stored data");
shipped.forEach((f) => {
  const t = read(f);
  isTrue(!/github\.com/i.test(t), f + ": no github.com URL");
  isTrue(!/google-analytics|googletagmanager|gtag\(|plausible|segment\.io|hotjar|mixpanel|facebook\.net/i.test(t), f + ": no analytics");
  isTrue(!/localStorage|sessionStorage|indexedDB|document\.cookie/.test(t), f + ": no stored data");
  isTrue(!/fetch\(\s*["']http|XMLHttpRequest|navigator\.sendBeacon/.test(t), f + ": no outbound requests");
});
isTrue(!/<script[^>]+src="http/i.test(html), "no remote scripts");
isTrue(!/<link[^>]+href="http/i.test(html), "no remote stylesheets or fonts");
isTrue(!/type="password"|<form|sign in|log in/i.test(html), "no login form");
const assets = (sw.match(/"\.\/[^"]*"/g) || []).map((s) => s.slice(3, -1)).filter(Boolean);
assets.forEach((a) => isTrue(fs.existsSync(path.join(root, a)), "service-worker asset exists: " + a));
["css/pd.css", "js/app.js", "js/formulas.js", "js/prescription.js", "js/config.js"].forEach((a) => isTrue(assets.includes(a), "service worker caches " + a));
isTrue(/const CACHE = "pd-buddy-v\d+"/.test(sw), "versioned cache name");
isTrue(/const CACHE = "pd-buddy-v11";/.test(sw), "cache bumped to pd-buddy-v11 for 0.4.7 (below-model-range D/P block)");
["js/threepore.js", "js/rxgrid.js", "js/workflow.js", "js/labparse.js", "js/ocr.js"].forEach((a) => isTrue(assets.includes(a), "service worker caches " + a));
isTrue(cfg.APP_VERSION === "0.4.7-draft", "version 0.4.7-draft");
["fill cap 1.5 L/m² BSA", "0.05 L tolerance", "fill-cap sources", "troubleshoot respects the fill cap", "release 0.4.2-draft"].forEach((k) =>
  isTrue(new RegExp("^- \\[ \\] Sign-off: " + k.replace(/[.()]/g, "\\$&"), "m").test(read("CONTENT_REVIEW.md")), "unticked 0.4.2 review item: " + k));
isTrue((html.match(/class="note cap-note">Fill volumes capped at 1\.5 L\/m² BSA; individualize to comfort and intraperitoneal pressure \(&lt;18 cm H2O\)\.<\/p>/g) || []).length === 3, "cap note under CAPD, CCPD and updated CCPD Top 3");
isTrue(/id="o-maxfill"/.test(html), "step 1 shows max fill");
isTrue(!/Large fill:/.test(read("js/app.js")), "large-fill warning replaced by the cap");
["midday-exchange candidates", "3.0 L CCPD night fills", "10- and 11-h cycler time", "CCPD burden order", "no Extraneal variant for split midday dwells", "release 0.4.1-draft"].forEach((k) =>
  isTrue(new RegExp("^- \\[ \\] Sign-off: (CCPD )?" + k.replace(/[.()]/g, "\\$&"), "m").test(read("CONTENT_REVIEW.md")), "unticked 0.4.1 review item: " + k));
isTrue(/midday exchange/.test(html), "index mentions the CCPD midday exchange");

section("Four-step clinician workflow");
["Patient", "Start Rx", "Adequacy", "Troubleshoot"].forEach((s, i) =>
  isTrue(new RegExp('data-go="' + (i + 1) + '"[^>]*>[^]*?' + s).test(html), "step " + (i + 1) + " " + s)
);
isTrue(!/data-go="5"/.test(html), "exactly four steps");
[1, 2, 3, 4].forEach((n) => isTrue(new RegExp('id="step-' + n + '" data-step="' + n + '"').test(html), "step panel " + n));
["lab-dpcr", "lab-dpu", "lab-petdrain", "lab-dvol", "lab-durea", "lab-dcr", "lab-uvol", "lab-uurea", "lab-ucr", "lab-surea", "lab-scr", "lab-ktv", "cur-rx", "scan-file", "ts-uvol", "ts-ktvr"].forEach((id) => isTrue(new RegExp('id="' + id + '"').test(html), "workflow input " + id));
isTrue(/id="scan-file"[^>]*accept="image\/\*"[^>]*capture="environment"/.test(html), "Scan lab report uses the camera / photo picker");
isTrue(/data-problem="clearance"[^]*data-problem="uf"[^]*data-problem="rkf"/.test(html), "troubleshoot: low clearance, UF, declining RKF");
isTrue(/id="grid-card"/.test(html) && /id="uf-card"/.test(html), "grid and UF cards on step 2");
isTrue(/id="lab-adopt"/.test(html), "loop: adopt labs as the new baseline");
isTrue(/unconfirmed/.test(read("js/app.js")) && /data-confirm/.test(read("js/app.js")), "OCR values stay unconfirmed until confirmed");
["p-age", "p-ft", "p-in", "p-wt", "pet-dpcr", "pet-dpu", "pet-drain", "l-uvol", "l-uu", "l-pu", "l-ucr", "l-pcr", "t-ktv", "o-uf-dex", "o-uf-ico"].forEach((id) =>
  isTrue(new RegExp('id="' + id + '"').test(html), "input " + id)
);
["c-n", "a-n", "a-ttt", "m-drain", "pet-dd0", "p-vmethod"].forEach((id) => isTrue(!new RegExp('id="' + id + '"').test(html), "removed from the minimal screen: " + id));
isTrue(/inputmode="decimal"/.test(html), "numeric keypad");
isTrue(!/id="p-ht"/.test(html), "no cm height field (ft + in)");
isTrue(/id="p-wunit"[^]*data-wunit="kg"[^]*data-wunit="lb"/.test(html), "kg / lb weight toggle");
["high", "high-average", "low-average", "low"].forEach((k) => isTrue(new RegExp('id="pet-type"[^]*data-ptype="' + k + '"').test(html), "transport type chip " + k));
isTrue(/<details[^>]*id="pet-nums"[^]*I have PET numbers/.test(html), "optional PET numbers expander");
isTrue(/<details[^>]*id="rkf-details"[^]*Residual clearance details/.test(html), "optional residual clearance details expander");
isTrue(/default 0 = anuric/.test(html) && /change the order of the options a lot/.test(html), "urine output: default 0 = anuric, changes the order a lot");
isTrue(/id="t-ktv"[^>]*value="1\.7"/.test(html), "Kt/V target defaults to 1.7");
isTrue(/CAPD options to consider/.test(html) && /CCPD options to consider/.test(html) && !/Top 3 CAPD|Top 3 CCPD/.test(html), "options-to-consider cards, no Top 3 (M1)");
isTrue(/<details[^>]*id="all-opts"[^]*See all options/.test(html) && /id="opt-table"/.test(html), "full options table under See all options");
isTrue((html.match(/Model estimate, not measured/g) || []).length >= 2 && /model estimate, not measured/.test(read("js/app.js")), "results labelled model estimate, not measured");
isTrue(/experimental/.test(read("js/app.js")) && /exp-chip/.test(html), "predicted UF labelled experimental");
isTrue(/Ordered by weekly CrCl/.test(read("js/app.js")), "CrCl fallback stated plainly");
isTrue(/No option's estimate reaches your reference value/.test(read("js/app.js")), "amber note when none reach the reference value (M1)");
isTrue(/≥ your reference value \(/.test(read("js/app.js")) && /below your reference value \(/.test(read("js/app.js")) && !/Meets target|Below target|Meets Kt\/V target/.test(read("js/app.js")), "neutral reference-value badge (M1)");
isTrue(!/>APD</.test(html), "no APD label");
isTrue(/Icodextrin UF is the published typical-patient value/.test(html), "icodextrin UF source stated");
isTrue(/F\.TYPICAL_LABEL/.test(read("js/app.js")), "type-only label used in the UI");
isTrue(!/<button[^>]*>Calculate</.test(html), "no Calculate button");
isTrue(/#1e63d6/i.test(html) && /--teal: #1e63d6/.test(read("css/styles.css")), "blue #1E63D6 theme");

section("CONTENT_REVIEW");
const review = read("CONTENT_REVIEW.md");
const boxes = (review.match(/^- \[ \] Sign-off/gm) || []).length;
isTrue(boxes >= 50, "at least 50 unticked sign-off boxes (" + boxes + ")");
["target Kt/V 1.7", "burden ordering", "candidate set", "CrCl fallback"].forEach((k) => isTrue(new RegExp("^- \\[ \\] Sign-off: ranking — " + k, "m").test(review), "unticked ranking item: " + k));
isTrue(!/^- \[x\]/im.test(review), "no ticked boxes before Dr D reviews");
["Akonur", "Vonesh", "Öberg", "Rippe", "Bergling", "Tesseract", "Watson", "Hume", "Mosteller", "Twardowski", "Garred", "Asghar", "Waniewski", "Morelle", "Brown", "KDOQI", "Pannekeet", "Semin Dial", "Daugirdas", "ADEMEX", "Paniagua", "icodextrin"].forEach((s) =>
  isTrue(review.includes(s), "review cites " + s)
);
isTrue(/DRAFT=true/.test(review), "review records DRAFT=true");

done("static");

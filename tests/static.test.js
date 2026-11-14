/**
 * Static checks for PD Buddy: draft state (DRAFT=true, banner, noindex,
 * robots Disallow), offline / no tracking, no proprietary-program claims.
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
const shipped = ["index.html", "404.html", "privacy.html", "support.html", "js/app.js", "js/formulas.js", "js/prescription.js", "js/config.js", "css/styles.css", "css/standalone.css", "css/pd.css", "manifest.json", "sw.js"];

section("Draft state");
isTrue(cfg.DRAFT === true, "DRAFT is true until Dr D signs off");
isTrue(/id="draft-banner"/.test(html), "draft banner present");
isTrue(/Draft – not for clinical use until reviewed by Dr D/.test(html), "draft banner wording");
["index.html", "404.html", "privacy.html", "support.html"].forEach((f) =>
  isTrue(/<meta name="robots" content="noindex, nofollow">/.test(read(f)), f + ": noindex, nofollow")
);
isTrue(/User-agent: \*\s+Disallow: \//.test(read("robots.txt")), "robots.txt disallows all");
isTrue(/<title>PD Buddy — Draft<\/title>/.test(html), "title marks draft");
isTrue(/Educational PD prescribing tool for nephrologists/.test(html), "educational positioning for nephrologists");
isTrue(/Educational use only; not a substitute for clinical judgment/.test(html), "educational disclaimer");
isTrue(!fs.existsSync(path.join(root, "CNAME")), "no custom domain");
isTrue(/amardamodar@gmail\.com/.test(html) && cfg.SUPPORT_EMAIL === "amardamodar@gmail.com", "support email");

section("No proprietary-program claims");
shipped.forEach((f) => isTrue(!/adequest|pd adequest|baxter/i.test(read(f)), f + ": no Adequest / Baxter name"));
isTrue(/not a validated prescribing model/i.test(read("js/app.js")) || /not been validated/i.test(html), "app states the estimate is not validated");

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

section("Step flow and inputs");
["Patient", "PET", "Labs &amp; urine", "Regimen", "Prescription"].forEach((s, i) =>
  isTrue(new RegExp('data-go="' + (i + 1) + '"[^]*?' + s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(html), "step " + (i + 1) + " " + s)
);
["p-age", "p-ht", "p-wt", "pet-dpcr", "pet-dd0", "pet-drain", "pet-dpu", "l-uvol", "l-uu", "l-ucr", "c-n", "c-fill", "a-n", "a-ttt", "a-last"].forEach((id) =>
  isTrue(new RegExp('id="' + id + '"').test(html), "input " + id)
);
isTrue(/inputmode="decimal"/.test(html), "numeric keypad");
isTrue(!/<button[^>]*>Calculate</.test(html), "no Calculate button");
isTrue(/#1e63d6/i.test(html) && /--teal: #1e63d6/.test(read("css/styles.css")), "blue #1E63D6 theme");

section("CONTENT_REVIEW");
const review = read("CONTENT_REVIEW.md");
const boxes = (review.match(/^- \[ \] Sign-off/gm) || []).length;
isTrue(boxes >= 8, "at least 8 unticked sign-off boxes (" + boxes + ")");
isTrue(!/^- \[x\]/im.test(review), "no ticked boxes before Dr D reviews");
["Watson", "Hume", "Mosteller", "Twardowski", "Garred", "Asghar", "Waniewski", "Morelle", "Brown", "KDOQI", "Pannekeet"].forEach((s) =>
  isTrue(review.includes(s), "review cites " + s)
);
isTrue(/DRAFT=true/.test(review), "review records DRAFT=true");

done("static");

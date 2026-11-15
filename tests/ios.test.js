/**
 * iOS wrapper (branch ios-wrap): project settings, plists, privacy manifest, and the bundled
 * web app matching the sources (DRAFT kept). Run: node tests/ios.test.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { eq, isTrue, section, done } = require("./_h.js");
const R = (p) => path.join(__dirname, "..", p);
const read = (p) => fs.readFileSync(R(p), "utf8");
const ex = (p) => fs.existsSync(R(p));

section("Xcode project");
const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
eq((pbx.match(/PRODUCT_BUNDLE_IDENTIFIER = com\.drd\.pdbuddy;/g) || []).length, 2, "bundle ID com.drd.pdbuddy (Debug + Release)");
eq((pbx.match(/DEVELOPMENT_TEAM = RZRMT6494V;/g) || []).length, 2, "team RZRMT6494V baked in");
eq((pbx.match(/MARKETING_VERSION = 1\.0;/g) || []).length, 2, "version 1.0");
eq((pbx.match(/CURRENT_PROJECT_VERSION = 1;/g) || []).length, 2, "build 1");
isTrue(!/crrt/i.test(pbx), "no CRRT leftovers in the project");
isTrue(/PrivacyInfo\.xcprivacy in Resources \*\/,/.test(pbx), "privacy manifest in the Resources phase");
isTrue(/public in Resources/.test(pbx), "bundled web assets in Resources");

section("Info.plist");
const plist = read("ios/App/App/Info.plist");
isTrue(/<key>CFBundleDisplayName<\/key>\s*<string>PD Buddy<\/string>/.test(plist), "home-screen name PD Buddy");
isTrue(/<key>NSCameraUsageDescription<\/key>\s*<string>[^<]*on this device[^<]*never saved or sent/.test(plist), "camera string (scan uses capture=environment)");
isTrue(/capture="environment"/.test(read("index.html")), "scan input opens the camera, so the camera string is needed");
isTrue(!/NSPhotoLibrary|NSMicrophone|NSLocation|NSContacts|NSUserTracking/.test(plist), "no other permission strings");
isTrue(/<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/.test(plist), "export compliance false");
isTrue(!/crrt/i.test(plist), "no CRRT leftovers in Info.plist");

section("Privacy manifest");
const pm = read("ios/App/App/PrivacyInfo.xcprivacy");
isTrue(/<key>NSPrivacyTracking<\/key>\s*<false\/>/.test(pm), "no tracking");
isTrue(/<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/.test(pm), "no collected data");
isTrue(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/.test(pm), "no tracking domains");

section("Capacitor config and icon");
const cap = JSON.parse(read("ios/App/App/capacitor.config.json"));
eq(cap.appId, "com.drd.pdbuddy", "appId");
eq(cap.appName, "PD Buddy", "appName");
isTrue(!cap.server || !cap.server.url, "no remote server URL (offline bundle)");
const icon = fs.readFileSync(R("ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"));
eq(icon.readUInt32BE(16) + "x" + icon.readUInt32BE(20), "1024x1024", "app icon 1024×1024");
eq(icon[25], 2, "app icon PNG colour type RGB (no alpha)");

section("Bundled web app = sources, DRAFT kept");
const files = ["index.html", "privacy.html", "support.html", "manifest.json", "sw.js", "js/app.js", "js/config.js", "js/formulas.js", "js/prescription.js", "js/threepore.js", "js/workflow.js", "js/labparse.js", "js/ocr.js", "js/rxgrid.js", "css/pd.css", "vendor/tesseract/tesseract.min.js", "vendor/tesseract/worker.min.js", "vendor/tesseract/lang/eng.traineddata.gz"];
for (const f of files) isTrue(ex("ios/App/App/public/" + f) && fs.readFileSync(R(f)).equals(fs.readFileSync(R("ios/App/App/public/" + f))), "bundled " + f + " matches the source");
isTrue(/DRAFT\s*=\s*true/.test(read("ios/App/App/public/js/config.js")), "DRAFT=true in the app");
isTrue(/id="draft-banner"[^>]*>Draft – not for clinical use until reviewed by Dr D</.test(read("ios/App/App/public/index.html")), "DRAFT banner text in the app");
isTrue(/isNativePlatform\(\);\s*if \(!native\) navigator\.serviceWorker\.register/.test(read("index.html")), "no service worker inside the native WebView");
isTrue(!/https?:\/\/(?!www\.w3\.org|doi\.org)[^"' ]+\.(js|css)["']/.test(read("index.html")), "no remote scripts or styles");
done("ios");

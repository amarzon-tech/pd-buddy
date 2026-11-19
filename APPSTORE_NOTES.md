# PD Buddy: iOS build notes (branch `ios-wrap`)

Marketing version **1.0**, build **1**. Bundle ID `com.drd.pdbuddy`. Signing team `RZRMT6494V` (automatic signing, baked into the project, same team as CRRT Rx). Home-screen name **PD Buddy**. Deployment target iOS 15, iPhone and iPad, all orientations.

**Content signed off** by Dr D, Nov 18 2026, 9:09 PM ET. The wrap now bundles the signed-off web app (v1.0.0, `DRAFT=false`, no draft banner), matching main. Do not merge this branch to `main`. This update does not upload to TestFlight or the App Store. The App Store name “PD Buddy” is still provisional (needs his OK).

## Build on the Mac (Xcode 16 or later)

1. Unzip `PDBuddy-iOS-1.0.zip`, open `ios/App/App.xcodeproj`. The first time, Xcode resolves the Swift package `capacitor-swift-pm` 8.5.3, so it needs internet for that one step.
2. Target **App** → Signing & Capabilities: “Automatically manage signing” is on and the team is RZRMT6494V. Sign in to that Apple ID under Xcode → Settings → Accounts if Xcode asks.
3. Try it first: pick a simulator or a plugged-in iPhone, then **Product → Run**. Check there is no draft banner, then steps 1–4, and Scan lab report (camera permission prompt, then values to confirm).
4. Archive: choose **Any iOS Device (arm64)**, then **Product → Archive**. In Organizer: **Distribute App → App Store Connect → Upload**.
5. In App Store Connect, create the app record (bundle ID `com.drd.pdbuddy`) and add build 1.0 (1) to **TestFlight**. Submit for review only after sign-off.

The box cannot run Xcode. On the box, the plist, privacy manifest, asset catalog JSON and the Xcode project were parsed and checked (bundle ID, team, version, build). The bundled web app was loaded offline in a phone-size browser: no draft banner, no service worker, OCR ran from the bundled engine, no network requests.

## Capacitor wrap (same approach as CRRT Rx)

- Offline bundle only. No remote URL. Web assets are in `ios/App/App/public/` and are committed, so the project archives without a sync.
- After a web change on this branch: `npm install` once, then `npm run ios:sync`.
- The service worker is not registered inside the native WebView (`index.html`, Capacitor check). The web build is unchanged.
- Lab-report scan: on-device Tesseract.js from `vendor/tesseract/` (bundled). No uploads, nothing stored. `NSCameraUsageDescription` is set because the scan input opens the camera (`capture="environment"`). No photo-library string is needed: the input uses the camera only, and no photos are saved.
- Privacy manifest `ios/App/App/PrivacyInfo.xcprivacy`: no tracking, no tracking domains, no collected data, no required-reason APIs used by the app. Capacitor ships its own manifest in its package.
- Export compliance: `ITSAppUsesNonExemptEncryption=false`.
- App icon: 1024×1024 RGB, no alpha, from the existing PD Buddy branding (`scripts/make_icon.py`). Launch screen: the icon on #EEF2F8.

## Privacy and support URLs

`privacy.html` and `support.html` are already live on main (they predate this branch, and this branch does not change them):
- Privacy: https://amarzon-tech.github.io/pd-buddy/privacy.html
- Support: https://amarzon-tech.github.io/pd-buddy/support.html
- Contact: akd.nephrology@gmail.com (decided by Dr D, Nov 15 2026)

Both pages are the signed-off 1.0.0 build (no draft banner).

## Dr D's decisions (Nov 15 2026)
Free. Keep the existing icon. Content signed off Nov 18 2026 9:09 PM ET; draft banner removed. App Store name: “PD Buddy” provisionally (fallbacks in LISTING.md). No TestFlight or App Store upload in the Nov 18 update.

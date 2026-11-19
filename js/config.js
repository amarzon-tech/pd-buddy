/**
 * PD Buddy — configuration.
 * DRAFT=false. Dr D (Amar Damodar) signed off all content Nov 18 2026, 9:09 PM ET.
 */
(function (global) {
  "use strict";

  const DRAFT = false;
  const DRAFT_BANNER = "Draft – not for clinical use until reviewed by Dr D";
  const APP_NAME = "PD Buddy";
  const APP_VERSION = "1.0.0";
  const SUPPORT_EMAIL = "akd.nephrology@gmail.com";
  const PUBLISHER = "Wellness Tech LLC";

  const config = { DRAFT, DRAFT_BANNER, APP_NAME, APP_VERSION, SUPPORT_EMAIL, PUBLISHER };
  global.PdConfig = config;
  if (typeof module !== "undefined" && module.exports) module.exports = config;
})(typeof globalThis !== "undefined" ? globalThis : this);

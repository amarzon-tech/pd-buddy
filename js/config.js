/**
 * PD Buddy — configuration.
 * DRAFT=true until Dr D (Amar Damodar) signs off every item in CONTENT_REVIEW.md
 * and asks for it to be published, in his own words.
 */
(function (global) {
  "use strict";

  const DRAFT = true;
  const DRAFT_BANNER = "Draft – not for clinical use until reviewed by Dr D";
  const APP_NAME = "PD Buddy";
  const APP_VERSION = "0.1.0-draft";
  const SUPPORT_EMAIL = "amardamodar@gmail.com";
  const PUBLISHER = "Wellness Tech LLC";

  const config = { DRAFT, DRAFT_BANNER, APP_NAME, APP_VERSION, SUPPORT_EMAIL, PUBLISHER };
  global.PdConfig = config;
  if (typeof module !== "undefined" && module.exports) module.exports = config;
})(typeof globalThis !== "undefined" ? globalThis : this);

"use strict";
let passed = 0, failed = 0;
const failures = [];
function approx(a, e, eps, msg) {
  if (Number.isFinite(a) && Math.abs(a - e) <= eps) passed++;
  else { failed++; failures.push(`${msg}: got ${a}, expected ${e} ± ${eps}`); }
}
function eq(a, e, msg) {
  if (a === e) passed++;
  else { failed++; failures.push(`${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(e)}`); }
}
function isTrue(c, msg) { if (c) passed++; else { failed++; failures.push(msg); } }
function throws(fn, msg) { try { fn(); failed++; failures.push(`${msg}: expected throw`); } catch (e) { passed++; } }
function section(n) { console.log("\n▸ " + n); }
function done(name) {
  console.log(`\n${name}: ${passed} passed, ${failed} failed`);
  if (failed) { failures.forEach((f) => console.log("  ✗ " + f)); process.exit(1); }
}
module.exports = { approx, eq, isTrue, throws, section, done };

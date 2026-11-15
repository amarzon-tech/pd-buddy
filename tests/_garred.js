"use strict";
// model-2c branch: the legacy suites pin the numbers of the deployed Garred (F = 0) solute model.
// Load this before js/formulas.js. Run with PD_SOLUTE_MODEL=vonesh2c to see the 2c pin changes.
if (!process.env.PD_SOLUTE_MODEL) process.env.PD_SOLUTE_MODEL = "garred";

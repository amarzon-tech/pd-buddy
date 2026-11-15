/**
 * PD Buddy — published PD Adequest prescription grid (look-up only, nothing computed).
 *
 * Source (primary): Akonur A, Firanek C, Gellens M, Hutchcraft A, Kathuria P, Sloand JA.
 *   Volume-based peritoneal dialysis prescription guide to achieve adequacy targets. Perit Dial Int.
 *   2016;36(2):188-195, doi:10.3747/pdi.2014.00255 (PMC4803365), Figures 4 (RKF < 2 mL/min) and
 *   5 (RKF ≥ 2 mL/min). Transcribed from the published figure images.
 * Cross-check: Baxter "Peritoneal Dialysis Prescription Management Quick Reference Guide"
 *   (USMP/81/17-0004) pp. 10-11, text and colour squares extracted from the vector PDF.
 *   41 of 48 cells agree exactly; the cells listed in GRID_FLAGS differ or lack a colour
 *   square in the guide and are shown with a warning.
 *
 * Modelling assumptions stated by the source: PD Adequest 2.0, TARGET cohort; targets weekly
 * urea Kt/V ≥ 1.7 and peritoneal UF ≥ 1 L/day; only 1.5% / 2.5% dextrose (no 4.25%) plus
 * icodextrin for the long dwell; CAPD 8-h overnight exchange; APD 9-h cycler time.
 * V bands (Watson urea volume): V1 < 34 L, V2 34 to < 42 L, V3 ≥ 42 L.
 * RKF band: residual kidney urea clearance < 2 or ≥ 2 mL/min.
 * Codes: (m) mixed 1.5%/2.5% dextrose, (g) 2.5% dextrose, (ico) icodextrin (Extraneal).
 * CAPD rows are "night + day exchanges"; APD rows are "night cycles + day dwell(s)", where
 * a day "2x" means the last fill plus one extra daytime exchange.
 */
(function (global) {
  "use strict";

  // 0.4.3 (App Critic M7): cited from the journal figures only.
  const GRID_SOURCE = "Akonur A et al. Perit Dial Int 2016;36:188-195, Figs 4-5";

  const GRID = Object.freeze({
 "lt2": {
  "V1": {
   "low": {
    "capd": [
     "2L(g)+3x2L(m)",
     "1.5L(g)+4x1.5L(m)"
    ],
    "ccpd": [
     "5x2L(m)+2L(g)",
     "3x2L(m)+2x2L(g)",
     "4x2L(m)+2L(ico)"
    ]
   },
   "low-average": {
    "capd": [
     "2L(g)+3x2L(g)",
     "1.5L(g)+4x1.5L(m)"
    ],
    "ccpd": [
     "4x2.5L(g)+2L(g)",
     "4x2L(m)+2x2L(g)",
     "3x2.5L(m)+2x2L(g)",
     "4x2L(m)+2L(ico)"
    ]
   },
   "high-average": {
    "capd": [
     "2L(g)+3x2L(g)",
     "1.5L(g)+4x1.5L(m)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "5x2L(g)+2L(g)",
     "3x2L(m)+2L(ico)"
    ]
   },
   "high": {
    "capd": [
     "2.5L(g)+3x2L(g)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "4x2L(g)+2x2L(g)",
     "3x2L(g)+2L(ico)",
     "3x2.5L(m)+2.5L(ico)"
    ]
   }
  },
  "V2": {
   "low": {
    "capd": [
     "3L(g)+3x3L(m)",
     "2.5L(g)+4x2.5L(m)"
    ],
    "ccpd": [
     "3x3L(m)+2x2.5L(g)",
     "4x2.5L(m)+2x2.5L(g)"
    ]
   },
   "low-average": {
    "capd": [
     "2.5L(g)+3x2.5L(m)"
    ],
    "ccpd": [
     "3x2.5L(m)+2x2L(g)",
     "4x3L(m)+3L(g)",
     "4x2.5L(m)+2.5L(ico)",
     "5x2.5L(m)+2L(ico)"
    ]
   },
   "high-average": {
    "capd": [
     "2.5L(g)+3x2.5L(g)",
     "2.5L(ico)+3x2.5L(m)"
    ],
    "ccpd": [
     "4x2L(m)+2x2L(g)",
     "5x2.5L(g)+2.5L(g)",
     "5x2L(m)+2L(ico)"
    ]
   },
   "high": {
    "capd": [
     "3L(g)+3x3L(g)",
     "2.5L(g)+4x2.5L(g)",
     "2.5L(ico)+3x2.5L(m)"
    ],
    "ccpd": [
     "4x2.5L(g)+2x2.5L(g)",
     "5x2.5L(m)+2x2.5L(g)",
     "4x2.5L(m)+2.5L(ico)"
    ]
   }
  },
  "V3": {
   "low": {
    "capd": [
     "3L(g)+4x3L(m)"
    ],
    "ccpd": [
     "3x3L(m)+2x3L(g)",
     "4x3L(g)+2x2.5L(g)"
    ]
   },
   "low-average": {
    "capd": [
     "3L(g)+4x3L(m)"
    ],
    "ccpd": [
     "5x2.5L(m)+2x2.5L(g)",
     "3x3L(m)+2x3L(g)",
     "4x3L(m)+2x2.5L(g)"
    ]
   },
   "high-average": {
    "capd": [
     "3L(g)+4x3L(m)",
     "2.5L(ico)+4x2.5L(m)"
    ],
    "ccpd": [
     "4x2.5L(g)+2x2.5L(g)",
     "4x3L(m)+2x2.5L(g)"
    ]
   },
   "high": {
    "capd": [
     "3L(g)+4x3L(g)"
    ],
    "ccpd": [
     "4x2.5L(g)+2x2.5L(g)",
     "5x2.5L(m)+2.5L(ico)"
    ]
   }
  }
 },
 "ge2": {
  "V1": {
   "low": {
    "capd": [
     "1.5L(g)+3x1.5L(m)"
    ],
    "ccpd": [
     "3x1.5L(m)+1.5L(g)",
     "3x2L(m)+2L(g)",
     "4x2L(g)+dry"
    ]
   },
   "low-average": {
    "capd": [
     "1.5L(g)+3x1.5L(g)",
     "2L(g)+3x2L(g)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "4x2L(g)+2L(g)",
     "3x2L(m)+2L(ico)"
    ]
   },
   "high-average": {
    "capd": [
     "2L(g)+3x2L(g)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "3x2L(m)+2x2L(g)",
     "5x2L(g)+2L(g)",
     "3x2L(m)+2L(ico)"
    ]
   },
   "high": {
    "capd": [
     "2.5L(g)+3x2.5L(g)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "4x2L(g)+2x2L(g)",
     "3x2L(g)+2L(ico)"
    ]
   }
  },
  "V2": {
   "low": {
    "capd": [
     "2L(g)+3x2L(m)"
    ],
    "ccpd": [
     "3x2.5L(m)+2.5L(g)",
     "5x2L(m)+2L(g)",
     "4x2.5L(g)+2L(g)",
     "3x2L(g)+2L(ico)",
     "4x2L(m)+2L(ico)"
    ]
   },
   "low-average": {
    "capd": [
     "2L(g)+3x2L(g)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "3x2.5L(g)+2L(g)",
     "3x2.5L(m)+2x2L(g)",
     "3x2L(m)+2L(ico)"
    ]
   },
   "high-average": {
    "capd": [
     "2L(g)+3x2L(g)",
     "2L(ico)+3x2L(m)"
    ],
    "ccpd": [
     "3x2L(m)+2x2L(g)",
     "5x2L(g)+2L(g)",
     "3x2L(m)+2L(ico)"
    ]
   },
   "high": {
    "capd": [
     "3L(g)+3x3L(g)",
     "3L(g)+4x3L(m)",
     "2.5L(ico)+3x2.5L(m)"
    ],
    "ccpd": [
     "3x2.5L(g)+2x2.5L(g)",
     "3x2L(g)+2L(ico)"
    ]
   }
  },
  "V3": {
   "low": {
    "capd": [
     "2.5L(g)+3x2.5L(m)",
     "2.5L(ico)+3x2L(g)"
    ],
    "ccpd": [
     "4x3L(m)+2.5L(g)",
     "3x2L(m)+2x2L(g)",
     "4x2.5L(m)+2.5L(ico)"
    ]
   },
   "low-average": {
    "capd": [
     "2.5L(g)+3x2.5L(g)",
     "2.5L(ico)+3x2.5L(m)"
    ],
    "ccpd": [
     "3x3L(m)+2.5L(g)",
     "4x3L(g)+2.5L(g)",
     "3x2.5L(m)+2x2L(g)",
     "4x2.5L(m)+2.5L(ico)"
    ]
   },
   "high-average": {
    "capd": [
     "2.5L(g)+3x2.5L(g)",
     "2.5L(ico)+3x2.5L(m)"
    ],
    "ccpd": [
     "4x2.5L(m)+2x2L(g)",
     "5x2.5L(g)+2.5L(g)",
     "4x2.5L(m)+2.5L(ico)",
     "5x2.5L(m)+2L(ico)",
     "3x3L(m)+2.5L(ico)"
    ]
   },
   "high": {
    "capd": [
     "3L(g)+3x3L(g)",
     "2.5L(g)+4x2.5L(g)",
     "2.5L(ico)+3x2.5L(m)"
    ],
    "ccpd": [
     "3x2.5L(g)+2x2.5L(g)",
     "4x2.5L(g)+2L(ico)",
     "3x3L(g)+2.5L(ico)"
    ]
   }
  }
 }
});

  // Cells where the two published versions differ (or the guide shows no colour square).
  const GRID_FLAGS = Object.freeze({
    "lt2|V2|high-average|capd|1": "A second published version could not confirm the 2.5L night; Akonur Fig 4 shows icodextrin.",
    "ge2|V1|low|ccpd|0": "Day 1.5L solution: Akonur Fig 5 shows 2.5% (g); a second published version shows mixed (m).",
    "ge2|V2|low-average|capd|1": "A second published version could not confirm the 2L night; Akonur Fig 5 shows icodextrin.",
    "ge2|V2|high-average|capd|1": "A second published version could not confirm the 2L night; Akonur Fig 5 shows icodextrin.",
    "ge2|V3|low-average|ccpd|0": "Day dwell: Akonur Fig 5 shows 2.5L; a second published version shows 2x2.5L.",
    "ge2|V3|low-average|ccpd|1": "Day dwell: Akonur Fig 5 shows 2.5L; a second published version shows 2x3L.",
    "ge2|V3|low-average|ccpd|2": "Day dwell: Akonur Fig 5 shows 2x2L; a second published version shows 2x2.5L.",
    "ge2|V3|high-average|ccpd|1": "A second published version could not confirm the 5x2.5L night; Akonur Fig 5 shows 2.5% (g).",
    "ge2|V3|high|ccpd|2": "Day dwell: Akonur Fig 5 shows 2.5L icodextrin; a second published version shows 2L icodextrin.",
  });

  const SOL_LABEL = Object.freeze({ m: "1.5%/2.5% mixed", g: "2.5%", ico: "icodextrin 7.5%" });

  function vBand(vL) {
    if (!(vL > 0)) return null;
    return vL < 34 ? "V1" : vL < 42 ? "V2" : "V3";
  }
  function rkfBand(kruMlMin) {
    if (kruMlMin == null || !Number.isFinite(kruMlMin)) return null;
    return kruMlMin < 2 ? "lt2" : "ge2";
  }

  // "3x2.5L(m)" → { n: 3, volL: 2.5, sol: "m" };  "dry" → { dry: true }
  function parsePart(s) {
    if (s === "dry") return { dry: true, n: 0, volL: 0, sol: null };
    const m = /^(?:(\d+)x)?(\d+(?:\.\d+)?)L(?:\((m|g|ico)\))?$/.exec(s);
    if (!m) throw new Error("bad grid entry " + s);
    return { n: m[1] ? +m[1] : 1, volL: +m[2], sol: m[3] || null };
  }
  function parseRow(str) {
    const [a, b] = str.split("+");
    return { night: parsePart(a), day: parsePart(b), text: str };
  }

  function describe(mod, row) {
    const p = (x) => (x.dry ? "dry day" : (x.n > 1 ? x.n + " × " : "") + x.volL + " L" + (x.sol ? " " + SOL_LABEL[x.sol] : " (solution not shown in source)"));
    return mod === "capd" ? "Night " + p(row.night) + " · Day " + p(row.day) : "Cycler " + p(row.night) + " · Day " + p(row.day);
  }

  /** Look up the grid cell. Returns null when any input is missing. */
  function lookup(typeKey, vL, kruMlMin) {
    const vb = vBand(vL), rb = rkfBand(kruMlMin);
    if (!typeKey || !vb || !rb || !GRID[rb][vb][typeKey]) return null;
    const cell = GRID[rb][vb][typeKey];
    const out = { type: typeKey, vBand: vb, rkfBand: rb, source: GRID_SOURCE, capd: [], ccpd: [] };
    ["capd", "ccpd"].forEach((mod) => {
      cell[mod].forEach((s, i) => {
        const row = parseRow(s);
        row.label = describe(mod, row);
        row.flag = GRID_FLAGS[[rb, vb, typeKey, mod, i].join("|")] || null;
        out[mod].push(row);
      });
    });
    return out;
  }

  const X = { GRID, GRID_FLAGS, GRID_SOURCE, SOL_LABEL, vBand, rkfBand, parsePart, parseRow, lookup, describe };
  global.PdRxGrid = X;
  if (typeof module !== "undefined" && module.exports) module.exports = X;
})(typeof globalThis !== "undefined" ? globalThis : this);

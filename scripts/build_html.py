#!/usr/bin/env python3
"""Generates index.html for PD Buddy (static; run once after edits)."""
from pathlib import Path

def field(id_, label, unit, tag="", value="", placeholder="—", mode="decimal", aria=None):
    tagh = f' <span class="tag{" req" if tag=="required" else ""}">{tag}</span>' if tag else ""
    val = f' value="{value}"' if value != "" else ""
    return f'''<label class="field" id="{id_}-wrap">
              <span class="field-label">{label}{tagh}</span>
              <div class="field-control">
                <input id="{id_}" type="text" inputmode="{mode}" autocomplete="off" placeholder="{placeholder}"{val} aria-label="{aria or label}">
                {f'<span class="unit-pill">{unit}</span>' if unit else ''}
              </div>
            </label>'''

def chips(id_, attr, opts, on, label, extra=""):
    b = []
    for v, t in opts:
        is_on = v == on
        b.append(f'<button type="button" class="chip{" is-on" if is_on else ""}" role="radio" aria-checked="{"true" if is_on else "false"}" data-{attr}="{v}">{t}</button>')
    return f'<div class="chips big{extra}" id="{id_}" role="radiogroup" aria-label="{label}">' + "".join(b) + "</div>"

def metric(id_, label, mid=None):
    return f'<div class="metric" id="{mid or "m-"+id_}"><div class="mv" id="{id_}">—</div><div class="ml">{label}</div></div>'

SOL = [("1.5", "1.5%"), ("2.5", "2.5%"), ("4.25", "4.25%")]

html = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#1e63d6">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="PD Buddy">
  <meta name="description" content="Educational PD prescribing tool for nephrologists: PET transport, CAPD and CCPD options, weekly Kt/V and creatinine clearance. Offline, no login, no data collection.">
  <title>PD Buddy</title>
  <link rel="manifest" href="./manifest.json">
  <link rel="icon" type="image/png" href="./icons/favicon.png">
  <link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">
  <link rel="stylesheet" href="./css/styles.css">
  <link rel="stylesheet" href="./css/standalone.css">
  <link rel="stylesheet" href="./css/pd.css">
</head>
<body>
  <header class="top">
    <div class="top-row">
      <div>
        <p class="eyebrow">Wellness Tech LLC</p>
        <h1>PD Buddy</h1>
        <p class="subhead">Educational PD prescribing tool for nephrologists. PET, weekly Kt/V and CrCl. Offline · no data collected.</p>
      </div>
      <button class="icon-btn" id="theme-btn" type="button" aria-label="Toggle dark mode" title="Toggle dark mode">
        <svg id="theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
          <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>
        </svg>
      </button>
    </div>
    <nav class="stepper" id="stepper" aria-label="Steps">
      <button type="button" class="stepper-item is-on" data-go="1" aria-current="step"><span class="stepper-num">1</span><span class="stepper-lbl">Patient</span></button>
      <button type="button" class="stepper-item" data-go="2"><span class="stepper-num">2</span><span class="stepper-lbl">PET</span></button>
      <button type="button" class="stepper-item" data-go="3"><span class="stepper-num">3</span><span class="stepper-lbl">Labs &amp; urine</span></button>
      <button type="button" class="stepper-item" data-go="4"><span class="stepper-num">4</span><span class="stepper-lbl">Regimen</span></button>
      <button type="button" class="stepper-item" data-go="5"><span class="stepper-num">5</span><span class="stepper-lbl">Prescription</span></button>
    </nav>
  </header>

  <section class="wrap panel active" id="panel-pd">
    <div class="col-main">

      <!-- Step 1: patient -->
      <div class="step is-on" id="step-1" data-step="1">
        <article class="card" id="patient-card">
          <div class="card-h"><h2>Patient</h2><button type="button" class="about-btn" data-about="v">About V &amp; BSA</button></div>
          <span class="field-label">Sex</span>
          {chips("p-sex", "sex", [("male", "Male"), ("female", "Female")], "male", "Sex")}
          <div class="grid-2 simple" style="margin-top:14px">
            {field("p-age", "Age", "yr", "required", mode="numeric")}
            {field("p-wt", "Weight", "kg", "required")}
            {field("p-ft", "Height", "ft", "required", mode="numeric", aria="Height, feet")}
            {field("p-in", "&nbsp;", "in", "", mode="decimal", aria="Height, inches")}
          </div>
          <div class="unit-row"><span class="field-label">Weight in</span>
          {chips("p-wunit", "wunit", [("kg", "kg"), ("lb", "lb")], "kg", "Weight unit", " small")}</div>
          <div class="mod-h"><span class="field-label">Urea volume (V)</span></div>
          {chips("p-vmethod", "vm", [("watson", "Watson"), ("hume", "Hume-Weyers")], "watson", "Urea distribution volume method")}
          <div class="metric-grid two" style="margin-top:12px">
            {metric("o-v", "V (total body water)")}
            {metric("o-bsa", "BSA (Mosteller)")}
          </div>
          <p class="note" id="p-msg">Enter age, height and weight to continue. KDOQI 2006 accepts Watson or Hume for V in adults.</p>
        </article>
      </div>

      <!-- Step 2: PET -->
      <div class="step" id="step-2" data-step="2">
        <article class="card" id="pet-card">
          <div class="card-h"><h2>4-hour PET</h2><button type="button" class="about-btn" data-about="pet">About PET</button></div>
          <span class="field-label">Transport type</span>
          {chips("pet-type", "ptype", [("high", "High"), ("high-average", "High-average"), ("low-average", "Low-average"), ("low", "Low")], None, "Transport type", " quad")}
          <details class="cit pet-nums" id="pet-nums">
            <summary>Have PET numbers? <span class="tag">optional</span></summary>
            <div class="pet-nums-body">
          <span class="field-label">PET solution</span>
          {chips("pet-sol", "petsol", [("2.5", "2.5% dextrose"), ("4.25", "4.25% dextrose")], "2.5", "PET solution")}
          <div class="grid-2 simple" style="margin-top:14px">
            {field("pet-dpcr", "4-h D/P creatinine", "", "optional")}
            {field("pet-dd0", "4-h D/D₀ glucose", "", "optional")}
            {field("pet-fill", "Fill volume", "L", "standard 2.0", value="2.0")}
            {field("pet-drain", "Drain volume", "mL", "for model")}
            {field("pet-dpu", "4-h D/P urea", "", "for Kt/V model")}
          </div>
            </div>
          </details>
          <div class="metric-grid two" style="margin-top:12px">
            {metric("o-cat", "Transport used")}
            {metric("o-gcat", "D/D₀ glucose")}
            {metric("o-petuf", "PET net UF")}
            {metric("o-mtac", "MTAC creatinine")}
          </div>
          <p class="note" id="pet-msg">Pick a transport type, or enter PET numbers.</p>
          <p class="note" id="pet-uf-msg"></p>
          <p class="note" id="pet-model-msg"></p>
        </article>
      </div>

      <!-- Step 3: labs, urine, measured dialysate -->
      <div class="step" id="step-3" data-step="3">
        <article class="card" id="labs-card">
          <div class="card-h"><h2>Plasma &amp; 24-h urine</h2><button type="button" class="about-btn" data-about="rkf">About</button></div>
          <p class="note" style="margin-top:0">All optional. Use the same units for urine, dialysate and plasma (ratios only).</p>
          <div class="grid-2 simple">
            {field("l-pu", "Plasma urea (BUN)", "", "optional")}
            {field("l-pcr", "Plasma creatinine", "", "optional")}
            {field("l-uvol", "24-h urine volume", "mL", "optional")}
            {field("l-uu", "Urine urea", "", "optional")}
            {field("l-ucr", "Urine creatinine", "", "optional")}
          </div>
          <div class="metric-grid two" style="margin-top:12px">
            {metric("o-ktvr", "Renal Kt/V (weekly)")}
            {metric("o-rkf", "RKF, mean urea + Cr")}
          </div>
          <p class="note" id="rkf-msg"></p>
        </article>
        <article class="card" id="meas-card">
          <div class="card-h"><h2>Measured 24-h dialysate</h2><span class="tag">optional</span></div>
          <div class="grid-3 simple">
            {field("m-drain", "24-h drain", "L", "optional")}
            {field("m-du", "Dialysate urea", "", "optional")}
            {field("m-dcr", "Dialysate creatinine", "", "optional")}
          </div>
          <div class="metric-grid two" style="margin-top:12px">
            {metric("o-ktvp-meas", "Peritoneal Kt/V, measured")}
            {metric("o-crcl-meas", "Total CrCl, measured")}
          </div>
          <p class="note">Measured on the current prescription (KDOQI 2006 “delivered” dose). Needs plasma urea / creatinine above.</p>
        </article>
      </div>

      <!-- Step 4: regimen -->
      <div class="step" id="step-4" data-step="4">
        <article class="card" id="reg-card">
          <div class="card-h"><h2>Your regimen</h2><button type="button" class="about-btn" data-about="model">About the estimate</button></div>
          {chips("r-mod", "mod", [("capd", "CAPD"), ("apd", "CCPD")], "capd", "PD modality")}

          <div id="capd-block" style="margin-top:14px">
            <div class="grid-2 simple">
              {field("c-n", "Exchanges / day", "", "default 4", value="4", mode="numeric")}
              {field("c-fill", "Fill volume", "L", "default 2.0", value="2.0")}
            </div>
            <span class="field-label">Solution</span>
            {chips("c-sol", "sol", SOL, "2.5", "CAPD solution")}
            <div class="grid-2 simple" style="margin-top:14px">
              {field("c-long", "Long dwell", "h", "optional")}
              {field("c-uf", "Net UF per exchange", "mL", "default 0", value="0", mode="decimal")}
            </div>
            <div id="c-longsol-wrap">
              <span class="field-label">Long-dwell solution</span>
              {chips("c-longsol", "lsol", [("same", "Same"), ("ico", "Icodextrin 7.5%")], "same", "Long dwell solution")}
              <div class="grid-2 simple" style="margin-top:14px">
                {field("c-long-uf", "Long-dwell net UF", "mL", "optional")}
              </div>
            </div>
            <p class="note">No long dwell: 24 h is split equally. With a long dwell, the other exchanges share the rest of the day.</p>
          </div>

          <div id="apd-block" class="hidden" style="margin-top:14px">
            <div class="grid-2 simple">
              {field("a-n", "Night cycles", "", "required", mode="numeric")}
              {field("a-fill", "Fill volume", "L", "required")}
              {field("a-ttt", "Total therapy time", "h", "required")}
              {field("a-fd", "Fill + drain time / cycle", "min", "optional")}
              {field("a-uf", "Net UF per cycle", "mL", "default 0", value="0")}
            </div>
            <span class="field-label">Night solution</span>
            {chips("a-sol", "asol", SOL, "1.5", "CCPD night solution")}
            <div class="grid-2 simple" style="margin-top:14px">
              {field("a-last", "Last fill (day dwell)", "L", "0 = dry day", value="0")}
              {field("a-day", "Day dwell", "h", "default 24 − therapy")}
              {field("a-last-uf", "Last-fill net UF", "mL", "optional")}
            </div>
            <span class="field-label">Last-fill solution</span>
            {chips("a-lsol", "alsol", SOL + [("ico", "Icodextrin")], "ico", "Last fill solution")}
            <p class="note" id="a-msg">Night dwell = (total therapy time − cycles × fill/drain time) ÷ cycles. Fill/drain time left blank counts as 0, which overstates dwell time.</p>
          </div>

          <div class="metric-grid two" style="margin-top:14px">
            {metric("o-ktv-pred", "Weekly Kt/V, estimated total")}
            {metric("o-crcl-pred", "Weekly CrCl, estimated")}
          </div>
          <div class="dwell-table" id="dwell-table"></div>
          <p class="note" id="reg-msg"></p>
        </article>
      </div>

      <!-- Step 5: results and prescription -->
      <div class="step" id="step-5" data-step="5">
        <article class="card" id="opt-card">
          <div class="card-h"><h2>Regimen options</h2><button type="button" class="about-btn" data-about="options">About options</button></div>
          <div class="opt-table" id="opt-table"></div>
          <p class="note" id="opt-basis"></p>
          <div class="grid-2 simple" style="margin-top:10px">
            {field("o-uf-dex", "Long-dwell UF, dextrose", "mL", "optional")}
            {field("o-uf-ico", "Long-dwell UF, Extraneal", "mL", "optional")}
          </div>
          <p class="note" id="opt-note">Standard CAPD and CCPD prescriptions (Handbook of Dialysis; ADEMEX). Extraneal rows use the same diffusion model: icodextrin’s UF advantage is not modeled, so they match the dextrose rows unless you enter expected long-dwell UF. Short dwells count net UF as 0.</p>
        </article>
        <article class="card" id="cmp-card">
          <div class="card-h"><h2>Clearance vs targets</h2><button type="button" class="about-btn" data-about="targets">About targets</button></div>
          <div class="result-rows" id="cmp-rows"></div>
          <p class="note" id="cmp-note">ISPD 2020: “There is no specific clearance target that guarantees sufficient dialysis for an individual.” 1.7 is the KDOQI 2006 minimum, shown for reference, not as pass/fail.</p>
        </article>

        <article class="card rx-card" id="rx-card">
          <div class="card-h rx-card-h">
            <h2>Prescription</h2>
            <div class="rx-actions no-print">
              <button type="button" class="rx-btn" id="rx-copy">Copy</button>
              <button type="button" class="rx-btn" id="rx-print">Print</button>
            </div>
          </div>
          <div class="rx-sheet" id="rx-sheet"></div>
        </article>

        <article class="card" id="limits-card">
          <div class="card-h"><h2>Limits of the estimate</h2></div>
          <ul class="limits">
            <li>The regimen estimate is the Garred simple diffusion model fitted to one PET. It has not been validated as a prescribing model.</li>
            <li>Ultrafiltration is not predicted. UF counts only when you enter it.</li>
            <li>It ignores residual volume, fill-volume and posture effects on transport, and CCPD fill/drain losses unless entered.</li>
            <li>Transport type alone uses typical values for that type (Twardowski bands), not the patient’s own membrane. Kt/V needs a measured 4-h D/P urea.</li>
            <li>Icodextrin (Extraneal) kinetics are not modeled.</li>
            <li>Confirm any change with a measured 24-h dialysate and urine collection.</li>
          </ul>
        </article>
      </div>
    </div>
  </section>

  <div class="step-bar" id="step-bar">
    <button type="button" class="step-btn" id="step-back" disabled>Back</button>
    <p class="step-hint" id="step-hint"></p>
    <button type="button" class="step-btn primary" id="step-next">Next</button>
  </div>

  <footer class="foot">
    <p>Wellness Tech LLC · Support:
      <a href="mailto:akd.nephrology@gmail.com">akd.nephrology@gmail.com</a>.
      Works offline, with no login or ads, and never stores or sends your inputs.
      Every formula and source is in the About sheets and in
      <a href="./CONTENT_REVIEW.md">CONTENT_REVIEW.md</a>.
      <a href="./privacy.html">Privacy</a> · <a href="./support.html">Support</a>.
      For nephrologists. Educational use only; not a substitute for clinical judgment or your unit protocol.
    </p>
  </footer>

  <div class="overlay" id="overlay" hidden></div>
  <div class="sheet" id="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" hidden>
    <div class="sheet-handle" aria-hidden="true"></div>
    <button type="button" class="sheet-close" id="sheet-close" aria-label="Close">×</button>
    <h3 id="sheet-title"></h3>
    <div id="sheet-body"></div>
  </div>

  <script src="./js/config.js"></script>
  <script src="./js/formulas.js"></script>
  <script src="./js/prescription.js"></script>
  <script src="./js/app.js"></script>
  <script>
    if ("serviceWorker" in navigator) {{
      window.addEventListener("load", function () {{ navigator.serviceWorker.register("./sw.js"); }});
    }}
  </script>
</body>
</html>
'''
Path(__file__).resolve().parent.parent.joinpath("index.html").write_text(html)
print("wrote index.html")

# Project Memory — Global Coffee Trade Flow Map

A running log of every major decision, problem, and solution encountered while building this project. Useful for resuming work, onboarding collaborators, or recreating the pipeline from scratch.

---

## Phase 1 — Data Acquisition

### FAOSTAT (country-level totals)
- **Source**: https://www.fao.org/faostat/en/#data/TCL
- **Method**: Downloaded the bulk normalized ZIP from `https://bulks-faostat.fao.org/production/Trade_CropsLivestock_E_All_Data_(Normalized).zip` (last updated Dec 23, 2025)
- **Filter**: Item code `656` = "Coffee, green". Retained Import Quantity, Import Value, Export Quantity, Export Value.
- **Result**: `coffee_green_trade_FAOSTAT.csv` — 53,892 rows, 279 countries, 1961–2024.
- **Limitation discovered**: FAOSTAT only provides country-level totals. It does not identify trade partners. You cannot reconstruct "how much of Brazil's exports went to Germany" from this data alone.

### BACI (bilateral trade)
- **Source**: CEPII BACI HS92 v202601 — https://www.cepii.fr/DATA_DOWNLOAD/baci/data/BACI_HS92_V202601.zip
- **Filter**: HS codes `090111` (coffee, not roasted, not decaffeinated) and `090112` (coffee, not roasted, decaffeinated). Summed across both codes per year/exporter/importer pair.
- **Unit conversion**: Raw values are in thousands USD; divide by 1000 to get millions USD for the map.
- **Result**: `coffee_bilateral_trade_BACI.csv` — 136,768 rows, 229 exporters, 233 importers, 1995–2024.
- **Why BACI over Comtrade directly**: BACI reconciles the mirror data (what country A reports exporting vs. what country B reports importing) into a single harmonized figure. More reliable for global coverage.

### FAO vs. BACI comparison
- FAO reports ~55% higher total volume than BACI for the overlapping 1995–2024 period.
- Reason: FAO captures re-exports and uses a different methodology; BACI is stricter about origin/destination.
- Decision: Use BACI for the bilateral map. FAO is retained as supplementary (provides 1961–1994 history not available in BACI).

---

## Phase 2 — EDA Notebooks

Two Jupyter notebooks built for exploration:
- `coffee_trade_eda.ipynb` — FAOSTAT data. Uses `ydata-profiling` (HTML report), `sweetviz` (HTML comparison), and matplotlib charts.
- `coffee_bilateral_trade_eda.ipynb` — BACI data. Includes bilateral heatmaps, three `geopandas` choropleth maps (exports, imports, net position), and a Herfindahl–Hirschman Index (HHI) concentration metric.

**Dependency note**: All pip installs use the `#!pip3 install` syntax so cells can be uncommented and run directly in Jupyter without modifying the notebook structure.

---

## Phase 3 — Map Data Preparation

### v1 → v2: Top-40 flows per year
- For each year, aggregated all bilateral flows, ranked by value, and kept the top 40.
- Computed per-country net position: `net = total_exports - total_imports` (in millions USD).
- Output: `coffee_map_data_v2.json` — embedded inline in `index.html` as `const TRADE = {...}`.

**Key decision — inline data**: The map fetches world geometry from a CDN but all trade data is embedded directly in the HTML. This avoids `fetch()` failures when opening via `file://` protocol locally (browsers block local `fetch()` for security reasons).

### v2 → v3: Added bigFlows
- Added a second array per year — `bigFlows` — containing every bilateral flow over $100M, not just the top 40.
- In 2024: 70 flows exceed $100M; only 40 are in the standard view. The extra 30 appear as supplemental arcs on country hover.
- In 2000: only 13 flows exceed $100M, so the top-40 and bigFlows largely overlap.
- Output: `coffee_map_data_v3.json` — 500 KB, embedded in updated `index.html`.

---

## Phase 4 — Map Build (D3 + TopoJSON)

### Stack
- **D3 v7** — projections, color interpolation, SVG rendering, transitions
- **TopoJSON** — world-atlas countries-110m.json fetched from jsDelivr CDN
- **Vanilla HTML/CSS/JS** — no build tools, no frameworks, fully self-contained

### Layer architecture
Three SVG groups stacked in z-order:
1. `gGraticule` — sphere fill + graticule lines (background)
2. `gCountries` — choropleth country paths
3. `gFlows` — arc paths with arrowhead markers

### Projection
Natural Earth projection (`d3.geoNaturalEarth1`) — good balance of area accuracy and aesthetic for a world trade map.

### ISO numeric → ISO3 mapping
World-atlas TopoJSON uses numeric country IDs (e.g. `076` = Brazil). BACI uses ISO3 codes (`BRA`). A custom `NUM_TO_ISO` lookup table bridges them. ~250 entries hand-mapped.

### Arrowhead markers
Three SVG `<marker>` elements at different scale sizes (`arr-sm`, `arr-md`, `arr-lg`) + one highlighted version (`arr-hi`) used during hover. Arc `stroke-width` determines which marker is applied.

### Arc geometry
Each arc is a quadratic Bézier curve:
- Control point offset perpendicular to the chord, scaled by 22% of chord length
- Arrow tip placed at 88% along the curve (not at the destination centroid) to avoid arrowhead overlap with the country fill
- Country centroids computed via `d3.geoCentroid()` from TopoJSON features

---

## Phase 5 — Interactivity

### Year stepper
- ← / → buttons, a range slider, and a Play/Pause button
- Speed modes: 1× (800ms/year), 1.5× (~533ms), 3× (~267ms)
- Keyboard: `ArrowLeft`, `ArrowRight`, `Space` (play/pause), `Escape` (stop)
- On year change: `render()` redraws choropleth fills + removes old arcs + draws new arcs with entrance animation

### Hover — critical bug and fix
**Bug**: The original `onCountryHover` called `render()`, which wiped all 40 arcs and re-drew them with entrance animations on every mouse movement. This caused visible flickering and arc "redraw" on hover.

**Fix**: Separated hover state from render state entirely.
- `render()` stores `data-base-op` (base opacity) and `data-base-marker` (base marker URL) as data attributes on each arc at draw time.
- `onCountryHover` only mutates `stroke`, `stroke-opacity`, and `marker-end` attributes in-place on existing DOM elements. Never calls `render()`.
- `onCountryLeave` restores those attributes from the stored data attributes. Never calls `render()`.
- **Result**: 40 arcs before, during, and after hover — no redraw, no flicker.

### Supplemental bigFlow arcs on hover
- On hover, check which `bigFlows` entries involve the hovered country but are NOT already drawn in the top-40.
- Append `.flow-arc-hover` paths directly to `gFlows` with a 250ms fade-in transition.
- On leave, `gFlows.selectAll('.flow-arc-hover').remove()` cleans them up.
- These are `pointer-events: none` so they don't interfere with arc hover tooltips.

---

## Phase 6 — Color Scale Evolution

### Iteration 1: Dark background → color
Green/blue gradients anchored at dark `#1c2128`. Looked washed out on the dark map background.

### Iteration 2: White → color
`d3.interpolate('#ffffff', '#3fb950')(t)` for exporters. Better contrast on hover, but most countries appeared white because the linear scale was dominated by Brazil's outlier ($11B net).

### Iteration 3: White gradient + neutral band (±$1B)
Added a hard neutral band so countries within ±$1B showed as neutral grey. Better conceptually but still most countries showed grey/white due to the linear scale.

### Iteration 4: Neutral band tightened to ±$1M
Nearly any country with trade data got a color. Still looked mostly white because of the linear scale problem.

### Iteration 5: Log scale (final)
**Root cause of whiteness**: Brazil's $11.25B net meant a country with $50M net had `t = 0.004` on a linear scale — interpolating to near-white. 

**Fix**: Switch `t` to log scale:
```js
const t = Math.min(
  Math.log(absNet / NEUTRAL_BAND) / Math.log(Math.max(maxAbs / NEUTRAL_BAND, 2)),
  1
);
```
- At p50 ($51M net): `t ≈ 0.47` → visible mid-tone
- At p90 ($1B net): `t ≈ 0.75` → strong color
- Brazil ($11.25B): `t = 1.0` → full saturation

**Final palette**: neutral grey `#cdd1d9` → green `#2da44e` (exporters), neutral grey → blue `#3b82f6` (importers).

---

## Known Constraints & Tradeoffs

| Issue | Decision |
|---|---|
| `file://` protocol blocks `fetch()` | Trade data embedded inline as JS constant; only world geometry fetched from CDN |
| Brazil dominates linear color scale | Log scale for `t` |
| Top-40 misses some >$100M flows for mid-tier countries | `bigFlows` array stores all >$100M; drawn as supplemental arcs on hover |
| World-atlas uses numeric IDs, BACI uses ISO3 | Custom `NUM_TO_ISO` lookup table |
| Arrowheads overlap country fills | Arrow tip placed at t=0.88 on curve, not at destination centroid |
| Playwright CDN fetch timing | `waitForFunction(() => arcs.length > 0)` with 25s timeout for QA |

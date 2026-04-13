# Project Memory — Global Coffee Trade Flow Map

A running log of every major decision, problem, and solution encountered while building this project. Useful for resuming work, onboarding collaborators, or recreating the pipeline from scratch.

---

## Tools & Workflow

### AI-assisted development
This project was built collaboratively with **Claude Code** (Anthropic, `claude-sonnet-4-6`), an agentic AI coding assistant running in the terminal. Claude Code read files, edited code, ran shell commands, committed to git, and pushed to GitHub — all from natural-language conversation. The `CLAUDE.md` file in this directory is specifically formatted to give future Claude Code sessions full context without manual re-onboarding.

### Authoring environment
- **Claude Code CLI** — primary coding agent (file edits, git, shell)
- **Python 3.13** — data pipeline scripts and local HTTP server (`python3 -m http.server 8000`)
- **Jupyter Lab / Notebook** — EDA notebooks (`coffee_trade_eda.ipynb`, `coffee_bilateral_trade_eda.ipynb`) now in [warrenrross/World_Coffee_Trade_EDA](https://github.com/warrenrross/World_Coffee_Trade_EDA)
- **D3.js v7** — visualization and SVG rendering
- **TopoJSON client v3** — geographic geometry decoding
- **Natural Earth 110m** — world geometry via `world-atlas@2` on jsDelivr CDN
- **GitHub Pages** — static hosting at `warrenrross.github.io/World_Coffee_Trade`
- **Git** — version control; initial commit and all subsequent pushes via Claude Code

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

Two Jupyter notebooks built for exploration. Both now live in [warrenrross/World_Coffee_Trade_EDA](https://github.com/warrenrross/World_Coffee_Trade_EDA) with full Jupytext + nbstripout version control.

- `coffee_trade_eda.ipynb` — FAOSTAT data. Uses `ydata-profiling` (HTML report), `sweetviz` (HTML comparison), and matplotlib charts.
- `coffee_bilateral_trade_eda.ipynb` — BACI data. Includes bilateral heatmaps, three `geopandas` choropleth maps (exports, imports, net position), and a Herfindahl–Hirschman Index (HHI) concentration metric. Live reports: [profile](https://warrenrross.github.io/World_Coffee_Trade_EDA/reports/coffee_bilateral_profile_report.html) · [sweetviz](https://warrenrross.github.io/World_Coffee_Trade_EDA/reports/coffee_bilateral_sweetviz_report.html)

**Dependency note**: All pip installs use the `#!pip3 install` syntax so cells can be uncommented and run directly in Jupyter without modifying the notebook structure.

---

## Phase 3 — Map Data Preparation

### v1 → v2: Top-40 flows per year
- For each year, aggregated all bilateral flows, ranked by value, and kept the top 40.
- Computed per-country net position: `net = total_exports - total_imports` (in millions USD).
- Output: `data.json` — originally embedded inline in the monolithic `index.html`.

**Key decision — inline data (later reversed)**: The initial design embedded trade data directly in the HTML to avoid `fetch()` failures when opening via `file://` protocol. This was later reversed when the project moved to GitHub Pages (which serves over HTTP), and the data was extracted to a separate `data_v3.json` file.

### v2 → v3: Added bigFlows
- Added a second array per year — `bigFlows` — containing every bilateral flow over $100M, not just the top 40.
- In 2024: 70 flows exceed $100M; only 40 are in the standard view. The extra 30 appear as supplemental arcs on country hover.
- In 2000: only 13 flows exceed $100M, so the top-40 and bigFlows largely overlap.
- **Recovery note**: The v3 data was originally embedded inline in `index.html`. When the project was split into separate files, it was recovered from git history with: `git show 87cfce1:index.html | python3 -c "import sys,re,json; ..."` and saved as `data_v3.json`.

---

## Phase 4 — Map Build (D3 + TopoJSON)

### Stack
- **D3 v7** — projections, color interpolation, SVG rendering, transitions
- **TopoJSON** — world-atlas countries-110m.json fetched from jsDelivr CDN
- **Vanilla HTML/CSS/JS** — no build tools, no frameworks, fully self-contained

### Layer architecture
Three SVG groups stacked in z-order inside a `mapG` wrapper:
1. `gGraticule` — sphere fill + graticule lines (background)
2. `gCountries` — choropleth country paths
3. `gFlows` — arc paths with arrowhead markers

The `mapG` wrapper receives the d3.zoom transform; HTML overlays (panel, tooltip, legend) are outside the SVG and are unaffected.

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
- Speed modes: 1× (1200ms/year), 1.5× (700ms), 3× (400ms)
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

## Phase 7 — GitHub Pages Hosting

### Initial push
The repo was pushed to `github.com/warrenrross/World_Coffee_Trade`. Initial push failed because no commits existed yet — fixed by staging files and creating the first commit before running `git push`.

### .gitignore issues
Inline comments on pattern lines (e.g. `private.md  # comment`) broke pattern matching — git treated the whole string including the comment as the literal pattern. Fixed by moving all comments to their own lines.

### Hosted URL
`https://warrenrross.github.io/World_Coffee_Trade` — GitHub Pages serves from the `main` branch root.

---

## Phase 8 — Monolithic → Multi-file Split

**Motivation**: The original design embedded all CSS, JS, and trade data inline in `index.html` to avoid `fetch()` issues with `file://` protocol. Once the project moved to GitHub Pages (HTTP serving), this constraint disappeared, and the monolithic structure became a maintenance burden.

**Split**:
- CSS extracted to `styles.css`
- JS extracted to `app.js`
- Trade data extracted to `data_v3.json` (recovered from git history — see Phase 3 note)
- `index.html` reduced to structural HTML only

**bigFlows regression**: After the split, bigFlows hover arcs stopped working. Root cause: `data_v2.json` (which lacked the `bigFlows` key) was mistakenly used instead of the v3 data. Fixed by extracting `data_v3.json` from git history and updating `app.js` to fetch it.

**Tooltip fix**: `positionTip(event)` calls in `onCountryHover` and `showFlowTip` were left over from the old tracking-tooltip design. Removed during the split (tooltip is now fixed to the upper-left corner of the map).

---

## Phase 9 — Mobile-First Redesign

### Problems identified on mobile
1. Pan/zoom on the map also scrolled and zoomed the entire page (browser intercepting touch events)
2. Map content was hidden behind the floating panel with no way to move/dismiss it
3. Side panel slid off screen on mobile (old CSS + JS auto-collapse interaction)
4. Bottom controls bar cut off by mobile browser chrome (`100vh` includes browser UI height)
5. No fullscreen option on iPhone

### Solutions

**d3.zoom for map pan/pinch**:
- Applied `d3.zoom().scaleExtent([1,8])` to the SVG, transforming the `mapG` group only
- `touch-action:none` on `#map-svg` prevents the browser from intercepting pinch before D3 sees it
- HTML overlays (panel, tooltip, legend) are positioned outside the SVG and stay fixed during map interaction

**Panel collapsing**:
- Panel toggle button `[≡]` moved into the panel header (always visible)
- Collapse animates only the flow list (`max-height` transition) — header stays on screen at all times
- Auto-collapse on touch devices was removed; panel always starts open
- Works identically on desktop and mobile

**Viewport height fix**:
- `height:100vh;height:100dvh` on `#app` — `dvh` (dynamic viewport height) adjusts as the mobile browser chrome shows/hides. `vh` is the fallback for browsers that don't support `dvh`.

**Fullscreen button**:
- Added to header; uses `document.fullscreenEnabled` to detect support
- Hides itself on iOS (all iOS browsers use WebKit, which blocks the Fullscreen API)
- On Android Chrome and desktop: enters/exits fullscreen, icon swaps between expand/collapse
- iOS alternative: Add to Home Screen from Safari — launches the page in standalone mode with no browser chrome

**Touch vs. mouse interaction**:
- `window.matchMedia('(hover: none)')` detects touch devices
- Touch: tap country to show tooltip, tap map background to dismiss
- Mouse: standard mousemove/mouseleave events

---

## Phase 10 — Mobile Footer Polish

**Changes** (based on annotation of `move_key.heic`):

1. **Legend moved inline into footer on mobile**: On ≤640px screens, the `#legend` DOM element is physically relocated from `#map-wrap` into `#controls` using `insertBefore()` before `#divv-flow`. CSS hides it in the map position and styles it compactly inline (transparent background, reduced width). This uses DOM relocation rather than CSS duplication because a canvas element's gradient rendering follows the element — you can't display it in two places with CSS alone.

2. **Speed buttons removed on mobile**: `#speed-seg` and its divider `#divv-speed` are hidden with `display:none` in the mobile media query. The 1× / 1.5× / 3× playback speed options are not needed on mobile (the full-speed default works fine, and the controls bar is already crowded).

3. **Arc legend row permanently removed**: The "Trade flow arc (width = value)" row and its separator were removed from `#legend` in `index.html` for all viewports. The information is intuitive enough not to need a legend entry.

---

## Known Constraints & Tradeoffs

| Issue | Decision |
|---|---|
| Brazil dominates linear color scale | Log scale for `t` |
| Top-40 misses some >$100M flows for mid-tier countries | `bigFlows` array stores all >$100M; drawn as supplemental arcs on hover |
| World-atlas uses numeric IDs, BACI uses ISO3 | Custom `NUM_TO_ISO` lookup table |
| Arrowheads overlap country fills | Arrow tip placed at t=0.88 on curve, not at destination centroid |
| iOS blocks Fullscreen API | Button hides on iOS; Add to Home Screen is the alternative |
| Mobile browser chrome cuts off `100vh` | Override with `100dvh` |
| Canvas gradient in legend can't be CSS-duplicated | Physical DOM relocation via `insertBefore()` on mobile |

# Skill Index — Global Coffee Trade Flow Map

A reference of every technical skill applied in this project, organized by domain. Useful as a learning roadmap or as a checklist when building a similar data visualization from scratch.

---

## 1. Data Sourcing & Acquisition

### Finding the right dataset
- Understanding the difference between **country-level aggregate trade** (FAOSTAT) and **bilateral trade** (BACI/Comtrade) — and why bilateral data is necessary to draw flow arrows between countries
- Identifying **HS codes** (Harmonized System commodity codes) for a specific product — here, `090111` and `090112` for unroasted green coffee
- Understanding **BACI's mirror-data reconciliation**: why BACI is preferred over raw Comtrade (it resolves discrepancies between what exporters report vs. what importers report)

### Downloading & filtering large datasets
- Working with **bulk ZIP downloads** containing multi-hundred-MB CSVs
- Filtering multi-commodity datasets to a specific product by item code or HS code using pandas
- Aggregating across multiple related HS codes (summing `090111` + `090112` per year/pair)

---

## 2. Data Processing (Python / Pandas)

### Reshaping and aggregating
- `groupby` aggregations across multiple dimensions (year × exporter × importer)
- Computing **derived metrics**: net trade position (`exports - imports`), country-level totals from bilateral data
- Unit conversions: thousands USD → millions USD, tonnes → thousand tonnes

### Data dictionary & documentation
- Writing column-level documentation including units, source, and value ranges
- Including sample data (top flows, percentile distributions) in documentation

### Exploratory Data Analysis
- `ydata-profiling` (formerly pandas-profiling) for automated HTML reports
- `sweetviz` for visual EDA comparison reports
- `matplotlib` / `seaborn` for custom charts
- `geopandas` for geographic choropleth maps in Python
- **HHI (Herfindahl–Hirschman Index)** for measuring market concentration in trade flows

### Jupyter notebooks
- Structuring notebooks with clear section headers and cell-level comments
- Commenting out pip installs with `#!pip3 install` so they're runnable but not auto-executed

---

## 3. Data Serialization for the Web

### JSON preparation for inline embedding
- Serializing per-year trade data as a compact JSON structure with short key names (`ei`, `ii`, `v`, `q`, `n`, `e`, `i`, `net`) to minimize file size
- Storing two arrays per year: `flows` (top 40, always drawn) and `bigFlows` (all >$100M, used for hover overlay)
- Embedding data inline as a JS constant (`const TRADE = {...}`) to avoid `fetch()` failures with `file://` protocol

### File size management
- Using `json.dumps(data, separators=(',',':'))` to strip whitespace from JSON
- Balancing coverage (more flows) against file size (~530 KB final HTML)

---

## 4. D3.js — Data Visualization

### Geographic projections
- `d3.geoNaturalEarth1()` — choosing a projection appropriate for a world trade map (good area representation, familiar aesthetic)
- `d3.geoPath()` to convert GeoJSON features to SVG path strings
- `d3.geoCentroid()` to compute country center points for arc origins/destinations

### TopoJSON
- Loading `world-atlas` countries-110m.json from CDN
- Converting TopoJSON to GeoJSON with `topojson.feature()`
- Understanding the numeric country ID system (ISO 3166-1 numeric) and mapping to ISO3 codes

### Choropleth maps
- Binding data to SVG paths by country identifier
- Updating fill colors on data change without full re-render
- Handling countries with no data (separate fill color)

### Color scales
- `d3.interpolate(colorA, colorB)(t)` for smooth gradients between two colors
- **Linear vs. log scale for `t`**: understanding when a linear scale washes out outlier-dominated data, and how to apply a log transform to spread the middle range
- Designing diverging color schemes (green / blue split on a neutral anchor)

### SVG arc drawing
- Quadratic Bézier curves (`M x1,y1 Q cx,cy x2,y2`) for curved flow arrows
- Computing control point offset perpendicular to chord: `bend = dist * 0.22`, offset by the perpendicular vector
- Placing arrowhead tip at `t=0.88` along the curve instead of the endpoint to avoid overlap with destination country

### SVG markers (arrowheads)
- Defining `<marker>` elements in the SVG `<defs>` block
- Creating multiple size variants (`arr-sm`, `arr-md`, `arr-lg`) tied to arc stroke-width
- Creating a highlighted variant (`arr-hi`) for hover state
- `refX` / `refY` positioning to align arrowhead tip with path endpoint

### Transitions and animation
- `selection.transition().duration(ms).ease(d3.easeCubicOut)` for smooth entrance animations
- Chaining transitions (fade in opacity + position simultaneously)
- Avoiding transition conflicts: removing old arcs before drawing new ones on year change

### Scales
- `d3.scaleSqrt()` for arc stroke-width (sqrt scale compresses very large flows visually, giving more visible range to smaller ones)
- `.clamp(true)` to prevent extrapolation outside domain

---

## 5. Interactive Features (JavaScript)

### Event handling without triggering re-renders
- **Critical pattern**: storing state attributes (`data-base-op`, `data-base-marker`) on DOM elements at draw time so hover can restore them without calling a full render
- Distinguishing between **render-time state** (arc widths, base colors) and **interaction state** (hover highlights) and keeping them fully separate

### Hover interactions
- `mouseover` / `mouseleave` on SVG paths for country and arc tooltips
- Dimming unrelated elements with a CSS `.dimmed` class + `pointer-events: none`
- Appending temporary DOM elements (`.flow-arc-hover`) on hover and removing them on leave with `selection.remove()`
- Using D3 transitions on dynamically appended elements (fade-in for supplemental arcs)

### Tooltip positioning
- Dynamically positioning a tooltip div relative to `event.pageX` / `event.pageY`
- Clamping tooltip to viewport edges to prevent overflow

### Year stepper / playback
- `setInterval` / `clearInterval` for auto-play
- Range input (`<input type="range">`) synchronized with programmatic updates
- Keyboard event listeners (`keydown`) for `ArrowLeft`, `ArrowRight`, `Space`, `Escape`
- Multiple playback speeds via interval duration

---

## 6. Static Site Architecture

### Self-contained single-file HTML
- Embedding all CSS, JS, and data in a single `index.html` — no build tools, no module bundler, no server required (beyond an HTTP server for CDN fetching)
- CDN-loading libraries (D3, TopoJSON) with `<script src="">` tags
- Understanding when `file://` protocol breaks `fetch()` and how to work around it (inline embedding vs. serving over HTTP)

### Deployment
- Deploying a static folder to S3-backed hosting
- Iterative deploy: same `project_path` updates the existing URL in place

---

## 7. Visual QA (Playwright)

### Persistent browser automation
- Launching a headless Chromium instance with `playwright`
- `page.waitForFunction()` to block until D3 has rendered (checking `.flow-arc` count > 0) rather than relying on a fixed timeout
- Taking screenshots at specific viewport sizes for visual review

### Testing interactive states
- Programmatically finding SVG elements by `__data__.id` (D3-bound data) via `page.evaluate()`
- Simulating `page.mouse.move()` to trigger hover states
- Asserting DOM attribute values (`stroke`, `stroke-opacity`) after hover and after leave to verify correct state management
- Verifying arc counts stay stable across hover (no redraw)

---

## 8. Color Design Principles

- **Diverging schemes** for data with a meaningful midpoint (zero net trade): one hue for positive, another for negative
- **Log scale vs. linear**: when one outlier dominates the range (Brazil's $11B vs. median $50M), a linear scale makes 90% of countries look the same. Log scale distributes perceptual difference across the actual distribution.
- **Anchored neutral**: using a fixed band (±$1M) rather than zero to avoid noisy sign flipping for near-balanced countries
- **Contrast on dark backgrounds**: light-grey start color (`#cdd1d9`) gives visible contrast even for low-intensity values, where pure white would blend into the background
- **Consistent accent**: keeping arc color (amber `#d4a144`) tonally distinct from both choropleth hues (green/blue) so flows read independently of the country fills

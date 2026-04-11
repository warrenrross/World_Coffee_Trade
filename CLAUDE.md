# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A self-contained, single-file interactive world map (`index.html`) visualizing bilateral coffee trade flows (1995–2024) using D3.js v7 and TopoJSON. No build step, no bundler, no framework.

## Running Locally

The map fetches world geometry from a CDN, so it must be served over HTTP — opening as `file://` will break the geometry fetch.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

### Single-file design (`index.html`, ~773 lines)

All CSS, JavaScript, and trade data are embedded inline. The only external dependencies are CDN-loaded:
- D3 v7 (`cdn.jsdelivr.net/npm/d3@7`)
- TopoJSON client (`cdn.jsdelivr.net/npm/topojson-client@3`)
- World geometry (`cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`) — fetched at runtime

### Data files

| File | Description |
|---|---|
| `data.json` | Earlier version — top-40 flows per year, per-country net positions |
| `data_v2.json` | Current version — adds `bigFlows` array (all bilateral flows >$100M per year) for hover supplemental arcs |

Both files are embedded inside `index.html` as `const TRADE = {...}` to avoid `fetch()` issues with `file://` protocol. When regenerating data, the JSON must be re-embedded manually.

**JSON schema** (per year key, e.g. `"2024"`):
- `flows` — top 40 bilateral flows: `{ei, en, ii, in, v, q}` (exporter ISO3, exporter name, importer ISO3, importer name, value in millions USD, quantity in thousand tonnes)
- `bigFlows` — all flows >$100M: same schema
- Per-country totals: `{iso3: {exp, imp, net}}` (millions USD)

### SVG layer order (z-stacking)

1. `gGraticule` — sphere fill + graticule lines (background)
2. `gCountries` — choropleth country paths (bound to TopoJSON features)
3. `gFlows` — arc paths with arrowhead markers

### ID mapping

World-atlas TopoJSON uses numeric country IDs (ISO 3166-1 numeric, e.g. `076` = Brazil). BACI data uses ISO3 codes (`BRA`). A hardcoded `NUM_TO_ISO` lookup table inside `index.html` bridges them (~250 entries).

### Color scale

Choropleth uses a **log scale** for net trade position:
- Neutral band: ±$1M (shown as `#cdd1d9`)
- Exporters: `#cdd1d9` → `#2da44e` (green)
- Importers: `#cdd1d9` → `#3b82f6` (blue)
- Log formula: `t = log(absNet / NEUTRAL_BAND) / log(maxAbs / NEUTRAL_BAND)`

Linear scale was abandoned because Brazil's $11B net dominated it, making every other country appear near-white.

### Arc geometry

Each arc is a quadratic Bézier (`M x1,y1 Q cx,cy x2,y2`):
- Control point: perpendicular to the chord at 22% of chord length
- Arrow tip placed at `t=0.88` (not endpoint) to avoid arrowhead overlap with destination country fill
- Width: `d3.scaleSqrt()` on flow value; determines which marker (`arr-sm`/`arr-md`/`arr-lg`) is applied

### Hover — critical state management pattern

**Do not call `render()` from hover handlers.** Doing so redraws all 40 arcs with entrance animations on every mouse movement (flicker bug).

Instead:
- `render()` stores `data-base-op` and `data-base-marker` as data attributes on each arc at draw time
- `onCountryHover` / `onArcHover` mutate `stroke`, `stroke-opacity`, `marker-end` in-place on existing DOM elements
- `onCountryLeave` restores those attributes from the stored data attributes
- Supplemental `bigFlows` arcs are appended as `.flow-arc-hover` elements on hover and removed via `gFlows.selectAll('.flow-arc-hover').remove()` on leave

### Year playback

`setInterval`/`clearInterval` with three speed modes (800ms / 533ms / 267ms per year). `render()` is called on year change: updates choropleth fills, removes old arc elements, appends new arcs with entrance animation (opacity 0 → 1 + position).

## Key Constraints

- **No `fetch()` for trade data** — all data must be embedded inline as a JS constant
- **ISO numeric → ISO3 gap** — any new country added to the data needs an entry in `NUM_TO_ISO`
- **`bigFlows` threshold** — currently $100M; flows below this threshold will never appear as supplemental hover arcs regardless of rank
- **Top-40 limit** — only 40 arcs are drawn by default; this is a DOM performance choice, not a data limit

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

An interactive world map visualizing bilateral coffee trade flows (1995–2024) using D3.js v7 and TopoJSON. No build step, no bundler, no framework. Hosted on GitHub Pages at `warrenrross.github.io/World_Coffee_Trade`.

## Running Locally

The map fetches world geometry from a CDN, so it must be served over HTTP — opening as `file://` will fail the geometry fetch.

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## File Structure

| File | Role |
|---|---|
| `index.html` | HTML structure only — no embedded data or scripts |
| `styles.css` | All styles including responsive mobile rules |
| `app.js` | All D3/TopoJSON visualization logic |
| `data_v3.json` | Current trade data — top-40 flows + all >$100M flows per year, 1995–2024 |
| `memory.md` | Human-readable project history and decision log |
| `.claude/commands/wrap-up.md` | Custom `/wrap-up` slash command for session close-out |

The project was initially built as a monolithic `index.html` (CSS + JS + data all inline). It was later split into separate files to support GitHub Pages multi-file hosting. Trade data is now loaded via `fetch('data_v3.json')` rather than embedded inline. `data.json` and `data_v2.json` were deleted — both are strict subsets of v3; full history is in git.

## Architecture

### Boot sequence

```js
Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json'),
  fetch('data_v3.json')
]).then(([topoRes, tradeRes]) => { ... })
```

World geometry and trade data load in parallel. Rendering begins after both resolve.

### SVG + zoom

A `mapG` group wraps all map content. `d3.zoom()` is applied to the SVG and transforms `mapG` only — HTML overlays (`#panel`, `#tip`, `#legend`) are positioned outside the SVG and are unaffected by zoom/pan.

```js
const mapG = svg.append('g');
gGraticule = mapG.append('g');   // sphere fill + graticule lines
gCountries = mapG.append('g');   // choropleth country paths
gFlows     = mapG.append('g');   // arc paths with arrowhead markers
const zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', e => mapG.attr('transform', e.transform));
svg.call(zoom);
```

### Data schema (`data_v3.json`, per year key e.g. `"2024"`)

- `flows` — top 40 bilateral flows: `{ei, en, ii, in, v, q}` (exporter ISO3, exporter name, importer ISO3, importer name, value in millions USD, quantity in thousand tonnes)
- `bigFlows` — all bilateral flows >$100M: same schema (used for supplemental hover arcs)
- Per-country totals keyed by ISO3: `{n, e, i, net}` (country name, exports, imports, net — all millions USD)

### ID mapping

World-atlas TopoJSON uses numeric country IDs (ISO 3166-1 numeric, e.g. `076` = Brazil). BACI uses ISO3 codes (`BRA`). A hardcoded `NUM_TO_ISO` lookup table in `app.js` bridges them (~250 entries). Any new country in the data needs an entry there.

### Color scale

Choropleth uses a **log scale** for net trade position:
- Neutral band: ±$1M (shown as `#cdd1d9`)
- Exporters: `#cdd1d9` → `#2da44e` (green)
- Importers: `#cdd1d9` → `#3b82f6` (blue)
- Log formula: `t = log(absNet / NEUTRAL_BAND) / log(maxAbs / NEUTRAL_BAND)`

Linear scale was abandoned: Brazil's $11B net made every other country near-white.

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
- Supplemental `bigFlows` arcs are appended as `.flow-arc-hover` on hover; removed via `.selectAll('.flow-arc-hover').remove()` on leave

### Touch vs. mouse

```js
if (window.matchMedia('(hover: none)').matches) {
  // Touch: tap country to show tooltip; tap map background to dismiss
  countries.on('click', (event, d) => { event.stopPropagation(); onCountryHover(event, d); });
  svg.on('click', () => onCountryLeave());
} else {
  countries.on('mousemove', onCountryHover).on('mouseleave', onCountryLeave);
}
```

### Mobile layout (≤640px)

- `height:100dvh` on `#app` — dynamic viewport height adjusts as mobile browser chrome shows/hides
- `touch-action:none` on SVG — prevents browser intercepting pinch-zoom gestures before d3.zoom sees them
- Speed segment buttons hidden (`#speed-seg`, `#divv-speed`)
- Legend stays inside `#map-wrap` on all screen sizes — repositionable by drag (see Legend drag below)

### Year playback

`setInterval`/`clearInterval` with three speed modes (1200ms / 700ms / 400ms per year). `render()` is called on year change: updates choropleth fills, removes old arc elements, appends new arcs with entrance animation.

### Legend drag-to-corner

`#legend` is draggable to three positions: bottom-left (default), top-left, bottom-right. CSS classes `leg-tl` / `leg-br` define the non-default positions; bottom-left has no extra class.

- `cursor:grab` at rest → `cursor:grabbing` + shadow lift (`.leg-dragging`) while held
- `setPointerCapture` keeps tracking outside the element during fast drags
- Under 10px travel → snaps back to origin (accidental touch)
- Over 10px → **dot product** of drag vector against direction-to-each-corner determines winner; origin corner excluded from candidates
- Position saved to `localStorage` key `coffee-legend-pos`; restored instantly on load (before any transition fires)
- `pointercancel` always snaps back to origin

**Do not revert to nearest-release-position logic.** The dot product approach is scale-invariant — direction of drag determines the target regardless of screen size. The prior nearest-corner approach required per-orientation weight scalars to compensate for proportional distance differences.

### Fullscreen

`document.fullscreenEnabled` is `false` on all iOS browsers (WebKit restriction) — the fullscreen button hides itself on iOS. On Android Chrome and desktop it works normally via `document.documentElement.requestFullscreen()`.

## Key Constraints

- **ISO numeric → ISO3 gap** — new countries in the data need an entry in `NUM_TO_ISO`
- **`bigFlows` threshold** — currently $100M; flows below this never appear as supplemental hover arcs
- **Top-40 limit** — only 40 arcs drawn by default; a DOM performance choice, not a data limit
- **GitHub Pages** — static hosting only; no server-side processing, no `.htaccess` rewrites needed for this single-page app

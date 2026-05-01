# Code Complexity Assessment

Analysis of `app.js` (612 lines) for areas where complexity could be reduced.

---

## Completed Improvements

### Issue #3 — Oversized Functions ✅ RESOLVED

**`onCountryHover`** reduced from ~85 lines → **28 lines** (lines 358–385, 67% reduction):
- Tooltip build and country dimming only; supplemental bigFlows arc logic removed
- `dismissHint()` extracted as a standalone 6-line function directly above it

**`drawFlows` split** into three focused functions:
- `drawFlowsNormal(flows)` — 36 lines (lines 274–309): gold arcs, size/opacity scales, click-to-isolate
- `drawFlowsHighlighted(arcs)` — 37 lines (lines 312–348): white arcs, flat `arr-hi` marker, 0.92 opacity
- `arcGeom(src, tgt)` — 11 lines (lines 261–271): shared Bézier geometry, called by both draw functions

### Issue #4 — Duplicated Arc Logic ✅ RESOLVED

Bézier curve math (`bend`, `mx`, `my`, `ex`, `ey`) previously repeated 3+ times is now centralized in `arcGeom(src, tgt)`. Both draw functions delegate to it; no duplication remains.

---

## Outstanding Issues (Priority Order)

### 1. Magic Numbers Scattered Throughout

~25 un-extracted constants across `arcGeom`, both draw functions, `initMap`, and the color scale:

| Constant | Value | Location |
|---|---|---|
| `ARC_BEND` | `0.22` | `arcGeom` line 264 |
| `ARC_END_T` | `0.88` | `arcGeom` line 267 |
| `STROKE_MIN/MAX` | `0.5 / 5` | both draw functions |
| `OPACITY_MIN/MAX` | `0.12 / 0.72` | `drawFlowsNormal` |
| `OPACITY_HI` | `0.92` | `drawFlowsHighlighted` |
| `MARKER_LG/MD` | `3.5 / 1.8` | both draw functions |
| `ARC_DURATION` | `450` ms | both draw functions |
| `ARC_STAGGER` | `15` ms | both draw functions |
| `PROJ_SCALE` | `W / 7.2` | `initMap` + resize |
| `PROJ_TX` | `W / 2.1` | `initMap` + resize |
| `PROJ_TY` | `H / 1.95` | `initMap` + resize |
| `ZOOM_MIN/MAX` | `1 / 8` | `initMap` |
| `PANEL_FLOW_COUNT` | `30` | `render()` line 238 |

**Fix**: extract a top-level `CONFIG` object. Low risk — mechanical substitution only. Fixes both draw functions, `arcGeom`, `initMap`, and the resize handler in one pass. The projection tuning values (`7.2`, `2.1`, `1.95`) are the most opaque — they should be named constants with a comment.

### 2. `initMap` Too Large and Mixed-Concern (122 lines, lines 68–189)

This is now the largest function in the file. It handles at least 10 distinct concerns:

1. Reads container dimensions (`W`, `H`)
2. Sets SVG `viewBox`
3. Constructs projection + path generator
4. Creates the `mapG` group + three layer groups
5. Configures `d3.zoom`
6. Draws graticule sphere and grid lines
7. Declares and populates the 154-entry `NUM_TO_ISO` table
8. Assigns `isoFromNum = NUM_TO_ISO` alias
9. Pre-computes centroids via `pathGen.centroid`
10. Draws and event-binds country paths (touch vs. mouse branch)
11. Sets hint text and adds `.vis` class
12. Registers resize handler (which re-runs projection + centroids + render)

Suggested decomposition — all remain plain functions, no classes needed:

```
initProjection(W, H)     — steps 1–3
initLayers(mapG)         — steps 4–5 (graticule + zoom)
buildLookups(topo)       — steps 7–9 (NUM_TO_ISO, isoFromNum, centroidMap)
bindCountryHandlers(countries)  — step 10 (touch/mouse branch)
initHint()               — step 11
initResize(wrap, features, zoom)  — step 12
```

`initMap` becomes the coordinator that calls these in order. Each sub-function is independently readable and testable.

### 3. `NUM_TO_ISO` / `isoFromNum` Alias Confusion

The 154-entry lookup table is declared as `const NUM_TO_ISO` inside `initMap` (line 101), then immediately aliased to the module-level `let isoFromNum` (line 123). This creates two names for the same data:
- `NUM_TO_ISO` used at lines 129 and 182 (inside `initMap`, before scope exits)
- `isoFromNum` used at 5 call sites outside `initMap` (lines 207, 210, 215, 361, 367)

The alias exists only because the table was defined inside a function but needed module-level reach. Moving the table to module scope and renaming it `isoFromNum` directly eliminates both the alias and the name split — no logic change required.

### 4. State Variables Ungrouped

19 module-level `let` declarations in two implicit groups with no visual separation:

**Logic state** (9 vars, lines 2–6):
```js
let TRADE;
let years, yi, playing, playTimer, playSpeed;
let highlighted, pinnedCountry, topNFilter;
```

**Map geometry** (10 vars, lines 14–19):
```js
let gGraticule, gCountries, gFlows;
let projection, pathGen;
let W, H;
let centroidMap, isoFromNum, nameFromISO;
```

These are already physically separated by the DOM refs block, but the comments don't label them by concern. Adding explicit section comments (`// ── Logic state ──`, `// ── Map geometry ──`) costs nothing and makes the initialization order obvious. A class is not warranted for a static viz — grouping by comment is sufficient.

---

## Recommended Order of Attack

| # | Action | Risk | Impact |
|---|---|---|---|
| 1 | Extract `CONFIG` constants | Very low (mechanical) | Fixes all magic numbers in one pass; makes projection tuning readable |
| 2 | Split `initMap` into sub-functions | Low | Biggest function in file; each concern becomes independently readable |
| 3 | Move `NUM_TO_ISO` to module scope, rename to `isoFromNum` directly | Very low | Eliminates alias; one name for one thing |
| 4 | Add concern-group comments to state declarations | Trivial | Clarifies initialization intent at zero cost |

Items #1 and #3 can be done independently and in either order. Item #2 is cleaner after #1 (sub-functions reference `CONFIG` names, not literals). Item #4 is a one-minute edit anytime.

---

## Current State Summary

| Metric | Value |
|---|---|
| File size | 612 lines |
| Largest function | `initMap` — 122 lines, 10+ concerns |
| `onCountryHover` | 28 lines ✅ (was ~85) |
| `drawFlowsNormal` | 36 lines ✅ |
| `drawFlowsHighlighted` | 37 lines ✅ |
| `arcGeom` | 11 lines ✅ |
| Module-level `let` vars | 19 (9 logic + 10 map geometry) |
| `NUM_TO_ISO` entries | 154 |
| `isoFromNum` read call sites | 7 (2 via `NUM_TO_ISO` inside `initMap`, 5 via alias outside) |
| Un-extracted magic numbers | ~25 |

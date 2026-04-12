# Global Coffee Trade Flows

An interactive world map visualizing bilateral coffee bean trade flows between countries from 1995 to 2024. Step through each year to watch trade relationships evolve — which countries dominate exports, how import patterns shift across continents, and where the biggest individual flows run.

This repo is also intended as a demonstration of **agentic engineering** — building software collaboratively with an AI agent. Context files (`CLAUDE.md`, `memory.md`, `skill.md`) are left in the repo intentionally so that anyone can clone it, point their preferred AI coding agent at it, and have a fully-informed conversation about the project without manual onboarding. The agent already knows the data schema, architecture decisions, and key constraints.

---

## What It Shows

- **Choropleth map** — every country with coffee trade data is colored by net trade position:
  - **Green** = net exporter (darker = larger surplus)
  - **Blue** = net importer (darker = larger deficit)
  - **Dark** = no data for that year
- **Trade flow arcs** — the top 40 bilateral flows for each year, drawn as curved arrows. Arc width corresponds to trade value.
- **Hover detail** — hover any country to see its total exports, total imports, and net position. Arcs connected to that country highlight in white; any additional flows over $100 million that aren't in the top 40 are drawn as supplemental arcs.
- **Year stepper** — step through every year from 1995–2024 manually or let it play automatically.

---

## Data Sources

### BACI — Bilateral Trade (primary)
All flow data comes from the [CEPII BACI database](https://www.cepii.fr/CEPII/en/bdd_modele/bdd_modele_item.asp?id=37), a harmonized dataset of international trade flows derived from UN Comtrade mirror data.

- **Version**: HS92 v202601 (released January 2026)
- **Coverage**: 1995–2024, 229 exporters, 233 importers
- **HS codes**: 090111 (coffee, not roasted, not decaffeinated) + 090112 (coffee, not roasted, decaffeinated)
- **Units**: Value in thousands USD; quantity in metric tonnes
- **File**: `coffee_bilateral_trade_BACI.csv` (136,768 rows)

### FAOSTAT — Country-Level Totals (supplementary)
Aggregate import/export data from the [FAO Trade: Crops and Livestock Products](https://www.fao.org/faostat/en/#data/TCL) dataset.

- **Coverage**: 1961–2024, 279 countries/territories
- **Item**: Coffee, green (item code 656)
- **Units**: Tonnes and thousands USD
- **File**: `coffee_green_trade_FAOSTAT.csv` (53,892 rows)
- **Note**: FAOSTAT does not identify bilateral partners — it only gives country-level totals. It is not used in the map but provides the longer historical record back to 1961.

---

## Files

| File | Description |
|---|---|
| `index.html` | HTML structure — no embedded data or scripts |
| `styles.css` | All styles |
| `app.js` | All D3/TopoJSON visualization logic |
| `data_v2.json` | Processed trade data — top-40 flows + all >$100M flows per year, 1995–2024 |
| `data.json` | Earlier version of the trade data (retained for reference) |

---

## Opening Locally

The map loads CSS, JS, and trade data as separate files, so it must be served over HTTP — opening `index.html` directly as a `file://` URL will not work.

**Option 1 — Python (no install required)**
```bash
cd "Global Coffee Trade Flows"
python3 -m http.server 8000
```
Then open [http://localhost:8000](http://localhost:8000) in your browser. Stop with `Ctrl+C`.

**Option 2 — Node (no install required)**
```bash
cd "Global Coffee Trade Flows"
npx serve .
```
`npx` downloads `serve` on first run if needed. It prints the local URL when ready. Stop with `Ctrl+C`.

**Option 3 — VS Code**
Install the [Live Server extension](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer), right-click `index.html`, and choose *Open with Live Server*.

---

## Navigation

### Year Controls (bottom bar)

| Control | Action |
|---|---|
| **◀** | Previous year |
| **▶** | Next year |
| **⏵ Play / ⏸ Pause** | Auto-advance through all years |
| **1× / 1.5× / 3×** | Playback speed |
| **Slider** | Drag to jump to any year |
| `←` / `→` arrow keys | Step back / forward one year |
| `Space` | Play / Pause |
| `Escape` | Stop playback |

### Flow Filter (bottom right)

| Button | Shows |
|---|---|
| **All Flows** | All 40 top bilateral flows for the year |
| **Top 10** | Only the 10 largest flows |

### Hovering

- **Hover a country** — tooltip shows total exports, total imports, and net position. All arcs connected to that country glow white; unrelated arcs dim. Any flows over $100M not in the standard top-40 appear as additional arcs.
- **Hover an arc** — tooltip shows the exporter → importer pair, trade value, and volume in tonnes.
- **Move off** — everything restores instantly with no redraw.

---

## Color Scale

The choropleth uses a **log scale** anchored at ±$1M net trade. Countries within $1M of balanced trade show as neutral grey. Beyond that, the intensity ramps logarithmically so that mid-tier traders (e.g. Honduras at ~$500M net) still show a visible shade rather than being washed out by Brazil's $11B+ net position.

---

## Dependencies

No build step or package install required. The app loads three local files (`styles.css`, `app.js`, `data_v2.json`) and fetches two libraries from public CDNs:

- [D3.js v7](https://d3js.org/) — data visualization
- [TopoJSON](https://github.com/topojson/topojson) — geographic geometry
- [Natural Earth 110m countries](https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json) — world geometry

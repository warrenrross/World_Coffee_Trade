# Plan: Country Detail — Trade Flow List

## What the user asked for

When a country is clicked (pinned), the existing tooltip shows the country's stats (Exports, Imports, Net). Add a **hamburger menu icon** to that tooltip — the same three-line indicator used in the right-side panel. Clicking it opens a **dropdown list of all trade flows for that country**, formatted like the existing panel list. Advancing the year should keep the pin (already works). Clicking a flow in the dropdown isolates that arc (same behavior as clicking from the global panel).

---

## Current state — what exists

### The tooltip (`#tip`)
- Positioned absolute at `top:14px; left:14px` in `#map-wrap`
- `pointer-events: none` — completely non-interactive, intentional (hover pass-through)
- `innerHTML` set dynamically in `onCountryHover(event, d)` in `app.js`
- Shows: country name, Exports, Imports, Net trade position
- `max-width: 230px`, z-index 30

### The right-side panel (`#panel`)
- Has a `.panel-head` row: year label + hamburger `#panel-toggle` button
- Hamburger toggles `panel-collapsed` class → slides `.flow-list` to `max-height:0`
- `.flow-list` items: route name, bar chart, dollar value — each clickable to isolate arc
- Toggle wired in JS: `panel.classList.toggle('panel-collapsed')`

### The hover/pin system
- `onCountryHover(event, d)` — called on `mousemove` (hover) and from within `render()` when `pinnedCountry` is set
- `pinnedCountry === d` is true when the call is for the currently pinned country
- When pinned, `render()` gathers `connected` flows (top-40 filtered to country) + `extra` from `bigFlows` and passes them to `drawFlowsHighlighted()`

---

## Questions / alignment needed

### 1. Where does the dropdown live?

** The hamburger button needs to live inside the tooltip (`#tip`)**
The dropdown expands the tooltip downward. The hamburger sits in the tooltip header row next to the country name. The tooltip becomes interactive (`pointer-events: auto`) only when pinned.

The tooltip needs to have a its own header (country name + hamburger) and collapsible flow list.  

The botton needs to be the same style as the other side:
```css
<button id="panel-toggle" class="ctrl-btn"  title="Toggle flow list" aria-label="Toggle flow list">
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
  <rect x="1" y="2"  width="12" height="1.5" rx=".75" fill="currentColor"/>
  <rect x="1" y="6"  width="12" height="1.5" rx=".75" fill="currentColor"/>
  <rect x="1" y="10" width="12" height="1.5" rx=".75" fill="currentColor"/>
  </svg>
</button> 
```



**Previous implementation used Option A.** This plan document exists because to correct alignment.

---

### 2. What flows should appear in the list?

The list should be a list of trade flows filtered by the pinned country. If that country exists as a importer or exporter in a trade flow. The trade arcs that get highlighted when you pin a country are exactly the trade arcs that should show up on the list below the country detail. And this list should collapse/expand when you click the hamburger icon. 

---

### 3. Row format in the dropdown

The existing panel shows:
```
Brazil → Germany          [bar]  $412M
```
We will implement the existing pattern in the new list.


---

### 4. Clicking a flow item — what happens?

** Isolate the arc (clear pin, highlight single flow)**
Clicking a flow item in the dropdown: sets `highlighted = {ei, ii}`, clears `pinnedCountry`, calls `render()`. The arc isolates on the map; the country dropdown closes naturally since the country is unpinned.



---

### 5. Dropdown open/close state across year changes

When a year advances while the country is pinned (and dropdown is open), the arc data changes. Should the dropdown:

Stay open, reload with new year's flows (list updates in place), but don't implement anything to try to maintaining scroll position. Scroll position changing is acceptable behavior.

---

### 6. Mobile / touch behavior

On touch devices the pin already works via tap. The hamburger in the dropdown should also work on touch.

---

## Implementation sketch

### `index.html`
No changes required — tip HTML is set dynamically by JS.

### `styles.css` additions
Insert after line 68 (`#tip .tip-net-neg`):

```css
/* Pinned tip — interactive */
#tip.tip-pinned { pointer-events: auto; }

/* Header row: country name (left) + hamburger (right) */
.tip-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
.tip-head .tip-name { margin-bottom: 0; flex: 1; }

/* Hamburger button — matches #panel-toggle sizing/style */
.tip-menu-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; flex-shrink: 0;
  border: 1px solid var(--border); border-radius: 5px;
  background: transparent; color: var(--muted); cursor: pointer;
}
.tip-menu-btn:hover { background: rgba(255,255,255,.06); color: var(--text); }
.tip-menu-btn.active { color: var(--amber); border-color: var(--amber); }

/* Flows list — collapsed by default, expands on open */
.tip-flows {
  margin-top: 8px; border-top: 1px solid var(--border);
  max-height: 0; overflow: hidden; transition: max-height .25s ease;
}
.tip-flows.open { max-height: 220px; overflow-y: auto; }

/* Flow rows — reuse existing bar/value classes from panel */
.tip-flow-item {
  display: flex; flex-direction: column;
  padding: 5px 0; cursor: pointer;
}
.tip-flow-item:hover { background: rgba(212,161,68,.08); }
```

### `app.js` changes

#### 1. State — add after line 11 (`pinnedCountry`)
```js
let tipFlowsOpen = false;   // tracks whether country-tip flow list is expanded
```

#### 2. `onCountryHover` — replace inner body (lines 405–431)
Key changes:
- Detect `isPinned = (pinnedCountry === d)`
- **Jitter guard**: if `event !== null` (real mousemove, not a render()-triggered call) and `tip.classList.contains('tip-pinned')` → skip rebuild (prevents scroll-position loss on mouse movement over a pinned country). Year-change calls come in as `event === null` from `render()` line 385 and always rebuild.
- When pinned: render header with hamburger SVG (same SVG as `#panel-toggle`) + stats rows + `.tip-flows` div; set `tip-pinned` class; wire hamburger click to toggle `tipFlowsOpen` + toggle `.open` on `.tip-flows` + toggle `.active` on the button.
- Flows for the list: compute the same `connected + extra` arrays used by `render()` lines 270–277 — `yd.flows` filtered to the pinned ISO, plus `yd.bigFlows` extras. Render each as a `.tip-flow-item` with the same `.flow-route` / `.flow-bar-row` / `.bar-bg` / `.bar-fill` / `.flow-val` markup used by `updatePanel`. Wire each item's click to: `highlighted = {ei, ii}; pinnedCountry = null; render();`
- When not pinned: render as today (no hamburger, no `tip-pinned` class).

```js
function onCountryHover(event, d) {
  if (pinnedCountry && pinnedCountry !== d) return;
  dismissHint();

  const isPinned = pinnedCountry === d;

  // Skip HTML rebuild on mousemove jitter when tip is already showing pinned state
  if (event !== null && isPinned && tip.classList.contains('tip-pinned')) return;

  const iso = isoFromNum[+d.id];
  const year = years[yi];
  const yd = TRADE[year];
  if (!yd || !iso) return;

  gCountries.selectAll('.country')
    .classed('dimmed', dd => isoFromNum[+dd.id] !== iso);

  const c = yd.countries[iso];
  const name = (c && c.n) || nameFromISO[iso] || iso;

  if (!c) {
    tip.innerHTML = `<div class="tip-name">${name}</div><div style="color:var(--muted);font-size:11px">No data for ${year}</div>`;
    tip.style.display = 'block';
    return;
  }

  const netCls  = c.net >= 0 ? 'tip-net-pos' : 'tip-net-neg';
  const netSign = c.net >= 0 ? '+' : '';

  if (isPinned) {
    // Build connected flows (same logic as render() lines 270–277)
    const flows = topNFilter === 40 ? yd.flows : yd.flows.slice(0, topNFilter);
    const connected = flows.filter(f => f.ei === iso || f.ii === iso);
    const connectedSet = new Set(connected.map(f => f.ei + '|' + f.ii));
    const extra = (yd.bigFlows || []).filter(f =>
      (f.ei === iso || f.ii === iso) && !connectedSet.has(f.ei + '|' + f.ii)
    );
    const allFlows = [...connected, ...extra];
    const maxV = allFlows.length ? d3.max(allFlows, f => f.v) : 1;

    const hamburgerSVG = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="2"  width="12" height="1.5" rx=".75" fill="currentColor"/>
      <rect x="1" y="6"  width="12" height="1.5" rx=".75" fill="currentColor"/>
      <rect x="1" y="10" width="12" height="1.5" rx=".75" fill="currentColor"/>
    </svg>`;

    const flowRows = allFlows.map(f => `
      <li class="tip-flow-item" data-ei="${f.ei}" data-ii="${f.ii}">
        <div class="flow-route">${f.en} → ${f['in']}</div>
        <div class="flow-bar-row">
          <div class="bar-bg"><div class="bar-fill" style="width:${(f.v/maxV*100).toFixed(1)}%"></div></div>
          <span class="flow-val">$${fmtMShort(f.v)}</span>
        </div>
      </li>
    `).join('');

    tip.innerHTML = `
      <div class="tip-head">
        <div class="tip-name">${name}</div>
        <button class="tip-menu-btn ctrl-btn${tipFlowsOpen ? ' active' : ''}" title="Toggle flow list" aria-label="Toggle flow list">${hamburgerSVG}</button>
      </div>
      <div class="tip-row"><span class="tip-label">Exports</span><span class="tip-val" style="color:#d4a144">$${fmtM(c.e)}M</span></div>
      <div class="tip-row"><span class="tip-label">Imports</span><span class="tip-val" style="color:#58a6ff">$${fmtM(c.i)}M</span></div>
      <div class="tip-row"><span class="tip-label">Net</span><span class="tip-val ${netCls}">${netSign}$${fmtM(Math.abs(c.net))}M ${c.net>=0?'exporter':'importer'}</span></div>
      <ul class="tip-flows${tipFlowsOpen ? ' open' : ''}">${flowRows}</ul>
    `;

    // Wire hamburger toggle
    tip.querySelector('.tip-menu-btn').addEventListener('click', e => {
      e.stopPropagation();
      tipFlowsOpen = !tipFlowsOpen;
      tip.querySelector('.tip-menu-btn').classList.toggle('active', tipFlowsOpen);
      tip.querySelector('.tip-flows').classList.toggle('open', tipFlowsOpen);
    });

    // Wire flow item clicks
    tip.querySelectorAll('.tip-flow-item').forEach(el => {
      el.addEventListener('click', e => {
        e.stopPropagation();
        highlighted = { ei: el.dataset.ei, ii: el.dataset.ii };
        pinnedCountry = null;
        render();
      });
    });

    tip.classList.add('tip-pinned');
  } else {
    tip.classList.remove('tip-pinned');
    tip.innerHTML = `
      <div class="tip-name">${name}</div>
      <div class="tip-row"><span class="tip-label">Exports</span><span class="tip-val" style="color:#d4a144">$${fmtM(c.e)}M</span></div>
      <div class="tip-row"><span class="tip-label">Imports</span><span class="tip-val" style="color:#58a6ff">$${fmtM(c.i)}M</span></div>
      <div class="tip-row"><span class="tip-label">Net</span><span class="tip-val ${netCls}">${netSign}$${fmtM(Math.abs(c.net))}M ${c.net>=0?'exporter':'importer'}</span></div>
    `;
  }
  tip.style.display = 'block';
}
```

#### 3. `onCountryLeave` — add `tipFlowsOpen` reset (line 433)
```js
function onCountryLeave() {
  if (pinnedCountry) return;
  tipFlowsOpen = false;          // ← add this line
  gCountries.selectAll('.country').classed('dimmed', false);
  hideTip();
}
```

#### 4. `hideTip` — remove `tip-pinned` class (line 452)
```js
function hideTip() {
  tip.classList.remove('tip-pinned');
  tip.style.display = 'none';
}
```

### Year change behavior
`render()` calls `onCountryHover(null, pinnedCountry)` (line 385) when a country is pinned. `event === null` bypasses the jitter guard, so the tip HTML fully rebuilds with fresh year data. `tipFlowsOpen` is not reset, so if the list was open it stays open (scroll position will reset — acceptable per the decision above).

### Key files and confirmed line numbers
- `app.js` — Selection state block: lines 9–14 (add `tipFlowsOpen` after line 11)
- `app.js` — `onCountryHover`: line 405 (replace body)
- `app.js` — `onCountryLeave`: line 433 (add reset before `hideTip()`)
- `app.js` — `hideTip`: line 452 (add `classList.remove`)
- `styles.css` — insert after line 68 (`#tip .tip-net-neg`)

---



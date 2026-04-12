// ── State ──────────────────────────────────────────────────────────────────
let TRADE;
let years = [], yi = 0, playing = false, playTimer = null, playSpeed = 1200;
let highlighted = null;   // { ei, ii } or null
let topNFilter = 40;      // 40 = all, 10 = top10

// ── DOM refs ───────────────────────────────────────────────────────────────
const svg      = d3.select('#map-svg');
const tip      = document.getElementById('tip');
const mapWrap  = document.getElementById('map-wrap');

// ── Layers ─────────────────────────────────────────────────────────────────
let gGraticule, gCountries, gFlows;
let projection, pathGen;
let W, H;
let centroidMap = {};   // ISO3 → [px, py]
let isoFromNum  = {};   // numericId → ISO3
let nameFromISO = {};   // ISO3 → display name (from trade data)

// ── Color scales ───────────────────────────────────────────────────────────
// ±$1M = neutral grey. Beyond that, log-scale so small traders still get color.
// Log scale compresses Brazil's $11B dominance and spreads the middle range.
const NEUTRAL_BAND = 1; // $1M in millions
const NEUTRAL_COLOR = '#cdd1d9'; // light blue-grey
const netColorScale = (net, maxAbs) => {
  const absNet = Math.abs(net);
  if (absNet <= NEUTRAL_BAND) return NEUTRAL_COLOR;
  // Log-scale t: 0 = just above neutral, 1 = maxAbs
  const t = Math.min(
    Math.log(absNet / NEUTRAL_BAND) / Math.log(Math.max(maxAbs / NEUTRAL_BAND, 2)),
    1
  );
  if (net > 0) {
    return d3.interpolate(NEUTRAL_COLOR, '#2da44e')(t);
  } else {
    return d3.interpolate(NEUTRAL_COLOR, '#3b82f6')(t);
  }
};

// ── Boot ───────────────────────────────────────────────────────────────────
// Fetch world geometry and trade data in parallel, then initialize.
Promise.all([
  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json').then(r => r.json()),
  fetch('data_v3.json').then(r => r.json())
])
  .then(([topo, tradeData]) => {
    TRADE = tradeData;
    years = Object.keys(TRADE).map(Number).sort((a,b)=>a-b);
    yi = years.length - 1;

    // Build name map from trade data (use 2023 as source)
    const sample = TRADE[2023]?.countries || TRADE[years[years.length-1]].countries;
    Object.entries(sample).forEach(([iso, d]) => { nameFromISO[iso] = d.n; });

    const slider = document.getElementById('year-slider');
    slider.max = years.length - 1;
    slider.value = yi;

    initMap(topo);
    render();
    document.getElementById('loading').style.opacity = '0';
    setTimeout(() => document.getElementById('loading').style.display = 'none', 500);
  })
  .catch(e => { document.querySelector('.load-txt').textContent = 'Load error: ' + e.message; });

// ── Map init ───────────────────────────────────────────────────────────────
function initMap(topo) {
  const wrap = document.getElementById('map-wrap');
  W = wrap.clientWidth; H = wrap.clientHeight;
  svg.attr('viewBox', `0 0 ${W} ${H}`);

  projection = d3.geoNaturalEarth1()
    .scale(W / 7.2).translate([W / 2.1, H / 1.95]);
  pathGen = d3.geoPath().projection(projection);

  // Single container group for all map layers — zoom transform applies here only,
  // leaving HTML overlays (#panel, #tip, #legend) completely unaffected.
  const mapG  = svg.append('g');
  gGraticule  = mapG.append('g');
  gCountries  = mapG.append('g');
  gFlows      = mapG.append('g');

  // Pan + pinch-zoom on the map only
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on('zoom', event => mapG.attr('transform', event.transform));
  svg.call(zoom);

  // Graticule
  gGraticule.append('path')
    .datum({type:'Sphere'})
    .attr('d', pathGen)
    .attr('fill','#0d1117').attr('stroke','#21262d').attr('stroke-width',.6);
  gGraticule.append('path')
    .datum(d3.geoGraticule()())
    .attr('d', pathGen)
    .attr('fill','none').attr('stroke','rgba(255,255,255,.03)').attr('stroke-width',.5);

  // Build ISO lookup from world-atlas numeric ids using a comprehensive map
  const NUM_TO_ISO = {
    4:'AFG',8:'ALB',12:'DZA',24:'AGO',32:'ARG',36:'AUS',40:'AUT',50:'BGD',56:'BEL',
    64:'BTN',68:'BOL',76:'BRA',100:'BGR',104:'MMR',116:'KHM',120:'CMR',124:'CAN',
    140:'CAF',144:'LKA',152:'CHL',156:'CHN',158:'TWN',170:'COL',178:'COG',180:'COD',
    188:'CRI',191:'HRV',192:'CUB',196:'CYP',203:'CZE',204:'BEN',208:'DNK',214:'DOM',
    218:'ECU',231:'ETH',233:'EST',246:'FIN',250:'FRA',266:'GAB',276:'DEU',288:'GHA',
    300:'GRC',320:'GTM',324:'GIN',332:'HTI',340:'HND',344:'HKG',348:'HUN',356:'IND',
    360:'IDN',364:'IRN',368:'IRQ',372:'IRL',376:'ISR',380:'ITA',388:'JAM',392:'JPN',
    398:'KAZ',400:'JOR',404:'KEN',408:'PRK',410:'KOR',418:'LAO',422:'LBN',428:'LVA',
    430:'LBR',434:'LBY',440:'LTU',442:'LUX',454:'MWI',458:'MYS',466:'MLI',484:'MEX',
    496:'MNG',499:'MNE',504:'MAR',508:'MOZ',516:'NAM',524:'NPL',528:'NLD',554:'NZL',
    558:'NIC',566:'NGA',578:'NOR',586:'PAK',591:'PAN',598:'PNG',600:'PRY',604:'PER',
    608:'PHL',616:'POL',620:'PRT',626:'TLS',630:'PRI',634:'QAT',642:'ROU',643:'RUS',
    646:'RWA',682:'SAU',686:'SEN',694:'SLE',702:'SGP',703:'SVK',705:'SVN',706:'SOM',
    710:'ZAF',716:'ZWE',724:'ESP',729:'SDN',752:'SWE',756:'CHE',762:'TJK',764:'THA',
    768:'TGO',780:'TTO',788:'TUN',792:'TUR',800:'UGA',804:'UKR',784:'ARE',826:'GBK',
    834:'TZA',840:'USA',854:'BFA',858:'URY',860:'UZB',862:'VEN',887:'YEM',894:'ZMB',
    704:'VNM',807:'MKD',688:'SRB',70:'BIH',72:'BWA',108:'BDI',232:'ERI',270:'GMB',
    384:'CIV',450:'MDG',462:'MDV',480:'MUS',540:'NCL',562:'NER',630:'PRI',132:'CPV',
    174:'COM',175:'MYT',260:'ATF',748:'SWZ',426:'LSO',226:'GNQ',238:'FLK',
    826:'GBR',818:'EGY',
  };
  isoFromNum = NUM_TO_ISO;

  const features = topojson.feature(topo, topo.objects.countries).features;

  // Pre-compute centroids
  features.forEach(f => {
    const iso = NUM_TO_ISO[+f.id];
    if (iso) {
      const c = pathGen.centroid(f);
      if (c && !isNaN(c[0]) && !isNaN(c[1])) centroidMap[iso] = c;
    }
  });

  // Draw countries
  const countries = gCountries.selectAll('.country')
    .data(features)
    .join('path')
    .attr('class','country')
    .attr('d', pathGen)
    .attr('fill','#1c2128');

  // Touch devices: tap country to show detail, tap SVG background to dismiss.
  // Desktop: mousemove/mouseleave for hover detail.
  // d3.zoom distinguishes a tap (no movement) from a drag, so 'click' fires correctly on mobile.
  if (window.matchMedia('(hover: none)').matches) {
    countries.on('click', (event, d) => {
      event.stopPropagation();
      onCountryHover(event, d);
    });
    svg.on('click', () => onCountryLeave());
  } else {
    countries
      .on('mousemove', onCountryHover)
      .on('mouseleave', onCountryLeave);
  }

  // Resize handler — reset zoom so the new viewBox matches the reset state
  window.addEventListener('resize', () => {
    W = wrap.clientWidth; H = wrap.clientHeight;
    svg.attr('viewBox', `0 0 ${W} ${H}`);
    projection.scale(W/7.2).translate([W/2.1, H/1.95]);
    svg.call(zoom.transform, d3.zoomIdentity);
    // Recompute centroids
    features.forEach(f => {
      const iso = NUM_TO_ISO[+f.id];
      if (iso) { const c = pathGen.centroid(f); if(c&&!isNaN(c[0])) centroidMap[iso]=c; }
    });
    gCountries.selectAll('.country').attr('d', pathGen);
    gGraticule.selectAll('path').attr('d', pathGen);
    render();
  });
}

// ── Main render ────────────────────────────────────────────────────────────
function render() {
  const year = years[yi];
  const yd = TRADE[year];
  if (!yd) return;

  document.getElementById('panel-year').textContent = year;
  document.getElementById('yr-lbl').textContent = year;
  document.getElementById('year-slider').value = yi;

  // Compute maxAbs net for this year (for color scale)
  const netVals = Object.values(yd.countries).map(d => Math.abs(d.net));
  const maxAbs = d3.max(netVals) || 1;

  // Choropleth — net exporter green, net importer blue
  // Only update fill colors; never touch .dimmed here (that's hover-only)
  gCountries.selectAll('.country')
    .attr('fill', d => {
      const iso = isoFromNum[+d.id];
      const c = iso && yd.countries[iso];
      if (!c) return '#2d333b';  // no data: dark grey
      return netColorScale(c.net, maxAbs);
    })
    .classed('dimmed', false);  // always clear dimming on a real render

  // Legend gradient
  drawLegendGradient(maxAbs);

  // Flows
  const flows = topNFilter === 40 ? yd.flows : yd.flows.slice(0, topNFilter);
  drawFlows(flows);

  // Panel
  updatePanel(yd.flows.slice(0, 30));
}

// ── Legend gradient ────────────────────────────────────────────────────────
function drawLegendGradient(maxAbs) {
  const canvas = document.getElementById('leg-net-canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  // Left = max importer, center = neutral, right = max exporter
  for (let i = 0; i < w; i++) {
    const t = i / (w - 1);              // 0 (left/blue) → 1 (right/green)
    const net = (t - 0.5) * 2 * maxAbs; // -maxAbs … +maxAbs
    ctx.fillStyle = netColorScale(net, maxAbs);
    ctx.fillRect(i, 0, 1, 7);
  }
  const fmt = v => v >= 1000 ? (v/1000).toFixed(1)+'B' : v.toFixed(0)+'M';
  document.getElementById('leg-net-min').textContent = `-$${fmt(maxAbs)}`;
  document.getElementById('leg-net-max').textContent = `+$${fmt(maxAbs)}`;
}

// ── Flow arcs ──────────────────────────────────────────────────────────────
function drawFlows(flows) {
  gFlows.selectAll('*').remove();

  const maxV = d3.max(flows, d => d.v) || 1;
  const wScale   = d3.scaleSqrt().domain([0, maxV]).range([0.5, 5]).clamp(true);
  const opScale  = d3.scaleLinear().domain([0, maxV]).range([0.12, 0.72]).clamp(true);

  flows.forEach((d, i) => {
    const src = centroidMap[d.ei];
    const tgt = centroidMap[d.ii];
    if (!src || !tgt) return;

    const isHi = highlighted && d.ei === highlighted.ei && d.ii === highlighted.ii;
    const sw   = wScale(d.v);
    const op   = highlighted ? (isHi ? 0.92 : 0.06) : opScale(d.v);

    // Bend arc away from straight line
    const dx = tgt[0] - src[0], dy = tgt[1] - src[1];
    const dist = Math.sqrt(dx*dx + dy*dy);
    const bend = dist * 0.22;
    const mx = (src[0]+tgt[0])/2 - dy * bend / (dist||1);
    const my = (src[1]+tgt[1])/2 + dx * bend / (dist||1);

    // Shorten endpoint slightly so arrow doesn't overdraw the country
    const t = 0.88;
    const ex = (1-t)*(1-t)*src[0] + 2*(1-t)*t*mx + t*t*tgt[0];
    const ey = (1-t)*(1-t)*src[1] + 2*(1-t)*t*my + t*t*tgt[1];
    const arcD = `M ${src[0]},${src[1]} Q ${mx},${my} ${ex},${ey}`;

    // Choose marker size
    const marker = sw > 3.5 ? 'arr-lg' : sw > 1.8 ? 'arr-md' : 'arr-sm';

    const path = gFlows.append('path')
      .attr('class','flow-arc')
      .attr('d', arcD)
      .attr('stroke', isHi ? '#ffffff' : '#d4a144')
      .attr('stroke-width', sw)
      .attr('stroke-opacity', 0)
      .attr('marker-end', `url(#${isHi ? 'arr-hi' : marker})`)
      // Store base values so onCountryLeave can restore without a redraw
      .attr('data-base-op', op)
      .attr('data-base-marker', `url(#${isHi ? 'arr-hi' : marker})`)
      .datum(d);

    path.transition()
      .delay(i * 15).duration(450).ease(d3.easeCubicOut)
      .attr('stroke-opacity', op);

    // Hover
    path.on('mousemove', (event) => {
      showFlowTip(event, d);
    }).on('mouseleave', () => {
      hideTip();
    }).on('click', () => {
      highlighted = (highlighted && highlighted.ei===d.ei && highlighted.ii===d.ii)
        ? null : { ei: d.ei, ii: d.ii };
      render();
    });
  });
}

// ── Country hover — tooltip + arc highlight + bigFlow overlay ────────────────
// bigFlows: all flows >$100M for this country, drawn as supplemental arcs
// Regular top-40 arcs are updated in-place (no redraw).
// Supplemental arcs (.flow-arc-hover) are appended and removed on leave.
function onCountryHover(event, d) {
  const iso = isoFromNum[+d.id];
  const year = years[yi];
  const yd = TRADE[year];
  if (!yd || !iso) return;

  // Dim all countries except hovered one
  gCountries.selectAll('.country')
    .classed('dimmed', dd => isoFromNum[+dd.id] !== iso);

  // Set of exporter+importer pairs already drawn in top-40
  const drawnPairs = new Set();
  gFlows.selectAll('.flow-arc').each(function(fd) {
    drawnPairs.add(fd.ei + '|' + fd.ii);
  });

  // Dim all existing top-40 arcs; highlight ones connected to this country
  gFlows.selectAll('.flow-arc').each(function(fd) {
    const connected = fd.ei === iso || fd.ii === iso;
    const el = d3.select(this);
    el.attr('stroke', connected ? '#ffffff' : '#d4a144')
      .attr('stroke-opacity', connected ? 0.92 : 0.05)
      .attr('marker-end', connected
        ? 'url(#arr-hi)'
        : `url(#${+el.attr('stroke-width') > 3.5 ? 'arr-lg' : +el.attr('stroke-width') > 1.8 ? 'arr-md' : 'arr-sm'})`
      );
  });

  // Draw supplemental arcs for bigFlows not already in top-40
  const bigFlows = (yd.bigFlows || []).filter(f =>
    (f.ei === iso || f.ii === iso) && !drawnPairs.has(f.ei + '|' + f.ii)
  );

  const maxV = d3.max(yd.flows, f => f.v) || 1;
  const wScale = d3.scaleSqrt().domain([0, maxV]).range([0.5, 5]).clamp(true);

  bigFlows.forEach(f => {
    const src = centroidMap[f.ei];
    const tgt = centroidMap[f.ii];
    if (!src || !tgt) return;
    const sw = wScale(f.v);
    const dx = tgt[0]-src[0], dy = tgt[1]-src[1];
    const dist = Math.sqrt(dx*dx+dy*dy);
    const bend = dist * 0.22;
    const mx = (src[0]+tgt[0])/2 - dy*bend/(dist||1);
    const my = (src[1]+tgt[1])/2 + dx*bend/(dist||1);
    const t = 0.88;
    const ex = (1-t)*(1-t)*src[0] + 2*(1-t)*t*mx + t*t*tgt[0];
    const ey = (1-t)*(1-t)*src[1] + 2*(1-t)*t*my + t*t*tgt[1];
    const arcD = `M ${src[0]},${src[1]} Q ${mx},${my} ${ex},${ey}`;
    gFlows.append('path')
      .attr('class','flow-arc-hover')
      .attr('d', arcD)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', sw)
      .attr('stroke-opacity', 0)
      .attr('fill', 'none')
      .attr('marker-end', 'url(#arr-hi)')
      .attr('pointer-events', 'none')
      .datum(f)
      .transition().duration(250).ease(d3.easeCubicOut)
      .attr('stroke-opacity', 0.88);
  });

  const c = yd.countries[iso];
  const name = (c && c.n) || nameFromISO[iso] || iso;

  if (c) {
    const netCls = c.net >= 0 ? 'tip-net-pos' : 'tip-net-neg';
    const netSign = c.net >= 0 ? '+' : '';
    tip.innerHTML = `
      <div class="tip-name">${name}</div>
      <div class="tip-row"><span class="tip-label">Exports</span><span class="tip-val" style="color:#d4a144">$${fmtM(c.e)}M</span></div>
      <div class="tip-row"><span class="tip-label">Imports</span><span class="tip-val" style="color:#58a6ff">$${fmtM(c.i)}M</span></div>
      <div class="tip-row"><span class="tip-label">Net</span><span class="tip-val ${netCls}">${netSign}$${fmtM(Math.abs(c.net))}M ${c.net>=0?'exporter':'importer'}</span></div>
    `;
  } else {
    tip.innerHTML = `<div class="tip-name">${name}</div><div style="color:var(--muted);font-size:11px">No data for ${year}</div>`;
  }

  tip.style.display = 'block';
}

function onCountryLeave() {
  // Remove dimming
  gCountries.selectAll('.country').classed('dimmed', false);

  // Remove supplemental hover arcs
  gFlows.selectAll('.flow-arc-hover').remove();

  // Restore top-40 arcs from stored base attributes
  gFlows.selectAll('.flow-arc').each(function(fd) {
    const el = d3.select(this);
    el.attr('stroke', highlighted && fd.ei===highlighted.ei && fd.ii===highlighted.ii ? '#ffffff' : '#d4a144')
      .attr('stroke-opacity', el.attr('data-base-op'))
      .attr('marker-end', el.attr('data-base-marker'));
  });

  hideTip();
}

// ── Flow tooltip ───────────────────────────────────────────────────────────
function showFlowTip(event, d) {
  const uv = (d.q && d.q > 0) ? fmtM(d.v * 1000 / d.q) : null;
  tip.innerHTML = `
    <div class="tip-name">${d.en} → ${d['in']}</div>
    <div class="tip-row"><span class="tip-label">Value</span><span class="tip-val" style="color:#d4a144">$${fmtM(d.v)}M</span></div>
    ${d.q ? `<div class="tip-row"><span class="tip-label">Volume</span><span class="tip-val">${fmtM(d.q)}k t</span></div>` : ''}
    ${uv ? `<div class="tip-row"><span class="tip-label">Unit price</span><span class="tip-val">$${fmtM(uv)}/t</span></div>` : ''}
    <div style="font-size:10px;color:var(--muted);margin-top:4px">Click to isolate this flow</div>
  `;
  tip.style.display = 'block';
}

function hideTip() { tip.style.display = 'none'; }

// ── Panel ──────────────────────────────────────────────────────────────────
function updatePanel(flows) {
  const list = document.getElementById('flow-list');
  const maxV = flows.length ? flows[0].v : 1;
  list.innerHTML = flows.map((f, i) => `
    <li class="flow-item ${highlighted && highlighted.ei===f.ei && highlighted.ii===f.ii ? 'active' : ''}"
        data-i="${i}">
      <div class="flow-route">${f.en} → ${f['in']}</div>
      <div class="flow-bar-row">
        <div class="bar-bg"><div class="bar-fill" style="width:${(f.v/maxV*100).toFixed(1)}%"></div></div>
        <span class="flow-val">$${fmtMShort(f.v)}</span>
      </div>
    </li>
  `).join('');

  list.querySelectorAll('.flow-item').forEach((el, i) => {
    el.addEventListener('click', () => {
      const f = flows[i];
      highlighted = (highlighted && highlighted.ei===f.ei && highlighted.ii===f.ii)
        ? null : { ei: f.ei, ii: f.ii };
      render();
    });
  });
}

// ── Formatting ────────────────────────────────────────────────────────────
function fmtM(v) {
  if (v == null) return '—';
  if (v >= 1000) return (v/1000).toFixed(2) + 'B';
  if (v >= 100)  return v.toFixed(0);
  return v.toFixed(1);
}
function fmtMShort(v) {
  if (v >= 1000) return (v/1000).toFixed(1) + 'B';
  return v.toFixed(0) + 'M';
}

// ── Controls ───────────────────────────────────────────────────────────────
document.getElementById('btn-prev').addEventListener('click', () => { stop(); yi=Math.max(0,yi-1); render(); });
document.getElementById('btn-next').addEventListener('click', () => { stop(); yi=Math.min(years.length-1,yi+1); render(); });
document.getElementById('year-slider').addEventListener('input', e => { stop(); yi=+e.target.value; render(); });
document.getElementById('btn-play').addEventListener('click', toggle);

function toggle() { playing ? stop() : start(); }
function start() {
  playing = true;
  document.getElementById('ico-play').style.display = 'none';
  document.getElementById('ico-pause').style.display = '';
  if (yi >= years.length-1) yi = 0;
  playTimer = setInterval(() => { yi++; if(yi>=years.length) yi=0; render(); }, playSpeed);
}
function stop() {
  playing = false;
  document.getElementById('ico-play').style.display = '';
  document.getElementById('ico-pause').style.display = 'none';
  clearInterval(playTimer);
}

document.querySelectorAll('[data-spd]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-spd]').forEach(b => b.classList.remove('on-amber'));
    btn.classList.add('on-amber');
    playSpeed = +btn.dataset.spd;
    if (playing) { stop(); start(); }
  });
});

document.getElementById('flow-all').addEventListener('click', () => {
  topNFilter = 40;
  document.getElementById('flow-all').classList.add('on-amber');
  document.getElementById('flow-top10').classList.remove('on-amber');
  render();
});
document.getElementById('flow-top10').addEventListener('click', () => {
  topNFilter = 10;
  document.getElementById('flow-top10').classList.add('on-amber');
  document.getElementById('flow-all').classList.remove('on-amber');
  render();
});

// ── Panel toggle ───────────────────────────────────────────────────────────
// Panel always starts open. [≡] in panel header manually collapses/expands the list.
const panel = document.getElementById('panel');
document.getElementById('panel-toggle').addEventListener('click', () => {
  panel.classList.toggle('panel-collapsed');
});

// ── Fullscreen toggle ──────────────────────────────────────────────────────
const btnFs = document.getElementById('btn-fullscreen');
if (!document.fullscreenEnabled) {
  btnFs.style.display = 'none';
} else {
  btnFs.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const full = !!document.fullscreenElement;
    btnFs.querySelector('.ico-expand').style.display  = full ? 'none' : '';
    btnFs.querySelector('.ico-collapse').style.display = full ? '' : 'none';
  });
}

document.addEventListener('keydown', e => {
  if (e.key==='ArrowLeft')  { stop(); yi=Math.max(0,yi-1); render(); }
  if (e.key==='ArrowRight') { stop(); yi=Math.min(years.length-1,yi+1); render(); }
  if (e.key===' ')          { e.preventDefault(); toggle(); }
  if (e.key==='Escape')     { highlighted=null; gCountries.selectAll('.country').classed('dimmed',false); hideTip(); render(); }
});

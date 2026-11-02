// Trends tab, chart drawing (inline SVG, nothing to load) and CSV export. Charts plot valueStd, so a lab's change of units doesn't bend the line.
// Markers have different units, so a group view is small multiples: one chart per marker, never a second axis.
import { state, currentProfile, reportsForCurrent } from './state.js';
import { esc, emptyState, fmtDate, downloadFile, showToast } from './ui.js';
import { catalogue, toStd, MARKER_GROUPS } from './markers.js';
import { rangeText } from './reports.js';

// ---------- data ----------

// reports -> time-ordered numeric points of one marker. Text results and values that can't be converted stay out.
export function markerSeries(reports, code, custom = {}) {
  const points = [];
  for (const report of reports) {
    for (const r of report.results || []) {
      if (r.marker !== code || typeof r.valueStd !== 'number') continue;
      points.push({
        date: report.date, value: r.valueStd, flag: r.flag, reportId: report.id,
        refLow: r.refLow == null ? null : toStd(r.refLow, r.unit, code, custom),
        refHigh: r.refHigh == null ? null : toStd(r.refHigh, r.unit, code, custom),
      });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

// The newest printed range, in standard units. Labs differ a little; the band shows the current one.
export function latestBand(points) {
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].refLow != null || points[i].refHigh != null) return { low: points[i].refLow, high: points[i].refHigh };
  }
  return null;
}

// One row per year: that year's last value, the change from the year before.
export function yearRows(points) {
  const byYear = new Map();
  for (const p of points) byYear.set(p.date.slice(0, 4), p);
  let prev = null;
  return [...byYear.entries()].map(([year, p]) => {
    const row = { year, date: p.date, value: p.value, flag: p.flag, change: prev === null ? null : Number((p.value - prev).toFixed(4)) };
    prev = p.value;
    return row;
  });
}

// Markers with at least one numeric value, most results first.
export function chartableMarkers(reports, custom = {}) {
  const counts = new Map();
  for (const report of reports) {
    for (const r of report.results || []) {
      if (r.marker && typeof r.valueStd === 'number') counts.set(r.marker, (counts.get(r.marker) || 0) + 1);
    }
  }
  const cat = catalogue(custom);
  return [...counts.entries()].filter(([code]) => cat[code]).sort((a, b) => b[1] - a[1]).map(([code]) => code);
}

// A cell starting with = + - @ runs as a formula in a spreadsheet, and this text came from a PDF.
function csvCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function resultsCsv(reports, custom = {}) {
  const cat = catalogue(custom);
  const header = ['date', 'provider', 'type', 'fasting', 'marker', 'name_as_printed', 'value', 'unit', 'ref_low', 'ref_high', 'ref_text', 'flag', 'value_std', 'unit_std'];
  const rows = [header.join(',')];
  const ordered = [...reports].sort((a, b) => a.date.localeCompare(b.date));
  for (const rep of ordered) {
    for (const r of rep.results || []) {
      rows.push([rep.date, rep.provider, rep.type, rep.fasting ? 'yes' : 'no', r.marker && cat[r.marker] ? cat[r.marker].name : '', r.nameAsPrinted,
        r.value, r.unit, r.refLow, r.refHigh, r.refText, r.flag, r.valueStd, r.unitStd].map(csvCell).join(','));
    }
  }
  return `${rows.join('\r\n')}\r\n`;
}

// ---------- charts ----------

const fmt = n => String(Number(n.toFixed(Math.abs(n) >= 100 ? 0 : 2)));
const dayNumber = iso => Date.parse(`${iso}T00:00:00Z`) / 86400000;

function niceTicks(min, max, count = 4) {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || 10 * mag;
  const ticks = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-6; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

function scales(points, band, w, h, pad) {
  const vals = points.map(p => p.value);
  if (band && band.low != null) vals.push(band.low);
  if (band && band.high != null) vals.push(band.high);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const margin = (hi - lo) * 0.12 || Math.abs(hi) * 0.1 || 1;
  lo -= margin;
  hi += margin;
  if (Math.min(...vals) >= 0) lo = Math.max(0, lo);
  const days = points.map(p => dayNumber(p.date));
  const d0 = Math.min(...days);
  const d1 = Math.max(...days);
  const x = iso => (d1 === d0 ? (pad.l + w - pad.r) / 2 : pad.l + (dayNumber(iso) - d0) / (d1 - d0) * (w - pad.l - pad.r));
  const y = v => pad.t + (hi - v) / (hi - lo || 1) * (h - pad.t - pad.b);
  return { x, y, lo, hi };
}

function bandRect(band, sc, w, h, pad) {
  if (!band || (band.low == null && band.high == null)) return '';
  const top = band.high == null ? pad.t : sc.y(band.high);
  const bottom = band.low == null ? h - pad.b : sc.y(band.low);
  return `<rect class="c-band" x="${pad.l}" y="${top.toFixed(1)}" width="${w - pad.l - pad.r}" height="${Math.max(0, bottom - top).toFixed(1)}"/>`;
}

const pathOf = (points, sc) => points.map((p, i) => `${i ? 'L' : 'M'}${sc.x(p.date).toFixed(1)} ${sc.y(p.value).toFixed(1)}`).join(' ');

// The last few points, no axes: shape and range only.
export function sparklineSvg(points, band, w = 120, h = 36) {
  if (!points.length) return '';
  const pad = { l: 5, r: 5, t: 5, b: 5 };
  const sc = scales(points, band, w, h, pad);
  const last = points[points.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
    ${bandRect(band, sc, w, h, pad)}
    ${points.length > 1 ? `<path class="c-line" d="${pathOf(points, sc)}"/>` : ''}
    <circle class="c-dot" cx="${sc.x(last.date).toFixed(1)}" cy="${sc.y(last.value).toFixed(1)}" r="4"/></svg>`;
}

const CHART_PAD = { l: 44, r: 26, t: 18, b: 26 };

// Out-of-range points carry their letter, so the state isn't told by color alone.
export function lineChartSvg(points, band, label, w, h = 220) {
  const pad = CHART_PAD;
  const sc = scales(points, band, w, h, pad);
  const grid = niceTicks(sc.lo, sc.hi).map(t => `<line class="c-grid" x1="${pad.l}" x2="${w - pad.r}" y1="${sc.y(t).toFixed(1)}" y2="${sc.y(t).toFixed(1)}"/>
      <text class="c-tick" x="${pad.l - 6}" y="${(sc.y(t) + 4).toFixed(1)}" text-anchor="end">${fmt(t)}</text>`).join('');
  const seen = new Set();
  const room = Math.max(1, Math.floor((w - pad.l - pad.r) / 70));
  const step = Math.ceil(points.length / room);
  const dates = points.filter((p, i) => {
    const show = (i % step === 0 || i === points.length - 1) && !seen.has(p.date);
    if (show) seen.add(p.date);
    return show;
  }).map(p => `<text class="c-tick" x="${sc.x(p.date).toFixed(1)}" y="${h - 8}" text-anchor="middle">${esc(fmtShort(p.date))}</text>`).join('');
  const dots = points.map(p => {
    const out = p.flag === 'H' || p.flag === 'L';
    const cx = sc.x(p.date).toFixed(1);
    const cy = sc.y(p.value).toFixed(1);
    return `<circle class="c-dot ${out ? `c-dot-${p.flag}` : ''}" cx="${cx}" cy="${cy}" r="4.5"/>${
      out ? `<text class="c-flag" x="${cx}" y="${(sc.y(p.value) - 9).toFixed(1)}" text-anchor="middle">${esc(p.flag)}</text>` : ''}`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(label)}">
    ${bandRect(band, sc, w, h, pad)}${grid}${dates}
    <line class="c-cross" data-cross x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}" visibility="hidden"/>
    ${points.length > 1 ? `<path class="c-line" d="${pathOf(points, sc)}"/>` : ''}${dots}</svg>`;
}

function fmtShort(iso) {
  const [y, m] = iso.split('-');
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]} ${y.slice(2)}`;
}

// Draws at the box's real width (text stays readable on a phone), and adds the crosshair + tooltip.
function mountChart(box, points, band, name, unit) {
  const draw = () => {
    const width = Math.max(260, box.clientWidth);
    const tip = '<div class="chart-tip" data-tip hidden></div>';
    box.innerHTML = lineChartSvg(points, band, `${name} over time`, width) + tip;
    const sc = scales(points, band, width, 220, CHART_PAD);
    const cross = box.querySelector('[data-cross]');
    const tipEl = box.querySelector('[data-tip]');
    const show = e => {
      const rect = box.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const near = points.reduce((best, p) => (Math.abs(sc.x(p.date) - px) < Math.abs(sc.x(best.date) - px) ? p : best));
      const nx = sc.x(near.date);
      cross.setAttribute('x1', nx);
      cross.setAttribute('x2', nx);
      cross.setAttribute('visibility', 'visible');
      tipEl.hidden = false;
      tipEl.innerHTML = `<strong>${esc(fmt(near.value))} ${esc(unit)}</strong>${near.flag === 'H' ? ' High' : near.flag === 'L' ? ' Low' : ''}<br><span class="muted">${esc(fmtDate(near.date))}</span>`;
      const left = Math.min(Math.max(0, nx - tipEl.offsetWidth / 2), width - tipEl.offsetWidth);
      tipEl.style.left = `${left}px`;
    };
    const hide = () => { cross.setAttribute('visibility', 'hidden'); tipEl.hidden = true; };
    box.onpointermove = show;
    box.onpointerdown = show;
    box.onpointerleave = hide;
  };
  draw();
  let last = box.clientWidth;
  new ResizeObserver(() => {
    if (box.clientWidth !== last && box.clientWidth > 0) { last = box.clientWidth; draw(); }
  }).observe(box);
}

// ---------- screen ----------

function chartCard(code, reports) {
  const custom = state.vault.markers;
  const m = catalogue(custom)[code];
  const points = markerSeries(reports, code, custom);
  const rows = yearRows(points);
  return { points, band: latestBand(points), html: `<div class="card">
    <h3>${esc(m.name)} <span class="muted">${esc(m.unitStd)}</span></h3>
    <div class="chart-box" data-chart="${esc(code)}"></div>
    ${points.length < 2 ? '<p class="muted">One result so far. The line appears with the second.</p>' : ''}
    <div class="table-wrap mt"><table class="results"><thead><tr><th>Year</th><th>Value</th><th>Flag</th><th>Change</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td title="${esc(fmtDate(r.date))}">${esc(r.year)}</td><td>${esc(fmt(r.value))}</td>
        <td>${r.flag ? `<span class="badge flag-${esc(r.flag)}">${esc(r.flag)}</span>` : ''}</td>
        <td class="muted">${r.change === null ? '' : `${r.change > 0 ? '+' : ''}${esc(fmt(r.change))}`}</td></tr>`).join('')}
    </tbody></table></div></div>` };
}

export function renderTrends(el, args = []) {
  const reports = reportsForCurrent();
  const custom = state.vault.markers;
  const cat = catalogue(custom);
  const codes = chartableMarkers(reports, custom);
  if (!codes.length) {
    el.innerHTML = `<h2>Trends</h2>${emptyState('Nothing to chart yet', 'Trends appear once a report has numeric results.',
      '<a class="btn btn-primary" href="#add">Add a report</a>')}`;
    return;
  }
  const pick = decodeURIComponent(args[0] || '') || codes[0];
  const inGroup = g => codes.filter(c => cat[c].group === g);
  const chosen = pick.startsWith('group:') ? inGroup(pick.slice(6)) : codes.filter(c => c === pick);
  const shown = chosen.length ? chosen : [codes[0]];
  const options = MARKER_GROUPS.filter(g => inGroup(g).length).map(g => `<optgroup label="${esc(g)}">
      ${inGroup(g).length > 1 ? `<option value="group:${esc(g)}" ${pick === `group:${g}` ? 'selected' : ''}>All ${esc(g)}</option>` : ''}
      ${inGroup(g).map(c => `<option value="${esc(c)}" ${pick === c ? 'selected' : ''}>${esc(cat[c].name)}</option>`).join('')}</optgroup>`).join('');
  const cards = shown.map(c => ({ code: c, ...chartCard(c, reports) }));
  el.innerHTML = `<div class="view-head"><h2>Trends</h2><button type="button" class="btn" data-csv>Export CSV</button></div>
    <div class="field"><label for="trendPick">Marker or group</label><select id="trendPick">${options}</select></div>
    <div class="chart-grid">${cards.map(c => c.html).join('')}</div>
    <p class="muted"><span class="legend-band"></span> Shaded: the normal range on the newest report that printed one.</p>`;
  el.querySelector('#trendPick').onchange = e => { location.hash = `#trends/${encodeURIComponent(e.target.value)}`; };
  el.querySelector('[data-csv]').onclick = () => exportCsv();
  for (const c of cards) {
    mountChart(el.querySelector(`[data-chart="${c.code}"]`), c.points, c.band, cat[c.code].name, cat[c.code].unitStd);
  }
}

// A CSV is readable by anyone who gets the file, so it happens only when asked for, and says so.
export async function exportCsv() {
  const p = currentProfile();
  const reports = reportsForCurrent();
  if (!p || !reports.length) { showToast('No results to export for this person.'); return; }
  const name = `health-results-${p.displayName.replace(/[^A-Za-z0-9]+/g, '_').slice(0, 30) || 'person'}.csv`;
  await downloadFile(new TextEncoder().encode(resultsCsv(reports, state.vault.markers)), name, 'text/csv');
  showToast('Exported. This file is not encrypted, so keep it safe.', 4000);
}

// For Overview: flagged results of the latest report, each with its last four points.
export function flaggedCards(reports, custom = {}) {
  if (!reports.length) return [];
  const cat = catalogue(custom);
  return (reports[0].results || []).filter(r => r.flag === 'H' || r.flag === 'L').map(r => {
    const points = r.marker ? markerSeries(reports, r.marker, custom).slice(-4) : [];
    return {
      name: r.marker && cat[r.marker] ? cat[r.marker].name : r.nameAsPrinted,
      code: r.marker, value: r.value, unit: r.unit, flag: r.flag, range: rangeText(r), points, band: latestBand(points),
    };
  });
}

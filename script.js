/* ==========================================================================
   Pulse — Customer Churn Prediction Engine
   Loads customer data, computes portfolio vitals, renders charts and the
   sortable/filterable accounts table.
   ========================================================================== */

const state = {
  customers: [],
  filtered: [],
  band: 'all',
  query: '',
  sortKey: 'churn_risk_score',
  sortDir: 'desc',
  openId: null,
};

const FEATURE_IMPORTANCE = [
  { label: 'Contract type', weight: 0.24 },
  { label: 'Feature adoption', weight: 0.19 },
  { label: 'Logins / month', weight: 0.16 },
  { label: 'Support calls (90d)', weight: 0.14 },
  { label: 'NPS score', weight: 0.13 },
  { label: 'Tenure', weight: 0.09 },
  { label: 'Late payments', weight: 0.05 },
];

function riskBand(score) {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'elevated';
  return 'stable';
}

function bandColor(band) {
  return { stable: '#57e2a0', elevated: '#f2b84b', critical: '#ff6a5c' }[band];
}

async function loadData() {
  const res = await fetch('data/customers.json');
  if (!res.ok) throw new Error('Failed to load customer data');
  return res.json();
}

/* ---------- Hero: ECG trace + portfolio gauge ---------- */

function drawHeroEcg(avgScore) {
  const band = riskBand(avgScore);
  const color = bandColor(band);
  const path = document.getElementById('ecg-path');

  // Build a heartbeat waveform; the higher the risk, the more irregular
  // and flattened the trace becomes.
  const segments = [];
  let x = 0;
  const width = 700, mid = 32;
  const jitter = band === 'critical' ? 4 : band === 'elevated' ? 8 : 14;
  segments.push(`M0,${mid}`);
  while (x < width) {
    const step = 58 + Math.random() * 20;
    const spike = band === 'critical' ? Math.random() < 0.3 : true;
    if (spike) {
      segments.push(`L${x + step * 0.4},${mid}`);
      segments.push(`L${x + step * 0.48},${mid - jitter * 0.6}`);
      segments.push(`L${x + step * 0.54},${mid + jitter * 2.2}`);
      segments.push(`L${x + step * 0.62},${mid - jitter * 2.6}`);
      segments.push(`L${x + step * 0.7},${mid + jitter * 0.4}`);
      segments.push(`L${x + step},${mid}`);
    } else {
      segments.push(`L${x + step},${mid}`);
    }
    x += step;
  }
  path.setAttribute('d', segments.join(' '));
  path.setAttribute('stroke', color);
  document.querySelector('.ecg-track path').style.filter =
    `drop-shadow(0 0 6px ${color}88)`;
}

function drawGauge(avgScore) {
  const arc = document.getElementById('gauge-arc');
  const number = document.getElementById('gauge-number');
  const footnote = document.getElementById('gauge-footnote');
  const circumference = 502;
  const pct = Math.max(0, Math.min(100, avgScore)) / 100;
  const offset = circumference - circumference * pct;
  const band = riskBand(avgScore);
  const color = bandColor(band);

  arc.style.transition = 'stroke-dashoffset 1s ease, stroke 0.4s ease';
  requestAnimationFrame(() => {
    arc.setAttribute('stroke-dashoffset', offset);
    arc.setAttribute('stroke', color);
  });
  number.textContent = Math.round(avgScore);
  number.style.color = color;

  const copy = {
    stable: 'Portfolio is steady. Most accounts are in a healthy rhythm.',
    elevated: 'Watch closely — a meaningful share of accounts is drifting toward risk.',
    critical: 'Act now — a large share of the portfolio is trending toward churn.',
  };
  footnote.textContent = copy[band];
}

/* ---------- KPI cards ---------- */

function renderKpis(customers) {
  const total = customers.length;
  const critical = customers.filter(c => riskBand(c.churn_risk_score) === 'critical').length;
  const avgScore = customers.reduce((s, c) => s + c.churn_risk_score, 0) / total;
  const retained = customers.filter(c => !c.churned_historically).length;
  const retentionRate = (retained / total) * 100;
  const avgNps = customers.reduce((s, c) => s + c.nps_score, 0) / total;

  const cards = [
    { label: 'Portfolio risk score', value: Math.round(avgScore), unit: '/ 100', accent: bandColor(riskBand(avgScore)),
      delta: `${critical} account${critical === 1 ? '' : 's'} in the critical band` },
    { label: 'At-risk accounts', value: critical, unit: `of ${total}`, accent: '#ff6a5c',
      delta: `${((critical / total) * 100).toFixed(0)}% of the portfolio` },
    { label: 'Retention rate', value: retentionRate.toFixed(1) + '%', unit: '', accent: '#57e2a0',
      delta: 'based on historical churn labels' },
    { label: 'Average NPS', value: Math.round(avgNps), unit: 'pts', accent: '#f2b84b',
      delta: avgNps >= 0 ? 'net positive sentiment' : 'net negative sentiment' },
  ];

  const grid = document.getElementById('kpi-grid');
  grid.innerHTML = cards.map(c => `
    <div class="kpi" style="--kpi-accent:${c.accent}">
      <div class="label">${c.label}</div>
      <div class="value">${c.value}<span style="font-size:0.9rem;color:var(--text-muted);margin-left:6px;">${c.unit}</span></div>
      <div class="delta">${c.delta}</div>
    </div>
  `).join('');
}

/* ---------- Charts ---------- */

function renderTrendChart(customers) {
  const months = ['Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul'];
  // Mock trailing 12-month churn rate, trending down since Pulse went live (~month 6)
  const base = 6.8;
  const data = months.map((_, i) => {
    const decay = i >= 6 ? (i - 6) * 0.55 : 0;
    const noise = (Math.random() - 0.5) * 0.6;
    return Math.max(1.2, +(base - decay + noise).toFixed(1));
  });

  new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: months,
      datasets: [{
        label: 'Churn rate (%)',
        data,
        borderColor: '#57e2a0',
        backgroundColor: 'rgba(87,226,160,0.12)',
        pointBackgroundColor: '#57e2a0',
        pointRadius: 3,
        tension: 0.35,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#1b2620' }, ticks: { color: '#7f9389', font: { family: 'IBM Plex Mono', size: 10 } } },
        y: { grid: { color: '#1b2620' }, ticks: { color: '#7f9389', font: { family: 'IBM Plex Mono', size: 10 } } },
      },
    },
  });
}

function renderImportanceChart() {
  new Chart(document.getElementById('importanceChart'), {
    type: 'bar',
    data: {
      labels: FEATURE_IMPORTANCE.map(f => f.label),
      datasets: [{
        data: FEATURE_IMPORTANCE.map(f => f.weight),
        backgroundColor: FEATURE_IMPORTANCE.map((_, i) =>
          i === 0 ? '#ff6a5c' : i < 3 ? '#f2b84b' : '#57e2a0'),
        borderRadius: 3,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#1b2620' }, ticks: { color: '#7f9389', font: { family: 'IBM Plex Mono', size: 10 } } },
        y: { grid: { display: false }, ticks: { color: '#e9f2ec', font: { family: 'Inter', size: 11 } } },
      },
    },
  });
}

/* ---------- Sparkline rhythm (per row) ---------- */

function sparkline(band) {
  const w = 90, h = 28, mid = h / 2;
  const jitter = band === 'critical' ? 3 : band === 'elevated' ? 7 : 11;
  let d = `M0,${mid}`;
  let x = 0;
  while (x < w) {
    const step = 16 + Math.random() * 6;
    if (Math.random() < (band === 'critical' ? 0.25 : 0.7)) {
      d += ` L${x + step * 0.4},${mid} L${x + step * 0.5},${mid - jitter} L${x + step * 0.6},${mid + jitter * 1.6} L${x + step},${mid}`;
    } else {
      d += ` L${x + step},${mid}`;
    }
    x += step;
  }
  const color = bandColor(band);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/* ---------- Risk factor flags (rule-based, for the detail drawer) ---------- */

function riskFlags(c) {
  const flags = [];
  if (c.contract_type === 'Month-to-month') flags.push({ text: 'No annual commitment', level: 'warn' });
  if (c.support_calls_90d >= 4) flags.push({ text: `${c.support_calls_90d} support calls in 90 days`, level: 'danger' });
  else if (c.support_calls_90d >= 2) flags.push({ text: `${c.support_calls_90d} support calls in 90 days`, level: 'warn' });
  if (c.nps_score < -20) flags.push({ text: `NPS of ${c.nps_score} — detractor`, level: 'danger' });
  else if (c.nps_score < 20) flags.push({ text: `NPS of ${c.nps_score} — passive`, level: 'warn' });
  if (c.late_payments_12mo >= 2) flags.push({ text: `${c.late_payments_12mo} late payments this year`, level: 'danger' });
  else if (c.late_payments_12mo === 1) flags.push({ text: '1 late payment this year', level: 'warn' });
  if (c.logins_per_month <= 4) flags.push({ text: `Only ${c.logins_per_month} logins/month`, level: 'danger' });
  else if (c.logins_per_month <= 10) flags.push({ text: `${c.logins_per_month} logins/month`, level: 'warn' });
  if (c.feature_adoption < 0.35) flags.push({ text: `${Math.round(c.feature_adoption * 100)}% feature adoption`, level: 'danger' });
  if (flags.length === 0) flags.push({ text: 'No significant risk factors detected', level: 'ok' });
  return flags;
}

/* ---------- Table ---------- */

function applyFilters() {
  const q = state.query.trim().toLowerCase();
  state.filtered = state.customers.filter(c => {
    const matchesBand = state.band === 'all' || riskBand(c.churn_risk_score) === state.band;
    const matchesQuery = !q || c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
    return matchesBand && matchesQuery;
  });
  const dir = state.sortDir === 'asc' ? 1 : -1;
  state.filtered.sort((a, b) => {
    const av = a[state.sortKey], bv = b[state.sortKey];
    if (typeof av === 'string') return av.localeCompare(bv) * dir;
    return (av - bv) * dir;
  });
}

function renderTable() {
  applyFilters();
  const body = document.getElementById('tableBody');
  const count = document.getElementById('resultsCount');
  count.textContent = `Showing ${state.filtered.length} of ${state.customers.length} accounts`;

  if (state.filtered.length === 0) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty-state">No accounts match this search or filter.</div></td></tr>`;
    return;
  }

  body.innerHTML = state.filtered.map(c => {
    const band = riskBand(c.churn_risk_score);
    const rows = [`
      <tr data-id="${c.id}">
        <td class="name-cell">${c.name}<div class="id-cell">${c.id}</div></td>
        <td>${c.plan}</td>
        <td class="mono">${c.tenure_months} mo</td>
        <td class="mono">${c.support_calls_90d}</td>
        <td><span class="risk-badge ${band}">${c.churn_risk_score} · ${band}</span></td>
        <td class="spark-cell">${sparkline(band)}</td>
      </tr>
    `];
    if (state.openId === c.id) {
      const flags = riskFlags(c);
      rows.push(`
        <tr class="detail-row">
          <td colspan="6">
            <div class="detail-inner">
              <div class="detail-field"><div class="k">Plan</div><div class="v">${c.plan} · $${c.monthly_charges.toFixed(2)}/mo</div></div>
              <div class="detail-field"><div class="k">Contract</div><div class="v">${c.contract_type}</div></div>
              <div class="detail-field"><div class="k">Tenure</div><div class="v">${c.tenure_months} months</div></div>
              <div class="detail-field"><div class="k">NPS score</div><div class="v">${c.nps_score}</div></div>
              <div class="detail-field"><div class="k">Logins / month</div><div class="v">${c.logins_per_month}</div></div>
              <div class="detail-field"><div class="k">Feature adoption</div><div class="v">${Math.round(c.feature_adoption * 100)}%</div></div>
              <div class="flags">
                <div class="k">Risk factors</div>
                <div class="flag-list">
                  ${flags.map(f => `<span class="flag ${f.level}">${f.text}</span>`).join('')}
                </div>
              </div>
            </div>
          </td>
        </tr>
      `);
    }
    return rows.join('');
  }).join('');

  body.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.getAttribute('data-id');
      state.openId = state.openId === id ? null : id;
      renderTable();
    });
  });
}

/* ---------- Wire up controls ---------- */

function wireControls() {
  document.getElementById('searchInput').addEventListener('input', e => {
    state.query = e.target.value;
    renderTable();
  });

  document.getElementById('filterGroup').addEventListener('click', e => {
    const chip = e.target.closest('.filter-chip');
    if (!chip) return;
    state.band = chip.getAttribute('data-band');
    document.querySelectorAll('.filter-chip').forEach(c => c.setAttribute('data-active', 'false'));
    chip.setAttribute('data-active', 'true');
    renderTable();
  });

  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.getAttribute('data-sort');
      if (state.sortKey === key) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortKey = key;
        state.sortDir = 'desc';
      }
      renderTable();
    });
  });
}

/* ---------- Init ---------- */

async function init() {
  try {
    state.customers = await loadData();
  } catch (err) {
    console.error(err);
    document.getElementById('tableBody').innerHTML =
      `<tr><td colspan="6"><div class="empty-state">Couldn't load customer data. Check that data/customers.json is reachable.</div></td></tr>`;
    return;
  }

  const avgScore = state.customers.reduce((s, c) => s + c.churn_risk_score, 0) / state.customers.length;

  drawHeroEcg(avgScore);
  drawGauge(avgScore);
  renderKpis(state.customers);
  renderTrendChart(state.customers);
  renderImportanceChart();
  wireControls();
  renderTable();
}

document.addEventListener('DOMContentLoaded', init);

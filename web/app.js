'use strict';
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('local-token') || '';
if (token) sessionStorage.setItem('local-token', token);
history.replaceState(null, '', '/');
const $ = id => document.getElementById(id);
let selected = new Set(), current = null, result = null, activeView = 'overview', pending = false, running = false;
const titles = {overview:'Overview', files:'Files & checks', commitments:'Commitments', teams:'Team allocation', evidence:'Evidence & history'};
function navigate(view) {
  activeView = view; $('view-title').textContent = titles[view];
  document.querySelectorAll('[data-panels]').forEach(panel => { panel.hidden = !panel.dataset.panels.split(' ').includes(view); });
  document.querySelectorAll('[data-view]').forEach(item => { if (item.dataset.view === view) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current'); });
  document.querySelectorAll('#results details').forEach(item => { item.hidden = view === 'commitments' && !['commitments','sp_assessment','ri_assessment','allocation'].includes(item.dataset.key); });
}
document.querySelectorAll('[data-view]').forEach(item => { item.onclick = () => navigate(item.dataset.view); });
$('start-check').onclick = () => navigate('files');
const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(cents/100) : 'Unavailable';
function renderSummary(data) {
  $('metric-charges').textContent = money(data?.validation?.window_total_cents);
  $('metric-findings').textContent = Array.isArray(data?.findings) ? data.findings.length : '—';
  $('metric-rows').textContent = Number.isSafeInteger(data?.validation?.unique_rows) ? data.validation.unique_rows.toLocaleString() : '—';
  $('metric-commitments').textContent = Array.isArray(data?.commitments) ? data.commitments.length : '—';
  const container = $('finding-table'); container.replaceChildren();
  if (!Array.isArray(data?.findings)) return;
  if (!data.findings.length) { const note = document.createElement('p'); note.textContent = 'No findings in this result. Review coverage and assessment limitations below.'; container.append(note); return; }
  const wrap = document.createElement('div'); wrap.className = 'table-scroll'; const table = document.createElement('table');
  const head = document.createElement('thead'), row = document.createElement('tr');
  for (const title of ['Finding','Severity','Service','Account','Impact']) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; row.append(th); } head.append(row); table.append(head);
  const body = document.createElement('tbody');
  for (const finding of data.findings) { const row = document.createElement('tr'); for (const value of [finding.title, finding.severity, finding.service, finding.account, money(finding.impact_cents)]) { const cell = document.createElement('td'); cell.textContent = value || 'Unavailable'; row.append(cell); } body.append(row); }
  table.append(body); wrap.append(table); container.append(wrap);
}
function status(text) { $('status').textContent = text; }
async function request(path, options = {}) {
  const response = await fetch(path, {...options, headers: {'X-Local-Token': token, ...(options.headers || {})}});
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Local request failed');
  return body;
}
function button(label, action) { const node = document.createElement('button'); node.textContent = label; node.onclick = () => action().catch(error => status(error.message)); return node; }
function section(label, value) {
  const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
  summary.textContent = label; pre.textContent = JSON.stringify(value, null, 2); details.append(summary, pre); return details;
}
async function refresh() {
  const state = await request('/api/state');
  $('files').replaceChildren();
  for (const file of state.files) {
    const row = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(file.id);
    input.onchange = () => input.checked ? selected.add(file.id) : selected.delete(file.id);
    row.className = 'file'; row.append(input, document.createTextNode(` ${file.name} — ${file.bytes.toLocaleString()} bytes — ${file.role}`)); $('files').append(row);
  }
  $('runs').replaceChildren();
  for (const run of state.runs) $('runs').append(button(`${run.created} · ${run.status}`, async () => { current = run.id; await show(); }));
  if (!current && state.runs.length) { current = state.runs[0].id; await show(); }
  if (!$('mappings').dataset.loaded) { $('mappings').value = Object.entries(state.mappings).map(([account, team]) => `${account} | ${team}`).join('\n'); $('mappings').dataset.loaded = 'yes'; }
}
async function show() {
  if (!current || pending) return;
  const requested = current; pending = true; let value;
  try { value = await request(`/api/runs/${requested}`); } finally { pending = false; }
  if (requested !== current) { await show(); return; }
  running = value.status === 'running'; status(`Analysis ${value.status}`);
  if (value.status === 'running') return;
  result = value.result; $('results').replaceChildren();
  $('download').disabled = !result; $('print').disabled = !result;
  renderSummary(result);
  if (!result) return;
  for (const [label, key] of [['Validation and previous consumption','validation'],['Findings and evidence','findings'],['Commitment analysis','commitments'],['Savings Plan assessment','sp_assessment'],['Reserved instance assessment','ri_assessment'],['Allocation','allocation'],['Team attribution','teams'],['Monthly observations','monthly_growth'],['Comparable usage estimates','comparisons'],['Input identities','input_files'],['Limitations','caveats']]) if (key in result) { const item = section(label, result[key]); item.dataset.key = key; $('results').append(item); }
  if (result.error) $('results').append(section('Analysis could not complete', result));
  navigate(activeView);
}
$('upload').onchange = async event => {
  try {
    for (const file of event.target.files) { status(`Uploading ${file.name}`); const uploaded = await request(`/api/upload?name=${encodeURIComponent(file.name)}&role=${$('role').value}`, {method:'PUT', body:file}); selected.add(uploaded.id); }
    await refresh(); status('Files saved locally. Select periods and run the checks.');
  } catch (error) { status(error.message); } finally { event.target.value = ''; }
};
$('analyse').onclick = async () => {
  try {
    const body = {files:[...selected], expectations:$('expectations').value.split('\n').filter(line => line.trim()).map(line => { const [service, amount, ...notes] = line.split('|').map(item => item.trim()); return {service, amount, note:notes.join(' | ')}; })};
    for (const key of ['start','end','baseline_start','baseline_end']) body[key] = $(key).value;
    current = (await request('/api/analyse', {method:'POST', body:JSON.stringify(body)})).id; result = null; $('download').disabled = true; $('print').disabled = true; await refresh(); navigate('overview'); await show();
  } catch (error) { status(error.message); }
};
$('cancel').onclick = async () => { try { await request('/api/cancel', {method:'POST', body:'{}'}); await refresh(); await show(); } catch (error) { status(error.message); } };
$('save-mappings').onclick = async () => {
  try { const mappings = {}; for (const line of $('mappings').value.split('\n').filter(line => line.trim())) { const [account, team] = line.split('|').map(item => item.trim()); if (account in mappings) throw new Error('Duplicate mapped account'); mappings[account] = team; } await request('/api/mappings', {method:'POST', body:JSON.stringify({mappings})}); status('Mappings saved. New analyses use this mapping snapshot.'); } catch (error) { status(error.message); }
};
$('download').onclick = () => { if (!result) return; const url = URL.createObjectURL(new Blob([JSON.stringify(result,null,2)], {type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = `commitops-local-${current}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('print').onclick = () => { document.querySelectorAll('#results details').forEach(item => { item.open = true; }); window.print(); };
refresh().then(() => status('Ready. All analysis runs on this device.')).catch(error => status(error.message));
setInterval(() => { if (current && running) show().catch(error => status(error.message)); }, 2500);

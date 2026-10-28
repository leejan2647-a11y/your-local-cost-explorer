'use strict';
const token = new URLSearchParams(location.hash.slice(1)).get('token') || sessionStorage.getItem('local-token') || '';
if (token) sessionStorage.setItem('local-token', token);
history.replaceState(null, '', '/');
const $ = id => document.getElementById(id);
let periodTouched=false;
let fileMetadata=[], comparisonMode='history', comparisonIds=new Set(), detectedSpan=null;
let selected = new Set(), current = null, result = null, activeView = 'overview', pending = false, running = false;
const titles = {overview:'Dashboard',check:'Check Charges',findings:'Findings',commitments:'Commitments',allocation:'Allocation',reports:'Reports',settings:'Settings',teams:'Team mappings',evidence:'Check history & evidence'};
function navigate(view) {
  activeView = view; $('view-title').textContent = titles[view];
  document.querySelectorAll('[data-panels]').forEach(panel => { panel.hidden = !panel.dataset.panels.split(' ').includes(view); });
  document.querySelectorAll('[data-view]').forEach(item => { if (item.dataset.view === view) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current'); });
  document.querySelectorAll('[data-only]').forEach(item => { item.hidden = item.dataset.only !== view; });
  const scopes={overview:['validation','monthly_growth','comparisons','caveats'],findings:['findings','baselines'],commitments:['sp_assessment','ri_assessment','commitments'],allocation:['allocation'],teams:['teams'],reports:['caveats','input_files']};
  document.querySelectorAll('#results details').forEach(item => { item.hidden = view !== 'evidence' && !(scopes[view]||[]).includes(item.dataset.key); });
  $('finding-table').hidden = !['overview','findings'].includes(view);
  if(typeof renderManualPanels==='function') renderManualPanels();
  if(view==='reports')loadReports().catch(error=>status(error.message));
  if(view==='settings'){loadSettings().catch(error=>status(error.message));loadResources().catch(error=>status(error.message));}
}
document.querySelectorAll('[data-view]').forEach(item => { item.onclick = () => navigate(item.dataset.view); });
$('start-check').onclick = () => { navigate('overview'); $('upload').click(); };
$('new-check').onclick = () => { navigate(selected.size?'check':'overview'); if(!selected.size)$('upload').click(); };
const money = cents => Number.isSafeInteger(cents) ? new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(cents/100) : 'Unavailable';
function renderSummary(data) {
  $('metric-charges').textContent = money(data?.validation?.window_total_cents);
  $('metric-findings').textContent = Array.isArray(data?.findings) ? data.findings.length : '-';
  $('metric-rows').textContent = Number.isSafeInteger(data?.validation?.unique_rows) ? data.validation.unique_rows.toLocaleString() : '-';
  $('metric-commitments').textContent = Array.isArray(data?.commitments) ? data.commitments.length : '-';
  renderFindingTable();
}
function status(text) { $('status').textContent = text; }
async function request(path, options = {}) {
  const response = await fetch(path, {...options, headers: {'X-Local-Token': token, ...(options.headers || {})}});
  const body = await response.json();
  if (!response.ok) throw new Error((response.status===403?'Local session expired. Open the current launch URL printed by the app, then retry. ':'' )+(body.error || 'Local request failed'));
  return body;
}
function button(label, action) { const node = document.createElement('button'); node.textContent = label; node.onclick = () => action().catch(error => status(error.message)); return node; }
function section(label, value) {
  const details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre');
  summary.textContent = label; pre.textContent = JSON.stringify(value, null, 2); details.append(summary, pre); return details;
}
async function refresh() {
  const state = await request('/api/state');
  fileMetadata=state.files; $('files').replaceChildren();
  for (const file of state.files.filter(file=>file.role==='primary')) {
    const row = document.createElement('label'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = selected.has(file.id);
    input.onchange = () => {input.checked ? selected.add(file.id) : selected.delete(file.id);updatePeriods();};
    row.className = 'file'; row.append(input, document.createTextNode(` ${file.name} - ${file.bytes.toLocaleString()} bytes - ${file.role} - SHA256 ${file.sha256}`)); row.append(button('Remove local file',async()=>{ if(!confirm('Remove this retained file? Saved financial results remain available.'))return; await request('/api/files/remove',{method:'POST',body:JSON.stringify({id:file.id})});selected.delete(file.id);await refresh();})); $('files').append(row);
  }
  await loadHistory();updatePeriods();
  if (!current && state.runs.length) { current = state.runs[0].id; await show(); }
  if (!$('mappings').dataset.loaded) { $('mappings').value = Object.entries(state.mappings).map(([account, team]) => `${account} | ${team}`).join('\n'); $('mappings').dataset.loaded = 'yes'; }
}
async function show() {
  if (!current || pending) return;
  const requested = current; pending = true; let value;
  try { value = await request(`/api/runs/${requested}`); } finally { pending = false; }
  if (requested !== current) { await show(); return; }
  running = value.status === 'running'; status(`Analysis ${value.status}`);
  if (value.status === 'running') { result=null; $('results').replaceChildren(); $('finding-table').replaceChildren(); $('manual-tables').replaceChildren(); renderSummary(null); for(const id of ['download','print','html-report','csv-report','archive-check','generate-report'])$(id).disabled=true; return; }
  findingUpdates = value.finding_updates || {}; page = 0; result = value.result; $('results').replaceChildren();
  $('archive-check').disabled = !result; $('html-report').disabled = !result; $('csv-report').disabled = !result; $('generate-report').disabled = !result || value.status!=='completed';
  if($('finding-dialog').open)$('finding-dialog').close();
  $('download').disabled = !result; $('print').disabled = !result;
  renderSummary(result);
  if (!result) { $('manual-tables').replaceChildren(); $('finding-table').replaceChildren(); return; }
  for (const [label, key] of [['Validation and previous consumption','validation'],['Findings and evidence','findings'],['Commitment analysis','commitments'],['Savings Plan assessment','sp_assessment'],['Reserved instance assessment','ri_assessment'],['Allocation','allocation'],['Team attribution','teams'],['Monthly observations','monthly_growth'],['Comparable usage estimates','comparisons'],['Input identities','input_files'],['Device resources at calculation time','resource_budget'],['Workspace settings at calculation time','workspace_settings'],['Baseline evidence','baselines'],['Limitations','caveats']]) if (key in result) { const item = section(label, result[key]); item.dataset.key = key; $('results').append(item); }
  if (result.error) $('results').append(section('Analysis could not complete', result));
  navigate(activeView);
}
$('upload').onchange = async event => {
  try {
    for (const file of event.target.files) { status(`Uploading ${file.name}`); const uploaded = await request(`/api/upload?name=${encodeURIComponent(file.name)}&role=primary`, {method:'PUT', body:file}); selected.add(uploaded.id); }
    await refresh(); updatePeriods(); navigate('check');status('Upload completed. Dates are anchored to the supplied files, not today.');
  } catch (error) { status(error.message); } finally { event.target.value = ''; }
};
$('analyse').onclick = async () => {
  try {
    if(comparisonMode==='device'&&!comparisonIds.size)throw Error('Select comparison files or choose earlier rows in this file');
    if(comparisonMode==='previous'&&!$('previous-check').value)throw Error('Select a previous completed check');
    const body = {comparison_mode:comparisonMode,baseline_ids:comparisonMode==='device'?[...comparisonIds]:[],comparison_check:comparisonMode==='previous'?$('previous-check').value:null,files:[...selected], expectations:$('expectations').value.split('\n').filter(line => line.trim()).map(line => { const [service, amount, ...notes] = line.split('|').map(item => item.trim()); return {service, amount, note:notes.join(' | ')}; })};
    for (const key of ['start','end','baseline_start','baseline_end']) body[key] = $(key).value;
    current = (await request('/api/analyse', {method:'POST', body:JSON.stringify(body)})).id; result = null; $('download').disabled = true; $('print').disabled = true; await refresh(); navigate('overview'); await show();
  } catch (error) { status(error.message); }
};
$('cancel').onclick = async () => { try { await request('/api/cancel', {method:'POST', body:'{}'}); await refresh(); await show(); } catch (error) { status(error.message); } };
$('save-mappings').onclick = async () => {
  try { const mappings = {}; for (const line of $('mappings').value.split('\n').filter(line => line.trim())) { const [account, team] = line.split('|').map(item => item.trim()); if (account in mappings) throw new Error('Duplicate mapped account'); mappings[account] = team; } await request('/api/mappings', {method:'POST', body:JSON.stringify({mappings})}); await loadSettings(); status('Mappings saved. New analyses use this mapping snapshot.'); } catch (error) { status(error.message); }
};
$('download').onclick = () => { if (!result) return; const url = URL.createObjectURL(new Blob([JSON.stringify({...result,local_review:findingUpdates},null,2)], {type:'application/json'})); const a = document.createElement('a'); a.href = url; a.download = `your-local-cost-explorer-${current}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
$('print').onclick = () => { if(result) openPrintable(); };
let findingUpdates={}, page=0, historyCursor=null, historyRows=[], editing=null;
const detectorTypes=['unexpected-charge','spike','gradual-creep','new-charge','usage-cost-mismatch','marketplace','expectation-mismatch','unused-commitment'];
for(const detector of detectorTypes){const option=document.createElement('option');option.value=detector;option.textContent=detector.replace(/-/g,' ');$('finding-detector').append(option);}
function safeTable(title, headings, rows){
 const wrap=document.createElement('div');wrap.className='table-scroll';const table=document.createElement('table'),caption=document.createElement('caption');caption.textContent=title;table.append(caption);
 const head=document.createElement('thead'),tr=document.createElement('tr');for(const label of headings){const th=document.createElement('th');th.scope='col';th.textContent=label;tr.append(th);}head.append(tr);table.append(head);
 const body=document.createElement('tbody');for(const values of rows){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');if(value instanceof Node)cell.append(value);else cell.textContent=value===null||value===undefined?'Unavailable':String(value);row.append(cell);}body.append(row);}table.append(body);wrap.append(table);
 if(!rows.length){const note=document.createElement('p');note.className='table-hint';note.textContent='No supported observations for this selection. Review assessment reasons below.';wrap.append(note);}return wrap;
}
function renderFindingTable(){
 const container=$('finding-table');if(!result)return;container.replaceChildren();if(!Array.isArray(result.findings))return;
 const query=$('finding-search').value.trim().toLowerCase(),severity=$('finding-severity').value,detector=$('finding-detector').value,filterStatus=$('finding-status').value,archived=$('finding-archived').checked;
 const rows=result.findings.filter(f=>{const review=findingUpdates[f.id]||{};return (!review.archived||archived)&&(!severity||f.severity===severity)&&(!detector||f.type===detector)&&(!filterStatus||(review.status||f.status||'open')===filterStatus)&&(!query||[f.title,f.service,f.account,f.type,review.note].join(' ').toLowerCase().includes(query));});
 const limit=50;page=Math.min(page,Math.max(0,Math.ceil(rows.length/limit)-1));
 container.append(safeTable('Findings - impacts may overlap; do not add them to form a bill total',['Finding','Severity','Service','Account','Impact','Review'],rows.slice(page*limit,(page+1)*limit).map(f=>{const title=button(f.title||f.type,async()=>openFinding(f));title.className='link-button';const review=findingUpdates[f.id]||{};return [title,f.severity,f.service,f.account,money(f.impact_cents),review.archived?'archived':review.status||f.status||'open'];})));
 const label=document.createElement('p');label.className='table-hint';label.textContent=`${rows.length} matching findings; page ${page+1} of ${Math.max(1,Math.ceil(rows.length/limit))}. Complete evidence remains downloadable.`;container.append(label);
 const previous=button('Previous',async()=>{page--;renderFindingTable();}),next=button('Next',async()=>{page++;renderFindingTable();});previous.disabled=page===0;next.disabled=(page+1)*limit>=rows.length;previous.className=next.className='secondary';container.append(previous,next);
}
for(const id of ['finding-search','finding-severity','finding-detector','finding-status','finding-archived'])$(id).addEventListener(id==='finding-search'?'input':'change',()=>{page=0;renderFindingTable();});
function openFinding(finding){
 editing={run:current,finding};$('finding-title').textContent=finding.title||finding.type;const evidence=$('finding-evidence');evidence.replaceChildren();
 const description=document.createElement('p');description.textContent=finding.description||'';evidence.append(description);
 evidence.append(safeTable('Measurement',['Detector','Impact','Account','Region'],[[finding.type,money(finding.impact_cents),finding.account,finding.region]]));
 evidence.append(safeTable('Displayed supporting rows',['Line item','Date','Service','Contribution'],(finding.evidence?.top_line_items||[]).map(row=>[row.lineItemId,row.date,row.service,money(row.contributionCents)])));
 const caveat=document.createElement('p');caveat.textContent='Displayed rows can be sampled; they do not replace the complete contribution totals. '+(finding.caveats||[]).join(' ');evidence.append(caveat,section('Full finding evidence',finding));
 const review=findingUpdates[finding.id]||{};$('edit-status').value=review.status||finding.status||'open';$('edit-note').value=review.note||'';$('edit-archived').checked=!!review.archived;$('finding-dialog').showModal();
}
$('close-finding').onclick=()=>$('finding-dialog').close();
$('save-finding').onclick=async()=>{try{if(!editing||editing.run!==current)throw Error('Select the finding again before saving');const change={status:$('edit-status').value,note:$('edit-note').value,archived:$('edit-archived').checked};await request('/api/findings/update',{method:'POST',body:JSON.stringify({run_id:editing.run,finding_id:editing.finding.id,...change})});findingUpdates[editing.finding.id]=change;$('finding-dialog').close();renderFindingTable();status('Local review saved. Financial evidence is unchanged.');}catch(error){status(error.message);}};
function observedChart(){
 const wrapper=document.createElement('div');wrapper.className='observed-chart';const title=document.createElement('h3');title.textContent='Reported daily charges';wrapper.append(title);
 const days=result?.validation?.spend_history?.daily||[];const amounts=days.map(day=>day.amount_cents).filter(Number.isSafeInteger);
 const note=document.createElement('p');note.className='table-hint';note.textContent='Observed dates only. Gaps stay unknown; no forecasting or company-growth inference.';wrapper.append(note);
 if(!amounts.length){const empty=document.createElement('p');empty.textContent='Daily history unavailable for this check.';wrapper.append(empty);return wrapper;}
 const minimum=Math.min(0,...amounts),maximum=Math.max(0,...amounts),span=maximum-minimum||1;const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 900 180');svg.setAttribute('role','img');svg.setAttribute('aria-label','Observed daily reported charges. Missing days break the line.');
 let points=[];function flush(){if(!points.length)return;const line=document.createElementNS(ns,'polyline');line.setAttribute('points',points.join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#4165cf');line.setAttribute('stroke-width','2');svg.append(line);points=[];}
 days.forEach((day,index)=>{if(!Number.isSafeInteger(day.amount_cents)){flush();return;}const x=20+index/Math.max(days.length-1,1)*860,y=15+(maximum-day.amount_cents)/span*145;points.push(`${x},${y}`);const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));dot.setAttribute('r','2');dot.setAttribute('fill','#4165cf');const tip=document.createElementNS(ns,'title');tip.textContent=day.date+': '+money(day.amount_cents);dot.append(tip);svg.append(dot);});flush();wrapper.append(svg);
 wrapper.append(safeTable('Daily source observations',['Date','Reported charges'],days.map(day=>[day.date,money(day.amount_cents)])));wrapper.lastChild.hidden=true;const toggle=button('Show daily observations',async()=>{const table=wrapper.querySelector('.table-scroll');table.hidden=!table.hidden;toggle.textContent=table.hidden?'Show daily observations':'Hide daily observations';});toggle.className='secondary';wrapper.append(toggle);return wrapper;
}
function renderManualPanels(){
 const target=$('manual-tables');target.replaceChildren();if(!result)return;
 if(activeView==='overview')target.append(observedChart());
 if(['commitments','reports'].includes(activeView))target.append(safeTable('Commitment consumption',['Name','Type','Account','Purchased','Consumed','Unused'],(result.commitments||[]).map(c=>[c.name||c.id,c.type,c.account,money(c.purchased_cents),money(c.used_cents),money(c.unused_cents)])));
 if(['allocation','reports'].includes(activeView)){
  const allocation=result.allocation||{};target.append(safeTable('Unused commitment allocation',['Category','Amount'],Object.entries(allocation.byCategory||{}).map(([category,value])=>[category,money(value)])));
  const note=document.createElement('p');note.textContent='Supported total unused: '+money(allocation.totalUnusedCents)+'. Missing inventory or unsupported categories remain unavailable.';target.append(note);
 }
 if(['teams','allocation','reports'].includes(activeView))target.append(safeTable('Account-to-team consumption',['Account','Team at calculation time','Supported consumption'],(result.teams||[]).map(team=>[team.account,team.team||'Unmapped',money(team.consumed_cents)])));
 if(['overview','reports','evidence'].includes(activeView)){
  target.append(safeTable('Monthly observations - cloud usage does not establish company growth',['Calendar month','Role','Coverage','Reported charges','Missing dates'],(result.monthly_growth?.observations||[]).map(month=>[month.month,month.role,month.complete?'Full observed period; export completeness unverified':month.status,money(month.charge_cents),(month.missing_days||[]).join(', ')||'None observed'])));
  target.append(safeTable('Comparable daily usage estimates',['Baseline month','Status','Reported spending change','Comparable usage change','Represented groups'],(result.comparisons||[]).map(c=>[c.baseline_month,c.status,c.spending_change_percent===null?'Unavailable':c.spending_change_percent+'%',c.usage_change_percent===null?'Unavailable':c.usage_change_percent+'%',c.represented_groups])));
 }
 if(activeView==='reports'){
  target.prepend(safeTable('Whole-check report',['Check','Period','Reported AWS charges','Calculated result'],[[current,`${result.window?.start||'Unknown'} to ${result.window?.end||'Unknown'}`,money(result.validation?.window_total_cents),'Supplied rows only; not a reconciled final invoice']]));
  target.append(safeTable('Findings',['Finding','Detector','Severity','Impact'],(result.findings||[]).map(f=>[f.title,f.type,f.severity,money(f.impact_cents)])));
 }
}
async function loadHistory(append=false){
 const data=await request('/api/history?limit=50'+(append&&historyCursor?'&before='+encodeURIComponent(historyCursor):''));historyRows=append?[...historyRows,...data.runs]:data.runs;historyCursor=data.next_cursor;
 const reportSelection=new Set(Array.from($('report-checks').selectedOptions).map(option=>option.value));$('report-checks').replaceChildren();
 const previousChoice=$('previous-check').value;$('previous-check').replaceChildren();
 $('check-picker').replaceChildren();$('runs').replaceChildren();
 for(const run of historyRows){if(run.status==='completed'&&!run.archived){const previous=document.createElement('option');previous.value=run.id;previous.textContent=run.created+' - '+run.id;$('previous-check').append(previous);}if(run.status==='completed'){const choice=document.createElement('option');choice.value=run.id;choice.textContent=run.created+' - '+run.id;choice.selected=reportSelection.has(run.id)||(!reportSelection.size&&run.id===current);$('report-checks').append(choice);}const label=`${run.created} Â- ${run.status}${run.archived?' Â- archived':''}`;const option=document.createElement('option');option.value=run.id;option.textContent=label;$('check-picker').append(option);const row=button(label,async()=>{current=run.id;$('check-picker').value=current;await show();});$('runs').append(row);}
 if(previousChoice)$('previous-check').value=previousChoice;
 if(current)$('check-picker').value=current;$('history-more').hidden=!historyCursor;
 const selected=historyRows.find(row=>row.id===current);$('archive-check').textContent=selected?.archived?'Restore check':'Archive check';
}
$('history-more').onclick=()=>loadHistory(true).catch(error=>status(error.message));
$('check-picker').onchange=async()=>{try{current=$('check-picker').value;await show();const selected=historyRows.find(row=>row.id===current);$('archive-check').textContent=selected?.archived?'Restore check':'Archive check';}catch(error){status(error.message);}};
$('archive-check').onclick=async()=>{try{if(!current)return;const selected=historyRows.find(row=>row.id===current);await request('/api/runs/archive',{method:'POST',body:JSON.stringify({id:current,archived:!selected?.archived})});await loadHistory();status('Check history updated; evidence preserved.');}catch(error){status(error.message);}};
function downloadFile(name,contents,type){const url=URL.createObjectURL(new Blob([contents],{type}));const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function escapeHTML(value){return String(value??'Unavailable').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function meetingHTML(){
 const notice='Estimates use only the AWS data provided. Changes in cloud usage do not establish company or revenue growth. Missing exports, workload changes, discounts and billing adjustments can affect the result.';
 const lines=(result.findings||[]).map(f=>`<tr><td>${escapeHTML(f.title)}</td><td>${escapeHTML(f.type)}</td><td>${escapeHTML(f.severity)}</td><td>${escapeHTML(money(f.impact_cents))}</td></tr>`).join('');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><meta name="viewport" content="width=device-width"><title>Your Local Cost Explorer meeting report</title><style>body{font:15px/1.6 system-ui;max-width:1100px;margin:35px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ccc;text-align:left}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}h2{break-after:avoid}</style><h1>Your Local Cost Explorer meeting report</h1><p>'+escapeHTML(notice)+'</p><p>Check '+escapeHTML(current)+'; '+escapeHTML(result.window?.start)+' to '+escapeHTML(result.window?.end)+'</p><p>Reported AWS charges: '+escapeHTML(money(result.validation?.window_total_cents))+'. Finding impacts may overlap and must not be added into a bill total.</p><table><thead><tr><th>Finding</th><th>Detector</th><th>Severity</th><th>Impact</th></tr></thead><tbody>'+lines+'</tbody></table><h2>Complete check evidence and local review</h2><pre>'+escapeHTML(JSON.stringify({...result,local_review:findingUpdates},null,2))+'</pre></html>';
}
$('html-report').onclick=()=>{if(result)downloadFile(`commitops-meeting-${current}.html`,meetingHTML(),'text/html');};
$('csv-report').onclick=()=>{
 if(!result)return;const field=value=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 const rows=[['Finding','Detector','Severity','Account','Service','Impact cents','Review status','Note'],...(result.findings||[]).map(f=>[f.title,f.type,f.severity,f.account,f.service,f.impact_cents,findingUpdates[f.id]?.status||f.status||'open',findingUpdates[f.id]?.note||''])];downloadFile(`commitops-findings-${current}.csv`,rows.map(row=>row.map(field).join(',')).join('\r\n'),'text/csv');
};
function openPrintable(){navigate('reports');window.print();}

let storedSettings=null, settingsSeeded=false, editingTeam=null, reportCursor=null;
function setDefaults(days){
 const end=new Date(), start=new Date(end);start.setUTCDate(start.getUTCDate()-Number(days));const baselineEnd=new Date(start);baselineEnd.setUTCDate(baselineEnd.getUTCDate()-1);const baselineStart=new Date(baselineEnd);baselineStart.setUTCDate(baselineStart.getUTCDate()-Number(days));
 for(const [id,value]of Object.entries({start,end,baseline_start:baselineStart,baseline_end:baselineEnd}))if(!$(id).value)$(id).value=value.toISOString().slice(0,10);
}
async function loadSettings(reset=false){
 const data=await request('/api/settings');storedSettings=data.settings;
 if(!settingsSeeded||reset){$('settings-company').value=storedSettings.name;$('settings-range').value=storedSettings.defaultDateRange;$('settings-creep').value=storedSettings.creepMonthlyGrowthPercent;settingsSeeded=true;setDefaults(storedSettings.defaultDateRange);}
 $('team-list').replaceChildren();
 $('team-list').append(safeTable('Team mappings',['Name','AWS account id','Actions'],Object.entries(data.teams).map(([account,name])=>{
  const actions=document.createElement('div');actions.append(button('Edit',async()=>{editingTeam=account;$('team-name').value=name;$('team-account').value=account;$('add-team').textContent='Save';$('cancel-team').hidden=false;}),button('Delete',async()=>{if(!confirm(`Delete the team "${name}" (${account})?`))return;await request('/api/settings/teams',{method:'POST',body:JSON.stringify({action:'delete',account})});await loadSettings();}));return [name,account,actions];
 })));
 $('mappings').value=Object.entries(data.teams).map(([account,name])=>`${account} | ${name}`).join('\n');
}
$('save-settings').onclick=async()=>{try{await request('/api/settings',{method:'POST',body:JSON.stringify({name:$('settings-company').value,defaultDateRange:$('settings-range').value,creepMonthlyGrowthPercent:$('settings-creep').value})});await loadSettings(true);$('settings-status').textContent='Saved. Applies to future checks; saved results are unchanged.';}catch(error){$('settings-status').textContent=error.message;}};
$('discard-settings').onclick=()=>loadSettings(true).then(()=>{$('settings-status').textContent='Changes discarded.';}).catch(error=>status(error.message));
function clearTeamEditor(){editingTeam=null;$('team-name').value='';$('team-account').value='';$('add-team').textContent='Add team';$('cancel-team').hidden=true;}
$('cancel-team').onclick=clearTeamEditor;
$('add-team').onclick=async()=>{try{await request('/api/settings/teams',{method:'POST',body:JSON.stringify({action:editingTeam?'edit':'add',previous_account:editingTeam,account:$('team-account').value.trim(),name:$('team-name').value.trim()})});clearTeamEditor();await loadSettings();status('Team mappings saved. Existing check snapshots are unchanged.');}catch(error){status(error.message);}};
async function loadReports(append=false){
 const data=await request('/api/reports'+(append&&reportCursor?'?before='+encodeURIComponent(reportCursor):''));if(!append)$('saved-reports').replaceChildren();reportCursor=data.next_cursor;$('reports-more').hidden=!reportCursor;
 for(const report of data.reports){const row=document.createElement('div');row.className='report-row';const name=document.createElement('p');name.textContent=`${report.name} Â- ${report.created}${report.archived?' Â- archived':''}`;row.append(name);
 row.append(button('Download',async()=>{const document=await request('/api/reports/'+encodeURIComponent(report.id));downloadFile(`report-${report.id}.json`,JSON.stringify(document,null,2),'application/json');}),button('Rename',async()=>{const name=prompt('Report name',report.name);if(name===null)return;await request('/api/reports/update',{method:'POST',body:JSON.stringify({action:'rename',id:report.id,name})});await loadReports();}),button(report.archived?'Restore':'Archive',async()=>{await request('/api/reports/update',{method:'POST',body:JSON.stringify({action:'archive',id:report.id,archived:!report.archived})});await loadReports();}),button('Delete',async()=>{if(!confirm('Delete this saved report? The original check stays available.'))return;await request('/api/reports/update',{method:'POST',body:JSON.stringify({action:'delete',id:report.id})});await loadReports();}));$('saved-reports').append(row);}
}
$('reports-more').onclick=()=>loadReports(true).catch(error=>status(error.message));
$('generate-report').onclick=async()=>{try{await request('/api/reports/update',{method:'POST',body:JSON.stringify({action:'create',run_ids:Array.from($('report-checks').selectedOptions).map(option=>option.value).length?Array.from($('report-checks').selectedOptions).map(option=>option.value):[current],name:$('report-name').value})});await loadReports();status('Report saved locally. No message or external link was created.');}catch(error){status(error.message);}};
Promise.all([refresh(),loadSettings()]).then(()=>status('Ready. Choose a saved check or start a manual analysis.')).catch(error=>status(error.message));
setInterval(()=>{if(current&&running)show().catch(error=>status(error.message));},2500);

async function loadResources(){const data=await request('/api/resources');const processing=data.processing;const size=bytes=>Number.isSafeInteger(bytes)?(bytes/1024**3).toFixed(2)+' GiB':'Unavailable';$('hardware-info').textContent=`No fixed input-size cap. ${processing.cpu_threads} available CPU threads; ${size(processing.available_memory_bytes)} available RAM, ${size(processing.duckdb_memory_bytes)} allocated to the database; ${size(processing.spill_bytes)} usable working disk. Upload storage: ${size(data.uploads.usable_bytes)} currently usable. The app reserves headroom for the operating system; successful completion is not guaranteed.`;}
$('refresh-resources').onclick=()=>loadResources().catch(error=>status(error.message));

$('report-checks').onchange=()=>{$('generate-report').disabled=!$('report-checks').selectedOptions.length;};
$('cancel-report').onclick=()=>{$('report-name').value='';for(const option of $('report-checks').options)option.selected=false;$('generate-report').disabled=true;status('Report draft cancelled. No report was saved.');};

function shiftDay(value,days){const day=new Date(value+'T00:00:00Z');day.setUTCDate(day.getUTCDate()+days);return day.toISOString().slice(0,10);}
function updatePeriods(){
 const spans=fileMetadata.filter(file=>selected.has(file.id)&&file.role==='primary').map(file=>file.inspection).filter(span=>span?.status==='available');
 if(!spans.length){detectedSpan=null;$('date-notice').textContent='Upload supported files to detect dates, or enter dates manually.';return;}
 const first=spans.map(s=>s.min_date).sort()[0],last=spans.map(s=>s.max_date).sort().at(-1);detectedSpan={first,last};const count=Math.round((new Date(last)-new Date(first))/86400000)+1;
 const picker=$('period-choice'),old=picker.value;picker.replaceChildren();for(const days of [7,30,90,180])if(days<=count){const option=document.createElement('option');option.value=String(days);option.textContent='Last '+days+' days';picker.append(option);}const manual=document.createElement('option');manual.value='manual';manual.textContent='Manual dates';picker.append(manual);picker.value=periodTouched&&Array.from(picker.options).some(o=>o.value===old)?old:String([180,90,30,7].find(days=>days<=count)||'manual');if(!periodTouched&&count<7){$('start').value=first;$('end').value=last;if(comparisonMode==='history'){$('baseline_start').value=$('baseline_end').value=shiftDay(first,-1);}$('date-notice').textContent=`Observed file dates: ${first} to ${last}. No earlier rows are available for a baseline. Bounds do not prove completeness.`;}applyPeriod();
}
function applyPeriod(){
 if(!detectedSpan||$('period-choice').value==='manual')return;
 const days=Number($('period-choice').value),{first,last}=detectedSpan,start=shiftDay(last,-days+1),baselineEnd=shiftDay(start,-1);$('start').value=start;$('end').value=last;if(comparisonMode==='history'){$('baseline_start').value=first<start?first:baselineEnd;$('baseline_end').value=baselineEnd;}
 $('date-notice').textContent=`Observed file dates: ${first} to ${last}. ${first<start?'All supplied history before the analysis window is the baseline.':'No earlier rows exist in this file; historical comparisons are unavailable unless you supply a baseline.'} Bounds do not prove complete coverage.`;
}
$('period-choice').onchange=()=>{periodTouched=true;applyPeriod();};
function compareMode(mode){comparisonMode=mode;$('previous-wrap').hidden=mode!=='previous';$('device-wrap').hidden=mode!=='device';$('comparison-notice').textContent=mode==='history'?'Use all earlier rows in the selected primary files.':mode==='device'?'Selected comparison files remain separate from primary data.':'Previous check must retain unchanged source files and end before this analysis.';if(mode==='history')applyPeriod();}
$('compare-previous').onclick=()=>{compareMode('previous');if($('previous-check').value)$('previous-check').dispatchEvent(new Event('change'));};$('compare-device').onclick=()=>compareMode('device');$('compare-history').onclick=()=>compareMode('history');
$('previous-check').onchange=async()=>{const requested=$('previous-check').value;try{const old=await request('/api/runs/'+requested);if(comparisonMode==='previous'&&$('previous-check').value===requested&&old.result?.window){$('baseline_start').value=old.result.window.start;$('baseline_end').value=old.result.window.end;}}catch(error){status(error.message);}};
$('comparison-upload').onchange=async event=>{try{comparisonIds.clear();const spans=[];for(const file of event.target.files){status('Uploading comparison '+file.name);const uploaded=await request('/api/upload?name='+encodeURIComponent(file.name)+'&role=comparison',{method:'PUT',body:file});comparisonIds.add(uploaded.id);if(uploaded.inspection?.status==='available')spans.push(uploaded.inspection);}if(comparisonMode==='device'&&spans.length){$('baseline_start').value=spans.map(s=>s.min_date).sort()[0];$('baseline_end').value=spans.map(s=>s.max_date).sort().at(-1);}status(comparisonIds.size+' comparison files selected. Review baseline dates before running.');}catch(error){status(error.message);}finally{event.target.value='';}};
for(const id of ['start','end','baseline_start','baseline_end'])$(id).addEventListener('input',()=>{periodTouched=true;$('period-choice').value='manual';});
navigate('overview');

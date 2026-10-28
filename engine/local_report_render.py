import json
from html import escape
def render_document(data):
    lines=["CommitOps meeting report",f"Outcome: {data['outcome']}",f"Check: {data['check_id']}",
           f"Period: {data['window']['start']} to {data['window']['end']}",
           "Estimates use only the AWS data provided. Cloud usage does not establish company or revenue growth.",
           "Finding impacts can overlap and are not added to invent a bill total."]
    for key,label in [('run_id','Run'),('scope_id','Scope'),('rule_id','Rule'),('generated_at','Calculated at')]:
        if data.get(key):lines.append(f'{label}: {data[key]}')
    if data.get('check_ids'):lines.append('Contributing checks: '+', '.join(data['check_ids']))
    if 'reported_charges_cents' in data:lines.append(f"Reported AWS charges: {data['reported_charges_cents']} cents" if data['reported_charges_cents'] is not None else 'Reported AWS charges unavailable')
    if data.get('scope'):lines.append('Rule scope: '+json.dumps(data['scope'],ensure_ascii=False))
    for failure in data.get('failures',[]):lines.append('Source outcome: '+json.dumps(failure,ensure_ascii=False))
    for source in data['sources']:
        lines.append(f"Source: {source['filename']} | upload {source['id']} | SHA256 {source.get('sha256') or 'unavailable'}")
        if source.get('status'):lines.append(f"Source outcome: {source['status']} | attempt {source.get('attempt',0)} | latest supported source timestamp {source.get('source_timestamp') or 'unavailable'}")
        if source.get('history'):lines.append('Attempt history: '+json.dumps(source['history'],ensure_ascii=False))
    for item in data['findings']:
        lines.extend([f"{item['severity']}: {item['title']}",item['description'],
            f"Detector: {item['detector']} | impact: {item['impact_cents']} cents",str(item['caveats']),
            "Saved evidence rows are a display sample; full contribution is recorded separately."])
        lines.extend(f"Evidence {e['reference']}: {e['amount_cents']} cents on {e['date']}" for e in item['evidence'])
    for item in data['commitments']:
        lines.append("Commitment: "+json.dumps(item,ensure_ascii=False,sort_keys=True))
    if not data['findings']: lines.append("Completed: no findings" if data['outcome']=='completed' else "No findings available for this outcome")
    lines.append('Suggested next action: '+('Correct the listed source or processing failures and review the linked check diagnostics before retrying.' if data['outcome'] in {'failed','partial_with_failure'} else 'Verify source delivery and the selected lookback; already successful versions are skipped.' if data['outcome']=='no_new_data' else 'Review source coverage and the evidence for each finding before taking action. Uploaded rows do not independently reconcile the final invoice.'))
    text="\n".join(lines)
    html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>CommitOps meeting report</title><body><h1>CommitOps meeting report</h1>'+''.join('<p>'+escape(line)+'</p>' for line in lines[1:])+'</body></html>'
    return {**data,"text":text,"html":html,"state":data['outcome']}

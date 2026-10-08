from pathlib import Path
import json,statistics,gzip
root=Path(__file__).resolve().parent
def read_report(name):
 path=root/name
 return json.loads(path.read_text() if path.exists() else gzip.decompress((root/(name+'.gz')).read_bytes()).decode())
raw=read_report('all-checkpoints.json');hs=read_report('hs-operation-counts.json')
rows=[]
for item in raw['results']:
 row={k:item[k] for k in ['mode','case','profile','selectedPolicy','liveParticles','nonEquivalent','totals','livePolicyChange','summary']}
 row['meanHistorySec']=statistics.mean(h['historySec'] for h in item['history']);row['firstMeasuredCallbackMs']=item['timings'][0]['totalCallbackMs']
 if item['mode']=='hs':row['totals']=next(x['totals'] for x in hs['results'] if x['case']==item['case']);row['historicalAccounting']='Requested from admitted+aggregate drops. Refusal subcauses absent; spacing was absent. Original timing-report zeros for absent H.S counters are unavailable, not measured zero.'
 rows.append(row)
dense=json.loads((root/'dense-alternating.json').read_text())
summary={'comparisons':rows,'denseAlternating':{m:{'trialMediansMs':[x['summary']['totalCallbackMs']['p50'] for x in dense['results'] if x['mode']==m],'medianOfMediansMs':statistics.median(x['summary']['totalCallbackMs']['p50'] for x in dense['results'] if x['mode']==m),'meanOfMeansMs':statistics.mean(x['summary']['totalCallbackMs']['mean'] for x in dense['results'] if x['mode']==m)} for m in ['hu','hv']}}
(root/'measurement-summary.json').write_text(json.dumps(summary,indent=2)+'\n')
lines=['| Scenario | H.S | H.T | H.U | H.V | H.W |','| --- | ---: | ---: | ---: | ---: | ---: |']
for case in dict.fromkeys(x['case'] for x in rows):
 vals=[next(x for x in rows if x['case']==case and x['mode']==m and not x['profile']) for m in ['hs','ht','hu','hv','hw']]
 lines.append('| '+case+' | '+' | '.join(f"{x['summary']['totalCallbackMs']['p50']:.3f}"+('*' if x['nonEquivalent'] else '') for x in vals)+' |')
lines+=['','* = unsupported spacing/expert policy; population/configuration differs. One broad trial,30 samples (120 saturated),not a causal or statistically certain speed comparison.','', '| H.W scenario | Selected emission / retention | Requested | Spacing | Admitted | Budget drop | TTL | Evictions | Live | History s |','| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for x in rows:
 if x['mode']!='hw' or x['profile']:continue
 t=x['totals'];p=x['selectedPolicy'];lines.append(f"| {x['case']} | {p['maxEmissionsPerFrame']} / {p['maxActiveParticles']} | {t['requestedDemand']} | {t['spatiallyRejectedDemand']} | {t['emissions']} | {t['budgetRejectedDemand']} | {t['expired']} | {t['evicted']} | {x['liveParticles']} | {x['meanHistorySec']:.3f} |")
lines+=['','| H.W profiled scenario | Audio FFT | Motion/response | Demand | TTL check | TTL retire | Fair scheduling | Heap admit inclusive | Update | Particles Canvas | Trace Canvas | UI | Diagnostics |','| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
fields=['audioSampleMs','motionResponseMs','demandPreparationMs','expirationChecksMs','ttlRetirementMs','fairnessSchedulingMs','heapAdmissionInclusiveMs','visualizerUpdateMs','particleCanvasMs','traceCanvasMs','uiRefreshMs','diagnosticsMs']
for x in rows:
 if x['mode']!='hw' or not x['profile']:continue
 lines.append('| '+x['case']+' | '+' | '.join(f"{x['summary'].get(f,{}).get('p50',0):.3f}" for f in fields)+' |')
lines+=['','Inclusive/subtracted timers overlap; columns cannot be summed. 0.000 includes below-resolution measurements. Raw JSON retains p95/mean and every measured callback. Canvas is synchronous submission/backpressure,not GPU completion.','', '| Retention trim, uninstrumented | H.U ms | H.V ms | H.W ms |','| --- | ---: | ---: | ---: |']
for case in ['dense-sixteen','expert-sixteen','large-retention']:
 lines.append('| '+case+' | '+' | '.join(f"{next(x for x in rows if x['case']==case and x['mode']==m and not x['profile'])['livePolicyChange']['trimMs']:.3f}" for m in ['hu','hv','hw'])+' |')
(root/'performance-tables.md').write_text('\n'.join(lines)+'\n');print('\n'.join(lines))

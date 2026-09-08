from pathlib import Path
import json,urllib.request,urllib.error,time
root=Path(__file__).resolve().parent
sessions=json.loads((root/'auth-private.json').read_text())
token=sessions['model-reviewer']['tokens']['accessToken']
base='http://127.0.0.1:8097/api/v1'
def request(route,body=None,method=None):
 req=urllib.request.Request(base+route,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method or ('GET' if body is None else 'POST'))
 try:
  with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
 except urllib.error.HTTPError as e:raise RuntimeError(f'{route}: HTTP {e.code} {e.read().decode()}')
changes=[]
for stem in ['ui-cues','ugc']:
 original=json.loads((root/'content/config'/f'{stem}.json').read_text())
 doc=json.loads(json.dumps(original))
 if stem=='ui-cues':doc['playerContent']={'submit':True,'discover':True}
 else:doc.update({'enabled':True,'maxPendingPerPlayer':50,'quotaPerPlayerPerDay':100,'powerUserQuotaPerDay':200,'maxBytes':4194304,'heroModelUploadsEnabled':True,'heroModelMaxBytes':33554432})
 result=request('/content-overlay/docs/config/'+stem,doc,'PUT')
 changes.append({'id':stem,'before':original,'after':doc,'response':result})
(root/'evidence/local-config.json').write_text(json.dumps({'scope':'Authorized isolated local service only','changes':changes,'policy':request('/hero-submissions/policy')},ensure_ascii=False,indent=2)+'\n')
profile=request('/hero-import/target-profile')
(root/'evidence/target-profile.initial.json').write_text(json.dumps(profile,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'policy':request('/hero-submissions/policy'),'profileKeys':list(profile),'curation':request('/curation/whitelist')},ensure_ascii=False))

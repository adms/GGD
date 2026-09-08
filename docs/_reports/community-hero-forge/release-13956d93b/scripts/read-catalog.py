from pathlib import Path
import json,urllib.request
root=Path(__file__).resolve().parent
pwd=json.loads((root/'credentials-private.json').read_text())['password']
base='http://127.0.0.1:8097/api/v1'
r=urllib.request.Request(base+'/auth/login',data=json.dumps({'username':'model-reviewer','password':pwd}).encode(),headers={'Content-Type':'application/json'})
with urllib.request.urlopen(r) as res:token=json.load(res)['tokens']['accessToken']
for route,name in [('/content-overlay/hero-catalog/heroes','catalog-heroes'),('/content-overlay/hero-catalog/versions','catalog-versions'),('/content-overlay/head','overlay-head-before-catalog'),('/content-overlay/bundle','overlay-before-catalog')]:
 req=urllib.request.Request(base+route,headers={'Authorization':'Bearer '+token})
 with urllib.request.urlopen(req,timeout=90) as res:data=json.load(res)
 (root/'evidence'/f'{name}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'name':name,'keys':list(data) if isinstance(data,dict) else 'array','count':len(data.get('heroes',data.get('versions',[]))) if isinstance(data,dict) else len(data)},ensure_ascii=False))

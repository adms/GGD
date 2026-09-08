from pathlib import Path
import json,os,urllib.request
root=Path(__file__).resolve().parent
password=json.loads((root/'credentials-private.json').read_text())['password']
authfile=root/'auth-private.json'
assert not authfile.exists(),'Do not repeat registration or replace existing sessions'
accounts={}
for name in ['model-reviewer','model-author']:
 req=urllib.request.Request('http://127.0.0.1:8097/api/v1/auth/register',data=json.dumps({'username':name,'email':name+'-release@local.invalid','password':password}).encode(),headers={'Content-Type':'application/json'},method='POST')
 with urllib.request.urlopen(req,timeout=20) as response:session=json.load(response)
 accounts[name]=session
 print(json.dumps({'username':name,'roles':session['account'].get('roles'),'status':session['account'].get('status')},ensure_ascii=False))
 with open(authfile,'w',opener=lambda path,flags:os.open(path,flags,0o600)) as f:json.dump(accounts,f)
assert 'admin' in accounts['model-reviewer']['account']['roles']
assert 'admin' not in accounts['model-author']['account']['roles']
(root/'evidence/account-setup.json').write_text(json.dumps({'origin':'http://127.0.0.1:8097','method':'auth/register','accounts':[{k:v for k,v in s['account'].items() if k in ['id','username','roles','status']} for s in accounts.values()]},ensure_ascii=False,indent=2)+'\n')

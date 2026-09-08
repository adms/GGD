from pathlib import Path
import json,os,shutil,hashlib,socket,subprocess,time,urllib.request,urllib.error,signal
root=Path(__file__).resolve().parent
repo=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge-s3')
content=root/'legacy-content-attempt2';assert not content.exists();shutil.copytree(root/'content',content)
report={'schema':'ggd-unpublished-legacy-restore-proof@1','status':'running','scope':'Actual existing local Editor content API, same runtime source, separate copy of content. Fixture changes one archived hero health value; restore uses normal preview and guarded restore. No publication or browser-action claim.','codeCommit':json.loads((root/'evidence/preparation.json').read_text())['codeCommit']}
save=lambda:(root/'evidence/legacy-restore.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
base='http://127.0.0.1:8823/content-api'
def api(route,body=None):
 req=urllib.request.Request(base+route,data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:5197'},method='GET' if body is None else 'POST')
 try:
  with urllib.request.urlopen(req,timeout=90) as r:return json.load(r)
 except urllib.error.HTTPError as e:raise RuntimeError(f'{route}: HTTP {e.code} {e.read().decode()}')
def hashes():return {str(p.relative_to(content)):hashlib.sha256(p.read_bytes()).hexdigest() for p in content.rglob('*') if p.is_file()}
with socket.socket() as s:assert s.connect_ex(('127.0.0.1',8823))!=0
log=open(root/'logs/legacy-content-api.log','wb')
env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','LC_ALL']}
env.update({'PORT':'8823','HOST':'127.0.0.1','GGD_CONTENT_DIR':str(content),'GGD_CONTENT_BACKUP_DIR':str(root/'legacy-backups-attempt2'),'GGD_EDITOR_ORIGINS':'http://127.0.0.1:5197','GGD_BUILD_STAMP':report['codeCommit']})
p=subprocess.Popen(['node','--import','tsx','apps/content-api/src/index.ts'],cwd=repo,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
originalBytes=None;heroFile=None
try:
 deadline=time.monotonic()+45
 while True:
  assert p.poll() is None,'Local content service exited'
  try:listing=api('/hero-catalog/heroes');break
  except Exception:
   if time.monotonic()>deadline:raise
   time.sleep(.5)
 hero=next(h for h in listing['heroes'] if h['id']=='godie-e00j' and h['catalog']=='legacy')
 heroFile=content/hero['path'].removeprefix('catalog/')
 originalBytes=heroFile.read_bytes();original=json.loads(originalBytes)
 before=hashes();captured=api('/hero-catalog/versions/capture',{})
 oldVersion=captured['version']['versionId'];assert oldVersion==listing['currentVersion']
 report.update({'hero':hero,'beforeVersion':oldVersion,'beforeHealth':original['baseStats']['maxHealth']})
 changed=json.loads(originalBytes);changed['baseStats']['maxHealth']+=1
 heroFile.write_text(json.dumps(changed,ensure_ascii=False,indent=2)+'\n')
 current=api('/hero-catalog/heroes');assert current['currentVersion']!=oldVersion
 preview=api('/hero-catalog/preview',{'heroPath':hero['path'],'versionId':oldVersion,'expectedCurrentVersion':current['currentVersion']})
 assert preview['hero']['catalog']=='legacy'
 wanted=json.loads(next(d['source'] for d in preview['documents'] if d['path']==hero['path']))
 assert wanted['baseStats']['maxHealth']==original['baseStats']['maxHealth']
 assert wanted['name']==original['name']
 (root/'evidence/legacy-preview.json').write_text(json.dumps(preview,ensure_ascii=False,indent=2)+'\n')
 result=api('/hero-catalog/restore',{'heroPath':hero['path'],'versionId':oldVersion,'expectedCurrentVersion':preview['currentVersion'],'planDigest':preview['planDigest']})
 actual=json.loads(heroFile.read_text());assert actual==wanted
 after=hashes()
 otherHeroes=[h['path'].removeprefix('catalog/') for h in listing['heroes'] if h['path']!=hero['path']]
 assert len(otherHeroes)==118
 assert all(before[f]==after[f] for f in otherHeroes),'Another hero changed'
 shared=[f for f in before if f.startswith(('abilities/','ability-templates/','models/','vfx/','vfx-scripts/','status-effects/')) and not f.endswith('_index.json')]
 assert all(before[f]==after[f] for f in shared),'A shared definition changed'
 assert not (content/'champions'/heroFile.name).exists(),'Archived hero was improperly shipped'
 owned=[f for f in after if f not in before and 'instance.' in f]
 assert owned,'Expected independent instantiated dependencies'
 report.update({'status':'passed','fixtureHealth':changed['baseStats']['maxHealth'],'restoredHealth':actual['baseStats']['maxHealth'],'afterVersion':result['versionId'],'restoreReceipt':result,'allOtherHeroesUnchanged':len(otherHeroes),'sharedDefinitionsUnchanged':len(shared),'independentDependencies':owned,'stayedUnpublished':True,'targetMatchesCompletePreview':True})
 print(json.dumps({k:v for k,v in report.items() if k in ['status','beforeHealth','fixtureHealth','restoredHealth','allOtherHeroesUnchanged','sharedDefinitionsUnchanged','stayedUnpublished','targetMatchesCompletePreview']},ensure_ascii=False),flush=True)
except Exception as e:
 report['status']='failed';report['error']=str(e)
 if originalBytes is not None and heroFile is not None:heroFile.write_bytes(originalBytes)
 raise
finally:
 save()
 if p.poll() is None:os.killpg(p.pid,signal.SIGTERM)
 try:p.wait(timeout=5)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL)
 log.close()

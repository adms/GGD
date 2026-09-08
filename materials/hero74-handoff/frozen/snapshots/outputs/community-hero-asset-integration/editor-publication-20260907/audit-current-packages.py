from pathlib import Path
import json,zipfile,hashlib
r=Path('/private/tmp/ggd-community37-editor-publish');recipes=Path('../GGD社群英雄上傳內容_37名/recipes');data=Path('/private/tmp/ggd-model-upload-acceptance/data')
snapshots={}
for f in(data/'hero-submission-snapshots').glob('*.json'):
 d=json.loads(f.read_text())
 if isinstance(d,dict)and d.get('id'):snapshots[d['id']]=d
rows=[]
for n in range(1,38):
 p=r/f'{n:02}';a=json.loads((p/'author.json').read_text());assert a['status']=='submitted',(n,a['status']);archive=Path(a['downloadPath']);recipe=json.loads((recipes/f'{n:02}.upload-recipe.json').read_text())
 with zipfile.ZipFile(archive)as z:
  assert z.testzip()is None;m=json.loads(z.read('manifest.json'));pr=json.loads(z.read('authoring/hero-projects/'+a['projectId']+'.json'));replay=json.loads(z.read('validation/hero-simulation.json'))['replay'];s=pr['sourceDesign']
  assert s['name']==pr['brief']['name']==recipe['displayName'];assert s['ownerText']==recipe['sourceOwnerText'];assert s['reviewText']==recipe['reviewText']
  for slot in recipe['slots']:
   actual=s['slots'][slot['slot']]
   for k in ['name','ownerDescription','requiredRefinement','refinementContracts']:assert actual[k]==slot[k],(n,slot['slot'],k)
   assert replay['compiled']['abilityDrafts'][slot['slot']]['name']==slot['name'],(n,slot['slot'],'compiled name')
  assert len(replay['scenarios'])==6 and replay['kit']['status']=='accepted'and not replay['errors'];assert any(f.endswith('.glb')for f in z.namelist())
  matching=[v for v in snapshots.values()if v['workId']==a['projectId']and v['version']['packageDigest']==m['packageDigest']];assert len(matching)==1,(n,'snapshot missing or ambiguous');snap=matching[0]
  assert snap['inspection']['project']==pr
  rows.append({'number':n,'name':a['name'],'revision':pr['revision'],'base':m['base'],'submissionId':snap['id'],'packageDigest':m['packageDigest'],'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'ownerTextAndSixSlotSourceExact':True,'requiredRefinementsExact':True,'sixSlotKitAccepted':True,'modelPayloadPresent':True,'archive':str(archive)})
assert len({x['base']['contentVersion']for x in rows})==1
(r/'current-package-audit.json').write_text(json.dumps({'status':'verified','heroCount':37,'slotCount':222,'rows':rows},ensure_ascii=False,indent=2)+'\n')
print('Verified 37 current-target ZIPs / 222 named slots / complete source text / actual immutable submissions; target',rows[0]['base'])

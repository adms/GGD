from pathlib import Path
import json,zipfile,sys,hashlib
r=Path('/private/tmp/ggd-community37-editor-publish');data=Path('/private/tmp/ggd-model-upload-acceptance/data')
snapshots={}
for p in (data/'hero-submission-snapshots').glob('*.json'):
 d=json.loads(p.read_text())
 if isinstance(d,dict)and d.get('id'):snapshots[d['id']]=d
for arg in sys.argv[1:]:
 n=f'{int(arg):02}';p=r/n;oldreview=json.loads((p/'compatibility-baseline/review.json').read_text());sid=oldreview['url'].split('heroReview=')[1];digest=snapshots[sid]['version']['packageDigest'];old=None
 for f in (p/'compatibility-baseline').glob('*.zip'):
  with zipfile.ZipFile(f)as z:
   if json.loads(z.read('manifest.json'))['packageDigest']==digest:old=f;break
 assert old is not None,('missing active published archive',n,digest)
 author=json.loads((p/'author.json').read_text());new=Path(author.get('downloadPath',p/author['downloadFile']))
 with zipfile.ZipFile(old)as a,zipfile.ZipFile(new)as b:
  assert set(a.namelist())==set(b.namelist()),('entry set changed',n)
  runtime=[s for s in a.namelist()if s not in ['manifest.json','validation/hero-simulation.json']]
  changed=[s for s in runtime if a.read(s)!=b.read(s)]
  assert not changed,('content changed, full review required',n,changed)
  ar=json.loads(a.read('validation/hero-simulation.json'));br=json.loads(b.read('validation/hero-simulation.json'))
  assert ar['replay']==br['replay'],('simulation changed, full review required',n)
  manifest=json.loads(b.read('manifest.json'))
  proof={'status':'verified-equivalent','oldSubmissionId':sid,'oldArchive':str(old),'newArchive':str(new),'newPackageDigest':manifest['packageDigest'],'newBase':manifest['base'],'identicalSourceRuntimeAssetEntries':len(runtime),'identicalSixSlotAndKitReplay':True,'scope':'Only manifest and simulation baseline metadata may differ; all authoring, compiled documents and assets match the published version byte for byte.'}
  (p/'rebase-equivalence.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(n,'equivalent',len(runtime),'entries')

"""Functional admission checks using real staged resources; never modifies ready bytes."""
import importlib.util,json,shutil,subprocess,tempfile,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('admission',ROOT/'tools/admit.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
checks=[]
def reject(bundle,fragment):
 try:m.validate(bundle)
 except (ValueError,KeyError) as e:
  assert fragment in str(e),(fragment,str(e));checks.append(dict(check=fragment,result='rejected'))
 else:raise AssertionError('Invalid bundle admitted')
source=ROOT/'staging/ggd-vfx-community37';before=hashlib.sha256((ROOT/'catalog.json').read_bytes()).hexdigest()
with tempfile.TemporaryDirectory() as t:
 temp=Path(t)
 b=temp/'missing';shutil.copytree(source,b);texture=next((b/'content/assets').rglob('*.png'));texture.unlink();reject(b,'Missing or escaping dependency')
 b=temp/'schema';shutil.copytree(source,b);p=next((b/'content/vfx').glob('*.json'));d=m.read(p);d['burstCount']=-1;m.write(p,d);reject(b,'GGD schema validation failed')
 b=temp/'raw';shutil.copytree(source,b);(b/'content/unconverted.efc').write_bytes(b'native');reject(b,'Undeclared bundle files')
 doc=m.read(ROOT.parent/'outputs/community-lol-models-20260907/forge-preview/model-docs/community.lol.lux.json') if (ROOT.parent/'outputs/community-lol-models-20260907/forge-preview/model-docs/community.lol.lux.json').exists() else next(m.read(p) for p in (ROOT.parent/'outputs/community-lol-models-20260907/forge-preview/model-docs').glob('*.json') if m.read(p)['id']=='community.lol.lux')
 try:m.glb(ROOT.parent/'outputs/community-lol-models-20260907/ggd-runtime-candidate/lux.glb',doc['clipMap'])
 except ValueError as e:assert 'fallback/alias' in str(e),str(e);checks.append(dict(check='hurt mapped to idle',result='rejected'))
 else:raise AssertionError('Fallback admitted')
 # Query sees no modified bundle, using an isolated copy of the library.
 copy=temp/'query-library';copy.mkdir();shutil.copytree(ROOT/'tools',copy/'tools');shutil.copytree(ROOT/'ready',copy/'ready')
 for name in ['catalog.json','policy.json','query.py']:shutil.copyfile(ROOT/name,copy/name)
 entry=m.read(copy/'catalog.json')['entries'][0];p=next((copy/entry['path']/'content/vfx').glob('*.json'));p.write_text(p.read_text()+' ')
 q=json.loads(subprocess.check_output(['python3',str(copy/'query.py')]));assert q['total']==0 and q['rejected_bundles'];checks.append(dict(check='modified ready file',result='hidden from query'))
q=json.loads(subprocess.check_output(['python3',str(ROOT/'query.py')]));assert q['total']==60 and not q['rejected_bundles'];checks.append(dict(check='standardized VFX query',result=60))
q=json.loads(subprocess.check_output(['python3',str(ROOT/'query.py'),'莉娜','--pending']));assert q['total']==2 and all(x['status']=='pending_standardization' for x in q['results']);checks.append(dict(check='Lina remains pending',result=2))
assert hashlib.sha256((ROOT/'catalog.json').read_bytes()).hexdigest()==before
m.write(ROOT/'gate-verification.json',dict(status='passed',checks=checks,catalog_unchanged_by_negative_checks=True))
print(json.dumps(checks,ensure_ascii=False,indent=2))

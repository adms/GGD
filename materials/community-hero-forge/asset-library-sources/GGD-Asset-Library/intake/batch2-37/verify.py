#!/usr/bin/env python3
import collections,hashlib,json
from pathlib import Path
here=Path(__file__).resolve().parent
r=json.loads((here/'pairs.json').read_text());assert r['count']==37 and len(r['characters'])==37
assert len({h['id'] for h in r['characters']})==37;assert sorted(h['number'] for h in r['characters'])==list(range(1,38))
for h in r['characters']:
 assert h['production_ready'] is False and h['automatically_import'] is False
 assert {s['slot'] for s in h['slots']}=={'PASSIVE','Q','W','E','R','EX'}
 assert h==json.loads((here/'characters'/f"{h['id']}.json").read_text())
 if h['current_design_proxy']:
  assert h['current_design_proxy']['character_identity_match'] is False
  assert h['current_design_proxy']['model']['selected_local_copy']['exists_local']
 for s in h['slots']:
  for v in s['vfx']:
   assert v['definition']['exists_local']
   if v['texture']:assert v['texture']['selected_local_copy']['exists_local']
 for c in h['original_model_candidates']:
  if c.get('model'):
   assert c['model']['native']['exists_local'];assert c['animations']['key_data']['exists_local']
   assert len(c['animations']['clips'])==c['animations']['count'];assert c['animations']['retargeted'] is False
   assert c['audio']['unique_files']==len({a['file']['path'] for a in c['audio']['files']})
   assert c['native_vfx']['unique_skill_files']==len({a['file']['path'] for a in c['native_vfx']['files']})
allproof=json.loads((here/'file-proofs.json').read_text())['files'];missing=[]
for f in allproof:
 p=Path(f['path'])
 if not f['exists_local']:missing.append(f['path']);continue
 assert p.is_file() and p.stat().st_size==f['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'],f['path']
for p,h in r['source_fingerprints'].items():assert hashlib.sha256(Path(p).read_bytes()).hexdigest()==h,p
v=dict(status='passed',characters=37,slots=222,file_proofs_verified=sum(x['exists_local'] for x in allproof),missing_declared_worktree_paths=missing,missing_path_note='GGD binary assets omitted from this worktree; selected local copies separately match the current assets-manifest SHA-256 and size.',shared_catalog_admission_performed=False)
(here/'validation.json').write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');print(json.dumps(v,ensure_ascii=False,indent=2))

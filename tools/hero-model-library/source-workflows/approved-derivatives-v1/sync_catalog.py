#!/usr/bin/env python3
"""Point the canonical derivative source record at the accepted Mai candidate."""
from hashlib import sha256
from pathlib import Path
import argparse,json

ROOT=Path(__file__).resolve().parents[4]
def read(path):return json.loads(path.read_text())
def encoded(value):return json.dumps(value,ensure_ascii=False,indent=2)+'\n'
def digest(path):return sha256(path.read_bytes()).hexdigest()
def build():
 evidence=read(ROOT/'materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-decimation-acceptance.json');candidate=evidence['candidate']
 source_doc_path=ROOT/candidate['sourceModelDocumentPath'];source_doc=read(source_doc_path);asset=ROOT/'content'/source_doc['glbPath']
 assert source_doc['id']==candidate['sourceModelKey'] and digest(asset)==candidate['sha256'] and asset.stat().st_size==candidate['bytes']
 manifest_path=ROOT/'materials/hero-model-library/manifest.json';manifest=read(manifest_path);model=next(x for x in manifest['models'] if x['id']=='derivative:mai')
 model.update(modelKey=source_doc['id'],glbPath=source_doc['glbPath'],sha256=candidate['sha256'],bytes=candidate['bytes'],documentSha256=digest(source_doc_path),gitPath='content/'+source_doc['glbPath'],sourceCharacter='不知火舞（獨立副本／真田幸村，7,994 面正式版）',clipMap=source_doc['clipMap'],validation='hard-policy-khronos-rig-and-static-webgl-ab-accepted')
 limitations=[x for x in model.get('limitations',[]) if not x.startswith('舊 13,796 面改色副本保留')]
 limitations.append('舊 13,796 面改色副本保留；本模型是 7,994 面獨立完整副本，已通過現行正式採用規則、骨架保留與固定鏡頭三視圖 A/B。')
 model['limitations']=limitations;model['acceptanceEvidence']='materials/hero-model-library/priority-evidence/approved-derivatives-v1/mai-decimation-acceptance.json'
 hero=next(x for x in manifest['heroes'] if x['id']=='community-review-03-20260907');option=next(x for x in hero['options'] if x['sourceId']=='derivative:mai');option['sourceModelKey']=source_doc['id'];option['label']=model['sourceCharacter'];option['source']['character']=model['sourceCharacter']
 policy_path=ROOT/'materials/hero-model-library/default-policy.json';policy=read(policy_path);approved=next(x for x in policy['approvedDerivatives'] if x['sourceId']=='derivative:mai');approved.update(modelKey=source_doc['id'],sha256=candidate['sha256'],source=model['sourceCharacter'])
 return {manifest_path:encoded(manifest),policy_path:encoded(policy)}
def main():
 p=argparse.ArgumentParser();p.add_argument('--check',action='store_true');a=p.parse_args();outputs=build()
 for path,value in outputs.items():
  if a.check:assert path.read_text()==value,f'stale: {path}'
  else:path.write_text(value)
 print(json.dumps({'status':'current' if a.check else 'updated','files':len(outputs)},ensure_ascii=False))
if __name__=='__main__':main()

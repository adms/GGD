#!/usr/bin/env python3
"""Freeze the current read-only access state for priority Windows game sources."""
import argparse,datetime,gzip,hashlib,json,subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[4]
INDEX=ROOT/'materials/hero-model-library/source-inventories/windows-game-library.json.gz'
OUT=ROOT/'materials/hero-model-library/priority-evidence/priority-game-sources-20260914/source-access.json'
IDS={
 'jump-force':['steam:816020'], 'jump-crossover':['windows-rom-scan:0663','windows-rom-scan:0664'],
 'kof':['steam:222440','steam:571260'], 'fate-unlimited-codes':['windows-rom-scan:0607','windows-rom-scan:0608'],
 'ssbu-nsandns2':['windows-rom-scan:0587','windows-rom-scan:0588','windows-rom-scan:0589'],
}
def digest(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def build():
 d=json.loads(gzip.decompress(INDEX.read_bytes()));rows={x['id']:x for x in d['steamGames']+d['romCandidates']}
 mounts=subprocess.run(['mount'],capture_output=True,text=True,check=True).stdout
 mounted={'common':Path('/Volumes/common').is_dir(),'game':Path('/Volumes/game').is_dir()}
 groups=[]
 for group,ids in IDS.items():
  records=[]
  for id in ids:
   r=rows[id];container=r.get('containerInventory',{})
   records.append({'id':id,'title':r['title'],'platform':r['platform'],'sourcePath':r['sourcePath'],
    'recordedBytes':r.get('sizeBytes',container.get('logicalFileBytes')),
    'recordedFileCount':container.get('fileCount'),'recordedAssetContainerCandidates':container.get('assetContainerCandidateCount'),
    'payloadBytesRead':container.get('payloadBytesRead',0),'contentInspected':False,'payloadSha256':r.get('contentHash'),
    'extractionStatus':r['extractionStatus'],'conversionStatus':r['conversionStatus'],'integrationStatus':r['integrationStatus'],
    'accessNow':'readable' if (mounted['common'] if id.startswith('steam:') else mounted['game']) else 'blocked-share-not-mounted'})
  groups.append({'group':group,'records':records})
 return {'schema':'ggd.priority-windows-game-source-access@1','observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
  'sourceInventory':{'gitPath':INDEX.relative_to(ROOT).as_posix(),'bytes':INDEX.stat().st_size,'sha256':digest(INDEX)},
  'mountSnapshot':{'volumes':mounted,'relevantSmbLines':[x for x in mounts.splitlines() if 'smbfs' in x and ('/common ' in x or '/game ' in x)]},
  'groups':groups,'summary':{'records':sum(len(x['records']) for x in groups),'payloadBytesRead':0,'contentInspected':0,
   'extracted':0,'converted':0,'registered':0,'blockedByMissingCommon':3,'blockedByMissingGame':7},
  'limitation':'This is an inventory and access receipt. Missing mounts prevent fresh payload reads; file names, sizes and old container counts do not prove extraction or usable assets.'}
def check(d):
 assert digest(ROOT/d['sourceInventory']['gitPath'])==d['sourceInventory']['sha256']
 assert d['summary']=={'records':10,'payloadBytesRead':0,'contentInspected':0,'extracted':0,'converted':0,'registered':0,'blockedByMissingCommon':3,'blockedByMissingGame':7}
 assert {x['group']:len(x['records']) for x in d['groups']}=={k:len(v) for k,v in IDS.items()}
 assert all(r['payloadBytesRead']==0 and not r['contentInspected'] and r['extractionStatus']=='not-started' and r['conversionStatus']=='not-started' and r['integrationStatus']=='not-registered' for g in d['groups'] for r in g['records'])
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--write',action='store_true');a=p.parse_args()
 if a.write:
  d=build();OUT.parent.mkdir(parents=True,exist_ok=True);OUT.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
 else:d=json.loads(OUT.read_text())
 check(d);print(json.dumps({'ok':True,**d['summary'],'mountSnapshot':d['mountSnapshot']['volumes']},ensure_ascii=False))

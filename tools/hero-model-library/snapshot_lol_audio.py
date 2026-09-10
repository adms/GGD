#!/usr/bin/env python3
"""Publish an immutable checkpoint of fully decoded LoL packages into the shared catalog.

Run after decode_lol_audio.py has completed one or more packages, then rebuild
inventory.py and voice_index.py. Other active package outputs are excluded.
"""
import argparse,datetime,hashlib,json
from pathlib import Path
repo=Path(__file__).resolve().parents[2];ws=repo.parent;root=ws/'GGD-Asset-Library/intake/local-lol-audio-20260910';dp=repo/'materials/hero-model-library/download-sources.json';d=json.loads(dp.read_text());models=json.loads((repo/'materials/hero-model-library/manifest.json').read_text());names={m['id']:m.get('sourceCharacter') for m in models['models']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--refresh-published',action='store_true',help='Rebuild only the previously published complete packages.');args=parser.parse_args()
previous=next((s for s in d['publicSources'] if s['id']=='local-lol-decoded-audio'),None)
published_ids={g['id'] for g in previous.get('audioGroups',[])} if previous else set()
files=[];groups=[];receipts=[];failures=[]
for path in sorted((root/'decoded').glob('*/decoding.json')):
 native=path.parent.name
 if args.refresh_published and native not in published_ids:continue
 r=json.loads(path.read_text());extraction=json.loads((root/'packages'/native/'extraction.json').read_text());media={f['path']:f for f in extraction['media']};sid='lol:'+native.split('.')[0].lower();rows=[]
 for f in r['files']:
  if not f['decoded']:failures.append(dict(nativeId=native,source=f['source'],error=f.get('error')));continue
  p=path.parent/f['output'];assert p.stat().st_size==f['bytes'] and sha(p)==f['sha256']
  source=root/'packages'/native/'media'/f['source'];assert sha(source)==f['sourceSha256']
  rows.append(dict(path=p.relative_to(root).as_posix(),sha256=f['sha256'],bytes=f['bytes'],seconds=f['pcm']['seconds'],sourceBank='packages/'+native+'/'+media['media/'+f['source']]['sourceBank'],sourceWemPath=str(source.relative_to(root)),sourceSha256=f['sourceSha256'],sampleFormat='float32',category='unclassified',synthesisReady=False))
 files+=rows
 ids=sorted(h['id'] for h in models['heroes'] if any(o['sourceId']==sid and o['source']['kind']=='exact' for o in h['options']))
 groups.append(dict(id=native,name='LOL／'+(names.get(sid) or native.split('.')[0])+'／'+('繁中命名語系包' if native.endswith('.zh_TW') else '共用音效包'),heroIds=ids,pathPrefixes=[path.parent.relative_to(root).as_posix()+'/wav/'],reportedLanguage='zh-TW' if native.endswith('.zh_TW') else None))
 receipts.append(dict(path=path.relative_to(root).as_posix(),sha256=sha(path),decodedCount=r['decodedCount'],failedCount=r['failedCount']))
assert files
stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');path=root/'deliveries'/('decoded-'+stamp+'.json');r=dict(schema='ggd-lol-decoded-audio-delivery@1',immutable=True,files=files,audioGroups=groups,decodingReports=receipts,failures=failures,totals=dict(packageCount=len(groups),wavFiles=len(files),failedMedia=len(failures)),synthesisReady=False)
with path.open('x') as f:f.write(json.dumps(r,ensure_ascii=False,indent=2)+'\n')
source=next((s for s in d['publicSources'] if s['id']=='local-lol-decoded-audio'),None)
if source is None:
 source={k:v for k,v in next(s for s in d['publicSources'] if s['id']=='local-lol-installed-audio').items() if k not in ['nativeAudioIndex','extractionReports','audioFileIndex','audioAcquisition']};source.update(id='local-lol-decoded-audio',target='LOL 本機已解碼音訊（持續追加完整交付）',format='IEEE Float32 WAV');d['publicSources'].append(source)
else:source.setdefault('audioFileIndexHistory',[]).append(source['audioFileIndex'])
source.update(audioFileIndex=dict(reportPath=path.relative_to(root).as_posix(),reportSha256=sha(path)),audioGroups=groups,audioAcquisition=r['totals'],verification=f'{len(groups)}個完整 WAD 音訊轉換交付，共{len(files)}個Float32 WAV；原取樣率／聲道／frame核對，SHA已重新驗證。未逐段聽審；其他原生媒體仍分批轉換，不等待S3。')
dp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n');print(json.dumps(dict(manifest=str(path),sha256=sha(path),**r['totals'])))

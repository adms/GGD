#!/usr/bin/env python3
"""Look up character audio reserves without downloading assets or invoking synthesis."""
import argparse
import gzip
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]/'materials/hero-model-library'


def read_voice_files(data,root=ROOT):
    blob=(root/data['sourceFileManifest']).read_bytes()
    assert hashlib.sha256(blob).hexdigest()==data['sourceFileManifestSha256'],'File manifest changed; rebuild voice index'
    encoding=data.get('sourceFileEncoding','jsonl')
    if encoding=='gzip':
        blob=gzip.decompress(blob)
        assert hashlib.sha256(blob).hexdigest()==data['uncompressedFileManifestSha256']
    elif encoding!='jsonl':raise ValueError('Unsupported voice manifest encoding')
    return (json.loads(line) for line in blob.splitlines() if line)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('query',nargs='?',default='')
    parser.add_argument('--files',action='store_true',help='Include matching per-file hashes and archive members.')
    parser.add_argument('--json',action='store_true')
    args=parser.parse_args()
    if args.files and not args.query:parser.error('--files requires a character or exact group ID')
    data=json.loads((ROOT/'voice-index.json').read_text());q=args.query.casefold()
    exact=[g for g in data['groups'] if q in [g['id'].casefold()]+[a.casefold() for a in g.get('aliasGroupIds',[])]]
    groups=exact or [g for g in data['groups'] if q in json.dumps([g['id'],g['name'],g['heroIds'],g.get('work',''),g.get('candidateCharactersFromDefinitionPrefix',[]),g.get('aliasGroupIds',[])],ensure_ascii=False).casefold()]
    groups=sorted(groups,key=lambda g:(g.get('languagePreferenceRank',3),g['id']))
    leads=[s for s in data.get('audioSourceLeads',[]) if q in json.dumps(
        [s['id'],s['target'],s['heroIds']],ensure_ascii=False).casefold()]
    native=[s for s in data.get('nativeAudioSources',[]) if q in json.dumps(
        [s['id'],s['name'],s['heroIds']],ensure_ascii=False).casefold()]
    ids={g['id'] for g in groups};backup_ids={b for g in groups for b in g['backupIds']}
    backup_ids.update(s['backupId'] for s in native)
    workspace=Path(data.get('localWorkspace',ROOT.parents[2]))
    result=dict(groups=groups,sourceLeads=leads,nativeAudioSources=native,backups={k:v for k,v in data['backups'].items() if k in backup_ids},
                localWorkspace=str(workspace),localUseRequiresS3=False,languagePreference=data.get('languagePreference',[]),synthesisContract=data['synthesisContract'])
    if args.files:
        result['files']=[r for r in read_voice_files(data) if r['groupId'] in ids]
        order={g['id']:i for i,g in enumerate(groups)}
        result['files'].sort(key=lambda r:(order[r['groupId']],r['path']))
        for row in result['files']:row['absolutePath']=str(workspace/row['path'])
    for source in native:
        for row in source['files']:row['absolutePath']=str(workspace/row['path'])
    if args.json:print(json.dumps(result,ensure_ascii=False,indent=2))
    else:
        for g in groups:print(f'{g["id"]} | {g["name"]} | {g["fileCount"]} audio files | 說話者／語言／合成輸入尚未驗收')
        for s in leads:print(f'{s["id"]} | {s["target"]} | 尚未取得 | {s["accessStatus"]}')
        for s in native:print(f'{s["id"]} | {s["name"]} | {s["bankFileCount"]} 原生音訊庫 | 待解碼／聽審')
        for f in result.get('files',[]):print(f'{f["sha256"]}  {f["absolutePath"]}')
    return 0 if groups or leads or native else 1


if __name__=='__main__':raise SystemExit(main())

#!/usr/bin/env python3
"""Resolve frozen BNK prefetch fragments to byte-identical complete WPK streams.

This writes a correspondence receipt only. It never modifies the source reports,
repairs a RIFF header, or creates/counts another decoded performance.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def exact_prefetch(short, complete):
    if len(short)<12 or short[:4]!=b'RIFF' or short[8:12]!=b'WAVE':
        return False
    declared=struct.unpack_from('<I',short,4)[0]+8
    return len(short)<declared==len(complete) and complete.startswith(short)


def resolve(root, workspace, delivery=None):
    records=[];unresolved=[]
    frozen=None
    if delivery is not None:
        frozen={row['path']:row['sha256'] for row in json.loads(delivery.read_text())['decodingReports']}
    paths=[root/path for path in frozen] if frozen is not None else (root/'decoded').glob('*/decoding.json')
    for dp in sorted(paths):
        assert dp.resolve().is_relative_to(root.resolve())
        if frozen is not None:
            relative=dp.relative_to(root).as_posix()
            assert digest(dp)==frozen[relative], 'Frozen decoding report changed: '+relative
        report=json.loads(dp.read_text());home=root/'packages'/dp.parent.name
        failed=[f for f in report['files'] if not f.get('decoded') and 'RIFF length' in f.get('error','')]
        if not failed:continue
        ep=home/'extraction.json';extraction=json.loads(ep.read_text())
        by_path={f['path']:f for f in extraction['media']}
        decoded={f['source']:f for f in report['files']}
        for failure in failed:
            fragment=by_path['media/'+failure['source']];short_path=home/fragment['path']
            short=short_path.read_bytes();assert digest(short_path)==fragment['sha256']==failure['sourceSha256']
            matches=[]
            for full in extraction['media']:
                if not full['sourceBank'].endswith('.wpk'):continue
                if full['mediaId'].removesuffix('.wem')!=fragment['mediaId'].removesuffix('.wem'):continue
                full_path=home/full['path'];complete=full_path.read_bytes()
                assert len(complete)==full['bytes'] and digest(full_path)==full['sha256']
                if not exact_prefetch(short,complete):continue
                wav=decoded.get(full['path'].removeprefix('media/'),{})
                if not wav.get('decoded') or wav['sourceSha256']!=full['sha256']:continue
                target=dp.parent/wav['output']
                assert target.stat().st_size==wav['bytes'] and digest(target)==wav['sha256']
                matches.append(dict(completeSourcePath=full_path.relative_to(workspace).as_posix(),
                    completeSourceSha256=full['sha256'],completeSourceBytes=full['bytes'],
                    completeSourceBank=full['sourceBank'],path=target.relative_to(workspace).as_posix(),
                    sha256=wav['sha256'],bytes=wav['bytes']))
            if len(matches)!=1:
                unresolved.append(dict(nativeId=dp.parent.name,source=failure['source'],
                    reason='Require one exact complete WPK stream with verified decoded output',matches=len(matches)))
                continue
            records.append(dict(nativeId=dp.parent.name,groupId='local-lol-decoded-audio:'+dp.parent.name,
                mediaId=fragment['mediaId'].removesuffix('.wem'),fragmentPath=short_path.relative_to(workspace).as_posix(),
                fragmentSha256=fragment['sha256'],fragmentBytes=len(short),fragmentSourceBank=fragment['sourceBank'],
                extractionReport=ep.relative_to(workspace).as_posix(),extractionReportSha256=digest(ep),
                decodingReport=dp.relative_to(workspace).as_posix(),decodingReportSha256=digest(dp),
                byteExactPrefixVerified=True,completeRiffLengthVerified=True,alreadyCountedPrimaryAudio=True,
                originalFailureReportRetained=True,**matches[0]))
    result=dict(schema='ggd-lol-prefetch-resolution@1',sourceId='local-lol-decoded-audio',
        inputIntake=root.relative_to(workspace).as_posix(),records=records,unresolved=unresolved,
        resolvedCount=len(records),newAudioFiles=0,originalFilesChanged=False)
    if delivery is not None:
        result['frozenDelivery']={'path':delivery.relative_to(root).as_posix(),'sha256':digest(delivery)}
    return result


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--intake',type=Path,required=True);p.add_argument('--workspace',type=Path,required=True)
    p.add_argument('--delivery',type=Path,help='Restrict correspondence to this immutable completed-package delivery.')
    p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    data=resolve(a.intake.resolve(),a.workspace.resolve(),a.delivery.resolve() if a.delivery else None)
    with a.output.open('x') as f:f.write(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(output=str(a.output),sha256=digest(a.output),resolved=data['resolvedCount'],unresolved=len(data['unresolved']))))


if __name__=='__main__':main()

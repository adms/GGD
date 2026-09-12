#!/usr/bin/env python3
"""Upload a frozen archive as resumable S3 objects, with full per-part readback.

Only vibe-coding / ap-east-2 and the authorized legacy bucket are used. This
creates a separate receipt; catalog publication is a subsequent checked step.
No credentials, profile configuration, IAM, ACL or deletion operations occur.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[2]
BUCKET = 'ggd-390630837668-ap-east-2-an'
AWS = ['aws','--profile','vibe-coding','--region','ap-east-2','--no-cli-pager']


def digest(path, aggregate=None):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1 << 20), b''):
            h.update(block)
            if aggregate is not None:aggregate.update(block)
    return h.hexdigest()


def aws_call(operation, key, extra, missing_ok=False):
    result = subprocess.run(AWS+['s3api',operation,'--bucket',BUCKET,'--key',key]+extra,
                            capture_output=True,text=True)
    if result.returncode:
        if missing_ok and ('NoSuchKey' in result.stderr or '(404)' in result.stderr):
            return None
        # AccessDenied is never retried through another profile or permission.
        raise RuntimeError(f'{operation} s3://{BUCKET}/{key}: {result.stderr.strip()}')
    return json.loads(result.stdout or '{}')


def store_and_verify(path, key, expected, work, aggregate=None):
    downloaded = work/'readback.bin'
    response = aws_call('get-object',key,[str(downloaded)],missing_ok=True)
    reused = response is not None
    if response is None:
        response = aws_call('put-object',key,['--body',str(path),'--content-type','application/octet-stream',
                            '--checksum-sha256',base64.b64encode(bytes.fromhex(expected)).decode()])
        aws_call('get-object',key,[str(downloaded)])
    if downloaded.stat().st_size != path.stat().st_size or digest(downloaded,aggregate) != expected:
        raise ValueError('S3 readback mismatch: '+key)
    return dict(s3Uri=f's3://{BUCKET}/{key}',bytes=path.stat().st_size,sha256=expected,
                readbackVerified=True,reusedExisting=reused)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_id')
    parser.add_argument('--workspace',type=Path,required=True)
    parser.add_argument('--part-mib',type=int,default=256,choices=[64,128,256,512])
    args = parser.parse_args()
    ws = args.workspace.resolve()
    index = json.loads((REPO/'materials/hero-model-library/public-source-files.json').read_text())
    sources = json.loads((REPO/'materials/hero-model-library/download-sources.json').read_text())
    source = next(s for s in sources.get('publicSources',[])+sources.get('paidSources',[]) if s['id']==args.source_id)
    pending = source['pendingBackup']
    row = next(r for r in index['pendingUploads'] if r['id']==args.source_id and r['sha256']==pending['sha256'])
    archive = (ws/row['localArchive']).resolve()
    if not archive.is_relative_to(ws) or archive.stat().st_size != row['bytes'] or digest(archive) != row['sha256']:
        raise ValueError('Frozen local archive must match the current pending record')
    prefix = row['plannedS3Uri'].removeprefix(f's3://{BUCKET}/')
    if not prefix.startswith('legacy/') or not prefix.endswith('/'+row['sha256']+'.zip'):
        raise ValueError('Unexpected bucket, namespace or archive identity')
    prefix = prefix[:-4]+('/split' if args.part_mib==256 else f'/split-{args.part_mib}mib')
    arn = subprocess.check_output(AWS+['sts','get-caller-identity','--query','Arn','--output','text'],text=True).strip()
    if 'assumed-role/vibe-coding-s3-role/' not in arn:raise ValueError('Unexpected AWS role; stopped')
    home = archive.parent/('split-'+row['sha256'])
    home.mkdir(exist_ok=True)
    parts = []
    whole = hashlib.sha256()
    with tempfile.TemporaryDirectory(prefix='transfer-',dir=home) as tmp,archive.open('rb') as source_file:
        work = Path(tmp)
        while blob := source_file.read(args.part_mib*(1 << 20)):
            number = len(parts)+1
            local = work/'part.bin'
            local.write_bytes(blob)
            expected = hashlib.sha256(blob).hexdigest()
            part = store_and_verify(local,f'{prefix}/archive.zip.part-{number:05d}',expected,work,whole)
            part['number']=number
            parts.append(part)
            progress=dict(id=args.source_id,archiveSha256=row['sha256'],archiveBytes=row['bytes'],
                          verifiedParts=parts,complete=False)
            (home/'progress.json').write_text(json.dumps(progress,indent=2)+'\n')
            print(json.dumps(dict(part=number,bytes=part['bytes'],readbackVerified=True)),flush=True)
    if whole.hexdigest()!=row['sha256'] or sum(p['bytes'] for p in parts)!=row['bytes']:
        raise ValueError('Ordered S3 parts differ from the original archive')
    manifest=dict(schema='ggd-split-archive@1',type='split-zip',id=args.source_id,
                  archiveName=archive.name,archiveBytes=row['bytes'],archiveSha256=row['sha256'],
                  parts=[{k:v for k,v in part.items() if k!='reusedExisting'} for part in parts],
                  restore='Fetch all parts, verify each SHA-256, concatenate in numeric order, verify archiveSha256, then open the ZIP.',
                  originalLocalArchive=row['localArchive'])
    path=home/'manifest.json';path.write_text(json.dumps(manifest,indent=2)+'\n')
    with tempfile.TemporaryDirectory(prefix='manifest-readback-',dir=home) as tmp:
        manifest_receipt=store_and_verify(path,prefix+'/manifest-'+digest(path)+'.json',digest(path),Path(tmp))
    receipt=dict(id=args.source_id,type='split-zip',s3Uri=manifest_receipt['s3Uri'],
                 s3ObjectSha256=manifest_receipt['sha256'],sha256=row['sha256'],bytes=row['bytes'],
                 parts=parts,readbackVerified=True,orderedArchiveReadbackVerified=True,
                 originalLocalArchive=row['localArchive'],restore=manifest['restore'])
    final=home/'verified-receipt.json';final.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(dict(receiptPath=str(final),sha256=digest(final),complete=True)),flush=True)


if __name__=='__main__':main()

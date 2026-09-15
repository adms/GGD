#!/usr/bin/env python3
"""Upload one registered frozen ZIP and write a receipt without editing catalogs.

Uses only the authorized profile/bucket. Originals remain local. A full GetObject
SHA-256 readback, not merely a successful PutObject, is required for the receipt.
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from upload_split_backup import AWS, BUCKET, REPO, digest, store_and_verify


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source_id')
    parser.add_argument('--workspace',type=Path,required=True)
    args=parser.parse_args()
    ws=args.workspace.resolve()
    data=json.loads((REPO/'materials/hero-model-library/download-sources.json').read_text())
    index=json.loads((REPO/'materials/hero-model-library/public-source-files.json').read_text())
    source=next(s for s in data.get('publicSources',[])+data.get('paidSources',[]) if s['id']==args.source_id)
    pending=source['pendingBackup']
    row=next(r for r in index['pendingUploads'] if r['id']==args.source_id and r['sha256']==pending['sha256'])
    path=(ws/row['localArchive']).resolve()
    if not path.is_relative_to(ws) or path.stat().st_size!=row['bytes'] or digest(path)!=row['sha256']:
        raise ValueError('Frozen archive identity mismatch')
    if row['bytes']>=5_000_000_000:
        raise ValueError('Use upload_split_backup.py for large archives')
    uri=row['plannedS3Uri'];key=uri.removeprefix(f's3://{BUCKET}/')
    allowed=[f'legacy/{kind}/{args.source_id}/{row["sha256"]}.zip' for kind in ['public-model-sources','paid-model-sources']]
    if uri!=f's3://{BUCKET}/{key}' or key not in allowed:
        raise ValueError('Unexpected bucket, namespace or archive identity')
    arn=subprocess.check_output(AWS+['sts','get-caller-identity','--query','Arn','--output','text'],text=True).strip()
    if 'assumed-role/vibe-coding-s3-role/' not in arn:
        raise ValueError('Unexpected AWS role; stopped')
    with tempfile.TemporaryDirectory(prefix='readback-',dir=path.parent) as tmp:
        receipt=store_and_verify(path,key,row['sha256'],Path(tmp))
    receipt.update(id=args.source_id,type='zip',originalLocalArchive=row['localArchive'],contentKind=row['contentKind'])
    out=path.with_name('verified-receipt-'+row['sha256']+'.json')
    out.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(dict(receiptPath=str(out),sha256=digest(out),complete=True)),flush=True)


if __name__=='__main__':main()

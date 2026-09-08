#!/usr/bin/env python3
"""Back up only reconciled gaps. Immutable parts; every PUT is GET/SHA verified."""
import argparse, concurrent.futures, gzip, hashlib, json, tarfile, tempfile, threading
from pathlib import Path
from backup_s3 import Parts, HashReader, digest
from publish_s3 import runaws, write, BUCKET
BASE=Path(__file__).resolve().parents[2]
REPORT=BASE/'GGD-Asset-Library/backups/outputs-20260909'
PREFIX='legacy/outputs/snapshots/20260909-full-reconciliation-v1/'
URI='s3://'+BUCKET+'/'+PREFIX

def records():
    selected={}
    for line in (REPORT/'coverage.jsonl').open():
        f=json.loads(line)
        if f['coverage']=='s3_pending':
            row=selected.setdefault(f['sha256'],dict(sha256=f['sha256'],bytes=f['bytes'],paths=[]))
            assert row['bytes']==f['bytes'];row['paths'].append(f['path'])
    return selected

def checked_source(row):
    p=BASE/row['paths'][0]
    if not p.resolve().is_relative_to(BASE/'outputs') or p.is_symlink():raise ValueError('Invalid source path')
    if p.stat().st_size!=row['bytes']:raise ValueError('Source size changed '+str(p))
    return p

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--publish',action='store_true');args=parser.parse_args()
    if not args.publish:parser.error('Authorized backup requires --publish')
    ident=json.loads(runaws(['sts','get-caller-identity','--output','json'],'sts:GetCallerIdentity','configured role'))
    if 'assumed-role/vibe-coding-s3-role/' not in ident.get('Arn',''):raise RuntimeError('STOP role mismatch '+ident.get('Arn','missing'))
    selected=records();folder=REPORT/'payload';folder.mkdir(exist_ok=True)
    verified=read_json(folder/'verified.json') if (folder/'verified.json').exists() else {}
    lock=threading.Lock();stop=threading.Event()
    def transfer(path,expected):
        target=URI+path.name
        if stop.is_set():raise RuntimeError('Stopped after prior transfer failure')
        try:
            if verified.get(path.name)==expected:return
            if digest(path)!=expected:raise ValueError('Local object hash mismatch')
            runaws(['s3','cp',str(path),target,'--only-show-errors'],'s3:PutObject',target)
            with tempfile.TemporaryDirectory() as tmp:
                dest=Path(tmp)/'readback'
                runaws(['s3','cp',target,str(dest),'--only-show-errors'],'s3:GetObject',target)
                if dest.stat().st_size!=path.stat().st_size or digest(dest)!=expected:raise ValueError('S3 GET mismatch '+target)
            with lock:
                verified[path.name]=expected;write(folder/'verified.json',verified)
                write(REPORT/'upload-progress.json',dict(status='uploading_and_verifying',verified_objects=len(verified),latest=path.name))
            print('GET_SHA256_VERIFIED '+path.name,flush=True)
        except BaseException:stop.set();raise
    if (folder/'manifest.json').exists():
        m=read_json(folder/'manifest.json')
        if m['coverage_sha256']!=digest(REPORT/'coverage.jsonl'):raise ValueError('Reconciliation changed; new snapshot required')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            jobs=[pool.submit(transfer,folder/p['path'],p['sha256']) for p in m['parts']]
            for job in jobs:job.result()
    else:
        (folder/'README.md').write_text('# Restricted outputs backup\n\nBackup only. No automatic use, restore, import or production catalog inclusion. Specific human authorization is required for use. Local originals are retained. This is a workflow boundary, not an IAM read restriction.\n')
        transfer(folder/'README.md',digest(folder/'README.md'))
        futures=[]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            def submit(path,r):
                if stop.is_set():raise RuntimeError('Stopped after prior transfer failure')
                while len(futures)>=4:futures.pop(0).result()
                futures.append(pool.submit(transfer,path,r['sha256']))
            parts=Parts(folder,submit)
            with (folder/'files.jsonl').open('w') as index, gzip.GzipFile(filename='',mode='wb',compresslevel=1,fileobj=parts,mtime=0) as gz:
                with tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT) as archive:
                    for i,row in enumerate(selected.values()):
                        p=checked_source(row);before=p.stat();member='sha256/'+row['sha256']
                        info=archive.gettarinfo(str(p),arcname=member);info.uid=info.gid=0;info.uname=info.gname=''
                        with p.open('rb') as f:
                            reader=HashReader(f);archive.addfile(info,reader)
                        after=p.stat()
                        if (before.st_size,before.st_mtime_ns)!=(after.st_size,after.st_mtime_ns) or reader.hash.hexdigest()!=row['sha256']:raise ValueError('Source changed during backup '+str(p))
                        index.write(json.dumps(dict(**row,member=member),ensure_ascii=False)+'\n')
                        if i%100==0:print('PACKED '+str(i+1)+'/'+str(len(selected)),flush=True)
            parts.finish()
            for f in futures:f.result()
        m=dict(schema='ggd-outputs-gap-backup@1',uri=URI,scope='backup_only',allow_automatic_consumption=False,requires_explicit_human_authorization=True,local_sources_preserved=True,coverage_sha256=digest(REPORT/'coverage.jsonl'),files_index='files.jsonl',files_index_sha256=digest(folder/'files.jsonl'),unique_files=len(selected),source_paths=sum(len(r['paths']) for r in selected.values()),unique_source_bytes=sum(r['bytes'] for r in selected.values()),parts=[dict(path=p['name'],bytes=p['bytes'],sha256=p['sha256']) for p in parts.parts])
        write(folder/'manifest.json',m)
    transfer(folder/'files.jsonl',digest(folder/'files.jsonl'))
    transfer(folder/'manifest.json',digest(folder/'manifest.json'))
    pointer=dict(schema='ggd-outputs-backup-current@1',status='uploaded_and_every_object_get_sha256_verified',manifest_uri=URI+'manifest.json',manifest_sha256=digest(folder/'manifest.json'),unique_files=m['unique_files'],source_paths=m['source_paths'],unique_source_bytes=m['unique_source_bytes'],archive_bytes=sum(p['bytes'] for p in m['parts']),allow_automatic_consumption=False,requires_explicit_human_authorization=True,local_sources_preserved=True,deletions=0)
    write(REPORT/'upload-receipt.json',pointer)
    write(REPORT/'upload-progress.json',dict(status='complete',verified_objects=len(verified)))
    print(json.dumps(pointer,indent=2),flush=True)

def read_json(p):return json.loads(p.read_text())
if __name__=='__main__':main()

#!/usr/bin/env python3
"""Build evidence-based outputs coverage; no AWS writes or payload changes."""
import collections, hashlib, json, os, subprocess, tempfile
from pathlib import Path
BASE=Path(__file__).resolve().parents[2]
REPORT=BASE/'GGD-Asset-Library/backups/outputs-20260909'
RESEARCH=Path(os.environ.get('GGD_HERO_RESEARCH_DIR', str(Path(tempfile.gettempdir())/'ggd-hero-finetune-research-delivery')))
MANAGEMENT=BASE/'GGD-asset-library-management'
COMMUNITY=BASE/'GGD-community-hero-forge-s3'
BUCKET='ggd-390630837668-ap-east-2-an'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def write(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def main():
    objects={x['Key']:x['Size'] for x in read(REPORT/'s3-inventory.json')['Contents']}
    known={}; redacted={}; proofs=[]
    def present(key,size):
        if objects.get(key)!=size:raise ValueError('S3 inventory missing/size mismatch '+key)
    def add(h,size,ref):known.setdefault((h,size),ref)
    snap=BASE/'GGD-Asset-Library/backups/20260908T075704221576Z';mp=snap/'manifest-path-correction-20260908.json';m=read(mp)
    prefix='legacy/ggd-asset-library/snapshots/20260908T075704221576Z/'
    present(prefix+mp.name,mp.stat().st_size)
    for g in m['groups']:
        p=snap/g['files_index'];assert sha(p)==g['files_index_sha256'];present(prefix+g['files_index'],p.stat().st_size)
        for part in g['parts']:present(prefix+part['path'],part['bytes'])
        for line in p.read_text().splitlines():
            f=json.loads(line);add(f['sha256'],f['bytes'],dict(kind='s3_archive_member',manifest_uri='s3://'+BUCKET+'/'+prefix+mp.name,group=g['id'],member=f['path']))
    proofs.append(dict(path=str(mp),sha256=sha(mp)))
    c=COMMUNITY/'materials/community-hero-forge';m=read(c/'manifest.json');loc=read(c/'s3-location.json');assert sha(c/'manifest.json')==loc['manifestSha256']
    for part in m['parts']:present(loc['prefix']+part['path'],part['bytes'])
    for f in m['files']:
        ref=dict(kind='s3_archive_member',manifest_uri='s3://'+BUCKET+'/'+loc['prefix']+'manifest.json',member=f['path'])
        add(f['sha256'],f['bytes'],ref)
        if 'sourceSha256' in f:redacted[f['sourceSha256']]=dict(**ref,reason=f['redaction'],sanitized_sha256=f['sha256'])
    proofs.append(dict(path=str(c/'manifest.json'),sha256=sha(c/'manifest.json')))
    supplement=c/'supplements/workspace-assets-20260908';sm=read(supplement/'manifest.json');sl=read(supplement/'s3-location.json');assert sha(supplement/'manifest.json')==sl['manifestSha256']
    for part in sm['parts']:present(sl['prefix']+part['path'],part['bytes'])
    for f in sm['files']:add(f['sha256'],f['bytes'],dict(kind='s3_archive_member',manifest_uri='s3://'+BUCKET+'/'+sl['prefix']+'manifest.json',member=f['path']))
    proofs.append(dict(path=str(supplement/'manifest.json'),sha256=sha(supplement/'manifest.json')))
    r=RESEARCH/'docs/_reports/hero-finetune-research';index=read(r/'S3_INDEX.json');receipt=read(r/'S3_RECEIPT.json');assert sha(r/'S3_INDEX.json')==receipt['indexSha256']
    direct={}
    for f in receipt['objects']+read(r/'low-update/S3_RECEIPT.json')['objects']+[read(r/'RESTORE_KIT_S3_RECEIPT.json')['archive']]:
        present(f['key'],f['bytes']);ref=dict(kind='s3_object',uri='s3://'+BUCKET+'/'+f['key']);add(f['sha256'],f['bytes'],ref);direct[f['sha256']]=ref
    for bundle in index['bundles']:
        p=r/bundle['path'];assert sha(p)==bundle['sha256'];m=read(p);arc={a['path']:direct[a['sha256']] for a in m['archives']}
        for f in m['entries']:
            if f.get('archive') in arc:add(f['sha256'],f['bytes'],dict(kind='s3_zip_member',archive_uri=arc[f['archive']]['uri'],member=f['path'],manifest=str(p.relative_to(RESEARCH))))
    idx=read(r/'BASE_S3_INDEX.json');assert sha(r/'BASE_S3_INDEX.json')==read(r/'BASE_S3_RECEIPT.json')['indexSha256']
    for f in idx['files']:
        for part in f['parts']:
            present(part['key'],part['bytes']);add(part['sha256'],part['bytes'],dict(kind='s3_object',uri='s3://'+BUCKET+'/'+part['key']))
        add(f['sha256'],f['bytes'],dict(kind='s3_chunked_file',index='docs/_reports/hero-finetune-research/BASE_S3_INDEX.json',index_sha256=sha(r/'BASE_S3_INDEX.json'),name=f['name'],parts=[p['key'] for p in f['parts']]))
    for name in ['S3_INDEX.json','S3_RECEIPT.json','BASE_S3_INDEX.json','BASE_S3_RECEIPT.json','low-update/S3_RECEIPT.json','RESTORE_KIT_S3_RECEIPT.json']:proofs.append(dict(path=str(r/name),sha256=sha(r/name)))
    git={}
    for repo,scope in [(MANAGEMENT,['materials/asset-library/source']),(RESEARCH,['docs/_reports/hero-finetune-research','tools/editor-acceptance']),(COMMUNITY,['materials/community-hero-forge'])]:
        commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
        records=subprocess.check_output(['git','ls-tree','-rz','HEAD','--',*scope],cwd=repo).split(b'\0')
        with subprocess.Popen(['git','cat-file','--batch'],cwd=repo,stdin=subprocess.PIPE,stdout=subprocess.PIPE) as proc:
            for row in records:
                if not row:continue
                header,name=row.split(b'\t',1);mode,kind,oid=header.split()
                if kind!=b'blob':continue
                proc.stdin.write(oid+b'\n');proc.stdin.flush();meta=proc.stdout.readline().split();size=int(meta[2]);data=proc.stdout.read(size);assert proc.stdout.read(1)==b'\n'
                h=hashlib.sha256(data).hexdigest();git.setdefault((h,size),dict(kind='git_blob',commit=commit,path=name.decode(),repository='adms/GGD'))
            proc.stdin.close()
    write(REPORT/'evidence.json',dict(proofs=proofs,s3_content_fingerprints=len(known),git_content_fingerprints=len(git),verification='fresh local SHA-256 joined to historical verified manifests and current S3 object-size inventory; not a fresh GET of existing payloads'))
    summary=collections.defaultdict(lambda:dict(files=0,bytes=0)); unique={}; exceptions=[]
    with (REPORT/'coverage.jsonl').open('w') as out:
        for line in (REPORT/'files.jsonl').open():
            f=json.loads(line);key=(f.get('sha256'),f.get('bytes'));path=f['path'];p=BASE/path
            if f['status']!='hashed':state='exception';ref=dict(reason=f['status'])
            elif f['sha256'] in redacted:state='exception_sanitized_backup';ref=redacted[f['sha256']]
            elif key in git:state='git_existing';ref=git[key]
            elif key in known:state='s3_existing';ref=known[key]
            else:
                # Raw model parsing JSON stays S3. Human-readable source/config/reports default to Git.
                suffix=p.suffix.lower(); text_suffix=suffix in {'.py','.mjs','.js','.cjs','.ts','.tsx','.sh','.md','.txt','.json','.jsonl','.csv','.tsv','.yaml','.yml','.toml','.ini','.cfg','.log','.html','.css','.c','.h','.license','.jinja'} or p.name in {'LICENSE','README','Dockerfile'}
                native='/game-asset-library-20260907/' in path and any(s in path for s in ['/models/','/raw/','/client/','/downloads/'])
                if text_suffix and not native and f['bytes']<8*1024*1024:
                    data=p.read_bytes()
                    try: text=data.decode('utf-8'); valid='\0' not in text
                    except UnicodeDecodeError:valid=False
                    state='git_pending' if valid else 's3_pending'
                else:state='s3_pending'
                ref={}
                unique.setdefault(state,{})[f['sha256']]=f['bytes']
            row=dict(**f,coverage=state,location=ref);out.write(json.dumps(row,ensure_ascii=False)+'\n');summary[state]['files']+=1;summary[state]['bytes']+=f.get('bytes',0)
            if state.startswith('exception'):exceptions.append(row)
    write(REPORT/'reconciliation.json',dict(schema='ggd-outputs-reconciliation@1',status='planned',summary=summary,pending_unique={k:dict(files=len(v),bytes=sum(v.values())) for k,v in unique.items()},exceptions=exceptions))
    print(json.dumps(summary,ensure_ascii=False,indent=2));print('UNIQUE', {k:(len(v),sum(v.values())) for k,v in unique.items()})
if __name__=='__main__':main()

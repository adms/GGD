#!/usr/bin/env python3
"""Freeze an explicitly scoped 74-hero handoff without editing source worktrees."""
import argparse, gzip, hashlib, importlib.util, io, json, os, re, subprocess, tarfile
from pathlib import Path
from datetime import datetime, timezone

TEXT={'.md','.txt','.mjs','.mts','.ts','.tsx','.js','.py','.sh','.json','.jsonl','.csv','.yaml','.yml','.html','.css','.patch','.log','.toml','.lock'}
PROGRAM={'.mjs','.mts','.ts','.tsx','.js','.py','.sh'}
CACHE={'node_modules','.git','.venv','__pycache__','.cache','.vite','.vitest'}
JWT=re.compile(rb'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}')
PRIVATE=re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')
sha=lambda data:hashlib.sha256(data).hexdigest()
def j(p):return json.loads(p.read_text())
def put(p,x):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def git(repo,*args):return subprocess.check_output(['git',*args],cwd=repo)
def tree(repo):
    rows={}
    for row in git(repo,'ls-tree','-rz','HEAD').split(b'\0'):
        if not row:continue
        meta,path=row.split(b'\t',1);mode,kind,oid=meta.decode().split()
        if kind=='blob':rows[path.decode()]={'oid':oid,'mode':mode}
    return rows
def walk(p):
    if p.is_file() or p.is_symlink():yield p;return
    for d,dirs,files in os.walk(p,followlinks=False):
        dirs[:]=sorted(x for x in dirs if x not in CACHE)
        for f in sorted(files):yield Path(d)/f

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--workspace',type=Path,required=True);ap.add_argument('--output',type=Path,required=True);ap.add_argument('--parts-output',type=Path,required=True)
    a=ap.parse_args();w=a.workspace.resolve();out=a.output.resolve();partsout=a.parts_output.resolve()
    if out.exists() or partsout.exists():raise ValueError('Outputs must be new')
    out.mkdir(parents=True);partsout.mkdir(parents=True)
    first=w/'GGD-community-hero-forge-s3';second=w/'GGD-hero-validation-batch2';old=w/'GGD-community-hero-forge'
    repos={r.name:{'path':r,'head':git(r,'rev-parse','HEAD').decode().strip(),'tree':tree(r)} for r in [first,second,old,w/'GGD-hero-auto-forge']}
    archives=[];by_source={};by_digest={}
    archive_dirs=[first/'materials/community-hero-forge',*[p.parent for p in (first/'materials/community-hero-forge/supplements').glob('*/manifest.json')]]
    for d in archive_dirs:
        if not (d/'s3-location.json').exists():continue
        m=j(d/'manifest.json');loc=j(d/'s3-location.json')
        if 'files' not in m:continue
        if sha((d/'manifest.json').read_bytes())!=loc.get('manifestSha256'):raise ValueError('Archive manifest drift')
        desc={'manifest':str((d/'manifest.json').relative_to(w)),'manifestSha256':loc['manifestSha256'],'bucket':loc['bucket'],'prefix':loc['prefix'],'parts':m['parts'],'files':len(m['files'])}
        archives.append(desc)
        for r in m['files']:
            ref={'kind':'existing-s3','manifest':desc['manifest'],'member':r['path'],'payloadSha256':r['sha256'],'sourceSha256':r.get('sourceSha256',r['sha256']),'redaction':r.get('redaction')}
            by_source[(r['path'],ref['sourceSha256'])]=ref;by_digest.setdefault(r['sha256'],ref)
    scopes=[
      'GGD社群英雄上傳內容_37名','GGD社群英雄完整上傳內容與工作流交接_37名.md','GGD社群英雄功能驗收設計稿_37名角色.md','第二批37全自動創建英雄名單.md','社群創造後台審查英雄自動鑄造計畫最終執行版.md',
      'outputs/community-hero-asset-integration','outputs/community-lol-models-20260907',
      'outputs/community37-static-review-20260907-v1','outputs/community37-inference-smoke-20260907-v1','outputs/community37-inference-full-20260907-v1','outputs/community37-corrected-dataset-20260907-v1',
      'GGD-community-hero-forge-s3/tools/community-hero-forge','GGD-community-hero-forge-s3/materials/community-hero-forge','GGD-community-hero-forge-s3/docs/_reports/community-hero-forge','GGD-community-hero-forge-s3/docs/_reports/community-hero-icons-20260909','GGD-community-hero-forge-s3/tools/icon-gen/local','GGD-community-hero-forge-s3/packages/shared/src/content/heroForge/communityRefinements',
      'GGD-community-hero-forge/docs/_reports/community-hero-forge/reboot-handoff.md','GGD-community-hero-forge/docs/_reports/community-hero-forge/reboot-state-20260907','GGD-community-hero-forge/docs/_reports/community-hero-forge/defense-direction/README.md',
      'GGD-hero-validation-batch2/tools/editor-acceptance/batch2-37','GGD-hero-validation-batch2/docs/_reports/hero-validation-batch2-37',
      'GGD-hero-auto-forge/tools/forge-training']
    candidates={}
    for s in scopes:
        p=w/s
        if not p.exists():continue
        for q in walk(p):candidates[str(q.relative_to(w))]=q
    # Include every published first-batch change and current tracked WIP, regardless of directory.
    for mode in [('diff','--name-only','-z','origin/main...HEAD'),('diff','--name-only','-z','HEAD')]:
        for name in git(first,*mode).decode().split('\0'):
            if name and (first/name).is_file():candidates[str((first/name).relative_to(w))]=first/name
    rows=[];omitted=[];new_payload=[];snapshot_files=[];redacted=[]
    for n,(logical,p) in enumerate(sorted(candidates.items())):
        if p.is_symlink():omitted.append({'path':logical,'reason':'symlink; dependency or source link, no dereference'});continue
        if p.name=='.DS_Store' or p.suffix=='.pyc' or '.git' in p.parts or p.name.startswith('payload.tar.gz.part'):
            omitted.append({'path':logical,'reason':'OS/cache or already indexed archive transport part'});continue
        if p.name.startswith('.env') or p.suffix in {'.pem','.key'}:
            omitted.append({'path':logical,'reason':'credential/config secret material'});continue
        data=p.read_bytes();digest=sha(data)
        row={'path':logical,'bytes':len(data),'sha256':digest}
        repo=repos.get(logical.split('/')[0]);rel=logical.split('/',1)[1] if repo and '/' in logical else ''
        entry=repo['tree'].get(rel) if repo else None
        oid=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
        original=by_source.get((logical,digest)) or by_digest.get(digest)
        if entry and entry['oid']==oid:
            row['delivery']={'kind':'git-commit','commit':repo['head'],'path':rel,'blob':oid}
        else:
            # Source code and authoring documents must remain directly reviewable in Git.
            source_text=(p.suffix in PROGRAM or p.suffix in {'.md','.txt','.csv'} or logical.startswith('GGD社群英雄上傳內容_37名/') and p.suffix in TEXT or repo is not None and p.suffix in TEXT)
            if source_text:
                if PRIVATE.search(data):raise ValueError('Private key in scoped text: '+logical)
                if original and original.get('redaction'):
                    row['delivery']=original
                    row['note']='Credential-bearing historical source has an existing sanitized S3 copy; original not committed.'
                    redacted.append(logical)
                elif JWT.search(data):
                    clean=JWT.sub(b'REDACTED_JWT',data);target=out/'snapshots'/logical;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(clean)
                    row['delivery']={'kind':'git-snapshot','path':str(target.relative_to(second)),'payloadSha256':sha(clean),'redaction':'JWT replaced; source untouched'}
                    redacted.append(logical);snapshot_files.append(logical)
                else:
                    target=out/'snapshots'/logical;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
                    row['delivery']={'kind':'git-snapshot','path':str(target.relative_to(second)),'payloadSha256':digest}
                    snapshot_files.append(logical)
            elif original:row['delivery']=original
            else:
                if data[:4] in [b'\xcf\xfa\xed\xfe',b'\xfe\xed\xfa\xcf',b'\xca\xfe\xba\xbe',b'\x7fELF'] or data[:2]==b'MZ':
                    omitted.append({**row,'reason':'compiled executable; source retained, not hero content'});continue
                if PRIVATE.search(data) or JWT.search(data):raise ValueError('Credential-shaped data outside existing sanitized archive: '+logical)
                row['delivery']={'kind':'new-s3','member':logical,'payloadSha256':digest};new_payload.append((p,row))
        rows.append(row)
        if n%5000==0:print(json.dumps({'scanned':n,'newSnapshots':len(snapshot_files),'newPayloads':len(new_payload)}),flush=True)
    # Create deterministic, de-duplicated archive using the already shipped transport format.
    spec=importlib.util.spec_from_file_location('archive_helpers',first/'tools/community-hero-forge/archive-materials.py');helpers=importlib.util.module_from_spec(spec);spec.loader.exec_module(helpers)
    parts=helpers.Parts(partsout);seen={};files=[]
    with gzip.GzipFile(filename='',mode='wb',fileobj=parts,mtime=0,compresslevel=6) as gz:
      with tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT) as tar:
        for p,row in new_payload:
            data=p.read_bytes()
            if sha(data)!=row['sha256']:raise ValueError('Source changed while archiving: '+row['path'])
            r={'path':row['path'],'bytes':len(data),'sha256':row['sha256'],'mode':420};files.append(r)
            t=tarfile.TarInfo(r['path']);t.mtime=0;t.mode=420
            if r['sha256'] in seen:t.type=tarfile.LNKTYPE;t.linkname=seen[r['sha256']]
            else:seen[r['sha256']]=r['path'];t.size=len(data)
            tar.addfile(t,io.BytesIO(data) if t.isfile() else None)
    parts.finish()
    manifest={'schema':'ggd-community-materials-archive@1','sources':scopes,'files':files,'parts':parts.rows,'excluded':[],'summary':{'files':len(files),'uniquePayloads':len(seen),'bytes':sum(r['bytes'] for r in files),'compressedBytes':parts.total,'redactedFiles':0}}
    put(out/'archive/manifest.json',manifest)
    digest=sha((out/'archive/manifest.json').read_bytes());put(out/'archive/s3-location.json',{'schema':'ggd-community-materials-s3@1','bucket':'ggd-390630837668-ap-east-2-an','region':'ap-east-2','profile':'vibe-coding','manifestSha256':digest,'prefix':f'community-hero-forge/{digest}/'})
    for row in rows:
        if row['delivery']['kind']=='new-s3':row['delivery']['manifest']='materials/hero74-handoff/frozen/archive/manifest.json'
    counts={}
    for row in rows:counts[row['delivery']['kind']]=counts.get(row['delivery']['kind'],0)+1
    result={'schema':'ggd-hero74-material-inventory@1','createdAt':datetime.now(timezone.utc).isoformat(),'workspace':str(w),'scope':scopes,'repositories':{k:{'commit':v['head']} for k,v in repos.items()},'existingArchives':archives,'files':rows,'excluded':omitted,'summary':{'files':len(rows),'sourceBytes':sum(r['bytes'] for r in rows),'byDelivery':counts,'snapshots':len(snapshot_files),'redactedSources':redacted,'unclassified':0},'limitations':['WIP snapshots preserve individual captured files, not an executable atomic engine revision.','Historical artifacts keep their original acceptance status.','Excludes dependencies, caches, account secrets and unrelated model weights; does not certify either batch for training.']}
    put(out/'inventory.json',result);print(json.dumps(result['summary'],ensure_ascii=False),flush=True)
if __name__=='__main__':main()

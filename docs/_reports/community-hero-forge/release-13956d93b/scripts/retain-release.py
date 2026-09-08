"""Retain this finite acceptance batch; private accounts and credentials excluded."""
from pathlib import Path
import gzip, hashlib, importlib.util, io, json, re, shutil, tarfile, zipfile

root = Path(__file__).resolve().parent
repo = Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-community-hero-forge-s3')
report = repo/'docs/_reports/community-hero-forge/release-13956d93b'
material = repo/'materials/community-hero-forge/supplements/release-13956d93b'
parts_dir = root/'delivery-parts'
for path in [report, material, parts_dir]:
    if path.exists(): raise ValueError('Refusing existing delivery destination: '+str(path))
for path in ['rebuilt-37-attempt2/report.json', 'submission-37/report.json', 'publication-37-attempt2/report.json', 'evidence/match.json', 'evidence/replay.json', 'evidence/legacy-restore.json', 'evidence/azazel-package-proof.json']:
    assert json.loads((root/path).read_text())['status'] == 'passed', path
secrets = [x.encode() for x in json.loads((root/'credentials-private.json').read_text()).values() if isinstance(x,str)]
jwt = re.compile(rb'eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}')
sha = lambda data: hashlib.sha256(data).hexdigest()
scanned = set()
def check(data, name):
    digest = sha(data)
    if digest in scanned: return
    if any(value in data for value in secrets) or jwt.search(data) or (b'-----BEGIN '+b'PRIVATE KEY-----') in data:
        raise ValueError('Credential detected in selected artifact: '+name)
    if data.startswith(b'PK\x03\x04'):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            for row in archive.infolist():
                if not row.is_dir(): check(archive.read(row), name+'!'+row.filename)
    scanned.add(digest)

git_files = {}
s3_files = {}
def select(path, storage, logical=None):
    if path.is_symlink(): raise ValueError('Unexpected symlink')
    (git_files if storage == 'git' else s3_files)[logical or path.relative_to(root).as_posix()] = path
for path in sorted(root.glob('*.py')) + sorted(root.glob('*.mts')):
    select(path, 'git', 'scripts/'+path.name)
for path in sorted((root/'evidence').iterdir()):
    if path.is_file(): select(path, 'git')
for folder in ['rebuilt-37-attempt2', 'submission-37', 'publication-37-attempt2']:
    for path in sorted((root/folder).rglob('*')):
        if not path.is_file(): continue
        # Raw inspections contain binary icon payloads. The full project, version
        # list and validation are retained as Git JSON alongside the raw receipt SHA.
        storage = 's3' if path.suffix == '.zip' or path.name in ['inspection.json','snapshot.json'] else 'git'
        select(path, storage)
for folder in ['rebuilt-37', 'publication-37']:
    select(root/folder/'report.json', 'git', 'failed-attempts/'+folder+'.json')
for name in ['rebuild-batch.log','rebuild-batch-attempt2.log','submit-batch.log','publish-batch.log','publish-batch-attempt2.log','play-current.log','play-current-before-restart.log','replay-current.log','replay-first-attempt.log','replay-footer-attempt.log','azazel-package-proof.log','azazel-regression.log','azazel-package-proof-baseline-error.log','azazel-package-proof-name-error.log','legacy-restore-proof.log','legacy-restore-proof-first-attempt.log']:
    path=root/'logs'/name
    if path.exists(): select(path,'git')
for path in sorted((root/'legacy-backups-attempt2').rglob('*')):
    if path.is_file(): select(path,'git' if path.suffix == '.json' else 's3')
for path in sorted((root/'replays').iterdir()):
    if path.is_file(): select(path,'s3')
legacy=json.loads((root/'evidence/legacy-restore.json').read_text())
for name in [legacy['hero']['path'].removeprefix('catalog/'),*legacy['independentDependencies']]:
    select(root/'legacy-content-attempt2'/name,'git','restored-hero/'+name)
# Validate the complete selection before writing either Git or S3 material parts.
for logical,path in [*git_files.items(),*s3_files.items()]: check(path.read_bytes(),logical)
for path in [report,material,parts_dir]:path.mkdir(parents=True)
git_rows=[]
for logical,path in sorted(git_files.items()):
    target=(material/'control' if logical.startswith('legacy-backups-attempt2/') else report)/logical
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(path,target)
    data=target.read_bytes()
    git_rows.append({'path':str(target.relative_to(repo)),'source':str(path),'bytes':len(data),'sha256':sha(data)})
spec=importlib.util.spec_from_file_location('existing_archive',repo/'tools/community-hero-forge/archive-materials.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
parts=module.Parts(parts_dir);rows=[];seen={}
with gzip.GzipFile(filename='',mode='wb',fileobj=parts,mtime=0,compresslevel=6) as zipped:
    with tarfile.open(fileobj=zipped,mode='w|',format=tarfile.PAX_FORMAT) as archive:
        for logical,path in sorted(s3_files.items()):
            data=path.read_bytes();digest=sha(data);info=tarfile.TarInfo(logical);info.mode=0o644;info.mtime=0
            if digest in seen:info.type,info.linkname=tarfile.LNKTYPE,seen[digest]
            else:seen[digest]=logical;info.size=len(data)
            archive.addfile(info,io.BytesIO(data) if info.isfile() else None)
            rows.append({'path':logical,'bytes':len(data),'sha256':digest,'mode':0o644})
parts.finish()
manifest={'schema':'ggd-community-materials-archive@1','sources':['Current 37 rebuilt ZIPs and binary-bearing receipts','Sealed replay','Binary assets of the isolated historical version store; control JSON in Git'], 'files':rows,'parts':parts.rows,'excluded':[{'path':str(root/'credentials-private.json'),'reason':'Private local test credentials; never distributed'},{'path':str(root/'auth-private.json'),'reason':'Private login sessions; never distributed'},{'path':str(root/'data'),'reason':'Disposable account database; public API receipts retained instead'},{'path':str(root/'imports'),'reason':'Original history already retained; verified 46752-file unchanged baseline, current ZIPs retained'},{'path':str(root/'bin'),'reason':'Rebuildable executable; fixed source and build preparation retained'}], 'summary':{'files':len(rows),'uniquePayloads':len(seen),'bytes':sum(x['bytes'] for x in rows),'compressedBytes':parts.total,'redactedFiles':0}}
mp=material/'manifest.json';mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');digest=sha(mp.read_bytes())
(material/'s3-location.json').write_text(json.dumps({'schema':'ggd-community-materials-s3@1','bucket':'ggd-390630837668-ap-east-2-an','region':'ap-east-2','profile':'vibe-coding','manifestSha256':digest,'prefix':f'community-hero-forge/{digest}/'},indent=2)+'\n')
(report/'evidence-manifest.json').write_text(json.dumps({'schema':'ggd-release-evidence-retention@1','gitFiles':git_rows,'materialManifest':str(mp.relative_to(repo)),'materialManifestSha256':digest,'credentialScan':'passed; exact local secrets, JWT and private-key markers checked; ZIP contents recursively checked','limits':'Binary-bearing raw inspection/snapshot receipts in S3; complete projects and control data in Git. No account DB or credentials retained.'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'gitFiles':len(git_rows),'s3':manifest['summary'],'manifestSha256':digest}))

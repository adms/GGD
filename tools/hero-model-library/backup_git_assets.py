"""Back up committed asset outputs, conversion code and indexes with full S3 readback.

Uses only the preconfigured vibe-coding profile. Raw/preparation intakes are backed
up separately; this snapshot never claims to cover untracked workspace files.
"""
from pathlib import Path
import argparse,gzip,hashlib,json,os,shutil,subprocess,tarfile

REPO=Path(__file__).resolve().parents[2]
SCOPES=['content/assets','content/models','tools','materials/hero-model-library',
        'materials/asset-library','packages/shared/src/content','apps/content-api/src']
BUCKET='ggd-390630837668-ap-east-2-an'
def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
def members(path):
    rows=[]
    with tarfile.open(path,'r|*') as tf:
        for entry in tf:
            if not entry.isfile():continue
            f=tf.extractfile(entry);h=hashlib.sha256();size=0
            for b in iter(lambda:f.read(1024*1024),b''):h.update(b);size+=len(b)
            assert size==entry.size
            rows.append(dict(path=entry.name,bytes=size,sha256=h.hexdigest()))
    return rows
def aws(args,action,resource):
    env=dict(os.environ,AWS_PROFILE='vibe-coding',AWS_REGION='ap-east-2',AWS_PAGER='')
    p=subprocess.run(['aws',*args,'--profile','vibe-coding','--region','ap-east-2','--no-cli-pager'],env=env,capture_output=True,text=True)
    if p.returncode:raise RuntimeError(f'{action} failed on {resource}: {p.stderr.strip()}')
    return p.stdout
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--commit',required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    commit=subprocess.check_output(['git','rev-parse',args.commit+'^{commit}'],cwd=REPO,text=True).strip()
    out=args.output.resolve()/commit;out.mkdir(parents=True,exist_ok=True)
    archive=out/'assets-and-tools.tar.gz'
    if not archive.exists():
        raw=out/'assets-and-tools.tar'
        with raw.open('xb') as f:subprocess.run(['git','archive','--format=tar',commit,'--',*SCOPES],cwd=REPO,stdout=f,check=True)
        with raw.open('rb') as src,archive.open('xb') as dst,gzip.GzipFile(filename='',mode='wb',fileobj=dst,mtime=0,compresslevel=6) as gz:shutil.copyfileobj(src,gz,1024*1024)
        # The raw TAR is deliberately retained locally as well.
    digest=sha(archive);rows=members(archive)
    uri=f's3://{BUCKET}/legacy/git-asset-snapshots/{commit}/{digest}.tar.gz'
    manifest=dict(schema='ggd-git-asset-backup-manifest@1',commit=commit,scopes=SCOPES,files=rows,archiveSha256=digest,archiveBytes=archive.stat().st_size,s3Uri=uri,
                  scopeBoundary='Committed files only. Original and intermediate local intakes require their independent source/conversion backups.')
    write(out/'manifest.json',manifest)
    print(json.dumps(dict(phase='archive-ready',commit=commit,files=len(rows),bytes=archive.stat().st_size)),flush=True)
    arn=aws(['sts','get-caller-identity','--query','Arn','--output','text'],'sts:GetCallerIdentity','configured profile').strip()
    if 'assumed-role/vibe-coding-s3-role/' not in arn:raise RuntimeError('STOP: configured profile identity mismatch: '+arn)
    aws(['s3','cp',str(archive),uri,'--only-show-errors'],'s3:PutObject',uri)
    back=out/'s3-readback.tar.gz';aws(['s3','cp',uri,str(back),'--only-show-errors'],'s3:GetObject',uri)
    assert sha(back)==digest and members(back)==rows,'S3 payload or per-file readback mismatch'
    manifest_uri=uri.removesuffix('.tar.gz')+'.files.json'
    aws(['s3','cp',str(out/'manifest.json'),manifest_uri,'--only-show-errors'],'s3:PutObject',manifest_uri)
    mb=out/'manifest-readback.json';aws(['s3','cp',manifest_uri,str(mb),'--only-show-errors'],'s3:GetObject',manifest_uri)
    assert mb.read_bytes()==(out/'manifest.json').read_bytes()
    receipt=dict(schema='ggd-git-asset-backup-receipt@1',commit=commit,s3Uri=uri,manifestUri=manifest_uri,archiveSha256=digest,archiveBytes=archive.stat().st_size,
                 files=len(rows),uncompressedBytes=sum(r['bytes'] for r in rows),fullGetAndEveryFileVerified=True,localPreserved=True,localRoot=str(out),profile='vibe-coding',region='ap-east-2')
    write(out/'receipt.json',receipt);print(json.dumps(receipt),flush=True)
if __name__=='__main__':main()

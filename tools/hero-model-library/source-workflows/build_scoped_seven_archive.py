#!/usr/bin/env python3
"""Deterministic, allowlist-only archive for a pinned local audio delivery.

Never downloads, accesses AWS, extracts an archive, deletes files, scans a source
root recursively, or edits the central registry. Re-run with a new output path
or use --verify-only against the previously produced archive.
"""
import argparse,datetime,gzip,hashlib,json,os,platform,stat,tarfile,zlib
from pathlib import Path,PurePosixPath

CHUNK=1024*1024

def digest_file(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(CHUNK),b''):h.update(b)
    return h.hexdigest()

def safe_name(value):
    if not isinstance(value,str) or not value or '\\' in value or '\0' in value:
        raise ValueError('Invalid archive path')
    p=PurePosixPath(value)
    if p.is_absolute() or ':' in value.split('/')[0] or any(x in {'','.','..'} for x in value.split('/')):
        raise ValueError('Archive path must be normalized and relative: '+value)
    return value

def safe_file(root,member):
    member=safe_name(member);root=Path(root)
    if root.is_symlink():raise ValueError('Source root is a symlink')
    current=root
    for part in PurePosixPath(member).parts:
        current=current/part
        if current.is_symlink():raise ValueError('Symlink rejected: '+str(current))
    if not current.resolve().is_relative_to(root.resolve()):raise ValueError('Source escaped root')
    if not current.is_file():raise ValueError('Missing regular source: '+str(current))
    return current

def signature(s):
    return s.st_dev,s.st_ino,s.st_size,s.st_mtime_ns,s.st_ctime_ns

def normalize_rows(rows):
    seen=set();out=[]
    for row in rows:
        p=safe_name(row['path'])
        if p in seen:raise ValueError('Duplicate archive member: '+p)
        seen.add(p)
        if not isinstance(row['bytes'],int) or row['bytes']<0:raise ValueError('Invalid size')
        if len(row['sha256'])!=64 or any(x not in '0123456789abcdef' for x in row['sha256']):raise ValueError('Invalid SHA')
        out.append({k:row[k] for k in ['path','bytes','sha256']})
    return sorted(out,key=lambda row:row['path'])

class DigestingReader:
    def __init__(self,f):self.f=f;self.hash=hashlib.sha256();self.bytes=0
    def read(self,n=-1):
        b=self.f.read(n);self.hash.update(b);self.bytes+=len(b);return b

def create_archive(root,rows,output):
    rows=normalize_rows(rows);records=[]
    with Path(output).open('xb') as raw:
        with gzip.GzipFile(filename='',mode='wb',compresslevel=1,fileobj=raw,mtime=0) as gz:
            with tarfile.open(fileobj=gz,mode='w|',format=tarfile.PAX_FORMAT) as tar:
                for i,row in enumerate(rows):
                    path=safe_file(root,row['path']);before=path.stat(follow_symlinks=False)
                    if not stat.S_ISREG(before.st_mode) or before.st_size!=row['bytes']:raise ValueError('Source type or size changed: '+str(path))
                    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
                    with os.fdopen(fd,'rb') as f:
                        if signature(os.fstat(f.fileno()))!=signature(before):raise ValueError('Source changed before open')
                        stream=DigestingReader(f)
                        info=tarfile.TarInfo(row['path']);info.size=row['bytes'];info.mode=0o644;info.uid=info.gid=0;info.uname=info.gname='';info.mtime=0
                        tar.addfile(info,stream)
                        if stream.bytes!=row['bytes'] or stream.hash.hexdigest()!=row['sha256']:raise ValueError('Source bytes or SHA changed: '+str(path))
                        if signature(os.fstat(f.fileno()))!=signature(before) or signature(path.stat(follow_symlinks=False))!=signature(before):raise ValueError('Source changed during archive: '+str(path))
                        safe_file(root,row['path'])
                    records.append(dict(row,sourceSha256Verified=True,sourceUnchangedDuringRead=True))
                    if (i+1)%2000==0:print(json.dumps({'phase':'archive','members':i+1,'total':len(rows)}),flush=True)
    return records

def verify_archive(archive,rows):
    expected={r['path']:r for r in normalize_rows(rows)};records=[];seen=set()
    with tarfile.open(archive,'r|gz') as tar:
        for member in tar:
            name=safe_name(member.name)
            if not member.isfile() or member.issym() or member.islnk():raise ValueError('Non-regular archived member')
            if name in seen or name not in expected:raise ValueError('Duplicate/unexpected archived member')
            seen.add(name);row=expected[name]
            if member.size!=row['bytes']:raise ValueError('Archived size mismatch')
            if member.uid!=0 or member.gid!=0 or member.mode!=0o644 or member.mtime!=0 or member.uname or member.gname:raise ValueError('Nondeterministic tar metadata')
            f=tar.extractfile(member);h=hashlib.sha256();n=0
            for b in iter(lambda:f.read(CHUNK),b''):h.update(b);n+=len(b)
            actual=h.hexdigest()
            if actual!=row['sha256'] or n!=row['bytes']:raise ValueError('Archived SHA mismatch: '+name)
            records.append({'path':name,'bytes':n,'sha256':actual,'localArchiveReadbackVerified':True,'s3ReadbackVerified':False})
            if len(records)%2000==0:print(json.dumps({'phase':'local-readback','members':len(records),'total':len(rows)}),flush=True)
    if seen!=set(expected):raise ValueError('Missing archived members')
    with Path(archive).open('rb') as f:header=f.read(10)
    if header[:3]!=b'\x1f\x8b\x08' or header[3]!=0 or header[4:8]!=b'\0\0\0\0':raise ValueError('Nondeterministic gzip header')
    return records

def write_json_new_or_same(path,value):
    data=(json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
    if path.exists():
        if path.read_bytes()!=data:raise ValueError('Refusing to overwrite existing evidence: '+str(path))
    else:
        with path.open('xb') as f:f.write(data)

def copy_delivery(delivery,expected_sha,root,member):
    data=Path(delivery).read_bytes()
    if hashlib.sha256(data).hexdigest()!=expected_sha:raise ValueError('Fixed delivery SHA mismatch')
    member=safe_name(member);target=root/member
    if root.is_symlink() or not root.is_dir():raise ValueError('Invalid delivery root')
    current=root
    for part in PurePosixPath(member).parts[:-1]:
        current=current/part
        if current.is_symlink():raise ValueError('Delivery target parent is symlink')
        current.mkdir(exist_ok=True)
    if target.exists():
        safe_file(root,member)
        if target.read_bytes()!=data:raise ValueError('Refusing to overwrite distinct delivery')
    else:
        with target.open('xb') as f:f.write(data)
    if digest_file(target)!=expected_sha:raise ValueError('Copied delivery SHA mismatch')
    return {'path':member,'bytes':len(data),'sha256':expected_sha}

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--delivery',type=Path,required=True);p.add_argument('--delivery-sha256',required=True)
    p.add_argument('--delivery-member',default='deliveries/local-audio-delivery-20260910T142545872117Z-project-seven.json')
    p.add_argument('--output-dir',type=Path,required=True);p.add_argument('--workspace',type=Path,required=True);p.add_argument('--verify-only',action='store_true')
    a=p.parse_args();a.delivery=a.delivery.resolve();d=json.loads(a.delivery.read_text());root=Path(d['localRoot']);out=a.output_dir.resolve();a.workspace=a.workspace.resolve()
    assert root.resolve().is_relative_to(a.workspace.resolve())
    ids={r['nativeId'] for r in d['packages']};assert ids=={x+'.ja_JP' for x in ['Karthus','LeeSin','Lux','MissFortune','Warwick','Xerath','Yasuo']}
    assert d['sourceId']=='lol-project-seven-ja-jp-16.18.8159717' and d['deliveryFrozen'] is True
    delivery_row=copy_delivery(a.delivery,a.delivery_sha256,root,a.delivery_member)
    rows=normalize_rows(d['allFiles']+[delivery_row]);out.mkdir(parents=True,exist_ok=True)
    archive=out/'lol-project-seven-scoped-16.18.8159717.tar.gz'
    if not a.verify_only:source_records=create_archive(root,rows,archive)
    else:source_records=None
    archive_sha=digest_file(archive);proof=verify_archive(archive,rows)
    receipt={'schema':'ggd.scoped-local-archive@1','sourceId':d['sourceId'],'scope':'Frozen exact seven allFiles plus byte-identical pinned subset delivery; no recursive source-root archive','sourceRoot':str(root),'sourceDelivery':{'absolutePath':str(a.delivery),'sha256':a.delivery_sha256},'copiedDelivery':delivery_row,'archiveFormat':'tar-gzip','archiveMemberRoot':'','localArchive':str(archive.relative_to(a.workspace)),'absoluteLocalArchive':str(archive.resolve()),'bytes':archive.stat().st_size,'sha256':archive_sha,'fileCount':len(rows),'uncompressedFileBytes':sum(r['bytes'] for r in rows),'localArchiveReadbackVerified':True,'s3ReadbackVerified':False,'readbackVerified':False,'plannedS3Uri':f"s3://ggd-390630837668-ap-east-2-an/legacy/public-model-sources/{d['sourceId']}/{archive_sha}.tar.gz",'contentKind':'scoped-frozen-source-delivery','deterministicParameters':{'tarFormat':'PAX','memberOrder':'lexicographic POSIX path','mode':'0644','uid':0,'gid':0,'mtime':0,'uname':'','gname':'','gzipMtime':0,'gzipFilename':'','gzipCompressLevel':1},'toolVersions':{'python':platform.python_version(),'zlib':zlib.ZLIB_VERSION,'archiverSha256':digest_file(__file__)},'files':rows}
    write_json_new_or_same(out/'manifest.json',receipt)
    write_json_new_or_same(out/'per-member-local-readback.json',{'schema':'ggd.local-archive-member-readback@1','archiveSha256':archive_sha,'fileCount':len(proof),'allLocalArchiveMemberHashesMatch':True,'s3ReadbackVerified':False,'readbackVerified':False,'files':proof})
    if source_records is not None:write_json_new_or_same(out/'source-read-evidence.json',{'fileCount':len(source_records),'files':source_records})
    print(json.dumps({k:v for k,v in receipt.items() if k!='files'},ensure_ascii=False,indent=2),flush=True)
if __name__=='__main__':main()

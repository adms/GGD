"""Import the verified 1.60+ patch into the raw asset library; retain overwritten bytes."""
import hashlib,json,struct
from pathlib import Path,PurePosixPath
ROOT=Path(__file__).resolve().parent.parent;GAME=ROOT/'magical-battle-arena';RAW=GAME/'raw'
SOURCE=GAME/'patches/1.60plus/MBACPatchVer160+/Data'
records={r['path']:r for r in map(json.loads,(GAME/'asset-index.jsonl').read_text().splitlines())}
changes=[];counts={}
def put(name,data,archive,entry=None):
    safe=PurePosixPath(name)
    if safe.is_absolute() or '..' in safe.parts or ':' in name:raise ValueError(name)
    dest=RAW/name;sha=hashlib.sha256(data).hexdigest();old=records.get(name)
    if dest.exists() and hashlib.sha256(dest.read_bytes()).hexdigest()!=sha:
        backup=GAME/'snapshot-originals/pre-160plus'/name;backup.parent.mkdir(parents=True,exist_ok=True)
        if not backup.exists():backup.write_bytes(dest.read_bytes())
        changes.append(dict(path=name,backup=str(backup.relative_to(GAME)),old_record=old))
    elif not dest.exists():changes.append(dict(path=name,added=True))
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    records[name]=dict(path=name,archive=archive,entry=entry,bytes=len(data),sha256=sha,extension=dest.suffix.lower(),patch='1.60+')
for p in sorted(SOURCE.glob('*.gdp')):
    b=p.read_bytes();n=struct.unpack_from('<I',b)[0];assert 4+n*268<=len(b);counts[p.name]=n
    for i in range(n):
        o=4+i*268;name=b[o:o+260].split(b'\0')[0].decode('cp932').replace('\\','/');size,pos=struct.unpack_from('<II',b,o+260)
        assert pos>=4+n*268 and pos+size<=len(b)
        put(name,b[pos:pos+size],'patch160plus/'+p.name,i)
for p in sorted(SOURCE.iterdir()):
    if p.suffix.lower()=='.gdp':continue
    prefix='CharacterDefinitions/' if p.suffix.lower()=='.chr' else 'ClientResources/'
    put(prefix+p.name,p.read_bytes(),'patch160plus/loose_file')
(GAME/'asset-index.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for _,r in sorted(records.items())))
report=dict(version='Complete Form 1.60+',archives=counts,raw_files=len(records),changes=changes,errors=[])
(ROOT/'evidence/mba-patch160-import.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='changes'},ensure_ascii=False))

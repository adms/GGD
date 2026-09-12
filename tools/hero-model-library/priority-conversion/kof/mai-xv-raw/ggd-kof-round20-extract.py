from pathlib import Path
import importlib.util,json,hashlib,collections,struct,shutil
root=Path('GGD-Asset-Library/intake/public-models-20260910/kof-author-models-round20').resolve()
p=Path('GGD-hero-model-options/tools/hero-model-library/extract_public_sources.py').resolve();spec=importlib.util.spec_from_file_location('extractor',p);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
for ident in ['mai-xv-sfm','mai-xv-raw','iori-xv-raw']:
 r=root/ident;archives=[p for p in (r/'raw').glob('*') if p.suffix in ('.zip','.rar')]
 if not archives:continue
 dest=r/'extracted-v1'
 if dest.exists():continue
 src=archives[0];m.unpack_native_archive(src,dest)
 files=[]
 for f in sorted(dest.rglob('*')):
  if not f.is_file():continue
  data=f.read_bytes();row={'path':f.relative_to(r).as_posix(),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'format':f.suffix.lower()};files.append(row)
  if data[:4]==b'IDST' and len(data)>=244:
   fields={'version':4,'checksum':8,'length':76,'boneCount':156,'boneOffset':160,'localAnimCount':180,'localAnimOffset':184,'localSequenceCount':188,'localSequenceOffset':192,'textureCount':204,'textureOffset':208,'bodyPartCount':232,'bodyPartOffset':236}
   row['mdlHeader']={key:struct.unpack_from('<i',data,off)[0] for key,off in fields.items()}
   row['mdlHeader']['name']=data[12:76].split(b'\0')[0].decode('utf8','replace')
   assert row['mdlHeader']['length']==len(data)
 report={'schema':'ggd.source-package-analysis@1','sourceId':ident,'archive':{'path':src.relative_to(r).as_posix(),'bytes':src.stat().st_size,'sha256':hashlib.sha256(src.read_bytes()).hexdigest()},'extraction':'system libarchive entire archive read, path/type/link/duplicate/size checks before writes','files':files,'formatCounts':dict(collections.Counter(f['format'] for f in files)),'fileCount':len(files),'extractedBytes':sum(f['bytes'] for f in files),'runtimeSelectable':False,'conversion':'pending root workflow'}
 (r/'extraction-validation.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n');print(ident,json.dumps({k:report[k] for k in ['fileCount','extractedBytes','formatCounts']},ensure_ascii=False),flush=True)

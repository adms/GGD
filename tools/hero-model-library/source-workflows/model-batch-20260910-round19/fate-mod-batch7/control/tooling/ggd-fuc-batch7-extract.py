from pathlib import Path
import collections,hashlib,importlib.util,json,sys
R=Path('/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/intake/public-models-20260910/fate-unlimited-codes-mod-models-batch7')
helper=R.parents[3]/'GGD-hero-model-options/tools/hero-model-library/extract_public_sources.py'
sp=importlib.util.spec_from_file_location('publicsafe',helper);m=importlib.util.module_from_spec(sp);sp.loader.exec_module(m)
slug=sys.argv[1];r=R/slug;assert not (R/'control/handoff.json').exists();receipts=json.loads((r/'download-receipts.json').read_text());assert all(x['curlExitCode']==0 and x['sizeMatch'] and x['md5Match'] for x in receipts)
for d in receipts:m.unpack_native_archive(r/d['path'],r/'extracted')
files=[]
for p in sorted((r/'extracted').rglob('*')):
 if not p.is_file():continue
 files.append({'path':str(p.relative_to(r)),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'suffix':p.suffix.lower()})
x={'localRoot':str(r),'safeExtraction':'system libarchive completed entire RAR/7z members and checksums; path/link/count/size checks; no code execution','fileCount':len(files),'formats':dict(collections.Counter(f['suffix'] for f in files)),'files':files,'originalArchivePreserved':True}
(r/'extraction.json').write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');print(json.dumps(x,ensure_ascii=False,indent=2))

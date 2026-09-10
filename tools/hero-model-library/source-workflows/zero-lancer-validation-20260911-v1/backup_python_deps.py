#!/usr/bin/env python3
"""Archive installed named dependency closure without fetching or changing packages."""
import argparse
import hashlib
import importlib.metadata as metadata
import json
import platform
import re
import sys
import zipfile
from pathlib import Path

ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,required=True);ap.add_argument('packages',nargs='+')
args=ap.parse_args();out=args.output.resolve();assert not out.exists();out.parent.mkdir(parents=True,exist_ok=True)
queue=list(args.packages);seen=set();packages=[];paths={}
while queue:
    name=queue.pop(0);key=re.sub(r'[-_.]+','-',name).lower()
    if key in seen:continue
    seen.add(key);dist=metadata.distribution(name);requires=[]
    for req in dist.requires or []:
        # Evaluate the observed simple Python-version markers, omit optional
        # extras, and fail on future unsupported environment expressions.
        if ';' in req:
            dep,marker=req.split(';',1)
            if 'extra ==' in marker:continue
            m=re.fullmatch(r'''\s*python_version\s*(<=|>=|<|>|==|!=)\s*['"]([0-9.]+)['"]\s*''',marker)
            assert m, f'Unsupported dependency marker: {req}'
            left=sys.version_info[:2];right=tuple(int(x) for x in m[2].split('.'))
            active={'<':left<right,'>':left>right,'<=':left<=right,'>=':left>=right,'==':left==right,'!=':left!=right}[m[1]]
            if not active:continue
            req=dep.strip()
        dep=re.split(r'[<>=!~\[ ]',req,1)[0];requires.append(dep);queue.append(dep)
    for member in dist.files or []:
        p=Path(dist.locate_file(member)).resolve()
        if p.is_file():paths.setdefault(p,[]).append(dist.metadata['Name'])
    packages.append({'name':dist.metadata['Name'],'version':dist.version,'runtimeRequires':requires})
rows=[]
with zipfile.ZipFile(out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for i,(p,owners) in enumerate(sorted(paths.items(),key=lambda x:str(x[0]))):
        data=p.read_bytes();name=f'files/{i:06d}';z.writestr(name,data)
        rows.append({'member':name,'originalPath':str(p),'packages':owners,'bytes':len(data),
                     'sha256':hashlib.sha256(data).hexdigest()})
    manifest={'schema':'ggd-installed-python-dependency-backup@1','python':sys.version,
              'platform':platform.platform(),'packages':packages,'files':rows,
              'scope':'Installed package distribution records and runtime dependency closure; Python/OS runtime separate.'}
    z.writestr('manifest.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    for row in rows:
        data=z.read(row['member']);assert len(data)==row['bytes'] and hashlib.sha256(data).hexdigest()==row['sha256']
out.with_suffix('.json').write_text(json.dumps({'archive':str(out),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),
    'bytes':out.stat().st_size,'packageVersions':packages,'memberFiles':len(rows),'allReadbackShaVerified':True},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'packages':len(packages),'files':len(rows),'bytes':out.stat().st_size}))

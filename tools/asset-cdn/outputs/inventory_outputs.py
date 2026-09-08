#!/usr/bin/env python3
"""Read-only, resumable SHA-256 inventory of outputs; never follows symlinks."""
import argparse, concurrent.futures, hashlib, json, os, time
from pathlib import Path

def inspect(base, rel):
    path=base/rel
    before=path.stat(follow_symlinks=False)
    if path.is_symlink(): return dict(path=rel,status='symlink_not_followed')
    if path.name in {'.env','credentials','id_rsa','id_ed25519'} or path.suffix.lower() in {'.pem','.key'}:
        return dict(path=rel,status='sensitive_name_not_read')
    if not path.is_file(): return dict(path=rel,status='not_regular_file')
    h=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''):h.update(block)
    after=path.stat()
    stable=(before.st_size,before.st_mtime_ns,before.st_ino)==(after.st_size,after.st_mtime_ns,after.st_ino)
    return dict(path=rel,bytes=after.st_size,sha256=h.hexdigest(),mtime_ns=after.st_mtime_ns,status='hashed' if stable else 'changed_during_read')

def main():
    p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,required=True);p.add_argument('--report',type=Path,required=True);a=p.parse_args()
    base=a.workspace.resolve();a.report.mkdir(parents=True,exist_ok=True)
    paths=[]
    for folder, dirs, files in os.walk(base/'outputs',followlinks=False):
        for name in list(dirs):
            if (Path(folder)/name).is_symlink(): paths.append((Path(folder)/name).relative_to(base).as_posix());dirs.remove(name)
        paths.extend((Path(folder)/n).relative_to(base).as_posix() for n in files)
    paths.sort();started=time.time();count=size=0;issues=[]
    with (a.report/'files.jsonl').open('w') as out, concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for start in range(0,len(paths),512):
            for result in pool.map(lambda rel:inspect(base,rel),paths[start:start+512]):
                out.write(json.dumps(result,ensure_ascii=False)+'\n');count+=1;size+=result.get('bytes',0)
                if result['status']!='hashed':issues.append(result)
            out.flush()
            progress=dict(status='hashing',files=count,total_files=len(paths),bytes=size,seconds=round(time.time()-started),issues=issues)
            (a.report/'progress.json').write_text(json.dumps(progress,ensure_ascii=False,indent=2)+'\n')
            print(f"HASHED {count}/{len(paths)} bytes={size}",flush=True)
    progress['status']='complete' if not issues else 'needs_review';progress['index_sha256']=hashlib.sha256((a.report/'files.jsonl').read_bytes()).hexdigest()
    (a.report/'progress.json').write_text(json.dumps(progress,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()

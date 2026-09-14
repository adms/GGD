#!/usr/bin/env python3
import argparse,json,subprocess,sys
from pathlib import Path
from scope_guard import load_scope
p=argparse.ArgumentParser()
p.add_argument('--control',type=Path,required=True)
p.add_argument('--source-root',type=Path)
p.add_argument('--metadata-root',type=Path,required=True)
p.add_argument('--hashes',type=Path,required=True)
p.add_argument('--decoder',type=Path,required=True)
p.add_argument('--skip-fetch',action='store_true')
a=p.parse_args();scope=load_scope(a.control)
root=(a.source_root or Path(scope['sourceLocalRoot'])).resolve();meta=a.metadata_root.resolve();tools=Path(__file__).parent
meta.mkdir(parents=True,exist_ok=True);logs=meta/'workflow-logs';logs.mkdir(exist_ok=True)
def run(name,args):
    print(json.dumps({'phase':name,'allowedNames':scope['allowedFreezeNames']}),flush=True)
    with (logs/(name+'.log')).open('a') as f:
        result=subprocess.run([sys.executable,str(tools/(name+'.py')),*args],stdout=f,stderr=subprocess.STDOUT)
    if result.returncode:raise SystemExit(name+' stopped; inspect '+str(logs/(name+'.log')))
common=['--control',str(a.control)]
if not a.skip_fetch:
    run('acquire_project_ja',common+['--source-root',str(root),'--names',*scope['allowedDownloadNames'],'--batch-id','ja-project-seven-missing-four'])
run('extract_project_ja',common+['--wad-directory',str(root/'original-wads'),'--hashes',str(a.hashes),'--intake',str(root/'audio')])
run('decode_project_ja',common+[str(root/'audio'),'--decoder',str(a.decoder),'--workers','2'])
run('freeze_project_ja',common+['--source-root',str(root),'--metadata-root',str(meta),'--decoder',str(a.decoder)])
run('make_seven_handoff',common+['--metadata-root',str(meta)])
print((meta/'latest-seven-delivery-receipt.json').read_text(),flush=True)

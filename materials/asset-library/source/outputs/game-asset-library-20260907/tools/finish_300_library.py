"""Finish extraction, manifest synchronization and catalog generation in order."""
import json
import subprocess
import sys
import time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evidence';T=ROOT/'tools'
while not (ROOT/'300heroes/downloads/300hero_v202609021.zip').exists() or len(list(E.glob('Data*.jmp.extracted.json')))<9:
    time.sleep(10)
steps=[
    ('client-media',[sys.executable,str(T/'extract_300_client_media.py')]),
    ('manifest-sync',[sys.executable,str(T/'sync_300_assets.py'),'--fetch']),
    ('manifest-audit',[sys.executable,str(T/'sync_300_assets.py')]),
    ('models-final',[sys.executable,str(T/'index_300_models.py'),'--obj','--workers','4']),
    ('audio-final',['arch','-x86_64','/usr/local/bin/python3',str(T/'extract_300_audio.py'),'--workers','3']),
    ('catalog',[sys.executable,str(T/'build_asset_catalog.py')]),
    ('materials',[sys.executable,str(T/'resolve_300_materials.py')]),
    ('catalog-final',[sys.executable,str(T/'build_asset_catalog.py')]),
]
for name,command in steps:
    print(json.dumps(dict(event='start',step=name,time=time.strftime('%H:%M:%S'))),flush=True)
    with (E/('300-'+name+'-finish.log')).open('w') as log:
        subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,check=True)
    print(json.dumps(dict(event='done',step=name,time=time.strftime('%H:%M:%S'))),flush=True)
print('FINISHED',flush=True)

import json, subprocess
from pathlib import Path

proof=Path('/private/tmp/ggd-desktop-publication-proof')
binary=proof/'dist/mac-universal/GGD Ability & VFX Editor.app/Contents/MacOS/GGD Ability & VFX Editor'
workspace=Path('/private/tmp/ggd-model-upload-acceptance/desktop-publication-proof')
profile=workspace/'smoke-user-data'
receipts=[]
for attempt in (1,2):
    args=[str(binary),'--workspace='+str(workspace),'--platform-url=http://127.0.0.1:8092','--user-data-dir='+str(profile),'--smoke-test']
    result=subprocess.run(args,cwd=workspace,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
    output=result.stdout.decode('utf8',errors='replace')
    (proof/f'smoke-final-{attempt}.log').write_text(output)
    if result.returncode:
        raise RuntimeError(f'native smoke {attempt} exit {result.returncode}: '+output[-2000:])
    objects=[]
    for line in output.splitlines():
        try: objects.append(json.loads(line))
        except ValueError: pass
    receipt=next((value for value in objects if isinstance(value,dict) and value.get('schema')=='ggd-editor-desktop-smoke@1'),None)
    assert receipt, 'missing native receipt'
    assert receipt['platformOrigin']=='http://127.0.0.1:8092'
    assert len(receipt['checks'])==5 and all(check['status']==200 for check in receipt['checks'])
    assert receipt['nativePreload']=={'draftBridge':True,'platformOrigin':'http://127.0.0.1:8092'}
    assert receipt['draftFlush'] is True
    receipts.append(receipt)
assert receipts[0]['origin']==receipts[1]['origin'], 'origin changed after restart'
(proof/'native-smoke-final-proof.json').write_text(json.dumps({'binary':str(binary),'receipts':receipts,'scope':'native packaged application HTTP startup/restart, real preload and draft-save IPC; no signed installation'},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'runs':2,'origin':receipts[0]['origin'],'checksPerRun':5}))

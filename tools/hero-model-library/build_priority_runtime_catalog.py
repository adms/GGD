"""Import accepted runtime deliveries; raw packages and processing files stay local/S3."""
import json, hashlib, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DIR=ROOT/'materials/hero-model-library'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_text())
def main():
    inputs=read(DIR/'priority-runtime-inputs.json');models=[];heroes={}
    for row in inputs['entries']:
        src=Path(row['localRuntimeRoot']);doc=read(src/'model.json')
        assert sha(src/'body.glb')==row['sha256']
        assert sha(src/'model.json')==row['documentSha256']
        targets=[(src/'body.glb',ROOT/'content'/doc['glbPath']),(src/'model.json',ROOT/'content/models'/(doc['id']+'.json'))]
        for source,target in targets:
            target.parent.mkdir(parents=True,exist_ok=True)
            if target.exists():assert source.read_bytes()==target.read_bytes(),target
            else:shutil.copyfile(source,target)
        sid='runtime:'+row['candidateId'];s=row['source']
        model=dict(id=sid,modelKey=doc['id'],glbPath=doc['glbPath'],sha256=row['sha256'],bytes=(src/'body.glb').stat().st_size,
            documentSha256=row['documentSha256'],sourceCharacter=s['character'],sourceWork=s['work'],sourceAssetId=s['reference'],
            clipMap=doc['clipMap'],limitations=row['limitations'],storage='git',gitPath='content/'+doc['glbPath'],
            nativeAnimationCount=row.get('nativeAnimationCount',0),
            proceduralAnimationCount=row.get('proceduralAnimationCount',6),
            validation=row.get('validation','shared-prepare-verify-and-sampled-babylon-render-passed'),fullCharacterPackage=False)
        models.append(model)
        h=heroes.setdefault(row['heroId'],dict(id=row['heroId'],name=row['name'],options=[],pending=[]))
        h['options'].append(dict(sourceId=sid,sourceModelKey=doc['id'],label=row['label'],source=s))
    out=dict(schema='ggd-priority-runtime-options@1',models=models,heroes=list(heroes.values()))
    (DIR/'priority-runtime-options.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    print('Runtime deliveries:',len(models))
if __name__=='__main__':main()

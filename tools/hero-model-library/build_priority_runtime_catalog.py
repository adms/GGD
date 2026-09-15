"""Import accepted runtime deliveries; raw packages and processing files stay local/S3."""
import argparse, json, hashlib, shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
DIR=ROOT/'materials/hero-model-library'
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path):return json.loads(path.read_text())
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    inputs=read(DIR/'priority-runtime-inputs.json')
    current_path=DIR/'priority-runtime-options.json'
    current=read(current_path) if current_path.exists() else {'models':[],'heroes':[]}
    models_by_id={row['id']:row for row in current['models']}
    heroes={hero['id']:dict(id=hero['id'],name=hero['name'],options=list(hero['options']),pending=list(hero.get('pending',[]))) for hero in current['heroes']}
    current_models={row['id']:row for row in current['models']}
    current_options={(hero['id'],option['sourceId']):option for hero in current['heroes'] for option in hero['options']}
    for row in inputs['entries']:
        src=Path(row['localRuntimeRoot']);doc=read(src/'model.json')
        assert sha(src/'body.glb')==row['sha256']
        assert sha(src/'model.json')==row['documentSha256']
        sid='runtime:'+row['candidateId'];s=row['source']
        previous=current_models.get(sid)
        source_delivery=(previous or {}).get('sourceDelivery',{})
        preserve_previous=bool(previous) and (
            (previous.get('sha256')==row['sha256'] and previous.get('documentSha256')==row['documentSha256'])
            or (source_delivery.get('sha256')==row['sha256'] and source_delivery.get('documentSha256')==row['documentSha256'])
        )
        if preserve_previous:
            target_glb=ROOT/'content'/previous['glbPath']
            target_doc=ROOT/'content/models'/(previous['modelKey']+'.json')
            assert target_glb.is_file() and sha(target_glb)==previous['sha256'],target_glb
            assert target_doc.is_file() and sha(target_doc)==previous['documentSha256'],target_doc
            model=previous
        else:
            targets=[(src/'body.glb',ROOT/'content'/doc['glbPath']),(src/'model.json',ROOT/'content/models'/(doc['id']+'.json'))]
            for source,target in targets:
                target.parent.mkdir(parents=True,exist_ok=True)
                if target.exists():assert source.read_bytes()==target.read_bytes(),target
                else:shutil.copyfile(source,target)
            model=dict(id=sid,modelKey=doc['id'],glbPath=doc['glbPath'],sha256=row['sha256'],bytes=(src/'body.glb').stat().st_size,
                documentSha256=row['documentSha256'],sourceCharacter=s['character'],sourceWork=s['work'],sourceAssetId=s['reference'],
                clipMap=doc['clipMap'],limitations=row['limitations'],storage='git',gitPath='content/'+doc['glbPath'],
                localRuntimeRoot=row['localRuntimeRoot'],
                nativeAnimationCount=row.get('nativeAnimationCount',0),
                proceduralAnimationCount=row.get('proceduralAnimationCount',6),
                validation=row.get('validation','shared-prepare-verify-and-sampled-babylon-render-passed'),fullCharacterPackage=False)
            if row.get('s3'):
                model['s3']=row['s3']
        if sid not in models_by_id:
            models_by_id[sid]=model
        h=heroes.setdefault(row['heroId'],dict(id=row['heroId'],name=row['name'],options=[],pending=[]))
        option=current_options.get((row['heroId'],sid)) if preserve_previous else None
        if option is None:
            option=dict(sourceId=sid,sourceModelKey=model['modelKey'],label=row['label'],source=s)
            if 'automaticEligible' in row:
                option['automaticEligible']=row['automaticEligible']
        already=next((value for value in h['options'] if value['sourceId']==sid),None)
        if already is None:
            h['options'].append(option)
        else:
            assert already==option,(row['heroId'],sid)
    models=list(models_by_id.values())
    out=dict(schema='ggd-priority-runtime-options@1',models=models,heroes=list(heroes.values()))
    encoded=json.dumps(out,ensure_ascii=False,indent=2)+'\n'
    output=DIR/'priority-runtime-options.json'
    if args.check:
        assert output.is_file() and output.read_text()==encoded,'priority-runtime-options.json is stale'
    else:
        output.write_text(encoded)
    print('Runtime deliveries:',len(models))
if __name__=='__main__':main()

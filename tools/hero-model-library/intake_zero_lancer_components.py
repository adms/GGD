#!/usr/bin/env python3
"""Admit the two accepted Zero Lancer skinned components, never a hero."""
import argparse, copy, hashlib, json, shutil
from pathlib import Path

from skinned_components import file_pin, require

SOURCE_ID='gamebanana-zero-lancer-493444'
DELIVERY_ID='zero-lancer-validation-20260911-v1'
IDS={'P1':'zero-lancer-p1-static-skinned-v1','P2':'zero-lancer-p2-static-skinned-v1'}


def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def prepare(repo, downloads, delivery_path, acceptance_path):
    repo=Path(repo).resolve(); delivery_path=Path(delivery_path).resolve(); acceptance_path=Path(acceptance_path).resolve()
    delivery=json.loads(delivery_path.read_text()); acceptance=json.loads(acceptance_path.read_text())
    require(delivery.get('schema') == 'ggd.zero-lancer-component-delivery@1' and delivery.get('deliveryId') == DELIVERY_ID,
            'Unexpected Zero Lancer delivery')
    delivery_sha=sha(delivery_path)
    require(acceptance.get('schema') == 'ggd.skinned-component-acceptance@1' and acceptance.get('deliverySha256') == delivery_sha,
            'Acceptance does not pin this Zero Lancer delivery')
    result=copy.deepcopy(downloads); sources=[s for s in result.get('publicSources',[])+result.get('paidSources',[]) if s.get('id')==SOURCE_ID]
    require(len(sources)==1,'Expected one Zero Lancer source'); source=sources[0]
    source.setdefault('sourceClass','community-mod')
    require(source['heroIds']==[] and delivery.get('heroIds')==[] and delivery.get('runtimeReady') is False,
            'Zero Lancer delivery must remain unmapped and not runtime ready')
    require(delivery.get('completeHeroCount')==0 and delivery.get('nativeAnimationCount')==0 and delivery.get('backendRegistrations')==0,
            'Zero Lancer delivery cannot claim a complete hero')
    evidence_root=Path('materials/hero-model-library/priority-evidence/zero-lancer')/delivery_sha
    copies=[]
    def evidence(path,name):
        pin=file_pin(path); rel=evidence_root/name; copies.append((Path(path),repo/rel)); return dict(gitPath=rel.as_posix(),bytes=pin['bytes'],sha256=pin['sha256'])
    delivery_pin=evidence(delivery_path,'delivery.json'); acceptance_pin=evidence(acceptance_path,'acceptance.json')
    visual_path=Path(delivery['localRoot'])/delivery['visualReview']['path']
    visual=evidence(visual_path,'visual-review.json')
    visual_proofs={row['variant']:row for row in json.loads(visual_path.read_text())['proofs']}
    fidelity=evidence(Path(delivery['localRoot'])/delivery['sourceFidelity']['reportPath'],'source-fidelity.json')
    rebuild=evidence(Path(delivery['localRoot'])/delivery['sourceRebuild']['path'],'source-rebuild.json')
    models={row['variant']:row for row in delivery['models']}
    require(set(models)==set(IDS),'Unexpected Zero Lancer variant set')
    for variant, component_id in IDS.items():
        model=models[variant]; out=Path(model['outputPath']); require(file_pin(out)['sha256']==model['outputSha256'],'Changed output model')
        validation=Path(delivery['localRoot'])/'outputs'/variant.lower()/'validation.json'
        validation_pin=evidence(validation,component_id+'-validation.json')
        proof=visual_proofs[variant]; proof_path=Path(proof['proofPath']); visual_pin=evidence(proof_path,component_id+'-webgl-proof.json')
        for shot in proof['shots']:
            evidence(shot['path'],component_id+'-'+Path(shot['path']).name)
        candidate=dict(id=component_id,sourceId=SOURCE_ID,sourceClass='community-mod',nameZh='Zero Lancer／迪爾姆德 '+variant,
            originalName='Diarmuid Ua Duibhne / Zero Lancer '+variant,workZh='Fate/unlimited codes（作者標示；原平台待核）',
            sourceGame='Fate/unlimited codes',platform='unknown',variant=variant,resourceRole='independent-static-skinned-model-component',
            assetKinds=['model-component','skeleton','texture'],absolutePath=str(out),path=str(out),bytes=model['outputBytes'],sha256=model['outputSha256'],
            gitPath='content/assets/models/community/'+model['outputSha256']+'.glb',componentReady=True,runtimeSelectable=False,defaultEligible=False,
            automaticEligible=False,fullHeroModel=False,runtimeDropdownRegistered=False,heroIds=[],relatedHeroIds=[],nativeAnimationCount=0,
            proceduralAnimationCount=0,triangles=model['triangles'],drawPrimitives=model['drawPrimitives'],skinCount=model['skinCount'],jointCount=model['joints'],
            textureCount=len(model['textures']),readiness='accepted-static-skinned-component-pending-character-mapping-and-animation',
            limitations=delivery['gaps'],deliveryEvidence=delivery_pin,acceptanceEvidence=acceptance_pin,validationEvidence=validation_pin,
            visualEvidence=visual_pin,sourceFidelityEvidence=fidelity,sourceRebuildEvidence=rebuild)
        existing=[x for x in source.setdefault('componentCandidates',[]) if x.get('id')==component_id]
        require(len(existing)<=1,'Duplicate Zero Lancer component ID')
        if existing: require(all(existing[0].get(k)==v for k,v in candidate.items()),'Existing component differs from delivery')
        else: source['componentCandidates'].append(candidate)
        copies.append((out,repo/candidate['gitPath']))
    for src,dst in copies: require(not dst.exists() or dst.read_bytes()==src.read_bytes(),'Refusing to overwrite '+str(dst))
    return result,copies


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('delivery',type=Path);parser.add_argument('--acceptance',type=Path,required=True)
    mode=parser.add_mutually_exclusive_group(required=True);mode.add_argument('--check',action='store_true');mode.add_argument('--write',action='store_true');args=parser.parse_args()
    repo=Path.cwd(); index=repo/'materials/hero-model-library/download-sources.json'; result,copies=prepare(repo,json.loads(index.read_text()),args.delivery,args.acceptance)
    if args.write:
        for src,dst in copies:
            dst.parent.mkdir(parents=True,exist_ok=True)
            if not dst.exists(): shutil.copyfile(src,dst)
        index.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(dict(components=2,heroBindings=0,nativeAnimations=0,fileCopies=len(copies),written=args.write)))


if __name__=='__main__': main()

#!/usr/bin/env python3
"""Admit Ryu's validated six-state procedural fallback as an independent component."""
from __future__ import annotations
import argparse,hashlib,json
from pathlib import Path

SOURCE_ID='gitlab-ssbu-models'
SOURCE_COMPONENT_ID='ssbu-ryu-c00-static-skinned-v1'
COMPONENT_ID='ssbu-ryu-c00-procedural-six-state-v1'
ROLE='independent-skinned-model-motion-component'
OUTPUT_SHA256='97898b3e9211bfb829a1e23ecb28bcd09bb72354e594959eb11e484e379316cf'
OUTPUT_BYTES=1_069_196
SOURCE_SHA256='cb216ec537d9ea1a5c5d01c3a8afe88de547c57b76282254c1b6da0e15193c5c'

def require(condition,message):
    if not condition:raise ValueError(message)
def sha(data):return hashlib.sha256(data).hexdigest()
def pin(path):
    path=Path(path);data=path.read_bytes();return {'absolutePath':str(path.resolve()),'bytes':len(data),'sha256':sha(data)}
def encoded(value):return (json.dumps(value,ensure_ascii=False,indent=2)+'\n').encode()
def git_pin(path,data):return {'gitPath':str(path),'bytes':len(data),'sha256':sha(data)}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--primary-root',type=Path,required=True);parser.add_argument('--rebuild-root',type=Path,required=True)
    parser.add_argument('--visual-root',type=Path,required=True)
    mode=parser.add_mutually_exclusive_group(required=True);mode.add_argument('--write',action='store_true');mode.add_argument('--check',action='store_true')
    args=parser.parse_args();repo=Path.cwd().resolve();primary=args.primary_root.resolve();rebuild=args.rebuild_root.resolve();visual=args.visual_root.resolve()
    model=primary/'body.glb';model2=rebuild/'body.glb';preparation=json.loads((primary/'preparation.receipt.json').read_text())
    validation=json.loads((primary/'validation.json').read_text());proof=json.loads((visual/'proof.json').read_text())
    source=repo/f'content/assets/models/community/{SOURCE_SHA256}.glb'
    require(pin(model)['sha256']==pin(model2)['sha256']==OUTPUT_SHA256,'Procedural final GLB rebuild differs')
    require(pin(model)['bytes']==pin(model2)['bytes']==OUTPUT_BYTES,'Unexpected procedural final GLB size')
    require(pin(source)['sha256']==SOURCE_SHA256,'Changed accepted static Ryu source')
    require(preparation['source']['sha256']==SOURCE_SHA256 and preparation['output']['sha256']==OUTPUT_SHA256,'Preparation pins differ')
    require(preparation['animationProvenance']['native'] is False and preparation['animationProvenance']['retargeted'] is False,'Procedural provenance differs')
    require(validation['structuralValidationPassed'] is True and validation['webglSamplingPassed'] is True,'Validation did not pass')
    require(validation['khronosIssues']['numErrors']==validation['khronosIssues']['numWarnings']==0 and validation['ggdInspection']['budget']['errors']==[],'Khronos or GGD hard budget failed')
    require([row['name'] for row in validation['ggdInspection']['clips']]==['GGD_procedural_'+s for s in ('idle','run','attack','cast','hurt','death')],'Clip map differs')
    require(proof['schema']=='ggd.procedural-motion-front-webgl@1' and len(proof['samples'])==60,'WebGL proof is incomplete')
    screenshots=sorted(visual.glob('ggd-procedural-*.png'));require(len(screenshots)==60 and all(p.stat().st_size>20_000 for p in screenshots),'Expected 60 nonempty WebGL frames')
    contacts=[visual/'contact-front.jpg',visual/'contact-side.jpg'];require(all(p.stat().st_size>100_000 for p in contacts),'Contact sheets are incomplete')
    death_end=next(row for row in proof['samples'] if row['group']=='GGD_procedural_death' and row['label']=='end' and row['view']=='side')
    require(abs(death_end['worldSkinnedBounds']['min'][1])<.01,'Death end is not within 1 cm of the ground plane')

    tool_paths=[
      'tools/hero-model-library/priority-conversion/procedural-six-state/ggd-procedural-six-state.py',
      'tools/hero-model-library/priority-conversion/procedural-six-state/configs/ssbu-ryu-c00-v1.json',
      'tools/hero-model-library/priority-conversion/procedural-six-state/render_motion_glb.py',
      'tools/hero-model-library/priority-conversion/procedural-six-state/render_motion_glb.mjs',
      'tools/hero-model-library/priority-conversion/procedural-six-state/make_contact_sheet.py',
      'tools/hero-model-library/priority-conversion/procedural-six-state/validate_procedural_component.mts',
      'tools/hero-model-library/priority-conversion/procedural-six-state/test_procedural_six_state.py',
      'tools/hero-model-library/priority-conversion/procedural-six-state/integrate_ryu.py',
    ]
    tool_pins=[{'path':p,'sha256':sha((repo/p).read_bytes())} for p in tool_paths]
    gaps=[
      'The six clips are GGD-generated procedural fallback motions, not original SSBU or Street Fighter animations.',
      'Run has no gameplay root motion or foot-contact guarantee; source hands retain their open static pose.',
      'No Ryu GGD hero definition or skill mapping exists, so this independent component is not registered in a backend dropdown and cannot be selected at runtime.',
      'No source VFX, SFX or voice was created or inferred by this motion conversion.',
      'Source-game shader parity remains incomplete; five draw primitives pass the hard budget and exceed the warning threshold of three.',
    ]
    delivery={
      'schema':'ggd.ssbu-ryu-procedural-six-state-delivery@1','deliveryId':'ssbu-ryu-c00-procedural-six-state-v1','sourceIds':[SOURCE_ID],
      'sourceComponentId':SOURCE_COMPONENT_ID,'character':{'name':'Ryu','nameZh':'隆／Ryu','nativeId':'fighter/ryu/body/c00','variant':'c00','workZh':'任天堂明星大亂鬥 特別版（原作：Street Fighter）','platform':'Nintendo Switch'},
      'source':pin(source),'output':pin(model),
      'metrics':{'triangles':validation['ggdInspection']['triangles'],'drawPrimitives':validation['ggdInspection']['drawPrimitives'],'skinCount':validation['ggdInspection']['skinCount'],'jointCount':validation['ggdInspection']['jointCount'],'textureCount':validation['ggdInspection']['textureCount'],'nativeMotionCount':0,'proceduralMotionCount':6,'animationChannelCountPerClip':12},
      'validation':{'khronosErrors':0,'khronosWarnings':0,'ggdBudgetErrors':0,'ggdBudgetWarnings':validation['ggdInspection']['budget']['warnings'],'finiteFloatValuesChecked':validation['finiteFloatAccessors']['valueCount'],'webglSamplesReviewed':60,'cameraViews':['front','side'],'visualPlaybackAccepted':True,'deathEndMinimumY':death_end['worldSkinnedBounds']['min'][1]},
      'status':{'converted':True,'structurallyValidated':True,'visuallyAcceptedIndependentComponent':True,'sixStateFallbackComplete':True,'completeNativeActionSet':False,'completeGameplayActionSet':False,'completeHero':False,'heroBound':False,'runtimeSelectable':False,'deployed':False},
      'toolPins':tool_pins,'gaps':gaps,
    }
    delivery_data=encoded(delivery);evidence_root=Path('materials/hero-model-library/priority-evidence/ssbu-ryu-procedural')/sha(delivery_data)
    files={
      'delivery.json':delivery_data,'preparation.receipt.json':(primary/'preparation.receipt.json').read_bytes(),
      'config.json':(primary/'config.json').read_bytes(),'validation.json':(primary/'validation.json').read_bytes(),
      'webgl-proof.json':(visual/'proof.json').read_bytes(),'contact-front.jpg':contacts[0].read_bytes(),'contact-side.jpg':contacts[1].read_bytes(),
    }
    contact_pins=[git_pin((evidence_root/name).as_posix(),files[name]) for name in ('contact-front.jpg','contact-side.jpg')]
    rebuild_evidence={'schema':'ggd.procedural-six-state-source-rebuild@1','componentId':COMPONENT_ID,'source':pin(source),'firstOutput':pin(model),'secondOutput':pin(model2),'finalGlbByteIdenticalRebuild':model.read_bytes()==model2.read_bytes(),'outputSha256':OUTPUT_SHA256,'toolPins':tool_pins}
    files['source-rebuild.json']=encoded(rebuild_evidence)
    visual_review={
      'schema':'ggd.ssbu-ryu-procedural-six-state-visual-review@1','componentId':COMPONENT_ID,'modelSha256':OUTPUT_SHA256,'accepted':True,'acceptedAt':'2026-09-13','scope':ROLE,
      'reviewedSamples':{'count':60,'states':['idle','run','attack','cast','hurt','death'],'fractions':[0,.25,.5,.75,1],'views':['front','side']},
      'findings':['All six clips were rendered through Babylon WebGL at five times from front and side.','The body remains complete without detached limbs, collapsed skinning, missing materials or non-finite bounds.','Quarter samples expose alternating run strides; start/middle/end alone would have missed the cyclic extrema.','The death clip falls forward and ends within 4.96 mm of the ground plane.','Acceptance is limited to a generated independent fallback component and does not establish native motion, gameplay timing or backend readiness.'],
      'contactSheets':contact_pins,'rawSampleDirectory':str(visual),'rawSampleCount':60,'rawSamplesPreservedLocally':True,'rawSamplesGitPublished':False,'rawSamplesS3Backup':'pending',
      'runtimeSelectionVerified':False,'deploymentVerified':False,
    }
    files['visual-review.json']=encoded(visual_review)
    acceptance={'schema':'ggd.animated-component-acceptance@1','acceptedAt':'2026-09-13','components':[{'id':COMPONENT_ID,'sha256':OUTPUT_SHA256,'accepted':True,'scope':ROLE,'native':False,'retargeted':False,'procedural':True,'sixStateFallbackComplete':True,'completeGameplayActionSet':False,'reviewedMotionCount':6,'reviewedSampleCount':60,'limitationsAccepted':gaps}]}
    files['acceptance.json']=encoded(acceptance)
    def evidence(name):return git_pin((evidence_root/name).as_posix(),files[name])
    candidate={
      'id':COMPONENT_ID,'conversionCandidateId':SOURCE_COMPONENT_ID,'sourceComponentId':SOURCE_COMPONENT_ID,'sourceId':SOURCE_ID,'sourceIds':[SOURCE_ID],
      'sourceClass':'original-game-extraction-community-repackage','selectionClass':'canonical-game','modelSourceCategory':'canonical-game','animationSourceCategory':'ggd-procedural-fallback',
      'nameZh':'隆／Ryu','originalName':'Ryu','workZh':'任天堂明星大亂鬥 特別版（原作：Street Fighter）','sourceGame':'Super Smash Bros. Ultimate','sourceGameReleasedAt':'2018-12-07','platform':'Nintendo Switch','nativeId':'fighter/ryu/body/c00','variant':'c00',
      'resourceRole':ROLE,'assetKinds':['model-component','skeleton','texture','animation'],'absolutePath':str(model),'path':str(model),'bytes':OUTPUT_BYTES,'sha256':OUTPUT_SHA256,'gitPath':f'content/assets/models/community/{OUTPUT_SHA256}.glb',
      'componentReady':True,'converted':True,'structuralValidationPassed':True,'visualValidationPassed':True,'runtimeReady':False,'runtimeSelectable':False,'defaultEligible':False,'automaticEligible':False,'fullHeroModel':False,'runtimeDropdownRegistered':False,'heroIds':[],'relatedHeroIds':[],'identityIds':['ssbu-ryu'],
      'nativeAnimationCount':0,'proceduralAnimationCount':6,'animationProvenance':'ggd-procedural-fallback','animationNames':['GGD_procedural_'+s for s in ('idle','run','attack','cast','hurt','death')],
      'triangles':validation['ggdInspection']['triangles'],'drawPrimitives':validation['ggdInspection']['drawPrimitives'],'skinCount':1,'jointCount':validation['ggdInspection']['jointCount'],'textureCount':validation['ggdInspection']['textureCount'],'sixStateFallbackComplete':True,'completeGameplayActionSet':False,
      'readiness':'accepted-independent-procedural-six-state-fallback-not-hero-bound','auditEvidence':'Ryu c00 preserves the accepted SSBU static component and adds six clearly labelled GGD procedural fallback clips. Khronos reports 0 errors/0 warnings, GGD hard budget has 0 errors, 129,228 float values are finite, and 60 front/side WebGL samples were visually accepted. No native action, hero binding, dropdown registration or deployment is claimed.','limitations':gaps,
      'deliveryEvidence':evidence('delivery.json'),'acceptanceEvidence':evidence('acceptance.json'),'validationEvidence':evidence('validation.json'),'visualEvidence':evidence('visual-review.json'),'webglProofEvidence':evidence('webgl-proof.json'),'sourceRebuildEvidence':evidence('source-rebuild.json'),'preparationEvidence':evidence('preparation.receipt.json'),'backupStatus':'pending-s3-conversion-stage-backup',
    }
    downloads_path=repo/'materials/hero-model-library/download-sources.json';downloads=json.loads(downloads_path.read_text())
    sources=[row for row in downloads['publicSources'] if row.get('id')==SOURCE_ID];require(len(sources)==1,'Expected one SSBU source');source_row=sources[0]
    matches=[row for row in source_row.setdefault('componentCandidates',[]) if row.get('id')==COMPONENT_ID];require(len(matches)<=1,'Duplicate procedural Ryu component')
    if matches:
      require(matches[0].get('sha256')==OUTPUT_SHA256,'Existing procedural Ryu component differs');preserved={k:matches[0][k] for k in ('s3Uri','s3ArchiveMember','s3Use','backupReceiptPath','backupReceiptSha256','backupLocations') if k in matches[0]};merged=dict(matches[0]);merged.update(candidate);merged.update(preserved)
      if preserved.get('s3Uri'):merged['backupStatus']='s3-full-readback-verified'
      source_row['componentCandidates'][source_row['componentCandidates'].index(matches[0])]=merged;candidate=merged
    else:source_row['componentCandidates'].append(candidate)
    writes={downloads_path:encoded(downloads),repo/candidate['gitPath']:model.read_bytes()}

    # The complete source audit is local/S3 material, but it remains the
    # generator input for the fixed design-backlog index. Synchronize its Ryu
    # row when present so regeneration cannot erase this accepted component.
    community_path=repo/'materials/hero-model-library/design-backlog/sources-community.json'
    if community_path.is_file():
      community=json.loads(community_path.read_text())
      identities=[row for row in community.get('characters',[]) if row.get('id')=='ssbu-ryu'];require(len(identities)==1,'Expected one local ssbu-ryu identity')
      identity=identities[0]
      backlog_candidate={
        'path':str(model),'existsLocal':True,'bytes':OUTPUT_BYTES,'sha256':OUTPUT_SHA256,
        'sha256Status':'verified-byte-identical-rebuild','magicHex':model.read_bytes()[:12].hex(),
        'modelProof':{'format':'glTF2-binary','meshes':1,'primitives':validation['ggdInspection']['drawPrimitives'],'skins':1,'animationEntries':6},
        'id':COMPONENT_ID,'library':'community','sourceId':SOURCE_ID,
        'sourceUrl':'https://gitlab.com/Worldblender/smash-ultimate-models-exported',
        'readiness':'accepted-independent-procedural-six-state-fallback-not-hero-bound','converted':True,
        'resourceRole':ROLE,'nativeId':'fighter/ryu/body/c00','format':'glTF Binary',
        'gitPath':candidate['gitPath'],'componentReady':True,'nativeAnimationCount':0,'proceduralAnimationCount':6,
        'runtimeSelectable':False,'defaultEligible':False,'fullHeroModel':False,
        'limitations':gaps,'validationEvidence':candidate['validationEvidence'],'visualEvidence':candidate['visualEvidence'],
        'identityReviewRequired':False,'recordedBytes':OUTPUT_BYTES,'sizeMatchesManifest':True,
      }
      local_matches=[row for row in identity.setdefault('modelCandidates',[]) if row.get('id')==COMPONENT_ID];require(len(local_matches)<=1,'Duplicate local procedural Ryu candidate')
      if local_matches:identity['modelCandidates'][identity['modelCandidates'].index(local_matches[0])]=backlog_candidate
      else:identity['modelCandidates'].append(backlog_candidate)
      evidence_line='Ryu c00 now also has an independently accepted GGD procedural six-state fallback: 6 generated clips, 60 two-view WebGL samples, and a byte-identical rebuild. It remains non-native, unbound to a hero, unavailable in the backend dropdown, and undeployed.'
      if evidence_line not in identity.setdefault('evidence',[]):identity['evidence'].append(evidence_line)
      writes[community_path]=encoded(community)
    for name,data in files.items():writes[repo/evidence_root/name]=data
    if args.write:
      for path,data in writes.items():
        path.parent.mkdir(parents=True,exist_ok=True)
        if path in (downloads_path,community_path) or not path.exists():path.write_bytes(data)
        else:require(path.read_bytes()==data,'Refusing to overwrite different file: '+str(path))
    else:
      for path,data in writes.items():require(path.is_file() and path.read_bytes()==data,'Refresh Ryu procedural integration: '+str(path))
    print(json.dumps({'componentId':COMPONENT_ID,'sha256':OUTPUT_SHA256,'proceduralMotions':6,'visualSamples':60,'completeGameplayActionSet':False,'runtimeSelectable':False,'evidenceRoot':evidence_root.as_posix(),'files':len(writes),'written':args.write},ensure_ascii=False))
    return 0
if __name__=='__main__':raise SystemExit(main())

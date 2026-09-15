#!/usr/bin/env python3
"""Validate the v2 whole-mesh JUMP FORCE Dai candidate without mutating it.

Runs the structural-stage `--check`, the pinned Khronos validator, and the
repository GGD model-budget guard.  It validates the three existing WebGL
review images and deterministic source/candidate comparison receipt, then
writes a single status document.  It deliberately does not promote, copy, or
register a model option.
"""
from __future__ import annotations
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
ABX=REPO.parent
ASSETS=ABX/'GGD-Asset-Library'
DEFAULT_STAGE=ASSETS/'conversions/jump-force-dai-l4d2-topology-preserving-v2'

KHR=REPO/'tools/hero-model-library/source-workflows/jump-force-dai-decimation-v2/validate_khronos.mjs'


def sha(p:Path)->str:
 h=hashlib.sha256()
 with p.open('rb') as f:
  for c in iter(lambda:f.read(1<<20),b''):h.update(c)
 return h.hexdigest()

def run_json(argv:list[str],cwd:Path)->dict:
 p=subprocess.run(argv,cwd=cwd,text=True,capture_output=True,check=False)
 if p.returncode:
  raise RuntimeError('command failed '+repr(argv)+'\nstdout:\n'+p.stdout+'\nstderr:\n'+p.stderr)
 return json.loads(p.stdout)

def pin(p:Path)->dict:
 return {'absolutePath':str(p.resolve()),'bytes':p.stat().st_size,'sha256':sha(p)}

def main()->None:
 import argparse
 parser=argparse.ArgumentParser(description=__doc__)
 parser.add_argument("--stage",type=Path,default=DEFAULT_STAGE)
 parser.add_argument("--check",action="store_true")
 args=parser.parse_args()
 stage=args.stage.resolve(); run=stage/"run-a-wholemesh-preserve-boundaries"; candidate=run/"candidate-under-8000.glb"; source=ASSETS/"conversions/jump-force-dai-l4d2-material-rebuild-v3/candidate-material-rebuilt-89833.glb"; build=HERE/"build_candidate.py"
 if not all(p.is_file() for p in (candidate,source,build)):
  raise FileNotFoundError('candidate/source/build script missing')
 structural=run_json([sys.executable,str(build),'--check'],ABX)
 khronos=run_json(['node',str(KHR),str(candidate),str(REPO)],ABX)
 source_khronos=run_json(['node',str(KHR),str(source),str(REPO)],ABX)
 budget=run_json(['node','--import','tsx',str(REPO/'tools/model-budget/guard.ts'),str(candidate),'--role','champion','--json','--warn-only'],REPO)
 review=json.loads((run/'visual-review-v1/run.json').read_text())
 proof=json.loads((run/'visual-review-v1/proof.json').read_text())
 comparison_path=run/'visual-comparison-v1/comparison.json'
 comparison=json.loads(comparison_path.read_text())
 if structural['candidate']['sha256'] != sha(candidate): raise ValueError('structural candidate hash drift')
 if khronos['errors']!=0 or khronos['truncated']: raise ValueError('Khronos errors')
 if source_khronos['errors']!=0 or source_khronos['truncated']: raise ValueError('source Khronos errors')
 if khronos['issueCodeCounts'] != source_khronos['issueCodeCounts']:
  raise ValueError('candidate introduced a different Khronos issue class')
 if review.get('sourceSha256') != sha(candidate) or review.get('complete') is not True or review.get('proofExists') is not True or review.get('errorExists') is not False or review.get('images') != 3:
  raise ValueError('WebGL review incomplete or refers to another candidate')
 axes={r['key']:r for r in budget['results'][0]['axes']}
 visual_limit=budget['results'][0]['adoption']['visualLitPixelDeltaPctMax']
 visual_observed=max(r['foregroundDeltaGt20Pct'] for r in comparison['views'])
 # The fixed RGB diagnostic is an explicit conservative proxy, not an attempt
 # to claim the guard has run an unavailable visual gate.  It documents why
 # this candidate must wait for a stronger decimation approach/owner review.
 accepted=(axes['triangles']['verdict']=='ok' and axes['maxTextureEdge']['verdict']=='ok' and axes['drawCalls']['verdict']=='ok' and visual_observed<=visual_limit)
 payload={
  'schema':'ggd.jump-force-dai-l4d2-wholemesh-topology-validation@2',
  'candidate':pin(candidate),'source':pin(source),
  'structural':structural,
  'khronos':{'candidate':khronos,'source':source_khronos,'sameIssueCodeCounts':True},
  'ggdBudget':budget,
  'webglReview':{'run':pin(run/'visual-review-v1/run.json'),'proof':pin(run/'visual-review-v1/proof.json'),'proofSummary':proof,'images':[pin(run/'visual-review-v1'/f'{v}.png') for v in ('front','back','isometric')]},
  'visualComparison':{**pin(comparison_path),'metricScope':comparison['metricScope'],'maxForegroundDeltaGt20Pct':visual_observed,'policyVisualLitPixelDeltaPctMax':visual_limit,'passedDiagnosticThreshold':visual_observed<=visual_limit},
  'gates':{'trianglesUnder8000':axes['triangles']['verdict']=='ok','textureAtMost256':axes['maxTextureEdge']['verdict']=='ok','khronosErrorsZero':True,'webglThreeViewsComplete':True,'drawCallsAtMost6':axes['drawCalls']['verdict']=='ok','visualDiagnosticAtMostPolicyThreshold':visual_observed<=visual_limit},
  'shapeKeyStatus':'basis-bind-pose-only; 29 source expression keys intentionally removed before topology change and not advertised as preserved',
  'acceptedForRuntime':accepted,'backendRegistered':False,'runtimeSelectable':False,'productionDeployed':False,
  'status':('rejected-technical-budget-and-visual-diagnostic; preserve-as-alternative-conversion-candidate' if not accepted else 'all-technical-gates-passed-pending-owner-visual-review'),
  'blockingReasons':([] if accepted else [
   f"drawCalls={axes['drawCalls']['value']} exceeds GGD guard limit={axes['drawCalls']['limit']} while keeping 22 source materials/texture slots.",
   f"fixed WebGL RGB diagnostic max={visual_observed}% exceeds policy visual threshold={visual_limit}% (diagnostic is not owner acceptance).",
   'source facial expression shape keys cannot coexist with topology-changing decimation; candidate retains only bind-pose Basis.',
  ]),
 }
 out=run/'validation.json'; content=json.dumps(payload,ensure_ascii=False,indent=2)+'\n'
 if args.check:
  if not out.is_file() or out.read_text(encoding='utf-8') != content: raise ValueError('stale whole-mesh validation: '+str(out))
 else: out.write_text(content,encoding='utf-8')
 print(json.dumps({'sha256':payload['candidate']['sha256'],'triangles':budget['results'][0]['metrics']['triangles'],'drawCalls':axes['drawCalls']['value'],'maxTextureEdge':axes['maxTextureEdge']['value'],'khronosErrors':khronos['errors'],'webglImages':review['images'],'acceptedForRuntime':accepted,'status':payload['status']},ensure_ascii=False))
if __name__=='__main__':main()

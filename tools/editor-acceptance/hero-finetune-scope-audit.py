"""CPU-only audit of the frozen scope; no admission, labeling, training or engine edits."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time


def audit(h):
    pins = {}
    def read(name):
        data = (h / name).read_bytes()
        pins[name] = hashlib.sha256(data).hexdigest()
        return json.loads(data)
    ledger_command = ['node', 'source-admission-ledger.mjs', 'check-training', 'source-admission-ledger-v1']
    checked = subprocess.run(ledger_command, cwd=h, text=True, capture_output=True, timeout=60)
    assert checked.returncode in (0, 2), f'LEDGER_CHECK_FAILED:{checked.returncode}:{checked.stderr}'
    ledger_result = json.loads(checked.stdout)
    queue = read('intake-v1/review-queue.private.json')
    reviews = read('community37-source-review-v1/requirements.private.json')
    seven = read('source-review-v1/requirements.private.json')
    intents = read('whole-intent-review-v1/whole-heroes.private.json')
    per_hero = {r['id']: {'trainingAdmitted': False, 'completeSourceGold': False,
                         'exposureRecord': r['exposure']} for r in queue}
    for r in reviews:
        per_hero[r['id']]['trainingAdmitted'] |= r['status']['trainingAdmitted']
        per_hero[r['id']]['completeSourceGold'] |= r['status']['completeConstraintGoldCertified']
    for r in seven:
        per_hero[r['id']]['trainingAdmitted'] |= r['trainingAdmitted']
        per_hero[r['id']]['completeSourceGold'] |= r['completeConstraintCoverageCertified']
    assert len(queue) == len(per_hero) == ledger_result['counts']['heroes']
    assert not any(r['trainingAdmitted'] for r in intents), 'INTENT_ADMISSION_CHANGED'
    previous = read('lora-facts-pilot-v1/manifest.json')
    rows = read('semantic-facts-base-v2/dataset.private.json')
    tokens = read('lora-facts-pilot-v1/tokens.private.json')
    evaluation = read('lora-facts-pilot-v1/evaluation.private.json')
    spec = importlib.util.spec_from_file_location('frozen_scope', h / 'run-frozen-facts-finetune.py')
    frozen = importlib.util.module_from_spec(spec); spec.loader.exec_module(frozen)
    train, dev = frozen.validate_frozen(rows, tokens, evaluation, previous)
    ir = read('ir5-data-stage-v1/dataset.private.json')
    excluded = read('frozen-facts-low-update-v1-pilot/data-selection.json')['excludedCompleteIR']
    actual = []
    for row in ir:
        value = json.loads(row['target']['text'])
        slots = [s for s, item in value['slots'].items()
                 if any(a['op'] == 'area_pulses' and a.get('anchor') == 'point' for a in item['actions'])]
        if slots: actual.append({'id': row['id'], 'slots': slots})
    assert actual == [{'id': x['id'], 'slots': x['slots']} for x in excluded], 'EXCLUSION_RECORD_DRIFT'
    assert len({x['id'] for x in ir}) == len(ir) and len({x['id'] for x in excluded}) == len(excluded)
    lee = read('leesin-plan-audit-v2/manifest.json')
    points = read('selected-point-fields-audit-v2/manifest.json')
    comparisons = {}
    for name in ['lora-facts-pilot-v1-assessment', 'frozen-facts-72-v2-assessment', 'frozen-facts-low-update-v1-assessment']:
        item = read(name + '/manifest.json')
        comparisons[name] = {'factDevelopment': item['paired']['facts']['after']['dev'],
            'wholeHeroDevelopment': item['paired']['whole_hero']['after'],
            'completeHeroCoverage': item['completeHeroCoverage'], 'releaseQualified': item['releaseQualified']}
    decoder = read('structured-decoding-v2/assessment/manifest.json')
    for name in ['PLAN.md', 'FINETUNE_ONLY_SCOPE.md', 'source-admission-ledger.mjs', 'run-frozen-facts-finetune.py']:
        pins[name] = hashlib.sha256((h / name).read_bytes()).hexdigest()
    recorded_full = sum(x['trainingAdmitted'] for x in per_hero.values())
    eligible_ir = len(ir) - len(excluded)
    holdout = ledger_result['counts']['freshIndependentHoldoutHeroes']
    return {'schema': 'ggd-fixed-scope-completion-audit@1', 'createdAt': time.time(),
        'sourcePins': pins, 'scriptSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'ledgerCommand': {'argv': ledger_command, 'exitCode': checked.returncode,
            'stdout': ledger_result, 'stderr': checked.stderr},
        'frozenClassification': {'trainHeroes': len(train), 'devHeroes': len(dev),
            'trainClaims': sum(len(x['target']['claims']) for x in train),
            'devClaims': sum(len(x['target']['claims']) for x in dev),
            'hashesSourceAnchorsAndHeroFamilySplitVerified': True, 'wholeHeroRecipeSupervision': False},
        'wholeHeroData': {'recordedHeroes': len(per_hero), 'slots': sum(len(x['slots']) for x in queue),
            'recordedFormalAdmissions': recorded_full,
            'recordedCompleteSourceGold': sum(x['completeSourceGold'] for x in per_hero.values()),
            'existingIRRows': len(ir), 'excludedCompleteIRRows': len(excluded), 'eligibleFrozenIRRows': eligible_ir,
            'freshIndependentHoldoutHeroes': holdout, 'exposureLabels': dict(Counter(x['exposureRecord'] for x in per_hero.values())),
            'exposureLabelAuditIsNotAReconstructionOfAllHistoricalModelCalls': True,
            'leeSinCandidate': {'positive': lee['positive'], 'mutationsDetected': lee['mutations']['detected'],
                'admission': lee['admission'], 'explicitlySuspendedByCurrentScope': True}},
        'comparisons': comparisons, 'constrainedDecoder': decoder['pairs'],
        'pointProbeEvidence': {'source': 'selected-point-fields-audit-v2/manifest.json',
            'keysPresent': sorted(points)},
        'completion': {'achieved': False, 'qualifiedProductionModelExistsInTheseReceipts': False,
            'independent95PercentClaimSupported': False, 'classificationExperimentsRemainTechnicallyRunnable': True,
            'newWholeHeroTrainingBlockedWithinFrozenScope': recorded_full == 0 and eligible_ir == 0,
            'finalIndependentEvaluationBlockedWithinFrozenScope': holdout == 0,
            'requiresScopeDecisionOrExternalCertifiedInputs': recorded_full == 0 and eligible_ir == 0 and holdout == 0},
        'thisAuditStartedGPU': False, 'trainingPerformed': False, 'sourcesOrLabelsModified': False,
        'networkUsedByAuditScript': False, 'modelPromoted': False,
        'limitations': ['Not a fresh semantic review of 44 heroes.',
            'No admitted data is not a proof that every possible recipe is impossible.',
            'More classification updates cannot themselves establish independent whole-hero validation.',
            'This audit does not change the goal, admission ledger, scores, or dataset.']}


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--research-root', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    args = p.parse_args(); target = args.output.resolve()
    assert not target.exists(), 'REFUSE_OVERWRITE'
    result = audit(args.research_root.resolve())
    with target.open('x') as f: json.dump(result, f, ensure_ascii=False, indent=2); f.write('\n')
    print(json.dumps({'completion': result['completion'], 'output': str(target)}, ensure_ascii=False))

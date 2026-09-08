"""Single bounded offline experiment entry. No relabeling, retry or promotion.
Usage: python run-ir5-workflow.py NEW_DIRECTORY --allow-engineering-controls
The explicit flag permits ONLY the declared synthetic engineering pilot.
"""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('gpu_common', HERE / 'gpu-smoke.py')
gpu = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gpu)
ISO = HERE / 'isolated-engine-v1/outputs/hero-forge-12b-restart-20260908'
ENGINE = HERE / 'isolated-engine-v1/GGD-community-hero-forge'
BASE = HERE / 'ir5-base-v1'
PILOT = HERE / 'ir5-lora-v1'


def mirror(source, destination):
    if source.is_dir():
        destination.mkdir(exist_ok=True)
        for child in source.iterdir():
            assert not child.is_symlink(), 'NO_EXTERNAL_SYMLINK_COPY'
            mirror(child, destination / child.name)
    else:
        if destination.exists():
            assert gpu.digest(source) == gpu.digest(destination), f'MIRROR_DRIFT:{source.name}'
        else:
            shutil.copyfile(source, destination)


def command(out, state, name, args, cwd, seconds):
    remaining = state['deadline'] - 300 - time.time()
    assert remaining > 0, 'REPORT_RESERVE_REACHED'
    start = time.time()
    item = {'name': name, 'command': args, 'startedAt': start, 'status': 'running'}
    state['stages'].append(item)
    gpu.atomic(out / 'state.json', state)
    child = None
    try:
        with (out / (name + '.log')).open('x') as log:
            child = subprocess.Popen(args, cwd=cwd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            while child.poll() is None:
                if (out / 'STOP').exists():
                    raise InterruptedError('USER_STOP')
                if time.time() - start > min(seconds, remaining):
                    raise TimeoutError('STAGE_OR_TOTAL_TIME_LIMIT')
                time.sleep(1)
            item['exitCode'] = child.returncode
            assert child.returncode == 0, f'STAGE_FAILED:{name}:{child.returncode}'
            item['status'] = 'completed'
    except BaseException as exc:
        item.update(status='failed', error=repr(exc))
        raise
    finally:
        if child and child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=12)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait(timeout=5)
        item['seconds'] = time.time() - start
        item['logSha256'] = gpu.digest(out / (name + '.log'))
        gpu.atomic(out / 'state.json', state)


def report(out, state):
    read_if = lambda p: gpu.read(p) if p.exists() else None
    base = read_if(HERE / 'ir5-base-v1-assessment/manifest.json')
    after = read_if(HERE / 'ir5-lora-v1-assessment/manifest.json')
    training = read_if(PILOT / 'result.json')
    result = {'schema': 'ggd-ir5-automated-workflow-result@1', 'status': state['status'], 'error': state.get('error'),
        'workflowSeconds': time.time() - state['startedAt'], 'base': base, 'after': after, 'training': training,
        'qualifiedProductionHeroes': 0, 'modelPromoted': False, 'cloudSpendUSD': 0,
        'dataLimitations': gpu.read(out / 'data-issues.json'), 'stages': state['stages']}
    if base and after:
        assert base['requestSha256'] == after['requestSha256'], 'PAIR_REQUEST_MISMATCH'
        assert base['checkerPins'] == after['checkerPins'], 'PAIR_CHECKER_MISMATCH'
        a = gpu.read(HERE / 'ir5-base-v1-assessment/cases.json')
        b = gpu.read(HERE / 'ir5-lora-v1-assessment/cases.json')
        assert [r['id'] for r in a] == [r['id'] for r in b]
        result['pairs'] = [{'id': x['id'], 'baseEngineeringPass': x['allPredeclaredEngineeringChecksPassed'],
            'loraEngineeringPass': y['allPredeclaredEngineeringChecksPassed'],
            'baseFacetScore': x.get('sourceFacets', {}).get('passed', 0), 'loraFacetScore': y.get('sourceFacets', {}).get('passed', 0),
            'baseErrors': {k: v for k, v in x.items() if 'Error' in k}, 'loraErrors': {k: v for k, v in y.items() if 'Error' in k}}
            for x, y in zip(a, b)]
    if training:
        cp = training['checkpoint']
        adapter = PILOT / cp['path'] / 'adapters.safetensors'
        assert gpu.digest(adapter) == cp['sha256']
        model_dir = out / 'research-adapter'
        model_dir.mkdir()
        for f in ['adapters.safetensors', 'adapter_config.json']:
            shutil.copyfile(adapter.parent / f, model_dir / f)
        assert gpu.digest(model_dir / 'adapters.safetensors') == cp['sha256']
        p = gpu.read(PILOT / 'manifest.json')
        card = {'model': p['model'], 'revision': p['revision'], 'baseQuantization': '8-bit', 'adapterSha256': cp['sha256'],
            'step': cp['step'], 'rank': p['loraParameters']['rank'], 'layers': p['numLayers'],
            'trainingData': '8 synthetic engineering controls, one family', 'qualified': False,
            'loadingExample': "mlx_vlm.load(BASE_DIRECTORY, adapter_path=ADAPTER_DIRECTORY, trust_remote_code=False)",
            'baseModelFiles': gpu.read(HERE / 'gpu-preflight-v1.json')['files']}
        gpu.atomic(model_dir / 'model-card.json', card)
    gpu.atomic(out / 'result.json', result)
    lines = ['# IR5 全自動工程實驗結果', '', '狀態：' + state['status'], '',
        '這是小型工程對照，不是正式英雄生成能力驗收。沒有自動發布、模型啟用或視覺驗證。', '',
        '資料：8 份合成訓練；4 份同家族合成 dev；2 位已曝光真實英雄控制組。名稱有提示、措辭高度重複，不能當獨立泛化證據。', '',
        '固定 16 steps、rank 8、最後 2 層 q/o LoRA、學習率 2e-5；只評固定末步，不以 loss 或 dev 分數挑 checkpoint。', '']
    if base and after:
        lines += ['| 檢查（分母 6） | 基底 | LoRA |', '|---|---:|---:|']
        for key in ['jsonValid', 'irValid', 'compiled', 'engineeringPassed', 'fullHeroQualified']:
            lines += [f"| {key} | {base['counts'][key]} | {after['counts'][key]} |"]
        lines += ['', 'engineeringPassed 只代表預先定義的工程檢查，不包含完整英雄設定文字判讀或獨立留出驗收。', '',
            '## 逐例對照', '', '| 案例 | 基底工程通過 | LoRA 工程通過 | 已知來源欄位前後 |', '|---|---|---|---|']
        for p in result['pairs']:
            lines += [f"| {p['id']} | {p['baseEngineeringPass']} | {p['loraEngineeringPass']} | {p['baseFacetScore']} → {p['loraFacetScore']} |"]
        delta = after['counts']['engineeringPassed'] - base['counts']['engineeringPassed']
        lines += ['', '## 結論', '', f'完整工程通過數變化：{delta:+d}/6。無論改善或退步，本批都不具備正式採用證據，模型維持研究用途。']
    else:
        lines += ['尚未得到完整配對；不得由缺少結果推定成功。', '', '失敗原因：' + str(state.get('error'))]
    if training:
        lines += ['', '## 訓練收據', '', f"訓練步驟耗時：{training['trainingStepSeconds']:.2f} 秒；峰值 Metal：{training['peakTrainingMetalBytes']/gpu.GIB:.2f} GiB。",
            f"訓練集遮罩 loss：{training['baselineMeanLoss']:.6f} → {training['afterMeanLoss']:.6f}；loss 不作採用指標。",
            '', 'Adapter 已保存於 research-adapter；基底權重不在該目錄，須使用 model-card.json 指定的版本。']
    lines += ['', '## 重跑與證據', '', '完整命令、退出碼、耗時及 log hash 在 state.json；原始答案保留在 ir5-base-v1 和 ir5-lora-v1。',
        '執行入口：`python run-ir5-workflow.py NEW_DIRECTORY --allow-engineering-controls`。同名 worker run 不覆寫、不重試；既有完成 stage 只在完整性驗證後重用。',
        '', '資料／標籤異常停止訓練並寫 data-issues.json；技術或資源故障也停損並寫報告，不自動改資料、提示或評分。', '']
    with (out / 'REPORT.md').open('x') as f:
        f.write('\n'.join(lines))


def main(out, allow):
    assert out.parent == HERE and not out.exists(), 'NEW_WORKFLOW_DIRECTORY_REQUIRED'
    out.mkdir()
    state = {'status': 'running', 'startedAt': time.time(), 'deadline': time.time() + 2700, 'stages': [],
        'workerSha256': gpu.digest(Path(__file__)), 'automaticRetries': 0, 'reportReserveSeconds': 300}
    issues = {'schema': 'ggd-engineering-data-issues@1', 'productionTrainingAdmitted': False,
        'acknowledgedEngineeringOnly': allow, 'issues': ['one synthetic family with repeated wording',
            'synthetic hero names reveal global cast timing', 'two real controls are historically exposed',
            'no independent source/mechanism-family holdout'], 'unexpectedDatasetErrors': []}
    gpu.atomic(out / 'data-issues.json', issues)
    def interrupted(signum, frame):
        raise InterruptedError('WORKFLOW_INTERRUPTED')
    signal.signal(signal.SIGINT, interrupted)
    signal.signal(signal.SIGTERM, interrupted)
    try:
        assert allow, 'DATA_QUALITY_REVIEW_REQUIRED'
        d = gpu.read(HERE / 'ir5-data-stage-v1/manifest.json')
        assert gpu.json_hash(gpu.read(HERE / 'ir5-data-stage-v1/dataset.private.json')) == d['datasetSha256'], 'DATASET_DRIFT'
        for name, expected in d['checkerPins'].items():
            assert gpu.digest(HERE / name) == expected, 'DATA_CHECKER_DRIFT'
        for name in ['ir5-stage-verification-v1', 'ir5-mask-tokens-v1', 'ir5-evaluation.mts', 'ir5-evaluation.test.mts', 'prepare-ir5-base.mts', 'assess-ir5.mts']:
            mirror(HERE / name, ISO / name)
        node = shutil.which('node')
        assert node, 'NODE_MISSING'
        command(out, state, 'evaluation-tests', [node, '--import', 'tsx', '--test', str(ISO / 'ir5-evaluation.test.mts')], ENGINE, 60)
        if not BASE.exists():
            command(out, state, 'prepare-base', [node, '--import', 'tsx', str(ISO / 'prepare-ir5-base.mts'), str(ISO / BASE.name)], ENGINE, 60)
            mirror(ISO / BASE.name, BASE)
        command(out, state, 'base-doctor', [sys.executable, str(HERE / 'gpu-smoke.py'), str(BASE), '--doctor'], HERE, 60)
        if not (BASE / 'state.json').exists():
            command(out, state, 'base-inference', [sys.executable, str(HERE / 'gpu-smoke.py'), str(BASE)], HERE, 1320)
        assert gpu.read(BASE / 'state.json')['status'] == 'completed-inference-only', 'FAILED_BASE_NOT_RESTARTED'
        mirror(BASE, ISO / BASE.name)
        assessment = HERE / 'ir5-base-v1-assessment'
        if not assessment.exists():
            command(out, state, 'base-assessment', [node, '--import', 'tsx', str(ISO / 'assess-ir5.mts'), str(ISO / BASE.name), str(ISO / assessment.name)], ENGINE, 150)
            mirror(ISO / assessment.name, assessment)
        if not PILOT.exists():
            command(out, state, 'prepare-lora', [sys.executable, str(HERE / 'ir5-lora-pilot.py'), str(PILOT), '--prepare'], HERE, 60)
        if not (PILOT / 'state.json').exists():
            command(out, state, 'lora-and-paired-inference', [sys.executable, str(HERE / 'ir5-lora-pilot.py'), str(PILOT)], HERE, 1800)
        assert gpu.read(PILOT / 'state.json')['status'] == 'completed-pilot-not-promoted', 'FAILED_PILOT_NOT_RESTARTED'
        mirror(PILOT, ISO / PILOT.name)
        after = HERE / 'ir5-lora-v1-assessment'
        if not after.exists():
            command(out, state, 'lora-assessment', [node, '--import', 'tsx', str(ISO / 'assess-ir5.mts'), str(ISO / BASE.name), str(ISO / after.name), str(ISO / PILOT.name)], ENGINE, 150)
            mirror(ISO / after.name, after)
        # Verify original weights after every GPU stage, independent of adapter roundtrip.
        files = []
        for f in gpu.read(HERE / 'gpu-preflight-v1.json')['files']:
            actual = gpu.digest(Path(gpu.read(BASE / 'manifest.json')['modelDirectory']) / f['name'])
            assert actual == f['sha256'], 'BASE_WEIGHT_MUTATION'
            files.append({'name': f['name'], 'sha256': actual, 'unchanged': True})
        gpu.atomic(out / 'base-weights-verified.json', files)
        state['status'] = 'completed-experiment-not-promoted'
    except BaseException as exc:
        state.update(status='stopped-report-written', error=repr(exc))
        if 'DATA' in str(exc):
            issues['unexpectedDatasetErrors'].append(repr(exc))
            gpu.atomic(out / 'data-issues.json', issues)
    finally:
        state['finishedAt'] = time.time()
        gpu.atomic(out / 'state.json', state)
        report(out, state)
    print(json.dumps({'status': state['status'], 'error': state.get('error'), 'report': str(out / 'REPORT.md')}), flush=True)
    if state['status'] != 'completed-experiment-not-promoted':
        raise SystemExit(1)


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('output', type=Path)
    p.add_argument('--allow-engineering-controls', action='store_true')
    args = p.parse_args()
    main(args.output.resolve(), args.allow_engineering_controls)

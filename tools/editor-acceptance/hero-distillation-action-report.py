"""Render a local, evidence-bound report for a bounded-action LoRA run.

This is deliberately narrower than the final blind three-arm report: it
summarises the fixed internal-dev Base/LoRA action workflow without inventing
teacher, semantic, match, or unseen-generalisation scores.
"""
import argparse
from html import escape
import json
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text())


def required(path):
    path = Path(path)
    assert path.is_file(), 'MISSING_RECEIPT:' + str(path)
    return read(path)


def arm(evaluation, name):
    result = required(evaluation / name / 'result.json')
    metrics = required(evaluation / name / 'action-metrics.json')
    assert result['attemptedHeroes'] > 0 and 0 <= result['completeHeroes'] <= result['attemptedHeroes'], 'INVALID_HERO_COUNTS:' + name
    assert metrics['completeHeroes'] == result['completeHeroes'], 'ACTION_HERO_COUNT_DRIFT:' + name
    assert metrics['failedHeroes'] + metrics['completeHeroes'] == result['attemptedHeroes'], 'ACTION_FAILURE_COUNT_DRIFT:' + name
    return {'result': result, 'metrics': metrics}


def collect(training, evaluation, e2e):
    training, evaluation, e2e = map(Path, [training, evaluation, e2e])
    train_manifest = required(training / 'manifest.json')
    train_state = required(training / 'train' / 'state.json')
    train_result = required(training / 'train' / 'result.json')
    evaluation_manifest = required(evaluation / 'manifest.json')
    e2e_result = required(e2e / 'result.json')
    assert train_manifest['schema'] == 'ggd-full-hero-lora-run@1', 'TRAINING_SCHEMA'
    assert train_state['status'] == 'completed' and train_state['workerPid'] is None, 'TRAINING_NOT_COMPLETE'
    assert train_result['steps'] == train_manifest['steps'], 'TRAINING_STEP_DRIFT'
    assert evaluation_manifest['schema'] == 'ggd-action-protected-evaluation@1', 'EVALUATION_SCHEMA'
    assert e2e_result['schema'] == 'ggd-action-e2e-result@1', 'E2E_SCHEMA'
    arms = {name: arm(evaluation, name) for name in ['base', 'lora']}
    denominator = evaluation_manifest['heroes']
    assert all(value['result']['attemptedHeroes'] == denominator for value in arms.values()), 'EVALUATION_DENOMINATOR_DRIFT'
    if e2e_result.get('skipped'):
        assert e2e_result['skipReason'] == 'INCOMPLETE_HERO_PLANS', 'UNKNOWN_E2E_SKIP'
        assert e2e_result['fullHeroE2EProven'] is False, 'SKIPPED_E2E_CLAIM'
    return {'training': {'steps': train_result['steps'], 'seconds': train_result['trainingSeconds'],
                         'peakMetalBytes': train_result['peakMetalBytes'],
                         'beforeCE': train_result['beforeMeanDevCE'], 'afterCE': train_result['afterMeanDevCE']},
            'evaluation': {'heroes': denominator, 'kind': evaluation_manifest['kind'], 'arms': arms},
            'e2e': e2e_result}


def render(data):
    esc = lambda value: escape(str(value), quote=True)
    gib = data['training']['peakMetalBytes'] / 1024 ** 3
    ce_delta = data['training']['afterCE'] - data['training']['beforeCE']
    arm_rows, stage_rows = [], []
    for name, label in [('base', '未微調基底'), ('lora', '本次 LoRA')]:
        value = data['evaluation']['arms'][name]
        result, metrics = value['result'], value['metrics']
        arm_rows.append(f'<tr><th>{label}</th><td>{result["completeHeroes"]} / {result["attemptedHeroes"]}</td>'
                        f'<td>{metrics["calls"]}</td><td>{metrics["failedHeroes"]}</td><td>{esc(metrics["terminalHeroFailures"])}</td></tr>')
        for stage, row in sorted(metrics['byStage'].items()):
            stage_rows.append(f'<tr><th>{label} / {esc(stage)}</th><td>{row["calls"]}</td><td>{row["streamComplete"]}</td>'
                              f'<td>{row["jsonAccepted"]}</td><td>{row["transportAndJsonAccepted"]}</td></tr>')
    e2e = data['e2e']
    e2e_text = ('未執行編譯／封裝／匯入：任一 arm 未組成完整固定分母 HeroPlan。'
                if e2e.get('skipped') else '所有既定 CPU 證據步驟已執行；仍不代表語意、選角或對局已證明。')
    return f'''<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hero Forge action LoRA receipt</title><style>
body{{font:16px/1.55 system-ui,sans-serif;max-width:980px;margin:auto;padding:28px;color:#17222d;background:#fafbfc}}section{{border-top:1px solid #ccd6df;padding:20px 0}}table{{border-collapse:collapse;width:100%}}th,td{{border-bottom:1px solid #d7e0e8;padding:9px;text-align:left;vertical-align:top}}small,.note{{color:#526171}}.notice{{border-left:4px solid #176c80;padding-left:14px}}code{{overflow-wrap:anywhere}}</style>
<h1>Gemma 4 12B bounded-action LoRA</h1><p class="notice">內部 dev 已見回歸收據。此頁不宣告未見泛化、語意正確、危險接受為零或可上場。</p>
<section><h2>訓練</h2><p>{data['training']['steps']} optimizer steps；{data['training']['seconds']:.1f} 秒；Metal 峰值 {gib:.2f} GiB。</p>
<p>教師強制 dev CE：{data['training']['beforeCE']:.4f} → {data['training']['afterCE']:.4f}（差異 {ce_delta:+.4f}）。<small>CE 不是生成或英雄品質分數。</small></p></section>
<section><h2>完整英雄組裝</h2><table><tr><th>arm</th><th>完整 HeroPlan</th><th>模型 calls</th><th>失敗英雄</th><th>終端失敗分類</th></tr>{''.join(arm_rows)}</table></section>
<section><h2>動作傳輸與 JSON</h2><table><tr><th>arm / stage</th><th>calls</th><th>stream 完成</th><th>JSON 接受</th><th>兩者皆通過</th></tr>{''.join(stage_rows)}</table><p class="note">有效 JSON 與動作格式不是正確機制或可上場英雄。</p></section>
<section><h2>E2E</h2><p>{esc(e2e_text)}</p><p class="note">fullHeroE2EProven：{esc(e2e.get('fullHeroE2EProven'))}；semantic/gameplay 證據仍必須由獨立驗收提供。</p></section>
</html>'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['training', 'evaluation', 'e2e', 'out']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    assert not args.out.exists(), 'REFUSE_OVERWRITE'
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(render(collect(args.training, args.evaluation, args.e2e)))
    print(args.out.resolve())

"""Offline HTML view of verified report data. No remote assets or inferred scores."""
import argparse
from html import escape
import json
import math
from pathlib import Path


def render(data):
    assert data['schema'] == 'ggd-distillation-results@1'
    assert data['fullHeroE2EProven'] is False and data['modelPromoted'] is False
    e = lambda x: escape(str(x), quote=True)
    number = lambda x: '未測' if x is None else f'{x:.3f}'
    t, count = data['training'], data['counts']['primaryWholeHeroes']
    assert 0 <= t['completedSteps'] <= t['plannedSteps'] and t['plannedSteps'] > 0
    primary = data['arms']['teacher']['rows']
    assert len(primary) == count
    for arm in data['arms'].values():
        assert [r['id'] for r in arm['rows']] == [r['id'] for r in primary]
        assert arm['fullHeroSuccess'] is None and arm['unsafeAccepts'] is None, 'UNVERIFIED_QUALITY_CANNOT_BE_SCORED'

    bars, quality = [], []
    for key, name in [('teacher', '歷史 Codex 教師'), ('base', '未微調基底'), ('lora', '本次 LoRA')]:
        arm = data['arms'][key]
        value = arm['structuralPassed']
        assert value is None or 0 <= value <= count
        meter = '<span class="pending">未執行／未有完整收據</span>' if value is None else (
            f'<progress max="{count}" value="{value}" aria-label="{e(name)} 結構通過"></progress><span>{value} / {count}</span>')
        bars.append(f'<div class="bar"><span>{e(name)}</span><div>{meter}</div></div>')
        packaged = '未測' if arm['packageAdmissionPassed'] is None else f'{arm["packageAdmissionPassed"]} / {count}'
        imported = '未測' if arm.get('runtimeVerifiedImports') is None else f'{arm["runtimeVerifiedImports"]} / {count}'
        quality.append(f'<tr><th scope="row">{e(name)}</th><td>{packaged}</td><td>{imported}</td><td>未驗證</td><td>未驗證</td><td>未測，不能當 0</td></tr>')
    rows = []
    for index, row in enumerate(primary):
        cells = []
        for arm in ['teacher', 'base', 'lora']:
            own = data['arms'][arm]['rows'][index]
            structural = own['structural']
            status = '未測' if structural is None else '結構通過' if structural['structuralPassed'] else '結構失敗'
            package = own['package']
            packaged = '封裝未測' if package is None else '封裝准入通過' if package['passed'] else '封裝待處理／失敗'
            imported = own.get('isolatedImport')
            import_text = '隔離匯入未測' if imported is None else '隔離匯入／runtime 一致' if imported['runtimeMatchesAdmission'] is True else '隔離匯入／runtime 未通過或未完成'
            detail = '; '.join(str(x) for x in [structural.get('error') if structural else None,
                package.get('error') if package else None, imported.get('error') if imported else None] if x)
            cells.append(f'<td>{status}<br><small>{packaged}<br>{import_text}</small>' + (f'<details><summary>原因</summary>{e(detail)}</details>' if detail else '') + '</td>')
        rows.append(f'<tr><th scope="row">{e(row["name"])}<small>{e(row["id"])}</small></th>{"".join(cells)}<td>未驗證</td></tr>')
    ce_rows = []
    for key, name in [('devBefore', '訓練前'), ('devAfter', '訓練後')]:
        value = t[key]
        ce_rows.append(f'<tr><th scope="row">{name}</th><td>{value["cases"] if value else "待完成"}</td><td>{number(value["macroCE"] if value else None)}</td><td>{number(value["tokenWeightedCE"] if value else None)}</td></tr>')
    sources = ''.join(f'<li><code>{e(file)}</code><small>SHA-256 {e(meta["sha256"])}</small></li>' for file, meta in data['sourceFiles'].items())
    peak = t['recordedStepPeakMetalBytes']
    peak_text = '未測' if peak is None else f'{peak / 1024**3:.2f} GiB'
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hero74・Gemma 4 12B 配對結果</title><style>
:root{{color-scheme:light dark;--bg:light-dark(#fafbfc,#14171b);--ink:light-dark(#17222d,#e3eaf0);--muted:light-dark(#526171,#a9b8c6);--line:light-dark(#d3dde6,#41505c);--accent:light-dark(#176c80,#71cde0)}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.65 system-ui,sans-serif}}main{{max-width:1000px;margin:auto;padding:32px 24px}}h1{{font-size:clamp(24px,4vw,34px);margin:0}}h2{{font-size:21px;margin:0 0 12px}}section{{padding:24px 0;border-bottom:1px solid var(--line)}}p{{margin:8px 0}}small,.muted,.pending{{color:var(--muted)}}small{{display:block;font-size:13px;overflow-wrap:anywhere}}.notice{{border-left:4px solid var(--accent);padding-left:16px}}.bar{{display:grid;grid-template-columns:160px 1fr;gap:16px;margin:12px 0}}.bar>div{{display:flex;align-items:center;gap:12px}}progress{{accent-color:var(--accent);height:18px;width:min(100%,480px);min-width:0}}.table-wrap{{overflow-x:auto}}table{{width:100%;border-collapse:collapse;text-align:left;font-size:14px}}th,td{{padding:12px 10px;border-bottom:1px solid var(--line);vertical-align:top}}th{{font-weight:600}}.table-wrap th:first-child{{min-width:150px}}code{{font-size:12px;overflow-wrap:anywhere}}li{{margin:12px 0}}summary{{cursor:pointer}}.stats{{display:flex;flex-wrap:wrap;gap:14px 32px}}.stats p{{margin:0}}@media(max-width:500px){{main{{padding:20px 14px}}.bar{{grid-template-columns:1fr;gap:0}}th,td{{padding:10px 8px}}}}
</style></head><body><main>
<header><p class="muted">Hero74 / Internal dev / Mac-only</p><h1>Gemma 4 12B：微調與完整英雄生成</h1>
<p class="notice">目前不宣告模型達標。結構通過、封裝准入與 CE 改善，都不等於技能機制正確或可上場。</p>
<small>快照時間 {e(data['capturedAt'])}。這是檔案快照，不是即時行程狀態；不會自動刷新。</small></header>
<section><h2>訓練進度</h2><p>已記錄 {t['completedSteps']} / {t['plannedSteps']} 個 optimizer 更新</p>
<progress value="{t['completedSteps']}" max="{t['plannedSteps']}" aria-label="訓練更新進度"></progress>
<div class="stats"><p>紀錄狀態：{e(t['recordedStatus'])}</p><p>已完成步驟平均：{number(t['meanRecordedStepSeconds'])} 秒</p><p>已完成訓練步驟 Metal 峰值：{peak_text}</p></div>
<small>記憶體值不代表全流程峰值或系統 RAM。逐步訓練使用不同題目，不以其 loss 走勢判定前後品質。</small></section>
<section><h2>同 {data['counts']['tasks']} 題的教師答案 CE</h2><div class="table-wrap"><table><thead><tr><th>階段</th><th>題數</th><th>每題平均 CE</th><th>答案 token 加權 CE</th></tr></thead><tbody>{''.join(ce_rows)}</tbody></table></div>
<small>越低代表對既有教師答案的預測損失較低，不是自動生成成功率。前後皆完整完成且題目／答案長度一致才計算差異。</small></section>
<section><h2>完整英雄結構檢查</h2>{''.join(bars)}<small>主分母固定 {count} 名；{data['counts']['secondarySlots']} 個輔助單槽不加入分母。歷史教師是控制組，並非預設 100% 正確。</small></section>
<section><h2>不能省略的驗收</h2><div class="table-wrap"><table><thead><tr><th>比較組</th><th>封裝准入</th><th>隔離匯入／runtime 一致</th><th>機制忠實度</th><th>完整上場</th><th>危險錯誤接受</th></tr></thead><tbody>{''.join(quality)}</tbody></table></div>
<small>隔離匯入通過不等於平台選角或實際對局通過。</small>
<small>完整支援英雄目標至少 95%，本 dev 組須 {math.ceil(count * .95)}/{count}；仍需未見新批測試，不能據此保證泛化。</small></section>
<section><h2>逐英雄比較</h2><div class="table-wrap"><table><thead><tr><th>英雄</th><th>教師</th><th>基底</th><th>LoRA</th><th>語意／對局</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div></section>
<section><h2>接下來看什麼</h2><p>固定比較基底與 LoRA 的逐例改善及退步；依題型分開檢查來源還原與功能等價創作。未驗證項不通過，不以特效或格式分數補償機制錯誤。</p>
<details><summary>資料來源與雜湊</summary><ul>{sources}</ul></details></section>
</main></body></html>'''


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assert not args.out.exists(), 'REFUSE_OVERWRITE'
    html = render(json.loads(args.data.read_text()))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open('x') as stream:
        stream.write(html)
    print(str(args.out.resolve()))

#!/usr/bin/env python3
"""Build the owner-facing Vearn identity review page from rendered evidence."""

from __future__ import annotations

import argparse
import html
import json
from pathlib import Path


IDENTITIES = [
    "大魔王巴恩（老年／變身前）",
    "真・大魔王巴恩（年輕真身）",
    "鬼眼王巴恩",
    "密斯特巴恩",
    "巴恩影子／影巴恩",
    "武器或道具",
    "特效或技能元件",
    "其他巴恩相關候選",
    "非巴恩相關／拒絕",
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    root = workspace / "GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1"
    manifest = json.loads((root / "conversion-manifest.json").read_text())
    validation = json.loads((root / "khronos-validation.json").read_text())
    cards = []
    for index, row in enumerate(manifest["candidates"]):
        candidate_root = Path(row["glb"]["absolutePath"]).parent
        review_root = candidate_root / "webgl-review-v2"
        proof = json.loads((review_root / "proof.json").read_text())
        images = [
            (root_name, (review_root / f"{root_name}.png").relative_to(root).as_posix())
            for root_name in ("front", "back", "isometric")
        ]
        option_html = "".join(f'<option value="{html.escape(value)}">{html.escape(value)}</option>' for value in IDENTITIES)
        cards.append(f'''<article class="card" data-id="{html.escape(row['candidateId'])}">
<header><h2>{index + 1}. {html.escape(row['displayName'])}</h2><code>{html.escape(row['candidateId'])}</code></header>
<div class="views">{''.join(f'<figure><img src="{path}" alt="{html.escape(row["displayName"])} {name}"><figcaption>{name}</figcaption></figure>' for name, path in images)}</div>
<dl><dt>三角面</dt><dd>{row['triangleCount']:,}</dd><dt>原始骨驼</dt><dd>{row['boneCountInSource']}</dd><dt>材質</dt><dd>{row['materialCount']}</dd><dt>GLB SHA-256</dt><dd><code>{row['glb']['sha256']}</code></dd></dl>
<label>身分<select class="identity"><option value="">待選</option>{option_html}</select></label>
<label>收錄裁決<select class="decision"><option value="">待審</option><option value="accept">收錄為獨立候選</option><option value="reject">不收錄</option></select></label>
<label>備註<textarea class="notes" placeholder="形態、比例、貼圖或用途判斷"></textarea></label>
<p class="evidence">Babylon WebGL 三視圖已生成；幾何 {proof['meshCount']} mesh；Khronos 零錯誤。這是靜態鑑定候選，未包含原生動作、後台註冊或正式站部署。</p>
</article>''')
    contract = {
        "schema": "ggd.vearn-identity-review-contract@1",
        "sourceId": manifest["sourceId"],
        "sourceManifestSha256": validation["sourceManifestSha256"],
        "candidateIds": [row["candidateId"] for row in manifest["candidates"]],
    }
    page = f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>既有老巴恩 3D 追溯證據</title><style>
:root{{color-scheme:dark;font-family:system-ui,sans-serif;background:#08101c;color:#edf4ff}}body{{max-width:1500px;margin:auto;padding:24px}}h1{{margin-bottom:6px}}.lead{{color:#adc1db;max-width:1000px}}.card{{background:#101b2b;border:1px solid #263852;border-radius:14px;padding:18px;margin:22px 0}}header{{display:flex;align-items:baseline;gap:16px;flex-wrap:wrap}}header h2{{margin:0}}code{{font-size:12px;overflow-wrap:anywhere}}.views{{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}}figure{{margin:0;background:#1d2532;border-radius:10px;overflow:hidden}}img{{width:100%;display:block}}figcaption{{padding:8px;text-align:center;color:#b9c7d9}}dl{{display:grid;grid-template-columns:max-content 1fr;gap:5px 12px}}dt{{color:#94aac6}}dd{{margin:0}}label{{display:block;margin:12px 0}}select,textarea{{display:block;width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border-radius:8px;border:1px solid #3b4f69;background:#0b1422;color:#fff}}textarea{{min-height:70px}}button{{background:#48a9ff;color:#001528;border:0;border-radius:9px;padding:12px 18px;font-weight:700;cursor:pointer}}.evidence{{color:#9db0c8;font-size:14px}}@media(max-width:800px){{.views{{grid-template-columns:1fr}}}}
</style></head><body><h1>既有老巴恩 3D 追溯證據</h1><p class="lead"><strong>owner 已確認：這五件是已看過的年老／變身前巴恩、影版與附件，不是年輕真身或鬼眼王。</strong>本頁只保留轉換和畫面證據，不再需要重複審查。後續只會將新找到的年輕真身／鬼眼王候選送給 owner 鑑定。</p>{''.join(cards)}<button id="export">匯出舊證據 JSON</button><script id="contract" type="application/json">{html.escape(json.dumps(contract, ensure_ascii=False))}</script><script>
const contract=JSON.parse(document.getElementById('contract').textContent);const key='ggd-vearn-review-'+contract.sourceManifestSha256;
const read=()=>[...document.querySelectorAll('.card')].map(card=>({{candidateId:card.dataset.id,identity:card.querySelector('.identity').value||null,decision:card.querySelector('.decision').value||null,notes:card.querySelector('.notes').value.trim()||null}}));
const save=()=>localStorage.setItem(key,JSON.stringify(read()));document.querySelectorAll('select,textarea').forEach(x=>x.addEventListener('input',save));
try{{const prior=JSON.parse(localStorage.getItem(key)||'[]');for(const row of prior){{const card=[...document.querySelectorAll('.card')].find(x=>x.dataset.id===row.candidateId);if(card){{card.querySelector('.identity').value=row.identity||'';card.querySelector('.decision').value=row.decision||'';card.querySelector('.notes').value=row.notes||''}}}}}}catch{{}}
document.getElementById('export').onclick=()=>{{const decisions=read(),out={{schema:'ggd.vearn-identity-review-decisions@1',sourceId:contract.sourceId,sourceManifestSha256:contract.sourceManifestSha256,complete:decisions.every(x=>x.identity&&x.decision),decisions}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\n'],{{type:'application/json'}}));a.download='vearn-identity-review-decisions.json';a.click();URL.revokeObjectURL(a.href)}};
</script></body></html>'''
    (root / "index.html").write_text(page)
    (root / "review-contract.json").write_text(json.dumps(contract, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"page": str(root / "index.html"), "candidateCount": len(cards)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

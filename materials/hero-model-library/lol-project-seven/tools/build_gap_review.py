#!/usr/bin/env python3
"""Build a narrow, hash-verified listening page for unresolved LoL skill clips."""
import argparse
import hashlib
import html
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent

def build():
    audit = json.loads((BASE / "runtime-audit.json").read_text())
    queue = json.loads((BASE / "listening-review-queue.json").read_text())
    by_key = {r["key"]: r for r in queue["records"]}
    records = []
    groups = audit["pendingAmbiguousSkillCandidates"] or audit.get("reviewedAmbiguousSkillCandidates", [])
    decisions_path = BASE / "gap-listening-decisions.json"
    decisions = ({row["key"]: row["decision"] for row in json.loads(decisions_path.read_text())["decisions"]}
                 if decisions_path.is_file() else {})
    for group in groups:
        for key in group["reviewKeys"]:
            row = by_key[key]
            path = Path(row["absolutePath"])
            if path.stat().st_size != row["bytes"] or hashlib.sha256(path.read_bytes()).hexdigest() != row["sha256"]:
                raise ValueError(f"Source changed: {key}")
            records.append(dict(key=key, nativeId=row["nativeId"], proposedTarget=group["target"],
                absolutePath=str(path), sha256=row["sha256"], seconds=row["seconds"],
                eventBindings=row["eventBindings"], runtimeRegistered=group.get("runtimeRegistered", False),
                decision=decisions.get(key, "pending")))
    cards = []
    for i, row in enumerate(records):
        esc = html.escape
        events = " / ".join(e["eventName"] for e in row["eventBindings"])
        options = "".join(
            f'<option value="{value}"{" selected" if row["decision"] == value else ""}>{label}</option>'
            for value, label in (("pending", "待審"), ("approve", "已聽過，同意用於 Q"), ("reject", "拒絕"))
        )
        state = "已註冊" if row["runtimeRegistered"] else "尚未啟用"
        cards.append(f'<article><h2>{i+1}. {esc(row["nativeId"])} — {esc(row["proposedTarget"])}</h2>'
            f'<audio controls preload="metadata" src="/audio?key={esc(row["key"])}"></audio>'
            f'<p>{row["seconds"]:.3f} 秒 · {esc(row["key"])} · {state}</p>'
            f'<details><summary>來源與雜湊</summary><p>{esc(events)}</p><p>{esc(row["absolutePath"])}</p><code>{row["sha256"]}</code></details>'
            f'<label>此段用於 Q：<select data-index="{i}">{options}</select></label></article>')
    data = json.dumps(records, ensure_ascii=False).replace("<", "\\u003c")
    page = """<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>LoL 缺格語音聽審</title>
<style>body{font:16px system-ui;max-width:960px;margin:24px auto;padding:16px;background:#101724;color:#edf3ff}article{padding:18px;border:1px solid #64748b;border-radius:10px;margin:18px 0}audio{width:100%}p,code{overflow-wrap:anywhere}select,button{padding:12px;font:inherit}h2{font-size:19px}</style>
<h1>LoL 缺格語音聽審</h1><p>這些片段同時被原作 Q 與普攻事件引用，必須逐段播放裁決。頁面會顯示目前已匯入的決定與註冊狀態；重新匯出仍需由整合程式驗證後才會改動 runtime。</p>
""" + "".join(cards) + '<button id="export">匯出逐段決定</button><p id="state"></p><script>const records=' + data + ";" + """
document.getElementById('export').onclick=()=>{const decisions=[...document.querySelectorAll('select')].map(s=>({...records[Number(s.dataset.index)],decision:s.value}));const data={schema:'ggd-lol-gap-listening-review@1',reviewedAt:new Date().toISOString(),decisions};const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\\n'],{type:'application/json'}));a.href=url;a.download='lol-gap-listening-decisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);document.getElementById('state').textContent='已匯出。待審項目仍不會啟用。';};</script></html>
"""
    return page

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    output=BASE/'gap-listening-review.html'
    expected=build()
    if args.check:
        if not output.is_file() or output.read_text()!=expected: raise SystemExit('Gap review is stale')
    else: output.write_text(expected)
    print('LoL gap review source hashes and page verified')

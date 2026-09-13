#!/usr/bin/env python3
"""Build a hash-verified listening queue for the fixed seven LoL base voices.

The native event reports are authoritative for event relationships only.  This
tool deliberately keeps speaker, per-clip language, transcript, gain and GGD
runtime decisions pending until a human review is recorded separately.
"""
from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path


SOURCE_ID = "lol-project-seven-ja-jp-16.18.8159717"
EXPECTED = ["Karthus", "LeeSin", "Lux", "MissFortune", "Warwick", "Xerath", "Yasuo"]
ABILITY_SLOTS = ["Q", "W", "E", "R"]
RUNTIME_CATEGORY_TARGETS = {
    "attack": "attack",
    "death": "death",
    "move": "move",
    "recall": "recall",
    "emote": "emote",
}
PRIORITY = {
    "ability-cast": 1,
    "death": 1,
    "attack": 2,
    "move": 3,
    "recall": 3,
    "emote": 4,
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def runtime_target(categories: list[str], slots: list[str]) -> str | None:
    """Return only a native-event candidate; never invent a semantic binding."""
    if categories == ["ability-cast"] and len(slots) == 1:
        return f"ability-{slots[0]}"
    if len(categories) == 1:
        return RUNTIME_CATEGORY_TARGETS.get(categories[0])
    return None


def review_priority(categories: list[str]) -> int:
    return min((PRIORITY.get(category, 5) for category in categories), default=5)


def is_battle_target(target: str | None) -> bool:
    return bool(target and (target.startswith("ability-") or target in {"attack", "death"}))


def load_decisions(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "ggd-lol-listening-review-decisions@1":
        raise ValueError("Unexpected listening decision schema")
    if data.get("sourceId") != SOURCE_ID or not isinstance(data.get("decisions"), dict):
        raise ValueError("Listening decisions do not target the fixed project-seven source")
    return data["decisions"]


def validate_decision(key: str, decision: dict | None,
                      candidate_target: str | None = None) -> None:
    if decision is None:
        return
    allowed_statuses = {"pending", "verified", "rejected", "needs-context"}
    if decision.get("status", "pending") not in allowed_statuses:
        raise ValueError(f"Unsupported review status: {key}")
    language = decision.get("language", "unreviewed")
    if decision.get("perClipLanguageVerified") and language == "unreviewed":
        raise ValueError(f"Verified language cannot remain unreviewed: {key}")
    if decision.get("speakerVerified") and not decision.get("speaker"):
        raise ValueError(f"Verified speaker requires a recorded speaker: {key}")
    if decision.get("ggdSkillSemanticBindingVerified") and not decision.get("ggdRuntimeTarget"):
        raise ValueError(f"Verified GGD semantics require a runtime target: {key}")
    if decision.get("ggdSkillSemanticBindingVerified") and (
        candidate_target is None or decision.get("ggdRuntimeTarget") != candidate_target
    ):
        raise ValueError(f"Verified GGD target differs from native event evidence: {key}")
    if decision.get("runtimeApproved"):
        required = (
            decision.get("status") == "verified"
            and decision.get("speakerVerified") is True
            and decision.get("perClipLanguageVerified") is True
            and decision.get("ggdSkillSemanticBindingVerified") is True
            and decision.get("gainDecision") not in {None, "pending"}
            and bool(decision.get("ggdRuntimeTarget"))
        )
        if not required:
            raise ValueError(f"Runtime approval lacks completed review evidence: {key}")


def build(repo_root: Path, asset_workspace: Path, decisions_path: Path) -> dict:
    reports_root = repo_root / "materials/hero-model-library/lol-project-seven/event-bindings"
    decisions = load_decisions(decisions_path)
    records: list[dict] = []
    report_inputs = []
    seen_keys = set()
    seen_paths = set()

    for native_id in EXPECTED:
        report_path = reports_root / f"{native_id.casefold()}-base.json"
        report = json.loads(report_path.read_text(encoding="utf-8"))
        validation = report.get("validation", {})
        if (
            report.get("schema") != "ggd-lol-native-event-bindings@1"
            or report.get("sourceId") != SOURCE_ID
            or report.get("nativeId") != native_id
            or report.get("skinId") != "skin0"
            or validation.get("eventBindingsVerified") is not True
            or validation.get("speakerVerified") is not False
            or validation.get("perClipLanguageVerified") is not False
            or validation.get("ggdSkillSemanticBindingsVerified") is not False
        ):
            raise ValueError(f"Unexpected event report state: {report_path}")

        relative_report = report_path.relative_to(repo_root).as_posix()
        report_inputs.append({
            "path": relative_report,
            "sha256": sha256(report_path),
            "nativeId": native_id,
            "mappedEvents": validation["mappedEvents"],
            "mappedWemIds": validation["mappedWemIds"],
        })

        for source in report["files"]:
            key = f"{native_id}:skin0:{source['wemId']}"
            if key in seen_keys:
                raise ValueError(f"Duplicate stable review key: {key}")
            seen_keys.add(key)
            path = Path(source["absolutePath"])
            expected_path = (asset_workspace / source["path"]).resolve()
            if path.resolve() != expected_path:
                raise ValueError(f"Absolute and workspace paths differ: {key}")
            if not path.is_file() or path.stat().st_size != source["bytes"]:
                raise ValueError(f"Missing or size-changed WAV: {path}")
            if sha256(path) != source["sha256"]:
                raise ValueError(f"SHA-256 mismatch: {path}")
            if source["path"] in seen_paths:
                raise ValueError(f"One project-seven WAV appears in multiple reports: {source['path']}")
            seen_paths.add(source["path"])

            categories = sorted(set(source["categories"]))
            slots = sorted(set(source["abilitySlotCandidates"]), key=ABILITY_SLOTS.index)
            bindings = sorted(
                source["eventBindings"],
                key=lambda row: (row["eventName"], row["eventId"]),
            )
            if any(binding["category"] not in categories for binding in bindings):
                raise ValueError(f"Event category missing from file summary: {key}")
            if any(binding.get("abilitySlotCandidate") not in slots
                   for binding in bindings if binding.get("abilitySlotCandidate")):
                raise ValueError(f"Ability slot missing from file summary: {key}")

            decision = decisions.get(key)
            if decision is not None and not isinstance(decision, dict):
                raise ValueError(f"Decision must be an object: {key}")
            target = runtime_target(categories, slots)
            validate_decision(key, decision, target)
            records.append({
                "key": key,
                "heroId": report["heroId"],
                "nativeId": native_id,
                "skinId": "skin0",
                "reportedLocale": report["reportedLocale"],
                "wemId": source["wemId"],
                "sourceWem": source["sourceWem"],
                "sourceWemSha256": source["sourceWemSha256"],
                "path": source["path"],
                "absolutePath": source["absolutePath"],
                "bytes": source["bytes"],
                "sha256": source["sha256"],
                "seconds": source["seconds"],
                "nativeEventCategories": categories,
                "abilitySlotCandidates": slots,
                "eventBindings": bindings,
                "eventBindingsVerified": True,
                "candidateRuntimeTarget": target,
                "candidateOnly": True,
                "reviewPriority": review_priority(categories),
                "reviewStatus": (decision or {}).get("status", "pending"),
                "decision": decision,
                "speakerCandidate": native_id,
                "speakerVerified": bool((decision or {}).get("speakerVerified", False)),
                "language": (decision or {}).get("language", "unreviewed"),
                "perClipLanguageVerified": bool((decision or {}).get("perClipLanguageVerified", False)),
                "transcriptStatus": (decision or {}).get("transcriptStatus", "not-transcribed"),
                "gainDecision": (decision or {}).get("gainDecision", "pending"),
                "ggdSkillSemanticBindingVerified": bool(
                    (decision or {}).get("ggdSkillSemanticBindingVerified", False)
                ),
                "runtimeApproved": bool((decision or {}).get("runtimeApproved", False)),
                "runtimeSelectable": False,
                "sourceEventReport": relative_report,
            })

    unknown = sorted(set(decisions) - seen_keys)
    if unknown:
        raise ValueError("Decisions reference unknown review keys: " + ", ".join(unknown))
    records.sort(key=lambda row: (
        row["reviewPriority"], EXPECTED.index(row["nativeId"]),
        row["candidateRuntimeTarget"] or "zz", row["wemId"],
    ))

    by_character = []
    for native_id in EXPECTED:
        own = [row for row in records if row["nativeId"] == native_id]
        categories = Counter(category for row in own for category in row["nativeEventCategories"])
        slots = Counter(slot for row in own for slot in row["abilitySlotCandidates"])
        by_character.append({
            "nativeId": native_id,
            "heroId": own[0]["heroId"],
            "files": len(own),
            "seconds": sum(row["seconds"] for row in own),
            "bytes": sum(row["bytes"] for row in own),
            "categoryFileRelationships": dict(sorted(categories.items())),
            "abilitySlotFileRelationships": {slot: slots[slot] for slot in ABILITY_SLOTS},
            "missingAbilitySlotEventCandidates": [slot for slot in ABILITY_SLOTS if slots[slot] == 0],
            "nativeTargetCandidates": sum(bool(row["candidateRuntimeTarget"]) for row in own),
            "battleReviewCandidates": sum(is_battle_target(row["candidateRuntimeTarget"]) for row in own),
            "pendingReviews": sum(row["reviewStatus"] == "pending" for row in own),
            "runtimeApproved": sum(row["runtimeApproved"] for row in own),
        })

    return {
        "schema": "ggd-lol-listening-review-queue@1",
        "sourceId": SOURCE_ID,
        "scope": "Exact seven named champions, ja_JP release, base skin0 native event mappings only.",
        "sourceSemantics": {
            "reportedLocale": "ja_JP",
            "eventBindingsVerified": True,
            "speakerVerifiedByDefault": False,
            "perClipLanguageVerifiedByDefault": False,
            "ggdSkillSemanticBindingVerifiedByDefault": False,
            "runtimeSelectable": False,
            "note": "Event names provide review candidates only. They do not prove the spoken language, speaker, transcript, gain, GGD slot semantics or runtime approval.",
        },
        "inputs": {
            "eventReports": report_inputs,
            "decisions": {
                "path": decisions_path.relative_to(repo_root).as_posix(),
                "sha256": sha256(decisions_path),
            },
        },
        "summary": {
            "characters": len(EXPECTED),
            "uniqueWavFiles": len(records),
            "bytes": sum(row["bytes"] for row in records),
            "seconds": sum(row["seconds"] for row in records),
            "pendingReviews": sum(row["reviewStatus"] == "pending" for row in records),
            "nativeTargetCandidates": sum(bool(row["candidateRuntimeTarget"]) for row in records),
            "battleReviewCandidates": sum(is_battle_target(row["candidateRuntimeTarget"]) for row in records),
            "speakerVerified": sum(row["speakerVerified"] for row in records),
            "perClipLanguageVerified": sum(row["perClipLanguageVerified"] for row in records),
            "ggdSkillSemanticBindingVerified": sum(
                row["ggdSkillSemanticBindingVerified"] for row in records
            ),
            "runtimeApproved": sum(row["runtimeApproved"] for row in records),
            "allLocalWavBytesAndSha256Verified": True,
            "byCharacter": by_character,
        },
        "reviewFields": [
            "status", "speakerVerified", "language", "perClipLanguageVerified",
            "transcript", "transcriptStatus", "clipType", "gainDecision",
            "ggdSkillSemanticBindingVerified", "runtimeApproved", "notes",
            "reviewer", "reviewedAt",
        ],
        "records": records,
    }


def markdown(data: dict) -> str:
    summary = data["summary"]
    approved = summary["runtimeApproved"]
    pending = summary["pendingReviews"]
    lines = [
        "# LOL 七角色原生事件聽審佇列",
        "",
        f"固定來源為 ja_JP release 的七名指定英雄 base／skin0。原生事件圖與 754 個 WAV 的本機位元組、大小及 SHA-256 已重新驗證；戰鬥候選已逐項核准 {approved} 檔，其餘 {pending} 檔仍未核准。未製作逐字稿。",
        "",
        "事件類別與 Q／W／E／R 只作候選提示。`Joke` 保留為 `emote`，`Death` 保留為 `death`；產生器不會把事件改標成受傷，也不會把缺少事件證據的片段硬塞進技能槽。",
        "",
        f"- 不同 WAV：{summary['uniqueWavFiles']} 檔",
        f"- 總長：{summary['seconds']:.2f} 秒",
        f"- 本機位元組：{summary['bytes']:,} bytes",
        f"- 待聽審／未核准：{pending} 檔",
        f"- 已核准進 runtime：{approved} 檔",
        "",
        f"- 可由單一原生事件類別建立用途候選：{summary['nativeTargetCandidates']} 檔",
        f"- 戰鬥用途候選（Q/W/E/R、攻擊、死亡）：{summary['battleReviewCandidates']} 檔",
        "",
        "| 角色 | WAV | 戰鬥候選 | Q | W | E | R | 原生事件未提供的技能候選 | 待聽審 |",
        "|---|---:|---:|---:|---:|---:|---:|---|---:|",
    ]
    for row in summary["byCharacter"]:
        slots = row["abilitySlotFileRelationships"]
        missing = "、".join(row["missingAbilitySlotEventCandidates"]) or "無"
        lines.append(
            f"| {row['nativeId']} | {row['files']} | {row['battleReviewCandidates']} | {slots['Q']} | {slots['W']} | "
            f"{slots['E']} | {slots['R']} | {missing} | {row['pendingReviews']} |"
        )
    lines += [
        "",
        "逐檔機器入口：`listening-review-queue.json`；可播放入口：`listening-review.html`。人工決定只寫入 `listening-review-decisions.json`，再重跑產生器；不要直接修改生成的佇列。每筆保留絕對 WAV 路徑、SHA-256、WEM ID、原生事件名稱、候選類別與候選技能槽。",
        "",
        "重建：",
        "",
        "```sh",
        "python3 materials/hero-model-library/lol-project-seven/tools/build_listening_review_queue.py \\",
        "  --asset-workspace \"/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT\"",
        "```",
        "",
        "啟動本機聽審頁：",
        "",
        "```sh",
        "python3 materials/hero-model-library/lol-project-seven/tools/serve_listening_review.py \\",
        "  --asset-workspace \"/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT\"",
        "```",
        "",
        "瀏覽器開啟 `http://127.0.0.1:8765/`。伺服器只監聽 loopback，只供應佇列內 WAV；每次核准都驗證目標等於原生事件候選。審查頁本身只寫決策，runtime 註冊需另跑下列套用工具。",
        "",
        "此佇列產生器只讀既有音訊，不轉碼、不覆寫來源；核准後由 `tools/apply_approved_battle_runtime.py` 產生 runtime MP3、來源註冊與驗證收據。",
        "",
    ]
    return "\n".join(lines)


def render_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def review_html() -> str:
    """Return a small local review UI; audio bytes stay outside Git."""
    return """<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>LOL 七角色戰鬥語音逐項聽審</title>
<style>
:root{color-scheme:dark;--bg:#10131a;--panel:#1a1f2b;--line:#343c50;--text:#eef2ff;--muted:#aab4ca;--accent:#67e8f9;--ok:#4ade80;--bad:#fb7185}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,sans-serif}header,.bar,main{max-width:1440px;margin:auto;padding:16px}header h1{margin:.1em 0;font-size:24px}header p{color:var(--muted);margin:.4em 0}.bar{display:flex;gap:10px;flex-wrap:wrap;position:sticky;top:0;background:#10131aee;border-block:1px solid var(--line);z-index:2}select,input,textarea,button{background:#111827;color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px}button{cursor:pointer}button.primary{border-color:var(--ok);color:var(--ok)}button.reject{border-color:var(--bad);color:var(--bad)}main{display:grid;grid-template-columns:minmax(360px,1fr) minmax(420px,1fr);gap:14px}.list,.detail{background:var(--panel);border:1px solid var(--line);border-radius:12px;min-height:70vh}.list{max-height:76vh;overflow:auto}.row{padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer}.row:hover,.row.active{background:#263044}.row strong{color:var(--accent)}.meta,.events{color:var(--muted);font-size:12px}.detail{padding:16px}.detail label{display:block;margin:10px 0}.detail input[type=text],.detail textarea,.detail select{width:100%}.detail audio{width:100%;margin:10px 0}.actions{display:flex;gap:8px;flex-wrap:wrap}.badge{display:inline-block;padding:2px 6px;border:1px solid var(--line);border-radius:99px;margin-right:5px}.notice{padding:10px;border-left:3px solid var(--accent);background:#12202a}.hidden{display:none}@media(max-width:850px){main{grid-template-columns:1fr}.list{max-height:42vh}}
</style></head><body>
<header><h1>LOL 七角色戰鬥語音逐項聽審</h1><p id="summary">讀取中…</p><p class="notice">原生事件只建立候選用途。每一檔都要播放後個別核准；本頁不會修改技能設定或啟用 runtime。</p></header>
<div class="bar"><select id="hero"><option value="">全部角色</option></select><select id="target"><option value="battle">戰鬥候選（技能／攻擊／死亡）</option><option value="candidate">全部原生用途候選</option><option value="">全部 754 檔</option></select><select id="status"><option value="">全部狀態</option><option value="pending">待審</option><option value="verified">已核准</option><option value="rejected">拒絕</option><option value="needs-context">需更多上下文</option></select><input id="search" placeholder="事件名／WEM ID"><button id="export">匯出 decisions JSON</button><label><input type="file" id="import" accept="application/json" class="hidden"><button id="importButton">匯入 decisions JSON</button></label></div>
<main><section class="list" id="list"></section><section class="detail" id="detail"><p>請選一個片段。</p></section></main>
<script>
let queue,decisions,shown=[],selected=null;const $=id=>document.getElementById(id);const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function init(){[queue,decisions]=await Promise.all([fetch('listening-review-queue.json').then(r=>r.json()),fetch('/api/decisions').then(r=>r.json())]);for(const h of queue.summary.byCharacter)$('hero').insertAdjacentHTML('beforeend',`<option>${esc(h.nativeId)}</option>`);$('summary').textContent=`${queue.summary.characters} 名角色｜${queue.summary.uniqueWavFiles} WAV｜${queue.summary.seconds.toFixed(2)} 秒｜原生用途候選 ${queue.records.filter(x=>x.candidateRuntimeTarget).length}｜已核准 ${queue.summary.runtimeApproved}`;render();}
function isBattle(r){return r.candidateRuntimeTarget?.startsWith('ability-')||['attack','death'].includes(r.candidateRuntimeTarget)}
function render(){const hero=$('hero').value,target=$('target').value,status=$('status').value,q=$('search').value.toLowerCase();shown=queue.records.filter(r=>(!hero||r.nativeId===hero)&&(!status||(decisions.decisions[r.key]?.status||'pending')===status)&&(!target||(target==='battle'?isBattle(r):!!r.candidateRuntimeTarget))&&(!q||JSON.stringify([r.wemId,r.eventBindings]).toLowerCase().includes(q)));$('list').innerHTML=shown.map(r=>{const d=decisions.decisions[r.key]||{};return `<div class="row ${selected===r.key?'active':''}" data-key="${esc(r.key)}"><strong>${esc(r.nativeId)}</strong> <span class="badge">${esc(r.candidateRuntimeTarget||'無單一候選')}</span><div>${esc(r.eventBindings.map(x=>x.eventName).join(' / '))}</div><div class="meta">${esc(r.key)}｜${r.seconds.toFixed(2)} 秒｜${esc(d.status||'pending')}</div></div>`}).join('')||'<p style="padding:16px">沒有符合條件的片段。</p>';document.querySelectorAll('.row').forEach(x=>x.onclick=()=>show(x.dataset.key));}
function show(key){selected=key;const r=queue.records.find(x=>x.key===key),d=decisions.decisions[key]||{};$('detail').innerHTML=`<h2>${esc(r.nativeId)}｜${esc(r.candidateRuntimeTarget||'無單一候選')}</h2><audio controls preload="metadata" src="/audio?key=${encodeURIComponent(key)}"></audio><p class="events">${r.eventBindings.map(x=>`${esc(x.eventName)} [${esc(x.category)}${x.abilitySlotCandidate?'/'+esc(x.abilitySlotCandidate):''}]`).join('<br>')}</p><p class="meta">WEM ${r.wemId}｜${r.seconds.toFixed(3)} 秒｜SHA-256 ${esc(r.sha256)}<br>${esc(r.absolutePath)}</p><label>說話者<input id="speaker" type="text" value="${esc(d.speaker||r.speakerCandidate)}"></label><label><input id="speakerOk" type="checkbox" ${d.speakerVerified?'checked':''}> 已用耳朵確認說話者</label><label>實際語言<select id="language"><option value="unreviewed">待確認</option><option value="ja">日文</option><option value="en">英文</option><option value="nonverbal">非語言叫聲／音效</option><option value="other">其他</option></select></label><label><input id="languageOk" type="checkbox" ${d.perClipLanguageVerified?'checked':''}> 已用耳朵確認語言／非語言</label><label>原生事件支持的 GGD 候選<input id="runtimeTarget" type="text" readonly value="${esc(r.candidateRuntimeTarget||'')}"></label><label><input id="semanticOk" type="checkbox" ${d.ggdSkillSemanticBindingVerified?'checked':''} ${r.candidateRuntimeTarget?'':'disabled'}> 核准使用這個原生事件用途</label><label>增益決定<select id="gain"><option value="pending">待決定</option><option value="keep-source-gain">保留來源增益</option><option value="normalize-after-review">核准後再正規化</option><option value="reject-clipping">削波／音量問題，拒絕</option></select></label><label>台詞／備註<textarea id="notes" rows="4">${esc(d.notes||'')}</textarea></label><div class="actions"><button id="approve" class="primary" ${r.candidateRuntimeTarget?'':'disabled'}>逐項核准此檔</button><button id="reject" class="reject">拒絕此檔</button><button id="context">需要更多上下文</button><button id="pending">存為待審</button></div><p id="message" class="meta"></p>`;$('language').value=d.language||'unreviewed';$('gain').value=d.gainDecision||'pending';$('approve').onclick=()=>save('verified',true);$('reject').onclick=()=>save('rejected',false);$('context').onclick=()=>save('needs-context',false);$('pending').onclick=()=>save('pending',false);render();}
function decision(status,approve){const r=queue.records.find(x=>x.key===selected);return {status,speaker:$('speaker').value.trim(),speakerVerified:$('speakerOk').checked,language:$('language').value,perClipLanguageVerified:$('languageOk').checked,transcriptStatus:'not-transcribed',gainDecision:$('gain').value,ggdRuntimeTarget:r.candidateRuntimeTarget,ggdSkillSemanticBindingVerified:$('semanticOk').checked,runtimeApproved:approve,notes:$('notes').value.trim(),reviewer:'local-user-review',reviewedAt:new Date().toISOString()}}
async function save(status,approve){const d=decision(status,approve);if(approve&&(!d.speakerVerified||!d.perClipLanguageVerified||!d.ggdSkillSemanticBindingVerified||d.gainDecision==='pending')){return $('message').textContent='核准前需逐項確認說話者、語言、原生事件用途與增益。'}decisions.decisions[selected]=d;const res=await fetch('/api/decisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(decisions)}),body=await res.json();if(!res.ok){$('message').textContent=body.error||'儲存失敗';return}decisions=body;show(selected);$('message').textContent='已寫入 decisions，尚未修改技能或啟用 runtime。'}
function download(data,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\\n'],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}$('export').onclick=()=>download(decisions,'listening-review-decisions.json');$('importButton').onclick=()=>$('import').click();$('import').onchange=async e=>{const data=JSON.parse(await e.target.files[0].text());const res=await fetch('/api/decisions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),body=await res.json();if(!res.ok)return alert(body.error||'匯入失敗');decisions=body;render();alert('匯入完成，尚未修改技能或啟用 runtime。')};['hero','target','status'].forEach(id=>$(id).onchange=render);$('search').oninput=render;init().catch(e=>$('summary').textContent=`載入失敗：${e.message}。請用 serve_listening_review.py 啟動本頁。`);
</script></body></html>\n"""


def write_or_check(path: Path, content: str, check: bool) -> None:
    if check:
        if not path.is_file() or path.read_text(encoding="utf-8") != content:
            raise SystemExit(f"Generated file is stale: {path}")
        return
    path.write_text(content, encoding="utf-8")


def receipt(repo_root: Path, data: dict, json_output: Path, markdown_output: Path,
            html_output: Path, decisions: Path, script: Path) -> dict:
    test_script = script.with_name("test_build_listening_review_queue.py")
    server_script = script.with_name("serve_listening_review.py")
    server_test = script.with_name("test_serve_listening_review.py")
    return {
        "schema": "ggd-lol-listening-review-queue-receipt@1",
        "sourceId": SOURCE_ID,
        "files": [
            {"path": json_output.relative_to(repo_root).as_posix(),
             "bytes": json_output.stat().st_size, "sha256": sha256(json_output)},
            {"path": markdown_output.relative_to(repo_root).as_posix(),
             "bytes": markdown_output.stat().st_size, "sha256": sha256(markdown_output)},
            {"path": html_output.relative_to(repo_root).as_posix(),
             "bytes": html_output.stat().st_size, "sha256": sha256(html_output)},
            {"path": decisions.relative_to(repo_root).as_posix(),
             "bytes": decisions.stat().st_size, "sha256": sha256(decisions)},
            {"path": script.relative_to(repo_root).as_posix(),
             "bytes": script.stat().st_size, "sha256": sha256(script)},
            {"path": test_script.relative_to(repo_root).as_posix(),
             "bytes": test_script.stat().st_size, "sha256": sha256(test_script)},
            {"path": server_script.relative_to(repo_root).as_posix(),
             "bytes": server_script.stat().st_size, "sha256": sha256(server_script)},
            {"path": server_test.relative_to(repo_root).as_posix(),
             "bytes": server_test.stat().st_size, "sha256": sha256(server_test)},
        ],
        "summary": data["summary"],
        "claims": {
            "allLocalWavBytesAndSha256Verified": True,
            "eventBindingsVerified": True,
            "speakerVerifiedCount": data["summary"]["speakerVerified"],
            "perClipLanguageVerifiedCount": data["summary"]["perClipLanguageVerified"],
            "runtimeApprovedCount": data["summary"]["runtimeApproved"],
            "runtimeConfigChanged": False,
            "deployed": False,
        },
    }


def main() -> None:
    repo_default = Path(__file__).resolve().parents[4]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=repo_default)
    parser.add_argument("--asset-workspace", type=Path, required=True)
    parser.add_argument("--decisions", type=Path)
    parser.add_argument("--json-output", type=Path)
    parser.add_argument("--markdown-output", type=Path)
    parser.add_argument("--html-output", type=Path)
    parser.add_argument("--receipt-output", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    base = repo_root / "materials/hero-model-library/lol-project-seven"
    decisions = (args.decisions or base / "listening-review-decisions.json").resolve()
    json_output = (args.json_output or base / "listening-review-queue.json").resolve()
    markdown_output = (args.markdown_output or base / "listening-review-queue.md").resolve()
    html_output = (args.html_output or base / "listening-review.html").resolve()
    receipt_output = (args.receipt_output or base / "listening-review-receipt.json").resolve()
    data = build(repo_root, args.asset_workspace.resolve(), decisions)
    write_or_check(json_output, render_json(data), args.check)
    write_or_check(markdown_output, markdown(data), args.check)
    write_or_check(html_output, review_html(), args.check)
    receipt_data = receipt(repo_root, data, json_output, markdown_output, html_output, decisions,
                           Path(__file__).resolve())
    write_or_check(receipt_output, render_json(receipt_data), args.check)
    print(json.dumps({
        "json": str(json_output),
        "markdown": str(markdown_output),
        "html": str(html_output),
        "receipt": str(receipt_output),
        **{key: data["summary"][key] for key in (
            "characters", "uniqueWavFiles", "bytes", "seconds", "pendingReviews",
            "runtimeApproved", "allLocalWavBytesAndSha256Verified",
        )},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Build a SHA-pinned local listening portal for Fate/unlimited codes PS2 WAVs."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
CONVERSION_ID = "fate-unlimited-codes-ps2-audio-review-v1"
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence" / CONVERSION_ID
RECEIPT = EVIDENCE / "receipt.json"
FILES = EVIDENCE / "files.jsonl.gz"
OUTPUT_DIR = ROOT / "materials/hero-model-library/review" / CONVERSION_ID
OUTPUT_JSON = OUTPUT_DIR / "review-queue.json"
OUTPUT_SCHEMA = OUTPUT_DIR / "review-decision.schema.json"
OUTPUT_HTML = ROOT / "apps/client/public/fate-unlimited-codes-ps2-audio-review.html"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def git_evidence(path: Path) -> dict[str, Any]:
    return {"gitPath": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}


def read_rows(receipt: dict[str, Any]) -> list[dict[str, Any]]:
    if receipt.get("schema") != "ggd.fate-unlimited-codes-ps2-audio-review-conversion@1":
        raise ValueError("unexpected Fate PS2 audio conversion receipt schema")
    if receipt.get("conversionId") != CONVERSION_ID:
        raise ValueError("unexpected Fate PS2 audio conversion id")
    manifest = receipt.get("fileManifest", {})
    if manifest.get("gitPath") != FILES.relative_to(ROOT).as_posix():
        raise ValueError("Fate PS2 receipt does not point to its file index")
    payload = FILES.read_bytes()
    if sha256(FILES) != manifest.get("sha256"):
        raise ValueError("Fate PS2 file index hash differs from receipt")
    raw = gzip.decompress(payload)
    if hashlib.sha256(raw).hexdigest() != manifest.get("uncompressedSha256"):
        raise ValueError("Fate PS2 file index uncompressed hash differs from receipt")
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line]
    if len(rows) != 653 or receipt.get("summary", {}).get("sourceWavFiles") != 653:
        raise ValueError("expected exactly 653 Fate PS2 WAV records")
    source_counts = {"spritedatabase-fate-ps2-archer": 180, "spritedatabase-fate-ps2-shirou": 222, "spritedatabase-fate-ps2-saber": 251}
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for source in rows:
        candidate_id = str(source.get("candidateId", ""))
        if not candidate_id.startswith("fuc-ps2:") or candidate_id in seen:
            raise ValueError(f"invalid or duplicate Fate PS2 candidate id: {candidate_id}")
        seen.add(candidate_id)
        source_id = source.get("sourceId")
        if source_id not in source_counts:
            raise ValueError(f"unexpected Fate PS2 source: {source_id}")
        required_pending = ("category", "reportedLanguage", "speaker", "event")
        if source.get("category") != "unclassified-audio" or any(source.get(key) not in {"unclassified-audio", "pending-confirmation"} for key in required_pending):
            raise ValueError(f"Fate PS2 clip carries unreviewed classification: {candidate_id}")
        if any(source.get(key) is not False for key in ("runtimeBindingAuthorized", "runtimeSelectable", "productionDeployed")):
            raise ValueError(f"Fate PS2 clip has runtime authority: {candidate_id}")
        audio = Path(str(source.get("sourceAbsolutePath", "")))
        if not audio.is_absolute() or not audio.is_file() or audio.suffix.lower() != ".wav":
            raise ValueError(f"Fate PS2 review WAV missing: {audio}")
        if audio.stat().st_size != source.get("sourceBytes") or sha256(audio) != source.get("sourceSha256"):
            raise ValueError(f"Fate PS2 review WAV differs from receipt: {candidate_id}")
        candidates.append({
            "candidateId": candidate_id,
            "sourceId": source_id,
            "sourceGame": receipt["sourceGame"],
            "platform": receipt["platform"],
            "sourcePackageLabel": source["sourcePackageLabel"],
            "file": {"absolutePath": str(audio), "bytes": source["sourceBytes"], "sha256": source["sourceSha256"], "codec": "wav", "sampleRate": source["sampleRate"], "channels": source["channels"], "frames": source["frames"], "seconds": source["seconds"]},
            "sourceEvidence": {"archiveMember": source["archiveMember"], "sourceRelativePath": source["sourceRelativePath"], "sampleWidthBytes": source["sampleWidthBytes"]},
            "classification": {"category": "unclassified-audio", "language": "pending-confirmation", "speaker": "pending-confirmation", "event": "pending-confirmation"},
            "listeningDecision": "pending",
            "runtimeBindingAuthorized": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
            "gaps": ["language-unverified-by-listening", "speaker-unverified-by-listening", "category-unclassified", "event-unmapped", "no-runtime-binding-authorized"],
        })
    for source_id, expected in source_counts.items():
        if sum(row["sourceId"] == source_id for row in candidates) != expected:
            raise ValueError(f"Fate PS2 source count drift: {source_id}")
    return sorted(candidates, key=lambda row: (row["sourceId"], row["sourceEvidence"]["sourceRelativePath"]))


def build_contract() -> dict[str, Any]:
    receipt = read_json(RECEIPT)
    candidates = read_rows(receipt)
    source_inputs = [git_evidence(RECEIPT), git_evidence(FILES)]
    fingerprint = hashlib.sha256(canonical_json({
        "sourceInputs": source_inputs,
        "files": [(row["candidateId"], row["file"]["sha256"]) for row in candidates],
    }).encode("utf-8")).hexdigest()
    return {
        "schema": "ggd.fate-unlimited-codes-ps2-audio-review-portal@1",
        "sourceFingerprint": fingerprint,
        "sourceInputs": source_inputs,
        "sourceReceipt": {"conversionId": receipt["conversionId"], "sourceGame": receipt["sourceGame"], "platform": receipt["platform"], "receipt": source_inputs[0], "fileManifest": source_inputs[1]},
        "policy": {"reviewIsPerClip": True, "classificationIsOwnerConfirmedOnly": True, "runtimeMutationAllowed": False, "runtimeBindingAuthorized": False, "backendSelectableAssets": 0, "productionDeployments": 0},
        "summary": {"candidateCount": len(candidates), "audioCandidateCount": len(candidates), "archerCandidateCount": sum(row["sourceId"] == "spritedatabase-fate-ps2-archer" for row in candidates), "shirouCandidateCount": sum(row["sourceId"] == "spritedatabase-fate-ps2-shirou" for row in candidates), "saberCandidateCount": sum(row["sourceId"] == "spritedatabase-fate-ps2-saber" for row in candidates), "pendingListeningDecisionCount": len(candidates), "pendingLanguageConfirmationCount": len(candidates), "pendingSpeakerConfirmationCount": len(candidates), "pendingEventConfirmationCount": len(candidates), "runtimeBindingsCreated": 0, "backendSelectableAssets": 0, "productionDeployments": 0},
        "audioCandidates": candidates,
    }


def decision_schema(contract: dict[str, Any]) -> dict[str, Any]:
    ids = [row["candidateId"] for row in contract["audioCandidates"]]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://ggd.local/schema/fate-unlimited-codes-ps2-audio-review-decisions-v1.json",
        "title": "Fate/unlimited codes PS2 per-clip listening decisions",
        "type": "object", "additionalProperties": False,
        "required": ["schema", "sourceFingerprint", "reviewer", "reviewedAt", "runtimeMutationAllowed", "decisions"],
        "properties": {
            "schema": {"const": "ggd.fate-unlimited-codes-ps2-audio-listening-decisions@1"},
            "sourceFingerprint": {"const": contract["sourceFingerprint"]},
            "reviewer": {"type": "string", "minLength": 1},
            "reviewedAt": {"type": "string", "format": "date-time"},
            "runtimeMutationAllowed": {"const": False},
            "decisions": {"type": "array", "minItems": len(ids), "maxItems": len(ids), "items": {"type": "object", "additionalProperties": False, "required": ["candidateId", "listeningDecision", "note", "runtimeBindingAuthorized"], "properties": {"candidateId": {"enum": ids}, "listeningDecision": {"enum": ["pending", "auditioned-needs-classification", "exclude-from-voice-candidates"]}, "note": {"type": "string"}, "runtimeBindingAuthorized": {"const": False}}}},
        },
    }


def safe_inline_json(value: Any) -> str:
    return canonical_json(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def build_html(contract: dict[str, Any]) -> str:
    data = safe_inline_json(contract)
    fingerprint = html.escape(contract["sourceFingerprint"])
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Fate/unlimited codes PS2 逐段聽審</title>
<style>:root{{--bg:#090913;--card:#161625;--line:#3c3b59;--fg:#f1efff;--dim:#b7b4cf;--accent:#b799ff;--warn:#ffcc7a;--bad:#ff999d}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}header{{position:sticky;top:0;z-index:2;padding:12px 18px;background:#0d0c18f2;border-bottom:1px solid var(--line)}}main{{max-width:1440px;margin:auto;padding:18px}}h1{{font-size:20px;margin:0}}.dim{{color:var(--dim)}}.warn{{border:1px solid #8e6c39;background:#2f2618;padding:10px 12px;border-radius:8px;color:#ffe3af}}.toolbar{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}}input,select,textarea,button{{border:1px solid var(--line);background:#24233a;color:var(--fg);padding:7px 9px;border-radius:7px}}input[type=search]{{min-width:300px}}button{{cursor:pointer}}button:hover{{border-color:var(--accent)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(355px,1fr));gap:12px}}.card{{border:1px solid #777591;border-radius:10px;background:var(--card);padding:12px;min-width:0}}.card.auditioned-needs-classification{{border-color:var(--accent)}}.card.exclude-from-voice-candidates{{border-color:var(--bad)}}audio{{width:100%}}code{{font-size:11px;word-break:break-all}}.tags{{display:flex;gap:5px;flex-wrap:wrap}}.tag{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 7px}}dl{{display:grid;grid-template-columns:105px 1fr;gap:3px 8px}}dt{{color:var(--dim)}}dd{{margin:0;min-width:0;word-break:break-word}}textarea{{width:100%;min-height:58px}}details{{margin-top:8px}}.hidden{{display:none!important}}</style></head><body>
<header><h1>Fate/unlimited codes PS2：653 段逐段聽審</h1><div class="dim">來源指紋：<code>{fingerprint}</code></div></header><main>
<p class="warn">Archer（180）、Shirou（222）、Saber（251）皆為來源包範圍，不是單段說話者確認。每段的語言、說話者、對白／喊聲／音效分類與 GGD 事件均保持 <strong>pending-confirmation</strong>。匯出內容固定 <code>runtimeBindingAuthorized=false</code>，不會建立 runtime 綁定、後台選項或部署。</p>
<div class="toolbar"><input id="search" type="search" placeholder="搜尋來源、檔案、SHA"><select id="source"><option value="">全部來源</option><option value="spritedatabase-fate-ps2-archer">Archer 180</option><option value="spritedatabase-fate-ps2-shirou">Shirou 222</option><option value="spritedatabase-fate-ps2-saber">Saber 251</option></select><select id="status"><option value="">全部聽審狀態</option><option value="pending">pending</option><option value="auditioned-needs-classification">已聽，待分類</option><option value="exclude-from-voice-candidates">排除語音候選</option></select><input id="reviewer" placeholder="審查者" value="owner"><button id="export">匯出聽審決定</button><button id="clear">清除本機草稿</button><span id="visible" class="dim"></span></div><p id="statusLine" class="dim"></p><section id="cards" class="grid"></section></main>
<script id="review-data" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('review-data').textContent),all=D.audioCandidates,storageKey='ggd-fuc-ps2-audio-review:'+D.sourceFingerprint;let draft=JSON.parse(localStorage.getItem(storageKey)||'{{"decisions":{{}}}}');const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));function state(id){{return draft.decisions[id]||{{listeningDecision:'pending',note:''}}}}function persist(){{localStorage.setItem(storageKey,JSON.stringify(draft));renderStatus();applyFilters()}}function card(c){{const s=state(c.candidateId),f=c.file,n=document.createElement('article');n.className='card '+s.listeningDecision;n.dataset.candidate=c.candidateId;n.dataset.source=c.sourceId;n.dataset.search=JSON.stringify(c).toLowerCase();n.innerHTML=`<h2>${{esc(c.sourcePackageLabel)}}</h2><div class="tags"><span class="tag">語言：pending-confirmation</span><span class="tag">說話者：pending-confirmation</span><span class="tag">事件：pending-confirmation</span><span class="tag">分類：unclassified-audio</span></div><audio controls preload="metadata" src="http://127.0.0.1:8768/media/${{encodeURIComponent(c.candidateId)}}"></audio><dl><dt>來源</dt><dd>${{esc(c.sourceId)}}</dd><dt>WAV 路徑</dt><dd><code>${{esc(f.absolutePath)}}</code></dd><dt>WAV SHA-256</dt><dd><code>${{esc(f.sha256)}}</code></dd><dt>規格</dt><dd>${{esc(f.sampleRate)}}Hz · ${{esc(f.channels)}}ch · ${{esc(f.frames)}} frames · ${{esc(f.seconds)}}s</dd><dt>封包成員</dt><dd><code>${{esc(c.sourceEvidence.archiveMember)}}</code></dd></dl><details><summary>來源限制</summary><p>來源包標籤不等於逐段聲音身份。此段尚未被分類或綁定至遊戲事件。</p><ul>${{c.gaps.map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul></details><label>聽審結論 <select data-decision="${{esc(c.candidateId)}}"><option value="pending">pending</option><option value="auditioned-needs-classification">已聽，待分類</option><option value="exclude-from-voice-candidates">排除語音候選</option></select></label><label>備註<textarea data-note="${{esc(c.candidateId)}}" placeholder="記錄你聽到的內容；不會自動改成語言、說話者或事件">${{esc(s.note)}}</textarea></label>`;n.querySelector('[data-decision]').value=s.listeningDecision;return n}}for(const c of all)document.getElementById('cards').append(card(c));document.addEventListener('change',e=>{{const x=e.target.closest('[data-decision]');if(x){{const s=state(x.dataset.decision);s.listeningDecision=x.value;draft.decisions[x.dataset.decision]=s;persist()}}}});document.addEventListener('input',e=>{{const x=e.target.closest('[data-note]');if(x){{const s=state(x.dataset.note);s.note=x.value;draft.decisions[x.dataset.note]=s;persist()}}if(e.target.id==='search')applyFilters()}});function applyFilters(){{const q=document.getElementById('search').value.toLowerCase(),source=document.getElementById('source').value,filter=document.getElementById('status').value;let shown=0;for(const c of document.querySelectorAll('[data-candidate]')){{const s=state(c.dataset.candidate),ok=(!q||c.dataset.search.includes(q))&&(!source||c.dataset.source===source)&&(!filter||s.listeningDecision===filter);c.classList.toggle('hidden',!ok);c.className='card '+s.listeningDecision+(ok?'':' hidden');if(ok)shown++}}document.getElementById('visible').textContent=`顯示 ${{shown}}/${{all.length}}`}}function renderStatus(){{const c={{pending:0,'auditioned-needs-classification':0,'exclude-from-voice-candidates':0}};for(const x of all)c[state(x.candidateId).listeningDecision]++;document.getElementById('statusLine').textContent=`pending ${{c.pending}} · 已聽待分類 ${{c['auditioned-needs-classification']}} · 排除候選 ${{c['exclude-from-voice-candidates']}}；尚未寫入任何素材或 runtime 設定。`}}document.getElementById('source').onchange=applyFilters;document.getElementById('status').onchange=applyFilters;document.getElementById('export').onclick=()=>{{const decisions=all.map(c=>{{const s=state(c.candidateId);return{{candidateId:c.candidateId,listeningDecision:s.listeningDecision,note:s.note||'',runtimeBindingAuthorized:false}}}});const output={{schema:'ggd.fate-unlimited-codes-ps2-audio-listening-decisions@1',sourceFingerprint:D.sourceFingerprint,reviewer:document.getElementById('reviewer').value.trim()||'owner',reviewedAt:new Date().toISOString(),runtimeMutationAllowed:false,decisions}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)+'\\n'],{{type:'application/json'}}));a.download='fate-unlimited-codes-ps2-audio-listening-decisions.json';a.click();URL.revokeObjectURL(a.href)}};document.getElementById('clear').onclick=()=>{{localStorage.removeItem(storageKey);location.reload()}};applyFilters();renderStatus();window.__fucPs2AudioReview={{contract:D,getDraft:()=>JSON.parse(JSON.stringify(draft))}};
</script></body></html>'''


def products() -> dict[Path, str]:
    contract = build_contract()
    return {OUTPUT_JSON: json.dumps(contract, ensure_ascii=False, indent=2) + "\n", OUTPUT_SCHEMA: json.dumps(decision_schema(contract), ensure_ascii=False, indent=2) + "\n", OUTPUT_HTML: build_html(contract)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = products()
    if args.check:
        stale = [path.relative_to(ROOT).as_posix() for path, value in generated.items() if not path.is_file() or path.read_text(encoding="utf-8") != value]
        if stale:
            raise SystemExit("stale generated Fate PS2 review files: " + ", ".join(stale))
    else:
        for path, value in generated.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
    print(json.dumps(build_contract()["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

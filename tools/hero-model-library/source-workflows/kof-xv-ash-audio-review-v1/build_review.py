#!/usr/bin/env python3
"""Build the local, SHA-pinned listening review portal for KOF XV Ash.

The portal is deliberately an audition and annotation surface only.  It reads
the conversion receipt and the compressed per-file manifest produced by
``prepare.py``; it never classifies a clip or changes runtime registrations.
"""

from __future__ import annotations

import argparse
import gzip
import hashlib
import html
import json
from pathlib import Path
from typing import Any


HERE = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[4]
EVIDENCE = ROOT / "materials/hero-model-library/priority-evidence/kof-xv-ash-audio-review-v1"
RECEIPT = EVIDENCE / "receipt.json"
FILES = EVIDENCE / "files.jsonl.gz"
OUTPUT_DIR = ROOT / "materials/hero-model-library/review/kof-xv-ash-audio-review-v1"
OUTPUT_JSON = OUTPUT_DIR / "review-queue.json"
OUTPUT_SCHEMA = OUTPUT_DIR / "review-decision.schema.json"
OUTPUT_HTML = ROOT / "apps/client/public/kof-xv-ash-audio-review.html"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def git_evidence(path: Path) -> dict[str, Any]:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"expected JSON object: {path}")
    return value


def read_rows(receipt: dict[str, Any]) -> list[dict[str, Any]]:
    if receipt.get("schema") != "ggd.kof-xv-ash-audio-review-conversion@1":
        raise ValueError("unexpected KOF XV Ash conversion receipt schema")
    if receipt.get("conversionId") != "kof-xv-ash-audio-review-v1":
        raise ValueError("unexpected KOF XV Ash conversion id")
    manifest = receipt.get("fileManifest", {})
    if manifest.get("gitPath") != FILES.relative_to(ROOT).as_posix():
        raise ValueError("conversion receipt does not point to the Ash file index")
    payload = FILES.read_bytes()
    if sha256(FILES) != manifest.get("sha256"):
        raise ValueError("Ash file index hash differs from conversion receipt")
    raw = gzip.decompress(payload)
    if hashlib.sha256(raw).hexdigest() != manifest.get("uncompressedSha256"):
        raise ValueError("Ash file index uncompressed hash differs from conversion receipt")
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines() if line]
    if len(rows) != receipt.get("summary", {}).get("convertedReviewMp3Files") or len(rows) != 86:
        raise ValueError("expected exactly 86 Ash review MP3 records")
    native_ids: set[str] = set()
    candidates: list[dict[str, Any]] = []
    for source in rows:
        native_id = str(source.get("nativeAudioId", ""))
        if not native_id or native_id in native_ids:
            raise ValueError(f"invalid or duplicate native audio id: {native_id}")
        native_ids.add(native_id)
        required_pending = ("category", "reportedLanguage", "speaker", "event")
        if any(source.get(key) not in {"unclassified-audio", "pending-confirmation"} for key in required_pending):
            raise ValueError(f"Ash clip carries an unreviewed classification: {native_id}")
        if source.get("category") != "unclassified-audio":
            raise ValueError(f"Ash clip category is not unclassified: {native_id}")
        if source.get("runtimeBindingAuthorized") is not False or source.get("runtimeSelectable") is not False:
            raise ValueError(f"Ash clip has runtime authority: {native_id}")
        output = Path(str(source.get("outputAbsolutePath", "")))
        input_wav = Path(str(source.get("sourceAbsolutePath", "")))
        if not output.is_absolute() or not output.is_file() or output.suffix.lower() != ".mp3":
            raise ValueError(f"Ash review MP3 missing: {output}")
        if not input_wav.is_absolute() or not input_wav.is_file() or input_wav.suffix.lower() != ".wav":
            raise ValueError(f"Ash source WAV missing: {input_wav}")
        if output.stat().st_size != source.get("outputBytes") or sha256(output) != source.get("outputSha256"):
            raise ValueError(f"Ash review MP3 differs from its receipt: {native_id}")
        if input_wav.stat().st_size != source.get("sourceBytes") or sha256(input_wav) != source.get("sourceSha256"):
            raise ValueError(f"Ash source WAV differs from its receipt: {native_id}")
        candidates.append({
            "candidateId": f"kof-xv-ash:{native_id}",
            "nativeAudioId": native_id,
            "sourceId": source["sourceId"],
            "sourceGame": receipt["sourceGame"],
            "packageScope": source["packageScope"],
            "reviewMp3": {
                "absolutePath": str(output),
                "bytes": source["outputBytes"],
                "sha256": source["outputSha256"],
                "codec": source["codec"],
                "sampleRate": source["sampleRate"],
                "channels": source["channels"],
                "seconds": source["seconds"],
                "fullDecodePassed": source["fullDecodePassed"],
            },
            "sourceWav": {
                "absolutePath": str(input_wav),
                "bytes": source["sourceBytes"],
                "sha256": source["sourceSha256"],
                "format": source["sourceFormat"],
                "sampleFormat": source["sourceSampleFormat"],
            },
            "classification": {
                "category": "unclassified-audio",
                "language": "pending-confirmation",
                "speaker": "pending-confirmation",
                "event": "pending-confirmation",
            },
            "listeningDecision": "pending",
            "runtimeBindingAuthorized": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
            "gaps": [
                "language-unverified-by-listening",
                "speaker-unverified-by-listening",
                "category-unclassified",
                "event-unmapped",
                "no-runtime-binding-authorized",
            ],
        })
    return sorted(candidates, key=lambda row: row["nativeAudioId"])


def build_contract() -> dict[str, Any]:
    receipt = read_json(RECEIPT)
    candidates = read_rows(receipt)
    source_inputs = [git_evidence(RECEIPT), git_evidence(FILES)]
    fingerprint = hashlib.sha256(canonical_json({
        "sourceInputs": source_inputs,
        "reviewMp3": [(row["candidateId"], row["reviewMp3"]["sha256"]) for row in candidates],
        "sourceWav": [(row["candidateId"], row["sourceWav"]["sha256"]) for row in candidates],
    }).encode("utf-8")).hexdigest()
    return {
        "schema": "ggd.kof-xv-ash-audio-review-portal@1",
        "sourceFingerprint": fingerprint,
        "sourceInputs": source_inputs,
        "sourceReceipt": {
            "conversionId": receipt["conversionId"],
            "sourceId": receipt["sourceId"],
            "sourceGame": receipt["sourceGame"],
            "platform": receipt["platform"],
            "receipt": source_inputs[0],
            "fileManifest": source_inputs[1],
        },
        "policy": {
            "reviewIsPerClip": True,
            "classificationIsOwnerConfirmedOnly": True,
            "runtimeMutationAllowed": False,
            "runtimeBindingAuthorized": False,
            "backendSelectableAssets": 0,
            "productionDeployments": 0,
        },
        "summary": {
            "candidateCount": len(candidates),
            "pendingListeningDecisionCount": len(candidates),
            "pendingLanguageConfirmationCount": len(candidates),
            "pendingSpeakerConfirmationCount": len(candidates),
            "pendingEventConfirmationCount": len(candidates),
            "runtimeBindingsCreated": 0,
            "backendSelectableAssets": 0,
            "productionDeployments": 0,
        },
        "audioCandidates": candidates,
    }


def decision_schema(contract: dict[str, Any]) -> dict[str, Any]:
    ids = [row["candidateId"] for row in contract["audioCandidates"]]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://ggd.local/schema/kof-xv-ash-audio-review-decisions-v1.json",
        "title": "KOF XV Ash per-clip listening decisions",
        "type": "object",
        "additionalProperties": False,
        "required": ["schema", "sourceFingerprint", "reviewer", "reviewedAt", "runtimeMutationAllowed", "decisions"],
        "properties": {
            "schema": {"const": "ggd.kof-xv-ash-audio-listening-decisions@1"},
            "sourceFingerprint": {"const": contract["sourceFingerprint"]},
            "reviewer": {"type": "string", "minLength": 1},
            "reviewedAt": {"type": "string", "format": "date-time"},
            "runtimeMutationAllowed": {"const": False},
            "decisions": {
                "type": "array", "minItems": len(ids), "maxItems": len(ids),
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["candidateId", "listeningDecision", "note", "runtimeBindingAuthorized"],
                    "properties": {
                        "candidateId": {"enum": ids},
                        "listeningDecision": {"enum": ["pending", "auditioned-needs-classification", "exclude-from-voice-candidates"]},
                        "note": {"type": "string"},
                        "runtimeBindingAuthorized": {"const": False},
                    },
                },
            },
        },
    }


def safe_inline_json(value: Any) -> str:
    return canonical_json(value).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def build_html(contract: dict[str, Any]) -> str:
    data = safe_inline_json(contract)
    fingerprint = html.escape(contract["sourceFingerprint"])
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>KOF XV Ash 逐段聽審</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--bad:#ff8b8b}}*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}header{{position:sticky;top:0;z-index:2;padding:12px 18px;background:#08131ef2;border-bottom:1px solid var(--line)}}main{{max-width:1320px;margin:auto;padding:18px}}h1{{font-size:20px;margin:0}}.dim{{color:var(--dim)}}.warn{{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}}.toolbar{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}}input,select,textarea,button{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 9px;border-radius:7px}}input[type=search]{{min-width:300px}}button{{cursor:pointer}}button:hover{{border-color:var(--accent)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(350px,1fr));gap:12px}}.card{{border:1px solid #6f7f91;border-radius:10px;background:var(--card);padding:12px;min-width:0}}.card.auditioned-needs-classification{{border-color:var(--accent)}}.card.exclude-from-voice-candidates{{border-color:var(--bad)}}audio{{width:100%}}code{{font-size:11px;word-break:break-all}}.tags{{display:flex;gap:5px;flex-wrap:wrap}}.tag{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 7px}}dl{{display:grid;grid-template-columns:102px 1fr;gap:3px 8px}}dt{{color:var(--dim)}}dd{{margin:0;min-width:0;word-break:break-word}}textarea{{width:100%;min-height:58px}}details{{margin-top:8px}}.hidden{{display:none!important}}
</style></head><body><header><h1>KOF XV Ash：86 段逐段聽審</h1><div class="dim">來源 receipt SHA-256：<code>{fingerprint}</code></div></header><main>
<p class="warn">這一頁只讓你逐段播放與記錄聽審結論。所有音檔的語言、說話者、分類、技能／事件目前都是 <strong>pending-confirmation</strong>；匯出的每列都固定 <code>runtimeBindingAuthorized=false</code>，不會建立 runtime 綁定、後台選項或部署。</p>
<div class="toolbar"><input id="search" type="search" placeholder="搜尋 native ID、SHA、路徑"><select id="status"><option value="">全部聽審狀態</option><option value="pending">pending</option><option value="auditioned-needs-classification">已聽，待分類</option><option value="exclude-from-voice-candidates">排除語音候選</option></select><input id="reviewer" placeholder="審查者" value="owner"><button id="export">匯出聽審決定</button><button id="clear">清除本機草稿</button><span id="visible" class="dim"></span></div>
<p id="statusLine" class="dim"></p><section id="cards" class="grid"></section></main>
<script id="review-data" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('review-data').textContent),all=D.audioCandidates,storageKey='ggd-kof-xv-ash-review:'+D.sourceFingerprint;let draft=JSON.parse(localStorage.getItem(storageKey)||'{{"decisions":{{}}}}');const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));function state(id){{return draft.decisions[id]||{{listeningDecision:'pending',note:''}}}}function persist(){{localStorage.setItem(storageKey,JSON.stringify(draft));renderStatus();applyFilters()}}function card(c){{const s=state(c.candidateId),e=c.reviewMp3,w=c.sourceWav,n=document.createElement('article');n.className='card '+s.listeningDecision;n.dataset.candidate=c.candidateId;n.dataset.search=JSON.stringify(c).toLowerCase();n.innerHTML=`<h2>${{esc(c.nativeAudioId)}}</h2><div class="tags"><span class="tag">語言：pending-confirmation</span><span class="tag">說話者：pending-confirmation</span><span class="tag">事件：pending-confirmation</span><span class="tag">分類：unclassified-audio</span></div><audio controls preload="metadata" src="http://127.0.0.1:8768/media/${{encodeURIComponent(c.candidateId)}}"></audio><dl><dt>來源</dt><dd>${{esc(c.sourceId)}} · ${{esc(c.sourceGame)}}</dd><dt>MP3 路徑</dt><dd><code>${{esc(e.absolutePath)}}</code></dd><dt>MP3 SHA-256</dt><dd><code>${{esc(e.sha256)}}</code></dd><dt>MP3 規格</dt><dd>${{esc(e.codec)}} · ${{esc(e.sampleRate)}}Hz · ${{esc(e.channels)}}ch · ${{esc(e.seconds)}}s</dd><dt>WAV 路徑</dt><dd><code>${{esc(w.absolutePath)}}</code></dd><dt>WAV SHA-256</dt><dd><code>${{esc(w.sha256)}}</code></dd></dl><details><summary>來源範圍與缺口</summary><p>${{esc(c.packageScope)}}</p><ul>${{c.gaps.map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul></details><label>聽審結論 <select data-decision="${{esc(c.candidateId)}}"><option value="pending">pending</option><option value="auditioned-needs-classification">已聽，待分類</option><option value="exclude-from-voice-candidates">排除語音候選</option></select></label><label>備註<textarea data-note="${{esc(c.candidateId)}}" placeholder="可記錄你聽到的內容；不會自動轉成語言、說話者或事件">${{esc(s.note)}}</textarea></label>`;n.querySelector('[data-decision]').value=s.listeningDecision;return n}}for(const c of all)document.getElementById('cards').append(card(c));document.addEventListener('change',e=>{{const x=e.target.closest('[data-decision]');if(x){{const s=state(x.dataset.decision);s.listeningDecision=x.value;draft.decisions[x.dataset.decision]=s;persist()}}}});document.addEventListener('input',e=>{{const x=e.target.closest('[data-note]');if(x){{const s=state(x.dataset.note);s.note=x.value;draft.decisions[x.dataset.note]=s;persist()}}if(e.target.id==='search')applyFilters()}});function applyFilters(){{const q=document.getElementById('search').value.toLowerCase(),filter=document.getElementById('status').value;let shown=0;for(const c of document.querySelectorAll('[data-candidate]')){{const s=state(c.dataset.candidate),ok=(!q||c.dataset.search.includes(q))&&(!filter||s.listeningDecision===filter);c.classList.toggle('hidden',!ok);c.className='card '+s.listeningDecision+(ok?'':' hidden');if(ok)shown++}}document.getElementById('visible').textContent=`顯示 ${{shown}}/${{all.length}}`}}function renderStatus(){{const c={{pending:0,'auditioned-needs-classification':0,'exclude-from-voice-candidates':0}};for(const x of all)c[state(x.candidateId).listeningDecision]++;document.getElementById('statusLine').textContent=`pending ${{c.pending}} · 已聽待分類 ${{c['auditioned-needs-classification']}} · 排除候選 ${{c['exclude-from-voice-candidates']}}；尚未寫入任何素材或 runtime 設定。`}}document.getElementById('status').onchange=applyFilters;document.getElementById('export').onclick=()=>{{const decisions=all.map(c=>{{const s=state(c.candidateId);return{{candidateId:c.candidateId,listeningDecision:s.listeningDecision,note:s.note||'',runtimeBindingAuthorized:false}}}});const output={{schema:'ggd.kof-xv-ash-audio-listening-decisions@1',sourceFingerprint:D.sourceFingerprint,reviewer:document.getElementById('reviewer').value.trim()||'owner',reviewedAt:new Date().toISOString(),runtimeMutationAllowed:false,decisions}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(output,null,2)+'\\n'],{{type:'application/json'}}));a.download='kof-xv-ash-audio-listening-decisions.json';a.click();URL.revokeObjectURL(a.href)}};document.getElementById('clear').onclick=()=>{{localStorage.removeItem(storageKey);location.reload()}};applyFilters();renderStatus();window.__kofAshAudioReview={{contract:D,getDraft:()=>JSON.parse(JSON.stringify(draft))}};
</script></body></html>'''


def products() -> dict[Path, str]:
    contract = build_contract()
    return {
        OUTPUT_JSON: json.dumps(contract, ensure_ascii=False, indent=2) + "\n",
        OUTPUT_SCHEMA: json.dumps(decision_schema(contract), ensure_ascii=False, indent=2) + "\n",
        OUTPUT_HTML: build_html(contract),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    generated = products()
    if args.check:
        stale = [path.relative_to(ROOT).as_posix() for path, value in generated.items() if not path.is_file() or path.read_text(encoding="utf-8") != value]
        if stale:
            raise SystemExit("stale generated Ash review files: " + ", ".join(stale))
    else:
        for path, value in generated.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
    print(json.dumps(build_contract()["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

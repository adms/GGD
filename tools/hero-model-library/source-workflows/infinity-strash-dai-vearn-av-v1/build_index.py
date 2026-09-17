#!/usr/bin/env python3
"""Build the strict Dai/old-Vearn audio review queue and VFX source index.

This workflow consumes the already preserved Infinity Strash extraction indexes.
It never reads EN653/EN680/EN681 into a target collection, never treats shared
media as character-specific, and never creates runtime bindings.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
WORKSPACE = Path("/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT")
ASSET_LIBRARY = WORKSPACE / "GGD-Asset-Library"
RAW_INDEX = ASSET_LIBRARY / "intake/windows-readonly-20260913/infinity-strash-priority-raw-v2/extraction-index.json"
AUDIO_ROOT = ASSET_LIBRARY / "intake/windows-readonly-20260913/infinity-strash-popp-and-priority-audio-deps-v1"
AUDIO_INDEX = AUDIO_ROOT / "audio-file-index.json"
AUDIO_EXTRACTION = AUDIO_ROOT / "extraction-index.json"
OUTPUT = ROOT / "materials/hero-model-library/priority-evidence/infinity-strash-dai-vearn-av-v1"
AUDIO_QUEUE = OUTPUT / "audio-review-queue.json"
VFX_INDEX = OUTPUT / "vfx-source-index.json"
SUMMARY = OUTPUT / "summary.json"
README = OUTPUT / "README.md"
REVIEW_PAGE = ROOT / "apps/client/public/infinity-strash-dai-vearn-av-review.html"

IDENTITIES = {
    "PN010": {
        "heroIds": ["godie-nbbc", "godie-n01c"],
        "nameZh": "小呆／達伊",
        "originalName": "Dai",
        "form": "PN010 source family; PN010/02 and PN010/05 model candidates are registered separately",
    },
    "EN801": {
        "heroIds": ["godie-ubal"],
        "nameZh": "巴恩大魔王（老年／變身前）",
        "originalName": "Vearn",
        "form": "pre-transformation elderly Vearn only",
    },
}
EXCLUDED_IDENTITIES = {
    "EN653": "MystVearn is a separate character",
    "EN680": "Baran is a separate character",
    "EN681": "Baran form is a separate character",
}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def file_evidence(path: Path, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    path = path.resolve()
    if not path.is_file():
        raise ValueError(f"missing indexed source file: {path}")
    row = {"absolutePath": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if expected and (row["bytes"] != expected["bytes"] or row["sha256"] != expected["sha256"]):
        raise ValueError(f"indexed source file changed: {path}")
    return row


def event_label(path: str) -> str:
    return Path(path).stem.removeprefix("Play_")


def semantic_labels(paths: list[str]) -> list[str]:
    labels: set[str] = set()
    joined = " ".join(paths).lower()
    tests = (
        ("death-or-down", ("death", "dead", "down")),
        ("damage-or-hurt", ("dmg", "damage", "hurt")),
        ("attack", ("atk", "attack")),
        ("skill-or-special", ("skill", "special", "aban", "kaizer", "mera", "iora")),
        ("movement", ("run", "walk", "jump", "dodge", "foot", "slide")),
        ("appearance-or-select", ("app", "select")),
    )
    for label, tokens in tests:
        if any(token in joined for token in tokens):
            labels.add(label)
    return sorted(labels) or ["unclassified-native-event"]


def build_audio() -> tuple[dict[str, Any], dict[str, Any]]:
    file_index = read_json(AUDIO_INDEX)
    extraction = read_json(AUDIO_EXTRACTION)
    if file_index.get("schema") != "ggd-infinity-strash-priority-audio-files@1":
        raise ValueError("unexpected audio file index schema")
    if extraction.get("schema") != "ggd-infinity-strash-popp-priority-audio@1":
        raise ValueError("unexpected audio extraction schema")

    rows: list[dict[str, Any]] = []
    excluded_shared = Counter()
    for source in file_index["files"]:
        involved = source.get("nativeIds", [])
        targets = [native_id for native_id in IDENTITIES if native_id in involved]
        if not targets:
            continue
        if len(involved) != 1 or involved[0] not in IDENTITIES:
            for native_id in targets:
                excluded_shared[native_id] += 1
            continue
        native_id = involved[0]
        decoded = file_evidence(AUDIO_ROOT / source["path"], source)
        master = file_evidence(Path(source["sourcePath"]), {"bytes": Path(source["sourcePath"]).stat().st_size, "sha256": source["sourceSha256"]})
        event_paths = sorted(source["eventPaths"])
        media_id = Path(source["path"]).stem
        category = source["sourceCategory"]
        locale = source["reportedLocale"]
        candidate_id = f"infinity-strash-{native_id.lower()}-{locale.lower()}-{media_id}"
        rows.append({
            "candidateId": candidate_id,
            "sourceId": extraction["sourceId"],
            "workZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            "character": {"nativeId": native_id, **IDENTITIES[native_id]},
            "sourceCategory": category,
            "reportedLocale": locale,
            "languageConfidence": (
                "source-localized-package-label; listening-unverified"
                if locale in {"Japanese", "English_US"}
                else "unclassified-source-path; listening-unverified"
                if locale == "unreviewed"
                else "not-applicable-or-unverified-nonlocalized"
            ),
            "speakerCandidate": IDENTITIES[native_id]["nameZh"] if category == "voice" else None,
            "speakerConfidence": "source-event-namespace-only; listening-unverified" if category == "voice" else "not-applicable-sound-effect",
            "eventPaths": event_paths,
            "eventLabels": [event_label(path) for path in event_paths],
            "semanticCandidates": semantic_labels(event_paths),
            "eventMeaningConfidence": "filename-heuristic-only; owner-review-required",
            "decodedWav": {**decoded, "durationSeconds": source["durationSeconds"], "sampleRate": source["sampleRate"], "channels": source["channels"]},
            "masterWem": {**master, "encoding": source["sourceEncoding"]},
            "decision": "pending",
            "runtimeBindingAuthorized": False,
        })
    rows.sort(key=lambda row: (row["character"]["nativeId"], row["reportedLocale"], row["candidateId"]))

    by_identity: dict[str, Any] = {}
    for native_id in IDENTITIES:
        selected = [row for row in rows if row["character"]["nativeId"] == native_id]
        by_identity[native_id] = {
            "candidateCount": len(selected),
            "voice": sum(row["sourceCategory"] == "voice" for row in selected),
            "soundEffect": sum(row["sourceCategory"] == "sound-effect" for row in selected),
            "unclassified": sum(row["sourceCategory"] not in {"voice", "sound-effect"} for row in selected),
            "durationSeconds": round(sum(row["decodedWav"]["durationSeconds"] for row in selected), 6),
            "decodedBytes": sum(row["decodedWav"]["bytes"] for row in selected),
            "reportedLocales": dict(sorted(Counter(row["reportedLocale"] for row in selected).items())),
            "sharedOrMixedMediaExcluded": excluded_shared[native_id],
            "runtimeBindingsCreated": 0,
        }
    missing = []
    for relation in extraction.get("payloadMissing", []):
        if relation.get("nativeIds") == ["PN010"] or relation.get("nativeIds") == ["EN801"]:
            missing.append(relation)
    queue = {
        "schema": "ggd.infinity-strash-dai-vearn-audio-review@1",
        "sourceId": extraction["sourceId"],
        "sourceInputs": [file_evidence(AUDIO_INDEX), file_evidence(AUDIO_EXTRACTION)],
        "policy": {
            "targetNativeIds": sorted(IDENTITIES),
            "excludedIdentities": EXCLUDED_IDENTITIES,
            "sharedOrMixedMediaExcluded": True,
            "ownerPerFileReviewRequired": True,
            "automaticRuntimeBindingAllowed": False,
        },
        "summary": {
            "candidateCount": len(rows),
            "byIdentity": by_identity,
            "missingPayloadRelations": len(missing),
            "listeningReviewed": 0,
            "runtimeBindingsCreated": 0,
            "productionDeployed": 0,
        },
        "missingPayloadRelations": missing,
        "candidates": rows,
    }
    return queue, {"byIdentity": by_identity, "missingPayloadRelations": len(missing)}


def build_vfx() -> tuple[dict[str, Any], dict[str, Any]]:
    extraction = read_json(RAW_INDEX)
    if extraction.get("schema") != "ggd-infinity-strash-priority-raw-extraction@1":
        raise ValueError("unexpected raw extraction schema")
    grouped: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for source in extraction["files"]:
        native_id = source.get("identityId")
        if native_id not in IDENTITIES or source.get("category") != "vfx":
            continue
        path = Path(source["absolutePath"])
        evidence = file_evidence(path, source)
        stem = str(path.with_suffix(""))
        grouped[(native_id, stem)].append({**evidence, "sourceRelativePath": source["path"]})
    packages = []
    for (native_id, stem), files in sorted(grouped.items()):
        source_paths = sorted(row["sourceRelativePath"] for row in files)
        packages.append({
            "candidateId": f"infinity-strash-vfx-{native_id.lower()}-{hashlib.sha256(stem.encode()).hexdigest()[:12]}",
            "sourceId": extraction["sourceId"],
            "character": {"nativeId": native_id, **IDENTITIES[native_id]},
            "nativePackageStem": Path(stem).name,
            "sourcePaths": source_paths,
            "files": sorted(files, key=lambda row: row["sourceRelativePath"]),
            "semanticCandidates": semantic_labels(source_paths),
            "conversionState": "raw-unreal-vfx-package-indexed; dependency-closure-and-ggd-reconstruction-pending",
            "visualAcceptance": "not-started",
            "skillBindingsCreated": 0,
            "runtimeSelectable": False,
        })
    by_identity = {}
    for native_id in IDENTITIES:
        selected = [row for row in packages if row["character"]["nativeId"] == native_id]
        by_identity[native_id] = {
            "rawPackageGroups": len(selected),
            "rawFiles": sum(len(row["files"]) for row in selected),
            "rawBytes": sum(file["bytes"] for row in selected for file in row["files"]),
            "ggdVfxConverted": 0,
            "visuallyAccepted": 0,
            "skillBindingsCreated": 0,
        }
    index = {
        "schema": "ggd.infinity-strash-dai-vearn-vfx-source-index@1",
        "sourceId": extraction["sourceId"],
        "sourceInput": file_evidence(RAW_INDEX),
        "policy": {
            "targetNativeIds": sorted(IDENTITIES),
            "excludedIdentities": EXCLUDED_IDENTITIES,
            "rawNiagaraOrUnrealPackagesAreNotGgdVfx": True,
            "visualAcceptanceRequiredBeforeBinding": True,
        },
        "summary": {"packageGroups": len(packages), "byIdentity": by_identity, "ggdVfxConverted": 0, "skillBindingsCreated": 0, "productionDeployed": 0},
        "packages": packages,
    }
    return index, {"byIdentity": by_identity}


def safe_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026")


def review_html(queue: dict[str, Any], vfx: dict[str, Any]) -> str:
    data = safe_json({"audio": queue, "vfx": vfx})
    return f'''<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Infinity Strash 達伊／老巴恩影音素材審查</title><style>
body{{margin:0;background:#081019;color:#edf5ff;font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}header{{position:sticky;top:0;background:#0b1724ee;padding:12px 18px;border-bottom:1px solid #294158;z-index:5}}main{{max-width:1500px;margin:auto;padding:18px}}h1{{font-size:20px;margin:0}}.warn{{background:#312515;border:1px solid #8c6930;color:#ffe0a1;padding:10px;border-radius:8px}}.tools{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}}input,select,button,textarea{{background:#142536;color:#edf5ff;border:1px solid #34506a;border-radius:6px;padding:7px}}input[type=search]{{min-width:340px}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:10px}}.card{{background:#101d29;border:1px solid #294158;border-radius:9px;padding:11px;min-width:0}}audio{{width:100%}}code{{font-size:11px;word-break:break-all}}.tag{{display:inline-block;border:1px solid #34506a;border-radius:999px;padding:1px 7px;margin:2px}}textarea{{width:100%;min-height:48px}}.hidden{{display:none}}.dim{{color:#aab8c7}}details{{margin-top:8px}}pre{{white-space:pre-wrap;word-break:break-all}}</style></head><body><header><h1>Infinity Strash 達伊／老巴恩 VFX、SFX、語音審查</h1><div class="dim">逐檔核准只匯出決定，不修改 runtime</div></header><main><div class="warn">範圍固定 PN010 與 EN801 老年／變身前巴恩。EN653 密斯特巴恩、EN680／681 巴蘭與跨角色共用媒體均已排除；young／變身後巴恩沒有完整 payload。語言、說話者與事件意義尚未聽審，預設全部 pending。</div><div class="tools"><input id="q" type="search" placeholder="搜尋角色、事件、SHA"><select id="who"><option value="">兩名角色</option><option>PN010</option><option>EN801</option></select><select id="kind"><option value="">音效與語音</option><option value="voice">voice</option><option value="sound-effect">sound-effect</option></select><span id="count" class="dim"></span></div><h2>可播放音訊逐項審查</h2><div id="audio" class="grid"></div><h2>原生 VFX 套件候選</h2><p class="warn">這些是 Unreal/Niagara 來源套件索引，還沒有完成 GGD 重建或視覺驗收，因此只能檢查來源與轉換優先順序，不能核准 runtime 綁定。</p><div id="vfx" class="grid"></div><h2>匯出音訊審查決定</h2><button id="export">下載 infinity-strash-dai-vearn-av-decisions.json</button></main><script id="data" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('data').textContent),A=D.audio.candidates,key='ggd.strash-dai-vearn-av:'+D.audio.sourceInputs.map(x=>x.sha256).join(':');let s=JSON.parse(localStorage.getItem(key)||'{{}}');const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));const root=document.getElementById('audio');for(const c of A){{const a=document.createElement('article');a.className='card';a.dataset.search=JSON.stringify(c).toLowerCase();a.dataset.who=c.character.nativeId;a.dataset.kind=c.sourceCategory;a.innerHTML=`<h3>${{esc(c.character.nameZh)}} · ${{esc(c.eventLabels.join(' / '))}}</h3><span class="tag">${{esc(c.reportedLocale)}}</span><span class="tag">${{esc(c.sourceCategory)}}</span><audio controls preload="none" src="http://127.0.0.1:8768/media/${{encodeURIComponent(c.candidateId)}}"></audio><details><summary>來源、SHA 與事件</summary><code>${{esc(c.decodedWav.absolutePath)}}</code><br><code>${{esc(c.decodedWav.sha256)}}</code><pre>${{esc(JSON.stringify({{eventPaths:c.eventPaths,semanticCandidates:c.semanticCandidates,speakerConfidence:c.speakerConfidence,languageConfidence:c.languageConfidence}},null,2))}}</pre></details><select data-id="${{esc(c.candidateId)}}"><option>pending</option><option>approve</option><option>reject</option></select><textarea data-note="${{esc(c.candidateId)}}" placeholder="逐項備註"></textarea>`;root.append(a);const d=s[c.candidateId]||{{decision:'pending',note:''}};a.querySelector('select').value=d.decision;a.querySelector('textarea').value=d.note}}const vr=document.getElementById('vfx');for(const c of D.vfx.packages){{const a=document.createElement('article');a.className='card';a.innerHTML=`<h3>${{esc(c.character.nameZh)}} · ${{esc(c.nativePackageStem)}}</h3><span class="tag">${{esc(c.semanticCandidates.join(' / '))}}</span><p>${{esc(c.conversionState)}}</p><details><summary>${{c.files.length}} 個來源檔</summary><pre>${{esc(JSON.stringify(c.files,null,2))}}</pre></details>`;vr.append(a)}}document.addEventListener('input',e=>{{const id=e.target.dataset.id||e.target.dataset.note;if(id){{const card=e.target.closest('.card');s[id]={{decision:card.querySelector('select').value,note:card.querySelector('textarea').value}};localStorage.setItem(key,JSON.stringify(s))}}}});function filter(){{const q=document.getElementById('q').value.toLowerCase(),who=document.getElementById('who').value,kind=document.getElementById('kind').value;let n=0;for(const a of root.children){{const ok=(!q||a.dataset.search.includes(q))&&(!who||a.dataset.who===who)&&(!kind||a.dataset.kind===kind);a.classList.toggle('hidden',!ok);if(ok)n++}}document.getElementById('count').textContent=`顯示 ${{n}}/${{A.length}}`}}document.getElementById('q').oninput=filter;document.getElementById('who').onchange=filter;document.getElementById('kind').onchange=filter;document.getElementById('export').onclick=()=>{{const out={{schema:'ggd.infinity-strash-dai-vearn-av-decisions@1',sourceInputSha256:D.audio.sourceInputs.map(x=>x.sha256),runtimeMutationAllowed:false,decisions:A.map(c=>({{candidateId:c.candidateId,...(s[c.candidateId]||{{decision:'pending',note:''}}),runtimeBindingAuthorized:false}}))}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\\n'],{{type:'application/json'}}));a.download='infinity-strash-dai-vearn-av-decisions.json';a.click();URL.revokeObjectURL(a.href)}};filter();
</script></body></html>'''


def chunked_documents(
    document: dict[str, Any], collection_key: str, prefix: str, chunk_size: int
) -> tuple[dict[str, Any], dict[Path, str]]:
    rows = document.pop(collection_key)
    parts: dict[Path, str] = {}
    pointers = []
    for index in range(0, len(rows), chunk_size):
        number = index // chunk_size + 1
        path = OUTPUT / f"{prefix}.part-{number:03d}.json"
        payload = {
            "schema": document["schema"] + ".part@1",
            "sourceId": document["sourceId"],
            "part": number,
            collection_key: rows[index:index + chunk_size],
        }
        value = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
        parts[path] = value
        pointers.append({
            "gitPath": path.relative_to(ROOT).as_posix(),
            "bytes": len(value.encode("utf-8")),
            "sha256": hashlib.sha256(value.encode("utf-8")).hexdigest(),
            "rowCount": len(payload[collection_key]),
        })
    document["parts"] = pointers
    return document, parts


def build_products() -> dict[Path, str]:
    audio, audio_summary = build_audio()
    vfx, vfx_summary = build_vfx()
    summary = {
        "schema": "ggd.infinity-strash-dai-vearn-av-summary@1",
        "sourceIds": [audio["sourceId"], vfx["sourceId"]],
        "scope": {"identities": IDENTITIES, "excludedIdentities": EXCLUDED_IDENTITIES, "youngOrPostTransformationVearnPayloadCount": 0},
        "stages": {
            "acquisition": "complete-for-indexed-local-source-and-s3-preserved-parent-deliveries",
            "extraction": "complete-for-indexed-PN010-and-EN801-raw-packages-and-Wwise-media",
            "conversion": "decoded-WAV-complete-for-safe-exact-identity-media; GGD-VFX-conversion-not-started",
            "acceptance": "automated-audio-container-validation-only; listening-and-VFX-visual-acceptance-pending",
            "registration": "review-queue-and-central-index-pointer-only; runtime-bindings-zero",
            "deployment": "unverified-and-not-claimed",
        },
        "audio": audio_summary,
        "vfx": vfx_summary,
        "reviewPage": "apps/client/public/infinity-strash-dai-vearn-av-review.html",
        "runtimeBindingsCreated": 0,
        "productionDeploymentVerified": False,
    }
    readme = f"""# Infinity Strash 達伊／老年巴恩 AV 索引 v1

此工作流只處理 PN010 小呆／達伊與 EN801 老年、變身前巴恩。EN653 密斯特巴恩、EN680／EN681 巴蘭和跨角色共用媒體全部排除。young／變身後巴恩完整 payload 仍為 0。

- 音訊候選：{audio['summary']['candidateCount']}（逐檔 WAV、WEM、事件路徑、SHA-256；全部 pending，runtime 綁定 0）。
- VFX 來源套件：{vfx['summary']['packageGroups']} 組、{sum(x['rawFiles'] for x in vfx['summary']['byIdentity'].values())} 檔（只證明已擷取，GGD VFX 轉換與視覺驗收均為 0）。
- 審查頁：`apps/client/public/infinity-strash-dai-vearn-av-review.html`。

重建與檢查：

```bash
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/build_index.py
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/build_index.py --check
python3 tools/hero-model-library/source-workflows/infinity-strash-dai-vearn-av-v1/serve_review.py
```

媒體伺服器只允許 queue 內宣告且 SHA-256 相符的 WAV，支援瀏覽器 Range；頁面匯出的決定固定 `runtimeBindingAuthorized: false`，後續必須由 checked integration 另行套用。
"""
    audio_manifest, audio_parts = chunked_documents(audio.copy(), "candidates", "audio-review-queue", 70)
    vfx_manifest, vfx_parts = chunked_documents(vfx.copy(), "packages", "vfx-source-index", 40)
    products = {
        AUDIO_QUEUE: json.dumps(audio_manifest, ensure_ascii=False, indent=2) + "\n",
        VFX_INDEX: json.dumps(vfx_manifest, ensure_ascii=False, indent=2) + "\n",
        SUMMARY: json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        README: readme,
        REVIEW_PAGE: review_html(audio, vfx),
    }
    products.update(audio_parts)
    products.update(vfx_parts)
    return products


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    products = build_products()
    if args.check:
        stale = [str(path.relative_to(ROOT)) for path, value in products.items() if not path.is_file() or path.read_text(encoding="utf-8") != value]
        if stale:
            raise SystemExit("stale generated Dai/Vearn AV outputs: " + ", ".join(stale))
    else:
        for path, value in products.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
    print(json.dumps(read_json(SUMMARY) if args.check else json.loads(products[SUMMARY]), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

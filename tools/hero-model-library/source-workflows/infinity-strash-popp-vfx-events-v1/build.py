#!/usr/bin/env python3
"""Build a byte-verified Popp VFX/event audit and a listening-review queue.

This reads only preserved local extracts. It does not execute Unreal packages,
assign GGD skills, or turn a listening candidate into a runtime binding.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import struct
from pathlib import Path


REPO = Path(__file__).resolve().parents[4]
LIBRARY = REPO.parent / "GGD-Asset-Library"
DEPENDENCY_INDEX = REPO / "materials/hero-model-library/infinity-strash/dependency-index.json"
RAW_VFX = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-popp-vfx-direct-packages-v1/raw/strash/Content"
VFX_SOURCE_MANIFEST = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-popp-vfx-direct-packages-v1/source-manifest.json"
VFX_CLOSURE_MANIFEST = LIBRARY / "intake/windows-readonly-20260914/infinity-strash-popp-vfx-dependency-closure-v1/source-manifest.json"
RAW_EVENTS = LIBRARY / "intake/windows-readonly-20260913/infinity-strash-popp-and-priority-audio-deps-v1/raw/strash/Content"
AUDIO_INDEX = LIBRARY / "intake/windows-readonly-20260913/infinity-strash-popp-and-priority-audio-deps-v1/extraction-index.json"
PAK_MANIFEST = LIBRARY / "intake/windows-readonly-20260913/infinity-strash-primary-paks-v1/source-manifest.json"
OUTPUT = REPO / "materials/hero-model-library/priority-evidence/infinity-strash-popp-vfx-events-v1"
CONVERSION_PROBE = OUTPUT / "conversion-probe.json"
CLOSURE_CONVERSION_PROBE = OUTPUT / "closure-conversion-probe.json"
CLOSURE_S3_BACKUP_RECEIPT = OUTPUT / "dependency-closure-s3-backup-receipt.json"


def sha256(path: Path) -> str:
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


def proof(path: Path) -> dict:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


def fstring(data: bytes, offset: int) -> tuple[str, int]:
    length = struct.unpack_from("<i", data, offset)[0]
    offset += 4
    if abs(length) >= 65536:
        raise ValueError("unreasonable Unreal FString length")
    if length > 0:
        value = data[offset : offset + length - 1].decode("utf-8")
        offset += length
    elif length < 0:
        width = -length * 2
        value = data[offset : offset + width - 2].decode("utf-16-le")
        offset += width
    else:
        value = ""
    return value, offset


def parse_package(uasset: Path) -> dict:
    data = uasset.read_bytes()
    if struct.unpack_from("<I", data)[0] != 0x9E2A83C1:
        raise ValueError(f"not an Unreal package: {uasset}")
    if struct.unpack_from("<i", data, 4)[0] != -7 or struct.unpack_from("<i", data, 20)[0] != 0:
        raise ValueError(f"unsupported versioned package layout: {uasset}")
    header_size = struct.unpack_from("<i", data, 24)[0]
    _, offset = fstring(data, 28)
    offset += 4
    name_count, name_offset, _, _, export_count, export_offset, import_count, import_offset, dependency_offset = struct.unpack_from(
        "<9i", data, offset
    )
    names: list[str] = []
    cursor = name_offset
    for _ in range(name_count):
        value, cursor = fstring(data, cursor)
        cursor += 4
        names.append(value)

    def fname(at: int) -> str:
        index, number = struct.unpack_from("<ii", data, at)
        if not 0 <= index < len(names):
            raise ValueError(f"invalid name index in {uasset}")
        return names[index] + (f"_{number - 1}" if number else "")

    imports = []
    for index in range(import_count):
        at = import_offset + index * 28
        imports.append(
            {
                "classPackage": fname(at),
                "className": fname(at + 8),
                "outerIndex": struct.unpack_from("<i", data, at + 16)[0],
                "objectName": fname(at + 20),
            }
        )
    if export_count and dependency_offset - export_offset != export_count * 104:
        raise ValueError(f"unexpected UE4.26 export table layout: {uasset}")
    exports = []
    for index in range(export_count):
        at = export_offset + index * 104
        class_index = struct.unpack_from("<i", data, at)[0]
        class_name = imports[-class_index - 1]["objectName"] if class_index < 0 else f"ExportRef:{class_index}"
        size, serial_offset = struct.unpack_from("<qq", data, at + 28)
        exports.append({"objectName": fname(at + 16), "className": class_name, "serialSize": size, "serialOffset": serial_offset})
    uexp = uasset.with_suffix(".uexp")
    payload_size = uexp.stat().st_size
    if any(row["serialOffset"] - header_size + row["serialSize"] > payload_size for row in exports):
        raise ValueError(f"export table exceeds payload: {uasset}")
    package_dependencies = sorted(
        {row["objectName"] for row in imports if row["className"] == "Package" and row["objectName"].startswith(("/Game/", "/Niagara/"))}
    )
    return {
        "exportClassCounts": dict(sorted(collections.Counter(row["className"] for row in exports).items())),
        "exportCount": len(exports),
        "importCount": len(imports),
        "packageDependencies": package_dependencies,
    }


def unreal_pair(root: Path, reference: str) -> tuple[Path, Path]:
    stem = reference.removeprefix("/Game/")
    return root / f"{stem}.uasset", root / f"{stem}.uexp"


def vfx_kind(reference: str) -> str:
    name = reference.rsplit("/", 1)[-1]
    if name.startswith("NPS_"):
        return "niagara-system"
    if name.startswith("CV_"):
        return "curve-float-support-component"
    return "material-parameter-collection-support-component"


def validate_vfx_source_manifest(source_manifest: dict, raw_vfx: Path, references: list[str]) -> None:
    expected = {
        (raw_vfx / (reference.removeprefix("/Game/") + suffix)).resolve()
        for reference in references
        for suffix in (".uasset", ".uexp")
    }
    rows = source_manifest.get("files", [])
    indexed = {Path(row["absolutePath"]).resolve(): row for row in rows}
    if set(indexed) != expected:
        raise ValueError("direct VFX source manifest does not enumerate the exact 34 expected files")
    for path, row in indexed.items():
        if not path.is_file() or path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"direct VFX source manifest hash drift: {path}")


def build_vfx_rows(references: list[str], raw_vfx: Path, conversion_probe: dict, closure_conversion_probe: dict) -> list[dict]:
    probe_by_reference = {row["reference"]: row for row in conversion_probe["rows"]}
    closure_probe_by_reference = {row["reference"]: row for row in closure_conversion_probe["rows"]}
    if set(probe_by_reference) != set(references):
        raise ValueError("conversion probe reference set differs from the 17 retained VFX references")
    if set(closure_probe_by_reference) != set(references):
        raise ValueError("closure conversion probe reference set differs from the 17 retained VFX references")
    rows = []
    for reference in references:
        uasset, uexp = unreal_pair(raw_vfx, reference)
        if not uasset.is_file() or not uexp.is_file():
            raise ValueError(f"missing directly extracted VFX pair: {reference}")
        parsed = parse_package(uasset)
        dependencies = parsed.pop("packageDependencies")
        dependency_pairs_present = 0
        for dependency in dependencies:
            if dependency.startswith("/Game/"):
                first, second = unreal_pair(raw_vfx, dependency)
                dependency_pairs_present += int(first.is_file() and second.is_file())
        kind = vfx_kind(reference)
        rows.append(
            {
                "reference": reference,
                "kind": kind,
                "directPackageState": "acquired-byte-verified-ue426-table-validated",
                "uasset": proof(uasset),
                "uexp": proof(uexp),
                "structuralAnalysis": parsed,
                "nonScriptPackageDependencies": dependencies,
                "dependencyCount": len(dependencies),
                "dependencyPairsPresentInBoundedExtract": dependency_pairs_present,
                "conversion": {
                    "status": "dependency-closure-acquired-conversion-blocked",
                    "runtimeSelectable": False,
                    "visualAcceptance": False,
                    "preservedUmodelProbe": probe_by_reference[reference],
                    "preservedClosureUmodelProbe": closure_probe_by_reference[reference],
                    "blockers": [
                        "The recursively acquired dependency closure is complete at the non-script package-reference table level, but acquisition is not conversion.",
                        "The preserved patched UModel probe still produced zero converted files for this package when run against the closure-backed extract.",
                        "This delivery supplies no deterministic Unreal Niagara-to-GGD conversion output or accepted rendered playback.",
                    ],
                },
            }
        )
    return rows


def reference_kind(reference: str) -> str:
    if "/WwiseAudio/" in reference:
        return "wwise-stop-event" if reference.rsplit("/", 1)[-1].startswith("Stop_") else "wwise-play-event"
    if "/Animations/AS_" in reference:
        return "anim-sequence"
    if "/Animations/AM_" in reference:
        return "anim-montage"
    if reference.endswith("Skeleton"):
        return "skeleton"
    return "level-sequence"


def event_matches(reference: str, event_path: str) -> bool:
    wanted = reference.removeprefix("/Game/") + ".uasset"
    normalized = event_path.removeprefix("strash/Content/")
    if normalized == wanted:
        return True
    prefix = "WwiseAudio/Events/Voice_Work_Unit/"
    if wanted.startswith(prefix):
        suffix = wanted.removeprefix("WwiseAudio/Events/")
        return normalized.endswith("/Events/" + suffix)
    return False


def build_event_rows(references: list[str], raw_events: Path, audio_index: dict) -> tuple[list[dict], list[dict]]:
    rows = []
    candidates = []
    media_by_ref = {row["mediaRef"]: row for row in audio_index["media"]}
    extracted_files = {Path(row["absolutePath"]).resolve(): row for row in audio_index["files"]}
    for reference in references:
        uasset, uexp = unreal_pair(raw_events, reference)
        if not uasset.is_file() or not uexp.is_file():
            raise ValueError(f"missing event-reference package pair: {reference}")
        for path in (uasset, uexp):
            indexed = extracted_files.get(path.resolve())
            if indexed is None or indexed["bytes"] != path.stat().st_size or indexed["sha256"] != sha256(path):
                raise ValueError(f"event package differs from audio extraction index: {path}")
        kind = reference_kind(reference)
        mapped_events = [row for row in audio_index["events"] if event_matches(reference, row["eventPath"])] if kind.startswith("wwise") else []
        media_refs = sorted({media for row in mapped_events for media in row["media"]})
        row_candidates = []
        for media_ref in media_refs:
            media = media_by_ref[media_ref]
            decoded = media.get("decodedWav")
            if not decoded:
                continue
            path = Path(decoded["absolutePath"])
            if not path.is_file() or sha256(path) != decoded["sha256"]:
                raise ValueError(f"decoded audio evidence drift: {path}")
            event_variants = [row for row in mapped_events if media_ref in row["media"]]
            locales = sorted({row["language"] for row in event_variants})
            candidate_id = "popp-" + hashlib.sha256((reference + "\0" + media_ref).encode()).hexdigest()[:20]
            candidate = {
                "candidateId": candidate_id,
                "sourceEventReference": reference,
                "resolvedEventPaths": sorted(row["eventPath"] for row in event_variants),
                "mediaRef": media_ref,
                "sourceCategory": sorted(media["kinds"]),
                "reportedLocales": locales,
                "audio": {
                    "absolutePath": str(path),
                    "bytes": decoded["bytes"],
                    "sha256": decoded["sha256"],
                    "durationSeconds": decoded["durationSeconds"],
                    "sampleRate": decoded["sampleRate"],
                    "channels": decoded["channels"],
                },
                "reviewDecision": None,
                "speakerVerified": False,
                "eventMeaningVerified": False,
                "runtimeSelectable": False,
                "runtimeBinding": None,
            }
            candidates.append(candidate)
            row_candidates.append(candidate_id)
        if kind == "wwise-stop-event":
            resolution = "control-event-acquired-no-audio-payload-expected"
        elif kind.startswith("wwise") and row_candidates:
            resolution = "decoded-audio-candidates-ready-listening-approval-required"
        elif kind.startswith("wwise"):
            resolution = "event-acquired-media-resolution-missing"
        elif kind == "anim-sequence":
            resolution = "raw-sequence-acquired-animation-and-notify-timing-not-exported-in-this-lane"
        elif kind == "anim-montage":
            resolution = "raw-montage-acquired-montage-sections-not-decoded"
        else:
            resolution = "raw-reference-acquired-event-timing-not-decoded"
        rows.append(
            {
                "reference": reference,
                "kind": kind,
                "packageState": "acquired-byte-verified",
                "uasset": proof(uasset),
                "uexp": proof(uexp),
                "resolution": resolution,
                "resolvedAudioCandidateIds": row_candidates,
                "runtimeBinding": None,
                "runtimeSelectable": False,
            }
        )
    return rows, candidates


def render_markdown(receipt: dict) -> str:
    counts = receipt["summary"]
    lines = [
        "# 波普原作 VFX 與事件引用查核",
        "",
        "> 這是原始套件與候選音訊的查核收據。`runtimeSelectable=false`，沒有自動綁定技能。",
        "",
        f"- VFX 引用：{counts['vfxReferences']}；直接套件對已取得：{counts['vfxDirectPairsAcquired']}；GGD 轉換完成：{counts['vfxConverted']}。",
        f"- VFX 第一層依賴：{counts['vfxFirstLevelDependencyReferenceOccurrences']} 次引用／{counts['vfxFirstLevelUniqueDependencyReferences']} 個唯一 package。",
        f"- VFX 非腳本 package 遞迴閉包：發現 {counts['vfxClosurePackageReferencesDiscovered']}；取得 {counts['vfxClosurePackageReferencesAcquired']}；缺失 {counts['vfxClosurePackageReferencesMissing']}；閉包完整：{str(counts['vfxNonScriptPackageDependencyClosureComplete']).lower()}。",
        f"- VFX 閉包 S3 legacy 歸檔：{receipt['sourceAvailability']['dependencyClosureS3Backup']['s3Uri']}；完整下載讀回與逐成員 SHA-256：通過。",
        f"- 事件引用：{counts['eventReferences']}；原始套件對已取得：{counts['eventPairsAcquired']}。",
        f"- 可播放逐項審查候選：{counts['audioReviewCandidates']}；使用者已核准：0。",
        f"- 41 筆 PN020 直接事件以外另有 {counts['otherExternalReferences']} 筆相依引用；其中 {counts['supportingGenericSfxReferences']} 筆通用魔法音效事件尚未抽出與對媒體。",
        f"- 本輪 Windows 分享：{receipt['sourceAvailability']['windowsShare']}。本機 PAK 鏡像與解包實檔仍可用。",
        "",
        "## VFX",
        "",
        "| 引用 | 種類 | 直接套件 | 相依數 | 轉換狀態 |",
        "|---|---|---:|---:|---|",
    ]
    for row in receipt["vfx"]:
        lines.append(f"| `{row['reference']}` | {row['kind']} | 2 | {row['dependencyCount']} | {row['conversion']['status']} |")
    lines += ["", "## 事件與音訊", "", "| 引用 | 種類 | 候選數 | 狀態 |", "|---|---|---:|---|"]
    for row in receipt["events"]:
        lines.append(f"| `{row['reference']}` | {row['kind']} | {len(row['resolvedAudioCandidateIds'])} | {row['resolution']} |")
    lines += [
        "",
        "## 仍缺",
        "",
        "- 14 個 NiagaraSystem 的非腳本 package 依賴閉包已取得，但尚無可重現的 GGD 轉換器與原作播放視覺驗收。",
        "- 2 個 CurveFloat 與 1 個 MaterialParameterCollection 是支援元件，不能單獨冒稱完整特效。",
        "- 事件到 GGD 技能時點尚未完成；全部音效／語音候選需逐項聽審後才能綁定。",
        "- 依賴索引另含 10 個通用魔法音效事件；它們不在指定的 41 個 PN020 直接事件內，本批未將名稱當成已取得音檔。",
        "",
    ]
    return "\n".join(lines)


def render_html(queue: dict) -> str:
    embedded = json.dumps(queue, ensure_ascii=False).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>波普事件音訊逐項審查</title>
<style>
body{{font:15px system-ui;background:#10131a;color:#edf2ff;margin:0}}main{{max-width:1180px;margin:auto;padding:24px}}.summary,.row{{background:#191f2b;border:1px solid #303a4e;border-radius:12px;padding:14px;margin:10px 0}}.row{{display:grid;grid-template-columns:minmax(300px,2fr) minmax(220px,1fr) 220px;gap:14px;align-items:center}}code{{overflow-wrap:anywhere;color:#9fd2ff}}audio{{width:100%}}button,select,input{{font:inherit;padding:8px;border-radius:8px;border:1px solid #56627a;background:#252d3d;color:#fff}}button{{cursor:pointer}}.pending{{color:#ffd479}}.approved{{color:#83e69c}}.rejected{{color:#ff9b9b}}@media(max-width:800px){{.row{{grid-template-columns:1fr}}}}
</style></head><body><main><h1>波普事件音訊逐項審查</h1>
<div class="summary">每一列都是來源事件對到的解碼 WAV 候選。預設全部未核准；匯出決定不會修改遊戲綁定。</div>
<p><button id="export">匯出審查 JSON</button> <button id="clear">清除本機草稿</button> <span id="counts"></span></p><div id="rows"></div>
<script id="queue" type="application/json">{embedded}</script><script>
const queue=JSON.parse(document.querySelector('#queue').textContent);const key='ggd-popp-event-audio-review-v1';let saved=JSON.parse(localStorage.getItem(key)||'{{}}');
function draw(){{const root=document.querySelector('#rows');root.innerHTML='';for(const c of queue.candidates){{const d=saved[c.candidateId]||{{decision:'pending',note:''}};const row=document.createElement('section');row.className='row';row.innerHTML=`<div><code>${{c.sourceEventReference}}</code><br><small>${{c.mediaRef}} · ${{c.reportedLocales.join(', ')}} · ${{c.audio.durationSeconds.toFixed(3)}} 秒</small></div><audio controls preload="none" src="/audio/${{encodeURIComponent(c.candidateId)}}"></audio><div><select aria-label="審查決定"><option value="pending">待審</option><option value="approved">核准此候選</option><option value="rejected">拒絕</option></select><input aria-label="備註" placeholder="備註" value="${{(d.note||'').replaceAll('&','&amp;').replaceAll('"','&quot;')}}"></div>`;const sel=row.querySelector('select'),note=row.querySelector('input');sel.value=d.decision;sel.className=d.decision;function save(){{saved[c.candidateId]={{decision:sel.value,note:note.value}};localStorage.setItem(key,JSON.stringify(saved));drawCounts()}}sel.onchange=save;note.onchange=save;root.append(row)}}drawCounts()}}
function drawCounts(){{let a=0,r=0;for(const c of queue.candidates){{const d=(saved[c.candidateId]||{{}}).decision;a+=d==='approved';r+=d==='rejected'}}document.querySelector('#counts').textContent=`核准 ${{a}}／拒絕 ${{r}}／總候選 ${{queue.candidates.length}}`}}
document.querySelector('#clear').onclick=()=>{{localStorage.removeItem(key);saved={{}};draw()}};document.querySelector('#export').onclick=()=>{{const result={{schema:'ggd.popp-event-audio-owner-review@1',sourceQueueSha256:queue.queueSha256,decisions:queue.candidates.map(c=>({{candidateId:c.candidateId,decision:(saved[c.candidateId]||{{decision:'pending'}}).decision,note:(saved[c.candidateId]||{{note:''}}).note}}))}};const blob=new Blob([JSON.stringify(result,null,2)+'\\n'],{{type:'application/json'}});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='popp-event-audio-review.json';a.click();URL.revokeObjectURL(a.href)}};draw();
</script></main></body></html>"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dependency-index", type=Path, default=DEPENDENCY_INDEX)
    parser.add_argument("--raw-vfx", type=Path, default=RAW_VFX)
    parser.add_argument("--vfx-source-manifest", type=Path, default=VFX_SOURCE_MANIFEST)
    parser.add_argument("--vfx-closure-manifest", type=Path, default=VFX_CLOSURE_MANIFEST)
    parser.add_argument("--raw-events", type=Path, default=RAW_EVENTS)
    parser.add_argument("--audio-index", type=Path, default=AUDIO_INDEX)
    parser.add_argument("--pak-manifest", type=Path, default=PAK_MANIFEST)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--conversion-probe", type=Path, default=CONVERSION_PROBE)
    parser.add_argument("--closure-conversion-probe", type=Path, default=CLOSURE_CONVERSION_PROBE)
    parser.add_argument("--closure-s3-backup-receipt", type=Path, default=CLOSURE_S3_BACKUP_RECEIPT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    dependency_index = json.loads(args.dependency_index.read_text())
    audio_index = json.loads(args.audio_index.read_text())
    vfx_source_manifest = json.loads(args.vfx_source_manifest.read_text())
    vfx_closure_manifest = json.loads(args.vfx_closure_manifest.read_text())
    pak_manifest = json.loads(args.pak_manifest.read_text())
    conversion_probe = json.loads(args.conversion_probe.read_text())
    closure_conversion_probe = json.loads(args.closure_conversion_probe.read_text())
    closure_s3_backup = json.loads(args.closure_s3_backup_receipt.read_text())
    dependencies = dependency_index["externalPackageDependencies"]
    vfx_references = [reference for reference in dependencies if reference.startswith("/Game/Strash/VFX/")]
    event_references = [
        reference
        for reference in dependencies
        if reference not in vfx_references and ("/PN020/" in reference or "/PN020_" in reference or "/VO_PN020/" in reference)
    ]
    other_external_dependencies = [reference for reference in dependencies if reference not in vfx_references and reference not in event_references]
    supporting_generic_sfx = [reference for reference in other_external_dependencies if reference.startswith("/Game/WwiseAudio/Events/EFCT_Work_Unit/")]
    validate_vfx_source_manifest(vfx_source_manifest, args.raw_vfx, vfx_references)
    pak0 = next(row for row in pak_manifest["files"] if Path(row["path"]).name == "pakchunk0-WindowsClient.pak")
    if vfx_source_manifest["sourcePak"]["sha256"] != pak0["sha256"] or vfx_source_manifest["sourcePak"]["bytes"] != pak0["bytes"]:
        raise ValueError("direct VFX source manifest does not point to the verified pakchunk0 mirror")
    if vfx_closure_manifest["sourcePak"]["sha256"] != pak0["sha256"] or vfx_closure_manifest["sourcePak"]["bytes"] != pak0["bytes"]:
        raise ValueError("VFX dependency closure manifest does not point to the verified pakchunk0 mirror")
    if vfx_closure_manifest["roots"]["referenceCount"] != 17:
        raise ValueError("VFX dependency closure does not retain the exact 17 direct roots")
    if vfx_closure_manifest["firstLevel"]["referenceOccurrences"] != 229 or vfx_closure_manifest["firstLevel"]["uniqueReferences"] != 138:
        raise ValueError("VFX dependency closure first-level counts differ from the audited direct packages")
    for row in vfx_closure_manifest["files"]:
        path = Path(row["absolutePath"])
        if not path.is_file() or path.stat().st_size != row["bytes"] or sha256(path) != row["sha256"]:
            raise ValueError(f"VFX dependency closure hash drift: {path}")
    if conversion_probe["packageCount"] != 17 or conversion_probe["noExportableOutputCount"] != 17:
        raise ValueError("preserved UModel probe does not establish 17/17 no-exportable-output results")
    if closure_conversion_probe["packageCount"] != 17 or closure_conversion_probe["noExportableOutputCount"] != 17:
        raise ValueError("closure-backed UModel probe does not establish 17/17 no-exportable-output results")
    closure_root = str(args.vfx_closure_manifest.resolve().parent)
    if (closure_s3_backup.get("schema") != "ggd-intake-backup-receipt@1"
            or closure_s3_backup.get("source") != closure_root
            or not closure_s3_backup.get("fullGetVerified")
            or not closure_s3_backup.get("allMemberSha256Verified")
            or not closure_s3_backup.get("localUnchanged")
            or not str(closure_s3_backup.get("s3Uri", "")).startswith(
                "s3://ggd-390630837668-ap-east-2-an/legacy/game-intakes/infinity-strash-popp-vfx-dependency-closure-v1/"
            )):
        raise ValueError("VFX dependency closure S3 backup receipt is absent, unverified or outside the authorized prefix")
    vfx_rows = build_vfx_rows(vfx_references, args.raw_vfx, conversion_probe, closure_conversion_probe)
    event_rows, candidates = build_event_rows(event_references, args.raw_events, audio_index)
    receipt = {
        "schema": "ggd.infinity-strash-popp-vfx-events@1",
        "heroId": "b2-popp",
        "sourceId": "steam-infinity-strash-primary-paks-build-local-20240328",
        "sourceAvailability": {
            "windowsShare": "not-used-by-this-build-local-byte-verified-pak-mirror-is-the-input",
            "preservedLocalPakMirror": proof(args.pak_manifest),
            "directVfxExtractRoot": str(args.raw_vfx.resolve()),
            "directVfxSourceManifest": proof(args.vfx_source_manifest),
            "dependencyClosureRoot": closure_root,
            "dependencyClosureS3Backup": {
                **proof(args.closure_s3_backup_receipt),
                "s3Uri": closure_s3_backup["s3Uri"],
                "manifestUri": closure_s3_backup["manifestUri"],
                "archiveSha256": closure_s3_backup["archiveSha256"],
                "archiveBytes": closure_s3_backup["archiveBytes"],
                "fileCount": closure_s3_backup["fileCount"],
                "fullGetVerified": True,
                "allMemberSha256Verified": True,
            },
            "eventExtractRoot": str(args.raw_events.resolve()),
        },
        "inputs": {
            "dependencyIndex": proof(args.dependency_index),
            "audioExtractionIndex": proof(args.audio_index),
            "conversionProbe": proof(args.conversion_probe),
            "vfxDependencyClosureManifest": proof(args.vfx_closure_manifest),
            "closureConversionProbe": proof(args.closure_conversion_probe),
        },
        "summary": {
            "vfxReferences": len(vfx_rows),
            "vfxDirectPairsAcquired": sum(row["directPackageState"].startswith("acquired") for row in vfx_rows),
            "vfxConverted": 0,
            "vfxFirstLevelDependencyReferenceOccurrences": vfx_closure_manifest["firstLevel"]["referenceOccurrences"],
            "vfxFirstLevelUniqueDependencyReferences": vfx_closure_manifest["firstLevel"]["uniqueReferences"],
            "vfxClosurePackageReferencesDiscovered": vfx_closure_manifest["summary"]["referencesDiscovered"],
            "vfxClosurePackageReferencesAcquired": vfx_closure_manifest["summary"]["referencesAcquired"],
            "vfxClosurePackageReferencesMissing": vfx_closure_manifest["summary"]["referencesMissing"],
            "vfxNonScriptPackageDependencyClosureComplete": vfx_closure_manifest["states"]["nonScriptPackageDependencyClosureComplete"],
            "eventReferences": len(event_rows),
            "eventPairsAcquired": sum(row["packageState"].startswith("acquired") for row in event_rows),
            "audioReviewCandidates": len(candidates),
            "audioReviewApproved": 0,
            "runtimeBindingsCreated": 0,
            "otherExternalReferences": len(other_external_dependencies),
            "supportingGenericSfxReferences": len(supporting_generic_sfx),
        },
        "vfx": vfx_rows,
        "events": event_rows,
        "additionalExternalDependencies": {
            "references": other_external_dependencies,
            "supportingGenericSfxReferences": supporting_generic_sfx,
            "state": "retained-reference-only-not-part-of-the-41-pn020-direct-event-audit",
        },
        "runtimeSelectable": False,
        "productionDeployed": False,
    }
    queue = {
        "schema": "ggd.popp-event-audio-review-queue@1",
        "heroId": "b2-popp",
        "runtimeSelectable": False,
        "automaticBindingAllowed": False,
        "candidates": candidates,
    }
    queue["queueSha256"] = hashlib.sha256(json.dumps(queue, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    outputs = {
        "receipt.json": json.dumps(receipt, ensure_ascii=False, indent=2) + "\n",
        "README.md": render_markdown(receipt),
        "event-audio-review-queue.json": json.dumps(queue, ensure_ascii=False, indent=2) + "\n",
        "event-audio-review.html": render_html(queue),
        "dependency-closure-receipt.json": json.dumps(vfx_closure_manifest, ensure_ascii=False, indent=2) + "\n",
    }
    if args.check:
        drift = [name for name, content in outputs.items() if not (args.output / name).is_file() or (args.output / name).read_text() != content]
        if drift:
            raise SystemExit("generated output drift: " + ", ".join(drift))
        print(json.dumps({"status": "current", **receipt["summary"]}, ensure_ascii=False))
        return 0
    args.output.mkdir(parents=True, exist_ok=True)
    for name, content in outputs.items():
        (args.output / name).write_text(content)
    print(json.dumps({"output": str(args.output), **receipt["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

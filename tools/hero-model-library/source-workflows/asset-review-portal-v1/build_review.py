#!/usr/bin/env python3
"""Build one owner-facing queue for pending audio and motion review candidates."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[4]
LIBRARY = ROOT / "materials/hero-model-library"
POPP = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/event-audio-review-queue.json"
PALWORLD = LIBRARY / "palworld/review/palworld-av-review.json"
BORROWED = LIBRARY / "motion-review/borrowed-motion-review.json"
JUMPFORCE = LIBRARY / "source-inventories/jumpforce-assets-v2/listening-review-groups.json"
OUTPUT_DIR = LIBRARY / "review/asset-review-portal-v1"
OUTPUT_JSON = OUTPUT_DIR / "review-queue.json"
OUTPUT_SCHEMA = OUTPUT_DIR / "review-decision.schema.json"
OUTPUT_HTML = ROOT / "apps/client/public/asset-review-portal.html"
AUDIO_SUFFIXES = {".wav", ".ogg", ".mp3", ".flac", ".m4a"}


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def git_evidence(path: Path) -> dict[str, Any]:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def local_file(path: Path, expected: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.is_absolute() or not path.is_file():
        raise ValueError(f"review media is not an existing absolute file: {path}")
    record = {"absolutePath": str(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
    if expected:
        if record["bytes"] != expected["bytes"] or record["sha256"] != expected["sha256"]:
            raise ValueError(f"review media changed: {path}")
    return record


def first_group_sample(directory: Path) -> Path:
    if not directory.is_absolute() or not directory.is_dir():
        raise ValueError(f"JUMP FORCE review group is unavailable: {directory}")
    candidates = sorted(
        (path for path in directory.rglob("*") if path.is_file() and path.suffix.lower() in AUDIO_SUFFIXES),
        key=lambda path: path.relative_to(directory).as_posix(),
    )
    if not candidates:
        raise ValueError(f"JUMP FORCE review group has no playable audio: {directory}")
    return candidates[0]


def popp_candidates(document: dict[str, Any]) -> list[dict[str, Any]]:
    if document.get("schema") != "ggd.popp-event-audio-review-queue@1":
        raise ValueError("unexpected Popp review schema")
    if document.get("automaticBindingAllowed") is not False or document.get("runtimeSelectable") is not False:
        raise ValueError("Popp queue overclaims runtime authority")
    rows = []
    for source in document["candidates"]:
        if source.get("reviewDecision") is not None or source.get("runtimeSelectable") is not False:
            raise ValueError(f"Popp candidate is not pending and unbound: {source.get('candidateId')}")
        file = local_file(Path(source["audio"]["absolutePath"]), source["audio"])
        rows.append({
            "candidateId": "popp:" + source["candidateId"],
            "sourceKind": "popp-event-audio",
            "sourceId": "steam-infinity-strash-popp-priority-audio-build-local-20240328",
            "heroId": document["heroId"],
            "characterNameZh": "何布／波普",
            "workZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
            "nativeCharacterId": "PN020",
            "category": source["sourceCategory"],
            "language": source["reportedLocales"],
            "languageConfidence": "source-locale-label-only",
            "speakerConfidence": "unverified",
            "eventMeaningConfidence": "unverified",
            "sourceLabel": source["sourceEventReference"],
            "eventCandidates": [source["sourceEventReference"]],
            "approvalScope": "event-binding-proposal",
            "file": file,
            "sourceEvidence": {
                "eventReference": source["sourceEventReference"],
                "resolvedEventPaths": source["resolvedEventPaths"],
                "mediaRef": source["mediaRef"],
                "durationSeconds": source["audio"]["durationSeconds"],
                "sampleRate": source["audio"]["sampleRate"],
                "channels": source["audio"]["channels"],
            },
            "gaps": ["speaker-unverified", "language-not-listening-verified", "event-meaning-unverified"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    return rows


def palworld_candidates(document: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if document.get("schema") != "ggd.palworld-av-review@1":
        raise ValueError("unexpected Palworld review schema")
    if document["summary"].get("approvedCandidateCount") != 0 or document["summary"].get("runtimeSelectableCandidateCount") != 0:
        raise ValueError("Palworld queue overclaims approval or runtime authority")
    characters = {row["characterId"]: row for row in document["characters"]}
    audio = []
    for source in document["audioCandidates"]:
        character = characters[source["characterId"]]
        expected = {"bytes": source["file"]["bytes"], "sha256": source["file"]["sha256"]}
        file = local_file(Path(source["file"]["path"]), expected)
        audio.append({
            "candidateId": "palworld:" + source["candidateId"],
            "sourceKind": "palworld-creature-cry",
            "sourceId": "palworld-gamevault-public-character-media",
            "sourceUrl": source["sourceUrl"],
            "heroId": source["heroId"],
            "characterNameZh": character["nameZh"],
            "workZh": "幻獸帕魯／Palworld",
            "nativeCharacterId": character["nativeCharacterCode"],
            "category": [source["category"]],
            "language": [source["language"]],
            "languageConfidence": "not-applicable-nonverbal",
            "speakerConfidence": "unverified-character-attribution",
            "eventMeaningConfidence": "source-emotion-label-only",
            "sourceLabel": source["sourceLabel"],
            "eventCandidates": source["suggestedGenericEvents"],
            "approvalScope": "generic-event-suggestion",
            "file": file,
            "sourceEvidence": {"labelProvenance": source["sourceLabelProvenance"]},
            "gaps": ["no-original-wwise-event-map", "no-skill-specific-binding", "speaker-unverified"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    motions = []
    for source in document["motionCandidates"]:
        character = characters[source["characterId"]]
        event_candidates = source["suggestedSkillSlots"] or ["generic-" + source["semanticState"]]
        motions.append({
            "candidateId": "palworld:" + source["candidateId"],
            "sourceKind": "palworld-native-motion-semantic",
            "sourceId": "palworld-converted-source-component",
            "heroId": source["heroId"],
            "characterNameZh": character["nameZh"],
            "workZh": "幻獸帕魯／Palworld",
            "nativeCharacterId": character["nativeCharacterCode"],
            "motionKind": "native",
            "semanticState": source["semanticState"],
            "nativeClip": source["nativeClip"],
            "nativeClipDurationSeconds": source["nativeClipDurationSeconds"],
            "modelKey": source["modelKey"],
            "modelDocument": source["modelDocument"],
            "modelGlb": source["modelGlb"],
            "eventCandidates": event_candidates,
            "eventMeaningConfidence": "semantic-state-only-no-original-skill-event-map",
            "approvalScope": "motion-event-suggestion",
            "presentation": {"mode": "native-clip"},
            "gaps": ["skill-event-map-unavailable", "source-vfx-unavailable", "skill-sfx-unavailable"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    return audio, motions


def jumpforce_candidates(document: dict[str, Any]) -> list[dict[str, Any]]:
    if document.get("schema") != "ggd.jumpforce-audio-listening-review-groups@1":
        raise ValueError("unexpected JUMP FORCE review schema")
    if document["counts"].get("approvedForRuntimeBinding") != 0:
        raise ValueError("JUMP FORCE queue overclaims runtime approval")
    rows = []
    for source in document["groups"]:
        directory = Path(source["absolutePath"])
        sample = first_group_sample(directory)
        rows.append({
            "candidateId": "jumpforce:" + source["reviewId"],
            "sourceKind": "jumpforce-group-identity-sample",
            "sourceId": source["sourceId"],
            "heroId": None,
            "characterNameZh": source["characterGroupLabel"],
            "workZh": "JUMP FORCE／JUMP 大亂鬥",
            "nativeCharacterId": source.get("nativeCharacterId"),
            "category": sorted(source["categoryCounts"]),
            "language": ["unverified"],
            "languageConfidence": "unreviewed",
            "speakerConfidence": "group-identity-only",
            "eventMeaningConfidence": "none",
            "sourceLabel": sample.relative_to(directory).as_posix(),
            "eventCandidates": [],
            "approvalScope": "group-sample-classification-only",
            "file": local_file(sample),
            "sourceEvidence": {
                "groupId": source["groupId"],
                "groupAbsolutePath": str(directory),
                "groupFileCount": source["fileCount"],
                "categoryCounts": source["categoryCounts"],
                "identityEvidence": source["identityEvidence"],
                "identityVerifiedAtGroupLevel": source["identityVerifiedAtGroupLevel"],
                "sampleSelection": "lexicographically-first-playable-file; sample approval has no event-binding authority",
            },
            "gaps": ["per-file-speaker-unreviewed", "language-unreviewed", "event-binding-unreviewed", "group-not-expanded-to-event-pairs"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    return rows


def borrowed_candidates(document: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    if document.get("schema") != "ggd.borrowed-motion-review@1":
        raise ValueError("unexpected borrowed-motion review schema")
    resolved = document.get("resolvedCandidates", [])
    if document["summary"].get("pendingDecisionCount") != len(document["candidates"]):
        raise ValueError("borrowed-motion pending count disagrees with queue")
    if document["summary"].get("resolvedCandidateCount", 0) != len(resolved):
        raise ValueError("borrowed-motion resolved count disagrees with receipts")
    if document["summary"].get("runtimeBindingsChanged") != sum(bool(row.get("runtimeBindingChanged")) for row in resolved):
        raise ValueError("borrowed-motion runtime binding count disagrees with receipts")
    candidates = []
    for source in document["candidates"]:
        if source["review"].get("decision") is not None or source["review"].get("runtimeBindingChanged") is not False:
            raise ValueError(f"borrowed candidate is not pending and unbound: {source['id']}")
        candidates.append({
            "candidateId": "borrowed:" + source["id"],
            "sourceKind": "borrowed-or-death-substitution-motion",
            "sourceId": source["source"]["modelKey"],
            "heroId": source["target"]["heroId"],
            "characterNameZh": source["target"]["heroNameZh"],
            "workZh": source["target"]["workZh"],
            "nativeCharacterId": source["source"].get("nativeCharacterId"),
            "motionKind": source["motionKind"],
            "semanticState": "death" if source["deathSubstitutionMode"] != "none" else source["clip"]["state"],
            "nativeClip": source["clip"]["embeddedName"],
            "modelKey": source["target"]["modelKey"],
            "modelDocument": source["target"]["modelDocumentEvidence"],
            "eventCandidates": ["death"] if source["deathSubstitutionMode"] != "none" else [source["clip"]["state"]],
            "eventMeaningConfidence": "explicit-substitution-candidate",
            "approvalScope": "motion-event-suggestion",
            "presentation": source["presentation"],
            "skeletonCompatibility": source["skeletonCompatibility"],
            "validationEvidence": source["validationEvidence"],
            "gaps": source["blockers"],
            "decision": "pending",
            "runtimeSelectable": False,
            "runtimeBindingChanged": False,
        })
    blocked = []
    for source in document["blockedLeads"]:
        blocked.append({
            "candidateId": "borrowed-blocked:" + source["id"],
            "sourceKind": "blocked-motion-lead",
            "motionKind": source["motionKind"],
            "sourceCharacter": source["sourceHero"],
            "sourceModel": source["sourceModel"],
            "targetCharacter": source["targetHero"],
            "targetModel": source["targetModel"],
            "clips": source["clips"],
            "skeletonCompatibility": source["skeletonCompatibility"],
            "validationEvidence": source["validationEvidence"],
            "gaps": source["blockers"],
            "decisionAvailable": False,
            "runtimeSelectable": False,
        })
    return candidates, blocked


def build_contract() -> dict[str, Any]:
    source_paths = [POPP, PALWORLD, BORROWED, JUMPFORCE]
    popp = read_json(POPP)
    palworld = read_json(PALWORLD)
    borrowed = read_json(BORROWED)
    jumpforce = read_json(JUMPFORCE)
    pal_audio, pal_motion = palworld_candidates(palworld)
    borrowed_motion, blocked = borrowed_candidates(borrowed)
    audio = popp_candidates(popp) + pal_audio + jumpforce_candidates(jumpforce)
    motions = pal_motion + borrowed_motion
    candidate_ids = [row["candidateId"] for row in audio + motions]
    if len(candidate_ids) != len(set(candidate_ids)):
        raise ValueError("duplicate review candidate id")
    if any(row["decision"] != "pending" or row["runtimeSelectable"] or row["runtimeBindingChanged"] for row in audio + motions):
        raise ValueError("generated queue must remain pending and runtime inert")
    source_inputs = [git_evidence(path) for path in source_paths]
    fingerprint = hashlib.sha256(canonical_json({
        "inputs": source_inputs,
        "audio": [(row["candidateId"], row["file"]["sha256"]) for row in audio],
        "motion": [(row["candidateId"], row["modelKey"], row["nativeClip"]) for row in motions],
        "blocked": [row["candidateId"] for row in blocked],
    }).encode()).hexdigest()
    return {
        "schema": "ggd.asset-review-portal@1",
        "sourceFingerprint": fingerprint,
        "sourceInputs": source_inputs,
        "policy": {
            "ownerApprovalRequiredBeforeRuntimeBinding": True,
            "defaultDecision": "pending",
            "runtimeMutationAllowed": False,
            "jumpForceGroupSampleApprovalDoesNotAuthorizeEventBinding": True,
            "borrowedAndDeathSubstitutionMotionsRequirePerCandidateApproval": True,
            "resolvedReceiptCandidatesAreNotRequeued": True,
        },
        "summary": {
            "audioCandidateCount": len(audio),
            "poppEventAudioCandidateCount": len(popp["candidates"]),
            "palworldCreatureCryCandidateCount": len(pal_audio),
            "jumpForceGroupSampleCount": len(jumpforce["groups"]),
            "motionCandidateCount": len(motions),
            "palworldMotionCandidateCount": len(pal_motion),
            "borrowedOrDeathSubstitutionCandidateCount": len(borrowed_motion),
            "blockedMotionLeadCount": len(blocked),
            "pendingDecisionCount": len(audio) + len(motions),
            "approvedDecisionCount": 0,
            "rejectedDecisionCount": 0,
            "runtimeBindingsChanged": 0,
            "productionDeployedAssets": 0,
        },
        "audioCandidates": audio,
        "motionCandidates": motions,
        "blockedMotionLeads": blocked,
    }


def decision_schema(contract: dict[str, Any]) -> dict[str, Any]:
    ids = [row["candidateId"] for row in contract["audioCandidates"] + contract["motionCandidates"]]
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": "https://ggd.local/schema/asset-review-decisions-v1.json",
        "title": "GGD pending asset review decisions",
        "type": "object",
        "additionalProperties": False,
        "required": ["schema", "sourceFingerprint", "reviewer", "reviewedAt", "runtimeMutationAllowed", "decisions"],
        "properties": {
            "schema": {"const": "ggd.asset-review-decisions@1"},
            "sourceFingerprint": {"const": contract["sourceFingerprint"]},
            "reviewer": {"type": "string", "minLength": 1},
            "reviewedAt": {"type": "string", "format": "date-time"},
            "runtimeMutationAllowed": {"const": False},
            "decisions": {
                "type": "array", "minItems": len(ids), "maxItems": len(ids),
                "items": {
                    "type": "object", "additionalProperties": False,
                    "required": ["candidateId", "decision", "approvedBindings", "note", "runtimeBindingAuthorized"],
                    "properties": {
                        "candidateId": {"enum": ids},
                        "decision": {"enum": ["pending", "approve", "reject"]},
                        "approvedBindings": {"type": "array", "items": {"type": "string"}, "uniqueItems": True},
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
<meta name="robots" content="noindex"><title>GGD 素材逐項審查中心</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--ok:#8bd49c;--bad:#ff8b8b}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}header{{position:sticky;top:0;z-index:6;padding:12px 18px;background:#08131ef2;border-bottom:1px solid var(--line)}}main{{max-width:1440px;margin:auto;padding:18px}}h1{{font-size:20px;margin:0}}h2{{margin:28px 0 8px}}.dim{{color:var(--dim)}}.warn{{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}}.toolbar{{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}}input,select,textarea,button,.button-link{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 9px;border-radius:7px}}input[type=search]{{min-width:300px}}button,.button-link{{cursor:pointer;text-decoration:none}}button:hover,.button-link:hover{{border-color:var(--accent)}}.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:12px}}.card{{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px;min-width:0}}.card.approve{{border-color:var(--ok)}}.card.reject{{border-color:var(--bad)}}.card.pending{{border-color:#6f7f91}}audio{{width:100%}}code{{font-size:11px;word-break:break-all}}.tags{{display:flex;gap:5px;flex-wrap:wrap}}.tag{{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 7px}}dl{{display:grid;grid-template-columns:105px 1fr;gap:3px 8px}}dt{{color:var(--dim)}}dd{{margin:0;min-width:0;word-break:break-word}}textarea{{width:100%;min-height:55px}}.buttons{{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}}.viewer{{position:relative;height:430px;border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#05080c}}iframe{{width:100%;height:100%;border:0}}.viewer-status{{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;background:#071019e8;color:var(--dim)}}.viewer-status.error{{color:var(--bad);background:#210d10ee}}.viewer-status[hidden]{{display:none}}details{{margin-top:8px}}li{{margin:4px 0}}.hidden{{display:none!important}}.count{{font-variant-numeric:tabular-nums}}
</style></head><body><header><h1>GGD 素材逐項審查中心</h1><div class="dim">資料指紋 <code>{fingerprint}</code> · 所有項目預設 pending · 匯出決定不會修改 runtime</div></header>
<main><div class="warn">音效／語音與尚在 pending 的動作候選必須逐項核准。JUMP FORCE 現階段只有角色群組身份，所列音檔只是固定抽樣，核准只代表群組分類審查，不能授權技能事件綁定。已有 owner 決定與 runtime 收據的項目不會重新排入 pending。</div>
<div class="toolbar"><input id="search" type="search" placeholder="搜尋角色、來源、事件、SHA"><select id="kind"><option value="">全部來源</option><option value="popp">波普音訊</option><option value="palworld">帕魯</option><option value="jumpforce">JUMP FORCE</option><option value="borrowed">借用／死亡替代</option></select><select id="status"><option value="">全部裁決</option><option value="pending">pending</option><option value="approve">approve</option><option value="reject">reject</option></select><span id="visible" class="dim count"></span></div>
<h2>一、尚未核准音效／語音 <span id="audioCount" class="dim count"></span></h2><div id="audio" class="grid"></div>
<h2>二、原生／借用／死亡替代動作 <span id="motionCount" class="dim count"></span></h2><div id="motion" class="grid"></div>
<h2>三、尚不可播放的動作線索</h2><div id="blocked" class="grid"></div>
<h2>四、匯出逐項裁決</h2><p id="decisionStatus" class="dim"></p><div class="toolbar"><input id="reviewer" value="owner" placeholder="審查者"><button id="export">下載 asset-review-decisions.json</button><button id="clear">清除本機草稿</button></div></main>
<script id="contract" type="application/json">{data}</script><script>
const D=JSON.parse(document.getElementById('contract').textContent);const storageKey='ggd.asset-review-portal:'+D.sourceFingerprint;let draft=JSON.parse(localStorage.getItem(storageKey)||'{{"decisions":{{}}}}');draft.decisions??={{}};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c]));const all=[...D.audioCandidates,...D.motionCandidates];
const state=id=>draft.decisions[id]??{{decision:'pending',approvedBindings:[],note:''}};function persist(){{localStorage.setItem(storageKey,JSON.stringify(draft));applyFilters();renderStatus()}}
function controls(c){{const s=state(c.candidateId),bindings=c.eventCandidates||[];return `<div class="buttons"><select data-decision="${{esc(c.candidateId)}}"><option value="pending" ${{s.decision==='pending'?'selected':''}}>pending</option><option value="approve" ${{s.decision==='approve'?'selected':''}}>approve</option><option value="reject" ${{s.decision==='reject'?'selected':''}}>reject</option></select></div><div class="buttons">${{bindings.map(b=>`<label><input type="checkbox" data-binding="${{esc(c.candidateId)}}" value="${{esc(b)}}" ${{s.approvedBindings.includes(b)?'checked':''}}> ${{esc(b)}}</label>`).join('')||'<span class="dim">沒有事件綁定候選</span>'}}</div><textarea data-note="${{esc(c.candidateId)}}" placeholder="此項備註">${{esc(s.note)}}</textarea>`}}
function evidence(c){{return `<dl><dt>來源</dt><dd>${{esc(c.sourceId)}}</dd><dt>作品／角色</dt><dd>${{esc(c.workZh)}} · ${{esc(c.characterNameZh)}} · ${{esc(c.heroId||'尚未對應 hero ID')}}</dd><dt>原生 ID</dt><dd>${{esc(c.nativeCharacterId||'待確認')}}</dd>${{c.file?`<dt>本機</dt><dd><code>${{esc(c.file.absolutePath)}}</code></dd><dt>SHA-256</dt><dd><code>${{esc(c.file.sha256)}}</code></dd>`:''}}</dl><details><summary>缺口與來源細節</summary><ul>${{(c.gaps||[]).map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul><pre><code>${{esc(JSON.stringify(c.sourceEvidence||c.validationEvidence||{{}},null,2))}}</code></pre></details>`}}
const audio=document.getElementById('audio');for(const c of D.audioCandidates){{const card=document.createElement('article');card.className='card '+state(c.candidateId).decision;card.dataset.candidate=c.candidateId;card.dataset.search=JSON.stringify(c).toLowerCase();card.innerHTML=`<h3>${{esc(c.characterNameZh)}} · ${{esc(c.sourceLabel)}}</h3><div class="tags"><span class="tag">${{esc(c.sourceKind)}}</span><span class="tag">語言 ${{esc(c.languageConfidence)}}</span><span class="tag">說話者 ${{esc(c.speakerConfidence)}}</span><span class="tag">事件 ${{esc(c.eventMeaningConfidence)}}</span></div><audio controls preload="none" src="http://127.0.0.1:8767/media/${{encodeURIComponent(c.candidateId)}}"></audio>${{evidence(c)}}${{controls(c)}}`;audio.append(card)}}
function audition(c){{return `/champion-model-audition.html?hud=0&cam=combat&live=1&model=${{encodeURIComponent(c.modelKey)}}&champion=${{encodeURIComponent(c.heroId)}}&clip=${{encodeURIComponent(c.semanticState)}}`;}}
const motion=document.getElementById('motion');for(const c of D.motionCandidates){{const card=document.createElement('article');card.className='card '+state(c.candidateId).decision;card.dataset.candidate=c.candidateId;card.dataset.search=JSON.stringify(c).toLowerCase();const url=audition(c);card.innerHTML=`<h3>${{esc(c.characterNameZh)}} · ${{esc(c.semanticState)}} → <code>${{esc(c.nativeClip)}}</code></h3><div class="tags"><span class="tag">${{esc(c.motionKind)}}</span><span class="tag">${{esc(c.presentation.mode)}}</span><span class="tag">事件 ${{esc(c.eventMeaningConfidence)}}</span></div><div class="viewer"><iframe loading="lazy" title="${{esc(c.characterNameZh)}} ${{esc(c.semanticState)}}"></iframe><div class="viewer-status">載入模型與動作中…</div></div><div class="buttons"><button data-play>重新播放</button>${{c.presentation.mode==='hurt-ascend-fade'?'<button data-rise>播放受傷＋升天淡出</button>':''}}<a class="button-link" href="${{url}}" target="_blank" rel="noopener">全頁查看</a></div>${{evidence(c)}}${{controls(c)}}`;const frame=card.querySelector('iframe'),viewer=card.querySelector('.viewer'),status=card.querySelector('.viewer-status');let generation=0,animation=null;const load=async(reload=false)=>{{const mine=++generation;animation?.cancel();status.hidden=false;status.classList.remove('error');status.textContent='載入模型與動作中…';if(reload||frame.getAttribute('src')!==url)frame.src=url;for(let i=0;i<450;i++){{if(mine!==generation)return false;try{{const child=frame.contentWindow;if(child?.__settled===true){{const p=child.__probe?.()||{{}};if(p.error||!(Number(p.triangles)>0))throw new Error(p.error||'畫面上沒有可見三角形');status.hidden=true;return true}}}}catch(e){{if(String(e).includes('cross-origin')){{status.textContent='請從 Vite 的 127.0.0.1:5173 開啟此頁，以檢查畫面。';status.classList.add('error');return false}}if(i>5){{status.textContent='載入失敗：'+e;status.classList.add('error');return false}}}}await new Promise(r=>setTimeout(r,100))}}status.textContent='載入逾時；請重新播放或全頁查看。';status.classList.add('error');return false}};card.querySelector('[data-play]').onclick=()=>void load(true);const rise=card.querySelector('[data-rise]');if(rise)rise.onclick=async()=>{{if(!await load(true))return;animation=viewer.animate([{{opacity:1,transform:'translateY(0)',offset:0}},{{opacity:1,transform:'translateY(0)',offset:c.presentation.fadeStartRatio}},{{opacity:.08,transform:`translateY(${{c.presentation.translateYPixels}}px)`,offset:1}}],{{duration:c.presentation.durationMs,easing:'ease-in',fill:'forwards'}})}};motion.append(card);void load(false)}}
const blocked=document.getElementById('blocked');for(const c of D.blockedMotionLeads){{const card=document.createElement('article');card.className='card';card.dataset.search=JSON.stringify(c).toLowerCase();card.innerHTML=`<h3>${{esc(c.targetCharacter)}} ← ${{esc(c.sourceCharacter)}}</h3><div class="tags"><span class="tag">${{esc(c.motionKind)}}</span><span class="tag">不可裁決</span></div><p>${{esc(c.clips.join('、'))}}</p><ul>${{c.gaps.map(x=>`<li>${{esc(x)}}</li>`).join('')}}</ul>`;blocked.append(card)}}
document.addEventListener('change',e=>{{const d=e.target.closest('[data-decision]');if(d){{const id=d.dataset.decision,s=state(id);s.decision=d.value;draft.decisions[id]=s;persist()}}const b=e.target.closest('[data-binding]');if(b){{const id=b.dataset.binding,s=state(id);s.approvedBindings=[...document.querySelectorAll(`[data-binding="${{CSS.escape(id)}}"]:checked`)].map(x=>x.value);draft.decisions[id]=s;persist()}}}});document.addEventListener('input',e=>{{const n=e.target.closest('[data-note]');if(n){{const id=n.dataset.note,s=state(id);s.note=n.value;draft.decisions[id]=s;persist()}}if(e.target.id==='search')applyFilters()}});
function applyFilters(){{const q=document.getElementById('search').value.toLowerCase(),kind=document.getElementById('kind').value,status=document.getElementById('status').value;let visible=0;for(const card of document.querySelectorAll('[data-candidate]')){{const id=card.dataset.candidate,ok=(!q||card.dataset.search.includes(q))&&(!kind||id.startsWith(kind+':'))&&(!status||state(id).decision===status);card.classList.toggle('hidden',!ok);card.classList.remove('pending','approve','reject');card.classList.add(state(id).decision);if(ok)visible++}}document.getElementById('visible').textContent=`顯示 ${{visible}}/${{all.length}}`;document.getElementById('audioCount').textContent=`(${{D.audioCandidates.length}})`;document.getElementById('motionCount').textContent=`(${{D.motionCandidates.length}})`}}
function renderStatus(){{const counts={{pending:0,approve:0,reject:0}};for(const c of all)counts[state(c.candidateId).decision]++;document.getElementById('decisionStatus').textContent=`pending ${{counts.pending}} · approve ${{counts.approve}} · reject ${{counts.reject}}；所有匯出列的 runtimeBindingAuthorized 都固定為 false。`}}
document.getElementById('kind').onchange=applyFilters;document.getElementById('status').onchange=applyFilters;document.getElementById('export').onclick=()=>{{const decisions=all.map(c=>{{const s=state(c.candidateId);return {{candidateId:c.candidateId,decision:s.decision,approvedBindings:s.decision==='approve'?s.approvedBindings:[],note:s.note||'',runtimeBindingAuthorized:false}}}});const bad=decisions.find(d=>d.decision==='approve'&&!d.approvedBindings.length&&all.find(c=>c.candidateId===d.candidateId).approvalScope!=='group-sample-classification-only');if(bad)return alert('核准候選必須選擇事件／動作綁定：'+bad.candidateId);const receipt={{schema:'ggd.asset-review-decisions@1',sourceFingerprint:D.sourceFingerprint,reviewer:document.getElementById('reviewer').value.trim()||'owner',reviewedAt:new Date().toISOString(),runtimeMutationAllowed:false,decisions}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)+'\\n'],{{type:'application/json'}}));a.download='asset-review-decisions.json';a.click();URL.revokeObjectURL(a.href)}};document.getElementById('clear').onclick=()=>{{localStorage.removeItem(storageKey);location.reload()}};applyFilters();renderStatus();window.__assetReviewPortal={{contract:D,getDraft:()=>JSON.parse(JSON.stringify(draft))}};
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
            raise SystemExit("stale generated review files: " + ", ".join(stale))
    else:
        for path, value in generated.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(value, encoding="utf-8")
    contract = json.loads(generated[OUTPUT_JSON])
    print(json.dumps(contract["summary"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

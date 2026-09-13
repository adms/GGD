#!/usr/bin/env python3
"""Build the source-derived Popp weapon/death review contract and browser page."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
LIBRARY = ROOT / "materials/hero-model-library"
OUTPUT_JSON = LIBRARY / "infinity-strash/popp-integration-review.json"
OUTPUT_HTML = ROOT / "apps/client/public/popp-integration-review.html"
OUTPUT_ASSET_DIR = ROOT / "apps/client/public/review-assets/popp-pn020"
DECISION_RECEIPT = LIBRARY / "priority-evidence/infinity-strash-popp-review-decision/receipt.json"
HERO_ID = "b2-popp"

STAFFS = (
    ("Magikaru", "infinity-strash-popp-pn020-00-magikaru-native-v2"),
    ("Mahouno", "infinity-strash-popp-pn020-01-mahouno-native-v1"),
    ("Kagayaki", "infinity-strash-popp-pn020-02-kagayaki-native-v1"),
)

ACCEPTANCE = {
    "Magikaru": LIBRARY / "priority-evidence/infinity-strash-popp-magikaru-v2/runtime-candidates-v4/popp-pn020-00/acceptance-summary.json",
    "Mahouno": LIBRARY / "priority-evidence/infinity-strash-popp-alternate-staffs-v3/popp-pn020-01-mahouno/acceptance-summary.json",
    "Kagayaki": LIBRARY / "priority-evidence/infinity-strash-popp-alternate-staffs-v3/popp-pn020-02-kagayaki/acceptance-summary.json",
}

CONTACT_SHEETS = {
    "Magikaru": LIBRARY / "priority-evidence/infinity-strash-popp-magikaru-v2/runtime-candidates-v4/popp-pn020-00/contact-sheet.png",
    "Mahouno": LIBRARY / "priority-evidence/infinity-strash-popp-alternate-staffs-v3/popp-pn020-01-mahouno/contact-sheet.png",
    "Kagayaki": LIBRARY / "priority-evidence/infinity-strash-popp-alternate-staffs-v3/popp-pn020-02-kagayaki/contact-sheet.png",
}


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def file_evidence(path: Path) -> dict:
    return {
        "gitPath": path.relative_to(ROOT).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
    }


def build_contract() -> dict:
    runtime_inputs_path = LIBRARY / "priority-runtime-inputs.json"
    champion_path = ROOT / "content/champions/b2-popp.json"
    voice_index_path = LIBRARY / "voice-index.json"
    dependency_index_path = LIBRARY / "infinity-strash/dependency-index.json"
    runtime_inputs = read_json(runtime_inputs_path)
    champion = read_json(champion_path)
    entries = {row["candidateId"]: row for row in runtime_inputs["entries"] if row["heroId"] == HERO_ID}
    versions = {row["sourceModelKey"]: row for row in champion.get("modelVersions", [])}

    candidates = []
    for staff, candidate_id in STAFFS:
        source = entries[candidate_id]
        runtime_root = Path(source["localRuntimeRoot"])
        model_doc = read_json(runtime_root / "model.json")
        git_model_doc = ROOT / "content/models" / f"{model_doc['id']}.json"
        git_glb = ROOT / "content" / model_doc["glbPath"]
        acceptance_path = ACCEPTANCE[staff]
        acceptance = read_json(acceptance_path)
        contact_sheet_path = CONTACT_SHEETS[staff]
        version = versions[model_doc["id"]]

        assert sha256(runtime_root / "body.glb") == source["sha256"]
        assert sha256(runtime_root / "model.json") == source["documentSha256"]
        assert sha256(git_glb) == source["sha256"]
        assert read_json(git_model_doc) == model_doc
        assert acceptance["automatedValidation"]["currentGgdContractAccepted"] is True
        assert acceptance["automatedValidation"]["khronosErrors"] == 0
        assert acceptance["automatedValidation"]["webglComplete"] is True
        assert acceptance["registration"]["backendDropdownOptionPresentOnFeatureBranch"] is True
        assert version["binarySha256"] == source["sha256"]

        candidates.append({
            "candidateId": candidate_id,
            "staff": staff,
            "nativeCharacterId": source["source"]["character"],
            "sourceConfig": source["source"]["reference"],
            "sourceModelKey": model_doc["id"],
            "registeredModelKey": version["modelKey"],
            "label": source["label"],
            "glb": file_evidence(git_glb),
            "modelDocument": file_evidence(git_model_doc),
            "clipMap": model_doc["clipMap"],
            "nativeAnimationCount": source["nativeAnimationCount"],
            "proceduralAnimationCount": source["proceduralAnimationCount"],
            "validation": {
                "currentGgdContractAccepted": True,
                "khronosErrors": 0,
                "webglImages": acceptance["automatedValidation"]["webglImages"],
                "manualVisualReview": acceptance["manualVisualReview"]["status"],
                "acceptanceEvidence": file_evidence(acceptance_path),
                "reviewContactSheet": {
                    **file_evidence(contact_sheet_path),
                    "publicPath": f"review-assets/popp-pn020/{staff.lower()}-contact-sheet.png",
                    "states": ["idle", "run", "attack", "cast", "hurt", "death"],
                    "samplesPerState": [0, 50, 100],
                    "source": "actual Babylon WebGL glTF playback",
                },
            },
            "backendDropdownOptionPresentOnFeatureBranch": True,
            "productionDeployed": acceptance["registration"]["productionDeployed"],
            "defaultDecision": None,
        })

    assert len(candidates) == 3
    applied_decision = None
    if DECISION_RECEIPT.exists():
        applied_decision = read_json(DECISION_RECEIPT)
        assert applied_decision["schema"] == "ggd.popp-integration-review-decision-receipt@1"
        selected_id = applied_decision["ownerDecision"]["weaponCandidateId"]
        selected = next(row for row in candidates if row["candidateId"] == selected_id)
        assert champion["modelKey"] == selected["registeredModelKey"]
        assert champion.get("modelSelectionMode") == "manual"
        assert applied_decision["selectionAfter"]["modelKey"] == champion["modelKey"]
    else:
        assert champion.get("modelSelectionMode") != "manual" or champion["modelKey"] not in {
            row["registeredModelKey"] for row in candidates
        }, "A prior manual choice must be preserved and reported explicitly"

    voice_index = read_json(voice_index_path)
    audio_groups = [
        row for row in voice_index["groups"]
        if row.get("sourceId") == "steam-infinity-strash-popp-priority-audio-build-local-20240328"
        and ":pn020-" in row["id"]
    ]
    assert {row["id"].rsplit(":", 1)[-1] for row in audio_groups} == {
        "pn020-english_us-voice",
        "pn020-japanese-voice",
        "pn020-unreviewed-voice",
        "pn020-unreviewed-unclassified",
        "pn020-nonlocalized-sound-effect",
    }
    audio_evidence = {
        "sourceGitPath": voice_index_path.relative_to(ROOT).as_posix(),
        "selectedGroupsSha256": hashlib.sha256(json.dumps(
            audio_groups, ensure_ascii=False, sort_keys=True, separators=(",", ":")
        ).encode("utf-8")).hexdigest(),
        "fileCount": sum(row["fileCount"] for row in audio_groups),
        "knownDurationSeconds": sum(row["knownDurationSeconds"] for row in audio_groups),
        "allListeningReviewComplete": all(row["listeningReviewComplete"] for row in audio_groups),
        "allSpeakerVerified": all(row["speakerVerified"] for row in audio_groups),
        "groups": [{
            "id": row["id"],
            "fileCount": row["fileCount"],
            "knownDurationSeconds": row["knownDurationSeconds"],
            "reportedLanguage": row["reportedLanguage"],
            "categoryCounts": row["categoryCounts"],
            "listeningReviewComplete": row["listeningReviewComplete"],
            "speakerVerified": row["speakerVerified"],
        } for row in audio_groups],
    }

    dependency_index = read_json(dependency_index_path)
    dependencies = dependency_index["externalPackageDependencies"]
    vfx_references = [path for path in dependencies if "/VFX/" in path]
    pn020_event_references = [
        path for path in dependencies
        if "/PN020_" in path or "/VO_PN020/" in path or "/Player/PN020/" in path
    ]
    dependency_evidence = {
        "source": file_evidence(dependency_index_path),
        "rawPackageNamesAreNotAssetAcquisition": dependency_index["rawPackageNamesAreNotAssetAcquisition"],
        "vfxReferenceCount": len(vfx_references),
        "vfxReferences": vfx_references,
        "pn020EventReferenceCount": len(pn020_event_references),
        "pn020EventReferences": pn020_event_references,
    }

    gaps = [
        {
            "id": "distinct-death-presentation",
            "status": "owner-approved-existing-runtime-bound" if applied_decision else "review-candidate-ready-runtime-not-bound",
            "evidence": (
                "Owner approved the native PN020 down plus the existing global ChampionView corpse dissolve. "
                "The selected model maps hurt/death to GGD_native_down; ChampionView already lies for 3 seconds, rises 3.2 world units while fading for 1.4 seconds, then hides."
                if applied_decision else
                "All three PN020 model docs map hurt and death to GGD_native_down; no distinct death AnimSequence was found in the extracted package set."
            ),
            "candidate": {
                "id": "popp-native-down-rise-fade-v1",
                "motion": "GGD_native_down",
                "motionProvenance": "native PN020 down loop",
                "borrowedMotion": False,
                "presentation": "play hurt/down once, then raise the rendered body while opacity falls to zero",
                "reviewPreview": {
                    "kind": "whole-canvas-compositing-mockup",
                    "durationMs": 2200,
                    "fadeStartRatio": 0.35,
                    "translateYPixels": -80,
                    "runtimeWorldSpaceCalibrationRequiredAfterApproval": True,
                },
                "reviewRequired": True,
                "runtimeImplemented": bool(applied_decision),
                "decisionReceipt": file_evidence(DECISION_RECEIPT) if applied_decision else None,
            },
        },
        {
            "id": "source-toon-and-hair-colour-parity",
            "status": "pending-source-shader-reconstruction",
            "evidence": "The source hair base is an 8x8 shader-parameter texture. Current candidates are accepted simplified PBR previews, without exact source toon and hair-colour parity.",
        },
        {
            "id": "original-vfx-conversion",
            "status": "source-references-retained-pending-conversion",
            "evidence": f"{len(vfx_references)} VFX package references, including Mera, Merami, Hyadaruko, Io, Iora and Raidein, are retained. The index explicitly says package names are not acquisition; no converted and accepted PN020 VFX package is bound.",
        },
        {
            "id": "animation-events-and-sfx-binding",
            "status": "pending-user-listening-review",
            "evidence": f"{len(pn020_event_references)} PN020 animation/Wwise event references and {audio_evidence['fileCount']} indexed decoded audio files exist, but event-to-file and skill meaning require explicit listening approval before binding.",
        },
        {
            "id": "skill-timing-and-full-combat-binding",
            "status": "pending-gameplay-validation",
            "evidence": "GGD ability definitions exist, while native Special01/Special02 remain unreferenced and original animation timing, hit timing and complete combat playback are not accepted.",
        },
    ]

    facts = {
        "heroId": HERO_ID,
        "activeModelKeyBeforeReview": champion["modelKey"],
        "weaponCandidateHashes": [(row["candidateId"], row["glb"]["sha256"]) for row in candidates],
        "reviewContactSheetHashes": [
            (row["candidateId"], row["validation"]["reviewContactSheet"]["sha256"])
            for row in candidates
        ],
        "gapStates": [(row["id"], row["status"]) for row in gaps],
        "poppAudioGroupsSha256": audio_evidence["selectedGroupsSha256"],
        "dependencyIndexSha256": dependency_evidence["source"]["sha256"],
    }
    fingerprint = hashlib.sha256(
        json.dumps(facts, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return {
        "schema": "ggd.popp-integration-review@1",
        "heroId": HERO_ID,
        "nameZh": "何布／波普",
        "workZh": "Infinity Strash 勇者鬥惡龍 達伊的大冒險",
        "nativeCharacterId": "PN020",
        "sourcePlatform": "Windows (Steam)",
        "sourceFingerprint": fingerprint,
        "sourceInputs": [file_evidence(runtime_inputs_path), file_evidence(champion_path)],
        "currentSelection": {
            "modelKey": champion["modelKey"],
            "selectionMode": champion.get("modelSelectionMode", "automatic"),
            "changedByThisReviewBuild": False,
            "ownerDecisionApplied": bool(applied_decision),
        },
        "weaponReview": {
            "status": "owner-selection-applied" if applied_decision else "awaiting-user-selection",
            "selectionRequired": not bool(applied_decision),
            "selectedCandidateId": applied_decision["ownerDecision"]["weaponCandidateId"] if applied_decision else None,
            "automaticDefaultChangeAllowed": False,
            "candidates": candidates,
        },
        "audioReviewEvidence": audio_evidence,
        "sourceDependencyEvidence": dependency_evidence,
        "fiveOpenIntegrationGaps": gaps,
        "remainingOpenIntegrationGapCount": sum(row["status"] != "owner-approved-existing-runtime-bound" for row in gaps),
        "decisionReceipt": file_evidence(DECISION_RECEIPT) if applied_decision else None,
        "releaseState": "feature-branch-owner-selection-applied-production-unverified" if applied_decision else "feature-branch-options-present-review-pending-production-unverified",
    }


def build_html(contract: dict) -> str:
    encoded = html.escape(json.dumps(contract, ensure_ascii=False, separators=(",", ":")), quote=False)
    return f'''<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>波普 PN020 武器與死亡演出審查</title>
<style>
:root{{--bg:#071019;--card:#111d2a;--line:#294158;--fg:#eef6ff;--dim:#a9b8c6;--accent:#66d9ef;--warn:#ffc66d;--ok:#8bd49c}}
*{{box-sizing:border-box}} body{{margin:0;background:var(--bg);color:var(--fg);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Noto Sans TC",sans-serif}}
header{{position:sticky;top:0;z-index:5;padding:14px 18px;background:#08131eee;border-bottom:1px solid var(--line);backdrop-filter:blur(8px)}}
h1{{font-size:19px;margin:0}} .meta,.note{{color:var(--dim)}} main{{max-width:1200px;margin:auto;padding:18px}} h2{{margin-top:26px}}
.warn{{border:1px solid #8d692e;background:#2c2414;padding:10px 12px;border-radius:8px;color:#ffe2a6}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px}} .card{{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:12px}}
.card.chosen{{border-color:var(--ok);box-shadow:0 0 0 1px var(--ok)}}
.review-frame{{width:100%;aspect-ratio:808/268;border:1px solid var(--line);border-radius:8px;background-color:#1e2530;background-repeat:no-repeat;background-size:100% 600%;box-shadow:inset 0 0 0 1px #ffffff08}}
.review-frame[data-state="idle"]{{background-position:0 0}} .review-frame[data-state="run"]{{background-position:0 20%}} .review-frame[data-state="attack"]{{background-position:0 40%}}
.review-frame[data-state="cast"]{{background-position:0 60%}} .review-frame[data-state="hurt"]{{background-position:0 80%}} .review-frame[data-state="death"]{{background-position:0 100%}}
.frame-status{{display:flex;justify-content:space-between;gap:8px;margin:6px 0;color:var(--dim);font-size:12px}} .frame-status b{{color:var(--ok)}}
.buttons{{display:flex;gap:6px;flex-wrap:wrap;margin:9px 0}} button,.pick{{border:1px solid var(--line);background:#182a3b;color:var(--fg);padding:7px 10px;border-radius:7px;cursor:pointer}}
button:hover,.pick:hover{{border-color:var(--accent)}} button.active{{border-color:var(--accent);background:#16435b}} code{{font-size:11px;word-break:break-all}} ol li{{margin:8px 0}} .status{{color:var(--warn)}}
#deathStage{{overflow:hidden;border-radius:8px;background:#071019;padding:10px}} #deathFrame.rise{{animation:riseFade 2.2s ease-in forwards}} @keyframes riseFade{{0%,35%{{opacity:1;transform:translateY(0)}}100%{{opacity:.08;transform:translateY(-80px)}}}}
textarea{{width:100%;min-height:70px;background:#09121b;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:8px}}
</style></head><body><header><h1>何布／波普 PN020 武器與死亡演出審查</h1><div class="meta">資料指紋 <code>{contract['sourceFingerprint']}</code> · 正式站部署仍待 Main</div></header>
<main><div class="warn">三支法杖都是功能分支的獨立後台選項。<b>{'已套用你的 Kagayaki 手動選擇；其他兩支仍保留為選項。' if contract['weaponReview']['selectedCandidateId'] else '尚未套用裁決，不會自動切換。'}</b></div>
<h2>一、選一支預設法杖</h2><div id="weapons" class="grid"></div><div class="buttons"><button id="clearWeapon">清除法杖選擇</button></div>
<h2>二、死亡演出候選</h2><div class="card"><p>原作解包範圍沒有獨立 death，hurt/death 都播放原生 <code>GGD_native_down</code>。你核准的「down＋整體升天淡出」已由既有 ChampionView 死亡流程提供：倒地 3 秒，再升高並淡出 1.4 秒。</p>
<div class="buttons"><button id="nativeDeath">播放原生 down</button><button id="fadeDeath">預覽 down＋升天淡出</button></div>
<div id="deathStage"><div id="deathFrame" class="review-frame" data-state="hurt" role="img" aria-label="死亡演出三幀預覽"></div></div>
<div class="frame-status"><b>可見證據圖</b><span>實際 Babylon WebGL：0%／50%／100%</span></div>
<label class="pick"><input type="radio" name="death" value="popp-native-down-rise-fade-v1"> 核准 down＋升天淡出候選</label>
<label class="pick"><input type="radio" name="death" value="reject"> 不核准，繼續找同作品動作</label></div>
<h2>三、五項整合狀態（剩餘 {contract['remainingOpenIntegrationGapCount']} 項）</h2><ol id="gaps"></ol>
<h2>四、匯出裁決</h2><p class="note">匯出 JSON 後交回整合工作流；只有明確核准值才可套用。瀏覽器也會在這台裝置的 localStorage 保存草稿。</p>
<textarea id="reviewNote" placeholder="選擇理由、要修的顏色或動作問題"></textarea><div class="buttons"><button id="export">下載裁決 JSON</button></div></main>
<script id="contract" type="application/json">{encoded}</script><script>
const D=JSON.parse(document.getElementById('contract').textContent), key='ggd-popp-review:'+D.sourceFingerprint;
const state=Object.assign({{weaponCandidateId:D.weaponReview.selectedCandidateId,deathCandidateId:D.weaponReview.selectedCandidateId?'popp-native-down-rise-fade-v1':null,note:''}},JSON.parse(localStorage.getItem(key)||'{{}}'));
const save=()=>{{state.note=document.getElementById('reviewNote').value;localStorage.setItem(key,JSON.stringify(state));renderChosen()}};
const wrap=document.getElementById('weapons');
for(const c of D.weaponReview.candidates){{const sheet=c.validation.reviewContactSheet;const card=document.createElement('section');card.className='card';card.dataset.id=c.candidateId;card.innerHTML=`<h3>${{c.staff}}</h3><p>${{c.nativeCharacterId}}</p><div class="review-frame" data-state="idle" role="img" aria-label="${{c.staff}} idle 三幀預覽" style="background-image:url('/${{sheet.publicPath}}')"></div><div class="frame-status"><b>可見證據圖</b><span>實際 WebGL：0%／50%／100%</span></div><div class="buttons">${{sheet.states.map(x=>`<button data-clip="${{x}}" class="${{x==='idle'?'active':''}}">${{x}}</button>`).join('')}}</div><label class="pick"><input type="radio" name="weapon" value="${{c.candidateId}}"> 選為預設法杖</label><p class="meta"><code>${{c.glb.sha256}}</code><br>${{c.nativeAnimationCount}} 段原生動作 · 後台選項已存在 · 正式站未驗</p>`;card.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>{{const frame=card.querySelector('.review-frame');frame.dataset.state=b.dataset.clip;frame.setAttribute('aria-label',c.staff+' '+b.dataset.clip+' 三幀預覽');card.querySelectorAll('[data-clip]').forEach(x=>x.classList.toggle('active',x===b))}});wrap.append(card)}}
function renderChosen(){{document.querySelectorAll('#weapons .card').forEach(x=>x.classList.toggle('chosen',x.dataset.id===state.weaponCandidateId));document.querySelectorAll('input[name=weapon]').forEach(x=>x.checked=x.value===state.weaponCandidateId);document.querySelectorAll('input[name=death]').forEach(x=>x.checked=x.value===state.deathCandidateId)}}
document.querySelectorAll('input[name=weapon]').forEach(x=>x.onchange=()=>{{state.weaponCandidateId=x.value;save()}});document.querySelectorAll('input[name=death]').forEach(x=>x.onchange=()=>{{state.deathCandidateId=x.value;save()}});
document.getElementById('clearWeapon').onclick=()=>{{state.weaponCandidateId=null;save()}};
document.getElementById('gaps').innerHTML=D.fiveOpenIntegrationGaps.map(g=>`<li><b>${{g.id}}</b> · <span class="status">${{g.status}}</span><br><span class="note">${{g.evidence}}</span></li>`).join('');
const death=document.getElementById('deathFrame'), base=D.weaponReview.candidates[0].validation.reviewContactSheet;death.style.backgroundImage=`url('/${{base.publicPath}}')`;function native(){{death.classList.remove('rise');void death.offsetWidth}}document.getElementById('nativeDeath').onclick=native;document.getElementById('fadeDeath').onclick=()=>{{native();requestAnimationFrame(()=>death.classList.add('rise'))}};native();
document.getElementById('reviewNote').value=state.note;document.getElementById('reviewNote').oninput=save;renderChosen();
document.getElementById('export').onclick=()=>{{save();const out={{schema:'ggd.popp-integration-review-decision@1',sourceFingerprint:D.sourceFingerprint,heroId:D.heroId,weaponCandidateId:state.weaponCandidateId,deathCandidateId:state.deathCandidateId,note:state.note}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\\n'],{{type:'application/json'}}));a.download='popp-integration-review-decision.json';a.click();URL.revokeObjectURL(a.href)}};
</script></body></html>\n'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract = build_contract()
    json_payload = json.dumps(contract, ensure_ascii=False, indent=2) + "\n"
    html_payload = build_html(contract)
    if args.check:
        failures = []
        for path, expected in ((OUTPUT_JSON, json_payload), (OUTPUT_HTML, html_payload)):
            if not path.is_file() or path.read_text(encoding="utf-8") != expected:
                failures.append(path.relative_to(ROOT).as_posix())
        for staff, source in CONTACT_SHEETS.items():
            target = OUTPUT_ASSET_DIR / f"{staff.lower()}-contact-sheet.png"
            if not target.is_file() or target.read_bytes() != source.read_bytes():
                failures.append(target.relative_to(ROOT).as_posix())
        if failures:
            raise SystemExit("Generated Popp review outputs are stale: " + ", ".join(failures))
        print(json.dumps({"checked": len(failures) == 0, "sourceFingerprint": contract["sourceFingerprint"]}))
        return
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_HTML.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_ASSET_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_JSON.write_text(json_payload, encoding="utf-8")
    OUTPUT_HTML.write_text(html_payload, encoding="utf-8")
    for staff, source in CONTACT_SHEETS.items():
        shutil.copyfile(source, OUTPUT_ASSET_DIR / f"{staff.lower()}-contact-sheet.png")
    print(json.dumps({"json": str(OUTPUT_JSON), "html": str(OUTPUT_HTML), "sourceFingerprint": contract["sourceFingerprint"]}))


if __name__ == "__main__":
    main()

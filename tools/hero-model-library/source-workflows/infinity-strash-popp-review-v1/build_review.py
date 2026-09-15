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
OUTPUT_GAP_LEDGER = LIBRARY / "infinity-strash/popp-integration-gaps.json"
OUTPUT_HTML = ROOT / "apps/client/public/popp-integration-review.html"
OUTPUT_ASSET_DIR = ROOT / "apps/client/public/review-assets/popp-pn020"
DECISION_RECEIPT = LIBRARY / "priority-evidence/infinity-strash-popp-review-decision/receipt.json"
VFX_RUNTIME_MANIFEST = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/runtime-candidates-v1/manifest.json"
EVENT_AUDIO_QUEUE = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/event-audio-review-queue.json"
GAP_DEFINITIONS = Path(__file__).resolve().with_name("gap-definitions.json")
VFX_BINDING_PROPOSALS = Path(__file__).resolve().with_name("vfx-binding-proposals.json")
PORTAL_OWNER_DECISIONS = LIBRARY / "review/asset-review-portal-v1/owner-decisions.json"
VFX_RUNTIME_RELEASE = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-runtime-v1/receipt.json"
APPROVED_AUDIO_RECEIPT = LIBRARY / "priority-evidence/infinity-strash-popp-approved-audio-v1/receipt.json"
APPROVED_AUDIO_EVENT_TABLE = LIBRARY / "priority-evidence/infinity-strash-popp-approved-audio-v1/runtime-event-table.json"
APPROVED_AUDIO_BLOCKERS = LIBRARY / "priority-evidence/infinity-strash-popp-approved-audio-v1/candidate-blockers.json"
VFX_STATIC_MESH_RECOVERY = LIBRARY / "priority-evidence/infinity-strash-popp-vfx-events-v1/staticmesh-recovery-receipt.json"
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


def closure_gate(
    gate_id: str,
    name_zh: str,
    verified: bool,
    detail: str,
    evidence: list[dict],
) -> dict:
    """Represent a checkable closure condition without promoting a missing input.

    A gap may contain useful converted material while it remains open.  Keeping
    every condition as its own gate makes that distinction queryable by other
    workflows and prevents a broad `pending` label from hiding the next
    required input.
    """
    return {
        "id": gate_id,
        "nameZh": name_zh,
        "state": "verified" if verified else "blocked",
        "verified": verified,
        "detail": detail,
        "evidence": evidence,
    }


def read_portal_owner_review(event_audio_queue: dict, vfx_runtime: dict) -> dict:
    """Join the owner portal receipt without promoting approval to runtime readiness."""
    receipt = read_json(PORTAL_OWNER_DECISIONS)
    assert receipt["schema"] == "ggd.asset-review-decisions@1"
    assert receipt["reviewer"] == "owner"
    decisions = {row["candidateId"]: row for row in receipt["decisions"]}

    audio_rows = []
    for source in event_audio_queue["candidates"]:
        portal_id = f"popp:{source['candidateId']}"
        decision = decisions[portal_id]
        assert decision["decision"] == "approve"
        assert decision["approvedBindings"] == [source["sourceEventReference"]]
        audio_rows.append(decision)

    vfx_rows = []
    for source in vfx_runtime["candidates"]:
        portal_id = f"popp-vfx:{source['candidateId']}"
        decision = decisions[portal_id]
        assert decision["decision"] == "approve"
        assert decision["approvedBindings"] == []
        vfx_rows.append(decision)

    # The portal intentionally recorded playback/visual approval separately
    # from permission to mutate runtime bindings. Preserve that boundary.
    runtime_authorized = bool(receipt["runtimeMutationAllowed"]) and all(
        row.get("runtimeBindingAuthorized") is True for row in audio_rows + vfx_rows
    )
    return {
        "source": file_evidence(PORTAL_OWNER_DECISIONS),
        "reviewedAt": receipt["reviewedAt"],
        "reviewer": receipt["reviewer"],
        "audio": {
            "candidateCount": len(audio_rows),
            "approvedCount": sum(row["decision"] == "approve" for row in audio_rows),
            "runtimeBindingAuthorizedCount": sum(
                row.get("runtimeBindingAuthorized") is True for row in audio_rows
            ),
        },
        "vfx": {
            "candidateCount": len(vfx_rows),
            "visuallyApprovedCount": sum(row["decision"] == "approve" for row in vfx_rows),
            "bindingApprovedCount": sum(bool(row["approvedBindings"]) for row in vfx_rows),
            "runtimeBindingAuthorizedCount": sum(
                row.get("runtimeBindingAuthorized") is True for row in vfx_rows
            ),
        },
        "runtimeMutationAllowed": bool(receipt["runtimeMutationAllowed"]),
        "runtimeMutationAuthorizedForAll": runtime_authorized,
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
    vfx_runtime = read_json(VFX_RUNTIME_MANIFEST)
    assert vfx_runtime["schema"] == "ggd.infinity-strash-popp-vfx-runtime-candidates@1"
    assert vfx_runtime["summary"]["ggdVfxDocumentsBuilt"] == 12
    assert vfx_runtime["summary"]["identityExcludedRoots"] == 2
    assert vfx_runtime["summary"]["skillBindingsCreated"] == 0
    assert vfx_runtime["summary"]["visuallyAccepted"] == 0
    event_audio_queue = read_json(EVENT_AUDIO_QUEUE)
    assert event_audio_queue["schema"] == "ggd.popp-event-audio-review-queue@1"
    assert event_audio_queue["automaticBindingAllowed"] is False
    assert event_audio_queue["runtimeSelectable"] is False
    assert len(event_audio_queue["candidates"]) == 36
    assert all(row["reviewDecision"] is None for row in event_audio_queue["candidates"])
    portal_owner_review = read_portal_owner_review(event_audio_queue, vfx_runtime)
    assert portal_owner_review["audio"]["approvedCount"] == 36
    assert portal_owner_review["vfx"]["visuallyApprovedCount"] == 12
    assert portal_owner_review["runtimeMutationAuthorizedForAll"] is False
    approved_audio = read_json(APPROVED_AUDIO_RECEIPT)
    approved_audio_events = read_json(APPROVED_AUDIO_EVENT_TABLE)
    approved_audio_blockers = read_json(APPROVED_AUDIO_BLOCKERS)
    assert approved_audio["schema"] == "ggd.infinity-strash-popp-approved-audio-receipt@1"
    assert approved_audio["sourceId"] == "steam-infinity-strash-popp-priority-audio-build-local-20240328"
    assert approved_audio["summary"] == {
        "reviewCandidates": 36,
        "ownerApproved": 36,
        "sourceWavFiles": 35,
        "uniqueSourcePayloads": 35,
        "gameAudioFiles": 35,
        "gameAudioCandidateRelationships": 36,
        "nativeEventRows": 8,
        "soundEffectCandidates": 12,
        "voiceCandidates": 24,
        "reportedJapaneseCandidates": 12,
        "reportedEnglishCandidates": 12,
        "reportedNonlocalizedCandidates": 12,
        "runtimeBindings": 0,
        "runtimeConsumers": 0,
        "candidateBlockers": 36,
        "productionDeployed": 0,
    }
    assert approved_audio["runtimeMutationPerformed"] is False
    assert approved_audio_events["runtimeBindingAuthorized"] is False
    assert len(approved_audio_events["events"]) == 8
    assert approved_audio_blockers["summary"] == {"candidates": 36, "runtimeBindable": 0, "blocked": 36}
    vfx_binding_proposals = read_json(VFX_BINDING_PROPOSALS)
    assert vfx_binding_proposals["schema"] == "ggd.popp-vfx-binding-proposals@1"
    assert vfx_binding_proposals["heroId"] == HERO_ID
    assert vfx_binding_proposals["policy"]["visuallyApproved"] is False
    assert vfx_binding_proposals["policy"]["runtimeMutationAllowed"] is False
    runtime_candidate_ids = {row["candidateId"] for row in vfx_runtime["candidates"]}
    proposed_candidate_ids = {
        candidate_id
        for row in vfx_binding_proposals["abilities"]
        for candidate_id in row["candidateIds"]
    }
    reserve_candidate_ids = set(vfx_binding_proposals["reserveCandidateIds"])
    assert proposed_candidate_ids.isdisjoint(reserve_candidate_ids)
    assert proposed_candidate_ids | reserve_candidate_ids == runtime_candidate_ids
    for row in vfx_binding_proposals["abilities"]:
        assert (ROOT / "content/abilities" / f"{row['abilityId']}.json").is_file()
    vfx_runtime_release = read_json(VFX_RUNTIME_RELEASE)
    assert vfx_runtime_release["schema"] == "ggd.popp-vfx-runtime-release@1"
    assert vfx_runtime_release["heroId"] == HERO_ID
    assert vfx_runtime_release["summary"] == {
        "ownerApprovedVfxReleased": 12,
        "ownerApprovedVfxReleasedUnbound": 12,
        "abilityBindingsCreated": 0,
        "abilityBindingsPreserved": 3,
        "candidateRelationshipsProposed": 7,
        "candidateRelationshipsBound": 0,
        "reserveCandidatesReleasedUnbound": 5,
        "sourceTexturesRetained": 9,
        "staticMeshSupportGlbsRetained": 33,
    }
    assert vfx_runtime_release["states"]["featureBranchVfxDocumentsResolvable"] is True
    assert vfx_runtime_release["states"]["featureBranchSkillBindingsCreated"] is False
    assert vfx_runtime_release["states"]["candidateOnly"] is True
    assert vfx_runtime_release["states"]["existingAbilityBindingsPreserved"] is True
    assert vfx_runtime_release["states"]["nativeNiagaraTimingRecovered"] is False
    assert vfx_runtime_release["states"]["rootSpecificMeshLayersBound"] is False
    assert vfx_runtime_release["states"]["fullCombatPlaybackVerified"] is False
    static_mesh_recovery = read_json(VFX_STATIC_MESH_RECOVERY)
    assert static_mesh_recovery["states"]["staticMeshSupportConverted"] == 33
    assert static_mesh_recovery["states"]["niagaraSystemsConverted"] == 0
    assert static_mesh_recovery["states"]["runtimeBound"] is False
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

    # The three model acceptance summaries establish visibility and native-clip
    # sampling, not source-shader equivalence.  Read their limits from the
    # canonical priority-runtime input rather than repeating a hand-maintained
    # list in the ledger.
    staff_runtime_rows = [entries[candidate_id] for _, candidate_id in STAFFS]
    assert all(row["nativeAnimationCount"] == 5 for row in staff_runtime_rows)
    assert all(
        any("toon" in limitation.lower() or "髮色" in limitation for limitation in row["limitations"])
        for row in staff_runtime_rows
    )
    runtime_inputs_evidence = file_evidence(runtime_inputs_path)
    vfx_release_evidence = file_evidence(VFX_RUNTIME_RELEASE)
    static_mesh_evidence = file_evidence(VFX_STATIC_MESH_RECOVERY)
    audio_receipt_evidence = file_evidence(APPROVED_AUDIO_RECEIPT)
    audio_blocker_evidence = file_evidence(APPROVED_AUDIO_BLOCKERS)

    # The gates deliberately test the exact distinction required to close each
    # gap.  A verified gate means this checkout has the evidence; a blocked
    # gate means the evidence itself says that a needed input has not been
    # recovered or accepted.  It is not a request to infer a binding.
    death_gates = [
        closure_gate(
            "native-down-source", "PN020 原生 down 動作已固定", True,
            "選定 Kagayaki 模型的 hurt/death 都指向 GGD_native_down；來源為 PN020 原生 down loop。",
            [file_evidence(DECISION_RECEIPT), runtime_inputs_evidence],
        ),
        closure_gate(
            "owner-death-decision", "死亡替代演出已逐項核准", bool(applied_decision),
            "owner 裁決固定為 native down 加既有升天淡出，且選定法杖已套用。",
            [file_evidence(DECISION_RECEIPT)] if applied_decision else [],
        ),
        closure_gate(
            "existing-runtime-presentation", "既有 runtime 死亡演出已接通", bool(applied_decision),
            "決策收據記錄既有 ChampionView 倒地、升高與淡出流程；本 workflow 未另造未驗證的死亡動作。",
            [file_evidence(DECISION_RECEIPT)] if applied_decision else [],
        ),
    ]
    toon_gates = [
        closure_gate(
            "source-material-inputs-retained", "三支法杖的來源材質輸入已保留", True,
            "三個原作 PN020 候選皆有已驗證的模型、貼圖與 18 張 WebGL 狀態抽查；其限制欄明確記錄 toon／髮色尚未還原。",
            [runtime_inputs_evidence],
        ),
        closure_gate(
            "source-shader-parameters-recovered", "來源 shader 參數已恢復", False,
            "目前只有依遊戲 shader 參數運作的 8×8 hair base 與材質檔；沒有可重現的 shader 參數匯出或等價運算證據。",
            [runtime_inputs_evidence],
        ),
        closure_gate(
            "ggd-toon-material-built", "GGD toon／遮罩／陰影材質已重建", False,
            "三個執行候選目前明確使用簡化 PBR；沒有已驗證的 GGD toon 材質產物可供替換。",
            [runtime_inputs_evidence],
        ),
        closure_gate(
            "three-staff-parity-review", "三支法杖的外觀一致性已驗收", False,
            "現有 WebGL 驗收只證明可見性、完整身體與動作抽查；收據明載並非精確 toon／髮色一致性驗收。",
            [
                file_evidence(ACCEPTANCE["Magikaru"]),
                file_evidence(ACCEPTANCE["Mahouno"]),
                file_evidence(ACCEPTANCE["Kagayaki"]),
            ],
        ),
    ]
    vfx_gates = [
        closure_gate(
            "reviewed-vfx-documents-released", "12 個核准 VFX 文件已發布到功能分支", True,
            "12 個 owner 視覺核准的重建候選都有可解析 VFX 文件。",
            [vfx_release_evidence],
        ),
        closure_gate(
            "reviewed-qwr-relationships-bound", "7 組 Q/W/R 候選關係獲得逐技能綁定核准", False,
            "Q/W/R 的 7 組來源名稱關係只保留為審查提案；作用中技能維持 origin/main 的共用 VFX。",
            [vfx_release_evidence],
        ),
        closure_gate(
            "native-niagara-timing-recovered", "原生 Niagara 時序已恢復", False,
            "runtime 收據明確為 nativeNiagaraTimingRecovered=false；目前 delay 只是 GGD castTimeSec 範圍內的確定性播放值。",
            [vfx_release_evidence],
        ),
        closure_gate(
            "root-specific-mesh-attribution", "root 對應的 mesh layer 已確認", False,
            "33 個 static-mesh support GLB 已轉換，但 rootSpecificAttributions=0，不能猜測掛入技能。",
            [vfx_release_evidence, static_mesh_evidence],
        ),
        closure_gate(
            "native-vfx-parity-playback", "原作特效完整時序與畫面已驗收", False,
            "目前沒有原生 Niagara 播放或完整原作對照驗收；候選文件不可升格為原作完整重建。",
            [vfx_release_evidence],
        ),
    ]
    audio_gates = [
        closure_gate(
            "approved-native-event-relationships", "36 筆原生事件關係已逐項聽審", True,
            "36 筆 Popp／PN020 關係均有 owner approve，且每筆只核准其一個原生 Wwise 事件。",
            [file_evidence(PORTAL_OWNER_DECISIONS), audio_receipt_evidence],
        ),
        closure_gate(
            "game-format-audio-converted", "35 份遊戲用 MP3 已產生並驗證", True,
            "35 個去重內容檔覆蓋 36 筆候選關係，固定為 48 kHz mono MP3。",
            [audio_receipt_evidence],
        ),
        closure_gate(
            "owner-approved-ggd-runtime-targets", "唯一 GGD 技能／狀態目標已逐項核准", False,
            "所有 36 筆 owner 決策 runtimeBindingAuthorized=false；每筆 blocker 均缺唯一 GGD target。",
            [audio_receipt_evidence, audio_blocker_evidence],
        ),
        closure_gate(
            "runtime-audio-playback-and-regression", "runtime 播放與回歸收據已完成", False,
            "音訊收據 runtimeBindings=0、runtimeConsumers=0；沒有可驗證的角色 runtime 播放或回歸結果。",
            [audio_receipt_evidence, audio_blocker_evidence],
        ),
    ]
    combat_gates = [
        closure_gate(
            "native-motion-set-retained", "已取得的原生動作集合已固定", True,
            "三支 PN020 執行候選各保留 5 段獨立原生動作；Special01／Special02 儲備不等於已核對施放時序。",
            [runtime_inputs_evidence],
        ),
        closure_gate(
            "source-cast-hit-end-timing-recovered", "Q/W/E/R/EX 的原作施放、命中與結束時序已量測", False,
            "現有 VFX runtime 收據明確不主張原生 Niagara timing；沒有一份收據量測完整原作動作／命中／結束時點。",
            [vfx_release_evidence],
        ),
        closure_gate(
            "approved-motion-vfx-audio-timeline", "核准動作、VFX、音訊已合成同一條時序", False,
            "VFX 只有 Q/W/R 審查提案且未綁定，音訊沒有 GGD target；不能把兩份候選資料當作完整戰鬥時序。",
            [vfx_release_evidence, audio_receipt_evidence],
        ),
        closure_gate(
            "full-combat-playback-and-regression", "完整戰鬥播放與回歸已通過", False,
            "runtime 收據為 fullCombatPlaybackVerified=false，且 productionDeploymentVerified=false。",
            [vfx_release_evidence],
        ),
    ]

    gap_states = [
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
                    "runtimeWorldSpaceCalibrationRequiredAfterApproval": not bool(applied_decision),
                },
                "reviewRequired": not bool(applied_decision),
                "runtimeImplemented": bool(applied_decision),
                "decisionReceipt": file_evidence(DECISION_RECEIPT) if applied_decision else None,
            },
            "closureGates": death_gates,
        },
        {
            "id": "source-toon-and-hair-colour-parity",
            "status": "blocked-missing-source-shader-parameter-recovery-and-parity-review",
            "evidence": "The source hair base is an 8x8 shader-parameter texture. Current candidates are accepted simplified PBR previews, without exact source toon and hair-colour parity.",
            "closureGates": toon_gates,
        },
        {
            "id": "original-vfx-conversion",
            "status": "feature-branch-twelve-candidates-unbound-blocked-native-niagara-timing-and-root-mesh-attribution",
            "evidence": f"{len(vfx_references)} VFX package references are retained. All {vfx_runtime_release['summary']['ownerApprovedVfxReleased']} owner-approved reconstructions now have release VFX IDs; {vfx_runtime_release['summary']['candidateRelationshipsProposed']} source-name relationships remain unbound Q/W/R review proposals and {vfx_runtime_release['summary']['reserveCandidatesReleasedUnbound']} remain unpaired reserves. Exact native Niagara timing and root-specific mesh attribution remain unrecovered and are not claimed.",
            "closureGates": vfx_gates,
        },
        {
            "id": "animation-events-and-sfx-binding",
            "status": "blocked-missing-owner-approved-unique-ggd-targets-and-runtime-playback",
            "evidence": f"{len(pn020_event_references)} PN020 animation/Wwise event references and {audio_evidence['fileCount']} indexed decoded audio files exist. All {portal_owner_review['audio']['approvedCount']} reviewed relationships are converted to {approved_audio['summary']['gameAudioFiles']} content-addressed game MP3 files and grouped into {approved_audio['summary']['nativeEventRows']} approved native events. The receipt authorizes no GGD target or runtime mutation, so all 36 candidate relationships remain individually blocked from skill/state binding.",
            "closureGates": audio_gates,
        },
        {
            "id": "skill-timing-and-full-combat-binding",
            "status": "blocked-missing-source-timing-mapping-and-full-combat-playback",
            "evidence": "GGD ability definitions exist, while native Special01/Special02 remain unreferenced and original animation timing, hit timing and complete combat playback are not accepted.",
            "closureGates": combat_gates,
        },
    ]
    definitions = read_json(GAP_DEFINITIONS)
    assert definitions["schema"] == "ggd.popp-integration-gap-definitions@1"
    assert definitions["heroId"] == HERO_ID
    assert definitions["nativeCharacterId"] == "PN020"
    definition_by_id = {row["id"]: row for row in definitions["gaps"]}
    assert len(definition_by_id) == 5
    assert list(definition_by_id) == [row["id"] for row in gap_states]
    gaps = []
    for state in gap_states:
        definition = definition_by_id[state["id"]]
        closed = all(gate["verified"] for gate in state["closureGates"])
        gaps.append({
            **definition,
            **state,
            "closed": closed,
            "remaining": not closed,
            "closureGateSummary": {
                "total": len(state["closureGates"]),
                "verified": sum(gate["verified"] for gate in state["closureGates"]),
                "blocked": sum(not gate["verified"] for gate in state["closureGates"]),
            },
            "ownerReviewRequiredBeforeRuntimeMutation": (
                state["id"] == "animation-events-and-sfx-binding"
            ),
        })

    facts = {
        "heroId": HERO_ID,
        "activeModelKeyBeforeReview": champion["modelKey"],
        "weaponCandidateHashes": [(row["candidateId"], row["glb"]["sha256"]) for row in candidates],
        "reviewContactSheetHashes": [
            (row["candidateId"], row["validation"]["reviewContactSheet"]["sha256"])
            for row in candidates
        ],
        "gapStates": [(row["id"], row["status"]) for row in gaps],
        "gapClosureGates": [
            (row["id"], [(gate["id"], gate["verified"]) for gate in row["closureGates"]])
            for row in gaps
        ],
        "poppAudioGroupsSha256": audio_evidence["selectedGroupsSha256"],
        "dependencyIndexSha256": dependency_evidence["source"]["sha256"],
        "vfxRuntimeManifestSha256": sha256(VFX_RUNTIME_MANIFEST),
        "vfxRuntimeReleaseSha256": sha256(VFX_RUNTIME_RELEASE),
        "eventAudioQueueSha256": sha256(EVENT_AUDIO_QUEUE),
        "gapDefinitionsSha256": sha256(GAP_DEFINITIONS),
        "vfxBindingProposalsSha256": sha256(VFX_BINDING_PROPOSALS),
        "portalOwnerDecisionsSha256": sha256(PORTAL_OWNER_DECISIONS),
        "approvedAudioReceiptSha256": sha256(APPROVED_AUDIO_RECEIPT),
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
        "sourceInputs": [
            file_evidence(runtime_inputs_path),
            file_evidence(champion_path),
            file_evidence(VFX_RUNTIME_MANIFEST),
            file_evidence(EVENT_AUDIO_QUEUE),
            file_evidence(GAP_DEFINITIONS),
            file_evidence(VFX_BINDING_PROPOSALS),
            file_evidence(PORTAL_OWNER_DECISIONS),
            file_evidence(VFX_RUNTIME_RELEASE),
            file_evidence(VFX_STATIC_MESH_RECOVERY),
            file_evidence(APPROVED_AUDIO_RECEIPT),
            file_evidence(APPROVED_AUDIO_EVENT_TABLE),
            file_evidence(APPROVED_AUDIO_BLOCKERS),
        ],
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
        "eventAudioReviewGate": {
            "source": file_evidence(EVENT_AUDIO_QUEUE),
            "candidateCount": len(event_audio_queue["candidates"]),
            "reviewedCount": portal_owner_review["audio"]["approvedCount"],
            "sourceQueueReviewedCount": sum(row["reviewDecision"] is not None for row in event_audio_queue["candidates"]),
            "automaticBindingAllowed": event_audio_queue["automaticBindingAllowed"],
            "runtimeSelectable": event_audio_queue["runtimeSelectable"],
        },
        "vfxRuntimeCandidates": {
            "source": file_evidence(VFX_RUNTIME_MANIFEST),
            "summary": {
                **vfx_runtime["summary"],
                "visuallyAccepted": portal_owner_review["vfx"]["visuallyApprovedCount"],
                "sourceManifestVisuallyAccepted": vfx_runtime["summary"]["visuallyAccepted"],
                "releasedDocuments": vfx_runtime_release["summary"]["ownerApprovedVfxReleased"],
                "releaseDocumentsRuntimeResolvable": vfx_runtime_release["summary"]["ownerApprovedVfxReleased"],
                "skillBindingsCreated": vfx_runtime_release["summary"]["candidateRelationshipsBound"],
                "sourceManifestSkillBindingsCreated": vfx_runtime["summary"]["skillBindingsCreated"],
            },
            "conversionBoundary": vfx_runtime["conversionBoundary"],
            "reviewPage": vfx_runtime["review"]["page"],
        },
        "portalOwnerReview": portal_owner_review,
        "approvedAudioTechnicalIntegration": {
            "receipt": file_evidence(APPROVED_AUDIO_RECEIPT),
            "nativeEventTable": file_evidence(APPROVED_AUDIO_EVENT_TABLE),
            "candidateBlockers": file_evidence(APPROVED_AUDIO_BLOCKERS),
            "summary": approved_audio["summary"],
            "runtimeBindingAuthorized": False,
            "runtimeSelectable": False,
            "productionDeployed": False,
        },
        "vfxBindingReviewProposals": {
            "source": file_evidence(VFX_BINDING_PROPOSALS),
            **vfx_binding_proposals,
            "proposalPolicy": vfx_binding_proposals["policy"],
            "policy": {
                **vfx_binding_proposals["policy"],
                "visuallyApproved": True,
                "runtimeMutationAllowed": False,
                "nativeNiagaraTimingClaim": False,
                "note": "Owner approved all review-centre resources on 2026-09-15. The seven listed source-name relationships remain unbound review proposals; the five reserves remain unpaired.",
            },
            "proposedCandidateCount": len(proposed_candidate_ids),
            "reserveCandidateCount": len(reserve_candidate_ids),
            "runtimeBindingsCreated": vfx_runtime_release["summary"]["candidateRelationshipsBound"],
            "runtimeAbilityBindingsCreated": vfx_runtime_release["summary"]["abilityBindingsCreated"],
            "runtimeRelease": file_evidence(VFX_RUNTIME_RELEASE),
        },
        "sourceDependencyEvidence": dependency_evidence,
        "fiveOpenIntegrationGaps": gaps,
        "remainingOpenIntegrationGapCount": sum(row["remaining"] for row in gaps),
        "closedIntegrationGapCount": sum(row["closed"] for row in gaps),
        "decisionReceipt": file_evidence(DECISION_RECEIPT) if applied_decision else None,
        "releaseState": "feature-branch-owner-selection-applied-production-unverified" if applied_decision else "feature-branch-options-present-review-pending-production-unverified",
    }


def build_gap_ledger(contract: dict) -> dict:
    """Publish the five stable definitions with source-derived live state."""
    return {
        "schema": "ggd.popp-integration-gap-ledger@1",
        "heroId": contract["heroId"],
        "nativeCharacterId": contract["nativeCharacterId"],
        "sourceFingerprint": contract["sourceFingerprint"],
        "definitionSource": file_evidence(GAP_DEFINITIONS),
        "reviewContract": file_evidence(OUTPUT_JSON) if OUTPUT_JSON.is_file() else {
            "gitPath": OUTPUT_JSON.relative_to(ROOT).as_posix(),
            "generatedWithSameRun": True,
        },
        "weaponDecision": {
            "selectedCandidateId": contract["weaponReview"]["selectedCandidateId"],
            "selectionMode": contract["currentSelection"]["selectionMode"],
            "candidateCount": len(contract["weaponReview"]["candidates"]),
            "otherCandidatesRetained": True,
        },
        "summary": {
            "defined": len(contract["fiveOpenIntegrationGaps"]),
            "closed": contract["closedIntegrationGapCount"],
            "remaining": contract["remainingOpenIntegrationGapCount"],
            "eventAudioCandidates": contract["eventAudioReviewGate"]["candidateCount"],
            "eventAudioReviewed": contract["eventAudioReviewGate"]["reviewedCount"],
            "eventAudioGameFormatFiles": contract["approvedAudioTechnicalIntegration"]["summary"]["gameAudioFiles"],
            "eventAudioCandidateRelationshipsConverted": contract["approvedAudioTechnicalIntegration"]["summary"]["gameAudioCandidateRelationships"],
            "eventAudioNativeEventRows": contract["approvedAudioTechnicalIntegration"]["summary"]["nativeEventRows"],
            "eventAudioRuntimeBlockers": contract["approvedAudioTechnicalIntegration"]["summary"]["candidateBlockers"],
            "ggdVfxCandidates": contract["vfxRuntimeCandidates"]["summary"]["ggdVfxDocumentsBuilt"],
            "vfxVisuallyAccepted": contract["vfxRuntimeCandidates"]["summary"]["visuallyAccepted"],
            "vfxBindingProposals": contract["vfxBindingReviewProposals"]["proposedCandidateCount"],
            "vfxReserveCandidates": contract["vfxBindingReviewProposals"]["reserveCandidateCount"],
            "runtimeBindingsAddedByThisWorkflow": contract["vfxBindingReviewProposals"]["runtimeBindingsCreated"],
            "closureGates": sum(len(row["closureGates"]) for row in contract["fiveOpenIntegrationGaps"]),
            "closureGatesVerified": sum(
                sum(gate["verified"] for gate in row["closureGates"])
                for row in contract["fiveOpenIntegrationGaps"]
            ),
            "closureGatesBlocked": sum(
                sum(not gate["verified"] for gate in row["closureGates"])
                for row in contract["fiveOpenIntegrationGaps"]
            ),
            "productionDeploymentVerified": False,
        },
        "gaps": contract["fiveOpenIntegrationGaps"],
        "vfxBindingReviewProposals": contract["vfxBindingReviewProposals"],
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
textarea{{width:100%;min-height:70px;background:#09121b;color:var(--fg);border:1px solid var(--line);border-radius:7px;padding:8px}} .gates{{margin:7px 0 0;padding-left:18px}} .gate-ok{{color:var(--ok)}} .gate-blocked{{color:var(--warn)}}
</style></head><body><header><h1>何布／波普 PN020 武器與死亡演出審查</h1><div class="meta">資料指紋 <code>{contract['sourceFingerprint']}</code> · 正式站部署仍待 Main</div></header>
<main><div class="warn">三支法杖都是功能分支的獨立後台選項。<b>{'已套用你的 Kagayaki 手動選擇；其他兩支仍保留為選項。' if contract['weaponReview']['selectedCandidateId'] else '尚未套用裁決，不會自動切換。'}</b></div>
<h2>一、核對三支法杖</h2><div id="weapons" class="grid"></div>{'' if contract['weaponReview']['selectedCandidateId'] else '<div class="buttons"><button id="clearWeapon">清除法杖選擇</button></div>'}
<h2>二、已核准死亡演出</h2><div class="card"><p>原作解包範圍沒有獨立 death，hurt/death 都播放原生 <code>GGD_native_down</code>。你核准的「down＋整體升天淡出」已由既有 ChampionView 死亡流程提供：倒地 3 秒，再升高並淡出 1.4 秒。</p>
<div class="buttons"><button id="nativeDeath">播放原生 down</button><button id="fadeDeath">預覽 down＋升天淡出</button></div>
<div id="deathStage"><div id="deathFrame" class="review-frame" data-state="hurt" role="img" aria-label="死亡演出三幀預覽"></div></div>
<div class="frame-status"><b>可見證據圖</b><span>實際 Babylon WebGL：0%／50%／100%</span></div>
<label class="pick"><input type="radio" name="death" value="popp-native-down-rise-fade-v1" {'checked disabled' if contract['weaponReview']['selectedCandidateId'] else ''}> 已核准 down＋升天淡出</label></div>
<h2>三、五項權威整合狀態（已關閉 {contract['closedIntegrationGapCount']}，剩餘 {contract['remainingOpenIntegrationGapCount']}）</h2><ol id="gaps"></ol>
<p class="note">{contract['vfxRuntimeCandidates']['summary']['releasedDocuments']} 個 owner 核准重建候選已有正式 VFX ID；{contract['vfxBindingReviewProposals']['proposedCandidateCount']} 個來源名稱關係只保留為 Q/W/R 審查提案，5 個 reserve 保留未配對。作用中技能維持既有共用 VFX。精確原生 Niagara 時序與 root-specific mesh layer 尚未恢復，不冒稱原生完整重建。音訊 {contract['eventAudioReviewGate']['candidateCount']} 項已核准 {contract['eventAudioReviewGate']['reviewedCount']} 項，音訊事件身分與 runtime 綁定另行追蹤；原逐項收據仍由 <a href="/asset-review-portal.html">統一審查中心</a> 提供。</p>
<h2>四、VFX 語意配對（候選，未綁定）</h2><div id="vfxProposals" class="grid"></div><p class="note">12 個重建預覽已有 owner 視覺核准；7 個既有來源名稱提案仍待逐技能核准，5 個語意未對應 reserve 維持未綁定。</p>
<h2>五、匯出裁決</h2><p class="note">匯出 JSON 後交回整合工作流；只有明確核准值才可套用。瀏覽器也會在這台裝置的 localStorage 保存草稿。</p>
<textarea id="reviewNote" placeholder="選擇理由、要修的顏色或動作問題"></textarea><div class="buttons"><button id="export">下載裁決 JSON</button></div></main>
<script id="contract" type="application/json">{encoded}</script><script>
const D=JSON.parse(document.getElementById('contract').textContent), key='ggd-popp-review:'+D.sourceFingerprint;
const state=Object.assign({{weaponCandidateId:D.weaponReview.selectedCandidateId,deathCandidateId:D.weaponReview.selectedCandidateId?'popp-native-down-rise-fade-v1':null,note:''}},JSON.parse(localStorage.getItem(key)||'{{}}'));
const save=()=>{{state.note=document.getElementById('reviewNote').value;localStorage.setItem(key,JSON.stringify(state));renderChosen()}};
const wrap=document.getElementById('weapons');
for(const c of D.weaponReview.candidates){{const sheet=c.validation.reviewContactSheet,locked=!!D.weaponReview.selectedCandidateId;const card=document.createElement('section');card.className='card';card.dataset.id=c.candidateId;card.innerHTML=`<h3>${{c.staff}}</h3><p>${{c.nativeCharacterId}}</p><div class="review-frame" data-state="idle" role="img" aria-label="${{c.staff}} idle 三幀預覽" style="background-image:url('/${{sheet.publicPath}}')"></div><div class="frame-status"><b>可見證據圖</b><span>實際 WebGL：0%／50%／100%</span></div><div class="buttons">${{sheet.states.map(x=>`<button data-clip="${{x}}" class="${{x==='idle'?'active':''}}">${{x}}</button>`).join('')}}</div><label class="pick"><input type="radio" name="weapon" value="${{c.candidateId}}" ${{locked?'disabled':''}}> ${{locked?(c.candidateId===D.weaponReview.selectedCandidateId?'已核准並鎖定':'保留後台候選'):'選為預設法杖'}}</label><p class="meta"><code>${{c.glb.sha256}}</code><br>${{c.nativeAnimationCount}} 段原生動作 · 後台選項已存在 · 正式站未驗</p>`;card.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>{{const frame=card.querySelector('.review-frame');frame.dataset.state=b.dataset.clip;frame.setAttribute('aria-label',c.staff+' '+b.dataset.clip+' 三幀預覽');card.querySelectorAll('[data-clip]').forEach(x=>x.classList.toggle('active',x===b))}});wrap.append(card)}}
function renderChosen(){{document.querySelectorAll('#weapons .card').forEach(x=>x.classList.toggle('chosen',x.dataset.id===state.weaponCandidateId));document.querySelectorAll('input[name=weapon]').forEach(x=>x.checked=x.value===state.weaponCandidateId);document.querySelectorAll('input[name=death]').forEach(x=>x.checked=x.value===state.deathCandidateId)}}
document.querySelectorAll('input[name=weapon]').forEach(x=>x.onchange=()=>{{state.weaponCandidateId=x.value;save()}});document.querySelectorAll('input[name=death]').forEach(x=>x.onchange=()=>{{state.deathCandidateId=x.value;save()}});
const clearWeapon=document.getElementById('clearWeapon');if(clearWeapon)clearWeapon.onclick=()=>{{state.weaponCandidateId=null;save()}};
document.getElementById('gaps').innerHTML=D.fiveOpenIntegrationGaps.map(g=>{{const gates=g.closureGates.map(x=>`<li class="${{x.verified?'gate-ok':'gate-blocked'}}"><b>${{x.verified?'已驗證':'阻擋'}}</b> · ${{x.nameZh}}：${{x.detail}}</li>`).join('');return `<li><b>${{g.nameZh}}</b> <code>${{g.id}}</code> · <span class="status">${{g.closed?'closed':'remaining'}}／${{g.status}}</span><br><span class="note">${{g.evidence}}</span><br><span class="note">Gate：${{g.closureGateSummary.verified}}/${{g.closureGateSummary.total}} 已驗證，${{g.closureGateSummary.blocked}} 項阻擋。</span><ul class="gates">${{gates}}</ul><span class="note">關閉條件：${{g.closureCriteria.join('；')}}</span><br><span class="note">審查規則：${{g.ownerReviewPolicy}}</span></li>`}}).join('');
document.getElementById('vfxProposals').innerHTML=D.vfxBindingReviewProposals.abilities.map(x=>`<section class="card"><h3>${{x.abilityId}} · ${{x.abilityNameZh}}</h3><p>${{x.semantic}}</p><p>${{x.candidateIds.map(id=>`<code>${{id}}</code>`).join('<br>')}}</p><p class="note">${{x.rationale}}</p><span class="status">預覽已核准／候選未綁定</span></section>`).join('')+`<section class="card"><h3>保留未配對</h3><p>${{D.vfxBindingReviewProposals.reserveCandidateIds.map(id=>`<code>${{id}}</code>`).join('<br>')}}</p><p class="note">${{D.vfxBindingReviewProposals.reserveReason}}</p></section>`;
const death=document.getElementById('deathFrame'), selected=D.weaponReview.candidates.find(x=>x.candidateId===D.weaponReview.selectedCandidateId)||D.weaponReview.candidates[0],base=selected.validation.reviewContactSheet;death.style.backgroundImage=`url('/${{base.publicPath}}')`;function native(){{death.classList.remove('rise');void death.offsetWidth}}document.getElementById('nativeDeath').onclick=native;document.getElementById('fadeDeath').onclick=()=>{{native();requestAnimationFrame(()=>death.classList.add('rise'))}};native();
document.getElementById('reviewNote').value=state.note;document.getElementById('reviewNote').oninput=save;renderChosen();
document.getElementById('export').onclick=()=>{{save();const out={{schema:'ggd.popp-integration-review-decision@1',sourceFingerprint:D.sourceFingerprint,heroId:D.heroId,weaponCandidateId:state.weaponCandidateId,deathCandidateId:state.deathCandidateId,note:state.note}};const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(out,null,2)+'\\n'],{{type:'application/json'}}));a.download='popp-integration-review-decision.json';a.click();URL.revokeObjectURL(a.href)}};
</script></body></html>\n'''


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    contract = build_contract()
    json_payload = json.dumps(contract, ensure_ascii=False, indent=2) + "\n"
    # The ledger references the exact review bytes. Materialise that payload in
    # memory first, then compute the same evidence shape used after writing.
    review_bytes = json_payload.encode("utf-8")
    ledger = build_gap_ledger(contract)
    ledger["reviewContract"] = {
        "gitPath": OUTPUT_JSON.relative_to(ROOT).as_posix(),
        "bytes": len(review_bytes),
        "sha256": hashlib.sha256(review_bytes).hexdigest(),
    }
    ledger_payload = json.dumps(ledger, ensure_ascii=False, indent=2) + "\n"
    html_payload = build_html(contract)
    if args.check:
        failures = []
        for path, expected in ((OUTPUT_JSON, json_payload), (OUTPUT_GAP_LEDGER, ledger_payload), (OUTPUT_HTML, html_payload)):
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
    OUTPUT_GAP_LEDGER.write_text(ledger_payload, encoding="utf-8")
    OUTPUT_HTML.write_text(html_payload, encoding="utf-8")
    for staff, source in CONTACT_SHEETS.items():
        shutil.copyfile(source, OUTPUT_ASSET_DIR / f"{staff.lower()}-contact-sheet.png")
    print(json.dumps({"json": str(OUTPUT_JSON), "html": str(OUTPUT_HTML), "sourceFingerprint": contract["sourceFingerprint"]}))


if __name__ == "__main__":
    main()

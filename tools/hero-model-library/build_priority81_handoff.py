#!/usr/bin/env python3
"""Build the 81-hero Main review handoff from local evidence, without mutation elsewhere.

Run after registration/inventory refresh. --check recomputes file hashes and output
bytes; exit 1 means the committed handoff is stale, not that all assets are absent.
Only the two named handoff outputs are written. No downloads, Git writes or S3.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
from urllib.parse import quote


BASE = "materials/hero-model-library"
JSON_NAME = "priority-81-handoff.json"
MD_NAME = "81英雄優先合併清單.md"
STATES = ("idle", "run", "attack", "cast", "hurt", "death")
KEY = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:-]*\Z")


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def sha_file(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def audio_paths(value):
    """Collect explicit content audio paths, never infer them from a model donor."""
    if isinstance(value, str):
        return {value} if value.startswith("assets/audio/") else set()
    children = value.values() if isinstance(value, dict) else value if isinstance(value, list) else []
    result = set()
    for child in children:
        result.update(audio_paths(child))
    return result


def glb_json(path):
    """Read the actual GLB JSON chunk; reject pointers, truncated or malformed GLB."""
    with path.open("rb") as stream:
        header = stream.read(12)
        if len(header) != 12:
            raise ValueError("truncated GLB header")
        magic, version, length = struct.unpack("<4sII", header)
        if magic != b"glTF" or version != 2 or length != path.stat().st_size:
            raise ValueError("not a complete GLB v2 (including Git LFS pointers)")
        chunk = stream.read(8)
        if len(chunk) != 8:
            raise ValueError("missing GLB JSON chunk")
        size, kind = struct.unpack("<I4s", chunk)
        if kind != b"JSON" or size > length - 20:
            raise ValueError("invalid GLB JSON chunk")
        result = json.loads(stream.read(size).rstrip(b" \0"))
        if not isinstance(result, dict):
            raise ValueError("GLB JSON must be an object")
        return result


class Builder:
    def __init__(self, repo, audio_report):
        self.repo = repo.resolve()
        self.audio_report = audio_report.resolve()
        tracked = subprocess.run(["git", "-C", str(self.repo), "ls-files", "-z"],
                                 check=True, capture_output=True).stdout
        self.tracked = set(tracked.decode().split("\0"))
        self.inputs = {}
        self.documents = {}
        self.glbs = {}

    def evidence(self, path):
        path = path.resolve()
        try:
            git_path = path.relative_to(self.repo).as_posix()
        except ValueError:
            git_path = None
        identity = git_path or str(path)
        if identity not in self.inputs:
            exists = path.is_file()
            self.inputs[identity] = {
                "gitPath": git_path, "localPath": str(path), "existsLocal": exists,
                "gitTracked": git_path in self.tracked if git_path else False,
                "bytes": path.stat().st_size if exists else None,
                "sha256": sha_file(path) if exists else None,
            }
        return dict(self.inputs[identity])

    def read(self, path):
        path = path.resolve()
        evidence = self.evidence(path)
        if str(path) not in self.documents:
            if not evidence["existsLocal"]:
                raise ValueError(f"Missing input: {path}")
            try:
                self.documents[str(path)] = json.loads(path.read_text())
            except ValueError as error:
                raise ValueError(f"Cannot parse {path}: {error}") from error
        return self.documents[str(path)]

    def model_chain(self, key):
        chain, errors = [], []
        while key:
            if not isinstance(key, str) or not KEY.fullmatch(key):
                errors.append(f"invalid source model key: {key!r}")
                break
            if key in [row["modelKey"] for row in chain]:
                errors.append(f"model provenance cycle at {key}")
                break
            path = self.repo / "content/models" / (key + ".json")
            row = {"modelKey": key, "document": self.evidence(path)}
            chain.append(row)
            try:
                doc = self.read(path)
            except ValueError as error:
                errors.append(str(error))
                break
            if doc.get("id") != key:
                errors.append(f"model document ID mismatch: {key}")
                break
            version = doc.get("bodyVersion")
            if version is None:
                break
            if not isinstance(version, dict) or not version.get("sourceModelKey"):
                errors.append(f"missing bodyVersion.sourceModelKey: {key}")
                break
            key = version["sourceModelKey"]
        return chain, errors

    def model(self, version, options):
        key = version["modelKey"]
        chain, errors = self.model_chain(key)
        doc = self.documents.get(str(self.repo / "content/models" / (key + ".json")), {})
        source_keys = [row["modelKey"] for row in chain]
        meta = next((options[k] for k in source_keys if k in options), {})
        clip_map = doc.get("clipMap") or {}
        animations, glb_evidence = [], None
        external_dependencies = []
        glb_path = doc.get("glbPath")
        if glb_path:
            path = (self.repo / "content" / glb_path).resolve()
            if not path.is_relative_to(self.repo / "content"):
                errors.append("GLB path escapes content directory")
            else:
                glb_evidence = self.evidence(path)
                try:
                    if str(path) not in self.glbs:
                        self.glbs[str(path)] = glb_json(path)
                    glb = self.glbs[str(path)]
                    animations = [{"index": i, "name": a.get("name"),
                                   "channelCount": len(a.get("channels", [])),
                                   "samplerCount": len(a.get("samplers", [])),
                                   "extras": a.get("extras")}
                                  for i, a in enumerate(glb.get("animations", []))]
                    for resource in glb.get("images", []) + glb.get("buffers", []):
                        uri = resource.get("uri")
                        if uri and not uri.startswith("data:"):
                            dependency = (path.parent / uri).resolve()
                            if ":" in uri or not dependency.is_relative_to(self.repo / "content"):
                                errors.append(f"external/unresolved GLB dependency: {uri}")
                            else:
                                ev = self.evidence(dependency)
                                external_dependencies.append(ev)
                                if not ev["existsLocal"]:
                                    errors.append(f"missing GLB dependency: {uri}")
                except (OSError, ValueError, struct.error) as error:
                    errors.append(f"GLB inspection failed: {error}")
        else:
            errors.append("model has no glbPath")
        names = [a["name"] for a in animations]
        missing_states = [state for state in STATES if not clip_map.get(state)]
        unresolved = {k: v for k, v in clip_map.items() if v not in names}
        if missing_states:
            errors.append("missing state mappings: " + ", ".join(missing_states))
        if unresolved:
            errors.append("clipMap names absent from GLB: " + json.dumps(unresolved, ensure_ascii=False))
        expected_binary = version.get("binarySha256")
        if expected_binary and glb_evidence and expected_binary != glb_evidence["sha256"]:
            errors.append("registered binarySha256 differs from current GLB")
        placeholder = any(k in {"champ.thorne", "champ.sela"} for k in source_keys)
        if placeholder:
            errors.append("engine placeholder remains in model provenance")
        metadata_matches = bool(meta and glb_evidence and meta.get("sha256") == glb_evidence["sha256"])
        # A source key can be updated while an older frozen version remains valid.
        # Do not apply the new binary's validation/native counts to the old version.
        limits = list(meta.get("limitations") or []) if metadata_matches else []
        native = meta.get("nativeAnimationCount") if metadata_matches else None
        procedural = meta.get("proceduralAnimationCount") if metadata_matches else None
        return {
            "modelKey": key, "label": version.get("label"),
            "sourceModelKey": version.get("sourceModelKey") or (source_keys[-1] if source_keys else None),
            "source": version.get("source") or {},
            "automaticEligible": version.get("automaticEligible"),
            "document": chain[0]["document"] if chain else None,
            "glb": glb_evidence, "externalDependencies": external_dependencies,
            "sourceChain": chain, "clipMap": clip_map,
            "mappedStateCount": len(clip_map), "distinctMappedClipCount": len(set(clip_map.values())),
            "animations": animations, "actualAnimationCount": len(animations),
            "actualAnimationNames": names,
            "nativeAnimationCountDeclaredBySourceIndex": native,
            "proceduralAnimationCountDeclaredBySourceIndex": procedural,
            "motionProvenanceEvidence": {"modelOptionId": meta.get("id"),
                                         "binaryShaMatches": metadata_matches,
                                         "validation": meta.get("validation") if metadata_matches else None,
                                         "limitations": limits},
            "readiness": {"localFilesAndMappingsPass": not errors,
                          "gitTracked": bool(glb_evidence and glb_evidence["gitTracked"] and
                                             chain and chain[0]["document"]["gitTracked"]),
                          "placeholder": placeholder,
                          "visualAndGameplayAcceptance": "not-established-by-this-index"},
            "gaps": errors,
        }

    def raw_supplements(self):
        base = self.repo.parent / "GGD-Asset-Library/intake/public-models-20260911"
        specs = [
            ("伊藤開司", "parallel-kaiji-source-audit", "delivery-receipt.json", "model-pending-conversion"),
            ("不知火舞", "mai-doa6-gtasa-motion-round23", "handoff-receipt.json", "animation-pending-retargeting"),
        ]
        rows = []
        for name, directory, receipt_name, state in specs:
            root = base / directory
            entry_path, receipt_path = root / "public-source-entry.json", root / receipt_name
            row = {"character": name, "localRoot": str(root), "status": state,
                   "countsAsFinishedModelOrMotion": False,
                   "entry": self.evidence(entry_path), "delivery": self.evidence(receipt_path)}
            if entry_path.is_file():
                entry = self.read(entry_path)
                row.update({"id": entry.get("id"), "heroIds": entry.get("heroIds", []),
                            "sourceUrl": entry.get("url"), "sourceLineage": entry.get("sourceLineage"),
                            "readiness": entry.get("readiness"), "assetKinds": entry.get("assetKinds", [])})
            if receipt_path.is_file():
                receipt = self.read(receipt_path)
                row["sourceCounts"] = {k: receipt[k] for k in
                                       ("ifpFiles", "clipCount", "normalPortClips", "customVariantClips",
                                        "newBodyCount", "newNativeAnimationCount", "newAudioCount") if k in receipt}
                if receipt.get("manifestPath"):
                    row["immutableDelivery"] = self.evidence(Path(receipt["manifestPath"]))
            rows.append(row)
        return rows

    def build(self):
        reg = self.read(self.repo / BASE / "priority-registration.json")
        inventory = self.read(self.repo / BASE / "inventory.json")
        policy = self.read(self.repo / BASE / "default-policy.json")
        registration_rows = reg["heroes"]
        ids = [r["heroId"] for r in registration_rows]
        if len(ids) != 81 or len(set(ids)) != 81:
            raise ValueError("priority-registration.json must contain exactly 81 distinct hero IDs")
        by_id = {h["id"]: h for h in inventory["heroes"]}
        aliases = inventory.get("aliases", {})
        options = {}
        for name in ("workflow-model-options.json", "priority-runtime-options.json"):
            for option in self.read(self.repo / BASE / name).get("models", []):
                options[option["modelKey"]] = option
        audio_evidence = self.evidence(self.audio_report)
        audio = self.read(self.audio_report) if audio_evidence["existsLocal"] else {}
        if audio and audio.get("schema") != "ggd.priority81.per-hero-audio@1":
            raise ValueError("Unsupported per-hero audio audit schema")
        audio_rows = audio.get("heroes", [])
        audio_by_id = {row["heroId"]: row for row in audio_rows}
        if len(audio_by_id) != len(audio_rows):
            raise ValueError("Duplicate hero IDs in audio audit")
        audio_artifacts = []
        for name in ("summary.json", "files.sha256.json", "group-audit.json", "input-index-pins.json",
                     "content-audio-files.json", "main-committed-clip-audit.json",
                     "main-original-source-index-join.json", "main-original-source-mappings.json",
                     "main-committed-index-pins.json", "main-committed-summary.json"):
            path = self.audio_report.parent / name
            if path.is_file():
                audio_artifacts.append(self.evidence(path))
        audio_summary_path = self.audio_report.parent / "summary.json"
        audio_summary = self.read(audio_summary_path) if audio_summary_path.is_file() else {}
        main_files_path = self.audio_report.parent / "main-committed-clip-audit.json"
        main_files = self.read(main_files_path).get("files", []) if main_files_path.is_file() else []
        runtime_files_path = self.audio_report.parent / "content-audio-files.json"
        runtime_files = self.read(runtime_files_path).get("files", []) if runtime_files_path.is_file() else []
        runtime_file_audit = {f["contentPath"]: f for f in runtime_files}
        audio_main_by_id = {}
        for audio_file in main_files:
            audio_main_by_id.setdefault(audio_file["heroId"], []).append(audio_file)
        # A branch supplement is independent of the immutable Main audit. Never
        # rewrite mainCommittedVoice/Files to make unmerged additions look merged.
        overlay_path = self.audio_report.parent.parent / "current-branch-audio/overlay.json"
        overlay_evidence = self.evidence(overlay_path)
        overlay, overlay_by_id, overlay_files_by_id = {}, {}, {}
        if overlay_evidence["existsLocal"]:
            overlay = self.read(overlay_path)
            if overlay.get("schema") != "ggd.priority81.audio-branch-overlay@1" or overlay.get("baselineUnmodified") is not True:
                raise ValueError("Unsupported current-branch audio overlay")
            for pin in overlay["inputs"]:
                path = self.repo / pin["gitPath"] if pin.get("gitPath") else Path(pin["localPath"])
                actual = self.evidence(path)
                if actual["sha256"] != pin["sha256"] or actual["bytes"] != pin["bytes"]:
                    raise ValueError(f"Current-branch audio overlay is stale: {path}; rerun build_priority81_audio_overlay.py")
            pinned_baseline = next((p for p in overlay["inputs"] if p.get("gitPath") == audio_evidence["gitPath"]), None)
            if not pinned_baseline or pinned_baseline["sha256"] != audio_evidence["sha256"]:
                raise ValueError("Audio overlay references a different frozen Main baseline")
            for name in ("overlay.json", "current-per-hero.json", "receipt.json"):
                audio_artifacts.append(self.evidence(overlay_path.parent / name))
            overlay_by_id = {h["heroId"]: h for h in overlay["heroes"]}
            for row in overlay["files"]:
                if row.get("mainMerged") is not False:
                    raise ValueError("Branch audio additions must not claim Main merged")
                overlay_files_by_id.setdefault(row["heroId"], []).append(row)
        current_audio_paths = {f["clip"] for f in main_files} | {f["clip"] for f in overlay.get("files", [])}
        if overlay and overlay["summary"]["currentUniqueClipPaths"] != len(current_audio_paths):
            raise ValueError("Audio overlay count does not match distinct current paths")
        derivatives = policy.get("approvedDerivatives", [])
        derivative_by_id = {d["heroId"]: d for d in derivatives}
        if len(derivative_by_id) != 11:
            raise ValueError("Expected the 11 explicitly approved derivative heroes")
        manual = [{"heroId": h["id"], "name": h["name"],
                   "inventoryDefaultKey": (h.get("default") or {}).get("key"),
                   "checkoutSelection": h.get("checkoutSelection")}
                  for h in inventory["heroes"] if h.get("defaultSelectionMode") == "manual"]
        heroes = []
        for r in registration_rows:
            hero_id = r["heroId"]
            if hero_id not in by_id:
                raise ValueError(f"81 hero missing from inventory: {hero_id}")
            inv = by_id[hero_id]
            runtime_id = r.get("runtimeHeroId") or inv.get("runtimeHeroId") or aliases.get(hero_id, hero_id)
            champion_path = self.repo / "content/champions" / (runtime_id + ".json")
            c = self.read(champion_path)
            if c.get("id") != runtime_id:
                raise ValueError(f"Champion ID mismatch: {champion_path}")
            active_key = c.get("modelKey")
            versions = list(c.get("modelVersions") or [])
            keys = [v["modelKey"] for v in versions]
            gaps = []
            if len(keys) != len(set(keys)):
                raise ValueError(f"Duplicate registered model keys: {hero_id}")
            if active_key and active_key not in keys:
                versions.append({"modelKey": active_key, "label": "active model without version row"})
                gaps.append("active model lacks a modelVersions row")
            if active_key != r.get("after", {}).get("activeModelKey"):
                gaps.append("registration after.activeModelKey differs from current champion")
            if not active_key:
                gaps.append("champion has no active model")
            models = [self.model(v, options) for v in versions]
            active = next((m for m in models if m["modelKey"] == active_key), None)
            if active:
                gaps.extend(active["gaps"])
            a = audio_by_id.get(hero_id) or audio_by_id.get(runtime_id)
            branch = overlay_by_id.get(hero_id) or overlay_by_id.get(runtime_id)
            branch_voice = branch["currentBranchVoice"] if branch else None
            if a is None:
                gaps.append("per-hero audio audit not available")
            else:
                pack = branch_voice or a.get("mainCommittedVoice") or {}
                jp = a.get("projectSevenJapaneseSupplement") or {}
                if jp.get("localShaVerifiedFiles", 0) and not pack.get("uniqueClipCount", 0):
                    gaps.append("戰鬥語音待綁定")
                elif pack.get("missingExtended11Categories"):
                    gaps.append("語音缺 " + "/".join(pack["missingExtended11Categories"]))
            finished_audio = []
            for f in audio_main_by_id.get(hero_id, audio_main_by_id.get(runtime_id, [])):
                ev = self.evidence(self.repo / "content" / f["clip"])
                match = ev["sha256"] == f["sha256"]
                finished_audio.append({**ev, "classification": f["classification"],
                                       "categories": f["categories"], "auditSha256": f["sha256"],
                                       "currentMatchesAudit": match, "speakerVerified": False})
                if not match:
                    gaps.append("committed audio no longer matches audit: " + f["clip"])
            branch_additions = []
            for f in overlay_files_by_id.get(hero_id, overlay_files_by_id.get(runtime_id, [])):
                ev = self.evidence(self.repo / "content" / f["clip"])
                if ev["sha256"] != f["sha256"]:
                    raise ValueError("Current-branch audio differs from overlay: " + f["clip"])
                branch_additions.append({**ev, "classification": f["classification"],
                                         "categories": f["categories"], "contentKind": f["contentKind"],
                                         "auditSha256": f["sha256"], "currentMatchesAudit": True,
                                         "publicationState": f["publicationState"], "mainMerged": False,
                                         "speakerVerified": False, "originalCharacterPerformance": False,
                                         "excludedFromSpeechInput": f.get("excludedFromSpeechInput", False),
                                         "originalFile": f["originalFile"], "sourceMetadata": f["sourceMetadata"]})
            runtime_audio = []
            for p in sorted(audio_paths({"voice": (a or {}).get("runtimeVoice"),
                                         "sfx": (a or {}).get("runtimeSfx")})):
                ev = self.evidence(self.repo / "content" / p)
                expected = runtime_file_audit.get(p, {}).get("sha256")
                ev.update({"auditSha256": expected,
                           "currentMatchesAudit": ev["sha256"] == expected if expected else None})
                runtime_audio.append(ev)
                if expected and not ev["currentMatchesAudit"]:
                    gaps.append("runtime audio no longer matches audit: " + p)
            if any(not ev["existsLocal"] for ev in runtime_audio):
                gaps.append("runtime audio contains missing local files")
            approved = derivative_by_id.get(hero_id)
            if approved and not any(m["sourceModelKey"] == approved["modelKey"] for m in models):
                gaps.append("approved derivative absent from registered candidates")
            inventory_options = [{k: o.get(k) for k in
                                  ("key", "id", "name", "work", "tier", "library", "kind", "ready", "selectionClass")}
                                 for o in inv.get("options", [])]
            heroes.append({
                "heroId": hero_id, "runtimeHeroId": runtime_id, "name": inv["name"], "work": inv.get("work"),
                "champion": self.evidence(champion_path), "activeModelKey": active_key,
                "selectionMode": c.get("modelSelectionMode"),
                "registeredCandidateKeys": [m["modelKey"] for m in models],
                "inventoryCandidateKeys": [o["key"] for o in inventory_options],
                "inventoryCandidates": inventory_options, "candidateModels": models,
                "inventoryReadinessSnapshot": {"default": inv.get("default"), "pending": inv.get("pending", [])},
                "approvedDerivative": approved,
                "audio": {"auditReport": audio_evidence, "auditHeroId": a.get("heroId") if a else None,
                          "status": "per-hero-audited" if a else "pending-audit", "data": a,
                          "mainCommittedFiles": finished_audio, "runtimeAudioFiles": runtime_audio,
                          "currentBranchVoice": branch_voice, "currentBranchAdditions": branch_additions,
                          "currentBranchFiles": finished_audio + branch_additions},
                "gaps": gaps,
            })
        supplements = self.raw_supplements()
        active_models = [next((m for m in h["candidateModels"] if m["modelKey"] == h["activeModelKey"]), None)
                         for h in heroes]
        inputs = [self.inputs[key] for key in sorted(self.inputs)]
        # Prevent publishing a mixed snapshot while another workflow edits inputs.
        for row in inputs:
            p = Path(row["localPath"])
            if p.is_file() != row["existsLocal"] or (p.is_file() and sha_file(p) != row["sha256"]):
                raise ValueError(f"Input changed during generation: {p}; retry after the writer completes")
        return {
            "schema": "ggd.priority81.handoff@1", "generator": "tools/hero-model-library/build_priority81_handoff.py",
            "generatorSha256": sha_file(Path(__file__).resolve()),
            "scope": "Main review and merge of existing 81-hero content; Root owns remaining conversions",
            "inputsSha256": hashlib.sha256(json_bytes(inputs)).hexdigest(), "inputs": inputs,
            "rules": {"priority": policy["priority"], "priorityLabels": policy["priorityLabels"],
                      "canonicalGameDefinition": policy.get("canonicalGameDefinition"),
                      "preserveManualSelections": True, "expectedExistingManualCount": 15,
                      "observedExistingManualCount": len(manual), "existingManualSelections": manual,
                      "preserveApprovedDerivativeCount": 11, "approvedDerivatives": derivatives,
                      "allCandidatesRetained": True, "downloadedRawIsNotReady": True,
                      "stateMappingsAreNotNativeAnimationCounts": True,
                      "sourceLabelledVoiceIsNotListeningVerified": True},
            "summary": {"heroCount": len(heroes),
                        "activeModelFilesAndMappingsPass": sum(bool(m and m["readiness"]["localFilesAndMappingsPass"]) for m in active_models),
                        "activeModelsGitTracked": sum(bool(m and m["readiness"]["gitTracked"]) for m in active_models),
                        "activePlaceholderCount": sum(bool(m and m["readiness"]["placeholder"]) for m in active_models),
                        "registeredCandidateCount": sum(len(h["candidateModels"]) for h in heroes),
                        "perHeroAudioAudits": sum(h["audio"]["status"] == "per-hero-audited" for h in heroes),
                        "heroesWithReportedGaps": sum(bool(h["gaps"]) for h in heroes),
                        "mainBaselineAudioFiles": len({f["clip"] for f in main_files}),
                        "currentBranchAudioAdditions": len(overlay.get("files", [])),
                        "currentBranchAudioFiles": len(current_audio_paths),
                        "mainMergedAudioAdditions": False,
                        "productionDeploymentVerified": False,
                        "all81NativeAudioOrMotionComplete": False},
            "audioAudit": audio_evidence, "audioEvidenceFiles": audio_artifacts,
            "currentBranchAudioOverlay": {"report": overlay_evidence, "summary": overlay.get("summary")},
            "audioSummary": audio_summary, "heroes": heroes, "rawSupplements": supplements,
        }


def cell(value):
    if value is None:
        return "—"
    if not isinstance(value, str):
        value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return value.replace("|", "&#124;").replace("\n", "<br>")


def file_link(evidence):
    if not evidence:
        return "—"
    label = evidence.get("gitPath") or evidence["localPath"]
    # Repository paths remain portable when rendered on GitHub.
    target = "../../" + quote(label, safe="/.-_") if evidence.get("gitPath") else quote(label, safe="/.-_")
    return f"[{cell(label)}](<{target}>)；SHA `{evidence.get('sha256') or 'missing'}`"


def render(data):
    """Keep the review sheet to 81 rows; detailed evidence lives in the JSON."""
    summary, rules = data["summary"], data["rules"]
    audio_summary = data.get("audioSummary", {})
    committed = audio_summary.get("mainCommittedVoice", {})
    classes = committed.get("classificationCounts", {})
    lines = ["# 81 英雄優先合併清單", "",
             f"交 Main 審查合併：**81 位英雄、{summary['registeredCandidateCount']} 個已登記候選**。"
             f"{summary['activeModelFilesAndMappingsPass']}/81 個作用中模型通過本機檔案與映射檢查；"
             f"{summary['activePlaceholderCount']} 個仍為佔位。剩餘轉換由 Root 負責。", "",
             f"Main 已合併音訊基準：{committed.get('heroesWithCommittedCharacterPack', 0)} 位有 "
             f"{committed.get('uniqueClipPaths', 0)} 個成品檔（來源沿用 "
             f"{classes.get('source-file-reused-not-speaker-verified', 0)}、自身參考合成 "
             f"{classes.get('synthetic-own-reference-labelled', 0)}、借用參考合成 "
             f"{classes.get('synthetic-donor-reference', 0)}）；另 LoL 7 位有 "
             f"{audio_summary.get('sevenJapaneseFileRows', 0)} 個日文 WAV 儲備待綁定。", "",
             (f"本分支目前共 **{summary.get('currentBranchAudioFiles', 0)} 個成品音訊檔**："
              f"新增 {summary.get('currentBranchAudioAdditions', 0)} 檔鐵路廣播／發車音樂，補上如月列車 taunt、victory；"
              "**新增項仍待 Main 合併**。表格採本分支現況，凍結 Main 基準保留於 JSON。"
              if summary.get("currentBranchAudioAdditions") else ""), "",
             "保留 **15 筆手動指定與 11 支認可加工副本**，全部候選供後台選用。預設順位："
             + " ＞ ".join(rules["priorityLabels"][k] for k in rules["priority"]) + "。", "",
             "表中 GLB 段數為實際剪輯數，六個狀態映射可共用剪輯，不能當作六段原生動作。"
             "音訊「原」是來源檔沿用、說話者未逐段核對；「合」含借用參考合成。JP 為日文来源標記，逐段待聽審。"
             "本清單不宣稱全 81 原生動作／音效完成或正式站部署驗收。", "",
             "| 英雄 ID／名稱 | 角色出處；模型來源 | 作用中 modelKey | GLB 段 | 候選 | 成品音訊／JP 儲備 | 缺口 |",
             "| --- | --- | --- | ---: | ---: | --- | --- |"]
    for hero in data["heroes"]:
        model = next((m for m in hero["candidateModels"] if m["modelKey"] == hero["activeModelKey"]), {})
        source = model.get("source", {})
        key = hero["activeModelKey"] or "missing"
        label = key if len(key) <= 26 else key[:22] + "…"
        path = (model.get("document") or {}).get("gitPath")
        link = f"[{label}](../../{quote(path, safe='/.-_')})" if path else cell(label)
        audio = hero["audio"].get("data") or {}
        branch_voice = hero["audio"].get("currentBranchVoice")
        pack = branch_voice or audio.get("mainCommittedVoice") or {}
        jp = audio.get("projectSevenJapaneseSupplement") or {}
        total, original, synthetic = (pack.get(k, 0) for k in
                                      ("uniqueClipCount", "originalSourceLabelledCount", "syntheticCount"))
        jp_count = jp.get("localShaVerifiedFiles", 0)
        audio_label = f"{total}（原{original}／合{synthetic}）"
        if branch_voice:
            audio_label += f"；新增{len(hero['audio']['currentBranchAdditions'])}待合併"
        if jp_count:
            audio_label += f"；JP {jp_count} 未綁"
        gaps = ["佔位；新來源待轉換" if g == "engine placeholder remains in model provenance" else g
                for g in hero["gaps"]]
        source_label = f"{hero.get('work') or '未標'}；{source.get('character') or '未標'}／{source.get('library') or '未標'}"
        lines.append(f"| `{hero['heroId']}` {cell(hero['name'])} | {cell(source_label)} | {link} | "
                     f"{model.get('actualAnimationCount', 0)} | {len(hero['candidateModels'])} | "
                     f"{audio_label} | {cell('；'.join(gaps) or '—')} |")
    lines += ["", "補充儲備：伊藤開司新模型、Mai 的 DOA6→GTA SA 146 段 Normal＋16 段 Custom IFP 均待轉換，"
              "不計入已完成模型／動作；原包與 delivery 路徑保留在 JSON 的 `rawSupplements`。", "",
              "完整 282 候選、model/GLB 路徑與 SHA、clipMap、實際剪輯名稱、音訊逐檔分類與證據："
              "[priority-81-handoff.json](priority-81-handoff.json)。以下在專案根目錄查單一英雄：", "",
              "```sh", "jq --arg id community-review-03-20260907 '.heroes[] | select(.heroId == $id)' materials/hero-model-library/priority-81-handoff.json",
              "```", ""]
    rendered = "\n".join(lines).encode()
    if len(rendered) > 50_000:
        raise ValueError(f"Compact Markdown exceeded the 50 KB budget: {len(rendered)} bytes")
    return rendered


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--audio-report", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo = args.repo.resolve()
    audio = args.audio_report or repo / BASE / "priority-evidence/main-81-handoff/audio/per-hero.json"
    out = args.output_dir or repo / BASE
    data = Builder(repo, audio).build()
    products = {JSON_NAME: json_bytes(data), MD_NAME: render(data)}
    if args.check:
        stale = [str(out / name) for name, contents in products.items()
                 if not (out / name).is_file() or (out / name).read_bytes() != contents]
        if stale:
            print("STALE HANDOFF: " + ", ".join(stale), file=sys.stderr)
            return 1
    else:
        out.mkdir(parents=True, exist_ok=True)
        for name, contents in products.items():
            temporary = out / (name + ".tmp")
            with temporary.open("xb") as stream:
                stream.write(contents)
            os.replace(temporary, out / name)
    print(json.dumps({"check": args.check, **data["summary"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        print(f"HANDOFF ERROR: {error}", file=sys.stderr)
        raise SystemExit(2)

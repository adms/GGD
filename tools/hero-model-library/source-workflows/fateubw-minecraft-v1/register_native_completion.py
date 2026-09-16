#!/usr/bin/env python3
"""Register FateUBW formula/pre-post completion as local non-runtime reserves."""
import argparse
import hashlib
import json
from pathlib import Path


SOURCE_ID = "github-flemmli97-fateubw-07e9d79b"
STATUS = "native-motion-127-of-132-formula-baked-khronos-webgl-phase-validated-pending-parity-rights-event-map-backend"
BACKUP_RELATIVE = Path("materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2-s3-backup.json")


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pin(path):
    return {"path": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha(path)}


def require(value, message):
    if not value:
        raise ValueError(message)


def validated_backup(repo, batch):
    receipt_path = repo / BACKUP_RELATIVE
    receipt = read(receipt_path)
    require(receipt.get("schema") == "ggd-intake-backup-receipt@1", "unexpected S3 backup receipt schema")
    archive_sha = receipt.get("archiveSha256")
    prefix = "s3://ggd-390630837668-ap-east-2-an/legacy/conversions/fateubw-native-motion-completion-v2/"
    require(isinstance(archive_sha, str) and len(archive_sha) == 64,
            "S3 backup receipt has no archive SHA-256")
    require(receipt.get("s3Uri") == prefix + archive_sha + ".tar.gz",
            "S3 backup URI is outside the pinned FateUBW legacy destination")
    require(receipt.get("manifestUri") == prefix + archive_sha + ".files.json",
            "S3 backup manifest URI does not match the archive")
    require(receipt.get("fileCount") == 156 and receipt.get("archiveBytes") == 19555424,
            "S3 backup member or byte count drift")
    for key in ("fullGetVerified", "allMemberSha256Verified", "localUnchanged"):
        require(receipt.get(key) is True, "S3 backup verification is incomplete: " + key)
    require(Path(receipt.get("source", "")).resolve() == batch,
            "S3 backup source does not match this conversion batch")
    archive_path, readback_path, manifest_path = (
        Path(receipt[key]) for key in ("localArchive", "readback", "manifest")
    )
    require(archive_path.is_file() and readback_path.is_file() and manifest_path.is_file(),
            "local S3 backup or readback evidence is missing")
    require(sha(archive_path) == archive_sha and sha(readback_path) == archive_sha,
            "local archive/readback SHA-256 differs from S3 receipt")
    require(archive_path.stat().st_size == receipt["archiveBytes"]
            and readback_path.stat().st_size == receipt["archiveBytes"],
            "local archive/readback byte count differs from S3 receipt")
    manifest = read(manifest_path)
    require(manifest.get("schema") == "ggd-intake-backup-manifest@1"
            and manifest.get("source") == receipt["source"]
            and manifest.get("archiveSha256") == archive_sha
            and manifest.get("archiveBytes") == receipt["archiveBytes"]
            and manifest.get("s3Uri") == receipt["s3Uri"]
            and len(manifest.get("files", [])) == receipt["fileCount"],
            "local S3 member manifest differs from receipt")
    return receipt_path, receipt


def build(repo, batch, source):
    manifest_path = batch / "batch-manifest.json"
    webgl_path = batch / "completion-webgl-review.json"
    contact_path = batch / "completion-midpoint-contact-sheet.png"
    reproducibility_path = batch / "reproducibility.json"
    manifest, webgl, reproducibility = read(manifest_path), read(webgl_path), read(reproducibility_path)
    backup_path, backup = validated_backup(repo, batch)
    require(manifest.get("schema") == "ggd-fateubw-native-motion-reserve-batch@1", "unexpected batch manifest")
    require(manifest.get("counts") == {
        "sourceCharacters": 14, "convertedCharacters": 14, "pendingRestRotationCharacter": 0,
        "sourceClips": 132, "convertedNativeClips": 127, "unconvertedClips": 5,
        "skippedNoDurationOrEmptyClips": 5, "retainedUnsupportedClips": 0,
    }, "unexpected FateUBW completion counts")
    require(webgl.get("schema") == "ggd-fateubw-formula-motion-webgl-completion@1"
            and webgl.get("counts") == {"characters": 9, "clips": 15, "shots": 60}
            and webgl.get("allRequestedGroupsRendered") is True, "formula WebGL evidence incomplete")
    require(reproducibility.get("schema") == "ggd-fateubw-native-motion-completion-reproducibility@1"
            and reproducibility.get("allByteIdentical") is True
            and len(reproducibility.get("records", [])) == 14
            and all(row.get("match") is True for row in reproducibility.get("records", [])),
            "FateUBW completion batch is not byte-reproducible")
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    attempts = {row["id"]: row for row in source.get("conversionAttempts", [])}
    webgl_rows = {row["candidateId"]: row for row in webgl["records"]}
    rows, no_duration, formula_clips = [], [], []
    for record in manifest["records"]:
        candidate_id = record["candidateId"]
        require(candidate_id in candidates, "unknown FateUBW candidate: " + candidate_id)
        directory = batch / candidate_id
        report_path = directory / "conversion-report.json"
        structural_path = directory / "native-structural-readback.json"
        contract_path = directory / "contract-validation.json"
        report, structural, contract = read(report_path), read(structural_path), read(contract_path)
        require(report.get("output", {}).get("sha256") == sha(directory / "body.glb"), "body digest drift: " + candidate_id)
        require(structural.get("valid") is True, "structural readback failed: " + candidate_id)
        issues = contract.get("khronos", {}).get("issues", {})
        require(issues.get("numErrors") == 0 and issues.get("numWarnings") == 0 and issues.get("truncated") is False,
                "Khronos validation failed: " + candidate_id)
        require(contract.get("ggdInspection", {}).get("budget", {}).get("errors") == [],
                "GGD budget failed: " + candidate_id)
        converted = [clip for clip in report["clips"] if clip["converted"]]
        retained = [clip for clip in report["clips"] if not clip["converted"]]
        dynamic = [clip for clip in converted if clip.get("formulaChannelCount", 0) or clip.get("prePostChannelCount", 0)]
        for clip in retained:
            require(clip.get("sourceLength") is None and "without inventing playback duration" in clip.get("reason", ""),
                    "remaining clip is not an honest no-duration source pose: " + candidate_id + "/" + clip["name"])
            no_duration.append({"candidateId": candidate_id, **clip})
        for clip in dynamic:
            formula_clips.append({"candidateId": candidate_id, "name": clip["name"],
                                  "sourceLength": clip["sourceLength"],
                                  "formulaChannelCount": clip.get("formulaChannelCount", 0),
                                  "prePostChannelCount": clip.get("prePostChannelCount", 0),
                                  "sourceExpressions": sorted({expression for channel in clip["channels"]
                                                               for expression in channel.get("sourceExpressions", [])})})
        expected_dynamic_names = [clip["name"] for clip in dynamic]
        webgl_row = webgl_rows.get(candidate_id)
        require((webgl_row is None and not expected_dynamic_names)
                or (webgl_row is not None and webgl_row["clipNames"] == expected_dynamic_names),
                "WebGL dynamic clip set drift: " + candidate_id)
        previous = candidates[candidate_id].get("nativeMotionStandardization", {}).get("attemptId")
        if previous == candidate_id + "-native-motion-completion-v2":
            previous = attempts[previous].get("previousAttemptId")
        if not previous or previous == candidate_id + "-native-motion-completion-v2":
            legacy_id = candidate_id + "-native-motion-reserve-v1"
            previous = legacy_id if legacy_id in attempts else None
        require(previous and previous != candidate_id + "-native-motion-completion-v2",
                "previous native conversion lineage missing: " + candidate_id)
        rows.append({
            "candidateId": candidate_id,
            "heroIds": candidates[candidate_id].get("heroIds", []),
            "previousAttemptId": previous,
            "body": pin(directory / "body.glb"),
            "converterReport": pin(report_path),
            "structuralReadback": pin(structural_path),
            "contractValidation": pin(contract_path),
            "sourceClipCount": record["sourceClipCount"],
            "convertedNativeClipCount": record["convertedNativeClipCount"],
            "retainedNoDurationClipCount": record["unconvertedClipCount"],
            "convertedClipNames": record["convertedClipNames"],
            "newlyConvertedFormulaOrPrePostClips": expected_dynamic_names,
            "webglCompletion": webgl_row,
            "runtimeReady": False,
            "backendSelectionVerified": False,
            "defaultEligible": False,
            "backup": {"state": "verified", "receipt": str(BACKUP_RELATIVE),
                       "receiptSha256": sha(backup_path), "s3Uri": backup["s3Uri"],
                       "manifestUri": backup["manifestUri"], "archiveSha256": backup["archiveSha256"],
                       "archiveBytes": backup["archiveBytes"], "fileCount": backup["fileCount"],
                       "fullGetVerified": True, "allMemberSha256Verified": True,
                       "localUnchanged": True},
        })
    require(len(formula_clips) == 15 and len(no_duration) == 5, "completion classification count drift")
    return {
        "schema": "ggd-fateubw-native-motion-completion@1",
        "sourceId": SOURCE_ID,
        "sourceCommit": source["sourceCommit"],
        "sourceVersion": source["sourceVersion"],
        "sourceGame": source["sourceGame"],
        "platform": source["platform"],
        "license": source["license"],
        "status": STATUS,
        "scope": "Local conversion reserve and phase-sampled WebGL evidence. Formula source expressions are retained, but source-engine parity, continuous playback, rights, event mapping, runtime registration and deployment are not claimed.",
        "tools": [
            "tools/hero-model-library/source-workflows/fateubw-minecraft-v1/convert_bedrock_native_animation.py",
            "tools/hero-model-library/source-workflows/fateubw-minecraft-v1/convert_native_batch.py",
            "tools/hero-model-library/source-workflows/fateubw-minecraft-v1/render_native_animation.py",
            "tools/hero-model-library/source-workflows/fateubw-minecraft-v1/render_native_animation.mjs",
            "tools/hero-model-library/source-workflows/fateubw-minecraft-v1/render_native_completion.py",
            "tools/hero-model-library/source-workflows/fateubw-minecraft-v1/validate_native_animation.mts",
        ],
        "parameters": {"samplingFps": 60, "formulaTrigUnit": "degrees",
                       "formulaGrammar": "time/query.anim_time, numeric constants, + - * /, unary signs, math.sin/math.cos",
                       "prePostDiscontinuityEpsilonSecondsMax": 0.0001},
        "summary": {"servants": 14, "sourceClips": 132, "previouslyConvertedNativeClips": 112,
                    "newlyConvertedFormulaOrPrePostClips": 15, "convertedNativeClips": 127,
                    "retainedNoDurationSourcePoses": 5, "unsupportedTimedClips": 0,
                    "khronosErrors": 0, "khronosWarnings": 0, "ggdBudgetErrors": 0,
                    "webglReviewedNewClips": 15, "webglShots": 60,
                    "s3BackupVerified": True, "s3BackupFiles": backup["fileCount"],
                    "s3ArchiveBytes": backup["archiveBytes"]},
        "formulaOrPrePostClips": formula_clips,
        "retainedNoDurationSourcePoses": no_duration,
        "batchManifest": pin(manifest_path),
        "reproducibility": pin(reproducibility_path),
        "s3Backup": {"receipt": {"path": str(BACKUP_RELATIVE), "bytes": backup_path.stat().st_size,
                                  "sha256": sha(backup_path)}, "s3Uri": backup["s3Uri"],
                     "manifestUri": backup["manifestUri"], "archiveSha256": backup["archiveSha256"],
                     "archiveBytes": backup["archiveBytes"], "fileCount": backup["fileCount"],
                     "fullGetVerified": True, "allMemberSha256Verified": True,
                     "localUnchanged": True},
        "webglCompletion": pin(webgl_path),
        "contactSheet": pin(contact_path),
        "humanVisualReview": {"reviewer": "Codex visual inspection", "result": "accepted-as-conversion-reserve",
                              "scope": "All 15 midpoint tiles inspected after 60 phase-sampled WebGL renders; figures remain finite and coherent. This does not establish continuous source-engine formula parity."},
        "candidates": rows,
        "productionDeploymentVerified": False,
    }


def integrate(source, receipt, evidence_path):
    attempts = source.setdefault("conversionAttempts", [])
    by_id = {row["id"]: row for row in attempts}
    candidates = {row["candidateId"]: row for row in source["modelCandidates"]}
    for row in receipt["candidates"]:
        candidate_id = row["candidateId"]
        attempt_id = candidate_id + "-native-motion-completion-v2"
        attempt = {"id": attempt_id, "candidateId": candidate_id, "status": STATUS,
                   "previousAttemptId": row["previousAttemptId"],
                   "sourceClass": "community-mod", "platform": "Minecraft Java 1.21.1",
                   "localPath": str(Path(row["body"]["path"]).parent),
                   "body": row["body"], "converterReport": row["converterReport"],
                   "structuralReadback": row["structuralReadback"], "contractValidation": row["contractValidation"],
                   "nativeAnimations": {"classification": "community-mod-native-animation-json-with-bounded-formula-baking",
                                        "sourceClipCount": row["sourceClipCount"],
                                        "convertedClipCount": row["convertedNativeClipCount"],
                                        "unconvertedClipCount": row["retainedNoDurationClipCount"],
                                        "convertedClipNames": row["convertedClipNames"],
                                        "newlyConvertedFormulaOrPrePostClips": row["newlyConvertedFormulaOrPrePostClips"],
                                        "eventMapComplete": False},
                   "completionEvidence": evidence_path,
                   "webglNewCurveReview": row["webglCompletion"], "backup": row["backup"],
                   "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
                   "deploymentStatus": "not-deployed",
                   "missing": ["redistribution permission for ARR source",
                               "continuous playback and source-engine formula parity", "GGD action/event mapping",
                               "GGD backend selection and production deployment"]}
        if attempt_id in by_id:
            attempts[attempts.index(by_id[attempt_id])] = attempt
            by_id[attempt_id] = attempt
        else:
            attempts.append(attempt); by_id[attempt_id] = attempt
        candidates[candidate_id]["readyStage"] = STATUS
        candidates[candidate_id]["nativeMotionStandardization"] = {
            "attemptId": attempt_id, "status": STATUS, "rigConverted": True,
            "nativeAnimationConverted": True, "sourceClipCount": row["sourceClipCount"],
            "convertedClipCount": row["convertedNativeClipCount"],
            "unconvertedClipCount": row["retainedNoDurationClipCount"],
            "formulaOrPrePostClipCount": len(row["newlyConvertedFormulaOrPrePostClips"]),
            "visualReview": "new-formula-prepost-clips-phase-sampled-accepted-as-reserve",
            "continuousPlaybackAccepted": False, "sourceEngineCurveParity": False,
            "rightsReview": "pending", "eventMapComplete": False,
            "runtimeReady": False, "backendSelectionVerified": False, "defaultEligible": False,
        }
    source["readiness"] = STATUS
    source["nativeMotionCompletionEvidence"] = evidence_path
    source["verification"] = (
        "14名英靈共132個來源片段：127段已轉為原生動作GLB。原先保留的15段有時長公式／pre-post曲線已以60fps有限語法烘焙，"
        "通過Khronos 0錯誤0警告、GGD預算0錯誤與60張WebGL分段播放。5段來源姿勢無animation_length，保留未轉換且不虛構時長。"
        "S3 v2封存已完成逐檔雜湊與完整讀回驗證；來源引擎公式完全對齊、ARR再散布權、事件映射、後台選擇與部署仍未完成。"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--backup-receipt", type=Path,
                        help="copy this verified local S3 receipt into the dedicated Git evidence path")
    parser.add_argument("--skip-source-index", action="store_true",
                        help="update/check only dedicated Fate evidence; leave shared download-sources.json unchanged")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    repo, batch = args.repo.resolve(), args.batch.resolve()
    sources_path = repo / "materials/hero-model-library/download-sources.json"
    evidence_path = repo / "materials/hero-model-library/priority-evidence/fateubw-community/native-motion-completion-v2.json"
    backup_path = repo / BACKUP_RELATIVE
    if args.backup_receipt:
        require(not args.check, "--backup-receipt cannot be used with --check")
        backup_document = read(args.backup_receipt.resolve())
        backup_path.write_text(json.dumps(backup_document, ensure_ascii=False, indent=2) + "\n")
    document = read(sources_path)
    source = next(row for row in document["publicSources"] if row["id"] == SOURCE_ID)
    receipt = build(repo, batch, source)
    encoded = json.dumps(receipt, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        require(evidence_path.is_file() and evidence_path.read_text() == encoded, "FateUBW completion receipt is stale")
        if not args.skip_source_index:
            clone = json.loads(json.dumps(source))
            integrate(clone, receipt, str(evidence_path.relative_to(repo)))
            require(clone == source, "FateUBW source index is stale")
        print(json.dumps({"status": "current", **receipt["summary"]}, ensure_ascii=False)); return
    evidence_path.write_text(encoded)
    if not args.skip_source_index:
        integrate(source, receipt, str(evidence_path.relative_to(repo)))
        sources_path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"status": "updated", **receipt["summary"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

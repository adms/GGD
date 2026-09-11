#!/usr/bin/env python3
"""Normalize transparent body atlases without changing source geometry or images.

The four inputs covered here were admitted before the repository-wide alpha
backdrop gate existed.  Their source bytes stay pinned in the local/S3 archive;
the Git deliverable is a new content-addressed GLB whose only semantic change is
``material.alphaMode: OPAQUE -> BLEND``.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import importlib.util
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
INDEX = REPO / "materials/hero-model-library/download-sources.json"
EVIDENCE = REPO / "materials/hero-model-library/priority-evidence/transparent-component-material-normalization-v1.json"
LOCAL_ROOT = REPO.parent / "GGD-Asset-Library/conversions/transparent-component-material-normalization-v1"
TARGET_IDS = {
    "zero-lancer-p1-static-skinned-v1",
    "zero-lancer-p2-static-skinned-v1",
    "historical-kita-kita-7bc2fa3f8",
    "historical-lord-nightmares-7bc2fa3f8",
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def pin(path: Path) -> dict:
    data = path.read_bytes()
    return {"absolutePath": str(path.resolve()), "bytes": len(data), "sha256": sha(data)}


def alpha_module():
    path = REPO / "tools/w3x-import/repair_alpha_backdrops.py"
    spec = importlib.util.spec_from_file_location("ggd_repair_alpha_backdrops", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def candidates(doc: dict):
    for section in ("publicSources", "paidSources"):
        for source in doc.get(section, []):
            for candidate in source.get("componentCandidates", []):
                if candidate.get("id") in TARGET_IDS:
                    yield candidate


def build(index: dict) -> tuple[dict, dict, list[tuple[Path, bytes]]]:
    module = alpha_module()
    updated = copy.deepcopy(index)
    rows = []
    writes = []
    found = set()
    for candidate in candidates(updated):
        candidate_id = candidate["id"]
        found.add(candidate_id)
        source = copy.deepcopy(candidate.get("sourceArtifact"))
        if source is None:
            source = {
                "absolutePath": candidate["absolutePath"],
                "bytes": candidate["bytes"],
                "sha256": candidate["sha256"],
                "gitPathAtIngest": candidate["gitPath"],
                "s3Uri": candidate.get("s3Uri"),
                "s3ArchiveMember": candidate.get("s3ArchiveMember"),
                "backupReceiptPath": candidate.get("backupReceiptPath"),
                "backupReceiptSha256": candidate.get("backupReceiptSha256"),
            }
        source_path = Path(source["absolutePath"])
        source_pin = pin(source_path)
        assert (source_pin["bytes"], source_pin["sha256"]) == (source["bytes"], source["sha256"]), candidate_id
        before, binary = module.chunks(source_path.read_bytes())
        after = copy.deepcopy(before)
        changes = module.repairs(after, binary)
        assert len(changes) == 1, (candidate_id, changes)
        output = module.encode(after, binary)
        decoded, output_binary = module.chunks(output)
        assert output_binary == binary
        for key in set(before) | set(decoded):
            if key != "materials":
                assert before.get(key) == decoded.get(key), (candidate_id, key)
        out_sha = sha(output)
        local_path = LOCAL_ROOT / candidate_id / "component.glb"
        git_rel = f"content/assets/models/community/{out_sha}.glb"
        git_path = REPO / git_rel
        writes.extend([(local_path, output), (git_path, output)])
        candidate.update({
            "absolutePath": str(local_path),
            "path": str(local_path),
            "bytes": len(output),
            "sha256": out_sha,
            "gitPath": git_rel,
            "sourceArtifact": source,
            "materialNormalization": {
                "schema": "ggd-transparent-component-material-normalization@1",
                "revision": 1,
                "changes": changes,
                "binaryChunkByteIdentical": True,
                "nonMaterialJsonByteSemanticIdentical": True,
            },
        })
        rows.append({
            "candidateId": candidate_id,
            "source": source_pin,
            "output": {"absolutePath": str(local_path), "gitPath": git_rel, "bytes": len(output), "sha256": out_sha},
            "changes": changes,
            "binaryChunkByteIdentical": True,
            "nonMaterialJsonByteSemanticIdentical": True,
            "sourcePreservation": {
                "local": source["absolutePath"],
                "s3Uri": source.get("s3Uri"),
                "s3ArchiveMember": source.get("s3ArchiveMember"),
            },
        })
    assert found == TARGET_IDS, (found, TARGET_IDS)
    evidence = {
        "schema": "ggd-transparent-component-material-normalization-batch@1",
        "rule": "transparent atlas materials use BLEND",
        "records": sorted(rows, key=lambda row: row["candidateId"]),
        "sourceBytesPreserved": True,
        "runtimeSelectable": False,
        "deployed": False,
    }
    evidence_bytes = (json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode()
    evidence_pin = {"gitPath": EVIDENCE.relative_to(REPO).as_posix(), "bytes": len(evidence_bytes), "sha256": sha(evidence_bytes)}
    for candidate in candidates(updated):
        candidate["normalizationEvidence"] = evidence_pin
    return updated, evidence, writes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--write", action="store_true")
    args = parser.parse_args()
    current = json.loads(INDEX.read_text())
    updated, evidence, writes = build(current)
    evidence_bytes = (json.dumps(evidence, ensure_ascii=False, indent=2) + "\n").encode()
    if args.check:
        assert current == updated, "download-sources.json needs transparent component normalization"
        assert EVIDENCE.read_bytes() == evidence_bytes, "normalization evidence is stale"
        for path, data in writes:
            assert path.read_bytes() == data, f"normalized output is missing or stale: {path}"
    else:
        for path, data in writes:
            path.parent.mkdir(parents=True, exist_ok=True)
            if path.exists():
                assert path.read_bytes() == data, f"refusing to overwrite changed output: {path}"
            else:
                path.write_bytes(data)
        EVIDENCE.parent.mkdir(parents=True, exist_ok=True)
        EVIDENCE.write_bytes(evidence_bytes)
        INDEX.write_text(json.dumps(updated, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"components": len(TARGET_IDS), "written": args.write}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

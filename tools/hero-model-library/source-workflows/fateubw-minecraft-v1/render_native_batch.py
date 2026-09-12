#!/usr/bin/env python3
"""Render every converted FateUBW native-motion reserve in one immutable batch."""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, required=True)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--evidence-name", default="webgl-native-v1")
    args = parser.parse_args()
    repo, batch = args.repo.resolve(), args.batch.resolve()
    manifest_path = batch / "batch-manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("schema") != "ggd-fateubw-native-motion-reserve-batch@1":
        raise ValueError("unexpected batch manifest")
    renderer = Path(__file__).with_name("render_native_animation.py")
    rows = []
    for record in manifest["records"]:
        candidate_id = record["candidateId"]
        directory = batch / candidate_id
        body = directory / "body.glb"
        if sha256(body) != record["body"]["sha256"]:
            raise ValueError("changed body: " + candidate_id)
        evidence = directory / args.evidence_name
        subprocess.run([sys.executable, str(renderer), str(body), str(evidence), "--repo", str(repo)],
                       cwd=repo, check=True)
        proof = json.loads((evidence / "proof.json").read_text())
        run = json.loads((evidence / "run.json").read_text())
        if (proof.get("schema") != "ggd.fateubw-native-motion-webgl@1"
                or run.get("complete") is not True or run.get("errorExists") is not False
                or proof.get("model", {}).get("animationGroups") != record["convertedNativeClipCount"]
                or len(proof.get("groups", [])) != record["convertedNativeClipCount"]):
            raise ValueError("incomplete WebGL playback evidence: " + candidate_id)
        rows.append({
            "candidateId": candidate_id,
            "bodySha256": record["body"]["sha256"],
            "proof": {"path": str(evidence / "proof.json"), "sha256": sha256(evidence / "proof.json")},
            "run": {"path": str(evidence / "run.json"), "sha256": sha256(evidence / "run.json")},
            "animationGroups": len(proof["groups"]),
            "shots": sum(len(group["shots"]) for group in proof["groups"]),
            "allGroupsHaveDistinctPhaseImages": all(
                len({sha256(evidence / shot["name"]) for shot in group["shots"] if shot["view"] == "front"}) >= 2
                for group in proof["groups"]),
        })
        print(json.dumps(rows[-1], ensure_ascii=False), flush=True)
    summary = {
        "schema": "ggd-fateubw-native-motion-batch-webgl@1",
        "batchManifest": {"path": str(manifest_path), "sha256": sha256(manifest_path)},
        "records": rows,
        "counts": {"characters": len(rows), "animationGroups": sum(row["animationGroups"] for row in rows),
                   "shots": sum(row["shots"] for row in rows)},
        "allRunsComplete": True,
        "allModelsMatchBatchPins": True,
        "allGroupsHaveDistinctPhaseImages": all(row["allGroupsHaveDistinctPhaseImages"] for row in rows),
        "scope": "Actual Babylon WebGL load and phase-sampled playback. Source-engine curve parity, continuous temporal review, action/event mapping, rights, backend selection and deployment remain unverified.",
    }
    (batch / "batch-webgl-review.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(summary["counts"], ensure_ascii=False))


if __name__ == "__main__":
    main()

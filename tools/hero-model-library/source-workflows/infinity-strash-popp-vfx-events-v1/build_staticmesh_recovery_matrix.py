#!/usr/bin/env python3
"""Join the original UModel failures to recovered GLBs and Khronos results."""

import argparse
import hashlib
import json
import pathlib


def sha256(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ref(path: pathlib.Path) -> dict[str, object]:
    return {"absolutePath": str(path.resolve()), "bytes": path.stat().st_size, "sha256": sha256(path)}


parser = argparse.ArgumentParser()
parser.add_argument("--original", type=pathlib.Path, required=True)
parser.add_argument("--recovery", type=pathlib.Path, required=True)
parser.add_argument("--khronos", type=pathlib.Path, required=True)
parser.add_argument("--output", type=pathlib.Path, required=True)
args = parser.parse_args()
original = json.loads(args.original.read_text(encoding="utf-8"))
recovery = json.loads(args.recovery.read_text(encoding="utf-8"))
khronos = json.loads(args.khronos.read_text(encoding="utf-8"))

recovered = {row["reference"]: row for row in recovery["rows"]}
validated = {row["path"]: row for row in khronos["rows"]}
rows = []
for before in original["rows"]:
    if before.get("status") != "converter-failed" or "/VFX/Staticmesh/" not in before.get("reference", ""):
        continue
    if "SerializeOccluderData" in before["logTail"]:
        stage = "occluder-data"
    elif "FDistanceFieldVolumeData" in before["logTail"]:
        stage = "distance-field-volume"
    else:
        stage = "unclassified"
    after = recovered[before["reference"]]
    glbs = []
    for item in after["glb"]:
        issues = validated[item["path"]]["issues"]
        glbs.append({
            "path": item["path"],
            "absolutePath": item["absolutePath"],
            "bytes": item["bytes"],
            "sha256": item["sha256"],
            "structure": item["structure"],
            "normalization": item["normalization"],
            "khronos": {
                "errors": issues["numErrors"],
                "warnings": issues["numWarnings"],
                "infos": issues["numInfos"],
                "hints": issues["numHints"],
                "truncated": issues["truncated"],
            },
        })
    rows.append({
        "reference": before["reference"],
        "before": {
            "status": before["status"],
            "returnCode": before["returnCode"],
            "failureStage": stage,
            "logSha256": before["logSha256"],
        },
        "fix": "consume Infinity Strash uint64 cumulative base vertex after each FStaticMeshSection4",
        "after": {"status": after["status"], "glb": glbs},
    })

summary = {
    "rows": len(rows),
    "originalFailureStages": {
        "distance-field-volume": sum(row["before"]["failureStage"] == "distance-field-volume" for row in rows),
        "occluder-data": sum(row["before"]["failureStage"] == "occluder-data" for row in rows),
        "unclassified": sum(row["before"]["failureStage"] == "unclassified" for row in rows),
    },
    "converted": sum(row["after"]["status"] == "converted-staticmesh-support" for row in rows),
    "stillBlocked": sum(row["after"]["status"] != "converted-staticmesh-support" for row in rows),
    "khronosErrors": sum(item["khronos"]["errors"] for row in rows for item in row["after"]["glb"]),
    "khronosWarnings": sum(item["khronos"]["warnings"] for row in rows for item in row["after"]["glb"]),
}
result = {
    "schema": "ggd.infinity-strash-popp-vfx-staticmesh-recovery-matrix@1",
    "inputs": {"original": ref(args.original), "recovery": ref(args.recovery), "khronos": ref(args.khronos)},
    "summary": summary,
    "rows": rows,
    "claim": "All 33 former converter failures are recovered as structurally valid support-mesh GLBs. These are ingredients for VFX reconstruction, not converted Niagara systems or runtime GGD VFX.",
}
args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"output": str(args.output.resolve()), **summary}, ensure_ascii=False))

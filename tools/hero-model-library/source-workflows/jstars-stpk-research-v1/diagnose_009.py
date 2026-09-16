#!/usr/bin/env python3
"""Record the precise unsupported chunk modes in the earlier native ID 009 sample."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("jstars_inventory", HERE / "inventory.py")
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=HERE.parents[3])
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    args = parser.parse_args()
    repo, source, evidence = args.repo.resolve(), args.source.resolve(), args.evidence.resolve()
    rows = []
    for kind in ("i", "m", "v"):
        info = MODULE.inspect_cmp(source / f"character_model_009_{kind}.pak")
        rows.append({key: info[key] for key in ("path", "bytes", "sha256", "declaredDecodedBytes", "chunkCount", "chunkModes", "parsedChunkBytes", "unparsedTailBytes", "requiresUnsupportedCh0Stage")})
    report = {
        "schema": "ggd.jstars-009-chunk-diagnosis@1", "sourceId": "parallel-ps-jstars-sample",
        "nativeCharacterId": "009", "containers": rows,
        "conclusion": "$CLH chunks wrap a $CH0 entropy stage. The public cmp_scz.bms implementation only has the CL0-style decode path, so its partial m output and i/v crashes cannot establish complete native decode.",
        "completeNativeDecode": False, "standardizedModel": False,
    }
    evidence.parent.mkdir(parents=True, exist_ok=True)
    evidence.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    path = repo / "materials/hero-model-library/download-sources.json"
    document = json.loads(path.read_text())
    source_rows = [row for row in document["publicSources"] if row["id"] == "parallel-ps-jstars-sample"]
    if len(source_rows) != 1:
        raise ValueError("expected one 009 source")
    row = source_rows[0]
    row["readiness"] = "blocked-ch0-decode-pending-standardization"
    row["analysis"]["chunkModeEvidence"] = {"gitPath": evidence.relative_to(repo).as_posix(), "sha256": sha(evidence)}
    row["analysis"]["decoderBlocker"] = "$CLH containers require a $CH0 entropy stage not implemented safely by the current public cmp_scz.bms path"
    note = "2026-09-14 chunk-table parsing confirms all three samples contain $CLH chunks wrapping $CH0; the existing public script lacks that stage, so the prior partial output remains a blocker receipt rather than decoded model evidence."
    if note not in row["verification"]:
        row["verification"] += " " + note
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"containers": len(rows), "allRequireCh0": all(x["requiresUnsupportedCh0Stage"] for x in rows)}))


if __name__ == "__main__":
    main()

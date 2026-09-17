#!/usr/bin/env python3
"""Compare a skinned GLB's baked rest mesh with a reviewed static reference."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from validate_bedrock_static_glb import accessor, read_glb


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mesh_arrays(path):
    document, binary = read_glb(path)
    primitive = document["meshes"][0]["primitives"][0]
    attributes = primitive["attributes"]
    material = dict(document["materials"][primitive["material"]])
    material.pop("name", None)
    return {
        "positions": accessor(document, binary, attributes["POSITION"]).astype(float),
        "normals": accessor(document, binary, attributes["NORMAL"]).astype(float),
        "indices": accessor(document, binary, primitive["indices"]).reshape(-1).astype(int),
        "material": material,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", type=Path, required=True)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tolerance", type=float, default=1e-6)
    args = parser.parse_args()
    candidate, reference, output = args.candidate.resolve(), args.reference.resolve(), args.output.resolve()
    if output.exists():
        raise ValueError("output must be new so the comparison receipt is immutable")
    if args.tolerance <= 0:
        raise ValueError("tolerance must be positive")
    current, expected = mesh_arrays(candidate), mesh_arrays(reference)
    same_shapes = all(current[key].shape == expected[key].shape for key in ("positions", "normals", "indices"))
    max_position_error = None
    max_normal_error = None
    indices_equal = False
    if same_shapes:
        max_position_error = float(np.max(np.abs(current["positions"] - expected["positions"])))
        max_normal_error = float(np.max(np.abs(current["normals"] - expected["normals"])))
        indices_equal = bool(np.array_equal(current["indices"], expected["indices"]))
    valid = bool(
        same_shapes
        and max_position_error <= args.tolerance
        and max_normal_error <= args.tolerance
        and indices_equal
        and current["material"] == expected["material"]
    )
    result = {
        "schema": "ggd-fateubw-rest-pose-parity@1",
        "candidate": {"path": str(candidate), "sha256": sha256(candidate), "bytes": candidate.stat().st_size},
        "reviewedStaticReference": {"path": str(reference), "sha256": sha256(reference), "bytes": reference.stat().st_size},
        "tolerance": args.tolerance,
        "checks": {
            "sameAccessorShapes": same_shapes,
            "maxPositionAbsoluteError": max_position_error,
            "maxNormalAbsoluteError": max_normal_error,
            "indicesByteEquivalent": indices_equal,
            "materialEquivalent": current["material"] == expected["material"],
        },
        "valid": valid,
        "scope": "Baked mesh rest-pose parity only. This does not prove animated source-engine curve parity.",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "valid": valid, "checks": result["checks"]}, ensure_ascii=False))
    if not valid:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

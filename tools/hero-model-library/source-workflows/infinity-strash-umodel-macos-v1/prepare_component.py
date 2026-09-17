#!/usr/bin/env python3
"""Validate a UModel glTF, make an intermediate GLB, and render review views."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_obj(path: Path) -> tuple[np.ndarray, np.ndarray]:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, int, int]] = []
    for line in path.read_text(errors="ignore").splitlines():
        if line.startswith("v "):
            values = tuple(map(float, line.split()[1:4]))
            vertices.append(values)
        elif line.startswith("f "):
            indices = [int(item.split("/")[0]) - 1 for item in line.split()[1:]]
            for index in range(1, len(indices) - 1):
                faces.append((indices[0], indices[index], indices[index + 1]))
    vertex_array = np.asarray(vertices, dtype=np.float64)
    face_array = np.asarray(faces, dtype=np.int32)
    if not len(vertex_array) or not len(face_array):
        raise ValueError("Assimp OBJ contains no renderable geometry")
    valid_vertices = np.isfinite(vertex_array).all(axis=1)
    valid_faces = valid_vertices[face_array].all(axis=1)
    return vertex_array, face_array[valid_faces]


def render_views(vertices: np.ndarray, faces: np.ndarray, output: Path) -> list[str]:
    finite = np.isfinite(vertices).all(axis=1)
    center = (vertices[finite].min(axis=0) + vertices[finite].max(axis=0)) / 2
    vertices = vertices.copy()
    vertices[~finite] = center
    vertices -= center
    yaw, pitch = math.radians(35), math.radians(-12)
    rotate_y = np.array([[math.cos(yaw), 0, math.sin(yaw)], [0, 1, 0], [-math.sin(yaw), 0, math.cos(yaw)]])
    rotate_x = np.array([[1, 0, 0], [0, math.cos(pitch), -math.sin(pitch)], [0, math.sin(pitch), math.cos(pitch)]])
    views = {
        "front": np.eye(3),
        "back": np.diag([-1.0, 1.0, -1.0]),
        "isometric": rotate_x @ rotate_y,
    }
    names = []
    light = np.array([-.3, .7, .65]); light /= np.linalg.norm(light)
    for name, rotation in views.items():
        points = np.sum(vertices[:, None, :] * rotation[None, :, :], axis=2)
        finite_points = np.isfinite(points).all(axis=1)
        span = max(np.ptp(points[finite_points, 0]), np.ptp(points[finite_points, 1]))
        scale = 700 / span
        projected = np.column_stack((400 + points[:, 0] * scale, 400 - points[:, 1] * scale))
        triangles = points[faces]
        depth = triangles[:, :, 2].mean(axis=1)
        normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
        lengths = np.linalg.norm(normals, axis=1); lengths[lengths == 0] = 1
        normals /= lengths[:, None]
        shade = .25 + .70 * np.abs(np.sum(normals * light[None, :], axis=1))
        image = Image.new("RGB", (800, 800), (24, 28, 38))
        draw = ImageDraw.Draw(image)
        for index in np.argsort(depth):
            polygon = [tuple(value) for value in projected[faces[index]]]
            level = int(60 + 170 * shade[index])
            draw.polygon(polygon, fill=(level, int(level * .88), int(level * .68)))
        filename = f"{name}.png"
        image.save(output / filename)
        names.append(filename)
    return names


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--candidate-id", required=True)
    args = parser.parse_args()
    source = args.source.resolve(); output = args.output.resolve()
    if not source.is_file():
        raise SystemExit(f"missing glTF: {source}")
    output.mkdir(parents=True, exist_ok=False)

    with tempfile.TemporaryDirectory(prefix="strash-assimp-") as temp_name:
        obj = Path(temp_name) / "component.obj"
        subprocess.run(["assimp", "export", str(source), str(output / "component.glb"), "-f", "glb2"], check=True, capture_output=True, text=True)
        subprocess.run(["assimp", "export", str(source), str(obj), "-f", "objnomtl"], check=True, capture_output=True, text=True)
        validation = subprocess.run(["assimp", "info", str(output / "component.glb")], check=True, capture_output=True, text=True)
        (output / "assimp-info.txt").write_text(validation.stdout + validation.stderr, encoding="utf-8")
        vertices, faces = read_obj(obj)
        images = render_views(vertices, faces, output)

    files = []
    for path in sorted(p for p in output.rglob("*") if p.is_file()):
        files.append({"path": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)})
    receipt = {
        "schema": "ggd.infinity-strash-component-preparation@1",
        "candidateId": args.candidate_id,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "source": str(source),
        "sourceSha256": sha256(source),
        "verticesInObj": int(len(vertices)),
        "finiteTrianglesRendered": int(len(faces)),
        "reviewImages": images,
        "files": files,
        "readiness": "converted-untextured-skeletal-component",
        "sourceGameShaderParity": False,
        "multipartAssemblyComplete": False,
        "runtimeRegistration": False,
        "deploymentVerified": False,
    }
    (output / "receipt.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(receipt, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

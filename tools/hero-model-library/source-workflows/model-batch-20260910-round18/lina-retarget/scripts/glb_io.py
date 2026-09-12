"""
glb — minimal, dependency-free glTF-binary reader/repacker.

Why hand-rolled: the repo has no gltf-transform / meshoptimizer and this lane
is under a hard NO-DOWNLOADS constraint, so the LOD generator may only use the
Python standard library. This module is deliberately small — it parses the JSON
+ BIN chunks, exposes accessors as plain Python lists, and can write a NEW glb
whose buffer is rebuilt from scratch (tightly packed, de-interleaved).

Rebuilding the buffer rather than patching it is what makes decimation safe:
after a collapse pass the accessor counts change, byteStride-interleaved views
would need surgery, and any orphaned bytes would still ship. A full repack drops
everything nothing references.
"""

from __future__ import annotations

import json
import struct

GLB_MAGIC = 0x46546C67
CHUNK_JSON = 0x4E4F534A
CHUNK_BIN = 0x004E4942

COMPONENT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
COMPONENT_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


class Glb:
    def __init__(self, gltf: dict, binary: bytes):
        self.gltf = gltf
        self.bin = binary

    # ---------------------------------------------------------------- reading
    def view_bytes(self, view_index: int) -> bytes:
        view = self.gltf["bufferViews"][view_index]
        off = view.get("byteOffset", 0)
        return self.bin[off : off + view["byteLength"]]

    def accessor_values(self, index: int) -> list:
        """Accessor → flat list of numbers (length = count * numComponents)."""
        acc = self.gltf["accessors"][index]
        n = NUM_COMPONENTS[acc["type"]]
        count = acc["count"]
        ctype = acc["componentType"]
        csize = COMPONENT_SIZE[ctype]
        fmt = COMPONENT_FMT[ctype]
        out: list

        if "bufferView" not in acc:
            out = [0] * (count * n)
        else:
            view = self.gltf["bufferViews"][acc["bufferView"]]
            base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = view.get("byteStride") or (csize * n)
            if stride == csize * n:
                out = list(struct.unpack_from("<" + fmt * (count * n), self.bin, base))
            else:
                out = []
                elem = "<" + fmt * n
                for i in range(count):
                    out.extend(struct.unpack_from(elem, self.bin, base + i * stride))

        sparse = acc.get("sparse")
        if sparse:
            idx_acc = sparse["indices"]
            val_acc = sparse["values"]
            iv = self.gltf["bufferViews"][idx_acc["bufferView"]]
            ifmt = COMPONENT_FMT[idx_acc["componentType"]]
            ibase = iv.get("byteOffset", 0) + idx_acc.get("byteOffset", 0)
            indices = struct.unpack_from("<" + ifmt * sparse["count"], self.bin, ibase)
            vv = self.gltf["bufferViews"][val_acc["bufferView"]]
            vbase = vv.get("byteOffset", 0) + val_acc.get("byteOffset", 0)
            values = struct.unpack_from("<" + fmt * (sparse["count"] * n), self.bin, vbase)
            for k, target in enumerate(indices):
                out[target * n : target * n + n] = values[k * n : k * n + n]
        return out

    def triangles(self) -> int:
        total = 0
        for mesh in self.gltf.get("meshes", []):
            for prim in mesh["primitives"]:
                if prim.get("mode", 4) != 4:
                    continue
                if "indices" in prim:
                    total += self.gltf["accessors"][prim["indices"]]["count"] // 3
                else:
                    first = next(iter(prim["attributes"].values()), None)
                    if first is not None:
                        total += self.gltf["accessors"][first]["count"] // 3
        return total


def read(path: str) -> Glb:
    raw = open(path, "rb").read()
    magic, _version, _length = struct.unpack_from("<III", raw, 0)
    if magic != GLB_MAGIC:
        raise ValueError(f"{path}: not a .glb")
    offset = 12
    gltf: dict | None = None
    binary = b""
    while offset < len(raw):
        clen, ctype = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset : offset + clen]
        offset += clen
        if ctype == CHUNK_JSON:
            gltf = json.loads(chunk.decode("utf-8"))
        elif ctype == CHUNK_BIN:
            binary = chunk
    if gltf is None:
        raise ValueError(f"{path}: no JSON chunk")
    return Glb(gltf, binary)


class BufferBuilder:
    """Accumulates tightly-packed bufferViews for the repacked output."""

    def __init__(self) -> None:
        self.blobs: list[bytes] = []
        self.views: list[dict] = []
        self.offset = 0

    def add_view(self, payload: bytes, target: int | None = None) -> int:
        pad = (-self.offset) % 4
        if pad:
            self.blobs.append(b"\0" * pad)
            self.offset += pad
        view: dict = {"buffer": 0, "byteOffset": self.offset, "byteLength": len(payload)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
        self.blobs.append(payload)
        self.offset += len(payload)
        return len(self.views) - 1

    def data(self) -> bytes:
        pad = (-self.offset) % 4
        return b"".join(self.blobs) + b"\0" * pad


def pack_accessor(
    builder: BufferBuilder,
    accessors: list[dict],
    values,
    component_type: int,
    kind: str,
    target: int | None = None,
    with_bounds: bool = False,
) -> int:
    n = NUM_COMPONENTS[kind]
    count = len(values) // n
    fmt = COMPONENT_FMT[component_type]
    payload = struct.pack("<" + fmt * len(values), *values)
    view = builder.add_view(payload, target)
    acc: dict = {
        "bufferView": view,
        "componentType": component_type,
        "count": count,
        "type": kind,
    }
    if with_bounds and count:
        mins = [min(values[i::n]) for i in range(n)]
        maxs = [max(values[i::n]) for i in range(n)]
        acc["min"] = mins
        acc["max"] = maxs
    accessors.append(acc)
    return len(accessors) - 1


def write(path: str, gltf: dict, binary: bytes) -> int:
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((-len(js)) % 4)
    binary = binary + b"\0" * ((-len(binary)) % 4)
    total = 12 + 8 + len(js) + (8 + len(binary) if binary else 0)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", GLB_MAGIC, 2, total))
        fh.write(struct.pack("<II", len(js), CHUNK_JSON))
        fh.write(js)
        if binary:
            fh.write(struct.pack("<II", len(binary), CHUNK_BIN))
            fh.write(binary)
    return total

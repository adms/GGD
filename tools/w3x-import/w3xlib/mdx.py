"""MDX (Warcraft III model, version 800) chunk parser.

Parses exactly what the glTF exporter needs: MODL/SEQS/TEXS/MTLS/GEOS/
BONE/HELP/PIVT/ATCH + the KGTR/KGRT/KGSC node animation tracks.
Particle/ribbon/camera/light/event chunks are skipped (recorded by tag).
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field


@dataclass
class Sequence:
    name: str
    start: int
    end: int
    non_looping: bool


@dataclass
class Texture:
    replaceable_id: int
    path: str


@dataclass
class Layer:
    filter_mode: int
    shading_flags: int
    texture_id: int
    alpha: float


@dataclass
class Material:
    layers: list[Layer]


@dataclass
class Geoset:
    vertices: list[tuple]  # (x,y,z)
    normals: list[tuple]
    uvs: list[tuple]
    faces: list[int]  # triangle indices
    vertex_groups: list[int]  # per-vertex matrix-group index
    matrix_groups: list[list[int]]  # group -> list of node objectIds
    material_id: int


@dataclass
class Track:
    interp: int  # 0 none, 1 linear, 2 hermite, 3 bezier
    global_seq: int
    keys: list[tuple]  # (frame, value-tuple)


@dataclass
class Node:
    name: str
    object_id: int
    parent_id: int
    flags: int
    kind: str  # bone/helper/attachment
    translation: Track | None = None
    rotation: Track | None = None
    scaling: Track | None = None
    pivot: tuple = (0.0, 0.0, 0.0)
    attachment_path: str = ""  # ATCH nodes only: separate model to attach


@dataclass
class MDXModel:
    name: str = ""
    sequences: list[Sequence] = field(default_factory=list)
    textures: list[Texture] = field(default_factory=list)
    materials: list[Material] = field(default_factory=list)
    geosets: list[Geoset] = field(default_factory=list)
    nodes: dict[int, Node] = field(default_factory=dict)
    pivots: list[tuple] = field(default_factory=list)
    skipped_chunks: list[str] = field(default_factory=list)
    version: int = 800


def _read_track(data: bytes, pos: int, dim: int) -> tuple[Track, int]:
    count, interp, gseq = struct.unpack_from("<IiI", data, pos)
    pos += 12
    keys = []
    for _ in range(count):
        frame = struct.unpack_from("<i", data, pos)[0]
        pos += 4
        value = struct.unpack_from("<%df" % dim, data, pos)
        pos += 4 * dim
        if interp > 1:  # hermite/bezier: skip inTan/outTan
            pos += 8 * dim
        keys.append((frame, value))
    return Track(interp, gseq if gseq != 0xFFFFFFFF else -1, keys), pos


def _read_node(data: bytes, pos: int, kind: str) -> tuple[Node, int]:
    incl = struct.unpack_from("<I", data, pos)[0]
    end = pos + incl
    name = data[pos + 4 : pos + 84].split(b"\x00", 1)[0].decode("latin-1")
    obj_id, parent_id, flags = struct.unpack_from("<iii", data, pos + 84)
    node = Node(name, obj_id, parent_id, flags, kind)
    p = pos + 96
    while p < end:
        tag = data[p : p + 4]
        if tag == b"KGTR":
            node.translation, p = _read_track(data, p + 4, 3)
        elif tag == b"KGRT":
            node.rotation, p = _read_track(data, p + 4, 4)
        elif tag == b"KGSC":
            node.scaling, p = _read_track(data, p + 4, 3)
        else:
            break  # unknown sub-chunk: bail to inclusiveSize end
    return node, end


def parse_mdx(data: bytes) -> MDXModel:
    if data[:4] != b"MDLX":
        raise ValueError("not an MDX file")
    m = MDXModel()
    pos = 4
    n = len(data)
    while pos + 8 <= n:
        tag = data[pos : pos + 4].decode("latin-1")
        size = struct.unpack_from("<I", data, pos + 4)[0]
        body_start = pos + 8
        body_end = min(body_start + size, n)
        if tag == "VERS":
            m.version = struct.unpack_from("<I", data, body_start)[0]
        elif tag == "MODL":
            m.name = data[body_start : body_start + 80].split(b"\x00", 1)[0].decode(
                "latin-1"
            )
        elif tag == "SEQS":
            for off in range(body_start, body_end, 132):
                nm = data[off : off + 80].split(b"\x00", 1)[0].decode("latin-1")
                start, end_t = struct.unpack_from("<II", data, off + 80)
                flags = struct.unpack_from("<I", data, off + 92)[0]
                m.sequences.append(Sequence(nm, start, end_t, bool(flags & 1)))
        elif tag == "TEXS":
            for off in range(body_start, body_end, 268):
                rid = struct.unpack_from("<I", data, off)[0]
                path = data[off + 4 : off + 264].split(b"\x00", 1)[0].decode(
                    "latin-1"
                )
                m.textures.append(Texture(rid, path))
        elif tag == "MTLS":
            p = body_start
            while p < body_end:
                incl = struct.unpack_from("<I", data, p)[0]
                mat_end = p + incl
                layers: list[Layer] = []
                lp = p + 12
                if data[lp : lp + 4] == b"LAYS":
                    layer_count = struct.unpack_from("<I", data, lp + 4)[0]
                    lp += 8
                    for _ in range(layer_count):
                        lincl = struct.unpack_from("<I", data, lp)[0]
                        fm, sf, tid, _taid, _cid, alpha = struct.unpack_from(
                            "<IIiiif", data, lp + 4
                        )
                        layers.append(Layer(fm, sf, tid, alpha))
                        lp += lincl
                m.materials.append(Material(layers))
                p = mat_end
        elif tag == "GEOS":
            p = body_start
            while p < body_end:
                incl = struct.unpack_from("<I", data, p)[0]
                g_end = p + incl
                g = _parse_geoset(data, p + 4, g_end)
                m.geosets.append(g)
                p = g_end
        elif tag in ("BONE", "HELP", "ATCH"):
            p = body_start
            while p < body_end:
                if tag == "BONE":
                    node, p = _read_node(data, p, "bone")
                    p += 8  # geosetId + geosetAnimId
                elif tag == "HELP":
                    node, p = _read_node(data, p, "helper")
                else:  # ATCH
                    incl = struct.unpack_from("<I", data, p)[0]
                    a_end = p + incl
                    node, node_end = _read_node(data, p + 4, "attachment")
                    # after the node: char[256] path, uint32 attachmentId,
                    # then an optional KATV visibility track (all inside incl)
                    if node_end + 4 <= a_end:
                        raw = data[node_end : node_end + 256]
                        node.attachment_path = raw.split(b"\x00", 1)[0].decode(
                            "latin-1"
                        )
                    p = a_end
                m.nodes[node.object_id] = node
        elif tag == "PIVT":
            for off in range(body_start, body_end, 12):
                m.pivots.append(struct.unpack_from("<3f", data, off))
        else:
            m.skipped_chunks.append(tag)
        pos = body_start + size
    for node in m.nodes.values():
        if 0 <= node.object_id < len(m.pivots):
            node.pivot = m.pivots[node.object_id]
    return m


def _parse_geoset(data: bytes, p: int, end: int) -> Geoset:
    def expect(tag: bytes) -> int:
        assert data[p : p + 4] == tag, f"geoset: expected {tag} got {data[p:p+4]!r}"
        return struct.unpack_from("<I", data, p + 4)[0]

    vertices: list[tuple] = []
    normals: list[tuple] = []
    uvs: list[tuple] = []
    faces: list[int] = []
    vgroups: list[int] = []
    mgroups: list[list[int]] = []
    material_id = 0

    cnt = expect(b"VRTX")
    p += 8
    for _ in range(cnt):
        vertices.append(struct.unpack_from("<3f", data, p))
        p += 12
    cnt = expect(b"NRMS")
    p += 8
    for _ in range(cnt):
        normals.append(struct.unpack_from("<3f", data, p))
        p += 12
    cnt = expect(b"PTYP")
    p += 8 + 4 * cnt  # primitive types: assume triangles
    cnt = expect(b"PCNT")
    p += 8 + 4 * cnt
    cnt = expect(b"PVTX")
    p += 8
    faces = list(struct.unpack_from("<%dH" % cnt, data, p))
    p += 2 * cnt
    cnt = expect(b"GNDX")
    p += 8
    vgroups = list(struct.unpack_from("<%dB" % cnt, data, p))
    p += cnt
    cnt = expect(b"MTGC")
    p += 8
    group_sizes = struct.unpack_from("<%dI" % cnt, data, p)
    p += 4 * cnt
    cnt = expect(b"MATS")
    p += 8
    flat = struct.unpack_from("<%dI" % cnt, data, p)
    p += 4 * cnt
    idx = 0
    for size in group_sizes:
        mgroups.append(list(flat[idx : idx + size]))
        idx += size
    material_id = struct.unpack_from("<I", data, p)[0]
    p += 12  # materialId + selectionGroup + selectionFlags
    p += 28  # bounds
    n_ext = struct.unpack_from("<I", data, p)[0]
    p += 4 + 28 * n_ext
    if data[p : p + 4] == b"UVAS":
        n_sets = struct.unpack_from("<I", data, p + 4)[0]
        p += 8
        for s in range(n_sets):
            cnt = expect(b"UVBS")
            p += 8
            coords = struct.unpack_from("<%df" % (cnt * 2), data, p)
            p += 8 * cnt
            if s == 0:
                uvs = [(coords[i * 2], coords[i * 2 + 1]) for i in range(cnt)]
    return Geoset(vertices, normals, uvs, faces, vgroups, mgroups, material_id)

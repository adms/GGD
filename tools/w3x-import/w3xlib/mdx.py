"""MDX (Warcraft III model, version 800) chunk parser.

Parses exactly what the glTF exporter needs: MODL/SEQS/TEXS/MTLS/GEOS/
BONE/HELP/PIVT/ATCH + the KGTR/KGRT/KGSC node animation tracks,
⭐ 以及 GEOA（逐 geoset 的逐序列可見度／顏色，GH#1186 —— 見 `GeosetAnim`；
⚠️ 這裡只「讀得出來」，⛔ `gltf.convert()` 今天還沒有把它翻成 glTF）。
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
class GeosetAnim:
    """GEOA —— 一個 geoset 的**逐序列**可見度／顏色（GH#1186）。

    ⛔ 在此之前匯入器**完全不解析這個 chunk**：`mdx.py` 與 `particles.py` 各有一行
    `p += 8` 把 `geosetId + geosetAnimId` **跳過**，⭐ 而沒有任何一行讀過 GEOA 的內容。
    ⇒ 原作靠 GEOA alpha「只在某些動作出現」的部件，轉出來之後**每一個動作都在**。

    ⚠️ 實拍確認的症狀（`ou99.464696` 拳四郎 → `godie-umal`）：一片 204 面的
    `starflash` 透明面片在 stand／walk／attack／spell／death **五個動作下都量得到**
    ⇒ 畫面上是一道比人還高的白光刃。⭐ 人體本身是好的。

    ⛔⛔ 而今天沒有任何一條閘看得到它，因為它的症狀是**多**東西不是少東西：
    嚴格 glTF 驗證說「多一片永遠可見的面片是完全合法的 glTF」· `model_intake.py`
    說「204 面遠低於任何門檻」· 實拍亮像素說「⭐ **數字變大了**，看起來更有東西」。

    ⚠️ ⭐ **這裡只做「讀得懂來源」那一半**（第〇·五守則的翻譯第 1 步：MDX 的動詞 →
    JSON/glTF 的標籤）。⭐ 第 2 步（翻成 glTF）**已經有出貨的做法了**：
    `restore_geoset_visibility.py`（後處理，commit 19b07ca85）——
    在那一片**專用骨頭子樹**上方插一個顯示節點，每個動作一條 STEP scale 軌。
    ⛔ 它**不在** `convert()` 裡，所以 `convert()` 仍然不看 `geoset_anims`。

    ⛔⛔ 這一段在 2026-09-19 之前寫著「⛔ 今天還沒做 …… 兩條路 …… ⭐ 要先量過 83 份
    會不會把 draw call 推過上限才選得了」——⭐ **那句話已經過期而且真的又騙過一輪**。
    兩條路都是**量掉的**（`geoa_translation_census.py`）：動材質 alpha 會因為
    **共用材質**一起隱藏錯的東西（5/31 份）；拆節點 scale 對**蒙皮**模型
    ⛔ **結構上無效**（glTF 規範要求忽略蒙皮網格自己節點的變換）。

    ⭐ 而「83 份」那個母體回答的是「**chunk 在不在**」，⛔ 不是工作量：
    GEOA 377 筆裡 **215 筆 always-on ⇒ 翻譯出來是空的**。
    ⇒ 真正要翻的是 **31 份模型 / 80 片**。

    ⭐ 佈局是**逐位元組驗過的**，⛔ 不是憑記憶寫的：`parse_mdx` 對本樹
    **全部 261 份 MDX** 跑過（⭐ 大小寫不分 —— 24 份 `.MDX` ＋ 1 份 `.MDx`
    在大小寫敏感的 `find '*.mdx'` 底下會整批消失），0 份丟例外，
    解出 **135 份**帶 GEOA（與獨立的 chunk 表掃描**同一個數字**）；
    每一筆的 `inclusiveSize` 都正好在 `28 + Σ(KGAO|KGAC)` 結束
    （0 份對不上、⛔ 沒有任何一份有剩餘位元組）。
    ⚠️ 其中 **4 份帶 GEOA 卻沒有 SEQS**（`HeroFateZemberForm[Big]`，兩棵來源樹各一份）
    ⇒ ⭐ 「逐序列可見度」對它們**沒有定義**，普查把它們排除在分母外。
    """

    geoset_id: int
    #: 靜態 alpha（沒有 KGAO 軌時就是它）。
    alpha: float
    #: bit 0 = DropShadow · bit 1 = Color
    flags: int
    #: 靜態顏色（⚠️ MDX 存的是 **BGR**，⛔ 不是 RGB）。
    color: tuple
    #: KGAO —— 逐格 alpha（⭐ 「只在某些動作出現」就長在這裡）。
    alpha_track: "Track | None" = None
    #: KGAC —— 逐格顏色。
    color_track: "Track | None" = None


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
    #: GEOA —— 逐 geoset 的可見度／顏色（GH#1186）。⛔ 在此之前這一格不存在。
    geoset_anims: list[GeosetAnim] = field(default_factory=list)
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
        elif tag == "GEOA":
            # ⭐ GH#1186 —— 逐筆：incl(4) + alpha(4) + flags(4) + color[3](12)
            #    + geosetId(4) = 28，之後是選用的 KGAO／KGAC，全部在 incl 之內。
            p = body_start
            while p + 28 <= body_end:
                incl = struct.unpack_from("<I", data, p)[0]
                a_end = min(p + incl, body_end)
                if incl < 28:
                    break                      # ⛔ 壞掉的長度：停，⛔ 不猜
                alpha, flags = struct.unpack_from("<fI", data, p + 4)
                color = struct.unpack_from("<3f", data, p + 12)
                anim = GeosetAnim(
                    struct.unpack_from("<I", data, p + 24)[0], alpha, flags, color
                )
                q = p + 28
                while q + 4 <= a_end:
                    sub = data[q : q + 4]
                    if sub == b"KGAO":
                        anim.alpha_track, q = _read_track(data, q + 4, 1)
                    elif sub == b"KGAC":
                        anim.color_track, q = _read_track(data, q + 4, 3)
                    else:
                        break                  # 未知子區段：跳到 incl 結尾
                m.geoset_anims.append(anim)
                p = a_end
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

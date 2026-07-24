"""Standalone MDX (v800) particle-chunk parser: PRE2 / RIBB / EVTS.

Deliberately INDEPENDENT of mdx.py (owned by the animation agent): this module
walks the top-level MDLX chunk list itself (MDLX magic, then 4-char tag +
u32 size chunks) and parses only what the VFX extractor needs:

  PRE2  particle emitter v2 (the fixed 171-byte block after the node header)
  RIBB  ribbon emitters
  EVTS  event objects (SPN/SPL/UBR/SND markers) + KEVT track times
  TEXS  texture paths (268-byte records) for textureId resolution
  MTLS  material layer 0 (filterMode + textureId) for ribbon materials
  BONE/HELP/ATCH node headers -> objectId -> name map (parent/anchor bones)
  PIVT  pivots (emitter offsets, informational)

Animated sub-chunks (KP2*/KR*/KG*) after each fixed block are skipped safely
via the emitter's inclusiveSize; single-float tracks we care about (KP2E
emission rate, KP2V / KRVS visibility) are additionally sampled so the
extractor can tell animation-gated emitters from always-on ones.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# data model
# ---------------------------------------------------------------------------


@dataclass
class PTexture:
    replaceable_id: int
    path: str


@dataclass
class PLayer:
    filter_mode: int  # material enum: 0 none 1 transparent 2 blend 3 additive
    texture_id: int  # 4 addAlpha 5 modulate 6 modulate2x


@dataclass
class PNode:
    name: str
    object_id: int
    parent_id: int
    kind: str  # bone/helper/attachment/emitter2/ribbon/event
    flags: int = 0


@dataclass
class FloatTrack:
    """Minimal scalar track: (frame, value) pairs, tangents dropped.

    `interp`/`global_seq` are recorded (0 none, 1 linear, 2 hermite, 3 bezier;
    global_seq -1 when the track runs on the model timeline) so a consumer can
    reproduce the curve, not just its peak. Tangent values are still dropped:
    hermite/bezier emitter tracks in this map are all 2-3 keys, where linear
    resampling is within a hair of the original.
    """

    keys: list[tuple[int, float]] = field(default_factory=list)
    interp: int = 0
    global_seq: int = -1

    @property
    def max_value(self) -> float:
        return max((v for _, v in self.keys), default=0.0)


@dataclass
class ParticleEmitter2:
    name: str
    object_id: int
    parent_id: int
    speed: float = 0.0
    variation: float = 0.0
    latitude: float = 0.0  # radians in the binary format
    gravity: float = 0.0
    lifespan: float = 0.0
    emission_rate: float = 0.0
    length: float = 0.0
    width: float = 0.0
    filter_mode: int = 0  # 0 blend 1 additive 2 modulate 3 modulate2x 4 alphaKey
    rows: int = 1
    cols: int = 1
    head_or_tail: int = 0  # 0 head 1 tail 2 both
    tail_length: float = 0.0
    time: float = 0.0
    segment_color: list[tuple[float, float, float]] = field(default_factory=list)
    segment_alpha: tuple[int, int, int] = (255, 255, 255)
    segment_scaling: tuple[float, float, float] = (1.0, 1.0, 1.0)
    head_interval: tuple[int, int, int] = (0, 0, 1)
    head_decay_interval: tuple[int, int, int] = (0, 0, 1)
    tail_interval: tuple[int, int, int] = (0, 0, 1)
    tail_decay_interval: tuple[int, int, int] = (0, 0, 1)
    texture_id: int = -1
    squirt: int = 0
    priority_plane: int = 0
    replaceable_id: int = 0
    track_tags: list[str] = field(default_factory=list)  # KP2* present
    emission_track: FloatTrack | None = None  # KP2E
    visibility_track: FloatTrack | None = None  # KP2V
    tracks: dict[str, FloatTrack] = field(default_factory=dict)  # every scalar KP2*
    flags: int = 0  # node flags (0x8000 unshaded, 0x20000 line, 0x80000 modelSpace…)
    pivot: tuple = (0.0, 0.0, 0.0)
    parse_note: str = ""


@dataclass
class RibbonEmitter:
    name: str
    object_id: int
    parent_id: int
    height_above: float = 0.0
    height_below: float = 0.0
    alpha: float = 1.0
    color: tuple[float, float, float] = (1.0, 1.0, 1.0)
    lifespan: float = 0.0
    texture_slot: int = 0
    emission_rate: int = 0
    rows: int = 1
    cols: int = 1
    material_id: int = -1
    gravity: float = 0.0
    track_tags: list[str] = field(default_factory=list)  # KR* present
    visibility_track: FloatTrack | None = None  # KRVS
    tracks: dict[str, FloatTrack] = field(default_factory=dict)  # every scalar KR*
    flags: int = 0  # node flags
    pivot: tuple = (0.0, 0.0, 0.0)
    parse_note: str = ""


@dataclass
class EventObject:
    name: str  # SPN/SPL/UBR/SND-prefixed marker name
    object_id: int
    parent_id: int
    times: list[int] = field(default_factory=list)


@dataclass
class ParticleModel:
    name: str = ""
    textures: list[PTexture] = field(default_factory=list)
    materials: list[list[PLayer]] = field(default_factory=list)
    nodes: dict[int, PNode] = field(default_factory=dict)
    pivots: list[tuple] = field(default_factory=list)
    emitters2: list[ParticleEmitter2] = field(default_factory=list)
    ribbons: list[RibbonEmitter] = field(default_factory=list)
    events: list[EventObject] = field(default_factory=list)
    version: int = 800
    notes: list[str] = field(default_factory=list)

    def node_name(self, object_id: int) -> str | None:
        nd = self.nodes.get(object_id)
        if nd is None:
            return None
        return nd.name or f"node{object_id}"

    def texture_for(self, texture_id: int) -> PTexture | None:
        if 0 <= texture_id < len(self.textures):
            return self.textures[texture_id]
        return None


# ---------------------------------------------------------------------------
# low-level helpers
# ---------------------------------------------------------------------------

_KNOWN_NODE_TRACKS = {b"KGTR": 3, b"KGRT": 4, b"KGSC": 3}


def _read_node_header(data: bytes, pos: int, kind: str) -> tuple[PNode, int]:
    """Node header: u32 inclusiveSize, char[80] name, i32 objectId, i32
    parentId, i32 flags, then KG* tracks (skipped). Returns (node, endPos)."""
    incl = struct.unpack_from("<I", data, pos)[0]
    end = pos + incl
    name = data[pos + 4 : pos + 84].split(b"\x00", 1)[0].decode("latin-1")
    obj_id, parent_id, flags = struct.unpack_from("<iii", data, pos + 84)
    return PNode(name, obj_id, parent_id, kind, flags), end


def _read_float_track(data: bytes, pos: int, is_int: bool = False) -> tuple[FloatTrack, int]:
    """Scalar K* track: u32 count, i32 interp, u32 globalSeq, then per key
    i32 frame + f32 value (+ inTan/outTan f32 each when interp > 1)."""
    count, interp, gseq = struct.unpack_from("<IiI", data, pos)
    pos += 12
    tr = FloatTrack(interp=interp, global_seq=-1 if gseq == 0xFFFFFFFF else gseq)
    fmt = "<i" if is_int else "<f"
    for _ in range(count):
        frame = struct.unpack_from("<i", data, pos)[0]
        val = struct.unpack_from(fmt, data, pos + 4)[0]
        pos += 8
        if interp > 1:
            pos += 8  # scalar inTan + outTan
        tr.keys.append((frame, float(val)))
    return tr, pos


def _track_dim(tag: bytes) -> tuple[int, bool] | None:
    """(dimension, isInt) for known animated sub-chunk tags, else None."""
    scalar_f = {
        b"KP2S", b"KP2R", b"KP2L", b"KP2G", b"KP2E", b"KP2N", b"KP2W", b"KP2V",
        b"KRHA", b"KRHB", b"KRAL", b"KRVS",
    }
    if tag in scalar_f:
        return 1, False
    if tag == b"KRTX":  # ribbon texture slot: int keys
        return 1, True
    if tag == b"KRCO":  # ribbon color: vec3
        return 3, False
    if tag in _KNOWN_NODE_TRACKS:
        return _KNOWN_NODE_TRACKS[tag], False
    return None


def _skip_track(data: bytes, pos: int, dim: int) -> int:
    count, interp, _gseq = struct.unpack_from("<IiI", data, pos)
    pos += 12
    per_key = 4 + 4 * dim + (8 * dim if interp > 1 else 0)
    return pos + count * per_key


def _scan_tracks(data: bytes, pos: int, end: int, collect: dict[bytes, FloatTrack],
                 tags_out: list[str]) -> int:
    """Walk K* sub-chunks between pos and end; collect EVERY scalar track and
    record every recognized tag name. Bails out silently on anything
    unrecognized (the caller already knows the emitter's end). Returns the
    position where scanning stopped, so the caller can assert it consumed the
    emitter EXACTLY — the cheapest available proof that the fixed-block layout
    is right, since a misaligned struct would leave a non-zero remainder
    almost everywhere.

    Every 1-dimensional track is kept, not just KP2E/KP2V: several models put
    their entire expression in the tracks rather than the fixed block (the
    `DeathWave.mdx` wavefront is a KP2W width ramp 366 -> 126 -> 669, and its
    fixed-block width alone renders a static bar). A consumer that only reads
    the fixed block cannot reproduce those.
    """
    while pos + 4 <= end:
        tag = data[pos : pos + 4]
        dim = _track_dim(tag)
        if dim is None:
            break
        d, is_int = dim
        tags_out.append(tag.decode("latin-1"))
        if d == 1:
            tr, npos = _read_float_track(data, pos + 4, is_int)
            collect[tag] = tr
            pos = npos
        else:
            pos = _skip_track(data, pos + 4, d)
        if pos > end:  # malformed: stop rather than misparse
            break
    return pos


# ---------------------------------------------------------------------------
# chunk parsers
# ---------------------------------------------------------------------------

_PRE2_FIXED = struct.Struct(
    "<8f"  # speed variation latitude gravity lifespan emissionRate length width
    "4I"  # filterMode rows cols headOrTail
    "2f"  # tailLength time
    "9f"  # segmentColor 3x vec3
    "3B"  # segmentAlpha
    "3f"  # segmentScaling
    "12I"  # head/headDecay/tail/tailDecay intervals (3 u32 each)
    "i"  # textureId
    "I"  # squirt
    "i"  # priorityPlane
    "I"  # replaceableId
)  # 171 bytes


def _parse_pre2(data: bytes, body_start: int, body_end: int, m: ParticleModel) -> None:
    p = body_start
    while p + 4 <= body_end:
        incl = struct.unpack_from("<I", data, p)[0]
        if incl < 8:
            m.notes.append(f"PRE2: bad inclusiveSize {incl} @ {p}; aborting chunk")
            return
        em_end = min(p + incl, body_end)
        try:
            node, node_end = _read_node_header(data, p + 4, "emitter2")
            v = _PRE2_FIXED.unpack_from(data, node_end)
        except struct.error:
            m.notes.append(f"PRE2: truncated emitter @ {p}")
            p = em_end
            continue
        em = ParticleEmitter2(node.name, node.object_id, node.parent_id)
        em.flags = node.flags
        (em.speed, em.variation, em.latitude, em.gravity, em.lifespan,
         em.emission_rate, em.length, em.width) = v[0:8]
        em.filter_mode, em.rows, em.cols, em.head_or_tail = v[8:12]
        em.tail_length, em.time = v[12:14]
        em.segment_color = [tuple(v[14 + 3 * i : 17 + 3 * i]) for i in range(3)]
        em.segment_alpha = tuple(v[23:26])
        em.segment_scaling = tuple(v[26:29])
        em.head_interval = tuple(v[29:32])
        em.head_decay_interval = tuple(v[32:35])
        em.tail_interval = tuple(v[35:38])
        em.tail_decay_interval = tuple(v[38:41])
        em.texture_id, em.squirt, em.priority_plane, em.replaceable_id = v[41:45]
        # optional animated sub-chunks (KP2*) between fixed block and em_end
        tracks: dict[bytes, FloatTrack] = {}
        stop = _scan_tracks(data, node_end + _PRE2_FIXED.size, em_end, tracks,
                            em.track_tags)
        if stop != em_end:
            em.parse_note = (f"consumed {stop - p} of {incl} declared bytes "
                             f"({em_end - stop} left over) — layout suspect")
            m.notes.append(f"PRE2 {node.name!r}: {em.parse_note}")
        em.emission_track = tracks.get(b"KP2E")
        em.visibility_track = tracks.get(b"KP2V")
        em.tracks = {k.decode("latin-1"): v for k, v in tracks.items()}
        m.nodes.setdefault(node.object_id, node)
        m.emitters2.append(em)
        p = em_end


_RIBB_FIXED = struct.Struct(
    "<3f"  # heightAbove heightBelow alpha
    "3f"  # color
    "f"  # lifespan
    "I"  # textureSlot
    "I"  # emissionRate
    "2I"  # rows cols
    "i"  # materialId
    "f"  # gravity
)  # 52 bytes


def _parse_ribb(data: bytes, body_start: int, body_end: int, m: ParticleModel) -> None:
    p = body_start
    while p + 4 <= body_end:
        incl = struct.unpack_from("<I", data, p)[0]
        if incl < 8:
            m.notes.append(f"RIBB: bad inclusiveSize {incl} @ {p}; aborting chunk")
            return
        em_end = min(p + incl, body_end)
        try:
            node, node_end = _read_node_header(data, p + 4, "ribbon")
            v = _RIBB_FIXED.unpack_from(data, node_end)
        except struct.error:
            m.notes.append(f"RIBB: truncated emitter @ {p}")
            p = em_end
            continue
        rb = RibbonEmitter(node.name, node.object_id, node.parent_id)
        rb.flags = node.flags
        rb.height_above, rb.height_below, rb.alpha = v[0:3]
        rb.color = tuple(v[3:6])
        rb.lifespan = v[6]
        rb.texture_slot, rb.emission_rate, rb.rows, rb.cols = v[7:11]
        rb.material_id, rb.gravity = v[11:13]
        tracks: dict[bytes, FloatTrack] = {}
        stop = _scan_tracks(data, node_end + _RIBB_FIXED.size, em_end, tracks,
                            rb.track_tags)
        if stop != em_end:
            rb.parse_note = (f"consumed {stop - p} of {incl} declared bytes "
                             f"({em_end - stop} left over) — layout suspect")
            m.notes.append(f"RIBB {node.name!r}: {rb.parse_note}")
        rb.visibility_track = tracks.get(b"KRVS")
        rb.tracks = {k.decode("latin-1"): v for k, v in tracks.items()}
        m.nodes.setdefault(node.object_id, node)
        m.ribbons.append(rb)
        p = em_end


def _parse_evts(data: bytes, body_start: int, body_end: int, m: ParticleModel) -> None:
    p = body_start
    while p + 4 <= body_end:
        incl = struct.unpack_from("<I", data, p)[0]
        if incl < 8:
            m.notes.append(f"EVTS: bad inclusiveSize {incl} @ {p}; aborting chunk")
            return
        node, node_end = _read_node_header(data, p, "event")
        ev = EventObject(node.name, node.object_id, node.parent_id)
        p = node_end
        if data[p : p + 4] == b"KEVT":
            count, _gseq = struct.unpack_from("<Ii", data, p + 4)
            p += 12
            ev.times = list(struct.unpack_from("<%di" % count, data, p))
            p += 4 * count
        m.nodes.setdefault(node.object_id, node)
        m.events.append(ev)


# ---------------------------------------------------------------------------
# top-level walk
# ---------------------------------------------------------------------------


def parse_particles(data: bytes) -> ParticleModel:
    if data[:4] != b"MDLX":
        raise ValueError("not an MDX file")
    m = ParticleModel()
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
            m.name = (
                data[body_start : body_start + 80].split(b"\x00", 1)[0].decode("latin-1")
            )
        elif tag == "TEXS":
            for off in range(body_start, body_end, 268):
                rid = struct.unpack_from("<I", data, off)[0]
                path = data[off + 4 : off + 264].split(b"\x00", 1)[0].decode("latin-1")
                m.textures.append(PTexture(rid, path))
        elif tag == "MTLS":
            p = body_start
            while p + 4 <= body_end:
                incl = struct.unpack_from("<I", data, p)[0]
                if incl < 4:
                    break
                mat_end = min(p + incl, body_end)
                layers: list[PLayer] = []
                lp = p + 12  # inclusiveSize + priorityPlane + flags
                if data[lp : lp + 4] == b"LAYS":
                    layer_count = struct.unpack_from("<I", data, lp + 4)[0]
                    lp += 8
                    for _ in range(layer_count):
                        lincl = struct.unpack_from("<I", data, lp)[0]
                        fm, _sf, tid = struct.unpack_from("<IIi", data, lp + 4)
                        layers.append(PLayer(fm, tid))
                        lp += lincl
                m.materials.append(layers)
                p = mat_end
        elif tag in ("BONE", "HELP", "ATCH"):
            p = body_start
            while p + 4 <= body_end:
                if tag == "BONE":
                    node, node_end = _read_node_header(data, p, "bone")
                    p = node_end + 8  # geosetId + geosetAnimId
                elif tag == "HELP":
                    node, node_end = _read_node_header(data, p, "helper")
                    p = node_end
                else:  # ATCH: outer inclusiveSize wraps node + path + KATV
                    outer = struct.unpack_from("<I", data, p)[0]
                    node, _ = _read_node_header(data, p + 4, "attachment")
                    p = p + outer
                m.nodes[node.object_id] = node
        elif tag == "PIVT":
            for off in range(body_start, body_end, 12):
                m.pivots.append(struct.unpack_from("<3f", data, off))
        elif tag == "PRE2":
            _parse_pre2(data, body_start, body_end, m)
        elif tag == "RIBB":
            _parse_ribb(data, body_start, body_end, m)
        elif tag == "EVTS":
            _parse_evts(data, body_start, body_end, m)
        pos = body_start + size
    for em in m.emitters2:
        if 0 <= em.object_id < len(m.pivots):
            em.pivot = m.pivots[em.object_id]
    for rb in m.ribbons:
        if 0 <= rb.object_id < len(m.pivots):
            rb.pivot = m.pivots[rb.object_id]
    return m

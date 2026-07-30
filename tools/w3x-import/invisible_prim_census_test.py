#!/usr/bin/env python3
"""Guards for invisible_prim_census.py (task #233 / B3).

Run:  python3 tools/w3x-import/invisible_prim_census_test.py   (stdlib only)

The load-bearing assertion is test_visibility_animated_prim_is_never_culled:
54% of the 166 invisible primitives in the shipped corpus sit on a geoset that
WC3 animates VISIBLE (GEOA/KGAO), so they are conversion defects (#59) rather
than dead placeholder faces. Deleting them would make the loss permanent.

MUTATION RECORD (2026-07-30) — every guard below was verified by breaking the
implementation and confirming red:
  * delete the `skipGeosetsWithVisibilityAnimation` branch in cull_decisions()
    -> test_visibility_animated_prim_is_never_culled FAILS ("would cull 1")
  * flip `cullWithoutMdxProof` handling to always allow
    -> test_unmapped_prim_is_kept_without_proof FAILS
  * make is_invisible_material() compare bcf[3] to 1 instead of 0
    -> test_census_finds_the_invisible_prim FAILS (0 found)
  * drop the `_` comment-key skip in load_policy()
    -> test_policy_file_ships_safe FAILS (schema pollution)
"""

import json
import os
import struct
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import invisible_prim_census as ipc  # noqa: E402
from strip_geoset_prims import strip  # noqa: E402


# ---------------------------------------------------------------------------
# synthetic fixtures — real byte layouts, parsed by the real parsers
# ---------------------------------------------------------------------------

def make_mdx(geoset_id: int, keys: list[tuple[int, float]],
             seq_name: str = "Attack", seq_range: tuple[int, int] = (0, 100)) -> bytes:
    """A minimal MDLX carrying one SEQS entry and one GEOA/KGAO track."""
    out = bytearray(b"MDLX")

    seq = bytearray(132)
    seq[0:len(seq_name)] = seq_name.encode("ascii")
    struct.pack_into("<II", seq, 80, seq_range[0], seq_range[1])
    out += b"SEQS" + struct.pack("<I", len(seq)) + bytes(seq)

    track = bytearray(b"KGAO")
    track += struct.pack("<IIi", len(keys), 0, -1)   # nkeys, interp=step, globalSeq
    for frame, val in keys:
        track += struct.pack("<if", frame, val)
    anim = bytearray(28)                              # nb + 20 pad + geosetId
    struct.pack_into("<I", anim, 24, geoset_id)
    anim += track
    struct.pack_into("<I", anim, 0, len(anim))
    out += b"GEOA" + struct.pack("<I", len(anim)) + bytes(anim)
    return bytes(out)


def make_glb(materials: list[dict], prim_materials: list[int],
             vert_counts: list[int]) -> bytes:
    """A structurally valid .glb: one mesh, one primitive per material index."""
    blobs, views, accessors, prims = bytearray(), [], [], []
    for mat_i, nverts in zip(prim_materials, vert_counts):
        attrs = {}
        for name, comps in (("POSITION", 3),):
            start = len(blobs)
            blobs += struct.pack("<%df" % (nverts * comps), *([0.0] * nverts * comps))
            views.append({"buffer": 0, "byteOffset": start,
                          "byteLength": len(blobs) - start})
            accessors.append({"bufferView": len(views) - 1, "componentType": 5126,
                              "count": nverts, "type": "VEC3"})
            attrs[name] = len(accessors) - 1
        start = len(blobs)
        blobs += struct.pack("<3H", 0, 0, 0)
        blobs += b"\0" * (-len(blobs) % 4)
        views.append({"buffer": 0, "byteOffset": start, "byteLength": 6})
        accessors.append({"bufferView": len(views) - 1, "componentType": 5123,
                          "count": 3, "type": "SCALAR"})
        prims.append({"attributes": attrs, "indices": len(accessors) - 1,
                      "material": mat_i})
    gltf = {
        "asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}], "meshes": [{"primitives": prims}],
        "materials": materials, "accessors": accessors, "bufferViews": views,
        "buffers": [{"byteLength": len(blobs)}],
    }
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    bn = bytes(blobs) + b"\0" * (-len(blobs) % 4)
    total = 12 + 8 + len(js) + 8 + len(bn)
    return (struct.pack("<III", 0x46546C67, 2, total)
            + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bn), 0x004E4942) + bn)


OPAQUE = {"name": "mat0", "pbrMetallicRoughness": {"baseColorFactor": [1, 1, 1, 1]}}
INVISIBLE = {"name": "mat1", "alphaMode": "BLEND",
             "pbrMetallicRoughness": {"baseColorFactor": [0, 0, 0, 0]}}
TEAMGLOW = {"name": "TeamGlow2", "alphaMode": "BLEND",
            "pbrMetallicRoughness": {"baseColorFactor": [0, 0, 0, 0]}}


def policy(**over) -> dict:
    pol = json.loads(json.dumps(ipc.DEFAULT_POLICY))
    pol.update(over)
    return pol


# ---------------------------------------------------------------------------

class CensusTest(unittest.TestCase):
    def test_census_finds_the_invisible_prim(self):
        """A fake glb with one invisible face: the census must catch it."""
        glb = make_glb([OPAQUE, INVISIBLE], [0, 1], [8, 4])
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as fh:
            fh.write(glb)
            path = fh.name
        try:
            gltf = ipc.read_glb_json(path)
            found = ipc.invisible_prims(gltf)
        finally:
            os.unlink(path)
        self.assertEqual(len(found), 1, "the alpha-0 primitive was not detected")
        self.assertEqual(found[0]["prim"], 1)
        self.assertEqual(found[0]["reason"], ipc.REASON_ADDITIVE_GLOW)

    def test_opaque_model_yields_nothing(self):
        glb = make_glb([OPAQUE], [0], [8])
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as fh:
            fh.write(glb)
            path = fh.name
        try:
            self.assertEqual(ipc.invisible_prims(ipc.read_glb_json(path)), [])
        finally:
            os.unlink(path)

    def test_teamglow_is_classified_separately(self):
        gltf = {"materials": [TEAMGLOW],
                "meshes": [{"primitives": [{"material": 0}]}]}
        self.assertEqual(ipc.invisible_prims(gltf)[0]["reason"], ipc.REASON_TEAM_GLOW)


class VisibilityTest(unittest.TestCase):
    def test_kgao_track_that_rises_is_ever_visible(self):
        vis = ipc.geoset_visibility(make_mdx(3, [(0, 0.0), (50, 1.0), (100, 0.0)]))
        self.assertIn(3, vis)
        self.assertTrue(vis[3]["ever_visible"])
        self.assertEqual(vis[3]["visible_in"], ["Attack"])

    def test_kgao_track_flat_at_zero_is_never_visible(self):
        vis = ipc.geoset_visibility(make_mdx(3, [(0, 0.0), (100, 0.0)]))
        self.assertIn(3, vis)
        self.assertFalse(vis[3]["ever_visible"])

    def test_mdx_without_geoa_yields_no_entries(self):
        self.assertEqual(ipc.geoset_visibility(b"MDLX"), {})


class CullDecisionTest(unittest.TestCase):
    PRIMS = [{"prim": 1, "material": 1, "name": "mat1",
              "reason": ipc.REASON_ADDITIVE_GLOW}]

    def test_visibility_animated_prim_is_never_culled(self):
        """THE GUARD. WC3 shows this geoset during Attack — culling it would
        delete content, not clean up a placeholder."""
        vis = ipc.geoset_visibility(make_mdx(7, [(0, 0.0), (50, 1.0), (100, 0.0)]))
        drop = ipc.cull_decisions(self.PRIMS, {1: 7}, vis, policy(cull="safe"))
        self.assertEqual(
            drop, {},
            "a primitive whose MDX geoset is animated VISIBLE was culled — "
            "the skipGeosetsWithVisibilityAnimation guard is not holding")

    def test_always_hidden_prim_is_culled(self):
        """The counterpart: without the guard firing, 'safe' must still act,
        otherwise the guard above would pass for the trivial reason that
        nothing is ever culled."""
        vis = ipc.geoset_visibility(make_mdx(7, [(0, 0.0), (100, 0.0)]))
        drop = ipc.cull_decisions(self.PRIMS, {1: 7}, vis, policy(cull="safe"))
        self.assertEqual(list(drop), [1])

    def test_geoset_without_any_track_is_culled(self):
        drop = ipc.cull_decisions(self.PRIMS, {1: 7}, {}, policy(cull="safe"))
        self.assertEqual(list(drop), [1])

    def test_unmapped_prim_is_kept_without_proof(self):
        drop = ipc.cull_decisions(self.PRIMS, {}, {}, policy(cull="safe"))
        self.assertEqual(drop, {}, "culled a primitive with no MDX proof")
        drop = ipc.cull_decisions(self.PRIMS, {}, {},
                                  policy(cull="safe", cullWithoutMdxProof=True))
        self.assertEqual(list(drop), [1])

    def test_cull_off_culls_nothing(self):
        drop = ipc.cull_decisions(self.PRIMS, {1: 7}, {}, policy(cull="off"))
        self.assertEqual(drop, {})

    def test_cull_all_ignores_the_guard(self):
        """'all' is documented as destructive; prove it really does bypass."""
        vis = ipc.geoset_visibility(make_mdx(7, [(0, 0.0), (50, 1.0), (100, 0.0)]))
        drop = ipc.cull_decisions(self.PRIMS, {1: 7}, vis, policy(cull="all"))
        self.assertEqual(list(drop), [1])

    def test_opted_out_reason_is_skipped(self):
        pol = policy(cull="safe")
        pol["reasons"] = {ipc.REASON_ADDITIVE_GLOW: False, ipc.REASON_TEAM_GLOW: True}
        self.assertEqual(ipc.cull_decisions(self.PRIMS, {1: 7}, {}, pol), {})


class CullExecutionTest(unittest.TestCase):
    def test_culling_actually_removes_the_primitive_and_its_material(self):
        """Behaviour, not intent: run the real strip() the pipeline would run."""
        glb = make_glb([OPAQUE, INVISIBLE], [0, 1], [8, 4])
        with tempfile.NamedTemporaryFile(suffix=".glb", delete=False) as fh:
            fh.write(glb)
            path = fh.name
        try:
            from strip_geoset_prims import read_glb
            gltf, binary = read_glb(path)
            prims = ipc.invisible_prims(gltf)
            drop = ipc.cull_decisions(prims, {1: 7}, {}, policy(cull="safe"))
            gltf, new_bin, removed = strip(gltf, binary, drop)
        finally:
            os.unlink(path)
        self.assertEqual(len(removed), 1)
        self.assertEqual(len(gltf["meshes"][0]["primitives"]), 1)
        self.assertEqual([m["name"] for m in gltf["materials"]], ["mat0"],
                         "the transparent material survived the mark-and-sweep")
        self.assertLess(len(new_bin), len(binary), "BIN was not rebuilt smaller")


class PolicyTest(unittest.TestCase):
    def test_policy_file_ships_safe(self):
        """The switch that ships must not be the destructive one."""
        pol = ipc.load_policy()
        self.assertIn(pol["cull"], ("off", "safe"),
                      "invisible_prim_policy.json ships with cull='all', which "
                      "the 2026-07-30 audit showed deletes 67 live primitives")
        self.assertTrue(pol["skipGeosetsWithVisibilityAnimation"])
        self.assertFalse(pol["cullWithoutMdxProof"])
        self.assertFalse([k for k in pol if k.startswith("_")],
                         "commentary keys leaked into the parsed policy")

    def test_policy_rejects_an_unknown_mode(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as fh:
            json.dump({"cull": "yolo"}, fh)
            path = fh.name
        try:
            with self.assertRaises(ValueError):
                ipc.load_policy(path)
        finally:
            os.unlink(path)

    def test_missing_policy_file_falls_back_to_defaults(self):
        pol = ipc.load_policy(os.path.join(tempfile.gettempdir(), "no-such-policy.json"))
        self.assertEqual(pol["cull"], "off")


if __name__ == "__main__":
    unittest.main(verbosity=2)

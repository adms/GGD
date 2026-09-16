"""GH#1186 restore_geoset_visibility 的守衛（合成夾具，⛔ 不依賴本機素材庫）。

  python3 -m unittest discover -s tools/w3x-import -p 'test_restore_geoset_visibility.py'

突變驗過：拿掉「骨頭也綁著別的頂點」那一條 ⇒ test_refuses_bone_shared_with_body 紅。
"""
import copy
import struct
import unittest

import restore_geoset_visibility as tool


def fixture():
    """root(0) ─ body(1)；root ─ fx(2) ─ fx_tip(3)；mesh 節點(4)。一個 primitive：頂點 0-2 身體、3-5 特效片。"""
    positions = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 2, 0), (1, 2, 0), (0, 3, 0)]
    joints = [(1, 0, 0, 0)] * 3 + [(2, 3, 0, 0)] * 3
    weights = [(1, 0, 0, 0)] * 3 + [(0.5, 0.5, 0, 0)] * 3
    binary = bytearray()
    views, accessors = [], []

    def add(rows, fmt, kind, component, **extra):
        binary.extend(b"\0" * (-len(binary) % 4))
        offset = len(binary)
        for r in rows:
            binary.extend(struct.pack("<" + fmt * len(r), *r))
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(binary) - offset})
        accessors.append({"bufferView": len(views) - 1, "componentType": component, "count": len(rows), "type": kind, **extra})
        return len(accessors) - 1

    pos = add(positions, "f", "VEC3", 5126, min=[0, 0, 0], max=[1, 3, 0])
    jnt = add(joints, "B", "VEC4", 5121)
    wgt = add(weights, "f", "VEC4", 5126)
    idx = add([(i,) for i in range(6)], "H", "SCALAR", 5123)
    # 0.939 秒：float32 存不準 ⇒ 驗「最後一格剛好切換」時時間仍嚴格遞增（拳四郎 Spell - 1 踩過）
    t_in = add([(0.0,), (0.939,)], "f", "SCALAR", 5126, min=[0], max=[0.939])
    rot = add([(0, 0, 0, 1), (0, 0, 0, 1)], "f", "VEC4", 5126)
    one = add([(1, 1, 1), (1, 1, 1)], "f", "VEC3", 5126)
    clip = lambda name: {"name": name, "samplers": [{"input": t_in, "output": rot}, {"input": t_in, "output": one}],
                         "channels": [{"sampler": 0, "target": {"node": 2, "path": "rotation"}},
                                      {"sampler": 1, "target": {"node": 2, "path": "scale"}}]}
    gltf = {
        "asset": {"version": "2.0"}, "scenes": [{"nodes": [0, 4]}], "scene": 0,
        "nodes": [{"name": "root", "children": [1, 2]}, {"name": "body"}, {"name": "fx", "children": [3]},
                  {"name": "fx_tip"}, {"name": "mesh", "mesh": 0, "skin": 0}],
        "skins": [{"joints": [0, 1, 2, 3]}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": pos, "JOINTS_0": jnt, "WEIGHTS_0": wgt}, "indices": idx}]}],
        "animations": [clip("Stand"), clip("Attack")],
        "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(binary)}],
    }
    geosets = [{"vertices": positions[:3], "faces": [0, 1, 2], "bones": frozenset({"body"})},
               {"vertices": positions[3:], "faces": [0, 1, 2], "bones": frozenset({"fx", "fx_tip"})}]
    seqs = [{"name": "Stand", "start": 0, "end": 939}, {"name": "Attack", "start": 2000, "end": 2939}]
    geoas = {1: {"geoset": 1, "static_alpha": 1.0,
                 "tracks": {"KGAO": {"interp": 0, "gseq": -1, "keys": [(0, 0.0), (2000, 0.0), (2400, 1.0), (2939, 0.0)]}}}}
    return gltf, binary, geosets, seqs, geoas


def keys(gltf, binary, clip, node):
    channel = next(c for c in gltf["animations"][clip]["channels"] if c["target"] == {"node": node, "path": "scale"})
    sampler = gltf["animations"][clip]["samplers"][channel["sampler"]]
    assert sampler["interpolation"] == "STEP"
    times = tool.read_accessor(gltf, binary, sampler["input"])
    values = tool.read_accessor(gltf, binary, sampler["output"])
    assert all(a[0] < b[0] for a, b in zip(times, times[1:])), times  # 讀回 float32 後仍嚴格遞增
    return [(round(t[0], 3), v[0]) for t, v in zip(times, values)]


class RestoreGeosetVisibility(unittest.TestCase):
    def test_hides_effect_per_clip_through_an_inserted_parent(self):
        gltf, binary, geosets, seqs, geoas = fixture()
        report, changed = tool.convert(gltf, binary, geosets, seqs, geoas, "Stand", ["Stand", "Attack"])
        self.assertTrue(changed)
        [row] = report["converted"]
        vis = row["visNode"]
        self.assertEqual(gltf["nodes"][0]["children"], [1, vis])  # 顯示節點頂替 fx 的位置
        self.assertEqual(gltf["nodes"][vis]["children"], [2])
        self.assertEqual(gltf["nodes"][vis]["scale"], [0.0] * 3)  # 靜止姿勢＝Stand 開頭：隱藏
        self.assertEqual(keys(gltf, binary, 0, vis), [(0.0, 0.0), (0.939, 0.0)])
        self.assertEqual(keys(gltf, binary, 1, vis), [(0.0, 0.0), (0.4, 1.0), (0.939, 0.0)])
        self.assertEqual(row["visibleIn"], ["Attack"])

    def test_other_sequence_keys_do_not_leak(self):
        gltf, binary, geosets, seqs, geoas = fixture()
        geoas[1]["tracks"]["KGAO"]["keys"] = [(2000, 0.0)]  # 只在 Attack 關掉 ⇒ Stand 用靜態 alpha（GH#742）
        report, changed = tool.convert(gltf, binary, geosets, seqs, geoas, "Stand")
        vis = report["converted"][0]["visNode"]
        self.assertEqual(keys(gltf, binary, 0, vis), [(0.0, 1.0), (0.939, 1.0)])
        self.assertEqual(keys(gltf, binary, 1, vis), [(0.0, 0.0), (0.939, 0.0)])

    def test_refuses_bone_shared_with_body(self):
        gltf, binary, geosets, seqs, geoas = fixture()
        before = copy.deepcopy(gltf)
        struct.pack_into("<B", binary, gltf["bufferViews"][1]["byteOffset"], 2)  # 身體第 0 個頂點改綁 fx
        report, changed = tool.convert(gltf, binary, geosets, seqs, geoas, "Stand", ["Stand"])
        self.assertFalse(changed)
        self.assertEqual(gltf, before)
        self.assertIn("也綁著別的頂點", report["blocking"][0]["reason"])


if __name__ == "__main__":
    unittest.main()

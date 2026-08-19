#!/usr/bin/env python3
"""GH#456 — 揮砍的張角由**模型的動畫**推導,不是由資料表。

    python3 tools/w3x-import/build_slash_pitch.py            # 量 + 寫 content
    python3 tools/w3x-import/build_slash_pitch.py --measure  # 只量,寫中繼帳本
    python3 tools/w3x-import/build_slash_pitch.py --check    # 閘:比對,不寫

===========================================================================
① 為什麼 #391 / #400 兩張票都沒回答 owner
===========================================================================
owner 2026-08-18:「**slash 全家族的張角 又是一個看不懂的東西**」

  · #391 把 41 支共用的 `slashPitchDeg: 30` 拆成逐支推導 —— 讀 **w3a 的藝術欄**
  · #400 剩 7 支 w3a 是空的 → 改讀 **JASS literal**

兩張都在問「這支技能的**資料表**寫了什麼模型」。而 owner 看的是畫面:
**角色明明在直劈,刀光卻是斜的。**

⭐ 「這一刀是橫是直」在**模型的動畫裡本來就演出來了** —— 那是 glb 裡真實存在的
骨骼旋轉,不是任何一欄資料。所以這支腳本量的是動畫,⛔ 不是 w3a、⛔ 不是 JASS。

===========================================================================
② 量的是什麼 —— 一個定義,⛔ 不是 41 個決定
===========================================================================
`slashPitchDeg` 的語意 (`schema/vfx.ts:103`):**0 = 橫砍(刀光平)、90 = 直劈
(刀光立起來)**。刀光躺在**揮擊平面**上,所以:

    揮擊平面的法線 = 揮擊的**旋轉軸**
    橫砍 → 繞垂直軸轉 → 軸 ∥ up   → pitch 0
    直劈 → 繞水平軸轉 → 軸 ⊥ up   → pitch 90
    ⇒ pitchDeg = degrees(acos(|axis · up|))

⭐ 這個量**與角色面向無關**(只吃軸的垂直分量),所以⛔ 不需要知道哪個模型的
正面是 +X 還是 +Z —— 那正是 #61/#68 反覆踩到的東西。

刀身向量 d(t) = `Weapon` 節點世界座標 − 握它的手的世界座標。沒有 `Weapon` 就退
到 手 − 肘(拳法/爪類的「刀身」就是前臂)。旋轉軸由**連續兩幀的外積**累加:
Σ d(t)×d(t+1),⛔ 不是對整條軌跡做 PCA —— 軌跡有平移(整隻手在移動),外積沒有。

===========================================================================
③ 量哪一段動畫 —— 跟著**遊戲真的會播的那一個**
===========================================================================
技能施放送出的是 `cast` 脈衝 (`AnimationStateMachine.ts:21`),所以量的是
`model@1.clipMap.cast` 指的那一支 clip,⛔ 不是 `attack`。`attack` 一樣量,但只
拿來當**對照**與退路 —— 一支「Spell = 舉手唸咒」的 clip 沒有揮擊可量,那不是
可以靜默補一個數字的情況(見④)。

窗口取**角速度峰值**的那一段(≥ 峰值的 `WINDOW_FRAC`),⛔ 不是整支 clip:
收招與預備動作會把軸拉回中間值,那正是「多數 30°」的形狀。

===========================================================================
④ 量不到的要**列出來**,⛔ 不可以靜默落回 30
===========================================================================
CLAUDE.md 第二守則:「fail-open 沒錯,**靜默**才是缺陷」。今天的狀態就是靜默 ——
41 支全部拿同一個 30,而「壞掉跟正常長得一模一樣」。

四種量不到,每一種都寫進帳本的 `unmeasured` 並由 `--check` 印出來:

  `no-clip`      模型沒有 cast/attack clip
  `no-blade`     沒有 `Weapon`/手/肘骨 —— 沒有東西可以當刀身
  `short-sweep`  峰值窗口掃過的總角度 < `MIN_SWEEP_DEG`(舉手唸咒、原地發光)
  `not-planar`   外積和的長度 / 外積長度和 < `MIN_PLANARITY`(亂揮,沒有平面)

⛔ 這四種一律**不寫值**,於是它們落回全域 `slashPitchDeg` —— 和今天一樣,
差別是**現在有名單**。
"""
from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import struct
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
LEDGER = os.path.join(HERE, "out", "slash-pitch", "ANIM_SWING.json")
VFX_FAMILIES = os.path.join(REPO, "content", "config", "vfx-families.json")

# ---------------------------------------------------------------- 量測參數
SAMPLES = 96          # 每支 clip 均勻取樣數
WINDOW_FRAC = 0.5     # 揮擊窗口 = 角速度 >= 峰值的這個比例
MIN_SWEEP_DEG = 25.0  # 窗口內掃過的總角度下限
MIN_PLANARITY = 0.70  # |Σ cross| / Σ|cross|
MIN_BLADE_LEN = 0.03  # 刀身向量長度下限(世界單位;模型約 2u 高) —— 退化保護
UP = (0.0, 1.0, 0.0)  # glTF 是 Y-up(model@1.attachPoints 的 Head.y 就是高度)

# ---------------------------------------------------------------------------
# 骨頭**角色**辨識 —— 一張表,⛔ 不是 45 個模型各一條規則
# ---------------------------------------------------------------------------
# 出貨的 45 個 glb 至少有四種命名慣例(量到的):
#   `Bone_Hand_R` (WC3 Blizzard 骨架) · `handRight` (程序生成的體素替身)
#   `bone right hand` (linainvers) · `bone_Box06` (ye-wuqi1,只有 attach ref 有名字)
# 所以先把名字正規化成純小寫英數,再用**角色**去問,⛔ 不是用字面名字去比。
def _norm(name: str | None) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _side(n: str) -> str | None:
    if "right" in n or n.endswith("r"):
        return "R"
    if "left" in n or n.endswith("l"):
        return "L"
    return None


def _role(n: str) -> str | None:
    if "weapon" in n:
        return "weapon"
    if "hand" in n:
        return "hand"
    if "arm" in n and "armature" not in n:
        return "arm"
    if "chest" in n or "torso" in n or "heart" in n:
        return "chest"
    if any(k in n for k in ("pelvis", "hips", "buttock", "root", "origin")):
        return "root"
    if any(k in n for k in ("leg", "foot", "knee", "thigh", "tail")):
        return "lower"
    return None


# 近端關節可以是哪幾種角色。⛔ `lower`(腿/腳/尾)不在裡面 —— 見 `Rig.blade`。
UPPER_BODY = ("hand", "arm", "chest", "root")

COMPONENT_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
COMPONENT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NUM_COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


# ------------------------------------------------------------------ glb 讀取
def read_glb(path: str) -> tuple[dict, bytes]:
    with open(path, "rb") as fh:
        magic, _ver, length = struct.unpack("<III", fh.read(12))
        if magic != 0x46546C67:
            raise ValueError(f"not a glb: {path}")
        gltf: dict | None = None
        binary = b""
        while fh.tell() < length:
            head = fh.read(8)
            if len(head) < 8:
                break
            clen, ctype = struct.unpack("<II", head)
            data = fh.read(clen)
            if ctype == 0x4E4F534A:
                gltf = json.loads(data.decode("utf-8"))
            elif ctype == 0x004E4942:
                binary = data
    if gltf is None:
        raise ValueError(f"no JSON chunk: {path}")
    return gltf, binary


def accessor(gltf: dict, binary: bytes, index: int) -> list[list[float]]:
    acc = gltf["accessors"][index]
    n = NUM_COMPONENTS[acc["type"]]
    count = acc["count"]
    ctype = acc["componentType"]
    fmt = COMPONENT_FMT[ctype]
    size = COMPONENT_SIZE[ctype]
    if "bufferView" not in acc:
        return [[0.0] * n for _ in range(count)]
    view = gltf["bufferViews"][acc["bufferView"]]
    base = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = view.get("byteStride") or (size * n)
    out: list[list[float]] = []
    for i in range(count):
        vals = struct.unpack_from("<" + fmt * n, binary, base + i * stride)
        out.append([float(v) for v in vals])
    return out


# ------------------------------------------------------------------ 小數學
def q_slerp(a: list[float], b: list[float], t: float) -> list[float]:
    dot = sum(a[i] * b[i] for i in range(4))
    if dot < 0.0:
        b = [-v for v in b]
        dot = -dot
    if dot > 0.9995:
        out = [a[i] + (b[i] - a[i]) * t for i in range(4)]
    else:
        th0 = math.acos(max(-1.0, min(1.0, dot)))
        th = th0 * t
        s0 = math.sin(th0)
        w_a = math.sin(th0 - th) / s0
        w_b = math.sin(th) / s0
        out = [a[i] * w_a + b[i] * w_b for i in range(4)]
    norm = math.sqrt(sum(v * v for v in out)) or 1.0
    return [v / norm for v in out]


def trs_matrix(t: list[float], r: list[float], s: list[float]) -> list[float]:
    x, y, z, w = r
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    m = [
        (1 - 2 * (yy + zz)) * s[0], (2 * (xy + wz)) * s[0], (2 * (xz - wy)) * s[0], 0.0,
        (2 * (xy - wz)) * s[1], (1 - 2 * (xx + zz)) * s[1], (2 * (yz + wx)) * s[1], 0.0,
        (2 * (xz + wy)) * s[2], (2 * (yz - wx)) * s[2], (1 - 2 * (xx + yy)) * s[2], 0.0,
        t[0], t[1], t[2], 1.0,
    ]
    return m


def mat_mul(a: list[float], b: list[float]) -> list[float]:
    """column-major, 回傳 a∘b(先套 b 再套 a,即 b 是子、a 是父)。"""
    out = [0.0] * 16
    for c in range(4):
        for r in range(4):
            out[c * 4 + r] = sum(a[k * 4 + r] * b[c * 4 + k] for k in range(4))
    return out


def mat_translation(m: list[float]) -> tuple[float, float, float]:
    return (m[12], m[13], m[14])


def cross(a: tuple, b: tuple) -> tuple:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def norm(v: tuple) -> float:
    return math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])


# ------------------------------------------------------------------ 動畫取樣
class Rig:
    """一份 glb 的節點階層 + 動畫取樣器。"""

    def __init__(self, gltf: dict, binary: bytes):
        self.gltf = gltf
        self.bin = binary
        self.nodes = gltf.get("nodes", [])
        self.parent: dict[int, int] = {}
        for i, n in enumerate(self.nodes):
            for c in n.get("children", []):
                self.parent[c] = i
        self.rest: list[tuple[list[float], list[float], list[float]]] = []
        for n in self.nodes:
            if "matrix" in n:
                # 只有極少數轉出來的 glb 用 matrix;這裡不拆解,直接當恆等 TRS
                # 並在 local_matrix 裡走 matrix 那條路。
                self.rest.append(([0, 0, 0], [0, 0, 0, 1], [1, 1, 1]))
            else:
                self.rest.append(
                    (
                        list(n.get("translation", [0, 0, 0])),
                        list(n.get("rotation", [0, 0, 0, 1])),
                        list(n.get("scale", [1, 1, 1])),
                    )
                )

    def by_role(self, role: str, side: str | None = None) -> list[int]:
        out = []
        for i, n in enumerate(self.nodes):
            nm = _norm(n.get("name"))
            if _role(nm) != role:
                continue
            if side is not None and _side(nm) != side:
                continue
            out.append(i)
        return out

    def ancestors(self, node: int) -> list[int]:
        out: list[int] = []
        cur = self.parent.get(node)
        while cur is not None:
            out.append(cur)
            cur = self.parent.get(cur)
        return out

    def rest_pos(self, node: int) -> tuple[float, float, float]:
        return mat_translation(self.world_at(node, {}, 0.0))

    def blade(self, animated: set[int]) -> tuple[int, int, str] | None:
        """刀身 = (遠端, 近端)。⭐ 近端先問**遠端自己的父鏈**,問不到才走角色階梯。

        父鏈優先是因為它一定是對的關節(`Weapon` 的父就是握它的手);而
        `linainvers` / `ye-wuqi1` 這種把 attach point 平放在 Armature 底下的
        模型父鏈答不出來,才需要階梯。⛔ 兩者都答不出來就是 `no-blade`,
        ⛔ 不編一個方向出來。

        ⚠️ **遠端必須在這支 clip 裡真的會動**(`animated` = 這支 clip 驅動到的節點
        及其後代)。少了這一條就踩到了自己挖的坑:`fox.glb` 的 `Weapon Ref` 掛在
        Armature 底下、任何 clip 都不驅動它 —— 選中它會量到「掃過 0°」,那不是
        「這一招沒有揮擊」而是「我挑錯了骨頭」。⛔ 兩者在報表上長得一模一樣,
        所以要在挑的時候就排除,不是在事後解讀。
        """
        def moves(node: int) -> bool:
            return node in animated or any(a in animated for a in self.ancestors(node))

        for far in [*self.by_role("weapon"), *self.by_role("hand", "R"), *self.by_role("hand", "L")]:
            if not moves(far):
                continue
            fnm = _norm(self.nodes[far].get("name"))
            side = _side(fnm)
            # ① 骨架上真的相連的祖先(⭐ 保證量到的是一段**肢節**,不是兩根無關的骨頭)
            chain = [a for a in self.ancestors(far) if _role(_norm(self.nodes[a].get("name")))]
            if chain and _role(_norm(self.nodes[chain[0]].get("name"))) not in UPPER_BODY:
                # ⚠️ `fox.glb` 的 `Weapon Ref` 掛在 **Bone_Foot_R** 底下(轉檔產物)。
                # 拿它當刀身量到的是「腳怎麼轉」。⛔ 不是把它當成「這一招沒有揮擊」——
                # 直接放棄這個遠端,改用下一個候選(手),那才是這隻角色真的在揮的東西。
                continue
            ladder = list(chain)
            # ② 骨架答不出來(attach point 平放在 Armature 底下,例:linainvers /
            #    ye-wuqi1)才用**角色**去找。
            if _role(fnm) == "weapon":
                ladder += self.by_role("hand", side) + self.by_role("hand", "R") + self.by_role("hand", "L")
            ladder += self.by_role("arm", side) + self.by_role("arm") + self.by_role("chest") + self.by_role("root")
            fp = self.rest_pos(far)
            for near in ladder:
                if near == far:
                    continue
                np_ = self.rest_pos(near)
                d = norm((fp[0] - np_[0], fp[1] - np_[1], fp[2] - np_[2]))
                if d >= MIN_BLADE_LEN:
                    return (far, near, f"{self.nodes[far].get('name')}←{self.nodes[near].get('name')}")
        return None

    def clip(self, name: str) -> dict | None:
        for a in self.gltf.get("animations", []):
            if (a.get("name") or "").lower() == name.lower():
                return a
        return None

    def clip_fuzzy(self, needles: list[str]) -> dict | None:
        for needle in needles:
            for a in self.gltf.get("animations", []):
                if needle in (a.get("name") or "").lower():
                    return a
        return None

    def sample_channels(self, anim: dict) -> tuple[float, dict]:
        """→ (duration, {node: {path: (times, values, interp)}})"""
        chans: dict[int, dict[str, tuple]] = {}
        duration = 0.0
        for ch in anim.get("channels", []):
            tgt = ch.get("target", {})
            node = tgt.get("node")
            path = tgt.get("path")
            if node is None or path not in ("translation", "rotation", "scale"):
                continue
            smp = anim["samplers"][ch["sampler"]]
            times = [t[0] for t in accessor(self.gltf, self.bin, smp["input"])]
            values = accessor(self.gltf, self.bin, smp["output"])
            interp = smp.get("interpolation", "LINEAR")
            if times:
                duration = max(duration, times[-1])
            chans.setdefault(node, {})[path] = (times, values, interp)
        return duration, chans

    @staticmethod
    def _eval(times: list[float], values: list[list[float]], interp: str, t: float, rot: bool):
        if not times:
            return None
        if interp == "CUBICSPLINE":
            values = values[1::3]  # 只取 value,丟掉切線 —— 端點值正確,足夠定軸
        if t <= times[0]:
            return values[0]
        if t >= times[-1]:
            return values[-1]
        lo, hi = 0, len(times) - 1
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if times[mid] <= t:
                lo = mid
            else:
                hi = mid
        if interp == "STEP":
            return values[lo]
        span = times[hi] - times[lo]
        u = 0.0 if span <= 0 else (t - times[lo]) / span
        if rot:
            return q_slerp(values[lo], values[hi], u)
        return [values[lo][i] + (values[hi][i] - values[lo][i]) * u for i in range(len(values[lo]))]

    def world_at(self, node: int, chans: dict, t: float) -> list[float]:
        chain: list[int] = []
        cur: int | None = node
        while cur is not None:
            chain.append(cur)
            cur = self.parent.get(cur)
        m = [1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0, 0, 0, 0, 0, 1.0]
        for idx in reversed(chain):
            raw = self.nodes[idx]
            if "matrix" in raw:
                local = list(raw["matrix"])
            else:
                tr, rr, sr = self.rest[idx]
                c = chans.get(idx, {})
                if "translation" in c:
                    tr = self._eval(*c["translation"], t, False) or tr
                if "rotation" in c:
                    rr = self._eval(*c["rotation"], t, True) or rr
                if "scale" in c:
                    sr = self._eval(*c["scale"], t, False) or sr
                local = trs_matrix(tr, rr, sr)
            m = mat_mul(m, local)
        return m


# ------------------------------------------------------------------ 一支 clip
def measure_clip(rig: Rig, anim: dict) -> dict:
    duration, chans = rig.sample_channels(anim)
    if duration <= 0.0:
        return {"ok": False, "reason": "short-sweep", "detail": "clip duration 0"}

    animated = set(chans)
    for node in list(animated):
        stack = list(rig.nodes[node].get("children", []))
        while stack:
            child = stack.pop()
            animated.add(child)
            stack.extend(rig.nodes[child].get("children", []))
    blade = rig.blade(animated)
    if blade is None:
        return {"ok": False, "reason": "no-blade", "detail": "找不到 武器/手 與一個非退化的近端關節"}
    far_i, near_i, blade_label = blade

    dirs: list[tuple] = []
    for k in range(SAMPLES):
        t = duration * k / (SAMPLES - 1)
        p_far = mat_translation(rig.world_at(far_i, chans, t))
        p_near = mat_translation(rig.world_at(near_i, chans, t))
        v = (p_far[0] - p_near[0], p_far[1] - p_near[1], p_far[2] - p_near[2])
        n = norm(v)
        if n < MIN_BLADE_LEN:
            return {"ok": False, "reason": "no-blade", "detail": f"{blade_label} 長度 0"}
        dirs.append((v[0] / n, v[1] / n, v[2] / n))

    steps = []
    for k in range(len(dirs) - 1):
        c = cross(dirs[k], dirs[k + 1])
        mag = norm(c)
        dot = max(-1.0, min(1.0, sum(dirs[k][i] * dirs[k + 1][i] for i in range(3))))
        steps.append((c, mag, math.degrees(math.acos(dot))))

    peak = max((s[2] for s in steps), default=0.0)
    if peak <= 0.0:
        return {"ok": False, "reason": "short-sweep", "detail": "刀身完全沒有轉動"}
    # 峰值所在的連續窗口
    pk = max(range(len(steps)), key=lambda i: steps[i][2])
    lo = pk
    while lo > 0 and steps[lo - 1][2] >= peak * WINDOW_FRAC:
        lo -= 1
    hi = pk
    while hi < len(steps) - 1 and steps[hi + 1][2] >= peak * WINDOW_FRAC:
        hi += 1
    window = steps[lo : hi + 1]

    swept = sum(s[2] for s in window)
    acc = (0.0, 0.0, 0.0)
    mag_sum = 0.0
    for c, mag, _deg in window:
        acc = (acc[0] + c[0], acc[1] + c[1], acc[2] + c[2])
        mag_sum += mag
    acc_len = norm(acc)
    planarity = 0.0 if mag_sum <= 0 else acc_len / mag_sum
    result = {
        "clip": anim.get("name"),
        "blade": blade_label,
        "durationSec": round(duration, 4),
        "windowSec": [round(duration * lo / (SAMPLES - 1), 4), round(duration * (hi + 1) / (SAMPLES - 1), 4)],
        "sweptDeg": round(swept, 1),
        "planarity": round(planarity, 3),
    }
    if swept < MIN_SWEEP_DEG:
        result.update({"ok": False, "reason": "short-sweep", "detail": f"掃過 {swept:.1f}° < {MIN_SWEEP_DEG}°"})
        return result
    if planarity < MIN_PLANARITY:
        result.update({"ok": False, "reason": "not-planar", "detail": f"平面度 {planarity:.2f} < {MIN_PLANARITY}"})
        return result
    axis = (acc[0] / acc_len, acc[1] / acc_len, acc[2] / acc_len)
    pitch = math.degrees(math.acos(min(1.0, abs(axis[0] * UP[0] + axis[1] * UP[1] + axis[2] * UP[2]))))
    result.update({"ok": True, "axis": [round(v, 4) for v in axis], "pitchDeg": round(pitch)})
    return result


# ------------------------------------------------------------------ 內容側
def load_json(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def slash_abilities() -> list[dict]:
    """出貨內容裡真的引用 slash primitive 的技能 —— ⛔ 不是一張手寫名單。"""
    rows = []
    for path in sorted(glob.glob(os.path.join(REPO, "content", "abilities", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        with open(path, encoding="utf-8") as fh:
            raw = fh.read()
        if not re.search(r"fx\.prim\.[a-z]+\.slash", raw):
            continue
        doc = json.loads(raw)
        aid = doc.get("id", "")
        rows.append({"ability": aid, "name": doc.get("name"), "champion": aid.split(".")[0]})
    return rows


def champion_models() -> dict[str, dict]:
    models = {}
    for path in sorted(glob.glob(os.path.join(REPO, "content", "models", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        doc = load_json(path)
        models[doc["id"]] = doc
    out = {}
    for path in sorted(glob.glob(os.path.join(REPO, "content", "champions", "*.json"))):
        if os.path.basename(path).startswith("_"):
            continue
        doc = load_json(path)
        out[doc["id"]] = {"name": doc.get("name"), "modelKey": doc.get("modelKey"), "model": models.get(doc.get("modelKey"))}
    return out


def measure_all() -> dict:
    champs = champion_models()
    ledger = {
        "schema": "anim-slash-pitch@1",
        "how": "刀身向量連續外積的累加 = 揮擊旋轉軸;pitchDeg = acos(|軸·up|)",
        "params": {
            "samples": SAMPLES,
            "windowFrac": WINDOW_FRAC,
            "minSweepDeg": MIN_SWEEP_DEG,
            "minPlanarity": MIN_PLANARITY,
        },
        "note": "⛔ 刻意沒有產生日期 —— 有的話 --check 就只能模糊比對(GH#389)",
        "abilities": {},
        "unmeasured": {},
    }
    cache: dict[str, dict] = {}
    for row in slash_abilities():
        aid, cid = row["ability"], row["champion"]
        champ = champs.get(cid)
        if champ is None or champ.get("model") is None:
            ledger["unmeasured"][aid] = {
                "champion": cid,
                "ability": row["name"],
                "reason": "no-model",
                "detail": "英雄不在 content/champions,或 modelKey 沒有 model@1(例:blizzard-local 疊加層)",
            }
            continue
        model = champ["model"]
        glb = os.path.join(REPO, "content", model.get("glbPath", ""))
        if not model.get("glbPath") or not os.path.exists(glb):
            ledger["unmeasured"][aid] = {
                "champion": cid, "ability": row["name"], "reason": "no-glb",
                "detail": model.get("glbPath") or "(model@1 沒有 glbPath)",
            }
            continue
        key = model["id"]
        if key not in cache:
            gltf, binary = read_glb(glb)
            rig = Rig(gltf, binary)
            clip_map = model.get("clipMap", {})
            per_clip = {}
            for role, fuzzy in (("cast", ["spell", "cast"]), ("attack", ["attack", "swing"])):
                anim = None
                named = clip_map.get(role)
                if named:
                    anim = rig.clip(named)
                if anim is None:
                    anim = rig.clip_fuzzy(fuzzy)
                per_clip[role] = measure_clip(rig, anim) if anim else {"ok": False, "reason": "no-clip", "detail": f"沒有 {role} clip"}
            cache[key] = {"modelKey": key, "glbPath": model["glbPath"], "clips": per_clip}
        entry = cache[key]
        cast = entry["clips"]["cast"]
        atk = entry["clips"]["attack"]
        chosen = cast if cast.get("ok") else None
        if chosen is None:
            ledger["unmeasured"][aid] = {
                "champion": cid, "ability": row["name"], "modelKey": key,
                "reason": cast.get("reason", "no-clip"),
                "detail": cast.get("detail", ""),
                "castClip": cast.get("clip"),
                "attackFallbackPitchDeg": atk.get("pitchDeg") if atk.get("ok") else None,
            }
            continue
        ledger["abilities"][aid] = {
            "champion": cid,
            "championName": champs[cid]["name"],
            "ability": row["name"],
            "modelKey": key,
            "clip": chosen["clip"],
            "blade": chosen["blade"],
            "sweptDeg": chosen["sweptDeg"],
            "planarity": chosen["planarity"],
            "pitchDeg": chosen["pitchDeg"],
            "attackClipPitchDeg": atk.get("pitchDeg") if atk.get("ok") else None,
        }
    return ledger


def write_ledger(ledger: dict) -> None:
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "w", encoding="utf-8") as fh:
        json.dump(ledger, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


def apply_to_content(ledger: dict) -> tuple[dict, list[str]]:
    doc = load_json(VFX_FAMILIES)
    abilities = doc.setdefault("abilities", {})
    changes = []
    for aid, row in sorted(ledger["abilities"].items()):
        slot = abilities.setdefault(aid, {})
        before = slot.get("pitchDeg")
        if before != row["pitchDeg"]:
            changes.append(f"{aid}: {before} → {row['pitchDeg']}  ({row['clip']}, 掃 {row['sweptDeg']}°)")
        slot["pitchDeg"] = row["pitchDeg"]
    doc["abilities"] = dict(sorted(abilities.items()))
    return doc, changes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--measure", action="store_true", help="只量,寫中繼帳本")
    ap.add_argument("--check", action="store_true", help="閘:比對,不寫")
    args = ap.parse_args()

    ledger = measure_all()
    ok = len(ledger["abilities"])
    bad = len(ledger["unmeasured"])
    print(f"量到 {ok} 支 / 量不到 {bad} 支")

    if bad:
        print("\n⚠️ 量不到(⛔ 不寫值 → 落回全域 slashPitchDeg,但**現在有名單**):")
        for aid, row in sorted(ledger["unmeasured"].items()):
            fb = row.get("attackFallbackPitchDeg")
            extra = f"  [attack clip 量得到 {fb}°]" if fb is not None else ""
            print(f"  · {aid:22s} {row.get('ability') or '':28s} {row['reason']:12s} {row.get('detail','')}{extra}")

    if args.check:
        if not os.path.exists(LEDGER):
            print(f"\n⛔ 帳本不存在: {LEDGER}", file=sys.stderr)
            return 1
        if load_json(LEDGER) != ledger:
            print(f"\n⛔ 帳本過期。跑 `python3 tools/w3x-import/build_pitch.py` 再 git add。", file=sys.stderr)
            return 1
        doc, changes = apply_to_content(ledger)
        if changes:
            print("\n⛔ content/config/vfx-families.json 與量測不一致:", file=sys.stderr)
            for c in changes:
                print("   " + c, file=sys.stderr)
            return 1
        print("\n✅ 帳本與 content 都是最新的")
        return 0

    write_ledger(ledger)
    print(f"\n寫入 {os.path.relpath(LEDGER, REPO)}")
    if args.measure:
        return 0

    # ⛔ GH#456 —— 這支腳本**不再寫 content**（owner 2026-08-20 選 C）。
    # `pitchDeg` 的唯一寫入者是 `tools/w3x-import/build_pitch.py`,它 import 這裡的
    # 量測函式再與另一個資料源合併。⚠️ 把這一段拿掉 = 退回「兩支各寫各的、後跑的贏」,
    # 而那個狀態下**兩條守衛互為對方的紅燈**,誰贏取決於指令順序（沒有東西在守）。
    print(
        "⛔ 這支腳本只量測,不寫 content。\n"
        "   要更新 pitchDeg 請跑：python3 tools/w3x-import/build_pitch.py",
        file=sys.stderr,
    )
    return 2


if __name__ == "__main__":
    raise SystemExit(main())

"""MDX → glTF 2.0 (.glb) exporter.

Coordinate/scale conversion is BAKED into the data (no root-transform tricks,
since viewers must apply joint transforms, not mesh-node transforms, to skins):

  MDX is Z-up right-handed;   glTF is Y-up right-handed.
  positions/pivots/translations:  (x, y, z) -> s * (x, z, -y)
  rotation quaternions:           (qx,qy,qz,qw) -> (qx, qz, -qy, qw)
  scale tracks:                   (sx,sy,sz) -> (sx, sz, sy)

Skeleton mapping: MDX animates nodes around their PIVOT —
  G(b) = G(parent) * T(pivot) * T(tr) * R(q) * S(s) * T(-pivot)
Substituting H(b) = G(b) * T(pivot_b) gives a plain glTF TRS hierarchy with
  node.translation = pivot_b - pivot_parent (+ tr)   and   IBM_b = T(-pivot_b).

Animation: KGTR/KGRT/KGSC keys inside each sequence interval become one glTF
animation per sequence. Linear/step keys are emitted verbatim; Hermite/Bezier
keys are resampled at 30 fps to LINEAR. Global-sequence tracks are left static
(noted in the result). Rotation interpolation between samples is nlerp.
"""

from __future__ import annotations

import io
import json
import math
import os
import struct
from dataclasses import dataclass, field

from .mdx import MDXModel, Track

FPS = 30.0


@dataclass
class ConvertResult:
    glb: bytes
    notes: list[str] = field(default_factory=list)
    height: float = 0.0  # converted (post-scale) model height in glTF units
    anim_names: list[str] = field(default_factory=list)
    team_color_materials: list[str] = field(default_factory=list)
    dropped_glow_materials: list[str] = field(default_factory=list)
    lit_glow_materials: list[str] = field(default_factory=list)
    dropped_effect_geosets: list = field(default_factory=list)
    attach_points: dict = field(default_factory=dict)


def _v(p, s):  # position/translation basis change
    return (p[0] * s, p[2] * s, -p[1] * s)


def _q(q):  # quaternion basis change
    return (q[0], q[2], -q[1], q[3])


def _s3(v):  # scale-track basis change
    return (v[0], v[2], v[1])


def _norm_q(q):
    m = math.sqrt(sum(c * c for c in q)) or 1.0
    return tuple(c / m for c in q)


# --- effect-geoset guard (task #17) -----------------------------------------
# WC3 particle/emitter effects (giant beams, ground rings, glow billboards) are
# sometimes authored as ordinary GEOS geosets. Baked as solid geometry they
# inflate the model bbox and — worse — when the biggest such geoset is picked as
# the "body" for hero-height normalization, the whole character is mis-scaled
# (e.g. Nanoha rendered ~10u tall + a 14.5u invisible team-glow beam). These
# knobs decide when a glow geoset is a STRAY EFFECT that must be dropped.
EFFECT_TOP_MARGIN = 0.35    # top clears body-top by >35% of body height
EFFECT_BEAM_HFRAC = 0.9     # spans ~the whole body height (a beam/pillar) ...
EFFECT_BEAM_MAXVERTS = 48   # ... while being just a few verts
EFFECT_WIDE_XZ = 1.8        # reaches >1.8x the body's own footprint (a ring)
EFFECT_DETACH_FRAC = 0.05   # floats entirely above the body top


def _layer_rid(model, layer) -> int:
    tid = layer.texture_id
    return (model.textures[tid].replaceable_id
            if 0 <= tid < len(model.textures) else 0)


#: ⭐ replaceableId-2（隊伍發光）的政策 —— GH#767 開了 `lit`，GH#770 開了 `cull`
#: 並把 `drop` 改成「去讀旋鈕」。⇒ **生效的值只有三種**：`keep` / `lit` / `cull`。
#:
#: ⚠️⚠️ **這四個值不是同一個入口的四個選項**（2026-08-29 更正，⛔ 這一點踩過）：
#:   · **呼叫端引數**（這一組）收 `drop` / `keep` / `lit` / `cull`；
#:   · **旋鈕**（`characterTeamGlow`）只收 `CHARACTER_TEAM_GLOW_VALUES` ——
#:     ⛔ **`"lit"` 不在裡面**，因為角色那條路把它靜默退化成 `keep`
#:     （成因與反駁條件逐條寫在 `CHARACTER_TEAM_GLOW_EXCLUDED`）。
#:
#: `"drop"`  ⭐ **「沒有選」的訊號**（⛔ 不是一種畫法）—— 生效的值由
#:           `invisible_prim_policy.json` 的 `characterTeamGlow` 決定，見下面
#:           `resolve_team_glow()`。全樹**唯一刻意選過**的呼叫端是
#:           `convert_stock_model.py`（`"lit"`）；其餘每一條路都只是繼承
#:           `models.py::convert_all` 的預設值 —— 那不是一個決定。
#: `"keep"`  GH#770 之前 `"drop"` 的**實際**行為：`baseColorFactor [0,0,0,0]`
#:           ⇒ 那一片幾何**必不可見，而且照樣發一個 primitive**。
#:           ⚠️ 它對**角色**只對了一半（隊伍發光在角色身上是肩膀/腳下的色塊，
#:           GGD 沒有隊伍色可以套，畫成白光會變成一團不屬於那個角色的亮斑）——
#:           ⛔ 但「畫一個看不見的東西」是**兩邊都不是**（第一·五守則）。
#: `"lit"`   ⭐ 對**純特效模型**才對：ReviveHuman / Awaken 這一族的**主體本身**
#:           就是一片 rid-2 的加法發光柱（`Textures` 之外的美術在
#:           `ReplaceableTextures\TeamGlow\TeamGlow00.blp`，**零售 MPQ 裡真的有**
#:           —— ⚠️ ⛔ **repo 裡沒有**，所以沒有零售封包的 checkout 上這條路
#:           也產不出像素，只會把它列進 `missing_textures`；
#:           32×32、形狀住 RGB、alpha 平坦 255 ⇒ 正是 GH#649 那個
#:           「亮在黑底上、沒有 alpha 可以 key」的家族）。
#:           ⇒ 用**同一條** luma-key 路徑把它變成 emissive 加法發光。
#:           ⚠️ **它只在呼叫端一路傳下去時才活**：`models._convert_all` 要看到
#:           `"lit"` 才會去載那張貼圖，而它比的是**未解析**的引數 ——
#:           ⇒ ⛔ 從旋鈕走進來的 `"lit"` 到不了那裡（`CHARACTER_TEAM_GLOW_EXCLUDED`）。
#:
#: ⚠️ 為什麼**不是**全域改成 `"lit"`：量到 51 份地圖模型帶 rid-2 材質，其中
#: **49 份是角色**（heroSaber / goku / cloud …）。全域打開＝替 49 個角色加上
#: 一團沒有人裁決過的白光。⇒ 政策由**呼叫端**選：`import_w3x.py`（地圖角色）走
#: `"drop"`（＝ GH#770 之後「去讀 `characterTeamGlow` 旋鈕」，出貨值 `cull`），
#: `convert_stock_model.py`（表格裡每一列都是 `Abilities\Spells\…`
#: 的**特效**模型）用 `"lit"`。
#: ⭐ 可反駁：哪天 `STOCK_MODELS` 收進一具真的角色模型，這個分界線就不成立 ——
#: 到時候要改成逐列的旗標，⛔ 不是繼續假設「stock ⇒ 特效」。
#: `"cull"` ⭐ **GH#770** —— 那一片幾何**一個 primitive 都不發**。
#:           量到的病灶：463 份出貨 glb 裡 **44 個 `TeamGlow*` 面 / 25 份模型**
#:           `baseColorFactor[3] == 0` —— 畫不出任何一個像素，而 draw call、
#:           頂點緩衝、bufferView 一樣都沒少；`ChampionView.ts:1691` 還得
#:           **另外寫一段**擋它們在挨打閃白時被畫成實心色塊。
#:           ⭐ 它們是**轉檔器自己造的**：下面 `gltf_materials()` 的
#:           「整份材質都是 rid-2 時仍然要發」那個回退 —— 存在的理由只是讓
#:           `strip_teamglow.py` 事後**按名字**找得到它們。而那支事後掃描
#:           只涵蓋**英雄身體＋皮膚**，所以這 25 份（怪物/守衛/暴雪原生單位）
#:           永遠沒有人來收。⇒ 與其發一個佔位面再叫第二支程式來刪，
#:           ⛔ 不如一開始就不要發（第〇·四守則：一個決定一個住處）。
TEAM_GLOW_POLICIES = ("drop", "keep", "lit", "cull")

#: ⭐ `characterTeamGlow` 旋鈕的合法值 → 這個值**宣稱**會發生的事。
#: ⛔ **不含 `"drop"`**：`"drop"` 是「去讀這個旋鈕」的訊號，把它寫進旋鈕會變成
#: 指向自己的解析。
#:
#: ⭐⭐ **每一格的右邊是一個會被守衛逐值驗證的宣稱**（⛔ 不是註解）——
#: `teamGlowCullPolicy.test.ts` 拿**出貨那條路**（`convert(…, team_glow="drop")`
#: ＋ 上游 `textures_png` 裡**沒有** rid-2，因為 `models.py` 在 `"drop"` 下不載它）
#: 逐值跑一遍，比對這裡宣稱的形狀。⇒ 加一個值就必須在這裡寫下它宣稱什麼，
#: 而那個宣稱**當場就要成立** —— ⛔ 一個做不到自己宣稱的旋鈕值比沒有更糟
#: （第一·五守則：說了但不會發生），因為它讓人以為有一條退路。
CHARACTER_TEAM_GLOW_CLAIMS = {
    #: 發一個 `TeamGlow*` primitive，而它 `baseColorFactor[3] == 0`
    #: ＝ GH#770 之前的行為（⭐ owner 的一鍵 rollback 目標）。
    "keep": "emit-invisible",
    #: 一個 primitive 都不發（⭐ 出貨值）。
    "cull": "no-prim",
}
CHARACTER_TEAM_GLOW_VALUES = tuple(CHARACTER_TEAM_GLOW_CLAIMS)

#: ⛔ **被排除的值 → 為什麼，以及要怎麼反駁它。**
#:
#: ⚠️ `"lit"` 在 GH#770 的第一版裡是旋鈕的第三個值，而票／政策檔／commit 訊息
#: **各宣稱了一次**「翻成 `lit` 就是把原作的隊色光暈畫出來 —— ⛔ 不必改一行程式，
#: 只要重跑產線」。⭐ **那句話是假的**，2026-08-29 用**出貨那條路**量到
#: （`import_w3x.py:108` → `models.convert_all(raw, glb, tex)`，⛔ 沒有 `team_glow`）：
#:   `HeroCloudStrife` / `Bahamut`：knob=keep 與 knob=lit 的 `TeamGlow*` 面
#:   **逐欄相同**（2 個面 · `bcf [0,0,0,0]` · `emissive False` · accessors 379/623）；
#:   只有 knob=cull 真的變（0 個面 · accessors 367/617 · 身高仍 1.7）。
#: ⇒ ⭐ `lit` 在角色那條路上**靜默退化成 `keep`** —— 也就是 #770 的病灶本身。
#:
#: ⭐ 三個**各自獨立**的成因（⛔ 修一個不夠），與各自的反駁條件：
#:  ① **接線**：`w3xlib/models.py:571` 是 `if tex.replaceable_id == 2 and
#:     team_glow == "lit"`，而它比的是**未解析**的字串；`import_w3x.py:108`
#:     一個 `team_glow` 都沒傳 ⇒ models.py 永遠只看到 `"drop"` ⇒
#:     `TEAM_GLOW_STOCK_TEXTURE` 從來不會進 `textures_png` ⇒ 下面
#:     `gltf_materials()` 的 keep 濾鏡要求 `team_glow == "lit" **and**
#:     l.texture_id in textures_png`，後半 False ⇒ 那一層被丟掉。
#:     ⭐ **反駁它**：讓 `models._convert_all` 也走 `resolve_team_glow()`
#:     （或讓 `import_w3x.py` 把旋鈕一路傳下去）。
#:  ② **美術**：`ReplaceableTextures\TeamGlow\TeamGlow00.blp` 住零售 `war3.mpq`，
#:     ⛔ **不在 repo 裡**。量到：連**明確**傳 `team_glow="lit"` 的那條路
#:     （`convert_stock_model.py` 用的）在這個 checkout 上也產出 `bcf [0,0,0,0]`，
#:     只是它至少把該檔列進 `missing_textures`（旋鈕那條路連列都不會列）。
#:     ⭐ **反駁它**：`W3X_STOCK_MPQ_DIR` 指得到零售封包的環境。
#:  ③ **語意**：就算①②都補上，這條路產出的是 `emissiveFactor [1,1,1]` 而且
#:     **不會**進 `res.team_color_materials`（只有 rid-1 會）⇒ 畫出來是**白光**，
#:     ⛔ 不是隊色。而 GH#767 對同一題的逐字結論是「全域打開＝替 49 個角色加上
#:     一團沒有人裁決過的白光」。⇒ 那個值宣稱的「原作的隊色光暈」**三個軸都不成立**。
#:     ⭐ **反駁它**：rid-2 長出隊色通道（客戶端今天只認 `model@1.teamTintMaterials`）。
#:
#: ⚠️ ⭐ 拿掉它**沒有拿掉 rollback**：owner 的一鍵回頭目標是 `"keep"`
#: （＝ #770 之前逐位元的行為），而 `"lit"` 從來不是「回頭」，它是一個**前進**的
#: 改動 —— 一個沒有人裁決過、而且今天做不到的前進。
#: ⚠️ 而 `"lit"` 仍然留在 `TEAM_GLOW_POLICIES` 裡：它是**呼叫端引數**時是真的
#: （`convert_stock_model.py:569` 一路傳到 `convert_all(team_glow="lit")`，
#: models.py 因此真的會去載那張貼圖）。⇒ ⭐ 被排除的是**旋鈕**這個入口，
#: ⛔ 不是那條機制。
CHARACTER_TEAM_GLOW_EXCLUDED = {
    "lit": ("角色那條路上 lit 會靜默退化成 keep（models.py:571 比的是未解析的字串、"
            "import_w3x.py:108 沒有傳），而且 TeamGlow00.blp 不在 repo、"
            "產出也是白光不是隊色 —— 見 gltf.CHARACTER_TEAM_GLOW_EXCLUDED 的三個成因。"
            "⭐ 純特效模型要點亮請走呼叫端引數（convert_stock_model.py 的 team_glow=\"lit\"），"
            "⛔ 不是這一格。"),
}


def validate_character_team_glow(val: str, where: str = "characterTeamGlow") -> str:
    """旋鈕值的**唯一**一份判準 —— `character_team_glow_policy()` 與
    `invisible_prim_census.load_policy()` 都呼叫它（⛔ 不要各自抄一份比對）。

    ⭐ 被排除的值有**自己的訊息**：一句「must be one of (…)」會讓下一個人以為
    是打錯字，而真相是「那個值曾經在，因為它做不到自己宣稱的事而被拿掉」。

    ⚠️ **被接受的那張表先問**（⛔ 不是排除表先問）：哪天有人照上面那句訊息把值
    搬回 `CHARACTER_TEAM_GLOW_CLAIMS` 卻忘了從排除表刪掉，這裡**放行**，
    由守衛 `teamGlowCullPolicy.test.ts` ③ 用「同時在兩張表裡」把它指名 ——
    ⛔ 而不是在這裡擲一個看起來像「你打錯字」的例外。
    """
    if val in CHARACTER_TEAM_GLOW_VALUES:
        return val
    if val in CHARACTER_TEAM_GLOW_EXCLUDED:
        raise ValueError(
            f"{where}: {val!r} 已經被拿掉 —— {CHARACTER_TEAM_GLOW_EXCLUDED[val]}")
    raise ValueError(
        f"{where} must be one of {CHARACTER_TEAM_GLOW_VALUES}, got {val!r}")

#: ⚠️ 政策檔**不見**時的回退值 ＝ **出貨至今的行為**，⛔ 不是我挑的那個。
#: ⭐ 出貨的選擇只住 `invisible_prim_policy.json` **一份**（第〇·四守則）——
#: 這裡再寫一次 `"cull"` 就是第二個住處，而它會在旋鈕被翻掉之後繼續說謊。
#: ⚠️ 而回退到「保留」也是刻意的：設定檔缺席**不是**「可以刪幾何」的證據
#: （同 `cullWithoutMdxProof: false`）。
DEFAULT_CHARACTER_TEAM_GLOW = "keep"

#: 旋鈕的住處。⚠️ 它與 `invisible_prim_census.py` 讀的是**同一個檔**。
TEAM_GLOW_POLICY_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "invisible_prim_policy.json")


def character_team_glow_policy(path: str | None = None) -> str:
    """`invisible_prim_policy.json` 的 `characterTeamGlow` —— 角色/地圖那條路的旋鈕。

    ⭐ 這是**唯一**讀它的地方。⛔ 不要在別處再 `json.load` 一次那個檔然後自己
    比對字串 —— 那會是第二個住處，而兩份判準漂掉的時候沒有東西會紅。
    """
    try:
        with open(path or TEAM_GLOW_POLICY_PATH, encoding="utf-8") as fh:
            val = json.load(fh).get("characterTeamGlow",
                                    DEFAULT_CHARACTER_TEAM_GLOW)
    except FileNotFoundError:
        return DEFAULT_CHARACTER_TEAM_GLOW
    return validate_character_team_glow(
        val, "invisible_prim_policy.json: characterTeamGlow")


def resolve_team_glow(team_glow: str, path: str | None = None) -> str:
    """呼叫端傳進來的值 → **生效**的值。`"drop"` ＝ 沒有選 ⇒ 去讀旋鈕。

    ⛔ 回傳值永遠不會是 `"drop"`，所以下游只要分辨 keep / lit / cull 三種。
    ⚠️ 但 `"lit"` **只可能**從呼叫端引數回來（旋鈕不收它，見
    `CHARACTER_TEAM_GLOW_EXCLUDED`）—— 而那是刻意的：只有明確傳它的呼叫端
    才會讓 `models.py` 去把 rid-2 的貼圖載進 `textures_png`。
    """
    if team_glow not in TEAM_GLOW_POLICIES:
        raise ValueError(
            f"team_glow must be one of {TEAM_GLOW_POLICIES}: {team_glow!r}")
    return character_team_glow_policy(path) if team_glow == "drop" else team_glow


# --- WC3 材質層 filter mode → glTF（GH#841） --------------------------------
#: ⭐ MDX `MTLS/LAYS` 的 filter mode 有 **7 種**，這張表**每一種都有一列**。
#: ⛔ 在此之前這裡沒有表，只有 `if fm >= 3 / elif fm == 1 / elif fm == 2` 四條分支
#: ⇒ fm 5（Modulate）與 fm 6（Modulate2x）**掉進 `fm >= 3`**，
#: 於是「相乘／變暗」被畫成「相加／發光」——**語意反向**。
#:
#: ⚠️ **出處逐條可查（⛔ 不是我記得的）**：
#:  · 列舉本身 —— `tools/w3x-import/extract_emitters.py:73-74` 的 `MAT_BLEND`
#:    「0 none · 1 transparent · 2 blend · 3 additive · 4 addAlpha ·
#:     5 modulate · 6 modulate2x」。⚠️ 那個檔案的**上一格**（`:70-71`）是
#:    **PRE2 粒子**那張只有 5 格、而且編號完全不同的表 —— 兩張長得很像，
#:    ⛔ 不要拿錯（`w3xlib/particles.py:39` 與 `:85` 的註解就是這兩張表）。
#:  · 「fm1 是**硬切**不是混色」—— `tools/w3x-import/extract_particles.py:107`
#:    把 fm1 對到 `"alphaKey"`（⛔ 不是 `"alpha"`）。
#:  · 「fm5/6 是**相乘**」—— 同檔 `:108` 兩者都對到 `"modulate"`。
#:  · Modulate2x 的取捨 —— `apps/client/src/render/vfx/w3xEmitter.ts:572-573`
#:    對同一個 filter mode 的結論逐字是「MULTIPLY keeps the darkening and
#:    loses only the 2× brightening」⇒ ⭐ 這裡沿用**同一個**取捨與**同一句話**，
#:    ⛔ 不要再發明第二種說法。
#:
#: ⭐ **量到的**（132 份地圖來源 MDX / 377 份來源材質，`out/GoDieEX22s{,-src}/raw`）——
#: 這一票改動了 **51 份來源材質**，⛔ 其餘逐位元不動：
#:   · fm1 而貼圖 alpha 平坦不透明  **23** 份：MASK（切不掉任何像素）→ OPAQUE
#:   · fm2 同上                      **1** 份：BLEND（混不出東西）→ OPAQUE
#:   · fm5 Modulate                  **6** 份：BLEND＋emissive（＝相加）→ 相乘
#:     （`DeathWave` ×1 · `NetherStrike` ×5）
#:   · 疊加層回來                    **21** 份材質 / +21 個 primitive
#:   · fm6 Modulate2x                **0** 份 —— 今天沒有人用它，⭐ 所以它的分支
#:     由 `w3xlib/filter_mode_probe.py` 的合成模型驗，⛔ 不是「沒用到就不做」。
#: ⚠️ 這些數字說的是**轉檔器**；出貨的 `.glb` 要重跑產線才會變（⛔ 本票沒有重跑）。
#:
#: `kind` 是**翻譯後**的類別，`gl` 是 WC3 算的那條式子（留著才驗得了翻譯對不對）。
@dataclass(frozen=True)
class FilterMode:
    fm: int
    name: str      # WC3 世界編輯器裡的名字
    gl: str        # WC3 renderer 實際算的混色式
    kind: str      # 翻譯類別：opaque / cutout / blend / additive / multiply(2x)
    why: str       # 為什麼翻成這一種（⛔ 沒有理由的格子＝一個推測）


MDX_FILTER_MODES: dict[int, FilterMode] = {
    0: FilterMode(
        0, "None", "blending OFF", "opaque",
        "WC3 關閉 blending；但 GGD 禁止把帶透明背景的角色／特效 atlas 當成"
        "不透明方片。貼圖有可用 alpha 時以 alpha 安全政策升級為 MASK／BLEND；"
        "只有 alpha 平坦不透明才保留 OPAQUE。",
    ),
    1: FilterMode(
        1, "Transparent", "alpha test; blending OFF", "cutout",
        "硬切（`extract_particles.py:107` 叫它 alphaKey）⇒ glTF MASK。"
        "⭐ 貼圖**沒有可用 alpha**（平坦不透明）時測試處處通過 ⇒ 等價 OPAQUE，"
        "⛔ 不是一個切不掉任何東西的 MASK。",
    ),
    2: FilterMode(
        2, "Blend", "(SRC_ALPHA, 1-SRC_ALPHA)", "blend",
        "標準 alpha 混色 ⇒ glTF BLEND。⭐ alpha 平坦不透明時混不出任何東西 ⇒ OPAQUE。",
    ),
    3: FilterMode(
        3, "Additive", "(ONE, ONE)", "additive",
        "相加（WC3 這一格**不看** src alpha）。glTF 核心沒有相加混色 ⇒ "
        "emissive + BLEND，alpha 從 luma 推（GH#649 那條路）。",
    ),
    4: FilterMode(
        4, "AddAlpha", "(SRC_ALPHA, ONE)", "additive",
        "相加，但由 src alpha 加權 ⇒ 與 fm3 同一條輸出路徑，"
        "差別是**貼圖有 alpha 時用貼圖的**（fm3 的 alpha 被 WC3 忽略）。",
    ),
    5: FilterMode(
        5, "Modulate", "(ZERO, SRC_COLOR)", "multiply",
        "⭐ **相乘（變暗）**：out = dst × src。glTF BLEND 是 "
        "out = C×A + dst×(1−A) ⇒ 令 C=黑、A=1−src 就**逐位元等於**相乘"
        "（src 為灰階時精確；有彩度時 scalar alpha 只能取亮度）。"
        "⛔ 不可以走 emissive —— 那是相加，方向相反。",
    ),
    6: FilterMode(
        6, "Modulate2x", "(DEST_COLOR, SRC_COLOR)", "multiply2x",
        "out = 2 × dst × src ⇒ A = max(0, 1−2·src)。"
        "⭐ 變暗那一半精確；**>0.5 的「變亮」那一半 glTF 核心表達不了**，"
        "逐支 note 列名（同 `w3xEmitter.ts:573` 的取捨）。",
    ),
}

#: ⛔ 表以外的值**不靜默**：翻成最保守的 BLEND，並在 `res.notes` 裡**指名**它。
#: （fail-open 沒錯，靜默才是缺陷 —— CLAUDE.md）
UNKNOWN_FILTER_MODE = FilterMode(
    -1, "unknown", "?", "blend",
    "⛔ 不在 MDX 的 0–6 裡。退回 BLEND 並列名 —— ⛔ 不要假裝翻譯過了。",
)


def filter_mode_info(fm: int) -> FilterMode:
    return MDX_FILTER_MODES.get(fm, UNKNOWN_FILTER_MODE)


def _material_effect_kind(model, mid: int, team_glow: str = "keep") -> str:
    """Classify how material `mid` renders — 這支決定的是 **GEOSET 要不要剔**，
    ⛔ 不是那一份材質怎麼畫（畫法在 `_layer_material()`）：
      ""            solid body/skin or team-colour → keep
      "team_glow"   replaceableId-2 billboard → rendered INVISIBLE in-game, so
                    dropping its geometry is a visual no-op (safe to prune)
      "additive"    emissive glow quad (additive real-texture, no opaque base)
                    → VISIBLE, so only drop it when it clearly leaves the body

    ⭐ GH#770：`"cull"` 與 `"keep"` 在這裡**回報同一件事**（`"team_glow"`）——
    ⛔ 刻意的。這一支餵的是**英雄身高正規化**的 body bbox，而 body bbox 從來就
    不含 effect 材質 ⇒ 剔或不剔，算出來的身高**逐位元相同**。
    ⚠️ 如果讓 `"cull"` 在這裡回別的東西，44 個看不見的面會連帶把 25 份模型的
    縮放挪一次，而那是一個**沒有人要求過**的改動（失敗形態①）。

    ⭐ `team_glow="lit"` ⇒ rid-2 也是真的會發光的加法幾何 ⇒ 回報 `"additive"`，
    這樣它就吃**比較保守**的那條剔除規則（只有明顯離開身體才剔），⛔ 不會再被
    「隊伍發光反正看不見，寬的就剔掉」那一條順手砍掉。

    ⚠️ GH#841：`_layer_material()` 已經改成**逐層**，而這裡**刻意**維持
    「整份材質一個判決」—— 它餵的是英雄身高正規化（`classify_geosets`），
    一份幾何只能剔或不剔，⛔ 沒有「剔掉一層」這回事。
    ⭐ 但 `fm >= 3` 這個魔數換成查表：fm 5/6 是**相乘**不是相加，
    它們仍然吃保守剔除規則（＝今天的行為），而未知的 fm 現在回 `""`
    ——「看不懂就不要剔幾何」⛔ 比「猜它是特效然後剔掉」安全。
    """
    layers = model.materials[mid].layers if 0 <= mid < len(model.materials) else []
    if not layers:
        return ""
    real = [l for l in layers if _layer_rid(model, l) == 0]
    rids = {_layer_rid(model, l) for l in layers}
    has_opaque_base = any(l.filter_mode == 0 for l in layers)
    if not real:
        if 1 in rids:
            return ""              # team-COLOUR body region → solid, keep
        if 2 not in rids:
            return ""
        return "additive" if team_glow == "lit" else "team_glow"
    disp = next((l for l in real if l.filter_mode == 0), real[0])
    non_solid = filter_mode_info(disp.filter_mode).kind in (
        "additive", "multiply", "multiply2x")
    return "additive" if (non_solid and not has_opaque_base) else ""


def _material_is_effect(model, mid: int) -> bool:
    return bool(_material_effect_kind(model, mid))


def _geoset_bbox(geoset, scale: float):
    mins = [1e30] * 3
    maxs = [-1e30] * 3
    for vtx in geoset.vertices:
        p = _v(vtx, scale)
        for k in range(3):
            if p[k] < mins[k]:
                mins[k] = p[k]
            if p[k] > maxs[k]:
                maxs[k] = p[k]
    return mins, maxs


def classify_geosets(model, scale: float = 1.0, team_glow: str = "keep"):
    """Split a model's geosets into character BODY vs stray EFFECT geometry.

    Returns ``(info, (body_min, body_max))`` where ``info[i]`` is a dict with
    keys ``index, verts, effect_material, drop, reason, mins, maxs`` and the
    body bbox is the union of the *non-effect* geosets — the silhouette the
    importer normalizes to ~1.7u.

    A geoset is DROPPED only when it is BOTH an effect material AND a clear
    geometric outlier: it towers above the body, spans the body like a thin
    beam, floats detached above it, or reaches far outside its footprint. This
    is deliberately conservative — in-silhouette glow details (held energy
    blades, eye glows, the ground ring under the feet) and every opaque or
    team-colour body part are KEPT. Pure measurement; no side effects.
    """
    geos = []
    for i, g in enumerate(model.geosets):
        mins, maxs = _geoset_bbox(g, scale) if g.vertices else ([0.0] * 3, [0.0] * 3)
        kind = _material_effect_kind(model, g.material_id, team_glow)
        geos.append({
            "index": i,
            "verts": len(g.vertices),
            "effect_kind": kind,
            "effect_material": bool(kind),
            "material": g.material_id,
            "mins": mins,
            "maxs": maxs,
        })
    body_src = [x for x in geos if x["verts"] and not x["effect_material"]] \
        or [x for x in geos if x["verts"]]
    if body_src:
        bmin = [min(x["mins"][k] for x in body_src) for k in range(3)]
        bmax = [max(x["maxs"][k] for x in body_src) for k in range(3)]
    else:
        bmin, bmax = [0.0] * 3, [0.0] * 3
    body_h = bmax[1] - bmin[1]
    body_top = bmax[1]
    body_xz = max(abs(bmin[0]), abs(bmax[0]), abs(bmin[2]), abs(bmax[2]))
    for x in geos:
        reasons = []
        if x["effect_material"] and x["verts"] and body_h > 1e-6:
            gtop, gbot = x["maxs"][1], x["mins"][1]
            gh = gtop - gbot
            gxz = max(abs(x["mins"][0]), abs(x["maxs"][0]),
                      abs(x["mins"][2]), abs(x["maxs"][2]))
            towers = gtop > body_top + EFFECT_TOP_MARGIN * body_h
            beam = (gh > EFFECT_BEAM_HFRAC * body_h
                    and x["verts"] <= EFFECT_BEAM_MAXVERTS
                    and gtop > body_top)           # a pillar that pokes out
            detached = (gbot >= body_top - EFFECT_DETACH_FRAC * body_h
                        and gtop > body_top)
            wide = gxz > EFFECT_WIDE_XZ * max(body_xz, 1e-6)
            if towers:
                reasons.append(f"top {gtop:.2f} >> body_top {body_top:.2f}")
            if beam:
                reasons.append(f"beam h {gh:.2f}~body {body_h:.2f} ({x['verts']}v)")
            if detached:
                reasons.append("floats above body")
            # A VISIBLE additive glow is only dropped when it clearly leaves the
            # body upward (tower/beam/detached) — an in-silhouette glow (fire
            # ring, energy blade, eye glow) stays. A team-glow billboard renders
            # invisible anyway, so a wide ground ring may also be pruned.
            if x["effect_kind"] == "team_glow" and wide:
                reasons.append(f"reaches |xz| {gxz:.2f} >> body {body_xz:.2f}")
        # ⭐ GH#770 —— `characterTeamGlow: "cull"`：整份材質都是 rid-2 的 geoset
        # 一個 primitive 都不發。⚠️ 這一條**刻意站在上面那個 `body_h > 1e-6`
        # 之外**：它與幾何形狀無關（⛔ 不是「它太寬/太高所以像特效」），
        # 它是「這一片**畫不出任何一個像素**」——一個沒有身體的模型也一樣。
        # ⭐ 這是 cull 的**唯一**住處：剔在這裡，accessor / bufferView / draw call
        # 三樣一起省掉；剔在 `gltf_materials()` 只省得掉最後一樣。
        if team_glow == "cull" and x["effect_kind"] == "team_glow":
            reasons.append("team-glow billboard (characterTeamGlow=cull)")
        x["drop"] = bool(reasons)
        x["reason"] = "; ".join(reasons)
    return geos, (bmin, bmax)


def _sample_track(track: Track, start: int, end: int, is_quat: bool):
    """Keys (frame,value) within [start,end], resampled if hermite/bezier.
    Returns [] if the track has nothing inside the interval."""
    keys = [(f, v) for f, v in track.keys if start <= f <= end]
    if not keys:
        return []
    keys.sort(key=lambda kv: kv[0])
    dedup = []
    for f, v in keys:
        if dedup and dedup[-1][0] == f:
            dedup[-1] = (f, v)
        else:
            dedup.append((f, v))
    keys = dedup
    if track.interp >= 2 and len(keys) > 1:  # resample hermite/bezier @30fps
        out = []
        step = 1000.0 / FPS
        t = float(keys[0][0])
        # stop half a step short of the final key: a resampled time landing
        # (near-)on the final key would collapse into a duplicate sampler
        # input once times are quantized to float32 seconds
        while t < keys[-1][0] - step * 0.5:
            out.append((t, _eval_linear(keys, t, is_quat)))
            t += step
        out.append((float(keys[-1][0]), keys[-1][1]))
        keys = out
    # pad so the pose holds across the whole sequence
    if keys[0][0] > start:
        keys.insert(0, (float(start), keys[0][1]))
    if keys[-1][0] < end:
        keys.append((float(end), keys[-1][1]))
    return keys


def _hold_value(track: Track, at: int):
    """Track value when a sequence has no keys of its own: WC3 holds the
    nearest key at/before the sequence start (else the first key after)."""
    prev = None
    for f, v in sorted(track.keys, key=lambda kv: kv[0]):
        if f <= at:
            prev = v
        else:
            return prev if prev is not None else v
    return prev


def _quantize_times(keys, start: int):
    """(frame_ms, value) → (sec_float32, value), strictly increasing.

    Sampler input times are stored as float32 seconds; two distinct
    millisecond frames can collapse onto the same float32 value, and glTF
    forbids duplicate sampler inputs (Babylon divides by the key delta →
    NaN poses / snapping). Keep the LAST value for a collapsed time."""
    out: list[tuple[float, object]] = []
    for f, v in keys:
        sec = struct.unpack("<f", struct.pack("<f", (f - start) / 1000.0))[0]
        if out and sec <= out[-1][0]:
            out[-1] = (out[-1][0], v)
        else:
            out.append((sec, v))
    return out


def _eval_linear(keys, t, is_quat):
    if t <= keys[0][0]:
        return keys[0][1]
    if t >= keys[-1][0]:
        return keys[-1][1]
    for i in range(1, len(keys)):
        if keys[i][0] >= t:
            f0, v0 = keys[i - 1]
            f1, v1 = keys[i]
            u = (t - f0) / (f1 - f0) if f1 > f0 else 0.0
            if is_quat:
                d = sum(a * b for a, b in zip(v0, v1))
                sgn = 1.0 if d >= 0 else -1.0
                v = tuple(a + (sgn * b - a) * u for a, b in zip(v0, v1))
                return _norm_q(v)
            return tuple(a + (b - a) * u for a, b in zip(v0, v1))
    return keys[-1][1]


class _Buf:
    def __init__(self):
        self.data = bytearray()
        self.views = []
        self.accessors = []

    def add(self, blob: bytes, target: int | None, accessor: dict) -> int:
        while len(self.data) % 4:
            self.data.append(0)
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(blob)}
        if target:
            view["target"] = target
        self.data += blob
        self.views.append(view)
        accessor["bufferView"] = len(self.views) - 1
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_blob(self, blob: bytes) -> int:
        """Raw bufferView (images)."""
        while len(self.data) % 4:
            self.data.append(0)
        self.views.append(
            {"buffer": 0, "byteOffset": len(self.data), "byteLength": len(blob)}
        )
        self.data += blob
        return len(self.views) - 1


NEUTRAL_TEAM = [0.55, 0.55, 0.60, 1.0]  # untinted team-color base


def convert(model: MDXModel, textures_png: dict[int, bytes], scale: float,
            model_name: str, tex_alpha: dict[int, str] | None = None,
            team_glow: str = "drop") -> ConvertResult:
    """textures_png: MDX texture index -> PNG bytes (placeholders included).
    tex_alpha:  MDX texture index -> 'opaque'|'mask'|'blend' (from the decoded
    image's alpha channel), used to choose glTF alphaMode MASK vs BLEND.
    team_glow:  see TEAM_GLOW_POLICIES. ⭐ 預設 `"drop"` ＝「**沒有選**」⇒
    生效的值由 `invisible_prim_policy.json` 的 `characterTeamGlow` 決定
    （GH#770）。`convert_stock_model.py` 傳的 `"lit"` 是全樹唯一刻意的選擇，
    ⛔ 這條路一個位元都沒有動到。"""
    team_glow = resolve_team_glow(team_glow)
    tex_alpha = tex_alpha or {}
    used_ext: set[str] = set()
    res = ConvertResult(glb=b"")
    buf = _Buf()
    gltf: dict = {
        "asset": {"version": "2.0", "generator": "ggd-w3x-import"},
        "scenes": [{"nodes": []}],
        "scene": 0,
        "nodes": [],
        "meshes": [],
    }

    # ---- nodes / skeleton ---------------------------------------------------
    obj_ids = sorted(model.nodes.keys())
    node_index: dict[int, int] = {}
    for oid in obj_ids:
        node_index[oid] = len(gltf["nodes"])
        gltf["nodes"].append({"name": model.nodes[oid].name or f"node{oid}"})
    children: dict[int, list[int]] = {}
    roots: list[int] = []
    for oid in obj_ids:
        nd = model.nodes[oid]
        piv = _v(nd.pivot, scale)
        if nd.parent_id in node_index:
            pp = _v(model.nodes[nd.parent_id].pivot, scale)
            children.setdefault(nd.parent_id, []).append(node_index[oid])
        else:
            pp = (0.0, 0.0, 0.0)
            roots.append(node_index[oid])
        gltf["nodes"][node_index[oid]]["translation"] = [
            piv[0] - pp[0], piv[1] - pp[1], piv[2] - pp[2],
        ]
    for oid, kids in children.items():
        gltf["nodes"][node_index[oid]]["children"] = kids
    if roots:
        # single armature root so viewers find a common skeleton root
        gltf["nodes"].append({"name": "Armature", "children": roots})
        gltf["scenes"][0]["nodes"].append(len(gltf["nodes"]) - 1)

    # ---- materials / textures ----------------------------------------------
    gltf["materials"] = []
    gltf["textures"] = []
    gltf["images"] = []
    gltf["samplers"] = [{"wrapS": 10497, "wrapT": 10497}]
    tex_to_gltf: dict[int, int] = {}

    def gltf_texture(tex_id: int) -> int:
        if tex_id in tex_to_gltf:
            return tex_to_gltf[tex_id]
        png = textures_png.get(tex_id)
        if png is None:
            png = _gray_png()
        view = buf.add_blob(png)
        gltf["images"].append({"bufferView": view, "mimeType": "image/png"})
        gltf["textures"].append(
            {"source": len(gltf["images"]) - 1, "sampler": 0}
        )
        tex_to_gltf[tex_id] = len(gltf["textures"]) - 1
        return tex_to_gltf[tex_id]

    luma_to_gltf: dict[int, int] = {}

    additive_to_gltf: dict[int, int] = {}

    def gltf_texture_additive(tex_id: int) -> int:
        """Embed an explicit-alpha texture that is also safe under ONE+ONE.

        Warcraft additive materials ignore source alpha.  The client preserves
        that behaviour for glowing model-FX materials, so an otherwise normal
        PNG whose transparent texels retain a white/red matte draws that matte
        as a solid card in game.  Alpha/alpha-key rendering is unchanged when
        RGB below alpha=0 is cleared; additive rendering gains the required
        identity value (black).

        Keep this as a separate cache from :func:`gltf_texture`: the same MDX
        texture may also be used by an opaque body layer, which must retain its
        original pixels byte-for-byte.
        """
        if tex_id in additive_to_gltf:
            return additive_to_gltf[tex_id]
        from PIL import Image
        png = textures_png.get(tex_id)
        if png is None:
            # Match gltf_texture's unresolved-texture fallback.  The source
            # problem is still reported by the importer; do not pretend a
            # missing texture is transparent.
            png = _gray_png()
        img = Image.open(io.BytesIO(png)).convert("RGBA")
        pixels = list(img.getdata())
        changed = False
        for i, (r, g, b, a) in enumerate(pixels):
            if a <= 5 and (r != 0 or g != 0 or b != 0):
                pixels[i] = (0, 0, 0, a)
                changed = True
        if changed:
            img.putdata(pixels)
            out = io.BytesIO()
            img.save(out, "PNG")
            png = out.getvalue()
        view = buf.add_blob(png)
        gltf["images"].append({"bufferView": view, "mimeType": "image/png"})
        gltf["textures"].append(
            {"source": len(gltf["images"]) - 1, "sampler": 0}
        )
        additive_to_gltf[tex_id] = len(gltf["textures"]) - 1
        return additive_to_gltf[tex_id]

    def gltf_texture_luma(tex_id: int) -> int:
        """Additive-glow art with no alpha channel gets one derived from its
        own luminance (alpha := max(R,G,B)): black background -> transparent,
        bright glow -> visible. This approximates WC3 additive blending in
        plain glTF BLEND — the scene has no bloom/GlowLayer, so the previous
        policy (baseColorFactor [0,0,0,0], "drop the quad") left 28 shipped
        effect .glbs drawing ZERO pixels (GH#649). Cached separately from
        gltf_texture: other materials may still want the original image."""
        if tex_id in luma_to_gltf:
            return luma_to_gltf[tex_id]
        from PIL import Image, ImageChops  # local: PIL already required by blp.py
        png = textures_png.get(tex_id)
        if png is not None:
            img = Image.open(io.BytesIO(png)).convert("RGBA")
        else:
            # texture genuinely unresolvable -> soft gray placeholder so the
            # geometry is at least visible (never zero pixels again)
            img = Image.new("RGBA", (8, 8), (150, 150, 150, 255))
        r, g, b, _a = img.split()
        img.putalpha(ImageChops.lighter(ImageChops.lighter(r, g), b))
        out = io.BytesIO()
        img.save(out, "PNG")
        view = buf.add_blob(out.getvalue())
        gltf["images"].append({"bufferView": view, "mimeType": "image/png"})
        gltf["textures"].append(
            {"source": len(gltf["images"]) - 1, "sampler": 0}
        )
        luma_to_gltf[tex_id] = len(gltf["textures"]) - 1
        return luma_to_gltf[tex_id]

    mult_to_gltf: dict[tuple[int, bool], int] = {}

    def gltf_texture_multiply(tex_id: int, doubling: bool) -> int:
        """WC3 Modulate / Modulate2x（fm 5 / 6）→ 一張**會讓底下變暗**的貼圖。

        代數（⛔ 不是近似，見 `MDX_FILTER_MODES[5].why`）：
            WC3   out = dst × src
            glTF  out = C × A + dst × (1 − A)
          令 C = 黑、A = 1 − src  ⇒  out = dst × src ✅
        Modulate2x 是 `out = 2 × dst × src` ⇒ A = max(0, 1 − 2·src)：
        變暗那一半精確，⛔ **變亮那一半 glTF 核心做不到**（呼叫端會 note 出來）。

        ⚠️ `src` 取 `max(R,G,B)`（與 `gltf_texture_luma` **同一把尺**，⛔ 不要
        在同一個檔裡養第二種亮度定義）；貼圖自己的 alpha **刻意不看** ——
        WC3 的 `(ZERO, SRC_COLOR)` 一個 alpha 都不讀。
        """
        key = (tex_id, doubling)
        if key in mult_to_gltf:
            return mult_to_gltf[key]
        from PIL import Image, ImageChops
        png = textures_png.get(tex_id)
        if png is not None:
            img = Image.open(io.BytesIO(png)).convert("RGBA")
        else:
            # 貼圖解不到 ⇒ 退回**恆等**（白 ⇒ A=0 ⇒ 什麼都不變暗），
            # ⛔ 不是灰（那會在畫面上蓋一層沒有人要的黑紗）。呼叫端會列名。
            img = Image.new("RGBA", (8, 8), (255, 255, 255, 255))
        r, g, b, _a = img.split()
        lum = ImageChops.lighter(ImageChops.lighter(r, g), b)
        if doubling:
            lum = lum.point(lambda v: 255 if v * 2 > 255 else v * 2)
        black = Image.new("L", img.size, 0)
        out_img = Image.merge("RGBA", (black, black, black,
                                       ImageChops.invert(lum)))
        out = io.BytesIO()
        out_img.save(out, "PNG")
        view = buf.add_blob(out.getvalue())
        gltf["images"].append({"bufferView": view, "mimeType": "image/png"})
        gltf["textures"].append(
            {"source": len(gltf["images"]) - 1, "sampler": 0}
        )
        mult_to_gltf[key] = len(gltf["textures"]) - 1
        return mult_to_gltf[key]

    mat_index: dict[int, list[int]] = {}

    def _rid(l) -> int:
        return (model.textures[l.texture_id].replaceable_id
                if 0 <= l.texture_id < len(model.textures) else 0)

    def _layer_alpha_mode(layer) -> str:
        """這一層翻出來會是哪一種 glTF alphaMode。

        ⭐ 這是**唯一**一份判準 —— `_layer_material()` 自己也呼叫它，
        `gltf_materials()` 用它決定「哪幾層被後面的不透明層蓋住了」。
        ⛔ 不要抄第二份（第〇·四守則：同一個知識只有一個住處）。
        """
        rid = _rid(layer)
        if rid == 2:
            return "BLEND"       # 隊伍發光：lit 與 drop 兩條路都是 BLEND
        if rid != 0:
            return "OPAQUE"      # 隊伍色 / 其它 replaceableId → 實心
        info = filter_mode_info(layer.filter_mode)
        if info.kind in ("additive", "multiply", "multiply2x"):
            return "BLEND"
        hint = tex_alpha.get(layer.texture_id, "opaque")
        if hint == "opaque":
            # ⭐ GH#841 —— alpha 平坦不透明（或根本沒有 alpha 通道）時
            # WC3 的 alpha test 處處通過、alpha 混色混不出東西 ⇒ 就是不透明。
            return "OPAQUE"
        if info.kind == "opaque":
            # GGD visual-safety policy: an atlas with real transparency may
            # never be emitted as glTF OPAQUE.  OPAQUE ignores PNG alpha and
            # turns hair cards, capes and effect planes into full rectangles
            # during animation.  Preserve the decoded alpha shape even when
            # the legacy WC3 layer said FilterMode=None.
            return "MASK" if hint == "mask" else "BLEND"
        if info.kind == "cutout":
            return "BLEND" if hint == "blend" else "MASK"
        return "MASK" if hint == "mask" else "BLEND"

    def _layer_material(mid: int, li: int, layer, n_emitted: int) -> dict:
        """⭐ GH#841 —— **一個 MDX 層 = 一份 glTF 材質**（＋一個 primitive）。

        ⛔ 在此之前這裡是「整份材質只挑**一層** `disp` 來畫」＋
        `has_opaque_base` 一票否決：材質裡只要有一層 fm0，整份就變 OPAQUE，
        而其餘每一層**逐位元不存在**。量到 **33 份來源材質**（`[0,2]` 30、
        `[0,1]` / `[0,2,3]` / `[3,0]` 各 1）在出貨樹上少了一層。
        ⚠️ 而那個否決本身是有理由的（它修的是「隊伍色底＋混色細節」畫成半透明
        鬼影）—— ⭐ 逐層輸出**同時**保住那個理由：底層自己就是不透明的。
        """
        rid = _rid(layer)
        fm = layer.filter_mode
        info = filter_mode_info(fm)
        # ⭐ 只發一份材質時名字**保持原樣**（`mat3` / `TeamGlow1`）——
        # 下游 `strip_teamglow.py`、`invisible_prim_census.py`、稽核報告都按名字認人。
        sfx = "" if n_emitted <= 1 else f"_l{li}"
        pbr = {"metallicFactor": 0.0, "roughnessFactor": 1.0}
        mat: dict = {
            "name": f"mat{mid}{sfx}", "pbrMetallicRoughness": pbr,
            "doubleSided": bool(layer.shading_flags & 0x10 or fm >= 2),
            # ⭐ 來源事實跟著位元組走：翻譯是有損的（glTF 核心沒有相加/相乘混色），
            # ⛔ 但**來源說了什麼**不可以在轉檔時消失。
            "extras": {"w3x": {"material": mid, "layer": li, "filterMode": fm,
                               "blend": info.name, "replaceableId": rid}},
        }

        def set_mask():
            mat["alphaMode"] = "MASK"
            mat["alphaCutoff"] = 0.5

        if info.fm < 0:
            res.notes.append(
                f"mat{mid}{sfx}: ⛔ 未知 filterMode {fm} → 退回 BLEND（未翻譯）")

        if rid == 1:
            # TEAM COLOUR body region → neutral opaque tint the CLIENT recolours
            # (flagged in teamTintMaterials). Opaque = no see-through gray ghost.
            mat["name"] = f"TeamColor{mid}{sfx}"
            res.team_color_materials.append(mat["name"])
            pbr["baseColorFactor"] = list(NEUTRAL_TEAM)
            mat["alphaMode"] = "OPAQUE"
        elif rid == 2:
            # TEAM GLOW (replaceableId 2): coloured additive billboard.
            glow = layer if layer.texture_id in textures_png else None
            if team_glow == "lit" and glow is not None:
                # ⭐ GH#767 —— 這一片**不是**一塊沒有美術的色塊：rid-2 的美術
                # 就是 `ReplaceableTextures\TeamGlow\TeamGlow00.blp`，而它是
                # 「亮在黑底上、alpha 平坦 255」⇒ 逐位元就是 GH#649 那一族。
                # ⇒ 走**同一條** luma-key 路徑（alpha := max(R,G,B)），⛔ 不要
                # 再發明第二種處理方式。
                tix = gltf_texture_luma(glow.texture_id)
                mat["name"] = f"TeamGlow{mid}{sfx}"
                res.lit_glow_materials.append(mat["name"])
                mat["emissiveTexture"] = {"index": tix}
                mat["emissiveFactor"] = [1.0, 1.0, 1.0]
                mat["extensions"] = {"KHR_materials_emissive_strength":
                                     {"emissiveStrength": 2.0}}
                used_ext.add("KHR_materials_emissive_strength")
                mat["alphaMode"] = "BLEND"
                pbr["baseColorTexture"] = {"index": tix}
                res.notes.append(
                    f"mat{mid}{sfx}: team glow (rid2) → luma-keyed VISIBLE (GH#767)")
            else:
                # we cannot tint it — drop it (fully transparent) so there is
                # no gray blob.
                mat["name"] = f"TeamGlow{mid}{sfx}"
                res.dropped_glow_materials.append(mat["name"])
                pbr["baseColorFactor"] = [0, 0, 0, 0]
                mat["alphaMode"] = "BLEND"
        elif rid != 0:
            # 其它 replaceableId（地形/懸崖那一族）—— 我們沒有它的美術。
            pbr["baseColorFactor"] = [0.5, 0.5, 0.5, 1.0]
        elif info.kind == "additive":
            # glow GEOMETRY (energy blade / orb): emissive so it reads as
            # light, never an opaque black quad.
            hint = tex_alpha.get(layer.texture_id, "opaque")
            if hint == "opaque":
                # solid bright-on-black glow: no alpha channel to key on.
                # Derive one from luminance instead of dropping the quad —
                # the drop policy made 28 shipped effect .glbs (beam
                # cannons, novas, auras) draw zero pixels (GH#649).
                tix = gltf_texture_luma(layer.texture_id)
                res.notes.append(
                    f"mat{mid}{sfx}: {info.name} glow w/o alpha → luma-keyed")
            else:
                # ⚠️ fm3 的 alpha 在 WC3 是**被忽略**的，⛔ 但這裡刻意仍然用它：
                # 「形狀住 alpha、RGB 平坦亮」的那一族（CartoonCloud / Dust5A —
                # `convert_stock_model.py::texture_shape_report` 的
                # `LUMA-KEY-NEEDED` 判決）改用 luma 會變成一塊亮方塊。
                # ⇒ 兩個方向都要活得下來：有 alpha 就用 alpha，沒有才推 luma。
                tix = gltf_texture_additive(layer.texture_id)
            mat["emissiveTexture"] = {"index": tix}
            mat["emissiveFactor"] = [1.0, 1.0, 1.0]
            mat["extensions"] = {"KHR_materials_emissive_strength":
                                 {"emissiveStrength": 2.0}}
            used_ext.add("KHR_materials_emissive_strength")
            mat["alphaMode"] = "BLEND"
            pbr["baseColorTexture"] = {"index": tix}
        elif info.kind in ("multiply", "multiply2x"):
            # ⭐ 相乘（變暗），⛔ 不是相加（發光）。代數見 gltf_texture_multiply。
            two_x = info.kind == "multiply2x"
            pbr["baseColorTexture"] = {
                "index": gltf_texture_multiply(layer.texture_id, two_x)}
            pbr["baseColorFactor"] = [0.0, 0.0, 0.0, 1.0]
            mat["alphaMode"] = "BLEND"
            if layer.texture_id not in textures_png:
                res.notes.append(
                    f"mat{mid}{sfx}: {info.name} 貼圖解不到 → 恆等（不變暗）")
            elif two_x:
                res.notes.append(
                    f"mat{mid}{sfx}: {info.name} → MULTIPLY；"
                    "變暗那一半精確，⛔ 2× 變亮那一半 glTF 核心表達不了")
            else:
                res.notes.append(f"mat{mid}{sfx}: {info.name} → MULTIPLY（變暗）")
        else:
            hint = tex_alpha.get(layer.texture_id, "opaque")
            pbr["baseColorTexture"] = {"index": gltf_texture(layer.texture_id)}
            mode = _layer_alpha_mode(layer)
            if mode == "MASK":
                set_mask()
            elif mode == "BLEND":
                mat["alphaMode"] = "BLEND"
            elif info.kind != "opaque" and hint == "opaque":
                # ⭐ GH#841 —— 貼圖的 alpha 平坦不透明（或根本沒有 alpha 通道）：
                # WC3 的 alpha test 處處通過、alpha 混色混不出任何東西
                # ⇒ **結果就是不透明**。⛔ 在此之前這裡發的是一個
                # 「切不掉任何一個像素的 MASK」—— 一句說了但不會發生的話。
                res.notes.append(
                    f"mat{mid}{sfx}: {info.name} 但 alpha 平坦不透明 → OPAQUE"
                    "（⛔ 不是切不掉東西的 MASK）")
        return mat

    def gltf_materials(mid: int) -> list[int]:
        """這份 MDX 材質要畫的**每一層**，各一個 glTF 材質 index（依 MDX 層序）。"""
        if mid in mat_index:
            return mat_index[mid]
        layers = (model.materials[mid].layers
                  if 0 <= mid < len(model.materials) else [])
        # ⛔ 被丟掉的隊伍發光層（`baseColorFactor [0,0,0,0]`）**必不可見** ⇒
        # 材質裡還有別的層時就不要再發一個空 primitive。
        # ⚠️ 下面那個「整份材質都是它時仍然要發」的回退，是 GH#770 的**病灶本身**：
        # 它存在的唯一理由是讓事後掃描（`strip_teamglow.py` /
        # `invisible_prim_census.py`）**按名字**找得到那一片再刪掉它 ——
        # 而那支掃描只涵蓋英雄身體＋皮膚，於是 25 份別的模型永遠沒人來收。
        # ⭐ `characterTeamGlow: "cull"` 走**不到**這裡：那種 geoset 在
        # `classify_geosets()` 就整個被剔掉了（cull 的唯一住處在那裡）。
        # ⇒ 這個回退只服務 `"keep"`（＝ GH#770 之前的行為，一鍵 rollback）。
        keep = [i for i, l in enumerate(layers)
                if not (_rid(l) == 2 and not (team_glow == "lit"
                                              and l.texture_id in textures_png))]
        if not keep:
            keep = list(range(len(layers)))
        # ⭐ MDX **依序**疊圖 ⇒ 最後一層不透明的層把它**前面**的每一層完全蓋住
        # （WC3 自己就是這樣畫的）。⛔ 不要輸出那些畫了也看不到的層：它們除了
        # 白花 draw call，還是「兩個同深度的不透明 primitive」——
        # 誰贏取決於 renderer 的 depthFunc 是 LEQUAL 還是 LESS，
        # ⚠️ 而那是一個我們**驗不到**的變數（headless 沒有像素）。
        last_opaque = 0
        for pos, li in enumerate(keep):
            if _layer_alpha_mode(layers[li]) == "OPAQUE":
                last_opaque = pos
        keep = keep[last_opaque:]
        out: list[int] = []
        if not layers:
            gltf["materials"].append({
                "name": f"mat{mid}",
                "pbrMetallicRoughness": {"metallicFactor": 0.0,
                                         "roughnessFactor": 1.0,
                                         "baseColorFactor": [0.5, 0.5, 0.5, 1.0]},
                "doubleSided": False,
            })
            out.append(len(gltf["materials"]) - 1)
        for li in keep:
            gltf["materials"].append(
                _layer_material(mid, li, layers[li], len(keep)))
            out.append(len(gltf["materials"]) - 1)
        mat_index[mid] = out
        return out

    # ---- skin ---------------------------------------------------------------
    skin_index = None
    if obj_ids:
        ibms = b""
        for oid in obj_ids:
            piv = _v(model.nodes[oid].pivot, scale)
            ibm = [
                1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                -piv[0], -piv[1], -piv[2], 1,
            ]
            ibms += struct.pack("<16f", *ibm)
        acc = buf.add(ibms, None, {
            "componentType": 5126, "count": len(obj_ids), "type": "MAT4",
        })
        gltf["skins"] = [{
            "joints": [node_index[o] for o in obj_ids],
            "inverseBindMatrices": acc,
        }]
        skin_index = 0

    # ---- geosets → mesh primitives -----------------------------------------
    # Effect/particle geosets (giant beams, ground rings, glow billboards a WC3
    # particle emitter drove) are DROPPED from the baked body mesh — they belong
    # in the VFX channel, and baking them as solid geometry both inflates the
    # bbox and (when the biggest is mistaken for the body) wrecks hero-height
    # normalization. The body "height" is the union of the KEPT body geosets,
    # not a single max-vertex geoset. See classify_geosets().
    geo_info, (body_min, body_max) = classify_geosets(model, scale, team_glow)
    prims = []
    for gi, g in enumerate(model.geosets):
        if geo_info[gi]["drop"]:
            res.dropped_effect_geosets.append({
                "geoset": gi, "verts": geo_info[gi]["verts"],
                "material": g.material_id, "reason": geo_info[gi]["reason"],
            })
            continue
        n = len(g.vertices)
        pos = bytearray()
        nrm = bytearray()
        uv = bytearray()
        mins = [1e30] * 3
        maxs = [-1e30] * 3
        for i in range(n):
            p = _v(g.vertices[i], scale)
            for k in range(3):
                mins[k] = min(mins[k], p[k])
                maxs[k] = max(maxs[k], p[k])
            pos += struct.pack("<3f", *p)
            nv = _v(g.normals[i], 1.0) if i < len(g.normals) else (0, 1, 0)
            ln = math.sqrt(sum(c * c for c in nv)) or 1.0
            nrm += struct.pack("<3f", nv[0] / ln, nv[1] / ln, nv[2] / ln)
            u, vv = g.uvs[i] if i < len(g.uvs) else (0.0, 0.0)
            uv += struct.pack("<2f", u, vv)
        attrs = {}
        attrs["POSITION"] = buf.add(bytes(pos), 34962, {
            "componentType": 5126, "count": n, "type": "VEC3",
            "min": [round(v, 6) for v in mins], "max": [round(v, 6) for v in maxs],
        })
        attrs["NORMAL"] = buf.add(bytes(nrm), 34962, {
            "componentType": 5126, "count": n, "type": "VEC3",
        })
        attrs["TEXCOORD_0"] = buf.add(bytes(uv), 34962, {
            "componentType": 5126, "count": n, "type": "VEC2",
        })
        if skin_index is not None:
            joints = bytearray()
            weights = bytearray()
            for i in range(n):
                gi = g.vertex_groups[i] if i < len(g.vertex_groups) else 0
                grp = (
                    g.matrix_groups[gi]
                    if 0 <= gi < len(g.matrix_groups)
                    else []
                )
                js = [obj_ids.index(b) for b in grp[:4] if b in node_index] or [0]
                w = 1.0 / len(js)
                jw = js + [0] * (4 - len(js))
                ws = [w] * len(js) + [0.0] * (4 - len(js))
                joints += struct.pack("<4H", *jw)
                weights += struct.pack("<4f", *ws)
            attrs["JOINTS_0"] = buf.add(bytes(joints), 34962, {
                "componentType": 5123, "count": n, "type": "VEC4",
            })
            attrs["WEIGHTS_0"] = buf.add(bytes(weights), 34962, {
                "componentType": 5126, "count": n, "type": "VEC4",
            })
        idx = struct.pack("<%dH" % len(g.faces), *g.faces)
        indices = buf.add(idx, 34963, {
            "componentType": 5123, "count": len(g.faces), "type": "SCALAR",
        })
        # ⭐ GH#841 —— 一層一個 primitive（共用同一批 accessor，⛔ 不複製頂點）。
        # MDX 的層是**依序疊上去**的；glTF 沒有多層材質，唯一表達得出來的形狀
        # 就是同一份幾何畫 N 次。⛔ 在此之前只畫 `disp` 那一層。
        for mi in gltf_materials(g.material_id):
            prims.append({
                "attributes": attrs,
                "indices": indices,
                "material": mi,
            })
    if prims:
        gltf["meshes"].append({"name": model.name or model_name, "primitives": prims})
        mesh_node = {"name": "mesh", "mesh": 0}
        if skin_index is not None:
            mesh_node["skin"] = 0
        gltf["nodes"].append(mesh_node)
        gltf["scenes"][0]["nodes"].append(len(gltf["nodes"]) - 1)

    # ---- animations ---------------------------------------------------------
    gltf["animations"] = []
    used_names: set[str] = set()
    for seq in model.sequences:
        name = seq.name
        while name in used_names:
            name += "_"
        used_names.add(name)
        channels = []
        samplers = []
        for oid in obj_ids:
            nd = model.nodes[oid]
            base_t = gltf["nodes"][node_index[oid]]["translation"]
            for track, path, is_quat in (
                (nd.translation, "translation", False),
                (nd.rotation, "rotation", True),
                (nd.scaling, "scale", False),
            ):
                if track is None:
                    continue
                if track.global_seq >= 0:
                    continue  # global sequences stay static
                keys = _sample_track(track, seq.start, seq.end, is_quat)
                interp = track.interp
                if not keys:
                    if not track.keys:
                        continue
                    # keys exist only OUTSIDE this sequence: emit a 1-key
                    # hold so the bone is pinned to ITS pose for this clip —
                    # otherwise it keeps whatever pose the previously played
                    # clip left (stale cross-clip poses read as spasming
                    # when states switch quickly)
                    hv = _hold_value(track, seq.start)
                    if hv is None:
                        continue
                    keys = [(seq.start, hv)]
                    interp = 0  # STEP
                qkeys = _quantize_times(keys, seq.start)
                times = b""
                vals = b""
                out_type = "VEC4" if is_quat else "VEC3"
                for sec, v in qkeys:
                    times += struct.pack("<f", sec)
                    if path == "translation":
                        c = _v(v, scale)
                        vals += struct.pack(
                            "<3f", base_t[0] + c[0], base_t[1] + c[1], base_t[2] + c[2]
                        )
                    elif path == "rotation":
                        q = _norm_q(_q(v))
                        vals += struct.pack("<4f", *q)
                    else:
                        vals += struct.pack("<3f", *_s3(v))
                t_acc = buf.add(times, None, {
                    "componentType": 5126, "count": len(qkeys), "type": "SCALAR",
                    "min": [round(qkeys[0][0], 6)],
                    "max": [round(qkeys[-1][0], 6)],
                })
                v_acc = buf.add(vals, None, {
                    "componentType": 5126, "count": len(qkeys), "type": out_type,
                })
                samplers.append({
                    "input": t_acc, "output": v_acc,
                    "interpolation": "STEP" if interp == 0 else "LINEAR",
                })
                channels.append({
                    "sampler": len(samplers) - 1,
                    "target": {"node": node_index[oid], "path": path},
                })
        if not channels and obj_ids:
            # sequence with no keys inside its interval: emit a static clip so
            # the logical animation still exists for clipMap consumers
            oid = obj_ids[0]
            base_t = gltf["nodes"][node_index[oid]]["translation"]
            dur = max(0.001, (seq.end - seq.start) / 1000.0)
            t_acc = buf.add(struct.pack("<2f", 0.0, dur), None, {
                "componentType": 5126, "count": 2, "type": "SCALAR",
                "min": [0.0], "max": [round(dur, 6)],
            })
            v_acc = buf.add(struct.pack("<6f", *base_t, *base_t), None, {
                "componentType": 5126, "count": 2, "type": "VEC3",
            })
            samplers.append({"input": t_acc, "output": v_acc,
                             "interpolation": "STEP"})
            channels.append({"sampler": 0,
                             "target": {"node": node_index[oid],
                                        "path": "translation"}})
        if channels:
            gltf["animations"].append(
                {"name": name, "channels": channels, "samplers": samplers}
            )
            res.anim_names.append(name)
    if not gltf["animations"]:
        del gltf["animations"]

    # ---- attach points ------------------------------------------------------
    for oid in obj_ids:
        nd = model.nodes[oid]
        if nd.kind == "attachment":
            piv = _v(nd.pivot, scale)
            key = nd.name.replace(" Ref", "").replace(" ref", "").strip()
            if key:
                res.attach_points[key] = {
                    "x": round(piv[0], 4), "y": round(piv[1], 4),
                    "z": round(piv[2], 4),
                }

    # ---- assemble GLB -------------------------------------------------------
    if used_ext:
        gltf["extensionsUsed"] = sorted(used_ext)
    gltf["buffers"] = [{"byteLength": len(buf.data)}]
    gltf["bufferViews"] = buf.views
    gltf["accessors"] = buf.accessors
    if model.skipped_chunks:
        skipped = sorted(set(model.skipped_chunks))
        res.notes.append("skipped MDX chunks: " + ",".join(skipped))
    if res.dropped_effect_geosets:
        res.notes.append(
            "dropped stray effect geosets: "
            + ", ".join(f"#{d['geoset']}({d['verts']}v)"
                        for d in res.dropped_effect_geosets)
        )
    # body height = union bbox of the KEPT (non-effect) geosets
    res.height = (body_max[1] - body_min[1]) if prims else 0.0
    res.glb = _pack_glb(gltf, bytes(buf.data))
    return res


def _pack_glb(gltf: dict, bin_data: bytes) -> bytes:
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * ((4 - len(js) % 4) % 4)
    bin_data += b"\x00" * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_data)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js), 0x4E4F534A) + js
    out += struct.pack("<II", len(bin_data), 0x004E4942) + bin_data
    return out


_GRAY_PNG_CACHE: bytes | None = None


def _gray_png() -> bytes:
    global _GRAY_PNG_CACHE
    if _GRAY_PNG_CACHE is None:
        import io
        from PIL import Image

        img = Image.new("RGB", (8, 8), (128, 128, 128))
        b = io.BytesIO()
        img.save(b, "PNG")
        _GRAY_PNG_CACHE = b.getvalue()
    return _GRAY_PNG_CACHE

#!/usr/bin/env python3
"""「兩個 primitive 接不接得起來」—— ⭐ 判準的**唯一住處**（GH#1283）。

在此之前同一個問題有**三份**判準，而它們的答案互相矛盾：

| 住處 | 它說什麼 |
|---|---|
| `model_intake.py` 的②「可合併」 | 只比材質 ⇒ ⛔ **半透明也算可合併** |
| `merge_glb_prims.py` 的 `merge()` | 同上 ⇒ 它真的把半透明接起來 |
| `atlas_pack.py` 的 blend-order 保護 | ⭐ **刻意不動半透明** |

⇒ 兩支工具對同一顆模型給相反的答案，⛔ 而棘輪吃的是前者。
量到的代價（GH#1173，莉娜 `23bb76d8…`）：兩塊半透明被接成一塊 ⇒ 主 session 裁決換回
「不合併」的 `8791a3e6…` ⇒ 棘輪 a 255 → 256，⭐ 而那一顆在舊判準下**照樣被記成「可合併」**。

⭐ **為什麼半透明不算「可合併」**：Babylon **逐塊**按包圍球中心排半透明的繪製順序
（`tools/model-budget/optimize/atlas_pack.py:540-544` 逐字：「merge 把其中一層跟別的部位
接起來 ⇒ **包圍盒中心變了** ⇒ 平手被打破,誰先畫改由鏡頭位置決定」）
⇒ 把兩塊半透明接成一塊，那一塊的中心就換了位置。
⛔ 而不透明沒有這個問題：深度測試與畫的順序無關。

⇒ ⭐ 判準一句話：**同畫法就接得起來，⛔ 除非它是半透明。**

⚠️ 逃生口 `blend_order=False` —— ⭐ 只給**已經自己證明過順序安全**的呼叫端
（例：`atlas_pack.py` 逐塊算過 eligible 才併），⛔ 不是「想多併一點」。
"""
import json

BLEND = "BLEND"


def material_of(doc: dict, index) -> dict:
    """primitive 指到的材質。⛔ 指不到就是**空材質**（glTF 的預設材質，不是錯）。"""
    mats = doc.get("materials") or []
    return mats[index] if isinstance(index, int) and 0 <= index < len(mats) else {}


def state_key(material: dict) -> str:
    """材質的**渲染狀態**指紋：⛔ `name` 與 `extras` 是溯源資料，不進指紋。"""
    return json.dumps({k: v for k, v in material.items() if k not in ("name", "extras")},
                      sort_keys=True)


def render_key(doc: dict, index) -> str:
    """`state_key` 的 `(doc, material index)` 版 —— 兩支工具原本各有一份，現在同一份。"""
    return state_key(material_of(doc, index))


def is_blend(doc: dict, index) -> bool:
    """半透明（glTF `alphaMode: "BLEND"`）—— ⭐ 它是「接不接得起來」的**否決票**。"""
    return material_of(doc, index).get("alphaMode") == BLEND


def merge_groups(doc: dict, materials, *, blend_order: bool = True) -> list:
    """把 primitive 依「接得起來」分組，回傳**首次出現順序**的索引組。

    `materials`：逐個 primitive 的材質索引，⭐ **照畫的順序**給。
    ⭐ `len(merge_groups(...))` ＝ 合併之後剩幾個 draw call
    ⇒ 它 `< len(materials)` 才叫「可合併」。
    ⭐ 半透明每一塊**自己一組**（＝不動它），⛔ 不是跟同畫法的接起來。
    """
    groups: list = []
    first: dict = {}
    for i, mi in enumerate(materials):
        if blend_order and is_blend(doc, mi):
            groups.append([i])
            continue
        key = render_key(doc, mi)
        at = first.get(key)
        if at is None:
            first[key] = len(groups)
            groups.append([i])
        else:
            groups[at].append(i)
    return groups

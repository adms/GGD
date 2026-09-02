#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
tools/vfx-bind/scan.py —— 把「哪一支技能該播原作的哪一份特效」從**證據**推導出來。

    python3 tools/vfx-bind/scan.py            # 重新產生 content/config/ability-vfx-bindings.json
    python3 tools/vfx-bind/scan.py --check    # 唯讀:逐位元組比對 + 跨表對帳,漂了就非零離開
    python3 tools/vfx-bind/scan.py --report   # 只印人看的摘要,不寫檔

⭐ 為什麼是一支**產生器**而不是一張手寫表(CLAUDE.md 第〇·四守則)
------------------------------------------------------------------
一支技能該播哪一份 `fx.w3x.*`,答案完整地住在三個**已經存在**的地方:

  1. `content/assets/vfx/w3x-ability-provenance.json` —— IMMUTABLE ARCHAEOLOGY
     (技能 rawcode ↔ 原作藝術 ↔ 抽出來的 emitter 文件 id)
  2. `content/vfx/*.json`                            —— 哪幾份 emitter 真的出貨了
  3. `content/abilities/*.json`                      —— 哪幾支技能今天還活著

⇒ 把結論**抄**進 420 份技能文件的 `vfxKey` 是第二個住處,而且它會過期:
  抽取器多收一個模型、一支技能被退休、一份 emitter 被砍 —— 每一次都讓那 420 份
  裡的某幾份變成謊話,而**沒有任何東西會紅**。所以結論住一張表,表由這支腳本產生,
  `--check` 逐位元組比對。

⚠️ 這支腳本**刻意不寫時間戳**。任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等,
於是 `--check` 只能被放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘
(同 `pnpm caps:export` / `pnpm spec:build` 的理由)。

⭐ 四道閘,順序固定 —— 一列必須全過才叫 CONFIRMED
------------------------------------------------------------------
| # | 閘 | ⛔ 沒有它會怎樣 |
|---|---|---|
| 1 | `joinConfidence == CONFIRMED` | rawcode↔技能 的 join 是猜的 → 綁到**別支技能的特效** |
| 2 | `provenance ∈ {w3a-override, w3h-override, jass-literal}` | 暴雪內建繼承**不是作者意圖**(見 provenance 檔的 `provenanceContract`) |
| 3 | `rootAnchored == emitterTotal > 0` | 掛在模型自己動畫節點上的 emitter,用世界座標重播會全部從同一點噴 —— 一團而不是一圈。這一道是既有的**可渲染性閘**(`apps/client/src/render/vfx/w3xAbilityArt.ts` 檔頭逐字記著 divinering 20 顆的量測),⛔ 這裡只是把它從散文變成程式,**沒有推翻它** |
| 4 | 每一份 `layerDocIds` 都在 `content/vfx/`,而且技能還活著 | 綁一份不存在的文件 = 這一招完全沒有特效(第一·五守則的空宣稱) |

沒過的**每一份** emitter 文件都會進 `unmatched`,帶著**能被反駁的理由**(哪一道閘、
量到的數字是多少),⛔ 不是「還沒收」。

⭐ 為什麼一列存的是 `vfxKeys`(陣列)而不是票上寫的 `vfxKey`(單值)
------------------------------------------------------------------
一次原作施法 = **一組** emitter(`holyawakening` 是 6 顆)。存一個 `vfxKey` 再另外
存一份 `extra` 的話,「主 emitter 是哪一顆」就變成一個**存下來的值**,而它是一條
規則算得出來的(`vfxKeys[0]`)—— 那就是第〇·四守則說的第二個住處。
⇒ 這裡只存**有序的整組**,主 emitter 由 `resolveAbilityVfxSource()` 依規則取第一顆。

⭐ 跨表對帳(`--check` 的第二半)
------------------------------------------------------------------
`content/config/vfx-ability-art.json` 的 `bindings.<id>.promoted` 是**客戶端渲染層**
的同一組結論。兩張表帶同一份值,所以它們之間必須有閘,否則就是無守衛的第二住處:

  · `MISSING`   —— 這裡推導得出來,`promoted` 沒有 → 那支技能拿不到原作藝術
  · `DEAD`      —— `promoted` 有,但那支技能已經不在 `content/abilities/` → 空宣稱
  · `SET-DRIFT` —— 兩邊的 emitter 集合不一樣 → 有一邊在說謊

⛔ 對帳**只回報,不自動改** `vfx-ability-art.json` —— 那份檔案有它自己的產生鏈
(`tools/w3x-import/build_vfx_bindings.py`),兩支腳本互相覆寫會變成無限迴圈。

⭐ #547 —— 這支腳本現在有**兩個證據源**與**兩個產出**
------------------------------------------------------------------
owner 2026-08-22:「一堆**攻擊投射物 衝擊波特效**都沒移植 請儘快從 w3x 補上」。
逐份追下去,那句話底下是**兩個**不同的洞,而它們的證據住在 provenance 檔的
**兩個不同欄位**裡 —— 上一輪只讀了其中一個(`extractions`)。

| | 洞 | 證據在哪 | 產出 |
|---|---|---|---|
| **A** | 施法演出(既有) | `abilities[*].extractions[]` —— 地圖自帶模型抽出來的 emitter | `content/config/ability-vfx-bindings.json` |
| **B** | **衝擊波 / 落點**(新) | `abilities[*].realArt[]` 的 `stem` ↔ 出貨的 `fx.w3x.stock.<stem>.p*` | 同一張表 |
| **C** | **投射物美術**(新) | `realArt[channel="art:missile"]` 的 `extractions` ↔ 誰射它 | `content/projectiles/*.json` 的 `vfxKey` |

⭐ **B 為什麼上一輪整個看不見**:`AddSpecialEffect("...WarStompCaster.mdl", x, y)`
這種**落點**呼叫指的是**暴雪零售模型**,它不在地圖裡 ⇒ 不會出現在 `models`,
於是 `extractions` 是空的,於是四道閘連跑都沒跑到。⛔ 但那個環**已經在 repo 裡** ——
`extract_stock_vfx.py` 從零售 MPQ 抽出了 `fx.w3x.stock.warstompcaster.p00` 與
`fx.w3x.stock.thunderclapcaster.p00`,而上一輪的表把它們寫進 `unmatched`,理由是
「別條產生鏈的產物,不歸這張表管」。⇒ ⭐ **那句話才是那個洞**:產生鏈不同不代表
證據不成立,`jass-literal` 是 provenance 契約裡**最強的意圖**。

量到的(2026-08-22):**51 支**活著且 CONFIRMED 的技能在 `realArt` 裡點名這兩個 stem,
而綁定表一支都沒接。

⚠️ B 只收**落點/範圍**通道(`jass:effectLoc` · `art:area`),⛔ 不收
`art:caster` / `art:target` / `art:special` / `art:effect` / `buff:*` ——
那幾個是**施法者或目標身上**的演出。把它們也接上去 = 51 支英雄的招式在畫面上
變成**同一個灰環**,而 `fx.prim.*` 存在的理由正是「一發聖光不要長得跟每一發聖光一樣」
(`w3xAbilityArt.ts` 檔頭)。⭐ 那是一個**決策點**,該是後台一格開關,
⛔ 不是這張表的預設(第一守則)。`--report` 會把那幾支逐支印出來給 owner 勾。

⭐ C 為什麼**不進這張表**:一顆飛彈的美術是**投射物**的性質,⛔ 不是技能的 ——
`imported.wave` 被 5 支技能共用,而它們的原作飛彈分別是三個不同模型。
表是 `abilityId → 一組 emitter`,而 `ProjectileView` 手上只有 `projectileId`。
⇒ 結論寫進 `projectile@1.vfxKey`,由**同一支腳本**產生、`--check` 一起驗。

⭐ #547 第三輪 —— 量到的結論是「⛔ 這不是綁定的洞」
------------------------------------------------------------------
owner 第三次提「一堆攻擊投射物都沒移植」。這一輪把它**量完**(2026-08-22):

| | 量到的 |
|---|---:|
| 活著的技能 | **420** |
| 其中**真的射出投射物**的 | **22** |
| 原作地圖裡**作者自己設過飛彈美術**的活技能 | **76** |
| ⭐ 有飛彈美術意圖、卻**根本沒射投射物** | **68** |
| 出貨的 `content/projectiles/*.json` | **21** 份 |
| 其中美術指向原作的 | **1** 份 |

⇒ ⭐ **缺的不是綁定,是投射物本身沒被移植。** 68 支技能在原作裡射一發飛彈,
在 GGD 裡整個 `spawnProjectile` 都不存在 —— 綁定表再怎麼推導都碰不到它們,
因為 `_projectile_users()` 找不到任何人射那顆子彈。

⚠️ 而**剩下的綁定頭寸只有 1 顆**:15 對「技能↔投射物」有飛彈證據,其中 12 對點名
**暴雪零售模型**(`MISSING_BLIZZARD_STOCK`),而 `extract_stock_vfx.py` 到今天只抽過
**2 個** stem(`warstompcaster` / `thunderclapcaster`),**一個飛彈都沒有**。
⇒ 這支腳本現在把那份**採購清單**印出來(`--report` 的 `WANT` 段),
⛔ 不是一句「抽不出 emitter 文件」的死路。

⭐ 源 C 因此多一條路:`art:missile` 抽不到地圖自帶模型時,改試**零售 stock 家族**
(`fx.w3x.stock.<stem>.p*`,與源 B 同一條**命名規則**)。⇒ 抽取器哪天多收一個飛彈
模型,覆蓋率**自己長出來**,⛔ 不必回來改這支腳本(第〇·四守則)。
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Any

REPO = os.path.dirname(os.path.dirname(os.path.abspath(os.path.dirname(__file__) + "/../")))
REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))

PROVENANCE = os.path.join(REPO, "content", "assets", "vfx", "w3x-ability-provenance.json")
VFX_DIR = os.path.join(REPO, "content", "vfx")
ABILITY_DIR = os.path.join(REPO, "content", "abilities")
ABILITY_ART = os.path.join(REPO, "content", "config", "vfx-ability-art.json")
PROJECTILE_DIR = os.path.join(REPO, "content", "projectiles")
AUGMENT_DIR = os.path.join(REPO, "content", "augments")
OUT = os.path.join(REPO, "content", "config", "ability-vfx-bindings.json")

SCHEMA_TAG = "config.ability-vfx-bindings@1"
DOC_ID = "ability-vfx-bindings"

# 作者**自己**設的來源。⛔ `stock-inherited` / `stock-buff-inherited` 不算意圖 ——
# 那是 WC3 沿用了暴雪內建技能的欄位,而且那些模型根本不在這個 repo 裡。
INTENT_PROVENANCE = ("w3a-override", "w3h-override", "jass-literal")

# 一列最多幾顆 emitter —— 對齊 `ABILITY_VFX_LAYER_HARD_CAP`(shared 那一側的絕對上限)。
# ⚠️ 超過的家族不是被截斷,是**整列被拒**並進 `unmatched`:截斷會讓表面上綁好了、
# 畫面上少一半,而那是安靜的失敗。
MAX_LAYERS = 6

# 原作藝術的兩個前綴 —— 與 `packages/shared/src/content/vfxBindings.ts` 的
# `ORIGINAL_ART_PREFIXES` 同一個口徑。⛔ 這裡只列**前綴**,不列 id:列 id 就是第二住處。
ORIGINAL_ART_PREFIXES = ("fx.w3x.", "godie-")


def _is_original_art(key: Any) -> bool:
    return isinstance(key, str) and key.startswith(ORIGINAL_ART_PREFIXES)


# ---------------------------------------------------------------------------
# 證據源 B —— 零售 MPQ 抽出來的 stock emitter(#547 衝擊波)
# ---------------------------------------------------------------------------
# ⭐ 這是一條**命名規則**,⛔ 不是一張手抄的清單:`extract_stock_vfx.py` 之後多抽
# 一個模型,覆蓋率自動長出來,⛔ 不必回來改這支腳本(第〇·四守則)。
STOCK_DOC_RE = re.compile(r"^fx\.w3x\.stock\.(?P<stem>.+)\.p\d+$")

# ⭐ **落點/範圍**通道 —— 只有這兩個算「衝擊波」。
#   · `jass:effectLoc`  = 作者在 JASS 裡對一個**座標**呼叫 AddSpecialEffect(落點)
#   · `art:area`        = w3a 的範圍演出欄位(AoE 環)
# ⛔ 施法者/目標/buff 那幾個通道刻意不收,理由見檔頭:那會讓 N 支英雄的招式
# 在畫面上變成同一個環,而那是一個**決策**,該是後台開關(第一守則)。
LANDING_CHANNELS = ("jass:effectLoc", "art:area")

# ---------------------------------------------------------------------------
# 證據源 C —— 投射物美術(#547 投射物 / #394 那 32 支的美術那一半)
# ---------------------------------------------------------------------------
# ⭐ 一顆飛行中的投射物在畫面上只有**一條拖尾** —— `ProjectileView` 建**一顆**
# `ParticleSystem`,而 `projectile@1.vfxKey` 也只收得下**一份**文件。
# ⇒ 只綁 emitter 家族**剛好一份文件**的那些:N>1 的家族要「挑一顆主 emitter」,
# 而那是猜,⛔ 不是推導(接錯 = 玩家看到別支技能的飛彈,比通用原型更糟)。
PROJECTILE_TRAIL_DOCS = 1

# ⚠️ ⛔ 這裡**刻意沒有** root-anchor 閘(源 A 的閘 3),而那不是漏掉:
# 閘 3 擋的是「把整組 emitter 用**世界座標**重播」——掛在模型動畫節點上的 emitter
# 會全部從同一點噴出,一團而不是一圈。**飛行中的投射物根本不走那條路**:
# `apps/client/src/render/views/projectileArt.ts` 檔頭逐字記著量測結果 ——
# 一份文件到得了彈道的只有**顏色、貼圖、混色、burstCount、壽命、峰值大小**,
# 位置與方向全部來自飛彈自己的移動。⇒ 「所有 emitter 是不是都在根節點」對
# 一條拖尾**在結構上不成立**,拿它當閘會擋掉正確的綁定而換不到任何東西。


def _load_json(path: str) -> Any:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _shipped_vfx_ids() -> set[str]:
    return {
        f[:-5]
        for f in os.listdir(VFX_DIR)
        if f.endswith(".json") and not f.startswith("_")
    }


def _live_abilities() -> dict[str, dict]:
    out: dict[str, dict] = {}
    for f in sorted(os.listdir(ABILITY_DIR)):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        doc = _load_json(os.path.join(ABILITY_DIR, f))
        aid = doc.get("id")
        if aid:
            out[aid] = doc
    return out


def _reached_by_other_paths(live: dict[str, dict]) -> dict[str, str]:
    """哪些 emitter 文件已經由**別條**路徑抵達畫面 —— 純讀取,只為了註記。"""
    out: dict[str, str] = {}

    def mark(doc_id: str, how: str) -> None:
        if doc_id and doc_id not in out:
            out[doc_id] = how

    for aid, doc in live.items():
        keys = [doc.get("vfxKey")] + [l.get("vfxKey") for l in (doc.get("vfxLayers") or [])]
        for k in keys:
            if k:
                mark(k, f"技能 `{aid}` 的 vfxKey")
    if os.path.exists(ABILITY_ART):
        for aid, row in _load_json(ABILITY_ART).get("bindings", {}).items():
            p = row.get("promoted") if isinstance(row, dict) else None
            if not p:
                continue
            for k in [p["primary"], *p["extra"]]:
                mark(k, f"vfx-ability-art.json 的 promoted 列 `{aid}`")
    return out


def _stock_families(shipped: set[str]) -> dict[str, list[str]]:
    """出貨的零售 MPQ emitter,依模型 stem 分家族。⭐ 從檔名推導,⛔ 不是清單。"""
    fams: dict[str, list[str]] = {}
    for doc_id in sorted(shipped):
        m = STOCK_DOC_RE.match(doc_id)
        if m:
            fams.setdefault(m.group("stem"), []).append(doc_id)
    return fams


def _projectile_docs() -> dict[str, dict]:
    out: dict[str, dict] = {}
    if not os.path.isdir(PROJECTILE_DIR):
        return out
    for f in sorted(os.listdir(PROJECTILE_DIR)):
        if not f.endswith(".json") or f.startswith("_"):
            continue
        out[f[:-5]] = _load_json(os.path.join(PROJECTILE_DIR, f))
    return out


def _projectile_users(live: dict[str, dict]) -> dict[str, list[tuple[str, str]]]:
    """
    `projectileId` → **射出它的東西**,`(種類, id)`。⚠️ 深走整份文件:它藏在 effect
    樹的任一層。

    ⚠️ **增益卡也射投射物**,而在此之前這裡只走 `content/abilities/` ——
    於是 `grail.projection-bolt` / `grail.tracking-bolt` 被判成「沒有任何活著的技能
    射這顆投射物(它是備用原型)」,⛔ **而那句話是假的**:`grail-c-20` 與 `grail-c-16`
    正在射它們(第三守則 —— 一句自洽的假話比沒有話更貴)。
    ⭐ 它們仍然綁不上(增益卡不在 w3x provenance 檔裡),但理由要說**真正**的那一個。

    ⛔ **champion 不算第二個使用者**:`content/champions/*.json` 內嵌的是**同一支**
    技能文件的鏡像(mirror authority model),數進去會讓每一顆投射物都變成「共用」,
    於是閘 1 永遠不過 —— 一個看起來很嚴謹、實際上把功能整個關掉的閘。
    """
    out: dict[str, set[tuple[str, str]]] = {}

    def walk(node: Any, who: tuple[str, str]) -> None:
        if isinstance(node, dict):
            pid = node.get("projectileId")
            if isinstance(pid, str):
                out.setdefault(pid, set()).add(who)
            for v in node.values():
                walk(v, who)
        elif isinstance(node, list):
            for v in node:
                walk(v, who)

    for aid, doc in live.items():
        walk(doc, ("ability", aid))
    if os.path.isdir(AUGMENT_DIR):
        for f in sorted(os.listdir(AUGMENT_DIR)):
            if not f.endswith(".json") or f.startswith("_"):
                continue
            doc = _load_json(os.path.join(AUGMENT_DIR, f))
            walk(doc, ("augment", doc.get("id") or f[:-5]))
    return {k: sorted(v) for k, v in out.items()}


def derive_projectiles() -> tuple[dict[str, str], list[dict[str, str]]]:
    """
    每一顆 `projectile@1` 該播原作的哪一份飛彈 emitter。

    回傳 `(綁定, 沒綁的理由)`。四道閘,⛔ 每一道都留下一句**能被反駁**的話:

    | # | 閘 | ⛔ 沒有它會怎樣 |
    |---|---|---|
    | 1 | 剛好**一支**活著的技能射這顆投射物 | 共用的投射物綁上去 = 另外那幾支看到**別支技能**的飛彈 |
    | 2 | 那支技能 `joinConfidence == CONFIRMED` + 作者意圖 provenance | 同源 A 的閘 1/2 |
    | 3 | `art:missile` 抽得出 emitter 文件,而且**剛好一份** | 0 份 = 那是純網格(`IN_REPO_MESH_ONLY`),沒有東西可以播;>1 份 = 要挑主 emitter,那是猜 |
    | 4 | 那份文件真的在 `content/vfx/` | 綁一份不存在的 = 這顆子彈完全沒有拖尾 |
    """
    prov = _load_json(PROVENANCE)
    abilities: dict[str, dict] = prov["abilities"]
    shipped = _shipped_vfx_ids()
    live = _live_abilities()
    users = _projectile_users(live)
    stock_fams = _stock_families(shipped)
    bound: dict[str, str] = {}
    why: list[dict[str, str]] = []

    def skip(pid: str, reason: str) -> None:
        why.append({"projectileId": pid, "why": reason})

    for pid in sorted(_projectile_docs()):
        us = users.get(pid, [])
        if len(us) == 0:
            skip(pid, "閘1 專屬 —— 沒有任何活著的技能或增益卡射這顆投射物(它是備用原型,或引用它的東西已退休)")
            continue
        if len(us) > 1:
            skip(
                pid,
                f"閘1 專屬 —— {len(us)} 個活著的來源共用這顆投射物({', '.join(f'{k}:{i}' for k, i in us)})。"
                "⭐ 一顆投射物只有一份美術,綁上任何一支的原作飛彈,"
                "另外那幾支就會在畫面上看到**別支技能**的飛彈 —— 比通用原型更糟。"
                "⇒ 修法是**把投射物拆開**(一支一顆),⛔ 不是在這裡放寬閘",
            )
            continue
        kind, aid = us[0]
        rec = abilities.get(aid) if kind == "ability" else None
        if not rec:
            noun = "增益卡" if kind == "augment" else "技能"
            skip(pid, f"閘2 證據 —— 唯一射它的{noun} `{aid}` 在 w3x provenance 檔裡沒有紀錄(它是 GGD 原創,⛔ 不是移植的)")
            continue
        if rec.get("joinConfidence") != "CONFIRMED":
            skip(pid, f"閘2 join —— `{aid}` 的 rawcode↔技能 join 是 {rec.get('joinConfidence')},接上去可能是**別支技能**的飛彈")
            continue

        # 閘 3 美術 —— 兩條路,順序固定。
        # ① 地圖作者**自己匯入**的飛彈模型(`extractions`)—— 最貼近那一支的身分
        # ② ⭐ 零售 stock 家族(`fx.w3x.stock.<stem>.p*`)—— 與源 B 同一條**命名規則**,
        #    ⛔ 不是一張手抄清單:`extract_stock_vfx.py` 多抽一個飛彈模型,
        #    這裡的覆蓋率自己長出來(第〇·四守則)
        named = [r for r in rec.get("realArt", []) if r.get("channel") == "art:missile"]
        ex = next(
            (
                e
                for e in rec.get("extractions", [])
                if e.get("channel") == "art:missile" and e.get("provenance") in INTENT_PROVENANCE
            ),
            None,
        )
        stem = ex.get("stem") if ex else None
        docs = list(ex.get("layerDocIds") or []) if ex else []
        if ex is None:
            for r in named:
                if r.get("provenance") not in INTENT_PROVENANCE:
                    continue
                fam = stock_fams.get(r.get("stem") or "")
                if fam:
                    stem, docs = r.get("stem"), list(fam)
                    break

        if not docs:
            if not named:
                skip(pid, f"閘3 美術 —— `{aid}` 在原作地圖裡**沒有設飛彈美術**(w3a 的 art:missile 是空的)")
            else:
                r = named[0]
                intent = r.get("provenance") in INTENT_PROVENANCE
                # ⭐ 這一句是**採購清單**,⛔ 不是死路:`MISSING_BLIZZARD_STOCK` 的
                # 唯一缺口是那個模型還沒被 `extract_stock_vfx.py` 抽出來,
                # 而那支腳本已經在 repo 裡(它抽過 warstompcaster / thunderclapcaster)。
                fix = (
                    f"⇒ 跑 `extract_stock_vfx.py` 收 `{r.get('stem')}`,產出 "
                    f"`fx.w3x.stock.{r.get('stem')}.p00`,這顆子彈**自己就會接上**"
                    if intent and r.get("assetStatus") == "MISSING_BLIZZARD_STOCK"
                    else "⛔ 這不是「還沒收」:"
                    + (
                        "provenance 不是作者意圖(暴雪內建繼承),接上去不代表原作長那樣"
                        if not intent
                        else "`IN_REPO_MESH_ONLY` = 網格有、但整個模型一顆 PRE2/RIBB emitter 都沒有,沒有東西可以播"
                    )
                )
                skip(
                    pid,
                    f"閘3 美術 —— `{aid}` 的原作飛彈是 `{r.get('stem')}`,"
                    f"狀態 {r.get('assetStatus')} / provenance {r.get('provenance')}。{fix}",
                )
            continue
        if len(docs) != PROJECTILE_TRAIL_DOCS:
            skip(
                pid,
                f"閘3 拖尾 —— `{stem}` 這一族有 {len(docs)} 份 emitter 文件,"
                f"而一顆飛行中的投射物在畫面上只有**一條**拖尾(`projectile@1.vfxKey` 也只收一份)。"
                "⭐ 要從中挑一顆主 emitter 就是猜,⛔ 不是推導",
            )
            continue
        if docs[0] not in shipped:
            skip(pid, f"閘4 出貨 —— `{docs[0]}` 不在 content/vfx/(綁上去這顆子彈會完全沒有拖尾)")
            continue
        bound[pid] = docs[0]
    return bound, why


def missile_wantlist() -> list[dict[str, Any]]:
    """
    ⭐ #547 的**採購清單** —— 「一堆攻擊投射物都沒移植」量出來到底是什麼。

    ⛔ 這不是綁定的洞:活著的 420 支技能裡只有 ~22 支**真的射出投射物**,而原作地圖
    裡作者自己設過飛彈美術的有 76 支。⇒ 差額那 ~68 支的洞在**內容**(整個
    `spawnProjectile` 不存在),⛔ 不在這張表 —— 綁定推導永遠碰不到它們,因為
    `_projectile_users()` 找不到任何人射那顆子彈。

    這裡把差額**依模型 stem 聚合**並分兩類,讓下一步有明確的收件人:
      · `READY`   資產已經在 repo 裡 ⇒ 缺的只是投射物文件 + 技能去射它(內容側)
      · `EXTRACT` 是暴雪零售模型 ⇒ 先跑 `extract_stock_vfx.py` 收這個 stem
    """
    prov = _load_json(PROVENANCE)
    abilities: dict[str, dict] = prov["abilities"]
    live = _live_abilities()
    shooters = {i for us in _projectile_users(live).values() for k, i in us if k == "ability"}

    agg: dict[str, dict[str, Any]] = {}
    for aid in sorted(abilities):
        if aid not in live or aid in shooters:
            continue  # 已經在射投射物的不算「沒移植」
        if abilities[aid].get("joinConfidence") != "CONFIRMED":
            continue
        for r in abilities[aid].get("realArt", []):
            if r.get("channel") != "art:missile" or r.get("provenance") not in INTENT_PROVENANCE:
                continue
            stem = r.get("stem") or "?"
            row = agg.setdefault(
                stem,
                {"stem": stem, "assetStatus": r.get("assetStatus"), "abilities": []},
            )
            row["abilities"].append(aid)
            break
    # ⚠️ `assetStatus` **一個人回答不了這一格**:它是 IMMUTABLE ARCHAEOLOGY,只知道
    # 地圖自帶的模型,⛔ 不知道 `extract_stock_vfx.py` 後來從零售 MPQ 抽了什麼。
    # 照它分類會把已經抽好的 `warstompcaster` / `thunderclapcaster` 報成「還要去抽」——
    # 一句自洽的假話(第三守則)。⇒ ⭐ 問**出貨的 content/vfx/**,那是唯一的事實。
    stock_fams = _stock_families(_shipped_vfx_ids())
    out = list(agg.values())
    for row in out:
        row["need"] = (
            "READY"
            if row["stem"] in stock_fams or row["assetStatus"] != "MISSING_BLIZZARD_STOCK"
            else "EXTRACT"
        )
    out.sort(key=lambda r: (-len(r["abilities"]), r["stem"]))
    return out


def derive(notes: dict[str, Any] | None = None) -> dict[str, Any]:
    """
    `notes` 是給 `--report` 用的**出參**,⛔ 不進出貨文件 ——
    `config.ability-vfx-bindings@1` 是 `.strict()` 的,多一個鍵 = 內容載入整份失敗。
    """
    prov = _load_json(PROVENANCE)
    abilities: dict[str, dict] = prov["abilities"]
    models: dict[str, dict] = prov["models"]
    shipped = _shipped_vfx_ids()
    live = _live_abilities()

    bindings: list[dict[str, Any]] = []
    # emitter 文件 id → 它為什麼沒被綁上(第一個踩到的閘就是理由)
    rejected: dict[str, str] = {}

    def reject(doc_ids: list[str], why: str) -> None:
        for d in doc_ids:
            if d in shipped and d not in rejected:
                rejected[d] = why

    for aid in sorted(abilities):
        rec = abilities[aid]
        join = rec.get("joinConfidence")
        rawcodes = tuple(rec.get("rawcodes") or ())
        for ex in rec.get("extractions", []):
            docs = list(ex.get("layerDocIds") or [])
            stem = ex.get("stem")
            model = models.get(stem or "", {})
            total = int(model.get("emitterTotal") or 0)
            root = int(model.get("rootAnchored") or 0)

            # 閘 1 —— rawcode↔技能 的 join
            if join != "CONFIRMED":
                reject(
                    docs,
                    f"閘1 join —— 這個模型只經由 joinConfidence={join} 的技能列連到技能,"
                    "自動綁上去可能是**別支技能的特效**。⭐ 人工裁決過的可以留在 "
                    "`vfx-ability-art.json` 的 promoted 列(對帳會標成 EXTRA,⛔ 不是錯)",
                )
                continue
            # 閘 2 —— 作者意圖
            if ex.get("provenance") not in INTENT_PROVENANCE:
                reject(docs, f"閘2 意圖 —— provenance={ex.get('provenance')},那是 WC3 從暴雪內建技能繼承來的欄位,⛔ 不是作者設的")
                continue
            # 閘 3 —— 可渲染性(既有的 root-anchor 閘)
            if total <= 0:
                reject(docs, "閘3 可渲染性 —— 這個模型抽不出任何 PRE2/RIBB emitter(emitterTotal=0)")
                continue
            if root != total:
                reject(
                    docs,
                    f"閘3 可渲染性 —— {total} 顆 emitter 只有 {root} 顆掛在模型根節點;"
                    "其餘掛在模型自己的動畫節點上,用世界座標重播會全部從同一點噴出("
                    "一團而不是一圈/一條龍捲)。⭐ 綁上去會讓辨識度**變差**,"
                    "⛔ 這不是「還沒收」",
                )
                continue
            # 閘 4a —— 文件真的出貨了
            missing = [d for d in docs if d not in shipped]
            if missing or not docs:
                reject(docs, f"閘4 出貨 —— 這一族有 {len(missing)} 份 emitter 文件不在 content/vfx/")
                continue
            if len(docs) > MAX_LAYERS:
                reject(docs, f"閘4 層數 —— 這一族有 {len(docs)} 顆 emitter,超過一支技能的層數硬上限 {MAX_LAYERS}")
                continue
            # 閘 4b —— 技能還活著
            if aid not in live:
                reject(docs, f"閘4 技能 —— 唯一引用它的技能 `{aid}` 已經不在 content/abilities/(英雄退休)")
                continue

            bindings.append(
                {
                    "abilityId": aid,
                    "vfxKeys": docs,
                    "source": f"{ex.get('provenance')}:{ex.get('channel')}",
                    "rawcode": rawcodes[0] if rawcodes else "",
                    "confidence": "CONFIRMED",
                }
            )

    # 一支技能可能有好幾條證據(caster + missile + buff)。取**第一條過閘的**,
    # 並把其餘那幾族記進 unmatched —— ⛔ 不是靜靜丟掉。
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in bindings:
        if row["abilityId"] in seen:
            reject(row["vfxKeys"], f"同一支技能 `{row['abilityId']}` 已經由更前面的一條證據綁定(一支技能只播一組)")
            continue
        seen.add(row["abilityId"])
        deduped.append(row)

    # ------------------------------------------------------------------
    # 證據源 B —— 落點的零售 stock emitter(#547 衝擊波)
    # ------------------------------------------------------------------
    # ⚠️ 跑在源 A **之後**、只補源 A 沒綁到的技能,是刻意的:地圖作者自己匯入的
    # 模型永遠比零售通用環更貼近那一支的身分。⭐ 這個順序同時讓既有的 27 列
    # **一位元都不動**,所以這一版的 diff 是純新增。
    stock_fams = _stock_families(shipped)
    # stem → 點名它但**不在落點通道**的技能(給 --report 印給 owner 勾的決策點)
    stock_offchannel: dict[str, list[str]] = {}
    # 有落點證據、但那一列**永遠不會生效**的技能(見下面的 `_shadowed`)
    stock_shadowed: list[str] = []
    for aid in sorted(abilities):
        if aid not in live or abilities[aid].get("joinConfidence") != "CONFIRMED":
            continue
        rec = abilities[aid]
        pick: tuple[dict, list[str]] | None = None
        for ch in LANDING_CHANNELS:
            for r in rec.get("realArt", []):
                if r.get("channel") != ch or r.get("provenance") not in INTENT_PROVENANCE:
                    continue
                docs = stock_fams.get(r.get("stem") or "")
                if not docs or len(docs) > MAX_LAYERS:
                    continue
                pick = (r, docs)
                break
            if pick:
                break
        if pick is None:
            for r in rec.get("realArt", []):
                if r.get("stem") in stock_fams and r.get("provenance") in INTENT_PROVENANCE:
                    stock_offchannel.setdefault(r["stem"], []).append(f"{aid}:{r.get('channel')}")
            continue
        if aid in seen:
            continue
        # ⭐ 源 B 專屬的一道閘:**這一列會不會真的生效**(第一·五守則)
        # ------------------------------------------------------------------
        # `resolveAbilityVfxSource()` 的階 1(技能文件自己寫了 `vfxLayers`)與
        # 階 2(自己挑了原作 doc)都排在表**前面**。被它們遮住的一列 = 一句
        # 「說了但不會發生」的宣稱:表上看得到、畫面上逐位元等於不存在。
        #
        # ⚠️ 為什麼這道閘**只給源 B**,⛔ 不給源 A:源 A 的證據是**地圖作者自己
        # 匯入的模型**,那是那一支技能的身分,即使今天被作者手挑的堆疊遮住,
        # 記下來仍然是有用的事實(出貨 27 列裡有 20 列正是這種)。源 B 是一個
        # **零售通用環**,它唯一的價值就是「原作在落點播了它」——遮住了就什麼都不剩。
        adoc = live[aid]
        if adoc.get("vfxLayers") or _is_original_art(adoc.get("vfxKey")):
            stock_shadowed.append(aid)
            continue
        r, docs = pick
        seen.add(aid)
        rawcodes = tuple(rec.get("rawcodes") or ())
        deduped.append(
            {
                "abilityId": aid,
                "vfxKeys": docs,
                "source": f"{r['provenance']}:{r['channel']}",
                "rawcode": rawcodes[0] if rawcodes else "",
                "confidence": "CONFIRMED",
            }
        )

    bound_docs = {d for r in deduped for d in r["vfxKeys"]}

    # 剩下的 fx.w3x.* —— 連一條技能證據都沒有碰過
    for doc_id in sorted(shipped):
        if not doc_id.startswith("fx.w3x."):
            continue
        if doc_id in bound_docs or doc_id in rejected:
            continue
        stock_stem = STOCK_DOC_RE.match(doc_id)
        if stock_stem:
            off = sorted(stock_offchannel.get(stock_stem.group("stem"), []))
            rejected[doc_id] = (
                f"零售 MPQ 抽出來的 `{stock_stem.group('stem')}`,但**沒有任何**活著且 CONFIRMED 的技能"
                f"在落點通道({' / '.join(LANDING_CHANNELS)})點名它。"
                + (
                    f"⚠️ 有 {len(off)} 支在**身上**的通道點名它({', '.join(off[:6])}"
                    + ("…" if len(off) > 6 else "")
                    + ");⛔ 那不是落點,接成技能主特效會讓這幾支英雄的招式在畫面上變成同一個環 ——"
                    "⭐ 那是一個決策點,該是後台一格開關,⛔ 不是這張表的預設"
                    if off
                    else ""
                )
            )
            continue
        stem = None
        for s, m in models.items():
            if doc_id in (m.get("layerDocIds") or []):
                stem = s
                break
        if stem is None:
            rejected[doc_id] = "⚠️ 這份 emitter 文件在 `models` 裡找不到來源模型 —— 它是別條產生鏈(例:extract_stock_vfx.py 的零售 MPQ 抽取)的產物,不歸這張表管"
        else:
            rejected[doc_id] = f"原作地圖裡**沒有任何技能**引用模型 `{stem}`(models.referencedBy 是空的)—— 它掛在單位/道具/裝飾物上,或整個沒被用到"

    # ⚠️ 「這張表沒綁它」≠「沒有人在用它」。把**其他**已知路徑標出來,否則
    # `unmatched` 會被讀成一張孤兒清單,而那個結論是錯的(例:FireRingFx 直接
    # 點名 4 份 flamessmoke、`fx.w3x.stock.*` 走家族原型規則)。
    otherwise_used = _reached_by_other_paths(live)
    unmatched = [
        {
            "vfxKey": d,
            "why": ("⚠️ 已由其他路徑使用(" + otherwise_used[d] + ")—— " if d in otherwise_used else "")
            + rejected[d],
        }
        for d in sorted(rejected)
        if d.startswith("fx.w3x.") and d not in bound_docs
    ]

    if notes is not None:
        notes["stockOffChannel"] = {k: sorted(v) for k, v in sorted(stock_offchannel.items())}
        notes["stockShadowed"] = sorted(stock_shadowed)

    return {
        "id": DOC_ID,
        "schema": SCHEMA_TAG,
        "bindings": sorted(deduped, key=lambda r: r["abilityId"]),
        "unmatched": unmatched,
    }


def _serialize(doc: dict[str, Any]) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


def _projectile_drift(bound: dict[str, str]) -> list[str]:
    """
    出貨的 `content/projectiles/*.json` 有沒有比證據舊。**兩個方向都關**:

    · 推導得出來、文件沒有(或不一樣) → 那顆子彈還在播通用原型
    · 文件上掛著**原作藝術**、推導卻不承認 → 值活得比它的證據久
      (⛔ 第〇·四守則的失敗形態:沒有人會發現它已經是謊話)
    """
    out: list[str] = []
    for pid, doc in sorted(_projectile_docs().items()):
        have = doc.get("vfxKey")
        want = bound.get(pid)
        if want and have != want:
            out.append(f"{pid}.vfxKey = {have!r},證據說它該是 {want!r}")
        elif not want and _is_original_art(have):
            out.append(
                f"{pid}.vfxKey = {have!r} 是原作藝術,但推導**不承認**它 —— "
                "證據變了(換人射它 / 技能退休 / emitter 被砍),這一格已經沒有來源"
            )
    return out


def _write_projectiles(bound: dict[str, str]) -> list[str]:
    """把推導出來的飛彈美術寫進 `projectile@1.vfxKey`。⛔ 只碰有變動的那幾份。"""
    written: list[str] = []
    for pid, key in sorted(bound.items()):
        path = os.path.join(PROJECTILE_DIR, f"{pid}.json")
        doc = _load_json(path)
        if doc.get("vfxKey") == key:
            continue
        doc["vfxKey"] = key
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")
        written.append(pid)
    return written


def crosscheck(doc: dict[str, Any]) -> list[str]:
    """對帳 `config.vfx-ability-art@1.bindings.<id>.promoted`。回傳一串問題。"""
    if not os.path.exists(ABILITY_ART):
        return ["⚠️ 找不到 content/config/vfx-ability-art.json —— 跳過跨表對帳"]
    art = _load_json(ABILITY_ART).get("bindings", {})
    live = set(_live_abilities())
    promoted = {
        aid: {row["promoted"]["primary"], *row["promoted"]["extra"]}
        for aid, row in art.items()
        if isinstance(row, dict) and row.get("promoted")
    }
    derived = {r["abilityId"]: set(r["vfxKeys"]) for r in doc["bindings"]}

    problems: list[str] = []
    for aid in sorted(set(derived) - set(promoted)):
        problems.append(f"MISSING   {aid} —— 證據過了四道閘,但 vfx-ability-art.json 沒有 promoted 列 ⇒ 這支技能拿不到原作藝術")
    for aid in sorted(set(promoted) - live):
        problems.append(f"DEAD      {aid} —— vfx-ability-art.json 有 promoted 列,但這支技能不在 content/abilities/ ⇒ 空宣稱(第一·五守則)")
    for aid in sorted((set(promoted) & live) - set(derived)):
        problems.append(
            f"EXTRA     {aid} —— promoted 有、推導沒有 ⇒ 人工裁決(閘 1/3 沒過但有人看過證據)。"
            "⛔ 這不是缺陷,列出來只是為了「沒有一列是無人知曉的」"
        )
    for aid in sorted(set(derived) & set(promoted)):
        if derived[aid] != promoted[aid]:
            only_d = sorted(derived[aid] - promoted[aid])
            only_p = sorted(promoted[aid] - derived[aid])
            problems.append(f"SET-DRIFT {aid} —— 推導多了 {only_d}、promoted 多了 {only_p}")
    return problems


# ---------------------------------------------------------------------------
# ⭐ GH#818 —— `--strict` 的**棘輪**：還在等人審的 `promoted` 列
# ---------------------------------------------------------------------------
# 這一段的存在理由是 CLAUDE.md 元規則⑨:**一個永遠不會綠的閘等於沒有閘**。
#
# 「補完就把 `vfxbind:check` 改成 `--check --strict`」是這張票的收口動作,而
# 「補完」那一半是 **HITL**(哪一張圖層是這支技能的主體是視覺判斷,#529 逐字寫著
# 「接錯比不接糟」)—— 它不會在這一條 lane 裡發生。⇒ 兩條路都是錯的:
#
#   · 直接翻 `--strict`  ⇒ `skills:check` 在**每一次正確的 checkout 上**都紅,
#                          而且它擋住的是**每一條** lane(⑨ 那個 `>= 600` 的形狀)
#   · 留著不翻          ⇒ 第 35 列漏掉的那一天,⛔ 沒有任何東西會紅
#
# ⇒ 棘輪:下面這一批**已知在等 HITL** 的列不擋,⛔ 其餘一律擋。所以
#   ① 新出現的 MISSING(第 35 支) ⇒ 紅  ② DEAD / SET-DRIFT ⇒ 紅
#   ③ 這張表上**已經不缺**的那一列 ⇒ 紅(⭐ 棘輪只能變短 —— 逼人把它劃掉)
#
# ⚠️ 它**不是**一張豁免表:每一列都會在 `--check` 的輸出裡逐支列名(MISSING),
# 只是不回非零。名單清空的那一天,這個常數與這段註解一起刪掉。
# 量到(2026-08-29,`python3 tools/vfx-bind/scan.py --check`):34 列。
# 逃生口 `GGD_VFXBIND_STRICT_OFF=1`(⛔ 用了要在 commit 訊息裡說為什麼)。
HITL_PENDING_PROMOTED = frozenset(
    {
        # ⭐⭐ 2026-09-02（GH#699 / GH#753）—— **第 35 支，而它是新證據帶出來的**。
        #
        # ⚠️ 那一輪把 stock 的 PRE2 從 17 份補到 37 份、RIBB 從 0 補到 11 份
        # ⇒ ⭐ 這支技能的證據**這一天才過四道閘**，⛔ 它不是漏掉的舊債。
        # ⛔ 而「哪一張圖層是這支技能的主體」是**視覺判斷**（#529 逐字：
        # 「接錯比不接糟」）⇒ ⭐ 我不替它決定，登記進佇列等 HITL。
        # ⭐ 到期條件：批核頁上有人勾了它 ⇒ 補 `vfx-ability-art.json` 的 promoted 列
        # 並把這一行刪掉（棘輪只能變短）。
        "godie-e008.ex",
        "godie-e002.w",
        "godie-e00l.w",
        "godie-e00w.passive",
        "godie-e00x.passive",
        "godie-h01n.e",
        "godie-h01o.e",
        "godie-h020.e",
        "godie-hapm.ex",
        "godie-hapm.w",
        "godie-hart.w",
        "godie-hjai.e",
        "godie-hpb1.e",
        "godie-huth.r",
        "godie-hvsh.r",
        "godie-hvwd.ex",
        "godie-n01c.r",
        "godie-nbbc.r",
        "godie-o00x.e",
        "godie-ogrh.e",
        "godie-osam.ex",
        "godie-u00h.r",
        "godie-u00j.w",
        "godie-u00n.q",
        "godie-u00n.w",
        "godie-u00o.q",
        "godie-u00o.w",
        "godie-u00v.w",
        "godie-u010.e",
        "godie-u01u.r",
        "godie-u034.passive",
        "godie-ucrl.passive",
        "godie-udea.w",
        "godie-udre.r",
        "godie-uvng.e",
    }
)


def strict_failures(problems: list[str]) -> list[str]:
    """`--strict` 真的要回非零的那幾筆 —— 棘輪過濾之後的。

    ⭐ 兩個方向都走(元規則⑫):既問「哪一筆問題不在名單上」,也問
    「名單上哪一筆已經不是問題了」。⛔ 只走前者的話,名單會變成一張永遠不變短
    的豁免表,而那正是它要防的東西。
    """
    out: list[str] = []
    still_pending: set[str] = set()
    for p in problems:
        if p.startswith("⚠️"):
            continue
        kind, _, rest = p.partition(" ")
        aid = rest.split()[0] if rest.split() else ""
        if kind == "EXTRA":
            continue
        if kind == "MISSING" and aid in HITL_PENDING_PROMOTED:
            still_pending.add(aid)
            continue
        out.append(p)
    for aid in sorted(HITL_PENDING_PROMOTED - still_pending):
        out.append(
            f"RATCHET   {aid} —— 已經不缺了(補上了、或這支技能退休了),"
            "⛔ 把它從 scan.py 的 HITL_PENDING_PROMOTED 劃掉(棘輪只能變短)"
        )
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="從原作證據推導技能→原作特效綁定表")
    ap.add_argument("--check", action="store_true", help="唯讀:逐位元組比對 + 跨表對帳")
    ap.add_argument("--report", action="store_true", help="只印摘要,不寫檔")
    ap.add_argument(
        "--strict",
        action="store_true",
        help="讓跨表對帳的 MISSING/DEAD/SET-DRIFT 也回非零。"
        "⭐ GH#818 起 `skills:check` 就是跑 `--check --strict` —— 還在等 HITL 的那幾列"
        "住 HITL_PENDING_PROMOTED(棘輪,只能變短),⛔ 其餘一律擋。"
        "逃生口 GGD_VFXBIND_STRICT_OFF=1(只警告不擋)",
    )
    args = ap.parse_args()

    notes: dict[str, Any] = {}
    doc = derive(notes)
    text = _serialize(doc)
    problems = crosscheck(doc)
    proj_bound, proj_why = derive_projectiles()

    if args.report or args.check:
        print(f"綁定 {len(doc['bindings'])} 支技能 / 未綁 {len(doc['unmatched'])} 份 fx.w3x.* emitter 文件")
        print(f"投射物 {len(proj_bound)} 顆接上原作飛彈 / {len(proj_why)} 顆沒接(每一顆都帶理由)")
        for p in problems:
            print("  " + p)

    if args.report:
        for pid, key in sorted(proj_bound.items()):
            print(f"  PROJ  {pid} → {key}")
        for row in proj_why:
            print(f"  ----  {row['projectileId']} —— {row['why']}")
        # ⭐ 決策點,⛔ 不是缺陷:落點以外的通道點名了 stock emitter 的那幾支。
        # 出貨的預設是**不接**(理由見檔頭)。要接就是後台一格開關,由 owner 決定。
        for stem, rows in (notes.get("stockOffChannel") or {}).items():
            print(f"  DECIDE {stem} —— {len(rows)} 支在非落點通道點名它:{', '.join(rows)}")
        for aid in notes.get("stockShadowed") or []:
            print(f"  SHADOW {aid} —— 有落點證據,但技能文件自己寫了 vfxLayers / 原作 vfxKey ⇒ 這一列永遠不會生效,⛔ 不收")
        # ⭐ #547 的採購清單 —— 「一堆攻擊投射物都沒移植」量出來是**內容**的洞,
        # ⛔ 不是綁定的洞。READY = 資產在 repo,缺的只是投射物文件;
        # EXTRACT = 先跑 `tools/w3x-import/extract_stock_vfx.py` 收這個 stem。
        want = missile_wantlist()
        if want:
            n = sum(len(r["abilities"]) for r in want)
            print(
                f"  ---- #547 採購清單:{n} 支活著的技能在原作裡射一發飛彈,"
                f"但在 GGD 裡**整個投射物都不存在**({len(want)} 個模型 stem)"
            )
            for r in want:
                print(
                    f"  WANT  [{r['need']:7s}] {r['stem']:26s} {len(r['abilities']):2d} 支 "
                    f"({r['assetStatus']}) 例:{', '.join(r['abilities'][:4])}"
                )

    if args.check:
        if not os.path.exists(OUT):
            print(f"⛔ {OUT} 不存在 —— 跑一次 `python3 tools/vfx-bind/scan.py`", file=sys.stderr)
            return 1
        with open(OUT, "r", encoding="utf-8") as fh:
            have = fh.read()
        fatal = strict_failures(problems) if args.strict else []
        if fatal and os.environ.get("GGD_VFXBIND_STRICT_OFF") == "1":
            # fail-open 沒錯,**靜默**才是缺陷 —— 所以它照樣把每一筆印出來。
            print("⚠️ GGD_VFXBIND_STRICT_OFF=1 —— --strict 這一輪只警告不擋:", file=sys.stderr)
            for p in fatal:
                print("   " + p, file=sys.stderr)
            fatal = []
        if fatal:
            # ⭐ 一次撈全部,⛔ 不是「跑一次→修一筆→再跑一次」(第零守則)。
            print(f"⛔ 跨表對帳有 {len(fatal)} 筆問題(--strict)", file=sys.stderr)
            for p in fatal:
                print("   " + p, file=sys.stderr)
            return 1
        if have != text:
            print(
                f"⛔ {os.path.relpath(OUT, REPO)} 過期了 —— 跑 `python3 tools/vfx-bind/scan.py` 然後 git add",
                file=sys.stderr,
            )
            return 1
        drift = _projectile_drift(proj_bound)
        if drift:
            for d in drift:
                print("⛔ " + d, file=sys.stderr)
            print(
                "⛔ content/projectiles/ 過期了 —— 跑 `python3 tools/vfx-bind/scan.py` 然後 git add",
                file=sys.stderr,
            )
            return 1
        print("✅ 綁定表與證據一致")
        return 0

    if args.report:
        return 0

    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(text)
    print(f"寫入 {os.path.relpath(OUT, REPO)}")
    for pid in _write_projectiles(proj_bound):
        print(f"寫入 content/projectiles/{pid}.json(vfxKey ← {proj_bound[pid]})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

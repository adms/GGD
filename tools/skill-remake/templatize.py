#!/usr/bin/env python3
"""
🧱 templatize —— 把手寫的 `effects[]` 換成 `{"template":{"ref","params"}}`（GH#993 Scope 3）。

> owner 2026-08-05：「我**最推崇的方案[模板化/模組化]**　不是到處改改改」

⭐ 這一支是**正規化器**，⛔ 不是產生器：它只在「一支手寫技能與某一份模板展開出來的
東西**逐位元相同**」的時候動那一份文件；差一格參數就**不轉**，並把差在哪裡印出來。

── ⭐ 三條它自己守的規矩 ─────────────────────────────────────────────────────
① **先驗鑰匙再同步**（第〇·六守則：`h02u` 的 W/E 互換被同步器放大成整支技能消失）：
   每一份文件的 `id` 要等於檔名、全樹唯一；`name` 前綴的 JASS 編號（`xx-01`→Q …
   `xx-00`→PASSIVE · `xx-002`→EX）要與 `slot` 一致、同一隻英雄的編號不可重複。
   驗不過的那一格 **⛔ 不轉，指名它**。
② **產物不動**（第零守則「改產物等於沒改」）：`skillremake:json` 認領的那 90 份
   （`tools/parallel-gates/sync-io.json` 的 writes，⛔ 不是手寫名單）一律跳過 ——
   要轉它們得改 `tools/skill-remake/batch1.py` 的來源列。
③ **只轉逐位元等價的**：每一族的比對規則寫在 `MATCHERS`，它們是**提案**；
   真正的裁判是 `packages/shared/src/content/templatizeEquivalence.test.ts` ——
   它拿**出貨的** `expand()` ＋ `mergeExpansion()` ＋ `zAbilityDoc` 把每一支重新展開，
   與帳本裡的「轉換前」逐位元比對。⚠️ 所以這裡的 Python 比對**不是**第二份展開器：
   它只負責「要不要提案」，答對答錯都由 TS 那一邊定案。
④ **變身對子一起轉**（`abilityCodeParity.test.ts`：同編號＝同一支技能＝同樣的機制欄位，
   `effects` 與 `template` 都算）：提案之後照那條守衛的算法再算一次「轉了之後這一組同編號
   會不會冒出**新的**漂移鍵」—— 會 ⇒ ⛔ 不轉並指名另一半是為什麼沒轉（產物／差一格／
   不在 --only）。⚠️ 第二波就是這樣被還原了 12 支：一邊轉、一邊沒轉 ⇒ 守衛紅 ⇒ 整批退回。
   轉了會**修好**既有漂移的（baseline 要跟著拿掉那一列）預設也不轉，`--allow-parity-fix` 才轉。
⑤ **還沒落地的模板也讀得懂**：五個已開票的家族（#1066 `status` 槽 · #1069 tpl-blink ·
   #1071 tpl-apply-status · #1072 tpl-heal · #1073 leechFlat optional）的比對器已經在
   `MATCHERS` 裡，⭐ 各自問「模板檔／那一格槽今天在不在」——不在就把技能放進
   「沒有模板／差一格」桶並印出票號，⛔ 不提案；模板落地的那一刻 `--apply` 就收得下。
   用 `--templates-dir <dir>` 拿一份提案中的模板目錄 dry-run，可以先看提案會長什麼樣。

── 帳本 ──────────────────────────────────────────────────────────────────────
`tools/skill-remake/templatize-ledger.json`：每一支被轉的技能記 `ref` / `params` /
`before`（轉換前的行為欄位：castType / effects / radius / range / castTimeSec /
targetsEnemies / innateKind / passive / marks）。它是**等價閘的證據**，
也是 `--revert` 的退路（第零守則：覆蓋之前先留一份）。

用法：
  python3 tools/skill-remake/templatize.py                 # dry-run：只印計畫
  python3 tools/skill-remake/templatize.py --apply         # 寫檔 ＋ 更新帳本
  python3 tools/skill-remake/templatize.py --apply --only godie-e00n.ex,godie-e00n.q
  python3 tools/skill-remake/templatize.py --exclude godie-o02w.q,…   # 別條 lane 的檔
  python3 tools/skill-remake/templatize.py --revert godie-e00n.ex      # 從帳本還原
  python3 tools/skill-remake/templatize.py --templates-dir /tmp/x     # 拿提案中的模板 dry-run（⛔ 不能配 --apply）
  python3 tools/skill-remake/templatize.py --allow-parity-fix          # 也轉「會修好既有漂移」的那幾支（baseline 要跟著改）
  python3 tools/skill-remake/templatize.py --include-skeleton          # 連 sela.*／thorne.*（fail-open 骨架的孿生）也提案
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ABIL_DIR = os.path.join(ROOT, "content", "abilities")
TPL_DIR = os.path.join(ROOT, "content", "ability-templates")
SYNC_IO = os.path.join(ROOT, "tools", "parallel-gates", "sync-io.json")
LEDGER_DEFAULT = os.path.join(ROOT, "tools", "skill-remake", "templatize-ledger.json")

#: 與 `templates/expand.ts` 的 `GGD_PER_WC3 = 11 / 600` 同一個常數（⛔ 這裡不抄第二個值）。
GGD_PER_WC3 = 11 / 600

#: 帳本記下的行為欄位 ＝ `expand.ts` 的 `SHAPE_KEYS`（castType／effects／radius：展開沒發就沒有）
#: ＋ `COMPOSABLE_KEYS`（castTimeSec／targetsEnemies／innateKind／passive／marks／range：展開沒發 ⇒
#: 文件的值站著）—— #1065 之後這六格**不再被 merge 抹掉**，所以帶 innateKind／passive／marks 的文件也轉得了。
BEHAVIOUR_KEYS = (
    "castType",
    "effects",
    "radius",
    "range",
    "castTimeSec",
    "targetsEnemies",
    "innateKind",
    "passive",
    "marks",
)

#: ⭐ #1066 落地：`proxy-fanout` 的 `CC_MECHANIC` 三列下拉表**退場**了（expand.ts 同一個 commit 刪）——
#:    那一族現在讀一整個 `status` 節點（`_has_status_slot`），任何機制欄位都收得下。⛔ 這裡不留第二份。

#: `proxy-cast` 的狀態下拉 → 節點上的機制欄位（`expand.ts` proxy-cast 分支的 `SLOW` 表 ＋ root/burnstun）。
#: ⭐ 它比 proxy-fanout 寬（多 slow25/slow40），而 #993 第一輪把 slow40 那 3 支判成「差一格」——
#:   ⛔ 那一輪只問了 proxy-fanout，沒問 proxy-cast（第一守則：「我查的那條路上沒有」≠「它不存在」）。
PROXY_CAST_STATUS = {
    "burnstun": {"stun": True},
    "root": {"root": True},
    "slow25": {"moveSpeedMult": 0.75},
    "slow30": {"moveSpeedMult": 0.7},
    "slow40": {"moveSpeedMult": 0.6},
}

#: fail-open 骨架的孿生 —— `sim/content/skeleton.ts` 逐字說它們的值要與 content 對齊、
#: `loader.test.ts` 是那條 drift 守衛。預設跳過，`--include-skeleton` 才提案（留給主 session 決定）。
SKELETON_PREFIXES = ("sela.", "thorne.")

#: 「沒有模板發這個形狀」的形狀 → 已開票的模板。⭐ 讓那一桶讀得出**在等哪一張票**，
#: ⛔ 而不是一句「沒有」——下一輪（context 斷掉後）讀到桶名就知道去哪裡接。
#: ⭐ 2026-09-06 晚落地的（從這張表刪掉）：blink（#1069）· applyStatus（#1071）· heal（#1072）·
#:    damage + dot（#1073 leechFlat optional）· applyStatus + damage（#1066 `status` 槽）·
#:    damage + spawnProjectile／applyStatus + damage + spawnProjectile（#1068 tpl-projectile-strike）。
PLANNED_SHAPES = {
    "applyBuff + championForm": "#1067 變身家族（applyBuff＋championForm；變身對子的另一半多半卡在這裡）",
    "championForm": "#1067 變身家族",
}

#: 與 `abilityCodeParity.ts` 的 `COSMETIC_FIELDS` 同一張表。⚠️ 這裡是**提案過濾器**，⛔ 不是第二份規格：
#: TS 那邊多列一格（新的表演欄位）只會讓這裡多擋（安全方向）；少列一格由 TS 守衛自己抓。
COSMETIC_FIELDS = {
    "id", "icon", "name", "description", "vfxKey", "vfxLayers", "sfxKey", "hitFeel",
    "provenance", "schema", "authoringNote", "slot",
}

#: #1069 那 7 支逐位元相同的節點（`tpl-blink` 展開出來的就是它，⛔ 沒有第二種形狀）。
BLINK_POINT = {"kind": "blink", "shape": "single", "to": "point", "applyTo": "self"}

DAMAGE_TYPES = ("magic", "physical", "true")

#: JASS 編號的尾碼 → slot（記憶 `ggd-ability-numbering`：xx-00 天生 / xx-01..04 QWER / xx-002 EX）。
NUMBER_TO_SLOT = {"00": "PASSIVE", "01": "Q", "02": "W", "03": "E", "04": "R", "002": "EX"}
NAME_RE = re.compile(r"^(\d{2})-(\d{2,3})\s")


def round2_js(x: float) -> float:
    """JS 的 `Math.round(x * 100) / 100`（半數**往上**，⛔ 不是 Python 的銀行家捨入）。"""
    return math.floor(x * 100 + 0.5) / 100


def to_wc3u(ggd: float) -> float | None:
    """GGD 長度 → 模板 `wc3u` 槽的值；⭐ 只在 `toLen()` 能**逐位元**回到同一個 GGD 值時才回傳。"""
    cand = round2_js(ggd / GGD_PER_WC3)
    return cand if round2_js(cand * GGD_PER_WC3) == ggd else None


def load_json(path: str):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def dump_json(path: str, doc) -> None:
    # ⭐ 與 repo 裡既有文件逐位元同一種排版（indent=2、非 ASCII 原樣、結尾換行）——
    #   實測三份文件 round-trip 逐位元相同，所以 diff 只會出現在真的改了的那幾行。
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")


# ── 產物與模板 ────────────────────────────────────────────────────────────────


def product_ids() -> set[str]:
    """`skillremake:json` 認領的技能 id —— 從量出來的 sync-io.json 讀，⛔ 不手寫名單。"""
    out: set[str] = set()
    for step in load_json(SYNC_IO)["steps"]:
        if (step.get("name") or step.get("id")) != "skillremake:json":
            continue
        for w in step.get("writes", []):
            if w.startswith("content/abilities/") and not w.endswith("_index.json"):
                out.add(os.path.basename(w)[:-5])
    return out


def templates(tpl_dir: str = TPL_DIR) -> dict[str, dict]:
    out = {}
    for f in sorted(os.listdir(tpl_dir)):
        if f.endswith(".json") and not f.startswith("_"):
            out[f[:-5]] = load_json(os.path.join(tpl_dir, f))
    return out


def slot_ok(tpl: dict, name: str, value) -> bool:
    """`num()` 的範圍檢查（min/max）—— 超界的提案在 TS 那邊一定展不開，⛔ 不要提。"""
    s = tpl["params"].get(name)
    if s is None:
        return False
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if s.get("min") is not None and value < s["min"]:
            return False
        if s.get("max") is not None and value > s["max"]:
            return False
    if s.get("type") == "enum" and value not in s.get("values", []):
        return False
    return True


# ── 鑰匙 ──────────────────────────────────────────────────────────────────────


def verify_keys(docs: dict[str, dict]) -> tuple[dict[str, str], dict[str, str]]:
    """
    回傳 (bad, notes)：`bad` = {id: 為什麼這把鑰匙不可信}（⛔ 擋）；`notes` = 槽位≠編號（ℹ️ 不擋）。

    ⭐ 鑰匙是「**編號 ↔ 技能**」（記憶 `ggd-naming-layer`：`92-02` 永遠是消化液），
    ⛔ 不是「編號 ↔ 槽位」—— owner 2026-07-30 把**技能↔槽位**裁成設計偏好（做成欄位）。
    ⇒ 同一隻英雄兩格同號 / id≠檔名 / 尾碼不合法 才是鑰匙壞掉；
       槽位與編號不一致只印出來（h02u 那次的教訓是「同步器照 key 覆蓋」，而這一支不做跨檔覆蓋）。
    """
    bad: dict[str, str] = {}
    notes: dict[str, str] = {}
    seen_numbers: dict[str, dict[str, str]] = defaultdict(dict)  # hero → number → id
    for stem, doc in docs.items():
        aid = doc.get("id")
        if aid != stem:
            bad[stem] = f"id「{aid}」≠ 檔名「{stem}」"
            continue
        m = NAME_RE.match(str(doc.get("name", "")))
        if not m:
            continue  # 沒有 JASS 編號的（sela/thorne/zombie…）不在這條鑰匙的範圍
        hero, num = m.group(1), m.group(2)
        want = NUMBER_TO_SLOT.get(num)
        if want is None:
            bad[stem] = f"編號尾碼「{num}」不是 00/01–04/002"
            continue
        if doc.get("slot") != want:
            notes[stem] = f"編號 {hero}-{num} 慣例是 {want}，文件 slot 是 {doc.get('slot')}（設計偏好，⛔ 不擋）"
        champ = stem.rsplit(".", 1)[0]
        other = seen_numbers[champ].get(num)
        if other is not None:
            bad[stem] = f"同一隻英雄兩格都是 {hero}-{num}（另一格 {other}）"
            bad[other] = f"同一隻英雄兩格都是 {hero}-{num}（另一格 {stem}）"
        seen_numbers[champ][num] = stem
    return bad, notes


# ── 比對器（提案；⛔ 不是展開器）─────────────────────────────────────────────


def _keys_exactly(node: dict, keys: set[str]) -> bool:
    return set(node.keys()) == keys


def _damage_node(n) -> bool:
    return (
        isinstance(n, dict)
        and n.get("kind") == "damage"
        and _keys_exactly(n, {"kind", "damageType", "amount"})
        and n.get("damageType") in DAMAGE_TYPES
        and isinstance(n.get("amount"), dict)
    )


def _common_reject(doc: dict, emits_targets) -> str | None:
    """
    每一族都適用的「差一格就不轉」。`emits_targets`：這一族展開出來的 targetsEnemies（None = 不發）。

    ⭐ #1065 之後 `innateKind`／`passive`／`marks`／`targetsEnemies` 是**可組合鍵**（`expand.ts` 的
    `COMPOSABLE_KEYS`）：展開沒發 ⇒ 文件的值站著，⛔ 不再被 merge 抹掉；`refineInnate` 對帶 `template`
    的骨架也放行 `effects:[]`。⇒ 在此之前這裡擋掉的 15 支（PASSIVE＋innateKind:active 12 · effects＋passive
    並存 3）現在轉得了 —— 只剩「這一族**發**了 targetsEnemies，而文件的值不同」那一條該擋。
    """
    have = doc.get("targetsEnemies")
    if emits_targets is not None and have is not emits_targets:
        return f"targetsEnemies 文件 {json.dumps(have)} ≠ 這一族發的 {json.dumps(emits_targets)}"
    return None


def _cast_time(tpl: dict, doc: dict, params: dict) -> str | None:
    """`castTimeSec`：沿用出貨 71/79 位採用者的慣例（文件與 params 同一個值）。超過槽上界就不轉。"""
    if "castTimeSec" not in doc:
        return None
    v = doc["castTimeSec"]
    if not slot_ok(tpl, "castTimeSec", v):
        return f"castTimeSec {v} 超出槽的範圍"
    params["castTimeSec"] = v
    return None


def m_buff_self(tpl: dict, doc: dict):
    if doc.get("castType") != "self":
        return None, None
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "applyBuff":
        return None, None
    n = eff[0]
    if not _keys_exactly(n, {"kind", "modifiers", "duration"}):
        return None, f"applyBuff 多了鍵：{sorted(set(n) - {'kind', 'modifiers', 'duration'})}"
    if not isinstance(n["modifiers"], list) or not slot_ok(tpl, "duration", n["duration"]):
        return None, f"duration {n['duration']} 超出槽的範圍"
    if "radius" in doc:
        return None, "文件層有 radius：merge 會刪掉"
    r = _common_reject(doc, None)
    if r:
        return None, r
    params = {"duration": n["duration"], "modifiers": n["modifiers"]}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def _single_damage(doc: dict):
    eff = doc.get("effects") or []
    if len(eff) != 1 or not _damage_node(eff[0]):
        return None
    return eff[0]


def _damage_and_status(doc: dict):
    """`[damage]` 或 `[damage, applyStatus]`（順序不拘）→ (damage, applyStatus|None)；別的形狀 → None。"""
    eff = doc.get("effects") or []
    dmg = next((n for n in eff if isinstance(n, dict) and n.get("kind") == "damage"), None)
    st = next((n for n in eff if isinstance(n, dict) and n.get("kind") == "applyStatus"), None)
    if dmg is None or len(eff) != 1 + (1 if st is not None else 0):
        return None
    return dmg, st


def _has_node_slot(tpl: dict, name: str, ptype: str) -> bool:
    """
    一格「整個效果節點」的參數：`params.<name>.type == <ptype>`。
    值＝節點本身去掉 `kind`，展開器（`expand.ts` 的 `effectNode()`）用**那個 kind 自己的
    schema** 驗（zApplyStatus / zDot / zSpawnVfx）—— ⛔ 這裡不重抄一份欄位表。
    """
    return tpl["params"].get(name, {}).get("type") == ptype


def _has_status_slot(tpl: dict) -> bool:
    """#1066 的那一格：`params.status` 是 `type:"applyStatus"`。"""
    return _has_node_slot(tpl, "status", "applyStatus")


def _status_param(node: dict) -> dict:
    """效果節點 → 槽的值：同一個節點去掉 `kind`（⛔ 不重排、不改任何一格）。"""
    return {k: v for k, v in node.items() if k != "kind"}


def m_single_strike(tpl: dict, doc: dict):
    if doc.get("castType") != "targeted":
        return None, None
    pair = _damage_and_status(doc)
    if pair is None:
        return None, None
    d, st = pair
    if not _damage_node(d):
        return None, "damage 節點多了鍵"
    if st is not None and not _has_status_slot(tpl):
        # ⭐ #1066：這一族今天只發 damage。那一格落地之前 22 支「打一下＋上狀態」都停在這裡。
        return None, "tpl-single-strike 還沒有 `status` 槽（#1066：一格 type:applyStatus 的 optional 參數）"
    if "radius" in doc:
        return None, "targeted 卻有 radius：merge 會刪掉"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {"damage": d["amount"], "damageType": d["damageType"]}
    if st is not None:
        params["status"] = _status_param(st)
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_instant_blast(tpl: dict, doc: dict):
    if doc.get("castType") != "ground" or "radius" not in doc:
        return None, None
    d = _single_damage(doc)
    if d is None:
        return None, None
    wc3 = to_wc3u(doc["radius"])
    if wc3 is None or not slot_ok(tpl, "radius", wc3):
        return None, f"radius {doc['radius']} 換不回同一個 wc3u（或超出槽的範圍）"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {"radius": wc3, "damage": d["amount"], "damageType": d["damageType"]}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def _enum_status(tpl: dict, st: dict, table: dict, family: str):
    """狀態**下拉**那一族（proxy-fanout 的 CC_MECHANIC／proxy-cast 的 SLOW 表）：節點要逐位元等於下拉展開出來的。"""
    sid = st.get("statusId")
    mech = table.get(sid)
    if mech is None:
        return None, f"statusId「{sid}」不在 {family} 的下拉（{'/'.join(table)}）"
    want = {"kind": "applyStatus", "statusId": sid, "duration": st.get("duration"), **mech}
    if st != want:
        return None, f"applyStatus 節點 ≠ 這一族發的 {json.dumps(want, ensure_ascii=False)}"
    if not slot_ok(tpl, "statusId", sid):
        return None, f"statusId「{sid}」不在模板 statusId 槽的 values 裡"
    if not slot_ok(tpl, "statusDurationSec", st["duration"]):
        return None, f"狀態時長 {st['duration']} 超出槽的範圍"
    return {"statusId": sid, "statusDurationSec": st["duration"]}, None


def m_proxy_fanout(tpl: dict, doc: dict):
    if doc.get("castType") != "ground" or "radius" not in doc:
        return None, None
    pair = _damage_and_status(doc)
    if pair is None or pair[1] is None:
        return None, None
    dmg, st = pair
    if not _damage_node(dmg):
        return None, "damage 節點多了鍵"
    if not _has_status_slot(tpl):
        return None, "模板沒有 type:applyStatus 的 `status` 槽（#1066 之後 proxy-fanout 讀的是一整個節點）"
    # ⭐ #1066：`statusId`＋`statusDurationSec` 收斂成一格 `status`（機制欄位住在節點上，任何 id 都收得下）。
    status_params = {"status": _status_param(st)}
    wc3 = to_wc3u(doc["radius"])
    if wc3 is None or not slot_ok(tpl, "radius", wc3):
        return None, f"radius {doc['radius']} 換不回同一個 wc3u（或超出槽的範圍）"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {"radius": wc3, "damage": dmg["amount"], "damageType": dmg["damageType"], **status_params}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_proxy_cast(tpl: dict, doc: dict):
    """
    代理錨點施法（8 位採用者）：`[damage]` 或 `[damage, applyStatus]` ＋ **一定帶 radius**；
    `anchor` 由 castType 推回去（point↔ground · target↔targeted · self↔self）。
    ⭐ 這一族的狀態下拉有 slow25/slow40 —— #1066 族 B 那 3 支（slow40）今天就接得上，⛔ 不必等新槽。
    """
    if "radius" not in doc:
        return None, None
    anchor = {"ground": "point", "targeted": "target", "self": "self"}.get(doc.get("castType"))
    if anchor is None:
        return None, None
    pair = _damage_and_status(doc)
    if pair is None:
        return None, None
    dmg, st = pair
    if not _damage_node(dmg):
        return None, "damage 節點多了鍵"
    status_params: dict = {}
    if st is not None:
        status_params, why = _enum_status(tpl, st, PROXY_CAST_STATUS, "proxy-cast")
        if why:
            return None, why
    if not slot_ok(tpl, "anchor", anchor):
        return None, f"anchor {anchor} 不在槽的 values 裡"
    wc3 = to_wc3u(doc["radius"])
    if wc3 is None or not slot_ok(tpl, "radius", wc3):
        return None, f"radius {doc['radius']} 換不回同一個 wc3u（或超出槽的範圍）"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {"anchor": anchor, "radius": wc3, "damage": dmg["amount"], "damageType": dmg["damageType"], **status_params}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_blink_strike(tpl: dict, doc: dict):
    if doc.get("castType") != "targeted":
        return None, None
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "blink":
        return None, None
    b = eff[0]
    if not _keys_exactly(b, {"kind", "shape", "to", "applyTo", "stopShortUnits", "onArrive"}):
        return None, "blink 節點的鍵集合 ≠ 這一族發的"
    if b["shape"] != "single" or b["to"] != "targetUnit" or b["applyTo"] != "self":
        return None, "blink 不是 single/targetUnit/self"
    arr = b["onArrive"]
    if (
        not isinstance(arr, list)
        or len(arr) != 2
        or arr[0] != {"kind": "spawnVfx", "vfxId": arr[0].get("vfxId"), "at": "point"}
        or not _damage_node(arr[1])
    ):
        return None, "onArrive ≠ [spawnVfx@point, damage]"
    if "range" not in doc or not slot_ok(tpl, "range", doc["range"]):
        return None, "range 缺席或超出槽的範圍"
    if not slot_ok(tpl, "stopShortUnits", b["stopShortUnits"]):
        return None, "stopShortUnits 超出槽的範圍"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {
        "range": doc["range"],
        "stopShortUnits": b["stopShortUnits"],
        "damage": arr[1]["amount"],
        "damageType": arr[1]["damageType"],
        "arriveVfxId": arr[0]["vfxId"],
    }
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_drain_leech(tpl: dict, doc: dict):
    if doc.get("castType") != "targeted":
        return None, None
    eff = doc.get("effects") or []
    kinds = sorted(n.get("kind") for n in eff if isinstance(n, dict))
    if kinds == ["damage", "dot", "heal"]:
        heal = next(n for n in eff if n.get("kind") == "heal")
    elif kinds == ["damage", "dot"]:
        # ⭐ #1073：「打一下＋持續傷害」沒有吸血 —— 只有 `leechFlat` 是 optional 槽時展開才會沒有 heal 節點
        #    （`has()` 對 optional 槽：沒填＝缺席，default 只是編輯器的建議值）。
        heal = None
        if tpl["params"].get("leechFlat", {}).get("optional") is not True:
            return None, "沒有 heal 節點，而 `leechFlat` 是必填槽（展開永遠帶一個 heal）—— #1073：改成 optional"
    else:
        return None, None
    dmg = next(n for n in eff if n.get("kind") == "damage")
    dot = next(n for n in eff if n.get("kind") == "dot")
    amt = dmg.get("amount")
    if not _damage_node(dmg) or not isinstance(amt, dict):
        return None, "damage 節點多了鍵"
    ratios = amt.get("ratios")
    if set(amt) != {"damageTier", "ratios"} or not (
        isinstance(ratios, list) and len(ratios) == 1 and set(ratios[0]) == {"stat", "coeff"} and ratios[0]["stat"] == "ap"
    ):
        return None, "damage.amount 不是 {damageTier, ratios:[ap]}"
    if heal is not None and heal != {"kind": "heal", "amount": {"flat": heal.get("amount", {}).get("flat")}, "applyTo": "self"}:
        return None, "heal 節點 ≠ {amount.flat, applyTo:self}"
    want_dot = {
        "kind": "dot",
        "damageType": dmg["damageType"],
        "amountPerTick": amt,
        "intervalSec": dot.get("intervalSec"),
        "durationSec": dot.get("durationSec"),
    }
    if "stacking" in dot:
        want_dot["stacking"] = dot["stacking"]
    if dot != want_dot:
        return None, (
            "dot 節點 ≠ 這一族發的（同傷害型別、同級距、同係數；"
            "09-01 界王拳那種 `applyTo:self`＋真傷 flat 的**自傷** dot 是另一台機器，⛔ 不是這一族）"
        )
    checks = [
        ("apRatio", ratios[0]["coeff"]),
        ("intervalSec", dot["intervalSec"]),
        ("durationSec", dot["durationSec"]),
        ("damageTier", amt["damageTier"]),
    ]
    if heal is not None:
        checks.append(("leechFlat", heal["amount"]["flat"]))
    for name, v in checks:
        if not slot_ok(tpl, name, v):
            return None, f"{name} {v} 超出槽的範圍"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params = {
        "damageTier": amt["damageTier"],
        "apRatio": ratios[0]["coeff"],
        "damageType": dmg["damageType"],
    }
    if heal is not None:
        params["leechFlat"] = heal["amount"]["flat"]
    params["intervalSec"] = dot["intervalSec"]
    params["durationSec"] = dot["durationSec"]
    if "stacking" in dot:
        params["stacking"] = dot["stacking"]
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_leap_strike(tpl: dict, doc: dict):
    if doc.get("castType") != "ground" or "radius" not in doc:
        return None, None
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "leap":
        return None, None
    n = eff[0]
    if not _keys_exactly(n, {"kind", "mode", "applyTo", "apexHeight", "durationSec", "landRadius", "onLand"}):
        return None, f"leap 節點多了鍵：{sorted(set(n) - {'kind', 'mode', 'applyTo', 'apexHeight', 'durationSec', 'landRadius', 'onLand'})}"
    if not (isinstance(n["onLand"], list) and len(n["onLand"]) == 1 and _damage_node(n["onLand"][0])):
        return None, "onLand ≠ [damage]（多了 comboBonus／狀態／特效）"
    if n["landRadius"] != doc["radius"]:
        return None, "landRadius ≠ 文件 radius"
    wc3 = to_wc3u(doc["radius"])
    apex = round2_js(n["apexHeight"] * 250)  # `wc3h` 槽：toApex = wc3 / 250，round3
    if wc3 is None or not slot_ok(tpl, "landRadius", wc3) or round(apex / 250, 3) != n["apexHeight"]:
        return None, "landRadius／apexHeight 換不回同一個 wc3 值"
    r = _common_reject(doc, True)
    if r:
        return None, r
    d = n["onLand"][0]
    params = {
        "mode": n["mode"],
        "applyTo": n["applyTo"],
        "apexHeight": apex,
        "durationSec": n["durationSec"],
        "landRadius": wc3,
        "damage": d["amount"],
        "damageType": d["damageType"],
    }
    for name in ("mode", "applyTo", "durationSec", "apexHeight"):
        if not slot_ok(tpl, name, params[name]):
            return None, f"{name} {params[name]} 超出槽的範圍"
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_life_manipulate(tpl: dict, doc: dict):
    eff = doc.get("effects") or []
    if len(eff) != 1 or eff[0].get("kind") != "restore":
        return None, None
    n = eff[0]
    if "applyTo" not in n:
        # ⛔ `applyTo` 是必填槽（有預設）⇒ 這一族**永遠**發它；文件沒寫就不是逐位元相同。
        return None, "restore 沒有 applyTo，而這一族永遠發 applyTo（預設 target）"
    if not _keys_exactly(n, {"kind", "healthPct", "applyTo"} | ({"manaPct"} if "manaPct" in n else set())):
        return None, "restore 節點的鍵集合 ≠ 這一族發的"
    want_cast = "self" if n["applyTo"] == "self" else "targeted"
    if doc.get("castType") != want_cast:
        return None, f"castType {doc.get('castType')} ≠ applyTo 推出來的 {want_cast}"
    r = _common_reject(doc, False)
    if r:
        return None, r
    params = {"healthPct": n["healthPct"], "applyTo": n["applyTo"]}
    if "manaPct" in n:
        params["manaPct"] = n["manaPct"]
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_blink(tpl: dict, doc: dict):
    """#1069 純位移：`[blink{single,to:point,applyTo:self}]`、castType ground、⛔ 沒有 targetsEnemies。零參數（castTimeSec 除外）。"""
    eff = doc.get("effects") or []
    if len(eff) != 1 or not isinstance(eff[0], dict) or eff[0].get("kind") != "blink":
        return None, None
    if eff[0] != BLINK_POINT:
        return None, "blink 節點 ≠ {single, to:point, applyTo:self}（帶 onArrive 的走 tpl-blink-strike）"
    if doc.get("castType") != "ground":
        return None, f"castType {doc.get('castType')} ≠ 這一族發的 ground"
    if "radius" in doc:
        return None, "文件層有 radius：merge 會刪掉"
    r = _common_reject(doc, None)
    if r:
        return None, r
    params: dict = {}
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_apply_status(tpl: dict, doc: dict):
    """#1071 只上一個狀態：`[applyStatus]`；targeted（無 radius）或 ground（radius→wc3u）；targetsEnemies true。"""
    eff = doc.get("effects") or []
    if len(eff) != 1 or not isinstance(eff[0], dict) or eff[0].get("kind") != "applyStatus":
        return None, None
    if not _has_status_slot(tpl):
        return None, "模板沒有 type:applyStatus 的 `status` 槽"
    ct = doc.get("castType")
    wc3 = None
    if ct == "ground":
        if "radius" not in doc:
            return None, "ground 卻沒有 radius"
        wc3 = to_wc3u(doc["radius"])
        if wc3 is None or not slot_ok(tpl, "radius", wc3):
            return None, f"radius {doc['radius']} 換不回同一個 wc3u（或超出槽的範圍）"
    elif ct == "targeted":
        if "radius" in doc:
            return None, "targeted 卻有 radius：merge 會刪掉"
    else:
        return None, f"castType {ct} ≠ 這一族發的 targeted/ground"
    r = _common_reject(doc, True)
    if r:
        return None, r
    params: dict = {"status": _status_param(eff[0])}
    if wc3 is not None:
        params["radius"] = wc3
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_heal(tpl: dict, doc: dict):
    """
    #1072 只回血：`[heal{amount, applyTo?}]`；`target` 由 castType 推回去
    （self ⇒ castType self、⛔ 沒有 targetsEnemies；ally ⇒ targeted ＋ targetsEnemies:false）。
    ⚠️ `applyTo` 是 optional 無 default 的槽：文件沒寫就不發（GH#1046 的省略語意＝這次施法的對象，對回血族是對的）。
    """
    eff = doc.get("effects") or []
    if len(eff) != 1 or not isinstance(eff[0], dict) or eff[0].get("kind") != "heal":
        return None, None
    n = eff[0]
    if not _keys_exactly(n, {"kind", "amount"} | ({"applyTo"} if "applyTo" in n else set())):
        return None, f"heal 節點多了鍵：{sorted(set(n) - {'kind', 'amount', 'applyTo'})}"
    ct = doc.get("castType")
    if ct == "self":
        target, emits = "self", None
    elif ct == "targeted":
        target, emits = "ally", False
    else:
        return None, f"castType {ct} ≠ 這一族發的 self/targeted"
    if "radius" in doc:
        return None, "文件層有 radius：merge 會刪掉"
    if not slot_ok(tpl, "target", target):
        return None, f"target {target} 不在槽的 values 裡"
    r = _common_reject(doc, emits)
    if r:
        return None, r
    params: dict = {"target": target, "amount": n["amount"]}
    if "applyTo" in n:
        if not slot_ok(tpl, "applyTo", n["applyTo"]):
            return None, f"applyTo {n['applyTo']} 不在槽的 values 裡"
        params["applyTo"] = n["applyTo"]
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_projectile_strike(tpl: dict, doc: dict):
    """
    #1068 投射物一發：`castType:"skillshot"` ＋ **唯一**一個頂層節點
    `spawnProjectile{projectileId, onHit:[damage, spawnVfx?, dot?, applyStatus?]}`。
    ⛔ 不發 targetsEnemies（13 支裡 11 支沒寫；有寫的值站著）；彈幅／射程住在文件骨架，⛔ 不是參數。
    ⭐ 2026-09-07：命中酬載多兩格選填（`onHitVfx`／`dot`）⇒ 18-02 寄生種子那兩支接得上。
    spawnProjectile **旁邊**還有 spawnModelFx／floatingText 的（4 支）仍然不是這一族
    —— 那是兩個家族疊在一起，⛔ 不是這一族多一格。逐支印差在哪一格。
    """
    if doc.get("castType") != "skillshot":
        return None, None
    eff = doc.get("effects") or []
    if not eff or not isinstance(eff[0], dict) or eff[0].get("kind") != "spawnProjectile":
        return None, None
    if len(eff) != 1:
        extra = " + ".join(str(x.get("kind", "?")) for x in eff[1:] if isinstance(x, dict))
        return None, f"spawnProjectile 之外還有 {len(eff) - 1} 個頂層節點（{extra}）—— 演出層是另一台機器（spawnModelFx 家族／堆疊），⛔ 這一族只發一顆投射體"
    n = eff[0]
    if not _keys_exactly(n, {"kind", "projectileId", "onHit"}):
        return None, f"spawnProjectile 節點多了鍵：{sorted(set(n) - {'kind', 'projectileId', 'onHit'})}"
    if not _has_status_slot(tpl):
        return None, "模板沒有 type:applyStatus 的 `status` 槽"
    on_hit = n.get("onHit")
    if not isinstance(on_hit, list) or not on_hit or not _damage_node(on_hit[0]):
        return None, "onHit[0] 不是純 damage 節點（{kind, damageType, amount}）"
    # ⭐ 命中酬載：`[damage, spawnVfx?, dot?, applyStatus?]` —— **次序固定**（`expand.ts`
    #    projectile-strike 那一行同一個次序）。⛔ 不是「這幾種節點的任意排列」：onHit 是
    #    一個陣列，換兩格的位置就是換一份文件，等價閘會逐位元指名它。
    PAYLOAD_SLOTS = (("onHitVfx", "spawnVfx"), ("dot", "dot"), ("status", "applyStatus"))
    payload: dict = {}
    idx = 0
    for node in on_hit[1:]:
        kind = node.get("kind") if isinstance(node, dict) else None
        while idx < len(PAYLOAD_SLOTS) and PAYLOAD_SLOTS[idx][1] != kind:
            idx += 1
        if idx == len(PAYLOAD_SLOTS):
            kinds = " + ".join(str(x.get("kind", "?")) for x in on_hit if isinstance(x, dict))
            return None, (
                f"onHit 是 [{kinds}] —— 這一族的命中發 [damage, spawnVfx?, dot?, status?]，"
                "次序固定（多出來的節點／換過位置的都不是這一族）"
            )
        slot = PAYLOAD_SLOTS[idx][0]
        if not _has_node_slot(tpl, slot, kind):
            return None, f"模板沒有 type:{kind} 的 `{slot}` 槽"
        payload[slot] = _status_param(node)
        idx += 1
    if "radius" in doc:
        return None, "文件層有 radius：merge 會刪掉（skillshot 的彈幅住在 projectile 文件，⛔ 不在技能）"
    r = _common_reject(doc, None)
    if r:
        return None, r
    d = on_hit[0]
    params: dict = {"projectileId": n["projectileId"], "damage": d["amount"], "damageType": d["damageType"]}
    params.update(payload)
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


def m_transform(tpl: dict, doc: dict):
    """
    #1067 變身：`castType:"self"` ＋ 第一個節點是 `championForm`，旁邊最多再一個 `applyBuff` 與一個 `applyStatus`。

    ⛔ 逐階陣列的 `durationSec`（w3a `ahdu` 一階一格，例 06-04）不轉 —— `number` 槽只收單一數字。
    ⛔ `applyBuff` 帶 `perRank`／`statusId`／`stackKey`／`maxStacks`／`flight` 的不轉 —— 那幾格今天沒有槽。
    ⛔ `championForm` 旁邊還有 `modifyCooldown`／`delayed`／`spawnModelFx` 的不轉（各是單例，N=1 不模板化）。
    """
    if doc.get("castType") != "self":
        return None, None
    eff = doc.get("effects") or []
    if not eff or not isinstance(eff[0], dict) or eff[0].get("kind") != "championForm":
        return None, None
    form = eff[0]
    extra = set(form) - {"kind", "to", "durationSec"}
    if extra:
        return None, f"championForm 節點多了鍵：{sorted(extra)}"
    if not slot_ok(tpl, "to", form.get("to")):
        return None, f"形態 {form.get('to')} 不在槽的 values 裡"
    params: dict = {"to": form["to"]}
    if "durationSec" in form:
        dur = form["durationSec"]
        if isinstance(dur, list):
            return None, "durationSec 是逐階陣列（w3a ahdu 一階一格）—— `持續秒數` 是單一數字槽，⛔ 展開出來會少掉後面幾階"
        if not slot_ok(tpl, "durationSec", dur):
            return None, f"durationSec {dur} 超出槽的範圍"
        params["durationSec"] = dur
    buff = status = None
    for n in eff[1:]:
        kind = n.get("kind") if isinstance(n, dict) else "?"
        if kind == "applyBuff" and buff is None:
            buff = n
        elif kind == "applyStatus" and status is None:
            status = n
        else:
            kinds = " + ".join(str(x.get("kind", "?")) for x in eff[1:] if isinstance(x, dict))
            return None, f"championForm 旁邊是 [{kinds}] —— 這一族只收 [championForm, applyBuff?, applyStatus?]（各是單例，N=1 ⇒ ⛔ 不模板化）"
    if buff is not None:
        bad = sorted(set(buff) - {"kind", "modifiers", "duration"})
        if bad:
            return None, f"applyBuff 多了鍵：{bad}（perRank／statusId／stackKey／maxStacks／flight 今天沒有槽）"
        if not isinstance(buff.get("modifiers"), list):
            return None, "applyBuff.modifiers 不是陣列"
        if not slot_ok(tpl, "buffDurationSec", buff.get("duration")):
            return None, f"增益秒數 {buff.get('duration')} 超出槽的範圍"
        params["modifiers"] = buff["modifiers"]
        params["buffDurationSec"] = buff["duration"]
    if status is not None:
        if not _has_status_slot(tpl):
            return None, "模板沒有 type:applyStatus 的 `status` 槽"
        params["status"] = _status_param(status)
    if "radius" in doc:
        return None, "文件層有 radius：merge 會刪掉"
    r = _common_reject(doc, None)
    if r:
        return None, r
    r = _cast_time(tpl, doc, params)
    if r:
        return None, r
    return params, None


#: 提案順序 ＝ 「已有採用者多的先」——同一個形狀兩份模板都對得上時，接**已經有客戶的那一份**
#: （報告 §2：`ground-nova` 形狀對而語意不對，那 12 支的正解是 21 支在用的 `single-strike`）。
#: 2026-09-06 量到的採用數：buff-self 36 · single-strike 23 · instant-blast 13 · proxy-cast 8 ·
#: proxy-fanout 1 · blink-strike 1 · drain-leech 0 · leap-strike 0 · life-manipulate 0。
#: ⭐ 2026-09-06 晚：blink / apply-status / heal / projectile-strike 四份模板檔落地（#1069 #1071 #1072 #1068）；
#:    `plan()` 對不存在的 ref 仍然直接跳過（拿 `--templates-dir` 試提案中的模板時才會遇到）。
MATCHERS = (
    ("tpl-buff-self", m_buff_self),
    ("tpl-single-strike", m_single_strike),
    ("tpl-instant-blast", m_instant_blast),
    ("tpl-proxy-cast", m_proxy_cast),
    ("tpl-proxy-fanout", m_proxy_fanout),
    ("tpl-blink-strike", m_blink_strike),
    ("tpl-drain-leech", m_drain_leech),
    ("tpl-leap-strike", m_leap_strike),
    ("tpl-life-manipulate", m_life_manipulate),
    ("tpl-blink", m_blink),
    ("tpl-apply-status", m_apply_status),
    ("tpl-heal", m_heal),
    ("tpl-projectile-strike", m_projectile_strike),
    ("tpl-transform", m_transform),
)


# ── 主流程 ────────────────────────────────────────────────────────────────────


def hand_written(doc: dict) -> bool:
    t = doc.get("template")
    return (t is None or t == {}) and bool(doc.get("effects"))


def shape_of(doc: dict) -> str:
    kinds: list[str] = []

    def walk(nodes):
        if not isinstance(nodes, list):
            return
        for n in nodes:
            if not isinstance(n, dict):
                continue
            if isinstance(n.get("kind"), str):
                kinds.append(n["kind"])
            for v in n.values():
                if isinstance(v, list):
                    walk(v)

    walk(doc.get("effects") or [])
    c = Counter(kinds)
    return " + ".join(f"{k}×{n}" if n > 1 else k for k, n in sorted(c.items()))


def with_template(doc: dict, ref: str, params: dict) -> dict:
    """`effects` 清空、`template` 插在它後面（與出貨採用者同一個鍵序）。"""
    out = {}
    for k, v in doc.items():
        if k == "template":
            continue
        out[k] = [] if k == "effects" else v
        if k == "effects":
            out["template"] = {"ref": ref, "params": params}
    if "template" not in out:
        out["effects"] = []
        out["template"] = {"ref": ref, "params": params}
    return out


# ── 變身對子（`abilityCodeParity.ts` 的鏡子；⛔ 只提案不裁決）───────────────────


def _canon(v, self_hero: str | None):
    """`canonicalJson` 的 walk：整數化、6 位捨入、鍵排序、自我參照摺成 `<self>`。"""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return int(v) if float(v).is_integer() else round(v, 6)
    if isinstance(v, str) and self_hero and v.startswith(self_hero + "."):
        return "<self>" + v[len(self_hero):]
    if isinstance(v, list):
        return [_canon(x, self_hero) for x in v]
    if isinstance(v, dict):
        return {k: _canon(v[k], self_hero) for k in sorted(v)}
    return v


def canonical_json(v, self_hero: str | None = None) -> str:
    return json.dumps(_canon(v, self_hero), ensure_ascii=False, separators=(",", ":"))


def drift_keys(members: list[dict]) -> set[str]:
    """`scanAbilityCodeDrift` 對一組同編號文件會回報的欄位集合（鍵的後半：`<code>|<欄位>` 的欄位）。"""
    if len(members) < 2:
        return set()
    fields: set[str] = set()
    for d in members:
        fields |= {f for f in d if f not in COSMETIC_FIELDS}
    out: set[str] = set()
    for f in fields:
        vals = {canonical_json(d.get(f), str(d.get("id")).split(".")[0]) for d in members}
        if len(vals) > 1:
            out.add(f)
    return out


def parity_guard(docs: dict[str, dict], proposals, allow_fix: bool, why_not: dict[str, str]):
    """
    回傳 (kept, blocked{stem: why})。⭐ 只問「轉了之後這一組同編號會不會冒出**新的**漂移鍵」，⛔ 不裁決誰對。
    · 冒出新鍵（另一半沒一起轉）⇒ 擋，並說另一半為什麼沒轉（`why_not`）。
    · 修好既有鍵（baseline 那一列要拿掉）⇒ 預設也擋，`--allow-parity-fix` 才放行。
    ⚠️ 跑到不動點：擋掉 A 之後 A 的孿生 B 也會變成「另一半沒轉」。
    """
    by_code: dict[str, list[str]] = defaultdict(list)
    for stem, d in docs.items():
        m = NAME_RE.match(str(d.get("name", "")))
        if m:
            by_code[m.group(1) + "-" + m.group(2)].append(stem)
    prop = {stem: (ref, params) for stem, ref, params in proposals}
    blocked: dict[str, str] = {}
    changed = True
    while changed:
        changed = False
        for stem in list(prop):
            m = NAME_RE.match(str(docs[stem].get("name", "")))
            if not m:
                continue
            code = m.group(1) + "-" + m.group(2)
            group = by_code[code]
            if len(group) < 2:
                continue
            before = drift_keys([docs[s] for s in group])
            after = drift_keys([with_template(docs[s], *prop[s]) if s in prop else docs[s] for s in group])
            new, fixed = after - before, before - after
            # ⭐ #1068（76-03 伸縮自如的槍亂打）：兩半**一起**轉，而它們的 params 本來就不同（不同投射體、不同級距）
            #    ⇒ 既有的 `<code>|effects` 漂移**搬家**成 `<code>|template`。⛔ 那不是新的漂移，是同一個漂移換了住處 ——
            #    baseline 那一列要**改名**（拿掉 effects、加上 template），所以只在 --allow-parity-fix 時放行，並印出來。
            if allow_fix and new == {"template"} and "effects" in fixed and all(s in prop or not hand_written(docs[s]) for s in group):
                print(
                    f"⚠️ {stem}: {code} 的漂移從 effects 搬到 template（兩半一起轉、params 本來就不同）⇒ "
                    f"packages/shared/src/content/abilityCodeParity.baseline/{code[:2]}.json 把 {code}|effects 改成 {code}|template"
                )
                new, fixed = set(), fixed - {"effects"}
            if new:
                twins = ", ".join(
                    f"{s}（{blocked.get(s) or why_not.get(s) or ('本身也在提案裡 —— 兩半的 params 不同 ⇒ 既有的 effects 漂移會搬到 template；--allow-parity-fix 放行並把 baseline 那一列改名' if s in prop else '?')}）"
                    for s in group
                    if s != stem
                )
                blocked[stem] = (
                    f"另一半沒有一起轉 ⇒ 會冒出 {code}|{'/'.join(sorted(new))}（abilityCodeParity 紅）。另一半：{twins}"
                )
                del prop[stem]
                changed = True
            elif fixed and not allow_fix:
                blocked[stem] = (
                    f"轉了會**修好** {code}|{'/'.join(sorted(fixed))} 的既有漂移 ⇒ 同一個 commit 要從 "
                    f"packages/shared/src/content/abilityCodeParity.baseline/{code[:2]}.json 拿掉那幾列；"
                    "確定要就加 --allow-parity-fix"
                )
                del prop[stem]
                changed = True
    kept = [(s, r, p) for s, r, p in proposals if s in prop]
    return kept, blocked


def plan(args):
    tpls = templates(args.templates_dir)
    products = product_ids()
    exclude = set(filter(None, (args.exclude or "").split(",")))
    only = set(filter(None, (args.only or "").split(",")))
    docs = {
        f[:-5]: load_json(os.path.join(ABIL_DIR, f))
        for f in sorted(os.listdir(ABIL_DIR))
        if f.endswith(".json") and f != "_index.json"
    }
    bad_keys, key_notes = verify_keys(docs)
    proposals: list[tuple[str, str, dict]] = []
    skipped: dict[str, list[tuple[str, str]]] = defaultdict(list)  # reason-bucket → [(id, detail)]
    why_not: dict[str, str] = {}  # 沒提案的每一支 → 一句為什麼（給變身對子的訊息用）
    for stem, doc in docs.items():
        if not hand_written(doc):
            t = doc.get("template")
            ref = t.get("ref") if isinstance(t, dict) else "（堆疊）" if isinstance(t, list) or isinstance(t, dict) else None
            why_not[stem] = f"已是模板技能（{ref}）" if ref else "effects 為空（純被動／純標記）"
            continue
        if only and stem not in only:
            why_not[stem] = "不在 --only 名單（把它一起放進來）"
            continue
        if stem in products:
            skipped["產物（skillremake:json）"].append((stem, "改 tools/skill-remake/batch1.py 的來源列"))
            why_not[stem] = "skillremake:json 的產物 ⇒ 改 tools/skill-remake/batch1.py 的來源列"
            continue
        if stem.startswith(SKELETON_PREFIXES) and not args.include_skeleton:
            skipped["fail-open 骨架的孿生（--include-skeleton 才提案）"].append(
                (stem, "sim/content/skeleton.ts 的值要與 content 對齊；loader.test.ts 在守")
            )
            why_not[stem] = "fail-open 骨架的孿生（--include-skeleton）"
            continue
        if stem in exclude:
            skipped["柵欄外（--exclude）"].append((stem, ""))
            why_not[stem] = "柵欄外（--exclude）"
            continue
        if stem in bad_keys:
            skipped["🔑 鑰匙驗不過"].append((stem, bad_keys[stem]))
            why_not[stem] = f"鑰匙驗不過：{bad_keys[stem]}"
            continue
        near: list[str] = []
        hit = None
        for ref, fn in MATCHERS:
            tpl = tpls.get(ref)
            if tpl is None or tpl.get("status") != "enabled":
                continue
            params, why = fn(tpl, doc)
            if params is not None:
                hit = (ref, params)
                break
            if why:
                near.append(f"{ref}: {why}")
        if hit:
            proposals.append((stem, hit[0], hit[1]))
        elif near:
            skipped["差一格（形狀對、位元不對）"].append((stem, " ｜ ".join(near)))
            why_not[stem] = "差一格：" + " ｜ ".join(near)
        else:
            shape = shape_of(doc)
            hint = PLANNED_SHAPES.get(shape)
            skipped["沒有模板發這個形狀"].append((stem, shape + (f"  ⇒ {hint}" if hint else "")))
            why_not[stem] = f"沒有模板發 {shape}" + (f"（{hint}）" if hint else "")
    proposals, blocked = parity_guard(docs, proposals, args.allow_parity_fix, why_not)
    for stem, why in blocked.items():
        skipped["🔗 變身對子（abilityCodeParity 會紅，⛔ 不轉）"].append((stem, why))
    return docs, proposals, skipped, bad_keys, key_notes


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--apply", action="store_true", help="真的寫檔（預設 dry-run）")
    ap.add_argument("--only", help="只處理這幾支（逗號分隔）")
    ap.add_argument("--exclude", help="跳過這幾支（逗號分隔；別條 lane 的檔）")
    ap.add_argument("--revert", help="從帳本還原這幾支（逗號分隔）")
    ap.add_argument("--ledger", default=LEDGER_DEFAULT)
    ap.add_argument(
        "--templates-dir",
        default=TPL_DIR,
        help="拿另一個目錄的模板 dry-run（看提案中的模板會收幾支）；⛔ 不能配 --apply —— 等價閘讀的是出貨目錄",
    )
    ap.add_argument("--allow-parity-fix", action="store_true", help="也轉「會修好既有 abilityCodeParity 漂移」的那幾支（baseline 要同 commit 拿掉那幾列）")
    ap.add_argument("--include-skeleton", action="store_true", help="連 sela.*／thorne.*（fail-open 骨架的孿生）也提案")
    args = ap.parse_args(argv)
    if args.apply and os.path.abspath(args.templates_dir) != os.path.abspath(TPL_DIR):
        print("⛔ --apply 只能對出貨的 content/ability-templates/ 跑：帳本與等價閘都讀那個目錄，拿別的目錄寫檔＝寫出一批展不開的技能")
        return 2

    ledger = load_json(args.ledger) if os.path.exists(args.ledger) else {
        "schema": "templatize-ledger@1",
        "note": (
            "⭐ GH#993 templatize 的帳本：每一支被轉的技能記 ref/params 與轉換前的行為欄位。"
            "它是 templatizeEquivalence.test.ts 的證據，⛔ 不是第二份技能資料 —— 改技能請改 content/。"
        ),
        "entries": {},
    }

    if args.revert:
        for stem in filter(None, args.revert.split(",")):
            e = ledger["entries"].get(stem)
            if e is None:
                print(f"⛔ 帳本裡沒有 {stem}")
                return 2
            path = os.path.join(ABIL_DIR, f"{stem}.json")
            doc = load_json(path)
            doc.pop("template", None)
            doc.update(e["before"])
            # ⭐ 依帳本記下的原鍵序放回去 —— 還原後的 diff 才會是零，⛔ 不是「內容對了但每一行都動」。
            order = e.get("order") or list(doc.keys())
            restored = {k: doc[k] for k in order if k in doc}
            restored.update({k: v for k, v in doc.items() if k not in restored})
            dump_json(path, restored)
            del ledger["entries"][stem]
            print(f"↩︎ {stem} 還原（{e['ref']}）")
        dump_json(args.ledger, ledger)
        return 0

    docs, proposals, skipped, bad_keys, key_notes = plan(args)
    by_ref = Counter(ref for _, ref, _ in proposals)
    print(f"🧱 templatize —— 提案 {len(proposals)} 支（{'寫檔' if args.apply else 'dry-run'}）")
    for ref, n in by_ref.most_common():
        print(f"   {n:3d}  {ref}")
    for stem, ref, params in proposals:
        print(f"   ✓ {stem:24s} → {ref}  {json.dumps(params, ensure_ascii=False)}")
    for bucket, rows in skipped.items():
        print(f"\n⏭ {bucket}：{len(rows)} 支")
        for stem, detail in rows:
            print(f"   · {stem:24s} {detail}")
    if bad_keys:
        print(f"\n🔑 全樹鑰匙驗不過的文件：{len(bad_keys)}（⛔ 全部不轉）")
        for stem, why in sorted(bad_keys.items()):
            print(f"   · {stem}: {why}")
    if key_notes:
        print(f"\nℹ️ 槽位 ≠ 編號慣例：{len(key_notes)} 份（設計偏好，⛔ 不擋；列出來給人看）")
        for stem, why in sorted(key_notes.items()):
            print(f"   · {stem}: {why}")

    if not args.apply:
        return 0
    for stem, ref, params in proposals:
        doc = docs[stem]
        before = {k: doc[k] for k in BEHAVIOUR_KEYS if k in doc}
        ledger["entries"][stem] = {"ref": ref, "params": params, "before": before, "order": list(doc.keys())}
        dump_json(os.path.join(ABIL_DIR, f"{stem}.json"), with_template(doc, ref, params))
    ledger["entries"] = dict(sorted(ledger["entries"].items()))
    dump_json(args.ledger, ledger)
    print(f"\n✅ 寫了 {len(proposals)} 份文件 ＋ 帳本 {os.path.relpath(args.ledger, ROOT)}（{len(ledger['entries'])} 筆）")
    print("   下一步：npx vitest run packages/shared/src/content/templatizeEquivalence.test.ts")
    return 0


if __name__ == "__main__":
    sys.exit(main())

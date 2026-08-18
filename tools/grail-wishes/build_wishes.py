#!/usr/bin/env python3
"""聖杯願望三選一 —— owner 的 CSV → `content/augments/grail-*.json`。

⭐ 為什麼是一支產生器而不是 60 次手貼（第零守則⑨：N 個同型 = K 個模板 + 一張表）：
owner 的 CSV 是**母本**，他下一版還會給。手貼一次 = 下一版再手貼一次，而且中間
沒有任何東西比對得出「repo 裡這 60 份跟他給的那張表還一不一樣」。

跑法：

    python3 tools/grail-wishes/build_wishes.py            # 寫檔
    python3 tools/grail-wishes/build_wishes.py --check    # 只比對，不一致回非零

⚠️ `--check` 是**逐位元組**比對，所以這支刻意不寫任何跟時鐘有關的欄位
（同 `caps:export` / `spec:build` 的理由：一條被放寬成模糊比對的閘等於沒有閘）。

────────────────────────────────────────────────────────────────────────────────
CSV 的 10 份參數修正（⛔ 全部是**形狀**錯，不是設計錯 —— 機制本身引擎全都有）

  ① `shape:"single"` 配 `side` / `maxTargets`（8 處）
     schema 明講「single 讀不到 side」。target 已經是 `self` 或事件的受害者，
     範圍欄位在那裡是一個「看起來有設、其實沒有人讀」的數字 → 刪掉。
  ② `knockback` 只填了 `distanceTier`（2 份）
     `distance` / `speed` 仍是必填。補上 `config.displacement-tiers@1` 的
     **push** 梯 `小 = {distance: 2, speed: 16}` —— 級別贏過手寫值
     （`content/displacementTiers.ts` §323），所以兩者一致、且之後調級距吃得到。
  ③ `delayed.delaySec: 0`（1 份）
     必須 > 0。改 0.1（= 3 tick，與同一份的 `intervalSec` 一致）。

  ④ `dispel.count` 表達的是「全部」（3 份，2026-08-18 → 改寫）
     `sim/effects/dispel.ts` 是 `Math.min(e.count ?? cap, cap)`，而 cap 是
     `content/config/dispel.json` 的 `maxCountCap`。CSV 用 50 表達「全部」。
     ⇒ ⭐ **整格省略 `count`**，⛔ 不是夾成當下的上限：省略逐位元等於「跟著後台那一格走」，
     所以 owner 之後怎麼調，這 3 份與它們的卡面**自動跟上**；夾成一個數字則會凍結在
     產生的 JSON 裡，而且不會有任何東西提醒你它過期了。
     ⚠️ 這一段先前寫的是「夾成上限，而且卡面文案跟著改成那個數字」，
     那是 owner 2026-08-18 裁決（`maxCountCap` 3 → **1000**：「理論上淨化就是解掉所有
     負面狀態阿⋯所以提高到 1000 都沒關係」）**之前**的做法 —— 照舊會把 CSV 的
     「淨化所有負面狀態」改寫成「淨化最新的 1000 個」，那是一句沒有人想讀的話。
     ⇒ 卡面**保留 CSV 的「所有／全部」**（它現在逐字為真）。
     閘：`packages/shared/src/content/noOpModifierClaims.test.ts` 的
     「沒有任何 `dispel.count` 大於出貨的 `maxCountCap`」。
"""
from __future__ import annotations

import argparse
import csv
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
CSV = pathlib.Path(__file__).with_name("ggd_sacred_grail_wishes_v1.csv")
OUT = ROOT / "content" / "augments"
# 圖示存在性檢查的根（`icon` 是相對 content/ 的路徑）。
CONTENT_ROOT = ROOT / "content"

# `config/displacement-tiers.json` 的 push 梯「小」。⛔ 不是憑感覺挑的數字。
PUSH_TIER_SMALL = {"distance": 2, "speed": 16}

# 【淨化】的全域上限 —— ⭐ **從出貨 config 讀**，⛔ 不寫死（第一守則：那是一格後台欄位）。
# `sim/dispelRules.ts::DEFAULT_DISPEL_RULES.maxCountCap` 是缺檔時的同一個退路。
DISPEL_CAP_FALLBACK = 1000  # = `sim/dispelRules.ts::DEFAULT_DISPEL_RULES.maxCountCap`


def dispel_cap() -> int:
    try:
        raw = json.loads((ROOT / "content" / "config" / "dispel.json").read_text(encoding="utf-8"))
        v = raw.get("maxCountCap")
        return int(v) if isinstance(v, (int, float)) else DISPEL_CAP_FALLBACK
    except Exception:
        return DISPEL_CAP_FALLBACK


DISPEL_CAP = dispel_cap()

# ── owner 2026-08-17 的裁決：⛔ 條件不可以嚴苛到發不動 ────────────────────────
#
#   「反彈跟迴避 放在一起考慮；暈眩同時也可以跟其他負面狀態放在一起考慮
#     這樣條件才不會過度嚴苛 無法發動」
#
# 依第〇·六守則這是**第 1 層**（owner 的設計說明），贏過第 2 層（CSV 這份編輯器
# 產出的 JSON）。兩族各自的量測理由：
#
# ① **防禦反應族（迴避 ∪ 反彈）**：全 repo 只有 **1 支技能**產得出反彈
#    （`godie-h00l.r` 的 `damage.incomingPct`），所以「反彈成功時⋯」對 77/78 的
#    英雄是一張按不到的卡。兩件事一起放寬才有意義：
#      · **閘**  `requiresSelfMechanic: ["evasion", "reflect"]`（any-of）
#      · **觸發** 同一組效果掛兩個事件 —— `onReflectSuccess` 與 `onEvade`。
#    ⚠️ 兩個事件在效果眼裡是同一個形狀（`target:"event"` 都是那位攻擊者），
#    所以鏡射是安全的 —— **只有一個例外**，見 `MIRROR_EVADE_SUBSTITUTE`。
#
# ② **負面狀態族**：`onStunned` 只在暈眩時發，而一場裡沒有人暈到你就是一張
#    整場沒作用的卡。改掛 `onStatusApplied` + 條件「身上有 `debuff`」——
#    出貨 29 份狀態文件裡 **21 份帶 `debuff` 標籤**，而暈眩本來就是其中之一
#    （`applyStatus` 同時發 `stunApplied` 與 `statusApplied`），所以這是
#    **涵蓋暈眩再往外長**，⛔ 不是把暈眩換掉。
#    ⛔ 也不可以「兩個 hook 都掛」：那會讓真的被暈眩時發動兩次。

DEFENSIVE_FAMILY = ["evasion", "reflect"]

# 這幾張要把 `onEvade` / `onReflectSuccess` 互相鏡射成一族。
MIRROR_DEFENSIVE = {"grail-c-02", "grail-a-01", "grail-ex-08", "grail-c-03", "grail-a-02"}

# ⚠️ **唯一一張效果不能原樣鏡射的**：`grail-a-02` 的效果是
# `eventValueConversion{source:"incomingDamage"}` —— 迴避的定義是那一發**根本沒落地**,
# 所以轉換出來是 0,鏡射過去就是一條「看起來有掛、永遠回 0 血」的支線（失敗形態②）。
# ⇒ 迴避那一支換成同階同量級的定額回復。
# ⛔ **6% 是我挑的數字,不是 owner 給的** —— 對齊它 C 階的姊妹卡 `grail-c-03`
#    （回復 6% 最大魔力）。要調就改這一行。
MIRROR_EVADE_SUBSTITUTE = {
    "grail-a-02": [{"kind": "restore", "healthPct": 0.06, "applyTo": "self"}],
}

# ⭐ CSV 的哪幾份用一個大數字（50）表達「**全部**」—— 這幾份的 `dispel.count` 整格省略。
# ⛔ 這是一張**意圖**表，不是一條「大於某個值就算」的判斷式：CSV 的哨兵是 50，而全域上限
#    （`config/dispel.json` 的 `maxCountCap`）在 owner 2026-08-18 之後是 **1000** ——
#    任何拿兩者比大小的規則從那一天起就再也不會觸發，而卡面上的「所有／全部」會靜靜變成謊話。
# ⚠️ 對照組：grail-c-01 / grail-c-08 的 `count: 1` 是作者**刻意**的弱淨化（卡面寫「最新一個」），
#    它們**不在**這張表裡，也不該被省略。
DISPEL_MEANS_ALL = frozenset({"grail-a-06", "grail-a-15", "grail-ex-14"})

# 掛在 `onStatusApplied` 上的「這是一個負面狀態」條件。
# `debuff` 是出貨 21 份負面狀態文件共用的標籤,⛔ 不是我新造的字。
DEBUFF_CONDITION = {"kind": "status", "subject": "self", "tag": "debuff"}

# 文案要跟著語意改（第一守則：語意改了,舊文案就是謊話）。
# ⭐ `{cap}` 會被換成 `DISPEL_CAP`（出貨的 `maxCountCap`）—— ⛔ 不要在這裡寫死數字：
#    CSV 用「所有／全部」表達意圖，而引擎只拔得掉 cap 個（第一·五守則：
#    卡片上不可以有說了不會發生的字）。owner 抬高上限時文案自動跟上。
REWRITTEN_DESCRIPTION = {
    "grail-c-01": "[負面狀態][淨化] 被掛上負面狀態時，立即移除最新一個負面狀態。25秒冷卻。",
    "grail-c-11": "[負面狀態][技能重置] 被掛上負面狀態時，立即完成Q／W／E冷卻。25秒冷卻。",
    # ⚠️ a-15 留在這裡的理由**只剩觸發器改寫**（onStunned → onStatusApplied，owner 2026-08-17），
    #    ⛔ 不再是數量詞：「淨化所有負面狀態」在 `maxCountCap` = 1000 之後逐字為真。
    "grail-a-15": "[負面狀態][淨化][無敵] 被掛上負面狀態時，淨化所有負面狀態並獲得0.75秒無敵。20秒冷卻。",
    # ⛔ grail-a-06 / grail-ex-14 **不再列在這裡** —— 它們當初只為了把「所有／全部」改寫成
    #    一個數字而存在，而那個改寫已被 owner 2026-08-18 的裁決推翻。CSV 的原文就是出貨文案。
    "grail-c-02": "[迴避][反彈][擊退] 成功迴避或反彈敵方攻擊時，將攻擊者小幅擊退。8秒冷卻。",
    "grail-a-01": "[迴避][反彈][彈反] 成功迴避或反彈後，立即對攻擊者造成一次100% AD物理傷害並小幅擊退。6秒冷卻。",
    "grail-c-03": "[反彈][迴避][回魔] 成功反彈或迴避時，回復6%最大魔力。5秒冷卻。",
    "grail-a-02": "[反彈][迴避][回復] 成功反彈時回復等同反彈傷害50%的生命；成功迴避時回復6%最大生命。8秒冷卻。",
    "grail-ex-08": "[迴避][反彈][技能代放] 成功迴避或反彈敵方英雄攻擊時，從Q／W／E中隨機免費施放一個技能攻擊該敵人。12秒冷卻。",
}


def apply_owner_directive(doc: dict, notes: list[str]) -> None:
    """把 owner 2026-08-17 的兩族放寬套上去（就地改 `doc`）。"""
    wid = doc["id"]
    hooks = doc.get("hooks")
    if not hooks:
        return

    # ① 負面狀態族：onStunned → onStatusApplied + 「身上有 debuff」
    for hook in hooks:
        if hook.get("on") != "onStunned":
            continue
        hook["on"] = "onStatusApplied"
        existing = hook.get("condition")
        hook["condition"] = (
            dict(DEBUFF_CONDITION) if existing is None else {"all": [existing, dict(DEBUFF_CONDITION)]}
        )
        notes.append(f"{wid}: onStunned → onStatusApplied + 負面狀態條件（暈眩仍然涵蓋在內）")

    # ② 防禦反應族：迴避 ↔ 反彈 互相鏡射
    if wid in MIRROR_DEFENSIVE:
        mirrored = []
        for hook in hooks:
            other = {"onEvade": "onReflectSuccess", "onReflectSuccess": "onEvade"}.get(hook.get("on"))
            if other is None:
                continue
            twin = json.loads(json.dumps(hook))
            twin["on"] = other
            if other == "onEvade" and wid in MIRROR_EVADE_SUBSTITUTE:
                twin["effects"] = json.loads(json.dumps(MIRROR_EVADE_SUBSTITUTE[wid]))
                notes.append(f"{wid}: 鏡射到 onEvade,但效果換成定額回復（迴避沒有落地傷害可以轉換）")
            else:
                notes.append(f"{wid}: 效果鏡射到 {other}（迴避與反彈同一族）")
            mirrored.append(twin)
        hooks.extend(mirrored)

    if wid in REWRITTEN_DESCRIPTION:
        doc["description"] = REWRITTEN_DESCRIPTION[wid].replace("{cap}", str(DISPEL_CAP))


# ── CSV 的 eligibility 詞彙 → 引擎的封閉列舉 ────────────────────────────────
# ⛔ 對不上的一律**丟掉並記錄**，不靜靜塞進去：一個引擎答不出來的謂詞會讓那張卡
#    要嘛永遠不出現、要嘛永遠通過，而兩種都看不出來。
MECHANIC = {"evasion": "evasion", "reflect": "reflect", "burn": "burn", "shield": "shield"}
TAG_AS_MECHANIC = {"ability-damage": "abilityDamage", "basic-attack": None}
EXCLUDE = {"flight-conflict": "flight"}
MODE_FEATURE = {
    "killable-units": "mobs",
    "boss": "boss",
    "neutral-object-as-mob-kill": "neutralObjects",
    "team": "team",
    "revive": "revive",
    "fire-ring": "fireRing",
}

dropped: list[str] = []
directives: list[str] = []


def _list(raw: str) -> list[str]:
    return [x.strip() for x in raw.split("|") if x.strip()] if raw else []


def translate_eligibility(row: dict[str, str]) -> dict:
    """CSV 的 13 欄 → `augment@1.eligibility` 的 9 格。"""
    src = json.loads(row["eligibility_json"] or "{}")
    wid = row["id"]
    out: dict = {}

    # requires*Mechanic 是 any-of,所以「機制」與「標籤」兩欄不可以合成一份清單
    # (那會把 AND 悄悄變成 OR)。實測 60 份沒有一份同時填兩欄,合起來仍然安全 ——
    # 但這裡照樣分開判,並在真的撞上時大聲死掉。
    mech = [MECHANIC[m] for m in src.get("requiresAnyMechanic", []) if m in MECHANIC]
    unknown = [m for m in src.get("requiresAnyMechanic", []) if m not in MECHANIC]
    if unknown:
        raise SystemExit(f"⛔ {wid}: requiresAnyMechanic 有引擎不認得的名字 {unknown}")
    # owner 2026-08-17：迴避與反彈是同一族。任一個成立就發得動,因為觸發那一半
    # 也鏡射成兩個事件了（見 `MIRROR_DEFENSIVE`）—— 兩半要一起放寬,只放寬閘
    # 會做出「發得到但按不動」的卡,只放寬觸發會做出「按得動但發不到」的卡。
    if set(mech) & set(DEFENSIVE_FAMILY):
        mech = list(DEFENSIVE_FAMILY)
    tagmech = [TAG_AS_MECHANIC.get(t) for t in src.get("requiresAnyTag", [])]
    tagmech = [t for t in tagmech if t]
    if mech and tagmech:
        raise SystemExit(f"⛔ {wid}: 同時填了 requiresAnyMechanic 與 requiresAnyTag —— any-of 合起來會把 AND 變 OR")
    if mech or tagmech:
        out["requiresSelfMechanic"] = mech or tagmech

    enemy = [MECHANIC[m] for m in src.get("requiresEnemyAnyMechanic", []) if m in MECHANIC]
    if enemy:
        out["requiresEnemyMechanic"] = enemy

    excl = [EXCLUDE[m] for m in src.get("excludeAnyMechanic", []) if m in EXCLUDE]
    if excl:
        out["excludeSelfMechanic"] = excl

    prefers, lost = [], []
    for t in src.get("prefersAnyTag", []):
        mapped = TAG_AS_MECHANIC.get(t)
        (prefers if mapped else lost).append(mapped or t)
    if prefers:
        out["prefersSelfMechanic"] = sorted(set(prefers))
    if lost:
        # ⭐ 這些是「三圍親和」(ad / ap / armor / mr / max-health / attack-speed /
        # long-range)。引擎答不出「這位英雄的 AP 算不算高」—— 那需要一條門檻,
        # 而門檻是一個後台數字,不是這一批的範圍。⛔ 所以不寫進去,記錄下來。
        dropped.append(f"{wid}: prefersAnyTag {lost}")

    if "mana" in src.get("requiresResource", []):
        out["requiresMana"] = True

    slots = set(src.get("requiresSafeProxySlots", [])) | set(src.get("requiresAbilitySlot", []))
    if src.get("requiresRHitEnemyChampion"):
        # 「R 打得到敵方英雄」拆成兩個引擎答得出的問題:有 R + 技能造得出傷害。
        slots.add("R")
        out.setdefault("requiresSelfMechanic", ["abilityDamage"])
    if slots:
        out["requiresAbilitySlots"] = [s for s in ("Q", "W", "E", "R") if s in slots]
    anyslot = src.get("requiresAnyAbilitySlot", [])
    if anyslot:
        out["requiresAnyAbilitySlot"] = [s for s in ("Q", "W", "E", "R") if s in anyslot]

    feats = [MODE_FEATURE[f] for f in src.get("requiresModeFeature", []) if f in MODE_FEATURE]
    unknown_f = [f for f in src.get("requiresModeFeature", []) if f not in MODE_FEATURE]
    if unknown_f:
        raise SystemExit(f"⛔ {wid}: requiresModeFeature 有引擎不認得的名字 {unknown_f}")
    if feats:
        out["requiresModeFeature"] = sorted(set(feats))

    arche = src.get("onlyAttackArchetype", [])
    if arche:
        out["onlyAttackType"] = arche[0] if isinstance(arche, list) else arche

    return out


def fix_effect(node, wid: str, fixes: list[str]):
    """遞迴套用三條參數修正。"""
    if isinstance(node, list):
        return [fix_effect(n, wid, fixes) for n in node]
    if not isinstance(node, dict):
        return node
    out = {k: fix_effect(v, wid, fixes) for k, v in node.items()}

    if out.get("shape") == "single":
        for dead in ("side", "maxTargets", "radius", "radiusTier"):
            if dead in out:
                del out[dead]
                fixes.append(f"{wid}: shape:single 刪掉引擎不讀的 {dead}")

    if out.get("kind") == "knockback" and "distance" not in out:
        out.update(PUSH_TIER_SMALL)
        fixes.append(f"{wid}: knockback 補上 push 梯「{out.get('distanceTier')}」的距離與速度")

    if out.get("kind") == "delayed" and out.get("delaySec") == 0:
        out["delaySec"] = 0.1
        fixes.append(f"{wid}: delayed.delaySec 0 → 0.1（schema 要求 > 0）")

    # ④ 「全部」⇒ **整格省略 `count`**，⛔ 不是夾成當下的上限、也⛔ 不是填一個大數字。
    #    `dispel.ts` 是 `Math.min(e.count ?? cap, cap)` ⇒ 省略 = 永遠等於後台那一格，
    #    所以 owner 調 `maxCountCap` 時這幾份自動跟上（填死的值不會，而且不會有人發現）。
    #    ⚠️ 判準**不能**寫成 `count >= DISPEL_CAP`：CSV 的哨兵值是 50，而上限現在是 1000 ——
    #    那條判斷式從 owner 抬高上限的那一刻起就永遠是 False，於是卡面寫「所有」而引擎只拔 50
    #    （第一·五守則，而且是那種「規則還在、只是再也不會觸發」的形狀）。
    #    ⇒ 判準是**作者意圖**，寫成一張點名的表（見 `DISPEL_MEANS_ALL`）。
    if out.get("kind") == "dispel" and wid in DISPEL_MEANS_ALL and "count" in out:
        fixes.append(f"{wid}: dispel.count {out['count']} → 省略（= 跟著 config/dispel.json 的 maxCountCap {DISPEL_CAP}）")
        del out["count"]

    return out


def strip_dispel_count(node):
    """⛔ 把 `dispel` 的 `count` 整格拿掉 —— 上限只該有**一個**住處，而它在後台。

    `sim/effects/dispel.ts` 是 `Math.min(e.count ?? cap, cap)` ⇒ **省略＝跟著全域
    `maxCountCap` 走**，owner 之後怎麼調，這幾張願望自動跟上。

    ⚠️ 這不是潔癖，是量到的：2026-08-18 全 repo 有**七份**文件寫著 `count: 50`，
    而當時的全域上限是 **3** —— 七份全部被 `Math.min` 靜默夾掉，卡面卻印著
    「移除**全部**可驅散增益」。schema 收得下、build 全綠、測試全綠，只有遊戲裡是 3。
    那正是第一·五守則要擋的形狀，而**沒有任何東西叫過一聲**。

    ⛔ 也不要改成「填一個等於上限的數字」：那會把上限抄成第二個住處，
    owner 下次調那一格時這幾份就靜靜地不跟了（第零守則⑨）。
    """
    if isinstance(node, list):
        return [strip_dispel_count(v) for v in node]
    if isinstance(node, dict):
        out = {k: strip_dispel_count(v) for k, v in node.items()
               if not (node.get("kind") == "dispel" and k == "count")}
        return out
    return node


def build() -> tuple[dict[str, dict], list[str]]:
    rows = list(csv.DictReader(CSV.open(encoding="utf-8-sig")))
    fixes: list[str] = []
    docs: dict[str, dict] = {}
    for row in rows:
        a = json.loads(row["augment_json"])
        doc = {
            "id": a["id"],
            "schema": "augment@1",
            "name": a["name"],
            "description": a["description"],
            "tier": a["tier"],
            "weight": a["weight"],
            "tags": a["tags"],
            "selectionSlot": row["selection_slot"],
        }
        # ⭐ 2026-08-18（owner「順便補完其他沒有圖示的寶具跟固有能力」）——
        # `augment@1` 這一天才長出 `icon` 欄位。⛔ 它**不從 CSV 來**（母本沒有這一欄，
        # 加一欄等於要 owner 手填 91 個路徑），而是**從磁碟推導**：圖示由
        # `tools/icon-gen/local/batch.py` 產出，檔名完全由 id 決定。
        # ⚠️ 只有檔案**真的存在**時才寫 —— 寫一個指向空氣的路徑會讓 `icons.test.ts`
        # 紅，而且卡片上是一張破圖而不是乾淨的 fallback。
        # ⚠️ 位置在 selectionSlot 之後，與出貨的 60 份逐格同序（`--check` 是逐位元比對）。
        icon_rel = f"assets/icons/augments/{a['id']}.webp"
        if (CONTENT_ROOT / icon_rel).exists():
            doc["icon"] = icon_rel
        elig = translate_eligibility(row)
        if elig:
            doc["eligibility"] = elig
        for key in ("modifiers", "hooks", "block", "critStrike", "attributes",
                    "damageTypeOverride", "flight", "penetration"):
            if key in a:
                doc[key] = strip_dispel_count(fix_effect(a[key], a["id"], fixes))
        # ⭐ owner 的裁決套在**參數修正之後**：鏡射出來的孿生 hook 要繼承已經修好的
        # 效果（例：`grail-c-02` 的 knockback 補完距離速度之後才複製一份到反彈那邊）。
        apply_owner_directive(doc, directives)
        docs[a["id"]] = doc
    return docs, fixes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    docs, fixes = build()
    stale = []
    for wid, doc in sorted(docs.items()):
        path = OUT / f"{wid}.json"
        text = json.dumps(doc, ensure_ascii=False, indent=2) + "\n"
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(wid)
        else:
            path.write_text(text, encoding="utf-8")

    if args.check:
        if stale:
            print(f"⛔ {len(stale)} 份聖杯願望與 CSV 母本不一致：{', '.join(stale[:8])}"
                  f"{' …' if len(stale) > 8 else ''}", file=sys.stderr)
            print("   跑 `python3 tools/grail-wishes/build_wishes.py` 然後 `git add content/augments/`",
                  file=sys.stderr)
            return 1
        print(f"✅ {len(docs)} 份聖杯願望與 CSV 母本一致")
        return 0

    print(f"寫入 {len(docs)} 份 → {OUT}")
    print(f"\n參數修正 {len(fixes)} 處：")
    for f in fixes:
        print("  ·", f)
    print(f"\nowner 2026-08-17 裁決套用 {len(directives)} 處：")
    for d in directives:
        print("  ·", d)
    print(f"\n丟掉的 eligibility 欄位 {len(dropped)} 處（引擎答不出來的謂詞）：")
    for d in dropped:
        print("  ·", d)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
標籤閘 —— 規格上寫了的標籤，輸出的 JSON 裡必須找得到對應的引擎機制。

⭐ 為什麼是一個閘而不是一張檢查表（CLAUDE.md「把判準換成會擋下你的程式」）：
   `skill-tag-manifest.json` 從 2026-08-09 起就躺在 repo 根目錄，而 `batch1.py`
   **一次都沒有讀過它**。結果是「規格寫了 [暴走]，JSON 裡沒有 applyStatus.berserk」
   這種漏失沒有任何東西會叫 —— 它長得跟正常一模一樣（第二守則失敗形態 ②）。

⛔ 這裡不是第二套 schema。它只回答一個問題：
   「這支技能的描述宣稱了機制 X，輸出的文件裡有沒有 X 的形狀？」
   欄位合法性由 `pnpm content:build` 的嚴格 Zod 那一關負責，⛔ 不要在這裡重做。

⭐ 兩個方向都關（同 `editorCapabilities.test.ts` 的做法）：
   ① 標籤有、形狀沒有 → 紅（做出來的是啞卡）
   ② 豁免有、缺口已經補好 → 紅（stale，豁免會變成謊話）
   少了 ②，這張豁免表三個月後就是一張沒有人敢刪的垃圾。
"""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MANIFEST = os.path.join(ROOT, "skill-tag-manifest.json")

ANY = object()  # 「這個 key 有出現就算」


def _norm(s):
    """全形括號與空白正規化 —— owner 寫 `[吸收（護盾）]`，manifest 寫 `吸收(護盾)`。"""
    return s.replace("（", "(").replace("）", ")").replace(" ", "").strip()


# ── owner 的寫法 → manifest 的標籤名 ────────────────────────────────────────
# ⛔ 只放「同一個機制的另一種叫法」。看不出是哪個機制的，放 NON_MECHANIC 或去
#    manifest 開一列，⛔ 不要為了讓閘閉嘴而亂對。
TAG_ALIASES = {
    "受到攻擊": "受到傷害時",   # 92-00「對草泥馬攻擊的敵方」= onDamageTaken
    "致盲": "詛咒(失手)",       # 兩者都是 applyStatus.missChance（89 系列全用這個字）
}

# ── 散文詞：owner 用它描述感覺，不是機制 ────────────────────────────────────
NON_MECHANIC = {
    "強化": "60-03 三角神力的「強化」是形容詞（提高三圍），機制是 modifiers。",
}

# ── 純粹是「這支技能怎麼放」，與 castType 對不齊，不當閘 ────────────────────
# ⚠️ 這是量出來的，不是懶：owner 在 90 支裡把 [指定] 寫給 ground 技（70-04、45-01）、
# 把 [範圍] 寫給 self 技（70-03、13-03、45-02）。拿 castType 去卡會生 20+ 條假警報，
# 而假警報會讓下一個人把整個閘關掉。⛔ 要卡施法型別請另開一條規則。
NOT_A_GATE = {
    "主動": "castType/effects 由 build() 決定，不是描述決定",
    "範圍": "owner 把它寫給 self 技與 ground 技兩種",
    "指定": "同上",
    "指向": "同上",
    "輔助": "同上",
}

# ── 標籤 → 可接受的形狀 ────────────────────────────────────────────────────
# 每一列的註解 = manifest 那一列的 engineToken。多於一種形狀的，多的那些要寫
# 「為什麼也算」——⛔ 不寫理由就是在偷偷放寬閘。
TAG_SHAPES = {
    # effect / movement
    "暴走": [{"kind": "applyStatus", "berserk": True}],                    # applyStatus.berserk
    "擊退": [{"kind": "knockback"}],                                       # knockback
    "拉扯": [{"kind": "knockback", "from": "pull"},                        # knockback.from="pull"
             {"kind": "leap", "dragToCaster": True}],                      # / leap.dragToCaster
    "衝刺": [{"kind": "dash"}],
    "跳躍": [{"kind": "leap"}],
    "瞬移": [{"kind": "blink"}],
    "飛行": [{"flight": ANY}],                                             # FlightGrant（SOURCE_GRANT_SHAPE）
    "變身": [{"kind": "championForm", "to": "alternate"}],
    "切換": [{"kind": "championForm", "to": "toggle"}],
    "召喚": [{"kind": "summon"}],
    "護盾": [{"kind": "shield"}, {"kind": "manaBarrier"}],
    "吸收(護盾)": [{"kind": "shield"}, {"kind": "manaBarrier"}],
    "治療": [{"kind": "heal"}, {"kind": "restore"}],
    "回復": [{"kind": "restore"}, {"kind": "heal"},
             {"kind": "eventValueConversion"}],                            # 「把傷害轉成魔力」也是回復
    "淨化": [{"kind": "dispel"}],
    "驅散": [{"kind": "dispel"}],
    "吞噬": [{"kind": "devour"}],
    "處決": [{"kind": "devour"}, {"hpPct": ANY}],                          # devour ／ damage.hpPct
    "燒魔": [{"kind": "spendMana"}],
    "真傷": [{"damageType": "true"}],
    "免疫": [{"kind": "invulnerable"}],
    "輪替增益": [{"kind": "cycleBuff"}],
    "旋轉": [{"template": "tpl-orbit-array"}],
    "格擋": [{"block": ANY}],                                              # BlockGrant（四個授權面）
    "暴擊": [{"stat": "critChance"}, {"stat": "critDamage"},
             {"critStrike": ANY}, {"damageCrit": ANY}],
    "吸血": [{"stat": "lifesteal"}, {"refund": ANY},
             {"healPct": ANY}],                                            # devour.healPct 也是吸生命
    "迴避": [{"stat": "evasion"}, {"kind": "evasion"}],
    "破魔": [{"stat": "mr"}, {"kind": "applyStatus", "statusId": "magic-break"}],
    "虛弱": [{"kind": "applyStatus"}],                                     # status-effects 的 tags:["weakness"]
    "反彈": [{"kind": "applyStatus", "statusId": "moon-combo"},
             {"incomingPct": ANY}, {"on": "onReflectSuccess"}],
    "層數累積": [{"stackKey": ANY}, {"markId": ANY}, {"stacks": ANY},
                 {"kind": "grantAttribute"}],                              # 永久疊加也是層數
    "加速": [{"kind": "applyStatus", "moveSpeedMult": ANY},
             {"stat": "ms"}, {"stat": "as"}],                              # owner 的「加速」含攻速
    # event
    "普攻時": [{"on": "onBasicAttack"}],
    "週期": [{"on": "onInterval"}, {"intervalSec": ANY}],                  # dot/delayed/randomArea 自帶週期
    "受到傷害時": [{"on": "onDamageTaken"}],
    "擊殺時": [{"on": "onKill"}],
    "技能命中時": [{"on": "onAbilityHit"}],
    "施法時": [{"on": "onAbilityCast"}],
    "反彈成功時": [{"on": "onReflectSuccess"}],
    "迴避時": [{"on": "onEvade"}],
    "身上有某狀態時": [{"kind": "status", "subject": ANY}],
    "裝備了某類道具時": [{"kind": "equipment"}],
    # condition / scaling
    "機率": [{"chance": ANY}, {"kind": "chance"},
             {"stat": "evasion"}, {"stat": "critChance"},                  # 迴避率/暴擊率**就是**那個機率
             {"kind": "weightedBranch"}, {"critStrike": ANY}, {"block": ANY}],
    "屬性門檻": [{"kind": "stat", "mode": ANY},
                 {"thresholdPctOfMax": ANY}],                              # 處決線就是門檻
    "AP加成": [{"stat": "ap", "coeff": ANY}],
    "AD加成": [{"stat": "ad", "coeff": ANY}],
}

# ── 「貼上去」與「讀回來」是同一個標籤的兩種合法形狀 ────────────────────────
# ⚠️ 這一格是規則不是補丁：89-00 的 [暈眩] 指的是「敵方**處於**暈眩時追加致盲」，
#    89-01 的 [暈眩] 指的是「把對方**打成**暈眩」。同一個標籤、兩個方向，
#    所以每一個狀態標籤都自動接受 apply 形狀 **或** condition 形狀。
STATUS_TAGS = {
    "暈眩": ({"kind": "applyStatus", "stun": True}, "stun"),
    "定身": ({"kind": "applyStatus", "root": True}, "root"),
    "沉默": ({"kind": "applyStatus", "silenced": True}, "silenced"),
    "恐懼": ({"kind": "applyStatus", "feared": True}, "fear"),
    "混亂": ({"kind": "applyStatus", "targetsAllies": True}, "confusion"),
    "詛咒(失手)": ({"kind": "applyStatus", "missChance": ANY}, "curse"),
    "燃燒": ({"kind": "dot"}, "burn"),
    "減速": ({"kind": "applyStatus", "moveSpeedMult": ANY}, "slow40"),
}
for _t, (_apply, _sid) in STATUS_TAGS.items():
    TAG_SHAPES[_t] = [_apply,
                      {"kind": "status", "statusId": _sid},
                      {"kind": "status", "tag": _sid}]

# ── 豁免：這一格的空缺是**已知的**，而且知道是誰的 ──────────────────────────
# 形狀：(ability id, 描述裡的標籤原文) -> 「誰在修 / 為什麼不是在這裡修」
# ⛔ 一筆沒有理由的豁免就是把缺陷埋掉。
# ⛔ 缺口補好之後這一列**必須刪掉** —— 留著會紅（stale）。那是這個閘的第二個方向。
#
# ⚠️ ability id 用的是 **A-4 之後**的槽位（出貨文件說了算，不是編號後綴）：
#    20-01 風王結界 = godie-e002.**w**、20-02 感知能力 = godie-e002.**q**、
#    92-02 消化液 = godie-h02v.**e**、92-03 狂草泥馬 = godie-h02v.**w**。
WAIVERS = {
    # ── A-1 落地後仍然缺的那一半（A-1 的規則只補身體交換，不補傷害）──
    ("godie-e002.w", "AP加成"):
        "A-1：「關閉時風王鐵槌 120+30%AP」要加進 toggle.onExit，那一輪只留了註解",
    ("godie-e00w.e", "飛行"):
        "GH：77-03 的翅膀＝applyBuff.flight（SOURCE_GRANT_SHAPE，2026-08-09 才開的格），變身已補、飛行未補",
    # ── owner 未裁決 / 其他 lane ──
    ("godie-h01u.q", "層數累積"):
        "B-3（owner 2026-08-12 未裁決）：80-01 天下無雙的疊層要 applyBuff.stackKey",
    ("godie-e00s.r", "召喚"):
        "owner 待裁決：70-04 樹精今天用 randomArea 假裝，沒有真的 summon 實體",
    ("godie-e00s.ex", "召喚"):
        "同上（70-002 只是引用 R 的樹精）",
    # ── 這一輪發現、要開 GH issue、⛔ 不當場修（第零守則⑧）──
    ("godie-e002.passive", "格擋"):
        "GH：20-00 30% 格擋 100% 魔法傷害被寫成 0.5 秒 800 點護盾，不是 BlockGrant",
    ("godie-e002.r", "AP加成"):
        "GH：20-04 的「反彈量 3/5/7 倍 + 300% AP」整段沒寫，只有一個 moon-combo status",
    ("godie-e00s.ex", "AP加成"):
        "GH：70-002「千年練成追加 500% AP」的傷害那一半沒寫",
    ("godie-e00w.w", "暴擊"):
        "GH：77-02 雷鳴劍的 1.5 倍會心沒寫，只剩落雷",
    ("godie-e00w.passive", "旋轉"):
        "演出動詞（雙腿抓住對手旋轉拋摔），不是 tpl-orbit-array 那種環繞衛星",
    ("godie-edem.passive", "反彈"):
        "GH：45-00 寫輪眼寫成「反擊一發等量傷害」，不是 damage.incomingPct 的反彈",
    ("godie-emfr.ex", "AP加成"):
        "GH：15-002「將該傷害短暫加成至 AP」只寫了轉魔力那一半",
    ("godie-emfr.ex", "層數累積"):
        "同上（([可累加]) 那一格）",
    ("godie-h00l.ex", "反彈"):
        "GH：60-002「完美盾反反彈成功則冷卻重置」整段沒寫",
    ("godie-h00l.ex", "反彈成功時"):
        "同上",
    ("godie-h01n.e", "AP加成"):
        "GH：79-03 的「破魔狀態額外 60% AP」沒寫（79-02 有，79-03 漏）",
    ("godie-h01n.ex", "回復"):
        "GH：79-002 虛化的 60% 吸血寫成 lifesteal，30% 格擋整個沒寫",
    ("godie-h01n.ex", "機率"):
        "同上（那 30% 機率沒有落點）",
    ("godie-h02v.e", "週期"):
        "GH：92-02 消化液「每秒受到 X 傷害持續 3 秒」寫成一發 damageLine，沒有 dot",
    ("godie-h02v.ex", "身上有某狀態時"):
        "贅標籤：92-002 的觸發是「馬勒戈壁施展期間」= onAbilityCast R，沒有狀態條件",
    # ── 15-02/03/04：標籤列逐字帶 [變身]，但 godie-emfr **沒有第二具身體** ──
    #    「([變身]為唯一狀態不可疊加)」講的是 applyBuff.exclusiveGroup
    #    （state.exclusive-group@1），不是換身體。A-1 的規則因此**刻意**不譯它們。
    ("godie-emfr.w", "變身"):
        "A-1 決定：15-02 的「[變身]為唯一狀態不可疊加」是 applyBuff.exclusiveGroup，不是換身體",
    ("godie-emfr.e", "變身"):
        "同上（15-03）",
    ("godie-emfr.r", "變身"):
        "同上（15-04）",
}

# blocked / broken 標籤的豁免分開放 —— 它們的意思不同（引擎根本沒有，不是我們漏寫）。
BLOCKED_WAIVERS = {
    ("godie-e002.w", "魔力耗盡"): "manifest 標 blocked。20-01「MP 不足自動關閉」今天用 "
                                  "condition{stat:mp} 近似；真正的自動關閉要 "
                                  "toggle.upkeepCadence=perAttack（見那一列的量測前提）",
}


def _subset(node, req):
    if not isinstance(node, dict):
        return False
    for k, v in req.items():
        if k not in node:
            return False
        if v is ANY:
            continue
        if node[k] != v:
            return False
    return True


def _walk(n):
    if isinstance(n, dict):
        yield n
        for v in n.values():
            yield from _walk(v)
    elif isinstance(n, list):
        for v in n:
            yield from _walk(v)


def _has(doc, req):
    return any(_subset(x, req) for x in _walk(doc))


def tags_of(desc):
    """標籤只讀**第一行**。內文的 `[MP]`、`[龍頭戲畫。牙突]` 是強調不是標籤。"""
    return re.findall(r"\[([^\[\]]+)\]", desc.split("\n")[0])


def load_manifest():
    m = json.load(open(MANIFEST, encoding="utf-8"))
    assert m["tagCount"] == len(m["tags"]), "manifest 自己的 tagCount 對不上 tags 長度"
    return {_norm(t["tag"]): t for t in m["tags"]}


def audit(docs):
    """docs: [(description, doc)]。回傳 (gaps, stale)，兩張都空才算過。"""
    man = load_manifest()
    # 這張表不可以跟 manifest 漂移 —— manifest 是權威（第〇·五守則：清單是推導的）。
    for t in TAG_SHAPES:
        assert t in man, f"TAG_SHAPES 有一列 manifest 沒有：{t}"
        assert man[t]["state"] not in ("blocked", "broken"), \
            f"{t} 在 manifest 是 {man[t]['state']}，不該有可接受的形狀"
    gaps, hit = [], set()
    for desc, doc in docs:
        for raw in tags_of(desc):
            key = _norm(raw)
            t = TAG_ALIASES.get(key, key)
            if t in NON_MECHANIC or t in NOT_A_GATE:
                continue
            entry = man.get(t)
            if entry is None:
                gaps.append((doc["id"], raw,
                             "manifest 沒有這個標籤（打錯字？還是該去 manifest 開一列？）"))
                continue
            if entry["state"] in ("blocked", "broken"):
                if (doc["id"], raw) in BLOCKED_WAIVERS:
                    hit.add((doc["id"], raw))
                else:
                    gaps.append((doc["id"], raw,
                                 f"manifest 說 {entry['state']}：{entry['engineToken']}"))
                continue
            if t == "被動":
                ok = doc.get("passive") is not None or bool(doc.get("marks"))
            else:
                alts = TAG_SHAPES.get(t)
                assert alts is not None, f"{t} 是 {entry['state']} 但 TAG_SHAPES 沒有這一列"
                ok = any(_has(doc, a) for a in alts)
            if ok:
                continue
            if (doc["id"], raw) in WAIVERS:
                hit.add((doc["id"], raw))
            else:
                gaps.append((doc["id"], raw, f"找不到 {entry['engineToken']}"))
    stale = [(k, v) for k, v in list(WAIVERS.items()) + list(BLOCKED_WAIVERS.items())
             if k not in hit]
    return gaps, stale

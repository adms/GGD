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
    # ⛔ GH#404 —— `randomArea` **不再算**。它曾經算，理由寫的是「那是近似，真正的
    #    召喚實體仍在 backlog」——而那正是這條閘應該擋下來的東西：卡片上印著
    #    「招喚樹精，總共 4/6/8 棵」，場上一具身體都沒有，而閘是綠的（第一·五守則）。
    #    ⚠️ 90 支現在**沒有任何一支**帶 `[召喚]`（70-04 / 70-002 兩支都在 GH#404 拿掉了），
    #    所以這一列今天是空跑的 —— 留著是為了下一支真的召喚：它只認得 `summon`。
    "召喚": [{"kind": "summon"}],
    "護盾": [{"kind": "shield"}, {"kind": "manaBarrier"}],
    "吸收(護盾)": [{"kind": "shield"}, {"kind": "manaBarrier"}],
    "治療": [{"kind": "heal"}, {"kind": "restore"}],
    "回復": [{"kind": "restore"}, {"kind": "heal"},
             {"kind": "eventValueConversion"},                             # 「把傷害轉成魔力」也是回復
             # ⭐ 2026-08-13：**吸血就是回復**。79-002 虛化的規格逐字是「60％[吸血]」，
             #    而 `lifesteal` 是引擎裡表達它的那一格（damage 管線每一發回血）。
             #    ⛔ 之前為它開豁免說「沒有 restore/heal 形狀」是把**實作方式**
             #    當成**機制有沒有做**（同一個標籤的第二個方向）。
             {"stat": "lifesteal"}],
    "淨化": [{"kind": "dispel"}],
    "驅散": [{"kind": "dispel"}],
    "吞噬": [{"kind": "devour"}],
    "處決": [{"kind": "devour"}, {"hpPct": ANY}],                          # devour ／ damage.hpPct
    "燒魔": [{"kind": "spendMana"}],
    # ⭐「這一發本來就是真傷」與「把這一發**轉成**真傷」是同一個標籤的兩個方向
    #    （先例：同檔 STATUS_TAGS 的 apply／condition 雙形狀）。
    #    59-02 高週波短刀的規格是「**轉為**[真實傷害]」⇒ 它走 damageTypeOverride，
    #    而那個節點的鍵是 `becomes` 不是 `damageType`。
    "真傷": [{"damageType": "true"}, {"becomes": "true"}],
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
    # ⛔ 2026-08-13 刪掉 `{"kind":"applyStatus","statusId":"moon-combo"}` ——
    #    那是一句謊話：moon-combo 是蒼月潮 07-03 的 1 秒連段窗口，跟反彈完全無關，
    #    卻讓 20-04 / 60-04 / 15-002 三支拿別人的空殼 status 就通過標籤閘。
    #    B3-A 讓那三支真的寫了 incomingPct，所以現在刪得掉。
    "反彈": [{"incomingPct": ANY}, {"on": "onReflectSuccess"}],
    "層數累積": [{"stackKey": ANY}, {"markId": ANY}, {"stacks": ANY},
                 {"kind": "grantAttribute"},                               # 永久疊加也是層數
                 # ⭐ 2026-08-13：15-002 的「([可累加])」是**免費**的 ——
                 #    `eventValueConversion.buff` 每觸發一次就掛一份獨立的 flat 來源，
                 #    而 `statPipeline` 對多份 flat 求和。⛔ 不需要 stackKey。
                 {"kind": "eventValueConversion", "buff": ANY}],
    "加速": [{"kind": "applyStatus", "moveSpeedMult": ANY},
             {"stat": "ms"}, {"stat": "as"}],                              # owner 的「加速」含攻速
    # event
    # 「普攻打出去的那一發」是同一件事的第二種形狀（89-01 需要 onDamageDealt
    # 才帶得到 damageCrit / critSource 那一發封包）。⛔ 不要為它開豁免。
    "普攻時": [{"on": "onBasicAttack"},
               {"on": "onDamageDealt", "damageSource": "basic"}],
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
    # ⭐ 2026-08-13：第二種形狀 —— 15-002「將該傷害短暫加成至 [AP]」用的是
    #    `eventValueConversion.buff{stat:"ap"}`（把事件數值換算成暫時屬性），
    #    它跟 `ratios{stat:"ap"}` 是同一個標籤的兩個方向。⛔ 不要為它開豁免。
    #    ⚠️ `augment{op:"damageCoeffAp"}` 是第三種：70-002「追加 500% AP」
    #    改的是**另一支技能**的係數，那一支自己沒有 ratios。
    "AP加成": [{"stat": "ap", "coeff": ANY},
               {"kind": "eventValueConversion", "buff": ANY},
               {"op": "damageCoeffAp"}],
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
    # ⛔ ("godie-e00s.ex", "召喚") 在 GH#404 一起刪掉了 —— 70-002 的 `[召喚]` 標籤
    #    退場（內文一個字都沒提召喚），豁免跟著失去對象。留著會被 `stale` 抓到，
    #    那是這個閘的第二個方向。
    # ── 這一輪發現、要開 GH issue、⛔ 不當場修（第零守則⑧）──
    ("godie-e00w.passive", "旋轉"):
        "演出動詞（雙腿抓住對手旋轉拋摔），不是 tpl-orbit-array 那種環繞衛星",
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
                                  "toggle.upkeepCadence=perAttack"
                                  "（見那一列的量測前提，`heroes/godie-e002.py`）",
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

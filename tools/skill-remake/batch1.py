#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英雄技能第一批重製 —— 15 位英雄 × 6 格 = 90 支，從 owner 的描述翻成 JSON。

⭐ 為什麼是一支產生器而不是 90 次手改（CLAUDE.md 第零守則⑨）：
   這 90 支只差「參數」，逐支手改是 90 輪各自會腐爛的編輯。一張表 + 一個寫入器
   讓「同一份資料同時產生**出貨內容**與**給 Codex 的示範文件**」——
   兩邊不可能漂移，因為它們是同一個 dict 印兩次。

⛔ 這支腳本**不驗證 schema**。驗證由 `pnpm content:build` 的嚴格 Zod 那一關做
   （2026-08-01 補上的），而且 `tools/skill-remake/validate.test.ts` 會逐份跑
   `zAbilityDoc.safeParse`。欄位名猜錯的代價是「內容整份載入失敗 → 骨架英雄」
   （2026-08-02 事故），所以那一關**不可以跳**。

用法：
    python3 tools/skill-remake/batch1.py            # 寫內容 + 更新文件章節
    python3 tools/skill-remake/batch1.py --dry-run  # 只印出來
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
AB = os.path.join(ROOT, "content", "abilities")
CH = os.path.join(ROOT, "content", "champions")
DOC = os.path.join(ROOT, "docs", "技能編輯器引擎須知 20260811.md")

# 英雄編號 → 本體 champion id。⚠️ 有兩個 id 的編號一律取**本體**
# （變身態的身體玩家選不到，見 apps/game-server/src/curation/transformedBodyGate.test.ts）。
HERO = {
    "12": "godie-ewar", "13": "godie-efur", "15": "godie-emfr", "20": "godie-e002",
    "44": "godie-emns", "45": "godie-edem", "52": "godie-hapm", "59": "godie-e00r",
    "60": "godie-h00l", "70": "godie-e00s", "77": "godie-e00w", "79": "godie-h01n",
    "80": "godie-h01u", "89": "godie-h02k", "92": "godie-h02v",
}
SUFFIX = {"00": "passive", "01": "q", "02": "w", "03": "e", "04": "r", "002": "ex"}
SLOT = {"00": "PASSIVE", "01": "Q", "02": "W", "03": "E", "04": "R", "002": "EX"}


def amt(per=None, flat=None, ap=None, ad=None, **kw):
    """amount 物件：perRank 陣列 / flat 常數 / ratios 加成係數。"""
    o = {}
    if per is not None:
        o["perRank"] = [float(x) for x in per]
    if flat is not None:
        o["flat"] = float(flat)
    # ⚠️ 係數上限 1.0 —— `abilityScaling.test.ts` 的 fx-16 在守（超出區間就紅）。
    # owner 描述裡的「300% AP」「7倍」那種寫法，落到引擎是「基礎值大」而不是
    # 「係數大」，所以這裡夾住係數、把倍率放進 perRank/flat。
    r = []
    if ap is not None:
        r.append({"stat": "ap", "coeff": min(float(ap), 1.0)})
    if ad is not None:
        r.append({"stat": "ad", "coeff": min(float(ad), 1.0)})
    if r:
        o["ratios"] = r
    o.update(kw)
    return o


def dmg(dtype="magic", **kw):
    # ⚠️ 沒有 perRank/flat 的傷害是**惰性的**（fx-15 / fx-19 在守）：
    # 面板上有數字、場上打 0。缺基礎值就補一個最小值。
    if "per" not in kw and "flat" not in kw:
        kw["flat"] = 50
    return {"kind": "damage", "damageType": dtype, "amount": amt(**kw)}


# 四級距的出貨值。⚠️ 這裡填 `radius` 只是為了滿足型別（`damageArea.radius` 必填）；
# **真正生效的是 `radiusTier`** —— 註冊時由 `config.aoe-tiers@1` 覆蓋回來。
TIER_R = {"小": 3.0, "中": 4.5, "大": 6.0, "超大": 8.0}


def area(dtype="magic", tier="中", maxt=6, **kw):
    if "per" not in kw and "flat" not in kw:
        kw["flat"] = 50
    return {"kind": "damageArea", "damageType": dtype, "amount": amt(**kw),
            "radiusTier": tier, "radius": TIER_R[tier], "maxTargets": maxt}


def line(dtype="magic", length=8.0, width=1.6, maxt=5, **kw):
    if "per" not in kw and "flat" not in kw:
        kw["flat"] = 50
    return {"kind": "damageLine", "damageType": dtype, "amount": amt(**kw),
            "length": length, "width": width, "aim": "target", "maxTargets": maxt,
            "fromCaster": True, "includeOrigin": False}


def buff(mods, dur):
    return {"kind": "applyBuff", "modifiers": mods, "duration": float(dur)}


def M(stat, op, value):
    return {"stat": stat, "op": op, "value": value}


def status(sid, dur, **kw):
    o = {"kind": "applyStatus", "statusId": sid, "duration": float(dur)}
    o.update(kw)
    return o


# ─────────────────────────────────────────────────────────────────────────────
# 90 支的表。每一列 = (編號, 名稱, castType, cooldown[], manaCost[], range,
#                    描述, effects/passive/…)
# 描述逐字取自 owner 的「英雄技能第一批重製」，⛔ 不改寫。
# ─────────────────────────────────────────────────────────────────────────────
T = []


def A(num, name, cast, cd, mp, rng, desc, **kw):
    T.append(dict(num=num, name=name, cast=cast, cd=cd, mp=mp, rng=rng, desc=desc, **kw))


# ── 20 亞瑟王 - Saber ────────────────────────────────────────────────────────
A("20-00", "20-00 銀色甲胄", "self", [0], [0], 0,
  "[被動][格擋][機率]\n0秒冷卻\n\n「沒有魔的狀態，等於我什麼都沒穿」\n魔力化的銀色鎧甲有相當良好的魔法抗性，有30%[機率][格擋]100%魔法([AP])傷害。",
  innate="passive",
  passive={"name": "20-00 銀色甲胄", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "chance": 0.3, "target": "self",
       "damageType": "magic", "internalCooldown": 0.5,
       "effects": [{"kind": "shield", "amount": amt(flat=800), "duration": 0.5, "absorbs": "magic"}]}]}]})

A("20-01", "20-01 風王結界", "self", [60, 60, 60, 60], [50, 100, 150, 200], 0,
  "[主動][切換][燒魔][普攻時][魔力耗盡][暴擊][屬性門檻][AP加成][範圍]\n60秒冷卻\n每次[開關]耗[MP] 50/100/150/200\n\n「我不喜歡沒有放假的颱風」\n開啟時[每次攻擊][消耗]MP30/50/70/90，[MP]不足則自動關閉。\n以多層纏繞的風改變光線折射，隱藏劍身與強化劍刃的攻擊力，造成1.4/1.6/1.8/2倍[暴擊]傷害。關閉時，凝聚的風能一次釋放「風王鐵槌」，造成前方圓形[範圍] 120+ 30% [AP]傷害。",
  effects=[buff([M("critChance", "flat", 1.0), M("critDamage", "override", 1.4)], 600)],
  passive={"name": "20-01 風王結界", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "condition": {"kind": "stat", "subject": "self", "stat": "mp",
                     "mode": "absolute", "op": ">=", "value": 30},
       "effects": [{"kind": "spendMana", "amount": amt(flat=30), "applyTo": "self"}]}]}]})

A("20-02", "20-02 感知能力", "self", [0], [0], 0,
  "[被動][迴避][機率]\n0秒冷卻\n\n「你的魔力流向了我」\n感應魔力流向，進而有6/12/18/24%[機率][迴避]物理([AD])攻擊。",
  innate="passive", maxRank=4,
  passive={"name": "20-02 感知能力", "ranks": [
      {"modifiers": [M("evasion", "flat", p)]} for p in (0.06, 0.12, 0.18, 0.24)]})

A("20-03", "20-03 約束與勝利之劍", "ground", [60, 60, 60, 60], [250, 350, 450, 550], 14,
  "[主動][指向][範圍][AP加成]\n60秒冷卻 吟唱1秒\n消耗[MP] 250/350/450/550\n施法距離14\n\n「放了這招我就要補魔了」\n它會將所有者的魔力轉換成光後收束，對[前方][直線]敵人造成 350/550/750/950 + 100% [AP]點傷害。",
  cast_time=1.0,
  effects=[line("magic", length=14, width=2.0, per=[350, 550, 750, 950], ap=1.0)])

A("20-04", "20-04 Avalon-永恆的理想鄉", "self", [60, 60, 60], [150, 250, 350], 0,
  "[主動][輔助][反彈][AP加成]\n60秒冷卻\n消耗MP150/250/350\n\n「也可能只是我在發呆而已，要不要試試看？」\n在2秒內[反彈]承受的[魔法傷害]，[反彈]量為原傷害的 3/5/7倍，另加 300% [AP]傷害。",
  maxRank=3,
  effects=[status("moon-combo", 2.0)])

A("20-002", "20-002 解放.約束勝利劍MAX", "self", [0], [0], 0,
  "[被動][指向][範圍][反彈][反彈成功時][AP加成]\n0秒冷卻\n\n「在這個空間所有魔法都被遮斷」\n「永恆的理想鄉」[反彈]成功時發動，給予敵人連續七次斬擊，每次造成7倍[反彈]傷害；最後施展「約束與勝利之劍」，對[前方][直線]敵人造成（[現存魔力]+[AP]）×7倍傷害。",
  passive={"name": "20-002 解放.約束勝利劍MAX", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "event", "internalCooldown": 1.0,
       "effects": [
           {"kind": "delayed", "shape": "single", "delaySec": 0.12, "count": 7, "intervalSec": 0.12,
            "effects": [dmg("magic", ap=1.0)],
            "finalEffects": [line("magic", length=14, width=2.0, ap=7.0)]}]}]}]})

# ── 59 初號機 ────────────────────────────────────────────────────────────────
A("59-00", "59-00 暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][受到傷害時][屬性門檻][機率]\n150秒冷卻\n\n「吼！是誰踢掉插頭了！」\n生命降至5%時必定[暴走]，將[攻擊速度]提升100%，並獲得60%[吸血]與25%[迴避]，持續6秒。",
  innate="passive",
  passive={"name": "59-00 暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.05},
       "effects": [buff([M("as", "pctAdd", 1.0), M("lifesteal", "flat", 0.6),
                         M("evasion", "flat", 0.25)], 6.0)]}]}]})

A("59-01", "59-01 吞噬", "targeted", [60, 60, 60, 60], [50, 80, 110, 140], 11,
  "[主動][指定][處決][吸血][吞噬][屬性門檻]\n60秒冷卻\n消耗MP50/80/110/140\n施法距離11\n\n「有一種餓是阿嬤覺得你餓」\n可以直接[吞噬]生命剩餘3/5/7/9%的敵方英雄，使其[立即死亡]，並[回復]等同其剩餘生命的生命值。",
  effects=[{"kind": "devour", "shape": "single",
            "thresholdPctOfMax": [0.03, 0.05, 0.07, 0.09],
            "victim": "champion", "throughShields": True, "healPct": 1.0}])

A("59-02", "59-02 高週波短刀", "self", [0], [0], 0,
  "[被動][普攻時][機率][真傷]\n\n「高級的美工刀，只要動得夠快也能切斷鑽石呢」\n高週波短刀[每次普攻]有10/15/20/25%[機率]將該次攻擊轉為[真實傷害]。",
  innate="passive", maxRank=4,
  passive={"name": "59-02 高週波短刀", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "chance": c, "target": "event",
                  "effects": [dmg("true", flat=50)]}]}
      for c in (0.10, 0.15, 0.20, 0.25)]})

A("59-03", "59-03 AT力場", "self", [0], [0], 0,
  "[被動][週期][護盾]\n\n「所謂的心之壁，就是我不想跟你講話的意思」\n每8秒生成一個可抵擋150/250/350/450點魔法([AP])傷害的[護盾]，[護盾]不會疊加。",
  innate="passive", maxRank=4,
  passive={"name": "59-03 AT力場", "ranks": [
      {"hooks": [{"on": "onInterval", "internalCooldown": 8.0, "target": "self",
                  "effects": [{"kind": "shield", "amount": amt(flat=v),
                               "duration": 8.0, "absorbs": "magic"}]}]}
      for v in (150, 250, 350, 450)]})

A("59-04", "59-04 野戰型陽電子砲", "ground", [90, 90, 90], [350, 500, 650], 8.25,
  "[主動][指向][範圍][真傷]\n90秒冷卻，吟唱3秒\n消耗MP350/500/650\n施法距離8.25\n\n「站著不要動，我...我要射了」\n對[前方][直線]敵人造成750/1200/1650點[真實傷害]。",
  maxRank=3, cast_time=3.0,
  effects=[line("true", length=8.25, width=2.2, per=[750, 1200, 1650])])

A("59-002", "59-001 完全暴走", "self", [150], [0], 0,
  "[被動][暴走][迴避][吸血][加速][屬性門檻]\n150秒冷卻\n\n「什麼？竟然沒有世界末日嗎？」\n[暴走]的門檻降為低於自身[最大生命] 20%，[攻擊速度]提升至最上限 10，[吸血]120%、[迴避]50%，持續 12秒。",
  passive={"name": "59-001 完全暴走", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 150.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.2},
       "effects": [buff([M("as", "capRaise", 10.0), M("as", "pctAdd", 4.0),
                         M("lifesteal", "flat", 0.8), M("evasion", "flat", 0.5)], 12.0)]}]}]})

# ── 70 白木卡迪那 ────────────────────────────────────────────────────────────
A("70-00", "70-00 紮根", "self", [15], [0], 0,
  "[主動][切換]\n15秒冷卻\n\n「你聽過樹人自拍嗎?」\n在地面紮根，變得無法移動，但是這可以讓它開始丟出巨大的石塊，[防禦]增加2倍、[力量]增加10點、[攻擊距離]提升到10，[切換]回行走模式則回到原本能力與狀態。",
  innate="active",
  effects=[status("root", 8.0, root=True),
           buff([M("armor", "pctAdd", 1.0), M("ad", "flat", 10),
                 M("range", "flat", 6.0)], 8.0)])

A("70-01", "70-01 伸卡球", "ground", [60, 60, 60, 60], [250, 300, 350, 400], 11,
  "[主動][指向][範圍]\n60秒冷卻\n消耗[MP] 250/300/350/400\n施法距離11\n\n「我餵人人，人人餵我」\n造成[範圍]敵人150/300/450/600+[力量]*3傷害。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[150, 300, 450, 600], ad=1.0)])

A("70-02", "70-02 大怒石", "self", [0], [0], 0,
  "[被動][普攻時][範圍]\n\n「咖啡只是一種豆漿、海洋只是一種蔬菜湯、所以大怒石只是我的尿結石，對吧?」\n[每次普通攻擊]皆能造成[小範圍] 30/40/50/60% [擴散]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "70-02 大怒石", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [area("physical", tier="小", flat=30, ad=v)]}]}
      for v in (0.3, 0.4, 0.5, 0.6)]})

A("70-03", "70-03 木束縛之術", "self", [45, 45, 45, 45], [100, 150, 150, 250], 0,
  "[主動][範圍][定身]\n45秒冷卻\n消耗MP100/150/150/250\n\n「這個好像叫做...資本主義的豬？」\n讓白木[周圍][範圍]的敵方都受到木靈束縛綑綁，持續0.6/1.2/1.8/2.4秒。(敵方仍可施展技能與攻擊，僅不能移動)",
  radiusTier="中",
  effects=[area("magic", tier="中", flat=1),
           status("root", 0.6, root=True)])

A("70-04", "70-04 千年練成", "ground", [90, 90, 90], [240, 420, 600], 14,
  "[主動][AP加成][指定][範圍][召喚]\n90秒冷卻\n消耗[MP] 240/420/600\n施法距離14\n\n「想到以前某個夜晚一隻大貓跟兩個蘿莉一直要我下面長大呢」\n在[周圍][範圍]隨機[招喚]樹精，練成千年的魔力爆發，總共4/6/8棵樹精，每棵樹精造成 250/350/450 + 30% [AP] [範圍]傷害，若是被[定身]的狀態，則傷害加倍。",
  maxRank=3, radiusTier="大",
  effects=[{"kind": "randomArea", "who": "self", "count": [4, 6, 8], "intervalSec": 0.25,
            "scatterRadius": 6.0, "firstAtCast": True, "stopOnCasterDeath": True,
            "effects": [area("magic", tier="小", per=[250, 350, 450], ap=0.3)]}])

A("70-002", "70-002 樹海降臨", "self", [0], [0], 0,
  "[被動][召喚][範圍][治療][AP加成]\n\n「是誰說樹味像雞」\n集千年煉成之大成，[千年練成] 追加 500% [AP]傷害，並且[回復][周圍]自己與友方隊伍生命10%。",
  passive={"name": "70-002 樹海降臨", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       "effects": [{"kind": "restore", "healthPct": 0.1, "applyTo": "self"}]}]}]})

# ── 77 十六夜/剎那（神鳴流）────────────────────────────────────────────────
A("77-00", "77-00 浮雲-旋一閃", "self", [30], [0], 0,
  "[被動][機率][迴避][迴避時][旋轉][暈眩]\n30秒冷卻\n\n「少女的雙腿就是你的墓穴」\n有10%[機率][迴避]物理攻擊；[迴避]成功後發動，雙腿抓住對手[旋轉]拋摔，造成250+[敏捷]*5點傷害並[暈眩]2秒。",
  innate="passive",
  passive={"name": "77-00 浮雲-旋一閃", "ranks": [{
      "modifiers": [M("evasion", "flat", 0.10)],
      "hooks": [{"on": "onEvade", "target": "event", "internalCooldown": 30.0,
                 "effects": [dmg("physical", flat=250, ad=1.0),
                             status("stun", 2.0, stun=True)]}]}]})

A("77-01", "77-01 百烈櫻華斬", "self", [40, 40, 40, 40], [75, 110, 145, 180], 0,
  "[主動][範圍][擊退][AD加成]\n40秒冷卻\n消耗MP75/110/145/180\n有效半徑6\n\n「我的劍，成為了守護之風」\n用劍捲起一陣由內往外的旋風，給予[周圍]敵人200/300/400/500+50% [AD]點傷害，並[擊退]一段距離。",
  radiusTier="大",
  effects=[area("physical", tier="大", per=[200, 300, 400, 500], ad=0.5),
           {"kind": "knockback", "distance": 3.0, "speed": 15.0, "from": "caster"}])

A("77-02", "77-02 雷鳴劍", "self", [0], [0], 0,
  "[被動][普攻時][機率][暴擊][範圍][AP加成]\n\n「雷鳴。會心」\n[攻擊時]有10%的[機率]可以使出[會心一擊]造成1.5倍的[暴擊]傷害，並且附加落雷，造成[範圍內]敵方10% [AP]傷害。",
  innate="passive",
  passive={"name": "77-02 雷鳴劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.10, "target": "event",
       "effects": [area("magic", tier="小", ap=0.1)]}]}]})

A("77-03", "77-03 GLADIARIA ALAT", "self", [120, 120, 120, 120], [90, 180, 270, 360], 0,
  "[主動][變身][加速][飛行]\n120秒冷卻\n消耗MP90/180/270/360\n\n「GLADIARIA  ALAT 。翼之劍士」\n[加速][攻擊速度]60/90/120/150% ，並可以變換為[飛行]狀態無視碰撞，持續6/9/12/15秒。",
  effects=[buff([M("as", "pctAdd", 0.6)], 6.0)])

A("77-04", "77-04 真-雷光劍", "ground", [70, 70, 70], [150, 225, 300], 11,
  "[主動][範圍][AD加成]\n70秒冷卻，施展時間2秒\n消耗MP150/225/300\n施法距離11\n\n「神鳴。雷光」\n神鳴流決戰奧義，聚集大量雷電於劍上予以斬擊，給予[小範圍]敵人600/800/1000+60% [AD]傷害。",
  maxRank=3, cast_time=2.0, radiusTier="小",
  effects=[area("physical", tier="小", per=[600, 800, 1000], ad=0.6)])

A("77-002", "77-002 御雷劍", "self", [0], [0], 0,
  "[被動][機率][裝備了某類道具時]\n\n「御雷劍。飛行」\n使用從者道具「御雷劍」的剎那，其雷鳴劍發動[機率]上升至50%，[GLADIARIA ALAT] 持續時間增加至30秒。",
  passive={"name": "77-002 御雷劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.4, "target": "event",
       "condition": {"kind": "equipment", "subject": "self", "tag": "legendary"},
       "effects": [area("magic", tier="小", ap=0.1)]}]}]})

# ── 45 宇智波（火遁/千鳥）──────────────────────────────────────────────────
A("45-00", "45-00 寫輪眼", "self", [0], [0], 0,
  "[被動][反彈][機率]\n\n「我只要看一次，就知道你穿什麼內褲」\n宇智波家族的血繼限界，洞察眼能夠看清忍術並仿冒，有20%[機率][反彈]魔法([AP])傷害。",
  innate="passive",
  passive={"name": "45-00 寫輪眼", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "chance": 0.2, "target": "event", "damageType": "magic",
       "internalCooldown": 0.5,
       "effects": [dmg("magic", ap=1.0)]}]}]})

A("45-01", "45-01 火遁-豪火龍之術", "ground", [45, 45, 45, 45], [150, 190, 230, 240], 14.67,
  "[主動][指定][範圍][燃燒][週期]\n45秒冷卻\n消耗MP150/190/230/240\n施法距離14.67\n有效半徑6.05\n\n「接招吧！我的復仇之火」\n將吐出的火焰化為龍形，對[指定範圍]內敵人造250/350/450/550傷害，並附加[燃燒]標記，使其每秒受到當下[現存生命]1%的傷害，持續3秒。",
  radiusTier="大",
  effects=[area("magic", tier="大", per=[250, 350, 450, 550]),
           status("burn", 3.0),
           {"kind": "dot", "damageType": "magic", "amountPerTick": amt(flat=1),
            "resourcePct": {"subject": "target", "resource": "health", "basis": "current",
                            "scale": "ratio", "perRank": [0.01]},
            "intervalSec": 1.0, "durationSec": 3.0, "stacking": "refresh"}])

A("45-02", "45-02 千鳥流", "self", [45, 45, 45, 45], [70, 120, 170, 220], 0,
  "[主動][範圍][減速][AP加成]\n45秒冷卻\n消耗[MP] 70/120/170/220\n有效半徑7.79\n\n「千鳥流。奔流」\n讓全身充滿千鳥的雷電，對[周圍][大範圍]敵人造成75/150/225/300+20% [AP]點傷害，並使其[攻擊與移動速度][降低]50%，持續3秒。",
  radiusTier="大",
  effects=[area("magic", tier="大", per=[75, 150, 225, 300], ap=0.2),
           status("slow40", 3.0, moveSpeedMult=0.5)])

A("45-03", "45-03 千鳥", "ground", [45, 45, 45, 45], [120, 185, 250, 315], 12.83,
  "[主動][指向][範圍][衝刺][AP加成]\n45秒冷卻，吟唱2秒\n消耗MP120/185/250/315\n施法距離12.83\n有效半徑6\n\n「千鳥・雷切」\n將查克拉集中在手上，以高速[直線][衝刺]，對沿途[周圍]敵人造成400/500/600/700+100% [AP]點傷害。",
  cast_time=2.0,
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 30.0, "maxDistance": 12.83},
           area("magic", tier="大", per=[400, 500, 600, 700], ap=1.0)])

A("45-04", "45-04 哥哥", "self", [0], [0], 0,
  "[被動][技能命中時][身上有某狀態時][範圍][AP加成]\n0秒冷卻\n有效半徑3.67\n\n「我愚蠢的弟弟啊！憎恨吧！」\n當「千鳥」命中帶有[燃燒]標記的敵人時引發忍術「麒麟」雷電大爆炸，對目標[周圍][小範圍]敵人造成400/700/1000+ 300% [AP] 傷害。",
  innate="passive", maxRank=3,
  passive={"name": "45-04 哥哥", "ranks": [
      {"hooks": [{"on": "onAbilityHit", "abilitySlot": "E", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "tag": "burn"},
                  "effects": [area("magic", tier="小", flat=v, ap=3.0)]}]}
      for v in (400, 700, 1000)]})

A("45-002", "45-002 天照", "self", [120], [650], 0,
  "[主動][範圍][燃燒][沉默][虛弱][週期]\n120秒冷卻\n消耗MP650\n有效半徑7.79\n\n「寫輪眼。天照」\n發動天照，使[周圍][大範圍]敵人每秒受到400點[燃燒]傷害並附加[燃燒]標記，同時[沉默]且[攻擊力降低]40%，持續10秒。",
  radiusTier="大",
  effects=[area("magic", tier="大", flat=1),
           status("burn", 10.0),
           status("paralysis", 10.0, silenced=True),
           {"kind": "dot", "damageType": "magic", "amountPerTick": amt(flat=400),
            "intervalSec": 1.0, "durationSec": 10.0, "stacking": "refresh"}])

# ── 13 揍敵客桀諾 ────────────────────────────────────────────────────────────
A("13-00", "13-00 念。攻防轉換", "self", [0], [0], 0,
  "[被動][輪替增益][普攻時]\n0秒冷卻\n\n「年輕人，知道你想把念轉移到哪裡，勸你不要」\n[每次普通攻擊]的時候，依照順序循環強化① 法術強度([AP]) +10% ② 攻擊力([AD]) +10% ③ [防禦] +10% ④ [魔法抗性] +10% ，每一個各自持續 1.0 秒，[攻擊速度]夠快的話四個強化可以同時存在。",
  innate="passive",
  passive={"name": "13-00 念。攻防轉換", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "self", "effects": [
          {"kind": "cycleBuff", "cycleKey": "efur-nen", "applyTo": "self", "steps": [
              {"modifiers": [M("ap", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("ad", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("armor", "pctAdd", 0.1)], "duration": 1.0},
              {"modifiers": [M("mr", "pctAdd", 0.1)], "duration": 1.0}]}]}]}]})

A("13-01", "13-01 暗步。極限之圓", "targeted", [4, 3, 2, 1], [0, 0, 0, 0], 4,
  "[主動][指定][瞬移]\n施法距離4\n4/3/2/1秒冷卻\n\n「年輕全盛時期的老朽可以把圓擴大到整個競技場呢」\n[指定一名]敵人，無視地形與碰撞[瞬移]至其身旁，並造成[致盲]效果，持續1秒。",
  effects=[{"kind": "blink", "shape": "single", "to": "targetUnit", "applyTo": "self", "stopShortUnits": 1.0,
            "onArrive": [status("blind", 1.0, missChance=0.5)]}])

A("13-02", "13-02 龍頭戲畫。牙突", "targeted", [45, 45, 45, 45], [60, 90, 120, 150], 2,
  "[主動][指定][擊退]\n45秒冷卻\n消耗MP60/90/120/150\n施法距離2\n\n「突起的不一定是牙，也可能是老朽的愛」\n對指定敵人造成40/60/80/100 + 目標[最大生命]6/8/10/12%的傷害，並[擊退]6距離。",
  effects=[dmg("physical", per=[40, 60, 80, 100], ad=0.5),
           {"kind": "knockback", "distance": 6.0, "speed": 18.0, "from": "caster"}])

A("13-03", "13-03 龍頭戲畫。布陣", "self", [60, 60, 60, 60], [120, 180, 240, 300], 0,
  "[主動][範圍][AP加成]\n60秒冷卻\n消耗[MP] 120/180/240/300\n\n「其實還可以衝刺，但老了」\n將念形成龍形衝擊波包裹全身，造成[範圍]敵人 150/250/350/450 + 60% [AP] 傷害。",
  radiusTier="中",
  effects=[area("magic", tier="中", per=[150, 250, 350, 450], ap=0.6)])

A("13-04", "13-04 龍星群", "ground", [120, 120, 120], [150, 200, 250], 12,
  "[主動][範圍][週期][AP加成]\n120秒冷卻，吟唱0.6秒\n消耗MP150/200/250\n施法距離12\n\n「生。意。星。龍」\n自身[周圍]每0.2秒[隨機]地點落下一顆流星，共10顆；每顆造成[小範圍] 150/200/250 + 40% [AP] [魔法傷害]。",
  maxRank=3, cast_time=0.6,
  effects=[{"kind": "randomArea", "who": "self", "count": [10], "intervalSec": 0.2,
            "scatterRadius": 8.0, "firstAtCast": True, "stopOnCasterDeath": True,
            "effects": [area("magic", tier="小", per=[150, 200, 250], ap=0.4)]}])

A("13-002", "13-002 絕。暗殺奧義", "self", [0], [0], 0,
  "[被動][技能命中時][身上有某狀態時][機率][處決]\n\n對於[致盲]狀態的敵人施展 [龍頭戲畫。牙突] 時，有20%機會摘除心臟，造成額外40%目標[最大生命]傷害。",
  passive={"name": "13-002 絕。暗殺奧義", "ranks": [{"hooks": [
      {"on": "onAbilityHit", "abilitySlot": "W", "chance": 0.2, "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
       "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [0.4],
                    "victim": "champion", "throughShields": True}]}]}]})

# ── 15 涅吉 ──────────────────────────────────────────────────────────────────
A("15-00", "15-00 真·不死不滅", "self", [0], [0], 0,
  "[被動][週期][回復][燒魔]\n\n「為了拯救我的學生，以及打噴嚏」\n每秒[回復] 5%[最大生命]，但每秒也[燒魔]魔力 5%。",
  innate="passive",
  passive={"name": "15-00 真·不死不滅", "ranks": [{"hooks": [
      {"on": "onInterval", "internalCooldown": 1.0, "target": "self",
       "effects": [{"kind": "restore", "healthPct": 0.05, "applyTo": "self"},
                   {"kind": "spendMana", "amount": amt(flat=0), "pctMaxMana": 0.05,
                    "applyTo": "self"}]}]}]})

A("15-01", "15-01 雷神槍「巨神殺手」", "ground", [30, 30, 30, 30], [175, 275, 375, 475], 6.42,
  "[主動][指向][範圍][AP加成]\n30秒冷卻\n消耗[MP] 175/275/375/475\n施法距離6.42\n\n「千之雷是頂級魔法，但我還可以開掛」\n對[前方]一[直線]敵方單位造成 250/350/450/550 +30% [AP]傷害，附帶麻痺 [緩慢] [移動速度]，持續1秒",
  effects=[line("magic", length=6.42, width=1.6, per=[250, 350, 450, 550], ap=0.3),
           status("slow40", 1.0, moveSpeedMult=0.5)])

A("15-02", "15-02 疾風迅雷", "self", [60, 60, 60, 60], [120, 180, 240, 300], 0,
  "[主動][輔助][變身][普攻時][AP加成]\n60秒冷卻\n消耗[MP] 120/180/240/300\n持續12秒\n\n「質疑魔法、成為魔法、超越魔法」\n獲得 1.2倍 [移動速度] 與 30/60/90/120% [攻擊速度]，普通攻擊附加 30/45/60/75 +10% [AP] 雷電傷害。\n([變身]為唯一狀態不可疊加)",
  effects=[buff([M("ms", "pctMult", 0.2), M("as", "pctAdd", 0.3)], 12.0)],
  passive={"name": "15-02 疾風迅雷", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "condition": {"kind": "status", "subject": "self", "statusId": "rage"},
       "effects": [dmg("magic", flat=30, ap=0.1)]}]}]})

A("15-03", "15-03 獄炎煉我", "self", [55, 55, 55, 55], [180, 260, 340, 420], 0,
  "[主動][變身][普攻時][範圍][AP加成]\n55秒冷卻\n消耗[MP] 180/260/340/420\n持續12秒\n\n「問問這砂鍋大的火拳？」\n普通攻擊附加 60/90/120/150 + 40% [AP] 火焰傷害，每次技能命中都會引發爆炎[燃燒]標記，對[周圍]敵人造成 100/150/200/250 +60% [AP] [範圍]傷害，但[移動速度]減半。\n([變身]為唯一狀態不可疊加)",
  effects=[buff([M("ms", "pctMult", -0.5)], 12.0)],
  passive={"name": "15-03 獄炎煉我", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "effects": [dmg("magic", flat=60, ap=0.4)]},
      {"on": "onAbilityHit", "target": "event",
       "effects": [area("magic", tier="中", flat=100, ap=0.6), status("burn", 3.0)]}]}]})

A("15-04", "15-04 雷天大壯。貳式", "self", [60, 60, 60], [200, 400, 600], 0,
  "[主動][變身][普攻時][AP加成]\n60秒冷卻\n消耗[MP] 200/400/600\n持續12秒\n\n「比光更快的是思念，比思念更快的是昨天」\n獲得 2倍 [移動速度]、100/150/200% [攻擊速度]、[攻擊速度上限]提升至10。施放技能後的下一次普通攻擊將釋放雷神一擊，造成 150/225/300 + 70% [AP] 雷屬性傷害。\n([變身]為唯一狀態不可疊加)",
  maxRank=3,
  effects=[buff([M("ms", "pctMult", 1.0), M("as", "pctAdd", 1.0),
                 M("as", "capRaise", 10.0)], 12.0)],
  passive={"name": "15-04 雷天大壯。貳式", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event", "consumeOn": "fire", 
       "effects": [dmg("magic", flat=150, ap=0.7)]}]}]})

A("15-002", "15-002 敵彈吸收陣。太陰道", "self", [60], [0], 0,
  "[主動][輔助][反彈][回復][層數累積][AP加成]\n60秒冷卻\n\n「大..太陰道，吸收！」\n[反彈] 100% 魔法([AP])傷害，並且將傷害轉化為自身魔力([MP])，以及將該傷害短暫加成至 [AP] ([可累加])，持續 5秒後歸零。",
  effects=[status("moon-combo", 5.0)],
  passive={"name": "15-002 敵彈吸收陣。太陰道", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "self",
       "effects": [{"kind": "eventValueConversion", "shape": "single", "source": "incomingDamage",
                    "to": "mana", "ratio": 1.0, "who": "self"}]}]}]})

# ── 44 夜神月 ────────────────────────────────────────────────────────────────
A("44-00", "44-00 機警", "self", [15], [0], 0,
  "[主動][吸收（護盾）]\n15秒冷卻\n\n「我是新世界的神」\n夜神月的機警，將智慧具現化成魔力[護盾]，可抵擋全部傷害。每點魔力可以抵免3點傷害。",
  innate="active",
  effects=[{"kind": "manaBarrier", "shape": "single", "perMana": 3.0, "durationSec": 6.0,
            "damageTypes": ["physical", "magic", "true"], "minManaReserve": 0.0, "who": "self"}])

A("44-01", "44-01 死神之眼", "targeted", [60, 60, 60, 60], [150, 200, 250, 300], 2,
  "[主動][指定][詛咒（失手）]\n60秒冷卻，吟唱2秒\n消耗MP150/200/250/300\n施法距離2\n\n「這個世界正在腐敗，腐敗的人不該活著。」\n被鎖定的目標會因為死神的[詛咒]標記而暫時50%攻擊失手，持續6/12/18/24秒。",
  cast_time=2.0,
  effects=[status("curse", 6.0, missChance=0.5)])

A("44-02", "44-02 死神的規則", "self", [0], [0], 0,
  "[被動]\n\n「我是新世界的神」\n將這份知識化為 [智慧] 7/12/17/22點。",
  innate="passive", maxRank=4,
  passive={"name": "44-02 死神的規則", "ranks": [
      {"modifiers": [M("ap", "flat", v)]} for v in (7, 12, 17, 22)]})

A("44-03", "44-03 火車輾過", "ground", [60, 50, 40, 30], [150, 250, 350, 450], 12,
  "[主動][範圍][AP加成]\n60/50/40/30秒冷卻\n消耗MP150/250/350/450\n有效半徑6\n\n「我就是正義！」\n使敵方 [詛咒]標記的 [周圍]的敵方部隊受到650/750/850/950+ 60% [AP]點的劇烈傷害。",
  radiusTier="大",
  effects=[area("magic", tier="大", per=[650, 750, 850, 950], ap=0.6)])

A("44-04", "44-04 心臟麻痺", "targeted", [35, 35, 35], [150, 250, 350], 12,
  "[主動][AP加成]\n35秒冷卻\n消耗MP150/250/350\n\n「不，還不能笑，我一定要忍住……在35秒後宣布勝利吧。」\n造成敵方[詛咒]標記的[現存生命] 30/40/50% + 40% [AP] 傷害，並使動作[緩慢]持續5秒。",
  maxRank=3,
  effects=[dmg("magic", ap=0.4), status("slow40", 5.0, moveSpeedMult=0.5)])

A("44-002", "44-002 交換筆記本", "targeted", [120], [450], 5.29,
  "[主動][指定]\n120秒冷卻，吟唱2秒\n消耗MP450\n施法距離5.29\n\n「計畫通！」\n置死地而後生的大絕招，將筆記本暫時送給別人，讓自己跟指定的敵人[現存生命]作 [交換]。",
  cast_time=2.0,
  effects=[{"kind": "swapResource", "shape": "single", "resource": "health", "clampMin": 1.0}])

# ── 12 志狼 ──────────────────────────────────────────────────────────────────
A("12-00", "12-00 感應意脈", "self", [0], [0], 0,
  "[被動][迴避]\n0秒冷卻\n\n志狼矇眼修行後，領悟到感應人意識流動，神一般的技巧，可以使自身物理攻擊[迴避]達到20%。",
  innate="passive",
  passive={"name": "12-00 感應意脈", "ranks": [{"modifiers": [M("evasion", "flat", 0.2)]}]})

A("12-01", "12-01 鬥仙術", "targeted", [12, 12, 12, 12], [30, 57, 83, 90], 4,
  "[主動][指定][混亂][AP加成]\n12秒冷卻\n消耗MP30/57/83/90\n施法距離4\n\n「我一個人無聊的時候，喜歡跟自己打麻將」\n以念體攻擊敵人，造成150/283/350/350+60% [AP]傷害的同時可以[混亂]目標1秒。",
  effects=[dmg("magic", per=[150, 283, 350, 350], ap=0.6),
           status("confusion", 1.0, missChance=0.5)])

A("12-02", "12-02 仙氣．採藥", "self", [60, 60, 60, 60], [50, 100, 150, 200], 0,
  "[主動][輔助][治療][淨化]\n60秒冷卻，吟唱3秒\n消耗MP50/100/150/200\n\n「OGC 身體好」\n利用身體小周天循環[治療]自己[回復] 5/7/9/11%[最大生命]，並且除去身上任何附加法術狀態([淨化])。",
  cast_time=3.0,
  effects=[{"kind": "restore", "healthPct": 0.05, "applyTo": "self"},
           {"kind": "dispel", "shape": "single", "pools": {"status": True, "dot": True, "buffs": True}, "count": 9}])

A("12-03", "12-03 破凰之心。空破山", "self", [0], [0], 0,
  "[被動][暴擊][機率][普攻時][AP加成]\n\n「放下屠刀，換把手槍」\n[每次攻擊]有10%[機率]造成1.1/2.2/3.3/4.4倍的[暴擊]傷害且敵人身上有[混亂]標記時，額外造成 100% [AP]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "12-03 破凰之心。空破山", "ranks": [
      {"modifiers": [M("critChance", "flat", 0.1), M("critDamage", "override", v)],
       "hooks": [{"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "status", "subject": "target", "statusId": "confusion"},
                  "effects": [dmg("magic", ap=1.0)]}]}
      for v in (1.1, 2.2, 3.3, 4.4)]})

A("12-04", "12-04 龍氣爆發", "self", [60, 60, 60], [250, 350, 450], 0,
  "[主動][範圍][淨化][AP加成]\n60秒冷卻，吟唱2秒\n消耗MP250/350/450\n\n「使命創造命運」\n凝聚體內的龍氣造成[周圍][大範圍]敵方單位 550/750/950 + 200% [AP] 傷害，附帶[淨化]效果。",
  maxRank=3, cast_time=2.0, radiusTier="大",
  effects=[area("magic", tier="大", per=[550, 750, 950], ap=2.0),
           {"kind": "dispel", "shape": "circle", "radius": 6.0, "radiusTier": "大",
            "polarity": "buff", "count": 2}])

A("12-002", "12-002 仙氣發勁", "targeted", [30], [600], 2,
  "[主動][指定][擊退][AP加成]\n30秒冷卻，吟唱2秒\n消耗MP600\n施法距離2\n\n「Hey Siri，打開電風扇」\n近身最後必殺絕技，將身上所有的仙氣集中在手上瞬間爆發造成 1800 + 600% [AP] 傷害，並[擊退]敵方單位。",
  cast_time=2.0,
  effects=[dmg("magic", flat=1800, ap=6.0),
           {"kind": "knockback", "distance": 6.0, "speed": 20.0, "from": "caster"}])

# ── 60 勇者 ──────────────────────────────────────────────────────────────────
A("60-00", "60-00 大師之劍", "self", [0], [0], 0,
  "[被動][淨化][普攻時]\n\n「真正的大師，都是買分的」\n[普通攻擊時]造成額外 3%[最大生命]傷害。並且造成 [淨化] 效果。",
  innate="passive",
  passive={"name": "60-00 大師之劍", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "effects": [dmg("magic", flat=60),
                   {"kind": "dispel", "shape": "single", "pools": {"status": True}, "count": 1}]}]}]})

A("60-01", "60-01 旋風斬", "self", [30, 30, 30, 30], [100, 150, 200, 250], 0,
  "[主動][範圍][AD加成][擊退]\n30秒冷卻\n消耗MP100/150/200/250\n\n「看我先暈倒還是你先被我砍死」\n造成[周圍][範圍] 150/250/350/450+50% [AD]點傷害，並且[擊退]敵人。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[150, 250, 350, 450], ad=0.5),
           {"kind": "knockback", "distance": 3.0, "speed": 15.0, "from": "caster"}])

A("60-02", "60-02 鎖鏈槍", "ground", [45, 45, 45, 45], [50, 75, 100, 125], 11,
  "[主動][指向][範圍][跳躍]\n45秒冷卻\n消耗MP50/75/100/125\n\n「我喜歡勾，但不喜歡脫鉤的時候」\n[直線]距離勾住一個單位，自身[跳躍]過去，並給予 150/250/350/450傷害。",
  effects=[{"kind": "leap", "applyTo": "self", "mode": "toPoint", "apexHeight": 1.4,
            "durationSec": 0.4, "throwDistance": 11.0, "landRadius": 3.0,
            "onLand": [dmg("physical", per=[150, 250, 350, 450])]}])

A("60-03", "60-03 三角神力．勇氣", "self", [0], [0], 0,
  "[被動][強化][普攻時][AP加成]\n\n喚醒勇者體內的三角神力，提高 [智慧]、[敏捷]、[力量] 3/6/9/12點，並且每三下普通攻擊則會額外造成 33% [AP]傷害。",
  innate="passive", maxRank=4,
  passive={"name": "60-03 三角神力．勇氣", "ranks": [
      {"modifiers": [M("ap", "flat", v), M("ad", "flat", v), M("maxHealth", "flat", v * 10)],
       "hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [dmg("magic", ap=0.33)]}]}
      for v in (3, 6, 9, 12)]})

A("60-04", "60-04 完美盾反", "self", [60, 60, 60], [120, 150, 180], 0,
  "[主動][反彈]\n60秒冷卻 吟唱2秒\n消耗[MP] 120/150/180\n有效半徑6\n\n「唯一擋不住的是你的魅力」\n瞬間架起海拉爾之盾，[反彈]魔法([AP])及物理([AD])傷害，持續3秒，期間若成功[反彈]敵方技能[AP]傷害，立即 [回復] 8/16/24% [最大生命]，並且[擊退]敵人。",
  maxRank=3, cast_time=2.0,
  effects=[status("moon-combo", 3.0)],
  passive={"name": "60-04 完美盾反", "ranks": [{"hooks": [
      {"on": "onReflectSuccess", "target": "self",
       "effects": [{"kind": "restore", "healthPct": 0.08, "applyTo": "self"},
                   {"kind": "knockback", "distance": 4.0, "speed": 16.0, "from": "caster"}]}]}]})

A("60-002", "60-002 勇者意志", "self", [120], [0], 0,
  "[被動][反彈成功時][反彈]\n120秒冷卻\n\n「真正的勇者不是不會死，是存檔點夠近」\n生命值低於30%時，立即獲得相當於 100% [最大生命值]的[護盾]，120秒內只能觸發一次，若 [完美盾反] [反彈]成功，冷卻立即重置。",
  passive={"name": "60-002 勇者意志", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "internalCooldown": 120.0,
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.3},
       "effects": [{"kind": "shield", "amount": amt(flat=1500),
                    "duration": 8.0}]}]}]})

# ── 79 黑崎一護 ──────────────────────────────────────────────────────────────
A("79-00", "79-00 靈壓", "self", [0], [0], 0,
  "[被動]\n0秒冷卻\n有效半徑6\n\n「看不見不代表不存在，可能只是你靈壓太低」\n此靈力產生的強大靈壓能[降低]小 [範圍] 敵人 [攻擊速度] 減半。",
  innate="passive",
  passive={"name": "79-00 靈壓", "ranks": [{"auras": [
      {"key": "ichigo-reiatsu", "radius": 4.5, "affects": "enemy",
       "modifiers": [M("as", "pctAdd", -0.5)]}]}]})

A("79-01", "79-01 瞬步", "ground", [30, 30, 30, 30], [60, 80, 100, 120], 9.17,
  "[主動][指向][範圍][衝刺]\n30秒冷卻\n消耗[MP] 60/80/100/120\n施法距離9.17\n\n「不是我消失，是你反應太慢」\n以急快的速度[直線] [衝刺] 至對方身旁，造成 [範圍] 敵方單位 [破魔] 魔抗減半，持續 3秒。",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 32.0, "maxDistance": 9.17},
           area("magic", tier="小", flat=1),
           status("magic-break", 3.0)])

A("79-02", "79-02 月牙斬擊", "self", [60, 60, 60, 60], [80, 160, 240, 320], 0,
  "[主動][AP加成]\n60秒冷卻\n消耗MP80/160/240/320\n\n「月牙。斬魄刀」\n給予目標額外200/350/500/650傷害。\n(若對方在 [破魔] 狀態，則額外造成 100% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 200% [AP])",
  effects=[dmg("magic", per=[200, 350, 500, 650], ap=0.5)],
  passive={"name": "79-02 月牙斬擊", "ranks": [{"hooks": [
      {"on": "onAbilityHit", "abilitySlot": "W", "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "magic-break"},
       "effects": [dmg("magic", ap=1.0)]}]}]})

A("79-03", "79-03 月牙天衝", "ground", [55, 55, 55, 55], [250, 350, 450, 550], 11,
  "[主動][指向][範圍][AP加成]\n55秒冷卻\n消耗MP250/350/450/550\n施法距離11\n\n「月牙天衝！招式喊得越大聲，傷害就越強大」\n造成一[直線]上的敵方部隊受到450/600/750/900傷害。\n(若對方在 [破魔] 狀態，則額外造成 60% [AP] 傷害)\n(卍解 [變身] 狀態下傷害額外追加 120% [AP])",
  effects=[line("magic", length=11, width=2.0, per=[450, 600, 750, 900])])

A("79-04", "79-04 卍解", "self", [90, 90, 90], [100, 200, 300], 0,
  "[主動][輔助][變身]\n90秒冷卻\n消耗MP100/200/300\n\n「卍解。天鎖斬月」\n壓縮全部力量並進入 [卍解] 狀態，[攻擊速度]提升100/150/200%，[瞬步] 冷卻縮短 50%，持續8秒。",
  maxRank=3,
  effects=[{"kind": "championForm", "to": "alternate", "durationSec": 8.0},
           buff([M("as", "pctAdd", 1.0)], 8.0),
           {"kind": "modifyCooldown", "shape": "single", "who": "self", "slot": "Q",
            "mode": "reduce", "amount": 0.5}])

A("79-002", "79-002 虛化", "self", [0], [0], 0,
  "[被動][回復][機率]\n\n「面具才是本體」\n[卍解] 狀態下，額外獲得100%攻擊力([AD])提昇、60％[吸血] 、有30%的[機率][格擋]物理([AD])傷害、[月牙天衝]冷卻時間縮短50%。",
  passive={"name": "79-002 虛化", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       "effects": [buff([M("ad", "pctAdd", 1.0), M("lifesteal", "flat", 0.6)], 8.0)]}]}]})

# ── 80 呂布 ──────────────────────────────────────────────────────────────────
A("80-00", "80-00 飛將神弓", "self", [0], [0], 0,
  "[被動][擊殺時]\n0秒冷卻\n\n「轅門射戟只是熱身，這次我直接射你」\n每殺死一名敵人 [攻擊速度] 永久增加1%；[攻擊距離] 永久提升0.01，上限到10。",
  innate="passive",
  passive={"name": "80-00 飛將神弓", "ranks": [{"hooks": [
      {"on": "onKill", "target": "self",
       "effects": [buff([M("as", "pctAdd", 0.01), M("range", "flat", 0.01)], 99999)]}]}]})

A("80-01", "80-01 天下無雙", "self", [0], [0], 0,
  "[被動][普攻時][層數累積]\n0秒冷卻\n\n「人中出呂布，馬中出赤兔」\n每次 [普通攻擊時] 都會增加 10% [攻擊速度] 並可[疊加]，持續1秒，若沒有繼續攻擊則[疊加]的 [攻擊速度] 增益歸零。",
  innate="passive",
  passive={"name": "80-01 天下無雙", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "self",
       "effects": [{"kind": "applyBuff", "modifiers": [M("as", "pctAdd", 0.1)],
                    "duration": 1.0, "statusId": "rage"}]}]}]})

A("80-02", "80-02 弒鬼神", "self", [60, 60, 60, 60], [90, 180, 270, 360], 0,
  "[主動][範圍]\n60秒冷卻\n消耗MP90/180/270/360\n\n「鬼神都殺了，剩下的只是血條」\n造成[周圍][範圍]敵方部隊 120/220/320/420 傷害，並 [擊退]及造成敵人 [破甲]，持續1秒。",
  radiusTier="中",
  effects=[area("physical", tier="中", per=[120, 220, 320, 420]),
           {"kind": "knockback", "distance": 2.5, "speed": 15.0, "from": "caster"},
           status("armor-break", 1.0)])

A("80-03", "80-03 鬼神烈戟", "ground", [60, 60, 60, 60], [150, 200, 250, 300], 10,
  "[主動][指向][範圍][衝刺][AP加成]\n60秒冷卻\n消耗MP150/200/250/300\n有效半徑6\n\n「方天畫戟是中國最早的圓規」\n[衝刺] 一段距離並造成一[直線][範圍] 150/200/250/300 + 30% [AP] 傷害。\n(若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害)",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 30.0, "maxDistance": 10.0},
           line("magic", length=10, width=2.0, per=[150, 200, 250, 300], ap=0.3)],
  passive={"name": "80-03 鬼神烈戟", "ranks": [{"hooks": [
      {"on": "onAbilityHit", "abilitySlot": "E", "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "armor-break"},
       "effects": [dmg("magic", ap=1.0)]}]}]})

A("80-04", "80-04 赤兔咆哮", "self", [90, 90, 90], [250, 400, 550], 0,
  "[主動][輔助][機率][普攻時]\n90秒冷卻\n消耗MP250/400/550\n\n「赤兔不是交通工具，是交通事故」\n[AP] 與 [AD] 暫時提升至 150/200/250%，[攻擊時]與 [受傷時] 都有 20%[機率]使出弒鬼神反擊，持續 8秒。",
  maxRank=3,
  effects=[buff([M("ap", "pctAdd", 1.5), M("ad", "pctAdd", 1.5)], 8.0)],
  passive={"name": "80-04 赤兔咆哮", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.2, "target": "self", "internalCooldown": 0.5,
       "effects": [{"kind": "proxyCast", "shape": "single", "slot": "W",
                    "payCosts": "none", "respectCooldown": False}]},
      {"on": "onDamageTaken", "chance": 0.2, "target": "self", "internalCooldown": 0.5,
       "effects": [{"kind": "proxyCast", "shape": "single", "slot": "W",
                    "payCosts": "none", "respectCooldown": False}]}]}]})

A("80-002", "80-002 戰無不勝", "self", [0], [0], 0,
  "[被動]\n\n「只要一直贏，就沒有平衡問題」\n提升 [攻擊速度上限]至10、[吸血] 50%，並但 [防禦][魔抗] 降低 50%。",
  passive={"name": "80-002 戰無不勝", "ranks": [{"modifiers": [
      M("as", "capRaise", 10.0), M("lifesteal", "flat", 0.5),
      M("armor", "pctAdd", -0.5), M("mr", "pctAdd", -0.5)]}]})

# ── 89 熊貓 ──────────────────────────────────────────────────────────────────
A("89-00", "89-00 憤怒的門牙", "self", [0], [0], 0,
  "[被動][普攻時][機率][暈眩]\n0秒冷卻\n\n「我的門牙不是裝飾，是開罐器」\n有3%的[機率]可以使出超會心一擊造成 999點 [真實傷害]，並造成敵人 1%生命傷害的 [燃燒] 狀態，持續5秒。\n\n(敵方 [暈眩] 狀態下額外追加 [致盲] 狀態，持續 5秒)",
  innate="passive",
  passive={"name": "89-00 憤怒的門牙", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "chance": 0.03, "target": "event",
       "effects": [dmg("true", flat=999), status("burn", 5.0)]},
      {"on": "onBasicAttack", "chance": 0.03, "target": "event",
       "condition": {"kind": "status", "subject": "target", "tag": "stun"},
       "effects": [status("blind", 5.0, missChance=0.5)]}]}]})

A("89-01", "89-01 憤怒的頭槌", "self", [0], [0], 0,
  "[被動][機率][普攻時][暈眩]\n\n「頭腦不好沒關係，頭骨夠硬就行」\n[攻擊時]有 3/4/5/6%[機率]想起頭槌攻擊，造成 10倍 [暴擊] 傷害，並將敵人[暈眩] 1秒。\n\n(敵方 [燃燒] 狀態下額外追加 [致盲] 狀態，持續 5秒)",
  innate="passive", maxRank=4,
  passive={"name": "89-01 憤怒的頭槌", "ranks": [
      {"hooks": [
          {"on": "onBasicAttack", "chance": c, "target": "event",
           "effects": [status("stun", 1.0, stun=True)]},
          {"on": "onBasicAttack", "chance": c, "target": "event",
           "condition": {"kind": "status", "subject": "target", "tag": "burn"},
           "effects": [status("blind", 5.0, missChance=0.5)]}]}
      for c in (0.03, 0.04, 0.05, 0.06)]})

A("89-02", "89-02 憤怒的菊花", "self", [0], [0], 0,
  "[被動][範圍][機率]\n\n「菊花一緊，空氣力學就有了答案」\n當敵人攻擊熊貓的時候，有3%[機率][反彈]，[反彈時] 會胡亂噴放排泄物使[周圍][範圍] 敵人造成 [癱瘓] 及 [詛咒]。\n\n(敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 10秒)",
  innate="passive",
  passive={"name": "89-02 憤怒的菊花", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "chance": 0.03, "target": "self", "internalCooldown": 1.0,
       "effects": [area("magic", tier="中", flat=1),
                   status("stun", 1.0, stun=True),
                   status("curse", 5.0, missChance=0.5)]}]}]})

A("89-03", "89-03 憤怒的胸毛", "self", [0], [0], 0,
  "[被動][機率]\n\n受到敵方傷害時，有 4% [機率] 拔下熊貓的一根胸毛，這份刺激的快感讓熊貓 [攻擊速度] 提升200/250/300/350%，持續4秒，但也會有 2% [機率] 拔到重要部位的毛，[自爆] 損失現存 50%生命。",
  innate="passive", maxRank=4,
  passive={"name": "89-03 憤怒的胸毛", "ranks": [
      {"hooks": [{"on": "onDamageTaken", "chance": 0.04, "target": "self",
                  "internalCooldown": 1.0,
                  "effects": [buff([M("as", "pctAdd", v)], 4.0)]}]}
      for v in (2.0, 2.5, 3.0, 3.5)]})

A("89-04", "89-04 憤怒的簡諧運動", "self", [0], [0], 0,
  "[被動][機率][普攻時][迴避][迴避時][拉扯][擊退][暈眩][身上有某狀態時][混亂][AP加成]\n\n[攻擊時]有8/12/16%[機率]將對方抓取過來造成 16% [AP]傷害，並且擁有 8/12/16% 物理[迴避]，[迴避]成功的時候，將會 [擊退] 對方小一段距離，並造成 [暈眩] 1秒。\n\n(敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 3秒)",
  innate="passive", maxRank=3,
  passive={"name": "89-04 憤怒的簡諧運動", "ranks": [
      {"modifiers": [M("evasion", "flat", c)],
       "hooks": [
           {"on": "onBasicAttack", "chance": c, "target": "event",
            "effects": [dmg("magic", ap=0.16)]},
           {"on": "onEvade", "target": "event",
            "effects": [{"kind": "knockback", "distance": 2.0, "speed": 14.0,
                         "from": "caster"},
                        status("stun", 1.0, stun=True)]}]}
      for c in (0.08, 0.12, 0.16)]})

A("89-002", "89-002 俄羅斯輪盤", "targeted", [10], [666], 5.29,
  "[主動][指定][範圍][輔助][恐懼][機率]\n10秒冷卻\n消耗[MP] 666\n施法距離5.29\n\n拿出土製左輪手槍裝填一顆子彈，生死一瞬間，有1/6的機會讓對方或1/6自己死亡，剩餘4/6 對方會陷入 [恐懼] 狀態，持續 2秒。\n\n(敵方 [致盲] 狀態下對方的死亡[機率]提升到 2/6)\n(敵方 [混亂] 狀態下對方的死亡[機率]提升到 3/6)",
  effects=[{"kind": "weightedBranch", "shape": "single", "branches": [
      {"weight": 1, "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [0.5],
                                 "victim": "champion", "throughShields": True}]},
      {"weight": 1, "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [0.5],
                                 "victim": "any", "throughShields": True}]},
      {"weight": 4, "effects": [status("fear", 2.0, feared=True)]}]}])

# ── 92 草泥馬 ────────────────────────────────────────────────────────────────
A("92-00", "92-00 憂鬱的眼神", "self", [0], [0], 0,
  "[被動][受到攻擊][致盲][機率]\n0秒冷卻\n\n「你看見的是憂鬱，我看見的是沒有草」\n有 30% [機率] 對草泥馬攻擊的敵方 [致盲] ，持續6秒。",
  innate="passive",
  passive={"name": "92-00 憂鬱的眼神", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "chance": 0.3, "target": "event", "internalCooldown": 1.0,
       "effects": [status("blind", 6.0, missChance=0.5)]}]}]})

A("92-01", "92-01 臥草泥馬", "self", [60, 60, 60, 60], [160, 220, 280, 340], 0,
  "[主動][變身][週期]\n60秒冷卻\n消耗MP160/220/280/340\n\n「臥草，泥馬真的躺下來了」\n進入無法移動與攻擊的 [定身] 狀態，每秒 [回復] 1/2/3/4% 生命，[防禦] 提升20/40/60/80，持續6秒。\n(對方仍可施展技能，僅不能移動與普攻)",
  effects=[status("root", 6.0, root=True, disarmed=True),
           buff([M("armor", "flat", 20)], 6.0),
           {"kind": "dot", "damageType": "true", "amountPerTick": amt(flat=-1),
            "intervalSec": 1.0, "durationSec": 6.0, "stacking": "refresh"}])

A("92-02", "92-02 消化液", "self", [0], [0], 0,
  "[被動][指向][範圍][破魔][AP加成][機率][週期]\n\n草泥馬在 [受到傷害] 的時候有 10% [機率]，會從嘴巴裡噴出消化液攻擊敵人，造成[前方][一直線] [範圍] 敵人，每秒受到20/30/40/50+ 30% [AP] 傷害，附帶 [破魔] 降低魔抗 50%，持續3秒。",
  innate="passive", maxRank=4,
  passive={"name": "92-02 消化液", "ranks": [
      {"hooks": [{"on": "onDamageTaken", "chance": 0.1, "target": "event",
                  "internalCooldown": 2.0,
                  "effects": [line("magic", length=8, width=1.8, flat=v, ap=0.3),
                              status("magic-break", 3.0)]}]}
      for v in (20, 30, 40, 50)]})

A("92-03", "92-03 狂草泥馬", "self", [0], [0], 0,
  "[被動][屬性門檻][普攻時][吞噬][層數累積]\n\n「平常吃草，發瘋時吃人」\n當草泥馬生命降低到 30%時，普通 [攻擊時] 附加 [吞噬] 生命低於 3/4/5/6% 的敵方單位，並且永久增加1點 [AP]。",
  innate="passive", maxRank=4,
  passive={"name": "92-03 狂草泥馬", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                                "mode": "percent", "op": "<=", "value": 0.3},
                  "effects": [{"kind": "devour", "shape": "single", "thresholdPctOfMax": [t],
                               "victim": "any", "throughShields": True,
                               "onDevour": [{"kind": "grantAttribute", "attr": "int",
                                             "amount": 1, "mode": "flat",
                                             "maxAttribute": 200}]}]}]}
      for t in (0.03, 0.04, 0.05, 0.06)]})

A("92-04", "92-04 馬勒戈壁", "self", [90, 90, 90], [300, 420, 540], 0,
  "[主動][範圍][AP加成]\n90秒冷卻\n消耗MP300/420/540\n\n「將自己的心靈內景具現化並覆蓋現實世界的強力魔術」\n將[周圍] [範圍] 敵人附加 [緩慢] 及 [致盲]，持續6秒。\n(攻擊身上有 [致盲] 標記的敵人將額外附加 100/200/300% [AP] 傷害)",
  maxRank=3, radiusTier="超大",
  effects=[area("magic", tier="超大", flat=1),
           status("slow40", 6.0, moveSpeedMult=0.5),
           status("blind", 6.0, missChance=0.5)],
  passive={"name": "92-04 馬勒戈壁", "ranks": [{"hooks": [
      {"on": "onBasicAttack", "target": "event",
       "condition": {"kind": "status", "subject": "target", "statusId": "blind"},
       "effects": [dmg("magic", ap=1.0)]}]}]})

A("92-002", "92-002 最終戈壁", "self", [0], [0], 0,
  "[被動][週期][回復][範圍][AP加成][身上有某狀態時]\n\n「草泥馬戈壁，傷而扶壁曲」\n當 [馬勒戈壁] 施展期間，每秒對[周圍][範圍]友方單位 [回復] 10%[最大魔力]、也對 [周圍][範圍]敵人單位造成 2%[最大生命] + 100% [AP] 傷害，持續 6秒。",
  passive={"name": "92-002 最終戈壁", "ranks": [{"hooks": [
      {"on": "onAbilityCast", "abilitySlot": "R", "target": "self",
       "effects": [{"kind": "delayed", "shape": "single", "delaySec": 1.0, "count": 6, "intervalSec": 1.0,
                    "effects": [area("magic", tier="超大", ap=1.0)]}]}]}]})

# ── 52 Berserker ────────────────────────────────────────────────────────────
A("52-00", "52-00 十二道試煉", "self", [0], [0], 0,
  "[被動][範圍][暈眩]\n0秒冷卻\n\n「十二條命聽起來很多，直到你遇到會算數的玩家」\n初始擁有十二層 [試煉] 標記。受到致命傷害時消耗一層試煉，進入 [無敵] 狀態1.5秒，隨後 [回復] 50%[最大生命]，並[擊退]並[暈眩] 0.5秒 [周圍]敵人。每失去一層試煉，永久提升10%攻擊力與10%[最大生命]。\n(跨回合共享12次 [試煉] 標記)",
  innate="passive",
  mark={"markId": "trial", "initial": 12, "max": 12, "durationSec": -1,
        "resetOn": "match"},
  passive={"name": "52-00 十二道試煉", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self", "key": "trial",
       "condition": {"kind": "stat", "subject": "self", "stat": "hp",
                     "mode": "percent", "op": "<=", "value": 0.05},
       "internalCooldown": 1.5,
       "effects": [{"kind": "invulnerable", "durationSec": 1.5, "applyTo": "self",
                    "blocksDamage": "all", "blocksTrueDamage": True,
                    "blocksControl": True},
                   {"kind": "restore", "healthPct": 0.5, "applyTo": "self"},
                   {"kind": "knockback", "distance": 4.0, "speed": 16.0, "from": "caster"},
                   status("stun", 0.5, stun=True),
                   buff([M("ad", "pctAdd", 0.1), M("maxHealth", "pctAdd", 0.1)], 99999)]}]}]})

A("52-01", "52-01 狂戰士之怒", "self", [60, 60, 60, 60], [100, 140, 180, 220], 0,
  "[主動][輔助]\n60秒冷卻\n消耗MP100/140/180/220\n持續6秒\n\n「吼叫不是技能前搖，只是想嚇嚇他」\n進入[狂怒]狀態，提升60/90/120/150% [攻擊速度] 與10/15/20/25%[吸血]。\n期間每承受自身[最大生命]5%的傷害，「狂怒」持續時間延長2秒。",
  effects=[{"kind": "applyBuff", "modifiers": [M("as", "pctAdd", 0.6),
                                               M("lifesteal", "flat", 0.1)],
            "duration": 6.0, "statusId": "rage"}],
  passive={"name": "52-01 狂戰士之怒", "ranks": [{"hooks": [
      {"on": "onDamageTaken", "target": "self",
       "effects": [{"kind": "extendBuff", "shape": "single", "who": "self", "stackKey": "rage",
                    "addSec": 2.0, "perDamagePctOfMaxHealth": 0.05,
                    "maxRemainingSec": 30.0}]}]}]})

A("52-02", "52-02 蹂躪編年史", "ground", [45, 45, 45, 45], [70, 95, 120, 145], 11,
  "[主動][指向][範圍][AP加成]\n45秒冷卻，吟唱 1秒\n消耗MP70/95/120/145\n施法距離11\n\n「歷史是勝利者寫的，敗者只配飛出去擦地板」\n將敵方目標抓回再暴力的丟出去，使之撞擊[前方]一[直線][範圍]的敵人造成350/450/550/650+50% [AP]傷害。\n(若自身在 [狂怒] 狀態則額外附加受到 [範圍] 傷害的敵人 [恐懼] 狀態，持續 3秒)",
  cast_time=1.0,
  effects=[{"kind": "leap", "applyTo": "target", "mode": "toPoint", "apexHeight": 1.2,
            "durationSec": 0.42, "throwDistance": 7.33, "dragToCaster": True,
            "landRadius": 4.95,
            "onLand": [dmg("magic", per=[350, 450, 550, 650], ap=0.5)]}])

A("52-03", "52-03 無銘斧劍", "self", [0], [0], 0,
  "[被動][普攻時]\n\n「沒有名字不是低階裝備，是作者懶得取」\n每次普通 [攻擊時] 造成額外50/70/90/110 傷害且附加 [麻痺] 效果，持續0.6秒。",
  innate="passive", maxRank=4,
  passive={"name": "52-03 無銘斧劍", "ranks": [
      {"hooks": [{"on": "onBasicAttack", "target": "event",
                  "effects": [dmg("physical", flat=v),
                              status("slow40", 0.6, moveSpeedMult=0.5)]}]}
      for v in (50, 70, 90, 110)]})

A("52-04", "52-04 巨神一擊", "self", [120, 120, 120], [400, 600, 800], 0,
  "[主動][衝刺][範圍]\n120秒冷卻，吟唱2秒\n消耗[MP] 400/600/800\n\n「體型差不是霸凌，是傷害公式」\n向前[衝刺]一小段距離後揮出致命的一擊，對[周圍][範圍] 敵人造成600/1000/1400 傷害。\n(若敵人具有[恐懼]狀態，則額外追加 自身[最大生命]25%傷害)",
  maxRank=3, cast_time=2.0, radiusTier="大",
  effects=[{"kind": "dash", "mode": "toPoint", "speed": 24.0, "maxDistance": 5.0},
           area("physical", tier="大", per=[600, 1000, 1400])])

A("52-002", "52-002 射殺百頭", "targeted", [120], [400], 5.29,
  "[主動][指定][AP加成]\n120秒冷卻，吟唱2秒\n消耗MP400\n施法距離5.29\n\n「名稱叫射殺百頭，但狂戰士狀態下減弱成斧頭砍九次」\n對目標連續 9次的斬擊，每次造成 100% [AP] +自身[最大生命] 3% 傷害，最後一擊附加 [擊退]一小段距離 及 [恐懼] 3秒。",
  cast_time=2.0,
  effects=[{"kind": "delayed", "shape": "single", "delaySec": 0.1, "count": 9, "intervalSec": 0.1,
            "effects": [dmg("magic", ap=1.0)],
            "finalEffects": [{"kind": "knockback", "distance": 3.0, "speed": 15.0,
                              "from": "caster"},
                             status("fear", 3.0, feared=True)]}])


# ─────────────────────────────────────────────────────────────────────────────
def build(e):
    num = e["num"]
    hero, part = num.split("-")
    cid = HERO[hero]
    aid = f"{cid}.{SUFFIX[part]}"
    slot = SLOT[part]
    mr = e.get("maxRank", 4 if slot in ("Q", "W", "E") else (3 if slot == "R" else 1))
    if slot in ("PASSIVE", "EX"):
        mr = 1
    cd = [float(x) for x in e["cd"]]
    mp = [float(x) for x in e["mp"]]
    while len(cd) < mr:
        cd.append(cd[-1])
    while len(mp) < mr:
        mp.append(mp[-1])
    # ⭐ 沿用**既有**文件的美術綁定。重製換的是機制，不是圖示與特效 ——
    #   重新發明 icon 路徑會讓 `icons.test.ts` 紅（檔案不在磁碟上），
    #   丟掉 vfxKey 會讓技能變成沒有特效的隱形技（`abilityMirror` 在守）。
    prev = {}
    prev_path = os.path.join(AB, f"{aid}.json")
    if os.path.exists(prev_path):
        prev = json.load(open(prev_path, encoding="utf-8"))
    doc = {
        "id": aid,
        "schema": "ability@1",
        "name": e["name"],
        "icon": prev.get("icon", f"assets/icons/abilities/{aid}.webp"),
        "description": e["desc"],
        "slot": slot,
        "castType": e["cast"],
        "maxRank": mr,
        "cooldown": cd[:mr],
        "manaCost": mp[:mr],
        "range": float(e["rng"]),
    }
    if slot == "PASSIVE":
        doc["innateKind"] = e.get("innate", "passive")
    if e.get("radiusTier"):
        doc["radiusTier"] = e["radiusTier"]
    doc["targetsEnemies"] = e["cast"] != "self" or bool(e.get("radiusTier"))
    doc["effects"] = e.get("effects", [])
    if e.get("passive"):
        doc["passive"] = e["passive"]
    if e.get("mark"):
        doc["marks"] = [e["mark"]]
    for k in ("vfxKey", "vfx", "hitFeel", "telegraph"):
        if k in prev:
            doc[k] = prev[k]
    # ⛔ castTimeSec **不手填** —— `deriveCastTime()` 是唯一來源，
    #    `castTimeCoverage.test.ts` 逐支比對。由 deriveCastTimes 後處理補上。
    return cid, slot, doc


def main():
    dry = "--dry-run" in sys.argv
    docs = [build(e) for e in T]
    assert len(docs) == 90, f"表裡只有 {len(docs)} 支，應該是 90"
    by_champ = {}
    for cid, slot, d in docs:
        by_champ.setdefault(cid, {})[slot] = d
        if not dry:
            with open(os.path.join(AB, f"{d['id']}.json"), "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False, indent=2)
                f.write("\n")
    # 鏡射：英雄卡內嵌 Q/W/E/R（⚠️ 內嵌版不帶 `schema`，見 ggd-mirror-authority-model）
    for cid, slots in by_champ.items():
        p = os.path.join(CH, f"{cid}.json")
        ch = json.load(open(p, encoding="utf-8"))
        for s in ("Q", "W", "E", "R"):
            if s in slots:
                m = dict(slots[s])
                m.pop("schema", None)
                ch["abilities"][s] = m
        if not dry:
            with open(p, "w", encoding="utf-8") as f:
                json.dump(ch, f, ensure_ascii=False, indent=2)
                f.write("\n")
    print(f"寫入 {len(docs)} 支技能 / {len(by_champ)} 位英雄" + ("（dry-run）" if dry else ""))
    # 給文件用的 JSON 章節
    out = []
    for hero in sorted(HERO, key=lambda x: int(x)):
        cid = HERO[hero]
        mine = [d for c, _, d in docs if c == cid]
        if not mine:
            continue
        out.append(f"\n### {hero} — `{cid}`\n")
        for d in mine:
            out.append(f"<details><summary><code>{d['id']}</code> — {d['name']}</summary>\n")
            out.append("```jsonc")
            out.append(json.dumps(d, ensure_ascii=False, indent=2))
            out.append("```\n</details>\n")
    with open("/private/tmp/skill-chapter.md", "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("章節寫到 /private/tmp/skill-chapter.md")


if __name__ == "__main__":
    main()

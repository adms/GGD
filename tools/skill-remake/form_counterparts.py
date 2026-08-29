#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""⭐【變身態的技能檔**有沒有一個作者**】—— GH#854 的閘。

─────────────────────────────────────────────────────────────────────────────
問題的形狀（量到的，⛔ 不是推測）
─────────────────────────────────────────────────────────────────────────────
`batch1.py` 的 `HERO` 只收**本體** id，而它的註解逐字寫著

    「有兩個 id 的編號一律取本體（變身態的身體玩家選不到）」

⚠️ 那句話的後半在**技能**這一層是假的：玩家選不到變身態的身體，⛔ 但按下變身
之後用的就是變身態那一整套技能檔（GH#479 的整條守衛就是為此存在）。
⇒ 15 位英雄裡有 **6 位是變身對子的本體**，於是形成一個**半個**的狀態：

    本體 `content/abilities/godie-ewar.*.json`  ← 產生器寫（有來源）
    變身態 `content/abilities/godie-e007.*.json` ← **沒有任何人寫**（無來源）

而 `castTimeSec` 是 `deriveCastTimes.ts --write` **從每一份文件自己的機制**算出來的
⇒ 本體被規格重寫、變身態停在 w3x 匯入值 ⇒ 那個公式對兩邊給出**不同的答案**，
每跑一次就把兩形態推得更開，而**沒有任何東西會紅**。

⭐ 2026-08-29 量到的價目表（`abilityCodeParityForms.scanFormPairAbilities`）：

    castTimeSec 兩形態不同   本體有產生器來源：**14 / 36（39%）**
                             其餘手編對子    ：  5 / 84（ 6%）

⇒ **6.5 倍。** 例：12-04 龍氣爆發 `godie-ewar` 1.0s ／ `godie-e007` 2.033s。

─────────────────────────────────────────────────────────────────────────────
⭐ 這一份的答案：**二選一，⛔ 不要「半個」**
─────────────────────────────────────────────────────────────────────────────
每一個變身態要嘛是產生器的產物（`GENERATED`），要嘛是**明示的手編檔**
（`AUTHORED` ＋ 一個能被反駁的理由）。⛔ 「沒有人宣告」不是一個選項 ——
那正是今天的狀態，而它看起來跟兩者都一樣。

⛔ **六個都是 `AUTHORED`，而那是刻意的裁決**（⛔ 不是「還沒排到」）：
把變身態做成「照編號鏡射本體」正是 CLAUDE.md 第〇·六守則逐字記著的那次資料毀損 ——
`godie-h02u` 的 W/E 編號互換 ＋ 照 join key 同步 ⇒ 消化液整支消失、兩格都叫狂草泥馬
（GH#635 / #764）。而下面每一列的理由都附著**這一對今天真的不一樣的欄位**，
所以「其實可以自動鏡射了」是一個查得出來、駁得倒的宣稱。

⇒ 既然是手編的，「改了本體要跟著改變身態」就**必須**由閘保證，而那條閘是
   `packages/shared/src/content/abilityCodeParityForms.test.ts`
   （GH#854 同一輪把它從「自己重寫基準線」改成**會紅**）。
"""
import json
import os
import sys

#: 產生器寫這一份變身態的技能檔（＝它的 champion id 也在 `HERO` 裡）。
GENERATED = "generated"
#: 手編內容；`castTimeSec` 這類推導欄位仍由正規化器（castderive / tiers:apply）擁有。
AUTHORED = "authored"

#: 變身態 champion id → (誰擁有它的技能檔, 為什麼)。
#:
#: ⛔ **不要手寫「哪些是對子」** —— 對子由 `content/champions/<本體>.json` 的
#:    `transform.counterpartId` 推導（見 `derive()`）。這張表只回答**擁有權**。
#: ⭐ 兩個方向都是閘：多一列（對子沒了／改綁別人）與少一列（新對子沒宣告）都紅。
COUNTERPART_OWNER = {
    "godie-e007": (AUTHORED, (
        "12 志狼：⭐ **只有 12-03 一格刻意不同**，而那一格擋住整位英雄改判 GENERATED。"
        "12-03 在 w3x 是 `A02W`（base=`AEIl` **Metamorphosis**、editor_suffix「(英雄型態)」）"
        "＝**變身入口本身**：本體是 owner 2026-08-08 改寫的純被動暴擊，變身態是匯入器"
        "自己造出來的 targeted 單體傷害（⛔ 兩者都不是 A02W 的 ubertip「每次攻擊施展空破山、"
        "持續 12/18/24/30 秒」）。owner 2026-08-12 明說 B-4 **不裁決**"
        "（`common.FORM_TAG_WAIVED`）⇒ ⛔ 鏡射過去等於替他決定志狼要不要保留變身。"
        " ⚠️ ⭐ 其餘五格已於 GH#836 對齊，⛔ 而理由不是「兩邊該一樣」而是**量到的**："
        "w3x 的兩具身體 `Ewar` 與 `E007` 的 unit ability 清單**逐位元組相同**"
        "（`[\"AInv\",\"A04Z\",\"A0SQ\"]`，OBJECTS.json）⇒ 12-01/12-02/12-04 是**英雄技能**"
        "（一份，兩具身體共用），⛔ 階梯五層沒有任何一層支持它們不同 —— 那是本體被規格"
        "重寫而變身態沒跟上的**腐爛**，不是設計。"
        " ⚠️ 12-002 從頭到尾沒有動過：它的文案與 effects 早就逐字一致，剩下的差異"
        "（id/icon/provenance）逐形態合法。"
    )),
    "godie-e00l": (AUTHORED, (
        "20 EMIYA：20-01 風王結界兩形態的 toggle / passive / maxRank 刻意不同 —— "
        "GH#848 才逐支對過一次（commit d779ba66「只改一邊＝變身之後照樣炸金色聖光」）。"
    )),
    "godie-e010": (AUTHORED, (
        "70 樹精：變身態**根本沒有 70-002**（`content/abilities/godie-e010.ex.json` 不存在），"
        "本體有。⇒ 一個照編號鏡射的同步器會憑空替變身態生出一支 EX 寶具。"
    )),
    "godie-e00x": (AUTHORED, (
        "77 角鬥士：6 支裡 5 支不同，包含 77-002 的 `augment` 整格 —— "
        "增益卡掛在哪一形態上是設計，⛔ 不是同步得出來的。"
    )),
    "godie-h01o": (AUTHORED, (
        "79 一護：卍解態的定義**就是**「技能換一套」——「兩形態一樣」在這一對是缺陷不是目標。"
    )),
    "godie-h02u": (AUTHORED, (
        "92 草泥馬：CLAUDE.md 第〇·六守則逐字記著這一對 —— W/E 兩格編號互換過，"
        "而照 join key 同步把 `h02u.e` 配到 `h02v.w`，三層一起覆蓋 ⇒ 消化液整支消失、"
        "兩格都叫狂草泥馬（GH#635 / #764）。⛔ 這一對永遠不可以被自動鏡射。"
    )),
}


def derive(hero_ids, champions_dir):
    """{本體 champion id: 變身態 champion id} —— 從**出貨的英雄卡**推導。

    ⛔ 刻意不吃任何手寫的對子清單：`transform.counterpartId` 是 w3x 自己的連結，
       新開一對／改綁一對都會自動走到下面的閘上。
    """
    out = {}
    for cid in sorted(hero_ids):
        p = os.path.join(champions_dir, f"{cid}.json")
        if not os.path.exists(p):
            continue
        tr = json.load(open(p, encoding="utf-8")).get("transform") or {}
        if tr.get("role") == "base" and tr.get("counterpartId"):
            out[cid] = tr["counterpartId"]
    return out


def audit(hero_ids, champions_dir):
    """回傳問題清單（空 list = 過）。⭐ **兩個方向**都走，⛔ 一頭不算。

    · 有對子而沒宣告 ⇒ 紅（今天的缺陷：一個沒有作者的變身態）
    · 有宣告而沒對子 ⇒ 紅（過期的一列，會靜靜地替一個不存在的東西背書）
    · 宣告與現實不符 ⇒ 紅（說 `GENERATED` 而產生器其實沒寫它，或反過來）
    """
    problems = []
    hero_ids = set(hero_ids)
    pairs = derive(hero_ids, champions_dir)
    for base, alt in sorted(pairs.items()):
        decl = COUNTERPART_OWNER.get(alt)
        if decl is None:
            problems.append(
                f"{base} 是變身對子的本體，而它的變身態 {alt} **沒有人宣告作者**。\n"
                f"    ⇒ 產生器寫 {base}.*.json、⛔ 沒有任何東西寫 {alt}.*.json，"
                f"而 deriveCastTimes 會照兩份**各自的**機制算 castTimeSec ⇒ 每跑一次推開一點。\n"
                f"    修法二選一（⛔ 不要「半個」）：在 form_counterparts.COUNTERPART_OWNER 補一列\n"
                f"      · {GENERATED!r} —— 把 {alt} 加進 batch1.HERO 並補 heroes/{alt}.py\n"
                f"      · {AUTHORED!r}  —— 它是手編內容，**寫下為什麼不能鏡射本體**"
            )
            continue
        owner, why = decl
        if owner == GENERATED and alt not in hero_ids:
            problems.append(
                f"{alt} 宣告 {GENERATED!r}，⛔ 但它不在 batch1.HERO 裡 —— 產生器**沒有**寫它。\n"
                f"    ⇒ 這一列是謊話：宣告 supported 而其實沒有（editorCapabilities 那條的同型）。"
            )
        if owner == AUTHORED and alt in hero_ids:
            problems.append(
                f"{alt} 宣告 {AUTHORED!r}，⛔ 但它已經在 batch1.HERO 裡了 —— 產生器每次都會覆寫它。\n"
                f"    ⇒ 手編那一份會被無聲蓋掉（GH#319 的形狀）。把這一列改成 {GENERATED!r}。"
            )
        if owner not in (GENERATED, AUTHORED):
            problems.append(f"{alt} 的擁有權 {owner!r} 不是 {GENERATED!r}／{AUTHORED!r}")
        if owner == AUTHORED and not (why or "").strip():
            problems.append(
                f"{alt} 宣告 {AUTHORED!r} 卻沒有理由 —— ⛔ 「還沒排到」不是理由，"
                f"要寫一個**能被反駁的**（哪幾支今天真的不一樣、為什麼那個不同是對的）。"
            )
    for alt in sorted(COUNTERPART_OWNER):
        if alt not in set(pairs.values()):
            problems.append(
                f"{alt} 在 COUNTERPART_OWNER 裡，⛔ 但今天沒有任何一位產生器英雄的 "
                f"`transform.counterpartId` 指向它 —— 對子被拆了／改綁了／整組進 _legacy 了。\n"
                f"    ⇒ 把這一列刪掉（⛔ 不要留著：一列過期的宣告會替一個不存在的東西背書）。"
            )
    return problems


def report(hero_ids, champions_dir):
    """給 `batch1.py` 印的一行摘要。"""
    pairs = derive(set(hero_ids), champions_dir)
    gen = sum(1 for a in pairs.values() if COUNTERPART_OWNER.get(a, ("", ""))[0] == GENERATED)
    return (f"變身態作者：{len(pairs)} 對　產生器擁有 {gen}　明示手編 {len(pairs) - gen}"
            f"（閘＝abilityCodeParityForms.test.ts）")


if __name__ == "__main__":
    # 獨立跑：`python3 tools/skill-remake/form_counterparts.py [<champions 目錄>]`
    # ⭐ 守衛 `packages/shared/src/ops/formCounterpartsDeclared.test.ts` 走的就是這條路
    #    （它換一個 champions 目錄進來，所以這裡吃得下一個參數）。
    here = os.path.dirname(os.path.abspath(__file__))
    ch = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, "../../content/champions")
    sys.path.insert(0, here)
    import re
    src = open(os.path.join(here, "batch1.py"), encoding="utf-8").read()
    block = re.search(r"^HERO = \{(.*?)^\}", src, re.S | re.M).group(1)
    heroes = set(re.findall(r'"[^"]+":\s*"([^"]+)"', block))
    bad = audit(heroes, ch)
    for p in bad:
        print("❌ " + p, file=sys.stderr)
    if bad:
        print(f"\n變身態作者閘擋下 {len(bad)} 筆。", file=sys.stderr)
        sys.exit(1)
    print(report(heroes, ch))

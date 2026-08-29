#!/usr/bin/env python3
"""GH#814 —— champion 卡面「(可學習的)技能：」行 ↔ 實際掛的技能名 對帳。

⭐ 這一支只**量**與**分類**,⛔ 它不改任何內容。

背景(CLAUDE.md 記憶 `ggd-naming-layer`):
    GGD 有自己的命名層 —— **改名不是缺陷**,數值/行為/**編號**才是。
    ⇒ 「對不上」有兩種完全不同的意思,而它們長得一模一樣:

      ① 合法改名 —— 卡面那一行是 w3x 地圖的**原文**(從 STRINGS.json 匯入),
         而 GGD 給了那支技能一個新名字。⭐ 這是設計,⛔ 不是缺陷。
      ② 真的接錯 —— 技能↔槽位對不上(#764 的主症狀:編號漂掉 ⇒ 同步器
         照 key join 把整支技能覆蓋掉)。⭐ 這是缺陷。

⭐ 分辨兩者的判準**不是名字**,是**編號** ——
    編號(`NN-NN`)是 JASS 對照的 join key(CLAUDE.md 第〇·六守則),它綁死。
    ⇒ 名字不同 + 編號自洽  ⇒ ①(改名)
    ⇒ 編號本身不自洽       ⇒ ②(接錯)

用法:
    python3 tools/champion-cards/skill_line_audit.py            # 人看的報告
    python3 tools/champion-cards/skill_line_audit.py --json     # 機器讀的
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ⭐ 卡面那一段是一個**區塊**,⛔ 不是一行 —— 而這正是量尺第一次說謊的地方:
#    `技能：` / `可學習的技能：` 之後常常**換行**才寫名字,而且會**跨多行**
#    (godie-e001:「鬼隱之擊\n、染血的柴刀、五吋釘、雛見澤症候群L5」)。
#    ⛔ 一條 `^…技能[：:]\s*(.*)$` 的正則只吃得到**一行**
#      ⇒ 它會把 e001 的後三格報成「對不上」,而那三格完全正確。
#    ⭐ 所以這裡逐字照抄客戶端 `championProfile.ts::parseDescriptionSections`
#      的切法 —— 玩家看到什麼,這支就量什麼(⛔ 不是另造一條通道,失敗形態⑤)。
HEADER_LINE = re.compile(r"^\s*([一-鿿]{2,6})\s*[:：]\s*(.*)$")
SKILL_HEADERS = ("技能", "可學習的技能")
OTHER_HEADERS = ("故事", "推薦玩家", "上手度", "角色成長")


def skills_section(description: str) -> str | None:
    """照客戶端的切法取出「技能」區塊的全文(沒有就是 None)。"""
    cur: str | None = None
    buf: list[str] = []
    found = False
    for line in (description or "").replace("\r\n", "\n").split("\n"):
        m = HEADER_LINE.match(line)
        header = m.group(1) if m else None
        if header in SKILL_HEADERS:
            cur, found = "skills", True
            if m.group(2).strip():
                buf.append(m.group(2))
            continue
        if header in OTHER_HEADERS:
            cur = header
            continue
        if cur == "skills" and line.strip():
            buf.append(line)
    return "\n".join(buf).strip() if found else None

# 技能名的編號前綴 —— 這是 JASS 的 join key,⛔ 不是名字的一部分
# ⚠️ 英雄段有 **3 位數**的(`100-01` 喪標麥可)⇒ `\d{2}` 會在那裡靜默失手,
#    然後把「沒有編號前綴」報成缺陷。⭐ 第一版就是這樣多報了 1 位。
CODE_PREFIX = re.compile(r"^\s*(\d{2,3})-(\d{2,3})\s*")

SLOTS = ("Q", "W", "E", "R")


def norm(s: str) -> str:
    """剝掉編號前綴與**每一個非文字符號**,留下可比對的字面。

    卡面原文與技能名之間唯一無意義的差異是標點與空白:
      · 分隔符「、」同時也出現在技能名**裡面**(「臨、兵、鬥」在卡面上寫成「臨兵鬥」)
        ⇒ ⛔ 不可以用「、」切開再逐項比對 —— 那會把 1 支技能數成 3 支。
        ⭐ 正解:兩邊都剝光,再問「這支技能的名字有沒有出現在那一段裡」。

    ⚠️⚠️ **⛔ 不要用手列的標點表** —— 第一版列了 40 幾個字元,而它連漏兩次:
      · ASCII `.`(NFKC 會把全形「．」變成它)⇒ 76-04「三檔.巨人迴旋彈」對不上
      · U+02D9「˙」⇒ NFKC 把它拆成 **空白 ＋ 結合用點**(U+0307),
        而那顆結合用點**不在表裡** ⇒ 34-04「奧義˙蒼龍破」對不上
      兩次都是**量尺造出來的**差異,⛔ 不是內容差異 —— 而它們看起來一模一樣。
    ⭐ 所以判準改成**推導的**:只留 Unicode 類別是「文字(L*)」或「數字(N*)」的,
      其餘(標點 P* / 符號 S* / 空白 Z* / 結合用記號 M*)一律剝掉。
    """
    s = unicodedata.normalize("NFKC", s or "")
    s = CODE_PREFIX.sub("", s)
    return "".join(ch for ch in s if unicodedata.category(ch)[0] in ("L", "N"))


def code_of(name: str) -> str | None:
    """技能名開頭的 `NN-NN` join key(沒有就是 None)。"""
    m = CODE_PREFIX.match(unicodedata.normalize("NFKC", name or ""))
    return f"{m.group(1)}-{m.group(2)}" if m else None


def load_champions() -> list[dict]:
    out = []
    for f in sorted(glob.glob(os.path.join(REPO, "content/champions/*.json"))):
        if os.path.basename(f) == "_index.json":
            continue
        with open(f, encoding="utf-8") as fh:
            out.append(json.load(fh))
    return out


def audit() -> dict:
    """逐位英雄比對,回傳一份機器可讀的結果。"""
    champs = load_champions()
    rows = []
    for d in champs:
        listed_raw = skills_section(d.get("description", "") or "")
        if listed_raw is None:
            continue
        listed_norm = norm(listed_raw)

        # ① 名字軸 —— 每一格的技能名有沒有出現在卡面那一行裡
        name_misses = []
        # ② 編號軸 —— join key 自己自洽嗎(#764 的主症狀就長在這裡)
        codes = {}
        for slot in SLOTS:
            ab = (d.get("abilities") or {}).get(slot) or {}
            nm = ab.get("name", "") or ""
            codes[slot] = code_of(nm)
            n = norm(nm)
            if not n or n not in listed_norm:
                name_misses.append({"slot": slot, "name": nm, "code": codes[slot]})

        rows.append({
            "id": d["id"],
            "champion": d.get("name"),
            "listed": listed_raw,
            "codes": codes,
            "nameMisses": name_misses,
        })
    return {"withLine": len(rows), "rows": rows}


def key_integrity(row: dict) -> list[str]:
    """編號(join key)自洽性 —— ⭐ 這是「真接錯」的唯一硬證據。

    ⚠️⚠️ **這個函式的第一版多寫了一條規則,而那條規則是錯的。**
    第一版有第 (c) 條「槽位段要對應 QWER(Q=01 W=02 E=03 R=04)」,於是它把
    草泥馬(`godie-h02u`/`h02v`)判成「接錯」。⛔ 而 CLAUDE.md 對**這一位英雄**
    逐字寫過相反的話:

        「編號↔技能是 JASS 對照的 join key(綁死,`92-02` 永遠是消化液),
          **技能↔槽位是設計偏好(做成欄位)**」

    ⇒ ⭐ 判準是「**這支技能還在不在**」(集合完整),
       ⛔ 不是「它掛在哪一格」(排列自由)。
       那條多出來的規則會把 owner 刻意的擺放判成缺陷 —— 正是這張票要避免的事。

    留下的三條(都是**關係**,⛔ 不是名詞):
      a. 四格編號**不可以重複** —— 重複 ⇒ 有一支被另一支覆蓋掉了(#764 的形狀:
         消化液整支消失、兩格都叫狂草泥馬)
      b. 四格的**英雄段**要一致 —— 不一致 ⇒ 這一格是別位英雄的技能
      c. 四格的**槽位段合起來要是一個完整集合**(⛔ 不是逐格對位) ——
         缺號 ⇒ 有一支不見了;⭐ 順序不管,那是設計
    """
    bad = []
    codes = row["codes"]
    missing = [s for s, c in codes.items() if c is None]
    if missing:
        bad.append(f"沒有編號前綴: {missing}")
    present = [c for c in codes.values() if c]
    if len(set(present)) != len(present):
        dup = sorted({c for c in present if present.count(c) > 1})
        bad.append(f"編號重複(有技能被覆蓋掉): {dup}")
    heroes = sorted({c.split("-")[0] for c in present})
    if len(heroes) > 1:
        bad.append(f"英雄段不一致: {heroes}")
    tails = sorted(c.split("-")[1] for c in present)
    if len(present) == len(SLOTS) and tails != ["01", "02", "03", "04"]:
        bad.append(f"槽位段不是完整的 01..04(有技能不見了): {tails}")
    return bad


# ── 原作(w3x)那一半 ───────────────────────────────────────────────────────────
#: w3x 解析產物。⚠️ 這是 **join key 的來源**,⛔ 不是「另一份技能表」。
W3X_ABILITIES = "tools/w3x-import/out/GoDieEX22s/parsed/abilities.json"
W3X_HEROES = "tools/w3x-import/out/GoDieEX22s/parsed/heroes.json"
#: 命名對照帳本 —— ⭐ 只收**推導不出來**的那幾格(見 `classify()` 的順序)。
LEDGER = "tools/champion-cards/skill-line-naming.json"


def w3x_by_code() -> dict[str, list[tuple[str, dict]]]:
    """原作技能:join key(`NN-NN`) → [(rawcode, 記錄)]。"""
    with open(os.path.join(REPO, W3X_ABILITIES), encoding="utf-8") as fh:
        raw = json.load(fh)
    out: dict[str, list[tuple[str, dict]]] = {}
    for rc, v in raw.items():
        c = code_of(v.get("name") or "")
        if c:
            out.setdefault(c, []).append((rc, v))
    return out


def classify(rows: list[dict]) -> list[dict]:
    """⭐ 把每一個「對不上」的槽位判成一類。**順序就是證據強度**,⛔ 不可以調換。

    | 類 | 判準(⭐ 全部從出貨資料推導,⛔ 沒有一條是手寫的名單) |
    |---|---|
    | `wired-wrong` | ⭐ **這是唯一的缺陷類**。join key 自己不自洽(見 `key_integrity`) |
    | `w3x-self-inconsistent` | GGD 的技能名 **就是原作那支技能自己的名字** ⇒ 對不上的是**原作的英雄卡面清單**。⛔ 這不是 GGD 造成的,改它反而會破壞保真度 |
    | `owner-spec` | `provenance == "owner-spec"` ⇒ 階梯**第 1 層**(owner 新版說明)贏過卡面的**第 4 層**(w3x 文案)。⛔ 不必逐格解釋 |
    | `ledger` | 以上都不是 ⇒ **要有一列帶理由的登記**,⛔ 否則紅 |

    ⚠️ 為什麼 `w3x-self-inconsistent` 排在 `owner-spec` **前面**:
       兩者都會發生在同一格(例 `godie-e00r.W`:`owner-spec` 而名字與原作逐字相同)。
       ⭐ 取**證據較強**的那一個 —— 「與原作同名」是一個查得出來的事實,
       ⛔ 而「它是 owner 規格」只說得出它有權不同,說不出它為什麼不同。
    """
    by_code = w3x_by_code()
    out = []
    for r in rows:
        if r["keyProblems"]:
            out.append({"id": r["id"], "slot": "*", "cls": "wired-wrong",
                        "detail": "; ".join(r["keyProblems"])})
            continue
        champ = next(d for d in load_champions() if d["id"] == r["id"])
        for miss in r["nameMisses"]:
            ab = champ["abilities"][miss["slot"]]
            code = miss["code"]
            hits = by_code.get(code, [])
            w3x_names = sorted({h[1].get("name") or "" for h in hits})
            row = {"id": r["id"], "slot": miss["slot"], "code": code,
                   "ggd": miss["name"], "w3x": w3x_names}
            if any(norm(n) == norm(miss["name"]) for n in w3x_names):
                row["cls"] = "w3x-self-inconsistent"
            elif ab.get("provenance") == "owner-spec":
                row["cls"] = "owner-spec"
            else:
                row["cls"] = "ledger"
            out.append(row)
    return out


def load_ledger() -> dict:
    p = os.path.join(REPO, LEDGER)
    if not os.path.exists(p):
        return {"entries": []}
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def check(findings: list[dict]) -> list[str]:
    """⭐ 閘。三種紅,⛔ 沒有第四種(而「對不上的位數」刻意**不是**其中之一)。"""
    errs = []
    for f in findings:
        if f["cls"] == "wired-wrong":
            errs.append(f"🚨 接錯 {f['id']}: {f['detail']}")

    led = {e["id"]: e for e in load_ledger().get("entries", [])}
    need = {f"{f['id']}.{f['slot']}": f for f in findings if f["cls"] == "ledger"}

    for key, f in sorted(need.items()):
        e = led.get(key)
        if not e:
            errs.append(
                f"⛔ 未分類的改名 {key} —— GGD「{f['ggd']}」/ 原作「{f['w3x']}」。\n"
                f"   ⭐ 先判它是①合法改名還是②接錯,再決定要不要在 {LEDGER} 補一列"
                f"(**帶一個能被反駁的理由**),⛔ 不要改這條閘。")
            continue
        # ⭐ 帳本的每一列都要**指得到原作那一格** —— 這一行讓「理由」falsifiable:
        #    亂編一個 w3x 名字就紅,而 w3x 那一頭改了也紅。
        if e.get("w3x") not in f["w3x"]:
            errs.append(f"⛔ 帳本 {key} 寫原作叫「{e.get('w3x')}」,"
                        f"而 {W3X_ABILITIES} 說是 {f['w3x']}")
        if not (e.get("reason") or "").strip():
            errs.append(f"⛔ 帳本 {key} 沒有理由 —— ⛔ 一列沒有理由的豁免等於沒有豁免")

    # ⭐ 棘輪:只准變短。修好一格(或它變成 owner-spec)之後那一列就是死的,要刪掉。
    for key in sorted(set(led) - set(need)):
        errs.append(f"⛔ 帳本 {key} 已經不需要了(那一格現在推導得出來)—— 刪掉它")
    return errs


def uabi_gaps() -> list[str]:
    """AC5 —— 原作 `uabi`/`uhab` 裡**在 GGD 沒有落點**的技能,逐位列出。

    ⭐ 落點的判準是 **join key**(`NN-NN`),⛔ 不是名字 —— 名字是命名層,會改。
    ⚠️ 只算**有編號**的:`AInv`(物品欄)/`Aamk`(屬性提升)這種系統技能沒有編號,
       它們本來就不該在英雄的四格裡,列出來只會變成雜訊。
    """
    with open(os.path.join(REPO, W3X_ABILITIES), encoding="utf-8") as fh:
        ab = json.load(fh)
    with open(os.path.join(REPO, W3X_HEROES), encoding="utf-8") as fh:
        heroes = json.load(fh)

    # GGD 這一頭:英雄段 → 已經有落點的完整編號。
    # ⚠️⚠️ **第一版只掃英雄卡的 QWER 四格,於是報出「68 位英雄有落差」** ——
    #    而那 68 位裡絕大多數的「落差」是 `NN-00`(天生)與 `NN-002`(EX),
    #    它們**住 `content/abilities/`**,⛔ 不在 champion 的四格裡。
    # ⭐ 一份把「我沒去看的地方」報成「缺口」的清單,比沒有清單更糟(它看起來是量過的)。
    #    ⇒ 落點要掃**全部出貨技能文件**,⛔ 不是四格。
    landed: dict[str, set[str]] = {}
    for f in sorted(glob.glob(os.path.join(REPO, "content/abilities/*.json"))):
        if os.path.basename(f) == "_index.json":
            continue
        with open(f, encoding="utf-8") as fh:
            c = code_of((json.load(fh)).get("name", ""))
        if c:
            landed.setdefault(c.split("-")[0], set()).add(c)

    lines = []
    for rc, h in sorted(heroes.items()):
        owned = [ab[a] for a in (h.get("abilities") or []) + (h.get("hero_abilities") or [])
                 if a in ab]
        codes = [(code_of(o.get("name") or ""), o.get("name") or "") for o in owned]
        codes = [(c, n) for c, n in codes if c]
        if not codes:
            continue
        seg = max({c.split("-")[0] for c, _ in codes},
                  key=lambda s: sum(1 for c, _ in codes if c.startswith(s + "-")))
        gaps = sorted({(c, n) for c, n in codes
                       if c.split("-")[0] == seg and c not in landed.get(seg, set())})
        # ⭐ 兩種「落差」意思完全不同,⛔ 混在一起這張清單就沒有訊號:
        #    · 這個英雄段 GGD **一支都沒有** ⇒ 那位英雄根本沒上架,⛔ 不是技能漏接
        #    · 這個英雄段 GGD **有**,而其中幾支沒落點 ⇒ ⭐ 這才是 #764 AC5 要的
        if gaps:
            kind = "英雄未上架" if seg not in landed else "⭐ 已上架但這幾支沒落點"
            lines.append(f"[{kind}] {rc} {h.get('name')} (段 {seg}): "
                         + " · ".join(f"{c} {n[len(c) + 1:]}" for c, n in gaps))

        # ⭐ 第三桶:**沒有編號的** uabi —— #764 逐字點名的 `A017 超賽攻擊` /
        #    `A0MJ 球體(悟空超3)` / `A0T0 球體(龍魔人)` 全在這裡。
        # ⚠️ 它們**沒有 join key** ⇒ 上面那條 join **結構上看不到它們**
        #    (⛔ 「我的掃描沒報它」不等於「它有落點」—— 只驗名詞不驗關係的反方向)。
        #    ⇒ 只能按 rawcode 列出來給人看,並誠實標明「無法 join」。
        # 判準:`base != id` ＝ 地圖自訂的衍生技能;`base == id` 是 WC3 內建(物品欄那些)。
        if seg in landed:
            un = sorted({(a, ab[a].get("name") or "")
                         for a in (h.get("abilities") or []) if a in ab
                         and not code_of(ab[a].get("name") or "")
                         and ab[a].get("base") != a})
            if un:
                lines.append(f"[⚠️ 無編號⇒join 不到,需人判] {rc} {h.get('name')}: "
                             + " · ".join(f"{a} {n}" for a, n in un))
    return sorted(lines)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--json", action="store_true", help="機器讀的完整結果")
    ap.add_argument("--check", action="store_true", help="閘:有缺陷/未分類 ⇒ 非零")
    ap.add_argument("--uabi", action="store_true", help="AC5:uabi 落差清單")
    args = ap.parse_args()

    if args.uabi:
        gaps = uabi_gaps()
        print(f"# 原作 uabi/uhab 在 GGD 沒有落點的技能 —— {len(gaps)} 位英雄有落差")
        for ln in gaps:
            print(ln)
        return 0

    res = audit()
    for r in res["rows"]:
        r["keyProblems"] = key_integrity(r)
    findings = classify(res["rows"])
    res["findings"] = findings

    if args.check:
        errs = check(findings)
        for e in errs:
            print(e)
        print(f"{'⛔ 紅' if errs else '✅ 綠'} —— 有「技能：」行 {res['withLine']} 位 · "
              f"對不上 {sum(1 for f in findings if f['cls'] != 'wired-wrong')} 格 · "
              f"接錯 {sum(1 for f in findings if f['cls'] == 'wired-wrong')} 格")
        return 1 if errs else 0

    if args.json:
        json.dump(res, sys.stdout, ensure_ascii=False, indent=1)
        print()
        return 0

    tally: dict[str, int] = {}
    for f in findings:
        tally[f["cls"]] = tally.get(f["cls"], 0) + 1
    print(f"有「技能：」行 {res['withLine']} 位 · "
          f"名字對不上 {sum(1 for r in res['rows'] if r['nameMisses'])} 位 / "
          f"{len(findings)} 格")
    for k, v in sorted(tally.items(), key=lambda kv: -kv[1]):
        print(f"  {k:24s} {v}")
    for f in findings:
        if f["cls"] in ("ledger", "wired-wrong"):
            print(f"  ⛔ {f['id']}.{f['slot']} {f.get('ggd', '')} "
                  f"← 原作 {f.get('w3x', f.get('detail'))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""GH#1234 — 從**磁碟上的檔**反方向問出處，產生 CREDITS.md 的模型出處區段。

═══════════════════════════════════════════════════════════════════════════════
 ⭐ 為什麼這支存在：一張**手打的**出處表，在下一批模型進來的那一刻就過期了
═══════════════════════════════════════════════════════════════════════════════
2026-09-19 量到（`content/assets/CREDITS.md` 的手打表 vs 磁碟）：

    目錄                          表上寫    磁碟上    差
    assets/models/ou99/            129       130      +1
    assets/models/ou99/versions/    54        94     +40
    assets/models/community/        75       206    +131
    assets/models/community/versions/ 180     445    +265
    assets/models/imported/versions/  2        29     +27
    assets/models/champions/versions/ 3        10      +7

⛔ 六列裡五列是錯的,⭐ 而既有的閘 `externalModelProvenance.test.ts` 全綠 ——
因為它比對的是「這個**目錄**有沒有被宣告」,⛔ 不是「這一列的**數字**對不對」。
⇒ 這正是票文預言的「手打的清單下一批進來就過期」(第〇·四守則:值不要有第二個住處)。

═══════════════════════════════════════════════════════════════════════════════
 ⭐⭐ 而反方向問出來的第二件事,比數字更重要：**目錄 ≠ 出處**
═══════════════════════════════════════════════════════════════════════════════
`version.body.*` 這一族(凍結的回滾副本)帶著 `bodyVersion.sourceModelKey`,
它指回**原始**那一顆。逐條追下去之後量到:

    assets/models/community/versions/ 底下有一大批,其 sourceModelKey 是 `ou99.*`

⇒ ⭐ **ou99 的真實足跡是 358 份模型文件,⛔ 不是目錄表上的 129。**
⛔ 一張照**目錄**分類的出處表,會把 ou99 來源的檔算進 community 名下 ——
而 ou99 正好是這張票裡**權利狀態未定**的那一批。

⇒ 所以這支腳本照**血緣**(遞迴解 sourceModelKey 到根)分類,⛔ 不是照目錄,
  並且**兩張表都產**:血緣表回答「誰的東西」,目錄表回答「位元組住哪」。

═══════════════════════════════════════════════════════════════════════════════
 用法
═══════════════════════════════════════════════════════════════════════════════
    python3 tools/credits/model_provenance.py --check    # 閘:過期回 1 並印出 diff
    python3 tools/credits/model_provenance.py --write    # 寫回 CREDITS.md 的 marker 區段
    python3 tools/credits/model_provenance.py --print    # 只印區段內容

⚠️ ⛔ **刻意沒有產生日期**(與 `caps:export` / `spec:build` 同一個理由):
任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等,於是 `--check` 只能被放寬成
模糊比對 —— ⭐ 而一條被放寬的閘等於沒有閘。
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTENT = ROOT / "content"
MODELS = CONTENT / "models"
CHAMPIONS = CONTENT / "champions"
CREDITS = CONTENT / "assets" / "CREDITS.md"

BEGIN = "<!-- BEGIN GENERATED:model-provenance -->"
END = "<!-- END GENERATED:model-provenance -->"

# ⭐ 每一個血緣家族的**出處**與**權利狀態**。
#
# ⛔⛔ 這張表是本檔唯一手寫的東西,而它只可以寫**查得到出處的事實** ——
# ⛔ 不要在這裡編一個授權說法。一句我們支持不了的授權宣告,比留白更糟:
# 留白是「我們還不知道」,編造是「我們主張」,而後者這個專案站不住。
#
# ⚠️ `rights` 那一格若是未定,就逐字寫「待 owner 一句話」,⛔ 不要填 CC0/CC-BY。
FAMILIES: dict[str, dict[str, str]] = {
    "ou99": {
        "label": "`ou99.*` — ou99.com 論壇",
        "source": "第三方 WC3 模型，取自 **ou99.com** 論壇。逐帖出處（149 帖：帖號、標題、預覽圖、上傳日）記在 `docs/ou99模組metadata.md`。",
        "rights": "⛔ **未定 —— 待 owner（購買人）一句話。** 該站以站內貨幣（元宝）計價，且每一帖都要回覆才解得開附件。⛔ 不要在這裡填一個授權說法。",
    },
    "community": {
        "label": "`community.body.*` — 社群投稿／編輯器上傳",
        "source": "經社群英雄工坊投稿或由編輯器上傳，內容定址（`community.body.<sha>`）。逐筆的來源站、作者、取得途徑記在 `materials/asset-library/current-resources.json` 與 hero-model-library 的索引。",
        "rights": "⚠️ **混合出處**，⛔ 不是單一授權包。來源紀錄有寫的就保留；**沒寫的一律維持「未知」**，⛔ 不升級成 CC0／CC-BY／原作。",
    },
    "imported": {
        "label": "`imported.*` — GoGoDie w3x 原作",
        "source": "從 GoGoDie Warcraft III 自訂地圖抽出，與其餘 w3x 匯入同一批出處。",
        "rights": "同 w3x 匯入批次：owner 2026-08-19 裁決「直接上架但註記來源」。",
    },
    "w3x": {
        "label": "`w3x.stock.*` — Warcraft III 內建",
        "source": "暴雪 Warcraft III 內建模型（stock MPQ）。",
        "rights": "同上：原作匯入批次，註記來源。",
    },
    "champ": {
        "label": "`champ.*` — 本專案自有／KayKit 等已具名來源",
        "source": "第一方英雄與怪物模型；逐顆的授權寫在本檔上面的 **Characters** 一節。",
        "rights": "見 **Characters** 節（KayKit 等各自的授權）。",
    },
    "prop": {
        "label": "`prop.*` — 場景道具",
        "source": "場景道具模型；授權見本檔 **Environment props** 一節。",
        "rights": "見 **Environment props** 節。",
    },
}


def load_models() -> dict[str, dict]:
    """出貨的模型文件。⛔ `_` 開頭的不是模型 doc（overlay/standin/voxel 設定）。"""
    docs: dict[str, dict] = {}
    for path in sorted(MODELS.glob("*.json")):
        if path.name.startswith("_"):
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        model_id = doc.get("id")
        if model_id:
            docs[model_id] = doc
    return docs


def resolve_root(model_id: str, docs: dict[str, dict]) -> str:
    """遞迴解 `bodyVersion.sourceModelKey` 到根。

    ⚠️ 帶 `seen` 是因為一個**自我指涉**的 sourceModelKey 會讓這裡無限迴圈 ——
    ⛔ 而那不是假設:資料是人與腳本一起寫的,環是可能的。撞到環就停在原地。
    """
    seen: set[str] = set()
    current = model_id
    while current not in seen:
        seen.add(current)
        doc = docs.get(current)
        if not doc:
            break
        nxt = (doc.get("bodyVersion") or {}).get("sourceModelKey")
        if not nxt or nxt == current:
            break
        current = nxt
    return current


def family_of(root_id: str) -> str:
    head = root_id.split(".", 1)[0]
    return head if head in FAMILIES else "其他"


def load_champion_refs() -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """回傳 (現役本體 modelKey -> 英雄名, 回滾清單裡的 modelKey -> 英雄名)。

    ⭐ 兩者刻意分開:「⛔ 這一顆現在是誰的臉」與「它在誰的回滾清單裡」
    是兩個不同的問題,而權利狀態的急迫性只跟前者綁。
    """
    active: dict[str, set[str]] = defaultdict(set)
    retained: dict[str, set[str]] = defaultdict(set)
    for path in sorted(CHAMPIONS.glob("*.json")):
        if path.name.startswith("_"):
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        name = doc.get("name") or doc.get("id") or path.stem
        key = doc.get("modelKey")
        if key:
            active[key].add(name)
        for version in doc.get("modelVersions") or []:
            vkey = version.get("modelKey")
            if vkey and vkey != key:
                retained[vkey].add(name)
    return active, retained


def build_block() -> str:
    docs = load_models()
    active, retained = load_champion_refs()

    by_family: dict[str, list[str]] = defaultdict(list)
    by_dir: dict[str, int] = defaultdict(int)
    files_by_family: dict[str, set[str]] = defaultdict(set)
    dirs_by_family: dict[str, set[str]] = defaultdict(set)

    for model_id, doc in docs.items():
        fam = family_of(resolve_root(model_id, docs))
        by_family[fam].append(model_id)
        glb = doc.get("glbPath")
        if glb:
            directory = os.path.dirname(glb)
            by_dir[directory] += 1
            files_by_family[fam].add(glb)
            dirs_by_family[fam].add(directory)

    lines: list[str] = []
    add = lines.append

    add("")
    add("> ⚠️ **這一段是產生的** —— `python3 tools/credits/model_provenance.py --write`。")
    add("> ⛔ 不要手改；手改的數字在下一批模型進來時就過期，而過期的出處表會讓稽核失效。")
    add("> 閘：`--check` 逐位元組比對。")
    add("")

    # ── 表 A：照血緣（⭐ 這是「誰的東西」的答案） ──────────────────────────
    add("#### A. 照**血緣**分類 —— ⭐ 權利問題問的是這一張")
    add("")
    add("⭐ 血緣＝遞迴解 `bodyVersion.sourceModelKey` 到根，⛔ 不是看檔案住哪個目錄。")
    add("⚠️ **兩者會分岔**：凍結的回滾副本一律寫進 `assets/models/community/versions/`，")
    add("而其中有一大批的 `sourceModelKey` 是 `ou99.*` ⇒ ⛔ 照目錄分類會把 ou99 的東西算進 community 名下。")
    add("")
    add("| 血緣 | 模型文件 | 實際 glb 檔 | 現役英雄本體 | 在回滾清單裡 | 來源 | 權利狀態 |")
    add("| --- | ---: | ---: | ---: | ---: | --- | --- |")
    for fam in sorted(by_family, key=lambda f: (-len(by_family[f]), f)):
        ids = by_family[fam]
        meta = FAMILIES.get(fam, {"label": f"`{fam}`", "source": "⛔ 未分類", "rights": "⛔ 未知"})
        n_active = len({h for i in ids for h in active.get(i, ())})
        n_retained = len({h for i in ids for h in retained.get(i, ())})
        add(
            f"| {meta['label']} | {len(ids)} | {len(files_by_family[fam])} | "
            f"{n_active} | {n_retained} | {meta['source']} | {meta['rights']} |"
        )
    add("")
    add(f"⭐ 合計 **{len(docs)}** 份模型文件、**{len({d['glbPath'] for d in docs.values() if d.get('glbPath')})}** 個實際 glb 檔。")
    add("")

    # ── 表 B：照目錄（位元組住哪；也是既有方向閘讀的那一張） ────────────
    add("#### B. 照**出貨目錄**分類 —— 位元組住哪")
    add("")
    add("⚠️ 這一張**不能**拿來回答權利問題（見上）。它在這裡是因為")
    add("`externalModelProvenance.test.ts` 從這一頭走：磁碟上有檔而這裡沒有列 ⇒ 紅。")
    add("")
    add("| 出貨目錄 | 模型文件 | 主要血緣 |")
    add("| --- | ---: | --- |")
    for directory in sorted(by_dir, key=lambda d: (-by_dir[d], d)):
        owners = sorted(
            (f for f in dirs_by_family if directory in dirs_by_family[f]),
            key=lambda f: -len([i for i in by_family[f] if os.path.dirname(docs[i].get("glbPath") or "") == directory]),
        )
        shown = "、".join(f"`{o}`" for o in owners) if owners else "—"
        add(f"| `{directory}/` | {by_dir[directory]} | {shown} |")
    add("")

    return "\n".join(lines)


def splice(text: str, block: str) -> str:
    start = text.find(BEGIN)
    stop = text.find(END)
    if start == -1 or stop == -1:
        raise SystemExit(
            f"⛔ 在 {CREDITS} 找不到 marker：\n  {BEGIN}\n  {END}\n"
            "⇒ 先把這兩行加進 CREDITS.md 的第三方模型那一節裡。"
        )
    return text[: start + len(BEGIN)] + "\n" + block + text[stop:]


def main() -> int:
    ap = argparse.ArgumentParser(description="GH#1234 模型出處區段產生器")
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="閘：過期回非零")
    mode.add_argument("--write", action="store_true", help="寫回 CREDITS.md")
    mode.add_argument("--print", dest="show", action="store_true", help="只印區段")
    args = ap.parse_args()

    block = build_block()
    if args.show:
        print(block)
        return 0

    current = CREDITS.read_text(encoding="utf-8")
    updated = splice(current, block)

    if args.write:
        CREDITS.write_text(updated, encoding="utf-8")
        print(f"✓ 已更新 {CREDITS.relative_to(ROOT)} 的 {BEGIN} 區段")
        return 0

    # --check
    if updated == current:
        print("✓ CREDITS.md 的模型出處區段是最新的")
        return 0
    print(
        "⛔ CREDITS.md 的模型出處區段**過期了**。\n"
        "⇒ 跑 `python3 tools/credits/model_provenance.py --write` 然後 `git add content/assets/CREDITS.md`。\n"
        "⛔ 不要手改那個區段。",
        file=sys.stderr,
    )
    import difflib

    diff = difflib.unified_diff(
        current.splitlines(), updated.splitlines(), "現在的", "應該是", lineterm="", n=1
    )
    for line in list(diff)[:60]:
        print(line, file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
把第一批 90 支重製技能寫成**一份獨立的 md** —— owner 2026-08-12：

    「我之前給你的 90 個技能正規化 你是否將最終結果存成一個獨立 md 檔？
      我覺得你新舊混在一起搞錯了」

他說得對。在這支之前，這 90 支的「最終結果」散在三個地方而且都混著別的東西：

  1. `tools/skill-remake/batch1.py`   —— 規格被我轉寫成 Python 參數（不是人看的）
  2. `docs/技能編輯器引擎須知 20260811.md` §13.10 —— JSON 塞在一份 8,855 行的
     大文件裡，同一份文件同時裝著引擎說明、傳說道具、舊的機制盤點
  3. `docs/_skill-remake-batch1.patch` —— 一個 478KB 的 diff，讀不了

⛔ 三個都不是「這 90 支現在長什麼樣」的單一答案，而且 2 和 3 都**新舊混在一起**。

這支腳本產出的 `docs/英雄技能第一批重製-90支.md` 是那個單一答案：
一支技能一節，**owner 原始規格逐字**在上、**產出的 JSON**在下，兩者並排，
所以「我有沒有照規格做」用眼睛就看得出來，不用去 diff 一份 478KB 的 patch。

⚠️ 它是**推導出來的**，不是手寫的 —— 和 batch1.py 讀同一張表 `T`。
手寫一份就會變成第四個住處，而它一定會過期（CLAUDE.md 第一守則的三個住處那條）。

用法：
    python3 tools/skill-remake/emit_spec_md.py
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../.."))
OUT = os.path.join(ROOT, "docs", "英雄技能第一批重製-90支.md")

# batch1.py 在 import 時就會把 T 填好（A(...) 是 module-level 呼叫），
# 但它的 main() 會寫檔 —— 所以只 import，不呼叫 main()。
spec = importlib.util.spec_from_file_location("batch1", os.path.join(HERE, "batch1.py"))
batch1 = importlib.util.module_from_spec(spec)
sys.modules["batch1"] = batch1
spec.loader.exec_module(batch1)

T, HERO, build = batch1.T, batch1.HERO, batch1.build

SLOT_ZH = {"passive": "天生技", "Q": "Q", "W": "W", "E": "E", "R": "R", "ex": "EX"}


def hero_of(num: str) -> str:
    """`45-01` → `45`。編號的前兩碼是英雄號（ggd-ability-numbering）。"""
    return num.split("-")[0]


def main() -> None:
    docs = [build(e) for e in T]
    assert len(docs) == 90, f"表裡只有 {len(docs)} 支，應該是 90"
    spec_by_id = {}
    for e in T:
        cid, slot, d = build(e)
        spec_by_id[d["id"]] = e

    L = []
    L.append("# 英雄技能・第一批重製（90 支）")
    L.append("")
    L.append("> ⭐ **這一份是這 90 支的單一答案。** owner 的原始規格與產出的 JSON 並排，")
    L.append("> 一支一節。要確認「有沒有照規格做」看這裡，⛔ 不要去讀 patch 或大文件。")
    L.append(">")
    L.append("> ⚠️ 這份文件是 `tools/skill-remake/emit_spec_md.py` **從產生器同一張表推導**出來的，")
    L.append("> ⛔ 不是手寫的。改了規格要重跑腳本，不要手改這份文件（手改 = 第四個住處，一定過期）。")
    L.append("")
    L.append("## 上線狀態")
    L.append("")
    L.append("✅ **這 90 支已經上線**（2026-08-12）。全套測試綠：`packages/shared` 3,434 條。")
    L.append("")
    L.append("### 落地的過程（留著，因為它是這批最貴的教訓）")
    L.append("")
    L.append("第一次套用時 **17 個測試檔、57 條守衛變紅**。逐檔真因分析（15 個診斷 agent")
    L.append("＋ 61 條對抗複驗）的結論是：**不是 90 支各有各的問題，是 8 個模板缺口被複製了 90 次**。")
    L.append("")
    L.append("| 類 | 條數 | 收斂後 |")
    L.append("|---|---:|---:|")
    L.append("| **A · 產生器缺陷**（規格有、JSON 沒表達出來） | 35（61%） | **8** |")
    L.append("| **B · 規格真的改了設計**（測試釘的是舊行為） | 19（33%） | 5 |")
    L.append("| **C · 測試夾具帳務** | 2（4%） | 1 |")
    L.append("")
    L.append("A 類 8 個全部修在**產生器**（`batch1.py` + 新的 `tag_gate.py`），⛔ 不是逐支打補丁。")
    L.append("其中 CP 值最高的一格是 **A-2：產生器從來沒跑過 `pnpm content:build`** —— 一行指令消 7 條紅。")
    L.append("")
    L.append("B 類 5 組由 owner 逐項裁決：B-1 EX 照說明實作 · B-2 揍敵客全做 · B-3 新版優先")
    L.append("（w3x 原作數值另存 [`_w3x-fidelity-superseded.md`](legacy/_w3x-fidelity-superseded.md)）·")
    L.append("B-4 志狼變身退場（「刻意減少變身」）· B-5 一護靈壓 −50%。")
    L.append("")
    L.append("完整分析：[`_skill-remake-batch1-真因分析.md`](_skill-remake-batch1-真因分析.md)")
    L.append("")
    L.append("---")
    L.append("")
    L.append("## 目錄")
    L.append("")

    heroes = sorted({hero_of(e["num"]) for e in T}, key=int)
    for h in heroes:
        cid = HERO.get(h, "?")
        names = [e["name"] for e in T if hero_of(e["num"]) == h]
        L.append(f"- [{h} — `{cid}`](#{h}--{cid.replace('.', '')}) · {len(names)} 支")
    L.append("")
    L.append("---")
    L.append("")

    for h in heroes:
        cid = HERO.get(h, "?")
        mine = [(c, s, d) for c, s, d in docs if hero_of(spec_by_id[d["id"]]["num"]) == h]
        if not mine:
            continue
        L.append(f"## {h} — `{cid}`")
        L.append("")
        for _c, slot, d in mine:
            e = spec_by_id[d["id"]]
            L.append(f"### `{d['id']}` — {d['name']}　<sub>{SLOT_ZH.get(slot, slot)}</sub>")
            L.append("")
            L.append("**owner 原始規格**（逐字，⛔ 不要改寫）：")
            L.append("")
            L.append("```")
            L.append(e["desc"])
            L.append("```")
            L.append("")
            # 規格的結構化欄位，讓「JSON 有沒有照抄」一眼可比
            L.append("| 欄位 | 規格 | JSON |")
            L.append("|---|---|---|")
            L.append(f"| 施法型別 | `{e['cast']}` | `{d.get('castType', '—')}` |")
            L.append(f"| 冷卻 | `{e['cd']}` | `{d.get('cooldown', '—')}` |")
            L.append(f"| MP | `{e['mp']}` | `{d.get('manaCost', '—')}` |")
            L.append(f"| 施法距離 | `{e['rng']}` | `{d.get('range', '—')}` |")
            rt = d.get("radiusTier", e.get("radiusTier", "—"))
            L.append(f"| 範圍級距 | `{e.get('radiusTier', '—')}` | `{rt}` |")
            mr = e.get("maxRank")
            mr_txt = f"`{mr}`" if mr else f"由冷卻/MP 陣列長度推導（{len(e['cd'])}）"
            L.append(f"| 階數 | {mr_txt} | `{d.get('maxRank', '—')}` |")
            L.append("")
            kinds = sorted({x.get("kind") for x in d.get("effects", []) if isinstance(x, dict)})
            if kinds:
                # ⚠️ 2026-08-12：`damageArea` 曾經是紅字警告（它是**擴散／濺射**不是
                #    「範圍傷害」，`includeOrigin` 預設會跳過 `ctx.targets`）。A 類修完
                #    之後這些位置全部通過行為守衛，所以降級成中性註記 —— ⛔ 但語意還是
                #    容易搞錯，寫下來讓下一個人知道它不是「AoE damage」。
                flag = "　<sub>ℹ️ `damageArea` = 擴散／濺射（圓心是事件受害者），不是「範圍傷害」</sub>" if "damageArea" in kinds else ""
                L.append(f"效果 kinds：{', '.join(f'`{k}`' for k in kinds)}{flag}")
                L.append("")
            L.append("<details><summary>產出的 JSON</summary>")
            L.append("")
            L.append("```jsonc")
            L.append(json.dumps(d, ensure_ascii=False, indent=2))
            L.append("```")
            L.append("")
            L.append("</details>")
            L.append("")
        L.append("---")
        L.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(L))
    n_area = sum(1 for _c, _s, d in docs
                 if any(x.get("kind") == "damageArea" for x in d.get("effects", []) if isinstance(x, dict)))
    print(f"寫出 {OUT}")
    print(f"  {len(docs)} 支 / {len(heroes)} 位英雄 / 其中 {n_area} 支用 damageArea（擴散語意，已通過行為守衛）")


if __name__ == "__main__":
    main()

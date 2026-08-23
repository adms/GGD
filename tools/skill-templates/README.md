# tools/skill-templates —— 全技能**形狀**掃描器

owner 技能模板群組 **⑨** 逐字：

> 「以上範例技能模板請**重新掃描套用在全部技能**，檢查是否有**動畫效果等待、迴圈、持續特效**等機制，**形成新模板及套用設定**」

```bash
# 產生那張表
python3 tools/skill-templates/scan_shapes.py --out docs/editor-contract/ggd-skill-shapes.md

# 閘（唯讀）：欄位覆蓋 + 產物新鮮度。紅了跑上面那行然後 git add
python3 tools/skill-templates/scan_shapes.py --check --out docs/editor-contract/ggd-skill-shapes.md

# 掃描器自己的守衛（對白剝除 / conditional / 覆蓋閘沒瞎）
python3 tools/skill-templates/scan_shapes.py --selftest
```

## 三個檔的分工

| 檔 | 是什麼 | 改它的時機 |
|---|---|---|
| `shape_axes.json` | **實作側**的唯一住處：出貨 JSON 的哪一格算哪一條軸 | 引擎多一個時序機制／模板多一格參數 |
| `prose_markers.json` | **宣稱側**的唯一住處：說明裡的哪一句話算哪一條軸 | owner 寫出新的措辭 |
| `scan_shapes.py` | 掃描 + 分群 + 產出 | ⛔ 幾乎不用改 —— 它裡面**一個欄位名都沒有** |

⛔ **不要把欄位名寫進 `scan_shapes.py`。** 那會讓同一份知識有第二個住處（第〇·四守則），
而第二份必然過期。

## 閘為什麼是閘（⛔ 不是判準）

`--check` 在兩件事上回非零：

1. **欄位覆蓋** —— 出貨技能／模板裡出現過的欄位名，落在 `axes` / `byKind` / `ignored` 之外 ⇒ 紅，
   訊息指名那個欄位與它出現在哪個 kind。
   ⭐ 這一條是承重的：沒有它，引擎哪天加一個 `windUpSec` 而沒有人分類它，掃描器會**安靜地**
   把那一族技能算成「沒有等待」，而報表看起來完全正常（CLAUDE.md 失敗形態②）。
   ⚠️ **它已經在真實漂移上叫過三次**（2026-08-23 這一輪內）：
   `(passive).deathWard` 一族 5 個授予欄、以及另一條 lane 剛落地的 `spawnModelFx.lifeSec`。
2. **產物新鮮度** —— `--out` 指的那份文件與現在算出來的**逐位元組**不同 ⇒ 紅。

**突變驗過**（2026-08-23）：把 `implemented_axes.resolve()` 的 `return None` 改成 `return []`
（＝把覆蓋閘弄瞎）之後，從 `shape_axes.json` 拔掉 `delaySec` 這一格，`--check` 仍然印
「✅ 覆蓋與新鮮度都過」。⇒ ⭐ 而 `--selftest` 的第 ③ 條會紅並指名它，所以那條自檢是保護閘的東西。

## ⚠️ 產物刻意沒有產生日期

同 `caps:export` / `spec:build` 的理由：任何隨時鐘變動的欄位都會讓逐位元組比對永遠不相等，
於是 `--check` 只能被放寬成模糊比對 —— 而一條被放寬的閘等於沒有閘。

## 還沒接上的兩條線（⛔ 主 session 做，它們在本 lane 的柵欄外）

owner ④ 逐字：「記得最後還要將**技能機制模板、效果模板、特效模板**更新到 JSON, script,
**codex編輯器契約與文件**」。JSON（兩份表）· script（掃描器）· **契約文件**
（`docs/editor-contract/ggd-skill-shapes.md`）都已落地，剩下把它接進聚合指令：

```jsonc
// package.json "scripts" —— ⭐ 這兩行要在**同一個 commit** 落地
"shapes:build": "python3 tools/skill-templates/scan_shapes.py --out docs/editor-contract/ggd-skill-shapes.md",
"shapes:check": "python3 tools/skill-templates/scan_shapes.py --check --out docs/editor-contract/ggd-skill-shapes.md",
```

1. `skills:sync` 尾巴接 `&& pnpm shapes:build`
2. `skills:check` 尾巴接 `&& pnpm shapes:check`

⚠️ **只加 `shapes:check` 而不收進 `skills:check` 會紅** ——
`packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` 要求 package.json 裡
**每一支** `*:check` 要嘛在聚合裡、要嘛在豁免表裡帶著一個能被反駁的理由。
⭐ 那條紅**是對的**，它正是那道閘在做它的工作。

⭐ `shapes:build` 只**讀** `content/`，⛔ 不寫 `bundle.json` ⇒ 它不吃 `skills:sync` 的全域鎖，
排在 `content:build` 前後都對。

## ⛔ 產生器印出來的數字要是**算的**，不可以是**打的**

2026-08-23 第二輪抓到：`render()` 的散文裡手打了三個數字（`41 份文件` · `421 支裡的 361 支` ·
`22 個 draft`），⭐ 而 **`22` 當天就是假的（真值 21）**。

⚠️ 新鮮度閘對它**結構性失明**：`--check` 比對的是「產生器現在會吐什麼」對「檔案裡是什麼」，
而產生器吐的就是那句手打的散文 ⇒ **產物抄產生器，自己跟自己永遠對得上**。

⇒ ⭐ **「這份文件是產生的」不保證它是真的。** 加新的散文時，凡是句子裡有數字，
一律從 `rows` / `templates` 當場算（見 `unused_draft` / `would_hit` 那兩處）。

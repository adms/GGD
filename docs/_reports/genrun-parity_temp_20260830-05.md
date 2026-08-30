# #879 — `genrun.sh skillremake:json` 在乾淨 HEAD 上就會改東西

2026-08-30 · lane #879 · commit `53e6cb72f`（main）

---

## 0. 基線（⛔ 先量，再動）

| 量什麼 | 指令 | 結果 |
|---|---|---|
| 樹是不是同步的 | `python3 tools/skill-remake/batch1.py --check` | **EXIT 0**（「產生器印記一致：90 支」） |
| 兩條 parity 閘 | `npx vitest run …abilityCodeParity.test.ts …abilityCodeParityForms.test.ts` | **5/5 綠** |
| 工作樹 | `git status --porcelain content/` | **乾淨** |

⇒ ⭐ 起點確認：**票文說的現象還沒發生，而閘全綠。**

---

## 1. 重現（一次 `genrun`，四支被推開）

```bash
bash scripts/genrun.sh skillremake:json      # EXIT 0
git status --porcelain content/
```

| 檔 | HEAD | 跑完 |
|---|---:|---:|
| `content/abilities/godie-emns.ex.json` | `1` | **1.033** |
| `content/abilities/godie-ewar.ex.json` | `1` | **1.133** |
| `content/abilities/godie-ewar.r.json` | `1` | **1.233** |
| `content/abilities/godie-hapm.ex.json` | `1` | **1.033** |
| `content/champions/godie-ewar.json`（內嵌 R） | `1` | **1.233** |

兩條閘同時紅（3 個 `it` 失敗）：

```
abilityCodeParity      ⛔ 2 組同編號技能新出現機制數值不一致
  12-002|castTimeSec  godie-e007.ex=1  ｜  godie-ewar.ex=1.133
  12-04 |castTimeSec  godie-e007.r =1  ｜  godie-ewar.r =1.233
abilityCodeParityForms ⛔ 單邊 12-002 / 12-04（只有本體 godie-ewar 動了）
                       ⛔ 兩形態詠唱不同的編號從 18 變成 20
```

⚠️ 而產物隔離區（444）擋著 ⇒ 還原不了 ⇒ **lane 沒有出口**。

---

## 2. 根因 —— ⭐ 公式把**自己的輸出**讀回去當「規格值」

### ① 佔位在註冊時就被渲染進 `description`

四份文件的原始 `description` 是：

```
… {{cd}}秒冷卻，吟唱{{cast}}秒 消耗MP{{mp}} …
```

`registries.ts` 在註冊時把它渲染成字面文字。實測（`Abilities.tryGet(...)` 的 `description`）：

```
… 60秒冷卻，吟唱1秒 消耗MP288 …
```

而 `{{cast}}` 渲染的值是 **`min(castTimeSec, castTimeMaxSec)`**，出貨 `castTimeMaxSec = 1`（#787）。

### ② `authoredCastSec()` 讀的正是那一段渲染後的文字

`packages/shared/src/content/castTimeFormula.ts`：

```ts
function authoredCastSec(def: AbilityDef & { description?: string }): number | null {
  const raw = def.description;                     // ← 渲染後的
  const mech = raw.replace(/「[^」]*」/gs, "");
  const m = /(?:吟唱|施展時間|詠唱)\s*([\d.]+)\s*秒/.exec(mech);
  …
}
```

⇒ ⭐ 它**分不出**「owner 在規格裡寫了吟唱 1 秒」與「`{{cast}}` 剛好渲染出 1」。
`authored` 分支贏過階梯（第〇·六守則：說明是第 1 層）⇒ **公式的輸入裡有一格是它自己的輸出。**

### ③ `batch1.py` 照 RETIRED 先把 `castTimeSec` 丟掉再 derive

`common.py` 的 `RETIRED` 逐字寫著「castTimeSec：唯一來源是 `deriveCastTime()`，
舊值抄回來一定是錯的」。⇒ 這 90 支寫出來時**沒有這一格**。

於是這個映射有**兩個定點**：

| 進 derive 時磁碟上的值 | `{{cast}}` 渲染成 | 走哪一支 | 寫出來 |
|---|---|---|---|
| **缺席** | 0 | scored 階梯 | `1.233`（`godie-ewar.r`） |
| `1.233` | `min(1.233, 1)` = 1 | **authored** | `1` |
| `1` | `1` | authored | `1` ← ⭐ 定點 |

### ④ ⇒ 出貨的那一份是「**兩趟**」的結果

`skills:sync` 的鏈是 `skillremake:json && castderive:build:raw && …` ——
**下一步剛好又跑了一趟 `deriveCastTimes --write`**，把 1.233 拉回 1。
而 `bash scripts/genrun.sh skillremake:json` **只跑一趟**。

⭐ **實證**：跑完 `genrun skillremake:json`（樹在 1.033/1.133/1.233）之後，
單獨跑 `bash scripts/genrun.sh castderive:build:raw`：

```
WROTE 4 ability docs, 1 champion docs (1 embedded copies).
```

⇒ 那 4 支逐位元組回到 HEAD。**證明了它是一個「跑幾次」的函數，不是一個「輸入」的函數。**

### ⑤ 為什麼只有這 4 支（母體）

只有 **scored 階梯值 > `castTimeMaxSec`（1.0）** 的技能，兩個定點才會**不相等**。
其餘每一支的 `min(L, 1) = L` ⇒ 一趟就是定點 ⇒ 看不出來。

### ⑥ 為什麼 parity 是「⛔ 單邊」而不是「兩邊」

變身態 `godie-e007`（`godie-ewar` 的對子）**不在這 90 支裡**
（它手編，理由在 `tools/skill-remake/form_counterparts.py`）
⇒ 它的 `castTimeSec` 沒有被丟掉 ⇒ 它留在 authored 定點 `1`
⇒ 只有本體那一邊動了 ⇒ 編號 12-002 / 12-04 的 join key 兩邊說不同的話。

### ⑦ 而 `--check` 為什麼說「同步」—— ⭐ 一把只驗過單邊的尺

`batch1.py --check` 的比對**刻意排除 `castTimeSec`**（原註解說得對：這支不寫那一格，
算進去會永遠紅）。⇒ ⭐ 但它因此**對「這支腳本會改的東西之一」結構上失明**：

> `--check` EXIT 0 ⛔ **不等於**「跑一次不會改東西」。

⚠️ 這正是 CLAUDE.md 記的「**一把只驗過單邊的尺，不算自證過**」與
「⑨ 一個永遠不會綠的閘 / ⑫ 只驗名詞不驗關係」同族。

---

## 3. 修法 —— 跑到**定點**（`tools/skill-remake/batch1.py::finalize_content()`）

```
build(①)                      # 讓 config.cast-time 新鮮（原本就有，理由見 GH#835）
for pass in 1..4:
    deriveCastTimes --write   # ⛔ 輸出一行都不吞
    if WROTE 0 + 0: 收斂,break # ⇒ 產物已是新鮮的,不必再 build
    build(② pass)
else:
    非零離開並指名（⇒ authoredCastSec 的迴圈比 2-循環長）
```

實測收斂序列（乾淨 HEAD）：

```
第 1 趟  WROTE 50 ability docs, 14 champion docs (42 embedded)
第 2 趟  WROTE  4 ability docs,  1 champion docs ( 1 embedded)
第 3 趟  WROTE  0 ability docs,  0 champion docs   ✓ 收斂
```

⇒ ⭐ **樹回到與 HEAD 逐位元組相同**（那 4 支 + `godie-ewar.json` 的 `git diff` 是空的）。

### ⛔ 三條刻意沒走的路

| ⛔ 沒做 | 為什麼 |
|---|---|
| 改那 4 支的值 | 票文明令；而且現在它們是**產生器自己算回來**的，⛔ 不是手填的 |
| 放寬 parity 閘 / 動 baseline | 票文明令；⭐ 而且 baseline 是只准變短的棘輪 |
| 「不要丟掉舊值」（保留 `castTimeSec` 再 derive） | 一趟就到定點，⛔ 但會讓**每一支帶 `{{cast}}` 的技能永遠釘在舊值上** —— 機制改了也不重算。那正是 `RETIRED` 存在的理由 |
| 把 `castTimeMaxSec` 夾子搬進公式 | 那是 owner 的止血閥（#787），**刻意**夾在載入時（`castTimeRules.ts:172`）。烘進資料 ⇒ `castTimeProse.test.ts` ③「把 `castTimeMaxSec` 拉到 8 ⇒ 卡面回到規格值」那一格就轉不動了 |

### ⭐ 順帶：把 `--check` 那一格的散文改成誠實的

原註解只說「排除 castTimeSec 是為了不永遠紅」。現在它同時寫下**它因此量不到什麼**，
並指名「跑一次是不是 no-op」的閘在收斂迴圈裡。

---

## 4. ⚠️ 仍然存在的根因（⛔ 我沒有修，而它在我的柵欄外）

⭐ **`authoredCastSec()` 讀渲染後的 `description`** 這件事本身沒有被修掉 ——
收斂迴圈只是讓它**收斂到同一個定點**。

真正的根治是讓 `deriveCastTime()` 讀**未渲染的原始 `description`**
（`吟唱{{cast}}秒` 不該被當成一個 owner 寫下的規格值），
落點是 `packages/shared/src/content/castTimeFormula.ts` /
`packages/shared/scripts/deriveCastTimes.ts` —— **兩者都在這條 lane 的檔案柵欄外**。

⚠️ 那個修法會把這 4 支的 `castTimeSec` 從 `1` 推到 `1.033/1.133/1.233`（＝真正的階梯值），
⇒ 需要同時處理變身態那一邊與 parity baseline ⇒ **是一張獨立的票，⛔ 不是這一張。**
（依 lane 規矩 ⛔ 不開新票 —— 已寫在 #879 的留言與這份報告裡。）

---

## 5. 閘

| 閘 | 結果 |
|---|---|
| `python3 tools/skill-remake/batch1.py --check` | EXIT 0 |
| `bash scripts/genrun.sh skillremake:json` | EXIT 0 · 收斂 50→4→0 · castTimeSec **零漂移** |
| `abilityCodeParity.test.ts` | ✅ 2/2 |
| `abilityCodeParityForms.test.ts` | ✅ 3/3 |
| `skillRemakeJsonFresh.test.ts` | ✅ |
| `deriveCastTimesFailsLoud.test.ts` | ✅ |

**突變**：⭐ **修改前的原碼本身就是突變體**（單趟 derive）——
2026-08-30 在乾淨 HEAD 上實測紅（4 支漂移 + 兩條閘 3 個 `it` 失敗，訊息逐字指名
`12-002` / `12-04`），換上收斂迴圈後同一棵樹回到 byte-identical、5/5 綠。

---

## 6. ⚠️ 工作樹裡**不是我的**東西（⛔ 我沒有 commit 它們）

收工時 `git status --porcelain content/` 還有：

```
 M content/abilities/godie-hart.r.json      ← spawnVfx at:"target" → at:"bone"/attach:"chest"/boneOn:"victim"
 M content/champions/godie-hart.json        （同一處內嵌複本）
 M content/abilities/_index.json  M content/champions/_index.json
 M content/bundle.json  M content/manifest.json  M content/editor-target-profile.json
 M scripts/release-note-players.sh
```

⭐ **那是另一條併行 lane 的改動**（`godie-hart.r` ⛔ 不在 `skillremake:json` 的 90 支裡，
`batch1.py --check` 對它是綠的，而 `attach`/`boneOn` 全 repo 沒有任何產生器會寫）。
索引/bundle/manifest 之所以髒，是因為它們把那一筆烘進去了。

⇒ 本 lane 的 commit **只列 `tools/skill-remake/batch1.py` 一個 pathspec**
（CLAUDE.md：`git commit -- <逐檔列名>`，⛔ 不 `git add`）。

# `vfxSubtypesRatchet` ① —— 零 `call` 的 vfx-script 2 → 37 的根因與處置

**日期** 2026-09-10 · **分支** `worktree-agent-ac6d5a5c2b5193a32` · **票** GH#990（棘輪）／GH#1158＋#1165（七名 LOL 英雄上架）

---

## 0. 一句話

那 37 支拆成 **7 + 28 兩種完全不同的東西**，而舊量尺把它們算成同一種：

| | 支數 | 是什麼 | 處置 |
|---|---:|---|---|
| **A** LOL 的 7 支 `.r` | 7 | ⭐ **舊寫法**（`call` 被**編譯器烘平**成 inline —— ⛔ 不是誰手抄的） | ⭐ 改回 `call`（展開後逐位元組不變） |
| **B** LOL 的 28 支 `.q/.w/.e/.ex` | 28 | ⭐ **另一種合法寫法**（兩段：喊招動作＋招名浮字，⛔ 沒有任何可抽出去的積木） | ⭐ **改判準**（⛔ 不是調基準線） |
| **C** `godie-hart.r` · `godie-udea.r` | 2 | 原本就在基準線裡（12 段／1 段，無 ≥2 呼叫端的重複） | 不動 |

---

## 1. `call` 在防什麼

owner 2026-09-05（逐字，`vfxSubtype.ts` 檔頭）：

> 「並且盡量特效模組化(甚至 sub-type) 像JASS一樣可以呼叫設定 來拼湊組合
>  並非每個技能都一個特定特效」

`{"call":{"subtype":"sub.x","params":{…}}}` 在**載入時**由
`content/vfxSubtypes/expand.ts` 展開（消費端只有一支：`registries.ts:336`
`VfxScripts.register(expandVfxScriptDoc(d, VfxSubtypes.tryGet))`）。

⇒ 它是**第〇·四守則在演出軸上的落地**：一塊積木的段落只有**一個住處**
（`content/vfx-subtypes/sub.x.json`），呼叫端只寫「與預設不同的那幾格」。
⛔ 把展開結果烘進每一支 script ＝ 那塊積木有了 N 個住處，而它們之後各自漂。

---

## 2. 那 35 份是哪一種 —— 逐條證據

### 2.1 它們是**產物**（`genguard` 說不擋，但上游來源存在）

```
$ bash scripts/genguard.sh content/vfx-scripts/lol-lux.q.json
✓ 沒有**產生器**擁有者,而且沒有被隔離區鎖過。
   ⚠️ 這只表示 sync-io 的 writes 沒有它 —— **上游來源**仍然可能存在
$ grep -rl "lol-lux\|compileHeroPackageProject" tools/
tools/ship-81/lol7.py
tools/ship-81/lol7_compile.mts        ← ⭐ 上游來源在這裡
```

⇒ ⭐ 照 CLAUDE.md「genguard 說不擋 ≠ 沒有上游」那一條再問一次 ⇒ 找到了。
⚠️ 它們**不在 `skills:sync` 的產物表裡**，所以 `skills:sync` ⛔ 不會打回來 ——
⭐ 打回來的是**重跑 `tools/ship-81/lol7.py`**。

### 2.2 A 組（7 支 `.r`）：`call` 是**編譯器**弄丟的，⛔ 不是作者沒寫

作者稿**本來就寫著那一個 `call`** ——
`packages/shared/src/content/heroForge/communityExamples.ts:169`（出貨 TS，逐字）：

```ts
...(slot === "R" ? [{ call: { subtype: "sub.forward-twin-blast", params: {
  trigger: "castEffect", anchor: "target", offsetForwardU: 0, burstLifeSec: 0.8 } } }] : [])
```

而出貨的 `content/vfx-scripts/lol-*.r.json` 裡那一格是**兩段 inline `modelFx`**。
⭐ 中間那一步在這裡：

| 檔:行 | 做了什麼 | 對不對 |
|---|---|---|
| `heroForge/generator.ts:156` | `compileGeneratedHeroDraft()` → `expandVfxScriptDoc(script, …)` | ⭐ **對** —— 編輯器預覽（`apps/editor/src/hero/HeroPreview.tsx:37` 的 `VfxForgePreview`）吃的是**展開後**的 `VfxScriptDoc` |
| `content/import/heroPackage.ts:154` | `...compiled.vfxScripts.map(script => ({ collection: "vfx-scripts", …, document: json(script) }))` | ⛔ **錯** —— 它把**編譯結果**當成**出貨文件**。⚠️ 上面 `:121` 的註解逐字寫著「Retain call dependencies before compiling them **into inline runtime segments**」⇒ 這是**刻意的**，而它與第〇·四守則相牴觸 |
| `tools/ship-81/lol7_compile.mts` | 取 `compiled.runtime` 的 `vfx-scripts` 寫檔 | 忠實轉手 |

⭐ **獨立佐證**：我寫的偵測器（見 §3）**不看** `communityExamples.ts`，
只從磁碟上的 inline 段落把參數逆推回來，得到的是

```
lol-*.r#2..3 ⇒ sub.forward-twin-blast {"trigger":"castEffect","anchor":"target","offsetForwardU":0,"burstLifeSec":0.8}
```

—— ⭐ **與作者稿那一行逐字相同**（含 `burstLifeSec: 0.8`）。⇒ 是同一個 `call` 被烘平的。

⚠️ **`heroPackage.ts` 在這條 lane 的柵欄外** ⇒ ⛔ 我沒有改它。
⭐ 修法是一行：`runtime` 那一列改用**作者稿**（`generated.vfxScripts`，
它已經在 `compileHeroPackageProject` 的作用域裡），⛔ 不是 `compiled.vfxScripts`；
子模組本來就已經被 pin 進 `dependencies`（`heroPackage.ts:124–126`），所以攜帶性不受影響。
⭐ 而在那一行修好之前，**重跑 `lol7.py` 會讓這 7 份再變回 inline** —— ⭐ 那正是新閘要叫的時候。

### 2.3 B 組（28 支）：合法變體 —— ⛔ 它們沒有東西可以抽

量到的（45 支出貨 script 逐份解析）：

* 35 支 LOL script 的**前兩段完全同型**，⭐ **只差 `text` 一格**：
  `{anim, castStart, caster, cast}` ＋ `{floatingText, castEffect, colorRgb:[210,230,255], durationSec:0.7, text:<招名>}`
* 其中 **28 支的 `segments` 就只有這兩段**（`.q/.w/.e/.ex`），7 支 `.r` 多了 A 組那一對。

⇒ 這 28 支**沒有引用任何既有子模組**（`content/vfx-subtypes/` 今天 4 顆全部對不上）
⇒ ⛔ 它們不是「還沒改用 `call`」的債，它們是**新內容**。

---

## 3. 舊量尺為什麼是壞的（⛔ 這不是「基準線需要調高」）

舊斷言：**「零 `call` 的 vfx-script 支數」≤ 2**。

⭐ 那個數字**不是債，是一個隨名單長大的計數**：
七名英雄上架（+35 支）當天它 2 → 37，而 28/35 是完全正當的新內容。
⇒ 一個「⛔ 只能變少」的棘輪，被一件**應該發生**的事推高了 ⇒ 唯一的出路變成
「把基準線調高」——⭐ 也就是**把棘輪反過來用**（該檔第 30 行明令禁止的事）。

### ⭐ 新量尺：**可呼叫卻被寫成 inline 的複本**

> 一段（或連續數段）inline，而它**逐位元組等於**某一顆既有子模組
> 用**某組合法參數**展開的結果。

| 性質 | |
|---|---|
| **與名單大小無關** | 新英雄只要沒抄既有積木，一格都不動 ⇒ ⛔ 不會再被「正當的成長」推紅 |
| **嚴格更強** | 舊的只問「這**支**有沒有 call」；新的逐**視窗**掃 ⇒ 一支**已經有** call 的 script 裡又抄了一次別顆子模組，舊量尺看不見、新量尺會叫 |
| **走出貨的展開器** | 判定用 `expandVfxScriptEntries()`（⛔ 不是第二套比對邏輯）；參數超界／不在 enum ⇒ 展開器擲 ⇒ 那一段本來就寫不成 `call` ⇒ 不算債 |
| **訊息可執行** | 逐條印 `lol-lux.r#2..3 ⇒ sub.forward-twin-blast {…}`，並提醒「若它是編譯出來的，要改編譯器」 |

**基準線 `INLINE_SUBTYPE_COPY_BASELINE = 0`**（雙向棘輪維持）。

### ⚠️ 到期條件（⭐ 換量尺就要寫得出它什麼時候作廢）

1. 有人要量「還有多少 script 完全沒模組化」時 —— ⭐ 那是**另一個問題**，
   要量就**另開一列**，且分母要寫成「**有重複形狀可抽的** script 數」，⛔ 不是總數。
2. ⭐ 這條閘**量不到**「一個**重複 ≥2 次卻還沒有子模組**的新形狀」——
   **今天就有一個**（見 §5.1）。那顆子模組一旦落地，這條閘的基準線**仍是 0**，
   而「重複形狀普查」那一列要補上來。

---

## 4. 改了什麼

| 檔 | 改動 |
|---|---|
| `content/vfx-scripts/lol-{karthus,leesin,lux,missfortune,warwick,xerath,yasuo}.r.json` | `segments[2..3]` 兩段 inline → 一段 `{"call":{"subtype":"sub.forward-twin-blast","params":{…}}}`（⭐ 參數＝作者稿逐字） |
| `packages/shared/src/ops/vfxSubtypesRatchet.test.ts` | ① 下半換量尺（`callableInlineRuns()` ＋ `INLINE_SUBTYPE_COPY_BASELINE = 0`）＋ sentinel(e±) ＋ 檔頭記錄換量尺的理由與到期條件 |
| `content/{bundle,manifest,editor-target-profile}.json` · `content/vfx-scripts/_index.json` | `content:build` 的產物（⭐ 見 §5.2 —— 走的是 `product-quarantine unlock → buildIndexes → lock`） |

⛔ **沒有改**：`heroForge/**` 一行都沒動（⭐ 根因在柵欄外的 `content/import/heroPackage.ts:154`）、
`tools/ship-81/**`、`content/vfx-subtypes/**`、任何 ability／champion。

### ⭐ 行為不變的證據（⛔ 不是「我看起來一樣」）

改動前後各跑一次「**45 支出貨 script 全部經共用展開器展開**」並逐位元組 diff：

```
$ diff expanded-before.txt expanded-after.txt
⭐ 展開後逐位元組相同（行為不變）
```

⇒ 播放器看到的東西**一個位元組都沒變**；變的只有「它住在哪裡」。

### ⭐ 突變驗證（承重那一條）

把 `lol-lux.r` 的 `call` 烘平回 inline（＝ `lol7.py` 重跑一次的樣子）：

```
× ① 棘輪（雙向）：可呼叫卻被寫成 inline 的複本只能變少
  → ⛔ 被寫成 inline 的子模組複本變多了：1 > 0
    lol-lux.r#2..3 ⇒ sub.forward-twin-blast {"trigger":"castEffect","anchor":"target","offsetForwardU":0,"burstLifeSec":0.8}
```

⭐ 紅，而且**指名到段號與參數**。改回來之後 8/8 綠。

### ⭐ sentinel 兩個方向（⛔ 一把只驗過單邊的尺不算自證過）

* `(e+)` 把某顆子模組的**預設展開**原樣當 inline 餵回去 ⇒ 偵測器**必須**抓到
* `(e−)` 一段 `screenShake`（任何子模組都表達不出）⇒ 偵測器**必須**回空
  （⚠️ 少了這一半，一個「永遠回非空」的偵測器也會通過 `(e+)`，而它會把每一支 script 判成債）

---

## 5. ⚠️ 順手量到、⛔ 沒有修也沒有開票的三件事

### 5.1 ⭐ 一顆該存在而不存在的子模組：`sub.cast-announce`

那 35 支 LOL script 的前兩段 —— **35 個呼叫端、只差 `text` 一格** ——
是今天 `content/vfx-scripts/` 裡**重複次數最高**的形狀（既有 4 顆子模組各只有 2 個呼叫端）。

⇒ 它完全符合 `vfxSubtype.ts` 檔頭自己的收案標準（⛔ 不是「零壓縮純轉手」：
2 段 → 1 個 call ＋ 1 格參數）。落地要動 **`content/vfx-subtypes/`（本 lane 柵欄外）**
＋ `communityExamples.ts` 改發 `call`。做完之後 28 支也會帶 `call`。

### 5.2 ⛔⛔ `pnpm content:build` 在**乾淨 checkout 上跑不起來**（⚠️ 與本 lane 無關，先於我）

```
vfx-asset-safety: FAIL (33 blocker(s))
FAIL model:ou99.495015: missing assets/models/ou99/ou99_495015.glb   （×33）
✗✗ genrun: `pnpm content:build` 失敗（exit 1）—— ⛔ 產物**沒有**重新產生。
```

`content:build:raw` 的**第一步**就是 `pnpm vfxassets:check`，而 `assets/models/` 在這個
worktree **整個目錄不存在**（素材不進 git —— owner 2026-09-08 的裁決）。
⇒ ⭐ **任何內容 lane 今天都沒辦法照 CLAUDE.md 的規矩重建 bundle**，
而 `shippedBundleIsCurrent` 會因此紅在一個**與它無關的原因**上。

**本 lane 的繞法**（⛔ 不是修它）：
`bash scripts/product-quarantine.sh unlock` → `pnpm --filter @ggd/shared content:build`
（＝ `tsx scripts/buildIndexes.ts`，也就是 `content:build:raw` 的第二步）→ `... lock`。
⭐ 產物 diff 只有 `contentVersion` / `vfx-scripts` hash / 那 7 筆的 hash+size ——
⛔ 沒有任何無關的東西被重寫。
⇒ ⭐ 真正的修法多半是讓 `vfxassets:check` 對「**資產本體不在這台機器上**」與
「**資產在但壞了**」給出**不同**的離開碼（今天兩者都是 exit 1）。

### 5.3 ⚠️ `heroPackage.ts:121` 的註解與第〇·四守則相牴觸

那句「Retain call dependencies before compiling them into inline runtime segments.
Authoring remains unchanged, and the package pins each exact subtype.」——
⭐ 前半（pin 子模組）是對的且已經在做；⛔ 後半（烘平成 inline runtime segments）
在**出貨到 `content/` 的那一條路上**是第〇·四守則的違反。
⚠️ 而它對**英雄包匯出**那條路可能是刻意的（另一台機器可能沒有那顆子模組）——
⭐ 但 `dependencies` 已經帶著它了，所以那個理由今天不成立。

---

## 6. 驗證紀錄

| 指令 | 結果 |
|---|---|
| `npx vitest run …/vfxSubtypesRatchet.test.ts`（基準線） | ⛔ 1 failed —— `37 > 2` |
| 同上（改完） | ✅ 8 passed |
| 同上（突變：把 1 支烘平回 inline） | ⛔ 1 failed，指名 `lol-lux.r#2..3` |
| `npx vitest run` ratchet ＋ `shippedBundleIsCurrent` ＋ `shippedBundleHasTrackedSources` ＋ `vfxScriptNoDoubleDraw` ＋ `vfxNotSpawnedTwice` | ✅ **18 passed / 5 files** |
| `pnpm typecheck` | 見 commit 訊息 |
| 展開後逐位元組 diff（45 支） | ✅ 零差異 |

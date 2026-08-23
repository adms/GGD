# P4 —— 技能模板語料的閘（owner 第 4 項）

> owner：「記得最後還要將**技能機制模板、效果模板、特效模板**更新到 JSON, script,
> codex 編輯器契約與文件」

lane P4 · 2026-08-23 · 檔案柵欄：`tools/ability-templates/**` · `package.json` ·
`packages/shared/src/ops/skillsSyncCoversGenerators.test.ts` ·
`packages/shared/src/content/editorCapabilities.ts`（只改那條過期宣告）· `docs/ability-templates.*`

---

## ① 三支產生器 → 一對 `templates:build` / `templates:check`

```bash
pnpm templates:build    # python3 tools/ability-templates/gen.py
pnpm templates:check    # python3 tools/ability-templates/gen.py --check   (逐位元組)
```

⭐ **刻意是一對而不是三對。** 三支是一條鏈，而且**兩兩共用同一份產物**
（`docs/ability-templates.csv`）：

| 段 | 產出 |
|---|---|
| `classify_templates.build_rows()` | 第 1–40 欄（分類 / 參數 / WC3 / JASS / 行為模板） |
| `score_gap.score(rows)` | 第 41–42 欄（實作落差分 / 落差說明） |
| `emit_templates_md.render(rows)` | `docs/ability-templates.md` |

⛔ 在此之前三支**各自讀寫同一份 CSV**，於是**順序決定結果**：單獨跑
`classify_templates.py` 會把後兩段補的欄位**整欄洗掉** —— 七個 `行為*` 欄
（309 筆 JASS 細讀記錄）＋ 兩個落差欄（498 列評分），而它 **EXIT 0、沒有任何東西會紅**。
⇒ CLAUDE.md 第〇·七守則說的**順序相依**：⛔ 拆檔治不了它，治它的是入口本身。
三支的 `__main__` 現在一律轉呼叫 `gen.py`，所以那個腳雷踩不到了。

### ⭐ 順手修掉的一個「知識只住在產物裡」

七個 `行為*` 欄在 2026-08-23 之前**只住在 `docs/ability-templates.csv`**（一份產物），
而產生器根本不產生它們。⇒ 現在它們**從證據推導**：

| 欄 | 來源 |
|---|---|
| `行為原標` / `行為幾何` / `行為時序` / `位移語意` / `行為證據` / `行為備註` | `tools/w3x-import/out/GoDieEX22s-src/JASS_BEHAVIOR.json`（309 筆） |
| `JASS行為模板`（29 類的聚類定案） | ⭐ 新檔 `tools/ability-templates/behavior_clusters.json`（55 個原標 → 29 類） |

join 兩條路，順序固定：① `rawcode` ② 技能編號 `NN-XX` 前綴。
⚠️ **兩條都要** —— 258 筆裡有 **36 筆**的 rawcode 在細讀記錄裡是空的，只靠 rawcode
會靜默把那 36 支誤判成「無觸發」。

**保真度驗證（量到的，⛔ 不是宣稱）**：舊 CSV 與新 CSV 的 **258 列交集 × 7 欄 = 1,806 格，
不一致 0 格。** 推導完全重現了 12 代理的人工聚類。

### 產物的漂移量（這就是「沒有閘」的代價）

CSV 上一次產生是 **2026-07-25**（commit `d93508dd`），從那天起沒有再跑過：

| | 2026-07-25 | 今天 |
|---|---:|---:|
| `content/abilities/godie-*.json` | 654 | **413** |
| CSV 去重後的列 | 498 | **307** |
| 有 JASS 行為記錄的列 | 258 | 160 |

⇒ 一個月的內容改動完全沒有反映在 owner 要看的那份模板總類表上。

⚠️ `gen.py` **刻意沒有產生日期／時鐘欄位**（同 `caps:export` / `spec:build` /
`vfxbind:check` 的理由）—— 有時鐘就只能放寬成模糊比對，而一條被放寬的閘等於沒有閘。

---

## ② ⭐⭐ 覆蓋閘自己的洞

### 洞是什麼

`skillsSyncCoversGenerators.test.ts` 原本列舉的是 **`*:check` 腳本名**。
⇒ 一支**連腳本都沒有**的產生器對它是**不存在的** ——
`tools/ability-templates/` 就是這樣漂了一個月，`grep '"[a-z]+:[a-z]+".*template' package.json` → 0 筆。

### 怎麼補的

多加一條 `it()`，從**產物**那一端問同一個問題：
「有沒有 `tools/` 底下的程式在寫 **git 追蹤**的 `docs/` 或 `content/` 檔，
而它的目錄**完全不在**聚合指令的視野裡？」

判準（保守，為了⛔ 不誤報）：

1. 路徑字面值要**真的**對得上一個 git 追蹤的檔或目錄
2. ⭐ 字面值要能**串起來**：`ROOT / "docs" / "x.csv"` 與 `join(REPO,"docs","x.csv")`
   跟 `ROOT / "docs/x.csv"` 一樣算 —— ⚠️ 這一格是**突變逼出來的**（見下）
3. 指名一份**追蹤中的檔** + 這支有寫入呼叫 ⇒ 它是產生器；
   目錄落點則要同一行寫入、或綁到一個被寫的名字
4. python 的 `open()` 要真的帶 `"w"`/`"a"` 模式（⛔ 否則 `DictReader(open(…))` 被誤判）
5. 一次性報告落點（`docs/_reports/` · `docs/_daily/` · 任何 `_temp_`）不算產物
6. 「在視野裡」= 有一支 `*:check` 被 `skills:check` 跑到，**或**那一支已在既有 `EXEMPT` 裡
7. 腳本名 → package.json 是**多對一**（`voxel:check` 在 root 與 `tools/voxel-gen/package.json`
   各一份，root 只是 `pnpm --filter` 轉發）

### 它現在抓到幾支

| | |
|---|---:|
| 偵測到的產生器目錄 | **40** |
| 已被 `skills:check`（或 `EXEMPT`）涵蓋 | **30** |
| 進新的 `GENERATOR_NO_CHECK` 豁免表 | **10** |
| ⭐ 本 lane 從「零腳本」補上腳本的 | **3** |
| 誤報 | **0**（逐支看過，見下表） |

### ⭐ 補上腳本的三支（都只動 `package.json`）

| 腳本 | 產生器 | 為什麼它是真的洞 |
|---|---|---|
| `templates:build` / `templates:check` | `tools/ability-templates/gen.py` | owner 第 4 項點名的模板總類表，零腳本，漂了一個月 |
| `prose:build` / `prose:check` | `tools/card-prose/apply_placeholders.ts` | ⭐ **它本來就有 `--check`**，只是沒有腳本。CLAUDE.md 第〇·四守則**逐字點名**它是「說明文案要重推」的那一支 |
| `sfxbind:build` / `sfxbind:check` | `tools/sfx-bind/build_bindings.py` | ⭐ **它本來就有 `--check`**，寫 `content/audio-manifests/ability-sfx-cues.json` —— 正是 owner 那句話裡的「**特效音效綁定**」 |

三支現在的離開碼都是 **0**（跑過了）。
`templates:build` 與 `sfxbind:build` 已接進 `skills:sync`；
⛔ `prose:build` **刻意沒有接進 `skills:sync`** —— 它會寫回 `tools/skill-remake/heroes/*.py`，
而 `skills:sync` 的第一步 `skillremake:json` 正是從那些 py 產生技能 JSON；
兩者的正確順序沒有辦法在不跑 `skills:sync`（全域鎖）的情況下驗證。
⇒ `prose:check` 紅了要**手動**跑 `pnpm prose:build`。

### 10 支豁免（逐支有能被反駁的理由）

| 目錄 | 理由摘要 |
|---|---|
| `bgm-gen` | 產物是渲染出來的音樂與其 MANIFEST |
| `icon-gen` | 產物是圖示點陣圖；可審查的那半（提示詞）已有 `iconstyle:check` |
| `item-csv` / `champion-csv` / `augment-csv` | owner 的 CSV **往返編輯**流程，⛔ repo 裡沒有會過期的產物 |
| `voice-gen` | MANIFEST 隨**已錄好的音檔**增減，⛔ 不隨技能變 |
| `legendary-status` | 一份「當時做到哪」的進度報告 |
| `ttk-sim` | 實驗報告（重跑本來就會不一樣） |
| `vfx-census` | ⭐ 它自己的檔頭逐字寫著「⛔ 這不是新鮮度閘，⛔ 沒有 `--check`」 |
| **`hero-archetypes`** | ⛔ **這一列不是豁免，是一個量到的洞** |

### ⛔⛔ 一個**沒有補**的真洞：`tools/hero-archetypes/`

`archetypes:build` 在 `skills:sync` 裡、寫 `docs/hero-archetypes.json` 與
`docs/英雄定位與屬性總表.md`，而 `build.ts` **沒有 `--check` 模式** ⇒ 產物過期不會紅。
補它要改 `tools/hero-archetypes/build.ts` —— **P4 的檔案柵欄外**。
⇒ 它在表裡帶著「這是洞不是豁免」的字樣，**請開一張票**。

---

## ③ 過期的對外宣告：`effect.floating-text@1`

`packages/shared/src/content/editorCapabilities.ts:1564`（`expected: "partial"`）

**原文（現在是假的）**：

> ⛔ **缺的兩件**：① 客戶端把 `floatingText` 事件畫成一段會往上飄、會淡出的字；
> ② 該事件進 `eventFanout.ts` 的白名單。

**實際（逐項查過）**：

| 宣稱缺的 | 真相 |
|---|---|
| ① 客戶端沒畫 | `apps/client/src/vfx/FloatingTextFx.ts` ＋ `VfxSystem.ts:2141` 的 `case "floatingText"`（commit `77773e73`，2026-08-22） |
| ② 白名單沒進 | `apps/game-server/src/net/eventFanout.ts:66` 的 `FANNED_OUT_EVENT_TYPES` 裡有它 |

（`c49b04a1`／#608 再修了 payload 欄位對不上的那一層，所以它今天是**真的會動**。）

**改成什麼**：把那兩句換成「整條線已接通」＋ **三個仍然存在的限制**（這才是它是
`partial` 的理由，全部逐行對過程式碼）：

1. `applyTo` 只有 `self` / `victim`，⛔ **沒有 `all`**（`schema/effects/floatingText.ts:38`）
2. 同時最多幾段字 = `config.screen-fx@1.floatingTextMaxOnScreen`（出貨 48，界 1..200），
   ⭐ **建構時**吃掉 ⇒ 後台改了要重新整理；滿了會**擠掉剩餘壽命最短的那一段**
3. 同一錨點最多 **8** 段（第 9 段直接丟），同幀同點每段推 **90 ms**
   （`MAX_PER_ANCHOR` / `STAGGER_MS`）

`evidence` 也補上渲染與上線那兩半的檔案路徑。

### ⚠️ 順手量到、⛔ 沒有修的第二筆（同一族，⛔ 不在我這一條的範圍）

`effect.screen-feedback@1` 的 caveat 有**兩個**問題：
① 它同樣宣稱「① 客戶端沒畫 ② 白名單沒進」，而兩件都做完了；
② 它三次引用一個**不存在的 schema tag `config.screen-cues@1`** —— 真正的是
**`config.screen-fx@1`**（`packages/shared/src/content/schema/screenFxDoc.ts:59`）。
同一個假 tag 還出現在 `schema/effects/screenFlash.ts:15,32`、`screenShake.ts:28`、
`sim/effects/clientCues.ts:114,161`、`sim/effects/kindLimits.ts:473` —— **共 7 處**。
⇒ 對外契約在教編輯器作者找一個不存在的設定檔。**請開一張票。**

---

## ④ 突變紀錄

| # | 突變 | 期望 | 結果 |
|---|---|---|---|
| M1 | 把 `templates:build` / `templates:check` **兩支腳本連同 `skills:sync`/`skills:check` 的引用整個刪掉**（＝回到「零腳本的產生器」那個狀態） | 新那條 `it` 紅並指名 `tools/ability-templates/` | ⛔ **第一次是綠的** |
| M1b | 同上，修好偵測（字面值串接）後 | 同上 | ✅ 見下 |

⭐ **M1 綠掉是這次最有價值的一件事**：偵測只認 `"docs/x.csv"` 這種**單一**字面值，
而 `gen.py` 寫的是 `ROOT / "docs" / "ability-templates.csv"`（三個字面值）
⇒ 這條閘對**它自己剛剛接上的那一支**是瞎的。
⛔ 一個只看得到一半的閘，紅不起來的那一半才是它要防的東西（同 #467 那次）。
⇒ 修法：同一行的字面值**串起來**再比對；並補上「指名追蹤中的檔 + 檔案裡有寫入呼叫」
這條 file-level 規則（產生器多半把落點寫成模組級常數，再用**別的名字**寫出去）。

（M1b 的完整紅燈輸出見 commit message；⚠️ 突變改回來之後⛔ 不再重跑確認綠 ——
改壞之前已經綠過了。）

---

## ⑤ 離開碼

| 指令 | EXIT |
|---|---:|
| `pnpm templates:check` | **0** |
| `pnpm prose:check` | **0** |
| `pnpm sfxbind:check` | **0** |
| `pnpm typecheck` | **0** |
| `npx vitest run skillsSyncCoversGenerators.test.ts editorCapabilities.test.ts` | **0**（9 tests） |
| `pnpm caps:check` | ⛔ **1** —— 預期中：我改了 `editorCapabilities.ts`，`docs/editor-contract/*` 要重生成（⛔ 在 P4 柵欄外） |

---

## ⑥ ⚠️ 收尾要跑哪幾支

```bash
pnpm caps:export        # ⛔ 必跑 —— editorCapabilities.ts 的 caveat 改了,現在 caps:check 是紅的
pnpm templates:build    # 其他 lane 動過 content/abilities 或 content/champions 的話,要再跑一次
pnpm sfxbind:build      # 同上(它讀 content/abilities 的 sfxKey)
# ⛔ prose:build 只在 prose:check 紅的時候手動跑 —— 它會寫回 tools/skill-remake/heroes/*.py
```

⚠️ `pnpm skills:sync` 已經含 `templates:build` 與 `sfxbind:build`，
所以主 session 統一跑 `skills:sync` 的話這兩支不必另外跑；
⛔ **`caps:export` 也在 `skills:sync` 裡**，一次跑完即可。

## ⑦ ⛔ 沒做到的

| 項 | 為什麼 |
|---|---|
| `tools/hero-archetypes/build.ts` 補 `--check` | 柵欄外（`tools/**` 只准動 `ability-templates`）。已在豁免表裡標成「洞」 |
| `config.screen-cues@1` 這個假 tag 的 7 處 | 柵欄外（`schema/effects/*` · `sim/effects/*`），而 editorCapabilities.ts 只准改那**一條**過期宣告 |
| `effect.screen-feedback@1` 的過期 caveat | 同上：任務指定的是 `effect.f…`，我沒有自行擴大範圍 |
| 開 GH issue | ⛔ 硬性禁令：不做任何 `gh` 寫入 |

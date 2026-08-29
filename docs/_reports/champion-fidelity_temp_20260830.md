# 英雄資料保真度 —— #817（fist/claw）· #766（回血離群）

> lane 回報 · 2026-08-30 · 基準 `8ea49fff9`（main）
> 柵欄：`content/champions/*.json`（⛔ 除黑崎一護）· `packages/shared/src/content/` · `tools/stat-caps/`

---

## ⭐ 0. 這一輪最重要的一個發現：**兩張票的前一輪成果都不在 main 上**

```
$ git merge-base --is-ancestor e6cc2feb3 HEAD  →  ⛔ 不在 main（worktree-wf_1f72ad0e-1c3-5）
$ git merge-base --is-ancestor fa21efe3  HEAD  →  ⛔ 不在 main（worktree-wf_76b5e9f9-b99-5）
```

- `e6cc2feb3` 是 #766 上一輪的 `healthregenProvenance.test.ts` ⇒ **出貨樹上不存在那個檔**
- `fa21efe3` 是 #817 上一輪動的 21 份英雄卡 ⇒ **出貨樹上一個 tag 都沒補**

⚠️ #766 的進度標記寫著「鏈路已接上未驗收」，而**在出貨樹上它是「未動」**。
⭐ 這正是 CLAUDE.md 記載的那一課：「**它沒有在跑**」與「**它在哪一個環境**沒有在跑」是兩件事。
⇒ ⛔ 下一輪讀進度標記時要**先問它在哪一個 branch**，⛔ 不要把 lane 分支當成 main。

---

## 🥊 #817 —— ⛔ 這一輪**沒有動它**，因為每一個落點都在柵欄外

### 量到的基線（main，⛔ 不是引用票文）

| | |
|---|---:|
| 出貨 `WEAPON_TAGS` | `greatsword · katana · gun · bow · magic · thrown · sword`（⛔ **無 fist/claw**）|
| 近戰英雄 | **51** |
| ⛔ 走 `weaponClassOf` 的 LAST RESORT `sword` | **21** |
| 英雄卡上已有 `fist` tag | **0** |
| 英雄卡上已有 `claw` tag | **0** |

那 21 隻：`e00r edem ewar h01u h02k h02r h02u h02v hgam huth o00x ogrh u00l u00n u00o u00v u034 ucrl umal zombiex thorne`

### ⛔ 為什麼一行都沒改（⛔ 不是「沒時間」）

| 要動的東西 | 住在哪 | 在柵欄內？ |
|---|---|---|
| `WEAPON_TAGS` 加 `fist` / `claw` | `packages/shared/src/**sim/systems**/BasicAttackSystem.ts` | ⛔ **否**（柵欄只有 `src/content/`）|
| `WEAPON_SFX` 的兩格音軸 | `apps/client/src/audio/combatSfx.ts` | ⛔ **否** |
| 17 份英雄卡補 tag 的**來源** | `tools/skill-remake/` | ⛔ **否**（柵欄只有 `tools/stat-caps/`）|
| `thorne` 的第二個住處 | `packages/shared/src/**sim/content**/skeleton.ts` | ⛔ **否** |

⚠️ 票文把機制寫成 `apps/client/src/render/**/BasicAttackSystem.ts` —— **它其實在
`packages/shared/src/sim/systems/`**。⭐ 這條 lane 的柵欄（`packages/shared/src/content/`）
是照票文那個**錯的路徑**畫的，所以它涵蓋了棘輪測試卻**沒有涵蓋機制本身**。

### ⭐ 而「只補 tag 不做機制」是**錯的**，⛔ 不是「先做一半」

genguard 逐檔量到：**20 隻裡 14 隻今天可以直接 Edit**（644），只有 6 隻被擋
（`e00r · edem · ewar · h01u · h02k · h02v` —— `skillremake:json` 的逐檔宣告）。

⛔ **但我不做那 14 隻**，因為 `weaponClassOf` 只認得 `WEAPON_TAGS` 裡的字串：
一張寫著 `"fist"` 而引擎不認得的卡，⭐ **逐位元等於沒有那一行** ——
那是第一·五守則點名的形狀（卡上說了、遊戲裡不發生），
而且 `laneFMeleeWeaponTags.test.ts` 的 `tagged()` 也讀 `weaponSet` ⇒ **棘輪不會發現**。
⇒ ⭐ 票文自己講對了：**驗收＝那 18 隻真的解鎖了，⛔ 不是「tag 加上去了」。**

### ⭐ 交接：機制那兩行（給柵欄涵蓋得到的人，⛔ 不要重新查）

```ts
// packages/shared/src/sim/systems/BasicAttackSystem.ts:116
export const WEAPON_TAGS = [
  "greatsword", "katana", "gun", "bow", "magic",
  "fist",      // ⭐ 新增 —— 徒手（拳四郎/悟空/魯夫…12 隻）
  "claw",      // ⭐ 新增 —— 獸類爪牙（妙蛙花/草泥馬/喪標麥可…5 隻）
  "thrown", "sword",
] as const;

// apps/client/src/audio/combatSfx.ts:151 附近（照 `thrown` 的先例，⭐ 明講不是預設）
  fist: GENERIC_SWING,
  claw: GENERIC_SWING,
```

⚠️ 順序要在 `sword` **之前**（`weaponClassOf` 按 `WEAPON_TAGS` 的順序取第一個命中）。
⭐ 機制一落地，`laneFMeleeWeaponTags.test.ts` 的第二條當場紅並指名那 17 列 ——
**那是設計好的**（棘輪只能變短），⛔ 不是回歸。

⭐ **rollback**：把英雄卡 `tags` 陣列裡那一個字串拿掉（`content/` 是 live bind-mount ⇒ ⛔ 不必重建映像）。

### ✅ 棘輪本身：⛔ 不動（基線量到它是對的）

`laneFMeleeWeaponTags.test.ts` 今天**綠**，`NEEDS_CLASS` 17 列（fist 12 · claw 5）
＋ `BLOCKED` 4 列，與我獨立量到的數字**逐一相符**。⇒ 硬規矩①：基線是對的就停手。
⚠️ 票文寫的「18 隻被擋 ＋ 其他 3 隻」是 off-by-one：真相是 **17 ＋ 4**。

---

## 💧 #766 —— ⭐ 離群閘落地（AC1）＋ 欄位說明（AC3 的 schema 那一半）

### 量到的基線（⛔ 全部現算，⛔ 不引用票文）

| | 中位數 | 最極端 |
|---|---:|---|
| `baseStats.healthRegen` | **0.25**（n=71）| `godie-huth` **12** ＝ **48×** |
| `baseStats.manaRegen` | **0.1**（n=71）| `godie-h020` **1000** ＝ ⭐ **10,000×** |

⚠️ 票文寫「中位數 1.15 ⇒ 12 是 10.4 倍」—— **那個分母對不上今天的資料**。
現算中位數是 **0.25** ⇒ huth 是 **48×**、u00k 是 **32×**。
⭐ 上一輪 lane 量到的「生 baseStats 48×/32×」與我獨立重算**逐格相同**。

### ⭐⭐ 兩個票文完全沒提到、而**比它點名的兩隻更離群**的發現

#### ① `godie-h020`（黑魔導士 - 莉娜因巴斯）`manaRegen = 1000` —— 中位數的 **10,000 倍**

⛔ **不是 mis-parse。** 原作地圖 `H020.mana_regen = 1000.0`，逐位元組相符
（maxMana 5000 ⇒ 5 秒回滿；原作就是這樣設計那位法師的）。
⚠️ ⭐ 而它**從 1711 那條柵欄底下大搖大擺走過去** —— 這正好是票文那句
「1366/1711 是防 mis-parse 柵欄」最有力的證據：**真的有一個 1000 在裡面，而柵欄沒說話。**

#### ② 四位開放名單英雄的 `manaRegen` **與原作地圖不符**（2.1 vs 0.1 ＝ 21×）

`godie-emns`（夜神月）· `godie-osam`（殺生丸）· `godie-udre`（索隆）· `godie-u01u`（索隆變身態）

⛔ **不是匯入錯誤 —— 是 owner 自己的裁決。** 我追到了 commit：

> `79704a0f3` **balance: owner 2026-07-26 的四條裁決**
> 「⋯並給實測被榨乾的七位 `baseStats.maxMana +100` / `manaRegen +2`⋯
>  依據：5 場真對戰 **113,640 個 champion-tick** 的三軸隔離」

⇒ 地圖 0.1 ＋ 2 ＝ **2.1**。⭐ 三位在開放名單上（`starter.go:311 · 338 · 347`）。
⚠️ ⭐ **上一輪的對帳只跑了 `healthRegen`**（38 相符 / 0 不合），
⛔ 沒有跑 `manaRegen` —— 而 `manaRegen` 那一邊有 **4 筆不合**。
⇒ **一把只驗了單邊的尺**（CLAUDE.md 記過的那一族）。

### 全母體對帳（我這一輪補跑的）

| 欄位 | 相符 | ⛔ 不合 | 地圖 null | 無 rawcode |
|---|---:|---:|---:|---:|
| `healthRegen` | 38 | **0** | 30 | 1 |
| `manaRegen` | 64 | **4** | 0 | 1 |

⇒ ⭐ **票文點名的那兩隻（huth 12 · u00k 8）忠於原作，⛔ 零筆匯入錯誤。**
⇒ 照 orchestrator 的分岔：**忠於原作 ⇒ ⛔ 不自己調平衡。**
⭐ **這一輪一個出貨數字都沒有動。**

### ⭐ 落地的東西

#### 1) `packages/shared/src/content/regenOutlierOrigin.test.ts`（新，AC1）

**它問的不是「數字多大」，是「這個數字從哪裡來」** —— 一張只能變短的出處表：

| 英雄 | 欄位 | 值 | 倍數 | 出處（⭐ 可被反駁）|
|---|---|---:|---:|---|
| `godie-huth` 魔人普烏 | hr | 12 | 48× | 地圖 `Huth.hp_regen = 12.0` |
| `godie-u00k` 死之王 | hr/mr | 8 / 3 | 32× / 30× | 地圖 `U00K.hp_regen = 8.0` · `mana_regen = 3.0` |
| `godie-h020` 莉娜因巴斯 | mr | 1000 | **10000×** | 地圖 `H020.mana_regen = 1000.0` |
| `godie-emns` 夜神月 | mr | 2.1 | 21× | owner 2026-07-26 裁決 `79704a0f3`（48.6% 低於半魔）|
| `godie-osam` 殺生丸 | mr | 2.1 | 21× | 同上（60.7%）|
| `godie-udre` 索隆 | mr | 2.1 | 21× | 同上（~59%）|
| `godie-u01u` 索隆（變身態）| mr | 2.1 | 21× | 同上 |
| `godie-zombiex` 喪標麥可 | mr | 5.7 | 57× | `attributes.source: authored`（GGD 原創，地圖無此 rawcode）|

三條 `it()`：
1. **量尺自證** —— 真的讀到母體、join key 對得上、中位數 > 0（⛔ 空掃描與全過長得一樣，形態⑫）
2. **承重** —— 不合地圖、或超過現算中位數 `10×` 的每一位都要在表裡（訊息含 **id ＋值＋現算中位數＋量到的倍數**）
3. **棘輪** —— 不再離群也不再失配的列 ⇒ 過期，只能變短

⭐ 第〇·四守則：中位數**現算**，⛔ `0.25` / `0.1` / `1.15` 一個都沒有烘進檔案。
⭐ 兩個方向都走：從**資料**走（誰要出處）＋ 從**表**走（誰過期了）。

**突變（一條承重線）**：把 `godie-huth` 從 `REGEN_ORIGIN` 拿掉 ⇒ 只有第 2 條紅，逐字：

```
+   "godie-huth (超級普烏 - 魔人普烏): healthRegen=12 —— 現算中位數 0.25 的 48×",
```

⇒ 證明它真的在讀出貨資料、真的在現算中位數、真的指名得出來。改回來用 `Edit`（⛔ 不是 `git checkout`）。

#### 2) `packages/shared/src/content/schema/config/statCaps.ts`（AC3 的 schema 那一半）

逐字寫進欄位說明：**`healthRegen 1366` / `manaRegen 1711` 是防 mis-parse 柵欄，⛔ 不是平衡上限**
（最極端 12 ⇒ 餘裕 106 倍 ⇒ 夾不到任何人），並指向新的那條閘。
⇒ ⭐ 下一輪引用不到「上限已補」那個錯結論 —— **#177 就是這樣被關掉的。**

### ⛔ AC2 沒做（三個住處有兩個在柵欄外）—— ⭐ 誠實列出

一格**真的會夾住**的平衡上限要落三個住處：

| 住處 | 路徑 | 在柵欄內？ |
|---|---|---|
| 出貨值 | `content/config/stat-caps.json`（⭐ 它是 `statcaps:build` 的**產物**）| ⛔ 否 |
| 產物的**來源** | `tools/stat-caps/gen_stat_caps.ts` | ✅ **是** |
| Zod `DEFAULT_*` | `packages/shared/src/content/schema/config/statCaps.ts` | ✅ **是** |
| admin `SHIPPED_*` | `apps/admin/src/{configForms,store}.ts` · `ui/App.tsx` | ⛔ 否 |

⚠️ ⭐ 而**就算只改來源也不安全**：`bash scripts/genrun.sh statcaps:build` 會同時重寫
`content/config/stat-caps.json` · `packages/shared/src/sim/statCapsDerived.ts` · `docs/屬性上限推導.md`
—— **三份都在柵欄外，而併行 lane 正在跑**。⇒ ⛔ 我沒有跑它。

⭐ 而且 AC2 的預設值必須是「**不改變任何現況**」的那一個 ⇒ 它落地當天**零玩家影響**，
⇒ ⛔ 把它排在 AC1 後面沒有任何代價。**AC1 才是今天真的讓離群值變得看得見的那一條。**

### ⚠️ 順手量到，⛔ 沒有修（照硬規矩⑦，⛔ 不開新票）

- `tools/stat-caps/gen_stat_caps.ts:298` 寫「LV30 已經**夾不到任何合法內容**」——
  「裸裝」這個限定詞只活在下一句的括號裡。上一輪 lane 實測**加上出貨道具**之後
  柵欄會夾到**包含中位英雄在內的所有人**，而 `baseBonus.ts:406` 的夾是**靜默**的。
  ⛔ 我沒修：它要重生成三份柵欄外的產物。（⭐ 這是「一欄的分母是什麼」那一族。）
- 全母體 `attributes.strGrowth` 都是 0 而地圖有值（Huth 2.5 / U00K 1.0）——
  **跨母體一致**，⛔ 不是這兩位的問題。

---

## 📊 閘與預算

| | |
|---|---|
| `npx vitest run` | **3 次**（新閘綠 → 突變紅 → 四支一起確認綠）|
| `npx tsc -p packages/shared` | **1 次**，`EXIT=0` 零輸出 |
| 突變 | **一批一條**（`REGEN_ORIGIN` 拿掉 `godie-huth`）|
| ⛔ 沒跑 | `skills:sync` · `content:build` · `genrun statcaps:build` · `pnpm test` 全套（全域單一／柵欄外）|

一起跑綠的四支：`regenOutlierOrigin` · `laneFMeleeWeaponTags` · `configFacadeSurface` · `configUnionCoversDirectory`。

## 🔁 rollback

⭐ **這一輪沒有取捨，所以沒有開關**：⛔ 零個出貨數字被動過，兩個檔一個是**新的測試**、
一個是**註解**。要回頭 ＝ 刪掉那個測試檔。
⚠️ ⛔ 也**沒有**新的後台欄位 —— AC2 那一格（會夾住的平衡上限）今天**還不存在**，見上。

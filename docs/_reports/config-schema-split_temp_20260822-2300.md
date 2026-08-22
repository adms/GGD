# `schema/config.ts` 拆檔 —— 9,162 行 → 一扇 23 行的門 + 68 個檔

> owner 2026-08-22：「**分析優化 config.ts 檔，要謹慎不能遺漏資訊的情況下，
> 以能平行化有利的方式優化這個檔案，拆檔也可以**」

---

## 1. 量到的瓶頸（⛔ 不是估的）

| | 拆前 | 拆後 |
|---|---:|---:|
| `schema/config.ts` | **9,162 行** | **23 行**（門面） |
| 一份 config schema 的住處 | 同一個檔 | `schema/config/<名字>.ts` |
| 新增一份 config 要動的**共用**檔 | 1 個（9,162 行，三處：schema + `DEFAULT_*` + union） | 1 個（`config/index.ts` 的 union **一行**） |
| union 成員 | 83 | 83（**同一個順序**） |
| 對外匯出的名字 | 209 | **209（一個不差）** |

2026-08-22 當天 6 條 lane 同時要新增 config ⇒ 全部撞在這個檔上，
當天的解法是「禁止 lane 碰它、主 session 最後統一接」。⭐ 那是繞道，⛔ 不是修好。

---

## 2. 拆法（機械的，⛔ 不是手抄）

⛔ **一個位元組都不可以遺漏**（owner 逐字：「要謹慎不能遺漏資訊」），
所以全程用腳本做，⛔ 不是人工搬：

1. **切塊**：把 config.ts 切成 375 個 top-level 區塊（375 = 46 個 import + 329 個宣告），
   每一塊帶著**它自己的前置註解**。切完先驗 `"".join(chunks) == 原檔`（逐位元組）。
2. **建圖**：對每一塊掃出它引用的識別字 → 區塊相依圖。
   ⚠️ 樣板字面值 `${...}` 裡面的識別字**也要算**（踩過一次：`MEDIAN_BASE_HP` 只出現在
   `` `${}` `` 裡，漏掉就少一個 import 而且執行期才炸）。
3. **歸屬**：以 83 個 union 成員當種子，算每一塊的「祖先種子集合」——
   只有一個 ⇒ 歸那份 config；兩個以上 ⇒ `_shared.ts`；
   沒有祖先（型別別名 / `DEFAULT_*` / helper）⇒ 用相依方向做不動點推導，
   再用 **schema tag 字面值**（`z.literal("config.xxx@1")`）做二次歸屬。
   最後剩 19 塊逐塊人工判讀（⭐ 每一塊我都讀過原文，判讀表在腳本的 `MANUAL`）。
4. **產生 import 標頭**：每一份新檔的 import 是**產生**的，
   ⭐ 但**原本那條 import 上面的註解跟著它走** —— 例如
   「吟唱規則（owner 2026-08-13 的三句⋯）」現在住 `config/castTime.ts`。
5. **門面**：`config.ts` 只剩 `export * from "./config/index"`。
   ⛔ 全 repo 有 **100 個檔**寫著 `from ".../schema/config"`，拆檔不可以叫它們一起改。

### 落地的形狀

```
schema/config.ts                     23 行（門面 + 原檔頭 + 「怎麼新增一份 config」）
schema/config/index.ts              391 行（83 員 union，逐字保留 20 幾條「漏掉這一行 = 骨架英雄」）
schema/config/_shared.ts             29 行（⭐ 只有 2 個跨文件共用零件）
schema/config/<64 份 config>.ts    最大 1,322 · 最小 23
schema/config/arenaRules.mobWaves.ts        （殭屍波那 1,322 行自己一個檔）
schema/config/configUnionCoversDirectory.test.ts   76 行（閘）
```

---

## 3. ⛔ 為什麼 union 不能「掃資料夾自動組出來」

這是 owner 的規格裡唯一沒有 100% 達成的一項（「放一個檔進資料夾」而不是「再改一行」），
⭐ 而理由是**可以檢查的，不是偷懶**：

`z.discriminatedUnion` 吃的是一個**元組型別**，`ConfigDoc = z.infer<typeof zConfigDoc>`
的精度**完全**來自它。改成執行期掃 namespace 收集，那個元組就沒了 ⇒ `ConfigDoc` 塌掉。
⚠️ 而這個 repo 已經為此付過一次代價 —— GH#312：
`ConfigDoc` 曾經只是 `zConfigMatchDoc` 的 infer，於是
`doc.schema === "config.aoe-tiers@1"` 被 tsc 判成「兩個字面型別沒交集」＝**一個永遠 false 的死比對**。

⇒ 表是**手寫的**，漏一行的代價由**閘**擋住，⛔ 不是靠記得。

---

## 4. 閘（突變驗過）

`packages/shared/src/content/schema/config/configUnionCoversDirectory.test.ts`

| 條 | 驗什麼 |
|---|---|
| ① | 資料夾裡每一個 `z.literal("config.*@1")` 都在 `zConfigDoc.options` 裡 |
| ② | 一個 tag 只有一個住處；union 沒有重複成員 |
| ③ | 拆檔前是**私有**的 `zColorHex` / `zAudioAssetPath` ⛔ 不可以被 index.ts 洩漏成公開名字 |

**突變**：丟一個 `config/mutantProbe.ts`（宣告 `config.mutant-probe@1`、⛔ 不加 union）進資料夾
→ ⭐ **紅，而且指名那個檔**：

```
⛔ 這幾份 config 進不了線上：
  mutantProbe.ts 宣告了 config.mutant-probe@1，但 union 沒有它
修法：在 config/index.ts 的 zConfigDoc union 裡加上它們（⛔ 不要改這條測試）。
```

（探針已刪除。）

---

## 5. 「一個位元組都沒遺漏」的證據（四道，全部是程式跑出來的）

| # | 量什麼 | 結果 |
|---|---|---|
| ① | **註解行**：原檔每一行 `//` / `*` / `/*` 開頭的字，在新樹裡找不找得到 | **遺失 0 行** |
| ② | **所有非 import 行**的多重集合比對（原檔 8,833 行） | 差集 115 行，**逐行驗過全部是「多行 import 子句被收成一行」**（`COMBAT_ENV_KEYS,` 這種）+ 2 行 `const`→`export const`。⭐ **知識行遺失 0** |
| ③ | **union 快照**：`zConfigDoc.options` 的**數量與 83 個 tag 的順序** | 拆前 83 / 拆後 83，**tags 完全相同（連順序）** |
| ④ | **公開面**：`Object.keys(import("schema/config"))` | 拆前 209 / 拆後 **209**，差集 **空** |
| ⑤ | **端到端**：`content/config/` 全部 **83 份出貨 JSON** 各跑一次 `zConfigDoc.safeParse`，比對**序列化後的位元組長度** | **83/83 全部 OK，且拆前拆後逐份相同** |

⚠️ 唯一一處**非逐位元組**的改動（腳本裡有 assert 釘著）：
`export * from "./roundGrade";` → `"../roundGrade"`（相對路徑從 `schema/` 換算到 `schema/config/`）。

⭐ 另外做了一次**位置**修正（位元組不變，只換住處）：
`config.audio-map@1` 的段落抬頭原本壓在 `zAudioAssetPath` 上（該段第一個宣告），
而那個 path 型別被三份 config 共用 ⇒ 會被抬頭一起拖進 `_shared.ts`。
抬頭回到 `audioMap.ts`，`_shared.ts` 留一行指標。

---

## 6. 驗證

| | |
|---|---|
| `pnpm typecheck`（全 repo） | **EXIT=0** |
| `npx eslint schema/config schema/config.ts` | **EXIT=0** |
| `npx vitest run packages/shared apps/admin` | 5,023 passed / **16 failed** |
| 新閘 + 突變 | 綠 → 紅（指名）→ 綠 |

### 那 16 條紅的歸因（⭐ 一次撈全部再歸因，⛔ 不是一條一條修）

**15 條與這次拆檔無關** —— 全部是別條 lane 在飛的產物過期：
`shippedBundleIsCurrent`(4) · `bundle.test`(3) · `descriptionClaims`(2) ·
`castTimeCoverage` · `abilityCodeParityForms` ·
`skillSpecFresh` · `skillAuditFresh` · `readmeListsFresh` · `legacyIndexFresh`。
（`git status` 顯示 `content/abilities/*` · `content/ability-templates/*`(新) ·
`tools/skill-audit/*` · `README.md` 都被別的 lane 改著。
⛔ 我不能跑 `content:build` / `skills:sync`（全域鎖）。）

**⚠️ 剩下 1 條是我造成的，而它在我的柵欄外 —— 見下一節。**

---

## 7. ⚠️ 需要主 session 接線（**一個檔、三個字串**）

`apps/admin/src/configDocCoverage.test.ts` 紅：

```
resolveLobbyLayout 有 production 呼叫端了 —— lobby-layout 的豁免已到期
expected 1 to be +0
```

⭐ **不是真的有人接了 lobby-layout。** 那條守衛用 `productionCallSites(REPO, symbol, exclude)`
數呼叫端，而 `exclude` 裡寫著**宣告本人的路徑** `"content/schema/config.ts"`。
拆檔之後宣告搬到 `content/schema/config/lobbyLayout.ts` ⇒ 排除字串對不上 ⇒
它把**宣告本人**數成了一個呼叫端。

**修法（三行，逐字）：**

```diff
- { docId: "lobby-layout", symbol: "resolveLobbyLayout", decl: "content/schema/config.ts" },
+ { docId: "lobby-layout", symbol: "resolveLobbyLayout", decl: "content/schema/config/lobbyLayout.ts" },
      {
        docId: "valhalla-sandbox",
        symbol: "resolveValhallaSandbox",
-       decl: "content/schema/config.ts",
+       decl: "content/schema/config/valhallaSandbox.ts",
      },
```

```diff
-      productionCallSites(REPO, "resolveVictoryFx", ["content/schema/config.ts"]),
+      productionCallSites(REPO, "resolveVictoryFx", ["content/schema/config/victoryFx.ts"]),
```

⚠️ 第三行**現在是綠的**（`toBeGreaterThan(0)`，多數到自己的宣告一樣 > 0），
⛔ 但它是那組斷言的**對照組**，數到自己的宣告會讓對照組失效 ⇒ 一起改。

⚠️ 全 repo 掃過 `schema/config.ts` 這個字串的**功能性**引用只有這三處，
其餘全是註解（`grep -rn 'schema/config\.ts'` 共 39 筆，36 筆是註解裡的指路）。
⭐ 那 36 筆註解**指的路徑現在不精確了**，⛔ 但它們指的是「這個概念住哪」而不是行號，
而門面還在原地，所以不是謊話 —— ⛔ 我沒有順手去改（第零守則⑧）。

---

## 8. 之後新增一份 config 的樣子

```
① 新開  packages/shared/src/content/schema/config/<名字>.ts   ← 只有你動
② config/index.ts 的 union 加一行                              ← 唯一的共用點
③ 忘了②？ configUnionCoversDirectory.test.ts 會紅並指名那個檔
```

⭐ 相對於拆前的「同一個 9,162 行的檔要動三處」，共用點從 **3 處 × 9,162 行** 降到
**1 行**。⚠️ 那一行仍然是併行時的衝突點（兩條 lane 都往 union 尾巴 append），
⛔ 但那是 1 行的衝突，不是 9,000 行的檔的衝突。

## 9. 測試預算

| | 行數 |
|---|---:|
| 實作（新增的**產生**內容：import 標頭 + 三段拆檔說明 + 2 個 export 註解） | ≈ 260 |
| 測試（`configUnionCoversDirectory.test.ts`） | **76** |

vitest **3 次**（新閘 · 全域 `packages/shared`+`apps/admin` · 突變）、tsc **1 次**、突變 **1 條**。

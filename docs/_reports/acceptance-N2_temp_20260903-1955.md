# 46 份驗收 · 批2「投射與光束」（8 份）— GH#960

> 2026-09-03 19:55 · 守衛 `packages/shared/src/ops/acceptanceN2.test.ts`（8 條，全綠）
> 名冊 `docs/editor-contract/ggd-acceptance-batch2-projectile-beam.json`

---

## ⚠️⚠️ 一、前提回驗 —— ⛔ 票文有兩條今天不成立

| # | 票文主張 | 實測（2026-09-03） | 結論 |
|---|---|---|---|
| ① | 「本批的 id 清單**只有一個住處**（#953 定案的 **#838 body**）」 | ⛔ **不成立**。`gh issue view 838` 的 body 裡 `godie-hvwd` **0 命中**；而 #953 自己的守衛檔頭逐字寫「⛔ **一個字都沒有動那張票**」，它只落了**八招**那一份（`ggd-acceptance-eight.json`）。⇒ ⭐ 46 份清單今天唯一的住處是 `docs/_daily/ledger-source_temp_20260903.md`（owner 18:47 原話全文）—— ⚠️ 而它是 `msgledger:build` 的產物、**git 未追蹤**、名字帶 `_temp_` ⇒ `temp-sweep.sh --move` 七天後就會把它搬走 | ⭐ 照 #953 的**前例**落一份**只含批 2** 的機器住處（⛔ 只放 8 列 ⇒ 與其餘五批零檔案重疊） |
| ② | 「已量到 46 份裡 **27 份缺 `rangeTier`**」 | ⭐ 全庫實測 **235/421 缺**；⛔ 而**本批 8 份裡只有 1 份缺**（`godie-udea.r`） | ⭐ 本批在這一軸上**遠比票文預期乾淨**，⛔ 但那一份仍照規則判阻塞 |
| ③ | 「46 份全缺 `conditionTier`」 | ⭐ **成立，而且更嚴重**：全庫 **0/421** 覆蓋 | ⇒ ⭐ 本批 **8/8 全部**判「⛔ 阻塞於 #943」 |

⭐ ⛔ 不要把①讀成「#953 沒做完」—— #953 做的是**它被交代的那一半**（八招），
而 46 份那一半**從來沒有任何一張票落地過**。這是**缺口**，⛔ 不是回歸。

---

## 二、逐份判定（AC #1：⛔ 沒有一份空白）

| # | id | 技能 | 卡面宣稱直線？ | 出貨機制（直線節點） | 缺級距 | ⭐ 判定 |
|---:|---|---|---|---|---|---|
| 6 | `godie-nbbc.e` | 08-03 龍鬥氣砲咒文 | ⛔ 否（卡面寫「攻擊**線**地面部隊」，⛔ 不是「直線」） | `spawnProjectile` ＋ `spawnModelFx:tpl-beam-roll` | `conditionTier` | ⛔ 阻塞於 #943 |
| 7 | `godie-ogrh.r` | 09-04 龜派氣功 | ✅ 是 | ⭐ `damageLine`(14×2.0) ＋ beam | `conditionTier` | ⛔ 阻塞於 #943 |
| 8 | `godie-o00x.r` | 09-04 龜派氣功（鏡像） | ✅ 是 | ⭐ `damageLine`(14×2.0) ＋ beam | `conditionTier` | ⛔ 阻塞於 #943 |
| 13 | `godie-hvwd.e` | 02-03 魂飛魄散 | ✅ 是 | ⛔ **零個** —— `effects: []`，`template.ref = tpl-single-strike`（家族 **single-strike**） | `conditionTier` | ⛔⛔ **不通過（語意衝突）** |
| 14 | `godie-o00k.e` | 86-03 神鳴 | ✅ 是 | ⛔ **零個** —— `effects: []`，`template.ref = tpl-instant-blast`（家族 **instant-blast**） | `conditionTier` | ⛔⛔ **不通過（語意衝突）** |
| 2 | `godie-hjai.e` | 04-03 龍破斬 | ⛔ 否（卡面說「範圍」） | `spawnModelFx:tpl-line-blast`（`onTouch` 1 ＋ `onArrive` 3） | `conditionTier` | ⛔ 阻塞於 #943 |
| 3 | `godie-h020.e` | 04-03 龍破斬（鏡像） | ⛔ 否 | 同上，⭐ 逐位元組相同 | `conditionTier` | ⛔ 阻塞於 #943 |
| 23 | `godie-udea.r` | 65-04 天譴 | ⛔ 否（卡面說「連鎖」） | `chainLightning` ＋ `damageArea(maxTargets:1)` | `rangeTier` ＋ `conditionTier` | ⛔ 阻塞於 #943（**雙重**） |

⭐ **AC #3 逐字要求的兩支已知衝突，被守衛正好指名，⛔ 沒有多也沒有少。**

---

## 三、四條共用軸的量測（⭐ 這一批的「治具」就是這四條）

### ① 投射物先飛行再爆炸 · ② 沿途命中與終點範圍**分開**

⭐ `tpl-line-blast` 自己的檔頭逐字說出了判準：
「路上穿透式地掃人（第一段傷害），飛完全程後在落點炸開一個範圍（第二段傷害）。
⭐ **兩段是兩串班表而不是一串**：合成一串的話，路上已經被掃到的人會被『一人一次』的
過濾器擋在爆炸外面」。

| id | `onTouch`（沿途） | `onArrive`（落點） | 分開？ |
|---|---|---|---|
| `godie-hjai.e` | `damage` × 1 | `spawnVfx` ＋ **`damageArea`(r=8, `radiusTier:大`)** ＋ `screenShake` | ✅ |
| `godie-h020.e` | 同上 | 同上 | ✅ |
| `godie-nbbc.e` | —（傷害走 `spawnProjectile.onHit`） | `spawnVfx` | ✅ |

⭐ 守衛額外驗**反方向**：`onTouch` 裡**不可以**出現 `damageArea` —— ⛔ 出現就是兩段被合成一串。

### ③ 光束長寬與傷害線一致

| id | 光束 preset | 解析後 `distance` | `damageLine.length` | 結果 |
|---|---|---:|---:|---|
| `godie-ogrh.r` | `tpl-beam-roll` × 2 | **14** | **14** | ✅ 相等 |
| `godie-o00x.r` | `tpl-beam-roll` × 2 | **14** | **14** | ✅ 相等 |

⚠️ **觀察（⛔ 未斷言，留給 #664 Tier 2）**：寬度那一半對不太上 ——
`tpl-beam-roll.touchRadius = 1.5` vs `damageLine.width = 2.0`（半寬 1.0）
⇒ 光束的碰觸半徑比傷害線的半寬**寬 50%**。⭐ 而 `width` 是全寬還是半寬，
出貨 schema 沒有說死 ⇒ ⛔ 不在這一輪硬判。
⚠️ 另一個：`godie-ogrh.r` 的 `range` 是 **12** 而光束與傷害線都是 **14** ——
施法距離比光束短兩格（可能是刻意的，也可能不是）。

### ④ 連鎖跳數與衰減（`godie-udea.r`）

⭐ 守衛拿**卡面的字**去對**出貨的節點**（第一·五守則：卡面上不可以有「說了但不會發生」的字）：

| 卡面說 | 出貨節點 | |
|---|---|---|
| 「最多20名」 | `maxSources: 20` | ✅ |
| 「一條鏈最多打到16個」 | `jumps: 16` | ✅ |
| 「只剩前一次的**九**成」 | `decay: 0.9` | ✅ |
| 「削去250點魔力」 | `spendMana.perRank[0] = 250` | ✅ |

⚠️⚠️ ⭐ **順手量到一個真的問題（⛔ 不在本票 scope，⛔ 未修）**：
`spendMana.perRank` 是 **[250, 350, 450]** 而 `maxRank = 3` ——
⇒ 卡面那個 **250 是字面值**，它**只有 1 級是真的**；2/3 級玩家看到的卡面在說謊。
⭐ 而同一張卡的傷害用的是 `{{dmg}}` / `{{dmg2}}` 佔位 ⇒ **同一張卡上兩種寫法並存**。
⇒ ⭐ 正解是把它換成佔位（`prose:build` 那條路），⛔ 不是改 250。

---

## 四、鏡像逐欄（共同規則 #13）

| 對 | 非裝飾欄的差異 | 裝飾欄的差異 |
|---|---|---|
| `godie-hjai.e` ↔ `godie-h020.e` | ⭐ **零** | `id` · `icon` · `vfxKey`（`fx.prim.void.slash` vs `fx.prim.fire.beam`） |
| `godie-ogrh.r` ↔ `godie-o00x.r` | ⭐ **零** | `id` · `icon` |

⭐ 守衛把「允許不同的欄位」放在名冊的 `cosmeticKeys` 裡 ⇒ ⛔ 白名單不住在測試裡。

---

## 五、守衛與突變（Test / verification criteria）

`packages/shared/src/ops/acceptanceN2.test.ts` —— ⭐ **一套治具 `assess()` × 8 列**，
⛔ 不是 8 條測試。8 條斷言全部走**出貨的** `content/abilities/**` 與
`content/ability-templates/**`，⛔ 零夾具（失敗形態⑤）。

⭐ **兩個方向**（⛔ 單邊校準過的尺不算自證過）：

| 方向 | 怎麼驗 |
|---|---|
| 已知**有** | 4 張宣稱直線的卡裡，`hvwd.e` / `o00k.e` 必須被指名 |
| 已知**沒有** | 另外 2 張（`ogrh.r` / `o00x.r`）**做得出來** ⇒ ⛔ 不可以被指名 —— ⭐ 一個對每支都喊的橡皮圖章在這裡會紅 |
| 分母自證 | 「飛行節點」「光束↔傷害線比對」兩條各自斷言 **compared > 0** ⇒ ⛔ 分母 0 的綠燈與「沒有這條斷言」沒有差別 |
| 量尺自證 | `strip()` 必須真的改變過至少一張卡（⛔ 沒剝 `「…」` 就會把台詞讀成機制） |

### 🧬 突變（三次，全部實跑，⭐ 走 `scripts/edit-or-die.py`）

| # | 改壞什麼 | 結果 |
|---|---|---|
| **M1**（出貨資料） | `content/abilities/godie-udea.r.json` 的 `"jumps": 16` → `12` | 🔴 `⛔⛔ godie-udea.r · jumps（一條鏈最多幾跳）：卡面說 16，而出貨節點是 12` ⇒ ⭐ **證明治具讀的是出貨的那一份** |
| **M2**（治具承重行） | `strip` 改成 identity | 🔴 `⛔⛔ 對白剝離沒有在跑` |
| **M3**（治具承重行） | `LINE_TPL` 的家族判準 `/line\|beam\|wave/` → `/./`（⇒ 每個模板都算直線） | 🔴 `⛔⛔ 語意衝突沒有被指名` ⇒ ⭐ 橡皮圖章被抓到 |

三次都已還原（`git diff content/abilities/godie-udea.r.json` = 空）。

---

## 六、⛔ 誠實列出**這一輪沒有做到**的

| AC | 狀態 |
|---|---|
| #1 逐份判定 | ✅ 8/8 有判定 |
| #2 receipt | ⭐ **JSON receipt ＋ 失敗原因 ＋ 技能 ID** 在本報告與守衛訊息裡；⛔ **連續擷圖沒有** —— 那是渲染證據，⭐ 屬 #664 Tier 2 的批核頁，⛔ Main 側的 headless 守衛量不到 |
| #3 已知衝突標紅 | ✅ 兩支都被指名，⛔ 而且反方向也驗了 |
| #4 四層驗證 | ⚠️ **部分**：schema（`content:build` 的 Zod）＋ template（`family` 從出貨模板推導）＋ effect graph（`walk()` 遞迴）在；⛔ **runtime 那一層是 #955 的往返閘**，本票 Non-goals 明說不做 |
| #5 typecheck | ⭐ **本檔 0 錯**。⚠️ ⛔ `packages/shared` 專案級 tsc 目前非 0 —— 錯誤**全部**落在**另外兩條併行 lane 的未完成檔**（`acceptanceN3.test.ts` #961 的 5 個 · `n4probe.test.ts` #962）⇒ ⛔ 不是我的，⛔ 沒有動它們 |

### ⭐ 這一輪找到的、值得開票的兩件（⛔ 依第零守則⑧，⛔ 沒有當場修）

1. ⭐ **46 份清單沒有機器住處**（只有一份未追蹤的 `_temp_` 帳本）—— 本輪只補了批 2 的那 8 列，
   其餘 38 列仍然只住在會被 sweep 掉的檔案裡。
2. ⭐ **`godie-udea.r` 的卡面 250 是字面值而 `perRank` 有三級** —— 2/3 級的卡面在說謊（第一·五守則）。

# 🔍 裝飾性設定欄位普查（GH#927）

> `reward.xp: 40` 實質上是裝飾。因為每 6 隻就清空一次經驗條 **=> 還有類似這種設定嗎**
>
> — owner 2026-09-01（逐字）

⛔ **這一份是產生的**（`pnpm decor:build`）—— 手改會被 `pnpm decor:check` 判 stale。
⭐ 結論**從出貨設定推導**：owner 把同軸那一格關掉的那一刻，這裡自己就變短，⛔ 不必改任何程式。

## 母體（⭐ 量出來的）

| | |
|---|---:|
| 出貨 config 文件 | 101 |
| **旋鈕**（Zod 靜態鍵的葉子，⛔ 不含 record 的鍵與陣列索引） | **1950** |
| 消費端原始碼（⛔ 已排除後台欄位表與測試） | 2278 |
| 殭屍獎勵的等級區間（`dominated` 的分母） | L9–L99 |

## 分類

| 類 | 意思 | 格數 |
|---|---|---:|
| **A** | 調了玩家量不到差別 | **45** |
| **B** | 引擎做得到而調不到 | **8** |
| C | 正常 | 1589 |
| ⚠️ 量不到 | 鍵名不是識別字（級距標籤／列舉鍵）—— ⭐ 「零讀端」這把尺對它們**結構上是瞎的** | 308 |

### 零讀端 · 43 格（A 類）

| 檔 | 路徑 | 出貨值 | 量到的 |
|---|---|---|---|
| `arena-rules.json` | `round11.bannerText` | `"第十一回合・生存模式"` | `bannerText` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.bombardment.crowdBias` | `0.6` | `crowdBias` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.bombardment.damagePctOfMaxHp` | `0.5` | `damagePctOfMaxHp` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.bombardment.telegraphSec` | `10` | `telegraphSec` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.bossScaleCeil` | `8` | `bossScaleCeil` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.bossScaleFloor` | `1` | `bossScaleFloor` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.bossStrengthMult` | `2` | `bossStrengthMult` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.deadPlayersControlBoss` | `true` | `deadPlayersControlBoss` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.maxAliveZombies` | `500` | `maxAliveZombies` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.scoring.minContributionForFullSurvival` | `0.2` | `minContributionForFullSurvival` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.scoring.scoreMultiplier` | `2` | `scoreMultiplier` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.scoring.survivalWeight` | `0.5` | `survivalWeight` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.spawnRampSec` | `120` | `spawnRampSec` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.triggerBossKills` | `3` | `triggerBossKills` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.waveTable.difficultyBase` | `1.15` | `difficultyBase` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `arena-rules.json` | `round11.waveTable.eventIntervalSec` | `20` | `eventIntervalSec` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `economy.assistGold` | `75` | `assistGold` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `economy.roundLoseGold` | `150` | `roundLoseGold` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `economy.roundWinGold` | `300` | `roundWinGold` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `progression.xpAssist` | `60` | `xpAssist` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `progression.xpBase` | `100` | `xpBase` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `progression.xpKill` | `120` | `xpKill` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `progression.xpPerLevel` | `80` | `xpPerLevel` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `config.match.json` | `progression.xpRoundSurvive` | `100` | `xpRoundSurvive` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `controller-scheme.json` | `schemes.*.combatInput.aimStick` | `"true …（2 筆）"` | `aimStick` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `damage-rules.json` | `oneShotPctOfMaxHp` | `0.8` | `oneShotPctOfMaxHp` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `map-report.json` | `maps[].worldD` | `"36 …（7 筆）"` | `worldD` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `map-report.json` | `maps[].worldW` | `"48 …（7 筆）"` | `worldW` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `review-tuning.json` | `blockShipOnPending` | `false` | `blockShipOnPending` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `review-tuning.json` | `contactSheetTopN` | `20` | `contactSheetTopN` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `review-tuning.json` | `hitlBatchSize` | `40` | `hitlBatchSize` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `review-tuning.json` | `perceptualBaselineEnabled` | `false` | `perceptualBaselineEnabled` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `review-tuning.json` | `perceptualDriftThreshold` | `0.12` | `perceptualDriftThreshold` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unit-tints.json` | `transient[].erasesStaticTint` | `true` | `erasesStaticTint` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `quarantineRatchet` | `0` | `quarantineRatchet` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.alphaRange` | `"253 …（5 筆）"` | `alphaRange` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.borderEffAdditive` | `"0 …（5 筆）"` | `borderEffAdditive` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.distinctAlphaValues` | `"5 …（5 筆）"` | `distinctAlphaValues` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.hasAlphaShape` | `"true …（5 筆）"` | `hasAlphaShape` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.maxAlpha` | `"253 …（5 筆）"` | `maxAlpha` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.minAlpha` | `"0 …（5 筆）"` | `minAlpha` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].measured.opaquePct` | `"0 …（5 筆）"` | `opaquePct` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |
| `unsafe-textures.json` | `textures[].usage.reachableVfxDocs` | `"1 …（5 筆）"` | `reachableVfxDocs` 在出貨消費端原始碼裡**被讀** 0 次 （讀＝成員存取／解構／字串鍵；⛔ 宣告、預設值與散文不算。⛔ 後台與測試不在母體裡）⇒ 沒有任何東西讀得到它。 |

### 被同軸的另一格蓋掉 · 2 格（A 類）

| 檔 | 路徑 | 出貨值 | 量到的 |
|---|---|---|---|
| `arena-rules.json` | `mobWaves.boss.bountyXp` | `1200` | 同一個物件裡的 bountyLevels=10 在同一條軸上直接發等級。等級區間 L9–L99（從 `rounds[].grantLevels` 與 `mobWaves.fromRound` 推導）⇒ 這一格佔那一次獎勵的 **1.5%–14.0%**（中位 2.7%，門檻 25.0%）。 |
| `arena-rules.json` | `mobWaves.special.bountyXp` | `200` | 同一個物件裡的 bountyLevels=3 在同一條軸上直接發等級。等級區間 L9–L99（從 `rounds[].grantLevels` 與 `mobWaves.fromRound` 推導）⇒ 這一格佔那一次獎勵的 **0.8%–8.3%**（中位 1.5%，門檻 25.0%）。 |

### 引擎做得到而 schema 不准（0） · 8 格（B 類）

| 檔 | 路徑 | 出貨值 | 量到的 |
|---|---|---|---|
| `arena-rules.json` | `mobWaves.boss.killThreshold` | `"zod min 1"` | Zod 的下界是 `min(1)`，⛔ 而引擎把 0 當成一個活的分支：`if (boss.killThreshold <= 0) return false;` ⇒ 一個**做得到卻調不到**的狀態。 |
| `body-scale.json` | `attackRangeCurve[].bodyScale` | `"zod min 0.1"` | Zod 的下界是 `min(0.1)`，⛔ 而引擎把 0 當成一個活的分支：`typeof bodyScale === "number" && Number.isFinite(bodyScale) && bodyScale > 0 ? bodyScale : 1;` ⇒ 一個**做得到卻調不到**的狀態。 |
| `config.match.json` | `draft.offerCount` | `"zod min 1"` | Zod 的下界是 `min(1)`，⛔ 而引擎把 0 當成一個活的分支：`return input.phase === INTERMISSION_PHASE && input.offerCount > 0 ? "draft" : "shop";` ⇒ 一個**做得到卻調不到**的狀態。 |
| `config.match.json` | `match.fireRing.roundHardCapSec` | `"zod min 20"` | Zod 的下界是 `min(20)`，⛔ 而引擎把 0 當成一個活的分支：`cfg.roundHardCapSec <= 0` ⇒ 一個**做得到卻調不到**的狀態。 |
| `store.json` | `crystalRewards.minHumans` | `"zod min 1"` | Zod 的下界是 `min(1)`，⛔ 而引擎把 0 當成一個活的分支：`if (rules.minHumans <= 0 || humans < rules.minHumans) return 1;` ⇒ 一個**做得到卻調不到**的狀態。 |
| `vfx-families.json` | `abilities.*.w3xScale` | `"zod min 0.05"` | Zod 的下界是 `min(0.05)`，⛔ 而引擎把 0 當成一個活的分支：`if (!Number.isFinite(w3xScale) || w3xScale <= 0) return 1;` ⇒ 一個**做得到卻調不到**的狀態。 |
| `weather.json` | `fogBankDriftSec` | `"zod min 8"` | Zod 的下界是 `min(8)`，⛔ 而引擎把 0 當成一個活的分支：`const u01 = phase + (policy.fogBankDriftSec > 0 ? (tSec / policy.fogBankDriftSec) * speed : 0);` ⇒ 一個**做得到卻調不到**的狀態。 |
| `weather.json` | `fogBankLaneFill` | `"zod min 0.2"` | Zod 的下界是 `min(0.2)`，⛔ 而引擎把 0 當成一個活的分支：`if (count <= 0 || policy.fogBankAlpha <= 0 || policy.fogBankLaneFill <= 0) return null;` ⇒ 一個**做得到卻調不到**的狀態。 |

## 每一份 config 的 A/B 格數

| 檔 | 旋鈕 | A | B |
|---|---:|---:|---:|
| `arena-rules.json` | 250 | 18 | 1 |
| `body-scale.json` | 4 | 0 | 1 |
| `config.match.json` | 63 | 8 | 2 |
| `controller-scheme.json` | 38 | 1 | 0 |
| `damage-rules.json` | 3 | 1 | 0 |
| `map-report.json` | 25 | 2 | 0 |
| `review-tuning.json` | 6 | 5 | 0 |
| `store.json` | 13 | 0 | 1 |
| `unit-tints.json` | 11 | 1 | 0 |
| `unsafe-textures.json` | 22 | 9 | 0 |
| `vfx-families.json` | 59 | 0 | 1 |
| `weather.json` | 26 | 0 | 2 |

---

⚠️ ⛔ **這份普查刻意不改任何出貨數值** —— 第零守則⑧：排序是 owner 的權力。
⭐ 修法有三條（第一·五守則）：換成做得到的機制 · 把說明改成只講真的會發生的事 · 升級成 owner 的決定。

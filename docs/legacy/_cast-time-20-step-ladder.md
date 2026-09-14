# 吟唱的 20 階階梯（已退場）

> ⛔ **這一份是退休區。** 這條公式**不再出貨**，⛔ 不要拿它判斷任何一支技能的吟唱時間。
> ⭐ 今天的真源是 `content/config/cast-time-tiers.json`（五級距）。
> ⭐ 2026-09-15（GH#1243）：原始碼 `castTimeFormula.ts`（635 行）也搬過來了 ——
> `docs/legacy/code/packages/shared/src/content/castTimeFormula.ts`。
> 搬之前量過：出貨程式與工具**零個** import（`castTimeTierMigration.test.ts` 第二條也在擋回頭匯入）。

## ⭐ 吟唱屬於誰（⛔ 這一段是唯一住處，其他地方只指過來）

| 誰 | 寫什麼 |
|---|---|
| **作者** | `castTimeTier`（五格之一）。產生器擁有的 90 支寫在 `tools/skill-remake/heroes/*.py` 的 `castTimeTier=`，或規格秒數 `cast_time=`（`common.py::_cast_time_tier()` 靠最近一格、平手取較快、要施法最低「小」）；其餘寫在 `content/abilities/*.json` |
| `deriveCastTimes.ts --write` | 把級別**物化**成 `castTimeSec`（含 `template.params` / `template.cards[].params` 與英雄卡內嵌）。純被動不寫 |
| `resolveCastTimeTierOnDoc`（載入時） | 級別贏過 `castTimeSec` |
| `applyCastTimeRules`（施法當下） | owner 的夾子 `castTimeMaxSec`、floor、倍率、tick 對齊 |

⛔ 沒有任何一支程式從傷害／冷卻／半徑**反推**吟唱。

## ⭐ 為什麼被搬到這裡

owner 2026-09-12（逐字）：

> 「照五級距 **最高就是1秒 有什麼好爭議的** 請你把推論污染根因修正.
>  舊 20 階階梯 => **移到 legacy 區不要再被看到了**」

owner 2026-09-12（同一天，更早，另一則）：

> 「如果我有回答過 請你都要將**讓你誤會的根因資訊做修正 甚至移到 legacy**」

## ⛔ 它做過什麼（⭐ 這才是它被搬走的理由）

它被 GH#943 的五級距取代之後**留在原地沒有退場**，於是：

| | |
|---|---|
| `castTimeCoverage` 拿它去比照級距寫的內容 | ⇒ 報出 **182 支「不一致」** |
| 而內容其實是對的 | `0.1` ＝ **小**、`0.5` ＝ **大** —— ⭐ **說謊的是公式** |
| 我因此開了 | ⛔ **兩個假缺陷**（GH#1243 的前兩則更正） |
| 而它們 | ⚠️ 各自活過了一次自我複驗 |

⭐ **一份留在原地的過期公式，會被下一個人（包括未來的我）當成權威。**

## 原本的規則（存檔）

```ts
const LADDER_STEPS = 20;
// [CAST_FLOOR 0.06, CAST_CAP 4.00] 之間切 20 階，步長由區間推導
const raw = CAST_FLOOR + (steps * (CAST_CAP - CAST_FLOOR)) / LADDER_STEPS;
```

owner 當時的規則（2026-08-13，⭐ **已被 2026-09-02 的五級距取代**）：

> 「castTimeSec … 0.3 - 0.6 s，依技能有多兇殘決定，最兇的封頂 0.9 s」

⚠️ 區間後來被開到 `[0.06, 4.00]`，⭐ 而 `castTimeMaxSec` 同時夾在 **1.0** ——
⇒ ⛔ 那條階梯爬得到的 1.2–4.0 秒，**玩家從來沒有經歷過**。

## ⭐ 今天的規則

`content/config/cast-time-tiers.json`：

| 級別 | 秒 |
|---|---:|
| 極小 | 0 |
| 小 | 0.1 |
| 中 | 0.3 |
| 大 | 0.5 |
| 極大 | **1.0** |

⭐ 上界 1.0 與 `config.cast-time@1.castTimeMaxSec` 刻意同一個數字 ——
**級距寫得出來的最大值，就是引擎夾得住的最大值。**

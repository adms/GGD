# AP 傷害加成 —— 引擎契約（`config.ap-damage-scaling@1`）

> ⚙️ **這一份是產生出來的，⛔ 不要手改。**
>
> ```bash
> pnpm apdmg:build            # 重生成
> pnpm apdmg:check            # 唯讀：過期就回非零
> ```

owner 2026-08-21（逐字）：

> 「我有個更好的建議，就是**技能傷害都套用公式 (1+AP\*1%)**
>  物理意義來說 就是 **AP 變為原本傷害的額外加成**，
>  例如 AP 37 => 額外 37% AP 傷害；AP 245 => 額外 245% AP 傷害」
> 「=> **預設 0.5%**」

---

## ⭐ 公式

```
最終傷害 = 基礎傷害 × (1 + 施法者法強 × 加成率)
```

| 格 | 出貨值 | 意思 |
|---|---:|---|
| `rate` | **0.005**（0.5%/點） | 每 1 點法強讓這一發多幾成。上界 0.05（5%/點） |
| `scope` | **ability** | 哪一類傷害吃這一層（下表） |
| `apRatioMode` | **stack** | 與技能卡上既有的法強係數怎麼共存 |

⭐ **`rate = 0` 是完整的一鍵 rollback** —— 乘數逐位元回到 1，也就是這一層出現之前的每一場比賽。

### 法強 → 乘數（⛔ 每一格都是算出來的）

| 法強 | 0 | 25 | 50 | 100 | 150 | 200 | 250 | 300 | 400 | 500 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **乘數** | ×1 | ×1.125 | ×1.25 | ×1.5 | ×1.75 | ×2 | ×2.25 | ×2.5 | ×3 | ×3.5 |

---

## ⭐ 哪一種傷害吃這一層

⛔ 這張表**不是打上去的** —— 每一格都是拿那個 origin 去問出貨的 `originInScope()`（`sim/combat/damageTypeOverride.ts`）算出來的。
引擎改了那支謂詞，這份文件就會過期而 `--check` 會紅。

| origin | 是什麼 | 建構點 | `ability` | `basic` | `all` |
|---|---|---|:---:|:---:|:---:|
| `ability:<id>` | 瞬發技能 | `abilities/abilitySystem.ts` | ✅ | — | ✅ |
| `ability:<id>` | 吟唱技能（吟唱結束的那一 tick） | `systems/CastResolveSystem.ts` | ✅ | — | ✅ |
| `ability:<id>` | 技能投射物命中（原封不動帶著發射者的 origin） | `systems/ProjectileSystem.ts` | ✅ | — | ✅ |
| `ability:<id>` | 切換型技能的每一跳 | `abilities/toggle.ts` | ✅ | — | ✅ |
| `ability:<id>` | 代放（proxyCast） | `effects/proxyCast.ts` | ✅ | — | ✅ |
| `basic` | 普通攻擊（近戰與遠程投射物都寫這個字串） | `systems/BasicAttackSystem.ts` | — | ✅ | ✅ |
| `hook:<sourceId>` | 道具／增益卡的觸發傷害 | `effects/hooks.ts` | — | — | ✅ |
| `fireRing` | 場地環境火焰 | `sim/fireRing.ts · systems/FireRingSystem.ts` | — | — | ✅ |
| `guardian` | 守衛塔 | `systems/GuardianSystem.ts` | — | — | ✅ |
| `mob` | 殭屍 | `systems/MobSystem.ts` | — | — | ✅ |
| `flower` | 花圈 | `systems/FlowerSystem.ts` | — | — | ✅ |
| `lifesteal` | 吸血回饋（不是一發傷害封包） | `combat/damage.ts` | — | — | ✅ |

⭐ 出貨 `scope: "ability"` ⇒ 上表 **`ability` 那一欄**就是今天真的會發生的事。

⚠️ **技能掛上去的持續傷害（DoT）也吃**，而且不需要第二條規則：
`DotInstance.origin` 原封不動抄施放它的那一次執行的 `ctx.origin`，所以一支技能種下的 DoT 每一跳都是 `ability:<id>`。

⚠️ **反彈封包不吃**（不論 `scope` 填什麼）：一發反彈的量是「剛剛打中我的那一下」的百分比，
而那三個讀數已經吃過**攻擊者**的乘數 —— 反彈者再乘一次自己的，反彈比例就不等於卡面寫的百分比。
它與全域傷害倍率共用同一個旗標 `DamagePacket.skipGlobalDamageMult`，⛔ 沒有第二個開關。

---

## ⚠️ 給外部編輯器 / Codex：作者填的數字是**乘之前**的

一支技能 JSON 裡的 `amount.flat` / `amount.perRank` / `amount.ratios` 全部是**基礎傷害**。
玩家看到的數字是它再乘上這一層（以及全域傷害倍率、虛弱、輸出倍率）之後的結果。
⛔ **不要**把這一層預先算進卡面的數字裡 —— 那會讓它被乘兩次，而且 owner 調 `rate` 時那一支不會跟著動。

---

## ⭐ `apRatioMode` —— 量出來的（⛔ 不是估的）

語料：`content/abilities/*.json` **420 份**，掃到 **252** 個技能傷害 `Scaling` 節點。

| | 數量 | 佔傷害節點 |
|---|---:|---:|
| 帶法強係數（`ratios:{stat:"ap"}`） | **144** | 57.1% |
| 其中：拿掉係數之後**完全沒有屬性相依**（＝變成純固定值） | **144** | 57.1% |

法強係數的分佈：最小 **0.1** · 中位 **0.6** · 最大 **7**。

⇒ 出貨 `apRatioMode: "stack"`。理由是上面那兩列：
切成 `"replace"` 會讓那 144 個節點變成**與任何屬性都無關的常數**，
而係數今天橫跨 0.1〜7（70 倍）—— 也就是「特別吃法強的大招」與「幾乎不吃的小招」會被壓成同一支。
`"replace"` 存在是為了**回頭**，⛔ 不是為了觀望。


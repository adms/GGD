# ability 補完計畫

> **這一份是「怎麼補」，詞彙在另一份：**[`docs/效果標籤詞彙表v2.md`](效果標籤詞彙表v2.md)。
> v2 說「有什麼、哪些今天能用」；這一份說「幾批、改哪些檔、守衛怎麼寫、
> 哪幾項要 owner 拍板才動」。
>
> **來源**：owner 2026-08-04 對 v1 詞彙表的十條裁決。GitHub issue：#273。
>
> ⚠️ **先讀[「要 owner 判斷的九項」](#要-owner-判斷的九項)** —— 其中四項會**改變下面的批次內容**，
> 不是做完再回頭調整的事。

---

## 0 · 一頁摘要

### owner 的十條裁決

| # | 裁決 | 落在哪一批 |
|---|---|---|
| ① | 新增**【淨化】**，掛到朗基努斯之槍 / 仙后座 / 天生牙 | [A4](#a4--淨化驅散) |
| ② | **給殭屍建 StatsComp**（推翻同日上午的「不作」） | [A3](#a3--殭屍-statuscomp--statscomp) |
| ③ | **三選一增益卡授權面**要補齊 | [A5](#a5--增益卡授權面) |
| ④ | **onLevelUp 接上發射點** | [A2](#a2--泛化-pending-hook-佇列--onlevelup) |
| ⑤ | `curse.json` 更名「詛咒」 | [A6](#a6--curse-更名--重創) |
| ⑥ | 🔧 可組合**升格成完整標籤** | [D6](#d6--標籤預設層) |
| ⑦ | 🚧 需新建**實作完整**，但八項延後 | B / C / D 各組 |
| ⑧ | **層 3 與層 4 選項共用一個池子** | [B1](#b1--謂詞池統一) |
| ⑨ | 【減療／禁療】取消，用**【重創】**代替 | [A6](#a6--curse-更名--重創) |
| ⑩ | **火圈加入觸發行列** | [A1](#a1--火圈進傷害佇列) |

### 延後名單（owner 逐字：「目前不需要做，但保留在列表上做參考」）

法球格擋 · 擬態 · 附身 · 地面領域 · 陷阱 · 引導 · 換位／偷屬性 · 複製技能／時間回溯／連段

⭐ 其中**地面領域**與**陷阱**的一半缺口會被 [D2 通用延遲排程](#d2--通用延遲排程) 與
[B3 空間葉子](#b3--謂詞葉子補完) 順手補掉 —— 之後再撿會便宜很多。

### 批次總表

| 批 | 標題 | 大小 | 解鎖 | 依賴 |
|---|---|---|---|---|
| **[A1](#a1--火圈進傷害佇列)** | 火圈進傷害佇列 | S | 所有 hook 對火圈生效 · 免疫真傷生效 · 易傷／反彈生效 | — ⚠️ 平衡 |
| **[A2](#a2--泛化-pending-hook-佇列--onlevelup)** | 泛化 pending-hook 佇列 + onLevelUp | M | onLevelUp（修既有謊言）· onDeath · onRevive · onEnterCombat · onHardCCApplied · onMobilityEnd | — |
| **[A3](#a3--殭屍-statuscomp--statscomp)** | 殭屍 StatusComp + StatsComp | **S / M / L 三段** | 一整批標籤在殭屍波從無效變有效 | — ⚠️ 效能 |
| **[A4](#a4--淨化驅散)** | 淨化／驅散 + `clearPools` | M | 【淨化】【驅散免疫】+【破盾】【睡眠】的前置 + 三件道具 | — |
| **[A5](#a5--增益卡授權面)** | 增益卡授權面 | S | 卡片寫得出隱身／飛行／格擋／暴擊／靈氣／真傷覆寫 + **限時隱身／限時飛行** | — |
| **[A6](#a6--curse-更名--重創)** | curse 更名 + 重創 | S | 【重創】【禁療】· 讓出「恐懼」這個名字 | — |
| **[B1](#b1--謂詞池統一)** | 謂詞池統一（觸／判／封） | M | 後面每一顆葉子與事件都掛在這根上 | — |
| **[B2](#b2--triggerdamage-補-type--crit)** | TriggerDamage 補 type + crit | **S** | 【暴擊時】【這一發是 AP／AD／真傷】—— ⭐ 全表 CP 值最高 | B1 |
| **[B3](#b3--謂詞葉子補完)** | 謂詞葉子補完（12 顆） | L | 狀態 · 回合 · 時鐘 · BOSS · 附近人數 · 堆層 · 資源穿越 · 第 N 次 · 每回合一次 · 脫戰 · 靜止 · 位移 · 背包 | B1 |
| **[B4](#b4--事件補完)** | 事件補完（11 個） | L | 死亡 · 復活 · 治療 · 護盾 · 迴避 · 格擋 · 免死 · 狀態套用 · 進出範圍 · 隊友陣亡 | A2 · B1 |
| **[B5](#b5--場上節點事件)** | 場上節點事件（4 個） | S | 殭屍波 · 殭屍王 · 火圈 · 守衛塔（⭐ GH#263 的掛載點） | A2 |
| **[B6](#b6--主機事件通道)** | 主機事件通道（5 個） | M | 回合勝負 · 全場勝負 · 任務 · 選卡 · 購物 | A2 ⚠️ replay |
| **[C1](#c1--沉默)** | 沉默 | S | 【沉默】 | A3a |
| **[C2](#c2--混亂)** | 混亂 | S | 【混亂】 | A3a |
| **[C3](#c3--恐懼)** | 恐懼 | M | 【恐懼】 | A3a · A6 |
| **[C4](#c4--睡眠)** | 睡眠 | S | 【睡眠】 | A4 |
| **[C5](#c5--標記)** | 標記（敵人身上） | S | 【標記】+ 敵方版標記引爆 | B3 |
| **[C6](#c6--韌性)** | 韌性 | M | 【韌性】 | — |
| **[D1](#d1--破盾)** | 破盾 | **XS** | 【破盾】 | A4 |
| **[D2](#d2--通用延遲排程)** | 通用延遲排程 | M | ⭐【延遲落地】+ 擴張圓環 + 未來的地面領域／陷阱 | — |
| **[D3](#d3--環繞衛星)** | 環繞衛星 | M | 【環繞衛星】 | — |
| ~~D4~~ | ~~無敵（點不到）~~ | — | ⛔ **owner 裁決延後**，併進延後名單（與【附身】共用接縫） | — |
| **[D5](#d5--投射物形狀)** | 投射物形狀 chain／homing／boomerang | M | 三個玩家講得出名字的投射物行為 | — |
| **[D6](#d6--標籤預設層)** | 標籤預設層（preset） | M | 14 個 🧩 標籤變成編輯器上的一等公民 | A4 · A6 |
| **[E1](#e1--共用-shape-欄位)** | 共用 `shape` 欄位（純加法：新 kind 一律帶） | M | 範圍治療／範圍暈眩／錐形…新 kind 一次到位 | ✅ owner 核准。**是硬約束不是批次** —— 每一個新 kind 都要帶 |
| **[E2](#e2--wire-頻道)** | wire 頻道（別人看得到的狀態） | M ⚠️**單向門** | 破甲光環／冰凍外觀／頭上的標記／未來的體型 | ✅ owner 核准。⛔ **必須排最後**：等 A/B/C/D 欄位全定案再一次追加 |
| **[F1](#f1--三件道具上架--49-支盤點)** | 三件道具上架 + 49 支盤點 | S | 朗基努斯之槍／仙后座／天生牙 玩家拿得到 | ✅ owner 核准。依賴 A4（淨化） |

### 依賴圖（只畫硬依賴）

```
A2 ─┬─> B4 ──> C? (onDeath 相關)
    ├─> B5
    └─> B6 ⚠️replay

B1 ─┬─> B2 ⭐最便宜
    ├─> B3 ──> C5
    └─> B4

A4 ─┬─> D1 ⭐幾乎免費
    ├─> C4
    └─> D6

A3a ─┬─> C1 · C2 · C3
A3b ─> （破甲／易傷 在殭屍身上生效）
A3c ─> （虛弱／凋零 在殭屍身上生效）

A1 · A5 · A6 · C6 · D2 · D3 · D4 · D5 · E1 · E2  —— 無前置
```

**建議出貨順序**：`A6 → A1 → A2 → B1 → B2 → A5 → A4 → D1 → A3a → C1/C2 → …`
理由是每一步都**自己完成一件玩家看得到的事**，而且前四步加起來還不到一天。
⛔ 不要先開 B3／B4 那種大批 —— 它們解鎖多但自己不完成任何一張卡。

---

## owner 已裁決的九項

> ⭐ **owner 2026-08-04 已經全部回覆，下面每一項的「裁決」列就是規格。**
> ⛔ **實作照裁決，不要照建議** —— 其中**兩項推翻了我的建議**（⑥ 與 ⑧），已標紅。
>
> | # | 題目 | 裁決 | 與建議一致？ |
> |---|---|---|---|
> | ① | 火圈進佇列後被誰看見 | **照建議的六格開關出貨** | ✅ |
> | ② | 殭屍 StatsComp 做幾段 | **A3a + A3b 做，A3c 不做** | ✅ |
> | ③ | 無敵（點不到） | **延後**（併進延後名單） | ✅ |
> | ④ | 主機事件進 replay digest | **要進** | ✅ |
> | ⑤ | 三件道具 | **各補一行描述 ＋ 上架**，另外要一份「49 支還有哪些沒上架」 | ⚠️ **擴大了範圍** |
> | ⑥ | 重創打折哪幾種回復 | **三格獨立倍率，預設全部 0.5**（含自然回復） | ⛔ **推翻建議**（我說 regen 1.0） |
> | ⑦ | 共用 `shape` 欄位 | **新 kind 一律帶 `shape`** | ✅ |
> | ⑧ | wire 頻道 | **開** | ⛔ **推翻「不替你選」** —— 單向門已獲授權 |
> | ⑨ | `hasItemOfTag` | **做** | ✅ |

### ① 火圈進佇列之後，它要被哪些東西看見？（影響 A1）

火圈今天是 `hp.hp -= dmg` 直接扣血：**無視護甲、魔抗、護盾、combat-env 倍率**。
進了 `damageQueue` 之後它會**開始被一整排東西看見**，每一個都是平衡改動：

| 互動 | 進佇列後預設會發生 | 我的建議 |
|---|---|---|
| `onDamageTaken` / `onDamageDealt` 發射 | ✅ 發 | **開** —— 這就是 owner 要的 |
| `invulnerable.blocksTrueDamage` 擋得住 | ✅ 擋 | **開** —— `FireRingSystem` 檔頭自承這是既有 bug |
| 護盾吃掉燒傷 | ✅ 吃 | **關**（＝今天的行為）—— 開了「站火圈裡靠護盾苟」會變成主流 |
| `combatEnv.damageDealt` 倍率 | ✅ 乘 | **關** —— 火圈是節奏工具不是傷害來源，乘上去會讓 #132 的收圈曲線失準 |
| 反彈（`damage.incomingPct`）彈得回去 | ✅ 彈 | **關** —— 彈給誰？火圈沒有施法者 |
| 易傷（未來的 `damageTakenMult`） | ✅ 放大 | **開** —— 讀起來合理 |

### ✅ 裁決：「照你說的做成開關」

六格全部做成後台開關，出貨值就是上表「我的建議」那一欄。
⚠️ 出貨之後 owner 打一場再現場翻 `respectsShields` —— 那一格是「站火圈裡能不能靠護盾苟」，
**體感比推論可信**，而它現在是一個下拉不是一次部署。

⚠️ 附帶：這會讓**既有錄影從火圈第一次燒到人的那一刻起全部發散**。
owner 2026-08-04 已裁決「以前的 replay 不用管，之後的可以播放就好」——
我照這條做，但**再確認一次**，因為這次影響的是**每一份**含火圈的錄影（＝全部）。

### ② 殭屍 StatsComp 分三段，每一段的代價差一個數量級（影響 A3）

owner 說「建 StatsComp 吧」。查證下來這件事**不是一件事，是三件**，
而且第一件幾乎免費、第三件是真的工程：

| 段 | 做什麼 | 代價 | 解鎖 |
|---|---|---|---|
| **A3a** | `mobs.ts` 加一行 `world.status.set(id, { effects: [] })` | **≈ 0** —— `movementHold.ts:38` 讀 `world.status.get(id)` 是**實體無關**的，一行就通 | 【暈眩】【定身】【減速】【詛咒】【暴走】＋ 未來的【沉默】【恐懼】【睡眠】【標記】 |
| **A3b** | 惰性建 StatsComp（第一次有人 attach 才建） | **小** —— `damage.ts:684` 的 `mitigate` 已經在讀 `world.stats.get(pkt.target)`，沒有 StatsComp 時 resist 當 0；建了之後預設也是 0 → **行為中性** | 【破甲】【破魔】【破防】【易傷】 |
| **A3c** | 讓殭屍的**輸出**讀 StatsComp | **中–大** —— `MobSystem.ts:236` 今天是 `amount: prof.attackDamage`，**完全不看 StatsComp**。要改成「profile 當 base、StatsComp 當疊加」，而那是每一波殭屍傷害的來源 | 【虛弱】【凋零】以及任何改殭屍輸出的東西 |

### ✅ 裁決：「A3a + A3b 做」

A3c **不做**。→ 【虛弱】【凋零】在殭屍身上維持無效，
而這件事**必須寫進編輯器的提示文字**（否則作者會做出一張在殭屍回合半殘的卡）。
v2 詞彙表那兩格的殭屍欄因此是 🧟❌ 而不是 🧟🔨。

⚠️ **一個具體的靜默陷阱，不管做哪一段都要擋**：
`MovementSystem.ts:179` 是

```ts
world.stats.get(id)?.final[Stat.MoveSpeed] || (world.mob.has(id) ? mobSpeed : BASE_MOVE_SPEED)
```

`||` 而不是 `??`。所以一旦殭屍有了 StatsComp 而 `final[MoveSpeed]` 是**任何非零值**，
`mobProfile(...).moveSpeed`（一般／特殊／殭屍王三種速度，#262 特地分開的）
就會被**完全繞過**，而且沒有任何錯誤 —— 殭屍王會用普通殭屍的速度走路。
→ **A3b 的第一條守衛就是這個**（見該批）。

### ③ 【無敵（點不到）】要不要做（影響 D4）

owner 沒有把它放進延後名單，所以預設要做。但它是本輪**最貴的一項**：
`invulnerable.ts` 檔頭把它明列為「這一版沒做」的三件事之一，
理由是它牽動 **`targeting.ts` ＋ 自動攻擊 ＋ 小怪 AI ＋ 投射物**四個子系統，
而那四個都是「壞了很久才會被發現」的地方（自動攻擊選錯目標不會報錯，只會手感變差）。

| 選項 | 代價 | 後果 |
|---|---|---|
| **A** 完整做 | L，四個子系統各一條守衛 | 【無敵】可用 |
| **B** 延後，併進延後名單 | 0 | 卡片上不能寫「不可被選取」 |
| **C** 做**半套**：只擋手動點選與自動索敵，不動小怪 AI 與投射物 | M | ⛔ **不建議** —— 半套的無敵在殭屍面前失效，是最難解釋的那種 bug |

### ✅ 裁決：「ok」＝ **B，延後**

→ **[D4](#d4--無敵點不到) 從批次表移除，併進延後名單**（延後項目從 8 個變 **9 個**）。
→ 卡片與技能上**不可以寫「不可被選取」**，編輯器的下拉裡也不出現。
→ 它和【附身】共用同一批接縫，未來一起做。

### ④ 主機事件要不要進 replay digest（影響 B6）

回合勝負 / 全場勝負 / 任務完成 / 選到增益卡 / 購買道具 這五個時刻住在
`MatchController`（sim 之外），要發成 hook 就必須從外面注入 sim。

⚠️ **一個從外面注入而沒進 digest 的事件，會讓錄影在該點之後整個分岔，
而症狀會出現在完全不相干的地方**（這正是 GH#198 那一族的形狀，追了很久）。

| 選項 | 代價 |
|---|---|
| **A** 事件進 digest（正確） | M —— 要定義注入點的固定順序與序列化格式 |
| **B** 不進 digest，接受這五個事件的錄影不可重播 | S，但**錄影會靜默地對不起來** |
| **C** 延後整批 B6 | 0 |

### ✅ 裁決：「yes」＝ **A，事件進 digest**

→ [B6](#b6--主機事件通道) 開工，但它的**第一條守衛是決定性**，不是「事件會發」：
同一份輸入重放兩次，注入點的序列化結果必須逐位元相同。
⛔ 這一批**不可以先做功能後補 digest** —— 那等於選了被否決的 B。

### ⑤ 三件道具的描述會和實作不一致（影響 A4）

owner 指定把【淨化】掛到三件道具上。查證出貨文件：

| 道具 | id | 描述裡有沒有淨化 |
|---|---|---|
| **朗基努斯之槍** | `godie-i018` | ❌ 沒有。⭐ 但它的**製作書** `godie-i024` 逐字寫著「**10%機率淨化(法球)**」—— 這是 WC3 的 Purge 法球，owner 的要求有原作依據 |
| **仙后座** | `godie-i01s` | ❌ 沒有（描述是迴避 25% + 瞬移 + 最大魔力 +100% + 每秒回魔 +25） |
| **天生牙** | `godie-i031` | ❌ 沒有（描述是復活 + 回復 + 每秒生命回復 +20） |

⚠️ **常設規則是「owner 親筆的 `description` 是規格，agent 不准改」**，
所以我**不會**動這三段文字。但實作完之後，遊戲裡會有一個道具描述沒寫的行為 ——
那正是失敗形態 ②（卡上寫了／沒寫，遊戲裡是另一件事）的鏡像。

**要 owner 回一句**：這三段描述要不要各補一行？例如
- 朗基努斯之槍：`[淨化] On-Hit 機率移除目標身上的增益`
- 仙后座：`[淨化] 每 1 秒移除自己身上的一個減益`
- 天生牙：`[淨化] 每 10 秒移除周圍隊友身上的減益`

### ✅ 裁決：「各補一行，應該要上架」

→ **這三段描述由 owner 授權補一行**（只補 `[淨化]` 那一行，其餘一字不動）。
→ **三件都要上架**，走[上架檢查清單](#上架檢查清單)。
→ owner 同時要一份「**上次通過的 49 支武器道具還有哪些沒上架**」——
   見下方〈[49 支傳說武器的上架盤點](#49-支傳說武器的上架盤點)〉。

### ⑥ 【重創】到底打折哪幾種回復（影響 A6）

owner：「用重創代替就好，**吸血/治療同時減半**」。這句話有三個範圍可以讀：

| 範圍 | 例 | 我的建議 |
|---|---|---|
| 自己的**吸血** | `Stat.Lifesteal` / `damage.refund` | ✅ 打折（owner 明說） |
| 別人給的／自己放的**治療** | `heal` / `restore` / 治療花 / 守衛塔 | ✅ 打折（owner 明說「治療」） |
| **生命回復**（每秒自動回血） | `Stat.HealthRegen`、`RegenSystem` | ❓ **建議不打折**，做成第三格欄位預設 off |

### ⛔ 裁決推翻建議：「三種獨立倍率，**預設都是 0.5**」

→ 出貨值 `lifesteal 0.5 / healingTaken 0.5 / **regen 0.5**`。
禁療＝三格都填 0 的一份內容文件，**不是第二個機制**。

⚠️ **這一項比我原本估的多一個改動點**，要寫進批次：
`regen` **不經過 `healTarget`**，它走 `RegenSystem.ts:58` 的
`hp.hp = Math.min(hp.maxHp, hp.hp + perSec * world.dt)`。
所以 A6 有**兩個**讀取點不是一個，而 A6 的守衛 ③ 要**反過來寫** ——
從「regen 必須不受影響」改成「**regen 必須被打折**」，突變是「刪掉 RegenSystem 的乘數 → 相等 → 紅」。

⚠️ 順帶：`MobSystem.ts:212` 也有一條殭屍自己的 `hpRegenPerSec` 回血，
走的是第三條路。**要不要一起打折是一格欄位**，出貨預設**打**（與 owner 的「三種都 0.5」同向）。

### ⑦ 形狀要不要抽成共用欄位（E1）

今天 `damage` / `damageArea` / `damageLine` 把形狀烘進 kind 名字，
而 `heal` / `applyStatus` / `knockback` / `shield` **沒有** Area／Line 版本。
所以「範圍治療」「範圍暈眩」今天要靠 `tpl-proxy-fanout` 繞。

⚠️ **每加一個新 kind 就多欠一組 Area/Line/Cone 版本 —— 這個債會相乘。**
這一輪要加 6 個新 kind，做完之後債會從 3 欠變成 9 欠。

| 選項 | 代價 |
|---|---|
| **A** 現在抽（`EffectDef` 加一個共用 `shape: single\|circle\|line\|cone`） | L，但**可以純加法**（既有三個 kind 不動，新 kind 一律走 shape） |
| **B** 不抽，繼續長 `healArea` / `stunArea` 這種名字 | 每個新需求 S，但數量會相乘 |

### ✅ 裁決：「新 kind 一律帶 shape」

→ [E1](#e1--共用-shape-欄位) 從「要拍板才動」升成**這一輪的硬約束**：
**本計畫新增的每一個 kind 都必須帶 `shape: single|circle|line|cone`。**
既有 `damage` / `damageArea` / `damageLine` 原封不動 —— 零文件改動，債停止長大。

⛔ 這條要進[出貨守則](#出貨守則)的檢查表：**新 kind 沒有 `shape` 欄位＝不可合併。**

### ⑧ 「別人也看得到的狀態」要不要開 wire 頻道（E2）

`ENTITY_FLAG_FREE_BITS = []` —— **位元真的用完了**（有守衛在釘）。
好消息：`statusIds` + `statusRemainTicks` 兩條平行陣列已經在線上，**逐座位只送自己的**，
所以任何新 status 會自動出現在**自己的** HUD 上帶名字與倒數、零接線。

壞消息：**敵人身上的破甲光環、隊友的冰凍外觀、頭上的標記今天沒有頻道。**

| 選項 | 代價 |
|---|---|
| **A** `EntityState` 追加欄位（`defineTypes` append-only，**加錯回不去**） | M ⚠️ 單向門 |
| **B** 承認新狀態只有自己看得到 | 0，但【標記】【冰凍外觀】在畫面上不存在 |

### ⛔ 裁決：「yes」＝ **A，開頻道**（單向門已獲授權）

→ [E2](#e2--wire-頻道) 開工。**它是全計畫唯一不可逆的一步**，所以有三條硬規則：

1. ⛔ **一次追加，不要各加各的。** 全計畫要上線的欄位先列成完整清單，
   一次 `defineTypes` append 做掉。⚠️ 這代表 **E2 必須排在 A/B/C/D 的欄位都確定之後**，
   不是排在前面 —— 否則就會發生「做到一半發現還要一格」，而那一格加不回去。
2. **追加的是欄位，不是位元。**`ENTITY_FLAG_FREE_BITS = []` 說的是**旗標位元**用完了；
   `EntityState` 追加一格 `float32` / `uint16` 是**合法且受認可**的路徑
   （`protocol/schema.ts:745` 的 SLOT REUSE 說明就是前例）。
3. **守衛必須是配對式的**（`CLAUDE.md` 2026-08-02 的教訓）：
   斷言「**客戶端渲染出來的東西 == 伺服器算出來的值**」，
   ⛔ **不是**「兩邊各自欄位合法」。突變：不送那一格 → 紅。

**開了之後解鎖**：敵人身上的破甲光環 · 隊友的冰凍外觀 · 頭上的標記 ·
未來的體型變化（稜彩卡批 12）。
→ **[C5 標記](#c5--標記) 的視覺那一半因此從「做不到」變成「要做」。**

### ⑨ 【裝備了某類道具時】現在做值不值得（B3 的一顆葉子）

商店現在只留能力屬性強化與傳說寶玉（GH#261），武器道具全部下架。
所以這顆葉子做完之後**沒有東西可以查**。

### ✅ 裁決：「做」

排在 [B3](#b3--謂詞葉子補完) 最後一顆。純讀、二十行、不動任何既有路徑。
⭐ 而且裁決⑤ 要把三件道具（以及 49 支傳說武器）上架 —— **它的兌現時間因此提前了。**

---

## A 組 · owner 明確點名的六件

### A1 · 火圈進傷害佇列

**為什麼**：owner 逐字「火圈加入觸發行列」。今天 `sim/fireRing.ts:1172` 與
`systems/FireRingSystem.ts:98` 都是 `hp.hp -= dmg` 直接扣血 ＋ 發一個 `fireRingDamage` 事件，
**完全不進 `world.damageQueue`** → `onDamageTaken` / `onDamageDealt` 對火圈**一次都不發**。

⚠️ **v1 詞彙表的批 1 有一段就是被這件事推翻的**：它寫「守衛要驗火圈真傷不算技能傷害」，
而真相是火圈根本走不到那條路。修完之後那個風險**才第一次真的存在** ——
所以 A1 出貨的同時，`hookVocabulary.test.ts` 裡那條用**人造封包**的守衛
可以換成真火圈了（換之前先確認它仍然會因為突變而紅）。

**解鎖**：所有 hook 對火圈生效 · `invulnerable.blocksTrueDamage` 對火圈生效 ·
未來的易傷／反彈能看見火圈。

**改動面**：`sim/fireRing.ts:1172` · `sim/systems/FireRingSystem.ts:98`
（兩處都改成 push 一發 `origin:"fireRing"` 的封包）· `content/config/fire-ring.json`
＋ `schema/config.ts` ＋ `apps/admin`（[九項①](#-火圈進佇列之後它要被哪些東西看見影響-a1)的六格開關）

**守衛**（三條，每條都要突變驗證）：
1. **hook 真的會發**：一個 `onDamageTaken` 的 hook，在角色被火圈燒到時必須觸發 ——
   突變：把 push 改回 `hp.hp -=` → 不觸發 → 紅。
2. **免疫真的擋得住**：帶 `invulnerable{blocksTrueDamage:true}` 的角色站在火圈裡血量不掉 ——
   突變：把封包的 `type` 從 `"true"` 改成 `"magic"` → 免疫欄位讀錯 → 紅。
3. **開關真的是開關**：`respectsShields:false`（出貨值）時護盾不吸收火圈；
   翻成 true 時吸收 —— 突變：忽略該欄位 → 兩種設定結果相同 → 紅。
   ⛔ 斷言不可以寫死任何出貨數值，兩端都從 config 讀。

**⚠️ 風險**：**每一份含火圈的既有錄影從第一次燒到人起發散**（owner 已裁決可接受，
但[九項①](#-火圈進佇列之後它要被哪些東西看見影響-a1)請再確認一次）。
⚠️ 火圈每 tick 對場上每個人結算，進佇列之後 `DAMAGE_QUEUE_MAX_PASSES`
的預算要重算 —— 火圈封包不可以觸發反彈鏈（預設關），否則收圈那 20 秒會變成傷害風暴。

---

### A2 · 泛化 pending-hook 佇列 + onLevelUp

**為什麼**：`onLevelUp` 在 `zHookEvent` 裡（`effect.ts:122`）、在後台下拉裡，
而 `grep -rn "fireHooks(" packages/shared/src/sim/` 的 **15 個發射點沒有一個是它**。
照這格寫的卡片會安靜地什麼都不做 —— 這是**今天就在騙人的 bug**，owner 指定接上。

而它卡在一個結構問題：事件發生的地點（`progression.ts` / `MovementSystem` /
`LeapSystem` / `applyStatus` / `knockback` / `damage.ts`）**都不可以 import `effects/hooks`**，
那會 close `hooks → effectRunner → effectRegistry → 各效果 → 回原檔` 的初始化環
（`systems/CcHookSystem.ts` 檔頭已經為這件事付過一次代價）。

⭐ **解法已經在 repo 裡跑著**：`world.pendingStunHooks`（`SimWorld.ts:857`，純陣列 push 順序）
＋ `ccHookSystem` 排在 `combatResolveSystem` 之後、`deathSystem` 之前。
泛化成 `world.pendingHookEvents` ＋ 一支 drain system，成本從
「N 支 bespoke system × 各 60–80 行 + N 次時序論證」降到「1 支 system + N 個一行 push」。

**解鎖**：`onLevelUp`（修既有謊言）· `onDeath` / `onRevive` / `onEnterCombat` /
`onHardCCApplied` / `onMobilityEnd` 的通道（事件本身在 B4）

**改動面**：`sim/SimWorld.ts`（`pendingStunHooks` 泛化）· `sim/systems/CcHookSystem.ts`
（升級成通用 drain）· `sim/economy/progression.ts:68-70`（onLevelUp 的 push）·
`content/config/*.json` + `schema/config.ts` + `apps/admin`（`fireOnBulkGrant`）

**守衛**（兩條）：
1. **onLevelUp 真的發**：一個訂閱 onLevelUp 的 source，在 `grantLevels(1)` 之後
   效果必須跑過一次 —— 突變：刪掉 progression.ts 的 push → 不跑 → 紅。
   ⛔ **這一條是失敗形態 ② 的正面防禦**：今天沒有任何東西在看這件事。
2. **整包發放不會爆 N 次**（除非開關說要）：`fireOnBulkGrant:false` 時
   `grantLevels(40)` 只發一次；true 時發 40 次 —— 突變：忽略該欄位 → 兩種設定相同 → 紅。
   ⛔ 斷言用測試自己傳的級數，不要抄出貨的回合表。

**⚠️ 風險**：⚠️ **佇列必須是陣列（push 順序），不可以掃 Map** ——
Map 的原生順序是生成順序，殭屍進場／召喚物／重生都會改變它。
⚠️ **不可以用 `world.events`** —— `SimWorld.step()` 第一行 `this.events.length = 0`，
而 `grantLevels` 是 host 在 step 之外呼的，事件會被吃掉。
⚠️ `grantLevels` 一次可以吐 40–50 級（回合結束的整包發放），
一張「升級時獲得 X」的卡在那一瞬間會爆 50 次 —— 所以 `fireOnBulkGrant` **必須存在**。

---

### A3 · 殭屍 StatusComp + StatsComp

**為什麼**：owner 逐字「建 StatsComp 吧」，推翻同日上午的「不作爭取效能與順暢度」。
`mobs.ts` 今天只建 `transform` / `health` / `nav` / `team` / `mob`（＋ boss 的 `flight`）。

⚠️ **這一批分三段，代價差一個數量級**，詳見[九項②](#-殭屍-statscomp-分三段每一段的代價差一個數量級影響-a3)。
下面按段寫。

#### A3a · StatusComp（≈ 一行）

⭐ **`movementHold.ts:38` 讀 `world.status.get(id)` 是實體無關的** ——
`mobs.ts` 加一行 `world.status.set(id, { effects: [] })`，
【暈眩】【定身】【減速】【詛咒】【暴走】**立刻在殭屍身上生效，零額外接線**。

**守衛**：一個被 `applyStatus{stun:true}` 打到的殭屍，那幾 tick 內位移必須是 0 ——
突變：刪掉 mobs.ts 那一行 → 殭屍照走 → 紅。

⚠️ **風險**：`StatusSystem` 與 `statusExpirySystem` 會多迭代 N 個殭屍的空陣列。
可忽略，但**要在同一個 PR 量一次每 tick 耗時**（`MatchRoom` 已經有 p50/p99）。

#### A3b · StatsComp（惰性建立）

**做法**：不在 spawn 時建，而是在 `attachSource` / `applyStatus` 發現目標是 mob
且還沒有 StatsComp 時**當場建一個**。沒有人給殭屍上 buff 的那些場，成本是零。

⭐ **行為中性**：`damage.ts:684` 的 `mitigate` 已經在讀 `world.stats.get(pkt.target)`，
沒有 StatsComp 時 resist 當 0；建了之後預設也是 0。
→ 【破甲】【破魔】【破防】【易傷】立刻生效。

**守衛**（兩條）：
1. ⛔ **移動速度不可以被 `||` 吃掉**（[九項②](#-殭屍-statscomp-分三段每一段的代價差一個數量級影響-a3) 的陷阱）：
   一隻**有 StatsComp 但沒有任何 modifier** 的殭屍王，移動速度必須與沒有 StatsComp 時
   **完全相同** —— 突變：把 StatsComp 的 `base[MoveSpeed]` 從 mobProfile 的值改成
   `BASE_MOVE_SPEED` → 殭屍王用普通殭屍的速度走 → 紅。
   ⛔ 斷言不可以寫死任何速度數值，兩邊都從 `mobProfile` 推導。
2. **破甲真的咬得到**：對一隻被 `armor override 0` 打過的殭屍，同一發物理傷害的
   `hpLost` 必須**嚴格大於**沒被破甲時 —— 突變：讓 `attachSource` 對 mob 直接 return
   → 相等 → 紅。⛔ 斷言「嚴格大於」不是「等於 1.2 倍」。

#### A3c · 殭屍輸出讀 StatsComp（⚠️ 等 owner 說要）

`MobSystem.ts:236` 今天是 `amount: prof.attackDamage`，**完全不看 StatsComp**。
要讓【虛弱】【凋零】對殭屍生效，就得改成「profile 當 base、StatsComp 當疊加」——
而那是**每一波殭屍傷害的來源**，是 owner 每週在調的數字。

**建議：不做，等 owner 明說。** 見[九項②](#-殭屍-statscomp-分三段每一段的代價差一個數量級影響-a3)。

---

### A4 · 淨化／驅散

**為什麼**：owner 逐字「請你新增 [淨化]」。今天**零個站點**，逐個查證過四個池子誰能縮小它們：

| 池 | 今天誰能縮小它 |
|---|---|
| `world.status` 的 `st.effects[]` | `StatusSystem.ts:7` 的到期過濾 · `revive.ts:367` 的 `st.effects = []` · enterCombat |
| `world.dot` | ⛔ **只有 dotTickSystem 自己會刪**（死亡或 settledZones 時整包 delete）→ **活著的人身上的燃燒今天沒有任何辦法移除** |
| `sc.sources[]` | 到期 · `detachSource` |
| `hp.shields[]` | 吸收耗盡 · 到期 · `revive.ts:366` · enterCombat |

**做法**：把 `revive.ts:366-367` 那兩行抽成 `sim/clearPools.ts`，
接受一個 predicate（極性 ＋ `dispellable` ＋ 池子選擇 ＋ 拔幾個 ＋ 拔誰），
然後給它**三個呼叫端**：復活（predicate 恆真）· enterCombat（恆真）· dispel（有條件）。
⭐ **順便讓復活與回合邊界第一次真的碰得到 `world.dot`** —— 那是一個既有的漏洞。

**解鎖**：【淨化】【驅散免疫】·【破盾】（D1）·【睡眠】（C4）的前置 · **三件道具**

**三件道具的內容**（owner 指定，詳見[九項⑤](#-三件道具的描述會和實作不一致影響-a4)）：

| 道具 | id | 寫法 |
|---|---|---|
| **朗基努斯之槍** | `godie-i018` | `hooks: [{on:"onBasicAttack", chance:<欄位>, effects:[{kind:"dispel", target:"target", polarity:"buff", count:<欄位>}]}]` ⭐ 原作依據：製作書 `godie-i024` 逐字「10%機率淨化(法球)」 |
| **仙后座** | `godie-i01s` | `hooks: [{on:"onInterval", internalCooldown:1, effects:[{kind:"dispel", target:"self", polarity:"debuff", count:<欄位>}]}]` |
| **天生牙** | `godie-i031` | `hooks: [{on:"onInterval", internalCooldown:10, effects:[{kind:"dispel", target:"allies", radius:<欄位>, polarity:"debuff", count:<欄位>}]}]` |

⛔ **每一個 `<欄位>` 都是後台可調的，不是常數**（第一守則）。

**改動面**：**新檔** `sim/effects/dispel.ts` · **新檔** `sim/clearPools.ts` ·
`sim/revive.ts:366-367`（改呼叫共用函式）· `sim/components.ts` ·
`effects/dot.ts` + `applyBuff.ts` + `applyStatus.ts`（各加 `dispellable` + `polarity`）·
`content/schema/effect.ts` · `content/status-effects/`（15 份逐份標）·
`content/items/godie-i018|i01s|i031.json` · `apps/game-server/src/match/MatchController.ts` · `apps/admin`

**守衛**（三條）：
1. **`dispellable` 真的是閘**：標了 `dispellable` 的減速被拔掉、沒標的必須留著 ——
   突變：忽略該欄位 → 全拔 → 紅。
2. **`order` 不是裝飾**：`newest` 與 `oldest` 在同一組輸入上必須拔到**不同的那一個** ——
   突變：改成照陣列原序拔 → 兩者結果相同 → 紅。
   ⛔ 這條同時是 purity 守衛：沒有 order 就是靠陣列／Map 順序決定。
3. **`world.dot` 真的拔得到**：一個燃燒中的目標被 debuff 淨化之後，
   `world.dot` 裡屬於它的那一筆必須消失 —— 突變：clearPools 少呼叫 dot 那一池 → 紅。
   ⛔ 這一條同時釘住「復活與回合邊界漏掉 `world.dot`」那個既有漏洞。

**⚠️ 風險**：
- ⛔ **極性沒辦法推導**：status 還勉強推得出來（stun ‖ root ‖ moveSpeedMult<1 ‖ missChance ＝負面），
  但 buff 完全不行 —— 一個 ModifierSource 可以同時帶 `{ms, pctAdd, +0.3}` 和 `{armor, pctAdd, −0.5}`。
  → `polarity` **必須是施加時就寫死的欄位**，否則「淨化只拔負面」是一個會在某張卡上錯、
  **而且從編輯器修不掉**的啟發式。
- ⚠️ **`dispellable` 的預設值是一次真的平衡改動**：預設 true → 功能一上線，
  15 份 status 文件與每一支 DoT **同時**變成可拔；預設 false → 按鈕上線那天視覺上什麼都不做。
  → 建議 **status/dot 預設 true、buff 預設 false**（沒有人預期自己的道具被動可以被敵人剝掉），逐份可覆寫。
- ⚠️ **對殭屍**：四個池只有 `world.dot` 那一格今天拔得到；A3a/A3b 之後其餘三格才有意義。
- ⚠️ `dispellable` 要長在**被拔的那個東西**上，不是長在 dispel 上。

---

### A5 · 增益卡授權面

**為什麼**：owner 逐字「③ 三選一增益卡的授權面比技能窄得多 => 請實作」。
`zAugmentDef`（`content/schema/augment.ts`）逐字只有
`{id, name, description, tier, weight, modifiers?, hooks?, tags}`。
出貨 31 張的形狀普查證實：15 張只有 hooks、16 張只有 modifiers，**沒有第三種**。

⭐ **缺的是 schema 欄位，不是機制**：sim 端的 `syncVisionGrants`（`stealth.ts:258`）與
`syncFlightGrants`（`flight.ts:163`）讀的是 `sc.sources` 上**任何**帶 `expiresAtTick` 的
ModifierSource —— 它們不在乎那個 source 從哪裡來。

**解鎖**：卡片寫得出【隱身】【真視】【飛行】【格擋】【免死】【暴擊特化】【真傷覆寫】【靈氣】
⭐ **順手解掉【限時隱身】【限時飛行】**：`applyBuff.ts` 的 `attachSource` 今天只寫
`modifiers` / `hooks`（第 50-61 行逐字讀過）—— 加上 `vision` / `flight` 的轉發之後，
限時版就直接成立，不用再借道變身。

**改動面**：`content/schema/augment.ts`（加 `auras` / `vision` / `flight` / `block` /
`critStrike` / `damageTypeOverride`）· `content/schema/ability.ts` 的 `zAbilityPassiveRank`
（補 `block` / `critStrike` / `damageTypeOverride`）· `sim/content/defs.ts` ·
`sim/effects/applyBuff.ts:50-61`（轉發）· `content/schema/effect.ts`（applyBuff 的新欄位）· `apps/admin`

**守衛**（兩條）：
1. **卡片上的隱身真的生效**：一張帶 `vision` 的增益卡被授予之後，
   該英雄必須被自動索敵跳過 —— 突變：拿掉 augment schema 的那一格（或轉發那一行）
   → 索敵抓得到 → 紅。⛔ **斷言要讀真的索敵函式，不是讀 `sc.sources` 上有沒有那個欄位**
   （那是屬性不是行為，失敗形態 ⑦）。
2. **限時版真的會過期**：`applyBuff{duration, vision}` 在到期 tick 之後，
   隱身必須消失 —— 突變：轉發時不帶 `expiresAtTick` → 永久隱身 → 紅。

**⚠️ 風險**：⚠️ **`zAugmentDef` 是 `.strict()`** —— 加欄位不會破既有文件，
但**漏掉 admin 那一半就會出現「schema 收得下、後台編不了」**（第一守則的三個住處）。
⚠️ `block` / `critStrike` / `damageTypeOverride` 三個 grant 的解析器今天寫在道具路徑上，
要確認它們讀的是 `sc.sources` 而不是 `world.inventory` —— **交付前讀，不要假設。**

---

### A6 · curse 更名 + 重創

**為什麼**：兩件小事，合成一批因為它們都在「讓名字與語意對上」。

**① curse 更名**（owner：「ok」）
`content/status-effects/curse.json` 的 `name` 逐字是「恐懼 (詛咒)」，而它的機制是**失手率**。
改成「**詛咒**」（`tags` 已經是 `["curse","miss"]`，只改一個欄位），
把「恐懼」讓給 [C3](#c3--恐懼) 的逃跑軸。⚠️ 改完要跑 `pnpm content:build` 並 commit 產物。

**② 重創**（owner：「【減療 / 禁療】=> 用重創代替就好，吸血/治療同時減半」）
⭐ 比 v1 估的便宜得多：**所有治療都走 `combat/restore.ts::healTarget`（:66 → :73）一個函式**
（`heal` / `restore` / 吸血 / 治療花 / 守衛塔全部經過它），插一個乘數就完事。

做在 **status 上**而不是 Stat 上 —— 自動拿到到期、`statusExpirySystem` 的拆除、
`enterCombat` 的清空，而且**天生可以被 A4 的驅散拔掉**。

⭐ **owner 裁決：三格獨立倍率，預設全部 0.5**（含自然回復 —— 推翻了我的建議）：
`lifestealMult` 0.5 · `healingTakenMult` 0.5 · `regenMult` **0.5**。
**禁療＝三格都填 0 的一份內容文件，不是第二個機制。**

⚠️ **因此有三個讀取點，不是一個** —— 這是裁決帶來的實際差異：

| 路徑 | 讀取點 | 誰走這條 |
|---|---|---|
| 治療 | `sim/combat/restore.ts:66-73` `healTarget` | `heal` · `restore` · 治療花 · 守衛塔 · **吸血也走這裡**（`damage.ts:886` origin:"lifesteal"） |
| 吸血的**係數** | `sim/combat/damage.ts:885` | 只有普攻吸血（要在算 `dmg * ls` 那一步打折，否則會和上面重複打折） |
| 自然回復 | `sim/systems/RegenSystem.ts:58` | 英雄每秒回血 |
| （殭屍自然回復） | `sim/systems/MobSystem.ts:212` | 殭屍每秒回血 —— **一格欄位，出貨預設也打折**（與 owner 的「三種都 0.5」同向） |

⛔ **吸血要小心雙重打折**：吸血最後是一發 `healTarget`，所以 `healingTakenMult`
已經會咬到它。`lifestealMult` 必須作用在**係數**那一步而不是治療那一步，
否則帶重創的人吸血是 0.25 倍而不是 0.5 倍。**這正是守衛 ④ 要釘的。**

**改動面**：`content/status-effects/curse.json`（一個欄位，✅ **已出貨** commit `941c5b99`）·
`sim/components.ts` 的 `StatusEffect`（三格）· `sim/effects/applyStatus.ts` ·
`sim/combat/restore.ts:66-73` · `sim/combat/damage.ts:885` ·
`sim/systems/RegenSystem.ts:58` · `sim/systems/MobSystem.ts:212` · `content/schema/effect.ts` ·
`content/status-effects/grievous-wounds.json`（新）+ `no-heal.json`（新）· `apps/admin`

**守衛**（四條）：
1. **治療真的被打折**：帶重創的目標，同一發 `heal` 之後的 `hp` 增量必須**嚴格小於**
   沒帶時 —— 突變：刪掉 `healTarget` 的乘數 → 相等 → 紅。
2. **吸血那一半也被打折**（不是只做治療）—— 突變：只改 `healTarget` 不改吸血係數 →
   吸血打折倍率不對 → 紅。⛔ 這條在防「做一半而看起來像做完」。
3. ⭐ **自然回復也被打折**（裁決改了方向）：帶重創的目標每秒自動回血量必須**嚴格小於**
   沒帶時 —— 突變：刪掉 `RegenSystem.ts:58` 的乘數 → 相等 → 紅。
   ⛔ **這一條最容易被漏掉**，因為 regen 不經過 `healTarget`，
   只改治療那一條路會讓它靜默地不生效（失敗形態 ②）。
4. ⭐ **吸血不可以被打折兩次**：帶重創的人普攻吸到的血，必須恰好是沒帶時的
   `lifestealMult` 倍 —— 突變：把 `lifestealMult` 改成也在 `healTarget` 那一步套用
   → 變成兩個倍率相乘 → 紅。
   ⛔ 斷言寫「等於 `lifestealMult` 倍」，倍率**從測試自己建的 status 讀**，
   不可以寫 0.5 這個字面值。

**⚠️ 風險**：⚠️ **多個重創來源相乘還是取 max？** 引擎自己沒有一致答案
（`missChance` 取 max、護盾相加）→ **預設取 max**（跟最接近的鄰居一致），做成欄位。
⚠️ 更名之後 `grep` 一遍所有描述「恐懼」的字串 —— 語意改了舊文案就是謊話。

---

## B 組 · 謂詞池補完

### B1 · 謂詞池統一

**為什麼**：owner 逐字「[層 3][層 4] 應該是同一個池子裡，只是放在觸發、還是判斷條件而已」。

**做法**：建一份 `predicateRegistry`，每一項宣告三件事 ——
`asTrigger`（能不能當 `HookDef.on`）· `asCondition`（能不能當條件葉）· `needsPacket`（要不要事件封包）。
`HookDef.on` 與 `HookDef.condition` **兩個欄位保留**，但選項來自同一份登錄表，
schema 的 refine 從登錄表推導（**不是第二份手抄的清單**）。

⭐ **一半已經存在**：`effect.ts:1198` 的 refine 今天就在載入時擋掉
「把 `damage.incomingPct` 掛到不帶封包的事件上」—— B1 是把那個一次性的檢查
變成一張表，讓後面 18 個新謂詞免費得到同樣的保護。

**改動面**：**新檔** `packages/shared/src/content/predicateRegistry.ts` ·
`content/schema/effect.ts`（refine 改讀登錄表）· `sim/content/condition.ts` ·
`apps/admin` 與編輯器的下拉（**同一份登錄表**）

**守衛**（兩條）：
1. **登錄表真的在守**：一份把 `needsPacket` 的謂詞掛到 `onInterval` 上的文件必須
   **載入失敗**，錯誤訊息要指名那份文件 —— 突變：refine 改成永遠 return true → 過關 → 紅。
2. **兩個欄位共用一個池**：登錄表裡每一個 `asCondition:true` 的項目，
   都必須真的能被 `condition.ts` 解析 —— 突變：登錄表加一個沒有實作的項目 → 紅。
   ⛔ 這條在防「下拉裡有、引擎沒有」，也就是 `onLevelUp` 今天的狀態。

---

### B2 · TriggerDamage 補 type + crit

⭐ **全表 CP 值最高的一格，S 大小。**

`sim/combat/damage.ts:1003` 組出的 `TriggerDamage` 只有
raw / mitigated / hpLost / origin / reflectDepth / resolvePass **六格**，
而**同一個迴圈手上的 `DamagePacket` 第 44、45 行就是 `type: DamageType` 與 `crit: boolean`**
—— 資料就在原地，只是沒被抄過去。

補兩格 ＋ `HookDef` 一個過濾器（形狀照抄既有的 `damageSource`），
**一次解鎖【暴擊時】【這一發是 AP】【是 AD】【是真傷】四個標籤。**

**改動面**：`sim/effects/effect.ts:51`（`TriggerDamage` interface）·
`sim/combat/damage.ts:1003` · `sim/effects/hooks.ts`（過濾器）· `content/schema/effect.ts` · `apps/admin`

**守衛**（兩條）：
1. **過濾器真的過濾**：`damageFilter:{crit:true}` 的 hook 對非暴擊的一發必須不觸發 ——
   突變：刪掉那個比較 → 都觸發 → 紅。
2. ⛔ **順序**：過濾器必須留在**內部冷卻閘與機率骰之前** —— 突變：搬到骰子後面 →
   用 `world.rng.state` 前後比對會發現被擋掉的一發也抽了籤 → 紅。
   （這一套 `condition.test.ts` 的 DECISION 1 已經有現成寫法，**不要重造**。）

---

### B3 · 謂詞葉子補完

**十二顆葉子**，全部是「純讀、無 rng、不動 `conditionChanceCount` 那個
『抽籤次數只由樹的形狀決定』的不變量」：

| 葉子 | 讀什麼 | 特別注意 |
|---|---|---|
| `hasStatus` | `effectCommon.ts:46` 的現成一行 | ⭐ **和 [C5 標記](#c5--標記) 是同一次改動** |
| `roundAtLeast` | `world.round` | `economy/statPath.ts:70` 就在讀它 |
| `roundClockWindow` | `world.fireRingTicks` | 絕對上數的戰鬥經過 tick |
| `targetIsBoss` | mob 身上的 boss 旗標 | `ConditionEntityKind` 要加第五種，或加旗標 |
| `nearbyCount` | `SpatialHash` 的 `queryOverlap` | ⚠️ 與 `onEnterRange` **共用同一份 broadphase 查詢**，不是第二套空間系統 |
| `buffStacksAtLeast` | `sc.sources` 的 stacks | 讀不到回 **false** 而不是「跳過」，所以 `not(它)` 為 true —— 說明文字要寫清楚 |
| `onResourceCross` | hp/mp ＋ 一格「已經穿越過了嗎」 | ⭐ **觸／判 兩種讀法的最佳範例** |
| `everyNth` | `hooks.ts:89` 的 `hookLastFired` 旁邊放計數 | 不必碰世界狀態、不會有 Map 迭代順序問題 |
| `oncePerRound` | 同上 ＋ enterCombat 重置 | ⛔ **不要用 `internalCooldown` 近似** —— 語意是「冷卻」不是「一次」，而且回合之間不重置 |
| `outOfCombatFor` | `inCombatUntilTick` Map | ⚠️ **絕對 tick**，不是遞減計數器 |
| `afterStandStill` / `afterDistanceMoved` | 上次移動的絕對 tick / 累積距離 | ⚠️ 同一個旋鈕的兩端，只做一半會讓走位派與站樁派不對稱 |
| `hasItemOfTag` | 背包 | ⚠️ 武器道具下架中（GH#261），[九項⑨](#-裝備了某類道具時現在做值不值得b3-的一顆葉子) |

**改動面**：`sim/content/condition.ts:294` · `content/schema/condition.ts` ·
`sim/abilities/abilitySystem.ts:52`（`enemiesInCircle` 加英雄過濾）·
`sim/SimWorld.ts`（`inCombatUntilTick` / 移動累計）· `apps/admin` 的條件建構器

**守衛**（每顆葉子一條邊界 + 兩條共用）：
1. **邊界**：`>= N` 在 N−1 為 false、N 為 true —— 突變：`>=` 改 `>` → 紅。
2. **抽籤次數不變**：加了這些葉子之後，一場模擬的 rng 抽取次數必須與加之前**逐次相同**
   —— 突變：讓某顆葉子偷抽一次 → 紅。⛔ **這條保護每一份既有錄影。**
3. **隊伍過濾**：`enemyChampionWithinRange` 範圍內只有隊友時必須 false ——
   突變：拿掉隊伍過濾 → 紅。

**⚠️ 風險**：⚠️ **效能（會被誤判成卡頓）**：空間葉子在條件不成立時
**ICD 閘不會擋**（`hookLastFired` 只在成功發射後才寫）→ 每 tick 評估 →
每持有者每秒 30 次網格查詢。24 英雄全帶＝最壞 720 次/秒的小 AABB 查詢，
與 `auraSystem` 同量級可接受，但**必須寫進欄位說明**，而且
⛔ **`INTERVAL_BUDGET_CONDITION_KINDS` 要加進空間葉子** ——
那個常數今天只有 `chance`，註解指名了這一批要接手（v1 詞彙表的批 1 留下的交接）。
不接手的話，「`onInterval` + 空間葉子 + 沒填 internalCooldown → 載入失敗」那道閘對它是綠的。

---

### B4 · 事件補完

**十一個事件**，全部走 [A2](#a2--泛化-pending-hook-佇列--onlevelup) 的佇列：

`onDeath` · `onRevive` · `onHealed` · `onHealDealt` · `onShieldGain` · `onShieldBreak` ·
`onEvade` · `onBlock` · `onLethalPrevented` · `onStatusApplied` · `onAllyDeath`
（＋ `onEnterRange` / `onLeaveRange` 與 B3 的空間葉子共用查詢）

**每一個的發射點**（都已經定位）：

| 事件 | 發射點 | 注意 |
|---|---|---|
| `onDeath` | `DeathSystem.ts:70` 同一位置 | ⛔ **`hooks.ts:83-84` 開頭就是 `if (ownerHp && !ownerHp.alive) return;`** —— 排在 `alive` 被打成 false 之後就是啞的，**而且跟正常長得一模一樣** |
| `onRevive` | `ReviveSystem` | — |
| `onHealed` / `onHealDealt` | `combat/restore.ts::healTarget`（唯一入口） | ⚠️ **要帶治療封包**（來源、量、origin），不帶就寫不出「治療量的 20% 轉成護盾」；⭐【吸血觸發時】會免費得到 |
| `onShieldGain` / `onShieldBreak` | `effects/shield.ts` / 護盾耗盡處 | ⚠️ 破碎事件要帶「被什麼型別打破的」 |
| `onEvade` / `onBlock` / `onLethalPrevented` | `combat/evasion.ts` / `combat/block.ts` | ⚠️ 迴避要**兩個視角都發**；格擋要帶「擋掉多少」；免死與 `onDeath` 是同一判斷點的兩個分支 |
| `onStatusApplied` | `applyStatus.ts:53` 的 `st.effects.push` | ⚠️ 做完之後把 `onStunned` 標成它的捷徑，**不要讓兩者長期並存** |
| `onAllyDeath` | `onDeath` 的廣播 | ⚠️ 是**訂閱範圍**問題不是效果落點；成員規則沿用 `alliedChampions` |

**守衛**（三條共用 + 每個事件一條「真的會發」）：
1. ⛔ **`onDeath` 不可以是啞的**：一個訂閱 onDeath 的 source，在持有者死亡時效果必須跑 ——
   突變：把發射點移到 `alive = false` 之後 → 不跑 → 紅。**這一條是本批的靈魂。**
2. **迴避的兩個視角**：`onEvade` 在閃避者與被閃者身上必須各發一次 ——
   突變：只發一邊 → 紅。
3. **免死只發一次**：一發致命傷被擋下時 `onLethalPrevented` 發一次而 `onDeath` **不發** ——
   突變：兩個都發 → 紅。

---

### B5 · 場上節點事件

`onWaveStart` · `onBossSpawn` · `onFireRingIgnite` · `onGuardianDown`

⭐ **這四個時刻都在 sim 裡**（`MobSystem` 的排程、boss 登場、`FireRingSystem` 的
`fireRingRules.startTicks` vs `world.fireRingTicks` 絕對 tick 比較、`GuardianSystem` 的死亡點），
所以**比 B6 便宜得多** —— 只是補發射，走 A2 的佇列。

⭐ **守衛塔那一格同時是 GH#263（拆塔即勝）的掛載點** —— 先做它會讓 #263 幾乎不用寫新東西。

**守衛**：每個事件一條「真的會發，而且只發一次」——
突變：把 `onFireRingIgnite` 的發射從「startTicks 那一 tick」改成「每 tick」→
一秒發 30 次 → 紅。

---

### B6 · 主機事件通道

`onRoundWin` / `onRoundLose` · `onMatchWin` / `onMatchLose` · `onQuestComplete` ·
`onAugmentPicked` · `onItemPurchased`

⛔ **缺的不是五個事件，是一條通道。** 這些時刻住在 `MatchController`
（concludeCombat / settledZones / 商店 / 三選一排程），hook dispatch 現在碰不到。
缺一個 world 上的待處理主機事件佇列，MatchController 寫入、
sim 在 tick 開頭固定順序排空後發射。**做一次五個都通。**

⚠️⚠️ **它必須進 replay digest** —— 見[九項④](#-主機事件要不要進-replay-digest影響-b6)。
**這一批的 go/no-go 取決於那一題。**

⚠️ 任務層（GH#262 / #263）今天完全不存在；它一旦要做，
計數器應該一開始就設計成通用的，讓【連續命中第 N 下】【累積擊殺 N 隻】共用同一個。

---

## C 組 · 狀態軸補完

### C1 · 沉默

`StatusEffect`（`components.ts:331`）今天只有 `moveSpeedMult` / `root` / `stun` /
`missChance` / `berserk` 五格，沒有一格管施法。
缺一個 boolean ＋ `abilities/abilitySystem.ts:136` 旁邊一道閘 ——
⭐ **那裡已經有 stun 的閘可以照抄。比新增一個 kind 便宜，而且原作大量使用。**

**守衛**：被沉默的角色按 Q 必須被拒，**而且魔力不可以被扣、冷卻不可以進入** ——
突變：把閘移到 `spendMana` 之後 → 魔力被扣 → 紅。

### C2 · 混亂

⭐ **需新建裡最便宜的一項。**`berserk` 已經是「失去控制＋自動尋敵」；
缺的只是索敵那一步的「不分敵我」——`berserk.ts:107` 把身體交給 `autoAcquirePass`，
而它只找敵人。做成 `applyStatus.berserk` 旁邊一個 `targetsAllies` 開關（後台可切）。

**守衛**：混亂中的角色，其自動索敵結果必須**包含隊友** ——
突變：忽略 `targetsAllies` → 只找敵人 → 紅。

### C3 · 恐懼

berserk 的鏡像：拿走方向盤，但移動方向從「追最近的敵人」變成「遠離威脅源」。
缺一個 `fleeFrom` 模式。⭐ 名字已經由 [A6](#a6--curse-更名--重創) 的更名騰出來了。

**守衛**：受恐懼的角色，下一 tick 與威脅源的距離必須**嚴格變大** ——
突變：把逃跑方向的正負號拿掉 → 距離變小 → 紅。
⚠️ 要處理「被逼到場邊」：`stayInsideBoundary` 的既有邏輯要沿用，
否則角色會卡在邊界抖動。

### C4 · 睡眠

「不能動」＝ stun 已有；缺的是「**受傷即提早解除這一筆 status**」。
⛔ **它是 [A4](#a4--淨化驅散) 的下游** —— 全 sim 沒有任何提早移除單筆 status 的能力，
而 A4 的 `clearPools` 正好提供它。
註：施法已經有這條規則（`CastResolveSystem` 被傷害打斷），但那是施法不是狀態。

**守衛**：睡眠中的目標吃到一發傷害之後，該筆 status 必須不在 `st.effects` 裡，
**而同一個目標身上的其他 status 必須還在** ——
突變：改成清空整個 `st.effects` → 其他 status 也沒了 → 紅。

### C5 · 標記

貼那一半今天就能寫（`applyStatus` 帶純顯示的 statusId）。
缺的是**讀**：謂詞池沒有 status 葉（B3 的 `hasStatus` 補），
而 `comboBonus` / `bankedBonus` 兩個現成讀取器都**寫死讀 caster**
（`effectCommon.ts:66`、`:96`）。

⚠️ **和 B3 的 `hasStatus` 是同一次改動，不要當兩件事排。**

**守衛**：貼在**敵人**身上的標記，由**第三個人**打那個敵人時必須吃得到加成 ——
突變：把讀取端改回 `ctx.caster` → 吃不到 → 紅。

### C6 · 韌性

`applyStatus.ts:12` 是 `world.tick + Math.round(e.duration / world.dt)`，
秒數當場換絕對 tick，**中間沒有任何人可以乘**。
全遊戲唯一的持續時間倍率是 `tauntRules.durationMult`（只管嘲諷）。

做法：新增一條 Stat（吃現成的 applyBuff / 道具 / 三選一 / 靈氣 四條授權路）
並在換算 tick 時乘進去。

⚠️ **它和【淨化】是同一個真空的兩個答案**：一個事前減、一個事後解。
⚠️ 新增一條 Stat 的代價是實測過的：**5 個編譯錯誤點 + 1 個只有測試守得住的點 +
後台兩頁各多一個輸入框 + 玩家面板多一列**。這一條值得付（韌性是玩家看得懂的屬性），
但**不要把它當成「加 Stat 很便宜」的前例**。

**守衛**：帶韌性的目標被同一份 stun 打到，`expiresAtTick − world.tick` 必須**嚴格小於**
沒帶時 —— 突變：拿掉那個乘數 → 相等 → 紅。⛔ 不可以斷言具體 tick 數。

---

## D 組 · 效果種類補完

### D1 · 破盾

⭐ **XS —— A4 之後幾乎免費。**
護盾不在 `Stat` enum 裡（16 條逐一對過），所以 `ModOp.Override` 這條路對它**不存在**；
它是 `HealthComp.shields` 陣列。而**清空它的程式碼已經有了**（`revive.ts:366`），
A4 把它抽成 `clearPools` 之後，破盾就是那支函式的第三個呼叫端。

**守衛**：破盾之後 `hp.shields` 必須為空，**而 `st.effects` 必須原封不動** ——
突變：讓 dispel 的池子選擇失效 → 狀態也被清掉 → 紅。

### D2 · 通用延遲排程

⭐ **層 1 最划算的一根。** 引擎只有三個特例各解一半：
`leap.onLand`（起跳→落地）· `spawnProjectile.onHit`（飛行時間）· `onInterval` hook（固定節拍）。
缺一個「**N 秒後在某個世界座標跑這串 EffectDef**」的排程器。

它同時是【衝擊波的擴張圓環】【地面領域】【陷阱】【引導】共同的缺口 ——
**補這一根比補四個 kind 便宜**，而且延後名單裡的兩項之後會便宜很多。

**改動面**：**新檔** `sim/effects/scheduleEffects.ts` ·
`sim/SimWorld.ts`（新 store + step slot）· `sim/effects/effectRegistry.ts` ·
`content/schema/effect.ts` · `sim/clearPools.ts`（**第三個呼叫端：回合結束丟掉待爆清單**）

**守衛**（三條）：
1. **回合殘留**：一顆待爆的排程在跨過一次 enterCombat 之後必須不存在 ——
   突變：刪掉清除呼叫 → 下一回合開場憑空爆炸 → 紅。
   ⛔ 缺了它，GH#100 / #216「戰鬥沒真正結束」會原樣長回來。
2. **決定性順序**：同一 tick 的兩顆排程，用**不同插入順序**建出來的兩個世界，
   執行結果必須相同 —— 突變：把陣列 +（絕對 tick, seq）排序換成 Map 迭代 →
   誰先致死／誰拿擊殺賞金翻面 → 紅。
3. **施法者死亡**：`onCasterDeath` 的兩種設定必須真的不同 —— 突變：忽略該欄位 → 紅。

**⚠️ 風險**：⚠️ **絕對 tick，陣列不是 Map**。
⚠️ 施法者在延遲期間死了要不要照爆＝決策點（比照 `dot.onCasterDeath`，預設 continue）。

### D3 · 環繞衛星

缺一個**跟隨式的持續碰撞實體**。`summon` 放得出身體但不會繞著誰轉；
`spawnProjectile` 是直線一次性的。缺掛在宿主身上的軌道錨點 + 每 tick 接觸判定。

⚠️ **purity**：軌道角度不能用 `sin`/`cos`。做法是預先烘一組 `{cos,sin}` 步進量，
每 tick 做一次複數乘法 `(x·c − z·s, x·s + z·c)` —— 純算術、通過 purity、
而「一圈幾秒」仍然是後台一格自由數字。
⚠️ **烘的時候必須四捨五入到固定位數**（例如 6 位）：`Math.cos` 的最後一個位元
在不同 JS 引擎上**沒有 IEEE 保證**，而客戶端預測跑在另一個行程 ——
不定死就是一條「大部分時候對、偶爾錄影對不起來」的縫。

**守衛**（兩條）：
1. **真的跟著宿主走**：宿主移動 N 之後，衛星與宿主的距離必須不變 ——
   突變：把錨點寫成世界座標 → 距離變大 → 紅。
2. **決定性**：兩次獨立載入算出的軌道位置必須**逐位元相同** ——
   突變：把烘焙的四捨五入拿掉 → 最後一個位元不同 → 紅。

### D4 · 無敵（點不到）

⚠️ **見[九項③](#-無敵點不到要不要做影響-d4) —— 我建議延後。**
如果 owner 要做：`targeting.ts` ＋ 自動攻擊 ＋ 小怪 AI ＋ 投射物**四個子系統各一條守衛**，
每一條都要是「行為」不是「屬性」（例：自動索敵函式的**回傳名單**裡沒有它，
不是「它身上有 untargetable 旗標」）。
⚠️ **不要順手做成【隱身】**——「隱身出手就現形，無敵出手照樣點不到」。

### D5 · 投射物形狀

`content/schema/projectile.ts` 逐字只有 `{speed, maxRange, hitRadius, pierce?}`。
chain（彈跳）/ homing（追蹤）/ boomerang（回力）三個都不存在。

⭐ **它們是 projectile doc 的欄位，不是新的 effect kind** ——
補在那裡比補三個 kind 便宜得多，而且**所有用 `spawnProjectile` 的技能一起受惠**。

**守衛**（三條，每種形狀一條行為斷言）：
彈跳必須真的打到第二個目標（突變：把 chain 次數固定成 0 → 紅）·
追蹤必須在目標移動後仍然命中（突變：拿掉每 tick 重新導向 → 打空 → 紅）·
回力必須在回程也判定一次（突變：只在去程判定 → 紅）。
⚠️ **彈跳要有去重**（不可以在 A↔B 之間無限彈），而且上限是欄位不是常數。

### D6 · 標籤預設層

**為什麼**：owner 逐字「🔧 可組合 => 請組合 實作成完整標籤」。

**做法**：`content/effect-presets/*.json`，**在內容載入時（`sim/` 之外）展開成原語**。

| 選項 | 代價 | 後果 |
|---|---|---|
| **A 編輯期展開**（編輯器把原語寫進文件） | 0 | 改 preset 不會更新既有文件 |
| **B 載入期展開**（loader 展開，sim 只看到原語） | S | ⭐ sim 零改動、purity 零風險、**改 preset 全部文件跟著變** |
| **C 執行期解析**（新 `preset` kind） | M | 多一層 indirection，purity 與決定性都要重驗 |

**建議 B。** 編輯器上這 14 個是**一等公民的標籤**，展開後每一格參數仍可微調。

**十四個 preset**：破甲 · 破魔 · 破防 · 易傷 · 虛弱 · 凋零 · 燃燒 · 流血 · 中毒 ·
冷凍 · 石化 · 飢餓 · 處決 · 標記引爆（＋ 替身／牆／瞬移三個歸在同一份）

**守衛**（兩條）：
1. **展開真的發生**：一份只寫 `preset:"freeze"` 的技能文件，載入後的 `EffectDef` 陣列
   必須含 `applyStatus{stun}` 與 `applyStatus{moveSpeedMult}` **兩段** ——
   突變：展開器只吐第一段 → 紅。
2. **覆寫真的覆寫**：文件上寫的參數必須蓋掉 preset 的預設 ——
   突變：展開器忽略覆寫 → 紅。⛔ 斷言用測試自己傳的值。

---

## E 組 · owner 已核准的兩根結構

### E1 · 共用 `shape` 欄位

✅ owner：「**新 kind 一律帶 shape**」。

**這不是一個批次，是一條貫穿全計畫的硬約束。**
本計畫新增的每一個 effect kind 都必須帶 `shape: single | circle | line | cone`；
既有 `damage` / `damageArea` / `damageLine` **原封不動**（零文件改動）。

受影響的新 kind：`dispel`（A4）· `shieldBreak`（D1）· `scheduleEffects`（D2）· `orbitingBody`（D3）
→ 例：`dispel{shape:"circle", radius}` 就是**範圍淨化**，天生牙那一件直接用得上，
不用再發明第二個 kind。

**守衛**：任何沒有 `shape` 欄位的新 kind 必須讓 schema 測試變紅 ——
突變：把 `shape` 從某個新 kind 的 schema 拿掉 → 那條「新 kind 一律帶 shape」的清單測試 → 紅。
⛔ 這條測試要**從 kind 註冊表推導清單**，不要手抄一份名字（手抄的會漏掉下一個新 kind）。

### E2 · wire 頻道

✅ owner：「**yes**」—— 單向門已獲授權。

**三條硬規則**（見[裁決⑧](#-裁決yes-a開頻道單向門已獲授權)）：
一次追加 · 追加的是欄位不是位元 · 守衛必須是配對式的。

⛔ **排程上它必須是最後一批。** A/B/C/D 全部確定要上線哪些欄位之後，
列成一張表、一次 `defineTypes` append。
**先做它＝保證會有第二次追加**，而第二次追加就是這條規則要防的事。

**候選欄位清單**（隨各批進度累積，出貨前定案）：

| 欄位 | 來自 | 為什麼要上線 |
|---|---|---|
| `markIds`（或借 statusIds 的敵方視角） | [C5 標記](#c5--標記) | 頭上的記號要**別人**看得到才有意義 |
| `visibleStatusIds` | 破甲光環 / 冰凍外觀 | 今天 `statusIds` **逐座位只送自己的** |
| `sizeScale` | 稜彩卡批 12（體型） | `bodyScale` 今天根本不在 wire 上 |

⚠️ 前兩格有機會**不用新欄位**：`statusIds` + `statusRemainTicks` 已經在線上，
問題只是「只送自己的」。**先確認擴大送出範圍的頻寬代價**，
能走既有欄位就不要花掉單向門的額度。

---

## F1 · 三件道具上架 + 49 支盤點

✅ owner：「**各補一行，應該要上架**」+「跟我說上次通過的 49 個武器道具還有哪些沒上架」。

### 描述補一行（owner 授權，只補這一行，其餘一字不動）

| 道具 | 補的那一行 |
|---|---|
| 朗基努斯之槍 `godie-i018` | `[淨化] On-Hit 機率移除目標身上的增益` |
| 仙后座 `godie-i01s` | `[淨化] 每 1 秒移除自己身上的一個減益` |
| 天生牙 `godie-i031` | `[淨化] 每 10 秒移除周圍隊友身上的減益` |

⚠️ **這是唯一一次授權改 owner 親筆描述**，而且只加這一行。
⛔ 之後不可以引用這次當前例去改其他描述。

### 上架檢查清單

> 由 [ggd-item-shelf-audit 工作流](#) 的盤點結果填入 —— 見下一節。

### 49 支傳說武器的上架盤點

> **這一節由盤點工作流的結果填入。**
> `docs/_legendary-49-status.md`（自動產生）宣稱 49/49 都在抽獎池與白名單裡，
> ⚠️ 但「在白名單裡」與「玩家一場看得到幾支」是兩件事 —— 那份報告沒有回答第二個問題，
> 而 owner 問的很可能是第二個。盤點完再寫，**不要照抄那份報告**（第三守則）。

---

## 決策點清單

> `CLAUDE.md` 第一守則：**實作時心裡出現「A 還是 B」的每一個地方，都該是後台的一個欄位。**
> ⛔ 不要在註解裡辯護你選了哪一個。

### A1（火圈）
- **1-1**～**1-6** 六格互動開關 —— 見[九項①](#-火圈進佇列之後它要被哪些東西看見影響-a1)的表，
  建議值：`firesHooks` 開 · `respectsInvulnerable` 開 · `respectsShields` 關 ·
  `respectsCombatEnvMult` 關 · `canBeReflected` 關 · `respectsDamageTakenMult` 開

### A2（事件佇列）
- **2-1 `fireOnBulkGrant`** —— `grantLevels(40)` 要發 40 次還是 1 次。**預設逐級發**，
  但**這一格必須存在**（回合結束的整包發放會在一瞬間爆 50 次）。
- **2-2 進入戰鬥怎麼算** —— checkbox `{damageDealt, damageTaken, basicAttackSwung, abilityCast}`。
  **預設只勾前兩個**（可觀測、不會被空揮刷）。
- **2-3 脫戰秒數** —— 預設 5。
- **2-4 殭屍算不算「進入戰鬥」** —— **預設不認**（認了會讓「進戰鬥時」的卡在殭屍潮裡常駐刷新）。
- **2-5 什麼算「硬控」** —— checkbox `{stun, root, knockback, knockup, taunt}`，
  **預設勾 stun + root + knockback**。⛔ 減速刻意不算（`applyStatus.ts:15` 的 `isCc` 含減速，
  **不可以直接借用**）。⛔ 「壓制」owner 已裁決不做。

### A3（殭屍）
- **3-1 StatsComp 建立時機** —— A＝spawn 時全建／B＝**惰性（第一次 attach 才建）**。**預設 B。**
- **3-2 A3c 做不做** —— 見[九項②](#-殭屍-statscomp-分三段每一段的代價差一個數量級影響-a3)。**預設不做。**

### A4（淨化）
- **4-1 拔哪些池** —— status / dot / buff / shield 四個獨立開關。「拔盾」特別強，建議單獨控制。
- **4-2 `dispellable` 的預設值** —— 建議 **status/dot 預設 true、buff 預設 false**，逐份可覆寫。
- **4-3 `polarity`** —— ⛔ **必須在施加時就寫死，不能靠推導**。
- **4-4 只拔一部分時拔誰** —— newest / oldest / longest / shortest。⛔ **必填或有明確預設**
  （沒有這一格就是靠陣列順序，直接違反 purity 的「Map 迭代要先排序」）。
- **4-5 免疫擋不擋得住被驅散** —— **預設不擋**（驅散不是控場）。
- **4-6 疊層的燃燒是全拔還是拔一層** —— 欄位 `dotStackMode`。
- **4-7 三件道具的機率／秒數／半徑／個數** —— 全部是欄位，**一個都不寫死**。

### A6（重創）
- **6-1 三格倍率** —— ✅ owner 裁決：`lifesteal 0.5 / healingTaken 0.5 / **regen 0.5**`。
- **6-2 殭屍的自然回復要不要一起打折**（`MobSystem.ts:212` 是第四條路）—— **預設打**。
- **6-3 多來源相乘還是取 max** —— **預設取 max**（跟最接近的鄰居 `missChance` 一致）。

### B3（葉子）
- **3-1 `oncePerRound` 的「回合」邊界** —— A＝enterCombat（下回合開打）／
  B＝回合判定結束（進商店）。中間隔著整段商店。**預設 B。**
- **3-2 空間葉子的半徑上界** —— 沿用 `zAuraDef.radius` 的 40，**不要開第二套。**
- **3-3 `nearbyCount` 算不算殭屍** —— ⭐ 與 `augmentEnemyFilter.mobsCountAsEnemy`
  **綁在同一個設定區塊**，不要開第二個「殭屍算不算敵人」的答案。

### C6（韌性）
- **6-1 韌性擋不擋得住嘲諷** —— 嘲諷已經有自己的 `durationMult`。
  **預設兩者相乘**，並在說明文字寫清楚。

### D2（排程）
- **2-1 施法者在延遲期間死了要不要照爆** —— 比照 `dot.onCasterDeath`，**預設 continue**。
- **2-2 回合結束時待爆的清單** —— ⛔ **必須丟掉，這一格不做成欄位**
  （做成欄位等於把 #216「戰鬥沒真正結束」留成一個選項）。

### D5（投射物）
- **5-1 彈跳次數上界與去重規則** —— 欄位，不是常數。
- **5-2 追蹤的轉向速率** —— 欄位（0 ＝ 完美追蹤）。

### D6（preset）
- **6-1 展開時機** —— A 編輯期／**B 載入期（建議）**／C 執行期。

---

## 與 17 張稜彩卡計畫的對照

v1 詞彙表第二部的 12 批仍然有效，只是**其中三批就是本計畫的批次**，不要做兩次：

| v1 稜彩批 | 本計畫 | 說明 |
|---|---|---|
| 批 1 · Hook 詞彙加寬 | — | ✅ **已出貨 v0.9.35**（`c61ef6cd`） |
| 批 5 · 泛化 pending-hook 佇列 | **[A2](#a2--泛化-pending-hook-佇列--onlevelup)** | **同一批工作**，本計畫的範圍更大（含 onDeath / onRevive） |
| 批 10 · 兩顆條件葉子 | **[B3](#b3--謂詞葉子補完)** 的兩顆 | ⛔ **`INTERVAL_BUDGET_CONDITION_KINDS` 的交接在這裡兌現** |
| 批 11 · 淨化／驅散 | **[A4](#a4--淨化驅散)** | **同一批工作** |
| 批 7 · scheduleEffects | **[D2](#d2--通用延遲排程)** | **同一批工作**（批 7 的 `dot.onTick` 那一半不在本計畫，仍屬稜彩卡） |
| 批 2 / 3 / 4 / 6 / 8 / 9 / 12 | — | 純屬稜彩卡，本計畫不碰 |

⚠️ **批 2（堆層家族收斂）抽出的 `clearPools` 是 A4 的前置** ——
如果 A4 先做，就由 A4 抽出，批 2 改成使用者。**不要各抽一份。**

---

## 出貨守則

每一批交付前逐條對：

- [ ] `pnpm typecheck; echo "EXIT=$?"` ⚠️ 看離開碼，`| grep error` 結構上永遠不會 match
- [ ] `pnpm test` ⚠️ 丟背景跑時**自己讀 log 尾巴**，通知說的 exit 0 是包裝命令的
- [ ] ⭐ **新 effect kind 一律帶 `shape`**（owner 裁決⑦）—— 沒有就不可合併
- [ ] ⭐ **沒有偷加 wire 欄位**（owner 裁決⑧：一次追加，E2 統一做）
- [ ] 每一條新守衛都做過**突變驗證**（改壞 → 確認紅 → 改回），突變寫進 commit message
- [ ] ⛔ **斷言不含任何出貨數值** —— 從 `SHIPPED_*` / `DEFAULT_*` / 測試自建的 def 推導
- [ ] 新欄位落在三個地方：`content/config/*.json` + Zod（**上下界都要**）+ `apps/admin`
      （union / 順序 / 標籤 / 分組 / `configFromForm`）
- [ ] 改了 `content/` → `pnpm content:build`，**產物與來源檔都 commit**
- [ ] [`docs/效果標籤詞彙表v2.md`](效果標籤詞彙表v2.md) **在同一個 PR 裡更新**
      （🔨 改成 ✅、殭屍欄改記號）—— ⛔ 不要事後補，那正是 v1 過期的方式
- [ ] `gh issue` 有對應項目、`git push` 帶 GitHub release note

⛔ **體驗層只要一條薄守衛，不開對抗輪。**
深挖只留給靈魂層 —— 本計畫裡那是 A1 / A3 / A4 / B2 / B4 / D2。

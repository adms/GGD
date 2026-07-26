# 上一回合戰報 — 中場商店右側的 S~D 評價 + 改善建議 — TODO

Task **#265** (owner's #232). 原話：

> 每回合進商店：右側顯示 S~D 評價 + 改善建議

以及同一輪一起收掉的 #252：

> 三選一卡片沒有無障礙名稱 —— 手把焦點停上去沒東西可念

## 為什麼要寫這份文件

這個功能最容易做出來的版本是「一張永遠給 A 的卡片，配三句每回合都一樣的萬用建議」。
那種東西玩家看兩次就不看了，而且它會製造第二把尺 —— 商店說 B、結算說 A，沒有人能重建
原因。所以下面每一條都是在講**怎麼避免那個結果**，而不是在講怎麼把面板畫出來。

## 一句話結論

**同一把尺，不同的時間窗。** 字母是 #25 `sim/stats/rating.ts` 十二階梯（`GRADE_CUTS`）
折疊出來的，卡片上同時印出折疊前的那一階（「對應結算階梯 A-」），所以兩張畫面在螢幕上
就看得出是同一套刻度。權重不同，而且卡片明講它只看了什麼。

## 檔案

| 關注點 | 檔案 |
| --- | --- |
| 評價 + 建議（純函式，全部可餵資料） | `apps/client/src/ui/panels/roundReport.ts` |
| 版面（純幾何，可對每個視窗尺寸斷言） | `apps/client/src/ui/panels/roundReportLayout.ts` |
| JSX 外殼（掛在 MerchantShop 的兄弟位） | `apps/client/src/ui/panels/RoundReportCard.tsx` |
| 三選一無障礙名稱的 id / 標籤 | `apps/client/src/ui/panels/draftA11y.ts` |
| 三選一面板本體（role=dialog + aria-labelledby） | `apps/client/src/ui/panels/AugmentDraftPanel.tsx` |
| 沿用的十二階梯 | `packages/shared/src/sim/stats/rating.ts`（**未修改**） |

## S~D 是怎麼來的（不是第二套評分）

```
composite ──gradeFromScore()──▶ S+ S S- A+ A A- B+ B B- C+ C C-   ← #25 的階梯，原封不動
                                 └─ foldGrade() ─▶  S   A   B  C C  D
```

- `D` **就是** `C-` 那一格，只是在回合卡上換個名字。`ROUND_D_CEILING` 直接讀
  `GRADE_CUTS[GRADES.indexOf("C")]`，所以 #25 之後重調刻度，這張卡跟著動，或測試變紅。
- 卡片同時印 `A` 和「對應結算階梯 A-」，兩把刻度在螢幕上就是同一把。

## 權重為什麼不一樣（而這不是自相矛盾）

`rating.compositeScore()` 在這裡**呼叫不了**，理由是系統的性質，不是偷懶：

1. **它的輸入不存在於回合尺度。** `PlayerMatchStats`（傷害/承傷/命中/存活 ticks…）只活在
   server 的 SimWorld，而且是**從英雄生成起累積、從不按回合歸零**——系統裡根本沒有
   「這一回合的傷害」這個數字。它一輩子只在 `matchSettlement` 出現一次。
2. **它一半的權重是 lobby percentile。** `0.5·roleScore + 0.5·percentile`，單人 lobby 的
   percentile 恆為 1.0 → 保底 B+。12 個 seat 的 per-round 數據不在線上，沒有 lobby 可比。

真正權威、per-round 的只有四件事：`SeatState.roundKills` / `roundDeaths`（#173，每次進戰鬥
歸零）、`seat.alive`、`TeamState.roundOutcome`。所以回合權重是
`win 0.22 / frag 0.46 / surv 0.32`，而且卡片上明寫「只計 勝負·擊殺·陣亡·存活」。

**要做到真正等價，需要跨工作流的 server 改動**：在 `MatchController.concludeCombat()` 對
`world.matchStats` 做 per-round diff，連同 12 個 seat 一起送出 `roundSettlement`，client 就能
原封不動呼叫 `grade()` / `reflectionHints()`。那是 game-server + shared/protocol 的事，不在這
一輪的領域界線內 —— **列在這裡當作已知的下一步，不是當作藉口**。

## 建議為什麼不會變廢話

`settlementModel.reflectionHints()` 十條判準有九條讀 client 沒有的欄位，而且門檻全是整場
尺度（`deaths >= 6`、`damageDealt >= 12000`），一個 ≤90 秒的回合到不了 —— 直接沿用會 90%
落到「全面發揮，繼續保持這個節奏」。那正是要避免的東西。

所以規則改成：**每一條建議都帶 `evidence`（`field=value`），而且測試會檢查「建議文字裡出現
的每一個數字，都必須在 evidence 裡有出處」**。寫不出數字就寫不出建議；沒有建議時卡片就只
顯示數據列，不硬擠。

## 資料不足是一種狀態，不是 C

| 情況 | 判準 | 顯示 |
| --- | --- | --- |
| 第一場還沒打 | `round <= 1`（champSelect→round=1→intermission） | 「第一場還沒開打」 |
| 輪空 | `roundOutcome === NONE` | 「第 N 回合輪空 —— 沒有上場，不評分」 |
| 沒有英雄 | `localMaxHp === 0` | 「還沒有英雄」 |
| 戰鬥中（陣亡玩家仍在逛商店） | `phase !== "intermission"` | 不顯示（回合還沒結束） |

輪空那一列是 #173 修過的同一個坑：bye 隊被 `enterCombat` 停在死亡狀態**且不發任何 death
事件**，所以 `alive:false / roundKills:0 / roundDeaths:0` 和「被瞬間團滅」逐位元組相同，只有
`roundOutcome` 分得出來。

## 版面：右側不是空的

右半已經被佔滿（英雄 3D 模型 ~67% 寬、商人提示框、英雄反應泡泡、Ready、倒數、#107 角落
堆疊；而且商店靠左時 ☰ 會**重新歸位到右上角**，讓那一欄比任何其他階段都高）。

卡片用的是 **minimap 保留帶** —— `ui/hud/Minimap.tsx` 在 intermission **不繪製**，所以整個
商店期間右欄中間有一條 208px 的洞。這是跨檔案假設，所以用跨檔案的方式守：測試會**讀**
`Minimap.tsx`，那個 `phase !== "intermission"` 條件消失就變紅。

手機橫向（844×390）右緣沒有洞（觸控時 minimap 跑去左上、裝備欄跑去右上），所以改成
**inset**：貼在商店卡右邊、**HP/MP 條下方**、版本徽章帶上方那一條。

「HP/MP 條下方」是實測改出來的：第一版停在「Ready 下方」，844×390 的實拍截圖顯示它直接
壓在玩家自己的血條上 —— 中央欄由下往上是 HP/MP 條（`bottom:128`）、Ready（190）、倒數
（262），**血條才是最低的那一個**。`ResourceBars` 不是 `hudLayout` 的角落 slot（它跟技能列
一樣是置中 chrome），角落機制看不到它，所以它的幾何被鏡像進 `roundReportLayout.RESOURCE_BARS`
並列進 `avoidPainted()` 的障礙集。

375px 寬的**直向**視窗（同時也是「請轉橫」提示的場合）左有商店卡、右有角落堆疊、中間橫著
自己的血條，**沒有任何誠實的位置**，所以 `roundReportPlacement().visible` 回 false，卡片
整張不畫 —— 一條 4px 的殘片比不畫更糟。測試同時斷言「每個橫向視窗都畫得出來」，所以
「到處都不畫」不是一個能過關的答案。

卡片**不覆蓋任何 #107 角落**（測試用 `hudCornerAnchor` 斷言），所以不需要在 `hudLayout.ts`
的 `PANELS` 加一列，也不需要任何 chrome 讓位。

## 三選一無障礙名稱（#252）

改動前那三張卡並不是字面上「唸不出東西」—— 瀏覽器仍會用 name-from-contents 把兩個沒有
標籤的 `<div>` 串起來。真正壞掉的是：

1. 面板**完全沒有任何 aria 屬性**：`role="dialog"` / `aria-modal` / 標籤都沒有，開起來（還蓋
   著一層 scrim）什麼都不宣告。
2. 名稱是**意外**而不是宣告：圖示是 `aria-hidden`（GlyphTile），名稱和描述是兩個裸 div，
   之間沒有宣告過的分隔，任何人往卡片裡加一個徽章或價格 chip 都會默默改變被唸出來的字串。
3. 翻牌期整張卡 `opacity: 0` + `pointerEvents: none`，而 `PadFocusNav.isVisible()` 明確拒絕
   `opacity === 0` → **那段時間手把根本 focus 不到任何一張卡**（augment 最後一張 560ms、
   legendary 1260ms）。

1 和 2 修掉了：`aria-labelledby` 指向卡片**已經畫出來的**名稱與效果節點（不重寫一份，才不會
漂移），面板成為有標籤的 modal dialog。3 **沒有改**：翻牌期不可 focus 是刻意的（那時卡片也
不可點），把它變成可 focus 會讓手把選到看不見的牌。這一點記在下面的 pending 列。

### 為什麼還是多了一個 `aria-label`

實測（2026-07-26，把控制組探針直接注進活的頁面）發現**本專案自己的瀏覽器無障礙快照
（`read_page`）既不解析 `aria-labelledby`、也不跨巢狀 div 做 name-from-contents**：

| 探針 | 快照讀到 |
| --- | --- |
| `<button aria-labelledby="#外部節點">X</button>` | `"X"`（labelledby 被忽略） |
| `<button><div>名稱</div><div>描述</div></button>` | `""`（不走內容） |
| `<button aria-label="…">…</button>` | 讀到 label |

也就是說，只掛 `aria-labelledby` 的卡片在那份快照裡仍然是「無名按鈕」——和這個 bug 本身
分不出來。所以卡片**同時**掛一個扁平的 `aria-label`，值由 `draftCardFallbackLabel(name,
cardDesc)` 從 **JSX 正在渲染的同兩個變數**算出來：依 accname，`aria-labelledby` 優先，真正
的螢幕閱讀器永遠唸不到這個 fallback；它只服務那些不實作 labelledby 的讀取器。這**不是**第
二份文字（同一個運算式，無從漂移），而測試 `rr-16` 會斷言兩者字面相同。

守衛是**掃描式**的：`draftA11y.test.ts` 把這個 modal 家族的每一種 tier 各渲染一份，找出**每一個
可聚焦元素**（可聚焦的定義是從 `ui/PadFocusNav.tsx` 讀出來的，不是在測試裡重打一遍），算出
它的 accessible name，任何一個沒有名稱、或名稱只是 name-from-contents 撿來的，就紅。下個月
新增第五種三選一也會被抓到。

## Checklist

| id | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| rr-01 | S~D 是 #25 十二階梯的折疊：12 階全部有對應、單調、且 D 帶 == `GRADE_CUTS` 的 C- 帶（直接讀表，不重打） | round-report-ladder | unit | done |
| rr-02 | 回合 composite 真的散得開：七個典型回合分別落在 S/A/B/C/D，沒有塌成一格；權重總和為 1 且 frag 最重、win 最輕 | round-report-spread | unit | done |
| rr-03 | 卡片同時印出折疊前的十二階梯值，且它等於 `gradeFromScore(score)` —— 兩張畫面在螢幕上是同一把尺 | round-report-same-ruler | unit | done |
| rr-04 | 每一條建議都有出處：建議文字裡出現的每一個數字都必須在 `evidence` 的 `field=value` 裡；對每一個能觸發建議的分支都檢查 | round-report-evidence | regression | done |
| rr-05 | 建議不硬擠：沒有依據時回空陣列（卡片改顯示一句「這回合打得很穩」），且永不超過 3 條、不重複 | round-report-no-filler | unit | done |
| rr-06 | 資料不足不給字母：第一回合 / 輪空(`ROUND_OUTCOME.NONE`) / 沒有英雄 → 有狀態與理由、`grade` 為 null；同一份 seat 狀態改成 LOST 就會評分（證明判準是 outcome 而非其他欄位）| round-report-insufficient | exception | done |
| rr-07 | 標題是 `round - 1`：中場的 `round` 是「即將打的」那一回合，所以卡片講的是上一回合 | round-report-round-number | unit | done |
| rr-08 | 只在 intermission 顯示 —— 戰鬥中（陣亡玩家仍在逛商店）那些 tally 是進行中的計數，不是結果 | round-report-phase | unit | done |
| rr-09 | 數據列只有計數／貨幣／列舉值，沒有任何衍生戰鬥量值 —— #125 的「顯示乘過倍率的最終值」在這張卡上無從違反 | round-report-raw-counters | regression | done |
| rr-10 | 版面：在 #107 的整組視窗 × 兩種指標下，卡片**不含任何角落錨點**（所以不需要 panel registry 列，也不需要任何 chrome 讓位） | round-report-clears-corners | regression | done |
| rr-11 | 版面：永不進入版本徽章保留帶、永不蓋到 Ready up 或備戰倒數、永不蓋到商店卡 | round-report-clears-chrome | regression | done |
| rr-12 | 版面：永不蓋到中場真的會畫出來的右欄 chrome —— 含被商店擠去右上角的 ☰、金幣/等級、裝備欄、記分板 | round-report-clears-right-column | regression | done |
| rr-13 | 版面：桌機貼右緣（就是 minimap 的保留帶），手機橫向改 inset；且邊緣卡一定在英雄（~67% 寬）右邊 | round-report-dock | unit | done |
| rr-14 | GUARD：借來的那條帶真的是空的 —— **讀** `ui/hud/Minimap.tsx`，`phase !== "intermission"` 消失就紅；商店卡寬度鏡像也對著 `MerchantShop.tsx` 掃 | round-report-borrowed-band | regression | done |
| rr-15 | 三選一：掃描整個 modal 家族（silver/gold/prismatic/weapon）的**每一個可聚焦元素**，任何一個沒有 accessible name 就紅；可聚焦的定義從 `PadFocusNav.tsx` 讀出來 | draft-a11y-scan | regression | done |
| rr-16 | 三選一：名稱是**宣告**的（aria-label / aria-labelledby），不是 name-from-contents 撿來的 —— 這條在改動前的 markup 上會紅 | draft-a11y-explicit | regression | done |
| rr-17 | 三選一：唸出來的是 增益名稱 + 效果摘要，指向卡片已經畫出來的節點，且兩個 id 都解得到（懸空的 aria-labelledby = 空名稱） | draft-a11y-name-order | unit | done |
| rr-18 | 三選一：`aria-hidden` 的 GlyphTile 不進入名稱；面板本身是有標籤的 `role="dialog"` `aria-modal`；id 對 server 給的任意 offerId 也安全 | draft-a11y-dialog | unit | done |
| rr-19 | 翻牌期（augment 最後一張 560ms、legendary 1260ms）卡片 `opacity:0`，`PadFocusNav.isVisible()` 因此拒絕 focus —— 目前是刻意的（那時也不可點），但手把玩家在那段時間沒有任何可停留的目標，需要 owner 決定要不要給一個「跳過翻牌」或先 focus 面板本身 | draft-a11y-reveal-focus | integration | pending |
| rr-20 | 真的 per-round 統計：`concludeCombat` 對 `world.matchStats` 做 diff → `roundSettlement` 事件 → client 直接呼叫 `grade()` / `reflectionHints()`，讓回合卡與結算卡用同一個函式而不只是同一個階梯 | round-report-server-stats | integration | pending |
| rr-21 | 隊伍被淘汰後商店不掛載，戰報也跟著消失（`shopGate(...).mounted === false`）—— 觀戰者看不到自己最後一回合的戰報，要不要留待 owner 決定 | round-report-eliminated | integration | pending |

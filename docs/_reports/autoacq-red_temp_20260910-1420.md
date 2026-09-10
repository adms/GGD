# `autoAcquireWhileMoving.test.ts` 三條 STICK 紅 —— **前提消失**，⛔ 不是回歸

日期 2026-09-10 · lane `worktree-agent-acc6b99909607f831`

---

## ⓪ 先更正一個前提：**HEAD~1 不是那個 HEAD**

派工說「HEAD~1 上就已經是紅的 ⇒ ⛔ 不是最近這幾批 round11 改動造成的」。
⭐ 前半是對的，⛔ 後半的推論不成立 —— `main~1`（`5a7eef3c4`）**自己就是一顆 round11 commit**，
所以「HEAD~1 也紅」只排除掉**最後一顆**，⛔ 沒有排除 round11 這一批。

⚠️ 而這條 lane 的 worktree 開在 `4d1d054c3`，**比 `main`（`896f65070`）落後 45 顆**。
⭐ 在 `4d1d054c3` 上這三條是**綠的**（9/9，連跑三次逐位元組相同）。
⇒ ⭐ 真正的 bisect 區間是 `4d1d054c3..main` 這 45 顆，⛔ 不是「更早就紅了」。

⚠️ 另一個絆索：**這個 worktree 沒有 `node_modules`** ⇒ 第一次跑得到的是
`Failed to load url @ggd/shared/sim/combatEnv`（`Tests no tests`），⛔ 而那與這三條無關。
先 `pnpm install --frozen-lockfile`（區間內 lockfile 零改動，⭐ 一次裝好整段都能跑）。

---

## ① 從哪一顆開始紅

```
34f361d1e  fix(templates): 🔑 **第六個**「拿檔名前綴當身分」的缺陷
           —— 6 支治療技能被要求填傷害級距（GH#1165）
```

⭐ **bisect 跑了兩次，第一次的結論是錯的** —— 值得記下來：

| | 第一次 | 第二次（正確） |
|---|---|---|
| predicate | 整個檔的離開碼 | ⭐ `-t "STICK HELD"`（只命中這三條） |
| 不可判定的 commit | 當成 **bad** | ⭐ **skip（125）** |
| 結論 | `4058d8166` ⛔ **假的** | `34f361d1e` |

⛔ 第一次為什麼假：`4058d8166` / `76ba87160` 兩顆的 `content/_index.json` 指向
**還沒被加進來的** champion 檔 ⇒ `ContentLoadError: 62 error(s)` ⇒ 整個檔載不起來。
⭐ 那是「**一個永遠不會綠的閘**」（CLAUDE.md 第二守則⑨）的形狀：紅得很大聲，
⛔ 而它指的是別的東西。**不可判定 ≠ bad。**

---

## ② 回歸還是前提消失 —— ⭐ **前提消失**，而證據是結構性的

### 證據 A：那一顆 commit **零行執行期程式**

`34f361d1e` 動了 **347 個檔**，其中 `.ts/.tsx` 只有 **5 個**，而且**全部**在
`tools/`（3）與 `docs/legacy/_overwrites/`（2）——
⭐ **`packages/shared/src/sim/` 與 `apps/game-server/src/` 一行都沒有。**

⇒ ⭐ 這三條測試名字所指的機制 `OrderSystem.ts::autoAcquirePass` 的 `case "move"`
（#274 拿掉的那個 `if (nav.moveTarget !== null) continue`）**一個位元組都沒動過**。
⛔ 一個程式沒變的東西，不可能「回歸」。

### 證據 B：真正的行為改動是**內容**

| 欄位 | 改了幾行 |
|---|---:|
| ⭐ `castTimeSec` | **715** |
| `provenance` / `hash` / `size`（產物戳記） | 1,334 |
| `description` | 24 |

`castTimeSec` 從**一律 `0.1`** 正規化成真值（`0.667` / `0.067` / `0.467` …），
橫跨 **223 支技能**。⇒ 12 個座位的出手節奏全變 ⇒ **這一場打起來不一樣了**。

### 證據 C：機制那幾格**全部仍然是綠的**，紅的只有量值門檻

| | ticks | alive | authority | autoHeldUnderMove | hijacked | hits |
|---|---:|---:|---:|---:|---|---:|
| `0f00d717c`（前一顆，綠） | 550 | **550** | **549** | 469 | 0 | 8 |
| `34f361d1e`（第一顆紅） | 710 | **342** | **337** | **255** | **0** | 4 |

⇒ ⭐ **唯一的差別是玩家改成死在第 342 tick。**
`autoHeldUnderMove > 0` ✅ · `hijacked === 0` ✅ · `hits > 0` ✅ · `heldTicks > 0` ✅
—— ⭐ 名字裡的機制一格都沒壞。

⇒ ⭐ 這就是 CLAUDE.md 第二守則⑩ 的**第二個實例**：
**守衛是靠一個前提才綠的，而前提消失時看起來就是回歸。**
（前例：`facingLock.test.ts` 的 `moveSpeedMult:0.02` 鑽過 `walkEps²`。）
⚠️ 差別在於這一次那個前提是「**比賽夠長**」—— 餘裕只有 **49 tick ＝ 1.6 秒**。

---

## ③ 修的是測試 —— ⭐ 逐條說明「那個舊斷言為什麼本來就是錯的」

⛔ **兩處都不是放寬。**

### 紅① `autoHeldUnderMoveTicks / heldTicks > 0.5` → 實測 0.41

⭐ **分子與分母的閘不一樣，這個比值從第一天起就寫錯了。**

| | 閘 |
|---|---|
| 分子 `autoHeldUnderMoveTicks` | 活著 ＋ `combatActive` ＋ 活的 move 指令 ＋ 握著目標（**四個**） |
| 分母 `heldTicks` | ⛔ **一個都沒有** —— 連 champion **死掉之後** `nav.attackTarget` 上留著的舊值都算 |

量到的算術（⛔ 不是推論）：`held=622` · `aliveTicks=342` · `ticks=710`
⇒ ⭐ **至少 622−342 ＝ 280 個「握著目標」的 tick，champion 根本不是活的。**
⇒ 這個比值在這一場的**數學上限是 `342/622 = 0.55`** ——
⭐ 只要玩家死在半場之前，`> 0.5` 就**不可能滿足**，⛔ 而索敵有沒有被關掉跟它無關。

**修法**：分母換成同閘的 `heldWhileSteerableTicks`（活著 ＋ `combatActive` ＋ 握著目標）。
⇒ 實測 **255/255 ＝ 1.000** —— ⭐ 正好就是那行註解自己寫的意圖
（「握著目標」與「移動指令在跑」**幾乎完全重疊**）。
⚠️ ⛔ 沒有動 `heldTicks`：`heldTicks > 0` 問的是「索敵**到底有沒有發生過**」，它就該無閘。

### 紅②③ `authorityTicks > 500` → 實測 337

⭐ **這個 500 量錯了東西。** `authorityTicks` 的閘是「活著 ＋ `combatActive` ＋ 活的 move 指令」
⇒ 它的上界是**這一場玩家活多久**，而那取決於另外 11 個 bot 抽到哪些英雄與施法時間 ——
⛔ 與這條斷言宣稱要驗的「harness 有沒有在餵指令」**毫無關係**。
⇒ 500 釘住的是**一場特定長度的比賽**。

**修法**：`expectHarnessIsDriving(r)` —— 一個**會跟著比賽變**的比值：
`authorityTicks / steerableTicks > 0.9`（＋ `steerableTicks > 100` 擋「這場沒打起來」）。
實測 337/342 ＝ **0.985**（前一顆是 549/550 ＝ 0.998）。

⭐ **它比 `> 500` 更嚴**：一場很長的比賽裡 harness 餵到一半停掉，
舊寫法照樣綠（500 早就過了），⛔ 而這一條會紅。

---

## ④ 突變驗證（⛔ 不是「看起來會紅」）

把 `OrderSystem.ts::autoAcquirePass` 的 `case "move"` 改回 #274 之前的
`if (nav.moveTarget !== null) continue;`（用 `scripts/edit-or-die.py`，⭐ 對不上就 exit 2）：

```
[stick] hits=0/0  held=0/818  steerable=547  heldWhileSteerable=0  autoHeldUnderMove=0  hijacked=0/542
Tests  2 failed | 1 passed
AssertionError: 一個活的 `move` 指令底下**一 tick 都沒有**握住索敵目標 …（#274 的回歸）
AssertionError: no hits means no hitstop means this test is vacuous
```

⭐ **兩個一起要注意的**：
1. 整條索敵消失 ⇒ 守衛紅，而且訊息指名 #274。**改對了地方。**
2. ⭐ `expectHarnessIsDriving` 在突變下**仍然綠**（542/547 ＝ 0.99）——
   ⭐ 它量的是 harness，⛔ 不是打鬥 ⇒ **它不會遮住這個回歸**。
   ⚠️ 而舊的 `> 500` 在突變下**也會綠**（542 > 500）⇒ 兩者在這一點上等價，
   ⭐ 替換沒有掉任何涵蓋。

已用 `edit-or-die.py` 反向還原，工作樹只剩測試檔一個。

---

## ⑤ ⚠️ 下一個會紅的：**`hits > 0`**（⛔ 這一輪沒有動它）

`hits` 在這 45 顆裡量到 **8 → 1 → 7 → 4**。
⭐ 而 `clickOutside` 與 `obstacle` 兩個 feed **早就因為完全相同的理由**
把它降級成 `console.warn` 了（GH#878 · 2026-09-05，就寫在同一個檔裡）。

⛔ 這一輪**沒有碰它** —— 它今天是綠的，而「⛔ 不要為了讓它綠而放寬斷言」
在反方向同樣成立：**⛔ 也不要去放寬一條沒有紅的**。
⭐ 它掉到 0 的那一天，正解是套用檔案裡那兩條已經寫好的結論，⛔ 不是去改索敵。

---

## ⑥ 動到的檔

| 檔 | 改了什麼 |
|---|---|
| `apps/game-server/src/match/autoAcquireWhileMoving.test.ts` | ＋2 個同閘分母 · 2 條斷言換掉 · 檔頭棘輪紀錄 |

⛔ 零行執行期程式。`packages/shared/src/sim/` 只在突變期間動過並已還原。

## ⑦ 收尾狀態

| | |
|---|---|
| 這一支 | **9 passed (9)**，離開碼 0（在 `main` tip `896f65070` 上） |
| `pnpm typecheck` | 離開碼 **0** |
| vitest 跑了幾次 | **3**（① 修完驗證 ② 突變 ③ bisect 期間的 predicate 不計入手動額度） |

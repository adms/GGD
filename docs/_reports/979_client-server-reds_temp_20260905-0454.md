# GH#979 lane —— `apps/client` / `apps/game-server` 的紅

量測基準：`main` @ `51b2baa42`，2026-09-05 04:47–04:54。
一次撈全部：`npx vitest run <六支>` ⇒ `EXIT=1`（`/private/tmp/b1.log`）。

---

## 0. 結論表

| 測試 | 結果 | 根因（一句話） | 我做了什麼 |
|---|---|---|---|
| `apps/game-server/src/config/contentBus.test.ts` | ⭐ **已綠**（15/15） | 開票時的清單過期了 —— 它在 `51b2baa42` 上本來就是綠的 | 無 |
| `apps/client/src/render/selfMarker.test.ts` | ⭐ **已綠**（7/7） | 同上 | 無 |
| `apps/game-server/src/replay/digestCoverage.test.ts` | ⭐ **修好了**（2/2） | `SimWorld` 新增兩格（`oneShotClamp` / `seatDisadvantage`）沒有被分類 —— **基準線該跟著新欄位更新** | 補兩列豁免 **＋ 各寫一段能被反駁的理由** |
| `apps/client/src/render/modelLod.shipped.test.ts` | ⛔ **仍紅**（1） | ⭐ **產物過期**：`35b231ef3` 改了 **69 顆 glb** 而**沒有重跑 `gen_lod.py`** ⇒ `content/assets/models/_lod.json` 的 16 列位元組數在說謊 | ⛔ 沒動 —— 修法在 `content/`（柵欄外） |
| `apps/client/src/vfx/VfxSystem.authoringOverride.test.ts` | ⛔ **仍紅**（2） | ⭐⭐ **兩份契約互相矛盾** —— 同一個資料夾裡有一支測試逐字禁止另一支要求的實作 | ⛔ 沒動 —— 這是設計裁決 |
| `apps/game-server/src/match/autoAcquireWhileMoving.test.ts` | ⛔ **仍紅**（2） | ⭐ **前一條 lane 已診斷並刻意留紅**（檔頭與 `_execution-batches.md` 都寫著「⛔ 不要用放寬期望的方式蓋掉」） | ⛔ 沒動 |

收尾量測（`/private/tmp/b2.log`，多帶一支 `vfxScriptOverride.test.ts` 當對照）：
`Test Files 3 failed | 4 passed (7)` · `Tests 5 failed | 46 passed (51)` · **EXIT=1**。
`pnpm --filter @ggd/game-server typecheck` ⇒ **EXIT=0**。

---

## 1. ⭐ 修好的那一支：`digestCoverage`

`SimWorld` 長出兩格新狀態，而 `SIM_WORLD_DIGEST_EXEMPT` / `SIM_WORLD_DIGEST_GAPS`
兩張表都沒有它們 ⇒ 守衛照設計紅了（**它做的正是它該做的事**）。

### `oneShotClamp`（`SimWorld.ts:793`）
`ConfigOneShotClampDoc`，`MatchController.ts:1283` 的 `this.world.oneShotClamp = oneShotClamp`
在 tick 0 之前定格，唯一讀端是 `sim/combat/damage.ts:1100` 的夾限。
⇒ 與隔壁 `damageRules` / `apDamageScaling` / `mitigationRules` **逐字同一條路** ⇒ `CONFIG`。
⚠️ 出貨 `enabled:false`，⛔ 但理由**不靠那個 false**（owner 轉開之後它仍然是開場灌入的設定）。

### `seatDisadvantage`（`SimWorld.ts:809`）
⚠️ 它**不是** tick 0 定格的 —— host 每回合在 `MatchController.ts:2110` 重算一次
⇒ CONFIG 那一族的理由只對一半。所以寫了自己的兩段理由：

| 段 | 論證 |
|---|---|
| **輸入端** | `disadvantageBySeat()`（`MatchController.ts:1930`）只讀 `roundWins` 與各隊 `champion.items` 的售價 —— 兩樣都已經被 hash（相位/比分走 `hostDigest`，`items` 走 ②的 ChampionComp 突變普查）⇒ 它自己不帶記憶 |
| **輸出端** | sim 側唯一消費端是 `economy/statPath.ts` 的 `grantCapstone()`，效果落在 `champion.statCapstonePct`；`CHAMPION_DIGEST_EXEMPT` 是**空的** ⇒ 那一格逐格突變驗過**有**被 hash ⇒ 分岔在授予的那一 tick 就說話 |

⚠️ 出貨 `economy.capstoneDisadvantageFactor` 是 **0** ⇒ 今天連輸出端都是逐位元 no-op，
⛔ 但豁免理由同樣**不靠那個 0**。

⭐ 反方向的守衛（「列在表上卻其實有被 hash」）也一起綠了 ⇒ 兩個方向都關著。

---

## 2. ⛔⛔ 東西真的壞了的那幾條（⭐ 逐條）

### ① `VfxSystem.authoringOverride`（2 紅）—— ⭐⭐ **兩份契約互相矛盾，這是最嚴重的一條**

`35b231ef3`（Codex，`fix(vfx): repair shipped asset safety and script composition`）
從 `VfxSystem.ts` **刪掉 71 行**，把「有 script ⇒ 預設演出讓路」這條規則**整條移除**
（castBegin 光柱 · castEnd/castInterrupt · `projectileSpawn`/`Hit`/`End` ·
`vfxSpawn` · `modelFxSpawn` · `screenFlash|Shake` · `floatingText` · `abilityCast` 的
`layeredPop`/`playCastVfx`/電弧/焦痕），並在原地留下裁決：

> `vfx-script@1.replaces` only owns an explicit actor presentation channel.
> Merely having a script must not swallow ability-authored model effects.

⭐ 而它**同時新增了一支測試把這個裁決釘死**：`apps/client/src/vfx/vfxScriptOverride.test.ts`

```ts
expect(src).not.toContain("this.scriptPlayer.hasScript(");
expect(src).not.toContain("abilityIdOfAuthoredOrigin(");
```

⇒ ⭐ **它逐字禁止 `VfxSystem.authoringOverride.test.ts` 要求的那個實作。**
兩支都在 `apps/client/src/vfx/`，今天 `vfxScriptOverride` **綠**、`authoringOverride` **紅 2**。
⛔ **沒有任何一種寫法能同時滿足兩者**（除非改名繞過字串掃描 —— 那是作弊）。

⚠️ 而新設計**沒有補上替代品**：`replaces` 走 `channelTakeover`（`VfxScriptPlayer.ts:458`），
而 `channelTakeover` 的**唯一消費端是 `EntityViewRegistry.ts:532`（身體動畫規則）** ——
⛔ 光柱、粒子、螢幕提示、浮動文字**一個都不看它**。
⇒ 被刪掉的那段註解描述的後果（「authored cast 兩套演出同時畫，亮色系會把整個鏡頭洗白」）
**今天沒有任何機制在防**。

⭐ **這是設計裁決，不是測試維護**，要 owner／開票決定走哪一邊：

| 選項 | 代價 |
|---|---|
| (a) 回到「有 script 就全面讓路」 | `vfxScriptOverride.test.ts` 2 條紅；Codex 說的「shipped script 只補 ability JSON 缺的那幾塊（Dragon Slave / 龜派）」會被吞掉 |
| (b) 維持 Codex 的組合語意，把 `authoringOverride` 那兩條改寫成「宣告 `replaces` 才讓路」 | 要**先實作**光柱／粒子端去讀 `channelTakeover`（今天不存在）⇒ ⛔ 不是改測試就好 |

⛔ 我沒有動任何一邊（改任一邊都是放寬一份契約）。

### ② `autoAcquireWhileMoving`（2 紅）—— ⭐ **既有的、被刻意留著的紅**

兩條都不是這一版造成的，證據有兩處**先前量測**：

- `docs/_reports/970_temp_20260904-0014.md:138` ——
  「`autoAcquireWhileMoving.test.ts`（2）｜`r.hits` 為 0｜⭐ **把我的功能中和成 `return false` 之後重跑，紅得一模一樣**」
- `docs/_execution-batches.md:328` ——
  「**前一條 lane 已診斷並刻意留紅** …… **留紅在這裡，不要用放寬期望的方式蓋掉（`e34339b7` 就是那樣被 revert 的）**」

測試檔自己的檔頭也逐字寫著同一件事（`:505–515`）：IDLE 那條紅是因為
「玩家的索敵是對的，是**沒有東西可以打**」（最近的敵方英雄整場沒進到索敵半徑內），
真正的缺口是「bot 會不會主動去打站著不動的玩家」。

今天量到的兩條：

| 案例 | 承重斷言 | 失敗的那一格 |
|---|---|---|
| IDLE | `championId === SABER` ✅ | `hits > 0` ⛔（`hits=0/0 swings`，`held=222/1137`） |
| obstacle（撞柱） | `orderClearedWhileAlive === false` ✅ · `heldTicks > 0` ✅（**1033**） | `hits > 0` ⛔（`windups=0`） |

⚠️ ⭐ obstacle 這一條**握著目標 90.9% 的 tick 卻一次都沒起手** ——
而檔頭記錄的上一次量測是 `hits 0 → 23/35 swings，held 0 → 2313/**2409**`，
今天整場只有 **1137** tick（≈ 少了一半）。⇒ 這一局比從前**早結束**，
而檔頭已經預告過這半條的脆弱：「`hits` 紅了先去看 standstill 與 harness 的撞牆路徑，
⛔ 不要直接動索敵」。⛔ 我沒有動它 —— 檔頭與 `_execution-batches.md` 都明文禁止放寬。

⚠️ 順帶：`content/config/combat-feel.json` 在 **2026-09-01** 被連續改了五次
（`2af748a31` GH-901「原地抖動也算被困」· `dfa2fe86c` 瞄準三決策點 · `ccfc16274` 打擊手感 13 格
· `0a4254c65` · `4843f7ef3`）。⭐ `dfa2fe86c` 的 commit 訊息宣稱「出貨值逐位元等於原本寫死的三個
⇒ 行為零改變」，⛔ 而 `2af748a31` **不是**（它是明著的行為改變）。
⇒ 若要追「為什麼這局早結束一半」，那一條是第一個要問的，⛔ 但那是另一張票。

### ③ `modelLod.shipped`（1 紅）—— ⭐ **產物過期，而且沒有任何閘會叫**

`35b231ef3` 改了 **69 顆 `content/assets/models/**.glb`**（貼圖安全性修復，含 `-mid`/`-small` 層），
⛔ **而沒有重跑 `tools/lod-gen/gen_lod.py`** ⇒ `content/assets/models/_lod.json` 有 **16 列**
的 `bytes` 與磁碟不符（`bulbasaur 450824→450864` … `sd2 265128→264488`，完整清單在 `/private/tmp/b1.log`）。

⭐ 這一支測試量的正是「`cheaperPath` 拿來當證據的那個數字是不是真的」——
同檔的「換過去一定要更省」四條**仍然綠**，所以今天**沒有玩家可見的傷害**，
⛔ 但 `cheaperPath` 的證據已經不可信了。

⭐⭐ **而根因比這一列資料更值得開票**：

```
bash scripts/genguard.sh content/assets/models/_lod.json
  ✓ 沒有**產生器**擁有者，而且沒有被隔離區鎖過。
```

⇒ 它**是**產物（`gen_lod.py:377` 就是唯一寫入端，`generatedBy` 欄位自己寫著），
⛔ 卻不在 `tools/parallel-gates/sync-io.json` 的戶籍裡、沒有隔離區、**沒有 `--check` 閘**、
`package.json` 裡也**沒有 `lod:gen`**（`gen_lod.py` 的註解卻在說「下一次 `pnpm lod:gen`」——
第三守則的形狀）。⇒ 69 顆資產被換掉而 manifest 過期，**唯一叫出來的是這支測試**。

⚠️ 修法**不是**手改那 16 個數字，也**不是**無腦重跑：
`gen_lod.py` 會**重新 decimate 並覆寫每一顆 `-mid`/`-small` glb`**（Codex 剛修好的那些），
⇒ 那是一次要人裁決的大內容改動，⛔ 不該由這條 lane 順手做（而且 `content/` 在我的柵欄外）。

---

## 3. 動到的檔案

| 檔 | 改了什麼 |
|---|---|
| `apps/game-server/src/replay/digestCoverage.ts` | `SIM_WORLD_DIGEST_EXEMPT` 補 `oneShotClamp` 與 `seatDisadvantage` 兩列，各帶一段可被反駁的理由 |

⛔ 其餘一個位元組都沒動。⛔ 沒有 `git add` / commit / push、⛔ 沒跑 `skills:sync` / `content:build`。
文字替換全程走 `python3 scripts/edit-or-die.py`（兩次都回 `替換了 1 處`）。

## 4. 離開碼

| 指令 | EXIT |
|---|---|
| `npx vitest run <六支>`（修前，`/private/tmp/b1.log`） | **1** —— 6 failed / 43 passed |
| `npx vitest run <七支>`（修後，`/private/tmp/b2.log`） | **1** —— 5 failed / 46 passed |
| `pnpm --filter @ggd/game-server typecheck` | **0** |

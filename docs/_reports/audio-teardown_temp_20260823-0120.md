# 音訊與回合邊界七張票 —— Lane 1 完整報告（2026-08-23）

> owner 2026-08-23（逐字）:「**音效錯用**: 莉娜施展技能 竟然出現**皮卡丘 皮卡皮卡**、男人喊叫聲，
>  打死敵人出現 皮卡丘、臭作 get you 音效等⋯**明明場上沒有皮卡丘卻一直有皮卡丘、多拉A夢聲音**」
> owner 2026-08-23:「你**寧願多次清理乾淨開始回合 也不要漏清到**」

## 逐票狀態

| 票 | 狀態 | 落點 |
|---|---|---|
| **#581** `playClip` 停不掉 | ✅ 修 | `AudioSystem.clipVoices` 登記表 ＋ `voiceEpoch` ＋ `stopAllVoices()`；呼叫端 `AudioDirector`（E2）與 `resetAudioForNewMatch()`（E3） |
| **#582** transient 停不掉 | ✅ 修 | `playSfx` 的 `sustained === false` 那一半也進**同一個** `clipVoices` Set ＋ 同一個 `voiceEpoch`（⛔ 沒有塞進 `sustainedVoices`，per-event Map 的零配置性質保住） |
| **#583** 名言整層在 AudioSystem 之外 | ✅ 修（一處呼叫點被柵欄擋下） | `ChampionNameVoice.cancel()`（`seq++` **＋ `el.pause()` ＋ `onended=null`**）；接 `RoundEndVoice.tsx` 的 effect cleanup（E1）、`AudioDirector` 離場（E2）、`resetAudioForNewMatch()`（E3）。⚠️ 票裡的第①個呼叫點 `render/RoundWinnerStage.ts:702` **不在本 lane 的柵欄內**，未動 —— 但那一格是 E1，而 E1 已由 `RoundEndVoice.tsx` 的 cleanup 蓋住 |
| **#584** E3 整格是空的 | ✅ 修 | `audio/index.ts` 的 `resetAudioForNewMatch()`（7 層）＋ `main.tsx:startMatch()` 呼叫 ＋ `audioTeardownCoverage.test.ts` 覆蓋率閘 |
| **#580** `vfxSoundLayer` 不在回合註冊表上 | ✅ 修 | `roundFxRegistry` 補 `.add("vfxSoundLayer", BOTH_EDGES, …)` ＋ `RoundFxDeps.sound`；`GameApp` 餵出貨單例 |
| **#589** 跨房間相位累積 | ✅ 修（①**部分已存在**） | ② `resetSceneElapsed()` ＋ 從 `resetAudioForNewMatch()` 呼叫（**實質修法**）。① 見下面的更正 |
| **#594** 閘只認 `.dispose()` | ✅ 修 | 抽取正則加 `reset\|clear\|clearAll\|despawn` ＋ 第二道 module 單例掃描；9 個新浮出的名字全部進 `NOT_ROUND_SCOPED` 並帶理由 |

## ⚠️ 對票的兩處更正（票裡的量測在今天的樹上已經過期）

### ① #589 的「key 是 `bed.scene`，而 combat 只有一個 scene 名」**已經不成立**

`audioSelect.ts` 的 `bedPhaseKey(scene, arenaId, usingMapBed)` 早在 **GH#531（commit `9931441e`）** 就落地了，
而 `AudioSystem.startScene():948` 已經把它算好再傳進 `swapBed` ⇒ **每張地圖的戰鬥曲本來就有自己的 key**。
⇒ 票裡「新的戰鬥曲從上一首累積的秒數切進去」這個症狀，**在換地圖這條路上已經不會發生**。

⭐ 仍然做的是 `bedElapsedKey(sceneKey, file)` —— 把 **file** 也加進 key，
關掉剩下的那一條：`rotation.next()` 在同一個 scene 內交替 original ↔ Samantha 變體，
兩個**不同的編曲**至今共用同一格相位。⛔ 這一格沒有獨立的守衛（改動太小，照第零守則⑦不寫第三條斷言）。

⇒ **#589 真正的缺陷是②**：`sceneElapsedMs` 在整個 client 生命週期裡**沒有任何清除點**
（連 `dispose()` 都漏了，而 `dispose()` 在正式站從不執行）。那一條有守衛、有突變點。

### ② #580 的註冊名字用 `"vfxSoundLayer"`，⛔ 不是票裡寫的 `"vfxSound"`

`GameApp.roundFxWiring.test.ts` 這條閘靠的是**名字相等**（註冊標籤 ↔ `dispose()` 裡的識別字）。
既有的五格全部遵守這個慣例（`vfx` ↔ `this.vfx.dispose()`…）。
用 `"vfxSound"` 會讓 `dispose()` 抽到的 `vfxSoundLayer` 對不上任何註冊 ⇒ **重新打開 #594 那個洞**。
⇒ 標籤改成 `"vfxSoundLayer"`，票裡 ④ 的斷言同步改成 `toContain("vfxSoundLayer")`。

### ③ `RoundFxDeps.sound` 做成 optional，預設是**出貨的那個單例**

票寫的是必填。實測必填會讓兩支**柵欄外**的既有測試（`render/roundFxRegistry.test.ts`、
`vfx/roundGrowthIsBounded.test.ts`）同時 tsc 紅 ＋ runtime 紅。
⇒ 改成 `sound?: RoundSoundLoops`，`?? vfxSoundLayer`。
⭐ **預設值刻意是那個單例而不是 no-op**：漏傳的那一次必須仍然是**對的行為**；
一個 no-op 預設會讓「忘記接線」與「已經接好」長得一模一樣 —— 正是這條 issue 的形狀。
`GameApp` 仍然逐字餵進去，所以守衛量到的是出貨接線。

## 🧬 突變驗證（三條，逐條記錄實際訊息）

| # | 突變 | 結果 |
|---|---|---|
| **M1a** | 刪掉 `roundFxRegistry.ts` 的 `.add("vfxSoundLayer", …)` | 🔴 `GH#580:特效循環音的登記表不在回合邊界上: expected [ 'vfx', 'ambient', 'whirlwind', …(2) ] to include 'vfxSoundLayer'` |
| **M1b** | 同上，**再把新加的 `toContain` 那一行也註解掉**（⭐ 專門驗 #594 那一半） | 🔴 `這些 FX 會被 teardown 收但回合邊界收不到⋯：vfxSoundLayer` —— ⭐ **抽取那一道自己就抓得到**，⛔ 不是靠我新加的斷言撐著 |
| **M2** | 拿掉 `playClip` 的 `epoch !== this.voiceEpoch` | 🔴 只有「取消**還在解碼**的那一發」紅，「已經在響」那條仍綠 ⇒ ⭐ 票說的沒錯:**兩條都要**，只有後者抓得到「邊界前一幀發出」那個真實時序 |
| **M3** | 從 `resetAudioForNewMatch()` 拿掉 `championNameVoice.cancel()` | 🔴 `這幾層在新房間裡收不到⋯：championNameVoice` —— ⭐ 訊息指名它 |

全部三條驗完即以 `Edit` 還原（⛔ 沒有用 `git checkout <檔>`）。

## ✅ 驗證

- `npx vitest run --dir apps/client` → **559 檔 / 5562 passed / 1 skipped，exit 0**
- `pnpm --filter @ggd/client typecheck` → 我的改動落地後 **exit 0**（在 `ArcBoltFx.ts` 被**另一條 lane** 改壞之前量到）

## ⛔ 一個順手發現、⛔ 沒有當場修的東西（第零守則⑧）

`apps/client/src/vfx/ArcBoltFx.ts:189` 在**別的 lane** 的工作區改動裡 tsc 紅：
`Type '{ mesh: null; … }' is missing the following properties from type 'Strip': from, to, seed, step`。
⛔ 不在本 lane 的柵欄內、⛔ 不是我造成的 —— 交給那條 lane 或 owner 排。

## 📌 沒有做的（刻意，帶理由）

1. **#580 ④ 的第二條端到端斷言**（出貨 `createRoundFx` ＋ `RoundVfxLifecycle` ＋ 出貨 `VfxSoundLayer`，
   量 `activeLoops === 0` 且 12 秒不吐）—— 需要 Babylon `NullEngine` 起一個場景，
   而 `RoundFxDeps.sound` 是**必填/有型別的**，`GameApp` 漏接會被 tsc 擋下，
   接線本身由 `roundFxWiring` 的兩道字串閘守（M1a/M1b 都驗過會紅）。
   照第零守則⑦（體驗層 ≤80 行、⛔ 不開對抗輪）與⏱（⛔ 不要同一件事兩個角度再寫一次）判為過度配比。
2. **#589 ④ 的第二個 `it()`（換 file 名 → offset 0）** —— 見上面的更正①，
   換地圖那條路已由 `bedPhaseKey` ＋ `mapBed.test.ts` 蓋住。
3. **#583 ④ 的 `victoryTaunt` 端** —— 它本來就有 `cancel()`，本次只是把它接進 `resetAudioForNewMatch()`。

## 🧾 額外修掉的一個 side effect（我自己造成的）

編輯過程中 `AudioSystem.ts` 被寫進了**一個 NUL 位元組**（`bedElapsedKey` 的樣板字串），
於是 `file(1)` 把整個檔案判成 `data`、**`grep` 對它靜默回空** ——
所有以 grep 為基礎的稽核／閘對這個檔會變成「什麼都掃不到而且不報錯」。
已改成 `::` 分隔並逐檔驗過 12 個檔都沒有 NUL。

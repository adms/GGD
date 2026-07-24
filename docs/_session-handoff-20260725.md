# GGD — session handoff, 2026-07-25 (01:20)

**下次說「重新開始」時，先讀這一份。** 它記錄了：這個 session 做完了什麼、什麼做到一半、
什麼還沒開始、以及每一件事的「為什麼」——因為銜接失敗通常不是忘記做什麼，而是忘記為什麼
要那樣做。

本檔是 **temp / 過渡文件**。內容一旦被吸收進 `docs/_requirements-audit-gaps.md`、
`docs/requirements-status.md` 或任務清單，就可以刪掉。

---

## 0. 一分鐘版

| 狀態 | 項目 |
|---|---|
| ✅ 已完成並提交 | 商店 BGM(#190)、技能列順序(#192)、3D 音場三個 BROKEN(#194)、`localTeam` 抽取 |
| 🟡 做到一半 | #193 離開遊戲→評價結算（共用選擇器已落地，UI 閘門未接） |
| ⬜ 未開始 | #191 陣亡丟金幣（owner 自己的設計，規格完整） |
| 🔍 診斷中 | ggd.adms.ai/admin 能不能真的用、11 條分支的清理計畫 |
| ⚠️ 待處理 | 兩個外洩憑證要輪替；`sudo chown` 需要 owner 密碼 |

`main` = `64f88d1`。**本地有 4 個 commit 尚未 push**（見 §5）。

---

## 1. 這個 session 完成的事

### #190 商店音樂：拿掉 26 秒的下課鐘 ✅ `c37bbd5`

Owner：「商店音樂播放 BGM 就好，不要變成鐘聲」。

**關鍵事實，別再重查一次：BGM 從來就不是鐘聲。** 對 `intermission.mp3` 前 2.6 秒做 FFT，
峰值在 146.5 / 174.6 / 220.0 / 261.5 / 329.6 Hz — 正是它樂譜寫的 Rhodes Dm9（D3 F3 A3 C4
E4），頻譜平坦度 0.0095。`recessBell.mp3` 同一段只有兩根近純音（349.2 / 698.5 Hz，平坦度
0.00000）。**曲子是好的，鐘聲是疊在上面的**：26.03 秒 × gain 0.55，蓋在一個 60 秒、而且
刻意從近乎無聲呼吸進來的備戰視窗上，等於每次進商店前 43% 的時間 SFX 匯流排上最大聲的是
學校鐘。

處理方式（三個地方一起，因為少一個就會有測試變紅）：
- `IntermissionStage.tsx` + `render/intermission/intermissionAudio.ts` — 移除 emit
- `content/config/audio-map.json` — 移除 map entry（`sfxLabCredits` 有一條
  「no clip is mapped but silent」警報，它的註解明說：要嘛接線要嘛拿掉 entry，**不准放寬**）
- `audio/sfxReachability.ts` — 該檔的 row set 必須等於 map 的 key set，所以 row 也要拿掉
- `sfxLabCredits.ts` — 改成 `mapKeys: []` + 「備而未用」。**素材仍隨遊戲附帶並保留出處**，
  因為効果音ラボ 的授權是按素材不是按播放（見 memory `ggd-soundeffect-lab-authorization`）

任務 **#124 已退役**（樂譜早就改成 city-pop 街の合間，鐘的方向被 owner 兩次否決）。

### #192 技能列 = 天生技 / Q / W / E / R / EX ✅ `c37bbd5`

**這裡有一個陷阱，改動前務必讀 `AbilityBar.tsx` 的檔頭。** 畫面順序和線路順序現在**故意
不一致**：`CASTABLE_SLOTS` 仍是 `["Q","W","E","R","EX","PASSIVE"]`，因為那是**索引** —
`seat.abilityRanks[i]`、`seat.cooldowns[i]`、`data-cast-slot={i}`、`CastTracker.SLOT_INDEX`
全部靠它。天生技是索引 5 卻排在第一格。誰要是「順手整理一下」把 `CASTABLE_SLOTS` 也排成
畫面順序，每一格的冷卻轉盤都會默默指到錯的技能，而且在玩家看到錯的格子變灰之前**完全沒有
症狀**。`abilityBarOrder.test.ts` 把兩個順序鎖在同一個檔案裡。

手機弧形排列本來就已經是這個順序（`PASSIVE_CENTER` 在 Q 再外側一格，Q 在攻擊鍵正左方），
**沒有動過**。

### #194 3D 音場：三個 BROKEN 全部處理 ✅ `a8371ea`

原本被對抗性驗證擋下來，owner 指示「先修 3 個 BROKEN」。

**BROKEN #1（真的）——你自己的腳步聲被刪掉 79%。**
`SfxGate` 只用 event key 限流，而且冷卻是**跨幀**的；`SpatialSfxQueue` 只在**同一幀**內排序。
你的腳步和陌生人的幾乎不會落在同一個 16ms，所以排序根本沒機會比較。程式碼裡那句「走佇列
會讓自己優先」在它為之而寫的情況下就是假的。
用真的 gate 跑 60 秒實測：獨自 224/224，身邊 3 人 **39/224**，11 人 **26/224**。
修法：`spatial.gateKeyFor` + `SfxPlayOptions.gateKey`。`self`/`victim` 保留**裸 key**（這功能
出現前的預算），其他人另開 `key\0world` 頻帶。現在 3 人和 11 人都回到 **224/224**，而世界
頻帶只拿到**一份**設定檔額度，不是十一份。**測試做過 mutation check**：把修法還原後會重現
39/224 和 26/224。

**BROKEN #2（重現不出來）。** 追過了：drain(`GameApp.ts:838`) 到 flush(`:1052`) 之間沒有
任何提前 return（fps cap 的 return 在 drain 之上），`viewports.primary` 就是 `this.cameraRig`。
改用證明取代爭論 — `spatialDelivery.test.ts` 拿**真的 AudioSystem** 跑在會計數的假
AudioContext 上，斷言 panner 真的建出來、值等於 `panForOffset(6)`、接在 voice gain 和 SFX
bus **之間**，而 40u 外（另一場對決）**一個節點都不建**。

**BROKEN #3（真的）——節點 churn。** 實測 **2.087×**（501 vs 240 節點）。兩個修法：
`PAN_SKIP`（|pan| < 0.02 = 0.35 dB，聽不出來）不建 panner，所以置中的聲音——包括你自己的
腳步，全遊戲頻率最高的音效——維持**一個節點**；再加節點池（`SPATIAL_POOL_MAX = 24`）回收
panner/filter。**穩定戰鬥現在 1.008 節點/聲音：240 個聲音總共只建了 1 個 panner、1 個
filter。** 2.087× 的最壞情況（聲音永不結束）留著當上限斷言。

**Owner 的更正已寫進 `combatSfxSpatial.ts` 檔頭**：調查說「dash 根本不存在」是**錯的**。
`castType: "dash"` 有 **15 個技能**（電光一閃、神出鬼沒、瞬間移動、虛空瞬動、快步…），
`abilitySystem.ts` 有真的 `case "dash"`，而且已經走 `abilityCast`/`castBegin` 被定位。
缺的是**專屬音檔**，那是內容工作（audio-map + `combatSfx`），**不是空間化的缺口，不要再被
重新歸檔成一個**。

> 音場工作原本在 worktree `.claude/worktrees/wf_b144188b-95e-5`，已經整併進 main，該
> worktree 可以刪。

---

## 2. 做到一半：#193 離開遊戲要先跳評價結算

Owner：「如果團隊生命已經沒了 選擇離開遊戲的時候 要先跳出評價結算畫面 再按確定 才能回到
大廳」。

### 已落地 ✅ `64f88d1`
`apps/client/src/ui/hud/localTeam.ts` — `useLocalTeamId()` / `useLocalTeamEliminated()`，
把三跳查詢收成一份。`useHudPanels.ts` 的內嵌副本已換掉，行為不變。
**「未知」一律回 false**（還在比賽中），因為誤判成已淘汰會把**活著的**玩家鎖在結算畫面後面。

### 還沒做 ⬜（下次從這裡接）

1. **HUD state 加 `exitSettlement: boolean`** — `apps/client/src/net/RoomStore.ts`
   - state shape 在 `~line 190-210`（`settlement` 旁邊），`initial` 在 `~line 211`
   - action 放在 `recordSettlement` / `resetSettlement` 旁邊（`~line 523`）
   - **`resetSettlement()` 必須一併清掉它**，否則重開一局會直接彈結算
2. **`PauseMenu.tsx`（`~line 149-157`）** — 「⏻ Leave to menu 返回大廳」目前直接
   `void returnToLobby()`。改成：`useLocalTeamEliminated()` 為 true 時改開結算，false 時
   維持原行為（活著的玩家離開不該被擋）
3. **`HudRoot.tsx:215`** — `{phase === "matchEnd" && <MatchEndPanel />}`
   → `{(phase === "matchEnd" || exitSettlement) && <MatchEndPanel />}`
4. **`MatchEndPanel.tsx`** — 用 `exitSettlement` 開啟時（`phase !== "matchEnd"`）：
   - **關掉自動前進**（`AUTO_ADVANCE_SEC = 12` + 「{secsLeft}s 後自動前往」），因為 owner
     要的是「**再按確定**才能回到大廳」
   - 走 `TeamPlacementFallback`（`~line 260`）——這條路本來就存在，因為隊伍被淘汰但比賽還在
     跑的時候，伺服器的 `MatchSettlement` payload **還沒送出**
5. **測試**：`localTeam` 的三種未知輸入；PauseMenu 在淘汰/未淘汰兩種狀態下的分岔；
   `HudRoot` 的掛載條件

### 設計上還沒解決的問題 ⚠️
4 隊競技場裡，你的隊伍被淘汰時**比賽還在跑**，所以那一刻**沒有全場 settlement payload**
（grade / ranking 是伺服器在 matchEnd 才廣播的）。所以「評價結算畫面」在這個時機只能顯示
`TeamPlacementFallback`（最終名次 + 隊伍），**不會有 S+/A/C 評分**。

兩條路，**需要 owner 決定**：
- **(a)** 就接受 fallback：先給名次，評分等比賽真的結束再看 — 改動最小
- **(b)** 讓伺服器在**一隊被淘汰時**就發那一隊的 settlement — 真正符合「評價」兩個字，但
  要動 `apps/game-server` 的廣播時機和 `MatchSettlement` 的語意

---

## 3. 未開始：#191 陣亡玩家丟金幣

**這是 owner 自己出的設計，規格完整，不要重新發明。**

> 「陣亡玩家 可以丟自己還沒花掉的 100金 到競技場地板上 讓經過的玩家可以撿起來
>  金幣 3d model 要有閃光光芒 並且撿到金幣也會有明顯音效 每個玩家每回合可以丟出最多 10枚金幣」

規則拆解：
- 一枚 = **100 金**，從陣亡玩家**未花掉**的金幣扣
- 落在**競技場地板**上，**任何經過的玩家**都能撿（「經過的玩家」沒有分敵我 —— 這是刻意的
  戲劇性，不要自作主張只給隊友）
- **每個玩家每回合最多 10 枚**，回合重置
- 金幣要有**閃光光芒**（3D model + glint/bloom/地面光）
- 撿到要有**明顯音效**

實作切面：
- **sim（`packages/shared`）必須是確定性的**：不准 `Math.random`、不准 `Date.now`，否則
  replay digest 會分歧（見 `docs` 的 replay 契約）。丟擲位置要從 tick 推導或由指令攜帶。
- 金幣要**存活到回合結束**，且 replay 逐位元一致
- 撿取判定：走過即撿（碰撞半徑），不需要按鍵
- 客戶端：3D 金幣模型 + 旋轉閃光；`audio-map.json` 要一個新的撿取音效 key，並且照 §1 的
  規矩在 `sfxReachability` 註冊、在 `sfxLabCredits` 掛出處
- UI：陣亡觀戰畫面要有「丟金幣」控制，顯示剩餘金幣與剩餘枚數（x/10）

> 這條同時是「陣亡玩家能做什麼」那個問題的**最終答案** —— owner 否決了我提的三個選項
> （ping/情報、每回合一次的隊友增益、可互動的死亡掉落），自己出了這個。**不要再提那三個。**

---

## 4. 診斷中（session 結束時尚未收斂）

### (a) `https://ggd.adms.ai/admin` 到底能不能用
已確認的事實：`curl https://ggd.adms.ai/admin/` → **200**，而且**是真的後台 shell**
（`<title>GGD Operations Console</title>` + `/admin/assets/index-*.js`）。
所以**靜態 bundle 有部署**。問題在於它的 API 呼叫有沒有地方去。

Owner 先前的原話：「雖然可以連，但不是真正的後台畫面」、「應該是因為 port :60721/admin/
才是真正的關係」。

**下次要查的陷阱（很重要）**：這個站有 SPA fallback，**沒路由到的路徑會回 200 + admin
的 index.html**，用 curl 看起來像成功。任何 200 都要檢查 body 是不是 HTML 含
「GGD Operations Console」——是的話代表那個 endpoint **不存在**。

**兩條紅線，不准碰**：
- `apps/admin/src/dev/loopbackOnly.ts` **絕對不可以放寬**
- `/content-api` **絕對不可以在正式環境的 nginx 暴露**

相關任務：**#189**（`data/` 持久化 overlay 讓 ggd.adms.ai/admin 的內容管理能用，in_progress）、
**#180**（T0 遠端遊玩 + owner bootstrap）。

### (b) 分支清理
現況：`main` = `64f88d1`。

| 分支 | PR | 狀態 |
|---|---|---|
| `campaign/complete-tasks` | #7 MERGED | 本地 ahead 1 |
| `claude/compassionate-dubinsky-5c4b69` | **#11 OPEN** | mergeable，unit+go-platform 紅 |
| `claude/sharp-zhukovsky-c70b68` | **#2 OPEN** | mergeable |
| `claude/friendly-knuth-eab6b5` | #3 CLOSED | CONFLICTING；本地多一個 CI 修正 |
| `claude/happy-dijkstra-11ada3` | #8 MERGED | — |
| `claude/practical-sinoussi-436a17` | #10 CLOSED | #128 掃描修正 |
| `claude/wonderful-chaplygin-8b0d77` | #1 CLOSED | 本地 ahead 1（ttk-sim lockfile） |
| `fix/model-budget-typecheck` | #5 CLOSED | typecheck 守衛 |
| `fix/testrunner-coverage-package` | #6 CLOSED | gitignore 吞掉 Go package |
| `fix/ttk-sim-lockfile` | #4 CLOSED | pnpm-lock 缺 importer |
| `host-deploy-fixes` | 無 | **本地限定，從未 push** |
| `worktree-wf_*` ×6 | 無 | 背景 agent 的暫存分支，可刪 |

**最需要注意的一件事**：#1/#3/#4/#5/#6/#10 這六個 **CLOSED 的 PR 有好幾個是 CI 修正**
（缺的 pnpm-lock importer、把 Go package 吞掉的 gitignore、typecheck 守衛）。PR 被關掉
**不代表底下的壞掉修好了**。下次務必逐條確認「這個問題現在還在不在 main 上」——
memory `ggd-ci-preexisting-breakages` 說 main 的 CI 本來就自己紅，所以 PR 紅**不一定是
PR 的錯**，要先在 `origin/main` 上重現。

---

## 4.5 Session 結束時仍在跑的六個平行工作流 🔄

Owner 要求「盡可能多開工作流同步平行工作」。以下六個在 session 暫停時仍在執行。
**每一個都會把工作留在自己的 git worktree 裡（`.claude/worktrees/`），沒有任何一個會自動
commit 或動到 `main`。** 下次重啟時：先看各自的 transcript / journal，再決定要不要整併。

| # | Run ID | 做什麼 | 產出在哪 |
|---|---|---|---|
| 1 | `wf_bcda84e7-277` | 診斷 ggd.adms.ai/admin 到底能不能用 | 純分析，無程式碼 |
| 2 | `wf_982da646-a34` | 11 條分支的 merge/delete 三選一 + 指令清單 | 純分析，**唯讀**，不會動 git |
| 3 | `wf_b5b92846-cbf` | **#191 陣亡丟金幣** — 設計+實作+對抗驗證 | worktree |
| 4 | `wf_94a7b1aa-d6f` | **#193 離開先跳結算** — 實作+對抗驗證 | worktree |
| 5 | `wf_59f9e825-4df` | **#195 火圈重做** — 設計+實作+對抗驗證 | worktree |
| 6 | `wf_c52aabd7-ef0` | **#196 地板波紋 + 復活圈不過期** | worktree |

Transcript 路徑：
`~/.claude/projects/-Users-Takuro-GGD/1fc1e42e-e26b-4bec-88ef-ca25238c0f4c/subagents/workflows/<runId>/`
其中 `journal.jsonl` 記錄每個 agent 的**實際回傳值** —— 在推測「為什麼結果是空的」之前先讀它。

腳本都存在
`~/.claude/projects/.../workflows/scripts/<name>-<runId>.js`，
可以直接編輯後用 `Workflow({scriptPath, resumeFromRunId})` 續跑：**未修改的前綴會用快取
瞬間回傳，只有被改動的那一步之後才重跑。**

**每一個 build 階段的產出都必須經過對抗驗證再合併。** 這個 session 已經有一次前例：3D 音場
的第一版通過了自己所有的單元測試，卻被驗證抓到「你自己的腳步聲被刪掉 79%」—— 一個只在
**跨幀**才存在、任何單批次測試都看不到的缺陷。**不要因為 build agent 說綠就合併。**

---

## 5. 尚未 push 的 commit（4 個）

```
64f88d1 refactor(hud): one definition of "my team is out of the match"
a8371ea feat(audio): 3D combat sound field — with the three BROKEN findings closed
c37bbd5 fix(audio,hud): shop plays its BGM again, and the bar leads with 天生技
9d41934 fix(hud): an eliminated team was still shown a shop it could never buy from
```

**push 的時候記得**（memory `ggd-push-release-notes`）：每次 push 都要帶一則 GitHub
release note，一天之內的 release 用第三個版號（例如 0.4.5），tag 打在分支上。
Release note 要涵蓋：**完成功能、素材、機制、介面、管理流程、遊戲玩法、修正錯誤**。

---

## 6. 部署注意事項（每次都要照做）

- 主機：`ggd.adms.ai`（ssh → pull → restart），見 memory `ggd-gcp-deploy`
- **部署前一定要備份** `data/{accounts,curation,matches,admin-audit}` —— owner 原話：
  「部署的時候記得不要蓋掉記錄」
- **永遠不要**在家用主機上跑 `docker compose down -v`：會毀掉 `ggd_redis-data`
  （= sessions + 排行榜）
- `content/` 改過就要 `pnpm content:build` 再 commit，否則 `bundle.test.ts` 會紅
  （memory `ggd-content-build-after-edit`，這個錯已經犯過兩次）

---

## 7. 安全：兩個外洩憑證要輪替 ⚠️

1. **`admsadms`** —— owner 在對話裡貼了 ggd.adms.ai 的管理員密碼。我**拒絕使用**（輸入密碼
   是絕對禁止的，不管誰授權），但它已經在對話記錄裡了。**請 owner 自行更換。**
2. **`PLATFORM_GAME_SHARED_SECRET`** —— 我在一次 `docker inspect` 的輸出裡只遮了 platform
   那一側，game 那一側的值外洩了。**請 owner 自行輪替。**

另外 **`sudo chown -R 1000:1000 ~/GGD/data`** 還沒做 —— 它同時修好 replay 的 EACCES 和
`git reset --hard` 部署失敗。**需要 owner 的密碼，Claude 不能代勞。**

---

## 8. 一開場就要記得的專案慣例

- **每一條需求都要立刻寫進 `docs/_requirements-audit-gaps.md`** —— 開任務不算數
  （memory `ggd-rolling-log-discipline`），並且保持三個 live page 同步
- 發現的問題要做成**應用內動態頁面**，不是靜態文件（memory `ggd-reports-as-live-pages`）
- 英雄↔技能文件是**鏡像**存兩份，同步方向永遠是 standalone → embedded，STRICT model
  （memory `ggd-mirror-authority-model`）
- 這個專案的病症：**東西通過測試、看起來綠、但在真實對戰裡從來沒發生過**。
  每一項都要問「這在真的一場比賽裡會不會發生」

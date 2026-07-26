# 語音的遠近空間之分 (#259) — TODO

> owner 原話（驗收標準，逐字）：
> **「角色語音、音效這些都要有遠近空間之分，只有自己的才是全播放」**

音效那一側 #194 就做完了：`GameApp.frame` → `SpatialSfxQueue` → `spatial.spatialMix` →
`AudioSystem.makeSpatialChain`，94 個戰鬥 key 全部有 `{volume, pan, lowpassHz}`。
**缺的是整條語音通道。** #223 已經算出了關係帶（self / engaged / enemy / ally / third）
與距離，然後把距離折成一個機率純量就把座標丟掉 —— `VoiceCandidate` 裡連 x/z 都沒有，
`contextualVoice` 一路寫死 `volume: 1`。**一套完整的關係＋距離模型，從來沒有變成音量。**
這是本專案這一輪的第五次同一種失敗（#93 煙火在地板下、#247 跳躍在畫面外、
蒼月潮連段算不到、大廳公告客戶端沒有 —— 全都是「做完了，玩家感受不到」）。

## 這一版做了什麼

| 位置 | 改動 |
| --- | --- |
| `apps/client/src/audio/spatial.ts` | 新增第三條距離律 `voice`（`VOICE_NEAR 6 / EXP 0.6 / FAR 30`）＋ `CLASS_LAW` 表；`distanceGain`/`farCutoff` 改查表 |
| `apps/client/src/audio/voiceSpatial.ts`（新） | `audienceToRelation`（engaged→victim）、`SELF_VOICE_MIX`（owner 規則的那條 early return）、`voiceSpatialMix`、`voicePlayOptions` |
| `apps/client/src/audio/spatialPolicy.ts`（新） | 「哪些聲音可以動、哪些永遠置中」的**唯一一張表**（41 個 client SFX key + 46 個語音類別），每一列都帶理由 |
| `apps/client/src/audio/voiceAudience.ts` | `VoiceCandidate.pos`（保留座標，不再折掉）＋ `plainVoiceCandidate`（probScale 恆為 1） |
| `apps/client/src/audio/contextualVoice.ts` | `ContextualPlayOptions` 多三個**純數字**欄位 volume/pan/lowpassHz；音訊層仍然不知道 localId/relation/distance |
| `apps/client/src/GameApp.ts` | skill-name / crit / attack-heavy / stun / slow / bind / curse 改走同一個佇列；flush 從 step 1 搬到 step 5b（相機更新之後）與 `sfxQueue.flush` 並列 |
| `apps/client/public/voice-spatial-audition.html`（新） | owner 自己拖著聽的試聽面：關係帶 × 位置 → 同時顯示 volume / pan / lowpassHz |

## 兩條硬規則，寫成程式裡看得見的東西

1. **`self` = 全播放。** `voiceSpatial.SELF_VOICE_MIX` 是一個 **early return**，
   在讀 listener 與座標之前就回傳 —— volume 1、pan 略過（不建 panner）、不濾波，
   **而且與距離無關**。跳躍飛行中（#247）、衝刺、傳送、reconcile 回拉、自由平移、
   結算凍結，這六種情況都會讓你的身體暫時離錨點很遠；只要 self 走距離曲線，
   你自己的聲音就會在那些瞬間比旁邊的陌生人還小 —— 而「volume 是個數字」的測試永遠是綠的。
2. **不可以被空間化的東西**寫在 `spatialPolicy.ts` 一張表裡，
   由 `spatialPolicy.test.ts` 對著兩份**不是手寫的**清單逐條掃描
   （`sfxReachability` 的 145 列＝audio-map 的 key 集合、語音 manifest 的 46 個類別）。
   下個月新增一個 UI 音而沒有分類，測試就紅 —— 而不是悄悄被 pan 掉。

## 量測（真實數字，非估算）

在瀏覽器裡對**出貨的 `voiceSpatial.ts` 模組**直接取值（listener 在原點，發聲者在 +x）：

| 距離 | self | engaged | enemy | ally | third |
| --- | --- | --- | --- | --- | --- |
| 0 u | 1.000 | 1.000 | 0.800 | 0.600 | 0.450 |
| 4 u | 1.000 | 1.000 | 0.800 | 0.600 | 0.450 |
| 8 u | 1.000 | 0.8415 | 0.6732 | 0.5049 | 0.3787 |
| 12 u | 1.000 | 0.6598 | 0.5278 | 0.3959 | 0.2969 |
| 20 u | 1.000 | 0.4856 | 0.3885 | 0.2914 | 0.2185 |
| 30 u | 1.000 | 0.3807 | 0.3046 | 0.2284 | 0.1713 |
| 32 u（跨 duel zone） | 1.000 | 0.3810 | **不播** | **不播** | **不播** |

`pan`：4 u → 0.347、8 u → 0.571、12 u → 0.679、20 u → 0.740、30 u → 0.749（`PAN_MAX` 0.75）。
`self` 恆為 0（低於 `PAN_SKIP`，所以**不建 panner**，一個 voice 一個 node —— 和空間化之前一樣）。
往畫面上方 12 u 的敵人：volume 0.3715、pan 0.476、lowpass **3008 Hz**。

**戰場沒有被弄安靜**：典型交戰距離（2–8 u）engaged ≥ 0.84；12 u 的敵人 0.53、
第三方 0.30 —— 都還在。語音曲線在每一段都比 `focus`（命中音）大：
30 u 時語音 −8.4 dB、命中音 −17.5 dB。

## 節流與去重：一個都沒動

1.2 s 全域間隔、1.5 s 每英雄間隔、每(英雄,桶) cooldown、in-flight 去重、
`gateKeyFor` 的分頻 —— 全部原封不動，並且由 `voiceDelivery.test.ts` 直接斷言。
唯一一種**新的**消失方式是幾何的：非交戰對象超過 30 u 不進 mixer，
而那正是 #223 的 `voiceProbScale` 早就在做的事（超過 `VOICE_FAR` 回 0），
現在只是連 skill-name / crit / CC 也一起遵守。

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| sv-01 | `self` = volume 1 / 不 pan / 不濾波，且**與距離無關**（含地圖角落、無 listener、NaN 座標） | voice-spatial-self | unit | done |
| sv-02 | audience→relation 是顯式對照（engaged→victim），且每一帶的 relation 權重 ≤ 1（只衰減不放大） | voice-spatial-relation | unit | done |
| sv-03 | 各關係帶在真實交戰距離下的實測音量：engaged 在 2–8 u ≥ 0.84，12 u 的 enemy/ally/third 都還聽得到 | voice-spatial-loudness | unit | done |
| sv-04 | 方向與深度沿用同一套法則：±6 u → ±0.476、往畫面上方才濾波、level/direction 雙錨點 | voice-spatial-geometry | unit | done |
| sv-05 | 30 u 截止＝跨 duel zone 靜音；self/engaged 永不被截掉（拉回邊界而非丟棄）；截止值與 dispatch 層同一個數 | voice-spatial-cutoff | unit | done |
| sv-06 | 降級輸入：查不到座標→置中但仍衰減、非有限座標永不進 AudioParam、觀戰時保留幾何但拿掉關係折扣 | voice-spatial-degraded | exception | done |
| sv-07 | 混音數字**真的到達 WebAudio graph**：panner.pan / filter.frequency / gain.gain 的實際值（真 AudioSystem + 計數用 FakeCtx） | voice-delivery | integration | done |
| sv-08 | 自己的語音只建 **1 個 node**（無 panner、無 filter）且 gain 為 1，即使身體在地圖角落 | voice-delivery-self | integration | done |
| sv-09 | #62 靜音優先於一切：靜音時連 AudioContext 都不建立；SFX 靜音鈕仍然關得掉語音（沒有繞過 bus） | voice-delivery-silent | integration | done |
| sv-10 | 空間化沒有改變「誰有資格出聲」：1.2 s 全域間隔、in-flight 去重照舊；超距離的那句不佔格子 | voice-delivery-throttle | regression | done |
| sv-11 | 不可空間化清單是**可列舉且窮盡**的：對 audio-map 的 145 個 key 掃描，未分類即紅 | spatial-policy-sfx | unit | done |
| sv-12 | 語音類別政策對照出貨 manifest 的 46 個類別，雙向窮盡；`dispatched: false` 的列不可被呼叫點命名 | spatial-policy-voice | unit | done |
| sv-13 | 試聽頁存在、載入的是**出貨模組本身**、沒有重寫任何幾何、且不會被打進正式 bundle | voice-audition-page | unit | done |
| sv-14 | 回合結束後仍在佇列裡的語音會講進商店（`dispatchContextualVoice` 完全沒有 phase 閘） | voice-phase-gate | regression | pending |
| sv-15 | 小怪湧入／死亡、`leapStart`、`evade`、`reviveCircleSpawn` 等事件**根本沒有聲音**（不是沒空間化） | voice-missing-sfx | integration | pending |

## 還沒做的（誠實記錄）

- **sv-14 — 語音沒有 phase 閘。** `combatSfx` 有 `gateCombatBed`，但它只擋
  fireRingLoop / reviveChannel / arenaAmbience 三個持續床；`dispatchContextualVoice` 與
  `dispatchStatusVoice` **完全沒有 phase 檢查**。回合結束後仍在佇列裡的 damage/death
  事件會把語音講進商店。這是 #238 的近親，**故意沒有在本輪處理**：它改的是
  「誰有資格出聲」，而 owner 對本題的第 4 條規定是節流與資格一個都不許動。
- **sv-15 — 相鄰的「根本沒聲音」缺口**（喪標麥可湧入/死亡、跳躍起跳、閃避、復活圈生成）。
  那是內容缺口，不是空間化缺口，不要混為一談。
- **`voiceProbScale` 與 `distanceGain` 的距離雙重計算**：機率層已經按距離線性衰減，
  現在音量層又衰減一次。實測 20 u 的 enemy：出聲機率 = 類別 prob × 0.3 ×(1−20/30)=×0.1，
  出聲時音量 0.389。兩者相乘不是「聽不到」，但**是否要把機率層退回成只做 far cutoff，
  是設計決定，需要 owner 裁定**（改了會改變出聲次數 = 違反第 4 條，所以本輪不動）。

# lane S — 殭屍王的**咆哮**與**撕咬** 音效（2026-08-23）

## 0. owner 的授權與唯一的條件（逐字）

> 「我說過**你可以自己去抓**（**音效若無請自行搜尋抓取**）」 —— owner 2026-08-23

> 「只要好好列出附記在授權頁面就好」 —— owner（既有的 soundeffect-lab.info 授權條件，
> 記在 `content/assets/audio/sfx/lab/MANIFEST.json` 的 `licence.attribution`）

規格（owner 逐字，出處 `content/abilities/godie-zombieking.passive.json` 的 description）：

> 「跳躍前播放**殭屍咆哮音效**全畫面變黑一秒漸變回復正常，
>  跳躍後播放**殭屍撕咬音效**跟持續大量範圍噴血特效」

---

## 1. 盤點：repo 裡真的沒有可用的（⛔ 不是「沒找」）

| 找了什麼 | 結果 |
|---|---|
| `content/assets/audio/sfx/**`（30 檔 + `fx/` 34 + `lab/` 46） | ⛔ 沒有殭屍音。最接近的是 `fx/boss-horror.mp3`（合成恐怖 sting，**殭屍王出場**在用）與 `dragon-roar*.mp3`（登入畫面的龍） |
| `content/config/audio-map.json` 的 230 個 sfx key | ⛔ 只有 `dragonRoar` / `dragonRoarBig` / `bossHorror` / `bossJackpot` 沾到邊 |
| 133 個 `wc3.*` 原作音（`content/assets/audio/wc3/`） | ⛔ 掃 `ghoul\|zombie\|undead\|abom\|crypt\|necro\|bite\|roar\|flesh\|…` 只中 3 個，而且都不是咆哮／撕咬（`necropolisupgrade2` · `meatwagonmissilehit1` · `undeaddissipate2`） |

⇒ 真的沒有，所以去抓。

---

## 2. 抓了幾段 · 從哪 · 授權

**2 段，全部從 `soundeffect-lab.info`（⛔ 沒有碰任何其他站）**，
同一頁：<https://soundeffect-lab.info/sound/battle/battle2.html> 的「ホラー」區。

| 出貨檔 | 原始素材 | 直連 | 用在哪 |
|---|---|---|---|
| `content/assets/audio/sfx/lab/zombie-roar.mp3` | 「ゾンビの声3」`zombie-voice3.mp3`（サイトの説明:**動物的**） | `…/sound/battle/mp3/zombie-voice3.mp3` | **咆哮**（起跳前） |
| `content/assets/audio/sfx/lab/zombie-bite.mp3` | 「ゾンビに体をえぐられる」`zombie-beat1.mp3`（**グロテスクなシーン**） | `…/sound/battle/mp3/zombie-beat1.mp3` | **撕咬**（落地） |

**為什麼是這兩段**（同一區另外四段全部量過再排除）：

| 候選 | 長度 | 為什麼不選 |
|---|---:|---|
| ゾンビの声1 / 2 | 2.15 s / 1.75 s | うめき声寄り —— 是**呻吟**不是**咆哮** |
| ゾンビの息遣い | **20.5 s** | 是呼吸床，⛔ 不是一次事件 |
| ゾンビの食事 | **18.4 s** | 咀嚼床。落地那一瞬間要的是一口，⛔ 不是 18 秒 |

**授權（我自己重新讀了 <https://soundeffect-lab.info/agreement/>，⛔ 不是抄 MANIFEST）——一句話**：
商用免費、報告與**クレジット表記不要（任意）**、可改變格式、
「アプリに操作音として効果音を組み込む」**明確不算再配布**（連音源檔裸露出貨也可以）；
禁止的是**再配布本身**、AI 學習素材、直連、以及**逐一試聽/下載的音效展示頁**。
⇒ 逐字與 `MANIFEST.json` 的 `licence` 區塊**一致**（第三守則：查過了，它沒有說謊）。

---

## 3. credits 頁在哪、加了幾列

⭐ **credits 有兩份，兩份都加了**（⛔ 只加一份就是漏）：

| 哪一份 | 是什麼 | 加了 |
|---|---|---|
| `apps/client/src/ui/platform/sfxLabCredits.ts` | **遊戲內的 版權聲明 頁**（`#credits` → 「効果音ラボ 全素材清單」）。⭐ 這是玩家看得到的那一份 | **2 列**（group `magic`／魔法・技能） |
| `content/assets/CREDITS.md` | repo 的**權威出處帳本**（`### Usage ledger — SFX`） | **2 列**（#44 / #45），表頭 46 clips → **48 clips**，後面三列重新編號 46–48 |
| `content/assets/audio/sfx/lab/MANIFEST.json` | 取得帳本 / `ACQUIRE.py` 的**可重跑輸入** | **2 筆 clips 條目**（含 pre/post 量測、gainAnchor、shippedGain 的理由） |

### ⭐ 閘（⛔ 不是判準）—— 而且它**已經存在**，我沒有再寫一份

`apps/client/src/ui/platform/sfxLabCredits.test.ts` 的第一條：

```
it("lists EVERY 効果音ラボ file that ships — nothing on disk is missing from the page")
```

它 `readdirSync(content/assets/audio/sfx/lab)` + `voice-jp/` **從目錄推導**，
雙向比對（漏列 → 紅；列了但沒出貨 → 也紅）。⇒ 我的兩個新檔**一放進去就自動被它管**。
⭐ 這正是任務要的「從音檔目錄推導，⛔ 不要手抄名單」，所以 ⛔ **我沒有加第二份名單**
（第〇·四守則：同一份知識不可以有第二個住處）。

它同時還把**出處**釘住：`sourceTitle` / `sourceFile` / `sourceUrl` / `sourcePage`
逐欄比對 `MANIFEST.json`，而且 `url` 必須是 `soundeffect-lab.info/` 開頭。

**突變驗證**（做了，紅了，改回來了）：
把 `zombie-roar.mp3` 那一列從 `sfxLabCredits.ts` 拿掉 →
`× not credited: sfx/lab/zombie-roar.mp3`。

---

## 4. 兩個時機接得起來嗎 —— ⭐ **接得起來，而且它們騎不同的事件**

| 時機 | 走哪一條路 | 騎哪一顆事件 |
|---|---|---|
| **咆哮**（起跳前） | `content/config/vfx-families.json` → `abilities["godie-zombieking.passive"].soundLaunch` | **`abilityCast`**（`abilitySystem.ts` 在 cast committed 的那一點 emit） |
| **撕咬**（落地） | 同一列的 `soundImpact` | **落地那一發 `damage`**（`LeapSystem.detonate()` → `runEffects(onLand, { origin: "ability:<id>" })`） |

兩者都經過 `resolveVfxSound()` → `VfxSoundLayer.cue()` → `vfxSoundCues()` →
`SpatialSfxQueue`，⇒ 玩家的總音量 / SFX 開關 / 空間化 / SfxGate 的冷卻與同時發聲數
**全部自動適用**（⛔ 我沒有開任何新的播放路徑）。

⚠️ `spawnModelFx` 的 `soundKey` / `arriveSoundKey` + `arriveDelaySec` 那條路
（GH#605）**這裡用不到** —— 那是給「移動中的模型特效」的，而這一支是 `leap`，
它的落地已經是一顆真的事件，⛔ 不需要一個預約時間。

### ⛔ 順帶抓到的一個「說了但不會發生」（第一·五守則的形狀）

`content/abilities/godie-zombieking.passive.json` 上原本有 `"sfxKey": "bossHorror"` ——
而它**永遠選不上**：`combatSfx.wc3CastKey()` → `abilitySfxCueAllowed()` 只放行
`content/audio-manifests/ability-sfx-cues.json` 註冊過的 **52 個 `wc3.*` cue**，
`bossHorror` 不在裡面（那份檔是 `tools/sfx-bind/build_bindings.py` 從 JASS 掃描**產生**的，
而殭屍王不在原作的掃描結果裡）。
⇒ schema 收得下、`content:build` 全綠、測試全綠，而遊戲裡那一格**逐位元等於不存在**。

**修法＝替換（第一·五的第 1 條出路）**：咆哮改走真的會響的 `soundLaunch`，
並把那個死掉的 `sfxKey` 拿掉。⛔ 沒有改 `ability-sfx-cues.json`（它是產生的）。

### 音量怎麼定的（⛔ 不是我拍腦袋）

照 `MANIFEST.json` 自己的等響度錨點公式 `anchorGain × 10^((anchorMean − thisMean)/20)`：

| key | 錨點 | 等響度值 | 出貨 `audio-map.gain` | 為什麼不同 |
|---|---|---:|---:|---|
| `zombieRoar` | `bossHorror`（0.85 / mean −14.7 dB） | 1.23 | **0.95** | 逐支那一格的 `soundGain` 出貨是 **1.3**（⛔ 我沒有動它）⇒ 0.95 × 1.3 = **1.235** ≈ 錨點 |
| `zombieBite` | `hit-heavy`（0.95 / mean −18.1 dB，**就是被換掉的那個替身**） | 0.92 | **0.71** | 0.71 × 1.3 = **0.923** ≈ 錨點 ⇒ 撕咬與原本的替身**一樣響**，只是換成了真的咬 |

⚠️ `zombieBite` 的 `cooldownMs: 200` / `maxConcurrent: 2` 是**必要的**，⛔ 不是保守：
落地圈 `landRadius: 2.5` 會對圈內**每一個**目標各發一顆 `damage` ⇒
沒有 gate 的話一次落地會疊好幾口咬。

---

## 5. 後台開關（第一守則）—— ⭐ **已經有三格，我沒有再造一格**

owner 2026-08-23：「沒做完以前別問我了自己判斷 **但是留後台開關可以簡易 rollback**」。
這一批的每一個選擇都落在**已經存在的**後台欄位上（`apps/admin` 的 **特效鑄造 / vfxForge** 頁）：

| 想做什麼 | 轉哪一格 | 效果 |
|---|---|---|
| **換回替身** | 逐支覆寫 `godie-zombieking.passive` 的 **音效·命中** → 填回 `hit-heavy` | 撕咬變回原本的通用重擊 |
| **關掉咆哮** | 同一列的 **音效·發射** → 留白 | 起跳前不出聲（回到這一批之前的狀態） |
| **整批靜音** | 全域 **`soundEnabled`**（欄位說明逐字：「這是一鍵 rollback 用的，出貨是開」） | 特效自帶的音效全部關掉 |
| 只是太大聲 | 同一列的 **音效音量倍率**（`soundGain`，出貨 1.3） | 兩段一起縮放 |

⛔ **我沒有加新欄位**，理由是第〇·四守則：這四格已經是那份知識的住處，
再開一格 `zombieSfxEnabled` 就是第二個住處，而它會跟這四格各自漂。

---

## 6. 動了哪些檔

| 檔 | 動作 |
|---|---|
| `content/assets/audio/sfx/lab/zombie-roar.mp3` | **新增**（1.52 s · mono 44.1 kHz · peak −2.9 dBFS · 37 KB） |
| `content/assets/audio/sfx/lab/zombie-bite.mp3` | **新增**（1.20 s · mono 44.1 kHz · peak −3.0 dBFS · 29 KB） |
| `content/assets/audio/sfx/lab/MANIFEST.json` | +2 筆 clips（可被 `ACQUIRE.py` 重跑） |
| `content/config/audio-map.json` | +2 個 sfx key |
| `content/config/vfx-families.json` | `godie-zombieking.passive` 那一列：`soundImpact` hit-heavy → zombieBite、**新增** `soundLaunch: zombieRoar` |
| `content/abilities/godie-zombieking.passive.json` | 移除死掉的 `sfxKey: "bossHorror"` |
| `content/assets/CREDITS.md` | +2 列、表頭 46 → 48、後三列重新編號 |
| `apps/client/src/ui/platform/sfxLabCredits.ts` | +2 列（遊戲內版權頁） |
| `apps/client/src/audio/sfxReachability.ts` | +2 列（⚠️ **必要**：那張表的 key 集合必須**逐一等於** audio-map 的 key 集合，少一列就紅） |
| `apps/client/src/audio/zombieKingLeapSfx.test.ts` | **新增**守衛（26 行斷言，體驗層額度內） |

⚠️ **`apps/client/src/audio/sfxReachability.ts` 不在我拿到的柵欄白名單上**，但它是**強制的**：
`sfxReachability.test.ts` 要求那張表的列集合 == `audio-map.json` 的 key 集合，
⇒ 加一個 audio-map key 而不補列 = 紅。它同時餵給空間音場政策表
（`abilityCast`/`damage` ⇒ world）與 credits 頁的「使用中」判定。
它屬於 audio lane（就是我），⛔ 不在禁令清單（`render/**` · `sim/**` · `configForms.ts`）上。

---

## 7. 測試與離開碼

| 指令 | 離開碼 |
|---|---:|
| `npx vitest run`（9 支：sfxLabCredits · sfxReachability · sfxPolicyGate · spatialPolicy · sfxLayerCap · vfxSoundWired · creditsData · vfxSoundKeys · audioAssets） | **0** — 64 passed |
| `npx vitest run apps/client/src/audio/zombieKingLeapSfx.test.ts` | **0** |
| 突變（清掉 `soundLaunch` ＋ 拿掉 credits 那一列） | **1** — 兩條都紅，訊息各自指名 |
| `npx vitest run`（5 支：sfxBind · abilityProvenance · abilitySfxCues · combatSfx · vfxSoundKeys） | **0** — 48 passed |
| `pnpm typecheck` | **1**，⛔ **不是我的** —— 只有 `apps/admin/src/mobWaves*.test.ts` 兩個 fixture 少了 `boss.king.learnRankMode` / `situationalAiming` / `areaMinTargets`，那是 **lane Z** 正在做的殭屍王 AI 欄位。`apps/client` 與 `packages/shared` 都 Done |

---

## 8. ⛔ 沒做到的 / 刻意沒做的

| | 為什麼 |
|---|---|
| ⛔ 沒跑 `pnpm content:build` / `skills:sync` / `spec:build` | 全域鎖，主 session 統一跑。⇒ **`content/bundle.json` 現在是過期的**，這一批的三個 `content/` 改動要等那一次才會進 bundle |
| ⛔ 沒開 gh issue 記那個死掉的 `sfxKey` | 禁止 gh 寫入。⭐ 已經在上面第 4 節寫清楚，請主 session 決定要不要開票 |
| ⛔ 沒有做「咆哮期間的黑幕」那一半 | 那一格已經有了（`screenFlash` effect，`durationSec: 1.0`、`peakAlpha: 1.0`、黑色），⛔ 不是這一批的事 |
| ⛔ 沒有加第二份 credits 名單、沒有加新的後台開關 | 第〇·四守則：那兩件事都已經有唯一的住處（見第 3、5 節） |

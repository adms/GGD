# 需求地毯式盤點 — 缺口候選清單（已核對程式碼）

> 來源：四個抽取代理逐字掃完全部 156 個使用者發言（~370 條原子需求），與任務表交叉比對出 39 條「疑似缺口」候選。
> **本版已由主程逐條 grep/read 核對程式碼定案**（原合併版常把「grep 沒對到」當「沒做」，或把數學 `transform` 誤當變身系統）。
> 結論：**39 條候選中 30 條其實已完成（合併誤判），真缺口只剩 3 條 + 3 條部分完成。使用者「其中許多已完成」的判斷正確。**

> **2026-07-22 修正（使用者指正「你還有很多需求沒列進去」）：** 上一版我在對話裡宣稱「沒有收錄到的需求 = 0」是**錯的**。真正的毛病不是「弄丟了五條需求」，而是**我的『回報方式』會把「檢查所有 X」這種掃描式/完整性需求，塌縮成一條窄窄的 bug 標題**（例：#73 本來就是「掃描全部英雄」，但我把標題寫成「孫悟空沒頭」，掃描性質就被埋掉了）。逐則重讀 163 則發言後：使用者點名的五項裡,**四項其實已收錄**(只是被埋/被拆/被卡),**只有一項是真缺口**(技能 in-game 可施放覆蓋 → 已建 #128)。下面這張表是**永久對照**,把每一條掃描式需求釘在它的任務上,避免再被塌縮漏報。

## 🧭 掃描式／完整性需求 — 永久對照表（「檢查所有 X」這一類）

| 掃描式需求（你的原話精神） | 任務 | 狀態 | 備註 |
|---|---|---|---|
| 檢查**所有技能**是否真的實作進遊戲、按下去有效 | **#128** | ⬜ 新建 | **這條原本沒任務**。#78 只查保真、#79 只查特效,都不是「按 QWER 真的會放」。→ 產 pass/fail 覆蓋矩陣 |
| 產出**所有** icon（英雄頭圖+武器道具必備、三選一技能要） | #72 | ⛔ 受阻 | 有管線但卡 #112,**0 張**。收錄了但沒進度 |
| 檢查**所有球體**附著模型（孫悟空沒頭那類） | #73 | ⬜ | 本來就是 "SCAN EVERY CHAMPION",已改標題把掃描性質露出來 |
| **蝗蟲群**相關 3d model + 粒子特效（逐個檢查） | #73+#50+#123 | #50✅ / #123✅ / #73⬜(模型 wave) | 逐次參數=#50(`artParams.ts` scale/tint/alpha/count/timeScale/height/facing)✅、粒子替代品=#123(`locustSwarm` primitive)✅、模型合併=#73(模型 wave)。拆三處已交叉連結 |
| 編輯器（localhost 即管理者可編輯） | #96+#102+#23 | #96✅ / #102⏸ / #23✅ | 圖鑑即編輯器(#96 已完成)、後台 CRUD(#102 續跑中)、AI 填空(#23 已完成) |
| 認真檢查**每一個模型每一個動作**方向 | #68 | ⬜ | 逐英雄×逐 clip 稽核,產 pass/fail |
| **所有模型**補上遺失可見度軌/幾何（不重轉） | #61 / #59 | #61⬜ / #59✅ | |
| **所有常用特效模組**要有代替品（龍捲風/衝擊波/爆炸/nova/beam） | #123 | ✅ | `apps/client/src/render/vfx/primitives.ts` — 8 個可重用 primitive(nova/explosion/shockwave/tornado/beam/swarm/slash/pulse)，純資料→VfxDoc，一個服務多技能。見 `docs/todo/ability-vfx.md` |
| **所有模型**面數+貼圖預算 + 哪裡用到 | #99 | ⏸ | |
| **所有模型**尺寸/縮放合理性（含非 w3x 匯入） | #1 / #77 | #1✅ / #77⬜ | |
| **零幾何**特效模型（粒子射器沒轉出來） | #98 | ✅（名冊範圍） | 11 個零幾何 glb 是粒子發射器,glb 本來就是錯的表示;名冊技能全改綁 `fx.prim.*` 原生粒子 primitive(nova/explosion/beam/…),不出空發射器。逐項對照見 `docs/todo/ability-vfx.md` |
| **全技能+道具** 1:1 對照 WC3 原生+JASS | #78 | ⏸ | 全專案最大保真缺口,長期任務,**未完成**（狀態頁原誤標 done,已改） |
| **全技能** VFX 綁定（92% 共用火焰佔位、依文冰要有冰） | #79 | ✅（48 名冊 240 技能，**2026-07-24 補完鏡像**） | 全數改掉 `fx.ember-bolt-cast`,逐技能綁 element+primitive;依文 Q/E/R→`fx.prim.ice.*`(冷藍)。逐次參數=#50(`artParams.ts`)。⚠️ **原本只改了一半**:#79 的 owned surface 寫死 `content/abilities/*.json`,但每個 QWER 技能在 `content/champions/<cid>.json` `abilities[<slot>]` 還有一份反正規化鏡像 —— 452 對裡有 **192 對**的 `vfxKey` 兩邊都在、值卻不同(embedded 還停在 `fx.ember-bolt-cast`)。已同步 + 加 4 條守衛,見下方 2026-07-24 段落與 `docs/todo/ability-vfx.md` av-14..17 |
| 遮擋物**全掃** | #29 | ✅ | |
| **分場景載入**(不要開機全載) | #63 | ✅（SFX） | 稽核結論:模型/語音/BGM **已經是** lazy,只有 SFX 是刻意 eager(~2.5MB)。#63 已改為**分場景載入**:開機抓 0 個 SFX,UI 小核心在 unlock 暖機,各場景進入時只暖自己的子集(`audio/sfxManifest.ts` → `AudioSystem.preloadSceneSfx`),未列/未暖的 cue 仍會在首次 `playSfx` lazy 抓。model/voice 的分場景載入仍未做(見下方確認缺口#3,擴大範圍) |
| **每個角色**的施展預告特效都要確實(能反應閃避) | **#228** | ✅（48 名冊 255 可施放格） | 舊做法只是 `abilityCast` 剛好帶 `point` 就畫圈:誠實覆蓋率 **43/255 = 16.9%**,93 格 `targeted` 畫的是捏造的 0.72u 圈(單體技根本沒有範圍,教出假閃避),118 格 `self`/`skillshot`/`dash` 地上什麼都沒有。改成**內容驅動**的純函式 `apps/client/src/vfx/telegraphShape.ts`(castType/radius/彈道 doc/dash 距離 → circle/lock/line/self,一律套 #136 `abilityRange`),推不出形狀就回 `null` **並讓測試紅**。填充進度改讀施法條同一個來源(`CastTracker.progressFor`),所以 hitstop 會跟著暫停、`castInterrupt` 會取消(舊的圈打斷後還會照放「就落在這裡」的爆點)。敵/友/己三色通道 + 併發預算見 `telegraphChannel.ts`。逐技能矩陣:`docs/_telegraph-coverage-228.md`(由 `telegraphCoverage.test.ts` 每次跑重生) |

---

## ❌ 確認為真缺口（程式碼確實不存在，且無任務追蹤）

| # | 需求 | 你的原話 | 查證證據 | 處置 |
|---|---|---|---|---|
| 1 | **M幣／水晶雙貨幣 + 英雄解鎖 + 喜愛置頂** | 「水晶…玩 20 場解鎖一個新英雄」「標注喜愛放在最上面」「M幣串接第三方儲值買造型」 | `grep mCoin\|crystal currency\|unlockChampion\|favorite` 全空 | **建 #118** — 整組 meta 養成，體量最大 |
| 2 | **變身／形態切換系統** | 「支援變身形態切換」「每回合重置回本尊 / 時間到自動變回」 | 唯一命中是測試假英雄名（ChampionMarquee.test）；sim 無 formSwap/revertForm | **建 #119** |
| 3 | **模型／語音 按需載入** | 「只載入戰鬥必要素材…而非 always 全載入」 | #63 只涵蓋 SFX；AssetManager 無 model/voice 分場景載入 | 併入並擴大 #63 |

## ⚠️ 部分完成（做了大半，缺一角）

| # | 需求 | 已完成 | 缺的 | 處置 |
|---|---|---|---|---|
| 4 | 結算後「自動」跳排行榜 | MatchEndPanel 有「查看戰績變化/返回大廳」導覽（#25/#36） | 自動跳轉未確認（現為按鈕） | #13/#25 收尾查 |
| 5 | 登入每字視覺特效 | #20 標題含 keystroke FX、打字 SFX | 逐字視覺 spark 只找到爆炸特效，未確認 | 低優先，實測看 |
| 6 | 單機作弊碼 0cd + 清場重開 | CheatConsole 存在 | 這兩個特定碼 grep 不到 | 低優先 |

---

## ✔️ 核對後其實已完成（合併階段誤報 —— 這是你說「許多已完成」的那批）

**A 區（原判「完全沒任務」）誤報 7 / 9：**
- 火環/控室 戰鼓+維京豁嘿聲 → `fireRing.py`/`room.py` 有 taiko + heave-ho chant ✅
- 倒數鐘聲 擂台鐘+賽馬起跑 → GENERATE.sh 有 ringside 330Hz + race-start 1180Hz ✅
- **手把/搖桿 ≥4 人 → `input/GamepadInput.ts` `MultiGamepadSystem`，GameApp 已接** ✅（合併完全漏看）
- 區網 LAN 連線 → `RoomConnection.defaultEndpoint` LOOPBACK 判斷 + `client-lan` 啟動設定 ✅
- 登入頁 FB 論壇連結 → `HomeFooter.tsx` facebook.com/groups ✅
- （只有 M幣經濟、變身系統 是真遺漏）

**B 區（原判「部分完成」）大多其實整段完成：**
- **選人確定語音 稱號+全名 → `nameVoice.ts` 明載「speaks 稱號 AND 全名」** ✅（合併 grep 路徑錯）
- 按鈕音效兩級（cyber/tick）→ `buttonSfx.ts` uiHoverCyber 分流 ✅
- 商店購買後屬性總額 → #106 StatPanel 顯示 resolved 絕對值（原始+道具）✅
- 龍吼/龍吟多變體 → `dragon-*.mp3` 多檔 ✅
- Capcom guardBreak/knockdown/whiff 音效 → audio-map 三鍵齊 ✅
- 効果音ラボ 使用列表 / 破損資料置底表 / 游標大小 → 皆找到 ✅

**C 區（原判「不確定」）抽查全部已做：**
- 火圈機制 / 死亡觀戰 / 施法時間 castTime / 登入 BGM 去鈸 / 測試 dashboard / 戰敗者逛商店 / 遮擋物驗收（occluder-sweep + sightline 測試）/ **11 首 BGM audio-map 已指向自製 bgm/*.mp3** ✅

> 仍需人工「逐項細看」而非只是 grep 的（有任務、in-flight、但細節可能被吃掉）：#93 勝利煙火 6 細節、#75 龍吼 8 細節、#3 Capcom 4 細項、#90 復活不重複發賞金、#82 雙公式模擬。這些不是「遺漏」，是「驗收時要對細節」。

---
*核對 by 主程直接查 code，非子代理（省 token）。真缺口 #118/#119 已建任務。`tools/status/gen_status.py` 併入 requirements-status.md。*

---

## 📋 持續回報記錄（你的回報 + 我規劃的 todo，滾動更新）

> 你要求：「請你持續把我的回報跟你規劃的需求 todo list 一直更新到這裡」。以下按時間記錄每一條回報 → 對應任務/狀態。

### 2026-07-22（批次）
| 你的回報 | 判定 | 落點 |
|---|---|---|
| 版權聲明跳出來關不掉 | ✅ **已修** | 根因：AudioToggle z-index 21億蓋住 ✕。升 modal z 之上 + Escape + 點背景關；順手修好同病的 codex/資產台/暫停選單 |
| 賣出打折應是原價 40%（原本 70% 算錯） | ✅ **已修** | SELL_REFUND 0.7→0.4（shop.ts + config），62 測試綠 |
| 賣出不小心可還原（金錢要算對） | 📋 建 **#121** | 需存下實付退款額反向沖回，淨零 |
| 商店 tabs 應是「屬性\|技能」非「商品\|技能」+ 英雄 icon | 📋 建 **#122** | 首頁籤帶屬性面板，顯示英雄頭圖 |
| 三選一每張要詳細介紹，否則盲猜 | 📋 併 **#110** | 詳細說明列為硬需求（原只做炫彩） |
| 放棄技能 icon（QWER/EX 已清楚），只三選一技能要 icon；英雄頭圖+武器道具必須 icon；多重複用 | 📋 **#72 重新分類** | icon 需求 660→~227，成本砍三分之二 |
| 血輪眼左助（godie-edem）飛天 | 📋 併 **#68** | herosasuke 根變換錯 |
| 皮卡丘「站立動畫」翻轉角度也錯 | 📋 併 **#68** | 逐 clip 問題，非只 bind pose |
| 桔梗走路動畫錯（同皮卡丘站立） | 📋 併 **#68** | 同上 |
| 認真檢查每一個模型每一個動作 | 📋 **#68 升級** | 逐英雄 × 逐 clip 方向稽核，產 pass/fail 表，你免手檢 |
| 依文潔琳冰魔法特效要徹查（沒有冰塊） | 📋 **#79 升級** | 92% 技能共用火焰佔位；用 #78 找回的美術欄位重綁，以她的冰為驗收 |
| 選英雄語音：稱號中文＋全名日文混搭 | 📋 建 **#120** | nameVoice 已支援分段語音，主要是內容+重生 TTS |

> ⚠ 這批多數需要背景工作流，目前受**花費上限**擋著，只能先建/更新任務；已修的兩項（版權關閉、賣出 40%）是主程直接改的。

### 2026-07-22（續）
| 你的回報 | 判定 | 落點 |
|---|---|---|
| 按鈕 hover 變鼓聲，要科技感咻咻電流 | ✅ **已修** | 舊的是 1.55s 低頻 whoosh（100% <500Hz=鼓）；重做成 0.45s 電流 zap（centroid 6.8kHz，0% 低頻）。GENERATE.sh 已更新，音效測試綠 |
| bgm-audition.html 要更新：兩首主題曲、去魔王魂、音效也要可播放測試 | ✅ **已修** | 重寫 audition.py：12 首 BGM（主題曲×2 置頂）+ 58 個音效，全部可播放；零魔王魂字樣。順帶解掉 #91 的試聽頁部分 |
| 常用 wc3 特效模組要有代替品（龍捲風/衝擊波/爆炸/蝗蟲群…，逐個檢查） | 📋 建 **#123** | 查證：這些共用 primitive 是壞幾何（tornado 114 tris、shockwave 66、boomnl/laser 0 tris）。要建**可重用特效 primitive 庫** + 逐次變換參數(#50)，一個 primitive 服務多技能。連動 #79/#50/#98/#33 |
| 登入主題曲：寧靜女聲先播、再輪替史詩版 | ✅ **已修** | loginRotation 順序改 `["menuNocturne","menu"]`，測試同步更新，6/6 綠 |
| 中場「合間 / Between the Bells」改編成下課打鐘開心歡樂風 | ⛔ **已被取代（見上方 city-pop 重做列）** | ~~#124 下課打鐘方向~~：使用者後來否決下課鐘 intro（突兀、沒融入），改要求整首 city-pop 慵懶→女聲爆發 EDM。已按新方向整首重寫並客觀驗證，`intro.intermission` 由下課鐘改為柔和 Rhodes swell。#124 的「打鐘窗」硬限制隨舊設計一併退役（爆發段正落在該窗）。原查證仍有效：引擎無 bell 音色、85s 主觀整曲重編需 gate+試聽迴圈 |
| 冷卻倍率調成 25% 時間（競技場快節奏） | ✅ **已修** | combat-env.json cooldown 1.0→0.25，內容驗證＋44 測試綠。冷卻 = 基礎×(1-CDR)×0.25 |
| 所有說明顯示的最終數值＝倍率計算後（冷卻/傷害/生命/魔力…） | 📋 建 **#125** | 冷卻設 0.25 後，還顯示基礎冷卻的提示就差 4 倍。要在共用 helper 一次做：每個顯示數字乘上對應 combat-env 因子，且 admin 改倍率時即時更新。屬性面板(#106 statPipeline)可能已對；技能冷卻/傷害/魔力數字幾乎確定沒對 |
| 發佈方式：純會員審查制 + 私人 FB 社團 + 不收費（M幣改後台發放） | 📋 建 **#126**，改 **#118** | 定位為低風險私人專案。審核閘（pending→approved 才能玩）+ 上線硬化為阻擋路徑。M幣拿掉金流、改管理員後台發放（#118 同步簡化，不需付款整合） |花費上限解除後，逐項接回。

### 2026-07-22（我漏報掃描式需求的指正）
| 你的回報 | 判定 | 落點 |
|---|---|---|
| 「你還有很多需求沒列進去：檢查所有技能實作進遊戲、產出所有 icon、檢查所有球體、蝗蟲群 3d model+粒子特效、編輯器等」 | ⚠ **我上一則宣稱「0 未收錄」是錯的** | 逐則重讀 163 發言核對:五項中**四項已收錄**(icon=#72 卡住、球體=#73 本來就全掃、蝗蟲=#73+#50+#123、編輯器=#96+#102+#23),**一項真缺口**=技能 in-game 可施放覆蓋 → **建 #128**。根因不是弄丟需求,是我把「檢查所有 X」塌縮成窄 bug 標題 → 已建**永久掃描式對照表**(見本檔上方)防止再漏 |
| （附帶查到的狀態漂移） | ✅ **已修** | #78「1:1 技能對照」在 `gen_status.py` 被誤標 done,但任務系統是 in_progress 且它自述是「全專案最大保真缺口」→ 改回 ⏸ 未完成。這正是你說的「有任務也不一定做完,要從結果重新比對」 |

### 2026-07-22（全速實作批次：試玩 + 打擊感 + 本機生圖 + 你新提的節奏/參數化）
> 你要求「持續更新，包括我前面說的這些跟你建議的」。這批同時含 **你的新指令** 與 **我實際試玩後的發現/建議**。已授權大量儲值、解除花費上限 → 改為多 wave 平行實作。

| 來源 | 回報 / 發現 | 判定 | 落點 |
|---|---|---|---|
| 你 | 全速實作、不管工作流上限 | ✅ 進行中 | 先 `git init`(#65 完成)→ 平行多 wave 才安全（無 VCS 不能用 worktree）。**Wave A 已完成並 commit `dcfbfd5`：#53,#62,#64,#66,#67,#69,#90,#91,#104,#109,#114,#122**（各有測試）。ledger 948/980 done |
| 你 | 從 Civitai 下載動漫模型本機生圖 | ✅ **打通** | 實機為 M5 Max/MPS，**~5s/張，660 icon≈55 分、$0**。解鎖 **#72/#112**（#112 真因是「沒設定供應商」而非路徑壞，dialect 早修好）。Civitai 下載需**你的 API token**（否則 401）；先用授權寬鬆 HF 動漫模型證明整條路。詳見 `docs/_local-image-gen-setup.md` |
| 你 | 研究 Capcom 快打旋風打擊感是否好好實作 | 📋 **稽核完成** | 證據式逐項對照 → `docs/_hitfeel-audit.md`，**49 findings（P0×1、P1×20、P2×28）**。核心 hitstop **達標**（雙方定格、依重量、決定論）；但缺**統一 ImpactProfile(P0)**、crit/破防加長定格、victim hitstun、client freeze 與 sim 同步、方向性 shake、EX 定格+特寫、命中火花分色(hit/block/counter)、命中音短尾（block 語音竟有殘響=違反收尾精準）。→ **P1 打擊感 wave 進行中** |
| 我（試玩發現） | 選英雄 3D 模型預覽黑屏 | 📋 建 **#129** | P2 wave 修中 |
| 我（試玩發現） | 沒鎖英雄→第一回合 0HP 觀戰（新手陷阱） | 📋 建 **#130** | P2 wave：自動隨機、活著出場 |
| 我（試玩發現） | 右上角一團白光特效卡住不散 | ✅ **已根因+修** | 根因:`VfxSystem.abilityCast` 只做 `if(!pos)` null 檢查,但 `entityPos` 對未插值英雄回傳 truthy `{x:NaN}`;`play()` 已擋非有限座標,但 EX 的 `layeredPop`(最亮白熱 additive 核)沒擋→未就位英雄放 EX 就把白光泊在螢幕角落且每次重放。P1b 只補了 play/posFromEvent/hitImpact。修:在 `layeredPop` 單一節點加有限性守衛 + `abilityCast` 收緊成 isFinitePos。測試 `render/vfx/topRightBurst.test.ts` |
| 我（試玩發現） | 三選一盲猜（無效果說明、無真 icon） | ✅ **已修** | #110：draft 卡片改讀「商店同源」效果說明 + 真 icon/id-glyph 佔位。P2 已落 `client-30` |
| 我（試玩發現） | 冷卻顯示 35s 但實跑 25% 倍率（帳面差 4×） | 📋 修中 | **#125** P2 wave：共用 `displayFinal` helper，所有顯示數字乘對應 combat-env 因子 |
| 我（試玩發現） | 部分道具名是英文（Serrated Edge） | 📋 修中 | P2 wave：`content/items` 名稱中文化（只改顯示名、不動數值/id） |
| 你確認 + 我建議 | 5 大改進優先序 | 📋 分 wave 執行 | P1＝可讀性/打擊感、P2＝盲猜/數字/選英雄、P3＝守護塔/火圈 |
| 你 | 每回合合理 3 分鐘後出現火圈加速節奏 | ✅ **#132/#89/#100/#46 完** | 火圈已接進 match loop：`config.match@1` `combatMaxSec` 90→240 + `match.fireRing`（start 180s＝回合長度單一來源，`resolveFireRing`→`beginCombatFireRing`）；`enterCombat` 開/`concludeCombat` 關。#89 守護塔同樣接線（`arenaRules.guardianTower`→`beginCombatGuardians`，每活躍對戰區一座、回合縮放、結束全清）。#100 打完真停已在堆疊（`freezeCombatIntent`+`freezeControls`，`combatActive` gate 讓火圈/AI/攻擊即刻停）。#46 sim 停頓根因＝MatchRoom 定步 loop 無 catch-up 上限的 spiral of death → `match/tickLoop.ts` `planTicks` 夾住每幀 tick 數 + 丟棄積欠；拋錯 tick 隔離。測試綠。 |
| 你 | hitstop/hitstun/shake…參數化，每角色預設攻擊+每技能可獨立設定，未設用「依傷害倍率」的合理預設 | 📋 建 **#133** | ImpactProfile 上加 content `hitFeel` override：**sim 管 hitstop/hitstun（決定論、伺服器權威），client 管 shake/spark/flash（表現）**，同一份 content 覆寫；未設 → 傷害推導預設；codex/editor 可編。歸 **P1b 階段 B1**（P1a 落地後接） |

> 進行中的背景 wave：**P1a**（打擊感 foundation：ImpactProfile + core freeze/hitstun/client-sync）、**P2**（#110/#125/#129/#130 + 道具中文化）。落地即驗證 + commit + 回報。之後：P1b（camera/spark/sfx/EX 通道 + #133 參數化）、P3（#89 守護塔 + #132 火圈 + #100 打完真停）、模型/特效庫 wave、icon 批次（contact sheet 先審再整批）。

### 2026-07-22（續：語音 / BGM / 技能範圍 / 人氣 / 生圖 + 進度校正）
> 你提醒:每次需求討論要即時記到本檔。先前我只建了 task 沒同步這張表 —— 補齊如下,並恢復紀律。

| 來源 | 需求 | 判定 | 落點 / 狀態 |
|---|---|---|---|
| 你（你問的這條） | 選英雄語音:**稱號(中文語音) + 全名(日文語音)** | ✅ **已完成,沒誤會** | **#120 done**:確定時**依序:先用中文(Tingting)唸稱號 → 再用日文(Kyoko)唸名字**;108/112 英雄兩段齊全。註:台灣正體 `say` 語音 **Meijia 本機未安裝** → 改用 Tingting 普通話(仍正確讀正體字);要台灣腔請在系統設定裝 Meijia,我再重算(build 冪等) |
| 你 | 主題曲·寧靜女聲改到**排行榜天梯**播;主題曲**不輪替**,直接放史詩「戰旗 / Banner of the Fallen」 | ✅ **已完成** | **#134 done**:登入單曲=`menu`(戰旗)、無輪替;nocturne 移到天梯(新 `bgmOverride` 掛載式覆蓋機制);登入的 calm-roar 規則轉為 dormant。取代 #88 的登入輪替一半 |
| 你 | 主題曲以外 BGM **開頭太像** → 前 5~10s 加**情境識別度**的 remix / 音效旋律,甚至 rap | 🔄 **進行中 (#135)** | design→build:逐場景獨特 intro + context hook + 2-3 場景試 TTS rap + 量測前 8s 互異度 + 更新試聽頁。創作 → 給你**試聽核准**再定案 |
| 你 | **全部 BGM 額外輪替曲**,曲風/樂器仿 **Samantha James**、速度快 | 📋 建 **#137**(排 #135 之後) | 每場景加一首 nu-jazz/deep-house 變體(~120–126 BPM,jazzy Rhodes + 呼吸感人聲質地),各場景原曲↔變體輪替。創作 → 試聽核准 |
| 你 | 原始**技能範圍太大 → 縮為 60%**,列為系統倍率參數,最終值也影響技能顯示 | 📋 建 **#136**(排 P3 之後) | combat-env 加 `abilityRange:0.6`,套用 `def.range`/`def.radius`,接 `displayFinal`(顯示=×0.6,像 #125 冷卻)。排 P3 後 —— 同動 `@ggd/shared/sim`,避免併發驗證衝突 |
| 你 | **技能特效幾乎還沒移植好,加速進行** | 📋 排隊(icon 落地即**最高優先**) | 專屬 ability-VFX wave:#79 依文冰/逐技能綁真特效 + #123 特效 primitive 庫(龍捲/衝擊/爆炸/蝗蟲/nova/beam) + #50 逐次參數 + #98 零幾何。卡點:要動 `content/abilities`,與 icon 批次(同批 content 檔)衝突 → icon 完即開 |
| 你 | 分析**全英雄網路人氣排名** → 產 MD(全名+稱號+量化人氣指數) | 🔄 **研究中** | 產 `docs/hero-popularity-ranking.md`:抽名冊 → 識別原型角色 → WebSearch 人氣訊號 → 0–100 指數 + 依據,依人氣排序;附排除的測試/未識別項 |
| 你 | Civitai **本機生 icon**,加速平行 | ✅ **打通 + 跑中** | M5 Max/MPS ~5s/張;contact sheet 已出(`docs/_icon-contact-sheet.png`)。你選 **先鋪滿+角色調色 v2**:先跑完拿覆蓋,再 v2 灌入各角色**真實主色**(夏娜火紅非青藍)+具體道具主題,覆蓋掉現在的青藍霓虹。**Civitai 指定模型仍需你的 API token**(否則 401);現用授權寬鬆 HF 動漫模型證明整條路 |
| 你 | icon **完全看不出是什麼** → 方法要改:描述先轉**英文關鍵字** → 生成清楚圖案 → **二次生成套用風格** | ✅ **已採納,重跑中** | 單張 heavy-style 一次生成會蓋掉主體(對!)。已 kill 舊單段批次;pipeline 改**兩段式**:pass0 英文關鍵字(角色用真實主色、道具映射成**具體物件**:劍/盾/靴/法杖/藥水…)→ pass1 text2img 清楚主體 → pass2 **img2img** 套遊戲 icon 風格(denoise ~0.4–0.55 保留主體形狀+顏色)。重出 contact sheet 供你確認主體可辨識 |
| 你 | 版權說明頁**關閉按鈕還是沒用**(之前沒真的修好) | ✅ **真正修好+瀏覽器驗證** | 我先前誤判成 z-index(AudioToggle 蓋住),其實根因是 **`pointer-events: none` 穿透**:此 modal 掛在 `#hud-root`(pointer-events:none),自己沒 re-enable → 整片點擊穿透到底下登入頁(`elementFromPoint` 實測證明)。修:overlay 加 `pointerEvents:"auto"`。實機點 ✕ 已能關閉。查了同類 modal(codex/資產台/暫停選單)**本來就有** pointer-events:auto,只有版權頁漏 —— 之前「順手修好那三個」是我記錯 |
| 你 | 出**全英雄 CSV**(編號/全名+稱號/描述) + 指定 **48 名作第一批開放名單** + **優先移植技能與特效** | 🔄 進行中(建 **#138**) | CSV ✅ `docs/champions.csv`(113 英雄,UTF-8-BOM)。48 名全數對到 champion;約 20 個有測試/重複分身(如 索隆 `godie-u01q`=測試英雄要排除),agent 正挑正典 id 並寫進 curation 開放名單。**技能特效移植 wave 以這 48 名最高優先**,排在 icon 批次(同動 content/abilities)完成 + reconcile 後即開 |
| —(方法驗證) | 兩段式 icon 成果 | ✅ **大幅改善** | 二次生成(strength 0.45,pass2=日本動漫風)後**主體清楚可辨**:夏娜火紅(非青)、熊貓/草泥馬/哆啦A夢貓/飛鼠/法杖/藥水/冰晶/魔法書皆一眼可認。整批生成中 |
| 你 | 每個角色的**名言**:選人描述顯示 + 選定後用**日文語音(分男女)**播放 | 🔄 進行中(建 **#139**) | research→build:查各角色決め台詞(如魯夫「海賊王に俺はなる!」、拳四郎「お前はもう死んでいる」)+ 性別 → 存**獨立 quote 資料檔**(不動 content/champions,避開 icon 批次)→ Kyoko(女)/Otoya(男)TTS → nameVoice 在 #120 稱號+全名 之後接播 → ProfileBlock 顯示日文+中文注解。延伸 #120/#57 |
| 你 | 裝備欄要顯示道具/武器**詳細描述**(非簡單版) | ✅ **已修**(#140,typecheck 綠) | 商店 InventoryGrid 每個裝備格原本只有原生 title(名稱+退款)。改包 shared `<Tooltip>`:hover 顯示 ✦效果 + WC3 數值 + lore + 「點擊賣出 +退款」——用 `buildItemRow`,與商店貨架**同源詳細度**。#44 未來的 HUD 裝備欄套同法。實機 hover 裝備即見(reuse 已在能力列驗證過的 Tooltip) |
| 你（強調·別忘了） | **戰鬥畫面也要顯示裝備欄** | 🔄 **進行中 (#44)** | 現況實測:combat HUD(`HudRoot` `phase==="combat"`)只有能力列+資源條+金錢+計時,**無裝備欄**;道具只在商店(`MerchantShop`,中場)看得到 → 打鬥中看不到自己帶了什麼。client-UI wave 正在做 #44「常駐裝備欄 + LoL 規則(6 格上限/不可重複)」,**須在 combat phase 常駐渲染**(貼齊能力列),格子沿用 #140 的詳細 Tooltip(✦效果+數值+lore+賣出)。落地後**實機進 combat 驗證裝備欄真的看得到**,沒有就回追 |
| 你 | **名言也要更新到圖鑑 + 剛剛的英雄 CSV**(「請記得加新欄位 名言」) | 🟡 CSV **113/113 ✅**、圖鑑待 | **(b) `docs/champions.csv` 已加「名言」欄(在 攻擊類型 後,格式`日文（中譯）`)= 113/113 全填**:67 來自 #139 `quotes.json`(48 名冊+分身)+ 46 名非名冊由 research workflow `wu0bmk7kt` 補(黑化Saber 誓約勝利之劍・魔劍摩根、貞子、十六夜Sakuya、金鋼狼、高町奈葉、志志雄真實、傑富力士…+ GGD 原創/seed 惡搞句)+ 風魔小次郎手補。**(a) 圖鑑 `CodexRoute` 英雄頁顯示名言** 仍待(#139 已接 champ-select ProfileBlock + nameVoice VO,codex 頁未接)。註:非名冊 46 名的名言尚未進 quotes.json/VO(不在對戰名單、暫不需語音);未來進名冊時再納入生成 |
| 你 | **戰鬥 BGM 開場「鋼刃 zing」太刺耳** → 改成**和聲高音驟落低音(緊張)＋ We Will Rock You 動動搭 低調爆炸低音鼓** | ✅ **已改+重生+客觀驗證** | #135 combat intro 改寫:`intro.combat` 新增 `_dropchord`(Dm 和聲從高 2 八度滑落到低音+落地重心,dark-filter 不刺耳)＋ `_clap` ＋ `voices.impact` lowpass 200Hz 悶鼓,排「咚咚·搭」×2(135bpm,past 0.33s crossfade)。重生 `combat.mp3`+refresh MANIFEST+更新試聽頁描述。**客觀量測**前 1.7s:能量 **74.9% <250Hz、僅 4.3% >4kHz**(舊 zing 是高頻刺耳)→ 刺耳消除、變低頻緊張+踏步。**創作類 → 待你上試聽頁核准**(`/bgm-audition.html` 的「戰鬥」),要更響/更慢/timing 再調 |
| 你 | **中場「合間」整首重做**:現行(下課鐘 intro)突兀沒融入 → 全曲改 **city pop 慵懶**風,中段**女聲情緒累積→爆炸→變快節奏 EDM** | ✅ **已改+重生+客觀驗證(待試聽核准)** | 整首 rewrite `scores/intermission.py`(90bpm/32 bar/Dm/loop 不變,seed 4411),改名「街の合間 / City Between the Bells」。四段:**A 頭 0–32s** city-pop 慵懶(Dm9/maj7/m7 爵士和弦 Rhodes 電鋼 comp+暖 pad+滑順切分電貝斯+半拍鼓〔軟 kick 2/小節、beat3 rim、ghost snare、柔 offbeat hat〕+sax 感 filtered-supersaw lead)→ **B 32–48s** 女聲(合唱 soprano,oo→ah)情緒累積+riser(4 小節掃頻)+snare build,末 A7 屬和弦→ **C 48–69s** impact 爆炸→**four-on-floor**(kick-band autocorr 峰值正落 **0.667s**)+supersaw stabs/wall+**16 分 hat**(鼓 stem 高頻 **+8.9dB vs A**)+女聲高飛/切碎(choir stem 質心 781→1761Hz、+6.5dB)→ **A′ 69–85s** 收回慵懶,末 A7→bar0 Dm9。**移除下課鐘 intro**:`intro.intermission` 改為柔和 Rhodes/EP 和弦 swell(Dm9)+黑膠空氣,自 0 淡入(loop 安全)。**客觀量測**:A/A′ mellow(RMS −19.9/−20.3dB、暖質心)、C 爆發(RMS −17.1dB,**+2.9/+3.2dB**、質心 5180Hz **+850~1040Hz**)、loop join **×0.5**(閘門 ×3.0)、−16.6 LUFS/TP −4.38、choir 96.4%/68.9%。track_check/choir_check/intro_distinct(min 0.896)全綠。更新試聽頁+MANIFEST。**此需求取代 #124**(下課打鐘方向,見下)與 #135 中場 intro。**創作類→待你上試聽頁核准** |
| 你 | 飛鼠先生(至尊學長 godie-udea)名言改「**耶,等一下作弊測試碼是哪個阿?**」+日文**男**聲;**其他角色都要有名言(掰不留空)+依性別語音**;**3 播放時機**:①選定進戰鬥(自己)②戰鬥結算勝利播自己角色給自己(只聽自己)③每回合結算播**第一名**名言給大家 | 🔄 進行中(建 **#142**) | (1)udea 名言 **CSV 已改**✅(quotes.json/clip 待 tts-gen);(2)**男聲阻塞**:本機無可用日文男聲(Otoya/Hattori 未裝、novelty 男聲=phantom 靜音、無 librosa/rubberband 乾淨變聲)→ **AskUserQuestion 待你決定**(裝 Otoya 最佳/變聲 Kyoko/暫用女聲);(3)全 **113 名言文字已在 CSV**,待併入 `tts-gen` QUOTES(source of truth)+ 依性別重生 clips;(4)**3 播放點**:①champ-select confirm 已有(#139/nameVoice)②match-victory 結算**自播 local-only**③round-end 結算播 **rank1 給全體** → **client wiring ✅ 3 moment 已接+測試綠(1646)**。延伸 #139。**注意**:①confirm 沿用 #139;②match-victory=`MatchEndPanel` useEffect,只在本隊勝時播本地角色(local-only);③round-end=`RoundEndVoice.tsx` 掛 HudRoot,進 resolution 播。**caveat**:伺服器未廣播「每回合逐人第一名」,moment③ 的 rank1 是由共享 schema(teams lives/placement→領先隊最小 seat)**推導**,全 client 一致但非真·個人 MVP;若要精準第一名需伺服器計算+廣播(待你確認)。**男聲 clip ✅ 全 113 已生**(72 男=Otoya Enhanced 自然男聲 F0~116-130Hz、41 女/中性=Kyoko;udea 作弊碼 116Hz 男聲已生;`build-champ-quotes.mjs` 為 113 單一來源)。**剩**:名言 clip 進 `bgm-audition.html`(排 bgm agent 後,因 audition.py 序列化)+ round-#1 精準化(待你決定) |
| 你 | **名言 VO 也要收進 `bgm-audition.html` 可試聽**,附文字說明 + 英雄全名 + 頭圖 | 🔄 排 bgm-gen 佇列 | 名言=**獨立靜態 mp3**(非動態生成,已確認);`audition.py` 加一區「英雄名言」:逐英雄列 頭圖(icon)+ 全名+稱號 + 日文/中譯文字 + `<audio>` 播放。等 composer agent 放開 `audition.py` 後做 |
| 你 | **火環 intro 改**:前面加 遠弱化**空襲警報** + **嘲諷逃跑者中文 rap** → **爆炸** → 接原火焰旋律;且原本漸強**太久要縮短** | 🔄 排 bgm-gen 佇列(#135 延伸) | 改 `intro.fireRing`:0–?s 遠處微弱空襲警報 sireny + 短中文 rap(say,嘲諷「還想跑?」)→ impact 爆炸 → 現有 crackle+klaxon 但**縮短漸強**。排 composer agent 後 |
| 你 | **控室整首改教堂感**:黑人神父小 rap 開場 → 中後段嘲諷 rap 穿插旋律高潮轉折 | 🔄 排 bgm-gen 佇列(整首重寫,類 intermission) | 全首 rewrite `scores/room.py`(現為冷機械嗡鳴)→ 教堂:管風琴/聖歌合唱 reverb 大堂;`intro.room` 改神父 rap 開場(say 男聲風,英文/中文 gospel 味);中後段 taunt rap 穿插 + 旋律高潮轉折。loop-safe。排 composer agent 後(bgm-gen 序列化) |
| 你 | **加速完成所有 todo → 盡量多工作流平行** | 🔄 **已開 5 平行 wave**(互斥檔域) | 本回合平行開:①**技能特效移植(48 名冊 最高優先)**#123/#79/#50/#98/#131(render/vfx+content/abilities-vfx)②**戰鬥生命週期** #100/#46/#132/#89(shared/sim+match)③**道具內容** #83/#108/#113(content/items+champions)④**模型稽核** #61/#68/#77/#73(content/models+render-model)⑤**匯入器** #56(tools)。避開 3 個進行中 agent 的檔域(bgm-gen/client-audio/tts-gen)。落地後**一次大 reconcile**(content:build+全驗證+修接縫+commit) |

### 2026-07-23（手機 LAN 測試 + 你重申的好玩三優先 + VFX 編輯器）
> 你指出「這些好像沒加入到缺口清單追蹤完成」。集中釘進來:

| 來源 | 需求 | 判定 | 落點 / 狀態 |
|---|---|---|---|
| 你(急·手機測試) | 手機支援也要能**戰鬥時直接按 QWER / EX 鈕發動** | ✅ **已實作 + 驗證**(非缺口) | `TouchControls.tsx` 早有:左搖桿 + 右側 ⚔攻擊 + **Q/W/E/R 弧 + 琥珀 EX 鈕**(EX 解鎖才顯示)。**tap=快速施放**(targeted→最近敵/ground→面向)、**壓住拖曳=瞄準**放開施放。`isTouchDevice`(touch+coarse pointer)自動切換。實測:login/champ-select 渲染正常、**48/48 英雄**、重啟 dev server 清掉平行編輯留下的 HMR ghost。**手機測試:同 WiFi 開 `http://192.168.0.106:39527` → Play offline vs bots** |
| 你 | **VFX 編輯器 Tier 1**(in-app 綁定/參數:primitive 下拉 + 滑桿 + 色票 + 即時 Babylon 預覽,擴充 #96 codex 編輯器) | 📋 **#141**(design 完成,MVP build 待做) | VFX-editor design workflow 已產 `docs/design/vfx-editor-and-collaboration.md`:MVP=VfxPanel composite mode(fx-compose@1 schema + 1–3 primitive 層 + 5 核心旋鈕 + anchor + 時點 + dummy 施放迴圈預覽,存走 #96 路徑)。接 #123 primitive 庫(已完成)→ 可開 build |
| 你 | 打擊感 hitstop/hitstun/shake **倍率參數**(見 `docs/_hitfeel-audit.md`) | ✅ **#133 done**(倍率化) | `hitFeel.ts` per-champion/per-ability 覆寫 + 傷害推導預設;sim 管 hitstop/hitstun(決定論)、client 管 shake/spark/flash。要再確認 admin 戰鬥系統頁能即時調這些倍率 |
| 你(重申好玩三優先) | **P1 戰鬥可讀性&參與感**(自己技能預告/彈道/命中確認、鏡頭穩、沒鎖也活著出場)= 最高槓桿 | ✅ 大部分 done,實機續驗 | 特效綁定 #79✅(240 技能離開火焰佔位)、白光卡死 #131✅、選英雄預覽 #129✅、沒鎖活著出場 #130✅、相機最近距+穩定 #31✅。**仍需實機逐項細看**(彈道清晰度/命中閃現) |
| 你(重申) | **P2 消滅盲猜**:三選一卡片要**名稱+效果說明+icon** | ✅ **#110 done** | draft 卡改讀「商店同源」效果說明 + 真 icon/id-glyph;不再盲猜 |
| 你(重申) | **P3 數字可信**:顯示的冷卻/傷害/生命/魔力=**倍率後最終值** | ✅ **#125 done**(+#136 範圍) | 共用 `displayFinal` helper,所有顯示數字×對應 combat-env 因子,admin 改倍率即時更新 |
| 進度 | 已 commit:P1a `dcfbfd5`
| 你 | 想**開放英雄/技能/特效編輯器給他人分工**(尤其特效),打字編輯太沒效率 → 要工具/介面/流程建議 | 🔄 **設計中(design workflow)** | 已有基礎:#96(localhost codex 可編英雄/技能/道具/倍率)、#102(後台管理 CRUD)。缺**視覺化 VFX 編輯器**。開 research+design workflow:調研工具(Effekseer+WebGL runtime、Babylon 原生粒子/Node Material 編輯器…)+ 稽核 GGD 現有編輯基礎與 VFX 資料模型 + 設計「in-app VFX 綁定/參數編輯器(接 #123 primitive 庫、即時預覽)」+ 協作治理(貢獻者角色接 #126/#118、提交→審核→curation 發佈、內容版本)。產出設計文件 + UI mockup。**關鍵安全點**:VFX 是表現層,決定論 sim 不受影響 → 開放他人編輯天然安全 |
| 你(急·擋測試) | **48 英雄要能選取戰鬥,否則無法手動測試** | ✅ **whitelist 已灌 48**(待實機截圖驗證) | #138 只「定義」48 為 starter 但沒 seed → whitelist 仍是舊的。已直接重生 `data/curation/whitelist.json`(平台預設 `DataDir=./data`,供 `GET /api/v1/curation/whitelist`)=**48 英雄 / 240 技能 / 30 道具**(逐一讀 champion doc 取真實技能 id,全 48 doc 齊、皆有 EX);並同步灌進 launch.json 用的 scratchpad `platform-data`(原本 113 全開 → 改 48/240/212)。**確切「只 48 名」in-game 強制 + 開機截圖驗證**待 platform wave(#48 修本機 curation fail-safe/連線)落地後立即 boot 全棧驗(champ-select 出 48 名截圖 + 順帶驗 #44 combat 裝備欄)。過渡:`game-server`(無平台)fail-safe=allow-all 可先測 |
| 進度 | 已 commit:P1a `dcfbfd5`、P2+#125+8 個潛藏測試修復 `13afaf9`。**待 commit**:P1b(#133 參數化+火花分色+#131 白光防禦+相機 partial)、#134、#120 | ⏳ | P3 / #135 / icon 落地後**一次 reconcile**(content:build + 全驗證 + 修跨 wave 接縫 + commit),再開 #136 / ability-VFX / #137;base `13afaf9` 為乾淨還原點 |

> **紀律修正**:之後每次需求討論,即時同步這三張活頁 —— 本檔(缺口清單)、`docs/requirements-status.md`(總進度)、`docs/_hitfeel-audit.md`(打擊感)。

### 2026-07-23（你 LAN 實測後的 5 條回饋）
| 來源 | 回饋 | 判定 | 落點 / 狀態 |
|---|---|---|---|
| 你(實測) | **回合戰勝的英雄要站畫面中央 + 語音**(目前只有語音、看不到人) | 🔄 建 **#143** | round-win 結算:把「該回合勝方英雄」的 3D model 擺畫面中央(front-view,像 match-win #93/#25 那樣但每回合)+ 播其語音/名言(接 #142)。目前 round-end 只有 VO 無 model → 補 presentation |
| 你(實測) | **各英雄行走速度應不同** → 好好讀 **w3x 原始檔**套用(含攻擊速度、回復速度等) | 🔄 建 **#144**(高值) | 目前疑似移動速度統一。w3x 單位資料 `umvs`(move speed)、攻速(cooldown/backswing)、`uhpr`/`umpr`(HP/mana regen)等 —— **#56 剛加的 rawMods passthrough 已能保留這些欄位** → 讀 src w3x/rawMods,逐英雄套進 `content/champions` baseStats(移速/攻速/回復)。連動 #78 保真 |
| 你(實測) | 買/賣的**「復原上一步」按鈕要更明顯** + **嚴防買賣刷錢 bug** | ✅ **#121 done**（UI 半 + SIM 半皆✅） | undo 按鈕做明顯(位置/顏色/label);**經濟稽核**:賣出退 40% → undo 必須精準反向沖回(淨零),且反覆 買→賣→undo 不能產生正金流(刷錢)。加測試釘死不可套利。**UI 半✅**：`MerchantShop.tsx` 頂部醒目琥珀色 `↩ 復原上一步` 按鈕，dispatch `undoLastShopStep` 指令。**SIM 半✅**：shared `Command` 加 `undoLastShopStep` kind；`ChampionComp.undoStack` = 本場購物 session 的 LIFO 交易史（每筆存**實際套用的金幣差 goldDelta** + buy 歸零的 statStacks），`undoShopAction()` pop 頂並**精準反向**(`gold -= goldDelta`)。不可套利保證:①買→賣是真 −60% 損失 ②undo 反沖 floor 後的退款額(非重算)③一筆只能 undo 一次(pop)④`enterCombat` commit 清空 undo 史(跨回合不可還原)⑤指令走 `shopAccess` 閘門→商店關閉即拒。stat-tick/orb 購買 commit session。廣播新增 `SeatState.undoDepth`(client 只在 >0 顯示按鈕,精準)。測試:`shopUndo.test.ts`(10)+`shopEconomy.test.ts` e2e(買→賣→undo→undo 回精確起點/N cycle 不增金/戰鬥中拒 undo)。@ggd/shared+@ggd/game-server 綠、typecheck 綠、purity/replay 綠 |
| 你(實測) | **每回合隨機換地圖**(比較不無聊) | ✅ **#145 SIM 半 done**（client 場景切換另有 render agent） | 每個 combat round 從 arena 池隨機選(skeleton/castle/colosseum/dota/godie);**決定論**:純函式 `pickRoundArena(pool, matchSeed, round)`(shared `ArenaDef.ts`)= seed 導出的 Fisher–Yates permutation 循環走訪 → **不碰 world.rng**(不擾動 sim 隨機流,same-seed replay byte-identical)、**連續回合不重覆**、首 N 回合走遍全池。伺服器權威:`MatchController.selectRoundArena()` 在 `enterCombat` 選一次(不 mid-round 重選)並 `world.setArena()` 切碰撞幾何;`arenaPool` 空=不輪替(=舊行為,所有既有測試綠)。`MatchRoom` 傳 `resolveArenaPool()`(全載入 arena)。**廣播**:`state.mapId` 每 tick = `ctl.arena.id`(`net/snapshot.ts`)→ client-render agent watch `mapId` 換場景。與 guardian/fire-ring/flower arming 同讀此 active arena(接 #105 各 arena guardian 身分)。測試:`arenaRotation.test.ts`(shared 純函式 5 + game-server e2e 4:跨回合變、回合內穩定、same-seed replay digest 相同、無池則固定)|
| 你(實測) | **旅行商人要有頭圖 + 3D model 在中央,玩家 model 在右方** | ✅ **#146**(改 #94/#38 版位) | 中場 shop 場景:商人 3D model 置**中央**、玩家英雄 model 置**右方**(#94 之前是玩家右/場鏡射,現明確商人中央);商人加一張**頭圖 icon**(生成或指定)。維持 #103 店員視線不被擋。**✅ 完成**：`layout.ts` 只改瞄準（world aim x −0.5，商人頭 ~53% 置中）+ `CHAMPION_STAND` → world +0.15（玩家頭 ~67% 右側，前景不擋店員）；眼點與商人世界座標不動 → #103 sightline 逐 byte 不變、仍過；新增 layout.test「商人置中 + 玩家在右」斷言。頭圖：佔位路徑 `MERCHANT_PORTRAIT = assets/icons/shop/traveling-merchant.png`（GlyphTile 404 退化為字母 glyph，**PNG 待生成**），顯示於商人 tip 對話框 |

### 2026-07-23（續:你第二批 LAN 回饋 5 條）
| 來源 | 回饋 | 判定 | 落點 / 狀態 |
|---|---|---|---|
| 你(實測) | 中場等待:商人**隨機輪播**遊戲規則/技巧/武器推薦,每框**5 秒**消失換下一個(幫新手快速上手) | ✅ **#147**（coordinator 誤標 #148） | 商人 tip 輪播:rules/tips/weapon-rec 文案組,intermission 時每 5s 隨機換一則(不立即重覆),掛在商人。**✅ 完成**：`render/intermission/merchantTips.ts`（12 則：4 規則/5 提示/3 出裝建議，`nextTipIndex` 從其他索引抽樣 → 保證不立即重覆，node 測試釘死）+ `ui/MerchantTipBox.tsx`（每 5s 輪換、含商人頭圖與分類標籤、掛在 IntermissionStage 疊層、unmount 清 timer）。**注意**：coordinator 指示用 #148，但 docs #148 已是 combat-juice VFX（render/vfx），此功能實為 #147 |
| 你(實測) | **遠距攻擊角色操作介面要特別測**(和近戰不同),技能同理 | 🔄 擴 **#128** | ranged vs melee 的 attack/施法(targeted/ground/skillshot)操作差異逐一驗:近戰=貼近、遠距=彈道/指向。納入 castability sweep + 我實機受控試玩 |
| 你(實測) | 戰鬥場景還缺:**影子、走路揚塵(漸大漸透明)、施法地板痕跡(焦黑破損)、最重要的打擊閃光粒子+濺血** | 🔄 建 **#148**(高值) | combat juice VFX:①角色 blob 影子 ②走路揚塵(擴大+淡出)③施法地面 decal(焦黑/裂)④命中閃光火花 ⑤濺血。查 #33/#39/#60/#79 現況再補強。render/vfx agent(render/vfx 目前無人佔) |
| 你(實測) | **戰鬥太容易秒殺** + 冷卻已 -75%(×0.25)→ HP 總量倍率應 **≥4×** | ✅ **已改 maxHealth ×4** | combat-env `maxHealth` 1.0→**4.0**(冷卻 0.25=4× 施法頻率 → HP 4× 抵銷,不再秒殺);過 statPipeline(保 HP 比例)+ #125 displayFinal(顯示也 ×4)。可再依手感微調 damage/attackSpeed。連動 #28/#144(#144 的攻速也會影響 TTK) |
| 你(實測) | **音樂整體還是太大聲** → 預設再減 20% | ✅ **已改** | `audioSettings.ts` `DEFAULT_AUDIO_VOLUMES.bgm` 0.5→**0.4**(−20%)。既有玩家保留自存音量;新 session/重設 = 0.4 |
| 你(實測) | **三選一(技能/武器)無法扭轉戰局** → 查因改善 | 🔄 建 **#149**(查因完成) | **根因**:augment 只有 **3 個(每 tier 1 個)** → `offerAugments` 依 tier 過濾 → 3 選 1 實際只給 **1 張**(無選擇)。3 個 augment 本身**有效**(`fireHooks` 有派送 augment hooks,aegis 護盾/chill Q 減速/bloodlust 屬性都會觸發)——不是壞掉,是**池太小**。修:content-only 每 tier 補 **5-8 個有感 augment**(依 4×HP/0.25CD 的尺度做**能扭轉戰局**、prismatic=build-defining),content:validate 過即自然給 3 張。**不動 sim/draft.ts**(避開跑中的經濟 agent)。順帶查武器 draft 強度 |
| 你(實測) | **角色 3D model 大小仍不統一**(夏娜太小、小叮噹太大…)→ 逐一掃描確認再解決 | ✅ **#150 render 半 done**（GameApp override 接線待 GameApp wave） | **根因**:`ChampionView` 只做 `glbRoot.scaling.setAll(doc.scale)` + 貼地,**無身高正規化** → 螢幕大小 = doc.scale × glb 原生尺寸,各角色不一致(#61 只查 2.5u 上限沒比相對;#77 小叮噹 0.6 override 沒接線)。**掃描**:新 read-only 工具 `tools/w3x-import/model_size_audit_150.mjs`(Babylon NullEngine,ChampionView 原路 `instantiateModelsToScene`+`getHierarchyBoundingVectors`)逐英雄量原生高/現尺寸 → `docs/_model-size-audit-150.md`(+ `.data.json`,gen py)。實測 BEFORE 螢幕高 **1.70u..2.32u(1.36×)**:4 個共用 CC0 stand-in 最大(**champ.sela 2.32u = 小叮噹群**),imported 英雄多為 1.70u(**夏娜 heroshana**)→ 夏娜相對偏小。**修 render 半✅**:`ChampionView.tryUpgradeToGlb` 加**身高正規化**(量原生全高 → 縮到 `TARGET_HEIGHT=1.8u`,取代 raw-doc.scale-as-absolute),再乘**逐角色 `relativeScale`**(default 1.0)給刻意小/大者;degenerate glb 才 fallback doc.scale;#77 貼地+declaredScale 保留、不雙重套。override 表 `content/models/_standin-overrides.json` 升 schema@2(`scale`→`relativeScale`),curate 8 例(小叮噹 0.65 / 皮卡丘 0.6 / 妙蛙種子 0.62 / 熊貓 0.8 / 草泥馬 0.85 / 初號機 1.55 / 大魔王 1.3)。`EntityViewRegistry` 加 `relativeScaleOf` 並 thread。**AFTER**:default 全體 **1.80u 齊平**,只剩刻意例外(小叮噹 1.17 / 初號機 2.79)。typecheck 綠、ChampionView+EntityViewRegistry vitest 31 綠(含新正規化測試:懸殊原生高 → 同目標高、override 更小、degenerate fallback)。**待接線**:`GameApp.modelOverrideFor` 讀本表(mdl-64 早已註記為 remaining composition-root step,GameApp wave 擁有)—— 正規化本身**免接線即生效**,override 例外待 GameApp 接。延伸 #61/#77 |
| 你(實測·iPhone) | **iPhone 橫向選單重疊**(登入卡/英雄陣容/按鈕/footer 疊在一起);直向正常 | 🔄 建 **#151** | 短高度(390px)排版沒 responsive;戰鬥強制橫向 → 橫向選單壞。壓縮垂直間距/縮標題/避免碰撞/尊重 safe-area。測 844×390、780×360、直向 390×844。連 #107 |
| 你 | 戰鬥 **QWER/EX 按鈕全平台都要有技能名**;**按住**時技能說明浮**畫面上方** + 顯示**施法距離/範圍虛線** | 🔄 建 **#152** | 桌機 AbilityBar 已有名(`stripAbilityNumber`),**touch 只有字母 → 補名**;新增:按住(mouse-down/touch-press)→ 說明浮頂部 overlay + 地面 range/AoE 虛線(接 `render/AimIndicator.ts`);放開=施放。全平台。延伸 #21 |
| 你 | **每回合戰鬥 < 2min(最低)/ < 3min(平均)= HP 還太低**,實驗後告訴我調多少 | 🔄 建 **#153**(實驗中) | 目前 maxHealth ×4。建 headless harness(重用真 MatchController + Tier0Brain bot AI,或 shared/sim 近似 items+levels)掃 maxHealth {4,6,8,10,12,16,20} × 多 seed → 量每回合戰鬥秒數(min+avg)→ **推薦達 ≥120s min / ~180s avg 的值**。先報告不改 combat-env(避開跑中的 sim agent),我再套用 |
| 你(問) | 試聽頁沒收錄 **12+12 Samantha James 輪替曲**?**不要再蓋到原曲** | 🔄 **#137 開跑**(先前從沒做) | 查證:variant 檔 **0 個**,#137 真沒做(排在 #135 後但沒執行)。開 bgm-gen agent:建 Samantha nu-jazz/deep-house 風格 helper → 12 場景各出變體,**渲染到 `<scene>.samantha.mp3` 獨立檔(絕不蓋原曲,md5 前後比對驗證)** → audio-map 加 variants + client 每次進場景在 原曲↔變體 間輪替(非主題;尊重 #134 登入單曲)→ 試聽頁補 12 變體(保留 12 原曲=24)。創作類待你試聽核准 |

### 2026-07-23（#127 環境分級內容閘 — copyright / single-player gate）
| 來源 | 需求 | 判定 | 落點 / 狀態 |
|---|---|---|---|
| 任務 #127 | **環境分級**:loopback/127.0.0.1/LAN = 私有 → 可供單機 + 受版權內容(imported 動漫英雄模型、Blizzard overlay);真正對外/public 部署 = **不得** 提供。手機在 wifi 仍可玩(LAN 允許),只擋真正 public host | ✅ **#127 done**(serving 層權威;single-player UI 隱藏為 client-ui 後續) | **根因**:原本 copyright 只擋一半 —— blizzard-local 靠 dev-only 建構天生不進 prod,但 `content/assets/models/imported/**`(129 個 GLB)在可部署 `content/` 樹內 → prod nginx 對任何人放送。**修**:①**單一權威分類器** `packages/shared/src/envTier.ts`(`classifyEnvTier` → `loopback\|lan\|public`,讀 **socket peer** 不讀轉發標頭;未知→public 的 fail-safe;46 例 table 測 `envTier.test.ts` 綠)。②**vite dev/preview** `copyrightTierGate()`(`vite.config.ts`)在 `serveContent`/`serveBlizzardOverlay` 前擋兩個受限 mount,public peer 403、loopback+LAN 放行;不動 `/content-api` tripwire(仍 404)。③**nginx** `geo $ggd_env_tier`(CIDR 原生)+`map $ggd_deny_copyright`,`location ^~ /content/assets/models/imported/` 與 `nginx/dev/blizzard-overlay.conf` 皆 `if ($ggd_deny_copyright){return 403;}`;`nginx -t` 綠、`make helm-sync-nginx` 同步 helm 副本。④**platform** `GGD_DEPLOY_TIER`(private\|public,**預設 public** = 未宣告即拒)`config.go`,開機 log `deployTier`。**驗**:vite 起得來;loopback+LAN(192.168.0.106)curl imported 模型皆 **200**;nginx 以 test-peer 驗 loopback/LAN 200、public(203.0.113.7 / 8.8.8.8）**403**;shared/client typecheck 綠、platform build + server/config 測綠(未碰 `devsurface_test` 的 no-address-trust 守則)。政策文件 `docs/copyright-content-gate.md`。**LB 注意**:`$remote_addr` 為直連 peer,雲端 LB 後方會變 LB 私網位址 → 真 public 雲部署須另把受限資產排除出映像(blizzard-local 已天生排除;imported 建議 public build 排除)。本閘在 nginx/vite 自身即對外一跳(docker/LAN edge)時精確。**未做**:client UI 在 public tier 隱藏單機入口(client ui/render 非本次 ownership)。todo:`security-infra.md` sec-infra-08(done)/09/10/11(pending,同 01-04 慣例待 infracheck beacon) |

## Security audit (#154)

> 注入 + DoS/DDoS + auth/session/secrets + browser/XSS/CSP 全面稽核。26 findings（7 high / 9 medium / 6 low / 4 info-verified）。**game-server 5 條當波修（safeNow=true）；其餘 21 條 DEFERRED**。完整報告 [`docs/_security-audit.md`](_security-audit.md)（含 32 條測試矩陣）、follow-ups 見 [`docs/todo/security.md`](todo/security.md)（sec-154-xx）。逐條已 file:line 核實（未用 proximity-grep）。

| ID | Finding | Sev | Service | Class | 現況 |
|---|---|---|---|---|---|
| F-01 | Colyseus INPUT prototype-name `slot`/`itemSlot` → `Registry.get(undefined)` throws → tick-catch `disconnect()` 全場 DoS（`InputMailbox.ts:15`→`content/registry.ts:17`；kill `MatchRoom.ts:206,217`） | high | game-server | injection | 🔧 當波修 |
| F-02 | 未認證 argon2id CPU+記憶體放大器 `/auth/register`(+login)；無 app 層 per-IP 限流、無並發上限（`service.go:137`；edge-only 限流可繞） | high | platform | DoS | ⏸ DEFERRED |
| F-03 | Colyseus client 端 `create("match")` flood：`onCreate` 在 `onAuth` 前建 12-seat sim + 60Hz loop（`MatchRoom.ts:84,183`；`index.ts:132` 無 gate） | high | game-server | DoS | 🔧 當波修 |
| F-04 | INPUT 命令無界累積 + 無 per-client 訊息率限：單訊息 huge `commands[]` → 單 tick O(N) 卡事件迴圈（`InputMailbox.ts:25`；#46 只夾 tick 數不夾每 tick 工作量） | high | game-server | DoS | 🔧 當波修 |
| F-05 | Login per-IP 限流 key 用可偽造 `X-Real-Ip`（`middleware.go:35`→`service.go:198`）；off-edge 直連可無限暴力破解 + argon2 耗盡 | high | platform | DoS/auth | ⏸ DEFERRED |
| F-06 | 玩家 `displayName` 未跳脫經 `innerHTML` 進血條（`WorldAnchorLayer.tsx:40-58`）→ DOM/stored XSS，配 localStorage token + 無 CSP = 全場帳號接管 | high | client | web/XSS | ⏸ DEFERRED |
| F-07 | game-server 收任意 seat `displayName` 且 match 建立未鎖 HMAC 內部路徑（`index.ts:61,132`；`MatchRoom.ts:98,148`）→ 繞平台 username regex 的 stored-XSS 源 | high | game-server | web/XSS | 🔧 當波修 |
| F-08 | SSRF：AI music/image 追隨 provider 回傳 URL（poll/audio/image）無 host allowlist，poll fetch 還帶 API key（`provider.go:184-302`；`music.go:271`） | medium | platform | injection | ⏸ DEFERRED |
| F-09 | Go `http.Server` 無 `ReadTimeout`/`WriteTimeout`/`IdleTimeout`（`main.go:44-48`）→ slow-body slowloris + idle keep-alive 耗盡 | medium | platform | DoS | ⏸ DEFERRED |
| F-10 | Lobby WS 無 per-account 連線上限（`hub.go:133`）；nginx `/api/` 無 `limit_conn`（`nginx.conf:256`）→ 單 token 開無限長連線耗盡 goroutine/FD | medium | platform | DoS | ⏸ DEFERRED |
| F-11 | 未限流註冊無界撐大 JSON file-store + no-TTL Redis index（`service.go:120-152` `SetNX ttl 0`）；#126 gate 只擋 token 不擋磁碟/Redis 成長 | medium | platform | DoS | ⏸ DEFERRED |
| F-12 | Access token 於 URL query 被所有認證路由接受（`middleware.go:44`），經 nginx access log（`nginx.conf:46`）洩漏 live token | medium | platform | auth | ⏸ DEFERRED |
| F-13 | `ClientIP` 無條件信任 `X-Real-Ip`（`middleware.go:35-44`）→ off-edge login 限流/暴力破解繞過（F-05 的 auth-class 對映，修一次兩解） | medium | platform | auth | ⏸ DEFERRED |
| F-14 | game-server 於 `PLATFORM_GAME_SHARED_SECRET` 空時 fail-OPEN（`index.ts:23`；`MatchRoom.ts:76`；`cheatGate.ts:14`）→ 無認證、身分可偽、cheat 開 | medium | game-server | auth | 🔧 當波修 |
| F-15 | Prod CSP 只有 `frame-ancestors 'none'`，無 `script-src`/`default-src`（`nginx.conf:142,180`）→ 對 XSS 零緩解 | medium | infra | web/CSP | ⏸ DEFERRED |
| F-16 | 內部 debug/audition HTML 打包進 prod client 並公開放送（`public/*.html`→`dist/`，`nginx.conf:156`）→ ~20 innerHTML sink 擴大 XSS 面 | medium | client | web | ⏸ DEFERRED |
| F-17 | Dev content middleware 只做語彙前綴不解 symlink（`vite.config.ts:45-61`）→ 植入 symlink 逃逸 root | low | vite | injection | ⏸ DEFERRED |
| F-18 | 註冊衝突回應可區分 username vs email（`service.go:120-135`）+ SETNX 早退 timing oracle → 用戶/信箱枚舉 | low | platform | auth | ⏸ DEFERRED |
| F-19 | Access token `iss` 蓋章但 `VerifyAccess` 從不驗，且無 `aud`（`jwt.go:19-44`）→ 秘鑰複用時 token 混淆 | low | platform | auth | ⏸ DEFERRED |
| F-20 | `values-local.yaml` 提交 dev-insecure JWT/game/redis 秘鑰（`:36-38`），無防公開部署套用的護欄；#126 只檢非空非弱 | low | infra | auth/secrets | ⏸ DEFERRED |
| F-21 | JWT access+refresh 存 localStorage（`session.ts:29-47`）→ 任何 XSS 升級為完整帳號接管的放大器 | low | client | web | ⏸ DEFERRED |
| F-22 | Vite dev/LAN content handler 無 `nosniff` 且未映射副檔名當 octet-stream（`vite.config.ts:44-61`）→ LAN peer MIME-sniff | low | vite | web | ⏸ DEFERRED |
| F-23 | `/content/*` path-traversal — 核實安全（`vite.config.ts:48-52` + `nginx.conf:186-216`）；唯一殘留=植入 symlink=F-17 | info | content-serving | injection | ✅ verified |
| F-24 | CORS — 核實乾淨，全樹無 `ACAO`/credentials wildcard（`httpx.go:42`） | info | platform | web/CORS | ✅ verified |
| F-25 | #117 session store 不再 LAN 曝露（redis loopback+password、Service ClusterIP、orphan harness 消失） | info | infra | auth/secrets | ✅ verified |
| F-26 | #126 fail-closed 秘鑰開機守衛 + pending-account 不發 token — 核實正確（`config.go:124`；`server.go:85`；`service.go:157`） | info | platform | auth/secrets | ✅ verified |

## 2026-07-23 — Whole-branch synthesis review (campaign/complete-tasks vs main)

Genuinely-incomplete / deferred requirements surfaced during the ~1920-file branch review (10-area file-by-file pass). Format: requirement — status — evidence(file:line) — note.

- **#167 server-side champ-lock enforcement** — deferred — apps/client/src/ui/panels/champselect/lockGate.ts:13-24 — Lock is client-only; a crafted client can still switch and other seats never see the lock. Needs a server `locked` seat flag (MatchController.selectChampion refusal + snapshot bit).
- **#145 per-round arena render (client)** — deferred — apps/client/src/render/arenaSelect.ts:44-49 — resolveArenaId reads roundArenaId/roundMapId/arenaId absent from state; always falls back to match-level mapId, so no per-round arena change renders. Speculative plumbing awaiting the frozen sim field.
- **Directional camera kick + EX cinematic punch-in** — incomplete — apps/client/src/render/CameraRig.ts:361, GameApp.ts:1131 — addShake(opts)+exPunchIn implemented+tested but ZERO runtime callers; planImpactFeedback's ShakeRequest computed but never consumed. Camera still shakes via legacy impactShakeAmp. Deferred to a later camera wave.
- **#123/#79/#50 render/vfx primitive lib as source-of-truth** — partial — apps/client/src/render/vfx/index.ts:1-12 — pure generators with tests, but nothing at runtime/content-build imports them; the 95 static content/vfx/fx.prim.*.json can drift from module output.
- **On-hit model feedback for profile-less hits** — deferred — apps/client/src/render/EntityViewRegistry.ts:279-281 — flash/hitstop moved from `damage` to `hitImpact`; a pre-#133 replay / malformed payload (no ImpactProfile) now yields no model reaction. Documented defensive no-op.
- **#114 in-game role-colour tooltips** — incomplete — apps/client/src/ui/components/abilityText.ts:47-52 — classifyRole/ROLE_COLOR/parseRoleMarkup built+tested, but zero shipped ability docs carry descriptionRoles/[c=…] markup, so no role colour ever renders. Inert pending an importer re-run.
- **#125/#114 number-rescale vs role-markup coexistence** — partial — abilityText.ts:255-262,288-296 — rescaleAbilityProse anchors on the number being adjacent to 傷害/秒冷卻/damage; role markup ([c=damage]650[/c]傷害) inserts [/c] between number and keyword, so rescale silently no-ops once descriptionRoles is populated. Latent conflict.
- **#152 ability name on button (desktop)** — partial — AbilityBar.tsx:172,177 — touch tiles show the name; desktop tiles paint the w3x icon over the name (inset:0), so desktop name shows only when the icon is missing (deferred to hover tooltip).
- **Authored-but-unfired SFX cues** — deferred — apps/client/src/audio/sfxManifest.ts:47 — mapFlavor*/lab/settlementReveal/matchEndGong/vsReveal pools exist in audio-map.json but have no firing call site; likely subsumed by #135/#143.
- **#136 projectile skillshot travel range** — partial — packages/shared/src/sim/effects/effectRunner.ts:183 — remainingRange:def.maxRange spawned UNSCALED; only cast range, AoE radius, hit-radius pass through resolveAbilityRange. At abilityRange=0.6 a skillshot flies full base range while the tooltip shows range ×0.6 — displayed ≠ actual for projectiles.
- **#133 EX-super hit-feel (exFreeze / omni shake)** — stub — packages/shared/src/sim/combat/damage.ts:138-146 — originIsEX() looks for an 'ex:' origin marker no content emits; isEX always false, so exFreeze/omni-on-EX never fire.
- **#133 counter-hit spark/emphasis** — stub — damage.ts:299 — isCounter=false hardcoded; the 'counter' SparkKind + emphasis are unreachable.
- **#89 guardian damage mitigation** — deferred — GuardianSystem.ts:64-72,170-173,235-237; combat/damage.ts has NO StructureComp reference — StructureComp stores armor/magicResist/maxHitPctMaxHp but mitigate() only reads StatsComp, so the guardian takes fully unmitigated damage. Open seam owned by the combat wave.
- **#121 shop-undo undoDepth field** — partial — protocol/schema.ts:78-82 (comment claims client reads it) / snapshot.ts:85 produces it / zero consumers; client uses a last-event heuristic at MerchantShop.tsx:119. Field emitted but unconsumed; comment overstates wiring.
- **First-open roster art gaps** — incomplete — apps/platform/internal/curation/starter.go:78 (妙蛙花 godie-h02r no portrait), :97 (魔人普烏 godie-huth empty EX desc) — icon/copy gates (G2-G6) removed, so the 48-roster ships some incomplete art/text by design.
- **Rostered champions thin buildPriority ladders** — partial — starter.go:93,204 — most of the 48 carry only a 2-item ladder after the ≥4-rung gate was dropped (AIDriver made tolerant). Latent bot/shop quality gap.
- **#78 1:1 fidelity pass** — partial — content/abilities/godie-o02v.r.json (perRank [1,1,1], coeff 0.003 = an ULTIMATE dealing 1 damage) — ~22 standalone abilities + ~17 champions still carry the 1.0-perRank / tiny-coeff stub the fidelity edits fixed elsewhere. #78 in_progress; coverage incomplete.
- **#105 guardian per-arena identity (5 faces)** — partial — GuardianSystem.ts:50 (GUARDIAN_MODEL_KEY="prop.guardian" hardcoded) — only the stone model doc shipped though guardian_beast.glb / guardian_treant_*.glb assets exist. Mechanic wired; model-identity variants absent.
- **#149 augment pool power-level validation** — partial — content/augments/_index.json (21 docs, tier-wired) — content complete + draws correctly, but "can swing games" balance sign-off outstanding.
- **#146 travelling-merchant portrait** — partial — MERCHANT_PORTRAIT = assets/icons/shop/traveling-merchant.png (absent on disk, falls back to a letter glyph) — layout done, PNG 待生成.
- **#79 ability-VFX binding off the fire placeholder** — partial — content/abilities (285 fx.ember-bolt-cast remain vs 240 fx.prim bindings) — done for the 48-champion open roster only; non-roster champions keep the placeholder.
- **#142/#139 male champion VO** — deferred(latent) — tools/tts-gen/src/build-champ-quotes.mjs resolveMaleVoice() — this build had Otoya so all 113 rendered; re-running on a machine without a clean JP male voice silently leaves 72 male clips unrendered.
- **#135 rap/VO BGM intros** — partial — tools/bgm-gen/src/audition.py:60 (SCENE_RAP) — say-based rap layer OFF by default (only baked with --tts); committed intros are pure-synth.
- **#48 platform-URL fallback is override-only** — deferred(scoped) — apps/game-server/src/config/platformUrl.ts — the localhost:8080 fallback fixes only URL resolution off-cluster; the combat-env content BASE DOES apply, so this is a narrow dev-connectivity seam, not a content gap.
- **menu.samantha BGM variant rotation** — by-design-off — apps/client/src/audio/bgmVariants.ts — menu is ROTATION_LOCKED and ships no menu variant; intentional.
- **Live playtest re-verification owed** — pending-verify — MatchController.ts + FireRingSystem.ts — code + tests prove fire ring burns/settles + #100 is gated, but confirm on a real stalemate round; damage-number colour (#164) + passive dashed-border (#166) still owed a live look.
- **#154 security audit — 21/26 findings deferred** — deferred — docs/todo/security.md:32-48 (sec-154-02,05,06,08-13,15-22) — docs-only pass; no landed cover() yet; even the 5 'this-wave' game-server items (01/03/04/07/14) are in-progress. Go-live risk acceptance is a user call.
- **Live-page sync** — incomplete — docs/requirements-status.md (dated 07-22, table stops at #128) + this gap log (was missing #155-171) — the two live pages trail the ledger; gen_status.py TASKS array + gap log both need #129-#171 appended; #79/#89/#98/#121/#123 3-way status drift to reconcile (gap log is the more accurate artifact).

## 2026-07-23 — 回合勝利演出「每回合都是同一個英雄」（使用者回報 bug，已修）

- **需求（原話）**：「我好像怎麼勝利都是結果都是放出黑崎一護的 3d model 勝利畫面?」 — ✅ **已修**。
  舊選擇器 `apps/client/src/ui/panels/settlementModel.ts` `roundLeaderChampion()` 取「領先隊伍中 seatId 最小的英雄」，
  而 seat↔英雄整場固定 → 只要同一隊持續領先，每回合演出必定同一人（#143 中央模型與 #142 回合結束語音共用此選擇器，兩者一起錯）。
  改為**該回合 MVP**：伺服器新增 per-ROUND K/D（`MatchController.roundKills/roundDeaths`，於 `enterCombat` 歸零、非累計）→
  `SeatState.roundKills/roundDeaths`（uint8）→ `RoomStore.SeatView` → 選擇器先以「回合結束時仍存活」為門檻，再依
  回合擊殺↓ → 回合死亡↑ → seatId↑ 排序。測試：`settlementModel.test.ts`（settle-round-mvp）+ `settlement.test.ts`（round-mvp-tally）。
- **追加需求（原話）**：「回合表現最好的人的底線門檻是必須最後還活著」 — ✅ **已實作為兩段式篩選**（先存活門檻、後表現排序）；
  領先隊伍全滅（互相清場／火環）時退回全隊伍最佳表現者，永不回傳 null。存活判定取自權威快照 `EntityState.alive`
  （非 `roundDeaths === 0`，因為 #84 復活圈救回的人仍算存活），所以每個客戶端算出同一位英雄、播同一段語音。
- **~~⚠ 已知殘留邊界~~ → ✅ 已修（#173，2026-07-23 整合波）**：輪空（bye）回合的領先隊伍會被誤選。
  原設計提案是布林 `participatedThisRound`，**實作改為 4 態 uint8** —— 它連「贏了但沒參戰」這種不可能狀態都無法表達：
  - **訊號**：`TeamState.roundOutcome`（`NONE=0 / FOUGHT=1 / LOST=2 / WON=3`，`packages/shared/src/protocol/schema.ts`，
    append-only 欄位不可調序）。`MatchController.roundOutcome` map：`enterCombat` 把所有隊歸零 → **把座位放進對戰區的那一圈** 設 FOUGHT →
    `settleRound` 升級成 WON/LOST；`snapshot.ts` 每次 patch 投影；`RoomStore` → `RoundTeamView.roundOutcome`。
    輪空隊永遠停在 NONE，因為它從來沒進過那圈迴圈。
  - **選擇器**（`settlementModel.roundLeaderChampion`）三段式：**CANDIDATES**（WON → 退 FOUGHT/LOST → 再退全部）/
    **GATE**（回合結束仍存活）/ **RANK**（回合擊殺↓ → 回合死亡↑ → seatId↑）。判定用**列舉成員比對**而非 `!== NONE`，
    以免 `undefined` 或超界值被當成參戰者。名次是**逐位往下試**，領先候選若整隊沒鎖英雄會讓給次佳隊伍，
    `null` 只剩「全場都沒有英雄」一種意思。
  - **⚠ 這一併改變了「一般 4 隊回合」的演出**（非只有輪空回合）：優先 WON 表示**輸掉單挑的隊伍永遠不會被表揚**，
    即使它在 lives 上還領先（`settleRound` 已先扣過分，輸家 3→2 可以壓過贏家 1）。這是刻意的、符合 #143「回合勝利演出」語意，
    但它是需求原文沒要求的行為變更，記錄在此以免 playtest 時被當成 regression。兩個贏家同分時退到較小 teamId（席位 MVP 仍每回合變動）。
  - **測試**：`settlement.test.ts`（round-mvp-bye）+ `settlementModel.test.ts`（settle-round-bye，含 WON 路徑的
    GATE/RANK 鏡像案例與「候選沒鎖英雄」的續試案例）。
- **⚠ 併發提交事故**：此修復進行中，`a2ae538` / `3f11759` 由**另一個並行 session／hook 自動提交**，
  把本修復與 #172 改密碼（platform/admin）混進同一個 commit。程式碼無遺失，但兩件不相干的工作已無法乾淨拆開 →
  提醒：同一 worktree 不要同時跑會自動 commit 的 session。

## 2026-07-23 — #93 勝利演出 / #85 死亡觀戰去飽和：整合波（三份對抗式審查的收斂）

### #93 勝利演出（回合＝灰底＋小煙火＋嘲諷；決賽＝暗底＋巨大烤雞煙火＋嗆聲 VO）

- **需求（原話）**：「贏得回合 → 灰色底＋小煙火＋該英雄風格的嘲諷台詞；贏得整場 → 暗色底＋巨大烤雞造型煙火＋嗆人的 VO」。
- **⛔ 曾經：六個子句只有一個真的會發生（已修）**。演出模組全部寫好、單元測試全綠，但**線沒接上**：
  - `TeamState.roundWins` 在 schema 宣告、被 client 讀（`GameApp.victoryInput` → `VictoryGate`），
    但**伺服器從來沒有任何一行寫它** → 小煙火是死程式碼，永遠不會放。
    → 已修：`MatchController.roundWins`（match 生命週期計數，**不在 `resetRoundTallies` 歸零**，否則 client 的
    `roundWins > lastRoundWins` 邊緣偵測就再也不會觸發），`settleRound` 勝方 +1（uint8 夾 255），`snapshot.ts` 每 patch 投影。
    測試：`settlement.test.ts`（round-win-counter，3 例）。
  - `GameApp` 呼叫 `roundWinner.show(doc)` **沒帶 ctx** → `RoundWinnerStage` 在 `if (!champ) return` 直接跳出 →
    嘲諷台詞與字幕整條路徑在正式版不可達（只有測試自己帶參數才跑得到）。
    → 已修：`show(doc, { championId: champ, round: state.round })`，並在 `settlementModel.test.ts` 用原始碼比對釘住這行接線。
- **字幕比語音早 2.2 秒（已修）**：`playRound(...).then(setSubtitle)` 在**選定台詞**的下一個 microtask 就 resolve，
  但語音要等 `delayMs`。字幕因此正好蓋在回合結束名言上——那個 delay 存在的唯一理由。
  → 已修：新增 `PlayTauntOptions.onSpeak`，字幕改由「真正發聲的那一拍」驅動；靜音／未解鎖／測試靜音時**照樣排程、照樣出字幕**，
  只是不出聲（字幕是演出，不是音訊）。
- **延遲期間才按靜音會照樣出聲（已修）**：音量在排程當下讀一次就定案。
  → 已修：所有音訊閘（測試靜音、autoplay lock、mute/0 gain、無檔案、無 element）改在 `speak()` 內、**發聲當下**重新判定。
- **暗底把它自己要展示的烤雞壓暗（已修）**：卡片被壓住 2.34 秒就是為了讓巨大烤雞看得見，
  但同時蓋著 0.86 alpha 近黑漸層 ＋ `brightness(0.55)`。
  → 已修：spec 表新增 `backgroundHeld` / `backdropFilterHeld`（alpha 0.16/0.32、**完全不用 brightness**），
  hold 結束後以 420ms 曲線收斂成正式暗底。測試 `client-victory-held-wash` 用「held 的最大 alpha < 正式的最小 alpha」量化。
- **卡片閃一格 + #36 自動捲動被重複武裝（已修）**：`cardHeld` 改為**推導值**（只存「hold 結束」這一個邊緣）。
- **`ROUND_PRESENT_MS` 手抄兩份（已修）**：刪掉 `GameApp` 的本地常數，改 import；否則把演出視窗縮到 2200ms 以下會**無聲**取消嘲諷。

### #85 死亡觀戰去飽和

- **需求（原話）**：「死亡觀戰時整個畫面去飽和，只有自己的隊友保持有顏色」。
- **復活圈色池是全系統最大的漏色點（已修）**：隊友池已收緊到剪影尺度（4→1.5 / 11→3），但復活圈仍留在舊的「戰鬥尺度」：
  半徑 2 的圈 → rFull 2.75 / rFade 4.75（詠唱時 6.5）。實測：**敵人站在你屍體 3u 處保留 81% 顏色**，
  同一個敵人站在活著的隊友 3u 處是 0。而復活圈正是敵人蹲點的地方——等於「敵人去飽和」在最關鍵的位置不成立，
  且當時的註解還宣稱它「貼著圈、不是泡泡」，程式與註解互相矛盾。
  → 已修：`REVIVE_FULL_MARGIN` 0.75→0.25、`REVIVE_FADE_MARGIN` 2.75→1.25、`REVIVE_FADE_MARGIN_CHANNEL` 4.5→2.25
  （3u 處剩 13%）。原本「守護這個調校」的測試是恆真式（`poolColourAt(rFade, rFull, rFade)` 對任何合法半徑都是 0），
  已換成**絕對世界距離**斷言；「畫面讀起來是被抽乾的」面積測試也改成走 `buildFocusSources` 的真實最壞情況
  （自己的復活圈詠釘中＋隊友），不再把最大的池排除在外。實際 7.8%，上限 8%。
- **GLSL 與 TS 鏡像的漂移防護（已補）**：`poolColourAt` 是 `DeathFocusFx` 片段著色器的手工鏡像，六條需求級斷言全靠它忠實。
  已在 `DeathFocusFx.test.ts` 加上對 `Effect.ShadersStore` 的字串釘樁（不需 GPU）。

### 交界（單一任務的審查者看不到的部分）

- **#173 選到的英雄 ↔ #93 的舞台**：同一個 `roundEndQuoteChampion` 既決定中央模型也決定嘲諷台詞的雜湊種子；
  ctx 沒傳就等於「選好了但沒接上」。已接上並用原始碼比對釘住。
- **#85 灰 ＋ #93 灰的疊加（已定優先序並強制）**：兩者唯一會相遇的時刻是**回合結束的那一格**——
  死亡去飽和的閘門條件是 `phase === "combat" && !outcomeDecided`，回合結束時它開始以 `FOCUS_FADE_OUT_MS` 線性淡出，
  而 #93 的灰底正好在同一格掛上。若灰底以全不透明掛上，就是 `grayscale(0.88)` ＋ 0.76 alpha 灰漸層疊在**已經抽乾**的畫面上，
  在贏家模型登場的瞬間變成一塊讀不出東西的板子。
  **規則：勝利演出擁有畫面，但以 CROSSFADE 接手，不是疊加。** 灰底以 opacity 0 掛上，在**恰好等於 #85 淡出**的時間內升到 1
  （`ROUND_WASH_FADE_MS = FOCUS_FADE_OUT_MS`，直接 import 綁死）。決賽端沒有這條縫：#85 在 `outcomeDecided` 就解除，
  而 `MatchEndPanel` 要等數秒後的結算封包才掛載。
- **#85 會不會改變 #93 煙火的樣子**：會，但只在上面那條淡出尾巴內。`DeathFocusFx` 是掛在**攝影機**上的後製，
  兩種煙火都是同一個 scene／同一台攝影機的粒子，天上的煙火離任何色池都很遠 → 若後製還在全強度，煙火會是全灰的。
  由於 `concludeCombat`（寫 roundWins/roundOutcome、latch `outcomeDecided`）與 `phase.advance()` 在**同一 tick**，
  client 收到計數上升的那個 patch 相位已經是 `resolution` → 閘門已解除、正在淡出。crossfade 讓這段尾巴視覺上維持單層。

### 仍未做（明講）

- `gen_status.py` 的 TASKS 表仍停在 #127（本波只補上 #85/#93/#143/#173 四列）；#128–#171 的補列仍是既有的「Live-page sync」缺口。
- `RoundWinnerStage` 與 `MatchEndPanel` 共用同一個 process-wide `victoryTaunts`，回合舞台的 `clear()` 會無條件 `cancel()`。
  審查建議讓回合舞台自己 new 一個 player——**沒有採納**：共用實例正是「永遠不會兩個聲音同時講話」的保證來源，
  拆開反而會製造更糟的 bug。目前安全性由「決賽回合 `roundEndQuoteChampion` 回傳 null」保證，已在此記錄這條隱性耦合。

## 2026-07-23 — CT 起手時間 / 起手預告（telegraph）：**確認為真缺口**（僅偵查＋設計，未改任何程式碼）

- **需求（原話）**：「**CT (起手時間) 很重要，並且一定要有對應的動畫特效等，讓玩家有機會閃躲**」。
- **判讀**：這是**公平性契約**，不是拋光。成立需要三條同時為真——
  **TIME**（扣掉延遲後真的來得及反應）、**SIGNAL**（**受害者**看得見，而且看得出**打哪裡**）、
  **AGENCY**（那段時間內有事可做）。**看不見的起手時間不是閃躲窗，只是延遲。**
- **設計文件**：`docs/design/cast-telegraph.md`（契約／五級分類／wire schema／視覺／數字／守護者／公平性規則／分階段計畫）。

### 🔴 真缺口 1：起手時間在**內容**裡幾乎不存在（不是程式問題）

- 對**真實載入登錄表**（`ContentLoader` + `registerAll`，與 `apps/game-server/src/index.ts:165-166` 同路徑）實測：
  **554 個技能中 544 個 `castTimeSec = 0`（98.2%）**；造成傷害的 342 個裡 **332 個瞬發**；
  全遊戲最長起手 **0.60 s**，最常見 0.35 s。10 個有起手時間的技能裡 **7 個是 EX（第 5 回合才解鎖）、2 個是 R（第 3 回合）**
  → **第 1、2 回合全遊戲只有 1 個技能有起手時間**（`godie-h01u.e`）。其中 2 個（`sela.r`/`thorne.r`）還是 TS 骨架示範英雄。
- **這 8 個值有 6 個是憑空發明的**：`tools/w3x-import/gen_ex_content.py:118` 寫死
  `doc["castTime"] = 0.35  # AoE nukes get a wind-up (exercises cast time)`，
  且與原始碼地圖矛盾（`91-002 亡靈大軍` 來源 `acas = 1.0`，出貨 0.35）。
- **⚠ 擁有者其實早就填過這些數字，是匯入管線丟掉的**：`src_gogodieEX227s.w3x` 的 `war3map.w3a` 有
  **130 個技能帶 `acas`（Casting Time），128 個非零**（眾數 0.3 / 0.5 / 1.0 s，尾巴到 1.6 s，394 筆逐級記錄）；
  `war3map.w3u` 另有 **`ucpt` 164 / `ucbs` 174**（單位施法點／收招），其中 **47 個對得上出貨英雄**。
  `acas` / `ucpt` / `ucbs` **都不在 `tools/w3x-import/src_objects.py` 與 `w3xlib/stats.py` 的白名單裡**，
  且磁碟上的 `OBJECTS.json` / `parsed/abilities.json` 早於 #56 的 rawMods 直通，**rawMods 筆數 0**。
  名稱比對後 **126 個擁有者親手計時的技能現在是瞬發**：龜派氣功 1.0→無、龍破斬 1.2→無、世界終結 1.6→無、
  千之雷 1.5→無、超究武神霸斬 0.8→無、月牙天衝 0.5→無、千鳥 0.3→無、天翔龍閃 0.4→無。
  → **這件事與 #56 直接相關**：修法是**還原原始數值**，不是重新發明。
  ⚠ 三個離群值需人工判讀，不可盲目匯入：`A0ZG 98-002` 720.0、`A0AQ 31-02` rank2 5.0、`A10U 84-002` 4.0。

### 🔴 真缺口 2：受害者永遠不知道「打哪裡」（幾何沒上線）

- `castBegin` 實測 payload 就是 `{caster, slot, abilityId, ticks, castTimeSec}`——**沒有 point、沒有 radius、沒有 direction**。
  頭上施法條（`CastTracker` + `GameApp.ts:1638-1640` + `WorldAnchorLayer.tsx:183-192`）**確實對每個英雄（含敵人）畫**，
  這條線是活的、是對的，但它只回答「有人在放招」，永遠不回答「打哪裡」。
- **地面 Telegraph 目前是「命中回執」偽裝成「警告」，而且會說謊**：
  `VfxSystem.ts:612` 在 `abilityCast`（**起手當下、瞬發技能等同傷害當下**）生成 `Telegraph`，
  只給 5 個引數 → `Telegraph.ts:166-167` 的 `fillMs = 300` / `holdMs = 150` **預設值生效，與 `castTimeSec` 完全無關**。
  544 個瞬發技能的「填充中」動畫**整段畫在傷害之後**；0.6 s 的技能在 300 ms 就放「打在這裡了」的 resolve pop，**早了 300 ms**。
  更糟：它用**未縮放**的 `def.radius`，而 sim 用 `radius × combatEnv.abilityRange (0.6)` →
  **畫出來的圈比真正命中的圈大 1.667 倍**（`godie-h01u.e` 畫 9.72、實打 5.83）。**照著圈做決策會死。**
- **#152 的虛線 range/AoE 預覽確認是 CASTER-ONLY**（本題直接問的那一項）：
  由 `getHeldAbility()`（本機按住的鍵）或 `touchFrame.indicator` 驅動、以 `localSelfPos()` 為圓心
  （`GameApp.ts:869-876, 1232-1246`；`AimIndicator.ts` 沒有任何網路輸入），**放招瞬間消失**。
  它是**瞄準輔助，不是預告**，對受害者的貢獻是零。（設計文件重用它的 `dashedRing()` **幾何**，不重用它的資料流。）

### 🔴 真缺口 3：#89 守護者——唯一把公平契約做對的系統，100% 被丟在伺服器行程內

- sim 端**已經完整實作**：`fireVolley` 依威脅表蓋下 **不追蹤** 的標記
  （原始碼註解：*NON-TRACKING telegraph point（walking out of it is a decision）*），
  `GuardianMark{x,z,impactTick,amount}` 傷害在蓋章當下凍結，`applyMark` 在 `impactTick` **重新查詢**命中名單。
  實測節奏：起手 24 tick = **0.800 s**，週期 4.0 s，3 標記，半徑 3.0，第 1 回合實打 97 傷害 = 460 HP 的 **21%**（第 5 回合＋ramp ~47%）。
- **然後全部消失**：`grep -rn "guardian" apps/game-server/src/rooms/MatchRoom.ts apps/game-server/src/net/snapshot.ts apps/client/src` → **零命中**。
  8 個 `guardian*` 事件都不在廣播白名單；`snapshot.ts` 沒有 `world.structure` 分支 →
  守護者掉進 `else`，編碼成 `kind = 0`（英雄）、`seatId = -1`、`key = ""` →
  client `teamBySeat.get(-1) ?? 0` = **藍隊**、名字 `#<entityId>`、模型退回**程序化體素人形**。
  **它不是看不見，是偽裝成一個沒名字的藍隊玩家站在區域中央。** 且 `MatchController.ts:726` 在正式比賽中確實武裝它。
- **鎮守之力（heir pulse）是第三個無聲 AoE，而且掛在玩家身上**：`heirPulsePct 0.25 × volleyDamage`，
  半徑 2.5、每 4 s、持續 25 s，`guardianHeirPulse` 不廣播、無任何光環、無標記。

### 🔴 真缺口 4：#132 火圈——三條全滅，且**無法只靠預告修好**

- `FireRingSystem` **沒有任何幾何**：遍歷 `world.champion` 燒**所有區域**的所有活人，與位置無關 → **沒有安全區可以走**。
- 繞過 `damageQueue`（`hp.hp -= dmg`）→ **不產生 `damage` 事件** → 無跳字、無紅閃、無音效，血條無故下降。
- ~~3 個 `fireRing*` 事件不在白名單。唯一的 client 提示（BGM bed + minimap rim）由相位時鐘猜、在戰鬥第 **210** 秒才開，
  但滿血英雄第 **194.9** 秒就被燒死 → **在每一個真的由火圈決勝的回合，提示永遠不會播**。~~
  **✅ 已修（2026-07-24）**：`fireRingStart` 已在 fan-out 白名單（`fireRingTick`/`fireRingDamage` 具名列為 server-only，
  各 360 msg/s 且無消費者——那是決定不是缺口）。提示不再用猜的：`FIRE_RING_SEC` 移入
  `apps/client/src/audio/fireRingWindow.ts`，由 `match.combatMaxSec − match.fireRing.startSec` **推導**
  （live 240−180 = **剩 60 秒**），BGM tension bed 與 minimap 危險環因此在戰鬥第 **180** 秒、
  也就是**真正開始燒的同一秒**亮起，比 194.9 秒的滿血陣亡點早 **14.9 秒**——原本晚 30 秒（第 210 秒）而永遠白播。
  該常數是 **ESM live binding**，`Minimap.tsx:41` 的既有 import 不改一個字就跟著校正。
  跨檔關係另補**執行期斷言**：sim 的 `fireRingStart` 抵達時 `noteFireRingIgnition(phaseSecondsLeft)` 與推導值對帳，
  差 >1.5 s 就 `console.error` 印出兩個數字（S3 形狀的參考實作）。
  **仍破**：幾何（無環狀 mesh、無安全區）與跳字（繞過 `damageQueue`）兩條，見上面兩點。

### 📐 數字（本次計算的核心，設計文件第 4 節）

- 逃離距離 `d = radius × 0.6 + 0.6`（碰撞半徑 0.6，`abilityRange = 0.6`）。85 個帶半徑技能：中位 `d = 4.13u`、最大 `6.43u`。
- 移速實測：最慢 4.0 / 中位 5.9 / 最快 10.1 u/s（`MovementSystem` 無加速度）。
- 延遲預算 `L`：**初稿寫 0.40 s，第二／三輪覆核後改為 0.45 s（蓋章式）／0.55 s（附身式）**
  （廣播對齊 8 + 單程 30 + 下一幀 8 + 遠端插值 0／100 + **人類反應 300**（需求方指定 250–300 取上界）
  + 輸入合併 17 + 回程 30 + 伺服器 tick 對齊 17 + **加速度爬升損失 33**（`ACCEL_TICKS = 3`，剛好損失整整一個 tick））。
  ⚠ 人類反應是文獻估計、非本專案量測；其餘為 shipped 常數。
  ⚠ **「蓋章式」的 100 ms 插值延遲是拿得回來的**——幾何是世界靜態座標 + 絕對 `impactTick`，本機英雄又是 client 預測跑在當下。
- **`T_min = L + d / v`，參考速度取 `v_ref = 5.6`（p10，公平地板要對九成英雄成立，不是對一半）
  → 90% 英雄 × 中位 AoE（`d = 4.13u`）= **1.19 s**（蓋章）／1.29 s（附身）；最慢英雄 × 最大 AoE = 2.06 s。**
  母體：帶 `radius > 0` 的技能共 **85 個且全部是 `ground`**（其中 9 個不造成傷害）；
  若只取「造成傷害」的 76 個子集，中位 5.88 → 5.69、門檻 → 1.17 s（**兩種母體只差 0.02 s，結論不變**）。
- **🔴 全遊戲最長起手 0.60 s = 最低門檻（1.19 s）的 50%。** 端到端驗證：對三個有起手時間的 ground AoE，
  讓一個**零反應、零延遲、施法那一 tick 就開跑**的中位移速受害者逃跑 → **三個全中**（223 / 260 / 223）。
  **這個遊戲裡沒有任何技能的起手時間長到足以走出它自己的爆炸半徑。**
- 守護者：`d = 3.6u`（`volleyRadius` **原值**傳入 `applyMark`（`GuardianSystem.ts:352`），不吃 ×0.6）
  → 需 **1.09 s**（`v_ref` 5.6）/ **1.35 s**（最慢 4.0），**現值 0.8 s 不夠**。
  提案：`volleyWindupSec 0.8→**1.25**`、`volleyRadius 3.0→2.5`
  （驗算 `d = 3.1u`：`v_ref` 需 1.00 s、最慢者需 **1.225 s ≤ 1.25** ✅ ⇒ **113 個英雄全數躲得掉**），傷害不動。
  ⚠ 初稿寫的 1.2 s 是用舊 `L = 0.40` 算的；在修正後的預算下對最慢英雄差 25 ms＝**差一個 tick**，故改 1.25。
- 授權公式（設計文件 4.4，**拆成兩段**，因為 ×0.25 的 CD 乘數讓「1.2 秒定身」變成懲罰施法者）：
  `T_warn = 0.45 + (radius × abilityRange + 0.6) / 5.6`；
  `castTimeSec = clamp(0.45, 0.60, round_0.05(T_warn × 0.45))`（施法者被鎖的那一段）；
  `impactDelaySec = ceil_0.05(T_warn − castTimeSec)`（蓋章已畫好、施法者已自由）。
  ⇒ **施法者最多只被鎖 0.60 s，受害者最多拿到 1.60 s 的地面警告。**
- **`cooldown` 乘數 0.25** 把上述所有未預警傷害的**量放大四倍**，授權時必須一併重審。

### ⛔ 結構性問題（加起手時間也救不了）

- **211 個 `targeted` 技能靠走位永遠閃不掉**：`CastResolveSystem.ts:52-57` 明文只有 `ground` 在結算時重查，
  其餘在起手當下鎖定。→ 提案 `AbilityDef.resolveRecheck: "lock" | "range"`，
  `"range"` 直接沿用 `BasicAttackSystem.ts:96-113`（目標離開距離就作廢）**已驗證可用**的規則。
- **113 個英雄只有 12 個有位移技**（13 個 dash；`maxDistance` **不吃** ×0.6 縮放，7.33–11u > 最大逃離 6.43u）
  → **有位移＝全躲得掉，沒位移＝全躲不掉**，89% 的英雄只能用走的。

### 🧟 「已實作但實際不會發生」——本次新增 4 例（同 #93 roundWins / taunt ctx / #79 的同一個病）

1. **`ENTITY_FLAG.CASTING` / `WINDUP`**：`snapshot.ts:222-224` **每 tick 寫入**，
   但 `apps/client/src` 對 `es.flags` 的窮舉 grep 只找到 `CHANNELLING` / `CONTESTED`（皆復活圈專用）→ **零消費者**。
2. **`StatusAuraFx` 整套（#39 的暈眩／定身／減速／衝刺身體光環）**：`VfxSystem.ts:390-399` 有實例、有 accessor、
   註解還寫著呼叫方式，但 `vfx.statusFx.set(...)` **沒有任何 production caller**，`statusesFrom()` 只有測試在用
   → **被暈眩的英雄看起來跟健康的一模一樣**，正是那個檔案宣稱已修好的 bug。
3. **8 個 `guardian*` 事件**：sim 發出，不在白名單，client 零引用。
4. **3 個 `fireRing*` 事件**：同上。

> **教訓（與前三例完全相同）**：綠色測試斷言的是**記憶體中的表**，不是**載入後的登錄表**，
> 也不是**跨過網路邊界的事件**。設計文件裡每一階段的驗收都刻意寫成 **runtime 驗收**（真的開房間、真的看 client 收到什麼）。

### ⚠ 授權時會靜默失效的陷阱（#79 就是這樣死的）

`packages/shared/src/content/registries.ts:70-71` **先**註冊獨立技能文件、**再**跑 `registerChampion(d)`，
而 `sim/content/registry.ts:41-46` 會用**英雄文件內嵌的 Q/W/E/R 副本覆蓋**掉獨立文件。
→ **只改 `content/abilities/*.json` 的 Q/W/E/R，runtime 會被完全丟棄**（EX 與 passive 安全，`registerChampion` 只走 QWER）。
已驗證現有 8 個非零值逐位元存活（`sela.r`/`thorne.r` 正是**從英雄文件內嵌副本**取得 0.5/0.4）。

### ✅ 已存在、必須重用而不是重寫

`CastResolveSystem`（延後結算／中斷／定身／**地面 AoE 結算時重查命中名單**——全專案最好的一段公平性程式碼）、
`GuardianSystem` 的標記相位、`castBegin/castEnd/castInterrupt/attackWindup` 廣播、
每個英雄（含敵人）的頭上施法條、`Telegraph.ts`（`fillMs`/`holdMs` **建構子參數早就在，只是沒人傳**）、
`AimIndicator.dashedRing()` 幾何、`GroundDecalPool`、`content/vfx/fx.prim.*`（**95 份元素 × primitive**）＋
`render/vfx/primitives.ts` / `elements.ts`、`EntityViewRegistry.ts:221-232` 的 `clipWindowMs` 施法 clip 拉伸
（⚠ **117 個模型的 `clipMap` 只有 `idle/run/attack/cast/hurt/death` 六個 key**，不可發明新 clip 名稱）、
`sfxManifest.ts` 已列的 `castBegin/castEnd/castInterrupt` cue（⚠ `GameApp.ts:803-804` 呼叫 `playSfx` **不帶 `{volume,pan}`**，
四個對戰區的施法音以同樣音量疊在一起）。

**四件「接一根線就會活過來」的事**：① `Telegraph` 傳真實 `fillMs`；② 半徑改用伺服器算好的 `castR`（已 ×0.6）；
③ 每幀呼叫 `vfx.statusFx.set(es.id, es.flags, …)`；④ `MatchRoom` 白名單加 11 個 `guardian*` / `fireRing*` 事件。

### 交界

- **與 #79**：預告能說「**何時**」，但真實登錄表 **460/554 個技能的 `vfxKey` 仍是同一顆 `fx.ember-bolt-cast`** →
  在 #79 完成前永遠說不出「**是什麼**」。兩者互補，不可互相取代。
- **與 #56**：本需求的正解是**還原 `acas`/`ucpt`/`ucbs`**，而不是重新發明數值 → 直接依賴 rawMods 直通與重跑匯入。
- **與 #85**：`DeathFocusFx` 是**攝影機後製**，場景內的預告 mesh 會被一起抽色 →
  **急迫度不可只走色相**，必須同時走亮度（0.55→1.00）、線寬（0.10→0.22u）、脈動頻率（0→6 Hz）。順帶對色弱友善。
- **與 #93**：`ROUND_WASH_FILTER`（`grayscale(0.88)` + 0.76 alpha 灰漸層）是 **DOM 層蓋在 canvas 上**，會壓平任何場景內預告 →
  規則只能是**時序**：**勝利演出擁有畫面時不得有傷害發生**。
- **⛔ 與 #100 直接衝突**：#100（回合判定後英雄還打了 ~66 秒）未修之前，上面那條時序規則**無法成立**，記錄為已知破口。
- **與 #105**：守護者拿到 `ENTITY_KIND.GUARDIAN = 4` 與真模型 key 之後，樹人／石頭人／巨獸人的身分才有地方掛。

### 仍未做（明講）

- 本輪**只做偵查與設計，一行程式碼都沒改，沒有 commit**。設計文件的每一階段都還沒有人認領。
- 火圈（#132）的兩條路（給真幾何 vs 誠實改名為全域流血＋倒數）是**設計決策，需 owner 拍板**，未在文件中代為決定。
- 匯入來源的名稱比對是**用技能名**而非 rawcode，同名技能可能誤配；嚴謹版本應改走 `EX_MAP.json` / `HERO_NUMBERS.json` 的 rawcode 鍵。
- **🔴 第三輪補上 owner 已拍板但前兩輪完全沒寫進設計的架構決定**：
  「**要把渲染跟傷害判斷時間兩個邏輯分開**……這跟**快打旋風**之類的格鬥遊戲是類似做法，**動作幀跟碰撞幀是分開的**」。
  設計文件新增 **0.5 節（幀資料模型 STARTUP / ACTIVE / RECOVERY，以 sim tick 為權威）**，
  並明訂「**sim 擁有傷害 tick，渲染器只能把動畫對齊上去；換服裝不會改變 frame data**」為決定性要求
  （否則命中時間會繼承 frame rate、LOD 切換 #115、glb 是否載完 → 同 seed 重播不再逐位元相同）。
  此模型**延伸** #133 的 `ImpactProfile`（`sim/combat/damage.ts:103`，管「打中之後」的 hitstop/hitstun/knockback）
  與 `hitFeel.ts` 的「damage-derived 預設 + 內容可選覆寫」模式，**不另立平行詞彙**。
- **🔴 由此抓出一個前兩輪漏掉的機制缺口：`RECOVERY`（後搖）今天完全不存在。**
  `CastResolveSystem` 在結算那一 tick 就解除定身，施法者當場自由 →
  **成功閃掉一發大招的收益是 0，對手不付任何代價**。前兩輪把 AGENCY 判為「唯一做對的一隻腳」只對了一半：
  「走出去真的有效」為真，「閃掉之後能反打」從未實作。提案 `recoverySec`（B 0.30 / C 0.47 / D 0.60 / L 0.47 s；
  鎖施法與普攻、**不鎖移動**，刻意偏離 SF，理由見設計文件 0.5.3），並要求後搖狀態**在 snapshot 上可見**
  （新 `ENTITY_FLAG.RECOVERING`）——懲罰窗看不見等於不存在。
- 一併修正設計文件內部矛盾：階段 4 原寫「火圈兩條路都要改走 `damageQueue`」，
  與 5.5 已推翻該建議的結論相反，已改為 ⛔ 不得改走。
- **第三輪覆算（同日，獨立探針重跑登錄表）**：頭條數字 **1.19 s 完全重現**；同時抓到兩處表格錯誤並已修正——
  ① 設計文件 4.1 的母體標成「76 個造成傷害的 ground」，實際那些數字屬於 **n=85（帶 radius 的技能，且 85 個全部是 ground）**；
  ② p90 列重現不出來（原寫 raw 6.42 / `d` 4.45 / `T` 1.25，實為 raw **6.05** / `d` **4.23** / `T` **1.21**）。
  本節上方的 `L`、`T_min`、守護者三組數字亦已由初稿的 0.40 / 1.10 / 1.2 同步更新為 0.45 / 1.19 / 1.25。
  覆算另逐條確認為真：`EntityState` 16 欄（Colyseus 上限 64，加 7 欄安全）、`ENTITY_FLAG` 256 以上全空、
  `apps/game-server/src` 無任何 `setPatchRate`（確為預設 20 Hz patch）、117 個 `clipMap` 恰好六個 key、
  `castType` 分佈 211/194/51/85/13、`castTimeSec>0` 為 10/554 最大 0.60、
  `GuardianSystem.ts:352` 確實傳原值 `volleyRadius`、`fireRingDamage` 確實已帶 `{id,amount,dmgType,origin,x,z}`、
  `resolveHoldPreview` 有乘 `abilityRange` 而 `VfxSystem.ts:612` 沒有（1.667× 落差成立）。
- 未實際開 client 目視驗證守護者的渲染樣貌；守護者主張建立在「白名單 grep 為零」＋「`snapshot.ts:203` 的 else 分支」上
  （與抓到 `roundWins` / taunt 兩案同一級的證據，但**真實對局才是最終定論**）。

## 2026-07-23 — CT 起手時間 **LANE A：owner 規則已落地到內容**（554 技能全掃，實測登錄表）

> owner 原話：「castTimeSec 沒有設定 的預設都要改成 0.6s，原本有設定的都 +0.3s，
> 所以施展技能的時候都要帶一段 0.6 秒的施展光柱光芒來提示」

- **規則已套用**：`content/abilities/*.json`（權威）＋ `content/champions/*.json` 內嵌 Q/W/E/R 副本（MIRROR RULE）同步改寫。
  554 個技能中 **545 個可施放技能全部拿到 castTimeSec**，9 個純被動豁免。
  contentVersion `cv_6c0d23e1c545` → **`cv_8b91ac43fbdb`**。
- **實測登錄表分佈**（`scripts/probeCastTelegraph.ts`，走 game-server 開機同一條 `ContentLoader`+`registerAll`）：

  | | 之前 | 之後 |
  |---|---|---|
  | 未設定 | 544 | **9**（全部是純被動） |
  | 0.60 | 3 | **535** |
  | 0.65 | 0 | **5**（0.35 + 0.3） |
  | 0.70 | 0 | **1**（thorne.r 0.4 + 0.3） |
  | 0.80 | 0 | **1**（sela.r 0.5 + 0.3） |
  | 0.90 | 0 | **3**（0.6 + 0.3） |
  | 0.35 / 0.40 / 0.50 | 5 / 1 / 1 | 0 |

  英雄 doc 內嵌副本 452 筆，castTimeSec **0 筆不一致**（codex／後台讀原始 doc，不同步就會顯示對局不採用的數字）。
- **唯一豁免：9 個純被動**（`passive` 有值且 `effects` 為空）。理由是機制性的，不是判斷：
  `abilitySystem.ts` 的 `activateAbility` 在走到起手分支之前就 `return "passive"`，
  這 9 個技能的 castTimeSec 在 sim 裡**永遠讀不到**，寫上去只會讓 codex 對一顆按不下去的按鈕標「0.6 秒詠唱」。
  名單：`godie-e001.w` `godie-e00q.q` `godie-e00q.r` `godie-edem.r` `godie-emns.w`
  `godie-etyr.ex` `godie-etyr.w` `godie-h01u.q` `godie-ofar.w`。
  ⚠ 順帶更正一個長期誤解：**「xx-00 = 被動槽」的命名慣例在出貨內容裡並不存在**。
  實際是 `xx-01..04` = QWER、`xx-002`（少數 `xx-001`）= EX，**沒有任何技能名字是 `xx-00`**；
  被動由 `passive` 欄位表示，而且只有 9 個是真正不可施放的。
- **🔴 沒有豁免、但 owner 應該在試玩時親自感受的四類**（規則照套，刻意不偷偷網開一面）：
  1. **位移技 13 個**（`castType: "dash"`）。0.6 秒硬定身之後才位移 → 逃生技變成預告後的逃生技。
     `godie-e012.w` `godie-efur.e` `godie-h021.w` `godie-h022.w` `godie-hblm.w` `godie-n00b.e`
     `godie-o00k.w` `godie-o00x.w` `godie-ogrh.w` `godie-udea.q` `godie-udea.r` `godie-uwar.e` `thorne.q`。
     全遊戲 113 個英雄只有 12 個有位移技（設計文件 4.5(b)），所以這 13 個的手感權重遠高於數量。
  2. **護盾 5 個**（`godie-h00l.w` `godie-o00l.e` `godie-o02s.r` `sela.w` `thorne.w`）
     與**治療 12 個**：救命鍵慢 0.6 秒 = 在 TTK 內可能就是救不到。
  3. **自我增益 184 個**（`castType: "self"`、不造成傷害）。其中 **87 個是 w3x tooltip 標 `[被動]`／`[靈氣]`
     卻被匯入成「可施放的 self + applyBuff」**——這是 #78 沒清完的殘留。
     正解是把它們改成 `passive` 欄位（順便自動落入上面的豁免），**不是**替它們開後門。
  4. **🔴🔴 自我定身鎖 6 個（真的會壞，不是手感問題）**：冷卻 × `combatEnv.cooldown = 0.25` 之後**比自己的起手時間還短**，
     所以按著不放就永遠出不了施法狀態。`content:validate` 每次都會列印這張表。

     | 技能 | 冷卻 ×0.25 | 起手 |
     |---|---|---|
     | `godie-e00v.w` 84-02 保齡球 | 0.125 s | 0.6 s |
     | `godie-ekee.q` 93-01 期末報告 | 0.125 s | 0.6 s |
     | `godie-etyr.r` 14-04 聖夜降臨 | 0.125 s | 0.6 s |
     | `godie-u011.r` 61-04 瘋狂怪物（w3x tooltip 標 `[開關]`／「0秒冷卻時間」） | 0.125 s | 0.6 s |
     | `godie-u012.r` 61-04 瘋狂怪物（同上，重複 doc） | 0.125 s | 0.6 s |
     | `godie-obla.ex` 33-001 喝了再上 | 0.250 s | 0.6 s |

     **真實 SimWorld 實測**（模仿 `Tier0Brain` 每 tick 施放任何就緒技能，300 tick = 10 秒）：
     `godie-u011.r` 定身 **284/300 tick = 94.7%**（改動前 0%）。**英雄 61 在 bot 手上等於一尊雕像。**
     三條路（未代為決定）：(a) 把這 6 個的冷卻改成 ≥ 起手；(b) 給它們 `rootWhileCasting: false`；
     (c) 把 `[開關]` 類技能改成 `passive`（最忠於 w3x）。
- **新增守門規則**（`scripts/contentValidate.ts`）：
  ① 可施放技能缺 castTimeSec **= 建置失敗**（這正是 #79「內容改了、執行期沒變」的同一種漂移）；
  ② 純被動帶 castTimeSec **= 建置失敗**；
  ③ 自我定身鎖清單每次列印（不致命）。
- **未做／待接手**：`packages/shared/src/sim/content/skeleton.ts` 的 SELA/THORNE TS 字面值**刻意沒有套用規則**——
  它是「沒有 content 目錄」時的 fixture，`combatTiming.test.ts` 的 ct-04（「ct=0 仍然瞬發」）需要一個 0 起手的技能才驗得到。
  這個分歧現在由 `content/loader.test.ts` 明文斷言，不是默默放過。遊戲本體不受影響（game-server 一律載 `content/`）。

## 2026-07-23 — 主題曲·寧靜女聲（`menuNocturne`）落在「破關」畫面：機制已做，但**被 18 秒自動跳轉卡死**

**已做**（`apps/client/src/audio/**` + `MatchEndPanel.tsx` + `ui/useAudio.ts`）：
勝利結算的床是 `victory`（`loop:false` 的一次性 sting），放完就沒了，玩家接著在**靜音**中看成績與
自動捲動排行榜（#25/#36）。現在 sting **自然播完**的那一刻，`menuNocturne`（85.33 s、循環、gain 0.55）
接手當床，離開結算畫面時 ref-counted 的 `bgmOverride` 自動釋放。**只有贏才有**；輸的一方維持
`defeat` sting 之後靜音（是否也該給床＝**未代為決定**）。

沒有寫死任何秒數：`AudioSystem.onBedEnded` 只在「非循環床自己播到底」時通知，
被 crossfade 換掉／被取代／提早停止／`dispose()` 都**不會**發（以 `this.bed.src === src` 的身分守衛判定）。

**🔴 真缺口（未代為決定，需要 owner 拍板）**：`MatchEndPanel.AUTO_ADVANCE_SEC = 18`，
但 `victory.mp3` 是 **18.34 s**——結算畫面會在 sting 播完前 0.34 s 就自動跳去大廳，
sting 因此是「被 crossfade 掉」而非自然結束，`onBedEnded` 正確地不發，**寧靜女聲一秒都聽不到**。
task #137 的輪替讓情況更微妙：`victory.samantha.mp3` 只有 **14.52 s**，
所以「每個 session 的第 1 場勝利」（原版）完全聽不到，「第 2 場」（Samantha 版）只聽得到約 3.5 秒。

| 檔案 | 長度 | 對上 18 s 自動跳轉 |
|---|---|---|
| `victory.mp3`（輪替第 1 次進場） | 18.340 s | 來不及，0 秒寧靜女聲 |
| `victory.samantha.mp3`（第 2 次） | 14.520 s | 約 3.5 秒寧靜女聲 |

三條路（未代為決定）：(a) 把 `AUTO_ADVANCE_SEC` 拉長到足以聽完整段（例如 30 s）；
(b) 讓自動跳轉倒數從「sting 播完」才起算；(c) 維持現狀，接受這首曲子只在 Samantha 輪替那一場短暫出現。

## 2026-07-23 — CT 起手時間 **LANE B：0.6 秒施法光柱已上線**（實測 sim→事件→訂閱者全鏈）

> owner 原話同上，本段負責的是後半句：「**所以施展技能的時候都要帶一段 0.6 秒的施展光柱光芒來提示**」。
> 參考圖：FF7 極限技光柱（中心黃白熾光／外圈橘紅火焰／能量向上聚攏／人物在光柱裡成剪影）。

- **由權威施法窗驅動，不是固定計時器**。`apps/client/src/vfx/CastPillarFx.ts` 只認三個事件：
  `castBegin{caster, ticks, castTimeSec}` 升柱、`castEnd` 釋放閃光、`castInterrupt` 熄滅。
  純曲線模組 `castPillar.ts` 裡**沒有 0.6 這個數字**——形狀是「窗內進度 u」的函數，
  所以 0.35s 與 2.0s 走完全同一條曲線（單元測試直接斷言兩者輸出相等）。
  LANE A 改了內容 → 光柱自動跟著改，不需要再動渲染。
- **每個英雄都有**：MatchRoom 早就把這三個事件廣播給所有 client（跟頭上施法條同一條流），
  `GameApp` 又把每一顆 drain 出來的事件餵給 `VfxSystem.handleEvent`，所以不需要新的接線
  ——這正是 StatusAuraFx 當年「引擎做好、少一行接線 → 永遠沒亮過」的坑，這次刻意不留。
- **實測全鏈**（`apps/client/scripts/probeCastPillar.ts`，contentVersion `cv_8b91ac43fbdb`）：
  `ContentLoader`+`registerAll` → 真的 `Abilities` → 真的 `SimWorld` 逐 tick → 真的事件 → 真的 `VfxSystem`：

  ```
  [1] 有施法窗（會升柱）的技能：545 / 554（98.4%）；另外 9 個是純被動（按不下去，沒有窗）
  [3] godie-e001 Q（ct 0.6s, vfxKey fx.prim.void.pulse-sm）
      tick 2   castBegin  → pillar=cast     alpha 0.000
      tick 3              → pillar=cast     alpha 0.219
      tick 5              → pillar=cast     alpha 0.575
      tick 20  castEnd    → pillar=release  alpha 1.125（釋放閃光）
      tick 26             → pillar=none     alpha 0.000（乾淨收乾）
  ```
- **不可洗白畫面**：`crowdAlphaScale(n) = max(0.4, 1/(1+0.11(n-1)))`。
  12 人同時施法 → 每柱 ×0.452，**總亮度 5.43 柱份而不是 12 柱份**；光點數同步節流
  （12 柱時 3 顆/脈衝、≤168 顆同時存在）。1 柱時仍是完整的 FF7 光柱。
- **不可蓋掉地面預告**：地面光暈 alpha 0.42 < `Telegraph.BASE_ALPHA` 0.85、半徑 0.95 < 最小 AoE 1.2
  （直接 import Telegraph 匯出的常數斷言，不抄字面值）。順手修掉一個**會說謊的預告**：
  `VfxSystem` 過去用 `Telegraph` 的預設 `fillMs = 300` 畫地面圈，
  LANE A 之後 0.6 秒的技能會在**傷害落地前 300ms** 就播「現在炸」的 resolve pop——
  現在改成用技能自己的 `castTimeSec`，地面圈與光柱同時結算。
- **元素正確（依文潔琳的冰不會噴橘火）**：顏色取自技能自己的 `fx.prim.<element>.…` vfxKey，
  其次是 doc 自己的色，最後才是 FF7 金。554 個技能實測分佈：240 個有真元素
  （void 51／physical 49／holy 27／fire 23／lightning 18／nature 16／arcane 14／ki 13／wind 11／ice 6／blood 5／sound 4／earth 3），
  其餘 314 走 doc 色／FF7 金退路（那是 #79 還沒綁完的內容債，不是本 lane 的缺陷）。
  ⚠ **實測踩到一個會讓這件事變成死碼的 Babylon 行為**：`StandardMaterial` 一旦綁 `emissiveTexture`，
  shader 就**用貼圖的 rgb 取代 `emissiveColor`**——在確認頁上量到 fire/ice/void/nature/holy
  的像素貢獻全是同一種灰 `[97,97,93]`。現在顏色**同時**寫進 `emissiveColor` 與**頂點色**
  （頂點色在替換之後才乘上去，是貼圖吃不掉的通道），並有單元測試鎖住。
- **預算**：暖機後每次施法 **0 mesh / 0 material / 0 particle system**（16 柱 × 3 mesh 一次配置、永久重用；
  光點走既有 `BurstPool`、以元素為 key 共用）。柱數硬上限 16，超過時回收**最接近結束**的那一柱
  （它本來就要收了），而不是最新的（那支預告還沒人看到）。
- **確認頁**：`apps/client/public/cast-pillar-audition.html`（+ `src/vfx/castPillarAudition.ts`）。
  owner 給的是一張圖，數字表格對照不了一張圖，所以做了跟 #93 煙火同規格的確認頁：
  真的 `CastPillarFx`／真的 `Telegraph`／真的相機，可切元素、同時人數（1–16）、起手長度，
  並支援凍結時間點截圖。
- **未做／待確認**：headless 分頁的 rAF 是凍結的、canvas 尺寸也不穩，
  所以「像不像 FF7」這件事**只做到量化驗證（升起曲線、亮度、群聚衰減、去色後仍可讀），
  沒有人眼定案**。請在真的瀏覽器開確認頁看一眼再決定要不要調 `SHELL_PEAK_ALPHA` /
  `CORE_PEAK_ALPHA` / `CORE_WHITEN` 這三顆旋鈕。

### 追加（同日，複驗）：探針原本在量自己，不是在量遊戲；以及 #93 罩色缺一條驗收

- **修掉探針的假數字**。`probeCastPillar.ts` 的顏色普查原本呼叫 `pillarPalette(vfxKey, null)`
  ——**docTint 傳 null**，等於把 doc 色退路整條關掉。但出貨路徑是
  `GameApp.ts` 的 `vfxDoc: (key) => contentDb.vfxFor(key)`（＝註冊後的 `VfxDefs.tryGet`），
  所以那份「314 走 doc 色／FF7 金」其實是**探針自己的行為，不是遊戲的行為**。
  接上真的 vfx doc 之後的實測：**FF7 金退路 0 個（0.0%）**，314 個全部真的取到 doc 色ramp；
  但**其中 298 個（53.8%）落在同一個橘色 `#ff9933`**（`fx.ember-bolt-cast` 的 ramp 色），
  全場只有 **17 種不同的柱色**。結論不變但更精確：**這是 #79 的內容債，不是本 lane 的缺陷**，
  只是「有 314 個走退路」聽起來像分散，實際是「超過半數的技能升起同一根橘柱」。
- **依文潔琳（owner 點名的那個例子）用登錄表複驗 → 已經是冰的**：
  `godie-n003` Q/E/R = `fx.prim.ice.{shockwave,nova,explosion-lg}` → 柱色 `#9ed9ff` 冰藍。
  ⚠ 過程中我一度「讀 `content/champions/godie-n003.json` 原始檔」得到 `fx.ember-bolt-cast`
  而誤判成 bug——**那正是任務簡報警告的那個坑**：內嵌副本仍是舊的（磁碟上 194 筆 mirror drift），
  standalone doc 才是 shadowing 修好後對局真正採用的來源。**要看登錄表，不要看 JSON。**
  這條複驗已固化成探針的 `[2c]`，避免下一個人重犯。
- **但同名的 `godie-n01g`（#113 的重複英雄 doc）四招全是 `fx.ember-bolt-cast` → `#ff9933` 橘柱**。
  也就是說：**選到哪一份依文潔琳，決定她的冰會不會噴橘火**。
  這是 #79 ×#113 的交集，本 lane 不能修（`bindings.ts` 的 ROSTER 沒有 n01g，
  而且 ROSTER 只被自己的測試消費，改它不會改變執行期 vfxKey——要動 content/）。
- **補上 #93 勝利罩色的驗收（ct-b8，原本只驗了 #85）**。兩者機制不同：#85 是 Babylon
  post-process，#93 是 DOM 的 `backdrop-filter` + 半透明漸層——**過得了 shader 不代表過得了漸層**，
  而 #100「結算後還在打」表示罩色亮著時真的還有人在施法。新測試直接 import
  `victoryPresentation` 匯出的 filter／漸層常數，用 Filter Effects 規範的矩陣算真值，
  取漸層裡最不透明那一段當最壞情況：**round 灰罩最嚴，光柱仍有罩後地板的 1.92 倍亮度**
  （門檻設 1.25 倍，留 35% 餘裕），且三種罩色都不會全通道爆白。

---

## 2026-07-23 — LANE 4 量測：ability shadowing 修好之後,#79 到底走到哪裡(純量測,未改任何原始碼)

**做法**：完全照 `apps/game-server/src/index.ts` 開機路徑跑一次真實載入
（`new ContentLoader(new FsContentSource(content)).load()` → `registerAll(store)`），
然後列舉**真的 `Abilities.all()`**。不看 JSON、不看單元測試——只認註冊完的登錄表。
（探針放 scratchpad，未寫進 repo；`contentVersion cv_8b91ac43fbdb`，113 英雄 / 554 技能 / 554 個 ability doc。）

### 三個數字（before 為稽核當時，after 為現在的執行期實測）

| 量測 | before | after | 判定 |
|---|---:|---:|---|
| `Abilities.all()` 裡仍是 `fx.ember-bolt-cast` | **460 / 554** | **285 / 554**（51.4%） | ✅ 少 175 |
| 48 名冊 × QWER = 192 格仍是佔位火焰 | **175 / 192** | **0 / 192** | ✅ 歸零 |
| 94 個 `fx.prim.*` doc 能被登錄表的 `vfxKey` 走到 | **25 / 94** | **94 / 94** | ✅ 全通 |

**歸因（重點，不要誤記成內容功勞）**：把 HEAD 的**已提交內容**重新跑一次兩種註冊語意，
舊的「embedded 覆蓋 standalone」得到 **460 / 175 / 25**——與稽核數字**逐一吻合**；
同一份 HEAD 內容改用新的「standalone 為準」得到 **285 / 0 / 94**。
也就是說 **460→285 這 175 個技能，100% 是 `registerChampion` 那個修正換來的**，不是內容再編輯換來的。

⚠ **副作用（下一個人一定要知道）**：工作區裡 113 個 champion doc 的 embedded 副本**也被同步改成新的 vfxKey**，
所以「以現在的工作區內容」跑反事實模擬，兩種語意都得到 285——**遮蔽現象目前被內容蓋住了、量不出來**。
唯一還在守這條保證的是 `packages/shared/src/content/abilityShadowing.test.ts`（7 tests 綠）。
別因為「兩邊數字一樣」就以為那個修正沒用途——它是下一次只改 standalone doc 時的唯一保險。

### 附帶驗到的兩件事
- 登錄表側與 `Champions.get(id).abilities[slot]` 側（HUD 技能列 / tooltip / icon / bot 腦讀這一側）
  **192 格 0 分歧**——影子沒有只是搬家。
- 102 個 distinct vfxKey **全部**在已載入的 vfx doc 裡找得到，**0 dangling**（不會靜默退回預設）。

### owner 驗收案：依文潔琳
- `godie-n003`（**在 48 名冊內**）：Q `fx.prim.ice.shockwave` / E `fx.prim.ice.nova` / R `fx.prim.ice.explosion-lg` /
  EX `fx.prim.ice.pulse-lg`——**冰的是冰**。W 是 `fx.prim.blood.nova`，對照技能名 `42-02 吸血祭品` 屬性正確，不是漏綁。
- `godie-n01g`（**第二份文件、不在名冊、不可選**）：Q/W/E/R/EX **五個全都還是 `fx.ember-bolt-cast`**，
  standalone 與 champion doc 兩邊都是火。她的冰在 n003 修好了，n01g 沒動——這筆掛在 #113（重複英雄文件）底下，
  一旦白名單放寬、n01g 變成可選，冰法師會噴橘火。

### 結論
- **#79 = PARTIAL（名冊範圍 DONE，全庫未完）**。
  可選的 48 名英雄、240 個技能（QWER + EX + 被動）**0 個佔位火焰**，owner 的驗收條件成立。
  剩 **285 個技能仍是佔位**，全部屬於**名冊外的 64 位英雄**（含 n01g）。
  真正的完成定義若是「554 全綁」，還差 285；若是「可玩內容全綁」，已達成。
- **#98 = 名冊範圍已不成立為缺陷，但底層 11 個模型仍是壞的（PARTIAL）**。
  `content/assets/model-budget/report.json`（generatedAt 2026-07-23T09:15Z）203 筆裡 11 筆 `triangles=0`。
  用真登錄表逐一掃 48 名冊的 champion doc / ability doc / 其 vfxKey 指到的 vfx doc：
  **roster 可達的零幾何引用 = 0**。全內容樹掃描也證實 **沒有任何 ability / vfx doc 引用這 11 個模型**——
  它們現在只被自己的 model doc 引用，`role=unused` ×10。
  **唯一的真實引用是 `imported.collision`**（`role=champion`）：`godie-u011 死亡老二 - 克勞薩先生` 的 `modelKey`，
  **該英雄不在 48 名冊**。所以「#98 的 roster 範圍靠 #79 re-point 解掉」這個說法**成立且已驗證**；
  但那 11 個 glb 本身沒被修（mdx 粒子發射器仍未轉出幾何），u011 一旦進名冊就是個隱形英雄。

**驗證**：`pnpm --filter @ggd/shared exec vitest run src/content/{abilityShadowing,loader,vfxParticles,castTimeCoverage,refs}.test.ts`
→ 5 files / 25 tests 全綠；`pnpm --filter @ggd/shared typecheck` → 0 error。本 lane **未改任何原始碼、未 commit**。

---

## 驗收 lane — 0.6s 施展光柱 + 全域詠唱時間（runtime 驗證，非測試）

需求原話：「castTimeSec 沒有設定 的預設都要改成 0.6s，原本有設定的都 +0.3s，
所以施展技能的時候都要帶一段 0.6秒的施展光柱光芒來提示」

### 1. 詠唱時間確實進到真實對局（登錄表，不是檔案）
用 game-server 開機那一組（`new ContentLoader(new FsContentSource(content)).load()` → `registerAll`）
獨立重跑一份 probe（`scratchpad/verifyCastRuntime.mts`，沒有沿用 lane A 的 probe）：

- contentVersion `cv_8b91ac43fbdb`，113 champions / 554 abilities
- castTimeSec 分佈：**未設 9（全部是 passive-only）/ 0.60 ×535 / 0.65 ×5 / 0.70 ×1 / 0.80 ×1 / 0.90 ×3**
- 違規（可施放卻沒有 castTimeSec）**0**；超出 [0.6, 1.0] **0**；passive 誤帶 castTimeSec **0**
- `Champions.get(id).abilities[slot]` 452 格 vs 登錄表 **0 分歧**
- `content/abilities/*.json` 原始檔 554 份 vs 登錄表 **0 分歧**（影子問題確實已死）

### 2. 真實 SimWorld 的延遲結算（Q/W/E/R/EX 五槽各一）
`world.step()` 全流程、出貨 combat-env。**castTime 是真的延遲，不是裝飾**：

| 槽 | 技能 | ct | 期望 tick | castBegin.ticks | 施放當下有傷害？ | castEnd@tick | 傷害@tick |
|---|---|---|---|---|---|---|---|
| Q | godie-e007.q | 0.6s | 18 | 18 | 否 | 18 | 18 |
| W | godie-e002.w | 0.6s | 18 | 18 | 否 | 18 | 18 |
| E | godie-e001.e | 0.6s | 18 | 18 | 否 | 18 | 18 |
| R | godie-e002.r | 0.6s | 18 | 18 | 否 | 18 | — |
| EX | godie-e007.ex | 0.6s | 18 | 18 | 否 | 18 | 18 |

地面 AoE 走出去真的躲得掉：`godie-e002.w` 站著吃 **90.6** 傷害，詠唱中走開 **0.0**。

### 3. 光柱 END-TO-END（每一跳都有 file:line）
1. sim 送出 — `packages/shared/src/sim/abilities/abilitySystem.ts:200` `world.emit("castBegin", …)`
2. 房間轉播 — `apps/game-server/src/rooms/MatchRoom.ts:304` 過濾 → `:348` `this.broadcast(MSG.EVENT, …)`
3. 前端收 — `apps/client/src/net/RoomConnection.ts:101` `room.onMessage(MSG.EVENT, …)` 入佇列
4. 每幀取出 — `apps/client/src/GameApp.ts:798` `drainEvents()` → `:799` `this.vfx.handleEvent(ev, nowMs)`
5. 分派 — `apps/client/src/vfx/VfxSystem.ts:709` `case "castBegin"` → `this.pillars.begin(...)`
6. 真 mesh — `apps/client/src/vfx/CastPillarFx.ts:274` `slot.pivot.setEnabled(true)`
7. 每幀推進 — `apps/client/src/GameApp.ts:950` `this.vfx.update(nowMs)` → `VfxSystem.ts:1067` `this.pillars.update(nowMs)`

**沒有斷點**。在真的 bot 對局裡從瀏覽器讀 `__ggdScene.meshes`：
`cast-pillar-shell / -core / -base` 實際存在並隨真實施放開關，單幀最多同時 **11 根**（上限 16）。

### 4. 已修：光柱在真實對局裡是「白色的」（本 lane 找到並修掉）
`VfxSystem.pillarPaletteFor` 原本用 `tintOfDoc(doc)`，而 `tintOfDoc` 取 `colorStops[0]`。
所有匯入的火焰 vfx doc 都是「白熱 → 有色 → 黑」的作法，第 0 stop 就是 `[1,1,1,1]`：

```
fx.ember-bolt-cast  colorStops = [ [0,[1,1,1,1]], [0.15,[1,0.6,0.2,1]], [0.53,[0.35,0.21,0.07,0.35]], [1,[0,0,0,0]] ]
```

`brighten()` 只擋「近黑」，不擋「無彩度」，所以白被正規化成白 →
**554 個技能有 297 個（53.6%）的光柱是純白**，包含全部 285 個還掛在 `fx.ember-bolt-cast` 的。
在真的對局裡量到：每一根活著的光柱 `emissiveColor` 與 vertex colour **都是 [1,1,1]**。
FF7 的金色 fallback 永遠碰不到，因為 doc tint「有值」——只是那個值是白的。

修法（`apps/client/src/vfx/castPillar.ts`）：
- 新增 `chromaOf()` 與 `TINT_MIN_CHROMA = 0.12`，`pillarPalette` 的 doc-tint 分支加彩度門檻；
- 新增 `pillarTintFromRamp(stops, legacyStart)`：掃過**整條** colour ramp 取彩度最高的一段，
  `fx.ember-bolt-cast` → `[1, 0.6, 0.2]`（doc 一直在描述的火焰金）。
- `VfxSystem.pillarPaletteFor` 改用它。

修完（離線把 554 個技能全部重算一次）：
`element 191 / doc 自己的色 314 / FF7 金 fallback 0 / 無彩度 49`，
剩下的 49 全部是 **element = physical** 的白鋼色（那是刻意的 element 配色，不是 fallback）。
真對局複驗：同一幀同時出現 6 種色 —
`[1,0.94,0.62] 聖 / [0.5,0.9,0.4] 自然 / [1,0.6,0.2] 火焰金 / [0.6,0.32,0.82] 虛空 / [0.74,0.45,1] 秘術 / [1,0.86,0.42]`，
**[1,1,1] 出現 0 次**。

### 5. 節奏代價（真 MatchController、12 bot、同一 seed 的 A/B）
`scratchpad/verifyTempo.mts`：把登錄表的 castTimeSec 全歸零跑一次，再用出貨值跑一次。

| | ct=0（規則前） | 出貨值 | 差 |
|---|---|---|---|
| 總戰鬥時間 | 900.0s | 815.0s | −9.4%（回合都撞 180s 上限，不是 TTK 變化） |
| 成功施放 | 272 | 260 | −4.4% |
| 場上 dps | 184 | 184 | +0.1% |
| root 佔比 | 0.0% | **1.7%** | — |

**bot 幾乎感覺不到**（Tier0Brain 施放頻率極低：12 人 815 秒只放 260 次）。
真正會痛的是**人類玩家**。以「技能一好就按」計，用真登錄表 × 出貨 cooldown ×0.25：

- 545 個可施放技能的**真實** cooldown：p10 **3s** / 中位 **11.25s** / p90 15s
- 113 位英雄站著不動的時間佔比：**平均 41.7%、中位 34.7%**
- **≥100%（永遠站著）7 位**：godie-e00v 維尼、godie-ekee 傳說中的大刀、godie-etyr 木乃香、
  godie-u011 克勞薩先生、godie-u012 克勞薩II世、sela、thorne
- **≥50% 有 25 位；≥25% 有 91 位**
- 最靈活的是 godie-ofar 皮卡丘 15%、godie-hpb1 蒼月潮 19%

### 6. 其他實測到的副作用
- **位移技變慢且被預告**：13 個 dash 全部 0.6s。真 sim 逐 tick 量 `godie-o00x.w / godie-udea.q /
  godie-n00b.e`：位移在 tick 18（=0.6s）之後才開始長，總位移 14.1u。逃生鍵現在是「先站 0.6 秒再逃」。
- **效果比詠唱還短的 15 個**（站著的時間比效果久）：
  `godie-e015.e 珍奶顏射` 0.6s 詠唱 / 0.1s 效果、`godie-e00j.q 謝謝指教` 0.6/0.3、
  `godie-u00n.q 伸縮自如的橡膠戰斧` 0.6/0.3、`sela.r Firestorm` 0.8/0.75 … 這類是規則的直接受害者。
- lane A 留下的 6 個 SELF-ROOT-LOCK 仍在 `content:validate` 每次輸出。

### 驗證
`@ggd/shared` 66 files / 654 tests、`@ggd/game-server` 34 / 244（含 same-seed byte-identical replay）、
`@ggd/client` 193 / 2020 + 1 skipped，全綠。`content:validate` OK（1441 docs, cv_8b91ac43fbdb）。
`todo:check` 1169 items OK。tsc：shared / game-server / admin / editor 全 0 error；
apps/client 只剩 2 個 error，都在**別的 lane 正在改的** `src/render/AssetManager.ts`，與本 lane 無關。
本 lane **未 commit**。


---

## 起手時間 LANE A（修訂版）：**分級 CT 取代平坦 0.6 秒** — 2026-07-23

> owner 修訂原話：「castTimeSec **0.3 – 0.6 秒**，依技能有多兇殘決定，**最兇的封頂 0.9 秒**。」
> 上一節記錄的**平坦 0.6 秒已作廢**；它造成的五組傷害全部在本節被量測著修掉。

### 1. 做法：公式，不是 554 個手寫數字
`packages/shared/src/content/castTimeFormula.ts` 是唯一真相來源，content 是它的衍生資料；
`packages/shared/scripts/deriveCastTimes.ts [--write]` 推導並寫入（同時寫**標準文件與英雄內嵌副本**，MIRROR RULE）；
`castTimeCoverage.test.ts` 把 554 支全部重推一次，跟 content 不一致就紅。
輸入全部是 `ability@1` 既有欄位：傷害 .35 / 硬控 .20（**再乘上控制實際秒數**）/ 半徑 .15 / 欄位 .20 / 投放 .10，
對映到 0.3–0.9 的七階（每階都是整數 tick：9/12/15/18/21/24/27）。

### 2. 五組傷害，前 → 後（全部用**同一支**量測腳本 `scratchpad/verifyHumanTempo.mts`）

| 指標 | 平坦 0.6 s | 分級後 |
|---|---|---|
| 人類 root 佔比 平均 / 中位 | 41.7 % / 34.7 % | **22.0 % / 21.6 %** |
| ≥50 % 的英雄 | 25 / 113 | **0** |
| ≥25 % 的英雄 | 91 / 113 | **29** |
| 雕像（CD < 自身起手） | **7** | **0** |
| 位移技開始位移的 tick | 18 | **9**（真 sim 逐 tick，`scratchpad/verifyDash.mts`） |
| 起手長過自身效果 | 15 支 | **1 支**（效果比 0.3 s 地板還短的那一支） |

### 3. 雕像不變量
`ct <= 自身後乘冷卻 / 8` ⇒ 單技定身 ≤12.5 % ⇒ 四格全開 ≤50 %，**由構造保證**。
天花板掉到 0.3 s 地板以下（後乘冷卻 < 2.4 s）時該技能改為**瞬發**，不硬塞做不到的值。

### 4. 例外（逐條交代，見 docs/design/cast-telegraph.md §0.0.3）
passive-only 9（欄位缺席，sim 讀不到）／ rapid-fire 17（瞬發）／ mobility 12（0.3 地板）／
defensive 17（0.3 地板）／ scored 499。**普攻不在此列**（`BasicAttackSystem` 是另一套，未動）。
全庫**沒有** toggle / counter castType，所以那條疑慮不存在。

### 5. 出貨分布（真實登錄表，`scripts/probeCastTelegraph.ts`）
```
contentVersion cv_d4c9a235c135   554 abilities
 (unset) 26 | 0.30 172 | 0.40 198 | 0.50 73 | 0.60 42 | 0.70 29 | 0.80 12 | 0.90 2
 會施法 528 支：平均 0.425 s、中位 0.400 s
 Champions.get(id).abilities[slot] 452 筆，0 筆不一致
 SELF-ROOT-LOCK 0（上一版是 6）
```
審計基線 `[undefined 544, 0.35×5, 0.6×3, 0.5×1, 0.4×1]` → 上表。

### 6. 仍待 playtest 用身體確認（刻意套規則、大聲標記，不偷偷豁免）
- **位移技 0.3 s（9 tick）**：選地板而非瞬發，因為 owner 的視覺需求是「每一次施法都要有光柱」。
  若實戰仍逃不掉，改成瞬發是一行。
- **175 支純自我增益**沒有豁免，分數 0 → 落 0.3 地板。若「開大」變鈍，調 slot 權重而非逐支例外。
- `godie-e015.e 珍奶顏射` 起手 0.3 s > 效果 0.1 s：0.3 s 是 owner 自己訂的地板，地板贏。

### 7. 未做 / 別的 lane
- `combatEnv.cooldown` 若被改，**整條曲線必須重推**（兩道天花板都是對後乘冷卻算的）。
  `castTimeCoverage.test.ts` 釘住 0.25，改了會紅。
- 瞬發的 26 支沒有起手窗，**光柱要怎麼演**是 client lane 的事（本 lane 一行都沒碰 apps/client）。

---

## 2026-07-23 · 測試版 code cut 的四個擋路石 —— owner 逐條裁決

背景：owner 問「我什麼時候能 code cut 釋出測試版找朋友一起玩個幾次收集意見」。
探測後提出四個真擋路石（A 內容分級／B 註冊沒門／C dev 密鑰／D 意見收不回來），
owner 逐條裁決如下。**四條都是需求，不是建議。**

### A → 任務 #176 上半：全開資源，不做分級
> 「我只找家人玩，不用分級，請全開資源」

部署出去的畫面必須跟 owner 在 localhost 看到的**完全一樣**。
`GGD_DEPLOY_TIER`（`apps/platform/internal/config/config.go` +
`apps/game-server/src/config/serverOps.ts`）不得在家用部署下扣掉任何素材。

**已知硬障礙（不是設定問題，是物流問題）**：`data/blizzard-overlay` 84 MB 被
`.gitignore:21` 的 `/data/**` 擋住，**永遠不會跟著 git 到主機**。
「全開」必須附帶一條 out-of-band 的素材投遞路徑，否則家人看到的是無貼圖占位人偶，
而 owner 這邊好好的 —— 那整晚的意見會歪掉，且歪得很難察覺。

### B → 任務 #174：邀請碼（取代 #126 的審核佇列）
> 「註冊可以輸入邀請碼做驗證，後台產出邀請碼來限制只有我邀請的才能註冊成功」

後台鑄碼 → 家人拿碼註冊 → 沒碼註冊不成功。**不做** pending/approved 佇列。
這是唯一擋住陌生人的東西，所以驗證必須在**伺服器端**，不是表單。

### C → 任務 #176 下半：密鑰加固
> 「請做好」

已知現況比預期好：`config.go:202` 缺 `JWT_SIGNING_SECRET` 會直接 error，
`docker/compose.yaml:52` 用 `${JWT_SIGNING_SECRET:?...}` 未設就不啟動。
仍要逐條掃完部署路徑，特別是 **loopback 自動 admin（#162）在真主機上不成立**，
owner 必須有一組能用的密碼登入，否則他自己也進不了後台。

### D → 任務 #175：回放重播就是意見蒐集管道
> 「用回放重播的方式即可」

不做回報按鈕、不做錯誤上報。sim 是確定性的（無 `Math.random`／`Date.now`，
同 seed 重播 byte 相同，`SimWorld.digest()`），所以錄 seed + 輸入流就能**原封重播**
家人那一場。必須附帶 digest 檢查：內容在底下被改過導致重播分歧時要**吵**，
不能默默播出一場不一樣的比賽 —— 那比沒有回放更糟。

### E → 延遲調整：SNAPSHOT_HZ 20→30 + INTERP_DELAY_MS 100→66

> owner 已核准。兩個常數是**一組**，不可只改其中一個。

**發現的真正 bug（比要求本身更重要）**：`SNAPSHOT_HZ` 在此之前**完全沒有消費者**，
`MatchRoom` 從未指派 `Room.patchRate`，線上那個 20Hz 是 Colyseus 的
`DEFAULT_PATCH_RATE`(=1000/20)。也就是說，只改常數等於**什麼都沒改**。
現在 `onCreate` 實際指派 patchRate（`config/snapshotRate.ts`，可用
`GGD_SNAPSHOT_HZ` 或後台 `serverOps.snapshotHz` 調整，免重新建置）。

**第二個 bug**：`ConnectionStats.noteSnapshot()` 寫死 `50` 當作標稱間隔。
在 30Hz(33.3ms) 下完美連線會固定算出 |33.3−50| = 16.7ms 的「抖動」，
超過 `classifyConnection` 的 15ms good 門檻 —— 每個玩家的連線品質標籤會
**永遠停在 fair**，而網路其實毫無問題。已改為由 `SNAPSHOT_MS` 推導。

**第三個**：`settings/types.ts` 的 `DEFAULT_NETWORK.interpolationDelayMs` 才是
runtime 真正在用的值（`GameApp` 傳 `renderParams.interpolationDelayMs`），
不是 `INTERP_DELAY_MS`。舊玩家 localStorage 存著 100，不做 migration 就
**永遠感受不到這次改動**。已 bump SETTINGS_VERSION 2→3，只把「未被玩家動過的
舊預設值 100」搬到新值，玩家自己調過的保留。

緩衝算術（對照真實 `InterpolationBuffer`）：buffer **不外插**，
`renderTick >= last.tick` 時 clamp 在最新 sample → 遠端**凍結**在原地，
下個 patch 到才續播。所以 delay 必須 ≥ 2 個快照間隔。
before 100/50 = 2.00；after 66/33.3 = 1.98（精確 2.0 是 66.67）。
`INTERP_INTERVALS_OF_HEADROOM` 由常數推導，`constants.test.ts` 斷言 ≥1.95。

**實測頻寬**（12 席 bot、固定 seed 20260723、130s combat、單一 client 實際
WebSocket 到達位元組）：patch 4,362.5 → 6,148.4 B/s（**+40.9%**）；
線上總量 9,618.6 → 11,405 B/s（**+18.6%**，約 +14 kbit/s）。
patch 幾乎沒有變小（220.8 → 217.9 B），所以 patch 那條**接近**天真的 +50%；
真正省下來的是 event 串流（damage/cast/death，由 tick 驅動）完全不動，
它佔 20Hz 時 55% 的頻寬。兩次跑的 event 位元組 5,256.1 vs 5,256.6 B/s
（差 0.01%）—— 同時也證明了同 seed 的 sim 完全一致。

---

## 2026-07-23 · 道具上架規則（owner 第二次重申）+ icon 補完

owner 說「我發現道具你沒有照我的方式上架，我再重複一次規則」—— **第二次講了，#70 標 completed 是錯的。**

### 規則 1：商店只上架「最終合成武器」（有製作書的）
可直接購買的清單 = 有製作書的最終合成品。半成品、材料、任務道具**都不該出現在商店**。

### 規則 2：隨機三選一 = 恰好所有任務道具，不多不少
owner 點名：四魂之玉、老衲的棒子、天堂之劍、仙后座、獸人船長十字鎬「等」。
**「不要放這些任務道具以外的東西」** —— 這是排他條款，不只是包含條款。

### 規則 3：三選一的「技能」要能在後台單獨編輯
理由是 owner 自己給的：**「因為他不是角色預設技能」**。目前後台只編得到角色技能。

### 現況：資料層根本表達不出這三條規則
```
content/items 214 份 · tier 1–5 · tags 208/214 全是 "wc3-import"
沒有 recipe 欄位、沒有 quest 欄位、沒有任何結構化標記
owner 點名的 5 件全部 cost = 0（唯一可用的間接訊號，但不可靠）
```

### 但地圖是 ground truth，而且標好了
`tools/w3x-import/out/GoDieEX22s/parsed/items.json`（208 筆）：
- **`製作書` 出現 165 次** —— 合成關係就在描述裡
- **`任務` 出現 5 次**，而且是彩色標籤格式 `|cffff8c00任務|r`，例：
  `I004 魔戒` → `"|cffff8c00任務|r\r\n|cffffcc00效能|r\r\n全能力+12..."`

⚠️ **但 tooltip 不是最終答案**：w3x 標 任務 的 5 件是 天堂之劍/老衲的棒子/魔戒/四魂之玉/獸人船長十字鎬 ——
owner 點名的 **仙后座沒有這個標記**（而且它有三個變體：仙后座殘骸 / 仙后座 / 兌換仙后座，
「兌換」聞起來是任務鏈）。依 `[[ggd-source-map-recovery]]` 的規矩：**JASS > tooltip，禁止 proximity-grep**。

### icon 補完（owner：現行兩段式生成法不錯且省 token）
> 「先特徵後風格兩次生成再符合解析度跟檔案格式轉檔」

現況缺口 **602 張**：
```
champions  109/113  (缺 4)
abilities   13/554  (缺 541)  ← 主要缺口
items      157/214  (缺 57)
content/assets/icons 實際檔案 451 個
```

> **⚠️ 2026-07-24 訂正 — 上面這組數字已經過時，不要再引用。** 實測（逐檔掃 `content/`）：
> `champions 113/113`、`items 214/214`、`abilities 646/662`、`augments 21/21`（檔名慣例，無 icon 欄位）。
> 真實殘留是 **16**，而且那 16 不是缺口，是原圖的佔位格 —— 見下方 §「icon 自動生成（#186）」。
> **可出貨的缺口＝0。**

### 追加（同日）：白名單與戰鬥數值也要一起搬
> 「白名單也要一起搬 調過的戰鬥數值（combat-env 的 admin override）也一起帶上主機」

`/data/**` 這一條 ignore 擋掉的**不只是 overlay**，而是整個營運狀態：

| 目錄 | 內容 | 少了會怎樣 |
|---|---|---|
| `data/blizzard-overlay` | 84 M | 10 隻開放角色變通用人偶 + 語音消失 |
| `data/curation/whitelist.json` | **48 角色 / 30 道具 / 240 技能** | **空白名單 → 每隻角色回 `not-whitelisted` → 沒人能開始遊戲** |
| combat-env admin override | owner 手調的戰鬥倍率 | 回到內容預設，他調的手感全部消失 |

`apps/platform/internal/curation/curation.go:7` 明寫 **“Nothing here seeds content implicitly.”**
內建 starter bundle（`starter.go:240`）是示範組、不是 owner 挑的 48 隻，而且要 admin 明確 POST 才套用。

**優先序：白名單 > combat-env > overlay。**
overlay 沒到位是 10 隻角色長得像通用人偶；白名單沒到位是**沒有人能開始遊戲**。

---

## #174 邀請碼註冊閘（invite-code registration gate）— 已實作

> owner：「註冊可以輸入邀請碼做驗證，後台產出邀請碼來限制只有我邀請的才能註冊成功」

取代 #126 的 pending/approved 審核佇列（**不做**審核佇列）。閘門在**伺服器端**：
`apps/platform/internal/auth/service.go` 的 `Register` 內，寫入帳號之前呼叫
`invite.Service.Redeem`。React 表單上的欄位只是 UX。

| 面向 | 決定 | 理由 |
|---|---|---|
| 儲存 | `DATA_DIR/invites/<CODE>.json`，**完全不用 Redis** | Redis 是可重建快取；「這組用過了」放 Redis 會被 FLUSHALL 復活，而且 #117 的 orphaned redis 就會變成發帳號的管道 |
| 原子性 | **先燒碼、後建帳號**，任何失敗路徑 `Release` 退回 | 反過來（先建帳號後燒碼）一旦中間掛掉，會留下**已經生出帳號的有效碼** → 閘門靜默漏一個註冊。先燒碼的失敗方向是「碼沒了但沒帳號」，重發一組即可 |
| 競態 | 每組碼一把 keyed mutex，check-and-burn 在同一個臨界區 | 兩個親戚同時貼同一組碼 → 剛好一個成功，另一個看到「已被使用」 |
| 第一個帳號 | **豁免**，且用的是 owner bootstrap **同一個** predicate（`claimOwnership` 的回傳值） | 要碼就是死結（只有 admin 能發碼，但還沒有 admin）。豁免也**沒有放寬任何東西**——那個視窗本來就在發 admin 權限，贏得那場賽跑的人根本不需要邀請碼。視窗會自己關（帳號檔一落地 `Admins()` 就非空）。真的不能接受這幾秒 → `GGD_OWNER_BOOTSTRAP_TOKEN=1`（既有開關，零新程式碼） |
| 開關預設 | `GGD_REQUIRE_INVITE` 未設定時**由 listen address 推導**：只有明確綁 loopback（`.claude/launch.json` 的 `platform`）才關，其餘一律**開** | 忘記設定的後果是「表哥要跟我要碼」，不是「全世界都能註冊」。看的是**自己的 bind address**（開機時 operator 選的），不是 caller address——後者會被 LAN vite proxy 洗成 127.0.0.1（`devsurface_test.go` 明令禁止） |
| 看不到的那個 case | nginx 對外、platform 綁 loopback | 只能靠 operator 設 `GGD_REQUIRE_INVITE=1`。因此 `server.New` **每次開機**都把解析結果印出來（WARN 帶 remediation），不靜默決定 |
| 錯誤面 | `invite_required` / `invite_invalid`（未知＝過期＝已撤銷）/ `invite_used` | 只多洩漏「這組碼存在且被用掉了」，正好是電話那頭需要分辨的「打錯了」vs「被用掉了」 |
| 碼格式 | `GGD-XXXX-XXXX`，字母表 `23456789ABCDEFGHJKMNPQRSTVWXYZ`（30 字元，去掉 I/L/O/U/0/1） | 唸電話、看截圖重打都不會混淆。~39 bits，前面還有 `GGD_REGISTER_RATE_LIMIT` |
| 沒有的東西 | 沒有 public read、沒有「驗證這組碼」端點 | 驗證端點＝免費的猜碼 oracle。唯一測試碼的方法是嘗試註冊，而註冊會燒掉它 |

**owner 的部署該跑**：`GGD_REQUIRE_INVITE=1 GGD_OWNER_BOOTSTRAP_TOKEN=1 GGD_REGISTER_RATE_LIMIT=20`
（`GGD_REQUIRE_APPROVAL` 保持關閉 — 邀請碼本身就是審核）。
launch.json 新增 `platform-invite` entry = 這個 posture，獨立 `DATA_DIR=/Users/Takuro/GGD/data-invite`。

---

## 2026-07-23 · 首場區網試玩的第一手回饋（最高優先）
> 「請你將技能特效、粒子特效、3d model 等項目提高優先權，因為目前玩起來根本不知道哪招是哪招」

**這是最重要的一條 playtest 回饋。** 遊戲已可區網玩，但技能在戰場上**無法辨識** ——
「根本不知道哪招是哪招」。優先權重排到最高。根因（依影響排序）：

1. **#79 — 285/554 技能仍共用同一團火佔位**（registry shadow 修復後 460→285）。
   這是主因：一半技能在畫面上噴同一種火。
2. **#123 — 共用 VFX primitive 庫**（`render/vfx/primitives.ts` 已有 PRIMITIVES 骨架）。
   #79 要綁到「不同」的效果，前提是那些效果以可重用 primitive 存在 → **#123 是 #79 的相依前置**。
3. **#178 — 516 技能沒有 icon**：連 HUD 技能鍵也是佔位，按鈕上也分不出哪招是哪招。
4. **#131 — 右上角白色粒子**（跑中）+ 一般粒子雜訊。
5. **#98 — 11 個零幾何特效模型**：匯入的 mdx 粒子發射器沒轉出來。
6. 3D model：#77 stand-in、#113 疑似重複角色。

### 併同裁決的事實（本次實跑確認）
- **#100 回合後殘留戰鬥 → SETTLED，可關閉。** beta 探測 8 seeds/37 回合實測：
  回合判定後戰鬥 tick=0、傷害事件=0、詠唱=0。之前「combatActive flip 後 0 傷害」的證明
  是**空的**（同 tick 設 false，構造上必為 0），這次量的是真的。**#85 死亡去飽和的相依已解除。**
- **#128 量尺仍失準**：`castabilitySweep.test.ts:74` `WINDOW = 26`，CT 已推到 0.9s=27 tick。
- **⚠️ 手機直向登入路徑不可發現**（beta 探測）：家人用手機加入，橫向登入畫面破版，
  正解「轉直向登入再轉回」沒人猜得到 → 直接說「壞了」就放棄。家人多半用手機 → 這條要進批次。

---

## 2026-07-23 · 我自己實際遊玩的第一手記錄（螢幕實測，非讀碼）

在跑中的 LAN stack（localhost:39527）親自操作，逐個畫面截圖確認：

### 🔴 PT-1 「Play offline vs bots」按鈕壞掉（onboarding 死路）
登入頁大字寫「no account needed — jumps straight into a bot match」，
點下去卻跳 `could not join the match: match creation is restricted to the platform reservation flow`。
根因：game-server 帶 secret → client 自建房被擋（MatchRoom.ts:146）。**localhost 和主機都一樣壞。**
owner 和每個家人都會先點這顆、然後卡死。→ 併入 #180（隱藏或改成「請由登入→大廳」）。

### 🔴 PT-2 手機橫向登入破版（#151，實測確認）
812×375 橫向：標題壓到頂端蓋住音訊鈕、表單被切、**「Sign in」按鈕整個被英雄陣容跑馬燈蓋住點不到**。
家人手機一轉橫就登不了。**直向 375×812 正常**，只有橫向壞。beta 探測的警告屬實。

### 🟠 PT-3 角色圖示大多是「文字色塊」佔位（#178 現形）
登入跑馬燈與（推測）選角格，大部分角色沒有 icon，退成一個色塊+單字（亂國腦死看不海最慈種黑鋼／地時／獸魔夢笑被神美賽常電犬）。
只有 3 隻有真頭像。這是「根本不知道哪招/哪角是哪個」的 HUD 面向。→ #178 需要那 ~20 行管線橋 + 516 張技能圖的本機 SD run（吃 GPU，排在試玩外）。

### ⚪ PT-4 回放 UI 目前有 live 語法錯誤（暫時性）
console：`[hmr] Failed to reload /src/replay/ReplayApp.tsx / ReplayControls.tsx`。
是回放工作流（#175）正在改檔的中間狀態，非真 bug，落地後會消失。

### 未能親測的部分
戰鬥內 VFX / 模型 / 打擊感因為 offline 壞掉 + 不輸入密碼（硬規則）無法親自進場；
這部分由「技能可辨識性」工作流的逐幀戰鬥截圖負責，不重複。

---

## 2026-07-24 · #115 模型 LOD：畫質設定真的換檔了（含實測網路證據）

**發現的坑（先驗證再修）**：`RenderParams` 完全沒有模型維度，`AssetManager.load()`
直接用 model doc 的路徑。所以 Low 和 High 下載、繪製的是同一份 geometry —— 下拉選單本身
不是假的（解析度／粒子／陰影／draw distance 都真的有動），但「模型細節」這一項根本不存在。
整個 repo（`apps/client/src` + `packages/shared/src`）搜不到任何 `lod`。

**做了什麼**：`tools/lod-gen/`（純 Python 標準庫，零新依賴、零下載）產出 87 個比賽會用到的
模型的 `-mid` / `-small` 兩階；client 端新增 `render/modelLod.ts` 作為唯一解析點，
`AssetManager` 以「解析後的路徑」為 cache key（用原路徑當 key 會讓設定再度靜默失效）。

**實測數字（瀏覽器真實請求，非單元測試）**：一場 combat-dota 的模型 payload
724,173 B（high）→ 515,073 B（mid）→ **260,304 B（small，36%）**；
畫面三角形 112,796 → 61,828 → 31,412。請求數三階都是 10（沒有多餘的 404 探測），
每個 URL 都帶 `?h=`（沿用既有 immutable 快取，不是一批新的 revalidating 請求）。

**誠實的代價與待決**：
- 磁碟 +33.48 MB / 174 檔（`content/assets/models` 33 MB → 67 MB）。LOD 是拿 repo 體積
  換每個玩家的頻寬與 GPU，這筆帳要記著。
- `small` 階偏激進：knight 的頭盔在近距離明顯變成方塊。戰鬥鏡頭距離下可接受，但**建議
  owner 實際打一場再決定要不要把 low 當任何人的預設**。
- 「auto」刻意停在 high：adaptive ladder 是每秒級的控制器，讓它換模型檔＝比賽中反覆發網路
  請求，而且發生在最跑不動的機器上。真正的受益點是首次開機的 `autoDetectPreset`。
- 部分 w3x 匯入模型縮不下去（geoset 碎片幾乎全是拓樸邊界，護縫的代價）；
  `guardian_skeleton.glb` 因為沒有 model doc 的 clipMap，動畫（佔 42% 檔案）不敢刪。
  → 給這些模型補 clipMap 會直接再省一截，列為後續。

詳細量測與設計理由：`docs/_model-lod-115.md`。

---

## 2026-07-24 — 商人講話呈現 + 購買個性回應 + 被動第6格更正

### 需求（本次口述）
1. **#148 商人輪播提示要「像商人在講話」**：訊息框旁邊要有商人 icon 頭圖，讓人一眼看出是
   「那個旅行商人在給建議」，而不是一個找不到來源、飄在畫面上的文字框。
   - 現況：`MerchantTipBox.tsx` 已有頭圖（`MerchantHeadIcon` size 46）、「旅行商人」名牌、5s 輪播、
     說話小尾巴——但頭圖是 #146 的「畫的」半身像，其後備 raster `MERCHANT_PORTRAIT` 從沒生成，
     所以看起來像抽象佔位符，才連不起「這是商人」。
   - 交付：給商人一張真正的旅行商人頭像（走 SD icon pipeline 生 raster，或把畫的半身像改到一眼是商人），
     強化「他在說話」的讀感（名牌、尾巴指向中央商人模型、出現時的說話微動），並實機驗證中場真的會顯示。
2. **購買後英雄要依個性回應「自己的想法」**，不只是擺出攻擊動作。
   - 現況：`IntermissionStage.tsx` 的 `purchaseSeq` effect 只呼叫 `playGesture("interact")`（商人交貨）+
     `playChampionReaction()`（英雄一個反應「動畫」，見 `IntermissionScene:806`，挑 clip 或 squash-pop）。
     純動畫、沒有語音也沒有個性台詞。
   - 交付：每角色 3 句短的、符合個性的購買反應台詞（第一人稱、由 description/角色設定生成），
     寫進**新檔** `content/config/purchase-lines.json`（不動 champion doc → 不撞正在跑的 icon 生成），
     加一個英雄側的說話泡泡 `HeroReactionBubble.tsx`，購買時顯示；動畫改挑「非攻擊」的滿意反應。
     語音先不做（掛到 #142 名言 VO），文字泡泡是本次必交。
   - 執行中：workflow `w5gaat4m4`（Speak+Persona ∥，然後 Wire）。

### 更正（重要）— 被動/天生技「是」第6格，之前 README 說錯了
- 使用者一再強調「每個人應該是六種，被動也是包含 slot，等級1就獲得」。稍早 README 生成器附註寫
  「全樹沒有任何 xx-00 被動技能文件」——**磁碟上屬實，但模型錯**。
- 來源考古（workflow `wr1rlg7b2`，純考古未改內容）證實：
  - 被動/天生技 slot 的正確編碼是 **`NN-00`**（NN=英雄編號），不是 QWER 意義的 xx-00，
    也不是那 7 個 `22-02` 式巢狀 passive（那些其實是 passive-typed 的 QWER 01–04）。
  - **108/111 角色**在英雄單位的 `abilities`（WC3 非學習/天生技，等級1即有）裡有各自的 `NN-00`；
    匯入器把它整個丟了——內容只出 q/w/e/r/ex 五份。
  - 108 個 NN-00 裡 **~51 是真被動型**（無 CD/[被動]：光環、閃避、觸發、回復、每擊/每殺成長）可用
    `abilityPassives.ts` 以 ranks[] 套用；**~57 是主動天生技**（D-slot、有真 CD），仍是等級1的 slot 但
    不能當純數值 self-buff。
  - 3 個真的沒有：`godie-h02n 腦包英雄`、`godie-u01q 測試英雄`（都沒 abilities）、`godie-ogld 美白大法師`
    （有 72-01..04 + 72-002，但全圖沒有 72-00）。
  - 抽取法已對 7 個既有巢狀 passive 交叉驗證（58-02 鋼鐵尾巴、14-03 魔力應援 逐 rank 完全吻合）。
  - 詳見 `tasks/wr1rlg7b2.output`。
- **後續（內容寫入批次，需等 icon 生成排空以免撞檔）**：寫 108 份 `NN-00` 天生技 doc、把 51 個被動型接進 sim、
  在選角面板與 README 呈現「第6格 被動/天生技」。57 個主動天生技先標記、逐一接。

### 第6格 慣例已定案（樣板 2 份已落地並實機載入通過）
- **doc id**：`<championId>.passive`（`godie-e001.passive`），完全比照既有的 `.ex` 前例。
- **champion doc 要顯式指名**：新欄位 `passiveAbility`（比照 `exAbility`），**不是**沿用 `champion.passive`
  ——後者是 7 份 doc 上的舊 hook 區塊，不是 slot。缺席＝該英雄在原圖真的沒有 `NN-00`（3/111），是考古事實不是 TODO。
- **slot 值**：`ability@1.slot` 新增 `"PASSIVE"`（`zChampionAbilitySlot`）。型別上刻意與 `AbilitySlot`
  分家（新 `ChampionAbilitySlot`）：施法/升級 Command 仍只吃五個可施放槽，等 sim 真的長出
  `passiveSlot` 實例（`exSlot` 前例）時再連同每個 switch 一起放寬。
- **兩種天生技的判別欄位**：`innateKind: "passive" | "active"`（slot 為 PASSIVE 時必填，其餘 slot 禁止填）。
  `"passive"` = 無 CD 的常駐自我增益，走 `ability@1.passive.ranks[0]`、`effects` 必須為空；
  `"active"` = 有真 CD 的 D-slot 主動，必須有 `effects`。
- **解析入口**：`championPassive(championId)`（`sim/content/registry.ts`），回傳的一定是 standalone doc 本體。
- **樣板**：`godie-e001.passive`（22-00 嗚鎖打!，active：150 物傷 AoE + 0.5s 暈 + 4s 自我加速，JASS 佐證）與
  `godie-e007.passive`（12-00 感應意脈，passive：20% 物理閃避）。probe：`packages/shared/scripts/probePassiveSlot.ts`。
- **已知缺口（不是臆造，是照實記錄）**：sim 沒有 evasion/閃避機制（`Stat` 列舉沒有這個 stat，
  `damage.ts` 也沒有 miss 判定），所以 12-00 的 0.20 目前只寫在 doc 的敘述裡，`ranks[0].modifiers` 是空的。
  51 個被動型裡凡是閃避類的都會撞到同一面牆——要嘛 sim 加一個 evasion stat + 一次 seeded roll，要嘛照實留空。
  **絕不可**沿用匯入器當年的 `+25 armor` 假動作（#78 已經點名過那是錯的）。
- **待 Build 階段**：`content/bundle.json` 尚未含這 2 份新 doc（本階段不跑 `pnpm content:build`）；
  `content/abilities/_index.json` 與 `content/manifest.json` 已同步。

### 效果音ラボ 盤點（workflow `wqo7p8m7x` 完成）
- 大發現：庫裡已下載但**沒發聲**的 効果音ラボ 有 26 個。本次「零下載」直接接上 9 個（回血/技能升級/低血量/
  升級 jingle/EX sting/開場鑼/結束鑼/VS 揭示/結算揭示），apps/client 已改、632 音訊測試綠、tsc 0。
- 2 個下載+已對應但無事件可觸發（buffApply、explosion）→ 需先加 sim 事件。
- 1 個不能接：block-clash/block-shield（殘響，打擊感刻意換掉，`audioAssets.test.ts` 擋著）。
- 尚需**新下載** 10 項（需使用者授權，版權物抓本機 overlay）：高＝傳說寶珠轉蛋、抽卡揭示閃光、
  守衛塔最後一擊/範圍重擊、#124 下課鐘聲；中＝分頁切換/復活詠唱/重生 warp/火環火焰；低＝競技場環境床/市場人聲。
- 詳見 `tasks/wqo7p8m7x.output`。
- **已補（守衛塔 2 音）**：`guardianSlam`（打撃4「岩を砕く」）＋`guardianLastHit`（アイテムを入手1「お金」）
  素材已入庫並接線完成 —— `guardianImpact`（範圍重擊落地，每個 mark 一發、同 tick 由 300 ms cooldown 併成一擊）
  → `guardianSlam`；`guardianSlain` → `guardianLastHit`，**只對搶到最後一擊的座位**響（事件是全房廣播，
  故在 `audio/combatSfx.ts` 以 AudioDirector 發佈的 local seat 做閘門；`killerSeatId:-1 / gold:0` 的 void
  payout 靜音）。sim 未改（事件本來就有）。剩餘待下載：傳說寶珠轉蛋、抽卡揭示閃光、#124 下課鐘聲等。

### 効果音ラボ 授權條件：全清單上架授權頁（已完成）
- 使用者授權下載 効果音ラボ 音效時附了一個條件：「只要好好列出附記在授權頁面就好」。
  這是**對使用者的承諾**，不是授權義務（該站 商用可・報告不要・クレジット任意，標示來源本身是任意的）。
- 現況盤點（以 `sfx/lab/MANIFEST.json` + `content/config/audio-map.json` 為準）：
  **54 個素材** = 46 個 SFX（`audio/sfx/lab/`）+ 8 個 声素材（`audio/voice-jp/`）；
  其中 **43 個 SFX 已綁定並會在遊戲中播放**，3 個 SFX（block-clash / block-shield / impact-heavy）與
  全部 8 個語音檔隨遊戲附帶但無任何情境播放。
- 已上架：`content/assets/CREDITS.md` 逐筆 ledger（含日文原標題、原檔名、來源頁、用途、綁定 event、處理、時長）
  ＋ 遊戲內 `#credits` 版權聲明頁新增「効果音ラボ 全素材清單」區塊（依 UI／演出／戰鬥／魔法／環境／声素材 分組、
  容器內捲動、手機不橫向溢出、標示 使用中／收錄未啟用）。仍留在 **禮貌性** 區塊，CC-BY 巨龍仍是唯一強制署名。
- 誠實標註：`arenaAmbience.mp3` 只有頁面層級來源（原始檔名未留存），清單上如實寫明，不臆造連結。
- 防漂移：`apps/client/src/ui/platform/sfxLabCredits.test.ts` 會比對磁碟檔案與 audio-map，任一漂移即紅。
- **禁止**做「逐一試聽／下載」的音效展示頁（屬 再配布）；清單只能是文字。

### 第六槽真的生效了嗎：sim 套用階段的實測（本階段完成）
- **槽位落地**：`AbilitiesComp` 新增 `passiveSlot`（`exSlot` 前例），`spawnChampion` 以 **rank 1** 建立
  ——EX 是「解鎖」所以 rank 0 起跳，天生技是「等級1就獲得」所以 rank 1 起跳，兩者刻意不同。
  `syncAbilityPassives` 把它排在 Q/W/E/R/EX 之後、固定順序納入掃描，因此 `sources` 排序仍是決定性的。
- **實測數字（`packages/shared/scripts/probeInnateApply.ts`，跑真的 content + 真的 spawnChampion）**：
  108 個天生技裡 **19 個在出生當下就掛上 ModifierSource 並改變 final 屬性**；
  29 個被動型 doc 的 `ranks[0]` 是**誠實的空**（機制不存在，見下）；60 個 active 型「已擁有、可定址、尚不可施放」。
- **踩到並修掉的真 bug：重複套用**。godie-hart / godie-huth / godie-h02u / godie-h02k / godie-h01u 這 5 位
  同一招天生技**同時**存在於舊的 `champion.passive` 內嵌區塊與新的 standalone doc。直接接上會讓
  28-00 無限再生 變成 +24 hp/s（應為 +12）、01-00 怒斬 每次揮擊擲兩次 15% proc。
  `innateSupersedesLegacyPassive()` 依專案既有規則（standalone doc 為準，見 `registerChampion`）壓掉內嵌那份；
  thorne / sela 沒有 `NN-00`、內嵌區塊是唯一定義，**不動**。
- **29 個空的到底缺什麼機制**（依數量排序，給後續 lane 當清單）：閃避／迴避 5（12-00×2、45-00、92-00、98-00）、
  對敵方的光環減益 4（79-00×2、66-00、40-00）、機率減傷 2（03-00、78-00）、傷害型態減免 3（08-00×2、43-00）、
  真視／隱形 4（21-00、16-00×2、27-00）、每殺成長 2（07-00、09-00）、其餘為第二生命／變身／夜間條件等。
- **evasion 這面牆的範圍評估（本階段刻意沒做，說明理由）**：加一個 `Stat.Evasion` 不只是 `statTypes.ts`，
  還會連動 `ITEM_MODIFIER_LIMITS`（`content/schema/common.ts` 的窮舉 Record）與 client 的
  `statDisplay.ts` `META_BY_STAT`（同為窮舉 Record，屬 UI lane）。本階段的 lane 明文禁止改 content doc 與 UI，
  而 modifier 本身又只能寫在 content doc 裡——只改 sim 會是**沒有任何 doc 使用的死碼**。
  故照實留空並記錄，等一個能同時動 sim + schema + content + UI 的 lane 一次做完。
- **決定性**：`sim/innatePassive.test.ts` 用同 seed 兩個世界跑 300 tick 逐 tick 比對 digest（含會擲
  `world.rng` 的 proc hook），另加一個不同 seed 必須不同的反證；game-server 的 replay 全套 304 測試亦全綠。

---

## 2026-07-24 · 標準（驗收門檻，不是單一任務）

> 使用者原話：「[技能戰鬥效果] 及 [球體/蝗蟲群/粒子特效] 要記得明確比照原 w3x 實作」

這是**長期驗收門檻**：技能的戰鬥效果與 orb／蝗蟲群（locust swarm）／粒子特效必須**比照原地圖實作**，
不接受「看起來像」的近似。往後任何技能／特效工作都要拿這條當通過標準。

### 盤點現況（唯讀實測）——**目前不合格**

| 項目 | 數字 | 判定 |
|---|---:|---|
| `fx.prim.*` 合成 primitive | **585 / 662** | ❌ #123 是風格化**重建**，不是原 mdx 粒子發射器 |
| `fx.*` 具名／匯入特效 | 30 | 真正綁到匯入資產的只有這些 |
| 無 `vfxKey` | 47 | ❌ |
| #98 零幾何特效模型 | 實測 3 個 glb ≤1.9 KB（`heronarutos4effect` 1900B、`collision` 1148B、`divinering` 1020B） | ❌ 發射器沒轉出來 |
| #50 每次施放美術參數 | 未移植 | ❌ scale/facing/tint/alpha/height/timeScale 都不是地圖值 |
| 被動型天生技實際生效 | 19 / 48 | ❌ 29 個 modifiers 全空 |
| 主動天生技可施放 | 0 / 60 | ❌ |

### 根因分層（**修的順序必須照這個**，跳過任一層下一層都白做）

1. **資產層**（#98）：WC3 的 orb／蝗蟲群本質是**粒子發射器＋附著點**，不是靜態網格。mdx→glb 轉換時
   發射器沒有幾何可烘，出來就是空殼。正解不是「再轉一次」，而是把發射器**參數當資料抽出來**
   （emission rate、lifespan、初速/重力、貼圖、blend mode、tint 曲線、附著骨點），在 Babylon 端
   重建為等價發射器。
2. **綁定層**：585 支技能指向合成 primitive。要逐支回到 w3x 的 art 欄位
   （`Ashm` target/special/effect art、`Aloc` 附著點）與 JASS 的 `AddSpecialEffect*` 呼叫，
   取回「本來該長什麼樣」。**JASS > tooltip**，且不得用鄰近 grep 猜。
3. **參數層**（#50）：每次施放的 scale/facing/tint/alpha/height/timeScale。
4. **效果層**：sim 缺 `evasion` 等屬性 → 天生技與部分技能效果落不了地。

### 時序限制
特效保真會寫 `content/abilities/*.json` 的 `vfxKey`／`effects`，與 icon workflow（`wvtuqaybu`，
正在寫同一批檔案的 `icon` 欄位）**同檔衝突**。因此：**先跑唯讀的來源考古**產出逐支對照表，
寫入階段排在 icon 排空之後。

### ⚖️ 標準放寬（使用者澄清，2026-07-24）——「像那個效果」可以，但要有證據

> 「我可以接受像那個效果，前提是 1. 你真的參考過原始參數 2. 你判斷過是否合理符合情境
> 3. 你真的試玩過適合，方法要先自證 4. 在 Babylon 端重建等價發射器」

**標準從「像素級複刻」改為「有根據的等價」**。`fx.prim.*` 近似**可以通過驗收**，但每一支都必須附上四項證據：

| # | 關卡 | 通過條件 | 誰負責 |
|---|---|---|---|
| 1 | **讀過原始參數** | 該技能在 w3x 的 art 欄位／JASS 呼叫已被實際查出，標記 CONFIRMED／INFERRED／UNRESOLVED | 考古 `w4on4u9pu` |
| 2 | **判斷情境合理** | 要寫出「為什麼這個近似在這個情境成立」，不是預設近似就好 | 修復階段 |
| 3 | **實際試玩適合**＋**方法先自證** | 方法必須先拿已知正解反推成功；近似要在實機看過才算通過 | 修復階段（含實機截圖） |
| 4 | **Babylon 端等價發射器** | 對應 #98 正解：發射器**參數化重建**，不是再轉一次 glb | 資產層 |

**影響**：585 支不再預設全部要重做。多數可能在「讀過原始參數＋判斷合理＋試玩通過」後**直接判定通過**，
工作量大幅下降；真正要動的是與原效果**明顯不符**或**落在球體／蝗蟲群／粒子**這三類、以及 #98 空殼資產的部分。
⚠️ 不得反向濫用：**沒讀過原始參數就宣稱「近似可接受」= 不合格**。

---

## ✅ 已關閉（機制半邊）：sim 缺 `evasion` 屬性 —— 2026-07-24

上面「效果層：sim 缺 `evasion` 等屬性 → 天生技落不了地」的**機制半邊已完成**。

| 半邊 | 狀態 | 位置 |
|---|---|---|
| sim 屬性 + 命中判定 | ✅ 完成 | `packages/shared/src/sim/combat/evasion.ts`、`stats/statTypes.ts`、`systems/BasicAttackSystem.ts`、`systems/ProjectileSystem.ts` |
| item modifier 上限（窮舉 Record） | ✅ 完成 | `packages/shared/src/content/schema/common.ts` `ITEM_MODIFIER_LIMITS` |
| **內容**：29 支空 modifier 的 迴避 天生技 | ❌ 未做（內容 lane） | `content/abilities/*.passive.json` |
| **UI**：`META_BY_STAT` / `STAT_SHELF` 沒有 `evasion` 這一列 | ❌ 未做（UI lane） | `apps/client/src/ui/panels/statDisplay.ts`、`shopGrouping.ts` |
| **網路**：`evade` 事件未在白名單，客戶端收不到 | ❌ 未做（net/client lane） | `apps/game-server/src/net/eventFanout.ts` |

**模型（一句話）**：迴避＝**只對普攻**的防守方 pre-damage 骰（近戰在傷害點、遠程在飛彈命中當下），
用 `world.rng`；閃過＝完全 miss（無傷害／無 on-hit／無吸血／無 hitstop），但揮擊本身照樣發生。
**不套用在技能上**，理由見 `combat/evasion.ts` DECISION 1：WC3 `Evasion` 從來只閃普攻，
而且 cast-telegraph.md §4.5(a) 要的是「位移閃避」這種玩家可掌握的 agency，不是隱藏骰子。

**`evasion = 0`（今天全部英雄）完全不擲骰**，故既有 replay／digest 逐 tick 不變（已測）。

---

## ✅ 已關閉：#126 私人部署審核閘 —— 補齊「後台看得到、決定留得下、決定立刻生效」 —— 2026-07-24

#126 的**玩家半邊**（註冊→pending→無 token→login 403→approve 才能玩）先前已經落地。
這一輪補的是**營運半邊**與 go-live 硬化，全部在 `apps/platform/**`（Go）：

| 缺口 | 先前狀態 | 現在 | 位置 |
|---|---|---|---|
| 後台**看不到**誰在等 | ❌ 沒有列隊端點，`AccountRow` 連 `status` 都沒有 | ✅ `GET /admin/accounts/pending`（最舊在前）+ `?status=` 過濾 + 每列帶 `status`/`approved` | `internal/admin/admin.go`、`handlers.go` |
| 核准/拒絕**不留紀錄** | ❌ 直接寫 `Accounts.SetStatus`，繞過 admin service，稽核日誌空白 | ✅ `admin.Service.SetApproval` → `approval_approved` / `approval_denied` + 操作者 + `reason` | `internal/admin/admin.go` |
| 可以把自己**鎖在門外** | ❌ 拒絕最後一個可登入的管理員 = 沒人能核准任何人（含修這件事的人） | ✅ `409 last_admin`，與 `SetAdminRole` 撤權同一條規則 | `internal/admin/admin.go` |
| 拒絕/停權**不立即生效** | ❌ access token 是簽名 bearer，最長 ~15 分鐘照玩、照管 | ✅ `AdminOnly` 要求 *usable* admin；`auth.PlayableOnly` 守 room/match REST + lobby WS handshake；拒絕時撤 refresh | `internal/admin/middleware.go`、`internal/auth/middleware.go`、`service.go`、`internal/lobby/ws.go` |
| 忘了設 `GGD_REQUIRE_APPROVAL` 就上線 | ❌ 只讀 env，預設 = 關（開放註冊即可玩） | ✅ `config.resolveRequireApproval`：非 loopback 綁定預設 **開**，loopback 預設關（#127 分級同一個 predicate），env 兩向都可覆寫；每次開機都記 log | `internal/config/config.go`、`internal/server/server.go` |

**兩道閘是疊加、不是替代**（#174 決定「誰能註冊」，#126 決定「誰能玩」）：
持有效邀請碼註冊仍然是 `pending`；**碼在註冊當下就燒掉、不是核准時才燒**，
否則一張邀請碼會變成無限量的待審帳號；沒碼的陌生人根本進不了待審列隊。
第一個帳號對**兩道閘都豁免**（要碼沒人能發、要核准沒人能批 = 死鎖），這條沒有動。

**go-live 硬化複查**：`config.Load()` 端到端測試已補——把 `.claude/launch.json` 的
`devsecret`/`devseam` 搬到對外綁定會**開不起來**（#176 的守衛確實在開機路徑上），
同一組值在 loopback 仍可正常開發；金流面用**路由樹**（非 grep）斷言全站沒有
payment/checkout/billing/subscription/top-up，玩家也無法自行發 M 幣。

**待其他 lane**：`apps/admin` 的「帳號審核」頁面（本 lane 只出 API 與契約，不碰 `apps/admin/**`）。

---

## ✅ 已關閉（機制半邊）：sim 沒有「靈氣／範圍光環」的施加機制 —— 2026-07-24

上面「效果層：sim 缺 `evasion` 等屬性 → 天生技與部分技能效果落不了地」裡，
**`evasion` 之外的第二面牆**：`ModifierSource` 只能改**帶著它的那一個單位**，
沒有任何辦法表達「範圍 R 內、依陣營過濾、進出即時增刪」。
所以每一支 `[靈氣]` 天生技都只能誠實留空。指標案例：

> **79-00 靈壓**（`content/abilities/godie-h01n.passive.json`，黑崎一護）
> 「初始法力值較一般人高，且此靈力產生的強大靈壓能**降低範圍500內敵人攻擊速度25%**。」
> → `"radius": 9.17`、`"targetsEnemies": true`、`"passive.ranks[0].modifiers": []`

前半（初始法力較高）本來就寫得出來（自身 `maxMana` modifier）；**後半才是這次補的**。

| 半邊 | 狀態 | 位置 |
|---|---|---|
| sim 光環機制（半徑／陣營／進出增刪／linger） | ✅ 完成 | `packages/shared/src/sim/aura/aura.ts`（+ `aura.test.ts` 32 測） |
| 掛進固定 system 順序 | ✅ 完成 | `packages/shared/src/sim/SimWorld.ts` step 0b（`rebuildGrid` 之後、`statRecomputeSystem` 之前） |
| `ModifierSource.auras` / `kind: "aura"` | ✅ 完成 | `packages/shared/src/sim/stats/modifiers.ts` |
| 內容欄位 `passive.ranks[N].auras` + zod | ✅ 完成 | `sim/content/defs.ts`、`content/schema/effect.ts` `zAuraDef` |
| 純光環被動也要 attach（`modifiers` 可為空） | ✅ 完成 | `sim/abilities/abilityPassives.ts` `rankBlock` |
| **內容**：靈壓等 `[靈氣]` 天生技的 `auras` 區塊 | ❌ 未做（內容 lane） | `content/abilities/*.passive.json` |
| **網路**：`auraApply` / `auraEnd` 未在事件白名單 | ❌ 未做（net/client lane） | `apps/game-server/src/net/eventFanout.ts` |

**模型（一句話）**：光環＝**投射出去的 `ModifierSource`**。每 tick 依現況重算「誰在裡面」，
差異比對後把 payload 以 `kind: "aura"` 掛到範圍內單位自己的 `sources`，離開／死亡／
發射者死亡或被 `destroy()` 就移除。**不做訂閱、不做側表**——那是正確性論證本身：
每一種「該結束」的情況都退化成同一件事（今 tick 不在集合裡），不必為每種情況各寫一條拆除路徑，
也就沒有任何一條路徑可以漏掉、把 −25% 攻速永久留在走遠的人身上。

**半徑走 `abilityRange`（#136／#125）**：`resolveAuraRadius` 直接委派 `resolveAbilityRadius`，
不是自己再寫一次 `radius * combatEnv.abilityRange`——否則 #136 規則一改，光環就會是唯一
偷偷保留舊行為的地方。靈壓的 500 WC3 單位＝ 9.17 sim 單位，60% 倍率下實際為 5.502。

**決定性**：本模組**完全不碰 `world.rng`**（沒有骰子可擲），迭代順序全部固定
（`world.stats` 為遞增 entity id、`queryOverlap` 回傳已排序），所以投射出來的 `sources`
陣列順序在每個 replica 都一致（這關係到 `Override` 解析與 hook 觸發順序）。
沒有任何人發射光環時，digest 與 rng.state 逐 tick 與加這套機制之前完全相同（已測）。

---

## ✅ 已關閉（機制半邊）：主動型天生技（60 支）無法施放 —— 2026-07-24

上面「天生技盤點」表裡的 **`主動天生技可施放 0 / 60 ❌`** 這一列。

問題不是效果壞掉，是**槽位叫不到**：`Command.castAbility` 帶的是 `AbilitySlot`（Q/W/E/R/EX），
而天生技的 instance 放在 `AbilitiesComp.passiveSlot`。任何 intent frame 都無法指名它，
所以 60 支 `innateKind: "active"`（`22-00 嗚鎖打!` 40 秒 CD／150 AoE 傷害＋0.5 秒暈、
`76-00 二檔` 60 秒 CD／20 秒 +100% 攻速）全部**寫得出來、按不到**。

| 半邊 | 狀態 | 位置 |
|---|---|---|
| 第六槽可被 cast 指名（新型別 `CastableSlot`） | ✅ 完成 | `packages/shared/src/sim/intents.ts` |
| 槽位→instance 唯一解析器＋主/被動判別 | ✅ 完成 | `packages/shared/src/sim/abilities/innateActive.ts`（+ `innateActive.test.ts` 20 測） |
| 走同一條 cast 驗證階梯（法力／暈／CD／後搖） | ✅ 完成 | `packages/shared/src/sim/abilities/abilitySystem.ts` |
| 第六槽冷卻真的會走 | ✅ 完成 | `abilitySystem.ts` `tickCooldowns` |
| rankUp 指令額外擋掉 `"PASSIVE"` | ✅ 完成 | `packages/shared/src/sim/systems/CommandSystem.ts` |
| hook 的 `abilitySlot` 可寫 `"PASSIVE"` | ✅ 完成 | `packages/shared/src/content/schema/common.ts` `zCastableSlot`、`schema/effect.ts` |
| **UI**：第六顆按鈕／熱鍵／CD 掃描 | ❌ 未做（client lane） | `apps/client/src/ui/components/AbilityBar.tsx`、`ui/passiveSlot.ts` `innateCastNote` |
| **網路**：`validateInput` 的 cast 白名單沒有 `"PASSIVE"` | ❌ 未做（net lane） | `apps/game-server/src/net/validateInput.ts:42` |
| **cheat**：`resetCooldowns` / `zeroCooldown` 不含第六槽 | ❌ 未做（game-server lane） | `apps/game-server/src/match/MatchController.ts` |

**為什麼不直接把 `"PASSIVE"` 加進 `AbilitySlot`**（原本 intents.ts 的註解是這樣預告的）：
那會同時放寬 `Command.rankUpAbility`、`Cheat.rankAbility` 與全樹的 `ab.slots[slot]`
（那個 Record 根本沒有 `"PASSIVE"` 這個 key）。天生技**可施放但永遠不可升級**，
所以拆成兩套字母表：`AbilitySlot`＝五個「學來的」槽，`CastableSlot`＝六個「按得到」的槽。
升級天生技不是被 runtime 擋下來，是**型別上打不出來**。

**決定性／replay**：沒有任何舊錄影含有 `slot: "PASSIVE"` 的指令，
所以新增的 `tickCooldowns` 那一行在每一份既有輸入日誌上都讀到 0、什麼都不做；
本 lane 不擲任何骰。已測：同 seed 逐 tick digest 與 `rng.state` 完全相同（含反證：換 seed 會分歧）。

**順手關掉的一個真實漏洞**：舊的 `slot === "EX" ? ab.exSlot : ab.slots[slot]`
會拿呼叫端的字串去索引 Record，未經清洗的 `slot: "constructor"` 會讀到 `Object.prototype`
的成員。新的 `abilityInstanceFor` 每一支都是對已知槽名的等值比較，其餘一律 `undefined`
（**特別不能掉進 `passiveSlot`**，否則垃圾輸入會放天生技）。
連帶：`apps/game-server/src/net/validateInput.test.ts:54` 那條
「RAW castAbility slot='constructor' DOES throw（vuln is real）」的前提已不成立——
sim 現在回 `"not-learned"` 不再拋錯，該測試要改成斷言「無效果」。（本 lane 不碰 `apps/**`。）

## ✅ 已關閉：後台改了、跑著的 shard 卻不知道 —— 內容失效廣播（Redis pub/sub）—— 2026-07-24

**缺口**（#48 的另外一半）：後台改 curation 白名單／combat-env／server-ops 後，
**正在跑的 game-server 不會知道**。三份文件都只在「開新對局」時才重新抓，
所以 shard 閒著沒人開局時，剛存好的設定可以無限期不生效，而且**沒有任何地方講出來**。
grep 證實：整個 repo 沒有任何 `Subscribe`/`Publish` 用在設定上，Node game-server **完全沒有 Redis**。
#48 已經讓「抓失敗」變得很大聲；這條讓「改成功」真的傳得到。

| 半邊 | 狀態 | 位置 |
|---|---|---|
| 平台寫入時廣播（三份文件共用一個出口 `Repo.mirror`） | ✅ 完成 | `apps/platform/internal/data/redisx/contentbus.go`（`chan:content`）＋ curation / combatenv / opsenv 各自的 `mirror()` |
| 廣播內容 = kind + etag（**不是文件本體**） | ✅ 完成 | `redisx.ContentETag`（sha256 前 12 hex）。shard 收到後回頭抓權威文件，維持**單一 ingestion path** |
| game-server 訂閱端（**零相依**，自寫 RESP subscribe-only client） | ✅ 完成 | `apps/game-server/src/config/redisSubscriber.ts`（不動 pnpm-lock，不引入 ioredis） |
| 收到失效 → 走 #48 的**同一條** fetch 路徑 | ✅ 完成 | `config/contentBus.ts` → `WhitelistCache.refresh()` / `CombatEnvCache.refresh()` / `ServerOpsCache.refresh()` |
| 重抓失敗 → 進**同一個** degradation registry、上 `/healthz` | ✅ 完成 | `warnOnce(content-refresh-<kind>)`；成功後 `clearDegradation` 收回 |
| Redis 可有可無（老闆的筆電） | ✅ 完成 | 連不上只 warn 一次＋退回 TTL 行為；`GGD_CONTENT_BUS=0` 可完全關閉；開機路徑不 await |
| `/healthz` 回答「我剛改的到底進去了沒」 | ✅ 完成 | `platform.content.documents.<kind>`：`announcedVersion` / `appliedVersion` / `lastRefreshAt` / `stale` |

**對局中安全（本條最重要的設計決定）**：
**分界線是「開局」，不是「選角」也不是「戰鬥」。** 白名單縮小 → 只影響**之後開的**對局；
進行中的對局（含**正在進行的選角**）用 `onCreate` 當下凍結的快照。
理由：選角中途縮白名單，會讓游標底下的英雄消失、或讓伺服器拒絕五秒前才提供的選擇；
戰鬥中途縮，等於回頭沒收別人**正在玩**的英雄。兩者都沒有好的 UI。
這條是**結構性保證**不是慣例：`MatchController.whitelist` 是 readonly，`Whitelist` 不可變，
bus 只換 shared cache 裡「下一次 onCreate 會讀到」的那顆物件，拿不到任何活著的 room。
（`maxRooms` 是唯一真正即時的旋鈕，而且安全：只在 onCreate 讀，調低不會踢掉跑著的對局。）

**重抓失敗時保留 last-known-good（安全性考量，不只是體感）**：
`get()` 抓不到照樣 fail-safe 成 allow-all（有對局在等，不能卡死）；
但 `refresh()` 不行——那等於「平台剛好掛掉時來一則廣播，就把內容過濾整個關掉」。
所以 bus 觸發的重抓失敗**只記錄失敗**，沿用平台上次真的講過的值。

**測試**：Go 11 條新測（`redisx` 4 / `curation` 3 / `combatenv` 2 / `opsenv` 2，含 miniredis 真訂閱、
etag 穩定性、**沒有 Redis 也要能存**）；TS 31 條新測（RESP 分包/黏包/重連/斷線 11、
bus publish→refetch/合流/降級/healthz 15、對局中安全 5），全部走**真的 TCP socket**。

---

## 語音＝戰鬥可讀性（2026-07-24，擁有者三連追加）

**原話**：「如果大家聲音都相似，戰鬥的時候就會很吵而且不知道是誰放了哪招」
「所以一定要有個性特色接近原本角色的聲音檔參考」
「千萬不能只有 Otoya, Kyoko 兩種聲音來源來生成」
「我稍後給你代表性的其他聲音檔給你參考」
「能不能聽得出來講什麼其實不重要，重點是情感表達有沒有到位」
「像 KOF 有很多空耳，喊著聽不清楚的招式名稱但是很熱血、很符合角色特色」

**這把語音從「擬真度」改判成「可讀性」**，跟技能圖示、VFX 色形語言同一類問題——
擁有者對本作最常抱怨的一句是「根本不知道哪招是哪招」。12 人同場如果共用聲線，
音訊層就從**資訊**退化成**噪音**，反而讓可讀性更糟。

**現況即病灶（已量測）**：`content/assets/audio/voices/quotes/quotes.json` 113 位角色，
聲音來源只有 **Otoya ×72 / Kyoko ×41** 兩種。一場 12 人最多只聽得到兩種音色。這是已上線的狀態。

**兩條驗收準則改寫**：
1. ❌ 廢除 **ASR 回轉字準率當通過閘**——那會打掉 KOF 式糊音吼叫，正是要的東西。
   ASR 降級為「只擋災難性失敗」（無聲、語言完全跑掉），不擋咬字。
2. ✅ 新增 **跨角色分離度**為一級指標。既有的「像不像自己的參考音」不足以保證可用：
   兩個角色可以各自都像自己，卻彼此難分。用 `campplus.onnx` 量 all-pairs 餘弦相似度。
3. ✅ 新增 **情感表達到位**為一級指標（音高範圍／動態／語速變化），取代咬字。

**引擎裁決（擁有者質疑「你要確定 IndexTTS-2 能說日文？」→ 查證後推翻我的翻盤提議）**：
| | IndexTTS-2 | CosyVoice 3 |
|---|---|---|
| 日文前端 | **無**。無 ja 語言碼、無假名處理，詞表是 `checkpoints/pinyin.vocab` | `cosyvoice/tokenizer/tokenizer.py:19` → `"ja": "japanese"` |
| 官方語言宣稱 | 僅出現在**作者介紹**的 multilingual | README:15 明列 9 語言含日文 |
| 情緒控制 | `emo_vector` / `emo_audio_prompt` | `inference_instruct2(tts_text, instruct_text, …)`，README:20 明寫支援 emotions/speed/volume |

→ IndexTTS-2 唸日文＝**漢字走中文拼音詞表**，唸出的是漢字的中文音；那是唸錯字不是空耳。
先前日文 ASR 4/7 是這個病灶的症狀，不是「糊但對」。
→ **CosyVoice 3 續任主力**（唯一真的會日文），情緒改用 `inference_instruct2` 下自然語言指令取得，
**一分沒少**。IndexTTS-2 降級為中文台詞備援。

**參考音來源已定案：由擁有者提供**，不自行外部蒐集。待辦是鋪好收件口與命名規則。

## ~~傳說寶玉 2400g 的可及性反了~~ → **已推翻，是我算錯**（2026-07-24）

> ⚠️ 下方原始推論**錯誤**，保留以記錄錯在哪。實測結論在本節末。

`STARTING_GOLD=600`、`GOLD_REWARDS={kill:150, assist:75, roundWin:300, roundLose:150, killBounty:100}`。
純存錢（完全不買裝）累積曲線：

| 情境 | 湊到 2400g |
|---|---|
| 順風（全勝＋2殺） | **R3** |
| 普通（半勝＋1殺） | R5 |
| 逆風（全敗＋0殺） | **R8 僅 1800 → 整場買不起** |

且這是理想化「一毛不花」曲線；中位裝備 1000g，買兩件普通裝後普通玩家整場摸不到。

**方向是錯的**：最需要翻盤道具的逆風方數學上買不起，順風方 R3 就能買 → 富者愈富。
`killBounty:100` 比一顆人頭 150 還小，補不回差距。
**這可能是 #108 / #149 的真正上游**——那兩張票在修「翻盤手段不夠力」，
但逆風方根本沒錢走到翻盤手段面前。待驗證後決定是調 `GOLD_REWARDS` 還是調 `LEGENDARY_ORB_PRICE`。

## Chrome 存得起密碼卻不帶入（2026-07-24，#185）

**原話**：「為何我 chrome 儲存登入密碼 結果下次沒幫我帶入」

**這個不對稱正是它一直沒被發現的原因**：
Chrome **存**密碼用的是寬鬆啟發式（看到 `type="password"` ＋ 一個像送出的動作就問你要不要存），
所以「存檔提示有跳出來」**不能當作填入會動的證據**。
Chrome **填**密碼則需要認出哪格是帳號、哪格是密碼——那要表單語意或 autocomplete 提示。

**現況（讀碼確認）**：
- `apps/client/src/ui/platform/AuthScreen.tsx`（705 行）**沒有任何 `<form>` 元素**，欄位都是裸 `<div>` 包 input；
  `name=` / `id=` / `autoComplete=` 出現 **0 次**；送出是 `<Btn onClick={submit}>`，不是 form submit。
- `apps/client/src/ui/platform/widgets.tsx:98` — `TextInput` 的 props 是**封閉字面型別**
  `{ value, onChange, placeholder?, type?, onEnter?, autoFocus?, style? }`，渲染裸 `<input>`，
  不透傳 name/id/autoComplete。**所以這是結構性缺失，不是漏寫**：任何呼叫端都無法補上，
  不動這個共用元件就修不了 AuthScreen。

**第二個隱藏 bug（只加 autocomplete 會「看起來對」但仍然失敗）**：這些是 React **受控**輸入。
(a) Chrome 在 hydration 前後填值，React 隨後用 `value=""` 重繪把它**洗掉**——表現為閃一下就空了；
(b) 程式化寫入 value **不會**觸發 React 的合成 onChange，除非用原生 setter 並 dispatch `input` 事件——
所以欄位可以看起來填好了，state 卻還是 `""`，送出去是空密碼。

**驗收**：帳密須成對可辨識；登入用 `current-password`、註冊用 `new-password`（寫反會讓 Chrome 在登入頁
提議產生新密碼）；Enter 與按鈕都要能送出且 SFX 不掉；真表單送出不得造成 SPA 頁面跳轉；
邀請碼／owner token 欄位要**刻意決定**提示值（`one-time-code` vs `off`，給錯比不給更糟）。
另查 #170 把 auth 畫面提前於 1441 doc 載入渲染——若 input 進 DOM 的時機晚於 Chrome 的填入掃描，光這點就會失效。

**擁有者端注意**：Chrome 可能要先到 `chrome://settings/passwords` 刪掉舊的那筆壞紀錄，才會重新學習修正後的表單。

### 實測推翻（30 seeds / 1500+ 座位回合樣本，驅動真 `MatchController`）

harness: `tools/ttk-sim/src/goldCurve.ts`（唯讀量測，不改任何 tuning），走真實內容解析
（`resolveArenaRules` / `resolvePhaseConfig` / `combat-env.json`）、12 個 bot、`startingLives=3`、跑到 `matchEnd`。

| R | 領先方 %買得起 | 落後方 %買得起 |
|---|---|---|
| R1 | 0% | 0% |
| R2 | 0% | 0% |
| **R3** | **100%** | **100%**（持有 3550，餘 1150） |
| R4–R6 | 100% | 100% |

**我錯在哪**：只算了 `STARTING_GOLD` + `GOLD_REWARDS`。但 `content/config/config.arena-rules.json` 對**每個存活座位無條件發錢**
（`MatchController.enterIntermission` → `grantForRound`，迴圈 `activeSeats()`，**不看勝負**）：
R1 +0、**R2 +750、R3 +2500**、R4 +1000、R5 +1250、R6 +1500。
**光 R3 的 2500 就超過寶玉售價。** 我引用的那組常數是 `DEFAULT_ARENA_RULES`——單元測試/骨架開機的 fallback；
正式伺服器開機載入內容（`apps/game-server/src/index.ts:232`），`resolveArenaRules()` 永遠回傳文件，走不到 default。

**最壞情況（每場把錢花光）**：進 R3 前的區間收入 min **2650**（= 2500 發放 + 150 敗場金）→ **身無分文又連敗，R3 照樣買得起**。

**差距不擴大**：同場最富與最窮的**總收入**差距，中位 300–550、最大 1300，**永遠不到半顆寶玉**，
而共同發放曲線一回合就把所有人推 2500。唯一與勝負相關的收入是 roundWin 300 vs roundLose 150，**每回合差 150**。
擊殺金可忽略：中位**每座位每場 0 殺**，65% 座位整場 0 殺，kill+assist 僅佔總收入 **6.0%**
（每場約 30 死 vs 5 殺——回合多由火環結束，中位戰鬥 194.6 秒 vs 火環 `startSec` 180，而火環死亡沒有擊殺者，不付錢給任何人）。

**沒有 R8 這一欄**：3 條命、`livesLost` 1/1/2/2/3…，實測 **4 回合×15、5 回合×13、6 回合×2**（中位 4.5、最多 6）。
連敗三場的隊伍在 R3 結算就被淘汰——「R8 的落後玩家」在兩個意義上都不存在。

**#108 / #149 不是下游**：可及性與勝負無關，所以「翻盤手段構不到」這個上游假說**被殺掉**。
若翻盤體感仍差，病灶就在那兩張票原本說的——**池子與 augment 本身的內容**。這個結論**移除**一個假想上游，不增加它們的工作量。

### 但挖出兩個真問題

1. **`config.match.json` 的 `startingTeamLives: 8` 是死的**——`apps/game-server/src/rooms/MatchRoom.ts:255` 硬寫
   `const startingLives = 3`。內容值完全沒作用。與 `phaseConfig.ts` 當初要修的是同一類「設定檔是裝飾品」bug。
   （以 `GGD_LIVES=8` 重跑：變成 8–10 回合，R3 起仍 100% 買得起，所以不影響上面結論。）
2. **真正的經濟形狀是「R1–R2 沒有任何有意義的商店決策，R3 一次全部解鎖」**。
   那筆 R3 +2500 佔全場約 7600g 收入的 **33%**，而且與寶玉可買、augment 升金、`ultUnlockRound: 3` **撞在同一回合**。
   這是發放曲線的**節奏**問題，留給擁有者調。

3. **`killBounty` 被我標錯**：`DeathSystem.ts:54-56` 把它付給**擊殺者**，每個受害者一次——那是**首殺溢價，加速領先方**，
   不是付給受害者的追趕金。拿它跟 `kill`（100 < 150）比大小是比錯了對象。**這個經濟裡沒有任何追趕金。**

## 養成曲線重新設計 ＋ 自動 icon 生成（2026-07-24）

**原話**：「請合理設計規則、分配 金錢、武器、Augment、解鎖技能，並且擴充卡數 **請參考 Lol 競技場**」
「記得對應的 icon 生成也别忘了」
「另外後台新增英雄、技能、武器、道具 ... 這些時，也自動動態生成適合的 icon」
「記得有擴充更新元件要更新到 readme」

### 為什麼「參考 LoL 競技場」是硬前提，不是風格建議
本模式已經借用競技場的整套詞彙：silver/gold/prismatic 分級、三選一、配對對決、命數制、每回合購物。
我第一版 brief 反而寫「別照抄 LoL」，方向錯了，已停掉重放（`wagpw4csf`）。
新前提：**結構取自競技場，內容取自本作**。GGD 是 3v3v3v3 不是 2v2v2v2，113 個角色的技能是別的遊戲寫的，
而且它有自己的系統（迴避／20 層屬性路線／守衛塔／復活圈／治療花／收縮火環／即將可施放的第 6 格天生技）。
依賴龐大線上玩家池或 Riot 級平衡的機制，翻譯不過來——要說明哪些被拒絕、為什麼。

### 一個已知的設計陷阱（現役卡片已經踩到）
`Chill Touch` 寫「Your Q also slows」——但這是 113 個匯入的 WC3 角色，**Q 是原作者放什麼就是什麼**，
沒有 LoL 那種跨角色的槽位設計語言。新卡片應觸發在**通用事件**（普攻／施放／受傷／擊殺／血量低於 X%），
而非特定槽位。順帶：`Bloodlust` / `Chill Touch` / `Aegis Surge` 三張是英文，其餘中文，要統一。

### augment 池的硬下限（已量化）
`draft.ts:31` 是 `a.tier === tier && !owned.has(a.id)` —— **硬過濾 ＋ 不重複**，每回合永久消耗該級一張。
silver 6 張在 R1+R2 兩回合就看光；prismatic 7 張撐不過 overflow：
R9 只剩 3 張（等於沒得選）、R10 只有 2 張、R11 只有 1 張。
而 `while (choices.length < count && working.length > 0)` **靜靜少發卡**，不報錯——**#47 的同一個形狀**。
→ **`startingTeamLives` 改 8（8–10 回合）之前，必須先擴充 augment 池**，否則後段抽卡直接破。

### icon 自動生成（#186）
**引擎選擇的關鍵**：#112 明載雲端 AI 生圖對所有現行 provider 都是壞的，**所以走不了 #23 那條**。
本機 SD 管線（`tools/icon-gen/local/`，MPS，$0，`.method` sidecar 冪等）是能跑的那條，已產出 525 技能圖 + 21 augment 圖。
硬條件：不可阻塞存檔／不可覆蓋手選或匯入的 w3x 圖／prompt 必須由實體推導（通用 prompt 會重演視覺同質化崩潰）／
**不得重新引入 emblem/crest 框**（本專案 A/B 已證實會摧毀主體）／augment 不寫 icon 欄位只寫檔（schema 是 `.strict()`）／
家用主機沒有 MPS 時要**明講待生成**而非靜默無事（靜默正是這次稽核抓到 17 次的病）。
**帳本更正（2026-07-24 覆核）**：#178 寫「602 缺圖」。逐檔實測：
`champions 113/113`、`items 214/214`、`abilities 646/662`、`augments 21/21`。
殘留 **16**，且**沒有一個是政策封鎖**（先前這行寫「其中含政策封鎖項」，錯了 —— 唯一上第三方版權
暫停名單的 `godie-e00u` champion 本身早就有圖）。**可出貨缺口＝0。**

那 16 是 `godie-e00u`／`godie-h02n`／`godie-u01f`／`godie-u01q` 四隻的 Q/W/E/R，而且**彼此逐位元組相同**：
`name: "none"`、無說明、同樣的 cooldown 12／mana 60／range 11／damage 80–240／`fx.prim.physical.nova`。
**刻意不產圖**，理由是產了會更糟：輸入相同 ⇒ prompt 相同 ⇒ 16 張互換得的圖，等於親手製造
「根本不知道哪招是哪招」，還會把四隻沒有招式的角色標成「圖已完成」。
四隻都**不在 48 人白名單**，玩家端根本不會渲染到它們；後台列表顯示一般文字磚。
`plan.py` 本來就把它們歸類為 `drop`（`placeholder-ability`），現在 daemon 也一致拒絕
（409 `placeholder-ability`），所以 補圖示 按鈕不會再跟 plan 唱反調。**這 16 個要補的是招式本身，不是圖示。**

#### #186 已交付（2026-07-24）
接點：`apps/admin/src/ui/ContentPage.tsx` 的 `createNew` —— 文件寫完、成功訊息上畫面之後才 `gen.request(tab, id)`，
**不 await**（`IconGen.request` 回傳 `void`，型別上就不給你阻塞存檔）。
機制：`tools/icon-gen/local/daemon.py`（127.0.0.1:8789，單一 worker + 常駐 checkpoint），admin vite 代理 `/icon-api`，
前端每 4 秒輪詢 `/icon-api/jobs`（與 #97 覆蓋率條同節奏），只在有工作在跑時才輪詢。
daemon **不寫任何 prompt**，全部 import `keywords.pass1_prompt/pass2_prompt` 與 `batch.render_two_pass`／`_save`／
`set_icon_field`，所以 emblem/crest 的 A/B 否決自動繼承，augment 的「只寫檔不寫欄位」也是 batch 那一條規則本身。
四種拒絕都回 409 + `reason`，並在畫面上以句子呈現：`blocked`（icon-plan 暫停名單，22 筆，plan 檔案 mtime 變了就重讀）、
`author-art`（`icon` 指向存在且**沒有 `.method` sidecar** 的檔 ⇒ w3x／手選，`force` 也到不了這個分支）、
`already-done`（同一代 METHOD_VERSION 已畫過 ⇒ 重存不會重畫）、`no-engine`（沒有 torch/MPS ⇒ **工作失敗、不寫佔位圖**）。
空白圖（channel spread < 30）同樣丟棄不存檔。實測四條拒絕路徑與 no-engine 路徑皆已對真實資料驗過，未動任何檔案。
測試：`apps/admin/src/icons/iconApi.test.ts`（23 項）。文件：`tools/icon-gen/README.md` §7。

#### 實機驗收（2026-07-24，真的在瀏覽器點過）
在 :60721 後台 三選一強化 分頁按 ＋新增 建立 `frost-bulwark-probe`：文件立刻建好、右側編輯器打開、
狀態條寫「圖示已排入自動產生，不用等它」，**建立完全沒有等 GPU**。12.3 秒後狀態條翻成
「已產圖（augment 依慣例吃檔名，schema 沒有 icon 欄位）｜取材：name」，磁碟上出現 128px WebP + `.method` sidecar，
文件裡**沒有** `icon` 欄位（augment 規則守住），`GET /content-api/assets/...` 回 200，
且 `apps/client/src/ui/panels/resolveChoice.ts:40` 組的正是同一條路徑 ⇒ 抽卡畫面吃得到。
再按一次 補圖示 → 409「已經有這一代方法畫好的圖了」，不浪費 GPU。第二個 probe 熱管線 7.1 秒。
測完兩個 probe 都已刪除，doc/art/備份全部清乾淨（21/21 對齊，無孤兒圖）。

**驗收時抓到兩個真 bug（都不是讀 code 讀得出來的）**

1. **刪除鈕從來沒有成功過** —— 後台按 刪除 一律回「Bad Request」。
   `apps/admin/src/contentApi.ts` 的 `send()` 對**每個** verb 都送 `content-type: application/json`，
   但 DELETE 沒有 body，fastify 直接 400 `FST_ERR_CTP_EMPTY_JSON_BODY`。
   ⇒ #70 rule 3「移除一個三選一強化」等於從未可用。改成只有帶 body 才送該 header；
   `contentApi.test.ts` 的 stub 原本**根本沒記錄 headers**（所以任何 header 錯誤都測不出來），已補記錄 + 兩條回歸測試。
   修好後在瀏覽器重跑一次：`DELETE → 200 OK`，文件消失，數量回到 21。
2. **新 augment 會掉進通用紋章圖** —— 21 張現役 augment 全部是 `AUGMENT_SUBJECT` 硬編的 `curated`，
   所以名稱表從來沒被真正操練過。後台新建的卡**依定義沒有 curated 條目**，只能走名稱表；
   實測 `thunder-sigil` 直接掉到 fallback（表裡有 `storm` 沒有 `thunder`），畫出一張通用紋章徽章。
   ⇒ 沒配對到的新卡會**全部長一樣**，正是抽卡畫面的「分不出哪張是哪張」。
   已擴充 `AUG_NAME_HINT`（雷/毒/影/聖/暴擊/吸血/荊棘/穿透/速/爆… 中英各一組），
   同一個 probe 重畫後 signal 由 `fallback` 變 `name`，圖也從紋章徽章變成真的閃電。
   21 張現役 augment 經回歸確認仍全部 `curated`（未被影響）。

---

## 🎙 2026-07-24 語音參考音管線（voice-reference-pipeline/，新需求批次）

> 來源：使用者一次性大規格需求（48 角色 CosyVoice 3 參考音收集/處理管線）＋兩則追加指示。
> 全部需求已在 `voice-reference-pipeline/` 落地並以 `--dry-run --all` 驗收（14 單元測試綠、合成音檔煙霧測試走完全程後清除）。

| 需求（原話精神） | 落點 | 狀態 | 備註 |
|---|---|---|---|
| 48 角色 heroes.csv（rank/id/…/status=missing） | `config/heroes.csv` | ✅ | UTF-8 BOM，逐字照使用者清單 |
| Phase 2 上網研究：聲優雙來源交叉查證 | `config/research/batch_*.json` + `reports/research_report.csv` | ✅ | 4 個研究代理實查，40/48 有雙 URL；フシギバナ聲優查無可信來源（誠實標注）；初號機咆哮=林原めぐみ（Yahoo/lain.gr.jp 佐證） |
| Phase 3 合法來源搜尋+授權旗標佇列 | `config/search_sources.yaml` + `reports/license_review_queue.csv` | ✅ | 10 來源實查條款：つくよみちゃん/あみたろ/刻鳴時雨=AI明示OK；**効果音ラボ聲素材明文禁止AI學習**；声優統計/JVS=研究限定 |
| Phase 4 只下載 auto_download＋sidecar/SHA-256/不覆蓋 | `scripts/download_permitted.py` | ✅ | 不在 --all 內，需人工核准佇列後手動執行；只接受直接音檔 URL |
| Phase 5 轉檔 24kHz/mono/s16 + 最佳 5–15s 抽取 + 響度 -20~-18 LUFS/TP≤-1 | `extract_best_segment.py` + `normalize_audio.py` | ✅ | two-pass loudnorm 實測輸出 -19.0 LUFS；邊界貼齊靜音防切句 |
| Phase 6 品質分析（12 指標+拒絕條件；怪叫/空耳不拒） | `inspect_audio.py` + `audio_metrics.py` | ✅ | music/multi-speaker 為啟發式估計（文件明示）；煙霧測試各拒絕路徑（爆音/靜音/背景音樂）皆實測觸發過 |
| Phase 7 分離度（0.78/0.68 門檻可調；6 非人類角色走聲學特徵） | `analyze_separation.py` + `processing.yaml` | ✅ | speechbrain 未裝時退 spectral_proxy 並警告；非人類配對實測（0.80→high→改用非語言聲音） |
| Phase 8 manifest + 缺角色/高碰撞清單 | `build_manifest.py` + `reports/*.csv` | ✅ | approved 五條件齊備才 true |
| 日文情緒指令（5 場景×48 角色，含禁模仿句） | `config/instruct_seeds.json` → `reports/cosyvoice_instructs.csv` | ✅ | 48 角色手寫日文聲線基底+場景覆蓋（非語言角色/不吼型角色特別處理） |
| 一鍵執行+dry-run+可重跑+單元測試+README 10 項 | `run_pipeline.py` / `tests/` / `README.md` | ✅ | dry-run 報表導向 logs/dry-run-reports/ 不污染正式報表 |
| 追加：升到 Python 3.14.6 | `.venv`（brew python@3.14） | ✅ | numpy 2.5.1 + PyYAML |
| 追加：「忘掉授權問題，私人研究用」 | `processing.yaml → license.mode: private_research` | ✅ | 授權欄位保留為記錄不攔截；`strict` 模式一鍵切回（對外發行前必切） |
| **真缺口：48 角色實際參考音 0 檔** | `incoming/user_owned/` 待投放 | ⬜ | 管線就緒但無素材；下一步=從合法源下載或自錄，missing_characters.csv 全 48 |

## worktree CI 修正合併（2026-07-24）＋ #108 的量化證據

三個被遺棄的 git worktree（`.claude/worktrees/`）裡躺著 6 個未合併 commit，全部是 CI 修正。
**它們正是我一直告訴每條工作流「這分支本來就紅、別算你頭上」的那些紅燈的解藥**，只是從沒被合併，所以沒人看得到。

**合併了 5 個（逐檔取出，非 cherry-pick，因為 `.gitignore` 是 dirty 的）**：

| commit | 內容 | 驗證 |
|---|---|---|
| `86f6867` | **`.gitignore:37 coverage/` 把整個 Go 套件吃掉了**。`tools/testrunner/internal/api` 會 import `internal/coverage`，所以**乾淨 checkout 上 testrunner 建不起來**。加 `!tools/testrunner/internal/coverage/` | `go build ./...` exit 0；`git check-ignore` 不再命中 |
| `71f89a7` | `pnpm-lock.yaml` 缺 `tools/ttk-sim` importer | lockfile 有 1 筆 |
| `e051957` | castability sweep 直接讀 gitignore 的營運白名單 → CI 讀不到。改成白名單不在時回退到 committed fixture | 測試通過 |
| `45e6b48` | `emit_report.ts` 的 `ICON_EDGE[ext]` 加 `!`（557 行只在 ICON_EDGE 有該副檔名時才放進 map，TS 無法跨 Map 收窄）| typecheck 0 錯 |
| `cfa8f11` | 忽略 Vite 執行期的 `vite.config.*.timestamp-*.mjs`（只在跑的時候存在，`git add -A` 會誤收）| — |

**刻意不合併 `9542d2b`（`legendaryClaims.test.ts`，#108 的守衛）**，因為它現在是紅的，而且它抓到的是真的：

```
expect(pool.length).toBeGreaterThanOrEqual(25)
  實際 content/loot-tables/legendary-weapons.json = 14 entries
```

那不是「描述與 modifier 不符」，是**池子大小的地板**。寫測試的人判斷傳說池至少該有 25 件，實際 14。
第二條紅的是 crit 傳說武器的「N%機率造成M倍傷害」是否等於 chance + (M − 角色基礎)。
**兩條都是 #108 的內容。** 那條測試應該跟 #108 的修正一起進來，不是提前進來當紅燈。

→ **#108 現在有了量化目標：傳說池 14 → ≥25，且每條效能敘述都要有對應的 modifier。**

**另一個順帶發現**：`vitest` 沒有排除 `.claude/worktrees/`，所以全套測試會撈到 worktree 副本、因缺 node_modules 報 `Failed to load url zod`——**假紅燈**，會讓「測試綠不綠」的判斷失真。

---

## 2026-07-24 · 假完成修復：`hitFeel.flashColor` / `.flashMs`（S13 形狀，戰鬥車道）

**需求來源**：假完成盤點 P0-D / N1。schema 收 → sim 複製 → client 解進 struct →
`planImpactFeedback` 最後一個 statement 沒讀它。**30 份技能文件在填活的死內容**，13 份在 live 白名單。

**決策：honour（不刪欄位）**。刪不掉——`zHitFeel` 是 `.strict()`，刪欄位就要動 30 份
`content/abilities/*.json`，那不是本車道的檔案。

**⚠️ 盤點報告開的處方是錯的，這點要記進帳**：報告寫「兩行：`profile.flashColor ?? flashColorFor(...)`」。
那會**靜默迴歸**——`deriveCosmetics` 對**每一次命中**都填了 `flashColor`，`??` 右手邊永遠不執行，
等於用 sim 那份從未量測的調色盤（含 `FLASH_TRUE = [1,1,1]`，已被證明在淺色模型上是 no-op）
全域取代 client 那份量測過的。**「兩行就好」本身就是 S13 的下一個實例。**

**實作**：flash 兩欄在線上改成**有作者才存在**（`ImpactCosmetics.flashColor?` / `flashMs?`），
「在／不在」就是 client 的訊號；sim 的 `FLASH_PHYSICAL/MAGIC/TRUE/BLOCK` + `FLASH_MS_BY_TIER`
**刪除**（第二套調色盤，隨每個 hitImpact 上線、零像素）。client 新增 `resolveVictimFlash`
（分層）+ `legibleFlashColor`（色度地板 0.65，繞最大通道加飽和，保留色相家族）。
`zHitFeel.flashMs` 上限 1000 → 260（原值是這個聲道永遠無法兌現的數字）。

**觀測**（真實 content，非 fixture，含 live 白名單交叉比對）：30/30 生效、13 份 live。
`godie-e007.r` 之前 `[1.00,0.35,0.90]/160ms` → 現在 `[1.00,0.87,0.35]/178ms`。

**留下的守衛**：`cj-s39..s45`（見 `docs/todo/combat-juice.md`），其中 `cj-s45`
直接走 `content/abilities/*.json` 實檔，**修好之前那條測試每一列都是紅的**。

**順帶確認**：上一則提到的 vitest 沒排除 `.claude/worktrees/` 仍然成立——
`npx vitest run <path>` 會撈到 7 個 worktree 副本並報假紅燈。本輪一律用
`--dir <真實目錄>` 或看具名檔案那一行的結果來判讀。

---

## 2026-07-24 · 假完成修復：`weaponClassOf` 的第六／第七個武器類別（S8＋S16 形狀，戰鬥車道）

**需求來源**：假完成盤點 P0-E（以及 P1-6 指向的真缺陷）。
**症狀**：全遊戲每一個法師的**普攻**播的是「拉弓 → 放箭 → 箭矢穿刺」。皮卡丘、莉娜因巴斯、
涅吉、傑洛士、黑人牙膏、夜神月都在內。

**根因不是缺 tag，是缺類別**。`weaponClassOf()` 是**全函數**——它永遠回一個類別，
所以「沒有對應類別的角色」不會報錯，只會掉進 `attackType === "ranged" ? "bow" : "sword"`。
`WEAPON_TAGS` 只有 `greatsword|katana|gun|bow|sword`，**法師無 tag 可加**。
沒有任何測試會紅：`combatSfx.test.ts` 綠的（`bow → bowDraw` 這條路由本來就對），
`fieldAdoption` 也綠的（它知道的五類每一類都有 ≥1 個角色）。兩邊量的都是機制，
沒有一邊在問「玩家眼前這隻角色聽起來對不對」。

**分類依據 = 暴雪自己的資料，不是角色名字**。33 個遠程角色每一個都繼承自一個真的 WC3 英雄，
`Units/*UnitFunc.txt` 的 `Missileart=` 直接說了他丟的是什麼（從 `war3.mpq`/`War3x.mpq` 解出來）：

| Missileart | 類別 | 數量 |
|---|---|---|
| `Arrow` / `MoonPriestessMissile` | `bow` | 5 |
| `WardenMissile` / `BrewmasterMissile` | `thrown` | 5 |
| FireBall / KeeperGrove / Farseer / ShadowHunter / SerpentWard / DemonHunter / BloodElf … | `magic` | 22 |
| （無 Missileart：Tichondrius，240 射程的近戰攻擊） | `sword` | 1 |

**這張表順帶推翻了兩個「用直覺會猜錯」的答案**：桔梗（除魔巫女）原本就帶的 `bow` tag
被 `Hvwd`/Sylvanas 的 `MoonPriestessMissile` 證實是對的；而**依文潔琳其實是弓**
（`Nbrn`/Dark Ranger → `ArrowMissile`），不是法師——盤點報告把她列進「法師」名單裡了。
`role` 欄完全不能用：importer 把 33 個遠程角色**全部**填成 `marksman`。

**兩類，不是三類、也不是一類**。`magic` 一類涵蓋全部 22 個施法者是刻意的——
WC3 的 missile art 分的是**元素**（火球／遠見者／暗影獵手／毒蛇守衛），**不是法器**，
再切 staff/orb/beam 是發明來源沒有的區分，而且每切一刀就要多一個 clip 才不算空類別。
`thrown` 反過來：它**沒有**專屬 clip，所以在 `WEAPON_SFX` 裡**明寫**成通用揮擊聲
（`GENERIC_SWING`）。**「明寫的退回」和「掉下去的退回」在程式碼裡長得一樣，但在人眼裡不一樣**，
而這整個 bug 就是後者。

**新音檔**：`content/assets/audio/sfx/lab/magic-bolt.mp3`（効果音ラボ「気弾1」，
`qigong1.mp3`，戦闘/格闘（ゲーム・アニメ風））。走 ACQUIRE.py 同一條管線
（44.1k mono → 去頭尾靜音 → peak −3.0 dBFS → 128k，符合 #158 的天花板），
已進 `lab/MANIFEST.json` 的 `clips`（含 pre/post dB、bytes、來源 URL），
**並且照使用授權條件列進版權頁** `sfxLabCredits.ts`（`sfxLabCredits.test.ts` 會把它 join 回 manifest 逐欄比對）。
選它之前排除掉的：`magic-flame1/ice1/electron2`（已經是 `abilityCast` 的元素 whoosh，
借用等於把普攻和施法混在一起）、`magic-stick1`（3.4 秒的閃亮波，沒有 transient，
放在 ~1.5 秒的攻速上不能聽）。

**預設也改了，但沒人靠它**：`ranged` 預設從 `bow` 改成 `magic`（普查 22/5/5/1）。
預設仍然存在（全函數必須有），但 `sim/weaponClassCoverage.test.ts` 讓**任何**出貨的
遠程角色只要沒 tag 就紅——所以預設只決定「沒人回答的那個角色錯得多離譜」，不決定出貨內容。

**留下的守衛**（三條，各擋一個不同的洞）：
1. `sim/weaponClassCoverage.test.ts`「每個遠程角色都有 tag」— 擋 S8（機制上線、內容 0 筆）。
2. `combatSfx.test.ts`「每個 sim 武器類別都有**決定過**的 clip」— 從 sim 匯入 `WEAPON_TAGS`
   本體（不是抄一份），所以**新增第八類會直接紅**，不會再靜默落到通用揮擊。這是 S16
   （點修一列、沒對帳整張表）那條 recipe 的自動化版本。
3. `sim/weaponClassCoverage.test.ts` 的端到端那條：真 SimWorld、真皮卡丘、真揮擊 →
   事件上真的帶 `weaponClass=magic`。純函數、角色文件、registry、emit site 四者
   **任一單獨測都是綠的而鏈子是斷的**，只有走完整條才問得出來。

**觀測（不是「測試綠了」）**：
- `curl localhost:39527/content/champions/godie-ofar.json` → `tags: [wc3-import, godie, magic]`
- `curl localhost:39527/content/config/audio-map.json` → `magicBolt → assets/audio/sfx/lab/magic-bolt.mp3`
- 全鏈探針：`weaponClass=magic → magicBolt → …/magic-bolt.mp3 → HTTP 200 / 22613 B / audio/mpeg`（live server）

**本車道沒動、但要記帳的旁證**：`icons.test.ts` 與 `bundle.test.ts` 的 4 條紅燈
**與本次無關**——`content/` 有 **127 份別的車道還沒 commit 的 vfx/augment 文件**，
而 bundle 測試把總數硬釘在 1598（實際 1725）。這是 pre-existing，不要算進來也不要順手改釘死的數字。

---

## #187 「操作說明應該要在進入遊戲第一局旁邊用半透明提示吧」 — 第一局操作圖例

**需求**（owner，今晚要跟家人第一次開打）：進入遊戲第一局，在畫面旁邊放半透明的操作說明。

**做了什麼**（新檔全部在 `apps/client/src/ui/`，只改 `HudRoot.tsx` 一行掛載）：
- `ui/controlLegendModel.ts` — 內容與幾何，**純函數**。
- `ui/ControlLegend.tsx` — `ControlLegendView`（純）＋讀 store 的外殼。
- `ui/inputMode.ts` — 新的「玩家現在手上拿的是什麼」seam（本來不存在）。

**核心決定：圖例是「算出來的」，不是「打出來的」。**
一份手打的按鍵表在第一次改鍵時就變成謊話，而且沒有任何東西會發現——這正是這波
campaign 一整天在刪的缺陷型別。所以：
- **手把**：不是讀 `SLOT_BY_BUTTON`，而是**真的去跑** `mapGamepadFrame()`。
  `probeGamepadButton(i)` 餵一個只按了第 i 鍵的合成 frame，看吐回什麼 Order/Command。
  搖桿同理。改鍵、加鍵、刪鍵 → 圖例同一個 commit 跟著動。
- **鍵盤技能鍵**：直接來自 `SLOT_BY_CODE`（`InputCapture` 自己 dispatch 的那張表）。
- **推導不出來的兩類**（`onKeyDown` switch 裡的 A/S/B/Space/方向鍵、滑鼠 listener、
  touch 的 JSX）改成**宣告 + 雙向 source scan**：宣告的 token 必須在來源檔裡找得到，
  而且 switch 裡**每一個** `case "Key…"` 都必須被圖例認領。加鍵不加圖例 → 測試紅。

**#107 安全區**：本圖例宣告不了 slot（它要的是「戰場旁邊的長條空白」而不是角落，
且 `hudLayout.ts` 這次不在範圍內）。誠實的替代做法是**照它的規矩來**：矩形由 registry
自己的 `hudSlotRect` / `hudStackEnd` 算出來，並由測試在每個 guard viewport（兩種 pointer）
證明它碰不到任何 slot。兩個**置中、沒有角落 slot 可以表達**的群組（PhaseTimer+觀戰提示、
AbilityBar+ResourceBars）在模組裡以量測值宣告成保留框，數字用 source scan 釘回元件。
有面板蓋住角落時（陣亡者的商店）整個圖例讓位——chrome 永遠讓，面板永遠不動。

**兩種形狀**：桌機單人＝左側縱欄（上下兩堆之間的空白）；觸控與**沙發分割畫面**＝
上方橫帶。手機的左上角在 375px 高的視窗已經排到 356px，沒有側欄可用；沙發模式的側欄
屬於某個玩家的視角。桌機視窗太矮塞不下整份時**也退回橫帶**——寧可換位置，不可裁行。

**沙發模式只有一份圖例，不是每個視角一份**：四個座位的按鍵完全一樣，四份＝四倍的墨水、
零額外資訊，而畫面已經被切成四塊。

**踩到的坑（量測救的）**：欄位高度原本寫死 320px，實測 headless render 發現
**最後三列（方向鍵／左鍵點自己／滾輪）被 `overflow:hidden` 靜靜吃掉**——正是這份圖例
存在的意義的反面。改成依列數精算（`legendColumnHeight`，行高 26px 為量測值），塞不下就換形狀。

**其他**：`pointer-events:none`，只有 ✕ 例外（render 測試斷言「恰好一個」元素 opt-in）；
關掉後寫 `localStorage: ggd.controlLegend.dismissed`，之後都不再出現；
gate = `phase === "combat" && round <= 1`（`round` 本來就在 RoomStore，沒有發明新狀態）。

**觀測**：headless Chrome 對三種佈局（1546x900 鍵鼠欄位／1546x900 手把橫帶／812x375 觸控橫帶）
截圖，疊上各 slot 的保留框比對——三張都沒有重疊，13/14 列全部畫出來沒有截斷。
client 測試 235 檔 2641 綠、`tsc --noEmit` 乾淨。

### #187 實機驗證（真的進到 round 1 去看）——抓到兩個「測試全綠但東西是壞的」

上面那段的截圖是**離線 render 疊保留框**，不是真的在打的那一局。實機跑一次
（`game-server-mobile` + `client-playtest` :5205 → Play offline vs bots → 鎖英雄 → Ready）
就抓到兩個 headless 比對看不出來的問題，兩個都是同一個病：**框對了、行對了、字對了，
東西還是沒有用**。

**1. 在骷髏競技場上，字根本看不見（1.18:1）。**
面板底色原本 `rgba(10,14,24,0.44)`、字用 `TEXT_DIM #8d97ad`。左側欄的位置底下正好是
那張圖的**白色岩石**，0.44 疊在 rgb(235,235,235) 上合成出 rgb(136,138,142)，
`TEXT_DIM` 對它的對比是 **1.18:1**——實質上是隱形。之前每一條測試都過：列是對的、
矩形是對的、markup 是對的，可是「半透明」跟「看得見」被拿去交換而沒有人量過。
背景是即時 3D 場景，可以是任何顏色，所以只能對**最壞的底**負責：
- 底色 0.44 → **0.66**（最壞情況合成 rgb(86,89,96)；仍遠低於真面板的 0.88，場景照樣透得出來）
- 說明文字 `TEXT_DIM` → **`#ccd4e4`**（白岩上 4.71:1 過 WCAG AA，土地上 8.25:1）
- 每一行加 `text-shadow`，讓爆炸/閃光直接打在後面時也不會被洗掉
- ✕ 也一起提亮——它是這個框上唯一必須被找到的東西

新增 `controlLegendRender.test.ts` 的對比守門：從**渲染出來的 markup** 刮出面板 alpha 與
**最暗的**一個文字顏色（刮「第一個顏色」會量到亮的標題而放過說明文字，正是這個 bug 的形狀），
合成到純白底上要求 ≥ 4.5:1，且 alpha 必須仍在 0.5–0.8 之間（是提示不是面板）。
把舊值貼回去，這條測試會紅在 1.179:1——確認守得住。

**2. 812x375 的橫帶把控制列表切掉，只剩到 R。**
橫帶高度本來是依**列數**查表的兩個常數（58 / 84）。但橫帶會 wrap，
**它的高度是「wrap 進多寬」的函數**，列數答不出這件事。14 列的鍵鼠組在該處需要六行，
拿到的是三行的 84px，`overflow:hidden` 把「F EX 技能」以下全部靜靜吃掉——
螢幕上是一份看起來很完整、其實停在 R 的操作說明。這跟上面那段自己記錄的
「欄位被吃掉三列」是**同一個缺陷，隔一個函數又犯一次**。

改法：`legendStripHeight(rows, width)` 依實際 wrap 量測（`approxTextWidth` 估字寬 →
`legendPillWidth` → `legendStripLines` 貪婪換行），`LegendPlacementOpts` 從 `rowCount`
改成 **`rows` 本身**；`stripRect` 先定出可用寬度再算高度，**塞不下就回 null**
（「沒位子」永遠勝過「一半的控制」）；元件端 `height` → `minHeight` 並拿掉 `overflow:hidden`，
估寬若有誤差是把框撐高而不是把字剪掉。
測試改成掃**真實的三組按鍵**（不再是合成列數），加上「橫帶必須裝得下自己 wrap 出來的行數」
在 6 viewport × 2 pointer × 3 座位數 × 3 模式上的斷言。

結果：812x375 鍵鼠組現在**誠實地不畫**（14 列真的塞不進 ability cluster 上方的帶狀空間）；
真手機（touch，5 列）拿到 560x58 完整橫帶；手機接手把（13 列）拿到 560x81 完整橫帶。

**實機確認過的**：round 1 桌機欄位 14 列全部可讀（含壓在白岩上的最後三列）；
5 個取樣點裡 4 個穿透到 canvas、只有 ✕ 吃到點擊；按 ✕ 立刻消失且 `localStorage` 寫入；
重新整理 → 開新的一局 → 仍在 round 1 而圖例不再出現；打到 round 2 圖例自己消失
（`dismissKey` 是 null，證明是 round gate 而不是誤觸關閉）；商店階段不顯示。

**沒能實機驗證的**：真觸控裝置（本機只有滑鼠，`hudTouch()` 走的是裝置偵測，
觸控那條路徑只有模型層與單元測試證明）；真手把（沒有實體手把可插，手把列是
`mapGamepadFrame` 探針推導＋單元測試）；2–4 人沙發分割畫面（需要多個實體手把）。

client 測試 235 檔 **2792 綠**、`tsc --noEmit` 乾淨。

---

## #188 「play offline with bot 也要開放給有註冊的玩家在大廳一鍵開房直接玩」（2026-07-24）

**來源**：你的回報。**落點**：#188（本次落地，平台＋前端＋測試）。

### 原本那顆按鈕不是模式，是穿著按鈕外衣的除錯捷徑

大廳 `LobbyScreen.tsx` 早就有「Play vs bots」，但它 `title="dev direct-join — no
platform match record"`，走 `store.playOffline()` → 直連 game-server。**這條路永遠不結算**：
`MatchRoom.settleToPlatform` 沒有平台建立的 match，就沒有 pending 紀錄、沒有預留座位、
沒有 roomId。結果是 8 個帳號 `games:0 wins:0 mmr:1000` 躺在 51 份 replay 旁邊。
（同一顆按鈕在登入頁的版本就是 PT-1 的死路。）

**所以這次的工作是路由，不是 UI。** 把按鈕做漂亮而仍然繞過平台，就是這批次一直在拆的那種缺陷。

### 做法：一鍵 = 平台幫你開一間私人房並「立刻開始」

新增 `POST /api/v1/rooms/solo`（`room.StartSolo`）：建房（**不上大廳列表**）→ 同一個
呼叫裡 `Start` → 走既有 `gamelink.StartMatch`。**刻意重用而不是另開一條路**，因為那條路上
掛著四件本來就會壞的事：平台 matchId 與預留座位、`callbackUrl`（結算的唯一入口）、
pending 紀錄＋`gameRoomId`（#187 心跳／收割者靠它）、以及 `match_ready` 座位推播
（前端因此不需要第二套進場流程）。

**付多少不是這支函式決定的**，`gamelink/callback.go` 的反農場規則早就定義好了：
11 個 bot ⇒ 大廳不是全真人 ⇒ **M幣 = 0**（構造上不可能刷）；自己隊上有 bot ⇒ **水晶減半**。
分數／勝場／賽季分照給。「值得打、不值得刷」。

**沒有選角繞路**：40 秒選角本來就在**局內**（`MatchController.champSelect`），
一鍵之後直接進到那裡，`autoPickAndSpawn` 仍然守著 #130 的「沒鎖英雄就 0 HP 觀戰」陷阱。

**有註冊的玩家**：閘門在 router（`auth.Middleware` + `PlayableOnly`），不是按鈕。
未登入 401、被停權／未核准 403，而且**game-server 上不會有任何預留**。前端檢查只是裝飾。

### 一個不會動的數字，講明白比較好

**隱藏 MMR 不會變**，而且這不是反農場規則，是 Elo 本身（`ranking/elo.go`：只有一隊有真人
就不是可評分的對局）。贏 11 個 bot 說不出你跟家人之間的相對強弱，所以拿來配對的那個數字
不該動。**會動的是**：games、wins、賽季分（第一名 +100）、水晶（減半）、比賽紀錄、排行榜列。

⚠️ **留給你決定的一件事**：賽季分沒有閘門（你當初的規則就是「分數不是貨幣」），
但現在一鍵對 bot 之後，**可見排行榜的分數是可以靠打 bot 累積的**。我沒有擅自改政策；
要收緊的話最小改動是在 `callback.go` 對「非全真人大廳」的 `AwardPoints` 也砍半或不給。

### 驗證

Go 全綠（新增 `gamelink/solobot_test.go`：真的預留 12 席、`callbackUrl` 正確、
結算後 games/wins/賽季分有動且水晶＝一半、M幣＝0、比賽紀錄寫入、心跳可續命且斷了會被收割、
不上大廳列表、未登入 401、被拒 403 且不預留）；game-server 401 綠；client 2798 綠
（新增 `botMatch.test.ts`：一鍵走平台而**不是**直接翻到 `match`、按兩下只開一場、
座位推播才進場、12 秒沒收到座位會說話而不是轉圈、失敗顯示原因、大廳同時有「一鍵開打」與
標示清楚的「dev 直連」）。

**dev 直連保留**（`playOffline`）：測試與 `#replay=` 流程還在用，只是不再是「跟 bot 玩」的唯一入口。

### #188 後續需求：「要讓人一看就知道這是可以玩的」（2026-07-24）

**來源**：owner。路由做完之後，入口仍然是一顆 `small` 的 ghost 按鈕，夾在 圖鑑 與 設定 之間，
標題還寫著 dev 工具。**家人打開大廳，看不出來哪一顆可以開始玩。**

落地在 `LobbyScreen.tsx` 的 `BotMatchStrip`（在 play 欄的最上面，`RoomListPanel` 之前）：

- **份量**：主按鈕改成 `Btn kind="primary"`、16px / 800 字重 / 13px 直向 padding，
  面板本身帶 accent 邊框＋頂部漸層，和下面中性的 ROOMS 面板分得開。
  文案 `⚔️ 一鍵開打`（**帶 VS16**：不帶的話 U+2694 會落回文字字形，在這個尺寸看起來像一個細細的 ✕，
  一顆「開始」按鈕長得像「取消」）。標題 `單人 vs BOT`、副標 `一個人也能開打 —— 真的計分、記戰績、上排行榜`。
- **獎勵講實話，而且講在做決定的地方**：三顆 badge 就在按鈕旁邊——
  `水晶 ½`（金色，自己隊上有 bot）、`無 M幣`（要 12 席全真人）、`MMR 不變`（`ranking/elo.go`，不是反農場規則）。
  底下一行不打折的說明：「隊上有 BOT，水晶只發一半；M幣要 12 人全真人。半份也是白賺，想拿滿就揪人。」
  **這些都是可見文字，不是 tooltip**——手機上根本沒有 hover，而且一個默默少發一半的模式，
  是玩家第一次數水晶時對經濟系統失去信任的方式。測試把 `title=` 全部剝掉之後再斷言，tooltip 通不過。
- **dev 直連降級**：移到分隔線下面那一行、`small ghost` + `opacity .55`，和主按鈕不再是同一階。
- **#107**：整條都在正常流排版（play 欄的 `Panel`），**沒有任何 position**——
  top-right 的 gutter 仍然由 header 從 `chromeReserve` 取得，沒有新的常駐 chrome 宣告。測試直接掃原始碼擋回歸。
- **#24**：兩顆都是 `widgets.Btn`，所以 hover/click SFX 與按壓縮放都在；raw `<button>` 會是啞的。
- **#151/#159 手機**：兩個區塊都是 `flex: 1 1 <basis>` + wrap。390px 實測會疊成
  「資訊塊 / 選圖＋大按鈕」兩段，按鈕吃滿整欄；動作區另外壓 `maxWidth: 440`，
  否則 1600px 螢幕上那個五選一的競技場下拉會被撐到 500px 寬。1280 與 390 都用真的瀏覽器截圖看過。

## 需求：`/admin` 遠端可用（`ggd.adms.ai/admin`，管理員登入後）

**來源**：owner，2026-07-24。「http://localhost:60721/admin/ 這個網址遠端存取不了，請你幫忙合併到 /admin 底下，變成 ggd.adms.ai/admin 管理員登入後也可以使用」

**盤點結果（實測，非讀碼推論）**：`https://ggd.adms.ai/admin/` **已經是可用的**——edge image 早就 build 了 `@ggd/admin`（base=`/admin/`）並複製到
`/usr/share/nginx/html/admin/`，`nginx.conf` 有對應的 `location /admin/`。實測 `/admin/` 與其 entry chunk 皆 200，畫面是
「GGD Operations · operator console · admin only」登入牆，`/api/v1/admin/accounts` 未認證正確回 401。到不了的是 `localhost:60721`
本身——那是 owner 自己機器上的 vite dev server，`loopbackOnly.ts` 讓它**拒絕綁非 loopback 位址**，而那個鎖是承重的：
`/content-api` 代理跳一手會把來源位址洗成 127.0.0.1，所以擋得住 LAN 的只有「連不上這個 socket」本身。

**真正的落差 —— 兩頁遠端沒有，而且是刻意的**：
- **內容管理**（英雄/技能/道具 JSON CRUD）
- **角色語音生成**

兩者的 chunk 在 production build **根本不會被產出**（`App.tsx` 的 bare `import.meta.env.DEV` 讓 rollup 死碼摺除），因為它們是往
loopback content-api / 語音 daemon 寫檔的路徑。

**為什麼不能直接開遠端（比權限更硬的理由）**：`content/` 在家用主機是 `../content:/srv/content:**ro**` 掛載，而且它就是 git
checkout 的那棵樹。所以遠端編輯要嘛寫不進去，要嘛**下一次 `git pull` 部署就被覆蓋**——正是 owner 交代過的
「部署的時候記得不要蓋掉記錄」那類資料損失。

**要讓它遠端可用，需要的是**：一層放在 `data/` 的持久化 overlay，內容載入時疊在出貨 docs 之上——就是 curation 白名單
（`data/curation/`）已經在用的同一個模式。這是設計工作，不是設定開關。

**已經遠端可用的（平台 API + `data/` 持久化）**：玩家/帳號審核、對戰紀錄、公告、內容白名單、戰鬥系統倍率、M幣發放、稽核日誌。

### #188 實機驗證（真的按下去，不是只有測試綠）

不是打離線比對，是起**真的行程**跑一次：獨立 Redis:6399 ＋ platform:8081（自己的
DATA_DIR）＋ 帶 HMAC secret 的 game-server:2600，不碰你正在跑的 :8080/:2567/:39527。

- 未登入 `POST /rooms/solo` → **401**，game-server 上不會有任何預留。
- 第一次故意讓 secret 對不上 → 平台回 `game_rejected (401)`，而且**沒有留下垃圾**：
  大廳列表空的、`matches:pending` 空的（失敗時 `StartSolo` 會把房間 Dispose 掉）。
- secret 對上之後一鍵：回 `{"matchId":"m_01KYA5WX…","botFill":11}`，
  game-server `/healthz` 的 `rooms.active` **0 → 1**（真的有一間房在跑），
  pending hash 有 `roomId` / `gameRoomId=--aBAqqgL` / 12 席（1 真人 + 11 bot），
  大廳列表**仍然是空的**（不公開）。
- **心跳是真的**：30 秒內 game-server 自己送了一次 liveness，`beats=1`、
  deadline 被推到 `beat+180s`。（沒人真的連進去，房間自然 autoDispose，心跳就停了——
  這正是收割者要處理的狀態，不是 bug。）
- 結算：照 `MatchRoom` 的線路格式送簽章結果回呼 → `{"status":"ok","settled":1,"humanSeats":1}`。
  帳號 `games 0→1`、`wins 0→1`、**MMR 1000 不動**（沒有可評分對手）、
  錢包 `crystal 0→120`（= 240 的**一半**）、`mcoin 0`、
  比賽紀錄落地 `status=completed` 且 `points=100`。

也就是說：**一鍵 → 真的房 → 真的心跳 → 真的結算**，四段都在真行程上看過了。
## 2026-07-24 — 試玩回報：「單機對戰」按鈕按一次之後就死了（已修）

### 你的回報
client-playtest lane（port 5205）實測：按下 **Play offline vs bots** 一次沒有進到對戰之後，
再按三次完全沒有反應——**沒有錯誤訊息、沒有 console error、也沒有任何往 game server 的請求**。
唯一的救法是整頁重新整理。

### 判定：✅ 真 bug，根因確認並已修
`AuthScreen.tsx` 的 `runEnter` 用 `enteringRef` 擋重複點擊（雙擊不能放兩次 swoop / 兩次登入），
但這個閂**只有登入失敗那條路會解開**（`runEnterAuth` 自己解）。單機對戰那條路
（`runEnter(() => beginOfflineLoading(offlineMap))`）從來不解——只要那一次 enter 最後沒有真的
把玩家帶到任何地方，閂就永久卡住，之後每一次點擊都在 `if (enteringRef.current) return;` 靜靜地被吞掉。
「沒有錯誤、只能重整」正是這個形狀。

### 落點（本次直接修完，非建任務）
| 項目 | 內容 |
|---|---|
| 一條規則、全路徑解閂 | 新增純函式 `ui/platform/enterGuard.ts` 的 `shouldReleaseEnterGuard({screen, matchStaged})`：enter 只有在「離開了閒置的登入畫面」才算生效——`screen !== "auth"`，**或**已有 launch 停在 loading bar 後面（單機交接刻意讓 `screen` 停在 `"auth"` 撐那 >=1s，所以 staged 必須**維持**閂住）。`runEnter` 在 `proceed` 的 `finally` 套用它，什麼都沒動就把白閃收回、把按鈕交還 |
| 不再靜默失敗 | `proceed` 丟例外、或單機 launch 什麼都沒 stage → 走 `showError(ENTER_FAILED_NOTE)` 由既有 ErrorToast 顯示（可點掉），不再吞掉那次點擊 |
| 解閂要看得見 | 閂改成 ref（同步的雙擊閘）＋ state 鏡像；只解 ref 在下一次無關的 render 之前是看不見的。送出鍵與「Play offline vs bots」都改讀 state 鏡像，並讓單機鍵在一次 launch 期間 disabled |
| 順手 | `runEnterAuth` 不再自帶一份 reset（登入失敗＝「還在 auth」，由同一條規則處理）；store 新增 `showError(message)` action，元件不再需要碰 `appStore.setState` |

順帶抓到的第二個卡死（實機驗證時才現形）：`runEnter` 的 ~1.8 秒硬保底可能在 swoop 還在跑的時候就先 proceed
（分頁被切到背景會直接停掉 render loop，掉幀也夠），接著場景把白閃畫到全白並**凍在那裡**——蓋在我們剛淡回來的
登入畫面上，又是一個「只能重整」的白畫面。改成明確的所有權 `flashOwnedRef`：`runEnter` 授予、`fadeFlashOut` 收回，
收回後 `onFlash` 不再寫入。實測（headless 分頁 = hidden，正好重現這條 race）：修前登入失敗留下整片白，修後
白閃 opacity 0、`invalid credentials` 正常顯示、兩顆按鈕都活著，接著按「Play offline vs bots」直接進到選英雄畫面
（game server `POST /matchmake/create/match → 200`，無 console error）。

驗收：`login-enter-guard-release`（`ui/platform/enterGuard.test.ts`，5 例，含「staged 要維持閂住」「取消後要解閂」
與對真 store 的一致性檢查）；`docs/todo/login-scene.md` li-21；client 全套 **2189 綠**、typecheck clean。
（`render/vfx/bindings.test.ts` 在 worktree 紅是既有問題：`/data/**` 被 .gitignore 吃掉，worktree 沒有
`data/curation/whitelist.json`，與本次修改無關。）

## 需求：兩台機器的內容同步＝逐項打勾裁決，不是單向覆蓋

**來源**：owner，2026-07-24。「應該是每次要同步的時候改變項目列出來選擇以誰為主，並且是打勾的形式，然後送出合併同步兩邊」

**這推翻了 #189 規格的一個前提。** 那份規格假設 `data/content-overlay/` 是單一權威、單向套用在出貨 docs 之上。
owner 要的是**雙向對帳**：同步時列出兩邊的差異項目 → 每一項用勾選決定以哪邊為主 → 送出後**兩邊都變成合併結果**。

**設計影響**：
- 需要一個 **diff 引擎**：對每個 doc 比 `hashDoc()`，分成「只有 A 改 / 只有 B 改 / 兩邊都改（真衝突）」三類。
  只有一邊改的可以預設打勾那一邊；真衝突才需要人決定。
- 需要 **共同祖先**才能分辨「A 改了」和「B 刪了」。`gen/` 快照鏈提供這個：每筆 overlay entry 已經帶 `baseHash`
  （出貨 doc 在編輯當下的 hash），那就是三方合併的 base。
- UI 是**逐項核取清單**，不是整批覆蓋。每列要顯示：doc id、哪些欄位不同、兩邊的值。
- 送出後兩邊都推進到**同一個 generation**，所以「合併同步兩邊」是字面意思——不是一邊贏。

**還沒問到的**：欄位級的裁決要不要支援（同一個英雄，A 改了 Q 冷卻、B 改了 R 傷害，理想是兩個都要）。
先做 doc 級；若實際用起來常常需要各取一半，再升級成欄位級。

---

## 2026-07-24 — #79 的另一半：champion 內嵌鏡像沒跟著改（192/452 已同步 + 守衛落地）

### 問題（量測，非推測）

每個 QWER 技能都存兩份：權威版在 `content/abilities/<cid>.<slot>.json`，另一份反正規化鏡像在
`content/champions/<cid>.json` 的 `abilities[<slot>]`。掃過全部 **452 對**之後：

| 欄位 | 兩邊都有但值不同 | 只有 standalone 有 | 只有 embedded 有 |
|---|---|---|---|
| `vfxKey` | **192** | 0 | 0 |
| `schema` | 0 | 452（設計如此，audit 本來就跳過） | 0 |
| `icon` | 0 | 416（`icon-embed-standalone-agree` 的守備範圍，非本次；**已於同日下一段補完**） | 0 |

192 條全部是 embedded 還停在舊佔位：`fx.ember-bolt-cast`×175、`fx.firestorm`×9、
`fx.cinder-ward`×6、`fx.root-snare`×1、`fx.scorch-ring`×1。分佈在 48 個 champion 檔。

### 為什麼「兩邊都有但值不同」比「缺欄位」更毒

`fillGaps` 只補 standalone **沒定義**的欄位，所以跑真實對戰時 standalone(正確值)會贏 ——
**畫面完全正常，測試全綠，肉眼看不出來**。壞掉的只有那些不經過 `registerAll` 的 RAW-DOC 消費端：
圖鑑瀏覽器、後台 內容管理 頁，以及最嚴重的 `apps/editor/src/preview/PreviewController.ts:84`
—— 它傳 `overrideAbilities: true`，整份採用 embedded 副本，所以**編輯器預覽看到的是舊佔位火焰**。

### 落點

| 項目 | 內容 |
|---|---|
| 同步方向 | standalone → embedded，**單向**。standalone 是權威（見 `registry.ts:107` 的 doc-comment 與 `fillGaps`），不做「挑一個比較順眼的」式和解 |
| 改法 | champion 檔是 Python exporter 產的（浮點寫成 `30.0`），走 Node 的 JSON round-trip 會把每個數字都重寫一遍。所以逐行只換那一行 `"vfxKey": "…"`，改完再 re-parse 驗證「解析結果只有預期的 vfxKey 變了」且「差異行數 == 預期筆數」。實際 diff：192 增 192 減、**0 行非 vfxKey 變動** |
| 重建索引 | `pnpm content:build` → `contentVersion` `cv_540d4fa9e29c` → `cv_fcb7197b7f82`（gates client cache invalidation）；`content/champions/_index.json` 48 份 per-doc hash 更新 |
| 守衛 | `packages/shared/src/content/abilityMirror.test.ts` — 4 例，**第一次讓 `auditAbilityMirrorDrift` 真的跑在 content/ 上**（在此之前它只被 `abilityShadowing.test.ts` 的合成 2-doc fixture 碰過） |

### 守衛的形狀（av-14..17）

- **不 fail-fast**：把 192 條全部收進一個 list 再一次 assert。迴圈裡放裸 `expect` 的話，192 個缺陷只會回報成 1 個。失敗訊息會給 `[vfxKey×192]` 的分欄統計 + 全部明細 + 修法（往哪個方向抄、記得 `content:build`）。
- **不 skip**：`ability-mirror-pairs` 明確 assert「每個 champion 的 QWER 都找得到 standalone twin」，而不是遇到找不到就 `continue` —— 否則刪掉 standalone 檔就能讓整套守衛真空通過。
- **有計數**：每條都先 assert 掃到的對數 ≥ 452，避免「一份都沒掃到所以全過」。
- **旁邊那個失效模式也擋**：`ability-mirror-one-sided` 只放行 `schema` + `icon` 這兩個既定的單邊欄位；出現第三個單邊欄位 = 又有新的「只寫一邊」的寫入路徑，直接紅。

反向驗證：把 content/ 退回修前狀態跑這套守衛 → `ability-mirror-no-conflict` 與
`ability-mirror-vfxkey` 各紅一次，訊息 `192 embedded field(s) contradict their standalone twin
across 452 pairs [vfxKey×192]`。守衛不是真空綠的。

---

## 2026-07-24（同日第二則）— 同一面鏡子的另一半：`icon` 416/452 只寫了 standalone（已補完 + 守衛收緊）

上一段修的是 `vfxKey`（**兩邊都有、值不同**）。同一次掃描其實已經量到 `icon` 有 416 條
**只有 standalone 有**，當時判給 `icon-embed-standalone-agree` 而沒動。實際去跑那條守衛：
**它是紅的**，而且不只紅一條。

### 問題（量測）

| 類別 | 452 對 QWER 之中 | 說明 |
|---|---|---|
| 兩邊都有 | 12 | 全是 `.png`，w3x 原生萃取。`extract_icons.py` 兩邊都寫（`doc["abilities"][slot]["icon"]`），所以本來就對 |
| **只有 standalone** | **416** | 全是 `.webp`，AI 生成批次。`tools/icon-gen/src/generate.py` 的 `patch_icon_field` 只寫 `content/<family>/<doc-id>.json`，champion 內嵌那份從頭到尾沒人碰 |
| 兩邊都沒有 | 24 | 其中 16 條是真的沒圖（`godie-e00u` / `godie-h02n` / `godie-u01f` / `godie-u01q` 四位，磁碟上 0 檔）；另 8 條**有圖但 doc 沒欄位** |
| 值衝突 | 0 | 這次是「缺欄位」類，不是 #79 的「值互相矛盾」類 |

另外 9 份 standalone doc（`godie-h02r.{q,w,e,r,ex}`、`godie-u00b.{q,w,e,r}`）webp 已生成並 commit
（`content/config/icon-plan.json` 也列了），**doc 卻完全沒有 `icon` 欄位**。三條守衛因此連環紅：

- `icon-embed-standalone-agree` — 416 條 standalone/embedded 不一致（回報第一條 `godie-e001.q`）
- `icon-ex-consistency` — `godie-h02r.ex.webp` 在磁碟上，`godie-h02r.ex.json` 沒 `icon`
- `icon-no-orphans` — 9 個 webp 沒有任何 doc 引用（fail-fast 只報了第一個 `godie-h02r.e.webp`）

### 落點

| 項目 | 內容 |
|---|---|
| 同步方向 | standalone → embedded，**單向**，同上一段（`registry.ts:107` + `fillGaps`） |
| 改法 | 同上一段的逐行手術：champion 檔是 Python exporter 產的（`30.0`），Node JSON round-trip 會重寫每個數字。每筆只**插入一行** `"icon": "…",`（緊接 `"name"` 之後，與 standalone 的擺位一致 — 452 對全部如此，0 例外），改完 re-parse 驗證兩件事：把插入的行拿掉要**逐 byte 還原原檔**，且 re-parse 後刪掉新增的 key 要 `JSON.stringify` 完全相等 |
| 實際 diff | **+433 行 / −0 行**、**0 行非 `icon` 變動**。其中 embedded 424 條（109 個 champion 檔）+ standalone 9 條（h02r×5、u00b×4） |
| 結果 | 452 對：兩邊都有 **436**、單邊 **0**、衝突 **0**；剩下 16 條是那 4 位真的沒圖的英雄。磁碟上 orphan 圖 **0** |
| 重建索引 | `pnpm content:build` → `contentVersion` `cv_fcb7197b7f82` → `cv_4b49a572be99`；`champions/_index.json` 109 份、`abilities/_index.json` 9 份 per-doc hash 更新 |
| 守衛收緊 | `ability-mirror-one-sided` 的 `STANDALONE_ONLY_OK` 拿掉 `"icon"`，只剩 `"schema"`。這個豁免正是讓 416 條單邊值長期合法存在的原因；鏡像補完後移除，單邊狀態再也回不來 |

### 為什麼「缺欄位」比 `vfxKey` 那類輕、但仍然要修

`fillGaps` 會把 standalone 有、embedded 沒有的欄位補進去，所以走 `registerAll` 的路徑（真實對戰、
HUD 技能列）本來就拿得到圖 —— 這也是它能潛這麼久的原因。壞掉的一樣是不經過 `registerAll` 的
RAW-DOC 消費端：圖鑑、後台 內容管理，以及 `PreviewController.ts` 的 `overrideAbilities: true`
（整份採用 embedded，於是**編輯器預覽的技能格是空的**）。至於那 9 份連 standalone 都沒欄位的，
則是**所有**路徑都拿不到圖 —— 妙蛙花與飛鼠先生的 QWER/EX 一直在用字母 glyph 佔位，圖其實躺在
`content/assets/icons/abilities/` 裡沒人引用。

### 驗證

反向驗證（守衛不是真空綠的）：拿 `8f5d942`（修前）的 content 重跑同一段判定 —— 用**舊**
allowlist `[schema, icon]` 是 **0 條違規（綠）**，這就是 416 條單邊 `icon` 得以長期合法的原因；
換成**新** allowlist `[schema]` 立刻 **416 條違規（紅）**，分欄統計 `icon×416`，掃到的對數同樣是 452。

`icons.test.ts` 7 例 + `abilityMirror.test.ts` 4 例全綠；`@ggd/shared` 70/71 suite、
`apps/client` 210/211、admin 21/21、editor 8/8、content-api 2/2 全過。唯二的紅是既有問題，與本次無關：
`castabilitySweep.test.ts` 與 `render/vfx/bindings.test.ts` 都是 `data/curation/whitelist.json`
被 .gitignore 吃掉、worktree 沒這檔（ENOENT）；`typecheck` 那條 `scripts/probeSlotResolve.ts`
`TS2367` 也是既有的。

---

## 2026-07-25 — 把分支併回 main：鏡像守衛在合併當下抓到第三個單邊欄位

`claude/compassionate-dubinsky-5c4b69` 落後 origin/main 31 個 commit。合併本身只有 6 個衝突
（4 個是 `content:build` 的產物，重跑即可；2 個是 doc 兩邊各自 append）。真正的內容是自動合併的
—— 而這正是 `6f338cd` 記錄過的危險形狀：上一個 icon 修復 worktree 併進來時**靜默刪掉**了
`godie-h02r.r.json` 的整個 `hitFeel` 區塊與已綁好的 w3x `vfxKey`，owner 的原話是「我驗錯了東西：
我檢查每個**新增**的 icon 都能解析，卻從來沒去找**刪除**」。

### 所以這次先驗刪除

逐葉節點比對 **1732 份 doc** 對 origin/main：

| | 數量 |
|---|---|
| **被刪除的葉節點值** | **0** |
| 變更的葉節點值 | 209 —— 全部是 `champions::abilities.<slot>.vfxKey`（embedded 鏡像同步） |
| 新增的葉節點值 | 424 —— 全部是 `champions::abilities.<slot>.icon` |

沒有第四種。沒有數字被重寫、沒有描述被動到、沒有 `hitFeel` 被碰。

### 合併當下守衛抓到的三件事

1. **30 個 embedded `vfxKey` 落後**。main 的 w3x emitter wave 把 30 個技能從 `fx.prim.*`
   升級成真實匯入美術（`fx.w3x.particle.*` / `fx.w3x.locust.*` / `godie-*-p*`），只寫了
   standalone 那邊。合併正確地採用了 main 較新的 standalone 值，於是 embedded 落後 —— 同一個
   單向同步再跑一次即可（+30/−30，0 行非 vfxKey 變動）。
2. **`hitFeel` 是第三個「只寫 standalone」的欄位**（30 個 slot，同樣來自那個 wave）。
   已一併同步進 embedded：整個區塊**逐行原樣複製**再縮排，所以 exporter 的 `1.0` / `0.95`
   浮點寫法原封不動；embedded 物件原本結尾早一個 key，所以 append 就是精確鏡像。
   diff +450 / −30，那 30 行「刪除」全部是原值加一個逗號（含 `godie-ekee.Q` 的 `icon`，
   它剛好是該物件最後一個 key）。
3. **`ability-mirror-vfxkey` 的 primitive 底線**從 400 降到 390（實測 397）。這是**故意往下調**：
   30 個 slot 升級到真實 w3x 美術是進步不是漂移，兩邊一致，由上面的 `stale` 清單負責證明。

### 連帶：一條豁免變成謊言

`fieldAdoption.test.ts` 的 `field:champions.abilities.*.hitFeel` 豁免原本寫著
「A MIRROR GAP, not a plain zero: 30 standalone... and 0 of their champion-embedded twins」。
鏡像補完後它就不成立了，該套件的 stale-exemption 檢查立刻紅並指名修法（「DELETE the listed
entries; that is the entire fix」）—— 已刪除。這條檢查本身就是為了不讓豁免變成過期的謊言。

### 與 main 立場的分歧（已由 owner 裁決）

main 的 `icons.test.ts` 明文採「AUTHORITY MODEL」：424 個 embedded 沒有 icon 是
「the DESIGNED steady state, not a defect」，且作者註明他試過回填、弄壞了 `loader.test.ts` 與
`fieldAdoption.test.ts`。實測：在本分支的回填下**那兩個套件都是綠的**（`fieldAdoption` 後來紅的
是 hitFeel 那條過期豁免，不是回填本身，且修法由測試自己指定）。owner 裁決：**一併同步 hitFeel**，
維持「兩邊同步 + 禁止單邊」。main 那段 authority-model 註解與本分支的嚴格模型並存於同一份檔案，
未來若要改採 authority model，改的是 `STANDALONE_ONLY_OK` 一行。

### 驗證

`@ggd/shared` **77/77 套件、811/811 測試全綠**（castabilitySweep 也綠了）、typecheck **clean**
（main 已修掉 `probeSlotResolve.ts` 的 TS2367）；admin 27/27、editor 8/8、content-api 2/2。
`apps/client` 236/237 —— 唯一的紅是 `render/vfx/bindings.test.ts`，`/data/**` 被 .gitignore 吃掉
所以任何 worktree 都沒有 `data/curation/whitelist.json`，結構性既有問題，與本次無關。
`content:build` → `contentVersion` `cv_6da952bde327`。

---

## 2026-07-25 — 裁示：存檔不問同步；同步是獨立動作（#189 規格已落地為文件）

**來源**：owner。「ggd.adms.ai 及 localhost 兩邊後台不管哪個，修改完要儲存時，都要問同步到另外一台嗎?」

**答案：不要。** 規格寫進 `docs/design/content-sync.md`，驗收列在 `docs/todo/content-sync.md`（csync-01..12，全 pending）。

裁示要點（不要再重新設計，也不要再問這幾條）：

- **有三個 store，不是兩台機器**：Mac 的工作樹、家用主機的 `data/` overlay、以及 git。主機的 `content/` 是
  `:ro` 掛載的 git checkout（`docker/compose.yaml:69-72`），存在那裡而不在 `data/` 的修改，下次 `git pull` 必然消失。
  所以 **#189 是前置條件，不是加分項**。
- **存檔：本機、即時、不會失敗、offline-first**。唯一允許的失敗是 schema 不過或寫不進磁碟；「對方連不上」不是。
- **不在存檔時問**的三個理由：後台要開放給家人，天天彈的 modal 會被練成反射性按掉；存檔當下還不知道有沒有衝突，
  要知道就得問一台可能關機的機器；而且同步本來就不是 yes/no —— 它是 2026-07-24 那條「逐項打勾 + 欄位級裁決」的表格。
- **把「每次都問」換成「永遠看得到」**：常駐分歧指示器 `本機有 N 項未同步 · 對方有 M 項 · 上次同步 T`。
  連不上時必須明說連不上，`M` 寫「未知」——**絕不可以顯示 0 或綠勾**。`N` 不需要網路，離線時仍然準確。
- **唯一該跳的提示**不是「要不要同步」，是「對方也改了同一個欄位」：四個條件全中才跳（同一 doc、對方在上次同步後動過、
  欄位有交集、手上有對方快照）。按掉照樣存檔。
- **per-doc metadata 放 sidecar `data/content-sync/state.json`，不進 doc**：`zChampionDoc`/`zAbilityDoc`/`zItemDoc`/`zArenaDoc`
  都是 `.strict()`（未知 key 硬失敗），而且 `hashDoc()` 吃整份 doc —— 履歷進 doc 會讓每次存檔都推動 `cv_`，
  更糟的是會讓「數值相同、編輯者不同」永遠被判成衝突，diff 引擎的前提直接崩掉。

**尚待 owner 決定**（列在 spec §8，勿與上面已裁示的混為一談）：localhost 的 `lastEditedBy` 身分來源、
同步後誰 commit 進 git、家人能不能按送出合併、`content/assets/*` 圖片要不要同步、第一版覆蓋哪些 collection、
落選值要不要留一份可救回。

---

## 2026-07-25 新增需求（owner 本場提出，立即登錄）

| 需求（原話精神） | 任務 | 狀態 | 備註 / 相依 |
|---|---|---|---|
| 大廳除 M幣外也要顯示**藍水晶**數量；**新帳號一律送 1000 藍水晶**，一進來就能買/解鎖喜歡的角色 | **#204** | ⬜ 工作流中 `wf_592d5bb1` | 藍水晶＝#118 的養成貨幣（打場賺、解鎖英雄）；M幣＝後台發放的造型幣。seed 需**冪等**（既有帳號不重發）。大廳 HUD 加 chip |
| **邀請鏈自動審核推廣**：拿邀請碼進來者自動獲得「另一組」自己的碼；那組碼被別人成功註冊時，前一人 pending→approved 自動過審，以此類推 | **#203** | ⬜ 工作流中 `wf_592d5bb1` | 建在 #174（邀請閘）+#126（審核閘）上，**不得削弱**任一閘。防自我循環、一碼有限次、admin 仍可否決。referral 只加速邀請人過審，不繞過「要有碼才能註冊」 |
| **嚴格部署協定**（deploy 到 ggd.adms.ai 需 owner 親自確認）：code-cut→commit→release draft／無 T0/重大 bug／localhost 實測記錄本檔／重整本檔確認可上／push+release（隔日跳版號）／deploy+實測記錄回本檔 | 流程 | ✅ 已寫入記憶 | 見 `ggd-gcp-deploy`。本檔（Execution Batches / 本盤點）即 step 3/4/6 的記錄落點 |
| **建立掃描任務：所有英雄逐技能從 JASS 拉回實作**（「Saber 的技能傷害都在 JASS」），且**每技能三軸都要顧**：特效(3d model/粒子/球體/蝗蟲群) + 傷害效果(大部分在 JASS) + 音效 | #78 長期軸；掃描器✅ 批次修✅ 裁決✅ 音效面✅ 音效資產✅ | 🟢 傷害軸收斂；音效軸收斂（123 stock refs → 60/61 clip 自 MPQ 抽出至 data/blizzard-overlay/ability-sfx（著作權閘：dev-only mount，combatSfx 依 fullAssets 分層），91 技能補 `sfxKey`（+既有 5 = 96/98；缺 sawch.mp3 者 2 技能跳過——檔案不在任何 MPQ/map 內），49 個 wc3.* key 進 audio-map/reachability） | `tools/w3x-import/scan_ability_effects.py` → `out/GoDieEX22s-src/EFFECT_AUDIT.{json,md}`：654 技能×111 英雄，join 611/654，傷害軸 ZERO 18／TRIVIAL 4／**NO_DAMAGE_EFFECT 20**（JASS 有傷害、content 無 damage effect——早前 178 佔位帳完全沒收錄這班）／SUSPECT 122（content 數字不在 ubertip 色碼段內，需逐條讀引用的 JASS 裁決，Saber E 型的「JASS 贏 tooltip」衝突就在這班）；特效軸 MISSING 0；音效軸：98 技能 WC3 有 gg_snd 音效 → `ability@1.sfxKey` 已全面採用（96/98；`tools/w3x-import/extract_stock_sfx.py` 可重跑）。已知限制：以 unit-type 而非技能 rawcode 觸發的 trigger（如 saber 被動、ExcaliburMAX）rawcode 掃不到，要走 HERO_TRIGGERS 英雄名路徑。先導修復：Saber godie-e002+godie-e00l E [250,400,550,700]（JASS `Trig_Excalibur` j:32332，0.4×當前魔力項不可表達已記損）、Q 改被動迴避 7/14/21/28%（A0CM=原生 AEev）、被動盾牌 60=等級1值照舊 |

#### 🎙 2026-07-25 追記：AudioGen 51 檔素材已入庫，語音管線閉環
使用者交付 `AudioGen_voice_reference_final_51_2026-07-25.zip`（51 檔成品 WAV + 5 輪人工覆核紀錄 + 逐檔 YouTube 來源權利聲明 + SHA256SUMS，完整性 51/51 驗證通過）。
上表「真缺口：實際參考音 0 檔」→ **✅ 已關閉**：51/51 全數 approved，`approved/processed/` 交付就緒，`missing_characters.csv` 清空。
- 英雄名冊 48→51（賈修貝爾/揍敵客桀諾/喪標麥可；聲優雙來源補查：賈修=大谷育江、桀諾=2011年版大竹宏）
- 新機制 `config/review_overrides.csv`：僅啟發式拒絕可被人工覆核推翻（引用 AudioGen 逐檔 locked_pass 紀錄），硬性缺陷不可覆蓋。實測我方啟發式誤咬 25 檔（18 多人聲/7 背景音樂誤判、0 硬缺陷）全數依人工紀錄降級放行
- 分離度升級：venv 裝入 speechbrain+torch，人聲配對走真 ECAPA embedding（音檔以 ffmpeg 解碼餵入，不依賴 torchcodec）；非人類配對改距離型相似度 `exp(-d/scale)` 修正 z-score cosine 虛高（修正前 78 對假性高碰撞、修正後 0 對，最高相似 0.61 拳四郎vs索隆）
- normalize 新增校正增益 pass（短片 linear loudnorm 偏移），51 檔實測 [-20.2, -17.4] LUFS / TP ≤ -1
- **未決事項**：zip 內 heroes.csv 與 repo 版有 6 角色選角方向不一致（e00k/h02k/hpb1/ogld/udea/zombiex，實際音檔按 zip 版方向製作）；repo 版為準（使用者最新編輯），差異已回報待裁決。provenance 全套保存於 `voice-reference-pipeline/provenance/audiogen-2026-07-25/`

#### 🎙 2026-07-25 追記 2：角色語音「生成」階段（44 類台詞×全角色＋後台一鍵頁）
使用者需求：以 51 參考音為 prompt，生成 41 類（展開 46 句/角色）遊戲語音、做成後台一鍵生成+試聽頁、全角色平行自動跑完。
盤點發現前一工作區已鋪好大半：分類 schema（categories.ts，與使用者清單逐字一致）、VoiceGen 後台頁+typed client+SSE hook+/voice-api 代理、tools/voice-gen 雙引擎合成管線（CosyVoice3 預設/IndexTTS-2 量測後備、QA gate、冪等分片）。**缺口=daemon 本體與台詞腳本**。
- ✅ `tools/voice-gen/src/serve.mjs` 新寫（照 voiceApi.ts 契約：狀態機/stub 誠實/409 規則/SSE/併發≤4）；curl 煙霧+後台頁實測連通（51 角色×46 句、參考音全 ✓）
- ✅ `content/assets/audio/voices/lines/CATEGORIES.json`（voice.categories@1 權威檔）+ `import_lines.mjs` 匯稿 CLI + CREDITS.md 生成語音包條目 + README §11
- ✅ 引擎煙霧：真 ref 生成 2.28s 音檔（18.6s/clip, MPS 4GB）
- 🔄 台詞撰稿 workflow（11 批×撰+審，ja+kana/台語 zh/非語言擬聲）執行中；完成後匯入→daemon roster 全量生成（~2346 段，3 併發約 4 小時）
- ⚠ 授權：Fun-CosyVoice3-0.5B 權重條款需在對外發布前確認（README §Licences；CREDITS 已標注）

#### 🎙 2026-07-25 追記 3：全量生成完成 + 試聽頁/看板收納（/goal 達成）
- **2346/2346 句全數生成完成**（51 角色 × 46 句，2344 主批 + 1 單句測試 + 1 掃尾重生），0 缺漏。總時長 ~49 分鐘語音、55MB，全部 128kbps/44.1kHz/mono/-16 LUFS
- 唯一失敗句根因＝技能名 `39-002-紅王` 第三段連字號 → 去前綴殘留 `-` 開頭被 argparse 當旗標；已修 regex + synth 呼叫改 `--text=` 形式（杜絕整類問題），掃尾重生成功
- **效能升級**（使用者指正「沒有多工」）：實測本來就是 3 行程平行（12-24 句/分 vs 單工 3.2），但逐句子行程=每句重載模型；daemon 已升級 manifest 分片常駐模式（≥8 句自動走分片，模型每 worker 只載一次），dry-run 驗證相容，下次全量預估 2-3× 快
- **試聽頁**：`voice-audition.html`（apps/client/public/，39527 與 8731 鏡像同步更新，2346/2346 可播）+ bgm-audition.html 加互導列
- **即時看板**：`admin/voice-progress.html`（SSE 驅動：總進度/吞吐直方圖/51 角色熱力格⚡/即時完成流）
- **admin 收納**：Console Hub 新增 📊 語音生成看板、🎙️ 角色語音試聽、🎵 音樂音效試聽 三卡
- 未 commit；下一步=人工試聽驗收（後台逐句 approve）→ client 接入 41 類播放時機

#### 🎙 2026-07-25 追記 4：技能喊招全面日文化（中文顯示 → 日文考證 → 日文唸法）
使用者指正：技能名多為有名必殺技、有官方特定唸法，喊中文不對。已全面重做：
- 查證 workflow（11 考據 + 11 對抗覆核 agent，363 次工具呼叫）：**133 筆 canonical 讀音附來源雙重驗證**（月牙天衝=ゲツガテンショウ、龍破斬=ドラグ・スレイブ、卍解、超究武神覇斬、三千世界…），查無官方讀音者誠實標 onyomi/styled 不瞎掰；覆核抓到真錯（紅王=アカノオウ 非クレナイ、ブッダギリ、クリスタリザティオー、長音修正多筆）
- 讀音固化於 `content/assets/audio/voices/lines/SKILL_READINGS.json`（voice.skill-readings@1，256 筆）；`import_lines.mjs` 自動套用（未來新角色不會回退中文唸法）；`apply_skill_readings.mjs` 一鍵合併→推送→重生成
- **255/255 全部重生完成**（含喪標麥可 5 筆——使用者明示無例外；陥穽/溢出等日文實詞音讀）；驗證：全部 mp3 新鮮、status 全 ja+kana
- 分片模式實測 **49 句/分**（vs 逐句 12-24），255 句 5.2 分鐘跑完；並修正分片模式兩個邊角（舊 sidecar 誤判完成的新鮮度檢查、冪等跳過誤標 failed）
- 顯示文字維持中文（遊戲 UI 不變），僅語音層日文化——modelText=kana 由 synth sidecar 記錄，可回溯

#### 🎙 2026-07-25 追記 5：全英雄技能組稽核（桀諾式污染掃蕩）
使用者問「還有沒有像桀諾那種錯用舊模板的」。稽核 workflow（11 稽核 + 11 對抗覆核 agent，159 工具呼叫，51 英雄 × 306 技全掃含被動）：
- **45 英雄乾淨**（正典技逐一 web 驗證：一護月牙天衝、莉娜龍破斬、麻倉葉布都御魂…）
- **抓到並修正**：殺生丸 Q/W/E（風華之爪→毒華爪ドッカソウ、合氣斬→閃光鞭、爆碎丸→爆碎牙バクサイガ，全為正典且描述本就對應）、桔梗 R（百鬼夜行→死魂蟲——原名屬《滑頭鬼之孫》，描述卻是桔梗正典收魂）、魔人普烏 EX（普烏死亡佔位→純粋魔人ブウ）、黑人牙膏 EX（億萬星殞落→**億萬衛星殞落**，owner 定名+台語空耳語音）
- **描述殘留修正**：桀諾 Q/EX（老樹盤根植物文→氣龍纏縛/龍矢天降，保正典名）、臭作 W（WC3火焰之息殘留）
- **順修**：草泥馬 W/E 編號互換（92-03/92-02）、鬼眼狂刀無名→無明神風流（kana ムミョウ 本就正確、只改字不需重錄）
- 覆核把關戰績：駁回「牙突→縮地」誤改（牙突是桀諾正典ドラゴンランス，縮地反是瀨田宗次郎的招）；基廉列克廬山昇龍破查 reconciliation 確認是原作者梗名（豁免）
- 6 句語音重生（osam×3/hvwd/ogld/huth），雙鏡像+讀音登錄同步，content:build 綠，試聽頁重建

---

## 2026-07-26 新增需求（owner 本場提出，立即登錄）

| 需求（原話精神） | 任務 | 狀態 | 備註 / 相依 |
|---|---|---|---|
| 「請在後台 **發放M幣的地方**也可以設定**發放藍水晶**，以及**一鍵發放所有帳號藍水晶**的功能」 | **#225** | ✅ 已實作（`feat/admin-crystal-grant`） | 單筆 + 批次兩支端點，**放在 `internal/admin` 而非 `internal/wallet`**（見下方註記）。UI 沿用同一頁 `MCoinGrantPage`（新增兩個 Panel），純邏輯抽到 `apps/admin/src/crystalGrant.ts` |

#### 🔎 #225 實作註記：兩個「後台 M 幣入口」，而發放頁用的那個**沒有稽核**
盤點時發現後台其實有**兩條** M 幣路徑，而「M幣 發放」頁走的是沒有稽核的那條：

1. `POST /api/v1/wallet/admin/grant-mcoin`（`internal/wallet`）— **發放頁實際呼叫的**。授權只靠 service 內的 `caller.HasRole("admin")`（**不檢查 banned / #126 approved**），且**不寫任何稽核行**。
2. `POST /api/v1/admin/accounts/{id}/mcoin`（`internal/admin`）— 玩家列表頁走的。`AdminOnly` middleware + 寫 `mcoin_adjust` 稽核。

需求明訂「每一筆發放都要進稽核」，所以新的水晶端點**必須**放在 `internal/admin`：稽核 writer 與 `AdminOnly` 都在那裡，而 `internal/wallet` **不可能**自己寫稽核（`admin` import `wallet`，反向就是循環——`wallet/meta.go` 把 `roleAdmin = "admin"` 寫成字面常數就是為了閃這個循環）。因此：
- 新端點：`POST /admin/accounts/{id}/crystal`、`POST /admin/crystals/grant-all`，均在 `r.Route("/admin", …)` 內自動繼承 `AdminOnly`（roled + 未 ban + 已審核），比 grant-mcoin 的閘**更強**，沒有削弱任何既有防線。
- 稽核：單筆 `crystal_grant`（targetId = 帳號，detail `{amount, balance, reason}`）；批次**只寫一行** `crystal_grant_all`（targetId = `"*"`，detail `{amount, accounts, granted, failed, reason}`），符合「批次只記一次 + 帶影響帳號數」。`AuditPage` 的 `ACTION_LABEL` 已補這兩個動作。
- **nginx 不需改動**：`nginx/nginx.conf` 已有泛用 `location /api/`，沒有新增任何對外暴露面。

#### 🔎 #225 實作註記：兩個容易踩的坑（都已避開）
- **不可重用 #204 的 `BackfillWelcomeCrystals`**。它委派 `SeedNewAccountCrystals`，冪等規則是「已有 walletmeta 記錄就跳過」——線上幾乎每個帳號都有記錄，一鍵發放走它會**回報成功但幾乎一個都沒發到**。只借形狀（逐帳號迴圈、granted/failed 計數、首個錯誤浮出、絕不中斷），`GGD_BACKFILL_WELCOME_CRYSTALS` **維持 0、完全沒動**。新動作是**可重複執行**的操作員動作（跑兩次就每人兩份），所以 UI 才必須有明確確認步驟。
- **不可用 `CrystalOf` + `SetCrystalAbsolute` 拼發放**。那是跨兩次呼叫的 read-modify-write，會和結算（寫絕對值）競爭，批次迴圈更把窗口拉到整個迴圈長度。新增 `wallet.Service.AddCrystal`，建在既有 `mutateMeta`（`metaLocks.Lock(accountID)`）之上，單筆與批次共用同一個上鎖的變更點。
- **金額一律伺服器端驗證**：正整數、上限 `admin.MaxCrystalGrant`（1,000,000，防打錯零而非經濟規則）；**負數直接拒絕不做 clamp**——餘額下限是 0，收負數等於「把玩家水晶歸零」而不是扣除。批次失敗採「逐帳號收集、首個錯誤浮出、成功的照樣算數」，因為每筆都是單鍵上鎖 RMW，中途失敗不會留下半寫的餘額。
## 2026-07-26 — #222「手把選取框太不明顯」：根因不是太淡，是**被 clip-path 整個裁掉**

試玩指令原話：「用手把操作選取的框框太不明顯了 請你做明顯漸層炫光」。

**根因（與「太淡」的直覺相反）**：舊的 pad focus ring 是 `ui/PadFocusNav.tsx` 用 JS 字串注入的一段 CSS，內容只有 `outline` + 兩層**外側** `box-shadow`。而 `.ggd-btn`（#24 按鈕皮膚）帶 `clip-path: polygon(...)` 做 45° 缺角 JRPG silhouette——**clip-path 會裁掉 outline 與外側 shadow**。所以在共用 `Btn`（`ui/platform/widgets.tsx`）與每一個 `SfxButton` 上，也就是實質整個 UI，那個框 **100% 被裁掉、畫面上什麼都沒有**。把 outline 加粗到 10px 也一樣看不到。而且它是元件裡的 JS 樣板字串，repo 內任何 `*.css` 掃描都掃不到它——沒有任何測試可能失敗。

**修法：一份共用樣式，兩層（two tiers）**——因為 `<input>`/`<textarea>` 是 replaced element，**不能有 `::before`/`::after`**，只做按鈕層會讓登入表單那半邊繼續全黑：
- **Tier 1（通用，含 input）**：動畫化的**內側** rim（`inset` box-shadow）+ 外側 halo + 循環 `outline-color`。內側 rim 畫在 border box **裡面**，clip-path 吃不掉，是承重的那道訊號。
- **Tier 2（`.ggd-btn` 家族）**：直接改寫 #24 **既有的** `::before` 漸層環——4px（vs 基礎 1.4px）、`opacity:1`、羽化，並**重用 #24 自己的 `ggd-btn-glow` keyframe**，所以看起來是原生的而不是外掛的。它繼承 `clip-path: inherit`，光帶會沿著缺角走而不是破壞造型。

**與 hover / disabled 的區別**（hover 今天就只是「同一個環，亮一點、快一倍」）：focus 同時在**四個軸**贏——厚度（4px vs 1.4px）、速度（1.3s vs hover 3s vs idle 6s 的三段階梯）、hover 完全沒有的內側 rim + halo、以及 1.03 幾何抬升；外加一個只屬於 focus 的白熾 glint 色停。disabled 則明文守衛（本檔 source-later 於 buttonFx.css，同 specificity 會贏，不能靠 JS selector 擋）。

**順手關掉的兩個缺口**：
- `PadFocusNav` 從 `AppRoot` 手動掛載改為 `ui/GlobalChrome` 成員 → `#replay=` 那棵樹（`ReplayApp`，全是 transport 按鈕、又是最沒鍵盤保證的一頁）**本來完全無法用手把操作**，現在免費拿到。`surfaceParity.test.ts` 既有的守衛順帶把「每個 render tree 都有」變成契約；同時 **必須**從 AppRoot 移除手掛，否則該守衛會紅。
- **鍵盤是淨改善不是持平**：全 app 原本只有 `ui/mobile.css` 的 `.ggd-audio-range` 有 `:focus-visible`，而 `widgets.tsx` 的 `TextInput`（以及 codex 編輯器、store preview）內嵌 `outline:"none"` 沒有替代——也就是**文字欄位的鍵盤焦點原本是隱形的**。Tier 1 帶 `!important`，登入表單/codex/store 現在都有了真的焦點指示。⚠ 試玩會看到登入頁 Tab 樣子不同，那是修好不是壞掉。

**prefers-reduced-motion**：反轉常見失敗模式（靠動畫才看得見的光暈，對要求減少動態的使用者直接消失）。這裡是**凍結在脈動的峰值**：rim/halo 照畫、光帶保留完整 4px 與多色漸層，只停止移動。測試明文禁止該區塊出現 `display:none`/`opacity:0`。

**刻意不碰**（另一車道正持有這些檔）：`ui/buttonFx.css`、`ui/SfxButton.tsx`、`ui/platform/widgets.tsx`、`components/AbilityBar.tsx`、`TouchControls.tsx`、`components/CouchHudGrid.tsx`。所有 focus 規則都是**新檔裡的新 selector**，那條車道看到的是零行 diff；連 `.ggd-btn--subdued`（QWER/EX 技能格）的「安靜版 focus」（2.5px、不抬升，戰鬥中不變燈光秀）也宣告在新檔裡。

**守衛**（`ui/focusGlow.test.ts`，node env、註解剝除的 source scan，比較的**兩邊都從 source 推導**，不是把現值抄成常數）：import 次序（focusGlow.css 必須在 buttonFx.css 之後，否則 Tier 2 在 source order 輸給 hover）／每條規則必須**成對**宣告 pad 屬性與 `:focus-visible`（不得單邊漂移）／reduced-motion 不得隱藏任何東西／**色票必須取自 buttonFx.css**（白色 glint 為唯一例外——這條會抓到舊 ring 那個 app 內不存在的 `#7aa2ff`）／focus 的厚度與速度必須勝過 hover 勝過 idle／disabled 守衛存在／focusGlow.* 以外**任何檔案**不得寫 `data-pad-focused` 或自己的 `:focus-visible`（例外表雙向 ratchet，過期列也會紅）／**driver 契約**：凡是同時「讀手把」又「移動 DOM focus」的檔案都必須 import `./focusGlow`（這條推導出 `DeviceLoginPanel`——手機掃碼登入那頁沒有鍵盤、原本也沒有任何選取提示）。

**本次刻意不做的後續**（登錄備查）：
1. 把 `DeviceLoginPanel` 完全遷到 `PadFocusNav`，然後刪掉 `ui/platform/gamepadFocus.ts` 及其測試（屆時消費者歸零）。本次只讓它呼叫共用的 `applyPadFocus`，維持既有導覽迴圈不動。
2. 手把 A 鍵走的是合成 `.click()`（`PadFocusNav.tsx`），因此**不會觸發 pointerdown 的按壓縮放**——手把按下去沒有按壓回饋。獨立的手感項目。

**Gate**：`tsc --noEmit` 綠、`build` 綠、client 全測 3050 passed。另有 2 個**先前就紅**的失敗（`render/vfx/bindings.test.ts` 收集期失敗、`ui/components/descriptionRescale.test.ts` 冷卻倍率 15→12）——已在乾淨 base commit 上 stash 覆現確認與本任務無關（見記憶 `ggd-ci-preexisting-breakages`）。
#### 🧬 2026-07-26 天生技效果落地（Execution Batch 項目 1）— 普查校正 + 首批落地

**普查數字校正：不是 48 支全空，是 29 支。** `content/abilities/*passive*.json` 共 109 支，其中 61 支
`innateKind:"active"`（全部帶 effects、全部已可施放），48 支 `innateKind:"passive"`。被動天生技的
`effects: []` 是**規格要求、不是 bug**——`zAbilityDoc.refineInnate` 只對 active 種類要求 effects，
`isPassiveOnly()` 正是以 `passive !== undefined && effects.length === 0` 判定，而 `innateCastBlock`
會在扣任何成本前就擋下 PASSIVE 種類的按鍵。若替這 48 支填 `effects[]`，感應意脈會變成可施放的核彈。
真正的酬載在 `passive.ranks[0].{modifiers,hooks,auras}`，以此為準**恰好 29 支為空**——與 batch 原文
「29 個空 modifier」完全一致，`sim/combat/evasion.ts:8` 的註解也早已寫明同一個數字。

**第 6 槽接線：本來就已完成，本次只驗證未重做。** `CASTABLE_SLOTS` 已含 "PASSIVE"、
`abilities/innateActive.ts` 讓第六槽走一般 `castAbility` 階梯、`spawnChampion` 給 `passiveSlot` rank 1，
61 支 active 天生技今天全部可按，`innateActive.test.ts` 逐一施放過。（batch 寫「60 個」，實為 61。）
第三子項 eventFanout 的 evade 同樣早已完成。

**本次落地 6 支**（`applied` 由 19 → 25）：

| 天生技 | rawcode / 基底 | 落地內容 | 來源 |
|---|---|---|---|
| 12-00 感應意脈 ×2（e007 / ewar） | A04Z / AEev | evasion flat **0.20** | w3a DataA1 lv1 |
| 45-00 寫輪眼（edem） | A04Q / ACev（未覆寫） | evasion flat **0.15** | 暴雪原生 ACev DataA1＝0.15，實讀自 MPQ |
| 92-00 憂鬱的眼神 ×2（h02u / h02v） | A0W6 / AEev | evasion flat **0.18** + `onDamageTaken` −50% AD 3s | w3a DataA1；hook 由 JASS 45161-45193 |
| 98-00 正妹優勢（n01l） | A0ZC / AEev | evasion flat **0.25** | w3a DataA1 |
| 09-00 賽亞人的血脈（ogrh） | A0NL | `onKill` +2 maxHealth（鏡像 o00x） | 與 o00x 同 rawcode 同文案 |

**⚠️ 迴避是「搬移」不是「新增」。** 6 支英雄的 `baseStats.evasion` 原本就掛著同一個值；若只加
modifier 不刪 baseStats 會**加倍**（感應意脈→0.40）。已於同一 commit 逐行刪除 baseStats 該行，
並以真實 spawn 量測最終 `Stat.Evasion` 確認為 0.20/0.15/0.18/0.25（非 2×）。
`godie-u00j` 的 `baseStats.evasion: 0.15` **刻意保留未動**——它與自身天生技 74-00 JENOVA
（現寫成 critChance 0.15 + critDamage 1.25，w3a A0A4/ANdb 為 15 / 3.0 / 0.15）互相矛盾，
兩種讀法必有一錯且暴擊倍率也對不上，需獨立裁決，不做順手修改。

**🔒 被測試擋下、無法保真落地的 3 支光環（原本可填，改列待解）：**
`godie-h01n` / `godie-h01o`（79-00 靈壓，AOae，500→9.17 / 600→11.0，as −25% / as −50%+ms −10%）與
`godie-nman`（40-00 孩子王，Aakb，Area 未覆寫→原生 900→16.5，ad −19%）。三者資料齊備且已實測驗證。
阻礙在 `packages/shared/src/sim/innatePassive.test.ts:150`：
`const authored = Boolean(block?.modifiers?.length || block?.hooks?.length)` **漏了 `auras`**，
但 `abilityPassives.ts:103` 的 `rankBlock()` 有算 auras。只要填了純光環區塊，來源就會掛上而測試認為
不該掛上，`shouldNotApplyButDid` 變非空 → 紅燈（本次已實跑複現，三支全中）。這是**測試述詞與它所
守護的程式碼本身不一致**的既有缺陷，內容端無保真解法（配一個自造 self modifier 去迎合述詞等於發明
數值；靈壓的「初始法力值較一般人高」已記在 baseStats.maxMana 456）。本次任務硬性限制「不得更動
packages/shared/src/sim」，故三支一律還原留空。**解法是一行**：述詞補 `|| block?.auras?.length`，
並把 `expect(applied).toBeGreaterThanOrEqual(19)` 提到 25（含三支光環後為 28）。需 owner 核可後另開。

**NEEDS-CAPABILITY：23 支維持誠實留空，按缺什麼能力分組（→ 鑄技工坊 P2/P3）**

1. **光環（3）**——能力齊備，僅被上述測試述詞擋住：h01n、h01o、nman。
2. **隱形／真視（4）**：e008（A0BE/ANtr）、nplh + u01f（16-00 通靈，Atru）、naka（27-00，Apiv，地圖覆寫 Dur=4.0）。
   sim 沒有隱形狀態，因此也沒有偵測；真視在沒有隱形的世界是 no-op。
3. **攻擊方失手（1）**：e00t（66-00 恐懼，A0IE/Asth；原生 Acrs DataA1=0.33 / Dur=120，已實讀確認）。
   `Stat.Evasion` 依設計是**防禦方**屬性（evasion.ts DECISION 2），沒有攻擊方命中率可掛。
4. **減傷有下限的機率式平減（2）**：hlgr（A04K/Assk 40% / 12 最低傷害 / 75 減免）、u00v（A0L3/Assk 15 / 1 / 210）。
   需要「傷害前」平減 + 觸發骰 + 傷害下限；現有 `onDamageTaken`+shield 慢一拍且表達不出下限，是近似不是移植。
   （順帶：`godie-e002.passive` 的 rawcode A0CQ 基底是 Aegr 而非 Assk，其 50%/60 護盾寫法看來是發明，值得一併裁決。）
5. **依攻擊類型減傷 + 濺射（3）**：n01c + nbbc（A05V/Aegr，未覆寫→原生 **0.65**，已實讀確認；n01c 文案寫的 60% 才是誤植）、
   uwar（43-00，Aegr 明確覆寫 0.60，另有 25% 濺射）。sim 的 DamageType 只有 physical/magic/true，沒有「穿刺」軸；
   HookDef 也只解析到事件目標，沒有由 hook 發散的 AoE。
6. **彈跳普攻 + 法球排他槽（2）**：n00p + nsjs（A002/Asal，資料全 0，行為在文案：彈 3 名、每跳 −25%、與法球裝備衝突）。
7. **自我復活（1）**：hapm（AOr3 Reincarnation，Cool 240）。注意這不是 #84 的復活圈（那是隊友引導）。
8. **負面魔法格擋（2＋半支）**：h020 + hjai（A0UH/ANss，Cool 50）；45-00 寫輪眼的後半（A0ES/ANss，Cool 115）也屬此類，
   本次只落地其迴避半邊。sim 沒有任何機制能否決一次 applyStatus/debuff。
9. **死亡變身 + 定時自復活（3）**：e00r（59-00 暴走，JASS war3map.j:47571-47577 / 47591-47604 / 47656-47721 / 47534-47537）、
   u011 + u012（61-00 百連我殺，JASS Aphx j:50677 / 50712 / 50745）。屬 task #119 領域。
10. **擊殺計數器（1）**：hpb1（07-00，「每殺 8 個 +1 靈敏」）。HookDef 有 `chance` 與 `internalCooldown` 但沒有計數器；
    把「每 8 殺」寫成 12.5% 機率是另一個技能。（o00x 就是這個切分的先例：每殺半邊已落地、每 15 殺半邊沒有。）
11. **晝夜時鐘 + 對敵方施法的反應(1)**：u00k（71-00 暗夜契約，A0HH/Aegr 資料為 stub，真行為在文案）。
    ⚠️ 其「夜間 +100% 移速」會超過 `STAT_CLAMPS` MoveSpeed 上限 14——屆時應**明知地抬高護欄**，
    而不是把 100% 縮水去遷就（faithful-import 原則）。

**護欄檢查（無一觸發）**：`STAT_CLAMPS[Stat.Evasion] = [0, 0.8]`，本批最大值 0.25（98-00 正妹優勢），
比上限低 3.2×；該 clamp 註解原本記載「原始地圖最強是 0.20」，0.25 只是把這個觀察往上修正，仍不需改護欄。

**castability 覆蓋率：改前＝改後＝287/288（✅279 + 🟣8 + ❌1），棘輪下限維持 287，不得調高。**
#128 掃描的六格是 Q/W/E/R/EX/**普攻**，`SLOTS = ["Q","W","E","R","EX"]` 加普攻，**根本不掃第六槽**；
🟣 PASSIVE 指的是「某個 Q/W/E/R/EX 格位是 WC3 永久被動」，與天生技無關。所以本批不可能推動這個數字，
真實可比的指標是 `innatePassive.test.ts` 的 `applied`：**19 → 25（+6）**。
## 2026-07-26 — #218 戰鬥場景柱子沒清乾淨：一條「反向規則」把攝影機保證綁在內容上

### 症狀（owner playtest 原話）
「戰鬥場景中的柱子 還是沒有全部移除乾淨」——固定視角戰鬥場，灰色石柱仍擋住角色。

### 根因（量測，非推測）
`apps/client/src/render/ArenaScene.ts` 的 `buildArena()` 對**每一個 sim 障礙圓**畫一根 `SIGHTLINE_HEIGHT_CAP`(2.4u) 高的灰色圓柱；而把這些圓柱刪掉的判斷是
`if (placedAny && doc.decor.some(d => d.model.includes("pillar")))` ——**刪不刪柱子，取決於這張圖剛好有沒有 pillar.glb 裝飾**。
前一次修正（59c634f）把 arena.skeleton 的 pillar decor 整批刪掉，等於**順手把這條刪除分支關掉**：

| arena | 障礙圓 | pillar decor | 殘留 2.4u 灰柱 |
|---|---|---|---|
| arena.skeleton | 6 | 0（59c634f 刪掉） | **6** |
| arena.dota | 20 | 0 | **20** |
| arena.godie | 55 | 0 | **55** |
| arena.castle | 14 + 4 牆 | 6 | 0（圓柱）／**4 面牆永遠不刪** |
| arena.colosseum | 40 | 36 | 0 |

`else` 分支（segment 障礙的 2.4u 牆盒）**從來沒被 push 進 `handles.obstacleMeshes`**，所以任何路徑都刪不到它。
另外 `GameApp.ts:440` 以 `SKELETON_ARENA` 開機（無 doc → `dressArena` 永遠不跑），開機場的 6 根柱子是**永久**的。
68° 機位下一根 2.4u 圓柱會吃掉北側 2.4·3.75/(9.27−2.4) ≈ **1.31u 內所有人的下半身**。

### 為什麼測試沒抓到
`ArenaScene.test.ts:152-190` 只斷言 `meshes.length > 0` 且 `top <= SIGHTLINE_HEIGHT_CAP` — 2.4u 圓柱**兩條都過**，測試等於替 bug 背書。
`occludesPlayArea()` 在 `topY <= 2.4` 直接 return false，也永遠標不出來。`scripts/occluder-sweep.ts` 是手動腳本（未進 CI），而且**鏡射了同一條反向規則**，還把 #161 改成 68° 的機位漏更新、仍以 55°/8.19u/5.74u 稽核。

### 落點（本次直接修完）
- `ArenaScene.ts` 新增 `OBSTACLE_MARKER_TOP_Y = 0.42`（＝ ArenaGround `KERB_TOP_Y` 的同一個數字、同一個理由：`fullHideReach(0.42) === 0`，比「低於 2.4u 上限」強得多——**任何縮放下都不可能遮住角色的任何一部分**）。
- 圓障礙 → 0.42u 石墩 + 貼在**真實碰撞半徑**上的地面環（torus, top 0.12u）；線段障礙 → 0.42u 矮牆板，寬/深/角度/中心**完全不動**。三種都 push 進 `obstacleMeshes`（補上從來沒被追蹤的牆板）。**不是隱形牆**：碰撞看得見，只是不再是柱子。
- **刪掉 dressArena 尾端那條反向分支**——標記本來就無害，castle/colosseum 的 pillar prop 又剛好站在同一批圓上（36/36、6/6 座標重合），標記直接沒入 prop 底座。
- `occluder-sweep.ts`：55°→68°（EYE 9.27／STANDOFF 3.75）、拿掉 `pillarsPlaced` 跳過、障礙一律以 0.42u 建模。重跑 5 張圖全 PASS（colosseum 最壞 ray-block 25/35，不再全遮）。
- **sim 一行沒動**：`ArenaDef.ts` SKELETON_ARENA 與 5 份 `content/arenas/*.json` 的 `zones` 原封不動 → `roundPacing.test.ts:149-151`（中央柱推擠）與 `kiting.test.ts:107`（z=-14 淨空道）自動保持綠。

### 守衛的形狀
`ArenaScene.test.ts` 新增 `buildArena obstacle markers never occlude the combat camera`：對 **5 份出貨 arena doc + 內建 SKELETON_ARENA** 逐一 `buildArena`，斷言
(a) `obstacleMeshes.length === 圓×2 + 線段`（牆板再也不能悄悄漏追蹤）、
(b) 每個 `-ob-N` mesh 的 `maximumWorld.y <= 0.42` 且 **`fullHideReach(top) === 0`**、
(c) mesh 仍 `isVisible` 且 `top > 0`（不准變成隱形牆）。
外加一組 dressArena 表格測試：**有** pillar decor 與**沒有** pillar decor 兩種 doc，標記都必須「還在且仍然矮」——舊碼在這兩格分別是「被刪掉」與「2.4u 高」，兩格都紅。
反證：把石墩高度改回 `SIGHTLINE_HEIGHT_CAP` 重跑 → 8 條紅（6 張圖 + 2 條 dressArena），確認守衛真的咬得住。

### 仍未關閉（刻意留給美術裁決，非本次 bug）
arena.colosseum 36 根、arena.castle 6 根 **pillar.glb 裝飾**站在障礙圓上，被 #29 squash 到 2.4u 而非移除——那是「殘柱」的美術意圖，不是本 bug。若 owner 說的就是這兩張圖，需再裁決是否把「站在障礙圓上的 decor」也壓到 0.42u。
## 2026-07-26 試玩指令 #220 — 死亡三秒後半透明升天消失（復活圈例外）

Owner 原話：「人物角色死亡 倒在地上三秒後 應該都要有半透明飛上天消失的動畫（如果有復活圈圈的例外）」。

**根因（不是「沒做過這個動畫」，是屍體的視覺生命從來沒有結尾）**：`DeathSystem` 只翻 `hp.alive`，
**sim 從不銷毀死亡英雄的 entity**——屍體會一直留在 snapshot 裡直到回合拆除，所以
`EntityViewRegistry` 的 despawn/dispose 路徑永遠不會為屍體觸發；而 registry 的 `handleEvent`
**根本沒有 `death` 分支**（落到 `default: break`），`ChampionView.update` 也沒有任何死後階段——
glb 分支只把隊伍光環調暗、程序化分支把 `deathT` 拉到倒地姿勢，然後**永遠停在那裡**。

**修法（純 client 視覺，sim 零改動）**：
- `render/deathDissolve.ts`（新，無 Babylon 依賴）＝純時序：躺 `DISSOLVE_LIE_MS = 3000`（owner 的數字），
  再以 `DISSOLVE_RISE_UNITS 3.2` / `DISSOLVE_RISE_MS 1400` 上升，透明度**線性**走到剛好 0
  （緩動永遠到不了 0，「幾乎看不見」的屍體＝永遠不會消失的屍體）。
- **上膛用 sim 的 `death` 事件**（`EntityViewRegistry.handleEvent` → `ChampionView.noteDeath`），
  **不是 `alive === false`**：選角、整段中場、bye/停放席位、結算四種情況 `alive` 都是 false
  （#85 已逐條記載），拿它當訊號會把戰鬥外整個畫面的角色都溶掉。
- **例外＝本需求的重點**：屍體只要該幀 entity 集合裡有一個 **座位相同的 kind-3 圈**就豁免。
  wire 上圈的 `seatId` 就是**死者的席位**（沒有 ownerId 欄位，席位是唯一 join key）；
  「在場」等於「還可認領」，因為圈只能在死亡當幀生成（`spawnCirclesForDeaths`），而 #196 已把
  存活時間整個拿掉。**每幀重算不鎖存**（`death` 事件與帶圈的 snapshot patch 先後不定）；
  受保護時把死亡時間戳重錨到 now，所以 3 秒是從救援真正結束才開始算。
  一隊同時只能燒一個圈，所以第二個隊友死掉沒圈、照常溶解——這是正確行為不是 bug。
- **通道選擇**：淡出走 per-mesh `visibility`，**絕不碰 `material.alpha`**——英雄 glb 以
  `cloneMaterials: false` 實體化，同模型的所有英雄**共用同一個 material**，寫 alpha 會一次淡掉
  全部並和 #49 的 tint clone 打架。上升走 `root.position.y`（沒有別的東西寫它）。
  **不加自發光「升天光」**：必須留在 #85 的去飽和裡，而不是在畫面上打一個亮洞。
- **消失時**只關 body 節點（**不是 `root`**——draw-distance cull 擁有 `root.setEnabled`，
  會在角色回到範圍時把已消失的屍體重新打開），並 `ClipAnimator.stopAll()`：AnimationGroup 不是節點，
  看不見的屍體若還在「播放」死亡動畫，每幀仍在 `scene.animationGroups` 裡付出成本。
  **view 物件本身留著**：entity 還在 snapshot 裡，dispose 會在下一幀被重建路徑復活並重觸發 async glb 載入。
  頭頂血條已由 `anchor.alive` 隱藏；小地圖的淡出死亡標記**刻意保留**（#84：死者靠它找自己的屍體和圈）。

| 測試 ID | 覆蓋 |
|---|---|
| `revive-dissolve-timing` | 恰好 3.0 秒不透明且貼地 → 單調上升＋單調淡出 → 透明度**剛好** 0 並在任何更晚的取樣維持消失；負數/NaN 經過時間讀作「still lying」 |
| `revive-dissolve-view` | 躺→升＋淡→消失且 `root` 保持 enabled；復活圈在時 30 秒完全不溶解、保護解除後重新起算 3 秒；沒有 `death` 事件的屍體永不溶解；復活完整還原並可再次上膛；重複的 death 事件不會重啟躺倒計時 |
| `revive-dissolve-wiring` | `death` 事件上膛；無事件的屍體不溶解；圈只豁免**自己席位**的屍體（同時第二具無圈屍體照常溶解），圈離開 snapshot 後豁免解除；`seatId -1` 永遠無法匹配 |

**閘門**：`@ggd/shared` 880/880 綠（sim 未動，#215 MobSystem 15 / FireRingSystem 6 / fireRing 18 / revive 20 全部未調整即綠）；
client typecheck + build 綠；client 3052 測試中僅 2 個**既有**紅（`descriptionRescale`：live 表冷卻已是 ×0.20 而測試寫死 ×0.25；
`render/vfx/bindings.test.ts` 收集期就失敗）——已用 `git stash` 在 base commit 上覆驗，與本次改動無關。

#### 🧊 2026-07-26 追記：#219 技能冷卻進度看不見 — 根因是「分母」不是「畫法」
playtest 指令「技能冷卻進度不容易從圖示上看到」。表面看是配色/字級問題，實際是**算術錯誤**：
- sim 收的冷卻是 `authored × (1-cdr) × combatEnv.cooldown`，而 `content/config/combat-env.json` 現行 `cooldown: 0.2`；三個 HUD 介面共 **5 份 inline 複製**的 sweep 全都拿「剩餘秒數 ÷ **原始 authored 冷卻**」當進度 → 進度分數**數學上永遠 ≤ 0.20**。52px 技能格上就是底部 ~10px 的一條，而那條正好被技能名 scrim 佔住 → 冷卻指示器**一輩子沒離開過 scrim**。這與 #125（數字可信）同一類：旁邊的 冷卻 tooltip 早就走 `displayFinal(..., "cooldown", env)`，底下的 sweep 沒走。
- 修法：抽出唯一純模組 `apps/client/src/ui/cooldownView.ts`（ticks→秒→fraction→label，node 可測、不 import React/RoomStore/displayFinal），env-scaled max 由 React 呼叫端用 `useDisplayEnv()` 餵進來；唯一 `<CooldownChrome/>` 負責畫。
- 視覺語彙改為 **conic-gradient 放射抹除 + 整格平光壓暗**：旋轉且**收縮**，與 cast fill 的「底部線性**上升**」正交（舊的矩形 sweep 與 cast fill 幾何完全相同，冷卻與吟唱讀起來一樣）；數字加 shadow+stroke+`tabular-nums`，<3s 顯示一位小數（舊 `Math.ceil` 讓最後一秒凍在「1」）；就緒瞬間 340ms bloom 打在**子元素**上（tile 的 transform/filter 是按壓與 deny shake 的頻道）。
- 順手補齊 parity 缺口：touch EX 與 touch 天生技原本只畫暗矩形、**完全沒有秒數**；couch 24x20 chip **完全沒有進度填色**。守門測試從 HudRoot 的 import **推導**介面清單（不寫死檔名），第 4 個 HUD variant 自動繼承契約。
- 測試：`ui/cooldownView.test.ts`（純數學，含「35s 授權值在 `cooldown:0.2` 下剛施放必須 frac=1.0 而非 0.2」的根因鎖）+ `ui/components/cooldownChrome.test.ts`（source scan）。test_id `cooldown-legibility` 已登錄 `docs/todo/client-hud.md` client-36。
- **殘留（未修，另案）**：`Stat.CooldownReduction` 進一步縮短實際冷卻，client 不知道座位的 CDR，故堆 20% CDR 的玩家會看到抹除從 80% 起跑（已 clamp，誠實且會自我收斂）。精確解＝在 `SeatView` 的 `cooldowns` 旁加 `cooldownMax: number[]`。
- **殘留（未修，另案）**：couch HUD 只有 Q/W/E/R chip，**沒有 EX / 天生技 格**，三介面 parity 仍缺一角。

#### 🎆 2026-07-26 #230：特效真實引用普查（每個英雄 × 每個技能）+ 真綁定
使用者指正：「真正做好是追技能真正引用的特效/粒子/球體/蝗蟲群 請你盤點所有英雄、技能清單，告訴我真實的狀況」。綁「某個」vfxKey 不算忠實，忠實是綁「原圖那一支真的用的」。
- **普查器** `tools/w3x-import/build_vfx_census.py`（可重跑、內建 assert）：668 技能文件 × 115 英雄 × 6 槽全覆蓋。**join 方式＝英雄編號＋技能名精確比對（619/668 精確）**，不用 VFX_BINDINGS 的槽位字母——地圖 `A0DZ 20-01 風王結界` 標 `slotFromNumber=q`，但內容裡叫「20-01 風王結界」的文件是 `godie-e002.W`：Saber 的 Q/W 是交叉的，用槽位 join 會製造 4 筆自信但錯誤的改綁。
- **產出兩份**：`out/vfx-census/CENSUS.json`（工作用）＋ `content/assets/vfx/w3x-ability-provenance.json`（隨版發行、**只存不會變的考古事實**：rawcode / 每個美術通道真正指的 mdx / provenance / 抽出了哪些文件 / 每顆模型有幾個發射器、幾個掛在模型根）。**會變的一半（現在綁什麼、哪些 vfx 文件存在）刻意不寫進去**，由頁面在檢視當下讀活的內容算——所以改一次綁定，頁面就跟著動，不需要重產。
- **狀態盤點（前 → 後）**：真實移植 25→**34**、可動的缺口（通用替身但原作已抽出）28→**20**、抽不出來（暴雪內建 .mdl／閃電 id，#81/#116）388、舊制 key 18→**17**、無施法特效 47、原圖沒指定 162。
- **改綁 9 支（只動 vfxKey，effects/damage/scaling 一律沒碰，鏡像逐行同步）**：林克 60-04 迴旋斬 → `godie-bladestorm-swordeffect-p0`；飛影 38-01/38-02/38-03（×2 分身）→ `fx.w3x.particle.flamessmoke.p01` / `godie-fireblast-p3` / `godie-tectonicfury-p0`；天地志狼 12-002 仙氣發勁（×2 分身）→ `fx.w3x.particle.supershinythingy.p00`。其中 5 支原本就已在 `W3X_ABILITY_ART` 升級過——**算圖端一直在播真美術，只有內容 metadata 在說謊**，這就是 main 上 `w3xAbilityArt.test.ts`「shipped vfxKey IS the promoted primary」紅掉的原因，現在綠了。
- **推翻「106 支閒置」的說法**：`vfxKey` 只有一個字串，但一個 WC3 特效是一整組發射器，其餘圖層是靠 `extraVfxDocIds()` 一起播的。118 個圖層裡：12 個是 vfxKey、19 個以伴隨層上場、87 個真的沒上場。而那 87 個裡 **51 個屬於 10 個「零根節點」家族**（divinering 0/20、enchant 0/5、sephboom 0/7、heronarutos4effect 0/6…），**41 個屬於 12 個根本沒有任何技能引用的家族**。兩者都不是「漏改綁」。
- **刻意留下、列成擁有者決策**：Saber 20-01 風王結界（`HolyAwakening.mdx` 是真的 w3a-override 且 6/6 根節點可播，但風王結界正典是「風」，而 HolyAwakening 正是 20-03 約束與勝利之劍 同一顆模型——綁下去四招裡兩招長一樣）。另 18 列是被算圖限制擋住，不是品味問題。
- **最高槓桿後續（另開任務）**：`apps/client/src/vfx/W3xCastFx.ts` 把文件攤平丟給 `W3xEmitterRig`、沒有 `pivotOffset`，而 `w3xFamilyRuntime.toFamilySpec()` 早就替試聽頁做好那份版面。接起來可一次解鎖 10 個零根節點家族（51 個文件）+ 約 14 列技能，包含 78-002 加速爆體（A10W 把 target/caster/special **三個通道**全設成 DivineRing.mdx，是全地圖 provenance 最強的一筆）。
- **抽取待辦**：有發射器但沒有 fx.w3x 家族＝earthtornado2(14)、lightningtornado(14)、fireblast(4)、tectonicfury(2)、bladestorm-swordeffect(1)（#183 再推導清單）；**零發射器**＝herocloudcyd(10 引用)、purplecoat(9)、grandundeadaura(5)… 這些是純網格美術，粒子管線永遠產不出來，要走模型/掛點路徑，不是同一筆債。
- **永不綁定**：`fx.w3x.locust.auls-a0ib`（0 圖層/0 幾何，只有蜂群版面——#98 零幾何問題）。
- **活頁**：資產主控台 `#assets` → 「特效真實引用普查」，與圖示覆蓋率同一個接縫。純邏輯在 `apps/client/src/ui/assets/vfxCensus.ts`（node 測試 18 項），載入 `useVfxCensus.ts`（側檔 540 kB，展開才抓），畫面 `VfxCensusPanel.tsx`。
- 閘門：`pnpm content:build` 綠、`pnpm --filter @ggd/shared test` 880/880 綠（含 bundle + #128 castability + abilityMirror + vfxParticles）、client typecheck + build 綠、client 3065 測試通過。兩支紅是 main 本來就紅（`bindings.test.ts` 讀 gitignore 掉的 `data/curation/whitelist.json`、`descriptionRescale.test.ts` 冷卻倍率），已 stash 回 main 覆驗。


---

## 2026-07-26 — #212 的前提是錯的：「揍敵客已開放」從來沒發生過（#212 + #214 + M幣稽核缺口）

**這一則要記的是一種「回報方式的病」，跟 2026-07-22 那則同源。**
`#212` 被記成「揍敵客 `godie-efur` 已開放並上線，賈修 `godie-hblm` 待辦」。實際狀態是
**兩隻都沒開**：`4114a25` 只改了 efur 的 4 個技能名字並重建索引，啟用那一步從頭到尾沒做過。

會誤判是因為**內容層完整到足以騙過任何目視檢查**：champion 文件、六支技能、`_index` 註冊、
`bundle.json`、日文名字三支 mp3、名言、EX rawcode、46 段語音包、ROSTER、圖示 —— 全部都在。
但「在 `content/_index.json` 裡」**不 gate 任何東西**：那是整棵樹（114 英雄 / 668 技能）的
hash manifest。真正決定 champ-select 點不點得到的只有兩處：

| 閘 | 版控？ | 影響 |
|---|---|---|
| `apps/platform/internal/curation/starter.go` `starterChampions` | ✅ | 新安裝 seed 的名單；castability sweep / telegraph coverage / game-server whitelist 全部從這裡解析 |
| `data/curation/whitelist.json` | ❌ gitignore | **正在跑的那台機器**唯一會讀的；`ApplyStarterSet` 在它非空時不會再跑 |

只改前者 → 測試全綠、遊戲沒變；只改後者 → 本機能玩、任何 clone/CI 看不到。**兩個都要做**，
而且部署主機那份只能走後台「內容白名單」或 #179 遷移包，**不能**為了自動化而放寬
「starter set 永不隱式套用」的安全契約。

**本次落地**：efur + hblm 一起加進 `starterChampions`（48→50，字母序插入、保留
`// 顯示名 - 稱號 #編號` 註解格式，因為 `testkit/starterRoster.ts` 和 game-server 的
`whitelist.test.ts` 都在正則解析那個區塊）、同步 `firstOpenRoster` 釘死名單、
`castabilitySweep.test.ts` `ROSTER_SIZE` 48→50 且棘輪下限 **287→299（實測，不是預估：
新增 12 格全部噴效果，299/300）**、`store.json` `championPrices` 各補一筆 300
（不在目錄裡的英雄 `lockStateOf` 會判成 free 仍可選，但 `ToggleFavourite`／`UnlockChampion`
兩支 API 都 404 → **永遠設不了「喜愛」**；`godie-zombiex` 今天就卡在這個狀態）。

**#214 的 SOP 因此有 16 列而不是 11 列**，而且附了一支可執行的稽核器
`tools/hero-onboarding/audit_hero.py`（有 FAIL 就 exit 1）。理由很直白：純文字清單會被用
**跟這次一模一樣的方式**讀過去、勾過去；第 12–16 列正是眼睛會滑過去的那幾列。
清單與逐列稽核結果見 `docs/新英雄上架SOP.md`。

**SOP 抓到的第一個真 bug（不是啟用問題，是內容 bug）**：`#40` 把 `87joke`
（飛影「不要小看邪眼的力量！」）暫存在 `godie-efur` 的 `select` 池。efur 沒開放時沒人聽得到；
`#212` 一開放，**點揍敵客桀諾就會講飛影的台詞**。已改掛回飛影本人 `godie-u010`
（`announcerVo.test.ts` 的 `CHARACTER_REROUTES` 與 `audioAssets.test.ts` 的註解同步更新）。
順帶記一條稽核器**做不到**的事：它能查「這段語音有沒有跟名單內另一隻英雄共用」，
但查不了「這句台詞到底是不是這個角色講的」—— 那一列永遠是人工步驟。

**順手掃出的既有債**（`--all-starter` 掃 50 隻，非本次造成）：`godie-ogld` 缺 `passive`
技能文件（連帶沒進 `_index`）、`godie-e00r`／`godie-u00h` 的技能編號尾碼集合不齊、
`godie-u00n.r` 是掃描報告裡唯一的 ❌。

**`godie-u00n.r` 的 ❌ 找到根因了，而且是量測器的問題**：該技能 `castTimeSec = 0.9`，
`abilitySystem.ts` 在 `round(0.9 × 30) = 第 27 tick` 結算，而掃描器施放後只步進
`WINDOW = 26` tick —— **早一格收手**，所以記成「接受了但量不到效果」。
（原註解寫「最長前搖 0.6s = 18 tick」是錯的，全樹最長其實是 0.9s；已更正並在報告裡加警語。）
調 `WINDOW` 會改變**量測定義**，歸 #128／#198 一起處理，本次刻意不動。

**M幣發放稽核缺口（做 #225 時發現）**：後台有兩個 M幣入口，而
**「M幣 發放」那顆按鈕走的那條完全沒有稽核紀錄**：
`MCoinGrantPage → api.grantMCoin → POST /wallet/admin/grant-mcoin → wallet.Service.GrantMCoin`。
它掛在**普通已驗證 subrouter** 上（不是 `/admin`），所以 `AdminOnly` 從來沒跑過
（沒有 banned 檢查、沒有 #126 核准檢查，只有一個 in-service 的 `HasRole("admin")`）；
`amount` 除了「accountId 非空」以外**完全沒驗證**（0、±2^31 都過）；而且**寫不出稽核行**——
`admin` import `wallet`，反向邊是 import cycle，這正是 `meta.go` 當初要複製一份 `roleAdmin`
字面值的原因。另一個入口（玩家列表 → `/admin/accounts/{id}/mcoin` → `admin.AdjustMCoin`）
一直都有寫 `mcoin_adjust`。

處理方式**不是**再開一條路由，而是**把 console 指回那條本來就該用的**，並把舊門**拆掉**：
`api.grantMCoin` 改打 `POST /admin/accounts/{id}/mcoin`（AdminOnly ＋ 伺服器端
`validMCoinDelta`／`MaxMCoinGrant` 上下界 ＋ `mcoin_adjust` 稽核），表單多一個「原因」欄位，
console 端鏡像同一個上限常數；`/wallet/admin/grant-mcoin` 路由、handler、
`wallet.Service.GrantMCoin` 與孤兒 `roleAdmin` 一併刪除。
守衛：`wallet.TestNoAdminMCoinRouteHere`（連 admin 打舊路徑也必須 404）、
`admin.TestMCoinAdjustBounds`（0／超界被拒，且**被拒的調整不留稽核行**，上限值本身可用）、
`approval_console_test.go` 兩道都探（舊門 404、新門對非 admin 403）。
負數保留（扣除是這張表單既有的能力），但界是**對稱**的，且明白寫出「餘額下限是 0，
所以大額負數是歸零不是扣那麼多」。

#### 🔨 2026-07-26 追記：鑄技工坊 P1 落地（#141/#205）

需求原話精神：「編輯器裡選行為模板 → 填參數 → 即時試放 → 一鍵寫回，不再手寫
EffectDef JSON、不再手動同步鏡像雙副本」。設計定稿 `docs/skill-forge-design.md`，
P1 已實作，實作差異寫在該文件 §七（設計稿本身不動）。

- **交付**：`template@1` schema + 註冊（`ability-templates` collection，29 個文件：
  8 enabled / 21 draft）· 純展開器 `content/templates/expand.ts`（sim 與編輯器共用同一顆）·
  `apps/editor/src/forge/` 選卡頁+參數表單+試放+鏡像寫回 · content-api 兩條
  PATCH 行編輯路由 + `POST /rebuild`
- **驗收**：往返 diff=0（`expand.test.ts` ROUNDTRIP 區塊，用模板重做一支現有技能，
  語意 diff 為零）
- **掃描式需求對照**：這條屬於「編輯器（localhost 即管理者可編輯）」那一列的延伸 —
  #96 圖鑑即編輯器 ✅、#102 後台 CRUD ⏸、**#141 鑄技工坊 P1 ✅**（P2/P3 見設計稿 §三）

**三個實作時抓到、原本沒人在追的問題**（都已修，細節見 skill-forge-design.md §七）：

1. **`apps/editor` 從來沒有 DEV gate，但它會被烘進正式版 image。**
   `docker/edge.Dockerfile` 把 `apps/editor/dist` 烘進去、`nginx.conf` 在 `/editor/`
   對外服務，而 `/content-api/` 只存在於 `nginx/dev/content-api.conf`。正式版一直
   對外送出一排指向不存在路由的存檔按鈕。已補 `WRITES_ENABLED = import.meta.env.DEV`
   （比照 admin）。伺服器端一律沒動：guard.ts、兩份 nginx conf、NODE_ENV=production
   拒絕啟動，全部原樣。
2. **行編輯寫入器原本 0 測試。** `spliceEmbeddedSlot` 已存在但沒有任何測試覆蓋，
   而它正是 #78「絕不 JSON round-trip content 文件」規則的實作。已補 7 條測試，
   包含關鍵的「用自己的現值 splice 回去要 byte 完全不變」（JSON round-trip 會把
   Python 匯出的 `30.0` 變成 `30`）。
3. **7 個「表單收得下、遊戲完全忽略」的參數槽。** 用探針掃出來的，見 §七.2。
   現在必須標 `inert`，測試每次重跑探針。

**覆蓋率誠實化**：設計稿 P1 寫「~60% 技能」，實測是 **114/498 = 22.9%**
（只算有 JASS 行為記錄的 258 列則為 44.2%）。不要拿 60% 當已完成。

#### 🧱 2026-07-26 追記：#226 砍 4 個高面數 CC0 角色 → 自製方塊人（體素）
使用者指令：「只有 4 個 CC0 角色 請你砍掉，這四個面數都太高，請你找麥塊角色的方塊人替代」。
**IP 前提（不可協商）**：Minecraft 的模型/皮膚/貼圖是 Mojang/Microsoft 版權。全程**零下載、零抄用、零衍生**——方塊「風格」不受保護，所以幾何全部自製。

- **新增 `tools/voxel-gen/`**（TypeScript，跑既有 tsx，**不新增任何依賴**）：參數表 → 5 個 .glb。
  無 glTF 函式庫：`glbWrite.ts` 是 `tools/model-budget/glb.ts` 讀取端的對稱寫入端；`png.ts` 用 stored DEFLATE
  保證跨 Node/zlib 版本**位元組確定性**（`gen.test.ts` 釘死每檔 sha256，`pnpm voxel:check` 可驗）。
  幾何出處：`ChampionView.ts` 自 #64 起就用同一組比例（8:12:4、32 voxel-px、PX=1.8/32）程序化畫這個方塊人。
- **刪 12 檔 / 9,725,524 B / 46,687 tris**（mage/knight/barbarian/rogue + 各自 -mid/-small）
  → **增 5 檔 / 261,036 B / 840 tris**。淨 **-9.46 MB**。單角色 5,683–6,952 → **168 tris（-97.4%）**。
  出貨總面數 169,542 → **144,827**（`report.test.ts` / `glb.test.ts` 的 ratchet 是**刻意下修**，非放寬）。
  這是 **#81 / #116 資產債**的實質進度：整批 1024² 共用 albedo（5,592,405 B VRAM）一併消失。
- **44 位英雄仍各自可辨識**：4 個 doc id 被 `packages/shared/src/sim/**` 凍結（`mobs.ts:45`、
  `content/skeleton.ts:38,195`），不能拆；所以外觀改在**執行期**——`voxelLook.ts` 由 championId
  以 FNV-1a 決定調色盤 / 體型 / 配件遮罩（純函式、無 Math.random、各端一致），
  `voxelSkin.ts` 寫 bone scale + 複製材質貼上 16² palette。能成立是因為烘焙用**剛性蒙皮**且
  **沒有任何 clip 動 scale**（在位元組層級測試）。順手殺掉只有 2 筆的 `ACCENTS` 表（42 位英雄本來共用同一灰）。
- **不變式全保**：#150 高度（原生量到 1.8u，正規化係數 1.0，`doc.scale` 誠實回到 1.0，
  順便修掉 mage.glb 因法杖撐大 bbox 量到 3.0028u 導致身體被縮小的老問題）、#68/#1 朝向（前=+Z，
  Babylon loader 翻的是 **X 不是 Z**，實測 `knight.glb` 的 `Knight_Cape` 在 z=-0.215 佐證）、
  #49 tint（palette 走貼圖、albedoColor 留白 → 乘算照舊）、#64 hit flash、#133、attach points。
- **#115 LOD：方塊人合法只有一階**。`_lod.json` 的 12 列與檔案**同一 commit** 移除（留著會讓
  low/medium preset 打 404、手機端永遠卡在程序化替身而 high 看起來正常）；`gen_lod.py` 加 LOD floor
  以免下次 `lod:gen` 又把它們加回來。
- **CREDITS.md 雙向誠實**：移除 KayKit Adventurers 條目（不出貨的東西不該掛致謝）、新增自製條目
  + 明確「非 Mojang 衍生」聲明；CC BY 4.0 登入龍與 © 聲明**未動**。
  `arena.castle` 空鎧段落標為 **SUPERSEDED 但保留**（那是 #105 完整設計，且實測未接線）。
- **#217 後續（本次不做）**：第 5 個 `blocky-undead.glb` + `champ.blocky.undead` doc 已就位（調色盤/
  無配件/斷手/前傾/0.62× 蹣跚），但**未**接到小怪——`mobs.ts:45` 是 sim 常數、`arena-rules.json:148`
  是內容值，兩者優先權需先確認，且 #217 正在動那兩個檔。


---

## 2026-07-26 新增需求（owner 本場提出，立即登錄）

| 需求（原話） | 任務 | 狀態 | 備註 / 相依 |
|---|---|---|---|
| 「體素角色 你可以自己產生適合該角色的貼圖，把缺模組的角色都做完，我們等等來驗收」 | **#231** | ✅ 已實作（`feat/voxel-champion-skins`） | 每位英雄一套決定性生成的體素外觀 + 執行期繪製的 64×64 貼圖；後台 🧱 體素外觀對照表 供驗收 |

#### 🔎 #231 實作註記：出的是「配方」不是像素
114 位英雄 → **114 個互異外觀簽章、114 組互異四色配色、0 次鹽值升級**（對真實 doc 樹量測，非估計）。

- **不出貨任何圖檔**。`generateVoxelSkin(champion) → VoxelSkinRecipe`（7 個調色槽 + 臉/髮/服裝分區 + ≤3 個造型配件）是純函式，只用 FNV-1a 對 **championId** 取雜湊當亂數源；`paintVoxelAtlas(recipe) → Uint8ClampedArray(64×64×4)` 也是純函式，client 端用 `RawTexture` 上傳。全部 114 位的**壓縮配方 20,508 B（180 B/英雄，gzip 4,692 B）**，貼圖出貨 **0 B**。
- **為什麼是 `RawTexture` 而不是 `DynamicTexture`**：後者要 `OffscreenCanvas` + 2D context，headless 測試環境沒有（選單的 procedural sprites 就得裝 canvas stub）。改吃 bytes 之後瀏覽器與 vitest 走同一條路，沒有只在測試裡跑的分支會腐爛。
- **三道決定性易讀性修補**（都是有界迴圈，無隨機）：outfitPrimary 以**實測相對亮度**箝在 [0.16, 0.58]（量到 0.174–0.570）——地板是為了活過 #49 染色（狂戰士 ×0.3137，最暗一件仍有 0.0547，測試釘住 ≥0.045）；眼睛與衣服亮度差 ≥0.28；飽和色相落在四個隊伍色 ±22° 內就旋轉 +42°。
- **描述欄故意不進關鍵字乾草堆**：client 端是從 `ChampionDef` 解析英雄，那裡**沒有** `description`（只有 JSON doc 有）。若把它算進去，遊戲內生成的外觀會和對照表／測試生成的**不一樣**——整個任務就垮了。所以輸入面 = 所有消費端看得到的交集（稱號/本名/tags/技能 vfx 元素/w3x 剪影字）。
- **44 位共用替身英雄真的離開了共用網格**：recipe 帶 `preferVoxelBody`，`ChampionView.tryUpgradeToGlb` 直接婉拒那顆 glb。#226 之後刪掉 KayKit glb，這個分支就變成 no-op 而不是行為改變。
- **隊伍色是本設計最高風險處**：體素貼圖蓋掉了原本承擔隊伍辨識的軀幹+雙腿，改成「發光地環 + 新增一條胸前隊伍色帶 `champ-<id>-teamband`」，並把 `-teamband` 加進 `UNTINTED_MESH_SUFFIXES`（否則暗色染色會把色帶壓黑——正是當初排除地環的同一個失敗）。**這件事螢幕截圖判不了，需要一次戰鬥距離的實機試玩**：4 種隊伍色、畫面上 6 個英雄。若讀不出來，退路是把雙腿還原成隊伍色，貼圖只管頭+軀幹+手臂。
- **`voxel-standin` 標籤保留並重新定義**，沒有退役：41 份 doc 帶著它，語意改讀成「這位英雄沒有自己的匯入美術」——依然完全成立（生成外觀是程序產生的，不是匯入的）。退掉標籤等於失去 #226 要替換的那群英雄在內容側唯一的把手。champ-select 的替身標語也順著改成誠實版本（那面舞台仍走 glb，`StorePreview` 沒有 procedural 路徑）。

#### 🧱 2026-07-26 #229：體素角色生成器網頁「鑄形工坊」（Project Voxel Forge）
Owner 指令：另開分支做 體素角色生成器網頁，整合進後台；**必須與 #226 共用同一個產生器**（不得 fork 第二個長得像的）。

**做法（分支 `feat/voxel-character-studio`）**
- 產生器核心搬進 `packages/shared/src/voxel/`（boxman 部件/關節表、clips 七段動畫、archetypes 五個原型），數值**逐字取自 #226 的 `tools/voxel-gen/`**，不是重新推導。純模組：無 Babylon / 無 node Buffer / 無 `Math.random`／`Date`，才可能同時被 CLI、瀏覽器 bundle 與 vitest import。
- 新增 #226 尚未寫的參數層 `look.ts`：`VoxelLook`（palette / 部件遮罩 / **每關節縮放＝「體型」** / 關節位移 / poseBias / clipRate / teamTint / collisionRadius）+ `lookForChampion(id, archetype)`（FNV-1a 決定性種子，golden vector 釘住 5 個出貨 model doc）。體型走**關節縮放**而非改方塊尺寸，因為 #226 的骨骼是剛性綁定、runtime 就是寫關節 scale——改方塊尺寸等於做出另一個 mesh，那才是 fork。
- `figure.ts` 的 `buildFigure()` 是**唯一**幾何決定點；#150 統一身高在這裡強制（實測身高 → `docScale = 1.8 / height`，腳踩 y=0），所以拉滑桿**不可能**弄壞統一身高（proportion sweep 測試逐一驗證）。
- `doc.ts` 的 `toModelDoc()` 是**唯一**文件產生點：studio 存的與 bake 讀的是同一函式，兩邊不可能對不上。glbPath 由 id 推導成 `assets/models/voxel/<id>.glb`，**刻意避開** `assets/models/imported/` 與 `assets/blizzard-local/models/`，所以 `glbYawOffset` 回 0（#68/#1）。
- schema 僅**加法**：`model@1` 多一個 optional `voxel` 區塊，`.strict()` 與必填 `glbPath` 都不動，121 份既有 models doc 原封不動仍合法。

**兩段式存檔（誠實版）**：後台存的是**參數**（走既有 contentApi gate，undo-first、dry-run 驗證、contentVersion 回報）；`.glb` 由離線 `pnpm voxel:gen` 決定性烘焙。因此**這頁一個 byte 的二進位都不寫**——content-api 的 `IMAGE_EXT`（.png/.webp/.jpg/.jpeg）不必放寬、沒有上傳路由、#226 的 sha256 釘位也保得住。

**安全姿態淨變化 = 0 條新寫入路徑**：`contentApi.ts` 匯出清單未動（contentGate 測試逐一比對）、`loopbackOnly` 未動、nginx 未動、prod build 仍零 content-save。**新增**一條 tripwire：prod bundle 不得出現任何 Babylon 標記（`ArcRotateCamera`/`HemisphericLight`/`BABYLON`）——舊 gate 只 grep `/content-api` 與中文標籤，抓不到新依賴外洩。

**待與 #226 對帳（其分支 `feat/blocky-voxel-characters` 仍在跑）**
1. `packages/shared/src/voxel/` 是核心的家；merge 時 `tools/voxel-gen/{boxman,clips,archetypes}.ts` 應變成 `export * from "@ggd/shared/voxel/…"`（搬家＋re-export，不是重寫）。本次已同步過一次 #226 的 clips 修訂（idle 去掉 hips bob、attack hips 修正）——merge 時需再對一次。
2. `lookForChampion` 必須兩邊同一份，否則後台預覽會對玩家說謊；golden vector 已備好。
3. `gen.ts` 要**列舉所有帶 `voxel` 區塊的 model doc**，不能寫死五個，否則工坊產出的角色永遠不會被烘焙。
4. 44 隻英雄 modelKey 改指、`modelTexture/modelBbox/modelIdleGrounding` fixture 重生 → 屬 #226 的活；工坊的「改指英雄」動作刻意留給後續（未烘焙就改指會讓那三支測試變紅）。
5. `ChampionView.ts` 的程序化分支改成 `buildFigure`/`sampleClip` 的薄轉接層，是 payoff 但動到 client render path，屬 #226。在那之前工坊預覽的是**bake 會產出什麼**，正確但還不是遊戲內同一條 code path。

**其他誠實聲明**：`attachPoints` / `teamTintMaterials` 目前**有人寫、沒人讀**（`overheadAnchors.ts` 用寫死高度）；工坊是它們第一個真正的產生者，讓它們成為消費者是新的 client render 工作，不在本次範圍。IP：全部幾何是自寫數值產生的軸對齊方塊，`@babylonjs/loaders` **不是**本 app 的依賴、頁面上沒有任何 file input／FileReader——結構上就無法吃進第三方 skin。

#### 🧊 2026-07-26 追記：#237 「邀請碼用完沒被標記 redeemed」— 是**測試**在說謊，產品從頭到尾是好的

回報的紅測試 `TestInviteAndApprovalGatesCompose` 屬實，但結論相反。**先做重現、不讀 code**：
以 `cmd/platform` 真正的 production binary（同一 composition root、真 jsonstore、真 redis，
`GGD_REQUIRE_INVITE=1 GGD_REQUIRE_APPROVAL=1 GGD_DEPLOY_TIER=family`，隔離 DATA_DIR + 隔離 redis:16399，
事後全部關閉、未動 docker/ 與 dev redis）跑完整註冊流程：

1. owner 註冊 → `approved` / `roles:["admin"]`（首帳號豁免，反死鎖）
2. admin 鑄 1 組 `GGD-7YKH-6KGM`
3. cousin 用該碼註冊 → 201，`status: pending`，`accessToken: ""`
4. intruder 用**同一組碼** → **403 `invite_used`**

**同一組碼無法註冊第二次。** 且 burn 是寫進 DATA_DIR/invites 的耐久 JSON（`status=redeemed`,
`redeemedBy=01KYDEP5…`, `redeemedUsername=cousin`），不是只在 Redis，重啟也在。#174 的閘門完好無損。

**真正的根因是斷言的「索引」**：三個紅測試都拿 `GET /api/v1/admin/invites` 的 `invites[0]` 當作
「我剛剛鑄的那組碼」。自 #203（222ddb9, 2026-07-25）起，**每次註冊都會額外鑄出該帳號自己的推薦碼**，
而 `List` 是新到舊排序 → `invites[0]` 變成 cousin 自己那組**理應 active、理應沒有 redeemedBy** 的推薦碼；
admin 那組其實安穩地待在 `invites[1]`，狀態正是 `redeemed`。
`git show 222ddb9 --name-only` 確認：該 commit **從未碰過** `invite_gate_test.go` / `approval_compose_test.go`
——一個 feature 改了既有 endpoint 的**回應形狀**，而讀那個 endpoint 的舊測試沒有跟著更新。

**被第一個失敗遮住的另外兩個紅**（`go test ./internal/auth/` 其實是 3 紅不是 1 紅）：
- `TestInviteHappyPath:60` `require.Len(rows, 1)` → 實得 3。這是 `require`，**直接中止**，
  後面 4 條斷言（redeemedUsername / redeemedBy / note / redeemedAt）**從來沒有執行過**。
- `TestConcurrentRegistrationsShareOneCode:194-195` 同一個 `invites[0]` 索引缺陷。
  但它真正的斷言 `assert.Equal(t, 1, created)`（8 個併發只准生 1 個帳號）**是綠的**，
  `Service.Redeem` 的 keyed-mutex burn-before-create 名副其實。

**修法：不放寬任何斷言**（owner 規則）。改成**依 code 取列**而非依位置：
新增 `listInvites` / `codeRow` / `adminMinted`（`invite_gate_test.go`）。這是**加強**不是放寬——
`codeRow` 找不到該碼會 `require.FailNow` 並印出整份清單，且日後再多鑄幾種推薦碼也不會再誤判。
`TestInviteHappyPath` 的數量斷言改成 `adminMinted(rows)` 恰 1（人為鑄的算 1 組），
並**補上** `len(rows)==3` 把整份 feed 交代乾淨（1 admin + 每帳號 1 推薦碼），避免用 filter 藏東西。
`approval_compose_test.go` 另**補一條 #237 真正在擔心的斷言**：同碼再註冊必須 403 `invite_used`
——「花掉」是被強制執行的，不是 console 畫出來的。

**mutation 驗證**（確認新斷言會咬人、不是空過）：把 `codeRow` 的碼換成不存在的 → 如實爆
「code missing from the console listing」；把重用預期改成 201 → 如實爆 `expected 201, actual 403`。

**#126 審核閘：成立，未被削弱。** cousin 註冊即 `pending` 且不發 session，登入回 **403 `account_pending`**；
owner 核准後才 200 拿到 token。owner 首帳號豁免正常。
**#203 推薦鏈：沒有壞。** 前提（「redeemedBy 從沒寫入」）本身是假的。實測 friend 用 cousin 的個人推薦碼註冊後，
cousin **當場自動核准**（再登入即 200 approved），server log `referral chain auto-approved a pending inviter`。
（機制讀的是鑄碼時寫的 `referrerId`，本來就不依賴 `redeemedBy`。）

**嚴重性重估**：**無線上影響、無資安暴露、無需對玩家揭露**。實際損害是「一個紅測試從 v0.4.1（48f487c）
說謊了約兩個版本」，把 CI 的真訊號蓋掉——`TestInviteHappyPath` 那 4 條**未曾執行**的斷言，
就是這段期間**完全沒有被保護到**的東西。

**閘門**：`internal/auth` + `internal/invite` 全綠。`go test ./...` 另有 **2 個既有紅**
（`combatenv/TestCombatEnvReplacePublishesInvalidation`、`opsenv/TestWalletPlayRateAgreesWithTheDerivedLength`），
已用 `git stash` 在 base commit `c8a069d` 上覆驗**同樣紅**，與本次改動無關。

---

## 2026-07-26 — #189 內容持久層：store 有了，但**沒有任何東西寫進去**

### 問題（查證，非推測）

前一趟（`18da320`）落地的是 backend-only 的耐久 overlay。這一趟開始前實測三件事：

1. **正式 admin bundle 裡沒有 內容管理 這一頁。** `apps/admin/src/ui/App.tsx` 用
   `if (!import.meta.env.DEV) return;` 擋在 `import("./ContentPage")` 上方 —— vite 代換成字面 `false`、
   rollup 直接摺掉，chunk 根本不會產出（`contentGate.test.ts` 用真的 `vite build` + grep dist 釘住）。
   `docker/edge.Dockerfile:64` 就是用 `pnpm --filter "@ggd/admin" build`，所以 ggd.adms.ai 上那頁不存在。
2. **就算存在，它唯一的寫入端指向沒有部署的服務。** `apps/admin/src/contentApi.ts` 全部 PUT 到
   `/content-api/{collection}/{id}`，那是 dev-only 的 loopback Fastify（`compose.yaml` profiles: dev），
   而且它的 nginx route **刻意**沒有進 edge image。這是對的，loopbackOnly 不動。
3. 於是 `data/content-overlay/` 在這台機器上**從來沒有被建立過**（`ls data/` 沒有這個目錄）。

換句話說：#189 缺的不是耐久性，是**生產者**。

### 這一趟做的

- **生產者**：`apps/admin/src/ui/ContentOverlayPage.tsx`（**靜態 import**，正式 build 一定含它）＋
  `apps/admin/src/contentOverlay.ts`（純邏輯）＋ `api.ts` 六個 wrapper。全部走平台
  `/api/v1/content-overlay/…`（admin JWT + AdminOnly + 稽核），**完全不碰 `/content-api`**。
  它是「第二個寫入端」而不是「放寬 dev gate」：dev 那頁靠**不存在**保證安全，這頁靠**授權**保證安全。
- **優先權 + baseHash**：每筆 entry 記下編輯當下出貨 doc 的 hash，讀狀態時和現在的
  `content/<collection>/_index.json` 比。規則與狀態表寫在 `docs/design/content-sync.md` §6.5。
  **Go 不自己算 hash** —— 讀 TS content build 已經寫好的 index，所以跨語言 hashDoc 的陷阱不存在。
- **損毀降級**：garbage / 半寫的 `overlay.json` → 讀取降級成空覆蓋（純出貨內容）、`degraded=true`、
  原始 bytes 以 base64 完整隔離到 `overlay.corrupt-<hash>`（**不刪**），平台與 game-server 照常開機。
  之前這條路徑「理論上會動」但**完全沒有測試**，而且是 500 而不是降級。
- **稽核改成 fail-closed**：audit line 移進 `commit()` 並在耐久寫入**之前**寫；寫不進 audit 就拒絕改內容。
  這是刻意的行為改變（原本是 handler 端 best-effort，一個新 route 忘了呼叫就沒有紀錄）。
- **可見性**：admin-only `GET /content-overlay/status`（每筆的 state / baseHash→shippedHash / 何時 / 誰）、
  `GET /content-overlay/log`（`data/content-overlay-log/` 第一次有讀取端）、
  `GET /content-overlay/shipped/{c}/{id}`（repo 現在的版本）。**公開的 head/bundle 一律不帶操作者 id**。
- 順手抓到一個**新洩漏**：新增的 `bases` 欄位把 `updatedBy` 早先修掉的 account ULID 又帶回公開 bundle。
  既有的 `TestPublicEndpointsDoNotLeakUpdatedBy` 當場紅 → 加了 `Overlay.PublicBundle()` 一併剝掉。

### 生存性（驗收條件本身）

`DATA_DIR/content-overlay/overlay.json` → 容器內 `/data` → `compose.yaml:69-72` 的 `../data:/data` →
主機 `<repo>/data`。image 不含它（`docker compose build && up -d` 換掉 image 與 container，不碰 bind mount），
git 也不含它（`.gitignore:34-36` 吃掉 `/data/**`，所以 `git pull` 也刪不掉）。
`compose.family.yaml` 對 `platform` 沒有 `volumes:` 覆寫，base mount 原樣生效（**特地確認過**，
一個 volumes 覆寫會無聲換掉整份清單）。測試 `content-overlay-durable` 直接斷言這個路徑。

### 還沒做，且**不在**這次 scope（apps/client / apps/game-server）

1. `apps/client/src/content/bootContent.ts` 沒有包 `OverlayContentSource`。所以後台改一份 doc，
   **sim 會變、大廳／選角／圖鑑的畫面不會變**，而且 client 的 `cv_`（出貨）與 game-server 的 `cv_`（合併）
   會不一致。這是 owner 最容易踩到的落差，必須先講。
2. `apps/game-server/src/config/contentBus.ts` 的 `CONTENT_KINDS` 只有
   `curation / combat-env / server-ops`，不含 `content-overlay`（平台在
   `redisx/contentbus.go:64` 有發），所以覆蓋寫入的失效訊息會被每個 shard 當成 unknown-kind 丟掉。
   v0.5.12 修好的是那三個**營運** doc 的傳播；內容 doc 依設計是 boot-only，
   **所以內容改動目前仍需重啟 game container**。
3. 覆蓋 bundle 是**公開未驗證**的第二個內容表面。目前它只裝操作者編過的 doc，
   但 #127 的分級閘讀的是 `content/` 而不是 overlay —— 之後若有版權物走這條路要重新想。

閘門：`apps/platform` 全套 —— 新的 `contentoverlay` 15 例全綠；紅的 5 例
（`internal/auth` 3 例＝#237 邀請碼未標記 redeemed、`internal/combatenv` 1、`internal/opsenv` 1）
在 main 工作樹上覆驗**完全相同**，屬既有。`@ggd/admin` typecheck clean、31 檔 342 綠（新增 11 例）。

#### 🚦 2026-07-26 #242：後台 Quick Approval（一鍵送出待 owner 確認的事）
Owner 指令逐字：「48+3 (賈修, 揍敵客, 喪標麥可) 開放如果你真的需要我允許才能開放，請你做成後台快速一鍵確認的按鈕，讓我按一下就全部通過。這個按鈕可以放在後台新的一頁，叫做 Quick Approval, 把所有需要審查確認的項目條列在這一頁，打勾/取消 後，一鍵送出確認」

**做了什麼**：`apps/admin/src/ui/QuickApprovalPage.tsx` + 純邏輯 `apps/admin/src/quickApproval.ts`。四種可勾選的列 + 兩種唯讀列，**全部在開頁當下即時算出來**（starter bundle ⨯ 這台伺服器的白名單 ⨯ 待審帳號佇列 ⨯ 對 `/editor/` 的 HEAD 探測），檔案裡沒有任何一個寫死的英雄 id 或血量數字——因為家用主機 ggd.adms.ai 的白名單跟本機不同，寫死就等於對 owner 說謊。

**必須誠實講清楚的三件事**：

1. **不是「所有需要確認的項目」，是「所有可以從真實狀態列舉出來的項目」。** 版權閘（#239）沒有列進來：它是一個**程式決定**，後台沒有任何寫入路徑可以改它，畫一個打勾框等於讓 owner「核准」一件按下去不會發生的事。`/editor/`（#241）同理**唯讀**列出——它烤在 edge 映像裡由 nginx 當靜態檔送，改它要動 deploy。這兩件事仍然需要 owner 決定，只是**不在這一頁按**。
2. **喪標麥可不是「要不要開放」，他已經開放中。** 他在 `data/curation/whitelist.json` 的 champions 裡、卻**不在** starter.go 的 50 人名單裡（唯一一個），而且是唯一的「半開放英雄」（只有 `.ex`，q/w/e/r 都不在）。所以他是**紅色警告列、不可勾選**，能做的只有「停用」（獨立二次確認，刻意不在一鍵送出的路徑上）或等 #236 把技能補滿。數值體檢也不是寫死他的名字：頁面拿候選英雄跟**已開放名單的中位數**比，血量 <50%、護甲/魔抗 0（別人不是 0）、移速 <70% 就紅。今天 `content/champions/godie-zombiex.json` 的實測值是 base 100 HP / growth 100 / armor 0 / mr 0 / ms 3.0，對照同場中位數約 480 HP / 6 / 28 / 5.9 —— 四條全中。
3. **這一頁永遠不會替你關掉東西。** 送出只走 `POST /curation/whitelist/bulk`，`disable` 恆為 `[]`（union，server 端 `Service.Bulk` merge），帳號走 `POST /admin/accounts/{id}/approve`。**刻意不 import** `saveWhitelist`/`diffDoc`/`putWhitelist`——那套 draft diff 會依「這一頁知道的東西」算出 disable 清單，一鍵就會刪掉 owner 白名單裡 21 個不在任何 starter 清單中的項目（20 個道具 + 喪標麥可）。測試逐檔 grep 這三個名字。

**其他刻意的取捨**：沒有「全選」預設、沒有任何一列預先打勾（預先打勾＝橡皮圖章，比沒有這一頁更危險）；數值讀不到時**體檢視為未通過**（fail closed），而不是當成沒問題；勾選英雄一定連同 5 個技能格一起 union（只開英雄會做出新的半開放英雄）。新增 Go 程式碼：**0 行**——全部走既有 AdminOnly 路由與既有 audit 行（`curation.bulk` / `approval_approved`）。

**保護這一頁存在的測試**：`quickApprovalBundle.test.ts` 跑真的 `vite build --mode production` 並斷言 bundle **含有**導覽標籤與「一鍵送出確認」——正好是 `contentGate.test.ts` 對 內容管理 斷言的反面。因為這一頁若掉進那個 `import.meta.env.DEV` dead-fold，就只剩本機能用，而本機正是 owner 唯一不需要它的地方。

---

## #244 喪標麥可・黑泥吞噬 — 拆文件 + 數值重定 + 擊殺永久疊加 + 體素門檻 (2026-07-26)

Owner 讀過提案後說「你的提案我很喜歡，就照你說的」，四層照序做完，第一層是其他三層的硬前提。

### 第一層 · 拆文件（小怪的數值不再吃英雄卡）

`mobRulesFromConfig()` 以前明講 champion doc 是「one source of truth for the hero sheet and its
mob avatar」，小怪 hp = `baseStats.maxHealth + growth.maxHealth*(level-1)`。所以動英雄血量＝動肉鴿難度，
**今天就發生過**：growth 50→100 把第 3 場殭屍從 200 抬到 300，沒有人要求。

改成三層優先權（`packages/shared/src/sim/mobs.ts`）：
1. **小怪卡**：`mobWaves.mob.baseHp / hpPerLevel / baseRegen / regenPerLevel`（新欄位，出貨值 100 / 100 / 1 / 0.2）
2. champion doc（**legacy fallback**，讓 #244 之前的 arena doc 與所有傳裸 config 的單元測試逐位元不變）
3. 扁平 `mob.maxHp`（無內容環境）

算式完全相同（同一個 `Math.round`、同一條 `base + per*(level-1)`），所以 owner 今天訂的曲線
**逐位元存活**：第 3 場 300 / 第 4 場 400 / 第 5 場 500 / 第 6 場 600，regen 1 + 0.2*(lv-1)。
`zMobWavesConfig.mob` 兩層都是 `.strict()`，所以 schema／`DEFAULT_MOB_WAVES_CONFIG`／出貨 doc
**同一個 commit** 一起改，否則 doc 開機直接載不進來（硬失敗，不是降級）。

`mobs.level.test.ts` 改成讀**新的來源**（arena-rules 的 mobWaves.mob），字面值 300/400/600 一個都沒動；
另加一條守門測試：把英雄卡設成 #244 後的 380/45 之後，`mobRulesFromConfig(CFG, DT, 3).maxHp` 仍是 300。
**這條測試就是「英雄卡再也動不了肉鴿難度」的證據。**

### 第二層 · 英雄數值

`baseStats.maxHealth` 100 → **380**、`growth.maxHealth` 100 → **45**（healthRegen 1 / 0.2 不動）。
380 = 「全場最脆，但不會被一套秒」（Saber 580、揍敵客 420、魯夫 480）。成長刻意壓回接近一般的 45：
爆發力不能來自看不見的成長曲線，要來自第三層——玩家看得到、也賺得到。理由同時寫進 champion doc 的
description（JSON 沒有註解）、mobs.ts 的拆檔註解，以及上面那條守門測試。

### 第三層 · 天生技改寫（REPLACE，不是並存）

`godie-zombiex.passive` 從 `innateKind: "active"`（100-00 黑聖杯・四拍令咒，40s CD，護甲/魔抗 +35 撐 4 秒）
改成純被動 **100-00 黑泥吞噬**：擊殺部隊 +8、擊殺敵方英雄 +40 最大生命，整場永久。

**為什麼不能「並存」**：`syncAbilityPassives`（abilityPassives.ts:140）有一行
`if (isActiveInnate(def)) continue;` —— active innate 就算同時掛 `passive.ranks[0].hooks`，
zod 不擋、載得進來、hook 卻**永遠不會被掛上**。那行守衛的註解寫得很清楚，存在的理由正是
「不讓誤寫的 doc 把 40 秒大招悄悄變成免費靈氣」。要並存就得為一隻英雄在引擎守衛上鑿洞。
代價講明白：他從此**沒有任何保命鍵**，前三場（380 血、第 1–2 場小怪還沒出、疊層是 0）是全遊戲最脆。
防禦層的正確歸宿是 #236 的五格技能重寫。

三個閘門必須彼此同意，doc 因此是 slot PASSIVE + innateKind "passive" + `effects: []` + `passive` 區塊。
#128 棘輪安全：`isPassiveOnly` 記為 PASSIVE＝WORKING，而且 godie-zombiex 不在 50 隻追蹤名單內。

### 引擎三件事（都是通用能力，沒有一件是為單一英雄寫的）

1. **`HookDef.victim`**（`"champion" | "mob" | "any"`，缺省＝any）。一個 `onKill` 沒辦法表達
   「部隊 +8、英雄 +40」。選它而不是發明 `onMobKill`：一個事件、一種 doc 形狀、一處排序推理。
2. **小怪擊殺以前根本不觸發 `onKill`** —— 這是**活著的 bug**，不只是 #244 的擋路石。
   `fireHooks(…, "onKill", …)` 只在 `DeathSystem.ts:58` 的 champion 分支被呼叫；小怪的死亡結算
   在 `MobSystem.ts` 另一條掃描裡（金錢／XP／每 30 殺升級／`mobSlain`），從來沒呼叫過。
   所以孫悟空 09-00 賽亞人的血脈的「每殺死一個部隊增加2點生命」自 #215 以來**一次都沒生效過**。
   修在 grantLevels 之後、`mobSlain` 之前，順序固定且可決定。
   **行為變更要講**：悟空（godie-o00x / godie-ogrh，敘述本來就寫「部隊」＝修 bug）與呂布
   （godie-h01u，每殺 +10 攻擊力 10 秒＝真的變強）。依提案的 (B) 方案，呂布的 hook 補上
   `victim: "champion"` 維持現狀，悟空維持 `any` 讓他的敘述終於成真。
3. **`applyBuff.stackKey / maxStacks / stackVisual`**。#224 的形狀 `buff:${origin}#${tick}` 有兩個缺陷：
   180 次擊殺＝180 個活的 ModifierSource（每個 dirty tick 被 `recomputeStats`、每個 hook 事件被
   `fireHooks` 重掃），而且**同一 tick 被一發 AoE 殺掉的兩隻小怪撞同一個 id，只有一份 +8 落地**
   ——安靜、可決定的少算。改成固定 id `buff:stack:<key>` + `stacks` 計數；
   `statPipeline.ts` 本來就 `flat += m.value * (src.stacks ?? 1)`，算術完全一樣、成長 O(1)、
   同 tick 的漏算連悟空一起修好。上限 200（部隊）/ 40（英雄）：正常節奏最多疊到 180，
   **上限在意圖曲線上完全不會生效**，但把 100 kills/round 的極端 farm 從第 11 場 11,315 HP 壓回 5,715。

### 第四層 · 疊層怎麼上線 + 體素門檻

**兩個 bit，零個新欄位。** `EntityState.flags` 已經是 uint16 且只用到 1..256，加
`MUD_SWELL: 512` / `MUD_BOSS: 1024` 與共用常數 `GROWTH_TIER_STACKS = [20, 50]`。
沒用 `ChampionComp.statStacks`（那是 #82 的屬性強化計數器，被 statPath / shop / undo 三處讀寫，
寫進去會用小怪擊殺誤觸 #104 的傳說capstone、被任何購買清零、被 undo 回滾）；
也沒用「從 maxHp 差值反推」（道具／增幅／capstone／護盾／combatEnv 都會動 maxHealth，反推會說謊）。
伺服器端 `visualStackCount()` 只加總 content 標記 `stackVisual` 的 source ——
**champion-agnostic**：未來任何「看得見的成長」機制不用碰 netcode。

體素側：喪標麥可**不是**程序體素身體（#217 給了他自己的 guardian_skeleton.glb，
`preferVoxelBody === false`），所以重上色走的是 #49 的 tint 槽而不是 64×64 atlas painter。
黑泥乘法是**折進 #49 的 tint 再套用**，不是第二個 painter —— `applyModelTint.paint()` 永遠從
材質記住的**原始**顏色重算，所以換階不會疊加、退回 tier 0 會精確還原。
可讀性下限是必要的、不是裝飾：#231 把 outfitPrimary 亮度夾在 [0.16, 0.58] 並釘住「最暗 tint
（狂戰士 ×0.3137）之後 ≥0.045」；tier 2 的 ×0.60 疊上去是 ≈0.030，**低於下限**，所以
`mudTintFor()` 對合成後的乘法做等比夾擠。體型只放大 `bodyRoot` / `glbRoot` / 血影，
**團隊光環永遠不放大**（#231 自己把團隊色列為最高風險面）；glb 放大後**必須重跑落地位移**
（`position.y = -min.y` 是在舊縮放框裡量的，1.25× 不重量會沉進地板）——這是最容易錯的一件事。

### 超車曲線（用出貨的等級表真的算出來的，不是估的）

`rounds.*.grantLevels` 累積 → 第 1 場 L3、第 11 場 L50（不打小怪），`xpToNext(l)=100+80*(l-1)`，
`XP_REWARDS.mob=40`、`killsPerLevel=30`。假設第 3 場起每場 20 隻，參照組 Saber（580/54）同樣打。

| 場 | 麥可 L | 疊層 | 疊加 HP | 麥可 HP | Saber L | Saber HP | Δ |
|---|---|---|---|---|---|---|---|
| 1 | 3 | 0 | +0 | 470 | 3 | 688 | −218 |
| 2 | 4 | 0 | +0 | 515 | 4 | 742 | −227 |
| 3 | 7 | 20 | +160 | 810 | 7 | 904 | −94 |
| **4** | **11** | **40** | **+320** | **1150** | **11** | **1120** | **+30** ← 超車 |
| 5 | 15 | 60 | +480 | 1490 | 15 | 1336 | +154 |
| 6 | 21 | 80 | +640 | 1920 | 21 | 1660 | +260 |
| 7 | 26 | 100 | +800 | 2305 | 26 | 1930 | +375 |
| 8 | 30 | 120 | +960 | 2645 | 30 | 2146 | +499 |
| 9 | 35 | 140 | +1120 | 3030 | 35 | 2416 | +614 |
| 10 | 46 | 160 | +1280 | 3685 | 46 | 3010 | +675 |
| 11 | 57 | 180 | +1440 | 4340 | 57 | 3604 | +736 |

**誠實回報：目標是「大約第 5 場超車」，實際是第 4 場——早一場，往玩家有利的方向偏。**
所以剩下 7 場享受這個幻想而不是 6 場，設計超額達成自己的意圖，**+8 / +40 不調整**。
敏感度：若 Saber 完全不打小怪，超車仍在第 4 場（+138），所以結果不是「共同 farm」假設的產物。
免費的好消息：20 / 50 兩個門檻剛好落在第 3 場結束（超車前一場的「有事發生」）與第 5 場中段
（超車後的 boss 揭示），這是從出貨的表算出來的，不是挑數字湊的。

### 已知風險（最高的那條）

farm 速率是唯一沒被設計綁住的變數：mobWaves 一場約發 90 波、單區可生成約 855 隻，
20 隻/場是**地板不是天花板**。100 隻/場的同一套算術：第 3 場 1,720（已超 Saber 的 1,228）、
第 11 場 11,315 vs 5,062。`maxStacks` 200 / 40 就是為這條擋的，**不要不設上限出貨**。
另外 ratio-preserving maxHealth（statPipeline.ts:70-86）代表 40% 血時擊殺只會補到 40% 的 +8 當前血量；
那是道具與升級一路以來的法則，不為一隻英雄改。真要「擊殺像回血」，是同一個 hook 加 `heal`，
是內容改動不是 pipeline 改動。


---

## #240 — 四支 KayKit 角色退場之後：殘留引用清乾淨 + 永久防回歸守衛

**先確定範圍，不是猜名字。** 從 git（`7db24b5f` merge / `0a616444`）確認退場的是
**KayKit Character Pack: Adventurers 1.0** 的四支角色 `mage` / `knight` /
`barbarian` / `rogue`，連同 #115 產生的 `-mid` / `-small` 兩層 LOD，共 **12 檔**。
**同作者但仍在樹上、絕對不能一起掃掉的有四個 pack**：Dungeon Remastered
（`props/*.glb`）、**Character Pack: Skeletons**（`props/guardian_skeleton.glb`——
它同時是 `arena.skeleton` 守護塔**和**聖杯黑泥醬-喪標麥可 `champ.godie-zombiex`，
#217）、Medieval Hexagon Pack（`hex/*.glb`）、Halloween Bits
（`guardian_treant_trunk.glb`）。所以守衛比對的是**資產路徑**與那個 pack 的名字，
**不是「KayKit」這個字**，而且「仍在出貨的四個 pack」自己有一條斷言釘著。

**實際找到的殘留（內容文件與 manifest/bundle/_lod 早就乾淨了）：**

1. **出貨的版權頁在掛一個我們沒出貨的 pack** — `creditsData.ts` 的
   「角色 / 場景 / 地形模型」條目第一個字就是 Character Pack: Adventurers。
   掛一個不出貨的東西跟漏掛一個該掛的東西一樣不誠實。改成實際仍在樹上的四個 pack，
   並補一條「自製體素角色」條目。
2. **資產預算頁的 playbook 在拿刪掉的模型當量測** —
   `model-budget.html` `renderPlaybook()` 找 `champions/knight.glb`，找不到就
   **靜靜印出寫死的 15 / 41 / 180 / 168**，看起來像量測值。改成從報告裡挑現存
   draw call 最高的那支；clip-trim 那一格改用仍在出貨、同樣被修剪過的
   `guardian_skeleton.glb`（95 → 15 clip）。
3. **`emit_report.ts` 的 RECORDED.animCpu 標著「現況」** — 那組 2.19 ms 是真的量測，
   但量的是已經退場的模型。數字留著（它就是退場的證據，而且 c_chan 是從它推的），
   標籤改成「#226 退場前」。
4. 兩個測試 fixture 路徑、`gen_lod.py` 的用法範例、`nginx/brotli/README.md` 的
   示範 URL。

**守衛：`packages/shared/src/content/retiredCharacterModels.test.ts`（7 條）。**
檔案系統、內容文件/manifest/bundle/`_lod.json`、出貨原始碼、出貨版權頁四個面向各一條，
外加「仍在出貨的四個 pack 不可被誤殺」與**正規表達式自我測試**（六個該中、五個不該中），
所以守衛壞掉不會安靜地過。失敗訊息直接寫 owner 指示原文與面數/骨架預算，讓未來的人
看懂而不是把測試刪掉；如果 owner 真的改變主意，訊息要求「跟 re-add 同一個 commit 刪掉它」。
兩個方向都實測過：放回一個 `.glb` 會紅、放回一行路徑引用也會紅。

**沒做而且要說清楚的一件事**：`content/assets/model-budget/report.json` 是生成物，
它的 `screens[]` 還留著 `champions/knight.glb` × 12。用 `budget:report` 重生了，
但這台機器沒有 gitignore 的 `data/blizzard-overlay`，所以重生的報告**少了 40 筆
DEV-ONLY 的 blizzard-local 列**（模型數 204 → 164）。取捨是：留著一筆宣稱「已刪除的
6,952 面模型在五個戰鬥畫面各出現 12 次」的假資料、還要為它在守衛上挖一個豁免——比
少 40 筆 owner 在自己機器上一行指令就能補回來的 DEV-ONLY 資料更糟。**owner 請在有
overlay 的機器上重跑 `pnpm --filter @ggd/model-budget budget:report`。**

---

## #241 — `/editor/` 烤進正式映像且完全沒有驗證

**先驗證宣稱，再修。** 是真的：`docker/edge.Dockerfile` 無條件
`COPY --from=build /repo/apps/editor/dist/ /usr/share/nginx/html/editor/`，
`nginx/nginx.conf` 有 `location /editor/`（純靜態、沒有任何 auth include，連 `/admin/`
那個 `/etc/nginx/ggd-admin/*.conf` 的鉤子都沒有），而 `docker/compose.family.yaml`
就是用這個 Dockerfile 建 edge。所以家用部署上任何人打那個網址就會拿到內容編輯器。

**但曝露的邊界比第一眼小，這點必須講準：**

- **不是寫入洞。** `apps/editor/src/api/client.ts` 的 `WRITES_ENABLED` 在
  `vite build` 會常數摺疊成 `false`，而且 `/content-api/` 本來就不在正式 nginx 裡。
- **AI proxy 需要 token。** `/api/v1/ai/*` 走 `auth.Middleware`，編輯器的 token 讀自
  `localStorage["ggd.editor.token"]`，匿名訪客沒有 → 401。
- **所以它 100% 不能動作、100% 看得見。** 洩漏的是內容模型、collection 名稱、
  schema 推出來的整套欄位、鑄技工坊模板、AI 面板的存在，以及一整包沒必要的 JS。

**修法是「不存在」，不是「要登入」，更不是環境閘。**
(a) 環境閘是 owner 在 2026-07-26 明確退役的方向（#239），而且這台 edge 在 Caddy 後面，
`$remote_addr` 是 proxy 不是訪客，寫在邊緣本來就錯；
(b) 在 edge 做 session 檢查要對 Go platform 發 `auth_request` 子請求——為一棵靜態樹
新增一套機制、一個新的失效模式、以及第二個決定「誰是 admin」的地方。`/admin/` 的
loopback-or-session 規則一個字都沒動；
(c) 一個什麼都不能做的 console 加上登入是儀式不是安全。

兩半都要：路由搬到 `nginx/dev/editor.conf`（沿用 `/content-api/` 已經在用的
`/etc/nginx/ggd-dev/` 機制），檔案改成 build arg `GGD_INCLUDE_EDITOR`（預設 `0`）。
**真的建了兩個映像驗證**：預設映像 `/usr/share/nginx/html/editor/` **0 個檔**，
`--build-arg GGD_INCLUDE_EDITOR=1` 是 347 個檔。真 nginx 容器跑過：prod layout 下
**即使編輯器目錄被掛進去**，`/editor/` 也不會送出編輯器（落到 client SPA），
dev layout 掛了 `nginx/dev/` 才會。

**修完之後，未登入訪客拿得到什麼：** `/`（遊戲前端）、`/admin/`（維運面，
本次未變動）、`/content/**`、`/api/**`（`/api/v1/internal/**` 仍 404）、`/ws/`、
`/colyseus/`、`/healthz`。**拿不到**：`/editor/`（落到 client SPA）、
`/content-api/**`（從來沒進正式 nginx）、任何編輯器的 JS/CSS chunk（映像裡沒有）。

**順手修掉一個會被這次修復製造出來的謊：** 後台 Quick Approval 的 `/editor/` 探測
本來只看狀態碼。路由拿掉之後 `/editor/` 會落到 `try_files … /index.html` 而**回 200**，
所以那一列會在已經修好的部署上永遠喊「確實對外開著」。改成 GET 讀 body 找編輯器自己的
`<title>`；判斷的是「回話的是不是編輯器」。永遠亮著的安全警示等於沒有警示。

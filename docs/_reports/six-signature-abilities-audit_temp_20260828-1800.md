# 六招精雕技能 模板化稽核（唯讀）

> 產出：2026-08-28 18:00 · owner 的問題：「我們精心雕琢的六技能 是否都變成技能與特效模板了？是否還有缺漏？」
> 底稿：`docs/_reports/vfx-editor-jass3_temp_20260828-0042.md`（第一批③支）＋ `vfx-editor-jass3b_temp_20260828-0312.md`（第二批③支）。
> 本報告**只讀不改**；每一格結論都指得到檔案或 commit。⚠️ 兩份底稿寫成之後**同一天已有多筆落地**（M1/M3/M4/M6/M11/N1/N3/N6、五份新 script、阿邦大修、天譴 vfxKey）—— 底稿的 MISSING 表**已過期一半**，本報告以工作樹現況為準。

## 0. 定位（六招 ↔ 檔案）

| 招 | ability JSON | vfx-script | 備註 |
|---|---|---|---|
| ① 01-04 超究武神霸斬 | `content/abilities/godie-hart.r.json` | ✅ `content/vfx-scripts/godie-hart.r.json`（16 段） | ⚠️ 任務原述寫「godie-e002.ex 或 .r」—— 那是理想鄉；超究＝**hart.r**（底稿①定位表） |
| ② 04-03 龍破斬 | `godie-h020.e.json` ＋ `godie-hjai.e.json`（鏡像，僅 vfxKey 異） | ✅ 各一份（各 2 段） | 兩形態同一位英雄（莉娜） |
| ③ 20-04/20-002 理想鄉EX鏈 | `godie-e002.r.json`（Avalon）＋ `godie-e002.ex.json`（約束勝利劍MAX；`e00l.ex` 為變身鏡像） | `.ex` ✅（17 段）· **`.r` ⛔ 無 script** | 演出鏈＝反彈成功→七連斬→劍收尾 |
| ④ 09-04 龜派氣功 | `godie-ogrh.r.json` ＋ `godie-o00x.r.json`（鏡像） | ✅ 各一份（各 2 段） | 短是**量到的**（JASS 無喊招/音效/動畫） |
| ⑤ 08-04 阿邦快速劍X | `godie-n01c.r.json` ＋ `godie-nbbc.r.json`（鏡像，僅 vfxKey/icon 異） | ✅ 各一份（各 4 段，含 hideBody） | 兩形態已統一（底稿抓到的 0.667/1.233 分裂已修成 0.833） |
| ⑥ 65-04 天譴 | `godie-udea.r.json` | ✅（2 段） | 短是**量到的**（`ogru` 是空模型 dummy） |

## 1. 總表（6 招 × 5 面）

| 招 | ①技能模板 | ②特效模板(preset) | ③演出腳本(vfx-script) | ④機制缺口 | ⑤家族預設出處 |
|---|---|---|---|---|---|
| **超究武神霸斬** | ⚠️ inline（comboStrikes 家族 `superff7` 走 `combo-strikes.json` 共用表＝節奏已資料化；⛔ 無 `template.ref`，可收斂候選 `tpl-lock-combo`） | ⚠️ 幻影 `spawnModelFx imported.herocloudstrife` **無 preset**（path:toTarget 近似原作的瞬移貼位） | ✅ 16 段：喊招字＋逐刀骨特效＋finisher（**heightKeys 升空曲線已接**）＋anim 脈衝＋shake；**M1 strikeReposition 已接**（caster 1.3u/ring4/step3＝70u/+270° 逐格翻譯） | ⚠️ 已落地：M1(`a87231b0`)·M3(`2779c926`)·M4部分(`73d9d1cd`)。未落：**M2 本體紅染半透明**·M7 文字方向速度·M4 尾段(death 剪輯)·M5(豁免) | ✅ 不引用任何在豁免表上的家族（comboStrikes 的節奏出處＝`combo-strikes.json` 帶 `jassLine:33799`） |
| **龍破斬** | ⚠️ inline（詠唱五句 floatingText＋delayed 已資料化） | ✅ `tpl-line-blast`（模板正典**就是這一支**，speed 27.5＝量到）＋ `tpl-locust-strike` | ⚠️ 各 2 段（DoomTarget＋聚氣陣＝CAST 段 ✅）；**缺**：火球拖尾（M11 機制已落地`788d9b7f`但**零接線**）·爆炸 18×WarStomp 環·FlameStrikeTarget 火柱·出生延遲 0.96s | ⚠️ M11 已落地未接；M5(豁免)；沿路+爆炸合併結算＝層1 裁決（⛔ 不是缺） | ⛔ **`tpl-line-blast` 全 15 格**＋`tpl-locust-strike` 7 格都在 `templateOriginBaseline.json` 豁免表上（P1 只記到模板級） |
| **理想鄉EX鏈** | ⚠️ inline（.ex 住 `passive.hooks`：onReflectSuccess＋delayed×7＋finalEffects damageLine —— 全資料、高度客製） | ⚠️ `.r` 的 MonsoonBolt 柱走 `tpl-locust-strike`；⛔ 但 anchor:self **單具**（原作逐敵一具@敵人腳下） | `.ex` ✅ 17 段（**含 sound×3＝M6 已用**、strikeReposition victim 拖行、8Hit、勝利劍+鑽頭+掃蕩）；`.r` ⛔ **無 script**（缺「永恆的理想鄉」喊招字＋per-enemy 柱演出） | ⚠️ 已落地：M1/M4部分/M6。未落：**M10 隨機刀距**·M7·M8(層1 已改，僅 1:1 需要)·A0CS chainLightning 未接（機制在）·N11 已撤回（`spendMana.pctCurrentMana` 早就有） | ⛔ `tpl-locust-strike` 7 格在豁免表 |
| **龜派氣功** | ⚠️ inline（spawnProjectile 傷害＝層1 重設計；原作 6 格取樣線） | ✅ **三個 preset 全掛**：`tpl-beam-roll`×2＋`tpl-locust-line`，**三個節點都有 `offsetForwardU:2.75`（N1 已接）** | ✅ 2 段（槍口雙爆炸，含 offsetForwardU）；短是量到的（JASS 零喊招/零音效/零動畫 ⇒ script 不憑空加） | ✅ 本批最乾淨：N1(`025ab4f3`+`9fd58f9e`)·N3(`62b259ce`，ability 的 screenShake `applyTo:"nearby" radius:9.39` 已接)。殘餘：scaleAxis[1,1,2.68]＝**誠實偏離**（原作等向 265%，有紀錄可回滾）·建築×0.2 未表達 | ✅ `tpl-beam-roll` **已離開豁免表**（每格有 origin，j:行號齊）；`tpl-locust-line` count/spacing 已回填（spacing 2→**3.67** 帶 j:31926-31927），⚠️ 殘 3 格（modelKey/path/lifeSec） |
| **阿邦快速劍X** | ⚠️ inline（底稿抓到的 nbbc `tpl-single-strike` 分裂已改掉——兩形態現逐格一致；可收斂候選 `tpl-blink-strike`） | ✅ `tpl-locust-travel`（crescent＝層1 演出替換，有紀錄）；script 另有 JASS 忠實的 reddragonmissile 定點段 | ✅ 4 段：**hideBody（N6 `975e27a0`）已接**＋龍息彈定點＋出發點塵土＋落點 ThunderClap | ✅ 底稿的五格資料缺陷**已修四格**：blink `to:"point" distanceUnits:10.08` ✅·`damageType:"true"` ✅·落點 `damageArea radius:4.5` ✅·castTimeSec 統一 0.833 ✅。⛔ 未修：**基礎 AUcs 直線傷害（450/650/850，長10.08 寬3.67）仍未表達**；ImpaleTargetDust 資產缺口（用 ground-dust 代打，有紀錄） | ⛔ `tpl-locust-travel` 7 格在豁免表 |
| **天譴** | ⚠️ inline（chainLightning＝引擎機制逐格翻譯；`maxSources:20` 是 GGD 護欄，有紀錄） | ✅ 無 preset＝**正確**（`ogru` 模型欄是空字串 ⇒ 原作零自有模型） | ✅ 2 段（lightning nova@self＝「電弧全從施法者腳下發出」的有出處表達＋shake 2s）；vfxKey 已修 `fx.prim.lightning.nova-lg` ✅ | ⛔ **N13 未修：`dash` 仍掛在 65-04**（JASS 零位移；8.25＝cast_range 誤讀；真衝刺屬 65-02，而 `godie-udea.w` 今天仍是 tpl-single-strike 零 dash ⇒ **兩支還是掛反**）。另：decay 0.9/jumpRange 24 vs 量到 0.0/33.0（平衡改動走 owner）·奪魔視覺未接·AIds 1/5 白嫖未表達·vfxArc 出貨狀態未驗 | ✅ 不引用豁免表上的家族（無 preset） |

**一行版**：特效模板與演出腳本這兩面**六招都有形**（10/10 script 齊、preset 5/6 掛好、批次一的 12 顆資產缺口已全數進庫）；缺漏集中在 ①`template.ref` 0/6（inline 為主，節奏/預設仍資料化）②四個引用中的家族預設**32 格無出處**③天譴 dash 掛反④三招的文字方向速度（M7）。

## 2. M/N 帳（底稿 MISSING 表 → 今日現況）

| # | 機制 | 現況 | 證據 |
|---|---|---|---|
| M1 連段逐段瞬移/拖行 | ✅ **落地＋接線**（hart caster / e002.ex victim） | `a87231b0`；`comboStrikes.strikeReposition`＋`delayed.strikeReposition`（schema+sim+variants） |
| M3 升空曲線 | ✅ 落地＋接線（hart finisher 柱） | `2779c926`；`vfxScript.ts:97 heightKeys`（t 嚴格遞增閘） |
| M4 受害者動畫 | ⚠️ **部分**：anim 脈衝（hurt＋clipWindowMs 慢動作）已接 hart/e002.ex；**death 剪輯尾段仍缺**（schema 註解自認近似） | `73d9d1cd`；`vfxScript.ts` zVfxScriptAnim |
| M6 逐擊音效 | ✅ 落地＋接線（e002.ex 三段 sound） | `vfxScript.ts` zVfxScriptSound |
| M11 投射物拖尾 | ⚠️ **機制落地、零接線**（`grep trailVfxId content/` 零命中 —— 龍破斬火球拖尾仍未畫） | `788d9b7f`；`vfxScript.ts:108`（⚠️ trail＋path:"static" 會被 schema 擋，接的時候要用有 path 的段） |
| N1 槍口偏移 | ✅ 落地＋接線（龜派三節點＋script 兩段＋e002.ex 勝利劍 1.3） | `025ab4f3` `9fd58f9e` `62b259ce` |
| N3 範圍限定鏡頭震動 | ✅ 落地＋接線（龜派 `applyTo:"nearby" radius:9.39`） | `62b259ce`；cueNearbyAudience 守衛 |
| N6 演出隱形 | ✅ 落地＋接線（阿邦兩份 script `hideBody durationMs`） | `975e27a0`；`vfxScript.ts:184` |
| N11 抽乾奪魔 | ✅ **撤回**（`spendMana.pctCurrentMana` 早已出貨）；⚠️ U00K 在 GGD 場上存不存在仍待查 | 底稿 3-6 自記 |
| M2 本體染色/半透明 | ⛔ 未落（status-effect 無 tint/alpha/hide 欄；hideBody 只解了「藏」不解「染」） | grep 零命中 |
| M7 floatingText 方向速度 | ⛔ 未落（`floatingText.ts:36` 只有 riseSpeed；script 段 pick 也只有 riseSpeed） | 超究喊招/iHit、龍破斬詠唱、e002.ex 8Hit 全直升 |
| M10 隨機段距（seeded） | ⛔ 未落（e002.ex delayed 定值 0.12；sim 禁 Math.random ⇒ 要 seeded 葉） | — |
| M8 onTargetedBySpell | ⛔ 未落＝**可接受**（Avalon 層1 已改 onDamageTaken；僅 owner 要 1:1 才做） | — |
| M5 地形波紋 | ⛔ 未落＝**建議豁免**（四招要；體素地板無變形機制，screenShake 近似已接） | 尚未進任何豁免帳 |
| N13 dash 掛反 | ⛔ **未修**（65-04 有 dash、65-02 沒有 —— 與 JASS 正好相反） | `godie-udea.r.json` effects[0]；`godie-udea.w.json` tpl-single-strike |

## 3. 缺漏清單（按「擋住幾支」排序 —— 第〇·五守則盤點法）

| 排 | 缺漏 | 擋住 | 一句話＋修法 |
|---|---|---|---|
| 1 | **家族預設出處回填**：`templateOriginBaseline.json` 仍掛著 `tpl-line-blast` 15 格＋`tpl-locust-strike` 7 格＋`tpl-locust-travel` 7 格＋`tpl-locust-line` 3 格＝**32 格** | **4/6**（龍破斬·理想鄉·阿邦·龜派） | 每一格都是「會被後來的自己當成證據的推測」（tpl-beam-roll 已示範修完的樣子：逐格 j:行號，錯的 spacing 2→3.67 就是這樣抓到的）。回填法在豁免表 reason 欄裡寫好了 |
| 2 | **M7：floatingText 方向速度**（SetTextTagVelocityBJ 沿面向/斬角/隨機方向飛） | **3/6**（超究·龍破斬·理想鄉EX） | schema＋script 段各加 `velocityAngle:"facing"/"random"/度數`；出處 j:33768（超究喊招 64@facing）·j:29886 族（詠唱 32@facing）·j:32541（iHit 100@random） |
| 3 | **M4 尾段：受害者 death 剪輯** | 2/6（超究·理想鄉EX） | hurt 慢動作近似已出貨；補 `pulse:"death"` 一格（渲染側），schema 註解已自認這條尾巴 |
| 4 | **N13：天譴/寒冰破碎 dash 對調**（單支但**正確性最重**——8.25 是把施法距離讀成衝刺距離，卡面「向前衝鋒」也跟著錯） | 1/6 | `godie-udea.r` 拔 dash；`godie-udea.w` 補 dash（0.04s×20wc3u×≤10tick＝speed 9.17/dist 3.67，j:46786-46905）＋兩張卡面同步（第一·五守則） |
| 5 | **Avalon（e002.r）三件**：無 vfx-script（喊招字「永恆的理想鄉」）·MonsoonBolt 柱 anchor:self 單具（原作逐敵一具@敵腳下）·A0CS chainLightning 未接（機制在） | 1/6 | script 一份＋per-target spawn 待驗（`shape:"circle"` per-target）＋hooks 加 chainLightning |
| 6 | **M11 接線**：龍破斬火球拖尾（HCancelDeath＋VolcanoDeath 每 tick）機制已落地零採用 | 1/6 | h020/hjai script 補一段有 path 的 modelFx＋trailVfxId（⚠️ 或把 ability 的 tpl-line-blast 節點搬進 script —— 別畫兩份）；順帶補爆炸 18×WarStomp 環與 FlameStrikeTarget 火柱 |
| 7 | **阿邦：基礎 AUcs 直線傷害未表達**（450/650/850，長 10.08 寬 3.67 —— 「X」的第一劃） | 1/6 | effects 補 `damageLine`；w3a data1/3/4 逐格 |
| 8 | **M2：超究本體紅染半透明**（vertex 100,60,60,50% 3.5s） | 1/6 | status-effect@1 加 tint/alpha（渲染走既有 applyModelTint；與 N6 hideBody 同一格家族） |
| 9 | **M10：理想鄉EX 隨機刀距**（0.05–0.30s seeded） | 1/6 | `delayed.intervalJitter`＋sim seeded RNG |
| 10 | 單格資料項：天譴 decay/jumpRange（0.9/24 vs 量到 0.0/33 —— **平衡改動走 owner**）·龜派建築×0.2·天譴奪魔視覺/AIds 1/5/U00K 存在性·阿邦 ImpaleTargetDust 資產（已用 ground-dust 代打） | 各 1/6 | 各一格；天譴那兩格⛔不要自己動（owner 旋鈕族） |
| 豁免 | **M5 地形波紋**（4/6 要）·M8 onTargetedBySpell（層1 已改） | — | 建議正式進豁免帳（帶理由），⛔ 不要留成永遠的 MISSING |

**②特效模板一面的殘餘**：超究的幻影節點（herocloudstrife，path:toTarget）無 preset 且是「瞬移貼位」的近似——若 M3 heightKeys 之後要 1:1，它是 beam/locust 之外的第三種形（貼位+升降），今天沒有家族收得下，暫留 inline 合理。
**①技能模板一面的定調**：六招 `template.ref` 0/6（repo 85 支有）。六招全是多機制複合演出，單一 ref 收不下＝inline 有理由；但**節奏（combo-strikes.json）、preset（5/6）、script（10/10）三層都已資料化**——「變成模板了嗎」的誠實答案是：**特效層是了，技能層是資料但不是模板引用**；可收斂候選只有 hart→tpl-lock-combo（strikeReposition 落地後參數齊了）與 n01c→tpl-blink-strike 兩條，收不收是整理債不是缺陷。

## 4. 稽核方法備忘

- 「已落地」全部以工作樹＋`git log` 驗證（⛔ 不信底稿的 MISSING 表——它寫成當天下午就過期了）。
- 資產存在性以 `content/models/_index.json`（148 筆）逐 key 驗：六招 script 引用的 17 顆 model key **全數在庫**（批次一列的 12 顆缺口已閉合）。
- vfx-scripts `_index.json` 含全部 10 份 ✅；genguard 判 vfx-scripts 為手編檔（無產生器擁有者）。

# 90 支重製技能 —— 規格逐句涵蓋率稽核（2026-08-12）

> ⭐ **回答 owner 的問題「全部都 100% 照說明用 JSON 實作完整嗎？」→ 不是。**

| 指標 | 值 |
|---|---|
| **子句涵蓋率** | **476 / 666 = 71.5%** |
| 缺口主張 | 197 條 |
| **對抗複驗存活** | **143 條** |
| 被推翻 | 54 條（27%）|
| 涉及技能 | **82 / 90** |

**計算基礎**：把 90 支的 owner 原始規格逐句拆成 **666 個可驗證子句**（連冷卻/MP/距離都算），
每一句問「JSON 裡有沒有一個欄位在做這件事」。⛔ **不是**「90 支裡有幾支及格」——
以技能為分母會嚴重樂觀，因為**一支漏一句，玩家看到的就是說明在說謊**。

→ 換算：**約 190 個子句寫在說明上、在遊戲裡不會發生。**

⚠️ 15 位英雄**每一位都有** high 缺口 —— 不是集中在某幾支。

## 嚴重度與分類

| 嚴重度 | 條數 | | 分類 | 條數 |
|---|---:|---|---|---:|
| high | 104 | | wrong-semantics（語意寫錯） | 82 |
| medium | 56 | | missing（整段沒寫） | 46 |
| low | 37 | | half-done（只做一半） | 25 |
| | | | condition-lost（條件不見） | 23 |
| | | | rank-collapsed（逐階被壓平） | 19 |
| | | | **engine-gap（引擎沒有）** | **2** |

⭐ **engine-gap 只有 2 條** —— 幾乎全部是**內容側漏填/填錯**，修法是編輯 JSON，⛔ 不用動引擎。

## 涵蓋率最低的技能

| 技能 | 名稱 | 涵蓋 |
|---|---|---|
| `godie-e00w.ex` | 77-002 御雷劍 | **0/3 = 0%** |
| `godie-h00l.r` | 60-04 完美盾反 | **2/9 = 22%** |
| `godie-h01n.w` | 79-02 月牙斬擊 | **2/6 = 33%** |
| `godie-hapm.passive` | 52-00 十二道試煉 | **4/11 = 36%** |
| `godie-emfr.ex` | 15-002 敵彈吸收陣。太陰道 | **3/8 = 38%** |
| `godie-edem.ex` | 45-002 天照 | **4/9 = 44%** |
| `godie-h02k.w` | 89-02 憤怒的菊花 | **4/9 = 44%** |
| `godie-emfr.w` | 15-02 疾風迅雷 | **5/11 = 45%** |
| `godie-e002.r` | 20-04 Avalon-永恆的理想鄉 | **3/6 = 50%** |
| `godie-e00w.w` | 77-02 雷鳴劍 | **3/6 = 50%** |
| `godie-edem.r` | 45-04 哥哥 | **4/8 = 50%** |
| `godie-e00s.passive` | 70-00 紮根 | **4/8 = 50%** |
| `godie-e00s.e` | 70-03 木束縛之術 | **3/6 = 50%** |
| `godie-h02v.r` | 92-04 馬勒戈壁 | **5/9 = 56%** |
| `godie-h01u.w` | 80-02 弒鬼神 | **4/7 = 57%** |

## 完整缺口表（197 條主張，143 條通過對抗複驗）

⚠️ 下表是**全部主張**。複驗推翻的 54 條共同形狀是「拿原作或直覺當標準，而 owner 已有更晚更明確的決定」
—— 那正是第〇·六守則要防的事。逐條的複驗理由在 workflow journal。

| 技能 | 規格那一句 | 缺什麼 | 玩家會遇到什麼 | 嚴重 | 類 |
|---|---|---|---|---|---|
| `godie-e002.ex` | 「永恆的理想鄉」[反彈]成功時發動 | hook 事件名 onReflectSuccess 是對的（schema/effect.ts:3321 的 DAMAGE_BEARING_EVENTS 第三個成員，註解逐字為 20 | 整支 EX 是死的 —— 玩家按 R 再等敵人打魔法，七連斬與最後一發從頭到尾不會出現。這不是引擎缺口，是 R 那一端沒接上；但對玩家而言結果相同。 | high | engine-gap |
| `godie-e002.ex` | 每次造成7倍[反彈]傷害 | 七發的每一發寫的是 damage{flat:50, ratios:[ap×1.0]} —— 固定值 + 1 倍 AP，跟「反彈傷害的 7 倍」沒有關係。正確寫法是 damage.i | 就算 R 被修好，七連斬也不會隨敵人打你多重而變強 —— 這招的整個「越被打越痛」設計沒了，變成固定 7×(50+AP)。 | high | wrong-semantics |
| `godie-e002.ex` | 最後施展「約束與勝利之劍」，對[前方][直線]敵人造成（[現存魔力]+[AP]）×7倍傷害 | finalEffects 的 damageLine 形狀對（前方直線），但傷害是 flat 50 + ap×1.0。缺兩件事：①[現存魔力]項完全沒有（引擎有 zResourceP | EX 收尾那一發的傷害只有規格的約 1/7，而且完全不獎勵留魔。「放了這招我就要補魔了」那條資源設計整個不見。 | high | missing |
| `godie-e002.passive` | 有30%[機率][格擋]100%魔法([AP])傷害。 | 寫成 hook onDamageTaken{damageType:magic, chance:0.3} → shield{flat:800, duration:0.5, absor | 面對高額魔法（例：一發 2000 的技能）說明寫「格擋 100%」，實際只少掉 800，玩家會覺得天生技根本沒作用；反過來面對連續小額魔法，一次觸發卻白吃了 0.5 秒內的好幾發。 | high | wrong-semantics |
| `godie-e002.r` | 在2秒內[反彈]承受的[魔法傷害] | 整支 R 的 effects 只有 {kind:"applyStatus", statusId:"moon-combo", duration:2.0}。moon-combo 是** | 按下 R，花 150~350 魔、進 60 秒冷卻，2 秒內敵人打你的魔法傷害**一點都不會反彈**。玩家拿到的是一個貼了無關 buff 圖示的空技能。 | high | wrong-semantics |
| `godie-e002.r` | [反彈]量為原傷害的 3/5/7倍 | 沒有 incomingPct.perRank:[3,5,7]，逐階數列整條不存在。（順帶確認：INCOMING_PCT_MAX = 10，7 倍在上界內，不是被 schema 擋掉 | 三個等級的 R 除了魔耗不同以外完全一模一樣，升級沒有任何感覺。 | high | missing |
| `godie-e002.r` | 另加 300% [AP]傷害 | 沒有任何 ap ratio 3.0 的落點。 | Saber 是 AP 英雄，這一句是她堆 AP 的主要回報，整段不存在。 | high | missing |
| `godie-e002.w` | 關閉時，凝聚的風能一次釋放「風王鐵槌」，造成前方圓形[範圍] 120+ 30% [AP]傷害。 | toggle.onExit 只有 [{kind:"championForm", to:"toggle"}] —— 一個把身體換回去的效果，零傷害。整句「120 + 30% AP 的 | 這招一半的傷害輸出不存在。玩家關掉風王結界，畫面上什麼都不會發生，敵人一滴血都不掉。 | high | missing |
| `godie-e002.w` | [MP]不足則自動關閉。 | toggle.upkeepCadence 填 "none"、upkeepCost 填 [0]，維持成本改用 passive.ranks[].hooks[onBasicAttack] | 魔力見底之後結界不會關，而 critChance 1.0 / critDamage 1.4~2.0 這兩條 modifier 掛在 rank 上、不受那個 mp 條件管 —— 於是 | high | wrong-semantics |
| `godie-e00r.ex` | [吸血]120% | 寫成 {stat:"lifesteal", op:"flat", value:0.8}。0.8 不是 1.2，而且 0.8 正好是 STAT_CLAMPS[Stat.Lifeste | 卡上寫 120% 吸血（打 100 回 120），實際拿到 80%。而且 EX 的吸血只比天生技的 60% 多 20 個百分點，「完全暴走」相對「暴走」的升級感在吸血這一項幾乎消失 | high | wrong-semantics |
| `godie-e00r.r` | 90秒冷卻，吟唱3秒 | 「吟唱3秒」寫成 castTimeSec: 0.4。差 7.5 倍。ability@1 有正確欄位（castTimeSec，註解逐字寫「cast time (seconds) be | 3 秒吟唱是這一招的整個代價：敵人有 3 秒可以走開、可以打斷、可以繞到側面。0.4 秒等於幾乎瞬發 —— 一發 1650 真傷的直線清場變成沒有反制窗口，而技能說明白紙黑字寫著「 | high | wrong-semantics |
| `godie-e00r.w` | 高週波短刀[每次普攻]有10/15/20/25%[機率]將該次攻擊轉為[真實傷害]。 | 「將該次攻擊轉為真實傷害」完全沒有落點。JSON 的 hook 效果是 {kind:"damage", damageType:"true", amount:{flat:50}} — | 卡上寫「這一刀變成真傷」（對高護甲目標是質變）；實際拿到的是「10~25% 機率多 50 點固定傷害」，而本體那一刀照樣被護甲吃掉。對一個 armor 高的目標，玩家看到的差別幾乎 | high | wrong-semantics |
| `godie-e00s.e` | 讓白木[周圍][範圍]的敵方都受到木靈束縛綑綁 | ⛔ 這一支的定身**打在自己身上**。`castType` 是 `"self"`，而 abilitySystem.ts:214-217 對 self 施法一律寫 `targets  | 按下 E：花 45 秒冷卻與 100~250 MP，**把自己定住 0.6 秒**，敵人只吃到 1 點魔法傷害（那顆 flat:1 的 damageArea），一個都不會被綁。這是 | high | wrong-semantics |
| `godie-e00s.e` | 持續0.6/1.2/1.8/2.4秒 | `applyStatus.duration` 只寫了單一值 `0.6`，四階全部是 0.6 秒。引擎完全支援逐階陣列 —— `content/schema/effect.ts:18 | E 點滿（4 級）的定身時間仍是 0.6 秒，規格是 2.4 秒 —— 少了 75%。玩家把技能點滿卻感覺不到任何變化，而技能面板（讀 description）會照著說明寫 2.4 | high | rank-collapsed |
| `godie-e00s.ex` | 集千年煉成之大成，[千年練成] 追加 500% [AP]傷害 | 整段沒寫。EX 的 passive 只有一個 hook（onAbilityCast / abilitySlot R），而它底下只掛了治療那一半。⭐ 引擎的 `abilityAugm | EX 是每個英雄最貴的一格，而它承諾的傷害那一半（500% AP，等於把 R 的 30% AP 變成 530% AP）**完全不會發生**。玩家開了 EX 再放 R，傷害數字與沒開 | high | missing |
| `godie-e00s.passive` | 在地面紮根，變得無法移動 | 變身後的第二形態 godie-e010 的 baseStats.ms 是 5.5，比本體的 5.3 還**快**。沒有任何 root / moveSpeedMult 0 / 移動鎖 | 技能說明的核心代價（紮根＝不能動）完全不存在。玩家按下天生技以為自己被釘住、實際上還能跑，而且跑得更快 —— 這支技能的整個 risk/reward 設計消失，而畫面上跟正常一模一 | high | missing |
| `godie-e00s.q` | 造成[範圍]敵人150/300/450/600+[力量]*3傷害 | 「+[力量]*3」寫成了 `ratios:[{stat:"ad", coeff:1.0}]`。兩層都錯：① 係數是 1 不是 3；② 讀的是最終 AD（含英雄基礎 AD 15、成長 | 1 等時規格是 +51（力量17×3），實際只有 +32（AD 15+17）—— 少 37%。而且隨等級/裝備往兩個方向漂：買 AD 裝會讓它超過規格，等級高但沒 AD 裝會讓它遠 | high | wrong-semantics |
| `godie-e00s.r` | 若是被[定身]的狀態，則傷害加倍 | 整句沒有任何落點。R 的 effects 只有一顆 randomArea 包一顆 damageArea，沒有 `condition`、沒有 `victimCondition`、也沒 | 這是白木整套技能組的**唯一 combo**：E 綁住 → R 打加倍。條件不見了之後，先 E 再 R 與直接 R 的傷害完全一樣，玩家的操作技巧沒有任何回報。⚠️ 而且 E 目前 | high | condition-lost |
| `godie-e00w.e` | [加速][攻擊速度]60/90/120/150% | `applyBuff.modifiers:[{stat:"as",op:"pctAdd",value:0.6}]` —— 只有一個 0.6，2/3/4 階的 0.9/1.2/1.5 | 點滿 4 級的 E 跟 1 級的 E 攻速加成一模一樣（+60%），但 MP 從 90 漲到 360。玩家投資 3 個技能點 + 4 倍魔耗，換到 0 攻速。 | high | rank-collapsed |
| `godie-e00w.e` | 持續6/9/12/15秒 | `applyBuff.duration: 6.0` 固定。變身那一半（championForm.durationSec）有寫成 [6,9,12,15]，攻速 buff 那一半沒有。 | 4 級 E 變身 15 秒，但攻速加成第 6 秒就掉了 —— 後面 9 秒是一個沒有加成的空殼形態。而且畫面上（模型換了、特效還在）看起來還在生效。 | high | rank-collapsed |
| `godie-e00w.e` | 並可以變換為[飛行]狀態無視碰撞 | 整句沒有任何欄位。`effects[]` 只有 championForm + applyBuff，兩者都沒有 `flight`；`content/champions/godie-e | 技能名叫「翼之劍士」、標籤掛著[飛行]，但變身之後照樣被單位和柱子卡住。這是一支追擊英雄的核心位移手段，玩家會直接感覺到「說明騙人」。 | high | missing |
| `godie-e00w.ex` | 其雷鳴劍發動[機率]上升至50% | 沒有改寫 77-02，而是在 EX 自己身上另開一個 `onBasicAttack` + `chance:0.4` 的 hook，把 W 的落雷效果**複製一份**。引擎有 `ab | 實際行為是兩個獨立的骰：W 抽 10%、EX 抽 40%。至少一發的機率是 1-0.9×0.6 = **46%**，不是 50%；而且有 4% 的普攻會**同時**打出兩發落雷（雙 | high | wrong-semantics |
| `godie-e00w.ex` | [GLADIARIA ALAT] 持續時間增加至30秒 | 整句沒有任何欄位。EX 的 effects 是空的，passive 只有那一個落雷 hook，沒有任何東西碰得到 77-03。引擎的 `ability-augment@1` 有 ` | EX 兩句話裡的第二句完全不會發生。拿到御雷劍之後 E 還是 6/9/12/15 秒，不是 30 秒。這是這支 EX 一半的價值。 | high | missing |
| `godie-e00w.passive` | 造成250+[敏捷]*5點傷害 | JSON 寫成 amount.flat=250 + ratios:[{stat:"ad",coeff:1.0}]。「[敏捷]*5」被換成了「AD×1」—— 換了一個完全不同的屬性， | 這位英雄是 AGI 主屬（agi 18→24 起跳、agiGrowth 2.85），說明承諾的是隨敏捷成長的一發重擊。實際落地的是「+ 當下 AD × 1」。1 級時 250+24 | high | wrong-semantics |
| `godie-e00w.w` | 有10%的[機率]可以使出[會心一擊]造成1.5倍的[暴擊]傷害 | 整句沒有任何欄位。JSON 只有一個 `onBasicAttack` + `chance:0.1` 的 hook，效果裡沒有暴擊、沒有 1.5 倍、沒有 critStrike 授予 | 技能名叫「雷鳴劍」、slogan 是「雷鳴。會心」，而「會心」那一半完全不存在 —— 普攻永遠不會有 1.5 倍暴擊。玩家看到的只有偶爾閃一下的落雷。這支被動的一半 DPS 憑空消 | high | missing |
| `godie-edem.ex` | 使[周圍][大範圍]敵人每秒受到400點[燃燒]傷害並附加[燃燒]標記 | ⛔ 全部掛在施法者身上。`castType:"self"` → `targets=[caster]`（abilitySystem.ts:216），而 `dot` 與 `applyS | 按下 EX：花 650 魔、120 秒冷卻，敵人掉 1 點血，佐助自己開始每秒掉 400 —— 十秒內基本上自殺。這是整支英雄最嚴重的一條。 | high | wrong-semantics |
| `godie-edem.ex` | 同時[沉默]…持續10秒。 | 同上：`applyStatus{statusId:"paralysis", silenced:true, duration:10}` 也落在施法者身上。 | 佐助自己被沉默 10 秒（Q/W/E/R 全部按不出來），敵人可以正常施法。 | high | wrong-semantics |
| `godie-edem.ex` | [攻擊力降低]40% | 完全沒有對應欄位。`applyStatus` 沒有攻擊力那一格；引擎的【虛弱】（sim/weakness.ts）是靠 status tag `weakness` 觸發的**固定 5 | 卡面標籤列印著 [虛弱]，遊戲裡敵人的攻擊力一點都沒掉。 | high | missing |
| `godie-edem.passive` | 有20%[機率][反彈]魔法([AP])傷害。 | 「反彈」寫成一發固定的反擊傷害：`{kind:"damage", amount:{flat:50, ratios:[{stat:"ap",coeff:1.0}]}}`。引擎真正的反 | 被一發 2000 的魔法技打中，卡面說「反彈」，實際只回敬對方 50+AP 一發固定傷害；反過來被小法術戳一下卻反彈同樣的量。玩家看到的數字跟「反彈」兩個字沒有任何關係。 | high | wrong-semantics |
| `godie-edem.r` | 對目標[周圍][小範圍]敵人造成400/700/1000+ 300% [AP] 傷害。 | 三階的 `ratios` 全部是 `{stat:"ap", coeff: 1.0}`，規格是 300%。逐階的固定值 400/700/1000 有寫對（passive.ranks  | 堆 AP 的佐助，麒麟爆炸的傷害只有卡面的三分之一 AP 貢獻；1000 AP 時卡面該打 4000，實際 2000。這是這支英雄的核心 combo 收尾。 | high | wrong-semantics |
| `godie-edem.r` | 當「千鳥」命中帶有[燃燒]標記的敵人時 | hook 本身寫對了（`on:onAbilityHit` + `abilitySlot:"E"` + `condition:{kind:"status",subject:"targ | 千鳥明明打中了一個燃燒中的敵人（他掉血了），麒麟就是不炸 —— 除非他剛好站在落點正中心不到一個身位。玩家會覺得這支 R 是隨機的，查不出為什麼。 | high | condition-lost |
| `godie-edem.w` | 並使其[攻擊與移動速度][降低]50%，持續3秒。 | ⛔ 減速掛錯身體。`castType: "self"` 時 abilitySystem.ts:216 把 `targets = [caster]`，而 `applyStatus`  | 放千鳥流之後敵人正常移動、佐助自己慢一半 3 秒 —— 一支控場技變成自我減速的自殺技，而畫面上（傷害正常、有雷電特效）跟正常一模一樣。 | high | wrong-semantics |
| `godie-edem.w` | 並使其[攻擊與移動速度][降低]50%，持續3秒。 | 「攻擊速度降低 50%」整段沒有落點。`applyStatus` 沒有 attackSpeed 欄位，slow40 的 tags 也不含 `weakness`（sim/weakne | 卡面寫「攻擊與移動速度降低 50%」，實際連移動那一半都沒生效（見上），攻擊那一半根本沒有任何欄位在做 —— 兩半都是空的。 | high | missing |
| `godie-efur.ex` | 有20%機會摘除心臟，造成額外40%目標[最大生命]傷害。 | 寫成了 `devour` + `thresholdPctOfMax:[0.4]`，而 devour 是**處決**不是傷害：devour.ts:76 `if (hp.hp > hp | 對血量超過 40% 的敵人（也就是絕大多數的觸發時機），這支 EX 觸發了也是 0 傷害、畫面上只有特效；對殘血敵人則直接秒殺並幫自己回滿那一段血。『20% 機率追加 40% 最大 | high | wrong-semantics |
| `godie-efur.passive` | [每次普通攻擊]的時候，依照順序循環強化① 法術強度([AP]) +10% ② 攻擊力([AD]) +10% ③ [防禦] +10% ④ [ | cycleBuff 的『輪到第幾個』是從絕對到期 tick 推導的：nextCycleStep() ①『第一個沒有活著的 source』就直接回傳它。四格的 duration 全是 | 天生技說明列了四種強化輪替，玩家實際只會拿到 AP +10%；AD／防禦／魔抗三格要攻速超過 1.0 次/秒（約 +80% 攻速，agiToAttackSpeed 0.02 → 需 | high | wrong-semantics |
| `godie-efur.w` | 對指定敵人造成40/60/80/100 + 目標[最大生命]6/8/10/12%的傷害 | 『+ 目標最大生命 6/8/10/12%』整段**沒有任何欄位在做**。damage 效果只有 amount.perRank[40,60,80,100]。機制是現成的（damage | 對高血量目標的傷害少了最大的那一項。maxHealth 全域倍率是 4.0，滿階 12% 最大生命在實戰是三位數以上的傷害，等於這一招只剩說明的一半，而 45 秒冷卻是照原樣收的。 | high | missing |
| `godie-emfr.e` | 持續12秒 … 普通攻擊附加 60/90/120/150 + 40% [AP] 火焰傷害，每次技能命中都會引發爆炎[燃燒]標記，對[周圍]敵 | 兩條 hook（onBasicAttack 的火焰附加、onAbilityHit 的爆炎擴散＋burn）都寫在 passive.ranks[] 裡，而且**一個 condition | 按下 E 只會讓自己移速減半 12 秒 —— 好處早就永久拿到了。這支技能在玩家手上是一顆**純負面**的按鈕，而且「12 秒」這個持續時間對它的兩個賣點完全沒有意義。 | high | condition-lost |
| `godie-emfr.ex` | [反彈] 100% 魔法([AP])傷害 | 整份文件沒有任何反彈機制。這個 repo 的反彈標準寫法是 `onDamageTaken` hook + `damage.incomingPct`（唯一的實例：content/it | EX 的整個賣點（也是招式名字「敵彈吸收陣」）完全不會發生。按下去只會掛一個 5 秒的隱形標記，敵人的魔法傷害照常全額打在自己身上。 | high | missing |
| `godie-emfr.ex` | 並且將傷害轉化為自身魔力([MP]) | `eventValueConversion {source:"incomingDamage", to:"mana", ratio:1.0, who:"self"}` 這一段是對的， | 轉魔力一點都不會發生。與「反彈沒做」是同一個洞的兩半：修了反彈這半才會活過來。 | high | half-done |
| `godie-emfr.ex` | 以及將該傷害短暫加成至 [AP] | 沒有任何欄位在做「把吸到的傷害量加成到 AP」。tag_gate.py 的 WAIVERS 已記：「GH：15-002『將該傷害短暫加成至 AP』只寫了轉魔力那一半」。 | 吸收之後沒有任何 AP 回饋，EX 的成長曲線整段不存在。 | high | missing |
| `godie-emfr.q` | 對[前方]一[直線]敵方單位造成 250/350/450/550 +30% [AP]傷害，附帶麻痺 [緩慢] [移動速度]，持續1秒 | 緩慢寫成 damageLine 的**兄弟**效果（effects[1] 的 applyStatus slow40），而不是掛在 damageLine 的 onHitTargets | 對空地放 Q（最常見的用法）：整條線正常打出 250–550 傷害，但**一個人都不會被減速**（ctx.targets 是空的）。若剛好點在某個敵人身上：那個人被減速 1 秒卻* | high | wrong-semantics |
| `godie-emfr.r` | 施放技能後的下一次普通攻擊將釋放雷神一擊 | hook 寫了 `consumeOn: "fire"` 卻**沒有 maxTriggers**。讀 hooks.ts:494：扣額度那一整段包在 `if (hook.maxTrig | 雷神一擊變成「每一次普通攻擊都放」，而且不需要先施放任何技能。搭配 R 自己的攻速上限 10，這是一個數量級的傷害差異；規格描述的「蓄力→一擊」節奏在遊戲裡不存在。 | high | half-done |
| `godie-emfr.r` | 持續12秒 … 施放技能後的下一次普通攻擊將釋放雷神一擊 | 那條 onBasicAttack hook 一樣掛在 passive.ranks[] 且沒有任何 condition，所以與 R 開著沒開著無關，點出 R 就永久生效。 | 沒開 R 也一直在放雷神一擊。R 的 12 秒只買到移速／攻速，卡片上最有辨識度的那一句與按鈕脫鉤。 | high | condition-lost |
| `godie-emfr.r` | 100/150/200% [攻擊速度] | applyBuff.modifiers 單一 `{stat:"as", op:"pctAdd", value:1.0}`，沒有 perRank[]，三階都是 +100%。 | R 升到 3 級攻速仍只有 +100%（卡片寫 200%）——這支技能的主要成長被吃掉。 | high | rank-collapsed |
| `godie-emfr.w` | 普通攻擊附加 30/45/60/75 +10% [AP] 雷電傷害。 | 那條 onBasicAttack hook 帶著 `condition: {kind:"status", subject:"self", statusId:"rage"}`，但規格 | W 的招牌效果——普攻附加雷電傷害——**一次都不會發生**。玩家開了 W 只拿到移速與攻速，卡片上那行傷害是純謊話，而畫面上跟「這個數字很小所以看不出來」一模一樣。 | high | condition-lost |
| `godie-emfr.w` | 獲得 1.2倍 [移動速度] 與 30/60/90/120% [攻擊速度] | applyBuff.modifiers 只有一格 `{stat:"as", op:"pctAdd", value:0.3}`，沒有用 applyBuff.perRank[]（sch | W 點到 4 級的攻速加成仍然只有 30%，而卡片寫 120%。技能升級對這一半完全沒有回報，玩家會覺得「升 W 沒感覺」。 | high | rank-collapsed |
| `godie-emns.e` | 使敵方 [詛咒]標記的 [周圍]的敵方部隊受到650/750/850/950+ 60% [AP]點的劇烈傷害。 | 整段 `[詛咒]標記` 的**前提條件不見了**。JSON 是一支無條件的 `ground` 圓形範圍傷害：沒有 `condition`、也沒有 `victimCondition` | 這支英雄的整個 combo 身分（Q 先上[詛咒] → E/R 收割）在實際遊戲裡不存在。E 變成一支誰都能無腦丟的範圍炸彈，Q 打不打其實沒差 —— 玩家照著技能說明去鋪[詛咒] | high | condition-lost |
| `godie-emns.q` | 暫時50%攻擊失手，持續6/12/18/24秒。 | `applyStatus.duration` 是 `6.0` 一個純量。`missChance: 0.5` 對了，但**逐階秒數整條被壓平成第 1 階**。schema 明確支援逐 | 把技能點到滿（4 階）花了 300 MP，[詛咒] 還是只有 6 秒 —— 規格承諾 24 秒，實際少 18 秒（差 4 倍）。升級這支技能除了 MP 變貴以外**完全沒有任何回報 | high | rank-collapsed |
| `godie-emns.r` | 造成敵方[詛咒]標記的[現存生命] 30/40/50% + 40% [AP] 傷害 | ⛔ 這是這支英雄最嚴重的一個。「[現存生命] 30/40/50%」被寫成 `amount.flat: 50.0` —— 一個**固定 50 點**的傷害。看起來像是「50%」的 5 | 對一隻 4,000 血的敵人，規格說第 3 階打 1,200 點，實際只打 50 點 + 40%AP。這是這支英雄唯一的爆發技，實戰傷害掉到規格的個位數百分比 —— 玩家會直接認為 | high | wrong-semantics |
| `godie-emns.r` | 造成敵方[詛咒]標記的… | 同 44-03：`[詛咒]標記` 這個前提沒有落成任何 `condition`。JSON 是一支對任意敵人都能放的 targeted 技。 | Q → R 的 combo 條件不存在；反過來說也代表這支技能對沒中詛咒的人照樣打（與說明不符，但因為傷害本來就壞掉了，玩家先看到的是傷害問題）。 | high | condition-lost |
| `godie-ewar.ex` | 瞬間爆發造成 1800 + 600% [AP] 傷害 | `ratios: [{stat:"ap", coeff: 1.0}]` —— 600% 寫成了 100%。與 R 同一種漏乘，而且更嚴重（差 6 倍）。 | EX 是「近身最後必殺絕技」、花 600 MP，AP 加成卻只有說明的六分之一。一個 800 AP 的志狼：說明承諾 1800+4800=6600，實際 1800+800=2600 | high | wrong-semantics |
| `godie-ewar.r` | 附帶[淨化]效果 | `{kind:"dispel", shape:"circle", polarity:"buff", ...}` **沒有寫 `side`**。`schema/effect.ts:2 | 放大絕，敵人被打了 550/750/950 但一個減益都沒被拔；同時**自己和隊友身上的增益（護盾/加攻/加速）被清掉 2 個**。玩家會看到自己的 buff 圖示在放完大絕後憑空 | high | wrong-semantics |
| `godie-ewar.r` | 造成[周圍][大範圍]敵方單位 550/750/950 + 200% [AP] 傷害 | `ratios: [{stat:"ap", coeff: 1.0}]` —— 200% 寫成了 100%。`coeff` 在 schema 是裸的 `z.number()`（com | 大絕的 AP 加成只有說明寫的一半。一個 800 AP 的天地志狼，說明承諾 +1600，實際 +800。 | high | wrong-semantics |
| `godie-ewar.w` | 利用身體小周天循環[治療]自己[回復] 5/7/9/11%[最大生命] | `restore.healthPct` 只寫了單一值 `0.05`。引擎的 `restore.ts` 明確走 `rankScalar(e.healthPct, ctx.rank)` | W 升到 4 級，回血永遠是 5% 最大生命，跟 1 級一模一樣。技能說明寫 11%，實際 5%（少了 55%）。花 3 點技能點只換到 MP 消耗從 50 漲到 200，是純負收 | high | rank-collapsed |
| `godie-h00l.e` | 提高 [智慧]、[敏捷]、[力量] 3/6/9/12點 | 四個 rank 各寫了 `modifiers: [{ap:+N}, {ad:+N}, {maxHealth:+10N}]`。[智慧]→ap、[力量]→ad 對得上專案的三圍換算，但 | 點滿 E 只拿到 2/3 的招牌效果 —— 三角神力的「敏捷」那一角是空的，攻速一點都沒漲。而且因為走的是 stat modifier 而不是 attributes，商店與選角的* | high | missing |
| `godie-h00l.e` | 並且每三下普通攻擊則會額外造成 33% [AP]傷害。 | hook 是 `{on:"onBasicAttack", target:"event"}`，**沒有任何計數條件** —— 每一下普攻都會觸發。`zHookDef`（effect. | 追加傷害的頻率變成規格的 **3 倍**，而且攻速愈高偏差愈大。這是一支被動的整個節奏設計（攢三下打一發重的）被拿掉，換成一個永遠掛著的均勻加傷 —— 沒有蓄力感，數值上也直接超模 | high | engine-gap |
| `godie-h00l.ex` | 立即獲得相當於 100% [最大生命值]的[護盾] | `{kind:"shield", amount:{flat:1500.0}, duration:8.0}` —— 寫死 1500 點，不是 100% 最大生命。`shield.am | EX 是保命大招，而它的量**不跟著自己的血量走**。前期 1500 遠超過你的最大生命（等於無敵），中後期堆完血量之後 1500 又變成聊勝於無 —— 兩個階段都跟「相當於一條命 | high | wrong-semantics |
| `godie-h00l.passive` | [普通攻擊時]造成額外 3%[最大生命]傷害。 | JSON 寫的是 `{kind:"damage", damageType:"magic", amount:{flat:60.0}}` —— 一個**固定 60 點**的魔法傷害，完 | 打殭屍王／高血量目標時，說明寫「3% 最大生命」暗示是一個對肉單超好用的天生技，實際上永遠只多 60 點。反過來打脆皮時 60 點又比 3% 高 —— 兩邊都跟說明對不上，而且** | high | wrong-semantics |
| `godie-h00l.q` | 並且[擊退]敵人。 | `{kind:"knockback", distance:3, speed:15, from:"caster"}` 是一個**與 damageArea 平行的頂層 effect** | 按 Q：傷害正常打出去（圓心退回施法者座標，這一半是對的），但**沒有任何一個敵人被推開**，反而是自己往後滑 3 單位；而 `knockback.uncontrollable`  | high | wrong-semantics |
| `godie-h00l.r` | 瞬間架起海拉爾之盾，[反彈]魔法([AP])及物理([AD])傷害 | 整支 R 的主動效果只有 `{kind:"applyStatus", statusId:"moon-combo", duration:3}`。`content/status-eff | 這是這位英雄的大絕，而它**什麼都不做**：按下 R 花掉 120~180 MP 與 60 秒冷卻，敵人的傷害照樣全額打在你身上，一點都不會彈回去。而且技能圖示、特效、狀態列都照常 | high | missing |
| `godie-h00l.r` | 立即 [回復] 8/16/24% [最大生命] | `{kind:"restore", healthPct:0.08, applyTo:"self"}` —— 一個**單一純量**，不是 `perRank`。而 `maxRank`  | 把 R 點到 3 級，回血量永遠停在 8%，規格寫的 16% / 24% **永遠拿不到**。玩家投資兩個技能點得到 0 收益，而面板與說明還是寫 8/16/24。 | high | rank-collapsed |
| `godie-h00l.r` | 並且[擊退]敵人。 | hook 裡的 `{kind:"knockback", distance:4, speed:16, from:"caster"}` 沒有 `applyTo`。這條 hook 是 ` | 跟 Q 同一個病：反彈成功時不是把敵人推開，而是把自己彈開並短暫鎖住行動（`uncontrollable` 預設 true）。在「架盾接大招」這個情境下，自己被彈飛是最糟的結果。 | high | wrong-semantics |
| `godie-h01n.e` | (若對方在 [破魔] 狀態，則額外造成 60% [AP] 傷害) | 整句沒有任何欄位。e.json 只有一個 damageLine，沒有 passive 區塊、沒有 hook、沒有 condition。同型的 79-02 寫了（雖然是死的），79- | Q 破魔 → E 天衝 這條主力連段的加成不存在。E 的傷害在破魔與非破魔目標身上一模一樣。 | high | missing |
| `godie-h01n.e` | (卍解 [變身] 狀態下傷害額外追加 120% [AP]) | 整句沒有任何欄位。與 W 同一個形狀：沒有 whileForm、沒有形態 hook。⚠️ tag_gate 的豁免只記了「破魔 60% AP」那一句（("godie-h01n.e" | 卍解是這位英雄的核心決策（90 秒冷卻、只有 8 秒），而它對主力輸出技 E 的傷害加成完全不存在。玩家開了大招去放 E，數字一點都沒變。 | high | missing |
| `godie-h01n.ex` | 有30%的[機率][格擋]物理([AD])傷害 | 整句沒有任何欄位。⚠️ 而且機制**明確存在**：`ability@1.passive.ranks[].block`（zBlockGrant，有 damageTypes/chanc | 虛化四個承諾少了一個：面具的物理減傷完全不存在。卍解中的一護在對面近戰面前跟沒開 EX 一樣脆。 | high | missing |
| `godie-h01n.ex` | [月牙天衝]冷卻時間縮短50% | 整句沒有任何欄位。ex.json 的 passive 只有一條 onAbilityCast(R) → applyBuff{ad pctAdd 1.0, lifesteal flat | 虛化四個承諾少了第二個。卍解只有 8 秒，而 E 的冷卻是 55 秒——「E 冷卻減半」正是讓玩家願意在卍解中連按兩次 E 的那個機制，而它不存在。玩家開卍解後按 E，冷卻照樣 5 | high | missing |
| `godie-h01n.q` | 敵方單位 [破魔] 魔抗減半 | 「魔抗減半」這半句**完全沒有落點**。JSON 只有 applyStatus statusId:"magic-break"，而 applyStatus 的 schema 裡沒有任 | 瞬步唯一的實質效果（讓後續的月牙斬擊/天衝打得更痛）不存在。玩家掛了【破魔】圖示，敵人的魔抗一點都沒掉，後續法傷跟沒放 Q 一樣。狀態圖示只是一個給 W 的條件用的空標記。 | high | half-done |
| `godie-h01n.r` | [攻擊速度]提升100/150/200% | 三階數列被壓成單一值。JSON 是 applyBuff modifiers:[{stat:"as", op:"pctAdd", value: 1.0}]——一個裸的 1.0，不是  | 把大招從 1 級點到 3 級（花掉兩個技能點）攻速加成完全不變，永遠是 +100%。說明書寫的 150%/200% 拿不到。這是「點了沒用」型的技能點浪費。 | high | rank-collapsed |
| `godie-h01n.r` | [瞬步] 冷卻縮短 50%，持續8秒 | 用了錯的機制。JSON 是 modifyCooldown{shape:single, who:self, slot:Q, mode:reduce, amount:0.5}——那是* | 正常打法是先放 Q 衝進去、再開 R——這時 Q 剛進冷卻，砍一半剩 15 秒；8 秒的卍解結束前只夠再放一次 Q，而不是說明承諾的「這 8 秒內瞬步冷卻都減半」。反過來如果先開  | high | wrong-semantics |
| `godie-h01n.w` | 給予目標額外200/350/500/650傷害。 | castType 是 "self"。abilitySystem.ts:214 的 `case "self": targets = [caster]`，而 damage.ts:138 | 按下 W：付 80–320 MP、進 60 秒冷卻、然後自己掉 200–650 血，敵人一點事都沒有。滿級 W 幾乎是一鍵自殺。這是這位英雄最嚴重的一條。 | high | wrong-semantics |
| `godie-h01n.w` | (若對方在 [破魔] 狀態，則額外造成 100% [AP] 傷害) | hook 本身寫對了（on: onAbilityHit / abilitySlot: W / condition status target magic-break / ratio | 這一招的招牌 combo（Q 破魔 → W 追加 100% AP）在遊戲裡一次都不會發生。JSON 讀起來完全正確、後台畫得出來、卡片文案也對——只有實際判定不同意（失敗形態②）。 | high | missing |
| `godie-h01n.w` | (卍解 [變身] 狀態下傷害額外追加 200% [AP]) | 整句沒有任何欄位。JSON 裡沒有第二條 hook、沒有 whileForm、沒有任何形態閘。⚠️ 這不是 engine-gap：`ability@1.passive.ranks[ | 卍解（R）開下去之後，W 的傷害跟沒開一模一樣。玩家看到說明寫「額外追加 200% AP」，實測數字完全不變。 | high | missing |
| `godie-h01u.e` | 有效半徑6 | JSON 完全沒有 `radius` 欄位。這支是 `castType:"ground"` + `castTimeSec:0.3`，所以吟唱結束時走 systems/CastRes | 單看傷害沒事，但它把下面那一句的觸發面積砍掉 99%：一條 10×2 的直線最多打 5 個人，而只有**站在滑鼠落點 0.6 單位內**的那一個會被判定為 onAbilityHit | high | condition-lost |
| `godie-h01u.e` | (若對方在 [破甲] 狀態，則額外造成 100% [AP] 傷害) | 三件事同時不對：①hook 的 payload 多了一個規格沒有的 `"flat": 50.0`（規格只寫 100% AP，沒有固定值）；②它掛在 `onAbilityHit`，而 | 這是呂布的招牌 combo（W 破甲 → E 爆發），實戰中幾乎不會發生一次。就算隊友提供了破甲，也只有站在落點正中心的那一個敵人吃得到追加，而且吃到的是「50 + 100% AP | high | half-done |
| `godie-h01u.r` | [AP] 與 [AD] 暫時提升至 150/200/250% | 逐階數列被壓成單一值：applyBuff.modifiers 只有 `ap pctAdd 1.5` 與 `ad pctAdd 1.5`，三階全部一樣。引擎有現成的逐階格（apply | R 點到 2 級、3 級完全沒有變強（冷卻與 MP 還照樣往上跳：MP 250→400→550）。玩家為第 2、3 階付了 150 / 300 點魔力卻買到一模一樣的加成。 | high | rank-collapsed |
| `godie-h01u.r` | [攻擊時]與 [受傷時] 都有 20%[機率]使出弒鬼神反擊，持續 8秒。 | 兩條 hook 寫在 `passive.ranks[0].hooks` 裡。sim/abilities/abilityPassives.ts L256–293 的 `syncAbi | 呂布從 R 學會的那一刻起，每次普攻與每次挨打都有 20% 機率免費放出弒鬼神（payCosts:"none"、respectCooldown:false，ICD 只有 0.5 秒 | high | condition-lost |
| `godie-h01u.w` | 並 [擊退] | `knockback` 沒有寫 applyTo，預設是 "target" = `ctx.targets`（sim/effects/knockback.ts L229）。而這支是 ` | 按下 W：敵人挨傷害但站得動也不動，呂布自己往後滑一小段並短暫不能操作。說明寫的「擊退」在敵人身上一次都不會發生，而玩家會以為是自己被反打。 | high | wrong-semantics |
| `godie-h01u.w` | 及造成敵人 [破甲]，持續1秒 | `applyStatus{statusId:"armor-break", duration:1}` 同樣沒寫 applyTo，走 `ctx.targets`（sim/effects | 雙重傷害：①敵人永遠不會被破甲；②呂布每放一次 W 就自己掉一秒護甲。更嚴重的是連鎖——80-03 鬼神烈戟的「若對方在[破甲]狀態則額外 100% AP」在他自己的技能組裡**沒 | high | wrong-semantics |
| `godie-h02k.e` | 但也會有 2% [機率] 拔到重要部位的毛，[自爆] 損失現存 50%生命。 | **整段下修完全不存在**。四階的 hook 各自只有一個 `applyBuff{as, pctAdd}`，沒有第二個 hook、沒有 2% 的 chance、沒有任何 `dama | 這支技能變成**純增益、零風險**：受傷時 4% 機率白拿 200~350% 攻速 4 秒，說明寫的那個「拔到重要部位會自爆掉一半血」永遠不會發生。玩家讀到的是一個高風險高回報技能 | high | missing |
| `godie-h02k.ex` | 有1/6的機會讓對方...死亡 | 死亡分支用 `devour{thresholdPctOfMax:[0.5]}`，而 `devour.ts:76` 是 `if (hp.hp > hp.maxHp * pct) co | 對滿血敵人開槍，1/6+1/6 的兩格「死亡」分支**什麼事都不會發生**（沒傷害、沒狀態、沒訊息）—— 花了 666 MP 與 10 秒冷卻，畫面上完全沒有回饋。只有打殘血敵人時 | high | wrong-semantics |
| `godie-h02k.ex` | 有1/6的機會讓對方或1/6自己死亡 | **「自己死亡」那一半完全不存在。** 兩個 devour 分支都吃 `shapeTargets(shape:"single")` = `ctx.targets` = 被指定的敵人 | 俄羅斯輪盤**對自己完全無害**。整個技能的賭博張力（可能轟到自己）消失，變成一發沒有代價的控制技。 | high | missing |
| `godie-h02k.ex` | (敵方 [致盲] 狀態下對方的死亡[機率]提升到 2/6) | 沒有任何 `condition` 葉。`weightedBranch.branches` 的 weight 是寫死的 1/1/4，沒有第二個帶 `condition{kind:"s | 先用 passive/Q 掛上致盲再開槍，死亡機率不會有任何變化 —— 這條 combo 路線是說明畫出來的，遊戲裡不存在。 | high | condition-lost |
| `godie-h02k.ex` | (敵方 [混亂] 狀態下對方的死亡[機率]提升到 3/6) | 同上，完全沒有落點。（而且 W 的混亂本來就沒實作，R 的混亂要靠致盲先上 —— 這條 combo 的前置也是斷的。） | 混亂狀態下開槍死亡機率不變。這支英雄整套「暈眩→燃燒→致盲→混亂→輪盤加成」的狀態鏈，最後兩環全部斷掉。 | high | condition-lost |
| `godie-h02k.passive` | 並造成敵人 1%生命傷害的 [燃燒] 狀態，持續5秒。 | 只有 `applyStatus{statusId:"burn", duration:5}`，是一個**純標記**。沒有任何 `dot` / `resourcePct` 欄位承載「1 | 敵人身上會出現【燃燒】圖示 5 秒，但一滴血都不會掉。技能說明承諾的持續傷害完全不存在。 | high | missing |
| `godie-h02k.q` | 造成 10倍 [暴擊] 傷害 | **整個 `damage` 效果不存在**。這支 Q 的 hook effects 陣列裡只有 `applyStatus{stun}` 一項，四階全部一樣。10 倍暴擊沒有任何欄位 | 觸發頭槌時敵人只是被暈 1 秒，**一點傷害都沒有**。這是 Q 的主要輸出，等於這支技能只剩一個 3~6% 機率的暈眩。 | high | missing |
| `godie-h02k.w` | 會胡亂噴放排泄物使[周圍][範圍] 敵人造成 [癱瘓] 及 [詛咒]。 | ⛔ **兩個 applyStatus 打在熊貓自己身上，不是周圍敵人。** hook 是 `target: "self"`，`hooks.ts:519` 把 `ctx.target | 每次 3% 反彈觸發，熊貓**自己被暈眩 1 秒 + 自己中詛咒 5 秒（50% 失手）**，而周圍敵人只吃 1 點傷害、沒有任何控制。這支技能是淨負面的：觸發越多次死得越快。 | high | wrong-semantics |
| `godie-h02k.w` | (敵方 [致盲] 狀態下額外追加 [混亂] 狀態，持續 10秒) | 整句**完全沒有落點** —— W 的 JSON 裡沒有第二個 hook、沒有 `condition`、沒有 confusion 的 applyStatus。同一支英雄的 pass | 對致盲中的敵人反彈時，說明承諾的 10 秒【混亂】永遠不會發生。 | high | condition-lost |
| `godie-h02k.w` | 使[周圍][範圍] 敵人造成 [癱瘓] | 施加的是 `statusId: "stun"`（暈眩），不是 `paralysis`（癱瘓）。而 `content/status-effects/paralysis.json` 的 | 就算修好上面的自傷 bug，敵人吃到的也是通用【暈眩】而不是【癱瘓】—— 任何一條問「身上有沒有 paralysis」的條件葉都會對這支說謊。 | high | wrong-semantics |
| `godie-h02v.e` | 每秒受到20/30/40/50+ 30% [AP] 傷害，持續3秒 | 寫成一發即時的 damageLine，沒有任何 dot。「每秒 × 3 秒」被壓成「一次」。 | 總傷害只有卡片承諾的 1/3（滿階 50+30%AP 一次，而不是 3 次）；而且變成瞬間爆發而不是持續燃燒，敵人沒有「趕快走出去」的互動。 | high | wrong-semantics |
| `godie-h02v.e` | 附帶 [破魔] 降低魔抗 50% | 只有 applyStatus{statusId:"magic-break", duration:3.0}，**沒有任何一格在降魔抗**。而 content/status-effec | 「降低魔抗 50%」寫在技能說明上，但敵人的魔抗一點都不會掉。草泥馬（AP 型）以及隊上任何法系角色都拿不到這支技能宣稱的最大價值。⚠️ 同型缺陷也在 godie-h01n.q / | high | missing |
| `godie-h02v.q` | 每秒 [回復] 1/2/3/4% 生命 | 寫成 dot{damageType:"true", amountPerTick:{flat:-1.0}}，靠「負傷害＝治療」。引擎不是這樣：dotTick 推一個 amount 為 | Q 是一支「定身自己 6 秒換回血」的技能。回血那一半一滴都沒有，玩家花 60 秒冷卻 + 340 魔力把自己定在原地 6 秒不能動不能打，只換到 armor +20。這是把技能從 | high | wrong-semantics |
| `godie-h02v.q` | 每秒 [回復] 1/2/3/4% 生命 | 就算符號修對了，數值也不對：規格是「最大生命的 1/2/3/4%」（逐階），JSON 是一個寫死的 flat 1 點。restore.healthPct 正是 0..1 的最大生命 | 滿級 Q 應該 6 秒回 24% 最大生命（一個 3000 血的英雄 = 720），現在的寫法即使能生效也只有 6 點，差 100 倍以上；而且 1 階和 4 階完全一樣。 | high | rank-collapsed |
| `godie-h02v.r` | 將[周圍] [範圍] 敵人附加 [緩慢] 及 [致盲]，持續6秒 | ⛔ 兩個 applyStatus（slow40 moveSpeedMult:0.5、blind missChance:0.5）落在**施法者自己身上**，敵人一個都拿不到。這支技能 | 按下 R（90 秒冷卻、540 魔力）之後：**自己**移速砍半、**自己**普攻 50% 失手，持續 6 秒，敵人只吃到 1 點魔法傷害且沒有任何減益。這是一支會反傷自己的大招， | high | wrong-semantics |
| `godie-hapm.ex` | 每次造成 100% [AP] +自身[最大生命] 3% 傷害 | 「自身最大生命 3%」那一項**沒有寫**，取而代之的是規格裡不存在的 `"flat": 50.0`。引擎有現成欄位：`damage.resourcePct`（`dynamicTe | 9 刀合計少掉 27% 自身最大生命的傷害，換成 9×50 = 450 的固定值。這支 EX 的坦克向 build（堆血量換傷害）整條路線消失，而且說明寫的數字跟實際打出的完全對不 | high | missing |
| `godie-hapm.passive` | 受到致命傷害時消耗一層試煉 | 文件的 marks[0] 只有 markId/initial/max/durationSec/resetOn —— **沒有 `lethal` 規則**，全 repo `grep  | 這支天生技的核心「十二條命」**完全不存在**。玩家挨到致命一擊就是直接死，十二層【試煉】從頭到尾一層都不會少（沒有任何 effect 會 consumeMark）。技能說明承諾的 | high | missing |
| `godie-hapm.passive` | 並[擊退]並[暈眩] 0.5秒 [周圍]敵人 | `knockback` 與 `applyStatus{stun}` 兩格都寫在 `hooks[0]` 底下，而那條 hook 是 `target: "self"`。`sim/eff | 就算把觸發條件修好，擊退與暈眩也是打在自己身上（把自己推開 + 自己暈 0.5 秒），周圍敵人完全不受影響 —— 反效果。順帶一提 `content/status-effects/ | high | wrong-semantics |
| `godie-hapm.passive` | 每失去一層試煉，永久提升10%攻擊力與10%[最大生命] | 寫成 hook 裡的一格 `applyBuff{ad pctAdd 0.1, maxHealth pctAdd 0.1, duration 99999}`。三個問題：①觸發條件是「 | 該給的成長給不到（層數不會掉），不該給的無限給（殘血站著就每 1.5 秒永久 +10% 攻擊 +10% 最大生命，疊到天荒地老）。這一條同時是缺陷與破壞平衡的漏洞。 | high | wrong-semantics |
| `godie-hapm.q` | 期間每承受自身[最大生命]5%的傷害，「狂怒」持續時間延長2秒 | `extendBuff` 那一格寫了 `stackKey: "rage"`，但主動效果的 `applyBuff` **只填了 `statusId: "rage"`，沒有 `stac | 狂怒**永遠只有 6 秒**。整支技能的識別性機制（越挨打越久）一次都不會發生，而畫面上跟正常一模一樣（狂怒圖示照樣在、buff 照樣生效），只是計時器不動。 | high | missing |
| `godie-hapm.q` | 提升60/90/120/150% [攻擊速度] | `applyBuff.modifiers[0]` 只有單一 `value: 0.6`，四階全部拿第 1 階的量。引擎有現成的格子：`schema/effect.ts:2032` 的 | Q 點到 4 級跟 1 級的攻速加成一模一樣（都是 +60%），只有魔耗變貴。升級這支技能除了滿階以外**沒有任何收益**。 | high | rank-collapsed |
| `godie-hapm.q` | 與10/15/20/25%[吸血] | 同上，`modifiers[1]` 只有 `value: 0.1`，逐階數列被壓成單一值。 | 吸血永遠 10%，四階都一樣。 | high | rank-collapsed |
| `godie-hapm.r` | 向前[衝刺]一小段距離後揮出致命的一擊 | `dash` 與 `damageArea` 是 `effects[]` 裡的兩個**平行**效果，兩格在同一 tick 一起跑。`damageArea.ts` 的 `areaCen | 衝刺跟那一刀**脫節**：人衝到 5 單位外，傷害圈卻炸在原地。玩家追著敵人衝過去，敵人一格血都不掉；反而是他剛剛站的地方旁邊的人被打。 | high | half-done |
| `godie-hapm.r` | (若敵人具有[恐懼]狀態，則額外追加 自身[最大生命]25%傷害) | 整段沒有落點。兩個零件引擎都有而且都在 `damageArea` 上：`victimCondition`（`damageArea.ts:69` 的 `selectVictims`， | EX（會上恐懼）→ R 的處決連招完全沒有加成，R 對被恐懼的敵人和沒被恐懼的敵人傷害一模一樣。 | high | condition-lost |
| `godie-hapm.w` | (若自身在 [狂怒] 狀態則額外附加受到 [範圍] 傷害的敵人 [恐懼] 狀態，持續 3秒) | 整段**完全沒有落點** —— JSON 裡找不到任何 condition、也找不到任何 `applyStatus{statusId:"fear"}`。兩個機制引擎都有：條件葉 ` | Q→W 的連招收益（狂怒中丟人會範圍恐懼）不存在。玩家照說明先開 Q 再放 W，什麼都不會發生。 | high | missing |
| `godie-hapm.w` | [主動][指向]…將敵方目標抓回再暴力的丟出去 | `castType` 是 `"ground"` 而不是 `"targeted"`。`abilitySystem.ts:251-266` 的 ground 分支把 `targets` | 這支「指向」技能實際上是「點地板，如果剛好有敵人站在離落點 0.6 單位以內才會被抓」。滑鼠只要偏一點點就整支技能空放（冷卻 45 秒、魔耗照扣）。另一面，落點上站了兩個人時**兩 | high | wrong-semantics |
| `godie-e002.e` | 60秒冷卻 吟唱1秒 | castTimeSec: 0.4，規格寫 1 秒。 | 前搖只有規格的 40%，敵人反應窗口少掉 0.6 秒；這一招是 950 + 100%AP 的主力，前搖長度直接決定它躲不躲得掉。 | medium | wrong-semantics |
| `godie-e002.w` | 強化劍刃的攻擊力，造成1.4/1.6/1.8/2倍[暴擊]傷害 | 逐階倍率本身正確（critDamage op:override 1.4/1.6/1.8/2.0）。但多了兩樣規格沒有的東西：①critChance flat 1.0（規格從沒說 1 | 1 階開結界，暴擊反而比不開還弱（1.4 < 1.75 基礎）；同時多了一份說明書上沒有的每擊追傷，玩家算不出自己的傷害從哪來。 | medium | half-done |
| `godie-e00r.e` | 每8秒生成一個可抵擋150/250/350/450點魔法([AP])傷害的[護盾]，[護盾]不會疊加。 | 「[護盾]不會疊加」這一句沒有任何欄位在做。四階的 shield 效果都只寫了 {amount, duration:8, absorbs:"magic"}，沒有 stackKey  | 文案承諾的「不會疊加」是一條平衡保證。今天靠「持續時間剛好等於間隔」意外達成，一旦 owner 在後台把 internalCooldown 調短（例如每 4 秒）或把 durati | medium | condition-lost |
| `godie-e00r.ex` | [攻擊速度]提升至最上限 10 | 寫成 capRaise 10 + pctAdd 4.0 兩條。capRaise 那條是對的（把天花板抬到 10，DEFAULT_STAT_CAPS 的 unlocked 就是 10 | 說明寫「提升至最上限 10」，實際上限被解開了但值上不去 —— 面板顯示的攻速永遠比 10 低一截，而且會隨玩家買不買攻速裝浮動（規格描述的是一個固定值）。 | medium | half-done |
| `godie-e00r.ex` | [暴走]的門檻降為低於自身[最大生命] 20% | 「降為」沒有實作成「改寫天生技的門檻」，而是把整支天生技複製一份、把 condition.value 從 0.05 改成 0.2 掛成第二個獨立 hook（連 internalCo | 規格說的是「同一個暴走，門檻變寬」；實作給的是「兩個各自獨立的暴走」——一場裡可以在 20% 觸發一次完全暴走、再掉到 5% 又觸發一次普通暴走，兩份 buff 還會同時掛在身上（ | medium | wrong-semantics |
| `godie-e00s.ex` | [召喚] | EX 只是引用 R 的樹精，而 R 本身就沒有真的召喚（見 70-04）。 | 同 R：說明寫召喚，畫面上沒有實體。tag_gate WAIVERS 已記。 | medium | missing |
| `godie-e00s.passive` | [防禦]增加2倍 | godie-e010 的 armor = 10，本體 armor = 2 → 實際是 5 倍不是 2 倍。JSON 裡沒有任何一格在表達「2 倍」這個關係（w3u 抄過來的絕對值取 | 紮根形態的減傷比說明多 1.5 倍防禦；而且因為是絕對值不是倍率，之後調本體 armor 或吃了防具，「增加2倍」這句話會朝任意方向再錯一次。 | medium | wrong-semantics |
| `godie-e00s.passive` | [力量]增加10點 | godie-e010 的 attributes.str = 17，與本體 godie-e00s 的 str = 17 **完全相同**。沒有 +10，也沒有任何 grantAttr | 紮根後 AD 一點都不會漲（AD = base + 1×STR，見 sim/stats/attributes.ts:269），而說明承諾 +10 力量 = +10 AD。而且 Q  | medium | missing |
| `godie-e00s.r` | 在[周圍][範圍]隨機[招喚]樹精 | 沒有任何實體被召喚 —— `randomArea` 只是在地上排一串落點傷害。引擎有 `sim/effects/summon.ts` 這個 kind，所以不是引擎沒有。 | 說明寫「召喚樹精」，畫面上不會出現任何樹精，只有一串爆點。這在 tag_gate 的 WAIVERS 裡註記為「owner 待裁決」。 | medium | missing |
| `godie-e00s.w` | [每次普通攻擊]皆能造成[小範圍] 30/40/50/60% [擴散]傷害 | 四階的 `amount` 都額外帶了 `flat: 30.0`，而且**四階都是 30**（不隨階數變）。規格只講百分比，沒有任何固定值。看起來是產生器把數列的第一個數字「30」同 | 1 等時 AD≈32，規格要的擴散是 9.6，實際打出 39.6 —— 是規格的 4 倍，而且這 30 點在滿階時仍在（60% 那階變成 30+19.2）。早期每一次普攻都多噴一圈 | medium | wrong-semantics |
| `godie-e00w.ex` | [裝備了某類道具時]／使用從者道具「御雷劍」的剎那 | condition 寫成 `{kind:"equipment", subject:"self", tag:"legendary"}` —— 任何一件傳說級道具都會滿足它。引擎的 ` | 任何一件 legendary 道具（cleaver-of-the-warden、endless-edge⋯ 現有一整排）都會啟動這支 EX。玩家買錯東西也能觸發，而說明寫的是一件s | medium | condition-lost |
| `godie-e00w.r` | 70秒冷卻，施展時間2秒 | `castTimeSec: 0.5`，規格寫的是 2 秒。schema 對這一格只有 `.min(0)`（content/schema/ability.ts:625），沒有上界，2 | 這是決戰奧義，2 秒的施展時間是它的**代價**（也是敵人反應/打斷的窗口）。0.5 秒讓一發 600/800/1000+60%AD 幾乎變成即時技。#233 的向天光束預告只會亮 | medium | wrong-semantics |
| `godie-e00w.w` | 造成[範圍內]敵方10% [AP]傷害 | amount 是 `flat:50` + `ratios:[{stat:"ap",coeff:0.1}]`。規格只寫了「10% [AP]」，那個 50 點固定傷害在規格裡不存在。 | 這位英雄的 baseStats.ap = 0 且 growth 沒有 ap，所以在不買法傷裝的情況下，落雷的傷害**幾乎全部**來自那個規格沒寫的 50。說明寫「10% AP」的技 | medium | wrong-semantics |
| `godie-e00w.w` | 並且附加落雷，造成[範圍內]敵方10% [AP]傷害 | `damageArea` 沒有寫 `includeOrigin: true`。sim/effects/damageArea.ts:52 的預設是「震央那個人**不再吃一次**」（` | 1v1 時（決鬥區的常態）落雷**一滴傷害都不會造成** —— 圈內唯一的敵人被排除掉了。畫面上雷照樣打下來（vfxKey 有綁），傷害是 0。這正是「形狀看起來完全正常但傷害是  | medium | condition-lost |
| `godie-edem.e` | 45秒冷卻，吟唱2秒 | 出貨檔 `castTimeSec: 0.3`，規格要 2 秒。（⚠️ 而且 md 稽核文件裡那一份 JSON 副本**根本沒有 castTimeSec 這一格** —— 兩份不一致 | 一支設計上要 2 秒讀條、對手看得到、閃得掉的爆發技，實際 0.3 秒就打出去。owner 想要的「千鳥要蓄力」節奏整個不見，而且對手沒有反應窗口。 | medium | wrong-semantics |
| `godie-edem.e` | 以高速[直線][衝刺]，對沿途[周圍]敵人造成400/500/600/700+100% [AP]點傷害。 | 「沿途」沒有實作。`dash` 只負責位移，`damageArea` 是**同一 tick** 在落點解算的一顆圓（centre 退回 `ctx.point`，radius 6）， | 12.83 距離的衝刺，只有終點那 6 單位的圓吃傷害 —— 起點附近與路徑中段被衝過去的敵人完全不痛。玩家會以為技能「穿過去沒打到」。 | medium | wrong-semantics |
| `godie-edem.passive` | [被動][反彈][機率]　…有20%[機率][反彈]魔法([AP])傷害。 | 沒有 `negateOriginal`。owner 2026-08-09 對這一支的裁決逐字寫在 packages/shared/src/sim/combat/damage.ts: | 寫輪眼觸發時畫面上有反彈、血還是照扣。owner 心目中「20% 機率完全看穿一發忍術」的手感一次都不會出現。 | medium | missing |
| `godie-efur.w` | 對指定敵人造成40/60/80/100 + 目標[最大生命]6/8/10/12%的傷害 | JSON 反而多了一項規格沒寫的 `ratios:[{stat:"ad",coeff:0.5}]`（0.5×施法者攻擊力）。它是重製前那一版的殘留，重製後的說明文字沒有提到任何 A | 實際傷害比卡片寫的多一項（隨 AD 成長），而『缺最大生命%、多 0.5AD』兩個錯誤方向相反，會讓平衡數據看起來『差不多』而更難被發現。 | medium | wrong-semantics |
| `godie-emfr.e` | 普通攻擊附加 60/90/120/150 + 40% [AP] 火焰傷害 | passive.ranks 只有一格，payload `flat: 60` 寫死，沒有 perRank。 | E 升到 4 級普攻附加傷害仍是 60（卡片寫 150）。 | medium | rank-collapsed |
| `godie-emfr.e` | 對[周圍]敵人造成 100/150/200/250 +60% [AP] [範圍]傷害 | 同上，damageArea 的 `amount.flat` 寫死 100，沒有 perRank。 | 爆炎範圍傷害四階都是 100（卡片寫 250）。 | medium | rank-collapsed |
| `godie-emfr.e` | ([變身]為唯一狀態不可疊加) | applyBuff 沒有 exclusiveGroup。 | 同 15-02：三個變身可同時掛著。 | medium | missing |
| `godie-emfr.ex` | ([可累加]) | 沒有 stackKey / 層數機制。tag_gate.py WAIVERS 已記（("godie-emfr.ex", "層數累積")）。 | 就算補了 AP 加成，也沒有「連續吸收越吸越強」那一層。 | medium | missing |
| `godie-emfr.ex` | 持續 5秒後歸零 | 那 5 秒是寫在 `applyStatus statusId:"moon-combo" duration:5.0` 上，而 moon-combo 是**別位英雄的狀態**——con | HUD 上會出現一個叫「者、皆、陣 連段」的 5 秒狀態圖示，跟這位英雄毫無關係，而它什麼作用都沒有。 | medium | wrong-semantics |
| `godie-emfr.r` | 造成 150/225/300 + 70% [AP] 雷屬性傷害 | passive.ranks 一格，`flat: 150` 寫死。 | 三階都是 150（卡片寫 300）。 | medium | rank-collapsed |
| `godie-emfr.r` | ([變身]為唯一狀態不可疊加) | applyBuff 沒有 exclusiveGroup。 | 同上。 | medium | missing |
| `godie-emfr.w` | 普通攻擊附加 30/45/60/75 +10% [AP] 雷電傷害。 | passive.ranks[] 只有一個元素，payload 寫死 `flat: 30`。abilityPassives.ts 的規則是「rank N → ranks[N-1]，超 | 就算修好上面那個 condition，4 級 W 的附加傷害仍是 30 而不是 75。 | medium | rank-collapsed |
| `godie-emfr.w` | ([變身]為唯一狀態不可疊加) | applyBuff 沒有 exclusiveGroup / exclusiveOnExisting。effect.ts:1972 的欄位說明逐字點名「15-02/03/04 那種『 | W、E、R 三個變身 buff 可以同時掛著，移速乘區變成 1.2 × 0.5 × 2 逐位元相乘，攻速加成也疊加 —— 規格明說不可疊加。 | medium | missing |
| `godie-emns.ex` | 120秒冷卻，吟唱2秒 | `castTimeSec: 0.5`，不是 2.0。交換機制本身逐字正確（`swapResource` 的 `resource:"health"` 讀的是 `hp.hp` 當前值、 | 規格把這招定位成「置死地而後生」—— 2 秒吟唱是敵方唯一的反應時間（跑出 5.29 距離或打斷）。0.5 秒讓一個殘血夜神月可以幾乎瞬間把血條丟給對手，完全沒有攻防。 | medium | wrong-semantics |
| `godie-emns.passive` | 夜神月的機警，將智慧具現化成魔力[護盾]，可抵擋全部傷害。每點魔力可以抵免3點傷害。 | JSON 寫了 durationSec: 6.0。owner 的規格**完全沒有提到持續時間**，而 `manaBarrier` 的 schema 明文記著 owner 2026- | 護盾在 6 秒後自己消失，之後即使魔力滿的也不再抵傷；15 秒冷卻代表有 9 秒完全裸空。玩家會覺得「我明明還有一大條藍卻在扣血」。 | medium | wrong-semantics |
| `godie-emns.q` | 60秒冷卻，吟唱2秒 | `castTimeSec: 0.3`，不是 2.0。`castTimeSec` 就是這一格（ability.ts:625「cast time (seconds) before ef | 規格承諾的 2 秒吟唱是這支技能**唯一的反制窗口**（打斷／走出 2 距離）。0.3 秒等於瞬發，對手看不到也躲不掉一個 24 秒的 50% 失手詛咒。 | medium | wrong-semantics |
| `godie-ewar.ex` | 30秒冷卻，吟唱2秒 | `castTimeSec: 0.7`（`castTimeFormula.ts` 全域階梯上限 0.9 的次高階）。2 秒沒有落點。 | 同上，系統性問題。 | medium | wrong-semantics |
| `godie-ewar.r` | 60秒冷卻，吟唱2秒 | `castTimeSec: 0.5`（同 W，來自 `castTimeFormula.ts` 的 0.3–0.9 全域階梯，`scored` 類別）。2 秒沒有落點。 | 說明寫的 2 秒詠唱不存在，敵人沒有 2 秒的反應窗。系統性問題，非 ewar 專屬。 | medium | wrong-semantics |
| `godie-ewar.w` | 60秒冷卻，吟唱3秒 | `castTimeSec: 0.3`。這一格不是 3 秒，也不是被 3 秒推導出來的 —— 它由 `packages/shared/src/content/castTimeForm | 規格要的是「一段可以被打斷、對手看得到、值得繞過去打斷你的 3 秒詠唱」，實際是 0.3 秒瞬發。這支技能的風險成本整個消失。⚠️ 這是**全 90 支共通的系統性政策**，不是  | medium | wrong-semantics |
| `godie-h00l.ex` | 若 [完美盾反] [反彈]成功，冷卻立即重置。 | 整段沒有實作：EX 文件裡只有一條 `onDamageTaken` hook，沒有任何 `onReflectSuccess` hook、也沒有 `modifyCooldown`（引 | EX 與 R 之間的連動（用大絕接招來把保命技刷回來）不存在，這位英雄的核心 combo 少了一半。⚠️ 而且它現在是**雙重死路**：就算補了這條 hook，R 那邊根本不會反彈 | medium | missing |
| `godie-h00l.passive` | 並且造成 [淨化] 效果。 | 有 `{kind:"dispel", shape:"single", pools:{status:true}, count:1}`，掛在 `target:"event"`（＝被普攻 | 這一格現在是**幫敵人解狀態**：你普攻對方一下，就順手把你自己隊友貼上去的燃燒／減速／暈眩清掉一層。玩家看到說明寫[淨化]會以為是剝掉敵人的增益（WC3 Purge 的語意），實 | medium | wrong-semantics |
| `godie-h00l.r` | 持續3秒 | `duration: 3.0` 確實存在，但它是掛在上面那個無作用的 moon-combo 上。真正該有窗口的東西 —— `onReflectSuccess` 那條 hook —— | 就算未來把反彈補上，「回復 + 擊退」也會在**任何**反彈成功時觸發（例如靠道具反射之盾彈到的那一發），而不是只在按了 R 的那 3 秒內 —— 大絕的開關失去意義。 | medium | condition-lost |
| `godie-h00l.r` | 期間若成功[反彈]敵方技能[AP]傷害 | hook 是裸的 `{on:"onReflectSuccess", target:"self"}`，沒有填 `reflectedDamageSource` / `reflected | 「反彈到技能的 AP 傷害才回血」這個判定條件不存在，變成任何反彈成功都回血。設計上的取捨（要接對面的大招才有獎勵）整個消失。 | medium | condition-lost |
| `godie-h00l.r` | 60秒冷卻 吟唱2秒 | 冷卻 `[60,60,60]` 對；**吟唱 2 秒沒有**：出貨的 `godie-h00l.r.json` 是 `castTimeSec: 0.4`（而且 docs 那份 md  | 「瞬間架起」與「吟唱 2 秒」本來就是這支技能的風險設計（要預判、被打斷就沒了，`interruptOn` 也沒設）。現在 0.4 秒就開完，玩家與對手的攻防節奏跟說明完全不同。 | medium | missing |
| `godie-h00l.w` | [直線]距離勾住一個單位，自身[跳躍]過去，並給予 150/250/350/450傷害。 | 寫成 `castType:"ground"` + `{kind:"leap", mode:"toPoint", applyTo:"self", throwDistance:11,  | 技能變成「往地上一個點跳過去，落地炸一圈」。玩家想勾住正在跑的敵人時，只要對方在你跳躍的 0.4 秒內走出落點 3 單位，這一發就是 0 傷害、0 控制；相對地打人堆時又會一次打到 | medium | half-done |
| `godie-h01n.passive` | 有效半徑6 | JSON 的 aura radius 寫 4.5，不是 6。4.5 是 aoe-tiers 的「中」級距值；規格同一段的另一句寫「[降低]小 [範圍]」，而「小」= 3。所以 4. | 靈壓光環的實際影響圈比說明書寫的 6 小 25%（而且還要再乘 combatEnv.abilityRange 0.8 → 實際 3.6）。玩家照著說明站位會以為自己在範圍外還安全， | medium | wrong-semantics |
| `godie-h01n.q` | 造成 [範圍] 敵方單位 [破魔] | 「範圍」沒有落點。ability 頂層沒有 `radius`，而 ground 技的 ctx.targets = enemiesInCircle(落點, def.radius ?? | 說明寫「範圍敵方單位」，實際是單體。衝進三個人中間放 Q，只有一個人（甚至可能沒人）中【破魔】。 | medium | condition-lost |
| `godie-h01u.passive` | [攻擊距離] 永久提升0.01，上限到10。 | 「上限到10」完全沒有落點。applyBuff 只有 modifiers + duration:99999，沒有 maxStat、也沒有 stackKey。引擎為這一句準備的欄位是 | 擊殺成長沒有天花板。殭屍波每回合幾十殺，累積下去攻擊距離（或攻速，規格這句斷在哪一項本身有歧義）會無限往上爬，而卡片上寫著「上限到10」。反過來說，因為每殺只有 +0.01，要碰到 | medium | missing |
| `godie-h01u.q` | 每次 [普通攻擊時] 都會增加 10% [攻擊速度] 並可[疊加] | applyBuff 沒有 stackKey / maxStacks。疊加是「偶然成立」的：沒有 stackKey 時 source id 是 `buff:${origin}#${w | 高攻速下（呂布 EX 把攻速上限開到 10，正是這支的搭配）多個攻擊在同一 tick 結算時會少疊一層；而且層數無上限，攻速可以無限自我加速直到撞 cap。 | medium | half-done |
| `godie-h01u.r` | 持續 8秒 | applyBuff duration 8.0 只涵蓋 AP/AD 那一半；上一條的兩個 proc 不在這個窗口內。列成獨立一筆是因為規格的「持續8秒」在文法上同時修飾兩件事，而 J | 同上——玩家按下 R 之後看到的「8 秒」倒數只對數值加成成立。 | medium | condition-lost |
| `godie-h02k.passive` | (敵方 [暈眩] 狀態下額外追加 [致盲] 狀態，持續 5秒) | 追加致盲被寫成**第二個獨立的 onBasicAttack hook，帶自己的 `chance: 0.03`**。規格的「額外追加」是「在那 3% 觸發的那一下**之上**再加」， | 打暈眩中的敵人時，門牙暴擊與致盲幾乎永遠不會同時發生（0.03×0.03=0.09%）；反過來致盲會在沒有觸發暴擊的普攻上單獨冒出來。玩家看到的因果關係跟說明對不上。 | medium | wrong-semantics |
| `godie-h02k.q` | (敵方 [燃燒] 狀態下額外追加 [致盲] 狀態，持續 5秒) | 與 passive 同一個形狀的缺陷：追加致盲是獨立 hook 且帶自己的 `chance`（0.03/0.04/0.05/0.06），不是掛在頭槌觸發之上。 | 致盲與頭槌幾乎不會同時出現，且會在沒觸發頭槌的普攻上單獨發生。 | medium | wrong-semantics |
| `godie-h02v.e` | 造成[前方][一直線] [範圍] 敵人…附帶 [破魔] | applyStatus 是 damageLine 的**兄弟效果**而不是 damageLine.onHitTargets 的下游，所以它落在 ctx.targets 上。這一段跑 | 一直線上被噴到的其他敵人只吃傷害、不吃破魔；破魔只掛在剛好打了草泥馬的那一個人身上（即使他站在線外）。「[範圍]…附帶[破魔]」的範圍那一半沒有發生。 | medium | condition-lost |
| `godie-h02v.ex` | 對 [周圍][範圍]敵人單位造成 2%[最大生命] + 100% [AP] 傷害 | 「2% 最大生命」那一項**完全沒有落點**，被換成一個規格裡沒有的 flat: 50.0。damageArea 有 resourcePct 這一格（content/schema/ | 對高血量目標的傷害整段消失（3000 血的敵人本來每秒該多吃 60，6 秒共 360），改成不管對誰都固定 50。EX 的「打肉」定位被抹掉，而卡片上那句 2% 最大生命是假的。 | medium | missing |
| `godie-h02v.q` | [防禦] 提升20/40/60/80 | applyBuff.modifiers 只有一筆 {stat:"armor", op:"flat", value:20}，四階共用。applyBuff 的 schema 有 per | 點滿 Q 的護甲加成只有 20 而不是 80。玩家把技能點投進 Q 之後，除了魔耗變貴（160→340）什麼都沒變好。 | medium | rank-collapsed |
| `godie-h02v.r` | 攻擊身上有 [致盲] 標記的敵人將額外附加 100/200/300% [AP] 傷害 | maxRank 是 3，但 passive.ranks 只有 **1** 筆。sim/abilities/abilityPassives.ts:131 是 `p.ranks[Mat | R 點到 2/3 階時追加傷害仍然只有 100% AP，而卡片寫 200%/300%；玩家把大招點滿只換到更貴的魔耗。另外每次追加都憑空多打 50 點。 | medium | rank-collapsed |
| `godie-hapm.e` | 附加 [麻痺] 效果，持續0.6秒 | 寫成 `applyStatus{statusId:"slow40", moveSpeedMult:0.5}` —— 一個 50% 減速。而 `content/status-effe | 說明寫【麻痺】，玩家預期對手被定住／打斷；實際上對手只是走慢一點，照樣可以攻擊與施法。近戰英雄靠這支黏人的功能整個不存在。 | medium | wrong-semantics |
| `godie-hapm.ex` | 120秒冷卻，吟唱2秒 | `castTimeSec` 出貨值是 **0.5**（md 那份副本連這一格都沒有）。另外 9 段斬擊是 `delayed{delaySec:0.1, count:9, inter | 說明承諾 2 秒吟唱（可被打斷／可反應），實際 0.5 秒就開砍，而且砍的期間人是無敵的（規格沒寫無敵）。 | medium | wrong-semantics |
| `godie-hapm.ex` | 最後一擊附加 [擊退]一小段距離 | `finalEffects` 的 `knockback{distance:3.0}` 沒有填 `launchDistance`，所以走 `knockback.ts:276-285` | 在射程邊緣放 EX 時最後一擊的擊退**完全不會發生**；貼臉放才推得動，而且推的距離隨兩人距離縮水。同一支技能在不同距離表現不一致，玩家會以為是隨機失效。 | medium | half-done |
| `godie-hapm.passive` | 進入 [無敵] 狀態1.5秒，隨後 [回復] 50%[最大生命] | `invulnerable{1.5}` 與 `restore{healthPct 0.5}` 兩格都在，但是①掛在同一條會在死後才跑的 hook 上（見第一條），②`restore | 就算修好觸發，回血也是在無敵開始的那一瞬間就補滿，而不是撐完 1.5 秒無敵之後才回 —— 對手完全沒有「趁無敵結束前拉開」的窗口。 | medium | half-done |
| `godie-hapm.r` | 120秒冷卻，吟唱2秒 | `castTimeSec` 出貨值是 **0.3**，規格是 2 秒 —— 差 6.7 倍。（md 文件那份副本同樣沒有這一格。） | 一支說明白紙黑字寫「吟唱 2 秒」的大招實際上幾乎是瞬發。對手完全沒有規格承諾的 2 秒反應時間（打斷／位移／開無敵），這是一個直接影響對局公平性的落差。 | medium | wrong-semantics |
| `godie-hapm.w` | 使之撞擊[前方]一[直線][範圍]的敵人 | 用的是 `leap.landRadius: 4.95`，也就是落點的一個**圓形**爆點（`movement/leap.ts:182`「landing burst radius」） | 傷害形狀是落點周圍一圈而不是「被丟出去那一路撞過去的直線」，站在拋物線中段的敵人不會被撞到，站在落點後方的反而會。 | medium | wrong-semantics |
| `godie-e002.e` | 對[前方][直線]敵人造成 350/550/750/950 + 100% [AP]點傷害 | damageLine 的數列、AP 係數、length/fromCaster/aim 都對，但多了規格沒有的 maxTargets: 5。 | 一條穿過 6 人以上的直線只會打到 5 個，規格沒有這個上限。實戰 3v3 幾乎碰不到，但混戰有殭屍波時會。 | low | condition-lost |
| `godie-e002.w` | 以多層纏繞的風改變光線折射，隱藏劍身 | 沒有任何隱形/隱藏對應欄位（引擎有 ENTITY_FLAG INVISIBLE 與 stealth.ts）。 | 純演出層；玩家看不出差別，但說明寫了就不會發生。 | low | missing |
| `godie-e00r.r` | 對[前方][直線]敵人造成750/1200/1650點[真實傷害]。 | damageLine 帶 maxTargets: 5。規格沒有任何人數上限（「對前方直線敵人」= 線上的每一個）。第 3 回合之後場上有殭屍波（maxAlivePerZone 30 | 殭屍海裡放大招，第 6 隻之後的敵人完全不吃傷害，而畫面上光束照樣穿過他們（失敗形態①的近親：打到了但沒扣血）。 | low | condition-lost |
| `godie-e00s.e` | （規格沒有任何傷害子句） | 多了一顆 `damageArea{damageType:"magic", amount:{flat:1.0}}`，顯然是拿來當「選出範圍內敵人」的載體，但因為 applyStatu | 1 點魔法傷害本身不影響平衡，但它會破隱、會觸發對方的 onDamageTaken 類被動、會在浮動傷害數字上跳一個「1」。規格裡沒有這一段。 | low | half-done |
| `godie-e00s.passive` | [攻擊距離]提升到10 | godie-e010 的 baseStats.range = 12.0，規格寫的是「提升到10」。 | 射程比說明多 2 單位。單獨看是平衡問題，但它與上面兩條合起來說明同一件事：紮根形態的四項數值沒有一項是照規格填的，而是直接沿用 w3u 的第二單位定義。 | low | wrong-semantics |
| `godie-e00s.q` | [主動][指向][範圍]（施法距離11） | `spawnProjectile{projectileId:"imported.wave.arcane", onHit:[]}` 的 onHit 是空陣列 —— 投射物飛出去什麼都 | 視覺上球還在飛，傷害已經結算完了。玩家看不出來，但它是「投射物只是裝飾」的一個實例 —— 之後要做「打中才算」或「途中可被閃」時，這格是死的。 | low | half-done |
| `godie-e00s.r` | [指定]…施法距離14 …在[周圍][範圍]隨機 | `randomArea{who:"self"}` 讓落點以**施法者**為中心散開（randomArea.ts:178 `const centre = t?.pos ?? ctx. | 玩家對著 14 距離外的敵人放 R，樹精會全部掉在自己腳邊。⚠️ 誠實記一筆：owner 的規格自己就矛盾（標籤寫 [指定] + 施法距離14，內文寫「在[周圍]」），who:"s | low | half-done |
| `godie-e00w.q` | 給予[周圍]敵人200/300/400/500+50% [AD]點傷害 | `damageArea.maxTargets: 6`。規格沒有任何人數上限；引擎缺欄位時的預設是 DEFAULT_SPREAD_MAX_TARGETS = SPREAD_MAX_T | 半徑 6（範圍級距「大」）的旋風在殭屍波裡只會打到最近的 6 隻。而小怪波的 `maxAlivePerZone` 是 30 —— 一個「由內往外的旋風」在被殭屍包圍時只清掉一小角， | low | half-done |
| `godie-edem.ex` | 有效半徑7.79 | `radiusTier: "大"` = 6.0（7.79 應對「超大」= 8.0）。 | AoE 比卡面小約 23%。 | low | wrong-semantics |
| `godie-edem.passive` | 有20%[機率][反彈]魔法([AP])傷害。 | 多了規格沒有的 `internalCooldown: 0.5`。 | 被連續快速的魔法傷害（DoT tick、多段技）打時，實際觸發率被壓在每 0.5 秒最多一次，遠低於卡面寫的「20% 機率」。 | low | wrong-semantics |
| `godie-edem.q` | 使其每秒受到當下[現存生命]1%的傷害，持續3秒。 | `dot.resourcePct` 的 1%（`subject:target` / `resource:health` / `basis:current` / `perRank:[ | 燃燒每秒實際是「現存生命 1% + 1」，比卡面多 3 點總傷害。體感上察覺不到，但它讓「1%」這個數字不再字面為真。 | low | wrong-semantics |
| `godie-edem.r` | 對目標[周圍][小範圍]敵人造成…傷害 | hook 內的 `damageArea` 沒有 `includeOrigin: true`，而 damageArea.ts:52 的預設會把 `ctx.targets`（= 被千鳥 | 引爆的那個人自己不吃麒麟，只有他旁邊的人吃。一對一時這支 R 等於完全空放。（⚠️ 這是引擎刻意的「震央已吃過觸發那一擊」預設，可能是設計選擇，但規格的「對目標周圍敵人」讀不出這個 | low | half-done |
| `godie-edem.r` | 有效半徑3.67 | 填 `radiusTier: "小"` = 3.0（規格 3.67）。 | 爆炸圈比卡面小約 18%。 | low | wrong-semantics |
| `godie-edem.w` | 有效半徑7.79 | 填了 `radiusTier: "大"`，而 config.aoe-tiers@1 的「大」= 6.0（超大 = 8.0）。7.79 落在「超大」那一格。 | 實際 AoE 比卡面小約 23%，邊緣的敵人打不到。 | low | wrong-semantics |
| `godie-edem.w` | 並使其[攻擊與移動速度][降低]50% | 引用的狀態文件是 `slow40`，它的 name 逐字是「Slow (40%)」、description 是「Movement speed reduced by 40%」，而這一 | HUD 狀態列會顯示「Slow (40%)」，跟技能卡上的 50% 對不起來。 | low | wrong-semantics |
| `godie-efur.e` | 將念形成龍形衝擊波包裹全身，造成[範圍]敵人 150/250/350/450 + 60% [AP] 傷害。 | 傷害、係數、逐階、範圍級距（radius 4.5 / 中）全部對上，圓心也確認是施法者自己。唯一規格沒授權的是 `maxTargets: 6` —— 規格寫『[範圍]敵人』沒有人數 | 第 3 回合之後殭屍潮圍住自己時，只有最近的 6 隻吃到傷害，第 7 隻以後完全免疫，而畫面上的衝擊波是整圈的。 | low | half-done |
| `godie-efur.q` | 並造成[致盲]效果，持續1秒 | applyStatus statusId:"blind" duration:1.0 有了，但作者自己填了 missChance:0.5（規格沒有給任何數字）。引擎的 blind 只 | 對手被致盲 1 秒仍然有一半的普攻會打中；如果 owner 心裡的 [致盲] 是原作那種必定失手，這一秒的價值只有一半，而卡片上看不出差別。 | low | half-done |
| `godie-efur.r` | 120秒冷卻，吟唱0.6秒 | 出貨檔的 castTimeSec 是 **0.4**，不是規格的 0.6（md 裡的副本則連這一格都沒有）。castTimeSec 就是吟唱/前搖那一格（schema/abilit | 大絕的吟唱比說明短 0.2 秒 —— 對手看預告特效判斷閃避時間會偏差，而說明上的數字是錯的。 | low | wrong-semantics |
| `godie-efur.r` | 每顆造成[小範圍] 150/200/250 + 40% [AP] [魔法傷害] | 逐階、係數、小範圍（radius 3.0）、magic 都對上；巢狀 damageArea 的圓心確認是落點（randomAreaSystem 用 targets:[] + poi | 一顆流星最多只打 6 個，密集殭屍堆裡第 7 個以後不吃傷害。10 顆各自獨立計算，所以比 E 溫和，但同樣不是說明寫的東西。 | low | half-done |
| `godie-efur.w` | 並[擊退]6距離。 | knockback distance:6 有了，但沒寫 `subtractGap`，而引擎預設是 true（knockback.ts 檔頭：『the authored number | 說明寫 6 距離，實際推的距離隨站位在 4–6 之間浮動。這是全遊戲共用的擊退法則（GH#193），不是這一支的 bug，但規格的『6距離』在玩家眼裡不是字面真值。 | low | half-done |
| `godie-emfr.r` | 施放技能後的下一次普通攻擊將釋放雷神一擊 | cast effects 裡有一個 `{kind:"spawnProjectile", projectileId:"imported.bolt.lightning", onHit: | 按 R 會看到一發往前飛的閃電但完全不痛，玩家會以為那就是雷神一擊而站位去對線。 | low | missing |
| `godie-emns.e` | [周圍]的敵方部隊受到…傷害 | JSON 寫了 `maxTargets: 6`，規格沒有任何人數上限。省略這一格的引擎預設是 20（spreadLimits.ts 的 `DEFAULT_SPREAD_MAX_TA | 殭屍波場合（單區上限 30 隻）圈內站了 15 隻，只有最近的 6 隻會掉血，其餘 9 隻毫髮無傷 —— 而畫面上的爆炸範圍看起來蓋滿了全部。 | low | wrong-semantics |
| `godie-emns.r` | 並使動作[緩慢]持續5秒 | 機制在（`applyStatus slow40` + `moveSpeedMult: 0.5` + `duration: 5.0`，5 秒與規格逐字相符），但 statusId 叫 | 玩家層面幾乎看不出來（減速有發生、5 秒也對）。屬於內容一致性債，不是規格缺口。 | low | half-done |
| `godie-ewar.e` | 敵人身上有[混亂]標記時，額外造成 100% [AP]傷害 | 逐階四層 hook 的 `damage.amount` 除了 `ap coeff 1.0` 之外，還多了 `flat: 50.0`。規格只講「額外造成 100% AP 傷害」，沒有 | 對混亂中的敵人每一次普攻多打 50 點無中生有的魔法傷害。玩家看說明算不出這個數字。（其餘 5 個子句 —— onBasicAttack、critChance flat 0.1、c | low | wrong-semantics |
| `godie-h00l.e` | 額外造成 33% [AP]傷害 | `amount` 是 `{flat:50.0, ratios:[{stat:"ap", coeff:0.33}]}` —— 33% AP 這一半正確，但多了一個規格裡沒有的 **f | 低 AP 時這一發幾乎全是那 50 點固定傷害，玩家堆 AP 感覺不到成長；規格寫的是純比例。 | low | wrong-semantics |
| `godie-h00l.r` | 有效半徑6 | `range: 0.0`、沒有 `radius`、沒有 `radiusTier`。整份文件裡找不到任何 6。 | 規格明說這面盾有 6 單位的有效半徑（護住周圍隊友的那種讀法），現在沒有任何範圍概念 —— 面板也畫不出範圍預告圈。 | low | missing |
| `godie-h01n.ex` | [卍解] 狀態下，額外獲得⋯ | 條件被近似成 `on: onAbilityCast, abilitySlot: "R"` + 硬寫 duration 8.0。語意接近但不等價：它綁的是「R 被按下」而不是「身體真 | 今天（counterpart godie-h01o 存在、R 的 durationSec 也是 8）玩家看不出差別。但 owner 一改 R 的持續時間，AD/吸血就會與變身時間錯 | low | wrong-semantics |
| `godie-h01n.q` | （規格全文無任何傷害子句） | JSON 多了一個規格沒有的 damageArea，amount.flat = 1.0、damageType magic、radiusTier 小、includeOrigin tr | 敵人頭上會跳一個「1」的傷害數字，說明書沒有講瞬步會造成傷害。空 onHit 的投射物是純視覺 no-op。都不致命，但會讓玩家對「這招到底有沒有傷害」產生誤解。 | low | wrong-semantics |
| `godie-h01n.w` | （規格的傷害只有 200/350/500/650 與兩個條件加成） | base damage 多掛了一條規格沒有的 ratios: [{stat:"ap", coeff:0.5}]。owner 的規格裡 AP 只出現在兩個括號條件句（100% / 2 | 傷害比說明書高（雖然目前是加在自己身上）。屬於數值面，但它是規格外憑空加的一條係數。 | low | wrong-semantics |
| `godie-h01u.q` | 持續1秒，若沒有繼續攻擊則[疊加]的 [攻擊速度] 增益歸零。 | 每一層是一份**獨立**的 1 秒 buff，各自到期。所以停手之後層數是逐層衰減（在最後一次攻擊後 1 秒內一層一層掉），不是規格寫的「歸零」。正確語意是 stackKey +  | 停止攻擊後攻速是滑落而不是斷崖式歸零。玩家幾乎看不出來，但它與說明文字不符。 | low | wrong-semantics |
| `godie-h02k.e` | （規格未提及的額外節流） | 四階 hook 都帶 `internalCooldown: 1.0`，規格裡沒有這一格。 | 高頻受擊時實際觸發率被壓到每秒最多一次，低於說明的 4%/次。 | low | half-done |
| `godie-h02k.passive` | 有3%的[機率]可以使出超會心一擊 | `damage` 效果沒有 `crit: true` / `canCrit`，是一發普通的 999 真實傷害封包。 | 999 傷害會正常打出，但飄字與打擊感走一般傷害的路，沒有暴擊的視覺/音效表現 —— 說明寫「超會心一擊」，畫面上看不出跟一般普攻有什麼不同。 | low | half-done |
| `godie-h02k.r` | 將對方抓取過來造成 16% [AP]傷害 | `damage.amount` 是 `{flat: 50.0, ratios:[{stat:"ap", coeff:0.16}]}` —— AP 係數 0.16 正確，但**多了規 | 低 AP 時實際傷害遠高於說明（0 AP 時說明算出 0，實際打 50）。數字不大，但屬於「說明與實際不符」。 | low | half-done |
| `godie-h02k.w` | 當敵人攻擊熊貓的時候，有3%[機率][反彈] | 「反彈」被寫成固定 `flat: 1.0` 的 `damageArea`，沒有用 `damage.incomingPct`（引擎真正的反彈機制）。另外多了規格沒有的 `intern | 反彈傷害恆為 1 點，跟敵人打多重完全無關；且高攻速敵人下的實際觸發率遠低於 3%。 | low | half-done |
| `godie-h02v.passive` | 0秒冷卻 | 技能本體 cooldown:[0] 對，但 hook 上額外掛了 internalCooldown: 1.0。規格逐字寫「0秒冷卻」，JSON 自己加了一個每秒只能觸發一次的閘。 | 同一秒內連續被兩個敵人打（或被一發多段技打）時，第二次之後的 30% 判定不會擲，實際觸發率低於卡片承諾的 30%。 | low | wrong-semantics |
| `godie-h02v.w` | 並且永久增加1點 [AP] | grantAttribute{attr:"int", amount:1, mode:"flat", maxAttribute:200} —— combat-env 的 intToA | 一場打很久的局裡疊到 200 智慧之後就不再成長，而卡片說「永久增加」沒有上限；另外玩家會發現吞噬也在偷偷長魔力上限與魔抗。兩者都不致命，但都不是規格寫的。 | low | wrong-semantics |
| `godie-hapm.w` | 45秒冷卻，吟唱 1秒 | `castTimeSec` 出貨值是 **0.5**，不是 1。（另注：md 文件裡那份「產出的 JSON」根本沒有 castTimeSec 這一格，跟出貨檔不一致。） | 前搖只有說明寫的一半，對手可以反應的窗口少 0.5 秒。 | low | wrong-semantics |

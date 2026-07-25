# GGD 技能行為模板總覽

> 產生器: `tools/ability-templates/emit_templates_md.py` · 資料源: `docs/ability-templates.csv` (JASS 三軸稽核 + 12 代理細讀 90 英雄觸發器群, 309 筆行為記錄)

> 498 個獨立技能 · 29 類行為模板 · 分類依 owner 指示「全部看過再決定」由下而上聚類定案


## 分類總表

| 行為模板 | 技能數 | 平均落差分 | 一句定義 |
|---|---|---|---|
| [召喚代理](#召喚代理) | 52 | 4.0 | 生成單位替施法者做事 — dummy 代放技能或真召喚物。 |
| [變身強化](#變身強化) | 24 | 6.0 | 限時改變自身型態/數值/技能組。 |
| [衝鋒推撞](#衝鋒推撞) | 20 | 5.0 | 施法者(或目標)沿線步進, 沿途 AoE/推撞。 |
| [攻擊觸發](#攻擊觸發) | 17 | 7.0 | 普攻命中時機率/條件觸發的效果。 |
| [瞬發點爆](#瞬發點爆) | 16 | 8.0 | 在目標點/目標身上瞬間爆一個 AoE。 |
| [單體斬擊](#單體斬擊) | 14 | 8.8 | 無幾何、鎖定單體的直接傷害。 |
| [行進波動](#行進波動) | 14 | 6.2 | 傷害點沿直線逐步推進的波動, 可帶終點爆發。 |
| [原地震波](#原地震波) | 12 | 8.0 | 以施法者為中心的瞬間 AoE。 |
| [受擊反應](#受擊反應) | 12 | 7.1 | 被打時觸發的反擊/格擋/吸收。 |
| [純演出/物件資料](#純演出物件資料) | 10 | 6.8 | 觸發只做音效/文字/鏡頭, 實效全在物件編輯器。 |
| [週期領域](#週期領域) | 10 | 5.1 | 持續期間週期作用於周圍 (傷害/治療/點射)。 |
| [鎖定連段](#鎖定連段) | 9 | 4.0 | 鎖住目標後播放腳本化多段打擊。 |
| [跳躍落地](#跳躍落地) | 8 | 5.0 | 施法者拋物線跳向目標點, 落地釋放 AoE。 |
| [拉扯投擲](#拉扯投擲) | 5 | 3.0 | 把目標抓起/鉤來/拋飛的強制位移。 |
| [直線分段掃擊](#直線分段掃擊) | 5 | 7.8 | 單幀內沿直線鋪滿 N 段 AoE 的瞬間掃擊。 |
| [瞬移突斬](#瞬移突斬) | 5 | 5.8 | 瞬間位移到目標身邊或依指令閃現, 常伴斬擊。 |
| [引導通魔](#引導通魔) | 4 | 5.0 | 持續引導期間分段生效, 中斷即停。 |
| [剝奪變化](#剝奪變化) | 3 | 2.0 | 把目標變形或剝奪其資源/等級。 |
| [生命操作](#生命操作) | 3 | 3.0 | 以生命為代價或直接操作生命值。 |
| [全場規則](#全場規則) | 2 | 1.0 | 改寫全場狀態 — 回溯/處決/環境。 |
| [成長蓄能](#成長蓄能) | 2 | 4.0 | 擊殺成長或蓄力疊加的累積系統。 |
| [死亡機制](#死亡機制) | 2 | 1.5 | 死亡時觸發的重生/暴走/假死。 |
| [資源運營](#資源運營) | 2 | 2.0 | 以金錢/道具為核心的運營技能。 |
| [距離博弈](#距離博弈) | 2 | 3.0 | 依施法距離/位置決定不同招式結果。 |
| [隊伍協同](#隊伍協同) | 2 | 2.0 | 作用於全隊的集結/契約連結。 |
| [布陣環繞](#布陣環繞) | 1 | 3.0 | 在場上布置衛星/陣列/自爆物。 |
| [汲取吸附](#汲取吸附) | 1 | 4.0 | 掛上吸取環節, 週期把目標的血/魔轉給自己。 |
| [結界領域](#結界領域) | 1 | 2.0 | 張開持續領域, 域內特殊規則。 |
| [物件資料技能(無觸發)](#物件資料技能無觸發) | 240 | 7.1 | 完全沒有 JASS 觸發的技能 — 行為由 WC3 物件資料(基底技能+資料欄)全權定義。 |

## 召喚代理

**定義**: 生成單位替施法者做事 — dummy 代放技能或真召喚物。  
**機制特徵**: CreateNUnits + UnitAddAbility + IssueOrder / 計時壽命。  
**範本**: 菲特 23-01 電離光槍 (dummy 學 stampede 沿線彈幕)  
**移植備註**: GGD 無召喚詞彙; dummy-cast 投放類可改寫為對應投射/AoE, 真召喚物需新機制。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 02-04 百鬼夜行 | 除魔巫女 - 桔梗(R) | 4 | map-wide — farsight ordered at each enemy hero's location | instant (dummy 6s life) | 無 | j:55362-55419 (CreateNUnits 'h032' scale |
| 12-02 仙氣．採藥 | 龍之子 - 天地志狼(W); 龍之子 - 天地志狼(W) | 4 | self-target; dummy 'ogru' 1s timed life | instant + 1s cleanup sleep | 無 | j:29355-29386 (CreateNUnitsAtLoc 'ogru'  |
| 14-00 召喚式神 | 治癒系公主 - 木乃香(PASSIVE) | 4 | 無 (式神 'u00P' 本體由物件資料召喚) | instant cast; 週期 3.0s 跟隨令 | 式神被下 move 令走向施法者; 施法者不動 | j:30192-30201 (periodic move order), j:3 |
| 15-01 風精召喚 | 魔法老師 - 涅吉。史普林。菲爾德(Q) | 4 | stampede 彈幕幾何在 A056 物件資料; dummy 存活 5s | instant (dummy 引導 5s) | 傷害彈幕由 dummy 的 stampede 向目標點行進 | j:34781-34798 (hidden 'hfoo'+A056 lvl-ma |
| 15-02 沉睡之霧 | 魔法老師 - 涅吉。史普林。菲爾德(W) | 4 | 目標單位周圍半徑 450 | instant | 無 | j:34543-34557 (dummy+A055, 450 AoE dummy |
| 15-002 風花-武裝解除 | 魔法老師 - 涅吉。史普林。菲爾德(EX) | 4 | howlofterror AoE 依物件資料; dummy 存活 3s | instant 施放; 之後每次受擊事件觸發 | 無 | j:34814-34822 (dummy 'o02Y' howlofterror |
| 16-01 超．占事略決 | 通靈人 - 麻倉葉(W) | 4 | 兩波各4隻 dummy 於目標點外 400u、90°間隔生成, 下move令向中心收束; 第二波 'h00K' 掛 A0 | sleep-loop (1.2s 後第二波, PolledWait 1.05s  | 傷害單位行進: 4方向 dummy 從 400u 外向目標點收束 | j:31339-31401 (cond A0A1 j:31340; 4×'h00 |
| 16-02 阿彌陀流真空佛陀斬 | 通靈人 - 麻倉葉(R) | 4 | 8隻 dummy 於目標點外 400u、45°間隔生成向中心收束; 第二波 'h00K' 掛 A0A0 傷害光環 | 0.5s 兩波 stagger, PolledWait 1.05s 清除 | 傷害單位行進: 8方向 dummy 400u 收束到目標點 | j:31495-31556 (cond A042 j:31496; 8×45°× |
| 16-04 劍之精靈 | 通靈人 - 麻倉葉(E) | 4 | 召喚本體由 WC3 物件資料 (A043 召喚阿彌陀丸靈體) 執行; JASS 僅清 udg_GosofKingMU | instant | 無 | j:31561-31579 (cond A043 j:31562; Action |
| 18-04 億年樹 | 妖狐藏馬 - 南野秀一(R); 妖狐藏馬 - 南野秀一(R) | 4 | 真召喚戰鬥單位 'n010' ×1 | sleep 1.5s 捕捉 → 存活 9s×等級 → 清理; 死亡觸發再清一次 | 無 (召喚物自主作戰) | war3map.j:28040-28106 (Conditions A0P7 j |
| 19-02 迴切 | 戰國刺客Azumi - 安云(W); 戰國刺客Azumi - 安云(W) | 4 | dummy 'o012' (2s timed life) 於施法者腳下, A0H6 war-stomp AoE (半徑在 | instant + 1s 加成窗口 (sleep 1.00 → fitCutYe | 無 | j:27439-27455 (CreateNUnits 'o012' + Iss |
| 21-002 天破壤碎 | 火霧戰士 - 夏娜(EX) | 4 | 以施法點為中心 1200×1200 rect 內隨機 40 點, 每點 dummy 下 inferno (A0V9) + | sleep-loop ×40 (TSA 0.01/輪, 實測約 0.1s/輪 ≈ | 無 (傷害區固定 rect, 隨機落點轟炸) | j:33152-33186 (HP-1000 33153, dummy hfoo |
| 23-00 雷光枷鎖 | 時空管理局執務官 - 菲特·泰斯塔羅沙(PASSIVE) | 4 | 目標點雲霧 (cloudoffog, 停塔攻擊); dummy 壽命 ~20s | instant 施放, 雲霧持續約20s (cleanup sleep 10s) | 無 | j:31136-31168 (dummy ogru + A0DW j:31152 |
| 23-01 電離光槍 - 繁星飛躍 | 時空管理局執務官 - 菲特·泰斯塔羅沙(Q) | 4 | stampede 彈幕沿施法者→目標點直線; 視覺單位 o026 存活2s | instant 觸發, 彈幕由引擎持續 ~2s | 傷害區行進: stampede 飛彈由引擎沿線飛行 | j:31063-31131 (dummy hfoo + A112 j:31113 |
| 25-04 ChangeDNA | 北斗之鼠 - 拳四郎(R); 北斗神拳掌門人 - 拳四郎(R) | 4 | 初動: 半徑900 內『每個』單位各生成一隻隱形 dummy o00E (6s, A0HY) 對其施放 chainlig | instant 雷擊齊發 → TriggerSleepAction(lvl×8  | 無 — dummy 原地/瞬移到目標位施法 | war3map.j:38676 (Actions: ForGroup 900 d |
| 26-002 鄉民的正義 | 豪洨天王 - 鄭先生(EX) | 4 | 全地圖每個敵方英雄(排除Utic): 周圍半徑200、角度75°×i (i=1..5) 生成5隻'h031', 20s計 | instant | 無施法者位移; 召喚物自行攻擊各自目標 | war3map.j:38050-38104 |
| 33-01 放山雞 | 被剝削的勞工階級 - 牧太郎(Q) | 4 | 召喚本體由 WC3 物件資料執行 (雞單位 'n000'); JASS 僅放音效; farmer: 'n000' 死亡時 | instant (SFX); farmer 為死亡事件 | 無 | j:43368-43416 (chieken cond A02L j:43369 |
| 34-04 奧義˙蒼龍破 | 犬妖 - 殺生丸(R) | 4 | 生成螺旋: 距離 i×12 / 角度 i×30° (i=1..12); 集體衝向施法者面向 800u 處; 存活 2s | 生成 loop 12×0.03s sleep; 2s 後清除 | 傷害龍群 (dummy 單位) 向前行進 800u; 施法者不動 | j:38872-38884 (12×'n00N' 螺旋生成 + "smart"  |
| 35-00 召喚佩 | 幕末復仇狂者 - 志志雄真實(PASSIVE); 不死之身-無 - 藤井八雲(P | 4 | 無 | instant; 死亡怒氣窗 3.0s | 寵物佩走向施法者跟隨 | j:42909-42915 (kill 舊佩→create 'h01Q'→mov |
| 37-00 鬼眼 | 魔界霸主 - 巴恩大魔王(PASSIVE) | 4 | 目標單位 600 AoE 內敵人被 dummy 'ogru' (2s, S002) 依序下 cripple 指令 | instant | 無 | j:44430-44444 (dummy 44434-44438, 600 en |
| 37-02 黑核晶 | 魔界霸主 - 巴恩大魔王(E) | 4 | 全圖 EnterRect 監聽; 同時存在的黑核晶 (n00O/n00Y/n00Z/n00X) 上限 7, 超過殺最舊 | instant per 晶體單位進場 | 無 | j:44592-44657 (型別過濾 44592-44606; 計數+殺最舊  |
| 37-03 災難之牆 | 魔界霸主 - 巴恩大魔王(W) | 4 | 目標點沿 (面向+90°) 方向排 9 隻 'u00R' 牆單位, 間距 100u (offset +400..−400 | instant 佈牆, 持續 2+lvl s 後清除 | 無 (牆固定; 牆體傷害/阻擋在 u00R 物件資料) | j:44563-44578 (9-loop 44568-44574: Polar |
| 37-002 真‧黑核晶 | 魔界霸主 - 巴恩大魔王(EX) | 4 | 目標點生成 1 隻 'n00W' 真黑核晶單位 (爆炸/傷害在其物件資料) | instant | 無 | j:44678-44682 (CreateNUnits 'n00W' @ Get |
| 39-02 無名神風流-朱雀 | 鬼畜紅王 - 鬼畜狂刀KYO(W) | 4 | dummy 生成於目標後方 100u, 沿目標→施法者方向發 shockwave (A0DM lvl5) 穿過目標; ( | instant; 拉扯 periodic 0.04s ×10 | 目標被推動(拉向施法者): Set_Move_Value 50u/0.04s t | j:39585-39633 (cond A0Z4 j:39586; dummy+ |
| 41-002 絕對屏障 | 地獄來襲者 - 斑剎(EX) | 4 | 目標點放置 1 隻 voodoo dummy ('h02C'); AoE 由 Big Bad Voodoo 能力端決定 | instant 佈署 → 持續 5s 後清理 | 無 (定點法陣) | war3map.j:44721-44749 (Conditions A0SD j |
| 42-04 世界終結 | 黑暗福音 - 依文潔琳(R); 黑暗福音 - 依文潔琳(R) | 4 | 初爆: 目標點 500 AoE 直傷; 轟炸: 目標點 450×450 rect 內隨機 12 點, 各一隻 u013  | instant 初爆 + periodic 0.10s ×12 (~1.2s 轟 | 無 (傷害區鎖定施法目標點) | j:37719-37733 (吟唱字幕), 37773-37801 (dmg=( |
| 42-002 魔力印章 | 黑暗福音 - 依文潔琳(EX); 黑暗福音 - 依文潔琳(EX) | 4 | 以 EndWorldPoint 為中心 450×450 rect 隨機點, 每 0.20s 一隻 u013 (1s 命) | 時窗 7s, periodic 0.20s | 傷害區行進: 轟炸中心隨 EVN 每次普攻重定位到被攻擊者所在點 (EVENT_ | j:37900-37921 (7s 時窗 37905), 37857-37872 |
| 43-002 食神歸位 | 食神 - 撒尿牛丸(EX) | 4 | 施法者 900 半徑內所有敵方單位; dummy 'hfoo' 掛 A104(43-002-01 化身術, 基底 Apl | instant; dummy 2s 定時生命; 5s 後清理 | 無 (目標被變形, 不位移) | j:37973-38027 (cond A105 j:37975, 900 Ao |
| 44-03 火車輾過 | 奇樂 - 夜神月(E) | 4 | impale at marked unit; with item I01O: dummy-impale every en | instant + 2s cleanup sleep | 無 (dummy-cast impale line comes from A0E | j:42282-42346 (dummy 'o002' + A0EB '44-火 |
| 45-02 千鳥流 | 寫輪眼復仇者 - 宇智波佐助(W) | 4 | 施法者周圍450 AoE: 對範圍內每單位生成隱形dummy 'o00E'(掛A0HY, base AOcl)各射一發c | instant (dummy存活2s) | 無 (以施法者為中心) | war3map.j:41734-41772 |
| 45-002 天照 | 寫輪眼復仇者 - 宇智波佐助(EX) | 4 | 施法者周圍500 AoE: 每個敵人一隻隱形dummy施soulburn(A100 45-002-05 禁言) | instant | 無 (以施法者為中心) | war3map.j:42186-42226 |
| 48-00 石化之眼 | 梅杜莎 - Rider(PASSIVE) | 4 | silence AoE at caster's own point (radius from dummy 'h025'  | instant (dummy 2s life, sleep 1s cleanup | 無 | j:38109-38137 (CreateNUnits 'h025' hidde |
| 48-03 鮮血神殿 | 梅杜莎 - Rider(E) | 4 | drain aura AoE 580 around summon 'o005'; dmg 75×lvl(A06C) pe | periodic 1.00s while summon alive; kill  | 傷害區行進 — aura follows the summoned unit w | j:38447-38465 (enter-map hook on 'o005') |
| 53-03 破法對咒 | 獸神官 - 傑洛士(E); 憂鬱少女 - 涼宮八ㄦ匕(R) | 4 | 施法者 550r 內全單位逐一被 dummy 下 antimagicshell (A0DS, 等級同步) | instant + sleep 6s 清 dummy | 無 | war3map.j:39911-39915 (A07T cond), 39928 |
| 57-03 複製鏡 | 小叮噹 - 哆拉A夢(W) | 4 | 無觸發側幾何 | instant | 無 | war3map.j:45777-45806 |
| 57-04 竹蜻蜓 | 小叮噹 - 哆拉A夢(R) | 4 | 12發shockwave由半徑200的旋轉環向圓心收束; dummy技能A0D4(57-竹蜻蜓龍捲風, base AOs | periodic 0.30s ×12 | 傷害來源環繞目標點旋轉: 每tick在目標點外200u(角度+30°/tick) | war3map.j:45709-45772 (period j:45770) |
| 58-002 打雷絕招 | 神騎寶貝 - 皮卡丘(EX); 神奇寶貝兒 - 皮卡丘(EX) | 4 | 施法者 1800 AoE 內每個單位各生成一隻隱形 'hfoo' dummy (10s), 以 A04H lvl3 對其 | instant 扇出, 4s 後清 dummy | 無 (閃電鏈彈道為物件資料) | j:40271-40279 (per-unit dummy chainlight |
| 59-04 野戰型陽電子砲 | 最終泛用人型決戰兵器 - 初號機(R) | 4 | 光束 dummy h01P 生成於施法者, 面向目標點, 縮放 120+30×lvl%; 900r 英雄鏡頭震動 | instant + sleep 1s 清鏡頭 | 無 (傷害由 h01P 光束單位自身的物件資料輸出, 觸發不判傷) | war3map.j:47736-47740 (A0GI cond), 47756 |
| 65-04 天譴 | 至尊學長 - 飛鼠先生(R) | 4 | 施法者 r500 內每個單位各生成一隻 ogru dummy (壽命10s) 掛 A04H chainlightning | instant 鋪設, dummy 10s 後清理 | 無; 閃電鏈由引擎跳 | j:46950-47024 (per-unit dummy j:46984-47 |
| 66-02 驚駭 | 七夜怪談 - 貞子(W) | 4 | 以施法者原地為中心的 dummy silence AoE (半徑在 A0I9 物件資料) | instant | 無 | j:48872-48891 (dummy ogru 1s命 48875-76,  |
| 69-002 固有結界-黑洞 | 英靈-亞瑟王 - 黑化Saber(EX) | 4 | 以施法者為中心 600×600 rect; dummy×1 (6s) + 召喚物 'u02S' ×9 | instant 佈署 → sleep 8s 清理 | 無 (黑洞dummy定點, 效果由 A0FM 能力端拉扯) | war3map.j:32744-32787 (Conditions A0FK j |
| 70-03 木束縛之術 | 白木老樹精 - 白木卡迪那(E) | 4 | dummy 'o00Y' (2s, A0GS) 於施法者腳下, 對施法者 950 AoE 內單位逐一下 entangli | instant, 5s 後清 dummy | 無 | j:47854-47866 (dummy 47856-47860, 950 en |
| 71-01 死亡隕落 | 邪惡意念集合體 - 死之王(Q) | 4 | 目標點地獄火 AoE (由 A095 能力端); dummy×1 | instant 下令 → 0.3+0.3s 瞬移演出 → 3s 後清理 | 施法者位移: 原地留 'u01A' 殘影→隱藏→瞬移至目標點現身 (dummy  | war3map.j:48137-48189 (Conditions A03L+' |
| 74-03 闇之天使 | 神性的流失 - 賽菲洛斯(E) | 4 | 8發 inferno (A011, lvl=技能lvl) 隨機落在目標點 600×600 rect 內 | sleep-loop 8×0.3s; 5s 後清理 dummy | 無 (隱形dummy hfoo 定點施放) | j:48501-48519 (loop8 spawn hfoo + infern |
| 75-03 暴雷無限刃 | 最M的魔法Jizz - 清蒸 飛鼠先生(R) | 4 | 目標點外圈 r=650, 15 個位置 (24°/步): dummy (ogru, scale 400%, 3s) 依序 | instant 佈署 (同幀連下15道), 1.5s 後清理 | 傷害區行進: 15 道 shockwave 由圓周向圓心收束 | j:47260-47313 (單 dummy 繞圈連射 j:47293-4730 |
| 76-002 霸王色 | 草帽小子 - 蒙其.D.魯夫(EX); 草帽小子 - 蒙其.D.魯夫(EX) | 4 | 10 隻 dummy 'o009' 對半徑 256u、每 36° 一發 impale (放射狀); 附加效果 900r | instant + sleep 5s 清 dummy | 無 (dummy impale 波各自行進) | war3map.j:36828-36832 (A0ZK cond), 36869 |
| 78-03 廬山昇龍破 | 黑手黨老大 - 基廉列克(E) | 4 | 施法者位置生成1隻'o01P'放大240%, 5s後清除(連同oshm dummy) | instant, 召喚物存在5s | 無施法者位移 | war3map.j:50043-50077 |
| 84-03 蜜汁 | 百畝森林的霸主 - 維尼(E) | 4 | 無 (單體) | instant | 無 | j:51267-51295 (hidden 'hfoo' dummy: A0D8 |
| 91-002 亡靈大軍 | 死亡騎士(EX); 不良少年(EX) | 4 | 目標點 dummy stomp A0VT (91-002x 震地) 暈眩; 8 隻食屍鬼 u031 於 450u 環 × | instant | 召喚物向目標點推進 (attack order) | war3map.j:53377-53381 (A0VS cond), 53391 |
| 94-02 橘山斬空破 | 夜市人生 - 金居福(W) | 4 | 4 道 shockwave 呈 X 形 (45°/135°/225°/315°), 指令點 256u 外; dummy  | instant 齊發 | 傷害區行進: 4 道震盪波彈體由能力端向外飛行 | war3map.j:53896-53953 (Conditions A0QG j |
| 96-04 獨孤九劍 | 笑傲江湖 - 令狐沖(R) | 4 | 目標位置生成 9 隻劍靈 o02X (10s timed life), 各自 attack 目標 | sleep-loop 9×0.04s 生成; 9s 後強制清理 | 無 (真召喚物自行作戰) | j:44907-44930 (loop9 spawn+attack order) |
| 99-03 初音未來的消失 | 夢幻之星 - 初音(E) | 4 | 施法者周圍750 AoE: 對每個單位生成隱形dummy施innerfire(A11A 99-03a 初音戰意, 等級= | instant (EX護盾持續到被打光) | 無 (以施法者為中心) | war3map.j:54815-54871 (本體), 54876-54907  |

## 變身強化

**定義**: 限時改變自身型態/數值/技能組。  
**機制特徵**: morph 或屬性改寫 + sleep 還原; 可交換子技能。  
**範本**: 戰鬥涅吉 82-04 闇之魔法 (15s 暗化+兵裝互換)  
**移植備註**: GGD applyBuff 近似數值面; 技能組互換無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 09-03 超級賽亞人 | 超級賽亞人 - 悟空(E); 賽亞人 - 悟空(E) | 6 | 純特效: 4 圈 ThunderClap 環, 半徑 50/100/150/200, 每圈 10 支 ×36° | instant (每圈 sleep 0.01 ×4) | 無 (變身由 A09E 物件資料完成, 觸發只做地形波紋+環狀特效) | war3map.j:31686-31689 (A09E+Ogrh cond),  |
| 11-00 三刀流 | 三刀流劍士 - 索隆(PASSIVE); 三刀流劍士 - 索隆(PASSIVE) | 6 | self-target, 無幾何 | instant | 無 (自身buff) | war3map.j:28950-28962 |
| 18-03 妖狐變化 | 妖狐藏馬 - 南野秀一(E); 妖狐藏馬 - 南野秀一(E) | 6 | rect gg_rct_Gorama 移至施法者, 10 個隨機點特效 | instant | 無 | war3map.j:28156-28184 (Conditions A0IH j |
| 21-02 拔焰刀 | 火霧戰士 - 夏娜(Q) | 6 | 無 | timed buff 4s×lvl (PolledWait) | 無 | j:33004-33019 (add A0DF 33007-08, Polled |
| 22-00 嗚鎖打! | 蟬在叫人壞掉 - 龍宮禮奈(PASSIVE); 蟬在叫人壞掉 - 龍宮禮奈(PA | 6 | 無 AoE; 自身 buff | instant; 白天 3s 後清理 dummy (夜晚不清) | 無 | j:33239-33291 (cond A0CL j:33240, dummy  |
| 27-002 祕法-霧隱分身之術 | 猿飛佐助 - 風魔小次郎(EX) | 6 | 無 | EVENT_PLAYER_HERO_LEVEL 一次性; 之後 DisableT | 無 | j:41103-41131 (EX gate + 'Naka' j:41104- |
| 28-01 吃掉你 | 超級普烏 - 魔人普烏(Q) | 6 | 單體吞噬(本體為物件資料技能); 每6次施放 +1 STR 永久 | instant per cast (計數器循環 0-6) | 無 | j:40606-40613 (Eat_Index==6 → ModifyHero |
| 32-04 狂龍霸體 | 常勝將軍 - 趙子龍(R) | 6 | 無 — 純能力增刪 | instant on ISSUED_ORDER defend / undefen | 無 | war3map.j:42833 (DefStartC: 加 A0TP+A0TQ  |
| 38-04 黑龍波吸收 | 邪眼師 - 飛影(R); 邪眼師 - 飛影(R) | 6 | 自身永久 +lvl AGI (基礎 AGI≤160 才生效); 12 隻隱形 o00Z 於 350u 環 ×30° 各放 | instant + sleep 1.0/1.0 清 dummy | 無 (吞龍 dummy o01V 從地底 -2000 竄升為演出) | war3map.j:43940-43944 (A09K cond), 43979 |
| 39-002-紅王 | 鬼畜紅王 - 鬼畜狂刀KYO(EX) | 6 | 無; SetUnitAbilityLevel A0Z3 → 2 | instant (once, 等級30時) | 無 | j:39558-39580 (EVENT_PLAYER_HERO_LEVEL j |
| 52-01 狂戰士之怒 | 海克力斯 - Berserker(Q) | 6 | 無 (純狀態: 紅化 vertex 100/30/30) | berserker 2 periodic 0.30s 監視, buff B045 | 無 | j:51659-51704 (A0VK=lvl+1 j:51667, buff  |
| 58-04 瘋狂皮卡丘 | 神騎寶貝 - 皮卡丘(R); 神奇寶貝兒 - 皮卡丘(R) | 6 | 無範圍; 自身 A0AG 能力等級每被攻擊一次 +1, 上限 50 | lvl×6 s 持續 (TriggerSleepAction); 疊層 inst | 無 | j:40324-40330 (開窗 lvl×6s + 結束還原顏色), 4036 |
| 60-03 海拉爾之盾的庇護 | 時空勇者 - 林克(E) | 6 | self only | event toggle (defend / undefend orders) | 無 | j:46211-46258 (order 'defend' → UnitAddA |
| 69-04 魔力增幅 | 英靈-亞瑟王 - 黑化Saber(R) | 6 | 無 (玩家科技) | instant (學技能/升級時) | 無 | war3map.j:32708-32739 (EVENT_PLAYER_HERO |
| 71-02 靈魂吸取 | 邪惡意念集合體 - 死之王(W) | 6 | 無 (自身被動能力升級) | 擊殺 instant 疊層, 每層 20s 後衰減 | 無 | war3map.j:48306-48344 (EVENT_PLAYER_UNIT |
| 71-03 厄夜靈魂 | 邪惡意念集合體 - 死之王(E) | 6 | 無 (契約單位加能力) | instant 加成 → 3s 後移除 | 無 | war3map.j:48194-48227 (Conditions A0HJ j |
| 77-002 御雷劍 | 神鳴流劍士 - 櫻綻剎那(EX); 神鳴流劍士 - 櫻綻剎那(EX) | 6 | 無 AoE; 效果: 雷鳴劍 proc 1/10→1/2; 帶 B05F 時受傷 ×0.66 (DamageModify | instant buff; proc 增幅 14s (sleep), B05F  | 無 | j:49180-49200 (cond A10G j:49181, Num 2↔ |
| 80-01 天下無雙 | 亂世癿王者 - 呂布奉先(Q) | 6 | self only; A0AU level = stacks, cap 4+2×lvl(A0MX), floor 1 | on kill; each stack decays after 15s sle | 無 | j:50315-50348 (EVENT_PLAYER_UNIT_DEATH,  |
| 80-04 赤兔咆哮 | 亂世癿王者 - 呂布奉先(R) | 6 | self only | order toggle (immolation/unimmolation) + | 無 | j:50475-50497 (order 'immolation' → SetP |
| 82-04 闇之魔法 | 白色之翼 - 涅吉。史普林。菲爾德(R) | 6 | 無 (純狀態) | sleep 15.0s 後自動還原 | 無 | j:35603-35633 (15s 模式 j:35616), 子技能交換 j: |
| 91-00 符文鍛造 - 墮落十字軍符文 | 死亡騎士(PASSIVE); 不良少年(PASSIVE) | 6 | 無幾何; A0VU 等級 1→2, buff B046 消失即回 1 | instant + 0.30s 週期檢查 buff 到期 | 無 | war3map.j:53023-53027 (A0VV cond), 53030 |
| 92-01 臥草泥馬 | 看似憂鬱的神獸 - 草泥馬(Q); 看似憂鬱的神獸 - 草泥馬(Q) | 6 | 腳下地形塗成草地 'Vgrt' (variation 2×1); 效果由 A0W8(92-01-01 生命再生光氣, 基 | instant (0.01s sleep) | 無 | j:45199-45224 (cond A0W9 j:45200, SetTer |
| 94-03 珍奶顏射 | 夜市人生 - 金居福(E) | 6 | 無 (自身buff) | 0.1s 延遲加成 → 持續 14s | 無 | war3map.j:53958-53979 (Conditions A0QJ j |
| 95-00 紅色龍氣 | 皇者 - 騜(PASSIVE) | 6 | 自身: +10% HP, +10% MP, A0YC 提到 lv2 持續10s | instant + sleep 10s 還原 | 無 | j:54284-54290 (SetUnitLife/ManaPercent + |

## 衝鋒推撞

**定義**: 施法者(或目標)沿線步進, 沿途 AoE/推撞。  
**機制特徵**: 步進迴圈 + 每步 AoE + SetUnitPosition 推移敵人。  
**範本**: 蒼月潮 MoonKnock (3×200u、AoE 300、群體推撞)  
**移植備註**: GGD dash 可表位移; 沿途判定與推撞無詞彙, 現多以 dash+damage 近似。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 04-04 神滅斬 | 黑魔導士 - 莉娜因巴斯(R); 黑魔導士 - 莉娜因巴斯(R) | 5 | 推退 40u/tick ×最多10 tick (~400u); 沿途樹木清除半徑300; 阻擋判定 dist(預期,實際 | instant 傷害 → PolledWait 0.5s → periodic  | 目標被推動 — LinaS_Effect 每tick SetUnitPositi | war3map.j:29777 (Actions: INT×12/×5 單體傷害 |
| 05-04 巴歐．薩喀爾嘎 | 破銅爛鐵 - 阿強一號(R); 慈悲的王者 - 賈修貝爾(R) | 5 | 50u/tick ×最多20 tick (~1000u), 撞樹半徑300, 終點 378×378 rect AoE,  | periodic 0.04s ×20 (Set+Move pair); EX 追 | 目標被推: udg_KnockBack_Target 沿施法角度每tick前推5 | j:28271-28302 (set + EnableTrigger), j:2 |
| 07-02 者、皆、陣 | 獸矛傳承使 - 蒼月潮(W) | 5 | 3段×200u 沿面向; 每段收集半徑300 + 樹清除300; 終點=前方600u | sleep 0.1 前置 → 單幀3段掃描 → 群體一次結算 → 施法者瞬移終點 | 施法者位移 — 掃完後 SetUnitPositionLoc 到前方600u;  | war3map.j:34390 (Actions: 3×200u loop +  |
| 12-002 仙氣發勁 | 龍之子 - 天地志狼(EX); 龍之子 - 天地志狼(EX) | 5 | caster blinks to 100u behind target; push 50u/tick ×12 = 600 | sleeps 0.5s+0.5s intro, then periodic 0. | 施法者位移 (blink behind target) + 目標被推動 (50u | j:29607-29683 (blink SetUnitPositionLocF |
| 17-04 狂龍斬 | 天上天下 - 棗 真夜(R) | 5 | 250u/tick ×10 tick = 2500u 之字路徑; 每偶數 tick 方向+216°並對前一位置 400  | periodic 0.06s ×10 | 施法者位移: 每 tick 前推 250u, 每2 tick 轉向+216° ( | j:28596-28620 (set, dmg 公式 28600), 28666 |
| 31-01 迴旋爪擊 | X戰警 - 金鋼狼(Q) | 5 | 50u/tick ×12 tick = 600u 直線; 沿路 250 半徑收集敵人入組, 第12 tick 對全組一次 | periodic 0.05s ×12 (~0.6s) | 施法者位移(代理式): 本體隱形, 旋轉 dummy (面向+195°/tick | j:40910-40937 (dmg=STR×2+100×lvl+50, EX× |
| 32-01 一騎槍閃 | 常勝將軍 - 趙子龍(Q) | 5 | 推退 30u/tick ×最多20 tick (600u); 沿途樹清除300; 阻擋判定 dist(預期,實際)>8  | instant (觸發無傷害) → periodic 0.04s ×20 | 目標被推動 — 每tick SetUnitPositionLoc 沿施法者→目標 | war3map.j:42559 (Actions: 設角度+enable), 4 |
| 32-03 閃光龍牙 | 常勝將軍 - 趙子龍(E) | 5 | 50u/tick, 步數=施放時距離/50; 到位後 250×250 rect 內只結算鎖定目標; 命中生成300%縮放 | sleep 0.1 前置 → periodic 0.03s 衝刺 → 終點單次結 | 施法者位移 — 每tick SetUnitPositionLoc 沿起點→目標原 | war3map.j:42663 (KniSkill: 鎖定目標+參數), 427 |
| 38-01 邪王炎殺劍 | 邪眼師 - 飛影(Q); 邪眼師 - 飛影(Q) | 5 | 衝刺 50u/tick ×12 (600u) 沿面向, 撞牆(位移差>20)提前停; 路徑 250r 收集敵人, 終點對 | periodic 0.02s ×≤12 | 施法者位移: 無敵(Avul)+A0J6 直線疾衝, 傷害在衝刺結束一次結算 | war3map.j:43741-43745 (A0OG cond), 43755 |
| 39-03 無名神風流-蛟龍 | 鬼畜紅王 - 鬼畜狂刀KYO(E) | 5 | 200u/tick 前衝 (最多7 tick=1400u 或距目標點<200 停), 每 tick AoE 350 收集 | periodic 0.05s ×≤7 tick | 施法者位移: 沿施法面向 200u/0.05s 步進衝鋒 | j:39638-39779 (Set j:39652-39669 dmg 公式  |
| 45-03 千鳥 | 寫輪眼復仇者 - 宇智波佐助(E) | 5 | 步長45+5×R lvl, 容忍半徑160+40×R lvl; 命中傷害200+200×lvl+20×英雄等級; 有A0 | periodic 0.03s ≤100 ticks (+3s清理sleep) | 施法者追蹤衝刺: 每tick朝目標推進45+5×A0U7lvl u (無碰撞Se | war3map.j:41777-42051 (period j:42049),  |
| 52-02 蹂躪編年史 | 海克力斯 - Berserker(W) | 5 | 階段1: 目標被拖向施法者 50u/tick 至距離≤50; 階段2: 沿施法者面向拋飛 400u, 21步 (步長=4 | 拖拽 periodic 0.05s; 拋飛 periodic 0.02s ×21 | 目標被推動: 先被拖到腳邊再被掄飛出去 (施法者不動) | j:51709-51743 (鎖定 pause+Avul+Arav), j:51 |
| 52-04 巨神一擊 | 海克力斯 - Berserker(R) | 5 | 蓄力: 7 個 h02M 斧 dummy 自 r400 隨機方位 thunderbolt 聚到手中斧 (位於面向+45° | 聚斧 periodic 0.04s ×7; 衝鋒 periodic 0.02s; | 施法者位移: 蓄力後直線衝到目標點才爆 (行進中無傷害) | j:51859-51906 (蓄力: 7斧聚合 j:51880-51888),  |
| 65-02 寒冰破碎 | 至尊學長 - 飛鼠先生(W) | 5 | 面向方向 10步×20u; 每步清 r300 樹木; r300 敵人被推離 -80u (背向) 播死亡動畫; 1/5 機 | periodic 0.04s ×10 (~0.4s) | 施法者位移衝刺; 敵人被推開 80u/hit | j:46781-46802 (起手), j:46871-46907 (每tick |
| 74-02 八刀一閃 | 神性的流失 - 賽菲洛斯(W) | 5 | 50u/tick ×最多16 tick (≤800u) 至施法點; 終點 400×400 rect AoE, 傷害 10 | periodic 0.02s (Set+Move pair); 終點後 0.1s | 施法者位移: 沿施法方向每tick polar 前推50u, 無碰撞傷害, 僅終 | j:48385-48401 (set+Enable, A05U 加持), j:4 |
| 76-02 伸縮自如的橡膠火箭砲 | 草帽小子 - 蒙其.D.魯夫(W); 草帽小子 - 蒙其.D.魯夫(W) | 5 | 擊退 50u/tick ×20 (最長 1000u), 沿路 200r 摧毀樹木, 撞牆 (位移差>8) 即停+Thun | 前置 sleep 0.05/0.10, 之後 periodic 0.04s ×2 | 施法者瞬移到目標後方 100u 揮拳; 之後目標被推動直線飛退 | war3map.j:36537-36544 (A0IP cond), 36547 |
| 78-04 死亡噴射肘擊 | 黑手黨老大 - 基廉列克(R) | 5 | 推退沿路摧毀destructable 300; 撞牆結算: 以撞點300×300矩形AoE傷害STR×3 (magic) | periodic 0.04s ≤20 ticks (0.5s起手延遲) | 施法者先瞬移到目標身上; 之後目標被沿施法方向推退40u/tick最多20 ti | war3map.j:50082-50229 (period j:50227) |
| 84-02 保齡球 | 百畝森林的霸主 - 維尼(W) | 5 | 50u/tick ×12 = 600u 直線滾動; 每 tick 前方步點半徑 200 傷害 (去重); 終點半徑 25 | periodic 0.05s, 最多 12 tick | 施法者本體滾動前進 (facing+190°/tick 旋轉); 終點敵人被沿遠 | j:51455-51470 (set 傷害+700% 動畫速+enable),  |
| 95-01 謝謝指教 | 皇者 - 騜(Q) | 5 | 目標被推 50u/tick ×(4+4×lvl) tick, 每tick 30 傷害, 撞樹半徑300; 撞牆時若帶 B | periodic 0.03s (Set+Effect pair) | 目標被推: 沿施法角度每tick前推50u; 位移<8u 判定撞牆提早結束 | j:54320-54345 (set+Enable), j:54386-5442 |
| 95-03 皇者戰氣第五十重天 | 皇者 - 騜(E) | 5 | 施法者 50u/tick 衝向目標 (dist/50 步), 每步累積+25傷害; 到達後 250×250 rect 內 | periodic 0.03s (Set+Effect pair) | 施法者位移: polar 逐tick逼近目標位置, 到點瞬間結算 | j:54442-54458 (set+A0YI+Enable), j:54547 |

## 攻擊觸發

**定義**: 普攻命中時機率/條件觸發的效果。  
**機制特徵**: EVENT_UNIT_ATTACKED / 傷害鏈路由, proc 判定。  
**範本**: 蒼月潮 Beast Spear (條件 9999 處決)  
**移植備註**: GGD passive.hooks onBasicAttack/onDamageDealt 對應。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 02-01 破魔之箭 | 除魔巫女 - 桔梗(Q) | 7 | single target on hit; mana burn = dmg×(0.20+0.15×lvl A03C)−3 | event-driven (EVENT_UNIT_DAMAGED dispatc | 無 | j:33955-34021 (Learn adds orb A0CE; Feed |
| 06-01 山形修煉-放 | 職業獵人 - 傑 富力士(Q); 職業獵人 - 傑 富力士(Q) | 7 | dummy shockwave (A0Y2) 朝被攻擊者發射; 機率 lvl(A08X)/20 | instant (on-attack proc) | 無 (dummy 投射物行進) | j:26823-26843 (EVENT_PLAYER_UNIT_ATTACKE |
| 19-04 幻影暗殺 | 戰國刺客Azumi - 安云(R); 戰國刺客Azumi - 安云(R) | 7 | 無範圍 — 單體加傷 lvl×100+AGI (+75 若 E00Z 形態); E00K 形態需背刺 (面向差 ≤90° | instant per attack-damage; AzumiHit 0.9s | AzumiShadow 變體將施法者瞬移至受害者背後 80u (PolarPro | j:27775-27796 (AzumiShadowNew 傷害), 27653 |
| 20-01 風王結界 | 亞瑟王 - Saber(W); 亞瑟王 - Saber(W) | 7 | 單體加傷 10+STR×(0.5+0.5×lvl) 魔法傷害, 每次耗魔 15+15×lvl | instant per attack hit (經 EVENT_UNIT_DAM | 無 | j:32098-32111 (加傷+扣魔), 32166-32173 (Air  |
| 27-03 忍法千變萬化之刀 | 猿飛佐助 - 風魔小次郎(E) | 7 | 元素 1(火)/2(酸)/3(雷)/4(冰) 隨機: 1-3 → dummy 'h00A' 對受擊者施 acidbomb | 開技 instant 給 3+3×lvl 層; 之後每次帶 B00C buff  | 無 | j:41344-41646 (charges 3+3lvl j:41358, r |
| 30-02 酒精灌腸 | 電車癡漢 - 臭作(W) | 7 | 單體; 無AoE | instant (攻擊事件當下; DisableTrigger→尾端 re-en | 施法者位移: 臭作瞬移到被攻擊目標位置 (SetUnitPositionLoc) | war3map.j:37313-37366 (EVENT_PLAYER_UNIT |
| 33-04 動物拳法 | 被剝削的勞工階級 - 牧太郎(R) | 7 | 無幾何; dummy 'ogru' 對被攻擊者施 hex (A04A); 機率 lvl(A09J)/25, EX 模式另 | instant (on-attack proc) | 無 | j:43496-43547 (EVENT_PLAYER_UNIT_ATTACKE |
| 61-03 打屁股風林火豬 | 死亡老二 - 克勞薩先生(E); 重金屬樂團的怪物 - 克勞薩II世(E) | 7 | 無 — 攻擊事件單體 proc | instant on EVENT_PLAYER_UNIT_ATTACKED (A | 無 | war3map.j:50781 (Ass: 學 lv1 附贈 A0OL), 50 |
| 75-02 幻影鬥氣 | 最M的魔法Jizz - 清蒸 飛鼠先生(W) | 7 | 單體: 攻擊時 (5×lvl+5)% 生成影像 h016 (1s, 半透明) 對被攻擊者補 20×lvl+30 魔法 | EVENT_PLAYER_UNIT_ATTACKED proc; 影像 0.5s | 無 | j:47216-47255 (機率 j:47229, 影分身+傷害 j:4723 |
| 75-02 龍捲風 | 最M的魔法Jizz - 清蒸 飛鼠先生(E) | 7 | 單體: 攻擊時 (5×lvl+5)% 生成影像 h016 (1s, 半透明) 對被攻擊者補 20×lvl+30 魔法 | EVENT_PLAYER_UNIT_ATTACKED proc; 影像 0.5s | 無 | j:47216-47255 (機率 j:47229, 影分身+傷害 j:4723 |
| 77-03 GLADIARIA ALAT | 神鳴流劍士 - 櫻綻剎那(E); 神鳴流劍士 - 櫻綻剎那(E) | 7 | 每次真實攻擊命中 +1×AGI 魔法傷害 (單體, 無幾何) | EVENT_PLAYER_UNIT_ATTACKED 登記 + 傷害事件結算 ( | 無 | j:49668-49703 (E00X gate j:49669, InitSe |
| 79-02 斬擊 | 開外掛的死神 - 黑崎一護(W); 外掛開很大的死神 - 黑崎一護(W) | 7 | 單體追加傷害 50+50×lvl+STR×2 | on-attack, 0.1s 延遲後結算 | 無 | j:37455-37478 (EVENT_PLAYER_UNIT_ATTACKE |
| 80-00 飛將神弓 | 亂世癿王者 - 呂布奉先(PASSIVE) | 7 | shockwave line via dummy (A0MW, level = lvl A0MY); proc chan | on attack, only while buff B02L (赤兔咆哮 mo | 傷害區行進 — dummy shockwave travels toward t | j:50534-50600 (EVENT_PLAYER_UNIT_ATTACKE |
| 82-00 天生法術書 | 白色之翼 - 涅吉。史普林。菲爾德(PASSIVE) | 7 | 蓄能上限 herolvl/3+1 (光球 u014 跟隨); 釋放: 每充能1發 thunderbolt dummy o | 攻擊命中(EVENT_UNIT_DAMAGED 傷害鏈)觸發; LightFir | 無施法者位移; thunderbolt 飛彈由引擎行進 | j:35141-35203 (蓄能), j:35070-35099 (fist  |
| 89-04 憤怒的簡諧運動 | 國寶級的畜生 - 熊貓(R) | 7 | 攻擊時 lvl(A0TO)% 機率: dummy 'oshm' 對自己施 bloodlust + A0SR stomp | instant (on-attack proc) | 無 | j:52784-52826 (EVENT_PLAYER_UNIT_ATTACKE |
| 91-02 疫病 | 死亡騎士(W); 不良少年(W) | 7 | PlagueStrike 3/20 機率: 目標腳下生成 1s 疫病 dummy u032 (lvl≥3 換 u033) | event-driven (EVENT_PLAYER_UNIT_ATTACKED | 無 | war3map.j:53157-53170 (PlagueLV: A0W4 lv |
| 96-01 華山劍法 | 笑傲江湖 - 令狐沖(Q) | 7 | 單體追加 10×lvl+AGI, 機率 (5+AGI/15)% | on-attack instant | 無 | j:44815-44823 (機率 j:44809, dmg j:44820), |

## 瞬發點爆

**定義**: 在目標點/目標身上瞬間爆一個 AoE。  
**機制特徵**: instant, 單次 GetUnitsInRange + 傷害(可帶拉人/暈)。  
**範本**: 妙蛙 90-03 藤鞭 (AoE 480 + 拉到腳下)  
**移植備註**: GGD damage+radius 直接對應; 拉人位移無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 15-03 雷電風暴 | 魔法老師 - 涅吉。史普林。菲爾德(E) | 8 | 目標點半徑 500 | instant (視覺 'e00Y' 2s) | 無 | j:34609-34616 (500 AoE at target loc), j |
| 15-04 千之雷 | 魔法老師 - 涅吉。史普林。菲爾德(R) | 8 | 目標單位周圍半徑 500 | instant (視覺 2s) | 無 | j:34676-34682 (500 AoE around target uni |
| 16-002 布都御魂 | 通靈人 - 麻倉葉(EX) | 8 | 前方 450u 處 AoE 600 半徑, 傷害 STR×8+750; 條件: 身邊 450×450 rect 內有 ' | instant (+3s 清投射物) | 傷害區固定 (u00T 僅視覺行進) | j:31584-31662 (cond A06M j:31585; gate 4 |
| 23-03 雷牙一閃˙雷牙烈霸 | 時空管理局執務官 - 菲特·泰斯塔羅沙(E) | 8 | 施法者位置 350×350 rect 內 15 個隨機閃光; 震屏 1600×1600 於目標點 ×lvl 次 | instant (特效串 15×0.01s, 2s 後清 dummy) | 無 | j:31279-31334 (u02R dummy j:31298, 15×Ho |
| 25-03 北斗百裂拳 | 北斗之鼠 - 拳四郎(E); 北斗神拳掌門人 - 拳四郎(E) | 8 | AoE 450 @ 施法目標點 (敵/非建築/活) | sleep 0.1 後單次結算 | 無 | war3map.j:38837 (Actions: sleep 0.1 + Fo |
| 38-02 邪王炎殺煉獄焦 | 邪眼師 - 飛影(W); 邪眼師 - 飛影(W) | 8 | 目標點 380 AoE; 傷害 100+150×lvl (+U010 妖化形態再加 AGI×2) | instant | 無 | war3map.j:43640-43644 (A09H cond), 43670 |
| 45-01 火遁-豪火龍之術 | 寫輪眼復仇者 - 宇智波佐助(Q) | 8 | 目標點330 AoE, 每敵傷害100×lvl+150+AGI×2 (magic); 附dummy 'hfoo' 施ho | instant (0.30s起飛延遲, 0.30s收尾) | 火龍dummy(lvl隻o020+1隻o021)0.3s後從施法者整批瞬移到目標 | war3map.j:42096-42181 |
| 53-01 獸王牙操彈 | 獸神官 - 傑洛士(Q); 憂鬱少女 - 涼宮八ㄦ匕(W) | 8 | 目標點 450×450 rect AoE, 傷害 100×lvl+150+3×INT; dummy 獸群 lvl+2 隻 | instant + sleep 0.05/0.30/0.30 分段演出 | dummy 獸彈飛向目標 (視覺); 施法者與目標不動 | war3map.j:40097-40101 (A0K1 cond), 40139 |
| 70-01 伸卡球 | 白木老樹精 - 白木卡迪那(Q) | 8 | 目標點: 殺樹半徑 lvl×50+300; 傷害 AoE lvl×50+280, 傷害 lvl×150+STR×3 魔法 | 0.5s 前搖 sleep 後 instant, +2s 清演出 dummy | 無 (巨大 'h01X' dummy healingspray 只是投球演出) | j:47933-47954 (傷害式 47937, 殺樹 47950, AoE  |
| 74-04 最終殞落星 | 神性的流失 - 賽菲洛斯(R) | 8 | JASS 側無傷害幾何; 鏡頭震動範圍 1600×1600 rect | sleep 0.3s → 震動 → sleep 4s → 清除 | 無 | j:48544-48561 (僅 CameraSetEQNoise/Clear) |
| 76-03 伸縮自如的槍亂打 | 草帽小子 - 蒙其.D.魯夫(E); 草帽小子 - 蒙其.D.魯夫(E) | 8 | 目標點 400 AoE, 200+200×lvl | instant | 無 | war3map.j:36402-36406 (A0IV cond), 36422 |
| 81-01 Barrel Shot | 魔砲少女 - 高町奈葉(Q); 白色惡魔 - 高町奈葉(Q) | 8 | 目標點生成 dummy 'h02W' 施放 thunderclap (物件資料傷害); 惡魔形態額外 AoE 330 半 | instant (+1.6s 清 dummy) | 無 | j:35912-35981 (cond A0XG j:35913; dummy+ |
| 81-02 Acxel Shooter | 魔砲少女 - 高町奈葉(W); 白色惡魔 - 高町奈葉(W) | 8 | 彈幕 3×lvl 顆 'o023' 先散佈施法者旁 300×300 rect, 0.3s 後瞬移到目標點 150×150 | sleep-loop 0.05s+0.3s 集束後單幀判傷 | 傷害區固定於目標點 (彈幕單位瞬移為視覺) | j:35801-35907 (cond A0LB j:35802; 彈幕 loo |
| 81-04 Starlight Breaker Plus | 魔砲少女 - 高町奈葉(R); 白色惡魔 - 高町奈葉(R) | 8 | 目標點 AoE 530 半徑, dmg 100+300×lvl (+INT×4 惡魔形態); 砲身 dummy h01Y | 0.3s 延遲 → instant AoE | 無 | j:36095-36177 (cond A0XO j:36096; dmg j: |
| 90-03 藤鞭 | 種子神奇寶貝 - 妙蛙花(E) | 8 | AoE 480 於施法目標點; 傷害 200+150×lvl 魔法 | instant (施法後延遲1.0s) | 目標被推動: 範圍內非建築單位 SetUnitPositionLoc 瞬移到施法 | j:26628-26694 (sleep j:26680, AoE480 j:2 |
| 90-03 藤鞭 | 種子神奇寶貝 - 妙蛙種子(E) | 8 | AoE 480 於施法目標點; 傷害 200+150×lvl 魔法 | instant (施法後延遲1.0s) | 目標被推動: 範圍內非建築單位 SetUnitPositionLoc 瞬移到施法 | j:26628-26694 (sleep j:26680, AoE480 j:2 |

## 單體斬擊

**定義**: 無幾何、鎖定單體的直接傷害。  
**機制特徵**: UnitDamageTarget 單發, 常附條件加成。  
**範本**: 菲特 23-04 雷焰聖劍 (EX 條件 2300 終結)  
**移植備註**: GGD targeted damage 直接對應。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 01-01 凶斬 | 最終幻想 - 克勞德(Q) | 9 | 單體無幾何; EX(A0AZ)分支傷害80+70×lvl chaos; A072分支傷害由基底技能物件資料提供, 觸發只 | instant (0.30s / EX 0.10s 延遲) | 施法者瞬移到目標所在位置 (SetUnitPositionLoc) | war3map.j:33385-33448 |
| 16-03 無無明亦無 | 通靈人 - 麻倉葉(Q) | 9 | 單體 200+150×lvl 魔傷 + dummy purge (A0WP, 等級同步); 斬擊特效單位 'u018'  | 0.5s 延遲 → instant; 1s 後清除 | 施法者位移: 斬擊後瞬移至目標點沿施法角再 +100u (穿身斬) | j:31450-31489 (cond A044 j:31451; dmg j: |
| 18-02 寄生種子 | 妖狐藏馬 - 南野秀一(W) | 9 | 單體目標, 無AoE; dummy 'o00A' 壽命3s | sleep 0.01 驗證buff → 75傷害 → sleep 5s → 定身 | 無 | war3map.j:27875-27975 (Conditions A0RV;  |
| 18-02 寄生種子 | 妖狐藏馬 - 南野秀一(W) | 9 | 單體目標, 無AoE; dummy 'o00A' 壽命3s | sleep 0.01 驗證buff → 75傷害 → sleep 5s → 定身 | 無 | war3map.j:27875-27975 (Conditions A0RV;  |
| 23-04 雷焰聖劍 | 時空管理局執務官 - 菲特·泰斯塔羅沙(R) | 9 | 單體 2300 魔法 (EX條件觸發); 震屏 rect 1600×1600; 地形波紋 600×600 | instant; 附加自我強化 A0RE 持續 lvl×4 s 後移除 | 無 | j:31173-31274 (EX gate j:31180-31191, 23 |
| 25-01 北斗懺悔拳 | 北斗之鼠 - 拳四郎(Q); 北斗神拳掌門人 - 拳四郎(Q) | 9 | 純單體, 無範圍 | sleep 1s ×3 (『你已經死了』三段演出) 後一次結算 | 無 | war3map.j:38595 (Actions: 3×TriggerSleep |
| 31-02 重爪擊 | X戰警 - 金鋼狼(W) | 9 | 無 | instant | 無 | j:40880-40890 (SPELL_EFFECT 40888, 自癒 25 |
| 44-04 心臟麻痺 | 奇樂 - 夜神月(R) | 9 | single target; dmg = target maxHP×(0.05+0.10×lvl)+450 | instant cast + 0.10s buff-watchdog windo | 無 | j:42352-42381 (dummy casts 'unholyfrenzy |
| 64-01 威士忌攻擊 | 姜窩肯 - 約翰走路(Q) | 9 | 無 (單體) | instant | 無 | j:46492-46495 (單體 100×lvl, DAMAGE_TYPE_M |
| 65-03 魔法膨脹 | 至尊學長 - 飛鼠先生(E) | 9 | 單體, 無AoE; 傷害 = 目標(最大MP−當前MP)×lvl, 之後把目標 MP 補滿 100% | instant | 無 | j:46912-46945 (傷害公式 j:46927, 回魔 j:46928) |
| 89-002 俄羅斯輪盤 | 國寶級的畜生 - 熊貓(EX) | 6 | d6 賭博: 1=自己吃 99999 CHAOS, 2=目標吃 99999 CHAOS, 3~6=空包彈 (只有字幕) | instant | 無 | j:52855-52958 (cond A0TU j:52856; GetRan |
| 91-03 碎心打擊 | 死亡騎士(E); 不良少年(E) | 9 | 無幾何; 每個疫病 buff (Bapl / B047) 各加 50+25×lvl 魔法傷 | instant | 無 | war3map.j:53329-53333 (A0W1 cond), 53350 |
| 94-01 北斗爆橘拳 | 夜市人生 - 金居福(Q) | 9 | 單體目標; 視覺 dummy 'o001' 0.8s | instant | 無 | war3map.j:53840-53891 (Conditions A0OV j |
| 95-04 藍色戰氣一百重天 | 皇者 - 騜(R) | 9 | 單體 300+300×lvl; 前置: 自身帶 B04Y 時先在原地 dummy thunderclap (A0UT) | instant (TriggerSleepAction 0.00 分兩段) | 無 | j:54617-54643 (dummy stomp 分支 j:54620-54 |

## 行進波動

**定義**: 傷害點沿直線逐步推進的波動, 可帶終點爆發。  
**機制特徵**: 週期計時器 + PolarProjection 步進 + 每步 AoE; 傷害區在動、施法者不動。  
**範本**: 莉娜 04-03 龍破斬 (45u/tick、AoE 200、終點 450 爆發)  
**移植備註**: GGD 以 spawnProjectile(wave) 近似; 終點爆發與逐步判定尚無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 02-002 神通眼 | 除魔巫女 - 桔梗(EX) | 6 | dummy 'h032' (scale 800%) spawns 160u ahead; 100u/step ×40 = | instant cast → periodic 0.01s ×40 + term | 傷害區行進 — giant marker unit steps 100u/tic | j:34026-34051 (setup), j:34116-34138 (0. |
| 04-03 龍破斬 | 黑魔導士 - 莉娜因巴斯(E); 黑魔導士 - 莉娜因巴斯(E) | 6 | 45u/tick 行進; 每tick收集半徑200 (樹清除256); 終點爆發: 收集450 / 樹600 / 特效環 | periodic 0.03s ×≤70; Fire NOVA 為同 rawcod | 傷害區行進 — 彈體 (dummy h014) 沿施法線每tick前進45u;  | war3map.j:29893 (Fire_NOVA 詠唱), 29951 (S |
| 08-03 龍鬥氣砲咒文 | 傳說的龍騎士 - 勇者小呆(E); 傳說的龍騎士 - 勇者小呆(E) | 7 | 傷害由基底 AOsh(Shockwave 直線波)承載; JASS 視覺: 10×'e003' 龍形 dummy 沿面向 | instant (視覺 1s 定時生命; 0.5s+2s sleep 清理) | 傷害區行進: 基底 shockwave 投射物直線前進; 觸發不動任何單位 | j:28815-28873 (cond A05J j:28816, 10×150 |
| 11-04 三千世界 | 三刀流劍士 - 索隆(R); 三刀流劍士 - 索隆(R) | 6 | 50u/tick ×15 = 750u直線, 每tick 250 AoE (每敵僅命中一次, ThworldGroup去 | periodic 0.04s ×15 | 施法者隱形; 劍氣dummy(h01T)每tick前進50u共750u; 結束時 | war3map.j:29221-29255, 29319-29349 (peri |
| 12-04 龍氣爆發 | 龍之子 - 天地志狼(R); 龍之子 - 天地志狼(R) | 6 | dummy spawn 125u ahead; 75u/step ×25 = 1875u line; collect r | channel ticks 1.0s ×≤3 (charge), then pe | 傷害區行進 — dummy 'h000' steps 75u/tick alon | j:29391-29423 (setup), j:29449-29476 (ch |
| 27-01 忍法風魔手裡劍 | 猿飛佐助 - 風魔小次郎(Q) | 6 | 兩把 dummy 扇 'h009' 沿 ±45° 夾角飛出: 去程 30u/tick 共 500u; 迴旋繞 pivot | periodic 0.03s; 三階段: 去程 ~17 tick / 迴旋 31 | 傷害區行進: 雙迴力鏢 (出→弧→回), 施法者不動 | j:41136-41341 (init 幾何 j:41147-41161, dm |
| 34-002 冥道殘月破 | 犬妖 - 殺生丸(EX) | 6 | 彈體 50u/tick 直線行進至目標點; 終點半徑 600 吞噬 | periodic 0.03s 行進; 吞噬 6.0s 後釋放, 再 1.0s 清 | 冥道口 dummy 'h02E' 從施法者行進至目標點; 被吞單位被隱藏+暫停  | j:39014-39028 (set angle/dist + enable), |
| 35-04 光牙 | 不死之身-無 - 藤井八雲(R) | 6 | 16 step × 50u = 800u 直線; 每 tick 半徑 230 傷害 / 250 摧毀樹木 | periodic 0.04s ×16 tick | 傷害區沿施法角行進; 施法者不動 | j:43027-43089 (dmg 公式+EX 八連震盪波), j:43155 |
| 38-03 邪王炎殺黑龍波 | 邪眼師 - 飛影(E); 邪眼師 - 飛影(E) | 7 | 龍頭 h02F 生成於前方 160u; 前進 130u/tick ×14 (~1820u) 鋸齒(±35° 交替); 每 | periodic 0.08s ×14, 終點結算後 sleep 1.5s 清場; | 傷害區行進: 黑龍頭沿鋸齒直線推進 (EX 模式加兩顆 ±45° 隨機蛇行副龍頭 | war3map.j:44031-44035 (A09I cond), 44060 |
| 47-03 九頭龍閃 | 殺人劍客 - 佐佐木小次郎(E) | 6 | 目標點起 9 段: 第i段位於 r=i×40, 角=面向+i×40° (螺旋); 每段 AoE 210, 傷 50×lv | periodic 0.13s ×9 (~1.2s) | 傷害點沿螺旋行進; 第9段後施法者瞬移到目標點 (突進斬終格) | j:43276-43303 (起手 thunderclap dummy A0RP |
| 60-01 科奇利族的迴旋鏢 | 時空勇者 - 林克(Q) | 6 | boomerang dummy 'h00P': out 150u @50u/tick; orbit pivot ≈559 | periodic 0.03s (out 3 ticks → orbit 21 t | 傷害區行進 — boomerang travels out-orbit-retu | j:45936-45986 (launch math j:45964), j:4 |
| 77-04 真-雷光劍 | 神鳴流劍士 - 櫻綻剎那(R); 神鳴流劍士 - 櫻綻剎那(R) | 6 | dummy 'o02U' 起點=施法者前 200u, 80u/tick 直線 (max ~1600u), 逐 tick  | periodic 0.04s ×≤20 tick; 終點爆發後 1s 清理 | 傷害區行進: 投射 dummy 直線前進; 施法者不動 | j:49762-49797 (cond A0UB j:49763, 200u 起 |
| 79-03 月牙天衝 | 開外掛的死神 - 黑崎一護(E); 外掛開很大的死神 - 黑崎一護(E) | 6 | 50u/tick ×20 (總程1000u), 每tick AoE 300 (dummy周圍), 摧毀樹330; 傷害  | periodic 0.03s (Start+Effect pair); 終點生成 | 傷害區行進: 劍氣dummy o01Q/o01R 沿施法角度每tick前推50u | j:37506-37524 (spawn+Enable), j:37602-37 |
| 82-03 雷之投擲 | 白色之翼 - 涅吉。史普林。菲爾德(E) | 7 | 投擲: 雷槍 o02J (max 3) 高度410, 分21步飛向目標點 (步長=dist/21, 每tick降20), | ThunderCreate/Move periodic 0.01s; Thund | 傷害區行進: 雷槍單位飛向目標點後爆; 崩拳版傷害點沿面向逐步推進 | j:35355-35413 (充能/投擲), j:35425-35446 (生成 |

## 原地震波

**定義**: 以施法者為中心的瞬間 AoE。  
**機制特徵**: instant, 圓心=施法者。  
**範本**: 劍心 47-04 天翔龍閃 (r200 吸拉 + EX 18 向劍氣環)  
**移植備註**: GGD castType self/ground + radius 對應良好。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 14-01 東風繪扇、南風末廣 | 治癒系公主 - 木乃香(Q) | 8 | 以施法者為中心 rect 650×650; EX 模式 1200×1200 | instant (視覺 0.05s×60 tick, 3.0s 後清理) | 無/施法者原地; 兩個 'o01G' 視覺單位旋轉上升 | j:30354-30368 (heal loop + rects), j:302 |
| 39-04 祕奧義．金色的神風 | 鬼畜紅王 - 鬼畜狂刀KYO(R) | 8 | 施法者中心 AoE 550, dmg AGI×1×lvl (EX: AGI×2×lvl); 另 4隻 dummy 於 2 | instant (+1.5s 清 dummy) | 無 (四神 shockwave 向施法者收束為視覺+物件資料傷害) | j:39784-39906 (cond A0DJ j:39785; AoE 55 |
| 43-04 爆裂海景佛跳牆 | 食神 - 撒尿牛丸(E) | 8 | 基底 ANfd(原生 Fan of Knives, data 570) 自身 AoE; JASS rider: 對 Ge | instant | 無 | j:37952-37970 (cond ANfd j:37953, 3×INT  |
| 47-04 天翔龍閃 | 殺人劍客 - 佐佐木小次郎(R) | 8 | 敵人 r200 內全部瞬移到施法者位置; EX_Mode: 18 個 hkni dummy 每 20° 一發 shock | instant (SPELL_CAST 即發; EX 清理 sleep 2s) | 目標被拉到施法者身上; EX 波動由引擎向外行進 | j:43185-43271 (拉人 j:43208-43215/43241, E |
| 71-04 萬惡歸宗 | 邪惡意念集合體 - 死之王(R) | 8 | 施法者為圓心 600 AoE | instant 吸魔 → sleep 1s → 結算傷害 | 無 | war3map.j:48232-48301 (Conditions A0HK j |
| 72-04 黑化 | 美白大法師 - 黑人牙膏(R) | 8 | 施法者中心 AoE 700, 每個非建築 dmg 30×heroLvl + rand(20,INT)×(lvl×9) ( | instant (單幀全場判傷) | 無 (施法者暫停+變黑演出) | j:47344-47403 (cond A0CO j:47345; dmg 公式 |
| 74-01 獄門 | 神性的流失 - 賽菲洛斯(Q) | 8 | 落地 AoE 370 繞自身, 傷害 250+100×lvl; EX追擊: dummy inferno + 視覺半徑60 | 升空0.3s (無敵+暫停) → 落地瞬發; EX分支再 2s/5s 清理 | 施法者垂直位移: fly height 0→1000→0 (原地躍起壓地), 水 | j:48716-48755 (升空 j:48719-48722, AoE370  |
| 77-01 百烈櫻華斬 | 神鳴流劍士 - 櫻綻剎那(Q); 神鳴流劍士 - 櫻綻剎那(Q) | 8 | 400 半徑內敵人全部徑向擊退: Move_Func 50u/tick ×10 ≈500u, 撞障礙(位移<10u)即停 | instant; 擊退 0.04s/tick ×10; 球體視覺 1s (Siz | 目標被推動: 沿施法者→目標角度徑向外推; 施法者不動 | j:49084-49175 (cond A0TV j:49085, 400 Ao |
| 77-02 雷鳴劍 | 神鳴流劍士 - 櫻綻剎那(W); 神鳴流劍士 - 櫻綻剎那(W) | 8 | 基底 AHtc(雷霆一擊)承載實傷; JASS 傷害式 250+100×lvl − 距離/2 存在但作用於 udg_In | instant; 球體視覺 1s | 無 | j:49612-49646 (cond A0JB j:49613, dmg 公式 |
| 80-03 鬼神烈戟 | 亂世癿王者 - 呂布奉先(E) | 8 | AoE 530 around caster; dmg 150+200×lvl+3×STR; plus 3 dummy ' | instant | 無 (caster stationary; stampede missiles  | j:50390-50442 (3× CreateNUnits 'o01X' +  |
| 86-04 打雷絕招 | 傲嬌電氣老鼠 - 皮卡娘(R) | 8 | 施法者為圓心: 半徑 100+200×技能等級; 英雄等級≥30 追加第二圈 600+200×技能等級; 每個圈內單位一 | instant 齊發 → sleep 4s 清理 | 無 | war3map.j:40445-40514 (Conditions A0C0 j |
| 92-03 狂草泥馬 | 看似憂鬱的神獸 - 草泥馬(W); 看似憂鬱的神獸 - 草泥馬(W) | 8 | 開技: 以自身金錢 10%×lvl 為傷害(上限 400×lvl), 500 半徑對所有敵人 + 嘲諷 dummy 'o | 開技 instant; 攻擊 rider 為 EVENT_PLAYER_UNIT | 無 | j:45350-45406 (cond A0WB j:45351, 金錢傷害 j |

## 受擊反應

**定義**: 被打時觸發的反擊/格擋/吸收。  
**機制特徵**: EVENT_UNIT_DAMAGED + 條件 + 反傷/護盾/閃現。  
**範本**: Saber Avalon (受擊反擊 30×lvl+5×rank×STR); 涅吉 太陰道 (7s 吸收→神像砸落)  
**移植備註**: GGD passive.hooks onDamageTaken 對應; 累積轉化無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 20-02 感知能力 | 亞瑟王 - Saber(Q); 亞瑟王 - Saber(Q) | 8 | 施法者 1200 範圍內的敵對 Saber (E002/E00L), 魔力≥30%, 50% 機率 | instant per enemy hero spell cast | 無 | j:32053-32073 (dummy 'o00G' 0.5s + A0CZ  |
| 20-04 Avalon-永恆的理想鄉 | 亞瑟王 - Saber(R); 亞瑟王 - Saber(R) | 7 | 敵方英雄以指向性法術鎖定 Saber 時觸發: 以 Saber 為中心 900 AoE, 傷害 30×英雄等級+STR× | 施法開 (lvl+1)s 反制窗口 (avalonReady sleep); 反 | 無 | j:32381-32388 (窗口 enable/disable), 32402 |
| 31-04 不要踢我蛋蛋 | X戰警 - 金鋼狼(R) | 7 | 無 (單體反射) | instant (每次受傷經 DamageLink 檢定) | 無 | j:41083-41097 (反彈 0.6×傷害 41086/41088), b |
| 64-04 魔幻浮水印 | 姜窩肯 - 約翰走路(R) | 7 | 無 (事件觸發) | 持續被動, 每次被攻擊宣告觸發 | 無 | j:46658-46661 (記錄 Mark 施主), j:46674-4670 |
| 65-002 永恆的愚蠢鄉 | 至尊學長 - 飛鼠先生(EX) | 7 | 反擊 AoE 半徑 3600 (幾乎全場) 繞被指向的自身; 傷害 (herolvl+rand(5,10))×200 混 | 視窗 sleep 6.0s; 反擊 instant, 6s 後清 dummy | 無 | j:47102-47124 (6s 窗+傷害池 j:47111-47114),  |
| 77-00 浮雲-旋一閃 | 神鳴流劍士 - 櫻綻剎那(PASSIVE); 神鳴流劍士 - 櫻綻剎那(PASS | 7 | 窗內被 ≤200u 的未暫停敵方英雄打到即觸發: 攻擊者沿 剎那→攻擊者 軸每 tick −20u (被拉過剎那身後,  | 開技開 0.5s 反擊窗 (Cloud reset); 命中後拋摔 0.02s/ | 目標被推動(過肩摔式拋越施法者); 施法者隱形至落地 | j:49352-49374 (cond A0JD j:49353, 0.5s 窗 |
| 79-002 虛化 | 開外掛的死神 - 黑崎一護(EX); 外掛開很大的死神 - 黑崎一護(EX) | 7 | 自身; 30% 機率 (GetRandomInt(1,10)<=3) 完全格擋 | buff B048 持續期間; close 為 0.3s 週期監視 buff 消 | 無 | j:37642-37647 (start: A0LS→lv2+變黑), j:37 |
| 82-001 太陰道-敵彈吸收陣 | 白色之翼 - 涅吉。史普林。菲爾德(EX) | 7 | 釋放: 神像 o02K 於受擊目標處自高度1000墜下 (50/tick), 著地 AoE 300, 傷 1000+吸收 | 吸收窗: buff B059 期間 (absorpStart sleep 7.0 | 傷害物墜落: 神像垂直下降至地面才爆 | j:35711-35728 (吸收+歸零 DamageModify(0) j:3 |
| 89-02 憤怒的菊花 | 國寶級的畜生 - 熊貓(W) | 7 | 被攻擊疊層 (vertex 變色顯示); <30層: lvl(A0TK)×3% 機率 dummy 'e00F' 對攻擊者 | instant per 被攻擊事件; 疊層每 1s 衰減 1 | 無 | j:52680-52779 (EVENT_PLAYER_UNIT_ATTACKE |
| 92-00 憂鬱的眼神 | 看似憂鬱的神獸 - 草泥馬(PASSIVE); 看似憂鬱的神獸 - 草泥馬(PA | 7 | 角度判定: (攻擊者面向−馬面向) mod 360 ∈ [155°,205°] 即正面互瞪時觸發; dummy 施 A0 | EVENT_UNIT_DAMAGED (Open Skill of Horse  | 無 | j:45161-45193 (角度窗 j:45161-45169, crippl |
| 93-03 這次考試很簡單 | 會叫的野獸 - 傳說中的大刀(E) | 7 | 單體: 目標當前 HP 與 MP 各暫時扣 10%×lvl, 8 秒後若存活歸還 | 施法 instant 掛標記; 目標受傷時觸發, 效果持續 8s (sleep) | 無 | j:53683-53689 (SPELL_CAST 註冊 InitSetup+D |
| 98-04 自在飛翔 | 學姊 - 小派(R) | 7 | 隱形 'hfoo' dummy (3s) 拿幻象權杖道具 'will' 對學姊使用 → 產生幻象分身 | instant per 受擊, 10% 機率; dummy 1s 後清 | 無 | j:55179-55197 (JudgeFunc A0ZI>0 且 1/10 j |

## 純演出/物件資料

**定義**: 觸發只做音效/文字/鏡頭, 實效全在物件編輯器。  
**機制特徵**: PlaySound/TextTag/CameraShake only。  
**範本**: 胖虎 40-02 爆熱神音 (純配音)  
**移植備註**: 行為以 WC3基底 欄判讀; GGD 依物件資料移植。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 37-04 魔界之王 | 魔界霸主 - 巴恩大魔王(R) | 7 | 震動及於目標點 1600×1600 rect 內單位的玩家鏡頭 (×lvl 次) | instant + 0.5s 後清震動 | 無 | j:44469-44488 (只有 CameraSetEQNoise + 2 音 |
| 40-02 必殺！爆熱神音！ | 地獄歌神 - 憤怒的胖虎(W) | 7 | 無 | instant | 無 | j:39114-39132 (只有 PlaySoundOnUnitBJ ×2) |
| 40-03 萬解-貓王胖虎 | 地獄歌神 - 憤怒的胖虎(E) | 7 | 無 | instant | 無 | j:39137-39155 (只有 PlaySoundOnUnitBJ ×2) |
| 49-00 撲殺爪擊 | 殺戮之牙 - 異形(PASSIVE) | 7 | 無 — 單體目標點特效 | instant on SPELL_EFFECT | 無 | war3map.j:46434 (Actions: ThunderClap 特效 |
| 58-03 就決定是你了!小智 | 神騎寶貝 - 皮卡丘(E); 神奇寶貝兒 - 皮卡丘(E) | 6 | 無 (JASS 側) | instant | 無 | j:40241-40250 (Actions 僅 PlaySoundBJ gg_ |
| 61-01惡魔球 | 死亡老二 - 克勞薩先生(Q); 重金屬樂團的怪物 - 克勞薩II世(Q) | 7 | 無 | instant on SPELL_CAST | 無 | war3map.j:50908 (Actions: 僅一組浮動文字 TRIGST |
| 69-02 黑泥召喚 | 英靈-亞瑟王 - 黑化Saber(W) | 7 |  |  |  | war3map.j:1802 (僅 'trigger gg_trg_MudAtt |
| 84-01 冷笑話 | 百畝森林的霸主 - 維尼(Q) | 7 | 無 (機制在物件資料) | instant | 無 | j:51367-51438 (GetRandomInt(1,8)→八選一漂浮字, |
| 86-00 裝可愛 | 傲嬌電氣老鼠 - 皮卡娘(PASSIVE) | 6 |  | instant | 無 | war3map.j:40422-40440 (Conditions A0BX j |
| 94-00 恰恰~ | 夜市人生 - 金居福(PASSIVE) | 7 |  | instant | 無 | war3map.j:53817-53835 (Conditions A0O8 j |

## 週期領域

**定義**: 持續期間週期作用於周圍 (傷害/治療/點射)。  
**機制特徵**: periodic timer + 圓形範圍作用。  
**範本**: 貞子 66-04 靈壓震撼 (光環緩速+immolation)  
**移植備註**: GGD auras 可表修飾; 週期傷害 (DoT) 無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 19-03 瞬切百殺 | 戰國刺客Azumi - 安云(E); 戰國刺客Azumi - 安云(E) | 5 | 斬殺區 = 640×640 rect (gg_rct_HundKill, Rect(256,-64,896,576) j | periodic 0.15s ×8 刀 (AuzimiCutCount==8 結 | 施法者被瞬移: 先 SetUnitPositionLoc 至目標點, 之後每 t | j:27483-27517 (teleport+MoveRectToLoc 27 |
| 26-04 開天闢地‧洨者聖臨 | 豪洨天王 - 鄭先生(R) | 5 | 觸發側無數值; 傷害幾何在物件資料(base AEIl) | channel 3+3×lvl s | 無 (以施法者為中心) | war3map.j:38026-38045 |
| 53-04 暴爆咒 | 獸神官 - 傑洛士(R) | 5 | 旋轉環: dummy 生成點 = 施法者周圍 300u, 角度 facing+36°×i, i=0..9; 每點 275 | periodic 0.35s ×10 (~3.5s), 尾端 sleep 2s  | 傷害區繞施法者旋轉行進 (每 tick 前進 36°), 施法者不動 | war3map.j:39954-39958 (A0UE cond), 39984 |
| 53-04 暴爆咒 | 憂鬱少女 - 涼宮八ㄦ匕(E) | 5 | 旋轉環: dummy 生成點 = 施法者周圍 300u, 角度 facing+36°×i, i=0..9; 每點 275 | periodic 0.35s ×10 (~3.5s), 尾端 sleep 2s  | 傷害區繞施法者旋轉行進 (每 tick 前進 36°), 施法者不動 | war3map.j:39954-39958 (A0UE cond), 39984 |
| 60-04 迴旋斬 | 時空勇者 - 林克(R) | 5 | AoE 375 around caster's current position per tick; dmg STR×l | periodic 0.10s ×30 (3s) | 傷害區跟隨施法者 (caster free to walk, zone re-c | j:46102-46143 (setup, dmg formula j:4612 |
| 66-04  靈壓震撼 | 七夜怪談 - 貞子(R) | 6 | 施法者周圍 600 半徑; 每目標傷害 = 0.5×該目標與貞子距離 (越遠越痛, 上限~300) | toggle (immolation buff B025 存續期間) + per | 無 (光環跟隨施法者) | j:48897-48905 (A0ID 等級同步 A0IC), 48918-48 |
| 92-04 馬勒戈壁 | 看似憂鬱的神獸 - 草泥馬(R); 看似憂鬱的神獸 - 草泥馬(R) | 5 | 以馬為中心 900×900 rect: 每 tick 對敵方非建築 100×lvl 魔法傷害; 敵方英雄且金 ≥150× | periodic 0.98s ×~6 tick (開技後 6s 關閉) | 傷害區跟隨施法者 (rect 每 tick 重取馬的位置) | j:45412-45525 (cond A06Y j:45413, 6s 窗 j |
| 93-02 抽點名 | 會叫的野獸 - 傳說中的大刀(W) | 5 | 叫獸 600 AoE 內取第一個合法敵人, 隱形 'hfoo' dummy (1s, A0WI) 下 thunderbo | periodic timer 17−2×lvl s (repeating), 每 | 無 | j:53574-53584 (學習時 StartTimerBJ 17−2lvl  |
| 98-02 平易近人的笑容 | 學姊 - 小派(W) | 5 | 學姊 300 AoE 內存活友軍 +100×lvl HP | periodic 30.00s | 無 | j:55140-55153 (heal 55143, 300 enum 5515 |
| 99-04 世界第一的公主殿下 | 夢幻之星 - 初音(R) | 5 | 每pulse對Miku周圍375內: 友軍dummy-cast healingwave(A11E 99-04b), EX | periodic 2.00s pulses, 持續2+2×lvl s | 脈衝區跟隨施法者 (每tick取Miku當前位置) | war3map.j:54910-55000 (period j:54997) |

## 鎖定連段

**定義**: 鎖住目標後播放腳本化多段打擊。  
**機制特徵**: Pause + 逐段傷害/特效 + 計數器。  
**範本**: Saber EX 20-002 (7 連斬 + 1800 終結)  
**移植備註**: GGD 無連段詞彙; 以總傷 applyBuff/damage 折算。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 01-03 畫龍點睛 | 最終幻想 - 克勞德(E) | 4 | 拋甩半徑150, 最終傷害300+150×lvl (magic) | periodic 0.04s ×15 | 雙方飛行高度400+無敵+Pause; 每tick目標被甩到施法者周圍150u隨 | war3map.j:33325-33378, 33453-33504 (peri |
| 01-04 超究武神霸斬 | 最終幻想 - 克勞德(R) | 4 | 7hit, 每hit 49+50×lvl (EX A0B1: +(0.25+0.25×lvl)×STR); 第7hit再 | sleep-loop 7段 (sleep 1-0.5i / 1-0.6i 遞減) | 施法者每hit瞬移到目標周圍70u(+270°/hit); 第7hit雙方拉到1 | war3map.j:33759-33950 |
| 07-01 臨、兵、鬥 | 獸矛傳承使 - 蒼月潮(Q) | 4 | 無幾何 — 僅旗標與浮動文字 | instant; MoonCombo=1 維持 1s (TriggerSleep | 無 | war3map.j:34151 (Actions: 文字 + set udg_M |
| 11-03 鬼氣九刀流-阿修羅壹霧銀 | 三刀流劍士 - 索隆(E); 三刀流劍士 - 索隆(E) | 4 | 單體無AoE; 傷害150×lvl+150 (+STR×2 若有B02Y三刀流buff, 再+STR×3 若U01U型態 | periodic 0.02s ×11 + sleeps 0.3/0.5/0.5s | 受害者與施法者皆Pause; 6隻'o018'分身繞受害者旋轉(半徑-100+2 | war3map.j:28990-29147 (Romove period j:2 |
| 24-002 來~快點吃吧 | 變態正義 - 瘋狂假面(EX) | 4 | 無範圍幾何: 目標貼附施法者; 51 tick × 0.10s (~5.1s), 每 10 tick 判傷 1 次 (共 | periodic 0.10s ×51 | 目標被吸附: 每 tick SetUnitPositionLoc 到施法者位置, | war3map.j:27315 (A0SG cond), 27329-27352 |
| 44-01 死神之眼 | 奇樂 - 夜神月(Q) | 4 | single target, no damage; self cost = 75% of current HP (hal | instant | 無 | j:42231-42277 (set udg_DeathUnit = targe |
| 52-002 射殺百頭 | 海克力斯 - Berserker(EX) | 4 | 每段: 目標被頂前 130u, 施法者跟位到其後 100u, 每擊傷=STR; 連擊計數 Timer2 每跳+3 至 9 | Timer 鏈: 首擊 1.0s, 每段 CD×0.75 遞減 (加速連段 ×9 | 目標被推動+施法者跟隨: 兩者連鎖前移, 終擊把目標擊飛 | j:52050-52093 (雙方 pause+Avul j:52064-520 |
| 79-01 瞬步 | 開外掛的死神 - 黑崎一護(Q); 外掛開很大的死神 - 黑崎一護(Q) | 4 | 單體; 每次瞬移到目標前方100u; 傷害 50×lvl+50 (卍解buff B02E 時 +STR) ×2 hit | instant→0.1s 檢查→hit1→0.3s→hit2 | 施法者位移: 兩次 SetUnitPositionLocFacingLocBJ  | j:37401-37441 (兩段瞬移+傷害; B02E 分支 j:37406) |
| 84-04 給我蜂蜜 | 百畝森林的霸主 - 維尼(R) | 4 | 每 tick 施法者貼到目標後方 100u; dummy A0RY (84-04-01 震地) 每 tick stomp | periodic 0.4s ×6 tick 連段; 擊退 0.04s/tick | 施法者被連續重定位追著目標打; 終結時目標被推飛 | j:51054-51088 (pause+Avul+分身+0.4s 啟動), j |

## 跳躍落地

**定義**: 施法者拋物線跳向目標點, 落地釋放 AoE。  
**機制特徵**: SetUnitPosition + FlyHeight 逐 tick, 落地 AoE (+暈/連段)。  
**範本**: 蒼月潮 Jump (41步、落地 AoE 330); 胖虎 40-04 地獄搖滾 (跳+演唱會連段)  
**移植備註**: GGD 有 dash 但無拋物線與落地爆; 跳斬需 dash+damage 組合近似。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 01-02 隕石擊 | 最終幻想 - 克勞德(W) | 5 | 落地250 AoE傷害100×lvl, 摧毀destructable 450, 震屏1600×1600; 施法同時生成l | periodic 0.02s ×41 | 施法者沿直線41步位移, 拋物線飛行高度 h=-1.5(i-21)²+600,  | war3map.j:33608-33663, 33711-33754 (peri |
| 07-03 列、在、前 | 獸矛傳承使 - 蒼月潮(E) | 5 | 41步, 每步 dist/41; 飛行高度拋物線 -1.5(i-21)²+600; 落地 AoE 330 (敵/活/非建 | periodic 0.035s (0.35/10) ×41 ≈1.4s | 施法者位移 — 每tick SetUnitPositionLoc + SetUn | war3map.j:34195 (Start: 參數/傷害/pause/A0FZ |
| 08-04 阿邦快速劍X | 傳說的龍騎士 - 勇者小呆(R); 傳說的龍騎士 - 勇者小呆(R) | 5 | 朝目標點前方 550u 落點; 落地 250 AoE; 傷害 7×AGI×技能等級 (排除建築) | instant 隱身 → 1.0s sleep → 落地爆發 | 施法者位移: ShowUnitHide 隱身 1s (原地留 e003 替身)  | j:28888-28944 (cond A0EZ j:28889, 550u j |
| 33-03 地道突襲 | 被剝削的勞工階級 - 牧太郎(E) | 5 | 行進段數=距離/75 (每段 75u 塵土+地形波紋視覺); 落地: dummy stomp (A07Q lvl同步)  | sleep-loop 0.01s/段 travel → instant 落地 ( | 施法者位移: 隱形地遁沿直線視覺行進後 SetUnitPositionLoc 到 | j:43421-43491 (cond A07D j:43422; travel |
| 40-04 地獄搖滾 | 地獄歌神 - 憤怒的胖虎(R) | 5 | 跳: 41步, 步長=dist/41, 高度 -1(i-21)²+400; 落地 dummy-stomp A0LY (暈 | leap periodic 0.02s ×41 (~0.82s); 之後 Tim | 施法者位移: 拋物線飛向目標點, 落地後定點開演唱會 (pause+Avul 全 | j:39160-39237 (跳躍: 41步拋物線 j:39207-39209) |
| 48-04 騎英之疆繩 | 梅杜莎 - Rider(R) | 5 | 3-phase mount flight: back-line 750u @50u/tick (+15 height), | periodic 0.01s (line 15 ticks) → 0.02s ( | 施法者位移 — Rider hidden, pegasus dummy 'h02 | j:38251-38283 (setup, hide Rider), j:382 |
| 76-04 三檔.巨人迴旋彈 | 草帽小子 - 蒙其.D.魯夫(R); 草帽小子 - 蒙其.D.魯夫(R) | 5 | 原地垂直拋物線: 高度 -10(i-11)²+1000, 21 tick; 落點(起跳點) 380 AoE, 300+3 | periodic 0.04s ×21, i=11 生成巨拳, i=18 判傷,  | 施法者位移: 僅 SetUnitFlyHeight 垂直起跳(無水平位移), P | war3map.j:36651-36655 (A0RZ cond), 36658 |
| 78-02 地走龍牙破 | 黑手黨老大 - 基廉列克(W) | 5 | 行進段純視覺無傷害; 終點: 摧毀destructable 400, 生成10隻'o011'(半徑160), 隱形dum | sleep-loop 0.01s/step ×(距離/75) | 遁地變體: 施法者隱形, 地裂視覺以75u/step行進到目標點, 之後施法者瞬 | war3map.j:49977-50038 |

## 拉扯投擲

**定義**: 把目標抓起/鉤來/拋飛的強制位移。  
**機制特徵**: SetUnitPosition 逐 tick 拖曳 + 落點傷害。  
**範本**: 監獄兔 抓取拋摔; 環形吸引  
**移植備註**: GGD 無敵方位移詞彙, 以 root+damage 近似。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 05-03 及喀爾度 | 破銅爛鐵 - 阿強一號(E); 慈悲的王者 - 賈修貝爾(E) | 3 | 2×lvl 錨點, 半徑200u 環繞施法者均分360°, 每錨點吸引半徑 250+100×lvl | instant (單幀 loop, dummy 2s timed life) | 目標被吸: 範圍內敵人 SetUnitPositionLoc 直接搬到各錨點 ( | j:28221-28233 (loop CreateNUnits 'o00H'  |
| 48-01 魔法鎖鏈 | 梅杜莎 - Rider(Q) | 3 | chain segments 'u01R' at 50u×n up to 20 (1000u); catch check | periodic 0.03s ×≤20 (extend) then period | 傷害區行進 (chain tip extends 50u/tick) + 目標被 | j:38143-38166 (aim), j:38181-38215 (exte |
| 76-01 伸縮自如的橡膠戰斧 | 草帽小子 - 蒙其.D.魯夫(Q); 草帽小子 - 蒙其.D.魯夫(Q) | 3 | 拋物線 21 步 (dDist=全程/41), 高度 -1.5(i-21)²+600; 落點 250 AoE 225 d | periodic 0.015s ×21 + 落地序列 sleep 0.15/0. | 施法者先瞬移到目標前 100u; 之後是目標沿拋物線被甩回施法者原位摔落; 雙方 | war3map.j:36239-36246 (A0IS cond), 36256 |
| 91-01 死亡之握 | 死亡騎士(Q); 不良少年(Q) | 3 | 強制指令 (8+8×lvl) tick × 0.05s (~0.4-2.0s) 令目標攻擊 DK | instant → periodic 0.05s ×(8+8×lvl) | 目標被拉向施法者 — 位移由地圖共用拉人觸發處理 (JASS 註解「拉人是共同觸 | war3map.j:53073-53080 (A0W3 cond), 53083 |
| 94-04 賣扣~~ | 夜市人生 - 金居福(R) | 3 | 步距 50u × (距離/50) tick; 拋物線升/降各 12 tick (高度 50×index); 終點=固定  | 施放標記 instant; 受傷觸發 → periodic 0.01s ×N 直 | 目標被推動: 被標記者受傷時被暫停、關路徑、沿拋物線整段丟到地圖固定點, 落地雷 | war3map.j:53984-54018 (Mic: Conditions A |

## 直線分段掃擊

**定義**: 單幀內沿直線鋪滿 N 段 AoE 的瞬間掃擊。  
**機制特徵**: instant 迴圈 N 段 × 步長, 每段 AoE, 命中去重。  
**範本**: Saber 20-03 約束與勝利之劍 (6×200u、AoE 400); 妙蛙 90-04 陽光烈焰 (10×100u、AoE 280)  
**移植備註**: GGD 以 skillshot 投射近似; 整線同時命中的特性已接近。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 03-04 全彈發射 | 鋼彈 - 煌(R) | 8 | 6段×200u 沿面向直線, 每段 AoE 400, 傷害 STR×lvl×2+200 (建築×0.5), 摧毀400內 | instant (單幀雙loop) + 2s sleep 清理視覺dummy | 傷害區沿直線6段單幀展開; 施法者不動 | j:32905-32956 (loop 6×200u polar j:32930 |
| 09-04 龜派氣功 | 超級賽亞人 - 悟空(R); 賽亞人 - 悟空(R) | 8 | 6 段 × 200u 沿施法方向, 每段 400 AoE; 樹木 400r 摧毀; 512r 英雄鏡頭震動; 口徑特效在 | instant (單幀雙 loop), 尾端 sleep 2s 清鏡頭 | 無 (傷害段一次性鋪滿直線) | war3map.j:31804-31808 (A03S cond), 31916 |
| 20-03 約束與勝利之劍 | 亞瑟王 - Saber(E); 亞瑟王 - Saber(E) | 8 | 6×200u 極座標分段 (200..1200u) 朝目標方向, 每段 400 AoE; 傷害 0.4×當前魔力+150 | instant (單幀 loop ×6; +2s 後清特效/鏡頭) | 無 (施法者不動, 傷害為單幀直線帶) | j:32334-32343 (6 段主迴圈), 32332 (傷害式), 323 |
| 81-03 Divine Buster Extention | 魔砲少女 - 高町奈葉(E); 白色惡魔 - 高町奈葉(E) | 7 | 6×150u 沿面向 polar projection, 每段 AoE 280 收集, 全體一次吃 200+200×lv | instant (單幀6段收集後一次判傷; 0.5s 相機震動) | 無 (光束定住, 非行進) | j:35986-36090 (cond A0XN j:35987; loop 6 |
| 90-04 陽光烈焰 | 種子神奇寶貝 - 妙蛙花(R); 種子神奇寶貝 - 妙蛙種子(R) | 8 | 10段×100u 朝目標方向, 每段 AoE 280 (樹木350); 傷害 300×lvl+2×(STR+AGI+IN | instant 單幀 (pre: 引導1.0s 蓄能視覺 h02X; 光束2s後 | 無施法者位移; 傷害線瞬間鋪滿 | j:26699-26727 (pre channel dummy), j:267 |

## 瞬移突斬

**定義**: 瞬間位移到目標身邊或依指令閃現, 常伴斬擊。  
**機制特徵**: SetUnitPositionLoc 瞬移 (無行進過程) + 單體/AoE 傷害; 或限時指令轉瞬移。  
**範本**: 戰鬥涅吉 82-02 縮地 (0.5×lvl 秒視窗, 每指令閃現 200u)  
**移植備註**: GGD dash mode=toPoint 最接近; 指令瞬移窗無對應。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 08-02 萊丁快速劍 | 傳說的龍騎士 - 勇者小呆(W); 傳說的龍騎士 - 勇者小呆(W) | 5 | 單體; 無 AoE; 傷害由基底 AOcl(鏈式閃電)承載 | instant + 0.5s 前搖 (SPELL_CAST + TriggerS | 施法者位移: 0.5s 後 SetUnitPositionLoc 瞬移到目標施法 | j:28769-28810 (cond A05T j:28771, telepo |
| 13-03 快步 | 揍敵客大家長 - 揍敵客桀諾(E) | 7 | 時窗內每次指向性命令且與目標距離<1800 → 瞬移到目標腳下; EX 每次瞬移附帶 dummy o011 stomp  | 時窗 (1+2×lvl)s; 每次下單即觸發 | 施法者位移: 反覆瞬移貼上每個被下令的目標 (排除 entanglingroot | j:45019-45035 (add A050 45021, 時窗 1+2×lv |
| 17-03 空破圓斬 | 天上天下 - 棗 真夜(E) | 5 | 無範圍幾何; 目標單位所在點 | instant (TSA 0.0 + 0.5s 特效延遲後瞬移) | 施法者位移: 瞬移到目標單位施法瞬間的位置 (SetUnitPositionLo | j:28556-28575 (cond 28557 A07M; SetUnitP |
| 27-04 忍法暗殺奧義-飛燕閃 | 猿飛佐助 - 風魔小次郎(R) | 5 | 單體; 落點=目標身前 150u; 追加傷害 3×AGI (EX 6×AGI) 魔法 | instant + 0.1s 後瞬移, 再 0.1s 後解除 | 施法者位移: 瞬移到目標身前 150u, 期間掛 A0F3/A09P 並隱形化  | j:41649-41692 (cond A030 j:41650, 150u 瞬 |
| 82-02 虛空瞬動 | 白色之翼 - 涅吉。史普林。菲爾德(W) | 7 | 每次點指令瞬移 200u 朝指令方向 | 視窗 0.5×lvl s (sleep 包夾 Enable/Disable Mo | 施法者位移: 每接到 point order 即 SetUnitPosition | j:35295-35349 (window sleep j:35305, bli |

## 引導通魔

**定義**: 持續引導期間分段生效, 中斷即停。  
**機制特徵**: SPELL_CHANNEL/CAST + sleep 迴圈。  
**範本**: 天地志狼 龍破斬引導 (DragonChannel)  
**移植備註**: GGD castTimeSec 僅表前搖; 引導無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 14-04 聖夜降臨 | 治癒系公主 - 木乃香(R) | 5 | 客串單位落點 500-700u 繞目標點 (角度 ±45/±135°); 六芒星 6 單位半徑 450; 兩段傷害各 r | channel 分段: sleep 0.5s×3 + 3.5s + 1.2s ( | 施法者原地引導; 4 個客串召喚 (夏那/和香/涼宮/皮卡) 依序跳/移動到目標 | j:30620-30760 (staged sequence, AKTBool  |
| 28-04 破滅能量彈 | 超級普烏 - 魔人普烏(R) | 5 | 目標點 AoE 450, 傷害 100×lvl+200 (建築×0.75); 視覺散布 400×400 rect; 能量 | periodic 0.20s 檢查, 每5 tick (1.0s) 結算一次傷害 | 無—傷害區固定在施法目標點; 施法者原地引導 | j:40715-40728 (spawn球+Enable), j:40784-4 |
| 64-02 酒釀精華 | 姜窩肯 - 約翰走路(W) | 5 | 無 (單體) | channel; 每 1.0s 一跳, 引導中斷即停 | 無 | j:46546-46571 (首跳+啟動 1.0s timer), j:4661 |
| 96-03 吸星大法 | 笑傲江湖 - 令狐沖(E) | 5 | 單體; 吸魔 200×lvl (目標-, 自身+); dummy 施放 cripple (A0XW) | sleep 0.8s 後檢查 order=='channel' 單次結算 | 無 | j:44851-44874 (sleep0.8 j:44854, channel |

## 剝奪變化

**定義**: 把目標變形或剝奪其資源/等級。  
**機制特徵**: hex dummy-cast / SetHeroLevel 直改。  
**範本**: 等級剝奪 (直接扣目標英雄等級)  
**移植備註**: 無對應詞彙; 以 applyStatus 近似變形, 等級操作不可表。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 28-02 把你變成餅乾 | 超級普烏 - 魔人普烏(W) | 2 | 單體; 僅非英雄, 等級<10, 且屬 P0/P6/中立敵對 | instant | 無 | j:40548-40578 (cond j:40532-40546, Creat |
| 93-04 當掉 | 會叫的野獸 - 傳說中的大刀(R) | 2 | 單體: 目標英雄 lvl≥10 時, 等級重設為 lvl−3 (SetHeroLevel 1 → lvl−3) | instant (0.10s 一次性 timer 轉發) | 無 | j:53740-53744 (記目標+啟動 timer), 53765-5377 |
| 93-002 二一 | 會叫的野獸 - 傳說中的大刀(EX) | 2 | 單體: 目標英雄 lvl≥10 時, 等級重設為 lvl−3 (SetHeroLevel 1 → lvl−3) | instant (0.10s 一次性 timer 轉發) | 無 | j:53740-53744 (記目標+啟動 timer), 53765-5377 |

## 生命操作

**定義**: 以生命為代價或直接操作生命值。  
**機制特徵**: SetUnitState 直改 HP / 互換 / 延遲自傷。  
**範本**: 生命互換; 施法生命代價  
**移植備註**: restore 可表回滿; 互換/代價無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 33-001 喝了再上 | 被剝削的勞工階級 - 牧太郎(EX) | 3 | 無; 扣 100 gold → 自身 +1500 HP | instant | 無 | j:43552-43581 (cond A088 j:43553; gold≥1 |
| 44-002 交換筆記本 | 奇樂 - 夜神月(EX) | 3 | single target — swaps absolute current-HP values between cas | instant | 無 | j:42420-42446 (tempHP swap via SetUnitLi |
| 99-002 把你給MikuMiku掉 | 夢幻之星 - 初音(EX) | 3 | 單體目標, 無幾何: HP與MP直接設為100% | instant | 無 | war3map.j:55005-55024 |

## 全場規則

**定義**: 改寫全場狀態 — 回溯/處決/環境。  
**機制特徵**: 全圖枚舉 + 直接 Kill/狀態重設。  
**範本**: 全圖處決 (勝利技); 全場狀態回溯  
**移植備註**: 不可表; 標記為特殊勝負手。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 57-002 時光機 | 小叮噹 - 哆拉A夢(EX) | 1 | map-wide: 快照全部12位玩家英雄的HP/MP (A0MS), 之後施放A0MT把所有存活英雄HP/MP設回快照 | instant ×2 (記錄/還原兩次施放) | 無 | war3map.j:45811-45902 |
| 98-002 夢想前程的彼方 | 學姊 - 小派(EX) | 1 | 無空間幾何; 依施法者陣營殺 gg_unit_unpl_0000 或 gg_unit_etoe_0016 (敵方主目標單 | BeginFutureDream 於 SPELL_CHANNEL 全場廣播; F | 無 | j:55222-55228 (KillUnit 依陣營), 55249-5525 |

## 成長蓄能

**定義**: 擊殺成長或蓄力疊加的累積系統。  
**機制特徵**: KILL event / 施放計數 + udg 累積。  
**範本**: 擊殺成長 (吃人頭永久加屬性)  
**移植備註**: GGD 無 onKill 內容使用; hooks onKill 存在可接。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 49-03 蛻變 | 殺戮之牙 - 異形(E) | 4 | 無幾何 — 全圖死亡事件 | instant on EVENT_PLAYER_UNIT_DEATH (擊殺敵方 | 無 | war3map.j:46357 (LearnReTurn: 學會後 enable |
| 76-00 二檔 | 草帽小子 - 蒙其.D.魯夫(PASSIVE); 草帽小子 - 蒙其.D.魯夫( | 4 | 螺旋特效 20 步: 距離 15u×i, 角度 35°×i; 無傷害 | instant + 20×sleep 0.01 | 無 | war3map.j:36457-36463 (A0IR 或 A0IQ cond) |

## 死亡機制

**定義**: 死亡時觸發的重生/暴走/假死。  
**機制特徵**: DEATH event + revive/變身。  
**範本**: 熊貓 89-03 憤怒的胸毛 (死亡機率復活+爆炸)  
**移植備註**: GGD 無死亡 hook; 現以 onDamageTaken 近似或略。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 61-00百連我殺 | 死亡老二 - 克勞薩先生(PASSIVE); 重金屬樂團的怪物 - 克勞薩II世 | 1 | prop 單位 u01P ×1 生成於腳下 | instant; 解除 = 再次施放 Aphx (U011 形態) 或 U011 | 無 — 施法者被 pause 定身 | war3map.j:50677 (Dead: pause + u01P atta |
| 89-03 憤怒的胸毛 | 國寶級的畜生 - 熊貓(E) | 2 | 死亡時 lvl(A0TN)×4% 機率原地滿血復活 + dummy bloodlust/stomp(A0SR) + 三圍 | instant (on-death proc) | 無 | j:52608-52675 (EVENT_PLAYER_UNIT_DEATH j |

## 資源運營

**定義**: 以金錢/道具為核心的運營技能。  
**機制特徵**: 資源增減 + 週期生息 / 抽獎。  
**範本**: 學姊 理財 (週期按持有金生息)  
**移植備註**: 不可表; 經濟系統外掛。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 57-00 四次元口袋 | 小叮噹 - 哆拉A夢(PASSIVE) | 2 | 施法者腳下生成隨機道具: phea 75% / pghe 18.75% / pres ~5.2% / whwd ~1% | instant (0.50s延遲) | 無 | war3map.j:45569-45621 |
| 98-01 理財的習慣 | 學姊 - 小派(Q) | 2 | 無空間幾何; 每次 +1%×lvl 當前金 與 +1%×lvl 當前木 | periodic 60.00s | 無 | j:55102-55109 (複利式), InitTrig periodic 6 |

## 距離博弈

**定義**: 依施法距離/位置決定不同招式結果。  
**機制特徵**: DistanceBetweenPoints 分支。  
**範本**: 小傑 06-0x 猜猜拳 (遠=布/中=剪刀/近=石頭)  
**移植備註**: 無詞彙; 現拆為多技能近似。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 06-00 猜猜拳 | 職業獵人 - 傑 富力士(PASSIVE); 職業獵人 - 傑 富力士(PASS | 3 | 距離≤250=石頭 350+150×lvl(A020) 單體+擊退 40u×20 (max 800u, 撞牆<8u提前停 | instant branch; 石頭擊退 periodic 0.04s ×≤20 | 目標被推動: 40u/0.04s tick ×20 沿施法者→目標角度; EX  | j:26857-27055 (branch conds j:26941-2695 |
| 93-00 小考 | 會叫的野獸 - 傳說中的大刀(PASSIVE) | 3 | 標記範圍 512 (dummy 'hfoo' A0WL faeriefire 逐一標記); 結算: 傷害 = (與施法點 | instant 標記 → sleep 5.00s → instant 結算 | 無 (施法者不動; 逃離施法點的目標吃更多傷害) | j:53526-53539 (標記+sleep 5), 53505-53519  |

## 隊伍協同

**定義**: 作用於全隊的集結/契約連結。  
**機制特徵**: 全隊枚舉 + 傳送/連結 buff。  
**範本**: 全隊集結  
**移植備註**: 無詞彙; 單體近似或略。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 84-002 我只想確定你在這裡 | 百畝森林的霸主 - 維尼(EX) | 2 | 全圖; 集結點=施法者位置 | instant | 所有友軍英雄被瞬移到施法者身邊 (維尼本體 'E00V' 型別除外) | j:51015-51032 (loop 玩家 1-13: 友軍英雄 +50% H |
| 95-002 固有結界-和諧世界 | 皇者 - 騜(EX) | 2 | 全地圖全隊友; 復活計時器→1s, 全隊 100% HP/MP 並傳送到施法者位置 | instant → sleep 1.5s → 集結 | 隊友被移動: 所有友方英雄 SetUnitPositionLoc 到施法者身邊 | j:54687-54716 (revive timer→1s j:54693,  |

## 布陣環繞

**定義**: 在場上布置衛星/陣列/自爆物。  
**機制特徵**: 多 dummy 定點生成 + 幾何陣列。  
**範本**: 環繞衛星; 直線布陣  
**移植備註**: 無詞彙; 以 spawnVfx+damage 近似。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 14-02 式神炸裂 | 治癒系公主 - 木乃香(E) | 3 | 每隻式神死點 rect 500×500 | instant (0.01s sleep 後一次性) | 無位移; 傷害區固定在各式神屍點 | j:30536-30545 (loop own slaves), j:30466 |

## 汲取吸附

**定義**: 掛上吸取環節, 週期把目標的血/魔轉給自己。  
**機制特徵**: buff 檢查迴圈 + heal 施法者。  
**範本**: 妙蛙種子 90-00 寄生種子 (0.95s×5 每次+50HP)  
**移植備註**: GGD 無吸取詞彙; heal 近似半邊。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 90-00 寄生種子 | 種子神奇寶貝 - 妙蛙花(PASSIVE); 種子神奇寶貝 - 妙蛙種子(PAS | 4 | 單體目標, 無AoE | sleep-loop 0.95s ×5 (~4.75s) | 無 | j:26584-26623 (cond A0KV j:26585, loop j |

## 結界領域

**定義**: 張開持續領域, 域內特殊規則。  
**機制特徵**: 區域標記 + 週期判定域內單位。  
**範本**: 結界獵殺場  
**移植備註**: 無詞彙。

| 技能 | 英雄 | 落差分 | 行為幾何 | 行為時序 | 位移語意 | 證據 |
|---|---|---|---|---|---|---|
| 21-04 討滅封絕 | 火霧戰士 - 夏娜(R) | 2 | 施法者原地生成封絕罩單位 o015, 60 tick×0.01s 由 10% 放大到 310% (純視覺); 獎勵判定= | 時窗 (4×lvl+2)s; 罩體成長 periodic 0.01s ×60 | 無 (罩體固定於施法點) | j:33032-33059 (dome o015 33037, 時窗 sleep |

## 物件資料技能(無觸發)

**定義**: 完全沒有 JASS 觸發的技能 — 行為由 WC3 物件資料(基底技能+資料欄)全權定義。  
**機制特徵**: 無觸發器; 看 WC3基底/資料欄。  
**範本**: 多數 xx-00 被動與標準 WC3 技能  
**移植備註**: GGD 依基底家族對應 (閃避/致命一擊/重擊/光環…)。

| 技能 | 英雄 | 落差分 | WC3基底 | 傷害perRank | 特殊機制 |
|---|---|---|---|---|---|
| 01-00 怒斬 | 最終幻想 - 克勞德(PASSIVE) | 6 | ANb2 |  |  |
| 01-002 究極魔劍 | 最終幻想 - 克勞德(EX) | 7 | Amgl |  |  |
| 02-00 淨化 | 除魔巫女 - 桔梗(PASSIVE) | 7 | Aprg |  |  |
| 02-02 明鏡止水 | 除魔巫女 - 桔梗(W) | 7 | AEar |  |  |
| 02-03 魂飛魄散 | 除魔巫女 - 桔梗(E) | 7 | ACsh | 350/550/750/950 |  |
| 03-00 相轉移裝甲 | 鋼彈 - 煌(PASSIVE) | 3 | Assk |  |  |
| 03-01 磁軌砲 | 鋼彈 - 煌(W) | 7 | AHtb 風暴之鎚 | 125/200/275/350 |  |
| 03-02 詭雷 | 鋼彈 - 煌(Q) | 7 | ANab | 30/30/30/80/80 |  |
| 03-03 鯨式電漿光束炮 | 鋼彈 - 煌(E) | 7 | AOsh 衝擊波 | 450/650/850/1050 |  |
| 03-001 龍騎兵 | 鋼彈 - 煌(EX) | 7 | AOls |  |  |
| 04-00 翔封界 | 黑魔導士 - 莉娜因巴斯(PASSIVE); 黑魔導士 - 莉娜因巴斯(PASS | 3 | ANss |  |  |
| 04-01 火球術 | 黑魔導士 - 莉娜因巴斯(Q); 黑魔導士 - 莉娜因巴斯(Q) | 7 | Awfb 火焰箭(球體) | 170/220/270/320 | 球體/法球 |
| 04-02 炸彈陣 | 黑魔導士 - 莉娜因巴斯(W); 黑魔導士 - 莉娜因巴斯(W) | 7 | AHfs | 55/85/115/145 |  |
| 04-002 惡夢魔王的碎片 | 黑魔導士 - 莉娜因巴斯(EX); 黑魔導士 - 莉娜因巴斯(EX) | 7 | AEIl 變身 |  | 變身基底 |
| 05-00 啦嗚薩喀爾 | 破銅爛鐵 - 阿強一號(PASSIVE); 慈悲的王者 - 賈修貝爾(PASSI | 7 | Absk 狂暴 |  |  |
| 05-01 薩喀爾 | 破銅爛鐵 - 阿強一號(Q); 慈悲的王者 - 賈修貝爾(Q) | 7 | ACfl | 175/275/375 |  |
| 05-02 薩喀爾嘎 | 破銅爛鐵 - 阿強一號(W); 慈悲的王者 - 賈修貝爾(W) | 7 | ANfd 投擲酒桶 |  |  |
| 05-002 金色巨龍 | 慈悲的王者 - 賈修貝爾(EX) | 7 | AIcf |  |  |
| 06-02 山形修煉-變 | 職業獵人 - 傑 富力士(W); 職業獵人 - 傑 富力士(W) | 9 | AHbh 重擊 | 350/450/550/650 |  |
| 06-03 山形修煉-強 | 職業獵人 - 傑 富力士(E); 職業獵人 - 傑 富力士(E) | 9 | Aamk 屬性加成 | 80/120/160/200/240 |  |
| 06-04 傑桑變化 | 職業獵人 - 傑 富力士(R); 職業獵人 - 傑 富力士(R) | 7 | AEme 變形 |  |  |
| 06-002 殺意 | 職業獵人 - 傑 富力士(EX); 職業獵人 - 傑 富力士(EX) | 7 | Amgl |  |  |
| 07-00 獸化心靈 | 獸矛傳承使 - 蒼月潮(PASSIVE) | 3 | Atru |  |  |
| 07-04 神聖結界 | 獸矛傳承使 - 蒼月潮(R) | 7 |  |  |  |
| 07-002 獸矛持有者 | 獸矛傳承使 - 蒼月潮(EX) | 9 | AEev 閃避 |  |  |
| 08-00 龍紋記憶 | 傳說的龍騎士 - 勇者小呆(PASSIVE); 傳說的龍騎士 - 勇者小呆(PA | 8 | Aegr 復原 |  |  |
| 08-01 雙龍紋 | 傳說的龍騎士 - 勇者小呆(Q); 傳說的龍騎士 - 勇者小呆(Q) | 7 | AIpv |  |  |
| 08-002 龍魔人 | 傳說的龍騎士 - 勇者小呆(EX); 傳說的龍騎士 - 勇者小呆(EX) | 7 | AEIl 變身 |  | 變身基底 |
| 09-00 賽亞人的血脈 | 超級賽亞人 - 悟空(PASSIVE); 賽亞人 - 悟空(PASSIVE) | 8 | Awar 戰爭踐踏 |  |  |
| 09-01 界王拳 | 超級賽亞人 - 悟空(Q); 賽亞人 - 悟空(Q) | 7 | ANbr | 55/90/125/160/200 |  |
| 09-02 瞬間移動 | 超級賽亞人 - 悟空(W); 賽亞人 - 悟空(W) | 7 | AEbl |  |  |
| 09-002 十倍龜派氣功 | 超級賽亞人 - 悟空(EX); 賽亞人 - 悟空(EX) | 9 | Awar 戰爭踐踏 |  |  |
| 11-01 燒鬼斬 | 三刀流劍士 - 索隆(Q) | 9 | AHbh 重擊 |  |  |
| 11-01 燒鬼斬 | 三刀流劍士 - 索隆(Q) | 7 |  |  |  |
| 11-02 虎狩獵 | 三刀流劍士 - 索隆(W); 三刀流劍士 - 索隆(W) | 9 | AOws 戰爭踐踏 | 250/325/400/475 |  |
| 11-002 武裝色霸氣 | 三刀流劍士 - 索隆(EX); 三刀流劍士 - 索隆(EX) | 7 |  |  |  |
| 12-00 感應意脈 | 龍之子 - 天地志狼(PASSIVE); 龍之子 - 天地志狼(PASSIVE) | 8 | AEev 閃避 |  |  |
| 12-01 鬥仙術 | 龍之子 - 天地志狼(Q); 龍之子 - 天地志狼(Q) | 7 | ANsb 妖術 | 150/250/350/350/350 |  |
| 12-03 破凰之心-徒手空破山 | 龍之子 - 天地志狼(E); 龍之子 - 天地志狼(E) | 7 | AEIl 變身 | 80/120/160/200 | 變身基底 |
| 13-00 狂氣 | 揍敵客大家長 - 揍敵客桀諾(PASSIVE) | 7 | Auhf |  |  |
| 13-01 老樹盤根 | 揍敵客大家長 - 揍敵客桀諾(Q) | 9 | AEer 糾纏根鬚 | 25/40/55/70 |  |
| 13-02 變化念力 | 揍敵客大家長 - 揍敵客桀諾(W) | 7 | AChx | 0/99/99/99 |  |
| 13-04 暗殺奧義 | 揍敵客大家長 - 揍敵客桀諾(R) | 9 | AOcr 致命一擊 |  |  |
| 13-002 KISS ME! | 揍敵客大家長 - 揍敵客桀諾(EX) | 9 | AHbh 重擊 |  |  |
| 14-03 魔力應援 | 治癒系公主 - 木乃香(W) | 7 | AOae |  |  |
| 14-002 魔力激發 | 治癒系公主 - 木乃香(EX) | 7 | AHab |  |  |
| 15-00 天生法術書 | 魔法老師 - 涅吉。史普林。菲爾德(PASSIVE) | 7 | Aspb |  |  |
| 16-00 通靈能力 | 通靈人 - 麻倉葉(PASSIVE); 萬夫莫敵 - 黑化張飛(PASSIVE) | 3 | Atru |  |  |
| 17-00 右腕焰增 | 天上天下 - 棗 真夜(PASSIVE) | 7 | Acri |  |  |
| 17-01 鬼-真夜 | 天上天下 - 棗 真夜(Q) | 7 | AHad |  |  |
| 17-02 殺無真空斬 | 天上天下 - 棗 真夜(W) | 7 | AHtb 風暴之鎚 | 175/300/425/550/550 |  |
| 17-002 天照龍門 | 天上天下 - 棗 真夜(EX) | 9 | AEev 閃避 |  |  |
| 18-00 薔薇荊棘之刃 | 妖狐藏馬 - 南野秀一(PASSIVE); 妖狐藏馬 - 南野秀一(PASSIV | 3 | Asal |  | 球體/法球 |
| 18-01 風華圓舞陣 | 妖狐藏馬 - 南野秀一(Q); 妖狐藏馬 - 南野秀一(Q) | 7 | AOls | 10/15/15 |  |
| 18-002 魔界吸血植物 | 妖狐藏馬 - 南野秀一(EX); 妖狐藏馬 - 南野秀一(EX) | 9 | Aegr 復原 |  |  |
| 19-00 閃擊 | 戰國刺客Azumi - 安云(PASSIVE); 戰國刺客Azumi - 安云( | 7 |  |  |  |
| 19-01 斷末 | 戰國刺客Azumi - 安云(Q); 戰國刺客Azumi - 安云(Q) | 9 | AOcr 致命一擊 |  |  |
| 19-002 紫色披風 | 戰國刺客Azumi - 安云(EX); 戰國刺客Azumi - 安云(EX) | 7 | AEIl 變身 |  | 變身基底 |
| 20-00 銀色甲胄 | 亞瑟王 - Saber(PASSIVE); 亞瑟王 - Saber(PASSIV | 8 | Aegr 復原 |  |  |
| 20-002 解放.約束勝利劍MAX | 亞瑟王 - Saber(EX); 亞瑟王 - Saber(EX) | 9 | Aegr 復原 |  |  |
| 21-00 灼眼 | 火霧戰士 - 夏娜(PASSIVE) | 3 | ANtr |  |  |
| 21-01 火羽 | 火霧戰士 - 夏娜(W) | 7 | AIsa |  |  |
| 21-03 赤焰爆發 | 火霧戰士 - 夏娜(E) | 7 | AUim | 400/550/700/850 |  |
| 22-01 鬼隱之擊 | 蟬在叫人壞掉 - 龍宮禮奈(Q); 蟬在叫人壞掉 - 龍宮禮奈(Q) | 7 | AOwk 疾風步 |  |  |
| 22-02 染血的柴刀 | 蟬在叫人壞掉 - 龍宮禮奈(W); 蟬在叫人壞掉 - 龍宮禮奈(W) | 9 | AOcr 致命一擊 |  |  |
| 22-03 五吋釘 | 蟬在叫人壞掉 - 龍宮禮奈(E); 蟬在叫人壞掉 - 龍宮禮奈(E) | 7 | AEsh 影遁 | 350/500/650/800 |  |
| 22-04 雛見澤症候群L5 | 蟬在叫人壞掉 - 龍宮禮奈(R); 蟬在叫人壞掉 - 龍宮禮奈(R) | 7 | AEIl 變身 |  | 變身基底 |
| 22-002 月光下的決鬥者 | 蟬在叫人壞掉 - 龍宮禮奈(EX); 蟬在叫人壞掉 - 龍宮禮奈(EX) | 7 |  |  |  |
| 23-02 超音型態 | 時空管理局執務官 - 菲特·泰斯塔羅沙(W) | 7 |  |  |  |
| 23-002 雙刀模式 | 時空管理局執務官 - 菲特·泰斯塔羅沙(EX) | 9 | Aegr 復原 |  |  |
| 24-00 SM派對 | 變態正義 - 瘋狂假面(PASSIVE) | 7 | Absk 狂暴 |  |  |
| 24-01 這是我的豆皮壽司 | 變態正義 - 瘋狂假面(Q) | 9 | AOws 戰爭踐踏 | 100/200/300/400 |  |
| 24-02 變態根性 | 變態正義 - 瘋狂假面(W) | 7 | AUts | 80/120/160/200/240 |  |
| 24-03 變態絕技悶絕地獄車 | 變態正義 - 瘋狂假面(E) | 7 | ANcl 通魔(觸發殼) | 350/450/550/650 |  |
| 24-04 內褲變身 | 變態正義 - 瘋狂假面(R) | 7 | ACro |  |  |
| 25-00 北斗暗殺拳 | 北斗之鼠 - 拳四郎(PASSIVE); 北斗神拳掌門人 - 拳四郎(PASSI | 7 | AOwk 疾風步 |  |  |
| 25-02 北斗神拳秘訣轉龍呼吸法 | 北斗之鼠 - 拳四郎(W); 北斗神拳掌門人 - 拳四郎(W) | 7 | ANdb | 12/15/18/21 |  |
| 25-002 喔拉喔拉喔拉喔拉 | 北斗之鼠 - 拳四郎(EX); 北斗神拳掌門人 - 拳四郎(EX) | 9 | Awar 戰爭踐踏 |  |  |
| 26-00 吃洨火鍋 | 豪洨天王 - 鄭先生(PASSIVE) | 7 | Aroa |  |  |
| 26-01 腳底按摩 | 豪洨天王 - 鄭先生(Q) | 7 | Absk 狂暴 |  |  |
| 26-02 亂入 | 豪洨天王 - 鄭先生(W) | 7 |  | 50/100/150/200 |  |
| 26-03 熱血 | 豪洨天王 - 鄭先生(E) | 7 | ACac |  |  |
| 27-00 永久性的隱形術 | 猿飛佐助 - 風魔小次郎(PASSIVE) | 3 | Apiv |  |  |
| 27-02 忍法鬼穿刺 | 猿飛佐助 - 風魔小次郎(W) | 7 | AUim | 200/250/300/350 |  |
| 28-00 無限再生 | 超級普烏 - 魔人普烏(PASSIVE) | 6 | Assk |  |  |
| 28-03 分身 | 超級普烏 - 魔人普烏(E) | 7 | AOmi 劍刃風暴 | 2/3/4/5 |  |
| 28-002 普烏死亡 | 超級普烏 - 魔人普烏(EX) | 7 | Aspy |  |  |
| 29-00 開設雜貨店 | 魔鬼筋肉人 - 鬼王達(PASSIVE) | 7 | Ahwd |  |  |
| 29-01 鐵砂掌 | 魔鬼筋肉人 - 鬼王達(Q) | 7 | ANab | 200/400/600/800 |  |
| 29-02 鬼王流星雨 | 魔鬼筋肉人 - 鬼王達(W) | 7 | AEsf 星辰墜落 | 150/200/250/300 |  |
| 29-03 有功夫無懦夫 | 魔鬼筋肉人 - 鬼王達(E) | 7 | AOvd | 80/120/160/200 |  |
| 29-04 電光毒龍鑽 | 魔鬼筋肉人 - 鬼王達(R) | 7 | ANc3 | 200/400/600 |  |
| 29-002 慢著!來人餵公子吃餅 | 魔鬼筋肉人 - 鬼王達(EX) | 9 | Aegr 復原 |  |  |
| 30-00 攝影機 | 電車癡漢 - 臭作(PASSIVE) | 3 | Aesr |  |  |
| 30-01 綁架 | 電車癡漢 - 臭作(Q) | 7 | Amls |  |  |
| 30-03 痴漢火焰 | 電車癡漢 - 臭作(E) | 7 | ANso | 16/32/48/64 |  |
| 30-04 電車之狼衝擊 | 電車癡漢 - 臭作(R) | 7 | AUim | 550/900/1250 |  |
| 30-002 變態紳士 | 電車癡漢 - 臭作(EX) | 7 |  |  |  |
| 31-00 再生能力 | X戰警 - 金鋼狼(PASSIVE) | 6 |  |  |  |
| 31-03 野性的呼喚 | X戰警 - 金鋼狼(E) | 7 | Absk 狂暴 |  |  |
| 31-002 武士之魂 | X戰警 - 金鋼狼(EX) | 9 | AHbh 重擊 |  |  |
| 32-00 青龍槍術 | 常勝將軍 - 趙子龍(PASSIVE) | 6 | ANde |  |  |
| 32-02 橫掃千軍 | 常勝將軍 - 趙子龍(W) | 7 | ANca |  |  |
| 32-002 見龍卸甲 | 常勝將軍 - 趙子龍(EX) | 7 | Acht |  |  |
| 33-00 砍樹 | 被剝削的勞工階級 - 牧太郎(PASSIVE) | 7 | Aeat |  |  |
| 33-02 吃完的口香糖 | 被剝削的勞工階級 - 牧太郎(W) | 7 | Aens |  |  |
| 34-00 靈魂吞噬 | 犬妖 - 殺生丸(PASSIVE) | 7 | ACdr |  |  |
| 34-01 風華之爪 | 犬妖 - 殺生丸(Q) | 7 | ANca |  |  |
| 34-02 合氣斬 | 犬妖 - 殺生丸(W) | 9 | AOcr 致命一擊 |  |  |
| 34-03 爆碎丸 | 犬妖 - 殺生丸(E) | 7 | ANb2 | 15/15/15/15 |  |
| 35-01 土爪 | 不死之身-無 - 藤井八雲(Q) | 7 | ANcs 集束火箭 | 120/240/360/480 |  |
| 35-02 石絲 | 不死之身-無 - 藤井八雲(W) | 9 | AEer 糾纏根鬚 | 37.5/105/202.5/330 |  |
| 35-03 鏡蠱 | 不死之身-無 - 藤井八雲(E) | 7 | Aam2 | 80/120/160/200 |  |
| 35-002 出來吧!全部的魔獸 | 不死之身-無 - 藤井八雲(EX) | 9 | Aegr 復原 |  |  |
| 37-01 凱薩之鷹 | 魔界霸主 - 巴恩大魔王(Q) | 7 | ACsh | 220/340/460 |  |
| 38-00 邪眼全開 | 邪眼師 - 飛影(PASSIVE); 邪眼師 - 飛影(PASSIVE) | 7 | AEme 變形 |  |  |
| 38-002 究極暴走黑龍波 | 邪眼師 - 飛影(EX); 邪眼師 - 飛影(EX) | 9 | Aegr 復原 |  |  |
| 39-00 無名神風流-玄武 | 鬼畜紅王 - 鬼畜狂刀KYO(PASSIVE) | 7 | ANbr |  |  |
| 39-01 無名神風流-白虎 | 鬼畜紅王 - 鬼畜狂刀KYO(Q) | 7 | ANsb 妖術 | 75/175/250/325/325 |  |
| 40-00 我~是~孩~子~王~ | 地獄歌神 - 憤怒的胖虎(PASSIVE) | 3 | Aakb |  |  |
| 40-01 威脅之拳 | 地獄歌神 - 憤怒的胖虎(Q) | 9 | AHbh 重擊 |  |  |
| 40-002 環繞音響 | 地獄歌神 - 憤怒的胖虎(EX) | 7 | AOcl 閃電鏈 |  |  |
| 41-00 木乃伊的詛咒 | 地獄來襲者 - 斑剎(PASSIVE) | 7 | Scri |  |  |
| 41-01 吸血鬼之吻 | 地獄來襲者 - 斑剎(Q) | 7 | ANdr | 200/400/600/600/600 |  |
| 41-02 地裂術 | 地獄來襲者 - 斑剎(W) | 7 | AUim | 200/275/350/425 |  |
| 41-03 召喚術 | 地獄來襲者 - 斑剎(E) | 7 | Arai | 5/5/4/4/3 |  |
| 41-04 究極魔法流星雨 | 地獄來襲者 - 斑剎(R) | 7 | ANr3 | 700/1050/1400 |  |
| 42-00 魔法障壁 | 黑暗福音 - 依文潔琳(PASSIVE); 黑暗福音 - 依文潔琳(PASSIV | 7 | ACfu |  |  |
| 42-01 凍結的大地 | 黑暗福音 - 依文潔琳(Q); 黑暗福音 - 依文潔琳(Q) | 7 | AUfn | 150/200/250/300 |  |
| 42-02 吸血祭品 | 黑暗福音 - 依文潔琳(W); 黑暗福音 - 依文潔琳(W) | 7 | AUdr 生命吸取 |  |  |
| 42-03 暗夜吹雪 | 黑暗福音 - 依文潔琳(E); 黑暗福音 - 依文潔琳(E) | 7 | AOsh 衝擊波 | 500/850/1200/1550 |  |
| 43-00 觀音大士的守護 | 食神 - 撒尿牛丸(PASSIVE) | 8 | Aegr 復原 |  |  |
| 43-01 得罪了方丈還想走 | 食神 - 撒尿牛丸(Q) | 7 | ANfl 火焰之雨 | 125/200/275/350/350 | 召喚基底 |
| 43-02 打狗鏟 | 食神 - 撒尿牛丸(W) | 9 | AHbh 重擊 |  |  |
| 43-03 少林絕學-火雲掌 | 食神 - 撒尿牛丸(R) | 7 | AOeq | 80/120/160 |  |
| 44-00 機警 | 完全而瀟灑的女僕 - 十六夜Sakuya(PASSIVE); 奇樂 - 夜神月( | 7 | ANms |  |  |
| 44-02 死神的規則 | 奇樂 - 夜神月(W) | 9 | Aamk 屬性加成 |  |  |
| 45-00 寫輪眼 | 寫輪眼復仇者 - 宇智波佐助(PASSIVE) | 3 |  |  |  |
| 45-04 哥哥 | 寫輪眼復仇者 - 宇智波佐助(R) | 6 | Aamk 屬性加成 |  |  |
| 47-00 龍搥閃 | 殺人劍客 - 佐佐木小次郎(PASSIVE) | 9 | Awar 戰爭踐踏 |  |  |
| 47-01 飛龍閃 | 殺人劍客 - 佐佐木小次郎(Q) | 7 | Awfb 火焰箭(球體) | 150/250/350/450 | 球體/法球 |
| 47-02 神速 | 殺人劍客 - 佐佐木小次郎(W) | 7 | AEbl |  |  |
| 48-02 心眼 | 梅杜莎 - Rider(W) | 9 | AEev 閃避 |  |  |
| 48-002 騎英之疆繩MAX | 梅杜莎 - Rider(EX) | 9 | Aegr 復原 |  |  |
| 49-01 遮斷獵殺 | 殺戮之牙 - 異形(Q) | 7 | AOwk 疾風步 |  |  |
| 49-02 腐蝕毒液 | 殺戮之牙 - 異形(W) | 7 | Aven | 10/20/30 |  |
| 49-04 母體 | 殺戮之牙 - 異形(R) | 7 | ANsy | 7/6/6 |  |
| 49-002 產卵 | 殺戮之牙 - 異形(EX) | 7 | ACpa |  |  |
| 52-00 十二道試煉 | 海克力斯 - Berserker(PASSIVE) | 3 | AOr3 |  |  |
| 52-03 無銘斧劍 | 海克力斯 - Berserker(E) | 7 | Aven | 50/70/90/110 |  |
| 53-00 空間穿梭 | 獸神官 - 傑洛士(PASSIVE); 憂鬱少女 - 涼宮八ㄦ匕(PASSIVE | 3 | Aivs |  |  |
| 53-02 強化炸彈陣 | 獸神官 - 傑洛士(W); 憂鬱少女 - 涼宮八ㄦ匕(Q) | 7 | AHfs | 150/300/450/600 |  |
| 53-002 恐懼力量 | 獸神官 - 傑洛士(EX) | 9 | Aamk 屬性加成 |  |  |
| 57-01 空氣砲 | 小叮噹 - 哆拉A夢(Q) | 7 | AOsh 衝擊波 | 250/350/450/550 |  |
| 57-02 任意門 | 小叮噹 - 哆拉A夢(E) | 7 | AEbl |  |  |
| 58-00 電光一閃 | 神騎寶貝 - 皮卡丘(PASSIVE); 神奇寶貝兒 - 皮卡丘(PASSIVE | 7 | AEbl |  |  |
| 58-01 十萬伏特 | 神騎寶貝 - 皮卡丘(Q); 神奇寶貝兒 - 皮卡丘(Q) | 7 | ANfl 火焰之雨 | 175/275/375/375/375 | 召喚基底 |
| 58-02 鋼鐵尾巴 | 神騎寶貝 - 皮卡丘(W); 神奇寶貝兒 - 皮卡丘(W) | 9 | AHbh 重擊 |  |  |
| 59-00 暴走 | 最終泛用人型決戰兵器 - 初號機(PASSIVE) | 3 | Asal |  |  |
| 59-01 吞噬 | 最終泛用人型決戰兵器 - 初號機(Q) | 7 | AIpv |  |  |
| 59-02 高週波短刀 | 最終泛用人型決戰兵器 - 初號機(W) | 9 | AHbh 重擊 |  |  |
| 59-03 AT力場 | 最終泛用人型決戰兵器 - 初號機(E) | 7 | Assk |  |  |
| 59-001 完全暴走 | 最終泛用人型決戰兵器 - 初號機(EX) | 7 | AIev |  |  |
| 60-00 聖光盾 | 時空勇者 - 林克(PASSIVE) | 7 | ACds |  |  |
| 60-02 鎖鏈槍 | 時空勇者 - 林克(W) | 7 | Amls |  |  |
| 60-002 絕光斬 | 時空勇者 - 林克(EX) | 9 | AHbh 重擊 |  |  |
| 61-02 霸獸盔甲 | 死亡老二 - 克勞薩先生(W); 重金屬樂團的怪物 - 克勞薩II世(W) | 7 | AEim | 60/120/180/240 |  |
| 61-04 瘋狂怪物 | 死亡老二 - 克勞薩先生(R); 重金屬樂團的怪物 - 克勞薩II世(R) | 7 | ANms |  |  |
| 61-002 惡魔吉他 | 死亡老二 - 克勞薩先生(EX); 重金屬樂團的怪物 - 克勞薩II世(EX) | 7 | AUav |  |  |
| 64-00 開瓶特技 | 姜窩肯 - 約翰走路(PASSIVE) | 7 | Acyc |  |  |
| 64-03 工廠機器人 | 姜窩肯 - 約翰走路(E) | 7 | ANrc | 80/120/160/200 |  |
| 64-002 魔幻嘉年華 | 姜窩肯 - 約翰走路(EX) | 7 | ACav |  |  |
| 65-00 古老智慧 | 至尊學長 - 飛鼠先生(PASSIVE) | 8 | Aegr 復原 |  |  |
| 65-01 神出鬼沒 | 至尊學長 - 飛鼠先生(Q) | 7 | AEbl |  |  |
| 66-00 恐懼 | 七夜怪談 - 貞子(PASSIVE) | 3 | Asth |  |  |
| 66-01 靈體化 | 七夜怪談 - 貞子(Q) | 7 | AOwk 疾風步 |  |  |
| 66-03 七夜怪談 | 七夜怪談 - 貞子(E) | 7 | AUls 蝗蟲群 | 160/160/160/160 | 蝗蟲群 |
| 66-002 死亡漫延 | 七夜怪談 - 貞子(EX) | 9 | Aegr 復原 |  |  |
| 69-01 力量強化 | 英靈-亞瑟王 - 黑化Saber(Q) | 9 | Aamk 屬性加成 |  |  |
| 69-03 約束與勝利之劍 | 英靈-亞瑟王 - 黑化Saber(E) | 7 |  | 250/400/550/700 |  |
| 69-001 黑化之力 | 英靈-亞瑟王 - 黑化Saber(PASSIVE) | 6 | ANde |  | 球體/法球 |
| 70-00 芬多精 | 白木老樹精 - 白木卡迪那(PASSIVE) | 6 | Asal |  |  |
| 70-02 大怒石 | 白木老樹精 - 白木卡迪那(W) | 9 | AHbh 重擊 |  |  |
| 70-04 千年練成 | 白木老樹精 - 白木卡迪那(R) | 7 | ANr3 | 180/180/180 |  |
| 70-002 樹海降臨 | 白木老樹精 - 白木卡迪那(EX) | 9 | AEev 閃避 |  |  |
| 71-00 暗夜契約 | 邪惡意念集合體 - 死之王(PASSIVE) | 8 | Aegr 復原 |  |  |
| 71-002 夜之主 | 邪惡意念集合體 - 死之王(EX) | 9 | Aegr 復原 |  |  |
| 72-01洗刷刷 | 美白大法師 - 黑人牙膏(Q) | 7 | ANmo | 150/300/450/450/450 |  |
| 72-02 黑人牙菌斑 | 美白大法師 - 黑人牙膏(W) | 7 |  | 20/30/40 |  |
| 72-03 超亮白 | 美白大法師 - 黑人牙膏(E) | 7 | Afae | 6/12/18 |  |
| 72-002 億萬星殞落 | 美白大法師 - 黑人牙膏(EX) | 7 | AEsb |  |  |
| 74-00 JENOVA | 神性的流失 - 賽菲洛斯(PASSIVE) | 6 | ANdb |  |  |
| 74-002 超新星 | 神性的流失 - 賽菲洛斯(EX) | 7 |  |  |  |
| 75-00 戰鬥之歌 | 最M的魔法Jizz - 清蒸 飛鼠先生(PASSIVE) | 7 | Absk 狂暴 |  |  |
| 75-01 超．祕技略決 | 最M的魔法Jizz - 清蒸 飛鼠先生(Q) | 7 | Aspb | 80/120/160/200/240 |  |
| 78-00 銅皮鐵骨 | 黑手黨老大 - 基廉列克(PASSIVE) | 3 | Assk |  |  |
| 78-01 斬鐵拳 | 黑手黨老大 - 基廉列克(Q) | 9 | AHbh 重擊 |  |  |
| 78-002 加速爆體 | 黑手黨老大 - 基廉列克(EX) | 9 | Aegr 復原 |  |  |
| 79-00 靈壓 | 開外掛的死神 - 黑崎一護(PASSIVE); 外掛開很大的死神 - 黑崎一護( | 3 |  |  |  |
| 79-04 卍解 | 開外掛的死神 - 黑崎一護(R); 外掛開很大的死神 - 黑崎一護(R) | 7 | AEme 變形 |  |  |
| 80-02 弒鬼神 | 亂世癿王者 - 呂布奉先(W) | 7 | AOsh 衝擊波 | 150/250/350/0/0 |  |
| 80-002 戰無不勝 | 亂世癿王者 - 呂布奉先(EX) | 7 | Ansk |  |  |
| 81-00 守護之光 | 魔砲少女 - 高町奈葉(PASSIVE); 白色惡魔 - 高町奈葉(PASSIV | 7 | ANms |  |  |
| 81-002 Exellion Mode | 魔砲少女 - 高町奈葉(EX); 白色惡魔 - 高町奈葉(EX) | 7 | AEIl 變身 |  | 變身基底 |
| 82-01 雷之斧 | 白色之翼 - 涅吉。史普林。菲爾德(Q) | 7 | ANin | 210/300/390/480 |  |
| 84-00 熊巴巴 | 百畝森林的霸主 - 維尼(PASSIVE) | 7 | ANb2 |  |  |
| 86-01 十萬伏特 | 傲嬌電氣老鼠 - 皮卡娘(Q) | 7 |  | 175/275/375/375/375 |  |
| 86-02 電光一閃 | 傲嬌電氣老鼠 - 皮卡娘(W) | 7 |  |  |  |
| 86-03 神鳴 | 傲嬌電氣老鼠 - 皮卡娘(E) | 7 | AUcs 腐臭蜂群 | 400/650/900/1150 |  |
| 86-002 雷電萌神 | 傲嬌電氣老鼠 - 皮卡娘(EX) | 9 | Awar 戰爭踐踏 |  |  |
| 87-00 虛空碎靈 | 曹操孟德 - 阿瞞大人(PASSIVE) | 7 | ANht |  |  |
| 87-01 大紅蓮斬 | 曹操孟德 - 阿瞞大人(Q) | 7 | AOsh 衝擊波 | 250/550/850/850/850 |  |
| 87-02 霸體 | 曹操孟德 - 阿瞞大人(W) | 7 | Assk |  |  |
| 87-03 天下號令 | 曹操孟德 - 阿瞞大人(E) | 7 | AEIl 變身 | 80/120/160/200 | 變身基底 |
| 87-04 逆我必殺 | 曹操孟德 - 阿瞞大人(R) | 7 | AIpv |  |  |
| 89-00 憤怒的門牙 | 國寶級的畜生 - 熊貓(PASSIVE) | 8 | AOcr 致命一擊 |  |  |
| 89-01 憤怒的頭槌 | 國寶級的畜生 - 熊貓(Q) | 9 | AHbh 重擊 |  |  |
| 90-01 飛葉快刀 | 種子神奇寶貝 - 妙蛙花(Q); 種子神奇寶貝 - 妙蛙種子(Q) | 7 | AOww | 100/200/300 |  |
| 90-02 麻痺粉 | 種子神奇寶貝 - 妙蛙花(W); 種子神奇寶貝 - 妙蛙種子(W) | 7 | AHtc 雷霆一擊 |  |  |
| 90-002 超進化! 妙蛙花 | 種子神奇寶貝 - 妙蛙花(EX); 種子神奇寶貝 - 妙蛙種子(EX) | 7 | AEme 變形 |  |  |
| 91-04 血魄暴噬 | 死亡騎士(R); 不良少年(R) | 9 | AHbh 重擊 |  |  |
| 92-02 消化液 | 看似憂鬱的神獸 - 草泥馬(E); 看似憂鬱的神獸 - 草泥馬(E) | 7 | ANab | 20/30/40/50 |  |
| 92-002 最終戈壁 | 看似憂鬱的神獸 - 草泥馬(EX); 看似憂鬱的神獸 - 草泥馬(EX) | 9 | AEev 閃避 |  |  |
| 93-01 期末報告 | 會叫的野獸 - 傳說中的大刀(Q) | 7 | Abof | 15/25/35/45 |  |
| 94-002 歹戲拖棚 | 夜市人生 - 金居福(EX) | 7 | Aroc |  |  |
| 95-02 大和戰氣 | 皇者 - 騜(W) | 7 | ANb2 | 20/20/20/20 |  |
| 96-00 天香斷續膠 | 笑傲江湖 - 令狐沖(PASSIVE) | 7 | Arej |  |  |
| 96-02 混元掌 | 笑傲江湖 - 令狐沖(W) | 7 | AHtb 風暴之鎚 | 150/250/250/250/250 |  |
| 96-002 易筋經 | 笑傲江湖 - 令狐沖(EX) | 9 | Awar 戰爭踐踏 |  |  |
| 97-01 壹之秘劍-焰靈 | 幕末復仇狂者 - 志志雄真實(Q) | 7 | ANic | 20/20/20/20 |  |
| 97-02 貳之秘劍-紅蓮腕 | 幕末復仇狂者 - 志志雄真實(W) | 7 | Amls | 75/150/225/300 |  |
| 97-03 弱肉強食 | 幕末復仇狂者 - 志志雄真實(E) | 7 | AUav |  |  |
| 97-04 終極秘劍-火產靈神 | 幕末復仇狂者 - 志志雄真實(R) | 7 | AOww | 200/300/400 |  |
| 97-002 終極秘劍-火產靈神 | 幕末復仇狂者 - 志志雄真實(EX) | 7 |  |  |  |
| 98-00 正妹優勢 | 學姊 - 小派(PASSIVE) | 8 | AEev 閃避 |  |  |
| 98-03 從過去中學習 | 學姊 - 小派(E) | 9 | Aegr 復原 |  |  |
| 99-00 可愛就是正義 | 夢幻之星 - 初音(PASSIVE) | 6 | AUau |  |  |
| 99-01 甩蔥歌 | 夢幻之星 - 初音(Q) | 7 | AOcl 閃電鏈 | 200/275/350/425 |  |
| 99-02 最初的聲音 | 夢幻之星 - 初音(W) | 7 | AOhw |  |  |
| none | 完全而瀟灑的女僕 - 十六夜Sakuya(E); 完全而瀟灑的女僕 - 十六夜S | 7 |  | 80/120/160/200/240 |  |

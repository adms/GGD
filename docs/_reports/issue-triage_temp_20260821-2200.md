# 🧾 330 張開票全面盤點 —— 2026-08-21 (GMT+8)

> owner #501：「將已經完成或沒必要繼續做的票註解後關閉…整理成幾批…拆檔拆架構也可以建議，但先不要執行」
> ⛔ 拆檔建議一行程式都沒有動。

| | 數 |
|---|---:|
| 母體（`gh issue list --state open`） | **330** |
| ✅ 已關（兩輪都通過） | **105** |
| ⛔ 對抗複驗**推翻**、擋下沒關 | **33**（138 張候選的 **24%**） |
| 還要做 | **225** |
| 批次（同批零檔案衝突） | **15** → 拆掉四個熱點檔剩 **8** |

## ⭐ 對抗複驗擋下的 33 張

| 票 | 標題 | 還缺什麼 |
|---|---|---|
| #19 | 戰場任務:殭屍跨回合累積 100 隻召喚殭屍王 | ① 王的外觀：全黑身體＋紫色光芒（現況只有全體 mob 共用的暗化，沒有王專屬 tint／glow，也沒有對應後台欄位）② 召喚前的任務提示（HUD 只有裸擊殺數，沒有目標門檻與任務文字） |
| #45 | 6 位近戰英雄實際普攻速率只有自身節奏的 14%~43% —— 冷卻在起手時扣滿，揮擊卻在傷害點被取消 | ① 根因（冷卻在起手扣滿、硬控取消前搖不退還）完全沒動——票 body 的 A/B/C 三個修法一個都沒落地，`sim/` 全域 grep `refund／退還／leniency／寬容` 在 BasicAttackSystem/abilitySystem 一個命中都沒有；② godie-hpb1 與 godie-udea 仍是 4/6 = 0.67（丟掉三分之一的揮擊），只是沒低於 0.5 的閘； |
| #58 | 補「無敵／免疫」模擬器原語 —— 模擬器完全沒有這個軸,約 14 位英雄(含出貨名單蒼月潮兩支)的描述在 | ① variants/invulnerable.ts 沒有百分比減傷軸（hpb1 07-04「抵擋50%傷害」無法表達）② 票列的 5 個內容受害者（hpb1.q / hpb1.r / o02p.r / e008.ex / hblm.passive）0 個回填、0 個改描述，其中 hpb1.q 與 e008.ex 是 effects 空陣列配著承諾的描述 |
| #60 | 出貨名單 51 位的「整組技能」逐位對帳（doc 114 個核取方塊全空，只有 4 位被 #247 順手 | w3x 保真度那一半（第 3–5 層）確實隨 #278 退場，可以刪；但「描述承諾了引擎不會做的事」那一半（ogld.ex 空 effects 卻寫每秒200傷害持續30秒、hpb1.q 空 effects 卻寫抵擋負性魔法、ogld.passive 缺檔）是第一·五守則的活規則，沒有守衛、沒有替代票，關掉就是無聲丟棄 |
| #78 | T2 語音(jump / knockdown):前置 #247 已落地,語音側仍是 dispatched | contextualVoice.ts 的 policyFor 仍缺 jump / knockdown 兩個 case；兩者吃 DEFAULT_POLICY 0.5 / 2500ms，jump 的觸發源（AIRBORNE 上升緣）頻率遠高於此調校的假設 |
| #92 | client 的 bootContent 沒包 OverlayContentSource：後台改內容 s | apps/platform/internal/server/orphan_route_test.go:96-108 的 `GET /api/v1/content-overlay/bundle` 白名單條目（caller 仍只寫 game-server，reason 仍宣稱沒有 UI 呼叫）尚未跟著 client 的改動更新。 |
| #129 | 實作 Pattern A 變身機制：施放→整份 runtime 定義換成第二形態→ahdu 計時→換回（ | 變身後的**六格技能列/一般技能 (uabi)** 沒有換成第二形態文件的技能（`world.abilities` 只在 spawnChampion 寫一次）；docs/_transform-forms-249.md 逐對列的「技能變化」表尚未落地。另：23 支 ability doc 綁了 championForm，票面說的是 26 組配對，差額需確認是刻意（缺 champion doc / 同 |
| #139 | 營運白名單未同步 starter.go：本機已確認缺 12 隻（含 godie-hblm / godie | 正式機（ggd.adms.ai）白名單是否已 union 補齊、10 隻變身態是否已手動停用 —— 只有 owner 在後台操作/確認得了。 |
| #140 | 補 summon 效果詞彙:52 支「召喚代理」是最大行為家族,expand.ts 已標記 availa | 52 支召喚代理家族的內容改寫（(a) dummy-cast → spawnProjectile/AoE、(b) 真召喚物落地）、tpl-summon-agent 拆成「dummy-投放(enabled)/真召喚」並填 params、億年樹等具體技能接上 summon。 |
| #151 | 6 位英雄的普攻速率閘：BasicAttackSystem 前搖被 hitstop 凍住 + 擊退把目標 | 票標題的根因（前搖被 hitstop/hitstun 凍住、冷卻在起手就整段扣掉、空揮/硬控取消不退費）完全未處理；三選一仍待 owner 裁決；autoAttackCensus.test.ts L128-152 的註解已與空 Map 自相矛盾，需一併清理。 |
| #178 | 負護甲的顯示規則仍未裁決 —— 戰鬥端安全，但四個顯示點會照實印出 -7.9 | 前一輪的承重證據「戰鬥端 damage.ts 的 Math.max(0, resist) 讓負護甲等同 0」在出貨樹上已經不成立，而且出貨內容裡仍有能把護甲推成負的扁平減抗來源，「已無對象」也不成立。 |
| #196 | [下一版] 鑄技工坊：變身技能 —— 很多英雄的造型/特效/傷害機制都靠變身 | #131 Asph 球體附掛 join（14 筆第二形態附掛）、#133 三支變身技的等級 4 殘留魔耗、#134 鳳凰蛋 revive 狀態機（sim 零實作）、#168 英靈殿輪播抽到變身態、#130 的 h00w/n01b 只被搬進 _legacy 而非匯入、以及「26 組配對表仍寫死在 TS」這一半。 |
| #206 | v0.9.13 殭屍規格全面改版:傷害比例分紅(可超過總額)· 從英雄推導的數值倍率 · 隨機選英雄 | §4 的兩格後台欄位（隨機英雄的抽取池：全體 vs 白名單；隨機頻率：每隻/每波/每場）＋ §2 的「直接給級 vs 給等值 XP」模式欄位，三格都還沒有 config/Zod/admin 三處住處。 |
| #210 | 擴充傳說武器池（15→更多）+ 近戰擴散攻擊：機制目前不存在，要先做 | 第 3 條的後半：擴散半徑/比例的**上限**仍是 sim 常數（spreadLimits.ts），無後台欄位也不在 content/config；owner 要放寬仍需改程式 + 重新 build。另外「池子大小不重複抽完」沒有 #210 自己的守衛，是借 #249 的。 |
| #214 | 悟空超級賽亞人變身：靈氣AoE + 超賽攻擊特效 + 超3球體 + hover ——「隱藏法術書」與魔法 | ① hover/moveType 需要真的接進 sim/render（或明說廢除並改掉卡面描述）② 掛件要能取代 goku.glb 裡烘死的 Gokuhead，否則變身兩顆頭 ③ 攻速/移速差要用 owner 2026-08-13 說的「技能標籤組合」補回來 ④ hover 高度/靈氣% 的後台欄位 |
| #216 | 走路/攻擊面向錯誤：Saber 確認有，需全角色普查 | 4 支不可量測英雄模型（heroichigo / heropikachu / herolight / luffe）要用別的判準給出面向判定；並把 ≥40 換成「不可量測清單 == 已知豁免名單」這種會因為靜默退回而紅的 pin |
| #222 | 天堂之劍爆擊設定錯誤 —— 重新對照 w3x 原始資料 | 未做：解 raw/war3map.w3t 取 I01N 的 Ocr1/Ocr2（含 AbilityData.slk 的 base 繼承）、列出與現值的差異、把被 owner 新版文案取代的 w3x 原值寫進 docs/legacy/_w3x-fidelity-superseded.md；並修正 authoringNote 裡指向不存在的 legendaryCritStrike.test.ts 的假 |
| #224 | 角色可選名單重複太多：53 位只有 42 種模型，26% 在共用 | 票 body「⚠️ 一個要先釐清的」那條：上架 SOP（#214，docs/新英雄上架SOP.md）要加「新英雄不可以只用替身」的閘 —— 未落地。另外若要把徽章改讀真正的出貨解析結果（standinCensus.ts），那支模組目前是零消費者的死碼。 |
| #230 | 特殊殭屍出現頻率太高 | 後台欄位缺 max 上界（票要求的第三條）：apps/admin/src/mobWaves.ts:1351 的 "special.chancePercent" 要補 max: 100（並讓 fieldRange 印得出來），⛔ 不是只靠 Zod 在下游擋。 |
| #300 | T0 觸發事件補完：身上有某狀態時 · 護盾產生/破碎時 · 迴避時 · 隊友陣亡時（owner：使用率 | ① onEvade 與攻擊者 fumble 共用同一則事件，票要求查證的「真閃避 vs 揮空分不分得開」＝分不開；② 主動【破盾】與護盾到期不觸發 onShieldBroken，程式碼自陳為待 owner 裁決的缺口。 |
| #312 | 型別謊言：匯出的 ConfigDoc 只是 zConfigMatchDoc 的 infer，不是那個 u | packages/shared/src/content/registries.ts:231-235 仍寫 `const configDocs = store.all<{ schema?: string }>("config")`，上面三行註解還宣稱「匯出的 ConfigDoc 其實只是 zConfigMatchDoc 的 infer（schema/config.ts:5177）」—— 那句話已經假 |
| #346 | 日式道具產生器：障子門／石燈籠／鳥居／欄干（⛔ 零下載） | 票 body/標題點名的 **欄干**（日式木造欄杆）沒有做出來 —— tools/scenery-gen/pieces.ts 裡沒有任何 railing/欄干 piece，前一輪把 iron_fence 當成它是誤判。補法是 pieces.ts 加一列 + `pnpm scenery:gen` 貼回 sha256 pin。 |
| #368 | 商店與英靈殿的模型尺寸/站姿：多拉A夢仍是巨大支，多位英雄下半身傾斜沒站直 | ②站姿/傾斜：需要 pivot 或 idle clip 層面的實證（或票要求的四場景同英雄截圖對照）；另外 championModelAudition 這條路徑沒有守衛斷言。 |
| #377 | 特效方位只做完一半：pitch 已落地，但 yaw 需要「每次施法瞄準」才有意義（擋住 129 支） | 內容側採用：beam(47)/slash(41)/bolt(11)/dash(6)/tornado(6) 這些有方向的 vfx 文件要宣告 orient.yawFrom:"aim"（目前 0 份，除了兩支 beam-flat）。要嘛做完再關，要嘛把它拆成一張『內容採用』的新票再關這張。 |
| #392 | 缺兩個特效機制：立起來的光柱（飛鼠天譴）· 附著骨骼跟隨播放（悟空SSJ3 雙手球體） | 悟空 SSJ3 的雙手球體內容沒做：要嘛替 godie-o00x 開一份 attachment@1（points 兩格）掛進 ambient-vfx.bindings，要嘛把 form-visuals 的 attachBone 擴成 points[]。⚠️ 現行實作是照 SPHERE_ATTACHMENTS.json 的 w3x 事實（origin×1）做的，而 owner 的「雙手」是第〇·六守 |
| #404 | 70-04 千年練成的卡片寫「招喚樹精 4/6/8 棵」—— 一棵都沒召喚 | summon@1 還沒接上：e00s.r / e010.r 的效果樹要長出真的樹精身體（不移動 · 屬施法方 · 有壽命，owner 2026-08-19 07:20 的四格規格），等 #423 落地後才可關。 |
| #427 | generateFamilyContent 仍然整份重寫 abilities —— GH#378 的第二 | 票 body 末節：abilities 收斂成純覆寫層（只留操作者真的改過的格），family/w3xScale/tint/flyHeight/anchor 這一半交給 vfx-ability-art；目前 258 列雙住處仍在，會漂開。 |
| #430 | 📋 v0.21.3 版本 NOTE 與工作進度 —— 已出貨 19 · 等裁決 5 · 待做 13 | 「已被新版取代」只證明版號變了，⛔ 沒證明它的功能被取代 —— owner 要的是版本 NOTE 形式的進度追蹤，而全 repo 找不到任何後繼 NOTE 票，且它列的 18 項裡 16 項還開著。 |
| #446 | 魔力：耗魔要正規化（對應傷害×範圍）+ 回魔要平衡（滿魔 47.7 秒 → ≤15 秒） | ① LV30 hard limit（≤30 秒）仍有 13/49 未達成，需要再調旋鈕或由 owner 核可這些例外；② owner 對例外清單的裁決尚未落回票裡；③ 裁決區另外要求「以上做完請再更新一次兩份 MD」，我沒有查到對應的更新證據。 |
| #454 | 大廳新增「宿敵排行榜」：交手最多的對手，版位在朋友列表與積分排行榜之間 | ① nemesisSort/splitOrder 要嘛真的接上執行期（讀 content/config/lobby-layout.json）＋補後台頁，要嘛拿去問 owner 定義（a/b/c 三選一）；② 票裡第 3 件「隱私是否可雙向可見」owner 未點頭。 |
| #460 | ⭐ 四軸級距的五個貫穿性實作約束（逐等級陣列 · 「極小」詞彙 · 部署順序 · 卡面vs實際 · 傷害 | ④：全 content/ 有 **0 支**技能用 {{cd!}}（我跑 rg -c 得 0），而 apps/client/src/ui/hud/StatsHoverPanel.tsx 仍是 `冷卻 ${displayFinalText(r.n, "cooldown", {env})}s`，content/config/combat-env.json 的 multipliers.cooldown  |
| #464 | 冷卻逐階不同的 24 支要列管：5 支疑似資料錯（Avalon 12→60、界王拳升級變慢、暗步滿階 0 | ① 4 支遞增技能（godie-e001.q · godie-e00n.q · godie-u00j.w · godie-u010.q · godie-uvng.q）owner 未裁決，且現況已被級距從污染值推長 1.5–2×，要嘛拿回去問、要嘛另開一票；② 票點名的「明著標記特例」欄位（cooldownPerRank）沒做，只有替代閘（tiers:apply:check + tierRawPar |
| #469 | 隱藏英雄機制上線但出貨名單是空的 —— #336 的彩蛋玩家永遠遇不到 | 第五位「黑化Saber」未填（owner 自己標『待補』，且 e002／e00l 哪一個才是本體只有 owner 答得出來）；另外 config.ts:7286-7289 的「出貨的隱藏名單是空的」註解與 DEFAULT_HIDDEN_CHAMPIONS=[] 已與出貨值不一致。 |

## ⭐ 平行度的天花板（拆檔建議的依據）

| 待辦票數 | 檔 |
|---:|---|
| 15 | `apps/client/src/GameApp.ts` |
| 14 | `packages/shared/src/content/schema/config.ts` |
| 11 | `apps/game-server/src/match/MatchController.ts` |
| 8 | `apps/admin/src/configForms.ts` |
| 8 | `apps/client/src/vfx/VfxSystem.ts` |
| 7 | `packages/shared/src/protocol/schema.ts` |
| 6 | `packages/shared/src/content/schema/vfx.ts` |
| 6 | `apps/admin/src/mobWaves.ts` |
| 6 | `apps/client/src/net/RoomStore.ts` |
| 5 | `content/config/arena-rules.json` |
| 5 | `packages/shared/src/sim/systems/GuardianSystem.ts` |
| 5 | `content/config/combat-env.json` |
| 5 | `apps/admin/src/ui/App.tsx` |
| 5 | `packages/shared/src/content/schema/ability.ts` |

## 批次（依 `domains` 圖著色）

| 批 | 張數 | 玩家可見 | 做一半 | 主要領域 |
|---:|---:|---:|---:|---|
| 1 | **83** | 59 | 16 | apps/client×81 · content/abilities×76 · packages/shared×60 |
| 2 | **47** | 30 | 6 | packages/shared×44 · apps/client×40 · content/abilities×27 |
| 3 | **34** | 26 | 4 | packages/shared×40 · apps/client×32 · content/abilities×20 |
| 4 | **19** | 11 | 2 | packages/shared×27 · apps/client×26 · apps/admin×9 |
| 5 | **11** | 6 | 0 | apps/client×18 · packages/shared×15 · apps/admin×8 |
| 6 | **6** | 6 | 0 | apps/client×12 · content/projectiles×9 · packages/shared×5 |
| 7 | **5** | 4 | 1 | apps/client×12 · packages/shared×9 · content/config×2 |
| 8 | **4** | 4 | 1 | apps/client×11 · packages/shared×2 · apps/game-server×1 |
| 9 | **3** | 3 | 0 | apps/client×6 · packages/shared×4 · content/config×1 |
| 10 | **3** | 3 | 1 | apps/client×6 · packages/shared×4 · content/config×3 |
| 11 | **3** | 2 | 0 | apps/client×6 · packages/shared×3 · tools/tts-gen×2 |
| 12 | **2** | 2 | 1 | packages/shared×3 · apps/client×2 · apps/admin×2 |
| 13 | **2** | 1 | 0 | apps/client×4 · apps/admin×3 · packages/shared×1 |
| 14 | **2** | 1 | 1 | apps/client×5 · packages/shared×2 |
| 15 | **1** | 1 | 0 | apps/client×4 |

### 逐批票號

**批 1**（83 張）：#20 #32 #33 #36 #40 #44 #50 #53 #58 #61 #63 #68 #70 #73 #92 #99 #103 #108 #109 #113 #114 #126 #127 #132 #139 #147 #149 #159 #163 #165 #168 #174 #177 #186 #195 #198 #199 #210 #224 #243 #274 #314 #329 #344 #346 #354 #368 #397 #401 #404 #417 #423 #427 #440 #441 #445 #452 #454 #475 #35 #37 #46 #60 #64 #75 #80 #83 #85 #86 #95 #96 #117 #122 #137 #138 #148 #151 #181 #216 #222 #430 #438 #464

**批 2**（47 張）：#34 #43 #45 #49 #51 #57 #59 #62 #65 #76 #91 #111 #112 #129 #136 #140 #142 #146 #153 #173 #176 #185 #200 #244 #245 #300 #429 #443 #453 #469 #56 #71 #77 #88 #90 #97 #102 #106 #121 #135 #171 #231 #382 #409 #460 #473 #480

**批 3**（34 張）：#19 #54 #55 #67 #72 #79 #119 #128 #131 #157 #160 #162 #175 #196 #197 #208 #209 #237 #242 #273 #348 #377 #414 #444 #448 #450 #30 #82 #84 #89 #105 #164 #178 #472

**批 4**（19 張）：#104 #107 #143 #155 #172 #215 #248 #403 #446 #451 #461 #66 #74 #81 #87 #166 #167 #214 #327

**批 5**（11 張）：#14 #39 #154 #194 #283 #366 #100 #207 #281 #372 #457

**批 6**（6 張）：#41 #116 #144 #278 #330 #425

**批 7**（5 張）：#161 #206 #213 #280 #158

**批 8**（4 張）：#38 #101 #150 #230

**批 9**（3 張）：#22 #94 #184

**批 10**（3 張）：#156 #324 #392

**批 11**（3 張）：#42 #325 #69

**批 12**（2 張）：#78 #225

**批 13**（2 張）：#169 #410

**批 14**（2 張）：#204 #312

**批 15**（1 張）：#183


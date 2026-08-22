# 🏺 票號 < 300 考古盤點 —— 2026-08-22 (GMT+8)

> owner 2026-08-22:「一堆老 issue 都是**舊的資料參考**」「越老的票越要小心考古，**傾向關閉 (<300)**」
> ⛔ 這一輪唯讀，一個檔案都沒動（本報告除外），⛔ 沒有 commit、⛔ 沒有 gh 寫入。

## 母體與方法

| | 數 |
|---|---:|
| `gh issue list --state open` | **199** |
| 其中票號 **< 300** | **144** |
| ✅ DONE（指得出 commit / 程式碼） | **13** |
| 🗑 OBSOLETE（前提已不存在） | **19** |
| 🔧 PARTIAL（仍活著） | **112** |

**三個問題逐張問**（⛔ 都用 `rg` / `python3` 直接量，不看票面）：
① 它引用的檔案／函式／常數今天還在嗎？
② 它描述的數字今天還成立嗎？
③ 它要的東西是不是已經被後來的版本順手做掉了？

## ⭐ 這一輪改變最多結論的六個**全域事實**

| 量 | 票寫的（2026-07-28 前後） | **今天量到的** | 影響幾張票 |
|---|---|---|---:|
| `content/champions/*.json` | 115–116 | **69**（+ `_legacy/champions` 48 份） | 大量 |
| `content/abilities/*.json` | 673–696 | **420** | 大量 |
| 出貨名單 | 51–53 | **49**（`data/curation/whitelist.json`） | 大量 |
| 模擬器 effect kind | **10** | **40**（`sim/effects/effectRegistry.ts`） | #50 #51 #55 #57 #58 #59 #140 |
| `combat-env.maxHealth` | 4.0 | **6.0** | #22 |
| `docs/_kit-fidelity-audit-247.md` | 權威來源 | **已刪除** | #60 |

⚠️ **「檔案還在嗎」單獨問是無效的**：我逐一驗過 63 條被票點名的路徑，
**63 條全部還在**。真正判死老票的是**數字**（母體、倍率、級距）與**引擎能力**。

---

## ✅ DONE —— 13 張（每張指得出 commit 或程式碼）

| 票 | 證據 |
|---|---|
| **#36** | `2697d789`；`render/modelLod.ts` 有 `quarantine` / `quarantinedTiers`，判決與資料同住 |
| **#37** | `ddaf2c32`；`docs/asset-debt.md:7`「Updated 2026-08-22 (#37)」、:118 改寫「Why the gate holds」 |
| **#40** | `9d703053`；`ATTACK_STRIKE_FRACTION` 本地常數移除 → `anim/castStrike.ts::attackStrikeFractionFor()` + `ChampionView.beginAttack()`，守衛 `attackStrikeAlignment.test.ts` |
| **#63** | `84e51d26`「同一個 rawcode 的兩支技能不再有兩種長相」 |
| **#94**⚠️ | `d6640d2a` 把條碼接進 `voxelSkinTexture` 與後台縮圖 —— ⛔ **但那筆 commit 自己寫「這一條不可以被讀成 #96 做完了」**，執行期資料路徑仍缺 ⇒ 見 PARTIAL |
| **#99** | `LeaveSettlementOverlay.tsx:214` `padModalScope("leave-settlement")` + `:280` `<Btn padBack>` |
| **#100** | `net/RoomStore.ts` 的 `hudApi = { ...hudStore, getInitialState: hudStore.getState }`，`useHud` 走它 |
| **#105** | 實跑 `python3 tools/status/gen_status.py --check` → **EXIT=0**，「OK — 286 tasks」。83 筆落後已消失 |
| **#126** | `87cf2891`；`MatchEndPanel.tsx` 現在有 6 處 `lives` |
| **#129** | `sim/effects/championForm.ts` 已在 registry；**23 份 ability doc** 用 `kind:"championForm"` |
| **#150** | `input/GamepadInput.ts:100-109` 明寫「`range × abilityRange` 從技能自己的 range × 出貨 combat-env 係數推導」 |
| **#174** | `efd7c589`「鑄技工坊的『試放』真的放得出去」；`PreviewController.mount()` 現在**刻意**是空的（檔頭 :21「不是一個待辦」），要畫面的走 Babylon 那一支 |
| **#213** | `godie-e00s` **已在** `data/curation/whitelist.json` |
| **#216** | `1a968814`；`modelFacing.test.ts` 改成窮舉互斥普查，下界換成從語料推導的等式，3 個洞具名進 `FACING_UNVERIFIED` |
| ~~#222~~（**已關**，留此註記備查） | `1a968814`；w3x 真值（`I01N` → `A110` data.1=3.0 / data.2=50.0）已挖出並寫進 `critStrike.ts` ③-d + 卡片 authoringNote。⭐ 第〇·六守則階梯：owner 2026-08-01 親手重寫的卡面（第 1 層）贏過 w3x 欄位（第 5 層）⇒ **維持 6%/10 倍**，考古已留檔，⛔ 不需要再解一次 `war3map.w3t` |


---

## 🗑 OBSOLETE —— 19 張（前提已不存在，⭐ 這一輪的預設傾向）

| 票 | 為什麼前提死了 |
|---|---|
| **#22** | 票要「maxHealth 倍率 **4→3**」。今天 `combat-env.json` 是 **6.0** —— owner 自己把它改過 4→3→6→9→6，票面數字已經是**四代前**的。初始 HP 那半也已被五級距 + 系統倍率改版（#532–#534）整條取代 |
| **#49** | 「五支變身大招仍是 `[80,120,160]` 佔位」—— 逐檔量：`ofar.r`/`umal.r` 已是 `kind:"championForm"`，`o02l.r`/`u00l.r` 已是 `damageTier`。**一個字面佔位都不剩**（`ubal.r` 變成空 effects，歸 #243） |
| **#50** | 「召喚型技能沒有模擬器原語」—— `effectRegistry.ts` 今天 40 個 kind，`summon` 在裡面（`summon.ts` + `summon.test.ts` + `summonTargeting.test.ts` + `summonRules.ts`）。殘留＝內容採用，歸 #243 |
| **#51** | 「`[80,120,160,200]` 佔位」—— `emns.q`（死神之眼）已是 `applyStatus curse + missChance 0.5`；`u00k.w` 是空 effects（歸 #243）。佔位不存在 |
| **#53** | 票的比較基準（「11 支 EX 偏離 curated marquee」）已被 #445/#446/#447/#465 的**五級距整批重定**沖掉。`e008.ex` 現值 cooldown `[60]` / manaCost `[0]`，與票面 `[60]/[800]` 已不同 |
| **#55** | DoT 原語已落地：`sim/effects/dot.ts` + `dotTick.ts` 在 registry，**5 份內容已採用** |
| **#57** | 同 #50 |
| **#58** | `invulnerable` 已是 registry kind（`invulnerable.ts` + `invulnerable.test.ts`），**10 份內容採用**；`expand.ts:225` `invulnerable: { p: 3, available: true }` |
| **#59** | `knockback` 已是 registry kind（`knockback.ts` + `knockbackLimits.ts`），**10 份內容採用**；`expand.ts:203` 已翻 `available: true` |
| **#60** | 來源文件 `docs/_kit-fidelity-audit-247.md` **已不存在**；114 個核取方塊的母體（51 位 / 674 支）也不存在（今天 49 / 420）。live 殘留＝**#243**（97 支零效果）＋ `noOpModifierClaims.test.ts` 這道活守衛 |
| **#66** | 「16 支 `name:"none"`」—— 今天 `content/abilities/` 裡 `name == "none"` 的是 **0 支**；票點名的 `u01q` / `h02n` / `e00u` / `u01f` 四位已移 `_legacy` |
| **#111** | 「gunshot 音效結構上無主」—— `godie-hlgr`（鋼彈-煌，唯一帶 `gun` tag 的英雄）**已不在 `content/champions/`**；今天全出貨樹 **0 位**英雄帶 gun tag ⇒ 帳本沒有東西可以無主 |
| **#137** | ⚠️ 見 PARTIAL（仍活著，但要的是「放寬稽核」不是改名） |
| **#140** | 「`summon: { available: false }`」—— `expand.ts` 今天的表裡 `summon` 已不在 false 那一邊；`combo` 是唯一還誠實 false 的 |
| **#142** | 「批次 0 的四條分支未合」—— 四條 tip 仍停在 2026-07-26，落後 main 約 **500** 個 commit。main 已用完全不同的形狀重建過那四塊（`FireRingSystem` / 面向 / round-end）⇒ 這些分支的內容是死的，不是待合的 |
| **#163** | 同 #142（同一組分支的第二張票） |
| **#176** | 「莉娜 int 127 / manaRegen 1000，**而且她還在可選名單上**」—— `godie-h020` **不在** `whitelist.json`。owner 常設：「沒有上架英雄的 issue 就關閉」 |
| **#196** | 「[下一版] 鑄技工坊：變身技能」—— 擋住它的 Pattern A 已落地（#129，`sim/effects/championForm.ts` + 23 支採用）。它列的每一個子項都自己有票（#131 #132 #135 #208 #209 #214 #392）⇒ 傘票沒有殘餘 |
| **#225** | 「`CAPSTONE_ROUND_GATE = 6` 但實打每場只有 5–6 回合」—— 今天 `PairedDuels.FINAL_ROUND = 10`（#126 body 逐行驗過、`royale.test.ts` 釘死），第 6 回合現在是**中段**不是最後一回合 ⇒ 頂點路線不再是死內容 |
| **#245** | owner 2026-07-30 那五件裁決的落地清單。命名層（①）已由 `docs/legacy/_w3x-fidelity-superseded.md` + #414/#447 的產生器承接；下架的三位測試英雄（`u01q`/`h02n`/`e00u`）已移 `_legacy`；草泥馬編號已定案。⇒ 五件的載體都換了 |

---

## 🔧 PARTIAL —— 112 張（仍活著，逐張寫「**剩下什麼**」）

### A. 我逐一量過、確認缺口原封不動（41 張）

| 票 | ⛔ 剩下的**具體**那一格 |
|---|---|
| #14 | `apps/client/src/ui/hud/` 全樹 grep `rankScore`/`回合分數`/`myRank` **零命中**。戰鬥中即時分數/排名一格都沒有 |
| #35 | `tools/model-budget/emit_report.ts:266` 仍逐字寫著「a #99 enhancement, **not in a new row**」 |
| #38 | 全 `apps/client/src/vfx/` 無實體碎塊模組（只有 blood / whirlwind / hitSpark） |
| #41 | `audio/combatSfx.ts` 無任何 `hit-light`/`hit-medium`/`hit-heavy` 呼叫端 —— 素材與 audio-map 早就在，缺的仍只是**接線** |
| #42 | `vfx/CombatPostFx.ts` 仍只有 vignette 一個通道，無 dim/desaturate |
| #43 | `render/combatFeedback.ts:441` `resolveVictimFlash` 仍不讀 `profile.isBlock`（`isBlock` 只在 `:465` 進 plan） |
| #44 | ⭐ **只做完一半**：`9d703053` 修了拖尾（`SHIPPED_TRAIL_LIFE` 0.3→0.24 + 從 `RIBBON_FADE_BUDGET_SEC` 推導的守衛）；命中煙 `vfxPresets.ts:643` 仍是 `{min:0.4, max:0.6}`，`IMPACT_TUNING` 仍**沒有** smoke 壽命分級欄位。commit message 自己標「#44 只做完一半」 |
| #45 / #151 | `autoAttackCensus.test.ts` 的 `RATE_FLOOR = 0.5` 與債務清單原封不動；票 body 的 A/B/C 三個修法一個都沒落地 |
| #54 | `apps/admin/src/combatEnv.ts:424`「ALWAYS the complete table (PUT-replace semantics)」+ game-server `{...content, ...admin}` 原封不動。⚠️ 線上有沒有存過 override 我**沒查**（禁止連線） |
| #56 | `docs/_castability-128.md` 與 `content/assets/model-budget/report.json` 仍在版控、仍由測試重生（本 session 開始時 `git status` 就掛著 `M content/assets/model-budget/report.json`） |
| #61 | `schema/ability.ts` 仍無 `attachedModels` / `missile` / `beam` 欄位（`.strict()`） |
| #62 | `vfxKey: null` 仍是 **0 份**（342 `fx.prim.*` / 42 具名 / 37 無欄位）。母體 673→420 |
| #64 | `tools/w3x-import/*.py` 全部無 `EnableTrigger` 遞移追蹤 |
| #65 | `content/assets/textures/particles/wc3/` 仍只有 **8 個 PNG** |
| #67 | 描述提到迴避/閃避卻無 `evasion` modifier 的**剩 4 支**（`hvsh.w` / `u00l.w` / `u00j.passive` / `umal.w`），票面 6 支 |
| #68 | `godie-orkn.passive` 仍 `castType:"ground"` 且**無** `radius` / `radiusTier` |
| #69 | **893** 個 `.hash`（票面 877）＋ **8** 份 `audio-manifests`（票面 7）仍在出貨樹 —— 比票寫的時候更多 |
| #71 | `audio/victoryTaunt.ts:313` 仍走 `fetchJson(VICTORY_TAUNTS_PATH)`，沒改讀 registry |
| #72 | `content/assets/audio/voices/names/godie-e00j.name.mp3` 仍不在磁碟 |
| #74 | `_separation-qc-gate.json` 仍**無任何程式消費者** |
| #77 | `voice-separation-audition.html` 工作區 0 命中（P6 仍是不可執行的阻塞閘） |
| #81 | `nginx.conf:255` / `:347` 仍只有 `frame-ancestors 'none'`，全庫無 `default-src`/`script-src` |
| #82 | `ui/platform/session.ts:33/46` 仍把 token pair 寫進 `localStorage` |
| #84 | `httpx/middleware.go:72` 仍是「有 `X-Real-Ip` 就直接回傳」，`:75` 的 `RemoteAddr` 是 fallback 不是信任閘 |
| #87 | `cmd/platform/main.go:94` 仍只有 `ReadHeaderTimeout`，Read/Write/Idle/MaxHeaderBytes 全缺 |
| #89 | `auth/middleware.go` 的 `BearerToken` 仍無條件 `return r.URL.Query().Get("token")` |
| #90 | `apps/client/vite.config.ts` 與 `apps/admin/vite.config.ts` 全檔**無** `realpath` |
| #91 | `contentBus.ts:94` 的 `CONTENT_KINDS` 仍是 `["curation","combat-env","server-ops"]`，不含 `content-overlay` |
| #96 / #128 | `voxelSkin/paint.ts` 全檔 `faceColors` **0 命中**。`d6640d2a` 只補了呼叫縫，⛔ 畫筆那一層沒動 |
| #101 | 全 repo `roundSettlement` **0 命中** —— 中場戰報卡仍自算 |
| #103 | `content/abilities/` 帶 `descriptionRoles` 的仍是 **0 份**。`c364cdb2` 只補了「落地時不會撞壞 #125」的正則，commit 自己寫「⇒ #103 回 PARTIAL」 |
| #104 | `MatchRoom.ts` / `protocol/schema.ts` 無 seat `locked` 旗標 |
| #106 | `apps/admin/src/ui/App.tsx` 的 NAV 仍無「需求狀態」動態頁 |
| #108 | `data/history/` **仍不存在**；`data/replays/*.jsonl` 已 140 個但整條結算→M幣→水晶迴圈仍無執行證據 |
| #116 | S12 方向（伺服器放行 → client 必須有接）仍**零守衛** |
| #136 | `content/abilities/godie-ogld.passive.json` 仍不存在 —— ⚠️ 而且 `godie-ogld.w.json` **今天也不見了**（只剩 q/e/r/ex），`audit_hero` 的缺口比票寫的更大 |
| #148 | `tools/deploy/ggd-assets.sh:80-82` 的 `bytes_of()` 一個字都沒改（`2>/dev/null` 仍吞 EACCES） |
| #156 | `ui/WorldAnchorLayer.tsx:246` 仍是 `makeChampionNode(anchor.name, teamCss(anchor.teamId), …)`，`anchor.color` 仍被丟掉 |
| #157 | `guardiansSlain` / `guardianDamage` 全 repo **0 命中** |
| #158 | `docs/kill-bounty.md:1` 仍自稱 “final spec”，無 superseded 標記 |
| #243 | ⭐ **不但沒好，還變大了**：今天 `content/abilities/` 420 份裡 **97 份**（23.1%）遞迴掃 `effects`/`passive`/`hooks`/`modifiers` 一個效果都沒有（票寫的是 46/696 = 6.6%）。清單見附錄 |
| #280 | client 全樹無 `pickAllyAt` / `nearestAlly` / `allyUnits` —— 送不出友方目標的那條路仍是斷的 |
| #281 | `abilitySystem.ts:359-363` 的 `skillshot` 分支仍只寫 `direction`，`targets` 仍是空陣列 |

### B. 前提部分改變、缺口收窄（19 張）

| 票 | 已經被順手做掉的 | ⛔ 還剩什麼 |
|---|---|---|
| #19 | 王的召喚門檻與「火圈延後」已進 `arena-rules.json` / `config.ts:504`（`seconds added to combatMaxSec each time a king spawns`） | 王的**專屬外觀**（全黑身體 + 紫色光芒）與**明顯的任務提示** |
| #30 | 鑄技工坊試放已落地（`efd7c589`） | `edge.Dockerfile:108` 仍 `GGD_INCLUDE_EDITOR="0"`、`editor/src/api/client.ts:29` 仍 `WRITES_ENABLED = isDevBuild()` |
| #34 | 共用 `imported.heroichigo` 的第二位 `godie-h01o`（卍解）**已不在白名單** ⇒ 影響面減半 | `strip_geoset_prims.py` 的 JOBS 仍無 heroichigo；`godie-h01n` 仍上架且仍兩套身體同時畫 |
| #39 | `ambient-vfx.json` 的 bindings 9 → **11**（新增 `godie-e00x` / `godie-u01u`，而且開始出現 id-keyed 而非 model-keyed 的條目） | 仍是**綁定表**不是攻擊事件觸發；覆蓋率相對 49 位出貨英雄仍極低 |
| #73 | `.wav` 已 **0 個**（轉檔完成） | `GENERATE.sh` 仍留 WAV 字樣；decode 端 gapless 仍無守衛 |
| #78 | 前置（`leapStart` / `knockdown` 事件）確實都在 | `audio/contextualVoice.ts` 仍無 `jump` / `knockdown` case |
| #79 | — | `protocol/schema.ts` 仍無 `POISONED`/`BLINDED`/`CONFUSED`/`PARALYZED` 位元（⚠️ `ENTITY_FLAG` 已加寬到 uint32，剩 11 格，做得起來了） |
| #88 | `nginx.conf:99/513/527` 已有 `limit_conn_zone` + `limit_conn wsconn 20` | `lobby/hub.go` 仍無 per-account 連線上限、無 `SetReadLimit`/deadline |
| #94 | `d6640d2a` 讓 client 與後台縮圖收得下條碼，快取鍵跟著條碼走 | ⭐ 呼叫端（`ChampionView` / `VoxelSkinSheetPage` / `ContentDb`）**沒有人把條碼取出來餵進去** —— 執行期仍沒有資料路徑（commit 自己這樣寫） |
| #102 | 那 5 條 game-server 項目確實都做完了 | `docs/todo/security.md` 仍有 **8 處** `in-progress`（文件停更）；#84 的 X-Real-Ip 仍真的開著 |
| #122 | `d6640d2a` 修掉檔頭兩條假指令、後台補上 sim 健康卡 | 線上那筆 tick 健康度資料仍**沒有人讀過**（owner-only，第二層 2-A/2-B/2-C 仍卡著） |
| #131 | `content/vfx/fx.w3x.orb.*` 10 → **40**；ambient bindings 9 → 11 | F1 的 14 筆第二形態附掛仍一筆都沒綁（歸 #392 一起做） |
| #137 | 考古已完備（`EX_MAP.json:102` 的 A0Z5 原名就是「59-001 完全暴走」，59-002 已屬 A0GE） | ⭐ 正解是**放寬 `audit_hero.py` 第 5 列**，⛔ 不是改名 —— owner #245 已裁定「**編號**是 JASS join key，不可浮動」。這一條可以自己做，不需要裁決 |
| #143 | — | `sim/mobs.ts` 仍無 `world.stats.set`；⚠️ 而 #273 ② owner 已裁定「給殭屍建 StatsComp」⇒ **裁決未落地**，不是「分支未合」 |
| #166 | ⭐ `configForms.ts:3475` 已有「手把手感 (config/gamepad)」整頁（`69306fc0`，五個常數落三住處） | **按鍵對應**（`GamepadInput.ts:130-137` 的 `SLOT_BY_BUTTON`）與**連殺 combo** 仍是編譯期常數 |
| #172 | — | `_voxel-barcodes.json` 仍只有 **3** 筆（含 1 個 placeholder）、`config/voxel-barcodes.json` 的 overlay 仍 **0** 筆；母體 116 → 69 |
| #185 | `spendMana.ts:102` / `toggle.ts:143` 已 `Math.max(0, …)` | ⭐ **新線索**：`effects/manaBarrier.ts:179` 的 `hp.mana -= absorbed / perMana` **沒有夾** —— 魔力護盾吸收超過現有魔力就會是負的，這正好解釋票裡的 `-344 / 825` |
| #200 | ⭐ 壽命那一半已達標：`content/vfx/*.json` **0 份** `lifetimeSec > 3`（票寫 30 份、最長 8 秒） | 粒子密度 ×5 那一半（含 `MAX_FRONT_LOAD_BURST = 80` 的夾子）未驗證有後台欄位 |
| #224 | `0557ef47`「替身徽章不再承諾一個不會發生的身體」 | 上架 SOP 仍缺「新英雄不可以只用替身」的閘；母體已從 53/42 變成 49 位 |

### C. owner 立案的功能票，仍未開工（21 張）

⛔ 這些**不是**考古問題 —— 前提全部是 owner 自己的話，⛔ 不會過期：
**#20**（mini dota 拆塔即勝，`arena-rules.json` 無對應欄位）·
**#144**（作弊碼不算分，全 repo 無 `cheatUsed`）·
**#153 #154 #155**（守護者五張臉 / 樹人三件式）·
**#161**（賞金可見性：`matchStats.ts` 無 `bountyGold` 欄）·
**#162**（enemy-team 侵入下緣 6px：`hudLayout.ts:277-281` 幾何原值仍在）·
**#165**（逐隻執行時視覺驗收）·
**#167**（9 頁後台仍被 `App.tsx:492` 的裸 DEV 閘折掉）·
**#169**（comms/ping 輪盤：client 無 `commsWheel`/`pingWheel`）·
**#171**（`voice-spatial-audition.html` 在 admin 仍無入口）·
**#173**（`loader.ts:173` `validateReferences` 仍早於 `registerAll`）·
**#175**（`critDamage` 仍是 **69 份全部 1.75**、`zombiex.critChance` 仍 0.05）·
**#177**（`huth` 12 / `u00k` 8 仍在白名單上；⭐ 四隻裡的 `o02o`/`u01f` 已移 legacy，`b340e52d` 只做了「核准畫面看得見」）·
**#178**（`statDisplay.ts:69` 護甲仍 `num1` 無下限）·
**#183 #184**（實打回報的兩個 bug，未定位）·
**#194**（`MobSystem.ts:240` 註解仍自陳小怪無 `AbilitiesComp`）·
**#197**（`ai/kiting.ts` **已不存在**，只剩 `kiting.test.ts` ⇒ R1 的根因位置要重新定位再說）·
**#204 #206 #207 #208 #209 #214 #215**（owner 的新需求，逐項未開工；#206 的 `lastHitMode` 欄位已在 `config.ts:1914`，缺的是 §4 兩格與 §2 模式欄）·
**#230**（`mobWaves.ts:394` 的 `special.chancePercent` 仍缺 `max` 上界）·
**#231 #242**（分析題；#242 的「零剔除」根因仍在 `net/snapshot.ts:325`）

### D. 傘票 / 計畫票（4 張）

**#244**（JASS 模板總類表 —— `docs/ability-templates.md` 與 `JASS_BEHAVIOR.json` 都還在，`ec5196d0` 只做了屬性那一段）·
**#273**（v2 詞彙表七件裁決，②「殭屍 StatsComp」與 #143 是同一件）·
**#278**（ABCD 13 批）·
**#283**（`castabilitySweep.test.ts` 檔頭仍寫「dummy ally … ally spells → the adjacent ally」＝仍是手刻，#280 修完才驗得了）

### E. 其餘（20 張）—— 我做了一輪 grep，缺口成立但未深挖
**#76 #77 #102 #107 #117 #119 #121 #127 #132 #135 #146 #147 #160 #164 #248 #62 #64 #65 #74 #237**

⚠️ 其中兩張要特別記：
- **#147**：`godie-e00w.passive` 的 effects 今天是**空陣列** ⇒ 三條 JASS 衝突裡的 A0JD 不但沒修，那支技能整個變成 #243 的一員
- **#237**：`git worktree list` 今天只剩 **1 棵**（`.claude/worktrees/hero-stat-tiers`）+ 2 棵 prunable，48 棵的稽核母體已不存在 ⇒ 下一輪可以直接 OBSOLETE

---

## 附錄 —— #243 今天的 97 支零效果技能（母體 420）

```
e001.ex e002.passive e008.ex e008.passive e008.r emns.w etyr.e etyr.r hapm.passive
hart.ex hgam.e hgam.q hgam.r hjai.w hpb1.ex hpb1.q huth.e huth.ex huth.q hvsh.ex
hvsh.q hvsh.r hvsh.w hvwd.e hvwd.q hvwd.w n003.q n003.r n00b.ex n00b.q n00b.w
nsjs.ex nsjs.q nsjs.r o00k.e o00k.ex o00k.q o00l.ex o00l.r o00l.w o02p.e o02p.q
ofar.ex ofar.q ogld.e ogld.q ogld.r ogld.w ogrh.ex ogrh.q orkn.e orkn.w osam.e
osam.ex osam.q osam.r osam.w u00h.ex u00h.r u00h.w u00j.e u00j.ex u00j.r u00j.w
u00k.e u00k.ex u00k.q u00k.r u00k.w u00l.q u00n.ex u00v.e u00v.ex u00v.q ubal.e
ubal.ex ubal.q ubal.r ubal.w ucrl.e ucrl.ex udea.ex udea.w udre.q udre.r udre.w
umal.e umal.ex umal.q umal.w uvng.e uvng.ex uvng.r zombiex.e zombiex.ex zombiex.q zombiex.r
```

⭐ 這張表同時是 #50 / #51 / #55 / #57 / #58 / #59 / #60 判 OBSOLETE 的**代價說明**：
那六張票各自要的**機制**都做完了，沒做完的是**內容**，而內容的帳只有 #243 這一本。
⛔ 關掉那六張的同時，#243 的優先序要往上提，否則等於把 97 支啞技能的帳一起關掉。

# 舊票清理 C1 —— #300–#799 逐票判定（唯讀）

> lane C1 · 2026-08-23 · HEAD `522e7aa3`（v0.25.7）
> ⛔ **這一輪一次 gh 寫入都沒有做**（併行 lane 硬規則）。下面第 §4 節是給主 session 的可執行清單。
> ⭐ 判準：「做完了」必須拿得出**證據**（commit / 檔:行 / 測試名）。「看起來應該做完了」⛔ 不算。

---

## §0 母體

| | 數 |
|---|---:|
| open issue 總數 | **163** |
| ⭐ **在範圍內 #300–#799** | **55** |
| 延伸舊票 `< #300` | **108** |
| `> #799` | 0 |

⇒ owner 的範圍是 55 張。下面 §1–§3 逐張給判定與證據；§5 處理那 108 張延伸舊票。

---

## §1 判定總表（55 張）

| 判定 | 張數 | 意思 |
|---|---:|---|
| ✅ **CLOSE-DONE** | **11** | 拿得出 commit / 檔:行 / 測試名 |
| 🟡 **CLOSE + 開新票** | **3** | 交付物（報告／裁決）已到位，但**執行**是另一件事 |
| ⛔ **KEEP** | **41** | 今天實測仍然成立（多數帶**新的量測**，比原票更嚴重） |
| 🔁 重複 | 0 | 沒有找到真重複（#509/#511 是 #502 的子票，⛔ 不是重複） |

---

## §2 ✅ CLOSE-DONE（11 張，逐張帶證據）

| # | 標題（節錄） | 證據（⛔ 不是印象） |
|---|---|---|
| **#610** | 空氣漫反射（可開關） | `apps/client/src/render/airScatter.ts`（`AIR_SCATTER_MAX_LEVEL` 從 `ADAPTIVE_LADDER` **推導**）· `apps/client/src/settings/types.ts:53` `AirScatterSetting = "off"｜"auto"｜"on"` · `ui/SettingsScreen.tsx:453` · `render/QualityController.ts:175 airScatterEnabled()`。三個逐字約束逐條對得上 |
| **#615** | 系統倍率四格 | `content/config/config.match.json` `progression.heroStartLevel = 6` · `content/config/base-bonus.json` `maxHealth = 1200` · `mr = 25` · `content/config/combat-env.json` `multipliers.maxHealth = 12` · `content/config/owner-knobs.json` 逐字 quote 已登記（`ownerKnobs.test.ts` 在守） |
| **#617** | 衝擊波環：亮度↓ 速度↑ | 六格全在 `content/config/vfx-families.json`（`impactRingAlpha/Radius/Life/FadePow/MaxLifeSec/TierSpeed`）＋ admin `apps/admin/src/vfxForge.ts:278/340/462`（上下界＋順序＋中文標籤）＋守衛 `apps/client/src/vfx/impactRing.test.ts` |
| **#618** | 部署磁碟閘看錯碟 | `scripts/host-deploy.sh:158-192` —— 逐路徑量 `DockerRootDir` / `/var/lib/containerd` / `/var/lib/docker` / repo，**取最緊的那一顆**並在訊息裡指名（`TIGHT_PATH`）；`docker image prune -f` 已加 |
| **#619** | 練習面板「設成 X」給 X+5 | commit `640481c0`（2026-08-23）；⭐ 斷言**一個字都沒動**就轉綠 = 它是回歸的證據 |
| **#620** | 60 條殭屍血條每幀重跑 React | commit `23987cd2`；守衛 `apps/client/src/ui/hud/mobBarNoReconcile.test.ts`（`React.Profiler` **數 commit**） |
| **#621** | 上線成本逐段量測 | `tools/parallel-gates/run.mjs`（LPT、⛔ 不 fail-fast）＋ 時間帳本 `docs/_data/gate-timings.json`（累積）。⭐ 票的交付物是**量測與結論**，兩者都在 |
| **#622** | LV6 登場只有 1 點技能點 | 守衛 `packages/shared/src/sim/spawnLevelPoints.test.ts`（⭐ 拿「真的從 LV1 打到 LV6」當參照組，⛔ 不抄 `5`）；`shipGateScript.test.ts` 已從 4 條長到 6 條 |
| **#614** | [緊急] 第一回合就 lag | owner 逐字「**請你預設關閉**」已落地：`content/config/vfx-families.json` `castArcs = false` · `content/config/world-cues.json` `point.mobSpawn.enabled = false`。⚠️ 見 §3 的但書 |
| **#600** | 變身態合法用別人的資產 | owner 2026-08-23 逐字裁決「拳四郎那一格**是對的**（惡搞變身大型皮卡丘）」⇒ 原票的主張作廢。剩下的「跨英雄資產解析守衛」是**另一個問題** ⇒ 見 §3 新票 N-3 |
| **#601** | 拆檔可行性 | 報告 `docs/_reports/拆檔可行性_temp_20260823-0210.md` 已交付。⭐ 結論「87% 的阻塞是調度不是佈局」與「⛔ GameApp.ts / MatchController.ts 不要拆」都是**量到的** ⇒ 見 §3 新票 N-4/N-5 |

⚠️ **#614 的但書（⛔ 主 session 決定要不要現在關）**：兩個嫌疑犯是**推理出來的**，⛔ 不是量到的兇手；
而 **#620 才是量到的那個**（60 條血條每幀 reconcile）。
⇒ ⭐ 建議：**等 owner 確認「第七回合不卡了」再關**。在此之前它是唯一一張 owner 標 [緊急] 的票。
下面 §4 把 #614 放在「等確認」那一組，⛔ 不放在自動關閉那一組。

---

## §3 🟡 CLOSE + 開新票（3 張）

| 關掉的 | 為什麼可以關 | ⭐ 要開的新票 |
|---|---|---|
| **#599** 變身態退場**建議報告** | 交付物是報告，兩份都在：`docs/_reports/579_temp_20260823-0106.md` · `M2-M5_temp_20260823-0254.md`。owner 2026-08-23 已核准「照你提的逐對建議做」 | **N-1**：逐對退場**執行**（🟢 9 對可退 · 🟡 6 對要先做技能組覆寫機制 · 🔴 4 對不退 · ⚪ 1 對兩邊都沒接）。⛔ 今天**一個變身態都還沒下架**，⭐ 那是這張新票的全部內容。⚠️ 兩份報告檔名帶 `_temp_`，7 天後會被 `temp-sweep` 搬走 ⇒ **改成永久名**再關票 |
| **#600** 拳四郎 modelKey | owner 裁決該格是刻意的 ⇒ 原票前提作廢 | **N-3**：⭐「同一位英雄的模型／語音／音效三種資產是不是指向同一位英雄」的**掃全樹守衛** —— 而且它要能與「變身態合法借用」共存。線索：#554 抓到過一個 `.upper()` 的 join bug |
| **#601** 拆檔可行性**分析** | 分析已交付且結論是「不要拆那兩個」 | **N-4**：`git worktree add` 派 lane（⭐ 幾分鐘、⛔ 不動一行出貨程式碼，解掉「0 衝突那一大類」的等待）<br>**N-5**：真的該拆的兩個 —— `apps/admin/src/configForms.ts`（4,978 行、真衝突 16.7%）與 `packages/shared/src/content/fieldAdoption.test.ts` 的 `EXEMPTIONS`（2,568 行的表穿著測試的衣服，真衝突 **32.1% 全場最高**） |

---

## §4 ⛔ KEEP（41 張）—— ⭐ 今天重新量過，多數比原票**更嚴重**

### 4-A ⭐ 三張「量完之後範圍變大」的（建議優先）

| # | 原票說的 | ⭐ 2026-08-23 實測 |
|---|---|---|
| **#397** | frieren / shiganshina 兩張圖的門是死的 | ⛔ **7 張宣告門的地圖裡有 6 張產出 0 個 gateGroup**。逐張數 `content/arenas/*.json` 的 `"gateGroup"`：只有 `arena.heavens-arena.json` 有（8 筆），frieren · shiganshina · holy-grail · infinity-castle · nazarick · world-tree **全部是 0**，而 7 張 map 各宣告 2 個 gateGroup（共 14 個宣告 → 產出 1 組）。`packages/shared/src/map/merge.ts:39 mergeWalls()` 仍然不知道 gate 的存在，`compile.ts:260-279` 的 `allSame` 因此為 false。⛔ **沒有任何守衛在比對「宣告 N 道門 ⇒ 產出 N 個 gateGroup」** |
| **#558 ③** | union 覆蓋率的閘管不到住在上一層的 schema | ⛔ **仍然是這樣，而盲區有 17 個檔 / 18 個 tag**。`packages/shared/src/content/schema/config/configUnionCoversDirectory.test.ts` 的 `tagsOnDisk()` 只 `readdirSync(DIR)`（= `schema/config/`）。住在上一層而宣告 `config.*@1` 的：`abilityVfxBindings` · `arenaPoolDoc` · `audioMixDoc` · `castApproachDoc` · `comboStrikesDoc` · `displacementDoc` · `iconStyleDoc` · `mapReportDoc` · `mapSpecDoc` · `mitigationDoc` · `ownerKnobsDoc` · `practiceDoc` · `rankingDoc` · `roundGrade` · `toggleAbilityDoc` · `vfx`(×2) · `victoryPodium`。⭐ **今天它們都在 union 裡（透過 import），所以線上是好的** —— 危險的是**下一個**在那一層新開檔的人：漏一行 union ⛔ 不會紅，而後果是 2026-08-02 那次「選人畫面空掉、網站看起來完全正常」四小時 |
| **#417** | 龍破斬 8.25 vs 6.0 | ⭐ **票裡舉的那一例已經修好了**（`godie-h020.e` 與 `godie-hjai.e` 今天都是 `radius 8.0`）。⛔ **但那一族沒有修**：把 421 份 `content/abilities/*.json` 依名稱前綴 `NN-NN` 分組 ⇒ **119 組有 ≥2 份文件，其中 44 組**在 `radius/range/cooldown/manaCost/*Tier/castTimeSec/maxRank/castType` 至少一欄不一致。⚠️ 部分屬於**變身態成對**（例 `godie-o00x` ↔ `godie-ogrh`）⇒ 守衛做出來時**先定義哪些欄位算數值**（票裡第 3 點）。⛔ 仍然沒有任何橫向守衛 |

### 4-B ⛔ 逐張複驗（其餘 38 張）

| # | 判定 | 今天量到的證據 |
|---|---|---|
| #325 | KEEP | `schema/arena.ts:59` 仍是 `z.array(zVec2).min(1)`（⛔ 沒有 `TEAM_SIZE` superRefine）；`MatchController.ts:2191` 兩個 `!` 原封不動 |
| #327 | KEEP | `import/packageSchema.ts`：`.strict()` **3** vs `.passthrough()` **19**（方向仍然反的）；`[token]` tokenizer ⛔ 不存在（全 `content/` 只有 `itemCardText.test.ts` 沾到邊） |
| #330 | KEEP（部分） | ⭐ 落地了一半：`ui/panels/roundReport.ts:436-441` 會在中場提示「N 點技能點還沒加」。⛔ 仍沒有：未學習格的視覺差異、⛔ 沒有「照 skillOrder 自動加點」的後台開關（票裡第 3 項，最接近根治的那個） |
| #348 | KEEP（⚠️ **升級**） | ⛔ 票裡寫「出貨的 `hiddenChampions` 是空陣列，所以今天不會發生」—— **今天不是空的**：`content/config/roster.json` 有 4 位（`godie-ogld` `godie-u00k` `godie-udea` `godie-zombiex`），而 `hiddenChampionsShipped.test.ts:80` 正在斷言它不可以是空的。⇒ ⭐ **票預測的情況現在是活的**，而那格開關仍然不存在 |
| #354 | KEEP | 已有 08-23 唯讀複驗留言：**事件 18 個做完了**（`WorldHookSystem.ts:236-343` 13 列），⛔ **Action 21 個一格都沒動** |
| #368 | KEEP | 全 `apps/client/src` grep 不到任何共用取尺函式（`normalizedHeight`/`uniformHeight`/`modelScaleFor` 皆 0 命中）⇒ 商店／英靈殿／選人各自一份 scale 的形狀沒變 |
| #372 | KEEP | 已有 08-23 複驗留言：vfx 那一半做完（`gen_spec.ts:83/88/732`），⛔ 但 `knobValueNotRestated.test.ts` 在 main 上**是紅的**（文件側 8 處未跟上） |
| #382 | KEEP | `tools/model-budget/baseline.json` 的 `accepted` 仍有 **13 筆 `vramBytes`**。票建議的「② 替地標開一個自己的 role」⛔ 沒做 |
| #401 | KEEP | `content/ability-templates/tpl-line-sweep.json` 的 **3 格 `inert` 原文還在**；`DELAYED_MAX_COUNT` 仍是 **32**（`sim/effects/kindLimits.ts`，`schema/effects/delayed.ts:43` 與 `templates/expand.ts:265` 都引用它） |
| #409 | KEEP | 已有 08-23 複驗留言：`pillarRing.ts` 參數化了（`87061c8c`）⛔ 但 `COLOSSEUM_PILLAR_RING.radius` 仍是 **2**（owner 08-20 已裁決「通道多好 因為跑才是重點」）。⛔ 還缺的具體一件：radius → 1.4 或 1.0 |
| #423 | KEEP | owner 08-19 已裁決（「跟殭屍一樣只是不會移動…有生命週期時限」）⇒ ⛔ **不是等裁決，是等實作**。實測 `content/{abilities,items,augments}` 用 `"kind":"summon"` 的文件 **0 份** |
| #425 | KEEP | 逐份重量，⛔ 一份都沒動：`wave.arcane`→`fx.prim.arcane.bolt`（與 `bolt.arcane`/`grail.projection-bolt`/`grail.tracking-bolt` 共用 4 份）· `wave.ki`/`wave.lightning`/`wave.void` 各與同名 `bolt.*` 共用 · `imported.wave`→`fx.thorn`（與 `thorne.e.thorn`）。乾淨的仍只有 earth/fire/ice/physical |
| #429 | KEEP | 制度缺口（回合結束清單），與 #560 同一族 ⇒ ⭐ 建議 **#429 收斂成 #560 的母票**，⛔ 不要兩張各做一半 |
| #441 | KEEP | 語音普查的三項（2 位無戰鬥語音包 · 11 類無觸發點 · `spatialPolicy` 零出貨引用）未見對應落地 |
| #443 | KEEP | 「原作 → CC0/CC-BY → 自己生成」這條優先序**在 repo 的任何 .md 裡都 grep 不到** ⇒ owner 的規則變更還沒被寫進任何一份會被讀到的文件（⚠️ 這正是「只活在留言裡等於不存在」） |
| #444 | KEEP | 場地半徑 24→24–42 之後「大 = R/4」的錨點作廢，未見重錨 |
| #448 | KEEP | 30-00 攝影機重做（標記→瞬移）未見實作 |
| #452 | KEEP | 13 張圖的 2D 背景：`content/arenas/*.json` 只有 9 處 `backdrop`，⛔ 不到 13 |
| #453 | KEEP | FATE 風格統一：圖示 prompt 已改，貼圖／地圖物件／場地背景待跟進 |
| #457 | KEEP | 產圖器 LoRA / SDXL 支援未見落地 |
| #473 | KEEP | admin 全樹 grep 不到「上架當下自動跑稽核」的入口（`onEnable`/`auditOnPublish` 皆 0 命中） |
| #502 | KEEP | epic。14 段全 partial · 106 缺口 · 5 blocker。⭐ ⛔ **不要關**，它是 #503–#511 的母票 |
| #509 | KEEP | K6 裸 div onClick：`MerchantShop.tsx:1392-1403` 與 `LobbyScreen.tsx:116-120` 的形狀未變 |
| #511 | KEEP | K8 `data-pad-back`：`StoreScreen.tsx:112-114`「太好了」· `MatchEndPanel.tsx:387-407` 收合鍵 · `LeaveSettlementOverlay.tsx:270`「繼續觀戰」皆未加 |
| #529 | KEEP | 89% 綁通用原型的形狀未變（見 #554 的重量） |
| #538 | KEEP | 共用「進商店預取大廳資料」的預載器未見 |
| #543 | KEEP | 已有 08-23 複驗留言：三支裡**世界終結只做在變身態 `godie-n01g.r` 上**，本體 `godie-n003.r` 的 `spawnModelFx` 與特效文字都是 **0** ⇒ 玩家選依文潔琳按下 42-04 看不到 |
| #547 | KEEP | 投射物／衝擊波的原作美術移植未見批次落地 |
| #554 | KEEP | ⭐ **重量：421 份 ability，有 `sfxKey` 的 72 份，缺 349 份**（票寫 348/420 ⇒ 一支都沒補）。白名單搬 JSON 那一半要另外驗 |
| #558 | KEEP | ①`ModelFxRig.dispose()` ②`E00S.glb` prim3/prim4 ③union 盲區（見 4-A） |
| #560 | KEEP | 兩份清單仍分開：`render/roundFxRegistry.ts`（5 項）vs `GameApp.dispose()`（20 幾項）。⛔ 沒有共用拆除清單、⛔ 沒有六計數器殘留守衛 |
| #561 | KEEP | `groundTextureCacheMax` **全 repo 只出現在一份 `_reports` 裡**，⛔ 不在 `content/config/`、⛔ 不在 Zod、⛔ 不在 admin ⇒ 三個住處零 |
| #563 | KEEP | owner 逐字「空陣列檢查要放在 **build 裡面硬卡關**」。實測 `packages/shared/scripts/buildIndexes.ts`（`content:build` 唯一入口）對 `isPassiveOnly` 是 **0 命中** ⇒ 交付的仍是**事後才紅的測試** `abilityPressPayload.test.ts`。⛔ 裁決沒落地 |
| #565 | KEEP | `schema/effects/spawnVfx.ts` 對 `bone` **0 命中**；擋住的 11 支未動 |
| #566 | KEEP | `packages/shared/src/content/refs.ts` 對 `persistentVfx` **0 命中**（`modelKey` 有 3 條 edge）⇒ ref edge 那個洞還在 |
| #588 | KEEP（部分） | ⭐ 「一個帳號一間房」**做完了**：`MatchRoom.ts:958 previousRoom.evictAccount(accountId)` + `:1013 evictAccount()` + 守衛 `apps/game-server/src/rooms/accountSingleRoom.test.ts`。⛔ **owner 追加的第 4 項沒做**：「進入戰鬥後房間硬上限 30 分鐘」—— `MatchRoom.ts` 與 `schema/config/match.ts` 都 grep 不到任何分鐘上限欄位 |
| #607 | KEEP | 已有 08-23 複驗留言：帶 `onArrive` 的節點 13 個，含 `spawnVfx`/`spawnModelFx` 的 **0** 個。⚠️ commit `99620510` 標題掛了 `(#607)` 但 body 四節沒有一節在做這張票（**票號掛錯，⛔ 不是做完忘了關**） |
| #611 | KEEP | `tools/editor-contract/gen_contract_numbers.py:61` 的 `BLOCKS` **仍含 `contract-env`**；`docs/技能編輯器引擎須知 20260811.md` §八「全域倍率」整章還在（`:91` 目錄、`:391`、`:822`、`:831-832`）。⭐ 暫時措施（章首貼 owner 裁決）已落地，⛔ 整章移除沒有 |
| #612 | KEEP | `package.json:86` 只有 `archetypes:build`，⛔ 沒有 `archetypes:check`；`skills:sync`（`:94`）含 `archetypes:build`，而 `skills:check` 問不到它是不是最新的 |
| #613 | KEEP | 假 tag `config.screen-cues@1` 仍活著（真的是 `config.screen-fx@1`，`content/config/screen-fx.json` 才是存在的那份）。⛔ **來源**：`packages/shared/src/content/editorCapabilities.ts:1554` · `schema/effects/screenFlash.ts:15,32` · `schema/effects/screenShake.ts:28`；⛔ **產物**：`docs/editor-contract/ggd-runtime-capabilities.{md:70,json:1121}` · `docs/技能標記機制與效果規則.md:2732,2768` · `docs/engine-atlas.json:980` · `content/editor-target-profile.json:1210`。⭐ 改**來源**再跑產生器，⛔ 不要手改產物 |
| #616 | KEEP | 三個「沒有閘」的缺口未見對應守衛（`packages/shared/src/ops/` 只有 `balanceAnchorDocHonest` / `statCapsFresh` 這一族） |

---

## §5 延伸舊票 `< #300`（108 張）—— ⛔ 這一輪**不建議批次關閉**

owner 逐字：「**延伸的舊票(<#300)可以修但盡量以註解關閉**有必要的話**開新票為主**」

⭐ 但「以註解關閉」的前提是**註解裡要有理由**，而理由要有證據 —— 108 張逐張查證超出這一輪的預算。
⇒ 我做了一個**機械的**篩：把 108 張的票號對 `git log --since=2026-08-01`（560 個 commit）的訊息比對。

| | 數 | 意思 |
|---|---:|---|
| 有 commit 明著引用它 | **12** | ⛔ **不要關** —— 它們是活的 |
| 沒有任何 commit 引用 | **96** | ⚠️ ⛔ **這不代表過期**，只代表「近三週沒人動」 |

**有 commit 引用的 12 張（⛔ 保留）**：#44 · #96 · #103 · #127 · #147 · #165 · #177 · #224 · #244 · #248 · #273 · #278

⇒ ⭐ **建議的做法**（給主 session）：⛔ 不要對那 96 張下批次 `gh issue close`。
正確的下一步是**再派一輪 C1'**，範圍縮成 `< #300`，用同一個判準（四選一 + 證據）跑一遍 ——
⛔ 沒有證據的關閉會把「缺陷埋進 issue 堆」，那正是第零守則⑧要擋的東西的反面。

⚠️ 例外：#278（技能 ABCD 補完）有 **41 個** commit 引用它，而 #273 最後一次是 **2026-08-05**。
⭐ 這兩張是 epic，值得先各自確認一次「它還有沒有未完成的子項」。

---

## §6 給主 session 的可執行清單（⛔ 我沒有跑任何一條）

### 6-A 直接可關（11 張 → ⚠️ 建議先關 10 張，#614 等 owner 確認）

```bash
gh issue close 610 --comment '✅ CLOSE-DONE（唯讀複驗 2026-08-23，HEAD 522e7aa3）
你的三個逐字約束逐條對得上：
· **可開關** → `apps/client/src/settings/types.ts:53` `AirScatterSetting = "off"|"auto"|"on"`（三態，⛔ 不是布林）＋ `ui/SettingsScreen.tsx:453` 畫面設定頁一格
· **只在規格高的環境** → `apps/client/src/render/airScatter.ts` 的 `AIR_SCATTER_MAX_LEVEL`，⭐ 從 `ADAPTIVE_LADDER` **推導**（⛔ 不是寫死階數），接在 `render/QualityController.ts:175 airScatterEnabled()`
· **增加質感（⛔ 不是玩法）** → 走 `scene.fog`（EXP2），sim 側零改動
⭐ 選型有量過並寫下否決 `VolumetricLightScatteringPostProcess` 的理由，⛔ 不是挑一個然後在註解裡辯護。'

gh issue close 615 --comment '✅ CLOSE-DONE（唯讀複驗 2026-08-23）
你的四格逐格落地，⛔ 全部是出貨值不是計畫：
· 英雄登場初始等級 6 → `content/config/config.match.json` `progression.heroStartLevel = 6`
· 生命 +1200 → `content/config/base-bonus.json` `bonus.maxHealth = 1200`
· 初始魔抗 +20% → 同檔 `bonus.mr = 25`（⚠️ `100/(100+25)=0.80` ⇒ 減傷 20%；算式寫在後台欄位說明裡，你一格就能改回 20）
· 生命倍率 ×12 → `content/config/combat-env.json` `multipliers.maxHealth = 12`
四格都登記在 `content/config/owner-knobs.json` 並帶你的逐字原話，`ownerKnobs.test.ts` 在守。
⛔ 仍然沒解的那一條（級距固定值 vs 血量隨等級成長 ⇒ LV99 要 49.5 發）**不是倍率能解的**，已另記。'

gh issue close 617 --comment '✅ CLOSE-DONE（唯讀複驗 2026-08-23）
你的兩則（「太亮太搶眼」＋「散開要夠快才有力量感、0.8 秒內、五級距越大越快」）落成六格後台旋鈕，三個住處齊全：
· 出貨值 `content/config/vfx-families.json`：`impactRingAlpha/Radius/Life/FadePow/MaxLifeSec/TierSpeed`
· 後台 `apps/admin/src/vfxForge.ts:278`（上下界）`:340`（順序）`:462`（中文標籤「衝擊波環亮度倍率」）
· 守衛 `apps/client/src/vfx/impactRing.test.ts`（走出貨的 `impactRecipe`，突變驗過）
⭐ 五級距門檻從 `config.damage-tiers` 解析（⛔ 客戶端不抄一份），全部轉回 1 = 逐位元組回到 08-23 之前。'

gh issue close 618 --comment '✅ CLOSE-DONE（唯讀複驗 2026-08-23）
`scripts/host-deploy.sh:158-192` 已經改成「⛔ 不要猜哪一顆」：逐路徑量 `DockerRootDir` · `/var/lib/containerd` · `/var/lib/docker` · repo 所在，**取最緊的那一顆**（`TIGHT_PATH`）並在 die 訊息裡指名它；另加 `docker image prune -f`（⛔ 不是 `-a`，那會刪掉回滾用的 `:prev`）。
⭐ 刻意**沒有**寫死 `/var/lib/containerd` —— 下一版 docker 換 store 位置時那一行就會變成第三次同型故障。'

gh issue close 619 --comment '✅ CLOSE-DONE — commit `640481c0`（2026-08-23）。
⭐ 修法是「跑一次**出貨的** `statRecomputeSystem`、量誤差、補回去」，⛔ 不是重算一份公式（那會是第二個住處）。
⭐ 而斷言**一個字都沒動**就轉綠，那正是它是回歸（⛔ 不是「測試抄了出貨值」）的證據。'

gh issue close 620 --comment '✅ CLOSE-DONE — commit `23987cd2`（2026-08-23）。
「第七回合」對得上 `content/config/arena-rules.json` 的 `mobWaves.schedule`（R7 `maxAlivePerZone` 30 × 2 區 = 60）。
修法拆兩層：React 只管名冊、rAF 直寫 DOM 管位置（用 `transform` ⛔ 不是 `left/top`）。
守衛 `apps/client/src/ui/hud/mobBarNoReconcile.test.ts` —— ⭐ 用 `React.Profiler` **數 commit**，⛔ 不只看 DOM（不然位置改直寫之後畫面一模一樣而測試照樣綠）。
⚠️ 這治的是**固定成本**那一半；你說的「累積」那一半另有票。'

gh issue close 621 --comment '✅ CLOSE-DONE（唯讀複驗 2026-08-23）
你要的兩樣都交了：
· **各單元花多少時間** → 時間帳本 `docs/_data/gate-timings.json`（累積，⛔ 不覆蓋）
· **如何減少** → `tools/parallel-gates/run.mjs`（LPT 最長優先、⛔ 不 fail-fast）把 `skills:check` 從 45.6s 壓到 20.1s（理論下界＝最慢那一支 20.06s）
⛔ 而分級 hotfix 的結論是**誠實的壞消息**：近 15 個 tag 區間 15/15 都是 T3，省不到一秒 —— 因為一次 push 送的是 6 條 lane 的 18 個 commit，其中一定有人動到 schema。
⭐ 真正的槓桿是「讓一批工作只含 config 改動」，而伺服器側的 T0/T1（`combat-env` / `base-bonus` 不需要重建映像）是實測過的。'

gh issue close 622 --comment '✅ CLOSE-DONE — 守衛 `packages/shared/src/sim/spawnLevelPoints.test.ts`。
⭐ 它拿「真的從 LV1 打到 LV6」當參照組，⛔ 不抄「5」這個數字 —— 你之後改成 LV10 或改每級點數，這條守衛自動跟上。
突變驗過：改回 `unspentPoints: 0` → 🔴 `expected +0 to be 5`。'

gh issue close 600 --comment '✅ CLOSE —— 這張票的前提被你 2026-08-23 的裁決推翻了。
> 拳四郎的變身態 modelKey 指到 imported.heropikachu => **這是對的，這是因為要惡搞他大絕招是變身大型皮卡丘**
⇒ ⛔ 那一格不改。⭐ 而它反而是更好的線索：變身態**可以合法**使用另一位英雄的資產 ⇒ 真正要問的是「變身態的資產會不會在**沒有變身**的時候也被解析到」。
那一題不是這張票（前提不同）⇒ 已另開 N-3 追。'

gh issue close 601 --comment '✅ CLOSE —— 分析已交付：`docs/_reports/拆檔可行性_temp_20260823-0210.md`。
⭐ 一句話：**87% 的阻塞是調度不是佈局**（`.claude/worktrees/` 48 個 per-lane worktree 全部閒置三週，而今天七條 lane 的 commit 全在主樹的 reflog 裡）。
⛔ 你點名的兩個檔量完是**不要拆**：`GameApp.ts`（4,041 行、今天真衝突 0/3）· `MatchController.ts`（4,767 行、尾段引用 27 個 private 成員）。
⭐ 真的該拆的兩個已另開票（N-5）。調度那一件另開 N-4。'
```

### 6-B 關掉但要**先改檔名**（1 張）

```bash
# ⚠️ 先把兩份報告從 _temp_ 改成永久名（7 天後 temp-sweep 會把它們搬走，而票裡指著它們）
#   docs/_reports/579_temp_20260823-0106.md      → docs/_reports/變身態退場建議-20260823.md
#   docs/_reports/M2-M5_temp_20260823-0254.md    → docs/_reports/變身態機制M1-M5-20260823.md
gh issue close 599 --comment '✅ CLOSE —— 交付物是**報告**，兩份都在（已改成永久名，⛔ 不會被 temp-sweep 搬走）：
`docs/_reports/變身態退場建議-20260823.md` · `docs/_reports/變身態機制M1-M5-20260823.md`
量到的：帶 `transform` 的英雄文件 40 份 = 20 對，真的觸發得到 19 對，⭐ **3D model 完全一樣的 15 對**。
你 08-23 已核准「照你提的逐對建議做」⇒ M1/M2/M5 三個機制已落地。
⛔ 但**一個變身態都還沒下架** —— 那是執行，已另開票（N-1）追，⛔ 不留在這張報告票裡。'
```

### 6-C ⚠️ 等 owner 一句話再關（1 張）

```
#614 [緊急] 第一回合就 lag
  · 你逐字說的「請你預設關閉」**已落地**：castArcs=false · world-cues.point.mobSpawn.enabled=false
  · ⛔ 但那兩個是**推理出來的嫌疑犯**，⛔ 不是量到的兇手；量到的那個是 #620（已修）
  · ⇒ 請 owner 回一句「第七回合不卡了」再關。⛔ 在此之前它是唯一一張 [緊急]
```

### 6-D 建議新開的 5 張票

| 代號 | 標題 | 為什麼是新票不是留在舊票 |
|---|---|---|
| **N-1** | 變身態**逐對退場執行**（🟢9 · 🟡6 · 🔴4 · ⚪1） | #599 的交付物是報告；執行是不同的工作與不同的驗收 |
| **N-2** | ⛔ 宣告 N 道門 ⇒ 產出 N 個 gateGroup 的**守衛** | #397 是「這兩張圖壞了」；⭐ 今天量到 **6/7 張圖**都是 0 ⇒ 缺的是**閘**不是修兩張圖 |
| **N-3** | 跨英雄資產誤配守衛（模型／語音／音效指向同一位英雄，⭐ 且要與「變身態合法借用」共存） | #600 的前提被 owner 推翻，這題的前提不同 |
| **N-4** | 派 lane 時 `git worktree add`（⭐ 幾分鐘、⛔ 不動出貨程式碼） | #601 是分析；這是它的第一個行動項，而且**與拆檔無關** |
| **N-5** | 拆 `apps/admin/src/configForms.ts`（4,978 行 · 真衝突 16.7%）＋ `fieldAdoption.test.ts` 的 `EXEMPTIONS`（2,568 行 · 真衝突 32.1%，全場最高） | 同上；⭐ 第二個**沒有人提過**（一張資料表穿著測試的衣服，第〇·四守則） |

⚠️ **N-2 建議合併進 #397 而不是新開** —— 如果主 session 覺得 #397 的 body 改得動的話。
⭐ 但**一定要改 body**（⛔ 不是留言）：只活在留言裡的更正等於不存在。

### 6-E 兩張建議合併

```
#429（回合結束沒清乾淨 —— 制度缺口）  ──合併進──►  #560（三個清理邊界 + 共用清單 + 殘留守衛）
理由：#560 的三個 checkbox 逐項涵蓋 #429 的兩半，而兩張各做一半就是 owner 說的「每次都偷懶」。
⛔ 合併時要把 #429 body 裡 owner 的那段逐字原話搬進 #560（⛔ 不要只留連結）。
```

---

## §7 這一輪最重要的一件事

⭐ **#558③ 的 union 盲區是 17 個檔 / 18 個 tag**，而它守的正是 2026-08-02 那次
「選人畫面整個空掉、而網站看起來完全正常」的四小時故障形狀 —— 而且 v0.24.8 前夕**又咬了一次**。

⛔ 今天線上是安全的（那 18 個 tag 都透過 import 進了 union）。
⚠️ **危險的是下一個人**：在 `packages/shared/src/content/schema/`（⛔ 不是 `schema/config/`）新開一個 config schema 而忘了 union 那一行 ⇒
`configUnionCoversDirectory.test.ts` 的 `tagsOnDisk()` 只 `readdirSync(schema/config/)` ⇒ **它看不見那個檔** ⇒ 一條都不會紅。

⇒ ⭐ 修法就是票裡寫的那一句：**改成從出貨內容推導** —— `content/config/*.json` 的每一個 `schema` tag 都必須在 union 裡。
那是「兩個名詞的**關係**」，⛔ 不是「這個資料夾裡的檔有沒有進 union」這種單一名詞。

# GGD Main ↔ Codex Editor：必要接縫結案收據

狀態：**Revision 10 — Main v0.35.4 已整合；只剩四個可重用積木／預設演出阻塞**

核對基準：`origin/main@d63214d78`（tag `v0.35.4`）

Main seam：已以 `--ff-only` 線性進入 `main`；來源 ref `origin/feat/editor-seam-20260902@608c4de02` 暫留供追溯

Editor：`feat/vfx-forge-codex`（禁止直接提交或推送 `main`）

最後核對：**2026-09-02 10:15（Asia/Taipei）**

## 結論

Editor 已抓取並整合 Main v0.35.4 的完整線性歷史，包括以下五個接縫 commits：

- `b54441df`：完整 `active/runtime-bundle` 與 effective VFX limit identity receipt；
- `cf40d5db`：`ggd-editor-contract-index@1` 唯一登錄表；
- `cbc70f5a`：穩定 `adapterId` 與 source adapter 非遠端命令入口證明；
- `4ec5e676`：補上 champion-slot PATCH 與 restore 的 generator-owned server guard。
- `5dc0eb92`：新增 `resolved-appearance@1` 與 `isStandIn`，讓共用替身不再靜默。

Editor 仍只在 `feat/vfx-forge-codex`；**不要把 Editor 提交直接推到 `main`**。

Main 目前只需修正下方四個可重用積木／預設 resolver；不需要替 Editor 拼任何技能、時間軸或完整特效。

## 不可越界的分工

Main 的責任是**做出積木**：可重用 runtime effect／hook／VFX primitive、模型與資產載入能力、
限制 resolver、schema、登錄表、寫入與匯入安全邊界。Main 不負責替 Editor 拼八招、調時間軸、挑色、
調鏡頭、做技能專用特效或反覆追肉眼分數。

Codex Editor 的責任是**用積木拼成品**：資源池與拖拉、效果模板成品、效果鏈、VFX script、時間軸、
CameraRig、所見即所得預覽、八招能力 fixture、視覺擷圖驗收、JSON／ZIP、人工批核頁與所有成品調整。

只有當 Editor 用現有 JSON vocabulary **無法表達一個可重用語意**時，才交 Main 一張最小 primitive 票；
票必須附缺少的 schema／runtime 行為、最小 failing fixture 與隔離測試，不能附「請做完整某某技能」。
Main 的驗收標準是該 primitive 可被任意技能重用；成品像不像原作仍由 Editor 驗收。

## 已驗證的機器接縫

1. `GET /api/v1/content-import/contract-index`
   - 真實列名是 `representations[].schema`，不是 `representation`；
   - 狀態接受 `supported | planned | unsupported`；只有 `supported` 能提供 modes；
   - Editor 以 RFC 8785 JCS 重新計算 index digest，並核對 profile digest；
   - `minEditorContractVersion` 高於 Editor 支援版本時立即 fail closed；
   - 未知 schema 一律 modes 空陣列、promotion forbidden。
2. `GET /api/v1/content-import/active/runtime-bundle`
   - Editor 重算每份 `hashDoc`、每個 `hashCollection`、count 與 `contentVersion`；
   - `activationDigest`、`packageDigest` 與 exact Base receipt 不一致即拒收；
   - 沒有 ACTIVE 時誠實回 404／G1／bootstrap-only，不造假解鎖 full 或 delta。
3. `effectiveVfxLimits`
   - 必須是 `ggd-effective-vfx-limits@1`，且具備 `limitProfileId`、
     `resolverFingerprint` 與八個實際生效值；
   - `maxOneShotEmitters: null` 代表 resolver 的 Infinity，不擅自改回 96。
4. Generator-owned 寫入
   - Main server guard 已涵蓋 `PATCH champions/:id/abilities/:slot` 與
     `POST :collection/:id/restore`；
   - source adapter 僅由 server 端登錄的 `adapterId` 選擇，client 不可傳 shell command；
   - Editor 寫 champion mirror 前仍會重新讀 ability 與 champion 的 `editor-source`；兩份都必須
     `writePolicy=document` 才送 PATCH。Editor 沒有呼叫 restore。
5. `resolved-appearance@1`
   - Editor 已用同一 resolver 解析 VFX Forge 施法者／目標與英雄 3D 預覽；
   - `isStandIn=true` 仍可用來除錯機制，但禁止擷取或送出人工批核視覺證據；
   - 候選證據附 `championId/modelKey/modelDocDigest/resolverFingerprint` 收據。

## 阻塞積木 1：缺省 yaw 不是實際生效值

`resolvedAppearance.ts` 目前以 `yawOffsetDeg: num(model.yawOffsetDeg, 0)` 處理缺值；但遊戲的權威
`glbYawOffset(doc)` 規則是：未填 override 時，`assets/models/imported/*` 與 Blizzard overlay 預設 **90°**，
native 預設 **0°**。因此新契約回的 0° 不是「實際生效值」。

出貨盤點：138 顆 imported model 中 136 顆未填 override；52 位出貨英雄受影響，包含 Saber、莉娜、佐助、
涅吉。Editor 若盲信新欄位，角色會相對遊戲側轉 90°。

請 Main 只修這個 reusable primitive：

1. 讓 resolved appearance 的有效 yaw 呼叫與遊戲相同的 family-default resolver；不得複製第二份 prefix 表。
2. 加一個 imported、未填 `yawOffsetDeg` 的測試，期望有效值 90°；再保留 native 0° 與顯式 override。
3. 如果欄位要保留「作者原值」語意，請另名為 `authoredYawOffsetDeg`，並新增明確的 `effectiveYawOffsetDeg`；
   不要讓名為 resolved 的契約回 raw fallback。

修正前 Editor 仍呼叫遊戲既有 `glbYawOffset(doc)` 畫方向，只使用 resolver 其餘正確欄位，避免自行發明規則。

## 阻塞積木 2：需要一次只畫一弧的斬擊 primitive

Owner 的一般近戰模板原則是「一個角色攻擊動作＋一個夠大的主斬弧」；只有九頭龍閃／三千世界這類
明確的極速連斬，才組合多個小型、分時單弧。

Main 現有所有 `fx.prim.*.slash*` 都是同一形狀：`mode:"burst"`、`burstCount:26`、
`texture:assets/textures/particles/slash_01.png`。因此 Editor 即使只放一個 segment，實際也會形成 26 個
月牙的扇形；縮小、降 alpha 或把兩個 segment 刪成一個都不能滿足上述語意。`imported.crescent` 也不能
代替：既有真機報告已證明它會露出不透明白卡。

請 Main 只提供一顆可重用積木，不要替 Editor 拼技能：

1. 新增一次只畫一個斬弧的 VFX primitive（建議穩定家族／ID 語意為 `single-arc`），可由 segment 既有
   `w3xScale`、`tint`、`alpha`、`facingDeg`、`pitchDeg`、`flyHeight` 覆寫；
2. 它必須通過既有透明背景、出生可見性、VFX budget 與實際 blend-mode framebuffer 守衛；
3. 加一個隔離測試證明一次 trigger 只建立一個弧形主體，而不是 26 個 sprite；
4. 若 Main 想沿用 `slash_01.png`，請新增單發 primitive，不能改壞目前可能刻意需要 26 發的舊 ID。

修正前 Editor 已把普通斬擊模板改成「角色攻擊動畫＋單次命中光」，並以
`MULTI_CRESCENT_BRICK` 阻擋上述舊 slash primitive；積木到位後只需替換一個 recipe helper，八招與玩家技能
都會共用，不需要 Main 調任何一招的時間軸、角色位置或顏色。

## 阻塞積木 3：迴避成功缺少來源可歸屬的演出接縫

被動技能不能假裝成主動施法。Main 現在已把 `evade {source,target,x,z}` 送到 client，通用 MISS 文字可正常顯示；但這個事件沒有指出是哪一個 evasion grant／技能造成迴避。當多個被動、道具或 buff 同時授予迴避時，Editor 無法把某一支技能的專屬閃身、殘影或音效安全綁上去。

請 Main 只補一條可重用、來源可歸屬的 presentation seam，不要替任何英雄拼演出：

1. 在迴避抽中時保留觸發來源的穩定 identity，或提供等價的 source-carried presentation grant；不能從聚合後的 `Stat.Evasion` 猜最強／第一個來源。
2. wire/client 必須能取得防禦者、攻擊者、來源 identity 與可選 presentation fields（VFX、縮放、染色、音效；角色動畫脈衝可選）。
3. 沒有專屬設定時維持今天通用 MISS／迴避回饋；有設定時是取代還是疊加必須只有一種明確規則，建議同 `blockVfx` 採取代，避免看起來閃避兩次。
4. 隔離測試至少涵蓋：兩個迴避來源同時存在時只播放真正抽中來源的演出；未設定 presentation 時逐位元維持舊事件；事件可從 sim 經 fanout 到實際 client consumer。

修正前 Editor 的被動模板會把迴避標成 `main-trigger-gap`，只顯示 runtime 通用回饋，不允許作者用 `castEffect` 或無來源的 `evade` 假裝成某支被動的專屬演出。暴擊已有普攻動作、crit hitstop、重擊火花與數字；on-hit 可在同一 `hook.effects` 直接使用現有 `spawnVfx`；格擋已有 `block.vfxId`，因此這三者不另開 Main 阻塞票。

## 阻塞積木 4：Main 缺少統一的 actor-aware 預設演出 resolver

Owner 裁決：角色演出不是 Editor 八招的特例，而是 Main 所有技能的預設品質底線。主動技能不能只有粒子、
時間軸每個傷害／位移節點都要有角色動作；被動也要在真正的暴擊、on-hit、格擋、迴避、反彈等事件上視情況
播放動作或特效，但絕不能合成假的 `castStart/castEffect`。

現有能力不需重做：Main 已有基本 attack/cast/hurt、crit hitstop／重擊火花／數字、`blockVfx`、`evade`、
`reflectSuccess`、`critSources` 與 vfx-script `anim`。缺口是這些能力尚未由一個 resolver 統一決定 fallback、
取代 channel 與缺 clip 時的降級，而且 `AnimPulse` 尚無可表達防禦／閃身的 `guard`、`dodge`。

請 Main 只做可重用預設，不要替任何技能拼成品：

1. 建立單一 `resolveAbilityPresentation()`（或等價登錄表），輸出 trigger、caster/target actor action、預設 VFX、
   source identity 與 replacement channels；`GameApp`、`VfxSystem`、`VfxScriptPlayer`、產生器不可各有一份判斷。
2. 無專屬 script 時的 fallback：主動 cast 有 caster `cast/attack`；每個 `strikeIndex` 有 caster `attack` 與
   target reaction；on-hit 沿用普攻；crit 沿用既有 hit-feel；block 使用 defender `guard`＋泛用或 grant VFX；
   evade 使用 defender `dodge`＋MISS；reflect 從 `reflectSuccess` 播 defender 防禦／反擊。
3. 擴充 actor pulse 至少支援 `guard`、`dodge`；模型缺 clip 時必須有穩定 fallback，不能停止、消失或退回錯誤的
   `hurt` 作唯一格擋動作。hitstop 需延長既有動作窗而非重啟剪輯。
4. 純被動（包含住在 Q/W/E/R/EX 的被動）禁止生成 cast trigger；主被動混合技能各自走 active 與 passive 事件。
5. 專屬 script 對相同 `trigger:channel` 採**取代**而不是疊加；不同 channel 才能共存，避免同一刀兩份動作／VFX。
6. 將機器可讀的預設能力、pulse vocabulary、replacement policy、single-arc family 與 evasion provenance 狀態放進
   capability/profile receipt；Editor 缺欄位時 fail closed，不自行抄常數。

隔離測試至少涵蓋：普通主動無 script 仍有 caster action；每個 combo strike 都有雙方動作；純被動零 cast；
on-hit 不重播假施法；block 是 guard、evade 是 dodge；專屬 script 不與預設疊兩次；缺 clip fallback 可見且穩定。
所有預設 VFX 仍須經亮／暗 CameraRig framebuffer 去背守衛，schema 合法不能代替視覺安全。

Editor 的 current 收據已提升為 `ggd-vfx-visual-audit@3`：除了完整時間軸抽樣，送審的每張
關鍵格都會在精確時間點重新讀回 framebuffer。這已抓到 `godie-ogrh.r` 1.356 秒約
**0.193%** 的紅／紫診斷棋盤載體；舊時間軸收據曾錯誤判安全。Main 的 reusable primitive、
GroundDecal、模型材質與 fallback 必須以實際 framebuffer 為準，禁止輸出棋盤載體、未去背矩形、
不透明魔法陣底板或白色材質 placeholder。這是積木品質要求，不是請 Main 替八招拼時間軸。

2026-09-02 10:17 實跑 `pnpm vfxassets:check:fast` 的 Main 基線仍為 **27 個 blocker**，不是本 Editor
分支新增：`babyface.png`（2）、`heroeva01effect.png`（2）、`ribbonblur1.png`（多個英雄 Ribbon）、
`zap1.png/zap1b.png`（ThunderClap／LightningTornado）。請 Main 修復貼圖／blend 或在資產契約中 quarantine，
並確保 default resolver 與可作者資源清單永遠不選它們；不要用 allowlist 把紅燈消音。Editor 已 fail closed：
未取得逐資產 SAFE receipt 時不可拖入、不可預覽、不可擷圖、不可提交，送審 seam 也會再次檢查完整腳本。

Editor 會繼續負責技能專屬組合、時間軸、色彩、鏡頭與人工批核；八招 capability fixture 永遠
`promotable:false`，不屬於這張 Main 票的內容工作。

## 本輪整合時修正的 Editor 接縫

- 先前依文字表格預作的 parser 使用了錯誤欄名 `representation`；已改以 Main 真 JSON 的
  `schema` 為準，並新增完整 digest／最低版本驗證。這項差異證明不能把文字摘要冒充 integration。
- 兩條遠端唯讀 bridge 改用 HTTP GET；它們只讀 allow-listed HTTPS profile/index，不會被「所有 POST
  都是內容寫入」的掃描誤判，也沒有放寬 generator-owned 守衛。
- 靜態 profile 已由合併後產生器重建；contract-index digest 為 `f0fa79b088ba`。

## 非阻塞、不要塞回本輪

- `validate-single`、AI promote 便利 route、新 Eva 模型、七色 palette；
- `vfx-script@1` production importer：index 仍明示 `planned/G5`，Editor 只保留可擴充骨架，不假裝可上線；
- 正式站部署：feature-branch integration 已完成，何時部署由 Main 發版流程決定。部署前公開站仍可能是舊
  profile/404，這不應反向要求 Editor 猜欄位。

後續若 Main 改 representation、endpoint 或 policy，請只改唯一登錄表並讓 digest 改變；若是不相容變更，
同時提高 `minEditorContractVersion`。Editor 會據此停下，而不是帶著舊假設繼續匯出。

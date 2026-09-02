# GGD Main ↔ Codex Editor：必要接縫結案收據

狀態：**Revision 15 — Main v0.35.14 已整合；遠端資產接縫已封口，六個可重用積木／契約阻塞仍未落地**

核對基準：`origin/main@d29d0be6`（tag `v0.35.14`）

Main seam：`origin/feat/editor-seam-20260902@d29d0be6` 與 `main` 同一點；正式回交住
`docs/editor-contract/MAIN_TO_EDITOR_RESPONSE_20260902.md`

Editor：`feat/vfx-forge-codex`（禁止直接提交或推送 `main`）

最後核對：**2026-09-02 12:43（Asia/Taipei）**

## 結論

Editor 已抓取並整合 Main v0.35.14 的完整線性歷史，包括以下接縫 commits：

- `b54441df`：完整 `active/runtime-bundle` 與 effective VFX limit identity receipt；
- `cf40d5db`：`ggd-editor-contract-index@1` 唯一登錄表；
- `cbc70f5a`：穩定 `adapterId` 與 source adapter 非遠端命令入口證明；
- `4ec5e676`：補上 champion-slot PATCH 與 restore 的 generator-owned server guard。
- `5dc0eb92`：新增 `resolved-appearance@1` 與 `isStandIn`，讓共用替身不再靜默。
- `656f9d3f`：將 Main 正式回交文件放進 repo，不再只存在對話文字。
- `25fa2cba`：修正 asset manifest 測試原本沒有真正驗證閉包的問題；此項不會消除下列 27 個
  framebuffer／透明底板 blocker。
- `d29d0be6`：通用 proposal promote 現在會先解析目標所有權，generator-owned target fail closed；這補的是
  promote 繞路，不是下方 no-code source write 積木。

Editor 已完成 Main 回交要求的「第三份 representation 清單」修正：Export Center 不再以字面
`["ability@1","item@1"]` 決定 package policy，而是從已驗證的 `contract-index` 推導所有
`supported + runtime-document + admin-package-apply` 列。若 Main 新增 representation 而 Editor 尚無 builder，
或 target profile 摘要與完整 index 不一致，現在會明確 fail closed，不會安靜漏包。

Main 的完整 `assets-manifest.json` 接縫也已由 Editor 消費：Desktop 先核對 profile receipt、manifest
筆數／總位元組／digest 與每筆路徑，再允許遠端二進位橋接；下載內容與既有 cache 都必須逐檔符合
`bytes + SHA-256`，未列名、被竄改或舊 Base cache 一律 fail closed。舊 profile 仍可讀 JSON，但不會下載
任何無完整 receipt 的 GLB／貼圖／音效。

Editor 仍只在 `feat/vfx-forge-codex`；**不要把 Editor 提交直接推到 `main`**。

Main 目前只需修正下方六個可重用積木／契約缺口；不需要替 Editor 拼任何技能、時間軸或完整特效。

## v0.35.14 可重跑的現況證據

| 阻塞 | 驗證指令 | 2026-09-02 12:06 結果 |
|---|---|---|
| 有效 yaw | `rg -n 'yawOffsetDeg: num\\(model\\.yawOffsetDeg, 0\\)' packages/shared/src/content/import/resolvedAppearance.ts` | 仍命中 raw 0° fallback |
| 單發主斬弧 | `rg -n '"burstCount"\\s*:\\s*26' content/vfx/fx.prim.*slash*.json` | 所有現有 slash primitive 仍為 26 發 |
| 迴避 provenance | `sed -n '286,310p' packages/shared/src/sim/combat/evasion.ts` | payload 仍只有 `source/target/x/z`，沒有 grant identity |
| actor-aware resolver | `rg -n 'resolveAbilityPresentation|"guard".*"dodge"' packages/shared/src apps/client/src` | 沒有統一 resolver／兩個 actor pulse |
| combo capability | `pnpm --filter @ggd/editor test -- src/form/fullCoverageMatchesContract.test.ts` | 唯一紅燈仍是 `templateFamily/combo-finisher` |
| no-code source write | `rg -n 'expectedSourceSha256.*source|source\?: string' apps/content-api/src/editorSourceRoutes.ts` | POST 仍只接受整份來源文字，沒有結構化 product/member patch 或 dry-run |
| 素材安全 | `pnpm vfxassets:check:fast` | 仍為 27 blockers、五張來源貼圖 |

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
   - source adapter 僅由 server 端登錄表選擇，client 不可傳 shell command；目前 GET 回應**沒有**
     `adapterId`，只有 POST 成功後的 `regenerate.adapterId`，因此 Main 回交文件所寫「GET 回應帶 adapterId」
     與實作不符；
   - Editor 寫 champion mirror 前仍會重新讀 ability 與 champion 的 `editor-source`；兩份都必須
     `writePolicy=document` 才送 PATCH。Editor 沒有呼叫 restore。
5. `resolved-appearance@1`
   - Editor 已用同一 resolver 解析 VFX Forge 施法者／目標與英雄 3D 預覽；
   - `isStandIn=true` 仍可用來除錯機制，但禁止擷取或送出人工批核視覺證據；
   - 候選證據附 `championId/modelKey/modelDocDigest/resolverFingerprint` 收據。
6. 遠端二進位資產
   - `assetManifestDigest` 依 Main 同一規則重算 `JSON.stringify(assetManifest)` 的 12-hex SHA-256；
   - receipt、`counts.entries`、`counts.totalBytes`、逐檔 64-hex SHA-256 與受限 `assets/...` 路徑全部驗證；
   - cache 命中也重新雜湊，不能把另一個 Base 或中斷下載留下的位元組當成命中；
   - `remoteWorkspace.test.ts` 已直接讀 Main 當前出貨 profile／manifest 做契約驗證，不只驗合成夾具。

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

## 阻塞積木 5：`combo-finisher` 已出貨，但對外 capability 契約漏報

Main 自 `v0.35.12` 起已讓 `combo-finisher` 成為可展開的真正模板家族：

- `content/ability-templates/tpl-combo-finisher.json` 為 `status:"enabled"`；
- `packages/shared/src/content/templates/expand.ts` 已有 `"combo-finisher"` 展開器；
- `isExpandable("combo-finisher") === true`，Main 的 GH#916 隔離測試也通過。

但 `docs/editor-contract/ggd-runtime-capabilities.json` 與由它生成的
`ggd-editor-coverage.json` 都沒有 `templateFamilies/combo-finisher`。原因是
`editorCapabilities.ts` 的 `FAMILY_PROBE_LIST` 仍漏掉這個名字；現有測試只要求「已被出貨技能引用」的家族
進契約，而這顆新積木尚未被 content 引用，所以 `caps:check` 與 `editorcov:check` 都錯誤綠燈。

實際 Editor 雙向 coverage 守衛已紅：

```text
編輯器有但契約沒有: templateFamily/combo-finisher
```

請 Main 只修契約產生鏈，不要替 Editor 做連段成品：

1. 讓所有 `status:"enabled"` 且 `isExpandable(family) === true` 的模板家族必定進
   `RuntimeCapabilityManifest.templateFamilies`；不可只看是否已有 ability 引用。
2. 最好讓家族來源從唯一 registry／模板文件推導；若目前仍必須保留 probe list，至少補上
   `combo-finisher`，並加一條「enabled＋expandable 但零引用」也會紅的突變測試。
3. 依規則跑 `pnpm caps:export` 與 `pnpm editorcov:build` 更新產物；不要手改兩份 JSON。
4. 驗收必須讓 `pnpm --filter @ggd/editor test -- src/form/fullCoverageMatchesContract.test.ts`
   兩個方向都回空集合。

修正前 Editor 保留現有 `combo-finisher` 控制與紅燈，不刪掉積木來迎合一份漏報的契約，也不自行偽造
capability receipt。

## 阻塞積木 6：現有 source adapter 只有 raw-source POST，no-code Editor 無法安全寫回產生器來源

Main 已正確擋住 generator-owned 產物的 PUT／PATCH，`GET /content-api/editor-source` 也能說出來源 Python、
CAS hash、blast radius 與正規化欄位。缺口在寫入語意：目前 POST body 只有
`collection/id/expectedSourceSha256/source/reason`，其中 `source` 是**整份 Python 原始碼文字**。

這足以讓懂 Python 的工具改來源，卻不是 no-code Editor 可以使用的積木。Forge 手上只有經過 Zod 驗證的
ability product member patch；若由瀏覽器以 regex、字串置換或自製 Python parser 把 JSON diff 翻回來源，會把
Main 的來源語法、builder API 與格式細節複製到 Editor，下一次產生器改版便可能靜默改錯英雄的六支技能。
把 raw source 放進 textarea 也不符合「玩家不用寫 code」的產品目標。

另有一項已量出的契約漂移：`MAIN_TO_EDITOR_RESPONSE_20260902.md` 說 GET 回應帶穩定 `adapterId`，但目前
`editorSourceRoutes.ts` 的 GET 沒有該欄；只有 POST 成功回應的 `regenerate.adapterId` 才有。Editor 不能在寫入前
據此辨識 adapter 能力。

請 Main 只提供一條**結構化來源轉接積木**，不要替 Editor 做 Forge UI 或拼技能：

1. GET receipt 新增穩定 `adapterId`、明確的 `writeModes`／capability、可結構化修改的 product members；目前名為
   `ownership.editableMembers` 的內容其實是重生成後受影響的**文件路徑**，請保留相容性並另增語意清楚的
   `affectedProducts` 與 `editableProductMembers`，不要把兩件事混成一格。
2. 提供 server-owned 的 preview/dry-run 操作，輸入是經 schema 驗證的 product member patch，至少包含：
   `collection`、`id`、`expectedSourceSha256`、`patch`、`reason`；client 不送 Python、adapter command 或來源路徑。
3. 由 Main 登錄的 adapter 將 patch 翻成 authoritative source 變更，跑真正產生器與正規化器，再回：來源 diff、
   所有 affected products 的 before/after hash 與 product diff、實際生效值、`normalizedFields` 警告、驗證結果、
   `proposalDigest`。dry-run 必須零檔案變更。
4. apply 必須帶同一個 source CAS 與 `proposalDigest`；server 重新驗證後原子套用。產生器、schema、mirror 或
   content build 任一步失敗都要還原來源與所有產物，不能留下「來源新、產物舊」或只更新 standalone 的半套。
5. ability 與 champion mirror 由**同一次來源重生成**產生；Editor 不應再對 generator-owned champion 送第二次
   PATCH。回應須列出 blast radius，讓批核頁顯示同一英雄的六支技能與英雄卡可能一起改變。
6. adapter 若不能無損表達某個 Forge member，必須在 preview 明確拒絕該欄位；不可丟掉、不可靠地近似，也不可
   接受後讓下一次 `skills:sync` 打回來。

建議 machine shape（欄名可由 Main 調整，語意不可少）：

```jsonc
// GET /content-api/editor-source
{
  "adapter": {
    "adapterId": "skillremake-hero-py.ability@1",
    "writeModes": ["product-member-patch@1"],
    "affectedProducts": ["content/abilities/…", "content/champions/…"],
    "editableProductMembers": ["template", "castType", "effects", "passive", "vfxKey", "vfxLayers"]
  }
}

// POST preview（或等價 route）
{
  "collection": "abilities",
  "id": "godie-e002.q",
  "expectedSourceSha256": "…",
  "patch": { "template": {}, "effects": [] },
  "reason": "VFX Forge no-code writeback"
}
```

隔離／整合驗收至少涵蓋：

- dry-run 前後 repo 所有檔案 hash 相同；
- stale source CAS 回 409 且零寫入；
- client 傳 `adapterId`、command、sourcePath 或 raw Python 都不影響 server 選擇；
- 一支 generator-owned ability 的模板／effects patch 經 preview＋apply 後，standalone 與 champion mirror 一致，
  再跑 `pnpm skills:sync` 仍存活；
- 非 editable member fail closed，訊息指出欄位；
- 正規化欄位回報實際生效值，不把 77 被級距解析回 90 誤報為接縫損壞；
- 人為使產生器或 schema 驗證失敗時，來源與全部產物逐位元還原；
- Editor 全程不需讀、解析或產生 Python。

修正前 Editor 會誠實顯示：「Main 目前只接受整份來源文字；no-code Editor 不會把 JSON 成員差異猜寫成
Python」，並停止寫回。它不會退回直接 PATCH 產物，也不會把 raw Python 暴露成玩家編輯介面。

## 本輪整合時修正的 Editor 接縫

- 先前依文字表格預作的 parser 使用了錯誤欄名 `representation`；已改以 Main 真 JSON 的
  `schema` 為準，並新增完整 digest／最低版本驗證。這項差異證明不能把文字摘要冒充 integration。
- 兩條遠端唯讀 bridge 改用 HTTP GET；它們只讀 allow-listed HTTPS profile/index，不會被「所有 POST
  都是內容寫入」的掃描誤判，也沒有放寬 generator-owned 守衛。
- 靜態 profile 已由合併後產生器重建；contract-index digest 為 `f0fa79b088ba`。
- 遠端 Base 的完整 asset manifest 已 pin 在相同 contentVersion 目錄；Content API bridge 只服務該 receipt
  列名且 byte count／SHA-256 相符的資產，沒有 receipt 時整條 bridge 不啟用。

## 非阻塞、不要塞回本輪

- `validate-single`、新 Eva 模型、七色 palette；通用 AI/proposal promote 的 generator-owned 守衛已於
  `d29d0be6` 落地，不再列缺口；
- `vfx-script@1` production importer：index 仍明示 `planned/G5`，Editor 只保留可擴充骨架，不假裝可上線；
- 正式站部署：feature-branch integration 已完成，何時部署由 Main 發版流程決定。部署前公開站仍可能是舊
  profile/404，這不應反向要求 Editor 猜欄位。

後續若 Main 改 representation、endpoint 或 policy，請只改唯一登錄表並讓 digest 改變；若是不相容變更，
同時提高 `minEditorContractVersion`。Editor 會據此停下，而不是帶著舊假設繼續匯出。

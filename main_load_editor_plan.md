# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Draft 0.7 — 納入 2026-08-08 的 90 份 Owner 技能機制回歸；只提供遊戲端實作建議；本專案不修改 GGD**  
日期：2026-08-08  
基線：`GGD main@81826f9ffc8f1561fe99dbd5628576645f321664`  
共同資料契約：`GGD_EDITOR_PACKAGE_SPEC.md`  
驗證英雄候選：`OPEN_HERO_WHITELIST.md`  
傳說武器 census：`LEGENDARY_WEAPON_FULL_AUDIT.md`

## 1. 目的

這份文件集中列出「編輯器本身無法完成、必須由遊戲主程式／後台實作」的工作，供另一個有 GGD 修改權的任務使用。它不授權本專案修改、commit 或 PR 到 GGD。

遊戲端最終要能：

1. 接受 `ggd-editor-import@1` Package JSON 或 `ggd-editor-package@1` ZIP，並明確區分 raw Runtime Document JSON。
2. 保存 authoring truth，重新編譯 Definition／Product／Chain／Host，而不是直接相信 editor 的 compiled JSON。
3. 在隔離 staging 建完整 content tree，跑正式 loader／runtime／scenario 驗證。
4. 以 immutable version + CAS + atomic ACTIVE pointer 一次啟用全部文件。
5. 安全 rollback 到前一個 verified digest。
6. 對缺少的 gameplay/runtime capability 明確拒絕，不能把有語意差異的資料攤平後繼續載入。
7. 提供可下載的 `ggd-content-target-profile@1`／activation receipt，讓不連後台的本機 Editor 能以精確 base 建 partial delta。
8. 驗證已記錄的內容權威決策：技能說明優先於 JASS／runtime；只有來源缺失、資料不完整或新機制尚未支援時拒絕 apply，不重新要求 Owner 裁決既有衝突。

## 2. 修改優先級

### P0 — 沒有就不能安全匯入 Editor package

- 新 JSON／ZIP importer 與 capability API。
- Target profile／activation receipt export；包含 current digests、capabilities、live curation digests 與 asset manifest digest。
- Effect Definition／Product／Host authoring store、bootstrap／full／delta lifecycle。
- 與 editor 共用的 authoring schemas、JCS hash、安全 `effect-graph-v1` 與 deterministic compiler contract。
- full-tree staging validation、compiled compare、derived rebuild。
- immutable activation、CAS、health read-back、rollback。
- distribution／reachability 重建，避免 item 載入後不可達。

### P1 — 43 名英雄驗證與 49 件傳說武器 census 已知需要的 gameplay/runtime 修改

- `effect.target-set-chain@1`：selector victims 可安全傳入 nested Product chain。
- `hook.on-evade@1`：成功閃避可觸發 defender item hook，再使用既有 dash primitive。
- 90 份新技能的跨技能狀態、事件上下文、致命傷害充能、動態數值轉換、單次觸發與 deterministic 權重分支。
- 把現有 item-only `BlockGrant` 升為 ability／buff／item 共用的傷害前防禦來源；不可用受傷後補護盾假裝「格擋」。
- typed `ability-augment@1`：被動技強化另一招時使用穩定 ability／status ref 與 allowlisted operation，不從技能名稱文字反推。
- 條件式 `effect.dash-on-end@1`：只有需求明確是 collision-aware dash 的實際停止點／原因後才執行 child chain 時需要；可用 apex=0 leap 精確表達者不新增重複 primitive。
- 完整 item refs／effect-bearing 判定，涵蓋 recipe、aura hooks 與所有現有 item payload。

### P2 — 不阻擋基本匯入，但會限制 3D 驗收可信度／維護成本

- 公開、版本化的 client preview／render bridge surface。
- combat／VFX event provenance。
- 把 code-authority VFX promotion 逐步移入 content。
- generated README／reference／status freshness gate。

### 2.1 Pinned GGD 的 template stack 現況

Owner 補充的數字已在 `81826f9...` 唯讀重算確認：

| 層次 | 目前 GGD 事實 | 本方案的判讀 |
|---|---|---|
| Template Definition | `content/ability-templates/` 33 份 `template@1`（16 enabled／17 draft），含 params／requires／family／status | Legacy code-owned Definition；family body 仍在 `expand.ts` |
| Filled card | 142 份 standalone ability 使用 `{ref, params}`；`tpl-buff-self` 54、`tpl-single-strike` 52；另有 106 份 champion embedded mirrors | 每張遷移為 host-local Product；mirrors 是衍生副本，不能重複算成 248 支 |
| Flat multi-card stack | `ability.template` schema 支援 `{cards, onConflict}` 或 card array，1～8 張；正式 ability corpus 使用數 0 | 是可相容的**平面合併投影**，不是 nested temporal chain |
| Runtime document | `content/abilities/*.json` 的 `ability@1`，載入時經 template expansion 合併 | Compiled runtime truth；不反推 Product identity |

GGD 已有 `normalizeTemplateBinding`、`expandStack`／`expandStackOrThrow`、來源 trace、衝突 policy 與多個 expansion／Forge UI mutation guards。現有規則是：

- cards 有序；effects 與 passive list fields 按 card order concatenate。
- scalar fields（castType、radius、castTimeSec、targetsEnemies、innateKind）值不同時，預設 `reject`；明示 `lastWins` 才由後卡取代，trace 保留 shadowed value。
- loader 正式走 `resolveTemplateExpansion → expandStackOrThrow → mergeExpansion → zAbilityDoc`；release validation 必須使用 `onTemplateFailure: "throw"`，不能接受 production 的 degraded no-effect ability。
- 任一卡 ref／params／expand 失敗時，整個 stack 失敗，不能只保留第一張；遊戲開機的 `degrade` fail-soft 只供舊 runtime 保命，Editor validate／apply 必須原子 fail-closed，且 template failure ledger 為零。
- Binding／card 外殼雖是 strict，現行 `params` 仍是 `Record<string, unknown>`，family params parser 會容忍 unknown key；拼字錯誤可能被忽略並退回預設值，`null` 也可能被當成 absent。這是 legacy compatibility 行為，不是新 authoring contract：Editor／package strict mode 必須拒絕 unknown／`null`，並在 expansion 後再跑完整 `zAbilityDoc`。
- Card 的 optional `version` 欄位目前沒有任何 consumer，是 inert debt；Editor V1 不得把它當真正 revision pinning，也不應為新內容輸出此欄位。

但「schema 支援、expansion unit test 通過」仍不等於已證明 production behavior：目前沒有任何 shipped ability 使用多卡，也沒有 multi-card 經 `IntentFrame → castAbility → runEffects → world.step` 的完整 SimWorld regression。因此 importer contract 必須補這個 corpus／behavior guard，不能只計算 cards 數量。

### 2.1.1 全技能審閱新增的 runtime capability 建議

2026-08-05 的技能審閱已改為全自動決策：技能說明是規格來源，Q／W／E 在 Editor 輸出固定四級、R 固定三級；來源為三或五級時由 Editor 依端點保留的線性取樣產生正式級數，並在中文處理紀錄保留原始差異。遊戲 importer MUST 驗證正式 package 已符合級數規則，不能再次取樣或默默裁切。

本輪 Owner 文案暴露出下列 GGD capability 缺口。Editor 可以編輯與預覽，但遊戲端沒有對應 capability 時必須回 `unsupported-runtime`，不可降級成相似但不同的效果：

- `hook.on-reflect-success@1`：反彈成功後才啟動七段連擊與直線終結技，事件需帶原傷害、反彈傷害、攻擊者與防禦者 provenance。
- `condition.cast-guard@1`：生命門檻未達時拒絕施展，而且不扣 MP、不進冷卻；guard 必須在 spend／cooldown commit 前原子判定。
- `hook.on-basic-attack@1` 的 `chance + internalCooldown + manaOnProc`：自動觸發成功後才扣魔；MP不足時依 Product 定義跳過全部效果，或只保留前置防禦結果。
- `effect.convert-hit-damage-type@1`：以逐級機率把該次普攻完整轉成 true damage，不是另外補一段真傷。
- 週期護盾不新增重複 primitive：用既有 `onInterval + internalCooldown + shield{absorbs:"magic"}` 組合，但必須有「同來源重建／不疊加」的 source key 與真實 SimWorld 驗收。
- `effect.attack-dash@1`：暴走期間每次普攻向目前目標短距離衝刺，需 collision、target invalidation 與 exactly-once 規則。
- `condition.target-status@1 + hook.on-ability-hit@1`：指定技能命中帶有燃燒標記的目標時，對目標周圍啟動另一個 Product。
- 反彈視窗不另造一個整包 effect：用既有限時 `applyBuff.hooks + onDamageTaken + damage.incomingPct` 表達；真正缺口是 `on-reflect-success` 的成功認定、反彈封包 provenance 與 child chain。
- typed multiplier semantics：`pctMult` 固定解釋為最終倍率 `1 + value`，`percentOf` 解釋為來源屬性的占比；schema、compiler、runtime 與 tooltip generator 必須共用同一組 contract tests。

以上皆只新增到遊戲端建議；本專案沒有修改 GGD。

### 2.1.1.1 最新技能文案同步（2026-08-08）

Editor 已完整套用 Owner 提供的 **15 名英雄 × 6 槽，共 90 份**技能文案來源：Saber、初號機、白木卡迪那、櫻綻剎那、宇智波佐助、揍敵客桀諾、涅吉、夜神月、天地志狼、林克、黑崎一護、呂布奉先、熊貓、草泥馬與 Berserker。機器可讀來源為 `ggd-editor-pack-v2/tools/owner_skill_descriptions_20260808.tsv`，SHA-256 是 `078be769f4641e83731eeb18423452696c6ead75b2cc99c28c3505c4a840ff76`。這批來源是 authoring description 的最高優先來源；遊戲端 importer 必須遵守以下規則：

- 技能說明原文是內容規格，包含幽默敘事、引號、換行與條列；不得由 importer 重寫、縮短、潤飾、刪除或以 runtime tooltip 反向覆蓋。
- Editor 只會補完數值型資料（等級、耗魔、冷卻、施法距離、有效半徑、百分比等）與修正第一行技能標籤。遊戲端應保存 `descriptionSource`、`descriptionResolved`、`tagSource`、`tagResolved` 及修正紀錄，不應重新推導文案。
- Q／W／E 必須為 4 級，R 必須為 3 級；Editor 已完成線性補值／取樣。Importer 只驗證級數與型別，禁止再次插值、裁切或默默改變正式數值。
- 被動技能不得帶 `[主動]` 或 `[輔助]`；`[輔助]` 僅代表主動技能且效果作用於我方英雄。self-cast、切換、變身或自身防禦效果不得因作用於自己而自動標成 `[輔助]`。
- `[迴避]`、`[格擋]` 已隱含受到傷害事件；除非 effect graph 需要不同事件語意，runtime 不應要求額外重複 `[受到傷害時]` 才能執行。
- 正文 `[直線]`、`[一直線]`、`[前方直線]` 統一映射為第一行 canonical `[指向][範圍]`；這是強制等價關係，不可只有其中一個，也不可與 `[指定]` 並存。單一敵方單位才使用 `[指定]`，地點施放才使用 `[指定][範圍]`。Importer 必須將標籤映射到 typed targeting，不得只保存顯示字串。
- Owner issue 是追蹤紀錄，不是第二份技能規格；既有決策已採用 Editor 的數值／標籤修正，不應在匯入時重新要求 Owner 裁決。

本次輸出基線為 **43 名英雄、258 個槽位、257 份實際 ability 文件、1 個來源缺件槽**。`godie-ogld.passive` 仍是 `MISSING_SOURCE`：不可猜測、不可產生 placeholder、不可因 ZIP 缺檔而自動刪除；若 package 宣稱完整匯入，必須明確回報缺件並阻止 full apply。

這 90 份是全體 257 份 ability 中的最新黃金回歸子集，不可將「90 份都有檔案」誤解為全體白名單已無缺件。本輪審閱有 192 筆中文處理紀錄；其中 22 筆高程度問題全是現有 template 無法忠實表達或參數沒有生效（19 `TEMPLATE_GAP_YELLOW`、2 `TEMPLATE_INERT_PARAM`、1 `TEMPLATE_CONDITIONAL_INERT`）。Importer 不可因 ability 已經有 `template.ref` 就判定機制可上線。

建議 package manifest 增加：

```json
{
  "descriptionPolicy": "source-preserving",
  "descriptionSourceSet": "owner-skill-descriptions-20260808",
  "descriptionSourceDigest": "sha256:078be769f4641e83731eeb18423452696c6ead75b2cc99c28c3505c4a840ff76",
  "mechanicsRegressionAbilityCount": 90,
  "numericResolution": "editor-resolved",
  "rankPolicy": { "Q": 4, "W": 4, "E": 4, "R": 3 },
  "tagRulesVersion": "1.11.0",
  "ownerIssuePolicy": "record-only",
  "missingSource": ["godie-ogld.passive"]
}
```

若 `descriptionPolicy`、`rankPolicy` 或 `tagRulesVersion` 不相容，回傳 `AUTHORING_POLICY_MISMATCH`；若 source digest 與 package 內文案不一致，回傳 `DESCRIPTION_SOURCE_DIGEST_MISMATCH`。這些檢查必須在 compiled runtime compare 之前完成。

### 2.1.1.2 90 份技能產生的機制契約（2026-08-08）

這批更新證明「效果模板可展開」還不夠。很多技能的真正規格不是一個 damage／buff 物件，而是「什麼事件發生、要讀取哪個當下值、條件成立後啟動哪份 Product、狀態何時失效、另一招如何被強化」。因此 package 必須同時攜帶 description truth 與 typed mechanics truth，遊戲端必須重編並跑行為驗收，不可用標籤或 tooltip 當執行碼。

#### 先復用現有 primitive，不重複發明

Pinned GGD 已有下列可組合能力；Editor compiler 應優先編譯到它們，遊戲端 capabilities API 則要分別宣告版本與語意，不可只回「支援 effect」：

| 現有能力 | 本批技能用途 | 必須加強的驗收 |
|---|---|---|
| `damageArea`、`damageLine`、`spawnProjectile.onHit`、`leap.onLand` | 陽電子砲、雷神槍、蹂躪編年史、巨神一擊 | 直線必須產生 deterministic victims；onHit／onLand child 不得被攤平到 cast tick |
| `onInterval + internalCooldown`、`dot`、`shield.absorbs` | AT 力場、真·不死不滅、天照 | 週期、第一 tick、重新套用、同來源不疊加與只吸收 magic 必須有狀態斷言 |
| `applyBuff`、`cycleBuff`、`StatModifier.override/capRaise/percentOf` | 念。攻防轉換、暴走攻速上限、屬性派生與輪替增益 | 同來源 refresh／stack、每層或全層到期、override 優先度與 capRaise 不得相乘 |
| `spendMana`、`damage.hpPct/incomingPct/refund`、`grantAttribute` | 風王結界每擊扣魔、牙突目標生命比、反彈與永久三圍 | 所有百分比的 subject、basis、結算時點與上限都是 typed field |
| `championForm`、`whileForm`、`applyBuff.hooks` | 風王結界、卐解、虛化、限時變身後普攻效果 | 現有 base／alternate 只適用一組對應身體；三種互斥變身不可偷用同一個 boolean |
| `condition` 的 chance／stat／kind、`HookDef.abilitySlot` | 生命門檻、指定槽位命中、英雄限定 | 它們不足以表達 status ref、指定 ability id、反彈成功、裝備與層數；缺的不可用文案名稱替代 |

#### 本批機制要求新增或升級的 capability

| 建議 capability | 來自本批的驗收技能 | 最低契約 |
|---|---|---|
| `defense.block-source@1` | `godie-e002.passive` 銀色甲胄 | 將現有 item-only `BlockGrant` 移到共用 `ModifierSource`，ability／buff／item 都可指定 damage types、chance、fraction、ICD 與 stacking order。格擋在 HP 扣除前發生，不可用 `onDamageTaken -> shield` 假裝。 |
| `effect.convert-hit-damage-type@1` | `godie-e00r.w` 高週波短刀 | 成功時把「這一發原普攻」轉為 true damage，保留 hit id／crit／on-hit／kill credit；不另發第二個 damage packet。 |
| `hook.on-reflect-success@1` | `godie-e002.ex`、`godie-h00l.r/ex` | 只在實際產生反彈封包時觸發，context 至少帶 source、defender、original packet、reflected packet、basis、amount、reflectDepth、castId／abilityId；被免疫或 0 傷害不觸發。 |
| `hook.on-evade@1` | `godie-e00w.passive`、`godie-h02k.r` | 只接真正 defender evade outcome，不接 attacker fumble；context 帶 attacker、defender、channel 與 attack origin，延遲 queue 的順序固定。 |
| `hook.on-lethal-damage@1` + `effect.charge-ledger@1` | `godie-hapm.passive` 十二道試煉 | 在 death commit 前原子判斷、消耗一層、阻止本次死亡，再執行無敵／延遲回復／周圍擊退暈眩；ledger 明訂 round／match／persistent-profile scope，本技是 match 內跨回合 12 層。 |
| `condition.has-status@1`、`condition.ability-state@1`、`condition.has-equipment@1`、`condition.stack-count@1` | 哥哥、絕。暗殺奧義、御雷劍、虛化、最終戈壁 | 只接穩定 statusId／abilityId／itemId／state key，明訂 subject、snapshot 時點、比較與 absent 語意；禁止以「哥哥」「千年練成」等顯示名稱連結。 |
| `ability-augment@1` | `godie-e00s.ex`、`godie-e00w.ex`、`godie-edem.r`、`godie-h01n.r/ex`、`godie-h00l.ex` | 是 authoring graph edge，不是任意 JSON Patch。可 allowlist `appendProduct`、`scaleTerm`、`setDuration`、`setChance`、`cooldownMult`、`cooldownReset`；目標以 exact ability ref 與穩定 term／edge id 定位。 |
| `state.exclusive-group@1` + `state.lifecycle@1` | 風王結界、疾風迅雷／獄炎煉我／雷天大壯、卐解／虛化 | 狀態帶 stable key、exclusive group、onEnter、onExit、onAutoExit、duration、refresh policy。Toggle 因 MP 不足自動關閉時也必須走 onExit，才能釋放風王鐵槌。 |
| `effect.event-value-conversion@1` | `godie-emfr.ex` 敵彈吸收陣。太陰道 | 只可從 allowlisted event field 讀取，例如 `incoming.reflectedAmount`，再依同一個 captured value 回 MP 與增 AP。必填 basis、ratio、cap、overflow、stackKey 與 expiry policy；「5秒後歸零」要明訂 `all-at-once`，不可猜成 per-stack expiry。 |
| `hook.consume-policy@1` | 雷天大壯「施放技能後的下一次普攻」 | 支援 `maxTriggers`、`consumeOn` 的 `success`／`attempt`、`expiresAt`、`perTarget`；沒有這個契約時，限時 hook 會每次普攻都觸發。 |
| `effect.weighted-branch@1` | `godie-h02k.ex` 俄羅斯輪盤 | 一次 seeded RNG draw 選一個互斥結果；weights 必須有窮、非負、加總一致，條件只可替換或調整權重表。不可把 1/6、1/6、4/6 編成三次獨立 chance。 |
| `effect.execute@1`、`defense.mana-barrier@1`、`effect.swap-resource@1` | 吞噬、狂草泥馬、機警、交換筆記本 | 處決需 typed threshold、hero-only、shield／invulnerable interaction、kill credit 與回復 basis；魔力護盾需 damage-to-MP ratio 與 MP 不足時的 remainder；交換只交換 current resource，不交換 max、護盾或 modifier。 |
| `scheduler.random-area@1` | `godie-efur.r` 龍星群 | 使用 SimWorld seeded RNG，指定 count=10、interval=0.2s、anchor、radius、placement policy、target selector 與 child Product；replay 必須有相同落點與命中順序。 |
| `effect.target-set-chain@1` 的雙分支擴充 | `godie-h02v.ex` 最終戈壁、千年練成／樹海降臨 | 同一 tick 可用 ally selector 回 MP，enemy selector 造成傷害；兩個 named target set 不得共用 mutable `ctx.targets`，同隊與敵隊不得重疊。 |
| `effect.control-restriction@1` + `effect.modify-cooldown@1` | 臥草泥馬、暴走、完美盾反／勇者意志、卐解／虛化 | 分開 move／basicAttack／cast／playerOrders／AI control，不可用 stun 概括；冷卻操作分為 reset current、scale remaining、scale future casts，並以 exact ability ref 指定。 |

上表是未來 runtime 契約，不會反向改寫 v0.9.45 的已知支援狀態。例如 `[格擋]` 目前仍受 tag manifest 的 item-only 限制；要等 `defense.block-source@1` 的 schema、SimWorld、scenario 與 mutation guard 全部上線後，才能由遊戲端發佈新 manifest 版本開放 ability authoring。

`ability-augment@1` 的建議外形如下；重點是 exact ref、stable term id 與封閉 operation，不是欄位名必須照抄：

```json
{
  "schema": "ability-augment@1",
  "id": "godie-edem.r:augment-kirin",
  "sourceAbilityRef": { "id": "godie-edem.r", "contentSha256": "sha256:..." },
  "targetAbilityRef": { "id": "godie-edem.e", "contentSha256": "sha256:..." },
  "when": {
    "event": "onAbilityHit",
    "targetHasStatus": "status:burning"
  },
  "operations": [
    {
      "op": "appendProduct",
      "edgeId": "on-hit",
      "productRef": { "id": "product:kirin-blast", "contentSha256": "sha256:..." }
    }
  ]
}
```

禁止用 `/effects/0/onHit/2/amount` 這類位置 JSON Pointer 當永久契約；Product 重排就會讓被動技強化錯對效果。Compiler 必須給可被強化的 term／edge 穩定 id，並在拓撲 compile 時驗 target ref、operation 與條件的型別。

#### Package／Loader 必須多做的驗證

Package manifest 建議增加機制回歸身分：

```json
{
  "mechanicsRegression": {
    "fixtureSet": "owner-skill-descriptions-20260808",
    "sourceSha256": "078be769f4641e83731eeb18423452696c6ead75b2cc99c28c3505c4a840ff76",
    "abilityCount": 90,
    "compilerContract": "effect-graph-v1",
    "requiredCapabilities": [
      "ability-augment@1",
      "hook.on-reflect-success@1",
      "hook.on-lethal-damage@1",
      "effect.weighted-branch@1"
    ]
  }
}
```

`requiredCapabilities` 只是快速協商用索引。Importer 必須自己 walk authoring graph 重算實際需求，比對 manifest 並 fail closed；不可信任 package 少報 capability。另外必須：

1. 把 `ability-augment`、status refs、state refs、cooldown refs 納入 forward／reverse dependency closure；partial 匯出只選被動技時，仍要重編其影響的目標技能。
2. 檢查每個 event edge 是否真的提供 child 所讀取的 context。例如 `incoming.reflectedAmount` 不可掛在 `onBasicAttack`，`evade.attacker` 不可掛在純週期事件。
3. 同一穩定 state key 的 scope、stacking、expiry 與 exclusivity 必須一致；`match` 層數不可在 round reset 丟失，也不得進入下一場 match。
4. 重編後要對 description 產生機制覆蓋報告：文案中已確認的處決、反彈成功、永久層數、下一次普攻、交換、互斥變身等語意，必須有 typed provenance 指向對應 node；單有彩色標籤不算覆蓋。
5. 權重分支、隨機落點、機率 hook 都必須使用同一 deterministic RNG lineage；validate 要計算每次事件最大 draw 數與 child event 預算。
6. 任一新 capability 尚未出現在遊戲端 registry 或缺少對應 scenario evidence 時，回 `unsupported-runtime`；不得 lower 成「看起來差不多」的舊 template。

建議固定 diagnostics：`MECHANIC_CAPABILITY_UNSUPPORTED`、`MECHANIC_EVENT_CONTEXT_MISSING`、`ABILITY_AUGMENT_TARGET_MISSING`、`ABILITY_AUGMENT_OPERATION_UNSUPPORTED`、`STATE_SCOPE_CONFLICT`、`EVENT_VALUE_BASIS_REQUIRED`、`WEIGHTED_BRANCH_INVALID`、`DESCRIPTION_MECHANIC_UNCOVERED`。

#### 90 份子集的最低行為驗收

- Saber R／EX：2 秒反彈視窗外零觸發；視窗內只有實際反彈成功才開七段斬擊與直線終結，每段 provenance 都可追回同一原始封包。
- 初號機 W／E：W 是「改變原普攻傷害型別」，不是多打一下；E 每 8 秒重建一個不疊加、只吸收魔法傷害的護盾。
- 白木 R／EX：EX 是對 R 的 typed augment，傷害加成與友方回復分開 selector；不得把 EX 編成另一個需按的主動技。
- 佐助 E／R：只有指定 E 命中且目標帶燃燒標記才觸發麒麟；比對 exact ability id，不比對中文名。
- 桀諾 R／EX：10 顆流星每 0.2 秒一顆，同 seed 的落點與命中完全相同；EX 只在牙突命中致盲目標時抽一次 20%。
- 涅吉 W／E／R／EX：三種變身屬於同一 exclusive group；雷天大士的次回普攻只觸發一次；太陰道用同一 reflected amount 同時回 MP 與疊 AP，5 秒到期後 AP 全部歸零。
- 夜神月 PASSIVE／EX：魔力護盾依 1 MP:3 damage 實際消耗，MP 不足的餘傷繼續結算；交換筆記本只原子交換雙方現存 HP。
- 林克 R／EX：反彈成功的回復、擊退與 EX 冷卻重置各只發生一次；被免疫或未實際反彈時不重置。
- 熊貓 EX：每次施放只抽一次互斥結果；致盲／混亂只改一張權重表，不額外增加第二、第三次機率抽取。
- 草泥馬 EX：`[馬勒戈壁]` 存在期間每秒各執行一次 ally mana restore 與 enemy area damage，兩邊 target set 、統計與事件分開。
- Berserker PASSIVE：致命傷害一次只消耗一層，12 層跨回合、不跨 match；無敵、延遲回復、周圍擊退暈眩依固定 tick 順序各一次。

### 2.1.2 遊戲 v0.9.45 技能標籤支援同步

2026-08-05 收到遊戲端自足支援資料：`SKILL-TAG-SUPPORT.md` 與 `skill-tag-manifest.json`，對應引擎版本 **v0.9.45**。這兩份檔案是目前標籤支援的權威輸入；manifest 是機器可讀的狀態來源，支援文件提供作者警告與限制說明。

技能文案權威規則：Editor 不得重寫、縮短、潤飾或移除作者原文（包含幽默敘事與條列）。Editor 只可補完數值型資料（等級、耗魔、冷卻、距離、半徑、百分比等）與修正第一行技能標籤；文案品質問題只能寫入 Issue。

| state | 數量 | 編輯器行為 | 匯入行為 |
|---|---:|---|---|
| `allowed` | 52 | 正常可選、可輸出 | 正常驗證與編譯 |
| `allowed_with_warning` | 46 | 可選，但 `authorWarning` 必須常駐顯示，不得藏在 tooltip | 可匯入，但 receipt 必須保留警告與 capability evidence |
| `blocked` | 41 | 灰階顯示「開發中」，不可選、不可保存 | 直接拒絕；不得把標籤存進 runtime 或降級成相似效果 |

編輯器的 tag picker、JSON validator、ZIP compiler 與遊戲 importer 必須共用同一份 manifest。`blocked` 標籤若只在 UI 禁用但仍可由手動 JSON／舊 ZIP 寫入，仍視為驗證漏洞；package validate 必須逐一檢查每個 tag 的 state。

同步後的高優先限制：

- `[指定]` 目前只送敵方目標；友方指定治療／增益不可宣稱支援，應改為 `[輔助]` 或友方範圍效果。
- `[指向]` 不產生目標清單，只允許投射物／直線傷害語意；掛上需要目標清單的傷害、狀態、治療、護盾必須阻擋或改寫。
- `[格擋]`、`[免死]` 只可出現在道具；`[真視]`、`[隱身（常駐）]`、`[飛行]` 依 manifest 的 `authorableIn` 限制文件類型。
- `[破甲]`、`[破防]`、`[破魔]`、`[易傷]`、`[虛弱]`、`[凋零]` 若 `noEffectOnMinions=true`，作者畫面必須常駐提示「對小兵無效」。
- `[血量首次低於]` 目前只能表達「目前低於 N%」，不能宣稱首次觸發；沒有對應 edge／latch 時不可輸出為一次性事件。
- `allowed_with_warning` 不等於完整支援：例如 `[召喚]`、`[反彈]`、`[標記引爆]`、`[處決]`、`[減傷]`、`[冷凍]` 等必須把文件中的語意限制一起保存，不能只保存中文 label。

目前審閱輸出的對照表共有 **180** 個方括號顯示項，但 canonical authoring tag 仍只有 manifest 的 **139** 個；兩者不可直接當成同一集合。多出的項目包含正文顯示別名（例如 `[小範圍]`、`[大範圍]`、`[周圍]`、`[附近]`、`[前方直線]`、`[普通攻擊]`、`[閃避]`、`[擊昏]`、`[AP]`、`[AD]`、`[防禦]`、`[魔法抗性]`、`[詛咒]`、`[擴散]`、`[蓄力]`）與作者在正文中使用的技能名稱引用，這些只供 presentation tokenizer 上色，不得進入 mechanics tag validator。正文別名必須保留作者實際用詞：「閃避」只能變成 `[閃避]`，不得被改寫成 `[迴避]`；移除新增的 presentation 方括號後，原文必須保持不變。`[離開範圍時]` 則是尚未列入 manifest 的候選機制標籤，支援文件也明確說尚未查證；在遊戲端補入 manifest 前，若出現在第一行 canonical tag block，編輯器應暫列 `blocked` 並禁止匯出。另需建立 canonical label normalization，統一全形／半形括號，例如 `衍生屬性（把 A 的 X% 加到 B）` 與 manifest 的 `衍生屬性(把 A 的 X% 加到 B)`，避免同一語意被計成兩個 tag。

匯入錯誤碼建議固定為：`TAG_BLOCKED`（blocked）、`TAG_AUTHORING_SCOPE`（authorableIn 不符）、`TAG_WARNING_ACK_MISSING`（警告未保留）、`TAG_MANIFEST_VERSION_MISMATCH`（manifest／runtime 版本不一致）、`TAG_CANONICAL_NAME_CONFLICT`（同義標籤名稱不一致）。

### 2.1.3 技能標籤 Markdown 與全域七色色盤

技能說明維持目前的精簡格式，不在每個標籤後重複保存色碼：

```markdown
[主動][指向][範圍]
60秒冷卻

對前方[大範圍]敵人造成350+100%[AP]傷害。
```

遊戲端把 `[...]` 視為 `ggd-tag-markdown@1` 的 inline token；標籤名稱透過 `skill-tag-manifest.json` 取得 `group`，再由一份全域色盤取得色碼。禁止輸出 `[範圍]{#1565C0}`、HTML `<span style>` 或讓每支技能自行指定顏色，避免同一標籤產生色碼漂移、增加文案長度或形成 HTML／CSS 注入面。

全域色盤固定為：

```json
{
  "schema": "ggd-tag-palette@1",
  "id": "ggd-skill-tags-seven-color@1",
  "groups": {
    "activation": { "label": "啟動方式", "color": "#7030A0" },
    "cast": { "label": "施放範圍", "color": "#1565C0" },
    "effect": { "label": "效果／狀態", "color": "#D84315" },
    "event": { "label": "觸發事件", "color": "#546E7A" },
    "condition": { "label": "觸發條件", "color": "#9A6700" },
    "movement": { "label": "位移控制", "color": "#008C95" },
    "scaling": { "label": "數值縮放", "color": "#BF8F00" }
  },
  "unknownInlineGroup": "effect"
}
```

其中 `[小範圍]`、`[範圍]`、`[大範圍]` 一律屬於 `cast`，使用亮藍 `#1565C0`；正文顯示別名 `[AP]`、`[AD]`、`[防禦]`、`[防禦力]`、`[魔抗]`、`[魔法抗性]` 屬於 `scaling`，使用金色 `#BF8F00`。`AP加成`／`AD加成` 仍是 canonical authoring tag；正文中的屬性框選只負責指出數值作用對象，不得因此重複建立 runtime effect 或把「獲得AD」誤判成「效果依AD比例縮放」。

Package manifest 應只宣告語法與色盤版本，不讓單一 ability 或任意 delta package改寫全域色盤：

```json
{
  "tagPresentation": {
    "syntax": "ggd-tag-markdown@1",
    "paletteId": "ggd-skill-tags-seven-color@1",
    "tagRulesVersion": "1.11.0",
    "tagManifestVersion": "v0.9.45"
  }
}
```

JSON bundle 與 ZIP 的 semantic manifest 都使用同一個 `tagPresentation`。正式色盤由遊戲端的 allowlisted presentation registry 提供；Editor 只宣告預期版本。Importer 不接受 package 內任意 `style`、HTML 或自訂色碼。若未來需要改色，新增 palette id 並做明確相容升級，不原地改寫既有 id。

遊戲端 tokenizer／renderer 規則：

1. 只辨識同一行內、沒有巢狀方括號且長度 1～48 字元的 `[token]`；換行、空標籤或不完整括號保持原文。
2. `\[` 與 `\]` 是普通方括號，不建立 tag token；反斜線只在顯示時移除，不得改寫儲存的 authoring description。
3. 第一行的技能標籤必須是 manifest canonical tag 或已登錄 alias；未知第一行標籤回 `TAG_UNKNOWN` 並拒絕匯入。
4. 正文內已登錄 token 依 manifest／alias group 上色。未知正文 `[token]` 仍以 `effect` 色 `#D84315` 顯示並回報 `UNKNOWN_INLINE_TOKEN` warning，避免技能名稱引用如 `[千年練成]` 消失；warning 不得擅自改寫原文。
5. Renderer 產生受控的 tag node，例如 `<span class="skill-tag skill-tag--cast" data-tag="範圍">[範圍]</span>`；class 與色碼只能來自 allowlisted palette，不執行描述內 HTML、CSS、URL 或 script。
6. Markdown／tag token 只負責呈現。傷害、觸發、施法類型、目標選擇及效果鏈仍以 typed authoring／compiled JSON 為唯一 runtime truth；遊戲邏輯禁止從彩色文字反向推導機制。
7. 無障礙模式可以替換對比更高的 theme，但 group identity、`data-tag` 與原文不得改變；顏色不可是唯一訊息，畫面仍保留完整 `[標籤]` 文字。
8. Editor 的正文標示器必須先保護 `「…」`、`『…』`、`“…”` 引用片段，再做關鍵字標記；引用內如「其實還可以衝刺」只是文案，不可自動變成 `[衝刺]`。
9. `AP`、`AD` 只在完整 ASCII 單字邊界上辨識，禁止把 `GLADIARIA` 之類專名切成 `GL[AD]IARIA`。檢核公式前先將正文 `[AP]`、`[AD]` 還原為 `AP`、`AD`，其他方括號 token 才移除，避免誤判 `AP加成`／`AD加成` 沒有說明依據。
10. `[衝刺]`、`[吞噬]` 等易與笑話、同名或世界觀文字碰撞的詞，只在第一行 canonical tag block 已有對應機制且正文語境是實際效果時才框選。`[詛咒]`、`[擴散]`、`[蓄力]` 是正文 presentation alias，只讓證據可見，不另外建立 runtime effect。
11. 每次匯出前必須做表頭與正文雙向檢核：阻擋「引用內誤標」、「英文專名被截斷」、「碰撞詞無機制依據」與「明確語意未框選」；這些守衛失敗時禁止產生正式 Excel／JSON／ZIP。
12. 全檔規則必須對每份技能說明具有冪等性：已經處理過的說明再套用一次必須完全不變。若任一份說明再次套用後仍會增加或改變標示，回報 `INLINE_RULESET_NOT_FULLY_APPLIED` 並禁止整包匯出。
13. Presentation parser 遇到正文 `[直線]`、`[一直線]` 或 `[前方直線]` 時，必須驗證第一行同時有 `[指向][範圍]`；缺任一個或同時出現 `[指定]` 時回 `LINE_SCOPE_PAIR_MISSING` 並拒絕匯入。Editor Script 可依規則自動校正，但必須在中文 Owner issue 記錄修正前後標籤。

建議載入順序：

1. 驗證 `tagPresentation.syntax`、`paletteId`、`tagRulesVersion` 與 `tagManifestVersion`。
2. 從遊戲內建 registry 取得 palette，再載入同版本 `skill-tag-manifest.json`。
3. 驗證第一行 canonical tags、alias normalization 與 blocked／authorableIn 規則。
4. 保存未改寫的 description source，建立只供 UI 使用的 tokenized presentation AST；不要把渲染後 HTML 回寫 JSON。
5. 編譯及驗證 typed mechanics；presentation warning 不得取代 mechanics error。
6. Apply staging 成功後才原子啟用 content 與相容 presentation metadata。

最低 contract tests：

- manifest 139 個 canonical tags 全部能取得七群組之一及合法大寫 `#RRGGBB` 色碼。
- `[小範圍]`、`[範圍]`、`[大範圍]` 都解析為 `cast/#1565C0`；`[AP]`、`[AD]`、`[防禦]`、`[魔法抗性]` 都解析為 `scaling/#BF8F00`。
- 相鄰標籤 `[主動][指向][範圍]` 產生三個 token，不合併、不重複、不吞掉換行。
- 正文 `[直線]`、`[一直線]`、`[前方直線]` 均要求表頭 `[指向][範圍]`；只有 `[範圍]`、只有 `[指向]` 或 `[指定][範圍]` 都必須檢核失敗。
- `\[範圍\]`、`[]`、缺右括號、巢狀括號、超過48字元與包含換行者保持純文字。
- 未知第一行標籤被拒絕；未知正文標籤保留原文、使用 effect fallback 並產 warning。
- JSON 與 ZIP 載入同一內容時產生相同 presentation AST 與相同 package semantic digest。
- 描述中的 HTML、`style=`、URL、script 字樣永不成為可執行 DOM；renderer 只建立 allowlisted span/class。
- Palette／manifest 版本不相容時回 `TAG_PRESENTATION_VERSION_MISMATCH`，不得默默使用另一套顏色。

### 2.2 Flat stack 與真正兩段效果的分界

`template.cards` 只會把各卡輸出攤成同一份 top-level `effects[]`，而 `runEffects` 會在同一個 resolve tick 依序派發。它適合「同一施放階段、相同 target context」的效果組合，例如同一落點同時造成兩個可分辨的效果。

它**不能**表達「先位移，完成後才爆炸」。目前 `dash` handler 只啟動 movement override，沒有 `onEnd／onLand` payload；平面 `[dash, instant-blast]` 會在 cast tick 立刻執行 blast。GGD 自己已在 `tpl-charge-push` 的 expander 註明此陷阱，改以 apex=0 的 `leap.onLand` 表達地面衝鋒後結算。

所以遊戲端與 Editor compiler MUST：

1. 同階段、同 context 的 Products 才可 lowering 成 legacy `template.cards`。
2. 有時間、命中、落地、tick 或 selector dependency 的 chain 必須保留 `onHit／onLand／onTick／onTargets` typed child edge。
3. 現有能力能以 `leap.onLand` 精確表達時使用它；若語意確實要求 collision-aware dash completion，新增 `effect.dash-on-end@1` 或等價正式 capability。
4. Capability 不存在時回 `unsupported-runtime`，禁止把 nested chain 攤平成 `[dash, blast]` 後宣稱成功。

即使是 flat stack，也不能把 16 個 enabled templates 任意排列就視為可組。Compiler 必須先驗 activation kind（active／passive）、cast type、target selection、target context、timing 與 singleton fields 的相容矩陣；特別是 `lastWins` 可能改變整支技能的 target selection，使前卡效果套到錯的對象。Raw `ExpandResult` 成功但合併後 `zAbilityDoc` 失敗，仍是完整失敗，不能標記為可預覽或可匯出。

Compiled `ability@1` 也必須明確二選一 authority：

- `legacy-template-binding`：只有完全符合現有 flat stack 語意時，才保留 `ability.template`，由 GGD resolver重展開。
- `native-effects`：graph-v1／nested Product chain 編譯成完整原生 effects／passive，並 **MUST 移除 `ability.template`**。若仍保留 template，`mergeExpansion()` 會在載入時移除 skeleton 的 expanded keys、重新展開 cards，覆蓋 Editor 已編好的 nested effects。

Importer 對同時宣稱兩種 authority 或 template 與 native effects 不一致的文件回 `COMPILED_AUTHORITY_CONFLICT`，不得猜哪份優先。Definitions／Products／graph／provenance 留在 package authoring store，不靠 runtime `ability@1` 保存。

### 2.3 現有 Editor Preview 不能當行為模擬器

Pinned GGD 的 `apps/editor/src/preview/PreviewController.ts` 目前只把展開結果整理成靜態 effect lines／數值摘要；它沒有建立敵我單位、送出 IntentFrame、真正 cast、推進 ticks 或核對 HP／位置／事件。`forgeStudioStack.test.ts` 又 mock 了 PreviewController，因此只能證明 UI 有呼叫 expansion，不能證明第二張卡在 gameplay 發生。

在新本機 Editor 中，這個畫面只能當 read-only expansion inspector。正式驗收必須由獨立的 `PreviewScenarioWorld` 走真實 loader／registry／IntentFrame／SimWorld，再把每 tick state／events 投影到 3D renderer；沒有 mechanics assertions 時，即使粒子看起來正確也不能標綠。遊戲端 P2 的 render bridge 只負責呈現正式 sim state，不另建第二套命中／位移規則。

## 3. 目標架構

```text
Editor JSON／ZIP
       │
       ▼
Content Import API
  ├─ transport safety／hash／base CAS
  ├─ staged authoring store
  ├─ Definition + Product-DAG + Host compiler
  ├─ expected compiled compare
  ├─ runtime content tree + distribution rebuild
  ├─ ContentLoader／refs／registry／scenarios
  └─ immutable version writer
       │
       ▼
atomic ACTIVE pointer switch
       │
       ├─ game shards read one activation digest
       └─ rollback switches to previous verified digest
```

Active version 必須同時保存：

- authoring store digest。
- compiled runtime content digest／contentVersion。
- distribution index digest。
- compiler／runtime capability fingerprint。
- activation digest 與上一個 verified activation。

Authoring 與 compiled runtime tree 不可分別切換，否則 editor 下一次 delta 會讀到不一致的 base。

建議儲存布局：

```text
data/content-import/
  active.json
  versions/<activationDigest>/
    manifest.json
    authoring-bundle.json
    runtime-bundle.json
    distribution-index.json
    validation.json
    provenance/...
  operations/<operationId>.json
  stages/<operationId>/...
```

規則：

- `active.json` 必須是小型、可原子替換的 pointer，不在其中塞完整 bundle。
- TypeScript shared package負責 authoring schema、compiler、dependency graph 與 runtime semantic validation；Go platform 只負責管理員 API、upload、權限、operation orchestration／audit，不得重寫第二套 compiler 規則。
- 初版 activation 後可明示要求 shard reload，狀態回 `activated-awaiting-reload`；不要在 mutable global registry 上假裝安全 hot reload。
- 新 match 固定建立時的 activation／ContentSnapshot；既有 match 不得中途換 registry。
- legacy content overlay 與新 activated package 的 precedence 必須固定。建議 gameplay content 進入新 importer 管理後，禁止再被舊 overlay 靜默覆蓋。

## 4. P0：Importer 與 authoring store

### 4.1 新 API

建議：

- `GET /api/v1/content-import/capabilities`
- `GET /api/v1/content-import/active/target-profile`
- `POST /api/v1/content-import/validate`
- `POST /api/v1/content-import/apply`
- `POST /api/v1/content-import/rollback`
- `GET /api/v1/content-import/operations/<operationId>`
- `GET /api/v1/content-import/active`
- `GET /api/v1/content-import/active/runtime-bundle`
- `GET /api/v1/content-import/health`

`validate` 與 `apply` 接受 Package JSON／ZIP；`validate` 不得改 active state。Raw `ability@1`／`item@1` Runtime Document JSON 不得被這兩個 package routes 誤認，也不得直接寫入 managed authoring store；若日後支援，另做明確命名且仍走 staging 的 single-document adapter。`apply` 必須同時要求前一次 validate 產生的 `planDigest` 與 `If-Match` 或等價 CAS，拒絕 stale plan／base。回應使用 `ggd-content-import-result@1`，至少回 package、plan、authoring、content 與 activation digests，以及 stable diagnostics。

`target-profile` 回傳或下載 `ggd-content-target-profile@1`，至少包含 active activation／authoring／content／distribution digests、compiler contract／fingerprint、runtime capabilities、asset-manifest digest、live champion/item curation digests、產生時間與簽章／後台驗證資訊。本機 Editor 將此檔作離線 base receipt；缺少精確 profile 時不得產 production-ready delta。

Capabilities 至少列：

- package／authoring schema versions。
- compiler contract／fingerprint。
- max archive／entry／document／expanded graph／scenario budgets。
- `bootstrap | full | delta` modes。
- atomic activation／rollback／CAS。
- runtime effect／hook／distribution／scenario capabilities。
- mechanics registry fingerprint，以及各 capability 的 event-context、state-scope、RNG、budget 契約版本。
- 90 份 Owner 技能 regression fixture set 的 source digest、已通過 scenario digests 與未支援 capability 清單。
- active activation／content／authoring digests 與 `authoringStoreState`。
- `reloadMode: process-reload | new-match-snapshot | hot-reload`。
- VFX-document authoring 是否啟用；核心 V1 預設 false。
- target profile schema／freshness policy，以及 live champion／item curation digests。

`active` 要能查到目前 pointer 與上一個 verified activation；`active/runtime-bundle` 是 server／client 共用的不可變 runtime snapshot；`health` 要區分 `activated`、`activated-awaiting-reload`、`degraded` 與 `rollback-required`。

### 4.2 Bootstrap／full／delta

目前基線沒有 Product authoring store，不能直接安全接受 delta：

- `bootstrap`：第一包攜帶 deterministic legacy migration 產生的完整 authoring corpus與 migration fingerprint。
- `full`：已有 authoring store 時建立完整的新 immutable snapshot；不是直接覆寫 active tree。V1 禁止 delete，因此 package 必須包含 base 全部 membership，遺漏即 `implicit-delete-forbidden`。
- `delta`：pin target profile 的 `base.activationDigest` 與 `base.authoringDigest`，以 target base + `selectionRoots[]`／`changes[]` 建 staging；缺少的 exact refs 只可從該 immutable store解析。

第一次 bootstrap 必須將 authoring store持久化。若遊戲端不保存它，就只支援每次 full，不支援 delta 或完整 editor round-trip。

Manifest 的 base 至少同時 pin `activationDigest` 與 `authoringDigest`，compiler 同時 pin `contractVersion` 與 `fingerprint`。Partial staging 不得讀取 package 未選入的 Editor workspace 變更；importer 先套 selected changes，再加入必要 forward dependencies 與受影響 reverse closure。

Ready Product 不可原地更新，exact refs 也不自動跟隨新 revision。作者必須明示讓哪些 ref owners 採用新 revision；importer 才以這些 changed ref owners 為根，依 reverse dependency closure 重編直接／間接使用者。Promote to Shared 另需驗 transitive dependency scope：shared Product 不能留下對 host-local child 的引用；必須拒絕或讓作者明示一併 clone／promote dependency closure。

### 4.3 Transport safety

ZIP 驗證至少包含：

- zip-slip、symlink、device、duplicate／case collision、zip bomb、entry count／ratio／size limits。
- allowlisted POSIX paths、UTF-8、manifest schema。
- JCS `contentSha256`、ZIP `rawSha256`、semantic packageDigest。
- base gameRevision／contentVersion／authoringDigest。
- required capabilities／dependencies／asset-manifest hashes。

Package JSON 提供 semantic round-trip；ZIP 另提供 byte-preserving entries。兩者使用同一 package semantic digest。Raw Runtime Document JSON 是 compiled-only 相容輸出，不保留 Product／Definition／where-used，也不提供 mirror、distribution、index 原子性。平台搬遷 ZIP importer 不得共用此 route。

### 4.4 Shared schema／compiler

遊戲端與 editor 必須對同一組 golden fixtures 得到相同結果：

- `effect-template@1`
- `effect-product@1`
- embedded `effect-chain@1`
- `ability-authoring@1`
- `item-authoring@1`
- `release-scenario@1`
- `ggd-editor-import@1`／`ggd-editor-package@1`
- `fidelity-decision@1`
- `ggd-content-target-profile@1`

`effect-graph-v1` 是 P0 normative compiler contract：封閉 typed AST、deterministic finite-number semantics，明訂 rounding、overflow、NaN／Infinity、divide-by-zero 及 absent／null／default；禁止任意 script、clock、I/O、network、dynamic import 與 compile-time RNG。Compiler 必須執行 node／depth／output／target／event／runtime budgets，並以版本化 primitive registry／capability keys 驗證；unknown node、path 或 capability 一律 fail closed。

Compiler 驗證順序：

1. Definitions。
2. 建立 `Product → owned Chain → ProductRef` DAG，驗 exact contentSha256、scope、hostKinds、cycle 與 budgets。
3. 由 leaves 拓撲 compile Products。
4. 建立 `ability-augment@1` 的獨立 typed dependency graph；驗 source／target exact refs、stable term／edge ids、allowlisted operations、condition context、cycle 與 reverse closure。
5. 建立 state registry；驗 state key、exclusive group、scope、stack／expiry、onEnter／onExit 與 ledger lifecycle 無衝突。
6. 驗 Host-owned chains／Hosts，並將 augments 依拓撲順序套到對應 stable edges。
7. 從完整 authoring graph 重算 required capabilities、event contexts、RNG draws 與 budgets，對照 target profile。
8. 產 `ability@1`／`item@1` 與 expected runtime documents。

禁止：

- 任意 JavaScript／expression string／動態 import。
- unknown params 無聲忽略。
- host-local Product 被跨 host 引用。
- inplace 改 ready Definition／Product revision。
- 缺 capability 時以語意不同的舊 EffectDef 近似輸出。
- 用顯示名稱、tooltip 字串或位置 JSON Pointer 代替 exact ability／status／state／term ref。
- 把 block、execute、damage-type conversion、reflect-success 或 lethal interception lower 成受傷後的普通 effect，因為它們的執行順序不同。

Fidelity enforcement：

- 不一致的 description、JASS、runtime JSON 與 runtime trace 必須有對應 `fidelity-decision@1`。
- 合法決策是接受 runtime、依描述／JASS 以現有 typed mechanism 重做，或 request-new-capability；後者直到 capability 存在前都 blocked。
- Decision 綁 evidence、compiler、Product、scenario hashes；任一不符即 stale。
- `acceptedWarnings[]` 不得豁免 unresolved fidelity conflict、missing capability、compiled mismatch、target-set semantic loss 或 stale base／CAS。
- Package 內的本機 reviewer 字串不是授權證明；正式 apply 仍需後台已驗證的操作者權限與 audit identity。

#### 4.4.1 Legacy `template.cards` 驗收守衛

這組守衛必須分層，不能把現有 unit tests 重複命名成 E2E：

1. **Expansion／provenance**：沿用並擴充 `packages/shared/src/content/templates/stack.test.ts`。兩張 shipped enabled templates 展開後，第二張必須有非零 contribution，合併後 effects／hooks 依序存在，scalar conflict／shadow trace 精確。
2. **Resolver／final schema**：三種 binding shape 的同義 fixture 都要通過；第二卡 missing ref、invalid params、active／passive 不相容或 scalar conflict 時，整組失敗且不能產生 partial card 1 result。Expansion 後必須再通過完整 `zAbilityDoc`，不能只斷言 raw `ExpandResult.ok`。
3. **Loader／registry**：建立隔離的 synthetic `ability@1`（不進 production corpus），使用真正 `{cards:[...]}`，走 `ContentLoader → resolveTemplateExpansion → registerAll(...throw)`；registry 讀到的 ability 必須同時包含兩張卡的 compiled contributions。這一層專門防止 consumer 又退回只讀 `template.ref`。
4. **Flat-stack SimWorld behavior**：用同 cast phase、同 target context、可分辨結果的兩張卡，從 `IntentFrame.commands → castAbility → runEffects → world.step` 施放；至少對兩張卡各有一個獨立 state／event assertion，不能只斷言 `effects.length===2`。
5. **Nested timing behavior**：另用 `leap.onLand`／compound Product fixture；起飛後、落地前必須零爆炸傷害，落地 tick 才命中正確 victims。這不是平面 cards 測試，而是防止 compiler 將 child edge錯誤攤平。
6. **Editor parity**：同一 fixture 經 Editor compiler、Package JSON／ZIP reopen 與遊戲 importer重編後，以上 trace／state digest 完全相同。

Mutation gate 至少實際證明下列變異會讓測試變紅：

- `expandStack` 不 append 第二張 card 的 effects／hooks。
- resolver 只使用第一個 `ref`，忽略 `cards[1..]`。
- runtime 只執行 compiled effects 的第一項，或第二張 contribution 被 drop。
- compiler 把 `onLand` child 搬到 top-level，使爆炸提早到 cast tick。
- `onConflict=reject` 不再阻擋不同 scalar，或 `lastWins` 沒有真正換 winner。
- 第二卡錯誤時改成靜默保留第一卡，或 `degrade` ledger 被當成 validate 成功。
- unknown param typo／`null` 被默認值吞掉，或 raw expansion 未經 final `zAbilityDoc` 就標綠。

現有 `stack.test.ts` 已記錄 expansion、passive merge、conflict 與 normalizer mutation；現有 `forgeStudioStack.test.ts` 證明 UI 操作會進 `expandStack`，但它 mock 了 PreviewController。故新增工作重點是 loader + 真正 SimWorld + package parity，不是重寫已有單元測試。

### 4.5 Staging 與 activation

Apply 前：

1. 建新的 immutable staging version。
2. 從 pinned target base 套用 package `selectionRoots[]`／`changes[]`；驗證 partial 沒有夾帶未選的本機文件，full 沒有 implicit delete。
3. 解析 exact forward dependencies；依作者明示的 Product ref adoption、`ability-augment` target、status／state／cooldown refs 計算 reverse dependency closure。
4. 驗 Fidelity Decision freshness、owner authority 與 required capabilities。
5. compile 兩次並比對 expansion／compiled hashes。
6. 比對 package expected compiled docs。
7. 重建 standalone abilities/items、champion mirrors、distribution、indexes、manifest、bundle、contentVersion。
8. 跑正式 `ContentLoader`、strict refs、template expansion、mechanics registry／event-context validation、`registerAll(...throw)`、assets 與 release scenarios，並必須包含 package 宣告的 90-skill fixture 子集。
9. 產 planDigest；以 CAS 再驗 active base。
10. 寫完且 fsync／durable 後才切 ACTIVE pointer。
11. 依 `reloadMode` 回 `activated` 或 `activated-awaiting-reload`；shard 真正載入後再由 health 回讀其 activation digest。

任何失敗都不切 ACTIVE。Rollback 只切到已存在且驗證過的 activation digest，不逐文件做 best-effort 補償。

Server 與 client 必須讀同一 active runtime bundle。新 match 在建立時 pin activation／ContentSnapshot；當時已在進行的 match 繼續使用舊 snapshot，不在對戰中切 registry。

## 5. P0：Item distribution／reachability

目前傳說武器正式分類來自 loot-table membership；另有 quest、round offer、orb、shop、recipe、attack-type gate，以及 Go hard-coded curation。只載入 `item@1` 可能讓內容存在但玩家拿不到。

遊戲端建議：

1. 新增／持久化 `distribution-index@1` derived projection。
2. 由完整 staged `item-authoring@1.distribution` 重建各 runtime collection。
3. 同時計算 `contentReachable` 與 `effectiveReachableUnderCuration`：前者表示內容圖可達，後者還要納入當前營運 whitelist／feature flag。
4. Package 不得靜默覆寫管理員 curation。若 authoring 宣告 `mustBeEnabled` 但被 curation 擋住，apply 必須拒絕或要求另一次明確 curation approval；否則可啟用內容，但結果必須回報「已存在、目前不可取得」。
5. 每個 declared channel 產 `reachable | unavailable-under-curation | unsupported | conflict`；不得把 content 存在當成營運上可取得。
6. recipe component／book、loot table、quest、offer、orb、shop、class／attack-type refs 全部 strict validate。
7. rename／delete impact 必須反查全部 distribution、recipe、buildPriority 與其它 hard refs；V1 package 本身仍禁止 delete。

不能用 tag、tier、craftRole 或 item 名稱猜傳說分類。

### 5.1 Champion whitelist／pickability

Pinned `starterChampions` 是 53 名 starter roster，不是部署環境當下的 live whitelist。Owner 已從這份清單選定 43 名驗證英雄，但 importer／target profile 必須另帶 live champion curation digest 與完整 IDs，不能用 starter 名單覆蓋管理員設定。Selection manifest 必須明示 258 個 slot records、257 份實際 ability docs，以及 `godie-ogld.passive = MISSING_SOURCE`；缺件不能被當成 ZIP 漏檔或自動補 placeholder。

遊戲端也應統一 server／client pickability authority：client 會把 transformed body 解析回 base 或排除，`MatchController.selectChampion` 與 `randomChampionPool` 目前只做 content/model/whitelist/ownership 交集，未套同一 transformed／retired 規則。若管理員 live whitelist 誤勾 alternate body，crafted select、bot、timeout random 或 mob champion pool 仍可能使用它。建議新增 shared、server-authoritative `isPickableChampionId／resolveBaseChampionId` 契約，所有 manual、random、bot、mob、ownership 與 curation validation 共用；target profile 另回報 `invalid-or-alternate-whitelist-entry` diagnostics。這是遊戲端建議，不在本專案修改 GGD。

## 6. P1：`effect.target-set-chain@1`

### 6.1 為何需要

49 件全量 census 中，`godie-i03h` 目前依序執行 `damageArea → applyStatus`：前者私下選 AOE victims，後者仍讀原始 `ctx.targets`。結果可能是旁人受傷卻不暈，而既有測試仍假綠。

只新增 importer 不能修正 handler 語意。遊戲 runtime 需要正式的 selector + nested chain primitive。

### 6.2 建議契約

可採任何等價的正式 schema，但必須具備：

- selector 輸出 deterministic、typed named target set。
- child chain 以明確 scoped context 執行。
- 平行下一個 effect 不繼承私有 target set。
- victims 排序、maxTargets、team／dead／collision 規則固定。
- nested origin／cast／Product provenance 可保存。
- depth、node、target、event 與 recursion budgets。
- no mutable shared `ctx.targets` side effect；避免重入與跨 effect 汙染。

建議 capability key：`effect.target-set-chain@1`。

### 6.3 必測案例

- `i03h` primary target + 旁人：同一 victims set 同時 damage + stun。
- self／ground cast 沒 primary target。
- includeOrigin、maxTargets、等距 deterministic order。
- immuneControl 只拒絕 stun，不改 damage target set。
- child Product failure 不可留下半套 mutable context。
- 移除 target propagation guard 的 mutation test 必須變紅。

## 7. P1：`hook.on-evade@1`

`godie-i01s` 已有 evasion stats、正式 evade presentation event與 dash primitive；缺的是成功閃避結果到 defender item hook 的安全 bridge。不可從共用畫面 `evade` event 反推，因為 attacker fumble 也可產生相似的呈現。

建議：

1. 擴充 HookEvent union：`onEvade`，並定義 `basic | ability` channel。
2. 只能由真正成功的 `rollEvade`／`rollEvadeAbility` 寫入 deterministic pending hook；`rollFumble` 必須是零觸發。
3. 明訂 hook 在同 tick 尾端或下一 tick 執行，不能讓語意取決於系統偶然排序；建議排入 deferred hook queue，避免在 attack resolution 中同步重入 effect runner。
4. context 至少帶 defender、attacker、channel、attack origin／direction、tick、RNG lineage。
5. hook 的 chance／ICD／condition／target 仍走共用 HookSystem。
6. child Product 可用既有 `dash{mode,speed,maxDistance}`，但 facing／反攻方向、牆、邊界、碰撞規則需 owner 定義。
7. evade 已使攻擊 miss 時，不得又觸發 on-hit、lifesteal 或 damage-taken hooks。

建議 capability key：`hook.on-evade@1`。完成前 `i01s` 維持 fidelity blocker。

## 8. P1：Refs 與 item capability 判定

49 件傳說武器 census 與全 corpus trace 已命中：

- refs walk 至少漏 `leap.onLand`、buff hook effects、item recipe component／book、aura hook effects，並必須預留未來 target-set child chain 的遞迴。
- status／VFX soft refs 不足以作 release gate。
- `itemHasEffect` 未涵蓋 attributes、auras、vision、flight、damageTypeOverride、block、critStrike 等已存在 payload。

遊戲端應提供完整 schema-driven recursive ref collector，並分 draft／release policy；release package 的 runtime refs、distribution refs 與 assets 必須 strict。`itemHasEffect` 應由完整 typed capability inventory 取代，不再維護手寫落後清單；MerchantShop 與 reference generator 若複製相同舊判定，也要一併改成同一 authority。

## 9. P2：正式 Preview／Render seam

Editor 在不改 GGD 的前提下可用 pinned private source bridge，但長期維護建議遊戲端提供版本化的 `@ggd/client-preview` 或等價 public package：

- Arena／EntityView／AssetManager／VfxSystem 的窄 entry points。
- 不含登入、網路、HUD、prediction 與完整 GameApp state machine。
- 以 immutable ContentSnapshot + SimWorld state/events 驅動畫面。
- 暴露 capability／source fingerprint，破壞性變更可被 contract test 偵測。
- asset resolve result 明確區分 exact、runtime-derived、missing／unknown。

這不是 P0 importer 的必要條件，但會降低 editor 每次 GGD 升級時 private deep import 的風險。

## 10. P2：Event provenance

目前部分 combat／VFX event 缺 castId、abilityId、effect path／Product origin。Editor sidecar 可輔助除錯，但不能當正式 release truth。

建議正式 event seam逐步加入：

- castId／abilityId／itemId。
- ProductRef／compiled effect path。
- source／target／point／direction。
- cause／parent event／RNG stream。
- VFX resolved key／authority／spawn location。

加入時要保持 deterministic serialization、network／replay compatibility 與 event budgets。舊 consumer 可透過 optional fields 或新 major event schema 遷移。

## 11. P2：VFX authority 與文件新鮮度

- 核心 V1 只編 host／Product 對既有 VFX 的 binding；不要求遊戲端支援 emitter／ribbon authoring。
- 若日後開 `vfx-document-authoring@1`，importer 才接受 `authoring/vfx`／`compiled/vfx`，並重驗 texture／model／ribbon refs 與 GPU budgets。
- 目前 270／696 技能的最終 VFX 由 code promotion 決定。長期可把 promotion tables 轉成 content；完成前 editor 必須唯讀。
- importer 必須重建並 hard-gate machine indexes／manifest／bundle／distribution／mirrors；package 內的舊 derived docs不可成為 truth。
- README／reference／status 新鮮度屬於 GGD repository CI gate；production importer 只可報告基線 stale，不應嘗試修改 source tree 或把人讀文件當 active runtime gate。

## 12. 遊戲端建議實作階段

### G0 — Freeze contract／golden fixtures

- D19／D20 已裁決：host-local + explicit Promote、安全 `effect-graph-v1`；實作共同 contract tests。
- freeze schemas、capabilities、hash／digest、bootstrap/full/delta、Package JSON／ZIP／raw Runtime JSON 分界與 diagnostics。
- 匯入 owner 選定 43 名英雄的 regression manifest（257 abilities／172 QWER mirrors／1 missing-source slot）；49 件傳說武器全部列為 census fixtures。其中 2026-08-08 的 15 名英雄／90 份 Owner 技能是第一組強制行為黃金子集，必須 pin source digest。Graph primitive inventory 在這組機制契約與 43+49 census 完成後 freeze。
- editor 與 game 共用 valid、one-fault、tampered、malicious ZIP fixtures。

### G1 — Read-only validate

- capabilities + validate API。
- transport safety、authoring store staging、compiler、compiled compare、full-tree loader。
- 不切 active；先用 bootstrap fixture證明能重建既有 base。

### G2 — Atomic apply／rollback

- immutable version storage、CAS、ACTIVE pointer、health read-back、operation log。
- crash／power-loss／concurrent apply／failed health injection。
- server／client 讀同一 active bundle；啟用後狀態明示 `activated-awaiting-reload`，新 match pin 新 activation、舊 match 保留舊 snapshot。

### G3 — Distribution

- distribution-index、runtime collection compiler、curation consumer 遷移、reachability gates。

### G4 — Gameplay capabilities

- `effect.target-set-chain@1`。
- `hook.on-evade@1`。
- 共用 `defense.block-source@1`、`effect.convert-hit-damage-type@1`、`hook.on-reflect-success@1`、`hook.on-lethal-damage@1`。
- status／ability-state／equipment／stack typed conditions，以及 `ability-augment@1` 的 exact-ref compiler。
- `state.exclusive-group@1`、`state.lifecycle@1`、`hook.consume-policy@1`、`effect.charge-ledger@1`。
- `effect.event-value-conversion@1`、`effect.weighted-branch@1`、`effect.execute@1`、`defense.mana-barrier@1`、`effect.swap-resource@1`。
- `scheduler.random-area@1`、`effect.control-restriction@1`、`effect.modify-cooldown@1`。
- Legacy multi-card loader + real-cast SimWorld guard。
- Legacy authoring strict params／all-or-nothing expansion／final-schema guard；runtime `degrade` 不得進入 importer success path。
- `effect.dash-on-end@1` 僅在 owner 選擇 collision-aware dash completion 語意時加入；否則以既有 `leap.onLand` 精確表達可支援案例。
- 對應 scenario、mutation、determinism tests。

### G5 — Preview／provenance／VFX 後續改善

- public render package。
- event provenance。
- content-owned VFX promotion 與選配 VFX document importer。

每階段完成後仍必須保持 legacy game content 可啟動；未支援的新 capability 由 importer 明確拒絕，不做 silent downgrade。

## 13. 遊戲端完成條件

### Importer

- 同 package 在 editor reference validator 與 game importer 得到相同 authoring／compiled／plan digests。
- 篡改 authoring、compiled、scenario、report 或 manifest 任一 entry 都被拒絕。
- bootstrap 能產完整 authoring store；delta base authoringDigest 不符時回 conflict。
- Product 新 revision只對作者明示採用的 ref owners生效，再依 reverse dependency closure 重編全部直接／間接使用者；Promote 不留下 shared → host-local dependency。
- compile 兩次完全一致；unknown params／refs／capabilities 不會 silent ignore。
- partial selection 不洩漏未選本機變更；full 遺漏 base membership 時拒絕 implicit delete。
- raw `ability@1`／`item@1` 不會被 package endpoint 誤認。
- unresolved／stale fidelity decision、request-new-capability、compiled mismatch 與 stale target profile 全部 fail closed。

### Activation

- ability、item、mirror、distribution、indexes、bundle 永遠來自同一 activation。
- server 與 client health 回報同一 activation digest；重載前明示 awaiting-reload，不假報已生效。
- 任一步失敗 active digest 不變。
- crash 後只能看到舊完整版本或新完整版本，不可看到半套。
- rollback 不重編、不逐文件覆寫，只切到 verified immutable version。
- 並存 match 各自繼續使用建立時的 activation，沒有中途替換 registry。

### Gameplay

- Synthetic legacy two-card ability 必須走完整 loader／registry／IntentFrame／cast／SimWorld；兩張 card 各有獨立 state／event assertion，刪掉第二張 contribution 的 mutation 會紅。
- 第二張 card 的 missing ref／invalid params／conflict／final-schema failure 都使整組匯入失敗；unknown／`null` params 不得退回 default，active／passive 不相容不能只因 raw expansion 成功而放行。
- Flat stack fixture 在同一 resolve phase 執行；nested landing fixture 在落地前零傷害、落地 tick 才命中實際 landing victims。Compiler hoist child effect 的 mutation 必須變紅。
- `i03h` damage／stun 對同一 deterministic victims set；移除 guard 的 mutation test 失敗。
- `i01s` 真正 basic／ability evade 後 hook 各恰好一次、attacker fumble 零次、miss 不觸發 on-hit，dash 遵守 owner collision rules。
- 90-skill 子集的 compiled graph 不得有 `DESCRIPTION_MECHANIC_UNCOVERED`；22 個高程度 template gap 只能被真實 typed Product／capability 關閉，不得手動豁免。
- block 在 HP 扣除前、reflect-success 在反彈封包確實建立後、lethal hook 在 death commit 前；三種時序的 mutation 互換後測試必須變紅。
- 跨技能 augment 依 exact ref 重編 reverse closure；刪除、改名或重排 target Product 的 stable edge 時 fail closed，不得套到相鄰效果。
- 反彈傷害轉 MP／AP 使用同一 captured value；weighted branch 每次只 draw 一次；隨機區域同 seed 的落點、目標、事件與 digest 相同。
- 十二道試煉的 ledger 跨 round 不跨 match；多發致命封包、反彈致命、同 tick 致命與充能用完都有 exactly-once scenario。
- 風王結界手動關閉與 MP 不足自動關閉都走同一 onExit child；涅吉三種變身不能同時存在，而形態限定的普攻／冷卻效果在切換 tick 即時更新。
- 30Hz timing 顯示 authored seconds／resolved ticks／actual seconds；低於一 tick不被無聲吞掉。
- block、vision、interval、RNG 與跨裝備 stacking 有 shipped-item scenarios。
- 若啟用 `effect.dash-on-end@1`，completed／blocked／death／reset 的 trigger policy、actual stop point、exactly-once 與 collision 都有明示 schema和 mutation guards；否則 importer 不宣告此 capability。

### Distribution／refs

- imported legendary／quest／offer／orb／shop item 符合宣告 reachability。
- recipe、aura hook、status、VFX、asset 與 buildPriority refs 全量掃描。
- 不再因 hard-coded whitelist 漏掉新 item。
- Live champion curation 中的 transformed／retired／unknown entries 被 server-authoritative pickability gate拒絕或明確正規化；manual、random、bot、mob paths 結果一致。

## 14. 不應由遊戲端實作的功能

- 地形／地圖／region／trigger editor。
- 外部 binary asset upload。
- 在 importer 執行 arbitrary script。
- 信任 editor report 而跳過 server-side compile／validation。
- 用現有平台搬遷 ZIP importer 載入內容包。
- 讓 game runtime 反向依賴 Electron／React／editor UI。

## 15. GGD 現行路徑與建議落點

以下是 pinned commit 上的實作導航圖，不是對這些檔案的修改授權；遊戲端重構後可移動，但契約與測試不應丟失。

| 關注點 | 現行路徑 | 建議工作 |
|---|---|---|
| Legacy template stack | `packages/shared/src/content/schema/template.ts`<br>`packages/shared/src/content/templates/expand.ts`<br>`packages/shared/src/content/templates/resolve.ts` | 保留三種 binding shape／flat merge semantics；補 loader + SimWorld multi-card E2E |
| Effect schema | `packages/shared/src/content/schema/effect.ts` | 新 target-set child-chain schema／capability |
| Effect runtime types／runner | `packages/shared/src/sim/effects/effect.ts`<br>`packages/shared/src/sim/effects/effectRunner.ts` | scoped child context、budget、provenance |
| Hook／condition context | `packages/shared/src/content/schema/condition.ts`<br>`packages/shared/src/content/schema/effect.ts`<br>`packages/shared/src/sim/effects/hooks.ts`<br>`packages/shared/src/sim/stats/modifiers.ts` | 新 reflect-success／evade／lethal 事件；status／ability-state／equipment／stack 條件；context availability 載入時檢查 |
| Ability augment／cooldown refs | `packages/shared/src/content/schema/ability.ts`<br>`packages/shared/src/sim/abilities/abilitySystem.ts`<br>`packages/shared/src/sim/abilities/abilityPassives.ts` | 獨立 `ability-augment@1` schema／compiler／reverse closure；stable term／edge ids；reset／remaining／future-cast 冷卻語意 |
| 傷害前防禦／型別轉換 | `packages/shared/src/sim/combat/block.ts`<br>`packages/shared/src/sim/combat/damage.ts`<br>`packages/shared/src/content/schema/item.ts` | 把 item-only BlockGrant 提升為共用 source；加入原 hit damage-type conversion 與 mana barrier，固定 block／shield／hp-loss／reflect 順序 |
| AOE／status 目標 | `packages/shared/src/sim/effects/damageArea.ts`<br>`packages/shared/src/sim/effects/applyStatus.ts` | 共用 deterministic selected target set |
| Evasion outcome／hooks | `packages/shared/src/sim/combat/evasion.ts`<br>`packages/shared/src/sim/effects/evasion.ts`<br>`packages/shared/src/sim/stats/modifiers.ts` | 真 evade 專用 pending hook；fumble 不觸發 |
| State／charges／exclusive forms | `packages/shared/src/sim/SimWorld.ts`<br>`packages/shared/src/sim/systems/ChampionFormSystem.ts`<br>`packages/shared/src/sim/stats/statPipeline.ts` | 穩定 state registry、round／match lifecycle、charge consume、all-at-once／per-stack expiry、exclusive group 與 digest／replay 序列化 |
| Deterministic branch／scheduler | `packages/shared/src/sim/effects/effectRunner.ts`<br>`packages/shared/src/sim/SimWorld.ts` | 一次 RNG 的 weighted branch、random-area scheduler、draw／entity／event budgets 與 replay lineage |
| Dash completion（條件式） | `packages/shared/src/sim/effects/dash.ts`<br>`packages/shared/src/sim/systems/MovementSystem.ts` | 只有 collision-aware stop payload 需求成立時新增 typed `onEnd` + stop reason + exactly-once guard |
| Hard refs | `packages/shared/src/content/refs.ts` | schema-driven exhaustive recursive traversal |
| Item tier／distribution | `packages/shared/src/sim/economy/itemTiers.ts`<br>`apps/platform/internal/curation/starter.go` | distribution index 與 curation 狀態分離 |
| Client VFX／render seam | `apps/client/src/vfx/VfxSystem.ts`<br>`apps/client/src/render/EntityViewRegistry.ts`<br>`apps/client/src/render/ArenaScene.ts` | 公開、版本化 preview bridge |
| 現有 Editor preview | `apps/editor/src/preview/PreviewController.ts`<br>`apps/editor/src/forge/forgeStudioStack.test.ts` | 現況只產 effect lines，UI test mock controller；不可當多卡行為驗收，需真正 IntentFrame cast + targets + ticks |

Importer／authoring store 建議新增獨立 module，不要拼進現有 platform migration ZIP route；具體檔案位置由遊戲端 owner 依服務邊界決定。

## 16. 需要 owner 提供／裁決

1. 首次 authoring store 由 pinned migration 產生，或由第一個完整 bootstrap package 提供。
2. active content 的 immutable storage／ACTIVE pointer 要落在哪個服務與部署邊界。
3. 啟用後初版採 process／shard reload 或投資 per-match hot reload；本文建議前者。
4. `i03h` damage + stun 是否確定共用 victims，以及 meteor VFX／delay／音效。
5. `i01s` onEvade 同／下一 tick，dash distance／speed／direction／ICD／collision。
6. `i06o` 0.01 秒量化、88 damage budget、refresh／stacking。
7. 選定技能若含「dash 實際停止後觸發」，是否要求撞牆提前停止也觸發、stop reason與死亡／reset規則；若只是固定落點後觸發，使用既有 apex=0 `leap.onLand`。
8. Package 可否提出 curation 變更，以及 `mustBeEnabled` 的獨立批准流程。
9. 每個 distribution channel 的正式 runtime consumer與舊 hard-coded curation 淘汰順序。
10. 正式 event schema 是否加 provenance；若否，Editor sidecar 只能作本機預覽診斷。
11. 哪個 staging／CI 環境可讓遊戲端跑 importer golden fixtures；不要在對話提供 production secret。
12. 太陰道的「反彈傷害」以 `raw | mitigated | hpLost` 哪個為基數；AP 疊層是每層各自 5 秒，或所有層數在最後一次觸發後 5 秒一次歸零。本文依「5秒後歸零」暫建議 `mitigated + all-at-once`，實作前由 Owner freeze。
13. 處決／吞噬與十二道試煉的傷害順序：是否穿透護盾、無敵、格擋與免死；「回復等同剩餘生命」讀 cast commit 前或實際 hpLost。
14. 俄羅斯輪盤在致盲／混亂時的機率表：文案只說對方死亡率提高到 2/6、3/6；自己死亡仍是 1/6，還是一併被重分配。未 freeze 前 importer 應拒絕此 weighted table。
15. 疾風迅雷／獄炎煉我／雷天大壯是三個純 gameplay state，還是三個不同 3D body／animation form；這會決定使用 generalized exclusive status 或擴展 champion-form registry。
16. 交換筆記本對死亡、1 HP、超過對方 max HP 與實際施放中目標死亡的處理。本文建議在 cast resolve tick 原子交換雙方 current HP、各自 clamp 到 `[1, ownMaxHp]`，目標失效則全招失敗。

D19 Product scope、D20 graph-v1、衝突 approval policy 與 43 名英雄名單已裁決，不再列為待問。技能 CSV 的標籤、級數、缺距離與語意歧義已改由 Editor Script 直接採合理預設，中文 Owner issue 只記錄實際修改與推定依據；這不要求修改 GGD。第16節其餘項目及本輪新增的 12～16 項仍是未來遊戲端 importer／runtime 實作時才需要的部署或 capability 決策，不阻擋本機 Editor 的技能資料整理；但對應機制在 Owner freeze 前不可標記 production-ready。

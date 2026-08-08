# GGD Editor JSON／ZIP 匯入契約

狀態：**Draft 0.4 — 供 editor 與遊戲 importer 共同實作，尚未開始程式開發；Product 預設 host-local 與 V1 安全 typed `effect-graph-v1` 已由 owner 裁決**

基線：`GGD main@81826f9ffc8f1561fe99dbd5628576645f321664`

本規格取代「沿用現有逐文件 overlay API」作為最終目標。遊戲本體可依此另行實作 JSON／ZIP importer；本專案不修改 GGD。

Draft 0.4 保留 PLAN D19／D20 的 normative contract：legacy migration 與新建 Product 預設 `host-local`，只有作者明示 Promote 才建立新的 shared Product；V1 Template Definition 使用封閉、可型別檢查、受 capability 與 budget 限制的 `effect-graph-v1`，不允許任意腳本。本版另固定 legacy flat stack／nested event edge 的分界、compiled authority、strict params、all-or-nothing expansion 與真實 SimWorld 驗收契約。

## 1. 規範用語

- `MUST`：不符合即拒絕匯入。
- `SHOULD`：除非有具體相容性理由，否則必須遵守。
- `MAY`：選配能力。
- `contentSha256`：對一份 authoring／scenario／compiled document 的 RFC 8785／JCS canonical UTF-8 bytes 取 SHA-256；exact refs 一律使用這個欄位，不使用含糊的 `digest`。
- `expansionSha256`：Product／Host deterministic compiled output 的 semantic SHA-256；不得拿它代替 authoring identity。
- `rawSha256`：只保護 ZIP entry 原始 bytes／格式，不參與 exact authoring refs。

## 2. 四層 authoring model

### 2.1 效果模板定義 `effect-template@1`

定義參數、型別、單位、限制、輸出契約與如何編譯；不是已填值的技能效果。

### 2.2 效果模板成品 `effect-product@1`

把一個確切版本的模板填入完整參數後得到的可命名、可版本化、可獨立驗收成品。

### 2.3 效果鏈 `effect-chain@1`

**效果鏈只能放效果模板成品的精確引用。** Chain entry 不得直接放 template params、raw `EffectDef` 或 override。需要不同數值時必須 fork／建立另一個 Product revision。效果鏈可以是巢狀 DAG：Template 宣告 `onHit`、`onTargets`、`onLand`、`onTick` 等 chain port，Product 在這些 port 內仍只放 ProductRef。

### 2.4 編譯結果 `CompiledEffects`

由 importer／editor 共用 compiler 展開成目前 runtime 可讀的 `ability@1`、`item@1` 與 champion mirrors。它是唯讀衍生物，不是 authoring truth。

資料流固定為：

    EffectTemplateDefinition
              ↓ instantiate
    EffectTemplateProduct
              ↓ exact ProductRef
    Ability／Item EffectChain
              ↓ deterministic compile
    ability@1／item@1／champion mirror

## 3. `effect-template@1`

範例：

```json
{
  "schema": "effect-template@1",
  "id": "et.ability.single-strike",
  "revision": 1,
  "name": "單體斬擊",
  "status": "ready",
  "hostKinds": ["ability.active"],
  "params": {
    "damage": { "type": "scaling", "required": true },
    "damageType": {
      "type": "enum",
      "values": ["physical", "magic", "true"],
      "required": true
    },
    "castTimeSec": {
      "type": "number",
      "unit": "s",
      "min": 0,
      "max": 10,
      "required": false
    }
  },
  "compiler": {
    "kind": "ggd-legacy-family",
    "key": "single-strike",
    "sourceFingerprint": "sha256:..."
  },
  "inputContract": {
    "caster": "required",
    "primaryTarget": "required",
    "groundPoint": "forbidden",
    "targetSets": []
  },
  "outputContract": {
    "append": ["/effects"],
    "singletons": ["/castType", "/castTimeSec", "/targetsEnemies"]
  },
  "chainPorts": {},
  "capabilities": [],
  "limitations": [],
  "tests": ["scenario.et.single-strike.default"]
}
```

### 3.1 Compiler kinds

V1 支援兩種：

1. `ggd-legacy-family`
   - 包裝現有 `expand.ts` family。
   - 行為 body 為 code-owned、唯讀。
   - Definition Studio 可顯示參數與限制，但不能假裝能編輯其語意。

2. `effect-graph-v1`
   - V1 新資料驅動模板的 normative compiler kind。
   - `program.outputs[]` 使用封閉、可型別檢查的 AST；`program.steps[]` 只能使用本規格登記的 typed control steps。
   - 禁止 JavaScript、expression string、shell、動態 import、任意函式、檔案／網路 I/O、wall clock 或 compile-time RNG。

### 3.2 `effect-graph-v1` 最小 AST

每個 output：

```json
{
  "path": "/effects/-",
  "merge": "append",
  "value": { "op": "object", "fields": {} }
}
```

允許的 expression node：

- `literal`：JSON literal。
- `param`：讀取已宣告參數；path 必須存在。
- `object`：由已型別檢查的 fields 組物件。
- `list`：由 items 組陣列。
- `ifPresent`：optional param 存在才產輸出；absent 與填 default 是不同狀態。
- `switch`：只可對 enum／boolean param 分支，所有成員必須覆蓋或有 default。
- `formula`：只允許 `add/sub/mul/div/min/max/clamp/round`，輸入輸出必須為 finite number。
- `unitConvert`：只可使用 importer capability table 登記的單位轉換。
- `map`：只可迭代有上限的 param array；編譯器必須檢查最大輸出 cardinality。

所有輸出 path 必須在 `outputContract` 與 `hostKinds` 的 allowlist。未知 node／path 一律拒絕。

需要 runtime 控制流的 Definition 另使用 `program.steps[]`，V1 只允許：

- `selectTargets`：以 typed selector 產生一個宣告過的 named target set。
- `invokePort`：指定 `port` 與 `targetSet`，在明確的新 context 執行該 Product 的 child chain。
- `sequence`：依序執行有上限的 steps；不得用 array 順序隱含傳遞私有 target set。
- `ifContext`：只可判斷 `inputContract` 宣告的 typed context presence／enum，不允許 expression string。

Compiler 只有在目標 runtime 宣告對應 lowering capability 時才能接受控制流；例如 `effect.target-set-chain@1`。若目前 runtime schema／handler 無法保留 selector + child chain 語意，MUST 回 capability unsupported，禁止把它攤平成會改變語意的平面 EffectDef 陣列。

#### 3.2.1 Deterministic type and execution contract

- Compiler 必須使用版本化 primitive registry；每個 expression node、control step、selector、unit conversion 與 lowering 都有 stable capability key，並納入 `compiler.fingerprint`。未登記或版本不相容的 primitive 一律拒絕。
- Type checker 必須是 total；不允許 implicit string／number／boolean coercion。`absent`、JSON `null`、explicit default 與 `paramState=disabled` 是四種不同狀態，不得互猜。
- 數值運算只接受 finite JSON numbers。除數為零、產生 NaN／Infinity、超出參數／runtime 明示邊界或需要未登記 rounding mode 時 MUST 拒絕，不得依賴 JavaScript 隱含轉型。`round` 必須明示 `floor | ceil | trunc | half-away-from-zero | half-to-even` 其一。
- Object field、map 迭代、target set 與 emitted effects 的次序都必須由 schema 定義；不得依賴 hash-map、filesystem 或容器輸入順序。
- Graph 本身、Product child-chain DAG 與展開結果分別受 max nodes、depth、outputs、effects、hooks、timers、projectiles、summons、target sets 與 total expanded bytes 限制；限制值由 importer capabilities 回報並納入 validation plan。
- 只允許 runtime 正式 RNG primitive 在實際 SimWorld 執行時讀取明示 RNG stream；Definition compile 不得抽樣、讀系統時間或取得外部狀態。
- 同一 canonical Definition／Product、compiler fingerprint 與 capability table 必須 compile 兩次得到相同 canonical output 與 `expansionSha256`；不一致為 blocker。

### 3.3 Template 驗證

- `id + revision` 不可原地改寫；修改 ready template 建立新 revision。
- Definition identity 是 `id + revision + contentSha256`；document 本身不內嵌自己的 hash，避免遞迴。
- 每個 param 必須被 graph program 使用，或由 audited legacy adapter 的 consumption test 證明；否則明列 `inertReason`。
- ready template 不得含 inert param；舊 GGD baseline MAY grandfather 成 warning，但新 revision 必須修正或移除。
- param schema 必須 strict；未知 param 是 error，不能安靜忽略。
- `status=ready` 必須同時具 compiler、capabilities、default compile 與 contract tests。
- graph 必須無環，展開深度、effects、hooks、timers、projectiles、summons 都有 budget 上限。
- 會改變目標集合的 Template 必須宣告 named target-set output 與 child chain port；不得靠「上一個 effect 剛好選過哪些人」的隱含狀態。

## 4. `effect-product@1`

```json
{
  "schema": "effect-product@1",
  "id": "ep.godie-ogld.q.single-strike",
  "revision": 1,
  "name": "美白大法師 Q・單體打擊",
  "status": "ready",
  "template": {
    "id": "et.ability.single-strike",
    "revision": 1,
    "contentSha256": "sha256:..."
  },
  "scope": {
    "kind": "host-local",
    "ownerHost": { "kind": "ability", "id": "godie-ogld.q" }
  },
  "paramState": {
    "castTimeSec": "enabled"
  },
  "params": {
    "damage": { "perRank": [150, 300, 450, 450, 450] },
    "damageType": "magic",
    "castTimeSec": 0.2
  },
  "chains": {},
  "tests": ["scenario.godie-ogld.q.hit", "scenario.godie-ogld.q.invalid-target"]
}
```

規則：

- Product 精確 pin `template.id + revision + contentSha256`。
- `scope` 是 discriminated union：`host-local` 必須有 `ownerHost {kind,id}`；`shared` 不得有 ownerHost。host-local Product 只能被相同 ownerHost 的 Host chain或相同 ownerHost 的 Products child chains 引用，跨 host ref 是 error。這是 owner 已裁決的 V1 預設，不得以自動 dedupe 改成 shared。
- Promote 不得原地改 scope。它建立新的 shared Product id／revision 1，以 `lineage.promotedFrom` exact ProductRef 留來源；建立新 Product 本身不會改動任何現有 Host／parent Product ref。
- Promote 前 MUST 檢查完整 transitive child Product closure。新 shared Product 不得引用任何 host-local child Product；作者必須取消 Promote，或明示將必要 children 一併 clone／Promote 成一組新的 shared dependency closure，每個新 Product 都保留 lineage。
- Promote 完成後，作者必須在 where-used 清單明示選擇哪些 Host／parent Product 採用新 exact ProductRef；未選取的引用者繼續 pin 舊 Product。禁止 importer／compiler 將相同 id 的新 revision 自動套到全部使用者。
- Product params MUST strict-validate；unknown、missing、越界、無效 ref 都拒絕。
- optional param 在 `paramState` 必須明列 `enabled | disabled`；enabled 時 `params` 必須有值，disabled 時 `params` 禁止出現該 key。不得以 key absence、空字串、0 或 default 猜狀態。
- ready Product 修改時建立新 revision。共享 Product 禁止 inplace mutation。
- `resolvedParams`、compiled output 與 preview 結果只放 report/cache，不作 canonical 欄位。
- 同參數 Product 不自動 dedupe；是否共享是作者決策。匯入 legacy content 與新建 Product 預設建立 ability/item-local Product。
- Product 必須單獨 compile 兩次得到相同 `expansionSha256`，且不得是意外 no-op。
- `chains` 只能填 Template 已宣告的 chain port；每個 child chain 同樣只能包含 exact ProductRef。

## 5. `effect-chain@1`

`effect-chain@1` 是嵌入在 `ability-authoring@1`／`item-authoring@1` 的 `effectChain`，或 `effect-product@1.chains.<port>` 中的 owned value，不是獨立 package document。它不另外取得可共享 id／revision；其 canonical value 包含在 owner Host／Product 的 `contentSha256`。需要重用一段複合行為時，建立／共享一個有 child-chain ports 的 Product，不共享可被多方原地修改的裸 Chain。

```json
{
  "schema": "effect-chain@1",
  "entries": [
    {
      "entryId": "main-strike",
      "product": {
        "id": "ep.godie-ogld.q.single-strike",
        "revision": 1,
        "contentSha256": "sha256:..."
      }
    }
  ],
  "conflictMode": "reject",
  "resolutions": []
}
```

規則：

- Entry 只有 identity、順序與 exact ProductRef；不得出現 params／override。
- array output 依 entry order concatenate。
- singleton output 預設 `reject`；不可用 reorder 暗中改 winner。
- 若 owner 明示裁決，`resolutions[]` 必須記錄 JSON pointer、winner entryId、全部 candidate Product `contentSha256`、reviewer、note。
- 每個 Product 必須對 compiled output 有可證明 contribution；零貢獻是 blocker。
- 每個 nested output pointer 都要能追到 entry → product → template → param／constant／expression。
- 不先沿用現有「最多 8 張」作正式資源限制。上限由 effects/hooks/timers/projectiles/summons 的實際 budget 決定；UI 另可有防誤貼 soft limit。
- 因 Product 可在 owned child chain 內引用其它 Products，實際依賴是 `Product → owned Chain → ProductRef` DAG。Validator 先以 exact `contentSha256` 建完整圖、拒絕 cycle／missing ref，再由 leaf Products 拓撲排序向上 compile；不可用檔案順序或簡單「先驗所有 Product、再驗所有 Chain」假設。`contentSha256` 直接由各 canonical authoring document 計算，不依賴拓撲；拓撲只決定驗證／編譯順序。

### 5.1 Target context 與巢狀鏈

每條 chain 執行時必須有明確 input context：

- `caster`
- `primaryTarget`／`groundPoint`
- `eventSource`／`eventTarget`
- named `targetSets`
- `tick`／`castId`／RNG stream

規則：

- Product 只能讀 Template `inputContract` 宣告的 context。
- Selector Product 產生 named target set，例如 `areaVictims`；其 `onTargets` child chain 明確以該集合執行。
- 下一個平行 Product 不會自動繼承上一個 Product 的私有 target set。
- `damageArea → applyStatus` 若要作用於同一批人，必須放在同一 selector Product 的 `onTargets` child chain，或兩者明確引用同一 named set。
- projectile `onHit`、leap `onLand`、DoT `onTick`、buff hook 與 summon lifecycle 都使用同一套 chain port，不另造腳本系統。
- Compiler 必須做 DAG cycle、最大深度、最大展開節點數與 target-set type check。
- 基線 `81826f9...` 的 projectile `onHit` 與 leap `onLand` 已有 nested effects，但沒有通用 `area selector → child chain` runtime primitive。故修正 `godie-i03h` 需要遊戲端新增 `effect.target-set-chain@1` 或語意等價的正式 runtime capability；只實作 ZIP importer 不足以修正。Capability 完成前，此 Product 只能診斷／設計，不能標 production-ready。

## 6. Host authoring documents

### 6.1 `ability-authoring@1`

包含：

- identity／slot／name／description／icon／rank／cost／presentation。
- `skeleton`：不由 Product 輸出的 ability 欄位。
- `effectChain`：唯一 behavior authoring source。
- `vfxBinding`：只引用 base／package 中已存在的 VFX documents；code-authority 欄位唯讀。

若 Product 輸出 `/castType`、`/radius`、`/castTimeSec`、`/targetsEnemies`、`/innateKind` 等 singleton，`skeleton` 不得再擁有同一路徑。Compiler 完成後才驗最終 `ability@1` required fields。

### 6.2 `item-authoring@1`

包含：

- identity／name／description／cost／tier／icon／tags／craftRole／recipe 等非機制資料。
- `effectChain`：modifiers、attributes、passive hooks、auras、sets、vision、flight、damageTypeOverride、block、critStrike 等機制的唯一作者層來源。
- `distribution`：legendary table、quest table、round offer、orb、shop、melee/ranged gate 與可達性預期。
- `vfxBinding`：明示 Product／hook 所引用的既有 VFX；不得從名稱或附近資產猜綁定。

Template `hostKinds` 至少支援：

- `ability.active`
- `ability.passive`
- `item.modifier`
- `item.passive-hook`
- `item.aura`
- `item.singleton-mechanic`

Distribution 規則：

- 每個 channel 使用封閉 enum 與 typed payload，並對應 importer capability，例如 `distribution.legendary-loot@1`、`distribution.quest-reward@1`、`distribution.round-offer@1`、`distribution.orb@1`、`distribution.shop@1`。
- Compiler 由全部 base + draft item authoring documents deterministic 重建受影響的 runtime loot／offer documents及 `distribution-index@1` expected derived projection；不得靠 tag／tier／名稱猜 membership。
- `distribution-index@1` 必須分開 `contentReachable` 與 `effectiveReachableUnderCuration`：內容圖可達不代表當前營運 whitelist／feature flag 已開放。
- Package 不得靜默覆寫管理員 curation。若內容宣告 `mustBeEnabled` 但 effective reachability 為 false，importer 必須拒絕或要求獨立 curation approval；其它情況可啟用內容，但必須回報 `unavailable-under-curation`。
- 現有硬編碼 curation whitelist 不能成為不可觀測的第二 authority。遊戲端須將其納入 effective reachability 投影，或在 importer validation 明確拒絕 unsupported channel。
- recipe component／book refs、loot membership、class／attack-type gates 全部是 strict refs，且納入 where-used／rename impact。

### 6.3 `release-scenario@1`

Package 可攜的 scenario 是可重現、mechanics-only 的驗證輸入，至少包含：

- id、subject kind／id 與所有 Host／Definition／Product `contentSha256`。
- runtime/compiler capability fingerprints。
- 有上限的 initial entities／loadout／stats／positions、fixed seed、maxTicks。
- tick-stamped typed actions；只允許 cast、basicAttack、receiveDamage、idle／step、equip 與正式 scenario action union。
- typed assertions；只允許 event、state-at-tick、spatial、count／within／never、RNG/timing、target-set contribution。

禁止 JavaScript、任意 expression、檔案／網路、wall clock、GUI 操作、visual acceptance 或外部 asset payload。Importer 必須在隔離、有 tick／entity／event budget 的正式 SimWorld 執行。人工 visual review 仍只存在 editor metadata／report，不是遊戲 importer 可自動判定的 scenario。

### 6.4 `fidelity-decision@1`

當 description、JASS evidence 與目前 runtime JSON／trace 出現候選衝突時，沒有任何一個來源自動取得 intended-truth 優先權。Editor MUST 建立 `FIDELITY_CONFLICT_UNRESOLVED` blocker，顯示三方 evidence 與實際 runtime trace，並詢問 owner 要採用哪個行為或設計新機制。

Package 內可以 `validation/fidelity-decisions/<id>.json` 攜帶 deterministic、去個資的決策證據，至少包含：

- `schema: "fidelity-decision@1"`、stable conflict id、subject kind／id。
- description document／pointer／`contentSha256`、JASS evidence id／source fingerprint／range hash、observed runtime document／trace／compiler／runtime fingerprints。不攜帶未授權的整段 JASS 原文。
- `decision: "keep-runtime" | "author-supported-mechanism" | "request-new-capability" | "defer"`。
- 結構化 intended behavior 摘要、必驗 `release-scenario@1` exact refs、必要時的 required capability keys。
- 本機 reviewer display name 與完整 note 保留在 editor metadata，不進 package。Package 只可攜帶 sanitized decision provenance id／note，而且它不是遊戲後台的身分證明；production apply 仍必須由後台已驗證、有權限的操作者核准。

決策規則：

- `keep-runtime` 只在 pinned runtime behavior 已由 required scenario 驗證時解除衝突；若 description 保留不同文意，決策必須明示記錄 intentional divergence。
- `author-supported-mechanism` 必須帶修正後的 exact Definition／Product／Host refs，並在 importer 現有 capabilities 上 compile、scenario 全綠；否則仍是 blocker。
- `request-new-capability` 與 `defer` 始終阻擋 production-ready package。前者可輸出為本機設計證據，並產生 `main_load_editor_plan.md` 的遊戲端建議，但 capability 未上線前不得降級成 warning。
- description、JASS evidence、runtime document／trace、compiler、Product／Host 或 required scenario 任一 hash／fingerprint 改變，舊決策 MUST 變成 stale 並重新阻擋。
- `acceptedWarnings[]` 不得代替 `fidelity-decision@1`，也不得豁免 unresolved／stale 決策或缺少 runtime capability。

## 7. Legacy migration

### 7.1 現有 template ability

GGD `ability.template` 現有 schema 接受三種 binding：單卡 `{ref,params}`、ordered card array、或 `{cards,onConflict}`（1～8 cards；預設 `reject`，可明示 `lastWins`）。Pinned corpus 有 33 份 templates（16 enabled／17 draft）；142 份 templated standalone abilities 全部仍是單卡，另有 106 份 champion embedded mirrors，不重複計數；multi-card／array 實際使用數為 0。現有 `{ref, params}`：

1. 將 `template@1` 包裝成 code-owned `effect-template@1` legacy definition。
2. 為每個 ability card 建立 ability-local Product；不可自動跨技能 dedupe。
3. Chain 放一個 ProductRef。
4. 原本空的 `effects: []` 只存在 compiled runtime doc；作者 UI 不得顯示為「沒有作用」。

若日後讀到 legacy multi-card，每張 card 各建立一個 host-local Product，Host chain 保留 card order 與原 `onConflict` provenance。Legacy stack 的 effects／passive list fields 是同一 resolve phase 的 concatenate；scalar conflict 依既有 GGD policy。Card 的 optional `version` 目前沒有 runtime consumer，不得遷移成 Definition／Product revision；只能保留為 inert legacy evidence或由 migration 阻擋後要求明示處理。

`template.cards` 不是時間效果鏈。平面 `[dash, blast]` 會在同一 resolve tick 依序執行，不能表示落地爆炸。移動完成、投射物命中、DoT tick 或 selector victims 等關係必須遷成 typed `onLand／onHit／onTick／onTargets` child chain；不得因原 schema 可以存多張 cards 就丟失 event edge。

Legacy binding／card 外殼雖為 strict，基線的 `params` 與 family parser 仍可能容忍 unknown key、把 `null` 當 absent，讓 typo 無聲退回 default。Importer 可在唯讀 bootstrap migration 的 compatibility pass 保留這些原始 evidence 並產 blocking diagnostic；所有新建、修改、Ready／export authoring 一律使用 strict mode，拒絕 unknown／`null`，要求明示 optional state。任一卡 ref／params／expand 失敗時整個 stack 失敗；不得只採用前卡。Resolver 後仍必須以 merged `zAbilityDoc` 驗 final document，runtime 的 fail-soft degrade ledger 不得被計成 package validation 成功。

### 7.2 現有 inline ability

每個 top-level `EffectDef` 轉成一個 built-in primitive Template Product；例如 `damage`、`applyStatus`、`applyBuff`。原順序變成 chain order。

Ability passive block 轉成 `ability.passive` Product。Nested effects 轉成該 Product 的 typed child chain，並遞迴建立 provenance；不得把執行順序或 target context 攤平成錯誤的 top-level chain。

### 7.3 現有 item

每個 modifier、attribute grant、hook、aura、set 或 singleton mechanic 轉成對應 Product。Hook 的 `on/chance/ICD/condition/target` 屬於 Hook Product；其 ordered effects 轉成 Hook Product 的 child chain，不在 host chain 重新排序。區域 selector 必須把同一 target set 傳給傷害與狀態子鏈，避免目前 `damageArea` 後接 `applyStatus` 卻各讀不同 targets 的缺陷。

描述要求、但基線 HookEvent union 沒有的事件不得由 editor 假造。例如 `godie-i01s` 的閃避後位移需要遊戲端 `hook.on-evade@1` deferred bridge；existing dash primitive 只能作 child action，不能取代正式 evade trigger。Capability 不存在時 Product／Host 維持 fidelity blocker。

### 7.4 Round-trip

- 只有同 phase、同 target context、完全符合現有 flat merge／conflict semantics 的 legacy-only chain MAY 編譯回現有 `ability.template` cards。
- Flat lowering 前必須通過 activation kind、cast type、target selection、timing 與 singleton compatibility matrix；`lastWins` 改寫 target metadata 可能影響所有 cards，不能只當顯示欄位衝突。Raw expansion 成功但 final runtime schema 不合法時整支 Host 失敗。
- graph-v1、nested Product chain 或 item products deterministic eject 成目前 strict `ability@1`／`item@1` 原生欄位。對 ability 的 `native-effects` 輸出 MUST 移除 `ability.template`；否則 GGD resolver 會重新展開 cards並覆蓋已編好的 native nested effects。
- Compiler／manifest provenance 必須標記每個 ability 的 compiled authority 是 `legacy-template-binding` 或 `native-effects`。兩種 authority 同時存在、或 template 重展開結果與 native effects 不一致時 MUST 回 `COMPILED_AUTHORITY_CONFLICT`，不得採自動 precedence。
- `ggd-editor-import@1` Package JSON 是一個實體 JSON 檔，但可包含多份 authoring／compiled／validation documents；它和相同 document set 的 ZIP 具有完整 authoring round-trip 語意。
- 另行匯出的 raw Runtime Document JSON 只能是一份 compiled `ability@1` 或 `item@1`。它不是 `ggd-editor-import@1`、沒有 package manifest／base CAS／authoring identity，回 editor 只能重建匿名 Products，並會失去 revision／where-used。
- Raw Runtime Document JSON 不能單獨證明 champion mirror、distribution、indexes 或其它跨文件 derived state 已重建，不得標記為符合本規格的 production-ready package。若遊戲端要直接收這種單份 runtime JSON，必須另訂 single-document staging adapter，在遊戲端建完整 staging tree／derived closure 後才可啟用；它仍不會恢復 authoring round-trip。

### 7.5 Legacy bootstrap 與 active authoring store

目前 GGD 基線沒有 Effect Definition／Product／Host authoring store，所以 package mode 必須明確。Mode 是語意而非容器特性；Package JSON 與 ZIP 均使用相同規則：

- `bootstrap`：UI 的「完整快照」目標尚無 authoring store 時使用。Package MUST 攜帶由 pinned legacy migration 產生的完整 Definition／Product／Ability／Item authoring corpus及 `migrationFingerprint`；不得用 delta 猜回缺少的 Products。
- `full`：UI 的「完整快照／完整覆蓋」在目標已有 authoring store 時使用，package 攜帶完整 replacement authoring snapshot。「覆蓋」表示寫入新 immutable version 後原子切換 pointer，不是在 active tree 上原地覆寫。
- `delta`：UI 的「僅匯出選取變更／部分更新」。只攜帶 selected changed authoring documents 與必要的 changed dependency closure；MUST pin `base.activationDigest + base.authoringDigest`，所有未隨包攜帶的 exact refs 必須能從該 immutable active authoring store解析。

V1 只允許 upsert，所以 `full` 不能把遺漏文件當成隱式刪除。Full package 的 authoring membership MUST 包含 base store 的每一份 exact Definition／Product revision 與每一個 Host id，再加上新增 Definition／Product revisions 與 Hosts；Host 可以 upsert 新 content，但 immutable Definition／Product 舊 revision 不得被新 revision 取代後從 snapshot 消失。少任一 base document 即回 `IMPLICIT_DELETE_FORBIDDEN`。將來要刪除或清理舊 revision 時必須升 package schema 並引入明示 tombstone／delete impact contract。

遊戲 importer 第一次成功 bootstrap 後，必須把 authoring store 與 compiled runtime tree 一起保存於同一 immutable activated version，並產生 `authoringDigest`。後續 importer／editor 讀取的 authoring truth 來自這個 store，絕不從 compiled abilities/items 反向猜 Product identity。

每個非 bootstrap package 必須同時 pin `base.activationDigest` 與 `base.authoringDigest`。Ready Definition／Product 建立新 revision 並不會自動更新 exact refs；作者必須在 `changes[]` 明示列出哪些 Host／parent Product ref owners 採用新 revision。Compiler 以這些已變更 ref owners 與其它 changed documents 為起點，依 staged authoring store 求 reverse dependency closure、重編全部直接／間接受影響者，不能只重編 package 中列出的 Hosts，也不得把未選取使用者靜默升版。

Bootstrap compiler 對未修改 hosts 的 semantic output 必須等於 pinned legacy base；刻意修正 fidelity 的 hosts 必須列在 changes／scenarios 中。Distribution rebuild 一律在 bootstrap/full/delta merge 完成後，從完整 staged authoring store計算。

若 active version 沒有 `authoringDigest`，importer MUST 拒絕 `delta`。若不願讓遊戲端保存 authoring store，V1 只能接受每次攜帶完整 authoring corpus 的 `bootstrap/full`，不可宣稱可安全 delta round-trip。

Editor 建包必須從 exact target base 重建 export staging，而不是把當前本機 workspace 的所有未匯出修改當成 base。因 V1 editor 不直連 production，`delta/full` 必須由使用者匯入遊戲端匯出的 `ggd-content-target-profile@1`（或等價的上次 activation receipt），至少含 active activation／authoring／content／distribution digests、compiler fingerprint、capabilities、limits、asset-manifest digest，以及 live champion／item curation ids 與 digests。Starter whitelist 不能冒充 live curation。沒有 exact target profile 時可保存草稿，但不得產生標為 production-ready 的 `delta/full`。

## 8. ZIP 結構

```text
manifest.json
authoring/effect-templates/<id>@<revision>.json
authoring/effect-products/<id>@<revision>.json
authoring/abilities/<id>.json
authoring/items/<id>.json
authoring/vfx/<id>.json                      reserved: vfx-document-authoring capability
compiled/ability-templates/<id>.json       legacy compatibility only
compiled/abilities/<id>.json
compiled/items/<id>.json
compiled/champions/<id>.json               expected derived mirror
compiled/vfx/<id>.json                     reserved: expected runtime VFX document
compiled/distribution/<collection>/<id>.json  expected loot／quest／offer／orb／shop docs
validation/scenarios/<id>.json             deterministic mechanics-only release scenarios
validation/fidelity-decisions/<id>.json   deterministic owner decision evidence
reports/validation.json
reports/provenance/<host-id>.json
reports/diff.json
```

規則：

- `authoring/` 是 package canonical truth。
- `compiled/` 是 editor 的預期結果；遊戲 importer MUST 自己重編，再逐檔比較 JCS `contentSha256`，不能直接信任。
- 未修改的既有 VFX／content 只放 `requires[]` exact `contentSha256`；binary asset 使用 pinned asset-manifest entry hash。V1 不含 binary assets。
- 核心 V1 只編 Host／Product 對既有 VFX 的 binding；`authoring/vfx`／`compiled/vfx` 只有 importer 與 editor 都宣告 `vfx-document-authoring@1` 時才能出現，否則拒絕。
- `validation/scenarios/` 只放 manifest 要求的 deterministic mechanics scenarios：固定 initial state／seed／commands／assertions，不含 reviewer、人工 visual acceptance、截圖／影片、本機路徑或任意 script。`validation/fidelity-decisions/` 只放第 6.4 節的 deterministic evidence，不把本機 reviewer 文字當成 production authentication。兩者都只在 staging 驗證，不進 active game content。
- `reports/` 必須是 deterministic、去除 wall clock／machine／absolute path／timing 的 evidence，並和其它 entries 一樣列入 manifest `entries[]` contentSha256 與 semantic packageDigest。Importer 驗 hash但不信任 pass/fail，仍自行重跑並產生自己的 operation report；兩份報告不要求文字 bytes 相同。
- champion mirror、indexes、content manifest、bundle 由 importer staging 重建；ZIP 內 mirror 只作 expected diff，不作輸入真相。README／reference／status 等人讀產物的 freshness 屬 repository CI，production importer 不修改 source tree，也不信任 package 內的對應文件。
- item distribution 變更時，`compiled/distribution/<collection>` 包含對應 runtime collection 的預期 documents；importer 仍須由 authoring 重建並比對。`expectedDerived[]` 必須含完整 `distribution-index@1` contentSha256，以及每個 declared channel 的 `contentReachable`／`effectiveReachableUnderCuration` 結果。
- 不含 executable、schema implementation、secret、cache、log、絕對路徑或 binary assets。
- V1 禁止 delete；只允許 `upsert`。`full` 的文件 membership 若少於 base 即是 `IMPLICIT_DELETE_FORBIDDEN`，不得當成「完整覆蓋」的隱式語意。
- Delta package 未攜帶的 dependency 必須在 manifest `requires[]` 以 exact `contentSha256`／asset-manifest hash pin 住。

## 9. Package JSON 與 raw Runtime JSON

### 9.1 `ggd-editor-import@1` Package JSON

Package JSON 是「單一實體檔案」，不是「單一內容 document」。它與 ZIP 表達完全相同的 document set，mode 也同樣可為 `bootstrap | full | delta`：

```json
{
  "schema": "ggd-editor-import@1",
  "manifest": {},
  "documents": [
    {
      "path": "authoring/effect-products/ep.example@1.json",
      "document": {}
    }
  ],
  "compiled": [
    {
      "path": "compiled/abilities/godie-example.q.json",
      "document": {}
    }
  ],
  "validation": [
    {
      "path": "validation/scenarios/scenario.example.json",
      "document": {}
    }
  ],
  "reports": {}
}
```

- JSON bundle 的每個 `contentSha256` 以 RFC 8785／JCS canonical UTF-8 bytes 計算。
- `documents`、`compiled`、`validation` 分別對應 ZIP 的 `authoring/`、`compiled/`、`validation/`；三者都列入 semantic manifest projection。
- ZIP 另外記錄 `rawSha256`，保護實際 entry bytes 與格式。
- JSON bundle 提供 semantic round-trip；因 document 是 parsed JSON value，不承諾保留來源 whitespace、key order 或 `60.0` 字面。需要 byte-preserving round-trip 時使用 ZIP。
- 同一批 semantic entries 的 JSON 與 ZIP 必須得到相同 packageDigest。
- Runtime mirror／compiled equality 使用 JCS `contentSha256`；rawSha256 不得因 key order 或 `60`／`60.0` 差異誤報機制 drift。RawSha256 仍用來偵測意外重寫與保留格式。

### 9.2 Raw Runtime Document JSON

Editor MAY 為方便現有人工／legacy 流程，另行輸出一份當前 validated snapshot 編譯得到的 raw `ability@1` 或 `item@1` JSON。此檔：

- MUST 使用 canonical collection／id 檔名並通過當前 runtime Zod，但不屬於 `ggd-editor-package@1`／`ggd-editor-import@1`。
- 不攜帶 authoring Definitions／Products／Chains、base digests、required capabilities、scenario 或 cross-document derived plan；不參與 JSON／ZIP packageDigest equality。
- 只能標記 `compiled-only`，UI MUST 明示「不可完整往返／不保證跨文件原子更新」。
- MUST NOT 被第 12 節 package importer endpoint 當成完整 package 直接 apply。若遊戲端另有 raw-document adapter，該 adapter 自行負責完整 staging／refs／mirrors／distribution／CAS／activation；否則只能作人工相容輸出。

## 10. Manifest

`manifest.json` 至少包含：

- `schema: "ggd-editor-package@1"`
- `mode: "bootstrap" | "full" | "delta"`
- `gameId`
- `packageDigest`
- `base.gameRevision`
- `base.contentVersion`
- `base.activationDigest`：full／delta 必填；bootstrap 必須明示 null
- `base.authoringDigest`：delta／full 必填；bootstrap 必須明示 null
- `migrationFingerprint`：bootstrap 必填
- `selectionRoots[]`：使用者在 Editor Export Center 明示選取的 Definition／Product／Ability／Item root exact refs；bootstrap／full 以完整 snapshot root 表示，delta 不得為空。
- `changes[]`：實際將套用的 authoring upserts，每筆含 kind／id／path／op=`upsert`、before exact revision／contentSha256（新增為 null）、after revision／contentSha256、`reason: selected | required-dependency | explicit-ref-adoption`。
- `compiler.contractVersion`
- `compiler.fingerprint`
- `requiredCapabilities[]`
- `entries[]`：path、role (`authoring | compiled | validation | report`)、contentSha256、contentSize（JCS canonical bytes）；content entries 另有 collection、id、schema、op、revision
- `transport`（ZIP only）：format／policy 與非 manifest entries 的 path、rawSha256、rawSize；不參與 packageDigest
- `requires[]`：未隨包附帶的 base Definition／Product／host content／VFX／status／projectile／asset 等 exact id + revision（若有）+ contentSha256
- `expectedCompiled[]`：每份 ability 另帶 `authority: legacy-template-binding | native-effects`；前者重展開 template 後比對，後者禁止存在 `ability.template`。
- `expectedDerived[]`：champion mirror、distribution-index／reachability、indexes、bundle、contentVersion
- `validationPolicy`
- `requiredScenarios[]`：scenario id、schema、contentSha256、subject／Definition／Product contentSha256 與 required runtime capabilities
- `fidelityDecisions[]`：對 `validation/fidelity-decisions/` exact id／contentSha256 的 refs，並列 decision／subject／evidence fingerprint／required scenario ids。
- `acceptedWarnings[]`：只允許逐 code + reviewer + note，不得 `ignoreAll`；不可豁免 unresolved／stale fidelity decision、missing capability、compiled mismatch、target-context semantic loss、invalid ref／hash、stale base／CAS、implicit delete 或必驗 scenario failure。

`selectionRoots[]` 是使用者意圖，`changes[]` 是 exporter 對 exact target base 求得的可套用變更集。Delta exporter 必須從 target base 開始，只套入 selected roots，自動加入欠缺就無法解析的 changed forward dependencies，再計算因 explicit ref adoption 實際受影響的 reverse closure。未選取的本機 workspace 變更不得滲漏到 `changes[]`、compiled output、reports 或 packageDigest；若選擇無法在不套入另一本機變更的情況下閉包，exporter MUST 自動加入並告知使用者，或阻擋，不可暗中擴大範圍。

Package digest 算法：

1. 建立 `semanticManifestProjection`：移除 `packageDigest`、signature、`transport`、archive hash 與任何非重現 metadata。
2. `selectionRoots`／`changes`／`entries`／`requires`／`expected*`／`requiredScenarios`／`fidelityDecisions` 依規定的 POSIX path／id byte order 排序；不得依容器輸入順序。
3. 對 projection 的 JCS canonical UTF-8 bytes 取 SHA-256，得到 `packageDigest`。
4. JSON 與 ZIP 的 semantic projection 必須完全相同，所以 packageDigest 相同；ZIP 的 rawSha256／rawSize 不可回灌 semantic projection。

ZIP entry 固定順序、UTF-8、mode、mtime、compression policy；相同輸入必須 byte-identical。最終 ZIP 整體的 `archiveSha256` 在建包完成後顯示於 UI／sidecar receipt，不寫回 archive 造成遞迴 hash；檔名仍使用 semantic packageDigest 前綴。它是 transport integrity，不取代 packageDigest。

## 11. 遊戲 importer 必要流程

1. 驗 content type、大小、ZIP path safety、duplicate/case collision、hash。Package endpoint 若收到 raw `ability@1`／`item@1` 而非 `ggd-editor-import@1`／`ggd-editor-package@1`，MUST 回 `RAW_RUNTIME_DOCUMENT_NOT_A_PACKAGE`，不得猜測或降級 apply。
2. 驗 package schema、mode、game id、base revision／contentVersion／activationDigest／authoringDigest、migration fingerprint、target profile 相容性與 compiler capability；active 無 authoring store 時只接受 bootstrap。
3. 建立 immutable staging snapshot，不改 active content。
4. 依 mode 建立完整 staged authoring store：bootstrap/full 使用 package 的完整 corpus；full 先比對 base membership，任何遺漏回 `IMPLICIT_DELETE_FORBIDDEN`；delta 必須從 exact `base.activationDigest + base.authoringDigest` 的 immutable store 開始，只套入通過驗證的 `changes[]`，並解析全部 base dependencies。Importer 不可看到或合併 package 之外的 editor workspace 變更。
5. 驗 `selectionRoots[] → changes[]` 映射、before／after exact hashes、required changed forward dependencies 與 explicit ref adoptions。Ready Definition／Product 的新 revision 不得自動取代舊 exact ref；只有 `changes[]` 明列的 ref owner 可採用新 revision。
6. 先驗 Definitions，再建立 Product → owned Chain → ProductRef DAG，從已套用 changed documents 求 reverse dependency closure 後拓撲驗證／編譯，最後驗 Host-owned chains 與 Hosts。Legacy cards 採 strict params、all-or-nothing stack、activation／target／timing compatibility，並對 merged result 跑 final runtime schema；任一 fail-soft ledger entry 都使 package validation 失敗。
7. deterministic compile 兩次，比對每個 Product expansionSha256 與每份 compiled document contentSha256。
8. 以 importer 自己的結果比對 package `compiled/`；不同即拒絕。Ability 同時含互相競爭的 legacy template 與 native-effects authority、或 native-effects 仍含 `ability.template` 時回 `COMPILED_AUTHORITY_CONFLICT`。
9. 重建 standalone abilities/items、受影響 loot／offer documents、`distribution-index@1`、全部 champion mirrors、indexes、manifest、bundle；每個 declared item channel 必須同時得到 content/effective reachability，並對 unsupported、curation conflict 或需獨立 approval 明示診斷。
10. 驗證所有 `fidelityDecisions[]` evidence hashes／fingerprints／required scenarios。Unresolved／stale／`request-new-capability`／`defer` 或無後台授權核准的決策都拒絕 production apply。
11. 執行完整 `ContentLoader`、hard refs、template expansion、`registerAll(...throw)`、asset refs 與 package 中的 required deterministic scenarios；若宣告 capability 不支援就拒絕，不得略過後仍 passed。
12. 產生 planDigest 與完整 diff；dry-run 到此停止。
13. Apply 前以 CAS／`If-Match` 再驗 active base 與 planDigest。
14. 將完整 staged authoring store + compiled runtime tree 寫入新的 immutable version，計算 authoring／content／activation digests；成功後只原子切換 ACTIVE pointer。
15. 依公開 `reloadMode` 回 `activated` 或 `activated-awaiting-reload`；shard／client 真正載入後由 health 回讀 activationDigest、contentVersion、packageDigest。
16. Rollback 只切回前一個已驗證 digest。

遊戲 importer 若無法提供跨文件原子 activation，MUST 回報 capability unsupported，不得把逐文件 PUT 宣稱為此規格的成功 apply。

Server 與 client MUST 讀取同一 immutable active runtime bundle。新 match 在建立時 pin activation／ContentSnapshot；已進行的 match 繼續使用舊 snapshot，不得中途替換 global registry。

## 12. 建議 API

- `GET /api/v1/content-import/capabilities`
- `POST /api/v1/content-import/validate`：接受 JSON 或 ZIP，只 dry-run。
- `POST /api/v1/content-import/apply`：接受 JSON 或 ZIP，要求 `If-Match: <baseContentVersion>` 與先前 validate 的 `planDigest`。
- `POST /api/v1/content-import/rollback`：body 指定既有 activation/package digest。
- `GET /api/v1/content-import/operations/<operationId>`：查驗證、啟用或 rollback 結果。
- `GET /api/v1/content-import/active`：查 active／previous verified pointer 及 digests。
- `GET /api/v1/content-import/active/target-profile`：下載 deterministic `ggd-content-target-profile@1`，供不直連後台的本機 editor 建立 exact `delta/full` export base。
- `GET /api/v1/content-import/active/runtime-bundle`：server／client 共用的 immutable snapshot。
- `GET /api/v1/content-import/health`：查 activation 載入／reload 狀態。

`capabilities` 至少回 package／authoring schema versions、compiler fingerprint、runtime capabilities、active activation／content／authoring digests、`authoringStoreState`、limits 與 `reloadMode`。`target-profile` 是這些建包必需欄位加上 distribution、asset manifest 與 live champion／item curation ids／digests 的 canonical、可 hash receipt，不含 secret 或 credentials；Editor 匯入後仍必須在 apply 時由 CAS 重驗。`validate` MUST 無狀態變更；`apply` MUST 拒絕 stale `planDigest` 或 base。

結果格式至少包含：

- `schema: "ggd-content-import-result@1"`
- `operationId`
- `status: validated | activated | activated-awaiting-reload | rejected | rolled-back`
- `packageDigest`
- `previousContentVersion`
- `newContentVersion`
- `previousAuthoringDigest`
- `newAuthoringDigest`
- `planDigest`
- `diagnostics[]`
- `changedDocuments[]`
- `selectionRoots[]`
- `fidelityDecisions[]`
- `derivedDocuments[]`
- `activationDigest`
- `reloadMode`
- `authoringStoreState`
- `distributionReachability[]`：同時列 `contentReachable` 與 `effectiveReachableUnderCuration`

## 13. Release gates

### Definition

- strict schema、normative typed `effect-graph-v1`、無環、param used/inert、primitive registry／capability／status 一致。
- deterministic number／optional／order semantics、default compile、golden tests、mutation tests、resource budget。

### Product

- exact template revision/contentSha256、strict params、optional state、ref/bounds。
- compile twice 相同、非 no-op、required Product scenarios 通過。
- host-local 不跨 host；Promote 建立新 shared identity，transitive children 全為 shared，且只有 `changes[]` 明示選取的 ref owners 採用新 revision。

### Chain

- Product 全存在且 ready、host-compatible。
- singleton conflict 已明示解決、每個 Product 有 contribution、完整 nested provenance。

### Host

- compiled current Zod、slot/context、hard/strict soft refs、mirror plan。
- Legacy cards 的 unknown／`null` params、partial expansion、active／passive 或 target-context incompatibility、非零 fail-soft ledger 全部阻擋；raw expansion 後必須驗 merged final schema。
- mechanics／determinism／visual acceptance 分開；unknown 不得算 passed。
- description／JASS／runtime 衝突沒有自動 truth precedence；必須有 current、non-stale `fidelity-decision@1` 與 required scenarios，否則阻擋。
- Legacy multi-card 僅代表同 phase flat composition；每張 card 必須有 non-zero contribution。需要 onHit／onLand／onTick／onTargets 的 Host 不得 lowering 成 flat cards；native-effects ability 不得保留會重新覆蓋它的 `ability.template`。

### Package

- authoring contentSha256 ↔ expansionSha256 ↔ compiled contentSha256、full-tree load、derived rebuild、scenario suite、ZIP/JSON reopen。
- mode／target base／`selectionRoots[]`／`changes[]` 一致；partial delta 無未選本機變更滲漏，full 無 implicit delete。
- Package JSON 與 ZIP 的 semantic document set／packageDigest 一致；raw Runtime Document JSON 被明確分類為 compiled-only，不會被 package importer 誤收。
- unresolved／stale fidelity decision、missing capability、compiled mismatch、semantic lowering loss、stale base／CAS、implicit delete 與 required scenario failure 全部是不可豁免 blocker。

## 14. V1 明確排除

- binary asset upload。
- arbitrary code／script template。
- delete operation。
- full snapshot 以遺漏 base document 來隱式刪除。
- 以 compiled JSON 反向覆蓋 authoring source。
- 將 raw `ability@1`／`item@1` Runtime Document JSON 當成完整 package apply 或 authoring round-trip。
- 在 Effect Chain 直接改 Product params。
- 只驗單份文件而不驗 full staging tree。
- 缺 runtime capability 時把 typed target-set child chain 錯誤攤平成平面 effects。
- 以既有逐文件 overlay 或平台搬遷 ZIP 冒充本規格的 atomic apply。
- 核心 V1 編輯 emitter／ribbon VFX documents；路徑只為日後 capability 保留。

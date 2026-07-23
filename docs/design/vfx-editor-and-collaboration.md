# VFX/技能編輯器與協作分工設計 (VFX Editor & Collaboration)

> 目標：讓其他人（含非技術朋友）能高效編輯英雄／技能／**特別是視覺特效 (VFX)**，取代「在 AI coding 工具裡手打 JSON」的低效流程。
>
> 狀態：設計提案（design proposal）。本文匯整四路研究：工具調查、GGD 能力盤點、編輯器 UX、協作治理。
>
> 相關任務：#96（圖鑑即編輯器）、#102（後台管理）、#123（共用 VFX primitive 庫）、#79（92% 共用火焰佔位）、#50（逐次美術參數）、#98（零幾何特效模型）、#126（帳號審核閘）、#118（角色 / meta）。

---

## 1. 執行摘要 (Executive Summary)

**Headline：不要找一個外部工具來取代 JSON，而是把 GGD 既有的 `apps/editor`（schema-driven 表單 + 即時 Babylon 預覽）升級成一個專用的「VFX 綁定 + 參數」編輯器，並用兩層策略處理。**

- **Tier 1（90% 的情況，先做這個）**：在 GGD 引擎內、以資料為輸出的**應用內編輯器**。復用既有的 `apps/editor` VfxPanel、`toParticleSystem` 工廠（保證 preview == ship）、以及 #96 的存檔／還原路徑。編輯者做的是：**綁哪個技能用哪個特效** + **調色／縮放／數量／生命／速度**。這解決 #79（依文冰要有冰）與 #50（逐次美術參數），完全不需要第二個引擎、不碰決定性 sim。
- **Tier 2（新的原創特效）**：對於無法用 `vfx@1` 參數表達的高階華麗特效，讓專職美術用**標準獨立工具 Effekseer**（免費 MIT、有官方 WebGL/WebGPU runtime）製作，經 `tools/vfx-import` 匯入成 #123 共用 primitive 庫的一個新條目，再走同一套審核 / 策展閘。這是 pilot（先在少數招牌技能上驗證整合），不是一開始就當支柱。

**為什麼這個組合是對的**：GGD 的硬約束決定一切——它是 Babylon.js web app、VFX 必須是 presentation-layer 的資料且**絕不觸碰決定性 30Hz sim**、目標是讓非工程師不打 JSON。這強烈偏好 (a) 在 Babylon 內執行、不需第二引擎，(b) 輸出資料而非程式碼 的工具。Babylon 原生編輯器完美符合兩者；Effekseer 是唯一同時「最強大的 no-code 編輯器」且「真有 web runtime」的外部選項，但需要一次 scoped 整合 spike。

**安全性是使 delegation 可行的頭條結論**：因為 VFX 純粹是 presentation layer，一個壞掉或惡意的 vfx 文件**無法 desync sim 或改變勝負**，所以 `vfx` 是最該最先開放的 collection。

---

## 2. 工具調查表 (Tool Survey)

| 工具 | 類別 | Web runtime | Babylon 互通 | No-code | 授權 | 對 GGD 契合 | 建議 |
|---|---|---|---|---|---|---|---|
| **Babylon Node Particle Editor (NPE)** | 引擎原生 node-graph 粒子編輯器 | 原生（就是 Babylon） | 完美（`NodeParticleSystemSet.ParseFromSnippetAsync` → `buildAsync`） | ✅ | Apache-2.0 免費 | **最強結構契合**：輸出純資料，直接落進 content 管線，零新 runtime | **採用** |
| **Effekseer + EffekseerForWebGL** | 專職獨立 VFX 編輯器 + WASM runtime | 是（WebGL/WebGPU） | 已證實但手動（每幀 update-before / draw-after Babylon，alpha-blend 排序需修） | ✅ | MIT 免費 | 最強 no-code 工具，符合動漫打擊感；但加 WASM payload + 桌面安裝 | **Pilot** |
| **Babylon Legacy Particle Editor (Inspector)** | 引擎原生 表單/滑桿 粒子編輯 | 原生 | 完美（snippet / JSON） | ✅ | Apache-2.0 免費 | 比 node graph 更好上手，適合首次非工程師 & 簡單環境效果 | **採用（on-ramp）** |
| **Babylon Node Material Editor (NME)** | 引擎原生 node-graph shader | 原生 | 完美 | ✅ | Apache-2.0 免費 | 補齊「動漫 LOOK」：卡通/描邊/溶解/fresnel，粒子給不了的質感 | **採用（搭配）** |
| **Babylon GUI Editor** | 引擎原生 no-code UI/HUD | 原生 | 完美 | ✅ | Apache-2.0 免費 | 相鄰非核心：螢幕空間 HUD 花邊 | 參考 |
| **three.quarks + editor** | Three.js 粒子庫 + WYSIWYG 編輯器 | 是（WebGL） | 差（Three.js 綁定，非 Babylon） | ✅ | MIT 免費 | 只參考其 schema / over-lifetime bezier 曲線 UX | 參考 |
| **PlayCanvas Editor** | 瀏覽器全引擎 + 協作編輯 | 是（自家引擎） | 無 | ✅ | SaaS 編輯器 / MIT runtime | 只參考其協作 + 表單帶曲線的 UX | 參考 |
| **Unity VFX Graph** | 桌面 node-graph GPU VFX | 無（Unity 內部） | 無 | ✅ | Unity 授權 | 只參考：block palette + 即時預覽 + timeline 序列 | 參考 |
| **Unreal Niagara** | 桌面 node-graph GPU VFX | 無 | 無 | ✅ | Unreal EULA | 只參考：Systems>Emitters>Modules 可重用階層（= #123 目標） | 參考 |
| **PopcornFX** | 獨立商用編輯器 + C++ SDK | 無 web runtime | 無 | ✅ | 商用專有 | 無 web runtime、商用授權，Effekseer 已涵蓋同需求且免費 | **駁回** |

**取捨原則**：先用 GGD 已經在跑的（快、安全、輸出資料），讓 Effekseer 當「已 de-risk 後才啟用」的高階選項。DCC 巨頭與 PlayCanvas/three.quarks 因引擎不對或無 web runtime 只能當 UX/schema 參考。

---

## 3. GGD 目前的地基與接縫 (Foundation & Seams)

### 3.1 現有編輯器

- **`apps/editor`（最完整，主要 VFX 接縫）**：Vite React SPA，透過**走訪 shared Zod schema** 自動生成編輯表單（`form/walk.ts` + `FormRenderer.tsx` + 各型別 widget）。collection registry 已列出**所有** collection 含 `vfx` 與 `abilities`。它有**真 3D 即時預覽**（`preview3d/VfxPanel.tsx`），透過**與遊戲同一個 `toParticleSystem` 工廠**渲染任何 vfx 文件（preview==ship），有 play/pause/burst-now 與 ~300ms debounce 重建。`RefSelect` 已是 ability→vfx 的綁定 widget。啟動：`pnpm dev:editor`。**缺口**：它是通用 JSON 表單 + 預覽，不是專用視覺 VFX 工具——沒有色票、沒有漸層/時間軸編輯器、沒有 emitter gizmo、沒有 ability→vfx 並排綁定視圖。
- **Codex 應用內編輯器（#96）**：玩家面 #codex 在 dev build 才有 EDIT 模式（`import.meta.env.DEV` 動態載入，production 缺席）。只編 champions/items/abilities（**無 vfx**）。兩步存檔（儲存=dry-run + 欄位 DIFF，確認寫入=寫）。懂 MIRROR RULE（技能寫入也 patch 英雄內嵌副本，因為 sim 讀內嵌副本）。伺服器快照 undo。
- **後台管理 admin（#102）**：Loopback-pinned 操作台。ContentPage 對 champions/skills/items 結構化 CRUD；ability 群組含 `vfxKey` 文字欄（可**重綁**技能到不同 vfx id，但**不能編 vfx 文件本身**）。同兩步 diff+confirm、同 mirror rule，顯示 cv_ 與「重開一場才會生效」。也含 CurationPage（whitelist）等。
- **content-api（dev-only Fastify 寫入後端）**：所有編輯器共用的**唯一寫入路徑**。REST over `content/` JSON：GET/PUT/POST/DELETE、validate（dry-run）、backups/restore、SSE `content:changed`、`/assets/*`。每次寫入用**與遊戲 loader 同一套 Zod schema** 驗證，原子寫入，增量重建索引。**拒絕 `NODE_ENV=production`**。Auth = `guard.ts`：變動動詞要求 **loopback peer** + 本機 dev Origin。寫前 byte 快照到 git-ignored 備份。

### 3.2 VFX 資料模型

- **內容形狀**：`content/vfx/` 是 ~295 個一檔一物件的 JSON + `_index.json`。**兩個 schema** 以 `schema` 欄位判別（`packages/shared/src/content/schema/vfx.ts`，union 為 `zVfxCollectionDoc`）：
  - `vfx@1`＝資料驅動粒子 emitter：`{id, emitter{shape,radius,angleDeg}, mode, rate/burstCount, lifetimeSec, size, color, blendMode, texture}` + 全可選 WC3 擴充（#30）：`gravityY, colorStops[≤4], sizeStops[≤4], spriteSheet, stretched/tailLength, speed, anchorBone, ambient`。
  - `ribbon@1`＝掃掠拖尾帶：`{widthAbove, widthBelow, lifespanSec, color, uvScrollPerSec, blendMode, anchorBone, texture}`。
- **技能如何引用 VFX**：**單一 soft string key**。`ability@1` 與 `projectile@1` 各帶可選 `vfxKey: zRef('vfx',{soft:true})`；`effect@1` 另有 `spawnVfx` 帶 `vfxId`。**綁定很粗**：一個 vfxKey / 一份 ability 文件（非 per-effect/per-phase）——這正是 #79「92% 共用一個火焰佔位」的機制。
- **渲染入口**：`apps/client/src/vfx/`。`VfxSystem.ts` 每幀抽 `MSG.EVENT` fanout（abilityCast/projectileHit/damage/death），播該技能 vfx，疊 Telegraph 環 + HitSpark。`particleFactory.ts` 的 `toParticleSystem` 是**全 repo 唯一**的 vfx@1→Babylon ParticleSystem 翻譯，client 與 editor 預覽都呼叫它 → 保證 preview==ship。VfxSystem 在 presentation layer **retune** 播放（不改 228 份匯入文件）以保決定性。
- **Primitive 庫狀態（#123）**：**尚未建**。tornado/shockwave/explosion/locust-swarm/nova/beam 都不存在為 content 或 code；匯入的 WC3 版本是壞掉/零幾何（#98）。編輯者目前無可重用素材可組合。

### 3.3 決定性邊界（乾淨且已強制）

權威 sim 在 `packages/shared`（決定性 30Hz、無 Math.random/Date.now、同 seed byte-identical replay）。VFX 完全在 presentation layer，被 content 驅動但 sim 從不讀取：sim 讀英雄/技能數值欄位（英雄內嵌 ability 副本），而 `vfxKey`/vfx 文件只被 VfxSystem/particleFactory 在 render 時消費。**結論：因 VFX 純 presentation，開放 VFX 編輯天生安全——壞的 vfx 文件無法 desync sim 或影響勝負。這使 `vfx` 成為最該最先 delegate 的 collection。**

### 3.4 發佈閘（Publish gate）

兩機制合成一個閘：(1) `content:build` 重建索引並在 `content/manifest.json` 蓋 `contentVersion`（cv_…），client/server 比對 cv_，存檔「不重開不生效」。(2) **策展 whitelist**（`data/curation/whitelist.json`，預設空陣列，admin CurationPage 編輯）是操作員 allow-list：沒被 enable 的 id 不可玩。合起來：貢獻者可存檔（Zod 驗證 + 快照 + diff），但要 (a) content:build 重蓋 cv_ 且 (b) 操作員 whitelist 後才到玩家。

### 3.5 主要接縫（要插入編輯器的地方）

1. **`apps/editor` 現況**：最快 delegation 路徑——今天就能讓貢獻者 `pnpm dev:editor` → 選 vfx collection → 編表單 → 看即時粒子預覽 → 存檔。MVP 升級＝把通用 widget 換成專用 VFX inspector（色票、漸層 stop 時間軸、emitter gizmo、texture picker），註冊為 vfx 專屬 override。
2. **vfx@1 Zod schema** 是契約：任何新編輯器應**從此 schema 生成表單並驗證**，用 UI-schema/annotation 層加 authoring 提示，而非 fork。
3. **ability.vfxKey + RefSelect**：綁定編輯器已存在。要正本清源修 #79，須**擴充 schema 讓 vfxKey 可 per-effect/per-phase**，再讓 binder 選 #123 primitive。
4. **content-api REST + guard + backup**：協作編輯器原樣復用寫入路徑。遠端貢獻者要把 loopback guard 換成平台角色/auth（#118/#126），保留兩步 validate+snapshot+diff。
5. **`toParticleSystem` 工廠**：任何新 VFX 編輯器**必須透過它渲染**（如 VfxPanel），絕不自寫預覽渲染器——這是新工具必須保住的不變式。
6. **策展 whitelist**：發佈/審核閘。加一個 vfx/貢獻維度，把「貢獻者存了 vfx」變「操作員 enable 前不上線」。

---

## 4. 提議的編輯器（Data Model + Panels + Live Preview）

### 4.1 資料模型：`fx-compose@1`

新增 schema `fx-compose@1`，作為既有 `vfx` collection union 的**第三臂**（與 `vfx@1`、`ribbon@1` 並列），因此沿用**同一** loader、registry、content-api validate+write、#96 undo，零新管線。技能的 `vfxKey` 現在可指向 `fx-compose@1` 文件；VfxSystem 依 `schema` 派發，複合特效可 per-ability 上線而不必遷移其餘 227 份文件。

一個 EFFECT ＝在正規化施法時間軸上、有序的 LAYER（primitive 實例）清單：

```jsonc
{
  "id": "fx.ember-bolt",          // 與 vfxKey 同 id 空間
  "schema": "fx-compose@1",
  "durationSec": 1.2,             // 預覽 loop 長 + one-shot 生命鉗制
  "events": { "impactSec": 0.55 },// 作者放置的合成 impact marker（投射旅行）；cast=0、recover=end 來自 clip
  "layers": [
    {
      "key": "core",                                 // 本地 layer id
      "ref": { "kind": "primitive", "id": "prim.nova" }, // 或 {kind:"vfx",id:...} / {kind:"ribbon",id:...}
      "params": { "color": {"start":[1,0.6,0.2,1],"end":[1,0.2,0.05,0]}, "scale":1.4, "count":40,
                  "lifetimeSec":{"min":0.15,"max":0.4}, "speed":{"min":4.5,"max":10}, "gravityY":-12 },
                  // primitive 已發佈旋鈕的「部分」覆寫（#50 美術參數）；缺欄=primitive 預設（沿用 #96 absent=default）
      "anchor": { "at": "hand_r", "offset":[0,0,0], "follow":true },
      "start":  { "event": "cast",  "atSec": 0.0 },  // 相對某命名事件何時發射
      "stop":   { "event": "cast",  "atSec": 0.4 }   // 可選：連續/環境窗結束；省略＝一次性 burst
    }
  ]
}
```

- **命名事件**是時間軸的軌，1:1 對應 VfxSystem 已消費的 fanout：`cast`（abilityCast 幀）、`anim:<clip>@t`（模型 cast/attack AnimationGroup 的某比例幀，存 `{event:"anim:cast",phase:0.6}`）、`impact`（projectileHit；預覽中的合成 marker）、`recover`（clip 結束）。
- **錨點**是列舉，解析成 live Babylon TransformNode：`caster_root | hand_r | hand_l | weapon | head | chest | ground_caster | ground_target | target | projectile | camera`。hand/weapon/head 復用 vfx@1 的 `anchorBone`（GLB skeleton 上 getNodeByName）；ground_* 投影到 y=0；projectile 是一個 caster→target lerp 的節點使拖尾層跟隨。
- 每個 #123 primitive **發佈一份 PARAM SCHEMA**（可調旋鈕的型別/範圍/預設）；layer 的 `params` 對它驗證——這是右面板滑桿能自生成、dry-run validate 能檢查的原因。
- **裸 vfx@1 文件仍完全有效**——複合是嚴格加法（strictly additive）。

### 4.2 四區編輯面板

- **左 — 綁定 & 素材庫 (Binding & Library)**：選哪個技能驅動此特效 + 從 #123 primitive 庫組裝 layer stack。控制：可搜尋 ability 選單（Champion→slot Q/W/E/R/EX，顯示現 vfxKey 解析為 vfx@1 或 fx-compose@1）；layer stack 列表（拖曳排序、mute/solo/複製/刪除、色片）；Add-layer + primitive palette（#123 縮圖格：tornado/shockwave/explosion/locust-swarm/nova/beam + 既有 fx.* + ribbon，每格 live 動畫）；分類 tab（衝擊/投射/施法/光環/軌跡）+ 搜尋；per-layer ref-kind badge + 「replace primitive」（保留同名旋鈕）。
- **中 — Live Babylon 預覽**：特效在一個循環施法的 dummy 英雄上發射，即時 eyes-on 調整——復用既有 BabylonCanvas + stage。控制：viewport（dummy 英雄 + 固定距離標靶 + 地格）；transport（play/pause/loop/restart-cast/step-frame）；播放速度 0.25×–1×；dummy 換模 + 動畫狀態（施法/攻擊/待機）；相機預設；標靶/地格/亮度切換；live HUD（時間、當前事件 badge、粒子數 vs 預算）。
- **右 — 參數 inspector**：調選中 layer 的外觀，滑桿+色票由 primitive 已發佈 param schema **自動生成**。控制：Color（start+end 色票 + 1–4 stop 漸層編輯，對應 colorStops，動漫調色盤預設 火/冰/聖/暗/雷）；縮放、數量/rate、生命 min/max 雙滑桿、速度 min/max 雙滑桿、gravityY、size；blend mode 下拉、texture picker；emitter 形狀 + radius/angle；#50 美術參數（facing/tint/alpha/height/timeScale）；anchor（關節下拉+ground/target/projectile、XYZ offset、follow）；per-field「重設為 primitive 預設」+ 顯示預設 pill（absent=default 可見）。
- **底 — 時間軸 / 關鍵幀**：把每層放進相對 cast/anim/impact/recover 事件的時間。控制：0..durationSec 尺規 + 可拖曳事件旗標（cast/anim:hit/impact/recover）；一層一 lane（連續層＝可拖曳 start→stop bar，一次性 burst＝鑽石關鍵幀，snap-to-event）；playhead scrubber 與中央預覽同步 + loop region；durationSec 欄、add-event、水平縮放；右鍵關鍵幀→「pin to event」（存 {event,offset} 而非絕對時間，clip 重定時會帶動 pinned 層）。

### 4.3 Live Preview 方法

完全在 loopback admin app **client 端**執行；只有 Save 碰伺服器。復用完全相同的 ship path：複合預覽是一個小 **scheduler** 疊在**同一個** shared `toParticleSystem` 工廠上（preview == ship）。

Loop：GLB dummy 播其 `cast` AnimationGroup 當主時鐘，loop 長 = max(durationSec, cast-clip 長)，預設 ~1.2–1.5s（既有 REBURST_MS）。每 loop scheduler 走訪各層並透過 runtime path 發射——burst 層在解析出的 start 時刻呼叫 `burstNow`，連續/光環層 `start()`/`stop()`——定位在解析出的 anchor 節點。滑桿拖曳 → 既有 `useDebounced`（~200–300ms）**只重建被編輯層的** ParticleSystem（dispose + 用工廠重建），施法在下方持續循環。預覽粒子預算封頂（復用 `particleBudgetScale`），live 粒子數 HUD + additive-safe 深色背景直接來自 VfxPanel。無效草稿→續繪最後有效複合並顯示 inline note。

---

## 5. 協作／治理工作流 (Collaboration & Governance)

### 5.1 角色

| 角色 | 能做什麼 |
|---|---|
| **貢獻者 (作者)** | 讀整個已發佈目錄；被**指派**一或多個英雄/技能（不相交 ownership）。只在 schema-driven 編輯器建/編**其指派 id 的草稿**（絕不手打 JSON），用 Babylon live preview 迭代。可 validate（dry-run 422）與**提交審核**。不能直寫 content/、不能碰 whitelist、不能 in-game enable。 |
| **審核者 (審核)** | 貢獻者所有能力 + 看審核佇列、開任何提交草稿、看欄位級 DIFF + 並排 live preview、跑 test/content:build、**核准或退回**。核准＝原子寫入 content/ + 自動快照 + 重建索引 → 新 cv_。核准使內容「存在且可預覽」，但**不會**自動使其可玩。可經 /restore 還原。不能編 whitelist。 |
| **管理員 / 策展 (營運)** | **唯一持有 PUBLISH 開關**。擁 curation whitelist（預設空）。把核准的 id 加入 whitelist＝使其在對戰中可選、對玩家可見的**唯一動作**。也審帳號註冊（#126）、指派角色與英雄 ownership（#118）、審 Effekseer→primitive 匯入、whitelist 回滾。可做審核者一切。 |
| **玩家 / 成員 (玩家)** | 已核准帳號、無編輯權，只見/玩 whitelisted 內容。新註冊者被 admin 核准後的預設角色。 |

### 5.2 提交工作流（具體步驟）

1. **身分（#126）**：貢獻者註冊 → pending → admin 核准帳號 + 授 role=contributor + 指派 owned 英雄/技能 id。編輯面在此之前不可達。
2. **草稿編輯（apps/editor）**：載入已發佈文件，把編輯寫入 per-contributor **DRAFT namespace**——擴充 content-api 加 `?draft=<contributorId>` scope，寫入 `data/drafts/<contributorId>/<collection>/<id>.json`，content/ 不變。全走 schema-driven 表單（無 raw JSON）。
3. **Live preview**：Babylon 預覽把草稿疊在已發佈內容上，用真引擎渲染——這就是取代「對 AI 打 JSON」的效率贏點。
4. **驗證 + 提交**：提交呼叫 dry-run validator（422 帶欄位問題），乾淨提交寫一列 review request（`data/reviews/<reqId>.json`，含 `{contributorId, collection, id, proposedDoc, baseHash}`）。baseHash 是樂觀鎖 token。
5. **審核**：審核者看欄位 DIFF + 並排 preview。退回→回貢獻者草稿；核准→步驟 6。
6. **套用 (Apply)**：核准呼叫既有寫入路徑，(a) 重查 baseHash，若他人已改則 409（並發守衛），(b) 覆寫前快照（undo），(c) 原子寫入，(d) 增量重建索引→新 cv_，(e) SSE `content:changed`。內容現存在於 content/ 且可預覽，但**仍不在任何對戰中**。
7. **發佈（策展閘）**：admin 在後台把英雄/技能 id 加入 whitelist。**唯一**使其對玩家上線的步驟。VFX 沒有自己的 whitelist kind——一份 vfx 文件在其被引用的 whitelisted 技能被 enable 的瞬間**遞移上線**。所以「發佈新特效」＝「策展綁它的技能」，維持單一發佈閘。

**跨過的閘總結**：帳號核准（admin）→ 草稿驗證（Zod）→ 審核+套用（reviewer）→ 策展入 whitelist（admin）。**兩個獨立人工核准，兩端皆 admin 掌控。**

### 5.3 版本控制與回滾

- **DRAFT vs PUBLISHED**：已發佈真相＝content/ 樹；草稿在 per-contributor overlay（`data/drafts/…`），套用前不碰 content/——壞草稿影響不了任何人。
- **contentVersion (cv_…)**：manifest.json 由 per-collection hash 算出，每次套用重蓋新 cv_。一場對戰跑一個 pinned cv_，途中編輯不會變動 live match。
- **快照 / undo**：content-api 每次覆寫/刪除前已快照，`/backups` + `/restore`（為 #96 建，repo 尚無 VCS）。
- **回滾兩獨立槓桿**：內容回滾（`/restore` 放回先前快照）；**可用性回滾（更快、不改內容）＝從 whitelist 移除 id**，一個 admin 動作即時把英雄/技能（及其遞移引用的 VFX）拉出所有 pool。

### 5.4 衝突處理

1. **不相交 ownership（主要、人類尺度）**：admin 指派每個英雄（及其 ability/vfx 文件）給一位貢獻者。GGD 一檔一物件，ownership 沿檔案邊界乾淨切分，多數「衝突」根本不發生。共用 #123 primitive 由 reviewer/admin 擁有，非個別貢獻者。
2. **Per-contributor 草稿空間（隔離）**：各自只寫 `data/drafts/<contributorId>/…`，套用前無物可 clobber。
3. **套用時樂觀鎖（罕見共用檔安全網）**：review request 記 baseHash，套用比對現行已發佈 hash，若檔案在下面動過則 409（擴充 PUT 尊重 `If-Match: <baseHash>`）。409 時 reviewer re-base 再提交。**絕無靜默 last-writer-wins。**

### 5.5 Effekseer / 資產匯入路徑

對真正無法用 vfx@1 參數表達的原創特效：作者在獨立工具（Effekseer，或 Blender/Blockbench 做 mesh-driven FX）製作，輸出成 #123 庫的**新共用 primitive**。

1. **外部製作**（Effekseer .efk/.efkefc + textures，或帶 baked emitter 的 .glb）。Effekseer 有官方 WebGL runtime，.efk 可在 Babylon presentation layer 播放而不必手 port。
2. **匯入工具**（`tools/vfx-import` script，仿既有 `tools/w3x-import`）：texture 複製進 `content/assets/textures/particles/`（content-hash 去重），產出**vfx@1 文件**（若可化約成原生粒子模型）**或**在 #123 庫註冊的新 primitive descriptor（穩定 primitive id + efk/glb 資產引用）。對 Zod schema 驗證，malformed 拒收（同 422 紀律）。
3. 新 primitive 走**同一治理路徑**：落成草稿，reviewer live preview（讀得懂嗎？合尺寸/perf 預算嗎？接 #99 資產預算頁 tris/貼圖成本）並套用。
4. **發佈仍遞移**：primitive 在引用它的 whitelisted 技能被策展時上線；沒人引用的 primitive 是惰性的。資產出處/授權在匯入時記錄（同 CC0/w3x 的 CREDITS 紀律）。

### 5.6 安全論證（使 delegation 可行的頭條）

開放 hero/skill/VFX 編輯 **by construction 安全**，三條獨立理由：

1. **只在 presentation layer，sim 物理隔離**：權威 sim 在 `packages/shared/sim`，決定性 30Hz、同 seed byte-identical。VFX 是 client render 層、被 content 驅動，從不 import sim 或回饋 sim。一個 color-stop 或新 Effekseer primitive **沒有程式路徑**能改碰撞/傷害/hitbox/勝負。最壞情況：某人螢幕上醜或掉幀，desync 不了對戰。
2. **決定性邊界從不被編輯面跨越**：貢獻者只透過 schema-validated 表單寫 vfx/champion/ability/item **資料**，碰不到 sim code、whitelist、平台 config，reach 被限在其指派檔案的草稿 namespace。無編輯動作能把非決定性輸入注入 sim。
3. **策展閘——admin 說了才上**：whitelist 預設空、admin-only。game-server 對每個可玩 pool/shop/draft 過濾並硬拒非 whitelisted id 的 SELECT_CHAMPION。所以貢獻者「核准+套用」的編輯仍惰性躺在 content/，直到 admin 明確策展。**兩個獨立人工核准**（reviewer 套用、admin 策展）站在任何外部編輯與 live match 之間，任一皆可一動作反轉。

---

## 6. 分階段路線圖 (Phased Roadmap)

| 階段 | 交付物 | 依賴 | 關聯任務 | 量級 |
|---|---|---|---|---|
| **P0 — 立即 delegation（零新程式碼）** | 把貢獻者指向 `pnpm dev:editor`，用既有通用 Zod 表單 + VfxPanel live preview 編 vfx docs，經 content-api 存檔。寫一頁 contributor guide live page。 | 現有 apps/editor + content-api | #96 | 小（文件+onboarding） |
| **P1 — #123 primitive 庫（palette 的前提）** | 建 6 個可重用共用 primitive（tornado/shockwave/explosion/locust-swarm/nova/beam），各發佈 param schema。修 #98 零幾何匯入或以原生粒子重建。 | P0 | #123, #98 | 中大 |
| **P2 — MVP 複合編輯器（VfxPanel composite 模式）** | 加 `fx-compose@1` schema 臂；VfxPanel 支援 1–3 層 stack；每層選一 primitive + 調五核心旋鈕 + 選一 anchor + 一 start event（cast/impact）+ numeric offset；固定 dummy 施法 loop 預覽；經 #96 存檔路徑存 + 寫 ability.vfxKey（尊重 mirror rule）。 | P1 | #96, #123, #79 | 中 |
| **P3 — 修 #79 綁定正本清源 + #50 美術參數** | 擴充 ability schema 使 vfxKey 可 per-effect/per-phase；binder 選 primitive；把 #50 逐次美術參數（scale/facing/tint/alpha/height/timeScale）建入 fx-compose 層 params。 | P2 | #79, #50 | 中 |
| **P4 — 專用 inspector widgets** | 色票 / 漸層 stop 時間軸 / emitter gizmo / texture browser（content-api /assets/*）/ 預設 & duplicate-as-template，註冊為 vfx 專屬 override（`uiSchema.ts`）。 | P2 | #96 | 中 |
| **P5 — 底部時間軸 v2** | 可拖曳 keyframe/bar、snap-to-event、`anim:<clip>@phase` pins、projectile-follow 與 ribbon 層、champion-swap、per-field default-reset。 | P4 | #123 | 中 |
| **P6 — 協作治理** | 加 `?draft=<contributorId>` scope、review request/queue、欄位 DIFF 審核、If-Match 樂觀鎖 409、不相交 ownership。用平台角色/session token 換掉 content-api loopback guard。whitelist 加 vfx/貢獻維度。 | P2, 平台 auth | #126, #118, #102 | 大 |
| **P7 — Effekseer pilot** | scoped 整合 spike：shared-GL-context update-before/draw-after Babylon、alpha-blend 排序修正、WASM payload。`tools/vfx-import` 把 .efkefc 匯入為 #123 primitive。先在 1–2 個招牌技能驗證。 | P1, P6 | #123 | 大（含風險 spike） |

---

## 7. 先建的 MVP (Build First)

**把既有 `apps/editor` VfxPanel 升級成 composite 模式**（P2），前置最小 #123 子集，走 #96 存檔路徑：

1. **擴 VfxPanel 為 composite 模式**（非新 app）：保留單文件編輯，加 1–3 層 stack。每層＝從 palette 選**一個** #123 primitive + 調五核心旋鈕（color/scale/count/lifetime/speed）+ 選**一個** anchor（caster_root / hand_r / ground_caster 短清單）+ **一個** start event（cast 或 impact）帶 numeric offsetSec + 連續層的 durationSec。**先不做完整 keyframe 拖曳**——就一個 per-layer start-time 數字 + impact marker。
2. **Live preview 用一個固定預設 dummy 英雄** 播其 cast clip 在既有 ~1.5s loop，固定距離標靶，用既有 stage + `toParticleSystem` scheduler。滑桿 debounced 只重建被編輯層。
3. **加 `fx-compose@1` 到 vfx union，經 #96 完全不變的路徑存**：validate dry-run → 欄位 diff → 帶 prev-bytes 快照寫 + 「復原上一次儲存」undo，loopback-only、DEV-gated。**綁定＝寫 ability.vfxKey 為複合 id，尊重 MIRROR RULE**（Q/W/E/R 寫獨立 ability 文件 + 英雄內嵌雙生；EX/道具寫一份）。

**具體第一勝**：選依文潔琳的冰技能，丟一個 `prim.nova` 層，染冰藍，設 cast 時在 hand_r 發射，看它在 dummy 上循環，Save——不打 JSON，冰技能終於有冰（直接服務 #79）。

**延後到 v2**：底部 keyframe 時間軸拖曳/snap、`anim:<clip>@phase` pins、projectile-follow 與 ribbon 層、champion-swap、per-field default-reset UI、貢獻者 submit→review→curation 治理。

> 注意 MVP 前置：MVP 需要**至少少數 #123 primitive 存在**才有 palette 可選。若 #123 完全空，退而求其次的更小 MVP＝P0（純用既有通用表單編 vfx@1 docs + live preview + guide），這**今天零程式碼**就能開始 delegation，同時平行建 #123。

---

## 8. 開放問題 (Open Questions)

1. **遠端 vs 本機協作**：貢獻者要能遠端編輯（需 host apps/editor + 用平台 auth 換掉 loopback guard，屬 P6 大工程），還是初期僅限「本機/同網段的朋友」用 `pnpm dev:editor`（零 auth 工程、今天可行）？這決定 P6 是否進 MVP 之前。
2. **#123 先建到什麼程度**：MVP 需要幾個 primitive 才夠有意義？先做全部 6 個，還是先 nova + shockwave 兩個就開跑 MVP？（影響 P1 vs P2 的排序與 MVP 是否降級為 P0。）
3. **per-phase vfxKey 的 schema 改動時機**：#79 正本清源需要 ability schema 從「一 vfxKey/doc」改成 per-effect/per-phase。這是 breaking-ish schema 演進——在 MVP 就做（複合層內建），還是 MVP 先用「一複合 doc 內含多層」繞過、schema 改動延到 P3？
4. **Effekseer 是否值得**：是否有真的無法用 vfx@1 + #123 primitive 組合表達、非上 Effekseer 不可的招牌特效？若沒有，P7 可無限延後——省下第二引擎/WASM/render-order 的整合成本。
5. **ribbon@1 預覽缺口**：拖尾特效目前 VfxPanel 不預覽（需動畫錨點）。MVP 要不要納入 ribbon 層預覽，還是拖尾先只走 P0 通用表單無 WYSIWYG？
6. **審核者是誰**：初期是不是就你一人身兼 reviewer+admin（單人把關），還是要真的分派 reviewer 角色？這決定 P6 治理要做多重。
7. **編輯器 host 與帳號**：若要遠端，apps/editor 部署在哪、帳號系統是否等 #126/#118 落地才開放編輯（強耦合平台 auth roadmap）？

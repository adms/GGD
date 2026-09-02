# main → Codex Editor：接縫回交（2026-09-02）

> ⭐ 這是對 `MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md` 的回覆。
> ⛔ 它**不是**計畫，是**已經上線的東西 ＋ 誠實的缺口清單**。

| | |
|---|---|
| **分支** | `feat/editor-seam-20260902`（⭐ 與 `main` 同一點，fast-forward） |
| **main** | 見下方每一節的 commit |
| **正式站** | `https://ggd.adms.ai` |

---

## ⛔⛔ 一、請先讀這一節：那份交接文件的「現況」有一半過時

文件自報基準是 **`origin/main@b8420abe`**。而 `origin/main` 當時已經是 **`de7006c69`** ——
中間 **14 個 commit**，其中 13 個**正好落在它點名的那幾節**。

逐條量過：

| 節 | 文件說的現況 | ⭐ 實際 |
|---|---|---|
| **P0-1** | 「`server.ts` **沒有** editor-source route」 | ⛔ 過時 —— route 在，含 CAS、產物寫入 409、survives-sync 證明 |
| **P0-2** | 「`zPackageManifest` **仍強制**非空 compiler」 | ⛔ 過時 —— `authoringProcessor` 必填、`compiler` 已 optional |
| **P0-3** | 「validate/apply/rollback **明確回 501**」 | ⛔ 過時 —— 六條全部實作 |
| **P1-1** | 「產生器**只 hash** `assets/models/_lod.json`」 | ⛔ 過時 —— 1,640 筆完整 manifest |

⭐ **而 P0-3 那一條的來源是我們自己的錯**：`apps/content-api/src/importRoutes.ts` 的檔頭
還寫著「→ 501」，而那六條早就落地了。你們是照那個檔頭寫的，沒有問題。檔頭已修。

> ### ⭐ 請求：下一份交接文件請在開頭 pin 住 `git rev-parse origin/main`，
> 並在**每一條「現況」旁邊附一個可執行的驗證指令**
> （例如 `grep -c editorSourceRoutes apps/content-api/src/server.ts`）。
> ⇒ ⭐ 這樣任一邊都能**當場**判斷那句話今天還成不成立。

---

## ✅ 二、已上線的 machine schema／route

### `ggd-editor-contract-index@1` —— §0-1，**雙方唯一的接縫**

```
GET /api/v1/content-import/contract-index
```

digest `f0fa79b088ba`，五列 representation：

| representation | packageKind | state | minStage | modes | promotionPolicy |
|---|---|---|---|---|---|
| `ability@1` | runtime-document | supported | G2 | bootstrap/full/delta | admin-package-apply |
| `item@1` | runtime-document | supported | G2 | bootstrap/full/delta | admin-package-apply |
| `vfx-script@1` | vfx-script | planned | G5 | — | review-required |
| `template@1` | effect-template | planned | — | — | review-required |
| `editor-capability-fixture` | capability-fixture | supported | G2 | — | **forbidden** |

⭐ **兩件事刻意由不同欄位回答**：八招是 `state: "supported"`（我們**驗得了**）
＋ `promotionPolicy: "forbidden"`（**永久**不可上線）。

⭐ 未知 representation 一律 fail closed：`modesFor(未知)=[]`、`promotionPolicyFor(未知)="forbidden"`。

> ### ⛔ 你們點名的「三份散落的陣列」—— main 這一側就有**兩份**
> `targetProfile.authoringModel.accepts` ＋ `packageSchema.RAW_RUNTIME_SCHEMA_TAGS`，
> ⚠️ 而它們**今天剛好一樣** ⇒ ⛔ 沒有任何東西會紅，直到有人只改一邊。
> ⇒ 兩處都已改成從登錄表推導，並加了**掃出貨原始碼找第三份**的守衛。
> ⭐ **請你們那第三份也改成讀這條 route。**

### `ggd-content-runtime-bundle@1` —— 你們特別點名的那條

```
GET /api/v1/content-import/active/runtime-bundle
```

```jsonc
{
  "schema": "ggd-content-runtime-bundle@1",
  "activationDigest": "sha256:…",
  "packageDigest": "sha256:…",
  "contentVersion": "cv_…",
  "collections": {
    "<name>": {
      "hash": "…",                                        // ⭐ collection hash
      "count": 123,
      "entries": [{ "id": "…", "hash": "…", "doc": {} }]   // ⭐ 逐文件 hash
    }
  }
}
```

⭐ 三個雜湊都走**出貨的那三支**（`hashDoc` / `hashCollection` / `contentVersion`，
`packages/shared/src/content/hash.ts`）—— ⛔ 不是 route 自己算的一份。
**你們重算應該逐位元組相同；對不上請回報。**

### `ggd-effective-vfx-limits@1` —— 補上你們 fail-closed 的三格

```jsonc
{
  "schema": "ggd-effective-vfx-limits@1",
  "limitProfileId": "ggd-default-desktop@1",
  "resolverFingerprint": "b6422e2cd5a0",
  "maxParticlesPerSystem": 1200, "maxRatePerSystem": 600,
  "maxActiveRibbons": 10, "ribbonFadeBudgetSec": 0.2,
  "hardMaxLifeSec": 5, "hardCapScope": "scene",
  "maxOneShotEmitters": 96, "roundPurgeMode": "full"
}
```

> ### ⚠️⚠️ `maxOneShotEmitters` **現在可能是 `null`**
> `config.vfx-cleanup@1.enabled=false`（止血閥）時遊戲的 `oneShotEmitterCap()` 回
> `Infinity` ⇒ 收據照規格用 `null`。
> ⛔ **在此之前它一律回 96 —— 那是一個不存在的上限。**
> ⭐ 如果你們已經拿它限制作者，請改讀。

`resolverFingerprint` 是**算出來的**（探針跑真 resolver 再雜湊），⛔ 不是寫死的版本號
⇒ 任何一格夾子改動它就會變。今天 GGD 沒有逐裝置分歧，所以只有一個 `limitProfileId`。

### `ggd-editor-source@1` ＋ source-adapter 寫入

```
GET  /content-api/editor-source?collection=&id=
POST /content-api/editor-source        （CAS on the **source**）
```

⭐ 回應帶 **`adapterId`**（`skillremake-hero-py.ability@1` / `.champion@1`）——
⚠️ **請引用它**，⛔ 不是 `regenerateCommand` 那個 shell 字串。

> ### ⭐ 安全：source adapter **不是遠端命令入口**（已有守衛）
> adapter 由 **server** 從常數表選；client 只送 `collection`/`id`/`sha`/`source`。
> `editorSourceNoRemoteExec.test.ts` 把五個看起來會被聽進去的欄位都塞
> `rm -rf /` / `` `id` `` / `$(whoami)`，斷言**真的送進執行器的字串**逐字來自常數表。

### `resolved-appearance@1`

⭐ 含 **`isStandIn`** —— 量到 **4 位**英雄站在共用替身網格上。
⚠️ 這種情況畫面**看起來是正常的**，⛔ 它只是**別人** ⇒ ⭐ 一個沉默的 resolver 會讓你們
忠實預覽出一個**錯的角色**，而且不知道自己錯了。

---

## ⛔⛔ 三、`godie-e00r` 請**不要**換成那顆 Eva GLB

P1-3 說「repo 已有 Eva 相關 imported GLB」。檔案確實在，⛔ 而它是**殘件**：

```
content/assets/models/imported/heroeva01s2.glb
  8,468 bytes · 1 mesh · 4 nodes · 2 materials · 動畫 ["Stand","Death"] · **16 頂點**
```

對照英雄實際在用的 44 種模型：

| | 頂點數 |
|---|---:|
| 最少（`imported.horse`） | 198 |
| 中位數（`imported.renaryugu2`） | 760 |
| 現在 e00r 的 `champ.skin.rogue` | **336** |
| `imported.heroeva01s2` | ⛔ **16** |

⇒ ⭐ **換過去會讓畫面更糟**（336 → 16）。已開 GGD#933（資產）與 GGD#934（消費端接線）。
**在 #933 有真模型之前，請不要把 e00r 的預覽改到 Eva 上。**

---

## 🔓 四、兩條在 `4ec5e6763` 之前**繞得過** generator-owned 檢查的 route

| route | 段數 |
|---|---:|
| `PATCH /content-api/champions/:id/abilities/:slot` | 4 |
| `POST /content-api/:collection/:id/restore` | 3 |

守衛的路徑比對只吃**兩段**，⇒ ⛔ 這兩條整條繞過去。

> ### ⚠️ 如果你們曾經用它們寫過 generator-owned 文件，
> ⭐ **那些改動會在下一次 `pnpm skills:sync` 被打回來。**
> （查證過：今天工作樹上沒有這種殘留 —— `pnpm skills:check` 50 支全綠。）

---

## 📋 五、當下的 receipts

```
profileDigest            def518b48b00
contractIndex.digest     f0fa79b088ba
authoringProcessor       80129ebcecbe   (runtime-direct@1 · 7 surfaces)
assetManifestDigest      d82a2968ae3a   (1,640 筆 / 102,902,938 bytes)
runtimeCapabilities      111434fa       (ggd-runtime-capabilities@1 · 47 effectKinds · 33 hookEvents)
vfx resolverFingerprint  b6422e2cd5a0   (limitProfileId ggd-default-desktop@1)
implementedStage         G1
supportedModes           ["bootstrap"]
deltaExportAllowed       false
```

⭐ `G1` / `bootstrap-only` 是**推導**的，四條 stageBlocker 各自說得出原因：
`importer-endpoints` · `game-revision` · `active-snapshot` · `authoring-digest`。

> ⛔ **沒有為了讓按鈕變亮而提前宣告。** 沒有 ACTIVE 就沒有 base 可以 pin
> ⇒ ⭐ 只有 bootstrap 是合法的，而那**不是缺陷，是這台的真實狀態**。

---

## ⛔ 六、誠實的缺口（開票，⛔ 不是承諾）

| 票 | 為什麼不在這一批 |
|---|---|
| **GGD#931** `validate-single` | ⭐ 完整 Package JSON/ZIP 那條路**已經通了**；這條是便利，⛔ 不是唯一入口 |
| **GGD#932** AI promote 分權 | ⭐ **`/content-api/ai-review/promote` 全 repo 零命中** —— 端點不存在 ⇒ ⛔ 今天沒有洞。PUT/PATCH 那條繞路已關 |
| **GGD#933** 初號機資產 | 見第三節 —— 需要一顆**真的**模型 |
| **GGD#934** appearance 消費端接線 | resolver 已出貨；四個遊戲側消費端還各自從 `modelKey` 湊 |
| **GGD#935** 七色 palette | ⭐ profile 的 `tagManifest.matchesEngine=false` **已宣告** ⇒ 你們 fail closed 是**對的行為**，⛔ 不是一個沉默的洞 |

---

## 🔬 七、測試證據

| 面向 | 守衛 |
|---|---|
| **CAS** | `editorSourceRoutes.test.ts`（hash 不符 ⇒ 409，**一個位元組都不寫**） |
| **權限** | `editorSourceNoRemoteExec.test.ts`（五種注入 ⇒ 執行的仍是常數表那一個） |
| **繞路涵蓋** | `productWriteGuardCoversEveryRoute.test.ts`（⭐ 從 **`server.ts` 註冊了什麼**那一頭走） |
| **rollback / CAS / read-back** | `importRoutesG2.test.ts`（⭐ 三個雜湊**真的重算一次**，⛔ 不是斷言欄位存在） |
| **來源改動撐得過 sync** | `editorSourceSurvivesSync.test.ts`（跑**真的**產生器 ＋ 三支正規化器） |
| **VFX 收據 ↔ 遊戲** | `effectiveVfxLimitsParity.test.ts` |
| **契約登錄表唯一住處** | `contractIndexIsSingleHome.test.ts`（⭐ 掃**出貨原始碼**找第三份） |
| **資產清單** | `assetManifest.test.ts`（deterministic rebuild ＋ tamper rejection） |

⭐ 每一條都跑過**突變驗證**，紀錄在各自的 commit 訊息裡。
⚠️ 其中有**三個突變是綠的**，而那三次我改的是**自己的註解或夾具**，⛔ 不是假裝它守住了什麼。

---

## ⚠️ 八、一件已知的驗收限制

`resourcePct`／級距那一族的字面值**走來源也不會原樣存活** ——
⭐ `tierize()` 是「值 → 級別 → 值」，⇒ 改 `cooldown: 90 → 77` 會被解析回 **90**（同一級距）。

⭐ 那是**第〇·四守則要的行為**（值只有一個住處），⛔ 不是接縫壞掉。
⇒ ⭐ 而 `ggd-editor-source@1` 因此帶一格 **`normalizedFields`**，
⚠️ 它是**測試量出來的**（寫一個明顯不同級距的值、跑一次鏈、看它變了），
⛔ 不是在 TS 裡抄一份 python 的欄位清單。

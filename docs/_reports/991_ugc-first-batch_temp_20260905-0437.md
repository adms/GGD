# GH#991 第一批 —— UGC 開關（三個住處）＋ 一條閘

> 產出時間 2026-09-05 04:37 · 一條併行 lane · ⛔ 未 commit、未 push、未 `git add`

---

## 0. 一句話

`ugc.enabled` 落齊三個住處（出貨 JSON ＋ Zod ＋ 後台一頁），並補上
`packages/shared/src/ops/ugcGateIsArmed.test.ts` ——
**今天 UGC 提交端點不存在 ⇒ 綠；一旦出現而沒綁齊身分＋開關＋配額 ⇒ 紅並逐條列出缺什麼。**
⛔ 整條 UGC 流水線（提交端點、身分、逐份機器閘、HITL、上架）**沒有做**，那是第二批。

---

## 1. 我挑了哪些預設值，以及為什麼

owner 不在 ⇒ 常設指令「**沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback**」。
六格全部是他**沒有裁決**的決策點，⇒ 我挑，⛔ 每一個都是後台一格。

| 欄位 | 我挑的 | 為什麼（⭐ 引用得到的出處） |
|---|---|---|
| `enabled` | ⭐ **false** | ⛔ **這是唯一一個要辯護的預設。** 流水線今天只有第一段（這份開關）落地 —— 身分檢查、逐份機器閘、配額計數**一個都還沒有** ⇒ 出貨開著＝一條**公開的、零守衛的寫入路**。票文 Known risks 逐字：「quota ＋ maxBytes ＋ 嚴格 Zod 是最低配，**缺一個就不要打開**」。⚠️ 這與第〇·六守則「優先權大的更新預設啟動」**不衝突**：那條講的是**已裁決的取捨**（兩條路都能跑，開關是為了回頭），⛔ 這一格是**還沒做完的功能** |
| `requireAuth` | ⭐ **true**（fail-closed） | 配額是**按玩家**算的 ⇒ 沒有身分就沒有配額主體 ⇒ ⭐ 下面三格**一起失效**，而畫面上看起來只是「不用登入比較方便」。它也是「退回原因」寄得回去的唯一理由 |
| `maxPendingPerPlayer` | ⭐ **5**（界 1–200） | 擋的是**人審佇列**（漏斗最窄的一段：owner 一個人在按）。上界 200 ＝ 再高等於沒擋 |
| `quotaPerPlayerPerDay` | ⭐ **20**（界 1–500） | ⭐ 與上面**不是同一件事**：待審深度擋得住「一次塞爆」，⛔ 擋不住「送一份、被退、再送一份」——那種節奏的待審深度**永遠是 1** |
| `maxBytes` | ⭐ **262144（256 KiB）**（界 4 KiB–4 MiB） | ⭐ **量出來的**：出貨最大的一份 ability JSON = **57,748 byte**、champion = **25,688 byte** ⇒ 4.5 倍餘裕。⭐ 它擋的是**記憶體**（整份 parse 才驗得動），⛔ 不是磁碟。下界 4 KiB 是刻意的：填得更低＝整條路關掉，⛔ 而那該用 `enabled` 表達 |
| `autoPromote` | ⭐ **false** | 票文 Scope 1 逐字「**上架一律過 HITL**」。打開它＝把 owner 2026-08-24 分層漏斗的 **Tier2 語意題**整層拿掉，⛔ 而沒有任何東西會紅 |

### ⭐ 一鍵 rollback 是哪一格

**`config.ugc@1` 的 `enabled`**（後台頁「🧑‍🎨 玩家自製內容」第一格）。
⚠️ 關掉它**不會**下架任何已上線的 UGC 內容 —— 那要清白名單，是另一個動作。

### ⛔ 這一批**刻意沒做**的欄位

票文 Scope 1 還列了 `allowedCollections`（`abilities` / `vfx-scripts` / `champions`）。
⛔ **沒做**，理由不是忘記：通用設定引擎畫的是**固定形狀的純量葉**，
一個字串陣列會被走訪器歸成「不編輯的分支」⇒ 只有 `preserved` / `curve` / `tables` 三條出路，
而三條都不對（它要的是「從一個集合勾多個」）。
⇒ ⭐ 它與 `config.roster@1`（英雄上下架）是**同一個形狀**，該一起解鎖，
⛔ 不該為它在這一批硬套一個會誤導操作者的欄位。

---

## 2. 「玩家身分」的現況（⭐ 自己重量過，⛔ 不是抄票文）

| 問 | 量到的 |
|---|---|
| content-api 有沒有身分檢查 | ⛔ **零**。`grep -rniE "authorization\|bearer\|jwt\|verifyToken\|requireAuth" apps/content-api/src --include="*.ts"`（排除 `.test.ts`）⇒ **0 行**。⭐ 票文那句是對的 |
| 它唯一讀的 header | `x-ggd-operation-id`（`importRoutes.ts:926`）· `x-ggd-expected-activation`（`:1034`）—— ⭐ 兩個都是**冪等/樂觀鎖**用的，⛔ 不是身分 |
| 那它今天靠什麼擋 | ⭐ **網路位置，⛔ 不是身分**：`guard.ts` 的 dev-write guard —— ① `NODE_ENV!=production`（`buildServer` 直接 throw）② peer 必須是 **loopback**（讀 `req.raw.socket.remoteAddress`，⛔ 刻意不信 `X-Forwarded-For`）③ `Origin` 必須是已知的本機 dev origin。⭐ **讀是開放的，只有寫入動詞被擋** |
| 它在不在正式站 | ⛔ **不在**。`docker/compose.yaml:321` 逐字 `profiles: ["dev"]`（註解：「dev profile only: content CRUD/validate/SSE (RW mount!)」） |
| platform 有沒有可借的 session | ⭐ **有，而且是完整的**：`apps/platform/internal/auth/` —— HS256 JWT，`VerifyAccess()` 同時驗 **issuer ＋ audience ＋ exp**（`jwt.WithExpirationRequired()`、`WithValidMethods(["HS256"])` ⇒ `alg:none` 打不進來）。`auth.Middleware` 取 `BearerToken(r)` → 驗 → `WithIdentity(ctx, Identity{AccountID, Username})`，另有 `admin.AdminOnly` 疊在上面 |

### ⭐ 結論（給第二批的一句話）

**身分不必新造，`auth.VerifyAccess` 就是那把鑰匙 —— 缺的是「content-api 怎麼問到它」。**
兩條路，各自的代價：

| 路 | 做什麼 | 代價 |
|---|---|---|
| **A. content-api 自己驗** | 把 JWT secret／issuer／audience 給 content-api，它自己 `verify` | ⛔ **驗證規則變成第二個住處**（第〇·四守則）—— Go 那份改了 TS 這份不會紅 |
| ⭐ **B. 問 platform** | content-api 拿 `Authorization` 去打 platform 一支 introspect 端點，換回 `accountId` | ⭐ 規則只有一個住處；⚠️ 多一次網路往返，而且 platform 今天**沒有**那支端點（要新開） |

⭐ 我傾向 **B**，但這一批**沒有實作、也沒有把它寫死** —— 那是第二批要拿證據決定的。
⚠️ ⭐ 而**在此之前的第 0 個決定**仍然是票文 Scope 0：content-api 今天是 dev-only，
UGC 要它上正式站 ⇒ 那是**一次 profile 變更 ＋ 一條 edge 路由**，
⛔ 而 `guard.ts` 的 loopback 柵欄在那一刻**會擋掉所有玩家寫入**（它讀 socket peer，
而正式站的 peer 是 caddy）⇒ ⭐ 那條柵欄要被**身分**取代，⛔ 不是被繞過。

---

## 3. 閘的形狀

`packages/shared/src/ops/ugcGateIsArmed.test.ts`（範本：`aiPromoteGuardIsArmed.test.ts`）

**掃描器**：`grep -rlE "(post|put|patch|Handle|HandleFunc|route).*(ugc/(proposals|submissions)|content-api/ugc)" apps`
—— ⭐ 判準是**路由註冊**（路徑字串與註冊動詞同一行），⛔ 不是「有人提到它」。
grep **exit 1 才是「沒找到」**；其他離開碼 ⇒ **擲例外並說「掃描器自己壞了」**
（⛔ 不當成「沒有洞」—— fail-open 沒錯，靜默才是缺陷）。

**七格必要綁定**（每一格都寫得出「⛔ 少了它會發生什麼」）：
`resolveUgc` · `UGC_DISABLED` · `authorization` · `UGC_AUTH_REQUIRED` ·
`maxPendingPerPlayer` · `quotaPerPlayerPerDay` · `maxBytes`

**五條 it()：**

| # | 問什麼 | 今天 |
|---|---|---|
| 1 | 端點存在時，七格綁齊了嗎 | ⭐ 零命中 ⇒ 綠（誠實：今天沒有洞） |
| 2 | ⭐ **sentinel** —— 自造「有端點沒綁定」的假原始碼，檢查器抓得到嗎（含 `Authorization` 大小寫那一格） | 綠 |
| 3 | ⭐⭐ **calibrate()** —— 掃描器對一條**今天真的存在**的路由（`ai-review/promote`，`apps/content-api/src/server.ts:447`）找得到嗎 | 綠 |
| 4 | ⭐⭐ **關係**：`enabled=true` 而 `apps/` 零個 UGC 路由 ⇒ 🔴（一扇通往空氣的門） | 出貨關著 ⇒ 綠 |
| 5 | 出貨 JSON 與 Zod `DEFAULT_UGC` 對「開不開」的答案一致 | 綠 |

⭐ **第 3 條是刻意補的**：第 1 條今天走「零命中 ⇒ 直接綠」，而**零命中有兩個成因**
（真的沒端點／⛔ 掃描器自己壞了），⭐ 兩者**量起來一模一樣** ——
CLAUDE.md 第一守則逐字「**一把只驗過單邊的尺，不算自證過**」。
⇒ 沒有第 3 條，這一支就是一把只量過「應該沒有」那一邊的尺。

⛔ **不做突變**：體驗層／規格閘（第零守則⑦），而第 2、3 條本身就是雙向的自證。

---

## 4. 離開碼

| 指令 | EXIT | 說明 |
|---|---:|---|
| `bash scripts/genguard.sh content/config/ugc.json` | 0 | ⭐ 沒有產生器擁有者（且 `grep -rl ugc.json tools/` 也沒有上游） |
| `pnpm content:build` | 0 | `ugc` 進 `content/config/_index.json:486` |
| `GGD_CONFIG_SURFACE_DUMP=1 npx vitest run configFacadeSurface.test.ts` | 0 | 基準線 288→**292**，⭐ 新增的正好是我那 4 個名字 |
| `npx vitest run --dir packages/shared` ×4 支 | **0** | ugcGateIsArmed(5) · configUnionCoversDirectory(5) · configFacadeSurface(1) · shippedBundleIsCurrent(4) 全綠 |
| `npx vitest run --dir apps` ×6 支 | **1** | ⛔ **5 條紅，⭐ 沒有一條是 `ugc`** —— 見下一節 |
| `pnpm typecheck` | **1** | ⛔ **3 包紅，全部是 `vfx-subtypes`（另一條 lane 在飛）** —— 見下一節 |

---

## 5. ⛔ 紅燈歸因（⭐ 逐條驗過**不是**我造成的）

### 5.1 `pnpm typecheck` 的 3 個錯：⛔ 全部是別的 lane

三個錯**一字不差**都是 `Property '"vfx-subtypes"' is missing`
（`packages/shared/src/content/bundle.test.ts:296` · `apps/editor/src/collections.ts:101` ×2）。
⭐ `packages/shared/src/content/schema/index.ts` 在 `git status` 上是 **M**（⛔ 不是我改的）——
另一條 lane 正在加一個 `vfx-subtypes` 集合。
⭐ **零個** typecheck 錯誤提到 `ugc`。

### 5.2 `--dir apps` 的 5 條紅

| 紅在哪 | 歸因 |
|---|---|
| `configDocCoverage` —— **`review-tuning`** 沒有後台入口也不在豁免表 | ⛔ **不是我的**：`REVIEW_TUNING_SPEC` **全 repo 不存在**，而 `content/config/review-tuning.json` 與 `reviewTuning.ts` 在 `git status` 上**乾淨**（committed 狀態就是紅的）。⭐ 而 `ugc` **不在**這張 unresolved 名單上 |
| `configForms` ×3 —— **`arena-rules`** 標籤表 53 vs schema 74（第三條 `boundsFor` 的 `label` undefined 是同一個根因的下游） | ⛔ **不是我的**：`arenaRules.ts`（schema 與 spec）在 `git status` 上都**乾淨** |
| `navSections` —— NAV 多了基準線沒有的頁面：**`iconUpload`, `ugc`** | ⚠️ **一半是我的**，見下 |

### 5.3 ⚠️ 唯一需要別人動一行的地方：`navSections.test.ts` 的 `SINCE_BASELINE`

那一條在我動手**之前就已經紅了**（`iconUpload` 是 GH#966 那條 lane 的頁，已 commit 而沒進清單）。
我的 `ugc` 讓它從「多 1 個」變成「多 2 個」。

⛔ **我沒有動它** —— `apps/admin/src/navSections.test.ts` 不在這條 lane 的檔案柵欄上，
⭐ 而且加 `ugc` **也不會讓它變綠**（`iconUpload` 仍在）。

⭐ **需要的補丁是兩行**（加在 `apps/admin/src/navSections.test.ts` 的 `SINCE_BASELINE` 集合裡）：

```ts
// 🖼 2026-09-02 GH#966：編輯器 icon 上傳。
"iconUpload",
// 🧑‍🎨 2026-09-05 GH#991：玩家自製內容（UGC）的提交閘。
"ugc",
```

---

## 6. 動到的檔案

| 檔 | 新/改 | 內容 |
|---|---|---|
| `content/config/ugc.json` | **新** | 出貨值（`enabled:false`） |
| `packages/shared/src/content/schema/config/ugc.ts` | **新** | Zod ＋ `UGC_DOC_ID` ＋ `DEFAULT_UGC` ＋ `resolveUgc()` |
| `packages/shared/src/content/schema/config/index.ts` | 改 **3 行** | import ＋ `export * from "./ugc"` ＋ union 成員 |
| `packages/shared/src/content/schema/config/configFacadeSurface.baseline.json` | 改 **4 行** | ⚠️ ⭐ **機械 dump**，指令就是那條測試自己印的 `GGD_CONFIG_SURFACE_DUMP=1`。⛔ 不在原始柵欄上，但不更新它 = 那條棘輪紅（⭐ 新增的正好是我那 4 個匯出名） |
| `apps/admin/src/configForms/specs/ugc.ts` | **新** | `UGC_SPEC`（6 格中文說明，每一格寫「它影響什麼」，數字格都有上界） |
| `apps/admin/src/configForms.ts` | 改 **2 行**（＋註解） | import ＋ `CONFIG_DOC_SPECS` 一列（緊接 `ICON_UPLOAD_SPEC`） |
| `apps/admin/src/ui/App.tsx` | 改 **1 行**（＋註解） | 導覽列一列（`SEC_OPS`，接在「編輯器 icon 上傳」後面） |
| `packages/shared/src/ops/ugcGateIsArmed.test.ts` | **新** | 五條 it()：規格閘 ＋ sentinel ＋ calibrate ＋ 關係 ＋ 預設一致 |
| `content/{bundle,manifest}.json` · `content/config/_index.json` | 產物 | `content:build` 的產物，⭐ 留在工作樹 |

### ⭐ `apps/admin/src/store.ts` 需要 **0 行**

派工單預期它要一行 —— ⛔ 不需要：`Page` union 走 `| ConfigDocPage`
（`store.ts:35` 從 `CONFIG_DOC_SPECS` 推導），`SESSION_REQUIRED_PAGES` 也是
`...CONFIG_DOC_SPECS.map((s) => s.page)`（`store.ts:551`，GH#807 把 59 行手打的
路由名換成推導）。⇒ ⭐ 「忘了加那一行」這個缺陷在這個檔上**已經不存在了**。

### ⭐ 第三個住處**不是** `SHIPPED_UGC`

`SHIPPED_*` 常數只屬於**手刻頁**（`mobWaves.ts` 那一族）。走通用引擎的設定，
第三個住處是 **spec ＋ 頁面在檢視時抓真的 `content/config/*.json`** ——
⭐ 那**比**多一份 TS 常數好（第〇·四守則：⛔ 不要有第四個會 drift 的住處），
而 drift 的閘是 `configFormsShippedProse.test.ts`（說明裡要寫 `{{出貨值}}`，
⛔ 不可以手打數字）。⇒ ⭐ 這一批**沒有**新增 `SHIPPED_UGC`，那是刻意的。

---

## 7. 第二批要接的（⛔ 這一批沒做）

1. **Scope 0 的決定**：content-api 整支上正式站（拿掉 `profiles: ["dev"]` ＋ edge 路由 ＋ 身分 gate），
   ⚠️ 而 `guard.ts` 的 loopback 柵欄在那一刻要被**身分**取代（⛔ 不是被繞過）。
2. **身分**：platform introspect 端點（上面的路 B）⇒ content-api 讀 `Authorization`。
3. **提交端點**：綁齊閘要求的七格 ⇒ ⭐ `ugcGateIsArmed` 從「零命中直接綠」轉成**真的在驗**。
4. **`allowedCollections`**：等通用引擎長出「從一個集合勾多個」的欄位型別（與 `config.roster@1` 一起解鎖）。
5. ⭐ **最後才翻 `enabled`** —— 判準是那條閘從紅轉綠，⛔ 不是「時間到了」。

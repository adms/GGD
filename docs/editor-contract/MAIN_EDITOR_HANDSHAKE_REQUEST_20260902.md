# 給 GGD Main Codex：Editor 必要接縫（可直接複製）

狀態：**Revision 4 — 只保留 Main 必須完成、Editor 無法自行補上的五個工作包**

基準：`origin/main@de7006c69`

最後核對：**2026-09-02 07:42（Asia/Taipei）**

Editor 分支：`feat/vfx-forge-codex`；請在 Main 自己的 feature branch 開工，禁止直接提交 `main`。

## 先不要重做

Main 已有 import routes、bounded ZIP、ACTIVE/CAS/rollback 骨架、source adapter、投稿批核頁、
通過與 Promote 分離、assets manifest、`effectiveVfxLimits` 八個實際值。請補現有接縫，不要另建第二套。

## 只做以下五包

### 1. Contract index 與完整 limits receipt

新增一份 machine-readable contract index，作為 Main 與 Editor 唯一的接縫索引，至少列出：

- representation：`ability@1`、`item@1`、`vfx-script@1` 對應的 collection、path、schema 與 promotion policy；
- endpoint：validate、apply、rollback、active、runtime-bundle、operations、validate-single 的 URL、method、
  request/response schema、media type、auth scope、max bytes 與同步／輪詢方式；
- index 自身的 schema/version/fingerprint。

在 `effectiveVfxLimits` 補齊三個 metadata：

```json
{
  "schema": "effective-vfx-limits@1",
  "limitProfileId": "<stable profile id>",
  "resolverFingerprint": "<digest of resolver inputs/logic>"
}
```

八個實際限制值仍由現有 resolver 產生，禁止在 profile 另寫常數。三格缺失或 fingerprint 不符時，
Editor 必須 fail closed。

驗收：public profile 與 authenticated active profile 都能由 contract index 驗證；任意刪除三格之一的測試會紅。

### 2. 把現有 importer 骨架補成真正閉環

不新增另一組 routes，只補現有 pipeline 的承重語意：

- 每份 document 使用遊戲同一份 collection Zod 與 hard authoring rules；capability/ref/asset 從文件推導，
  不可只相信 manifest 自述；
- delta 必須套到 exact ACTIVE base，產生含未修改文件的完整 immutable snapshot，不能用本包取代整棵樹；
- 遊戲 runtime 必須真正讀到 ACTIVE snapshot；apply 後以 runtime read-back digest 確認，rollback 同理；
- Platform Promote 只有在 revalidate、Base CAS、apply 與 runtime read-back 全成功後才可標 promoted。

驗收只要四條窄測：非法 ability schema 回 422；漏報 capability 仍回 422；bootstrap A + delta B 後
runtime 同時有 A+B；拔掉 runtime consumer 時 apply 不得回 healthy。

### 3. `validate-single` 與 generator-owned Promote 409

- 新增 authenticated `validate-single` convenience：接受一份 `ability@1`／`item@1`／`vfx-script@1`，
  server 以 ACTIVE base 包成 canonical single-root delta，仍走同一支 validator；不得直接寫檔。
- Promote 遇到 generator-owned product 時，通用 apply 必須回 **409**，並回 source descriptor／adapter id；
  後續只能走既有 source adapter。不得部分改 product，也不得在瀏覽器執行 generator。

驗收：同一份非法文件經 package validate 與 validate-single 得到同 code；generator-owned candidate 即使已核准，
通用 Promote 仍 409 且所有 source/product hash 不變。

### 4. 修正 `godie-e00r` 的權威模型映射

目前 `content/champions/godie-e00r.json` 仍是：

```json
"modelKey": "champ.skin.rogue"
```

卡面是「初號機」，不能以 rogue fallback 出貨。請改到 Main 已收錄的正確初號機 model/skin key，
並以 resolver 測試確認 card、Editor preview、遊戲 runtime 得到同一個非 rogue key。不要在 Editor 寫例外表。

### 5. 遊戲 client 消費七色 token palette

tokenizer 已存在，但 client 尚未依 group/color 渲染。請接上全域七色 palette：

- 只對 tokenizer 產生的完整 `[...]` token 上色，禁止 substring replacement；
- 每個 token 必須帶 group id 與色碼；未知 token 保留原文並用 neutral 色；
- `[小範圍]`、`[範圍]`、`[大範圍]` 同屬亮藍；已廢除的舊範圍標籤不得復活；
- presentation 不得改技能機制，也不得把系統 AP 乘數寫進契約。

驗收：`GL[AD]IARIA` 只框真正的 `[AD]`；普通字串中的 `AP` 不被切割；七群各有 client snapshot。

## 明確不在這次 Main 工作

- 不做第二套批核頁、第二套 importer 或第二套 source adapter。
- 不做 Editor UI、VFX Forge、八招 fixture、逐秒擷圖或視覺品質調整。
- 不做完整資產池、地形／單位／區域／觸發器／地圖編輯器。
- 不處理 15 項 future capability；只保持契約可擴充。

## 回交證據

只需提供 feature branch/commit，以及上述五包各自的 request/response fixture 或窄測結果。不要用全 repo
綠燈取代這五包的直接證據，也不要推到 `main`。

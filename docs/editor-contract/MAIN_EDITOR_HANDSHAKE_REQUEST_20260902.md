# 給 GGD Main Codex：Editor 最小必要接縫（可直接複製）

狀態：**Revision 5 — Main 已完成關鍵程式；本輪只剩交付 feature branch**

核對基準：`origin/main@de7006c69`

Main 已回報但 Editor 尚無法取得的 commits：`b54441df8`、`cf40d5db3`（分支 `feat/editor-seam-20260902`）

最後核對：**2026-09-02 07:59（Asia/Taipei）**

Editor 分支：`feat/vfx-forge-codex`。雙方都禁止直接提交或推送 `main`。

## 結論

先前五包要求已被最新 Main 實作與量測推翻。這一輪 **不要再新增功能**；Editor 現在唯一需要 Main 做的事是：

> **請把 `feat/editor-seam-20260902` 推到 origin（仍然不要推 main），讓 Editor 能抓到
> `b54441df8`、`cf40d5db3` 做接縫測試。**

目前 `git fetch origin feat/editor-seam-20260902` 回 `couldn't find remote ref`，兩個 commit 在 Editor
可見的 clone 也不存在，所以無法用真實 route 回應完成 integration test。

## Editor 會接的三份已完成契約

分支可抓後，Editor 只驗以下三項，不要求 Main 重做：

1. `GET /api/v1/content-import/active/runtime-bundle`
   - `schema = ggd-content-runtime-bundle@1`；
   - 必須帶 `activationDigest`、`packageDigest`、`contentVersion`；
   - 每個 collection 帶 `hash`、`count` 與逐文件 `{id, hash, doc}`；
   - Editor 以共用 `hashDoc`、`hashCollection`、`contentVersion` 全部重算，不一致即拒收。
2. `effectiveVfxLimits`
   - `schema = ggd-effective-vfx-limits@1`；
   - 必須帶 `limitProfileId`、`resolverFingerprint` 與八個實際生效值；
   - `maxOneShotEmitters: null` 代表 resolver 的 `Infinity`，Editor 不得擅自當成 96。
3. `GET /api/v1/content-import/contract-index`
   - `schema = ggd-editor-contract-index@1`；
   - Editor 從 route 讀 representation、mode 與 promotion policy，不再維護第三份常數表；
   - 未知 representation 一律 fail closed。

## 明確不要在本輪處理

- 不做 `validate-single`；完整 Package 路徑已可驗證，這只是便利功能（GGD#931）。
- 不新增不存在的 AI promote route；generator-owned 的 PUT/PATCH 409 已足夠（GGD#932）。
- 不把 `godie-e00r` 換成 16 頂點 Eva 殘件；等待真資產與 appearance resolver（GGD#933/#934）。
- 不把七色 palette 當 Editor importer 阻塞；維持 `matchesEngine=false` fail closed（GGD#935）。
- 不重做 importer routes、ZIP guard、ACTIVE/CAS/rollback、source adapter、批核頁或 Promote 流程。

## 分支可抓後的最小回交證據

Editor 會自行完成並回報：

- contract-index 完整／缺欄／未知 representation 三種測試；
- runtime-bundle 的 document、collection、contentVersion 任一突變皆拒收；
- VFX limits 三欄收據、`null` emitter cap 與 resolver drift 測試；
- bootstrap-only profile 維持只開 bootstrap；只有真 ACTIVE receipt 齊全才開 full／delta。

Main 不必先做地毯式測試，也不必為了讓按鈕變亮而偽造 ACTIVE。若目前沒有 active snapshot，誠實維持
`implementedStage=G1`、`supportedModes=["bootstrap"]` 即可；這不是程式缺口。

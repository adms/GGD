# GGD Main ↔ Codex Editor：必要接縫結案收據

狀態：**Revision 6 — Main 關鍵接縫已整合，沒有新的阻塞要求**

核對基準：`origin/main@de7006c69`

Main seam：`origin/feat/editor-seam-20260902@4ec5e676`

Editor：`feat/vfx-forge-codex`（禁止直接提交或推送 `main`）

最後核對：**2026-09-02 08:28（Asia/Taipei）**

## 結論

Main 不必再為本輪新增程式。Editor 已抓取並整合以下四個 feature-branch commits：

- `b54441df`：完整 `active/runtime-bundle` 與 effective VFX limit identity receipt；
- `cf40d5db`：`ggd-editor-contract-index@1` 唯一登錄表；
- `cbc70f5a`：穩定 `adapterId` 與 source adapter 非遠端命令入口證明；
- `4ec5e676`：補上 champion-slot PATCH 與 restore 的 generator-owned server guard。

兩邊仍維持 feature branch；**不要把任何一邊直接推到 `main`**。

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

## 本輪整合時修正的 Editor 接縫

- 先前依文字表格預作的 parser 使用了錯誤欄名 `representation`；已改以 Main 真 JSON 的
  `schema` 為準，並新增完整 digest／最低版本驗證。這項差異證明不能把文字摘要冒充 integration。
- 兩條遠端唯讀 bridge 改用 HTTP GET；它們只讀 allow-listed HTTPS profile/index，不會被「所有 POST
  都是內容寫入」的掃描誤判，也沒有放寬 generator-owned 守衛。
- 靜態 profile 已由合併後產生器重建；contract-index digest 為 `f0fa79b088ba`。

## 非阻塞、不要塞回本輪

- `validate-single`、AI promote 便利 route、新 Eva 模型、appearance resolver、七色 palette；
- `vfx-script@1` production importer：index 仍明示 `planned/G5`，Editor 只保留可擴充骨架，不假裝可上線；
- 正式站部署：feature-branch integration 已完成，何時部署由 Main 發版流程決定。部署前公開站仍可能是舊
  profile/404，這不應反向要求 Editor 猜欄位。

後續若 Main 改 representation、endpoint 或 policy，請只改唯一登錄表並讓 digest 改變；若是不相容變更，
同時提高 `minEditorContractVersion`。Editor 會據此停下，而不是帶著舊假設繼續匯出。

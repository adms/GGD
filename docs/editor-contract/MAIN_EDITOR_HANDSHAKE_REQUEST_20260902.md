# GGD Main ↔ Codex Editor：必要接縫結案收據

狀態：**Revision 7 — Main v0.35.4 已整合；只剩一個 resolver 方向語意阻塞**

核對基準：`origin/main@d63214d78`（tag `v0.35.4`）

Main seam：已以 `--ff-only` 線性進入 `main`；來源 ref `origin/feat/editor-seam-20260902@608c4de02` 暫留供追溯

Editor：`feat/vfx-forge-codex`（禁止直接提交或推送 `main`）

最後核對：**2026-09-02 08:43（Asia/Taipei）**

## 結論

Editor 已抓取並整合 Main v0.35.4 的完整線性歷史，包括以下五個接縫 commits：

- `b54441df`：完整 `active/runtime-bundle` 與 effective VFX limit identity receipt；
- `cf40d5db`：`ggd-editor-contract-index@1` 唯一登錄表；
- `cbc70f5a`：穩定 `adapterId` 與 source adapter 非遠端命令入口證明；
- `4ec5e676`：補上 champion-slot PATCH 與 restore 的 generator-owned server guard。
- `5dc0eb92`：新增 `resolved-appearance@1` 與 `isStandIn`，讓共用替身不再靜默。

Editor 仍只在 `feat/vfx-forge-codex`；**不要把 Editor 提交直接推到 `main`**。

Main 目前只需修正下方一個可重用 resolver 語意；不需要替 Editor 拼任何技能、時間軸或特效。

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

## 唯一需要 Main 修正的積木：缺省 yaw 不是實際生效值

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

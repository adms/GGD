# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 6.0 — 關鍵接縫已整合；Main 回到「做積木」角色**

最後驗證：**2026-09-02 08:28（Asia/Taipei）**

結案收據：
[`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)

## 現況

Codex Editor 已整合 `origin/feat/editor-seam-20260902@4ec5e676`，並以 Main 的真實機器輸出完成：

- `ggd-editor-contract-index@1` 的 JCS digest、最低 Editor 版本、representation/mode/promotion fail-closed；
- `ggd-content-runtime-bundle@1` 的逐文件、集合、count、contentVersion 與 activation receipt 重算；
- `ggd-effective-vfx-limits@1` 的 profile id、resolver fingerprint、八個實際值與 null emitter cap；
- generator-owned champion-slot PATCH／restore server guard，加上 Editor 寫入前的第二層 receipt 檢查。

Main 本輪沒有新的必要程式待辦，也不必替 Editor 製作或調整八個驗收技能。

## 永久分工

| Main：做出積木 | Codex Editor／後台：用積木拼成品 |
| --- | --- |
| runtime effect、hook、condition、targeting、movement、VFX primitive | 效果模板成品、效果鏈與技能 JSON |
| 模型／粒子／Ribbon／Camera 可重用能力與資產載入 | 資源池拖拉、slider、時間軸、CameraRig 編排 |
| schema、capability registry、限制 resolver、hash／import 安全 | 所見即所得預覽、八招 fixture、逐秒擷圖與視覺評分 |
| source ownership、CAS、apply／rollback、audit 與 Promote policy | 本機草稿、JSON／ZIP、差異審閱與人工批核頁 |
| 缺少 primitive 時提供最小、可重用的 runtime 實作 | 發現缺口、提出最小 failing fixture；不得要求 Main 拼完整技能 |

八個驗收技能只驗證 Editor 是否能用積木表達成品，永久不是直接覆蓋遊戲技能的 production payload。
AI 只能提出候選；所有技能、機制與特效變更都必須先進人工批核頁。

## 何時才需要再找 Main

僅限以下條件同時成立：

1. 現有 `ggd-runtime-capabilities`／contract index 沒有能表達該語意的 primitive；
2. 不能由多個既有 primitive 正確組合，且用近似參數會改變行為真相；
3. Editor 已附最小 JSON fixture、預期事件／畫面、失敗證據與隔離驗收；
4. 請求內容是可跨技能重用的 schema/runtime primitive，不是某一招完整演出。

Main 完成 primitive 後只需更新唯一 registry/digest；Editor 自行接回資源池、表單、時間軸與成品。

## 不再要求 Main

- 替莉娜、克勞德、小呆、悟空、Saber、Rider 拼技能或調視覺；
- 替八招做 Youtube/W3X 還原、配色、鏡頭、逐刀時序或擷圖評分；
- `validate-single`、不存在的 AI promote 便利 route；
- 用 16 頂點 Eva 殘件取代 stand-in；
- 為了讓按鈕變亮而偽造 ACTIVE、G2 或 production `vfx-script@1` 支援。

目前 `vfx-script@1` 仍是 `planned/G5`：Editor 繼續完成本機 no-code 編排與批核工作流，Main 等到
真正缺少可重用 primitive 時才介入，而不是進入成品迭代迴圈。

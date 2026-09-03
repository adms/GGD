# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 6.1 — 42／46 驗收完成；只新增一項可重用 VFX 積木阻塞**

最後驗證：**2026-09-04 06:32（Asia/Taipei）**

上一輪接縫收據：
[`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)

## 現況

Codex Editor 已整合 `origin/feat/editor-seam-20260902@4ec5e676`，並以 Main 的真實機器輸出完成：

- `ggd-editor-contract-index@1` 的 JCS digest、最低 Editor 版本、representation/mode/promotion fail-closed；
- `ggd-content-runtime-bundle@1` 的逐文件、集合、count、contentVersion 與 activation receipt 重算；
- `ggd-effective-vfx-limits@1` 的 profile id、resolver fingerprint、八個實際值與 null emitter cap；
- generator-owned champion-slot PATCH／restore server guard，加上 Editor 寫入前的第二層 receipt 檢查。

2026-09-02 的載入／來源／批核接縫已結案，Main 不必替 Editor 製作或調整任何驗收技能。
2026-09-04 完成 42 個主題／46 份技能的瀏覽器實際擷取後，另證實一項跨技能共用的
VFX primitive 缺口；它列在下方「目前唯一 Main 外部阻塞」，不重開已完成的接縫。

## 42／46 最新驗收結果

- 46／46 均由真 Editor 預覽路徑完成擷取，沒有 capture failed／blocked；全部仍等待 Owner 人工裁決。
- 設計師 no-code 路徑：30 份可直接編排、16 份經 effect-graph bridge、0 份缺少 authoring 路徑。
- 視覺裁決建議：8 份可送 Owner、31 份屬 Editor 配方／美術重作、7 份被同一項 Main 積木阻塞。
- 機器收據：`docs/_reports/editor-skill-basic-visual-proof/manifest.json`。
- 逐份 Codex advisory：`docs/_reports/editor-skill-codex-advisory/review.json`；目前平均視覺分數 4.65／10，
  advisory 永遠不會代替人工核准。

## 目前唯一 Main 外部阻塞：連續實心光束／直立光柱 primitive

受影響的 7 份實際技能為：`godie-hart.r`、`godie-nbbc.e`、`godie-ogrh.r`、
`godie-o00x.r`、`godie-e002.ex`、`godie-e00l.ex`、`godie-hvsh.r`。

現有積木的實際畫面結果已分別排除：

- `fx.prim.*.beam-flat`／`beam-lg` 是 stretched particle trace，只會形成細線，不能形成連續實心砲身；
- `tpl-beam-roll` 的歷史模型路徑依其模板文件自述仍有透明材質／缺貼圖問題，不能作為安全通用解；
- `ReviveHuman` 路徑會露出不透明 TeamGlow 白卡；
- 以 pulse／flare 沿線排列只能得到珠串，不是光束；
- `CastPillarFx` 是遊戲的施法提示消費端，不是 `vfx-script@1` 可拖拉、可寫回的 authoring primitive。

Main 只需提供一顆可重用、world-space、透明安全且不依賴 host bone 的 primitive，並讓 Editor
能透過現有 `vfx-script@1` 引用。最小 authoring 能力為：

- 長度與寬度／半徑可分別調整；
- 可依瞄準方向設定 yaw／pitch，涵蓋水平光束與垂直光柱；
- core／edge 顏色與 alpha 可調，生命週期受既有 effective VFX limits 管理；
- registry／capability receipt 可機讀；未知版本或缺欄位時 Editor fail closed。

這顆積木不得包含技能 ID、傷害、命中次數、鏡頭或成品時間軸。Main 提供 primitive 與 runtime
消費端後，7 份技能的配色、尺寸、時序、鏡頭、擷取與 Owner 批核全部仍由 Editor 完成。
解除條件不是 schema 測試變綠，而是同一套自動擷取重新跑過 7 份技能，畫面呈現連續砲身、
沒有白卡／珠串，且逐張 framebuffer audit 安全。

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

目前 `vfx-script@1` 的正式匯入／發布契約仍是 `planned/G5`：Editor 繼續完成本機 no-code 編排與
批核工作流；Main 只處理上列已由畫面證實的共用 primitive，不進入成品迭代迴圈。

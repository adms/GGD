# 遊戲主程式載入 Editor JSON／ZIP 的修改建議

狀態：**Revision 6.4 — type-first 工坊收斂；保留一個經 framebuffer 證實的 emitter instance 接縫**

最後驗證：**2026-09-04 11:17（Asia/Taipei）**

上一輪接縫收據：
[`docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md`](docs/editor-contract/MAIN_EDITOR_HANDSHAKE_REQUEST_20260902.md)

## 現況

Codex Editor 已整合 `origin/feat/editor-seam-20260902@4ec5e676`，並以 Main 的真實機器輸出完成：

- `ggd-editor-contract-index@1` 的 JCS digest、最低 Editor 版本、representation/mode/promotion fail-closed；
- `ggd-content-runtime-bundle@1` 的逐文件、集合、count、contentVersion 與 activation receipt 重算；
- `ggd-effective-vfx-limits@1` 的 profile id、resolver fingerprint、八個實際值與 null emitter cap；
- generator-owned champion-slot PATCH／restore server guard，加上 Editor 寫入前的第二層 receipt 檢查。

2026-09-02 的載入／來源／批核接縫已結案，Main 不必替 Editor 製作或調整任何驗收技能。
2026-09-04 曾把七招光束的 Editor 白卡／錯誤替代配方誤報成 Main 缺少光束模型；重新對回 JASS、
蝗蟲 unit 與 Main model 文件後已撤回。聚焦 framebuffer 重驗另找出一個更窄、可重現的接縫：模型
mesh 會套用 instance 參數，但 `model@1.fxEmitters` 只收到出生座標，不會繼承縮放、方向、色彩與透明度。

## 42／46 最新驗收結果

- 46／46 均由真 Editor 預覽路徑完成擷取，沒有 capture failed／blocked；全部仍等待 Owner 人工裁決。
- 設計師 no-code 路徑：30 份可直接編排、16 份經 effect-graph bridge、0 份缺少 authoring 路徑。
- 六份橫向／終結光束已聚焦重驗並保留失敗幀；不得再以「缺少模型」跳過 Editor 責任，也不得逐招
  疊粒子掩蓋共用 emitter instance 接縫。
- 機器收據：`docs/_reports/editor-skill-basic-visual-proof/manifest.json`。
- 逐份 Codex advisory：`docs/_reports/editor-skill-codex-advisory/review.json`；目前平均視覺分數 4.65／10，
  advisory 永遠不會代替人工核准。

## 已撤回的誤報與目前精確接縫

本輪重新對帳的 7 份實際技能為：`godie-hart.r`、`godie-nbbc.e`、`godie-ogrh.r`、
`godie-o00x.r`、`godie-e002.ex`、`godie-e00l.ex`、`godie-hvsh.r`。

重新對帳後，Main 已具備本輪需要的模型積木：

- `h007` 特效龜派與 `h00S` 勝利劍都指向 `ReviveHuman.mdl`，對應 `w3x.stock.revivehuman`；
- `h008` 特效三號指向 `FragDriller.mdl`，對應 `w3x.stock.fragdriller`；
- Main `ModelFxRig` 已支援 model mesh 的 `scale`、`scaleAxis`、朝向、翻滾、tint、alpha、life，並會
  生成模型原生 emitters；
- Main 的 additive material 守衛明確涵蓋 `revivehuman.glb`。

原作做法是 JASS 建立一個蝗蟲單位，再以 unit model、面向、比例、頂點色與時間塑形；不是沿線排
pulse／flare。先前白色方板是 Editor 冷啟動材質／GPU readiness 與配方隔離失敗，不是缺模型。
Editor 已恢復 `ReviveHuman＋FragDriller` 配方；但修改 modelFx 的縮放、位置與 tint 後，模型內建 emitter
仍維持固定黃色大球，證實 `apps/client/src/render/modelFxRig.ts` 目前只以 `vfxId + world position` 生成它。

受此接縫阻塞的是 `godie-nbbc.e`、`godie-ogrh.r`、`godie-o00x.r`、`godie-e002.ex`、
`godie-e00l.ex`、`godie-hvsh.r`。`godie-hart.r` 的直立終結柱使用其他 primitive，不在這個阻塞內。
請 Main/Owner 自行決定讓 emitter 繼承 instance 參數，或提供 per-instance override/disable；Editor 不指定
API、不改 renderer、不另做每招專用遮罩。完整來源、自動守衛與交接候選見
`docs/editor-contract/W3X_CLASSIC_BEAM_RECIPE.md`、`docs/editor-contract/EDITOR_VFX_TEMPLATE_HANDBACK.md`。

另有一項**不阻塞本輪**的 Main 資產缺口：census 的 `n00M` 使用
`Abilities\Spells\Demon\ReviveDemon\ReviveDemon.mdl`，目前沒有對應 `model@1`／GLB。未來技能成品
真的需要此視覺時，請 Main 匯入這顆可重用模型；Editor 不自行做第二套資產或以 Human 版冒充。

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
批核工作流；Main 只處理上列已由畫面證實的共用 primitive，不進入成品迭代迴圈。Editor 現有 21 個
可選完整配方與 36 個 42／46 機制推薦，共保存 57 個既有 type 成果；全部以穩定的 `familyId/typeN` 收斂並由
`pnpm vfxforge:handback:build` 產生 advisory-only JSON/Markdown。矩陣／slider 只微調已選 type；Main 可選擇
是否把重複的低階能力收編為積木，技能時間軸、配色、鏡頭與人工微調不得轉嫁給 Main。

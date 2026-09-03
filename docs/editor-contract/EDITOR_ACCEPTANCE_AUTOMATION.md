# Editor 可重跑驗收

Editor 的資料與機制驗收必須先由 script 完成；LLM／人工只處理無法可靠量化的語意與美術判斷。

```bash
pnpm editor:accept          # 快速：契約、coverage、鑄技工坊、特效工坊
pnpm editor:accept:visual   # 再加貼圖透明／不安全素材檢查與既有 GPU 證據帳本
pnpm editor:accept:release  # 再加 Editor 全測試、typecheck、production build
```

瀏覽器開啟 `http://127.0.0.1:5174/editor/vfx-forge?qa=accept-46` 後會自動逐支跑
46 份真 Sim／GPU／framebuffer 證據，不需要人工點 46 次；一般項目 30 秒、重型 fixture 60 秒硬上限，單一壞模型
不能拖死整批。

批次完成後只需按一次「匯出證據 JSON」，再執行一條：

```bash
pnpm editor:accept:visual -- --proof /完整路徑/editor-skill-basic-visual-proof.json
```

此命令會依序匯入圖片、更新 42／46 收據並跑完整 visual gate。匯入器會拒絕少於 46 份、
重複 ID、未知 ID、假 `captured`、無圖卻有人工作出裁決，以及把 diagnostic-only 失敗幀
偽裝成通過等資料；`--proof` 最終模式還會拒絕任何已擷取但仍待看圖、缺分數或缺理由的技能。
它會把 data URL 自動拆成逐幀 WebP/PNG 並建立 `docs/_reports/editor-skill-basic-visual-proof/manifest.json`，
不必人工逐招存圖或抄表。肉眼裁決另存 0～10 分與判定理由，機器的素材衛生分數不會冒充美術分數。

安全守衛失敗也會自動擷取失敗當下的 framebuffer，標成 `diagnosticOnly`；這張圖只能證明
失敗，永遠不能作為批核／Promote 證據。規則引擎會把每列歸入棋盤載體、角色材質純白、
替身、缺事件積木、動作時間軸、取代契約、Sim、逾時或低清晰度，並寫明下一步屬於
Editor、Main 或 Editor 先查。未知錯誤保持 fail closed，不交給 LLM 自由猜測。

修正擷取器後可按「只重跑技術失敗」；改特效或驗收規則後可按「只重跑未通過」，也可在
任一技能按「重跑此項」。這些路徑只重建指定 queue，其餘結果與人工裁決不會被清空。人工分數另以完整
framebuffer 資料計算指紋存在本機；同一張圖可在重新載入後恢復，任何像素資料改變就不沿用
舊 verdict，必須重新看圖。

棋盤、局部白卡與整幕過曝都不能因來源收據而自動通過。同一影格移除 Telegraph 後仍存在的
棋盤才分類為技術性 `FRAMEBUFFER_CARRIER`；只隨已收據的 Telegraph／呈現層消失的棋盤、底板或過曝
仍保留原影格，分類為 `PRESENTATION_ARTIFACT` 交給 Editor／人工否決與重做。這避免把安全但醜的素材冒充成
乾淨畫面，也避免把透明的 targeting geometry 誤報成遺失貼圖。

不想依賴瀏覽器下載資料夾時，可先啟動一次性接收器：

```bash
pnpm editor:proof:receive -- --out docs/_reports/editor-skill-basic-visual-proof.browser.json \
  --origin http://127.0.0.1:5174
```

把輸出的 `sinkUrl` 貼到批次區「本機證據接收器」後按一次寫入。接收器使用隨機路徑、只接受
指定 loopback Origin、限制 128 MiB、核對 42／46 header，完成單次原子寫入後立刻關閉。

成功階段只輸出一行；失敗才保留尾端診斷，避免例行檢查把大量測試輸出塞進人或 Agent 的上下文。
第一行是 `ggd-editor-acceptance-run@1` JSON 收據，包含執行時間（精確到分鐘）、目前
feature branch、HEAD、`origin/main`、coverage 與 capability 指紋；複製該行即可精確重現
「驗的是哪一版」。若 working tree 尚未提交，收據會明列 `dirty: true` 與變更檔數，避免把
HEAD 冒充成完整受驗內容；不再引用可能過期的交接文件 commit。

## 自動化邊界

- `skillforge:check` 驗新技能入口不能從 UI 消失、新技能骨架、Q/W/E 四級／R 三級、Main 五級距、出身推薦、模板疊卡、條件 UI、42 個技能主題／46 份現役技能機制覆蓋與真 Sim 試放；另核對 `skillforge:audit:check` 的逐技能收據。
- `skillforge:audit` 重新產生 `docs/_reports/editor-skill-acceptance-42x46.{json,md}`。它把「設計師從哪個 no-code 入口做」、「自訂 VFX 是否有真正事件可綁」及「是否已有 framebuffer＋人工裁決」分開；沒有看圖不會被測試冒充成通過。
- `skillforge:visual-proof:import` 驗證瀏覽器整批輸出、解碼所有 framebuffer、保存人工分數／理由，再交給 `skillforge:audit` 彙整；這是唯一受支援的批次證據落盤路徑。
- `visualAcceptanceIssues.ts` 是唯一技術根因分類器；瀏覽器與匯入器各重算一次並逐 code 比對，手改匯出 JSON 無法把失敗改名成通過。
- `skillforge:check` 也會用完整 42／46 ID 集合跑匯入器的無檔案 self-test，避免匯出／匯入介面長期沒人按就悄悄壞掉。
- `vfxforge:check` 驗 Main 演出收據、角色動作原則、八招 fixture、來源對照、配方、時間軸、限制、素材安全與 framebuffer 證據帳本。
- `editor:accept:visual` 讀 Main 的 `config.unsafe-textures@1`，逐位元核對貼圖 hash，並重算每個
  `(貼圖, blendMode)` 消費關係；Editor 對契約未知的新素材再做即時像素檢查。它不再使用會把
  `babyface`、additive `zap1/zap1b` 判成失敗的舊單圖門檻。
- 顏色是否像原作、構圖是否有力量、動作節奏是否自然，無法由像素門檻安全決定；仍由後台人工看實際連續影格裁決，不能以 script 全綠冒充視覺通過。

### 可選的本機 LLM 預審（預設關閉）

一般 `editor:accept:*` 不啟動也不呼叫任何模型。只有明確執行
`pnpm editor:accept:visual -- --local-llm`（或設定 `GGD_VFX_LOCAL_LLM_ENABLED=1`）才會在
確定性守衛之後追加 localhost 視覺分流。它自動從每招選 2～4 張非診斷關鍵格，預設只跑 low；
相同影格與規格以 digest 快取，不重複花費。只有另加 `--escalate-uncertain` 時，低推理結果本身
不確定或信心不足才用同一組影格升至 medium 一次。2026-09-04 的固定案例量測為：2 張 low 45.7秒，
4 張 low 67.0秒，4 張 medium 另需61.8秒且信心由0.72降至0.65，因此 medium 不可預設開啟。

本機 server／模型不存在時，optional batch 在第一個連線錯誤就停止，不會對 46 招重試 46 次；它寫入
`LOCAL_MODEL_UNAVAILABLE` 收據並正常結束，未審項目仍是 `needs-human-review`。關閉時則寫入
`LOCAL_MODEL_DISABLED`，且零張圖片被送出。所有模型結果都只能做 `advisory-only` 分流，不能覆蓋
SimWorld／event trace、像素安全守衛或人工視覺批核；非 loopback endpoint 一律拒絕。

Main 只提供可重用 primitive、權威事件、runtime、限制 resolver 與機器契約。上述時間軸、配色、鏡頭、拖拉組合、截圖和反覆調整均由 Editor 驗收流程負責。

## 最近一次完整收據

2026-09-03 22:05 CST 在 `feat/vfx-forge-codex` working tree（基底 `790486e8f81d`）對
`origin/main@ea0d6098a5c2` 執行 `pnpm editor:accept:release`：契約、coverage、
Skill Forge、VFX Forge、貼圖與 blend mode 契約、typecheck、Editor 390 項測試及
production build 全部通過。此收據只證明機器可判斷項目；八招的美術與原作相似度仍須人工裁決。

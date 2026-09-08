# Codex → 12B：精簡目錄、固定引擎編譯與輸出轉換

2026-09-09。這是完整英雄生成目標的 CPU 介接成果，**不是新訓練結果或機制正確率**。沿用既有 108 份教師紀錄／756 個任務，未增加訓練英雄、改原英雄或修引擎。

## 已完成與數字

| 檢查 | 實測結果 | 不能推論為 |
| --- | ---: | --- |
| 目錄精簡索引與精確查詢 | 2 個版本、319 個積木、122 個能力條目逐項無損取回 | 所有列出能力都無條件支援 |
| 同一批 358 個配對候選總序列 | 22,549,251 → 1,790,108 tokens，約減少 92.1% | 訓練加速比例或品質提升 |
| 輸出 tokens | 維持 300,229，沒有截斷 | 正式輸出契約已凍結 |
| 完整英雄序列 min／p50／p95／max | 6,806／7,170／8,587／9,547 | 已量得 GPU 能容納的長度 |
| 單槽序列最大值 | 6,054 | 單槽等於完整英雄 |
| 教師英雄 schema | 108／108 | 六槽完整或機制符合原文 |
| 教師完整六槽 schema／編譯 | 104／108 | 已驗證可上場 |
| 已配對候選 schema／編譯 | 49 完整英雄＋309 單槽全部通過 | 358 筆已准入訓練 |
| 模型目標格式 → 完整文件 → 編譯 | 104／104；包含全部 49 個已配對完整英雄 | 已做模型推論或編輯器 E2E |
| 轉換前後非 VFX script 的編譯欄位 | 社群 37／37 完全一致；native 67／67 保留全技能與英雄欄位，鏡像由權威槽重建 | 教師本來就沒有語意缺點 |
| 自動測試 | 31 項 Node＋4 項 Python 通過 | 全產品 CI 或對局驗收通過 |

索引版 tokenizer CPU 預檢為 4.071 秒。數字包括目前的需求、初始目錄索引、完整答案及終止 token；**尚不包括後續 lookup 回覆、素材／輸出 schema 契約與部署 ID 等新增上下文**。因此仍非正式訓練總成本，不能直接用 9,547 當最終 max sequence。

## 實際轉換，不從教師答案補缺漏

`hero-distillation-adapter.mjs` 是無檔案／網路／程序存取的純介接器，只接受模型輸出、預先分配的英雄 ID／名稱、固定引擎 API 與共用素材目錄：

- `hero-plan`：使用既有 `pinHeroPlanTemplates`，從固定引擎的模板目錄補版本定義；不改模型的產品、參數、技能用途、屬性或跨槽機制。37 名用到的 18 種固定模板 digest 均可在該引擎找到，不借教師的 `templateVersions` 補答案。
- 由模型的選擇建立 VFX／anim script、六槽 presentation、合法 fallback、初始 section 與 validation state，生成真正的 `ggd-hero-project@2`。收據為空、驗證為 idle，不抄教師的通過證明。
- 僅支援目前選擇資料實際使用的 `anim`／`vfx`，其他 kind 明確拒絕，不能把不支援段落直接丟掉。必要事件、目標及骨頭掛點成對檢查；細部美術數值不入訓，由固定引擎預設處理。
- `native-content`：保留六份權威 standalone abilities，從 Q/W/E/R 重建 champion 內嵌鏡像。無 template 的原生 effects/passive 合法，不強迫套模板、不改成 HeroPlan。
- 34 個去重模型選項保存 mesh hash、大小、動作表、素材鎖及素材原始身分，沒有能力／配方／教師推薦。不同英雄可共用模型；模型原始身分與「是否該英雄本人」是兩件事。介接器不沿用其他英雄的 exact/proxy 判定，optional provenance 暫不宣告；完整身分／素材閘仍待接。

正向比對先編譯原教師，再獨立 materialize 目標並用同版引擎編譯。比較時只容許 **VFX script 美術調整**不同，社群輸出的其他所有編譯欄位必須深度相等。native 技能及非鏡像英雄欄位相等；鏡像以 standalone 的唯一權威版本重建。另從磁碟重讀 104 份轉換 JSON，逐份對照確定性生成結果。

這是本機 JSON 檔案往返，**不是 Editor 保存／重讀、資產完整閉包或真實對局證據**。原生変身／召喚等外部依賴也不能因單份 schema 過關就宣告齊備。

## 負例與測試工具修正

負例涵蓋：缺槽、錯模板 hash／未知模板、偽造版本、跨英雄 ID／引用、重複能力權威、未知機制、不合法事件／骨頭綁定、不支援特效種類、未知模型與素材目錄夾帶英雄答案。模型輸出的合法差異會保留，不從教師偷偷改回。

有 4 份未完成全部六槽編譯的教師紀錄：`godie-e010` 缺 EX、`godie-ogld` 缺 PASSIVE、`sela`／`thorne` 缺 PASSIVE 和 EX 的 standalone 成品。這些缺項原已不符合完整來源配對，沒有減少本輪 49＋309 個配對候選；不補造缺槽，也不說原遊戲必然有 bug。

本輪修正的是研究測試工具，不是引擎：

1. 改用 `node --import tsx`，避免 tsx CLI 的非必要 IPC 在目前沙箱遇到 EPERM。
2. isolated Git snapshot 加上既有 shared package 的依賴路徑，避免把找不到 zod 誤當內容失敗。
3. native ability 僅在含 template binding 時呼叫模板展開。前一個錯誤 harness 把沒有模板的原生技能判失敗；該數字已作廢，不拿來排除訓練資料。
4. 新舊引擎 feature 差異明確處理：較舊 native 版本沒有 `templateVersions.ts`，不呼叫不存在的新版介面。

過程快照保留本機；本次 Git 發布候選使用最後的 `projection-verified` 原始結果與目前腳本，不把錯誤 harness 列為內容缺陷。沒有因此對 Main 開誤報票。

## 剩餘工作與訓練邊界

1. 將輸出格式、script 分配的 ID、共用素材索引及按需 lookup 接進實際 A/B 輸入；不可讓模型猜未提供的模板 digest／模型 hash，也不能用教師答案挑檢索內容。目前 lookup CLI 已驗，尚未跑模型 tool loop。
2. 套用與此教師版本相符的已知品質排除，按英雄／近重複群組凍結 train/dev。既有「待補」文字可提示檢查，但不能獨自證明新版本還缺；反過來，編譯通過也不能自動當原文機制全對。排除問題任務，不修源英雄，不重啟全庫人工 Gold 專案。
3. 在最終完整序列上做有界 GPU 記憶體／步速預檢，固定單輪訓練量、資源與時間上限，然後訓練既有可用生成資料；不回到 12 筆分類 smoke，也不等新英雄才準備模型。
4. 新批由使用者提供，僅作 Codex／base／LoRA 最終比較；尚未收到，不編造名單或泛化結果。Editor 匯入／保存／素材閉包／對局檢查仍是最終門檻。

**目前新版 GPU 訓練與模型推論都是 0，trainingAdmitted 仍為 0（尚未凍結），不代表候選全被判壞。** 沒有雲端、S3 操作、公開發布或 push；目標 active，未達標。

## 重跑與原始證據

先按 [前次配對報告](DISTILLATION_DATA_PREFLIGHT.md)建立或核對 `distillation-pairs-v1`。在 Git 倉庫根目錄執行，輸出檔／目錄須不存在，路徑可換成移機後位置：

```sh
node tools/editor-acceptance/hero-distillation-catalog.mjs index \
  /path/to/pairs/catalogs.json /path/to/indexed/catalog-indexes.json
python tools/editor-acceptance/hero-distillation-tokens.py \
  --pairs /path/to/pairs --model /path/to/gemma-4-12B-it-8bit \
  --indexes /path/to/indexed/catalog-indexes.json --out /path/to/indexed/token-preflight.json
node --import tsx tools/editor-acceptance/hero-distillation-compile.mts \
  --pairs /path/to/pairs --source-repo /path/to/GGD-community-hero-forge-s3 \
  --out /path/to/indexed/projection-verified --projection verify
node tools/editor-acceptance/hero-distillation-verify.mjs \
  /path/to/pairs /path/to/indexed /path/to/python /path/to/indexed/verification.json
```

驗證測試預設配對 fixture 位在 `indexed/../distillation-pairs-v1`，因此移機時保留此兄弟目錄結構；`DISTILLATION_PROJECTION_REPORT` 可指定新產生的 report。編譯程式從來源 Git objects 抽取精確版本，記錄 archive 與 schema／generator／resolver SHA，不跑來源 checkout 的 dirty code。兩個引擎版本為 `6aeb6aeb39c1d3a4a16c185f035b3c0c65896b92`、`91f89e012d925b921bb8ce754f8ca2c0a418f4c8`。

- [逐例長度](distillation-indexed-v1/token-preflight.json)、[目錄索引](distillation-indexed-v1/catalog-indexes.json)
- [逐英雄編譯／轉換結果](distillation-indexed-v1/projection-verified/report.json)、[完整轉換檔](distillation-indexed-v1/projection-verified/projected.json)
- [原教師編譯結果](distillation-indexed-v1/projection-verified/compiled.json)、[共用素材元資料](distillation-indexed-v1/projection-verified/models.json)
- [完整查詢覆蓋／測試輸出／artifact SHA](distillation-indexed-v1/verification.json)

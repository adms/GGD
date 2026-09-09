# Hero74 v3：公共目錄前置的無損輸入版本

2026-09-09。由相鄰 `hero74-training-v2` 衍生，**不新增／刪除／修改教師、不重新切分**。500 train／119 internal-dev：完整英雄 70／17、單槽 430／102；619 是任務數，不是英雄數。兩批共 74 名及 444 槽全部保留，六槽與完整英雄不跨集。

## 唯一資料變更

將 user-message JSON 的 `allowedCatalog`、`assets` 移到最前，其他欄位值保留；619 份 assistant 答案逐位元組相同。這讓公共目錄可成為共享前綴，不是按教師答案篩選目錄，也不是從 dev 檢索教師答案。新增每列 `layoutSourceInputSha256` 與 `sharedPrefixGroup` 供追蹤。

原生群 101 筆（87／14）；社群群 518 筆（413／105）。只從 train 輸入建立公共前綴，再檢查所有 train/dev 成員的 token 前綴一致。v18 執行配置的快取切點是原生 18,944、社群 20,736 tokens，皆在公共欄位內、對齊既有 256-token 注意力區塊；剩餘 tokens 仍在 suffix 中完整計算，沒有截斷。切點是 runtime 設定，不更改凍結 JSONL。

相同 tokenizer 下，train 總 11,193,538 tokens、答案 363,628；dev 總 2,686,347；最長 29,995、最長訓練答案 8,049。相較 v2，每筆因 JSON 成員順序的 tokenizer 邊界少 1 token，不是刪除內容。

`manifest.json` 綁定 parent manifest／examples、當次衍生工具與逐檔 hash；`layout-proof.json` 記錄建立時的狀態，不隨後續實驗改写。`quality.json`、`grouping.json`、教師源版本與審查限制承接 v2。第一批仍是核准改編，不冒稱原稿完整還原；第二批仍是 internal dev，不是全新盲測。完整審查範圍見 `../hero74-training-v2/README.md`。

## 重現與檢查

在 repo 根目錄，以不存在的新輸出目錄重建：

```sh
node tools/editor-acceptance/hero-distillation-prefix-layout.mjs \
  docs/_reports/hero-finetune-research/hero74-training-v2 /private/tmp/hero74-new-layout
```

逐筆檢查原資料與新版所有語意值、教師 bytes、分組、JSONL 及全檔 hash：

```sh
HERO74_PARENT=docs/_reports/hero-finetune-research/hero74-training-v2 \
HERO74_DERIVED=docs/_reports/hero-finetune-research/hero74-training-v3 \
node --test tools/editor-acceptance/hero-distillation-prefix-layout.test.mjs
```

## 資料准入不等於訓練／模型准入

v16 未對齊快取有實機梯度差異，禁止使用。v17 只定位前 1／6 層，不准用於訓練。v18 使用對齊切點，完整四格式 4/4 通過，46 層 frozen hidden、loss、末兩層全部 8 個梯度與同題未快取路徑的差異皆為 0。證據為同版終止收據 `../hero74-prefix-v18/`，不是本資料檔本身。估時 8.606 小時超過原 2 小時上限，故仍未正式訓練。

正式訓練還須通過原有單輪時程與資源閘；沒有新時限授權不能提高 7,200 秒上限。資料包含原生及社群兩種完整輸出契約，不為方便訓練而縮減任務。單次梯度或 dev CE 改善不證明生成可上場；最終還需 base／LoRA／Codex 同題生成比較、對局證據及另一批未見需求。

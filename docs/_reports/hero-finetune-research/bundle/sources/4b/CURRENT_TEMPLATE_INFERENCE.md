# Mac：使用明確版本目錄推薦模板

此入口接上R5使用的新版審查目錄；它是人工檢閱用研究工具，**不是已合格模型，也不啟用Editor或修改技能**。現有版本為main `4793eaaaf2775b2081f5eca5881db32e0aab0ea8`、review v4（29候選／6隔離／11draft）。它不自動宣稱與今天線上版本同步。

輸入只需要JSON的`id`及`request`，例如：

```json
{"id":"my-retaliation","request":"自己受到傷害後，只對剛剛的傷害來源回擊一次。不要取消原傷害。"}
```

從GGD-hero-auto-forge執行下列三階段，路徑皆用實際絕對路徑。每個輸出必須是新檔；Python使用已安裝MLX的arm64環境。

```sh
node tools/forge-training/current-template-client.mjs build \
  /absolute/path/main-catalog-review-v4.json \
  41094dffef731ea1fd78056d17520df29d3fe93efecb939a5bbd16601f70aefb \
  /absolute/path/input.json /absolute/path/request.json

python tools/forge-training/classification-predict.py \
  --model /absolute/path/native-reference/base \
  --adapter /absolute/path/selected-adapter \
  --request /absolute/path/request.json \
  --output /absolute/path/raw.json \
  --runtime-root /absolute/path/shared-runtime --max-memory-gib 12

node tools/forge-training/current-template-client.mjs validate \
  /absolute/path/main-catalog-review-v4.json \
  41094dffef731ea1fd78056d17520df29d3fe93efecb939a5bbd16601f70aefb \
  /absolute/path/request.json /absolute/path/raw.json /absolute/path/checked.json
```

審查檔摘要、原需求、剔除台詞後的需求、目錄、messages或輸出對應改變都拒絕沿用。隔離／draft／未知ID不能通過驗證；多出的參數欄位也會拒絕。選到enabled但語意不符的卡，**不能靠格式驗證抓出**：結果明示`semanticQualified:false`，必須看實測及人工檢查，不把它當成遊戲編譯或SimWorld證明。

每次只推薦一張可完整承擔需求的卡；多卡機制、完整英雄用途覆蓋仍是待完成範圍，不因提供這個入口而宣稱完成。未知或不支援須拒絕，不能由程式偷偷刪掉需求。近似是否已獲授權仍由模型判讀，必須列入語意評估。

GPU共用runtime鎖：正在訓練時會拒絕執行，不會刪鎖或中斷其他模型。最長4096 token、保留256輸出，超長直接拒絕、不截斷。預設12GiB是MLX分配上限，不是16GB實機證明。

特效仍用原`classification-client.mjs`和研究`catalog.json`，例如「發出氣功砲，其他參數人工調整」。只推薦模板ID，不產生調參值或執行視覺驗證。英雄設定／Owner來源與完整提案檢查見[SOURCE_INFERENCE.md](SOURCE_INFERENCE.md)。

`current-template-entry-check.mjs prepare RUN_ROOT`建立三個機制及一個氣功VFX實際入口檢查；`run RUN_ROOT PYTHON SHARED_RUNTIME`只在核心及接續評估完成後執行，沿用本輪GPU期限。這四題是已知語意的整合測試，不計入泛化分數，也不選模型。

真實JS→Python請求驗證及漂移拒絕CPU測試已通過。R5截止後獨立recovery的`manual-entry-check-v1/summary.json`已完成四題GPU整合，4/4契約與預期語意通過；但較大來源／機制回歸和多卡診斷仍失敗，所以不能稱模型合格或啟用Editor。

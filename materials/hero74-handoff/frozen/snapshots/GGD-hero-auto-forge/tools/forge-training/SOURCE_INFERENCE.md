# Mac 來源判讀與完整提案檢查

`source-predict.py` 是獨立離線入口，補足原 `classification-predict.py` 只有機制／特效的限制。它不訓練、不生成遊戲參數、不啟用模型，也不依賴已過期的實驗deadline。

支援三種現有輸入：

- `hero-source-client.mjs` 產出的 `{resolution,request}`，只有精確解析成功才接受；同名不明確、下架無來源、缺故事等不會偷偷代換。
- `r3-fidelity-client.mjs build` 產出的整份plan：原文支持整段提案，再逐條反向確認提案包含必要條件。
- 一份或最多25份已準備的`hero-source`／`owner-mechanism`請求。必須符合messages摘要、source文本摘要及ID唯一性，不接受機制或VFX任務混入。

先用既有builder建立來源鎖定請求，再執行：

```sh
python tools/forge-training/source-predict.py \
  --model /absolute/path/to/native-reference/base \
  --adapter /absolute/path/to/selected-adapter \
  --request /absolute/path/to/prepared-request-or-plan.json \
  --output /absolute/path/to/new-raw.json \
  --runtime-root /absolute/path/to/shared-runtime \
  --max-memory-gib 12
```

請使用安裝了鎖定MLX依賴的arm64 Python及實際保存的base／adapter路徑。`--adapter`可省略以測基底；必須共用訓練／其他推論的runtime目錄。GPU鎖被占用就停止，不會移除其他工作的鎖或強行搶GPU。

結果為與研究worker相同的`metadata/results/complete`封裝。保留原始文字、JSON值、格式判定、seed、時間與Metal峰值。格式正確不代表語意正確；`supported`也不代表整招已可用模板實現。

完整提案結果須接續：

```sh
node tools/forge-training/r3-fidelity-client.mjs validate \
  /absolute/path/to/plan.json \
  /absolute/path/to/new-raw.json \
  /absolute/path/to/new-checked.json
```

回傳`modelChecklistPass`只代表模型認為所提供的清單全部通過；沒有列進清單的需求仍未驗證，不能冒充完整原文／英雄自動鑄造核可。原始來源、必要條件與提案有任何異動都必須重新建plan。

默认每題90秒、整批600秒，上限可明確設定至1800秒；最長4096 token（預留256輸出），超長直接拒絕，不截斷來源。12GiB是MLX配置的記憶體限制，不是16GB Mac實機測試，也不包含作業系統與其他軟體的所有記憶體。

CPU測試已用真實JS生成的英雄請求與fidelity plan驗證摘要相容性，並測試未解析、重複ID、請求與plan改動拒絕。2026-09-06的R4實際GPU入口已完成：英雄1次、fidelity8次，12GiB配置上限下Metal峰值約8.9GiB；證據在R4的`supplement-v1/summary.json`。這是代表性入口驗證，不是整個模型合格或16GB實機證明。R5必須使用自己的新入口輸出，不沿用R4煙霧結果當作R5結果。

以新版審查目錄進行機制推薦，另見[CURRENT_TEMPLATE_INFERENCE.md](CURRENT_TEMPLATE_INFERENCE.md)。此來源入口仍不接受模板任務，兩種輸出契約不得混用。

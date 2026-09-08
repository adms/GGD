# 修正版解碼對照：只修研究 adapter 載入相容性

沿用 STRUCTURED_DECODING_PLAN.md 的固定四名英雄、原 prompts、兩組、原始評分、token/seed/時間/資源守門與不訓練、不修資料、不升級模型的限制。

v1 基底四例完成；lora24 在生成前因 mlx_vlm.load(adapter_path=...) 使用 trainer.utils 的完整模組名稱接口而失敗：`AttributeError: 'Model' object has no attribute 'self_attn'`。所有 v1 檔案保持原 bytes，不覆寫、不刪除，不把載入失敗計成模型機制錯誤。

v2 是新的有界執行，兩组各重新生成一次，不沿用已看到的分數挑選。唯一修正為載入既存 24 步權重時，使用原 lora-facts-pilot.py 的 trainer.adapter_utils.linear_to_lora_layers：最後兩層、rank 8、scale 8、q/o。確認恰為原檔八個 key、319488 個參數，載入後每個張量與 checkpoint 完全相等。除此不改 schema、messages、樣本、生成參數或 scorer。不做最佳化步驟，不另存權重。

解碼器、相容載入模組、腳本、原失敗 state 與 plan 都釘選 SHA。v1 基底與 v2 基底輸出另外比較是否逐字一致，僅作重跑一致性診斷。

執行前規定：每組最多20分鐘、每例600秒；只一次attempt，不自動再試。若新路徑仍載入失敗，停止並交付不完整結果。報告實際總耗時包含 v1 失敗與 v2；新增工程相容成本不能藏進「純訓練耗時」。

# 最小動作集合候選的精簡收據

這是本機七位模型的處理證據，不是出貨模型登錄或角色上架。原始模型、251 段片段與六段裁剪版均保留在 `outputs/community-lol-models-20260907`。候選 GLB 位於該目錄的 `ggd-runtime-candidate/`；本 Git 目錄只保留腳本、量測與比較收據。

- `ggd-runtime-candidate-manifest.json`：輸入／輸出 SHA-256、各片段通道數、被省略的定位節點與烘入預設值的屬性。
- `runtime-candidate-metrics.json`：以 GGD 現有 `measureGlb` 重新讀取真實檔案；七位共 14,132,584 bytes，四位符合 160 通道上限。
- `asset-compare.json`：七位的幾何屬性、索引、材質名稱、骨架順序、inverse bind matrices 與原始貼圖 bytes 相同。節點預設 TRS 的刻意改動另在 manifest 逐項記錄。
- `pose-compare.json`：Babylon 7.54.3 NullEngine 比較真實蒙皮頂點。每段 17 個時間點，共 714 點；七位各有 30 組有序片段切換，共 210 組。最大誤差約為初始待機高度的 0.0324%，低於本次取樣檢查的 0.1% 門檻。也要求原始動作確實產生頂點移動，避免比較兩份未播放的靜止模型。

精簡器使用 translation／scale `1e-4`、rotation `1e-5` 的逐分量容差，並在重採樣時使用 `1e-5`。省略片段內的屬性會把節點預設值納入比較；不以只看單一片段的方式刪除通道。權重分析保留所有網格、非零權重關節及其祖先，因此省略原作定位骨動畫的候選只適用於 GGD 靜態附著點用途。

第一次完整性檢查在卡爾瑟斯失敗：預設 dedup 把三個外觀相同、名稱不同的材質合併。`asset-compare-mismatch.json` 與 `asset-compare-initial.log` 保留差異；精簡器改成 `keepUniqueNames: true` 後重建七位，再重跑幾何與姿態比較，全部通過。首次量測的 tsx CLI 因 IPC listen EPERM 無法啟動，原始錯誤留在 `runtime-candidate-metrics-initial.log`；同一腳本改由 `node --import tsx` 執行通過。

重跑時，於 GGD 工作樹根目錄執行下列命令。`MODEL_DIR` 指向本機模型備份目錄；其 optimizer 套件版本由已備份的 package-lock.json 固定，需要先備妥依賴。本次備份不攜帶 node_modules；直接在備份執行比較器的首次 ERR_MODULE_NOT_FOUND 保存在 `durable-asset-check.log`，改用已具備依賴的同一份本機腳本讀取備份模型後，幾何與姿態比較均通過（`durable-asset-check-fixed.log`、`durable-pose-check.log`）。

```sh
node "$MODEL_DIR/optimizer/compact-ggd.mjs" "$MODEL_DIR"
node "$MODEL_DIR/optimizer/asset-compare.mjs" "$MODEL_DIR"
node "$MODEL_DIR/pose-compare.mjs" "$MODEL_DIR"
node --import tsx "$MODEL_DIR/measure-candidates.mjs" "$MODEL_DIR"
```

這些收據不涵蓋全部時間點、GPU 畫面、原作特效定位骨、缺少的受擊／格擋／閃避，或 GGD 選模與遊戲內綁定。A17 Pro 目標維持估算 30 fps，不要求裝置實測。

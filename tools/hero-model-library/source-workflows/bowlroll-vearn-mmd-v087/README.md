# BowlRoll 鯖缶359 巴恩 MMD ver0.87

`integrate.py` 驗證原始 ZIP、安全解包清單、來源授權限制與 S3 完整讀回收據，再更新既有中央索引。這個來源只有老年巴恩系列，且作者禁止商用與再散布，所以程式固定寫入 `runtimeReady=false` 與授權阻擋，不會產生公開 Git 模型或後台選項。

```sh
python3 tools/hero-model-library/source-workflows/bowlroll-vearn-mmd-v087/integrate.py --workspace ..
```

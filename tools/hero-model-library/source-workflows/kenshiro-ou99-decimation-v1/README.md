# 拳四郎 OU99 社群模型轉換

來源 `source.json` 與 `evidence/receipt.json` 固定輸入／輸出 SHA-256。這是 OU99 社群模型，並非 JUMP FORCE 遊戲擷取版。模型 21,733 → 7,844 面，保留 4 primitives、蒙皮、材質與 62 段來源動作；六態映射包含來源 Death。來源和候選的動畫 sampler 位元組相同。

`godie-umal` 新增非預設後台版本；原有預設及來源 GLB 全部保留。正式部署未驗證。

在 repository 根目錄執行：

```sh
python3 tools/hero-model-library/source-workflows/kenshiro-ou99-decimation-v1/run.py --check
python3 tools/hero-model-library/source-workflows/kenshiro-ou99-decimation-v1/integrate_source.py --check
```

`run.py --write` 會依現行 adoptionPolicy.json，重用既有 geometry 減面工具、原始 GLB、固定依賴，產生模型、做模型檢查、三視角渲染與後台登記。完整流程參數見 `run.py --help`。`integrate_source.py` 將成品與原始來源加入共用清單；`build_workflow_catalog.py` 也會執行相同整合，避免重建洗掉。

備份用 `backup_stages.py --upload`；只使用既有 `backup_intake.py` 的指定 AWS role/bucket，保留本機資料並完整讀回驗證。`evidence/stage-backup.json` 指向 575 個原始／中間檔與 geometry 依賴的 S3 備份；程式與 Git 成品另按 commit 備份。此備份不代表整台工作站材料全部已備份。

技術驗收見 `evidence/visual-comparison.json` 與 `evidence/ab-contact-sheet.png`；可重建渲染，不將影像相似度視為原作忠實度的人工裁決。

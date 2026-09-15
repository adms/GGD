# MBA 未使用模型轉換試批

此流程只讀既有 Complete Form 1.60+ 本機來源。`prepare_sources.py` 核對原始 SHA、以既有 MBA atlas／蒙皮準備器合併材質並縮到 256px，再只保留六段精確命名的同角色原生片段；完整 68～95 段來源仍留在素材庫與收據。`convert_batch.mts` 走正式 GGD upload normalizer、Khronos 與有限值檢查，支援 `--reference` 做逐位元重建比對。

最終三視圖用既有 `ssbu-models-v1/render_static_glb.py` 產生；人工核對後由 `assemble_evidence.py` 固定 Git GLB、逐檔 SHA 與接受／拒收證據。`integrate.py` 再更新固定來源索引與近四日清單，最後跑設計 backlog、inventory 及 current-resource 生成器。

本流程不建立英雄 ID、不註冊後台選項、不更改預設，也不把 `D-Down` 冒稱為已核准的死亡動作。八神疾風的來源三視圖出現大片黑條，因此保留拒收證據，未產生可用成品。

# 開司模型交付

來源為 [holya / kaiji_suit_2 0.1.1](https://thunderstore.io/c/lethal-company/p/holya/kaiji_suit_2/) 的 Lethal Company 社群 MOD。原包提供模型、33 骨骨架、三材質及完整貼圖；沒有原生動畫、音效、語音或特效。

可選成品、SHA、限制及本機入口見 `receipt.json`，後台選用見 `registration-readback.json`。六段基本動作皆由 GGD 程序化製作，不能當作遊戲原生動作。`contact.png` 是前方六態及側方取樣；全部 36 張成品驗收圖在本機 conversion root 及 S3 備份。

`native-preflight.json` 與 `independent-check.json` 保存來源與成品的骨架、綁定、權重、三角、材質、動畫逐值比對。完整模型、骨架、貼圖沒有裁除；只正規化尺度、座標及成品貼圖大小。原圖及過程中的四版 GLB 均保留。

`source-s3-backup.json`／`conversion-s3-backup.json` 是完整 GET 後逐檔 SHA 核對；原始與半成品只供人工指定用途。原有三個模型選項仍保留；目前自動選擇此社群模型，正式站部署未宣稱完成。

重現順序：`analyze_source.py`、共用 `convert_unity_prefab.py --root-name kaiji --height 1.8`、`animate.py`、`prepare.mts`、`render.py`，驗收後 `freeze.py` 建立單角色 release，使用共用 `register.mts` 登記、`readback.mts` 核對全81人。工具位於 `tools/hero-model-library/priority-conversion/kaiji/`；請為每次轉換使用新的輸出目錄，保留舊版本。

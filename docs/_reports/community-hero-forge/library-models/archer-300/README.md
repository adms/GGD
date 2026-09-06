# Archer 原生模型轉換驗證

來源是 300 英雄角色 156「卫宫」，登錄動漫來源為 Fate/stay night，別名 EMIYA／英靈衛宮。它作為 37 名英雄中「衛宮士郎」的可接受異版候選；保留士郎的遊戲名稱、技能原文及 Archer 的實際素材來源。來源分類為 alternate，非同一外觀的 exact。

`models-query.json` 中選取官方主模型 `300heroes:234e90fbb7002fcae4985063`，`textures-query.json` 選取其本體及武器引用的兩張貼圖。所有原檔保持原位，模型 SHA-256 為 `46cf835d199ad776cf5a2f066cffc42c14b518e6c2c0298a2e00451fe37b3a38`。

原生 JUMPX 有 118 骨、27 網格、25 片段。保留主體及雙刀的 3 網格、48 骨、4,088 三角形，原始全域骨骼姿勢轉成 glTF 局部階層，原生權重及逆綁定矩陣參與每次姿勢比對。角色單位依本次適配設定換成公尺，Z-up 轉 Y-up；32 fps 為明確適配設定，來源 viewer 使用 1/32 秒步進，未宣稱已證明原作固定幀率。刀刃專用葉骨依原生可見性鍵顯示／隱藏。

成品 `body.glb` 為 1,001,788 bytes，SHA-256 `fdc710a316d3bbb1359906f7e99374cc32951878b38b42fb19dfc00a4ded07da`，位於工作區 `outputs/community-hero-asset-integration/archer-300-v3/`。沒有把遊戲模型二進位加入 Git。

共用上傳、裁剪保持性及再匯入檢查通過，glTF 驗證 0 錯誤／0 警告。144 動作通道超過建議 120、低於硬限制 160；最大貼圖 512。五段片段映射六用途：idle→single_idle、run→single_run、attack→single_attack_attcom_1、cast→single_skill_01_b、hurt→single_idle、death→dead。**受擊共用待機是替代，未具備獨立受擊演出。** 施法片段只提供身體動作，未完成士郎全部技能演出。

Babylon CPU 蒙皮驗證六項用途均能變形；另比對原生片段起／中／尾共 328 個頂點樣本，最大偏差 0.000002041 公尺，容許誤差 0.0002 公尺。這項驗證跳過材質，不能證明貼圖、朝向、尺寸或觀感，畫面驗收仍待完成。未提交或發布此模型，未通過整套英雄設計驗收。

轉換器的三個獨立單元測試覆蓋全域轉局部階層、座標／逆綁定、半轉／非均勻縮放／反射以及毀損檔案拒絕。原始日誌與查詢／驗證回傳同目錄保留；重跑指令見 `tools/community-hero-forge/library-bodies/README.md`。

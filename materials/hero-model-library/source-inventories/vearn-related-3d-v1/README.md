# 巴恩大魔王 3D 候選跨來源索引

- BowlRoll 原包：已取得、解包、S3 讀回驗證。
- 實際轉換：5 個獨立靜態 GLB，Khronos 5/5 零錯誤，15 張 WebGL 三視圖。
- owner 已確認這五件是看過的年老／變身前巴恩、影版與附件，不是年輕真身或鬼眼王；不再重複送審。
- 目前限制：原生動作 0，後台註冊 0，正式部署 0。
- 燃魂羈絆完整快取：`runtime-v2-git-candidates-published-animation-clips-not-embedded-awaiting-owner-approval-and-game-registration`，生成索引時已下載 2,098,263,630/2,098,263,630 bytes。
- 完整解包與逐檔 SHA-256：17,284 檔；大型逐檔表留本機，入口 `bonds-cache-preservation.json`。S3 備份待完成。
- ALI2 資產索引：18,224 筆、17,205 個唯一邏輯路徑；已直接辨識 `kiganohburn` 特效家族。候選抽出 55 個、24,500,484 bytes。
- Aladin 解密：51/51 個加密 blob 全部還原為 UnityFS，共 22,536,492 bytes；UnityPy 已盤點 16 個模型包、6 個動作包及 3 個直接命名鬼眼王特效包。
- 音訊預備：已從 `ch027003700`／`ch027003800` AWB 自動抽出並解碼 7 段 WAV、共 19.648001 秒；說話者與事件綁定仍待聽審。
- 模型反查：`ch027005800`、`ch027005801` 已從解碼 Unity 物件名直接命中 `kiganBurn` 的頭、身體與眼睛元件，為鬼眼王原作模型候選。兩顆 runtime-v2 已保留骨架與蒙皮，分別為 7,898／7,897 triangles、5 個蒙皮 primitive、5 張內嵌貼圖、最大 256px、1 skin，Khronos 0 errors；來源 AnimationClip 尚未嵌入 GLB，owner 視覺核准、遊戲註冊與部署仍為 0。`ch027003800` 已確認為 `chyoZaboera` 超魔生物札波耶拉而排除；`ch027003700` 為 `shinBurn` 真巴恩系。
- 其他原作 3D 線索：Dragon Quest Tact 鬼眼王バーン、Dragon Quest Monsters Joker 3 Professional 鬼眼王バーン、星のドラゴンクエスト 鬼眼王バーン；目前都是已確認作品線索，payload 尚未取得。
- 舊審查證據頁：`/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT/GGD-Asset-Library/conversions/bowlroll-vearn-mmd-v087-owner-review-v1/index.html`（只作追溯，不再請 owner 重審）

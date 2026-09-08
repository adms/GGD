# 社群英雄模型與六用途預覽

19 名英雄的本體／貼圖已逐份查看六個指定時點，結果在 `visual-review.json`。各編號資料夾保存完整原始截圖、截圖 SHA、接入及共用驗證收據、原生蒙皮比對。畫面来自隔離的 Chromium、實際 Editor Models 預覽；無 GPU 效能結論。

來源包括 17 個本批 300 英雄本體、先前 Archer 本體及 MBA 1.60 小櫻。Archer 作為衛宮士郎版本互通；真田幸村的紅衣雙扇造型作為不知火舞風格替代。保留原動漫來源，不改遊戲名稱。所有模型仍是隔離內容庫候選，未修改正式英雄。

300 英雄的受傷用途共用待機。詩乃另試 `single_attack_attcom_1_s`，實際截圖沒有呈現所需持槍姿態，因此改用原生 `single_skill_03` 共用普攻／施法。新版本保留在独立目錄，舊版没有覆盖。原生粒子、未選網格及專屬技能效果不在本體接入範圍。

銀時來源沒有通過原生幾何／變換轉換，沒有算入 19 名成功候選。批次保留此失敗而退出 1；其他角色繼續處理。工具與選擇位於 `tools/community-hero-forge/prepare-native-batch.py`、`library-bodies/300-community.selection.json`。NumPy／Pillow 轉換與 MBA 準備單元測試共 9 項通過。

`passed-at-captured-poses` 只代表這些時點的模型／貼圖檢查；不代表 222 槽技能、原作特效、音效、碰撞時點或完整遊戲已驗收。沒有使用靜態 OBJ 代替骨架動作。

# 達伊部件與巴恩研究索引增量

此增量只追加或按指定 id 更新來源控制索引，不新增 model bodyCandidates，不更改英雄、技能、模型版本或預設。

達伊：公開 Shinteo Daz V2 原包117檔已取得，缺人体基底，完整本體0。135檔封存含全部原始檔及程式，S3完整GET＋逐檔SHA已核對。巴恩：只有研究證據，任何形態的角色素材包均未取得；老年Boss存在已證實，年輕真身收錄未證實。

resource-coverage.json 的真實鍵名是 priorityRequests。新增 reservedResources 必須由 renderer 與 audioOnlyCharacters 合併顯示於「音訊、動作及部件儲備：尚未確認同來源完整模型」；resources/modelStatus 均為中文字串。

複製規則見 integration-delta.json 的 copyFiles：若目的檔不存在可新增，已相同可略過，已有不同內容必須停止比對，不覆寫。原ZIP／DUF／DSF／JPG／PNG／研究HTML和大型解析JSON不進Git；已在S3及本機保留。

程式存Git用於保留可重跑工具；不要直接在Git位置執行。先從收據指定的已驗證原包恢復至獨立intake鏡像，保留原資料夾結構，再將工具放回tools或scripts。Dai analyze_archive.py靜態解包；freeze_delivery.py需要Pillow且包含此批來源下載事實，不能套用其他包；backup_source.py包含固定AWS profile與前綴且只應經明確備份授權執行。Vearn scripts需要研究來源檔與原工作區結構。不可覆寫已凍結來源。

`finalize_validation_snapshot.py` 是本輪合併索引狀態的收據產生腳本，依 `1267de2e9` 與 `e36a5acda352` 的當時 Git index 查核，供追溯；後續版本需使用當期輸入重新核對。

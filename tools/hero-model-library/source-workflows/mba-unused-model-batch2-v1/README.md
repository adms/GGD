# MBA 未使用模型第二批

本批只讀既有 Magical Battle Arena Complete Form 1.60+ 本機與 S3 已驗證來源，處理諾威爾、柯柯麗、白蛇娜卡與 Gadget Drone I 型。`prepare_sources.py` 固定角色定義、來源 SHA、六段同角色原生動作及 256px atlas；`convert_batch.mts` 走現行 GGD upload normalizer、Khronos、模型限制與有限值檢查，並以兩次逐位元相同重建驗證可重現性。

`render_batch.py` 產生來源／成品 WebGL 對照。動作名稱只作候選映射，語意、連續播放與 `D-Down` 死亡替代仍須審查。本流程不建立英雄 ID、不更改預設、不註冊下拉選項，也不聲稱部署。

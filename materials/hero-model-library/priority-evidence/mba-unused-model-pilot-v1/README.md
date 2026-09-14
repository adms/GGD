# MBA 未使用模型轉換試批 v1

本批從既有 Complete Form 1.60+ 本機與 S3 讀回來源中核對 5 名，接受 4 個獨立角色元件，拒收 1 個；沒有新下載、沒有改預設、沒有註冊英雄。

| 角色 | 原生 ID | 三角面 | draw | 貼圖 | 原生動作 | Khronos | 狀態 |
|---|---|---:|---:|---:|---:|---|---|
| 露露·傑拉德（ルル・ジェラード） | `mba:Chara01_O` | 2,787 | 1 | 1 × 256px | 6 | 0 error／20 warning | 靜態與政策驗收；動作語意、英雄設計、下拉註冊待處理 |
| 星空綺羅羅（星空きらら） | `mba:Chara05` | 4,192 | 1 | 1 × 256px | 6 | 0 error／19 warning | 靜態與政策驗收；動作語意、英雄設計、下拉註冊待處理 |
| 星空紗羅羅（星空さらら） | `mba:Chara06` | 3,365 | 1 | 1 × 256px | 6 | 0 error／19 warning | 靜態與政策驗收；動作語意、英雄設計、下拉註冊待處理 |
| 薇塔（ヴィータ） | `mba:Chara11` | 4,412 | 1 | 1 × 256px | 6 | 0 error／19 warning | 靜態與政策驗收；動作語意、英雄設計、下拉註冊待處理 |

八神疾風 `mba:Chara10` 在來源三視圖出現大片不透明黑條，已保留來源、雜湊、三視圖與拒收原因，未產生或冒稱可用成品。

24 段動作都是同角色 MBA 原生片段：`wait`、`F-Move`、`attack_01`、`sp01_01`、`Damage-1`、`D-Down`。其中 `D-Down` 只列作死亡替代候選；所有動作仍須逐項播放與語意核准。

視覺對照：`materials/hero-model-library/priority-evidence/mba-unused-model-pilot-v1/source-final-contact-sheet.png`。完整逐檔 SHA、Khronos warning、finite accessor、骨架、比例、方向及缺口見 `report.json`。

本批沒有模型上架、可切換或正式部署成果。

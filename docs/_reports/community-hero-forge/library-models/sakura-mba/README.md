# 小櫻 MBA 模型接入收據

來源為本機 MBA 1.60 素材庫的木之本櫻，動漫來源《庫洛魔法使》，角色 ID `mba:Chara03`。`character-query.json` 與 `model-query.json` 保留 query.py 的角色定義、原始路徑、存在狀態及 `glb_candidate` 判定；未把跨庫名稱匹配當作已驗收。

本次實作兩階段模型準備工具，來源與衍生結果均記錄 SHA-256。原始 GLB 保持 8,289,164 bytes、83 片段、48 骨架；六動作版本為 985,524 bytes、3,221 三角面、2,941 頂點、1 次模型繪製，貼圖為 1024×1024。

修正與驗證包含：

- 保留原頂點位置、關節索引及骨架動作；把六張 diffuse 貼圖以原解析度打包，更新 UV，合併成一組材質。
- 將 Assimp 的 specular 材質改為無光照貼圖。10 頂點的權重總和誤差正規化，最大差約 0.00000103。
- 裁剪前後檢查模型、骨架、材質與留下的動作未改變；共用模型上傳檢查及再次驗證通過。
- `preparation-tests.log`：四項測試涵蓋形狀、材質 UV 取色、骨架、權重比例、截斷檔與不支援的模型布局。
- `runtime-motion-proof.json`：使用 Client 相同版本的 Babylon，在首格與 60% 位置做 CPU 骨架變形；六片段都有頂點位移。此次跳過材質，不是畫面驗收。

仍保留兩項效能警示：1024 貼圖超過 512 警戒值、最高 147 動畫通道超過 120 警戒值，均低於目前硬上限。Khronos 驗證的 20 項警告也保留在 `preparation-and-validation.json`：來自 Assimp 的 skinned mesh 節點變換與父節點用法，須配合畫面確認。

六項用途暫映射為 `wait`、`F-Move`、`attack_01`、`sp01_01`、`Damage-1`、`D-Down`。尚未完成貼圖、朝向、尺寸、倒地演出與技能畫面的視覺驗收，未設為已核准角色模型、未發布 37 名英雄投稿。

可重複的命令與範圍見 `tools/community-hero-forge/library-bodies/README.md`。本機可上傳候選位於工作區 `outputs/community-hero-asset-integration/sakura-mba-v1/`；它不是已依當下服務編譯的英雄投稿 ZIP。

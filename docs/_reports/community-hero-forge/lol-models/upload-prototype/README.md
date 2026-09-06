# 社群模型與動作庫匯入原型

這是尚未接入產品的原型。模型核准與七位原模型預覽已另行實作；本目錄不代表社群上傳、草稿／雲端保存、完整英雄套件或後台送審已完成。

依 [glTF 2.0 規格](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) 與 [Khronos 官方驗證器](https://github.com/KhronosGroup/glTF-Validator) 驗證自含 GLB。驗證器固定為 `2.0.0-dev.3.10`，公開套件完整性資訊與安裝 lockfile 均保留。套件僅安裝在 `/private/tmp/ggd-model-upload-tools`，尚未新增為遊戲依賴。

- 七位原模型的完整格式檢查均為 0 errors、0 warnings、未截斷；UNUSED_OBJECT 仍保留為資訊。初次 `maxIssues: 100` 全被資訊訊息占滿，因此不能宣稱完整通過；該結果保留，另以未限制訊息數的本機檢查完成驗證。
- `inspect-upload.cjs` 可辨識每個 GLB 的片段名稱、長度、通道與骨架。原型限制 32 MiB、自含 BIN、1024 節點、256 片段與少量已列出的材質擴充；這些是原型限制，尚未接成後台政策。
- `merge-animations.cjs` 對獨立檔案檢查節點唯一名稱、父子關係及基準姿勢，僅合併選用的 TRS 動畫資料。不同骨架會拒絕，未實作任意骨架重定向或 FBX 轉換。
- `ggd-model-upload-merge-independent.json` 使用不同 SHA 的相容動作庫，驗證原模型的 nodes／meshes／skins／原始 binary 不變，新增動畫的 target 與所有 sampler 值不變；合併結果再次通過官方格式檢查。這不是 Babylon 播放或逐幀蒙皮畫面證據。
- `ggd-model-upload-merge-prototype.json` 另保存同一 GLB 重複匯入及拉克絲模型拒絕沃維克骨架的結果。相同來源路徑不是獨立動作庫驗收，故另有上述不同 SHA 的案例。

重跑格式檢查：在複製的本目錄執行 `npm ci --ignore-scripts`，再執行 `node validate-local-complete.cjs <本機 GLB 目錄> <輸出 JSON>`。不要把未安裝依賴或報告被截斷算作驗證通過。

下一段實作需將本原型改成可共用、具界限的正式模組，加入不合法／相容性案例，再接上作者選檔與動作對應、本機原檔保存、版本固定、現有 manifest.entries 通道及 Main 重新驗證。正式伺服器不能信任作者端宣稱的檢查結果，亦不能把工作內模型自動核准到全域目錄。

# Fate 第二批交付

主入口 handoff.json；兩個 source 根目錄各有 source-manifest、files.sha256、candidate-manifest、audioFileIndex。兩包原包、解包、骨架與音訊已保存並標準化；共 8 個 GLB、28 段 PCM 音訊。來源平台未知，原生 PSP FPK/GMO 與動作缺口未關閉。

所有已列入 files.sha256.json 的來源已凍結。未來轉換請建新版本。tooling/ 保留這批使用的本機工具，中央 repo 未修改，無 Git/S3 操作。沒有仍在下載的程序，兩個 normal download 都已成功；不需續傳。

公開候選／受阻來源記於 search-leads.json，未取得檔案的網址不可當成素材庫條目或可選模型。

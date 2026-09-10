# 81 英雄聲音交付稽核

本批固定 Main 提交 `b6686109a2946664827e8e59529de670b844d7c6`（含 #1182／`dcbd136a3`）的音訊成品，並核驗本機來源庫。沒有新增下載、轉換、中央修改或推送。

| 交付 | 已驗證狀態 |
|---|---|
| 74 位新英雄成品語音 | 1,016 個唯一 MP3；Git blob、MANIFEST、status 與本機 SHA 一致 |
| 成品類別 | 308 沿用來源檔、708 合成；合成中 403 標為 own reference、305 借用 reference |
| 七位 LoL 來源儲備 | 4,927 個日文封包 WAV；尚未對應角色戰鬥事件，不算 11 類戰鬥成品 |
| 81 位可交付範圍 | 74 位成品＋7 位來源儲備；不能把兩種成熟度合併成「全部上線」 |
| 來源庫核驗 | 17,278 個唯一檔，12,479,246,520 bytes，全部 SHA 一致；不含另外250個原檔檢查的去重聯集計數 |
| 成品完整度 | 74 位核心9類完整；73位擴展11類完整；如月列車缺 taunt／victory |
| 系統語音與音效 | 81 位有合成報名、22位有合成名言；現有技能使用共用 generic／element SFX，沒有專屬 sfxKey 綁定 |

「沿用來源檔」只代表原檔轉碼出處已核驗；沒有把它升格為原角色、原聲優或逐段語言確認。模型相似代理的聲音沒有自動繼承。49位成品目前全為合成；本機原始／來源標記音訊直接對應可證者共37位，其餘不代表素材庫完全不存在可能候選。

## 固定查詢入口

- `per-hero.json`：81列，依 `heroId` 或 `runtimeHeroId`；`mainCommittedVoice` 是成品，`characterAudio`／`projectSevenJapaneseSupplement` 是來源儲備。
- `group-audit.json`：32組來源分類、可取用數、範例路徑、主索引 groupId 查詢條件。
- `input-index-pins.json`：固定主 `voice-index.json`、`voice-files.jsonl.gz`、七人專用索引及所有相關輸入 SHA；直接讀原索引，沒有複製大型逐檔來源 JSON。主逐檔索引依 `groupId` 過濾；七人索引依 `nativeId` 過濾。
- `main-committed-clip-audit.json`：1,016個成品逐檔路徑／SHA／分類／Git object id／原來源對應。
- `main-original-source-index-join.json`：308次原檔沿用與既有聲音索引精確路徑、groupId、SHA及JSONL行號連接。250個唯一來源檔已重新核對。
- `content-audio-files.json`：content名稱、名言、成品和共用SFX引用的本機路徑及SHA。
- `main-committed-index-pins.json`：Main音訊MANIFEST、各英雄status、COMBAT_ORIGINALS／CASTING的提交與SHA。
- `files.sha256.json`：本稽核交付檔案的不可變收據。

所有聲音檔案留在既有本機路徑，這個目錄只含稽核程式和控制資料。不要把本目錄登記成新的角色模型／音訊原包。没有執行解碼、人工聽審、合成或遊戲內播放驗收。

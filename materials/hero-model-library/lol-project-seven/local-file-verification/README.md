# LOL 指定七名日文音訊本機實檔驗證

> 這份收據證明本機檔案存在，且大小與 SHA-256 符合中央語音索引。來源 manifest 的 `ja_JP` 只證明套件語系；逐段語言、說話者、台詞、技能事件、合成用途與 runtime 綁定仍待人工聽審。

| 角色 | 中央群組 | 檔案 | Bytes | 秒數 | 本機驗證 | 聽審 |
|---|---|---:|---:|---:|---|---|
| 卡爾瑟斯 | `lol-project-seven-ja-jp-16.18.8159717:lol-karthus-ja-jp-16-18-8159717` | 225 | 311303080 | 1102.489592 | 通過 | 待完成 |
| 李星 | `lol-project-seven-ja-jp-16.18.8159717:lol-leesin-ja-jp-16-18-8159717` | 1069 | 1603331104 | 4757.531111 | 通過 | 待完成 |
| 拉克絲 | `lol-project-seven-ja-jp-16.18.8159717:lol-lux-ja-jp-16-18-8159717` | 1142 | 954512456 | 3473.104671 | 通過 | 待完成 |
| 好運姐 | `lol-project-seven-ja-jp-16.18.8159717:lol-missfortune-ja-jp-16-18-8159717` | 695 | 563086756 | 2130.273197 | 通過 | 待完成 |
| 沃維克 | `lol-project-seven-ja-jp-16.18.8159717:lol-warwick-ja-jp-16-18-8159717` | 531 | 648887568 | 1848.242330 | 通過 | 待完成 |
| 齊勒斯 | `lol-project-seven-ja-jp-16.18.8159717:lol-xerath-ja-jp-16-18-8159717` | 223 | 261625636 | 1060.212721 | 通過 | 待完成 |
| 犽宿 | `lol-project-seven-ja-jp-16.18.8159717:lol-yasuo-ja-jp-16-18-8159717` | 1042 | 1087126480 | 4239.575510 | 通過 | 待完成 |

## 合計

- 本機存在且大小、SHA-256 完全相符：**4927 / 4927**
- 總位元組：**5429873080**
- 已量測長度：**18611.429133 秒**
- 缺檔：**0**；不符：**0**
- `languageVerified=false`、`speakerVerified=false`、`listeningReviewComplete=false`、`synthesisReady=false`、`runtimeSelectable=false`、`deployed=false`

各角色的 `.json.gz` 收據包含每一個 WAV 的本機絕對路徑、相對路徑、bytes、SHA-256、長度、分類與中央 manifest 行號。

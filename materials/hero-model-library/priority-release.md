# 本次模型整合交付

81 名新角色的本機後台版本登記已完成，共 **221 個版本引用**；全角色盤點包含 **157 個角色／形態 ID**。**全庫發布檢查尚未通過**：幾何普查的四組模型、技能形狀分類、技能驗收清單、協調重複判定及缺少 combat 產生器仍待處理；精確日誌見 [`release-gates`](priority-evidence/release-gates/)。分支尚待 Main 合併部署，正式站狀態仍以實際快照為準。

固定取用入口：[`current-resources.json`](../asset-library/current-resources.json)。逐角色查 [`全角色模型盤點.md`](全角色模型盤點.md)／[`inventory.json`](inventory.json)，驗證紀錄查 [`priority-release.json`](priority-release.json)。

| 優先角色 | 本批選中來源 | 身分類別 | 保留版本數 |
|---|---|---|---:|
| 闇影 | `ou99.481732-standard-v2`<br>ou99 | 相似代理 | 3 |
| 貓貓 | `community.body.630cb77949fffeb99071efbc5285fdc721f31f31bf46eb42`<br>Lethal Company MOD／GrogCompany | 本尊 | 3 |
| 岩谷尚文 | `community.body.ba5a88c157203ca6d4a5ae6aa5419cc2fef3ca8d8072c569`<br>GTA SA 社群 MOD | 本尊 | 4 |
| 凱茲 | `community.body.b1b34acae6fcd904efd4a4fe118e1301525ee377890a0f9d`<br>Lethal Company MOD／RRoD | 本尊 | 4 |
| 野原新之助 | `community.body.e625b8d3604e6909cde457e5e3f8ae34b5913d6d0147771e`<br>GTA V MOD／Ksplaytamilyt / KS PLAY TAMIL | 本尊 | 4 |
| 八神庵 | `ou99.313646-standard-v2`<br>ou99 | 本尊 | 3 |
| 洛克人 | `ou99.287871-standard`<br>ou99 | 本尊 | 3 |
| 西索 | `ou99.497211-standard-v2`<br>ou99 | 本尊 | 3 |
| 赫蘿 | `ou99.468771-standard-v2`<br>ou99 | 本尊 | 3 |
| 利姆路 | `ou99.457280-standard-v2`<br>ou99 | 本尊 | 3 |
| 殺老師 | `ou99.472112-standard-v2`<br>ou99 | 本尊 | 3 |
| 比利海靈頓 | `ou99.457123-standard-v2`<br>ou99 | 本尊 | 3 |
| 菜月昴 | `ou99.311294-standard-v2`<br>ou99 | 本尊 | 3 |
| 高速婆婆 | `community.body.e9e17e3b1e07968fd5e9b7d6cf7b1b9222286271cd29ff8e`<br>Lethal Company MOD／inkiidonut | 本尊 | 4 |
| 吉伊卡哇 | `ou99.459617-standard`<br>ou99 | 相似代理 | 3 |

貓貓、凱茲、岩谷尚文、野原新之助兩版、高速婆婆與辛巴達的七件新轉換成品，均使用明確標示的 GGD 程序化六態動作；未宣稱原生動作已齊。其餘來源依各自 clipMap 與保留證據。

先前 18 名缺口中已查到其他工作流交付 17 名；**伊藤開司仍未找到新模型交付**。尼古貓貓、近衛刀太、鬼畜王蘭斯的相似來源已整合；相似模型保持相似身分。辛巴達採巴力魔裝兼用，高速婆婆採已確認招財貓形態。

15 個既有手動預設與 11 組指定加工副本均保留。原固定本機 catalog 的 94 筆未刪改，本次新增 43 筆至 137；來源選项與同英雄不可變版本數是不同分母。

七名 LOL 共 4,927 個 WAV 可直接供本機其他工作流使用，入口 [`角色語音索引.md`](角色語音索引.md)。尚未逐段聽審，不將全數當成已確認台詞。

來源工作流繼續 KOF／Fate／Infinity Strash 等擷取。本工作流接收後分批轉換、驗收、追加選項及推送；不以整個遊戲尚未抓完阻擋這批交付。原始／半成品全部保留，S3 狀態另記，不能把 Git 推送當成原始備份已完成。

KOF 新交付：不知火舞 XV 原作 FBX＋12 TGA、八神庵 XV 原作 FBX＋12 TGA，以及舞的 SFM 部件包，均已歸檔待材質重綁／標準化；未取得原生動作。Infinity Strash 何布 MOD 取得 1 sequence＋5 montage，缺骨架／本體，不算完整角色。

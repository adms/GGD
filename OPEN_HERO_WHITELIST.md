# 遊戲開放英雄白名單與正式驗收集合

狀態：**owner 已選定 43 名：42 名 6／6 完整，`godie-ogld` 以缺 PASSIVE 的來源缺件 fixture 納入**  
基線：`GGD main@81826f9ffc8f1561fe99dbd5628576645f321664`  
版控權威來源：`apps/platform/internal/curation/starter.go` 的 `starterChampions`

## 1. 邊界說明

- GGD 內有 119 份 champion documents，但版控的「首次開放名單」只有 **53 支**。
- 這 53 支是 client champ-select 與 game-server 白名單的 starter authority，且有測試釘死為恰好 53 支。
- 實際已部署環境可由管理員修改 live whitelist；repo 內沒有 tracked `data/curation/whitelist.json`，所以本清單代表 pinned commit 的 starter whitelist，不假裝是 production 當下狀態。
- 53 支中 **52 支有 PASSIVE／Q／W／E／R／EX 六槽與六份 standalone ability documents**。`godie-ogld` 只有 5／6，缺 PASSIVE。
- 商店層面是 12 支免費、41 支每支 300 藍水晶；這是取得權，不改變它們都在 curation 開放白名單的事實。

## 2. Owner 已選定 43 名

勾選欄依 owner 2026-08-04 的回覆固定，共 43 名、258 個預期槽位與 257 份實際 standalone ability documents。`godie-ogld.passive` 是已確認的 `MISSING_SOURCE`，不得自動補造；其餘 42 名皆為 6／6。未勾選的 10 名仍保留在白名單中，但不進本次固定探索回歸。

| 選取 | # | Champion id | 遊戲顯示名稱 | 取得 | 六槽文件 |
|---|---:|---|---|---|---|
| □ | 1 | `godie-e001` | 蟬在叫人壞掉 - 龍宮禮奈 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 2 | `godie-e002` | 亞瑟王 - Saber | 免費 | ✅ 6/6 |
| □ | 3 | `godie-e008` | 火霧戰士 - 夏娜 | 300 藍水晶 | ✅ 6/6 |
| □ | 4 | `godie-e00k` | 戰國刺客Azumi - 安云 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 5 | `godie-e00r` | 最終泛用人型決戰兵器 - 初號機 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 6 | `godie-e00s` | 白木老樹精 - 白木卡迪那 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 7 | `godie-e00w` | 神鳴流劍士 - 櫻綻剎那 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 8 | `godie-edem` | 寫輪眼復仇者 - 宇智波佐助 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 9 | `godie-efur` | 揍敵客大家長 - 揍敵客桀諾 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 10 | `godie-emfr` | 魔法老師 - 涅吉。史普林。菲爾德 | 免費 | ✅ 6/6 |
| ✅ | 11 | `godie-emns` | 奇樂 - 夜神月 | 300 藍水晶 | ✅ 6/6 |
| □ | 12 | `godie-etyr` | 治癒系公主 - 木乃香 | 免費 | ✅ 6/6 |
| ✅ | 13 | `godie-ewar` | 龍之子 - 天地志狼 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 14 | `godie-h00l` | 時空勇者 - 林克 | 免費 | ✅ 6/6 |
| ✅ | 15 | `godie-h01n` | 開外掛的死神 - 黑崎一護 | 免費 | ✅ 6/6 |
| ✅ | 16 | `godie-h01u` | 亂世癿王者 - 呂布奉先 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 17 | `godie-h02k` | 國寶級的畜生 - 熊貓 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 18 | `godie-h02v` | 看似憂鬱的神獸 - 草泥馬 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 19 | `godie-hapm` | 海克力斯 - Berserker | 300 藍水晶 | ✅ 6/6 |
| ✅ | 20 | `godie-hart` | 最終幻想 - 克勞德 | 免費 | ✅ 6/6 |
| □ | 21 | `godie-hblm` | 慈悲的王者 - 賈修貝爾 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 22 | `godie-hgam` | 種子神奇寶貝 - 妙蛙種子 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 23 | `godie-hjai` | 黑魔導士 - 莉娜因巴斯 | 免費 | ✅ 6/6 |
| □ | 24 | `godie-hpal` | 不死之身-無 - 藤井八雲 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 25 | `godie-hpb1` | 獸矛傳承使 - 蒼月潮 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 26 | `godie-huth` | 超級普烏 - 魔人普烏 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 27 | `godie-hvsh` | 梅杜莎 - Rider | 300 藍水晶 | ✅ 6/6 |
| □ | 28 | `godie-hvwd` | 除魔巫女 - 桔梗 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 29 | `godie-n003` | 黑暗福音 - 依文潔琳 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 30 | `godie-n00b` | 小叮噹 - 哆拉A夢 | 免費 | ✅ 6/6 |
| ✅ | 31 | `godie-nbbc` | 傳說的龍騎士 - 勇者小呆 | 300 藍水晶 | ✅ 6/6 |
| □ | 32 | `godie-nplh` | 通靈人 - 麻倉葉 | 300 藍水晶 | ✅ 6/6 |
| □ | 33 | `godie-nsjs` | 妖狐藏馬 - 南野秀一 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 34 | `godie-o00k` | 傲嬌電氣老鼠 - 皮卡娘 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 35 | `godie-o00l` | 獸神官 - 傑洛士 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 36 | `godie-o02p` | 夢幻之星 - 初音 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 37 | `godie-ofar` | 神奇寶貝兒 - 皮卡丘 | 免費 | ✅ 6/6 |
| ✅ | 38 | `godie-ogld` | 美白大法師 - 黑人牙膏 | 300 藍水晶 | ⚠️ 5/6；缺 PASSIVE／`MISSING_SOURCE` |
| ✅ | 39 | `godie-ogrh` | 賽亞人 - 悟空 | 免費 | ✅ 6/6 |
| ✅ | 40 | `godie-orkn` | 電車癡漢 - 臭作 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 41 | `godie-osam` | 犬妖 - 殺生丸 | 300 藍水晶 | ✅ 6/6 |
| □ | 42 | `godie-u00h` | 鬼畜紅王 - 鬼畜狂刀KYO | 300 藍水晶 | ✅ 6/6 |
| ✅ | 43 | `godie-u00j` | 神性的流失 - 賽菲洛斯 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 44 | `godie-u00k` | 邪惡意念集合體 - 死之王 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 45 | `godie-u00n` | 草帽小子 - 蒙其.D.魯夫 | 免費 | ✅ 6/6 |
| ✅ | 46 | `godie-u00v` | 黑手黨老大 - 基廉列克 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 47 | `godie-ubal` | 魔界霸主 - 巴恩大魔王 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 48 | `godie-ucrl` | 職業獵人 - 傑 富力士 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 49 | `godie-udea` | 至尊學長 - 飛鼠先生 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 50 | `godie-udre` | 三刀流劍士 - 索隆 | 免費 | ✅ 6/6 |
| ✅ | 51 | `godie-umal` | 北斗神拳掌門人 - 拳四郎 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 52 | `godie-uvng` | 邪眼師 - 飛影 | 300 藍水晶 | ✅ 6/6 |
| ✅ | 53 | `godie-zombiex` | 聖杯黑泥醬 - 喪標麥可 | 300 藍水晶 | ✅ 6/6 |

## 3. 固定方式

不再以隨機 seed 重抽。`hero-regression-selection@1` 至少記錄：

- 43 個 champion ids 及上述 owner 順序。
- 258 個 slot records；其中 257 份 ability ids／`contentSha256`，以及 `godie-ogld.passive = MISSING_SOURCE`。
- 43 份 champion documents、257 份 standalone abilities 與 172 份 Q／W／E／R mirrors 的 semantic digests。
- pinned game revision、contentVersion 與 whitelist source digest。
- owner 對技能描述與候選效果標籤的確認結果；未確認標籤不得冒充 runtime truth。
- 日後白名單或任一文件變更時標 stale，不靜默換英雄；缺件 slot 也不能被 placeholder 自動補齊。

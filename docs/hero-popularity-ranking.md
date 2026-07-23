# GGD 英雄真實世界人氣排名 (Hero Popularity Ranking)

> 產出目的：供角色策展 / 行銷規劃參考。本表估計的是每位英雄「原型角色」在真實世界（動漫、遊戲、流行文化）中的知名度，**不是**遊戲內強度或使用率。

## 方法論 (Methodology)

- **名冊來源**：`content/champions/*.json`，共 113 個檔案（不含 `_index.json`）。顯示名依 WC3 慣例 `稱號 - 全名` 拆分（規則見 `apps/client/src/ui/codex/codexData.ts` 的 `splitChampionName`）；英雄編號取自技能名前綴（如 `22-01 …` → #22）。
- **過濾**：剔除 30 個測試/佔位/換皮條目後，實際排名 **83 位**英雄（詳見文末附錄）。
- **原型辨識**：以「全名 + 稱號 + 檔案 `description` 內 `(出自:…)` 標註」交叉比對，判定來源作品與角色。
- **人氣指數 (0–100)**：綜合下列訊號給分——
  - 官方/社群**角色人氣投票排名**（如 NARUTOP99、One Piece 全球投票、幽遊白書/犬夜叉/BLEACH 官方人氣榜、Fate/Type-Moon 投票、鋼彈SEED 投票等）。
  - **搜尋熱度 / 全球辨識度**（如 Google 年度動漫角色、Gen-Z 角色辨識率、品牌價值報導）。
  - **文化地位分層**：全球流行文化 icon（皮卡丘、初音、維尼、悟空、林克）給 90+；頂級動漫/遊戲核心角色 80–90；知名但屬特定作品 55–75；小眾/舊作/配角 35–55；在地迷因與社群原創 5–30。
- **透明度**：`依據` 欄標示每筆的訊號來源。標 `search-backed` 者有本次網路搜尋佐證（多為франchise 層級投票數據，一次搜尋涵蓋同作多角）；標 `cultural`／`local`／`original`／`meme`／`niche` 者為依公認文化地位的估計值，未逐一搜尋。
- **限制**：這是**主觀估計**、非精確科學。分數為序位參考而非絕對值；同分者代表大致同級。人氣有地域性（例：多為 1990s–2000s 台/日 ACG，對照現今全球熱度會偏舊），且原型多為 2010 年前作品。

---

## 排名表 (依人氣指數遞減)

| 排名 | 人氣指數 | 全名 | 稱號 | 原型角色 / 來源作品 | 依據 (signal) |
|---:|---:|---|---|---|---|
| 1 | 99 | 皮卡丘 | 神奇寶貝兒 | Pikachu / Pokémon | search-backed：全球最高辨識度角色之一、85% Gen-Z 認得、可比米老鼠 |
| 2 | 96 | 初音 | 夢幻之星 | Hatsune Miku / Vocaloid | search-backed：全球虛擬歌姬、跨國演出與國際品牌合作 |
| 3 | 95 | 維尼 | 百畝森林的霸主 | Winnie the Pooh / 小熊維尼 | cultural：全球家喻戶曉童書/迪士尼 IP |
| 4 | 94 | 悟空 | 超級賽亞人 | Son Goku / 七龍珠 (Dragon Ball) | search-backed：2023 Google 全球最多搜尋動漫角色、全時代前三 |
| 5 | 92 | 林克 | 時空勇者 | Link / 薩爾達傳說 (The Legend of Zelda) | cultural：電玩史頂級 IP 主角 |
| 6 | 92 | 蒙其.D.魯夫 | 草帽小子 | Monkey D. Luffy / 航海王 (One Piece) | search-backed：OP 全球人氣榜第1、頂級動漫主角 |
| 7 | 91 | 克勞德 | 最終幻想 | Cloud Strife / 太空戰士7 (Final Fantasy VII) | search-backed：公認 FF 系列人氣第一、電玩史指標主角 |
| 8 | 90 | 金鋼狼 | X戰警 | Wolverine / X-Men (Marvel) | search-backed：Marvel 最具代表性英雄之一、全球認知 |
| 9 | 89 | 哆拉A夢 | 小叮噹 | Doraemon / 哆啦A夢 | search-backed：亞洲國民級 IP、日本動漫大使、堪稱日版米老鼠 |
| 10 | 88 | 索隆 | 三刀流劍士 | Roronoa Zoro / 航海王 (One Piece) | search-backed：OP 全球人氣榜第2、多地區奪冠 |
| 11 | 88 | Saber | 亞瑟王 | Saber (Artoria) / Fate/stay night | search-backed：公認 Fate 系列人氣第一 |
| 12 | 87 | 宇智波佐助 | 寫輪眼復仇者 | Sasuke Uchiha / 火影忍者 (Naruto) | search-backed：NARUTOP99 第8、全球頂級 IP 核心角色 |
| 13 | 86 | 賽菲洛斯 | 神性的流失 | Sephiroth / 最終幻想7 (Final Fantasy VII) | search-backed：電玩史最具代表性反派之一 |
| 14 | 84 | 黑崎一護 | 開外掛的死神 | Ichigo Kurosaki / 死神 (BLEACH) | search-backed：少年漫『三大』主角、官方人氣榜前二 |
| 15 | 82 | 夜神月 | 奇樂 | Light Yagami / 死亡筆記本 (Death Note) | search-backed：動漫史最具代表性反派主角之一 |
| 16 | 76 | 異形 | 殺戮之牙 | Xenomorph / 異形 (Alien) | cultural：影史經典怪物、全球辨識度高 |
| 17 | 75 | 拳四郎 | 北斗之鼠 | Kenshiro / 北斗神拳 (Fist of the North Star) | search-backed：少年漫黃金期指標、文化影響巨大 |
| 18 | 74 | 呂布奉先 | 亂世癿王者 | Lü Bu / 三國 (真三國無雙) | search-backed：三國第一猛將、無雙門面角色 |
| 19 | 73 | 貞子 | 七夜怪談 | Sadako / 七夜怪談 (Ringu) | cultural：全球恐怖片標誌角色 |
| 20 | 72 | 南野秀一 | 妖狐藏馬 | Kurama / 幽遊白書 (YuYu Hakusho) | search-backed：YYH 官方人氣榜第2 |
| 21 | 72 | 殺生丸 | 犬妖 | Sesshōmaru / 犬夜叉 (InuYasha) | search-backed：InuYasha 官方人氣榜第2 |
| 22 | 72 | 飛影 | 邪眼師 | Hiei / 幽遊白書 (YuYu Hakusho) | search-backed：YYH 官方人氣榜第1(兩屆奪冠) |
| 23 | 72 | 初號機 | 最終泛用人型決戰兵器 | EVA 初號機 / 新世紀福音戰士 (Evangelion) | cultural：EVA 全球指標作、初號機象徵性極高 |
| 24 | 71 | 黑化Saber | 英靈-亞瑟王 | Saber Alter / Fate/hollow ataraxia | cultural：Fate 高人氣黑化型態 |
| 25 | 70 | 魔人普烏 | 超級普烏 | Majin Buu / 七龍珠 (Dragon Ball) | cultural：DB 主要反派、全球高辨識度 |
| 26 | 68 | 傑 富力士 | 職業獵人 | Gon Freecss / 獵人 (Hunter×Hunter) | search-backed：HxH 人氣榜長期前三 |
| 27 | 66 | 煌 | 鋼彈 | Kira Yamato / 機動戰士鋼彈SEED | search-backed：SEED 角色人氣榜第2名 |
| 28 | 66 | 趙子龍 | 常勝將軍 | Zhao Yun / 真三國無雙 (Dynasty Warriors) | search-backed：無雙門面角色、常勝將軍高人氣 |
| 29 | 64 | Rider | 梅杜莎 | Rider (Medusa) / Fate/stay night | cultural：Fate 高人氣 Servant |
| 30 | 64 | 志志雄真實 | 幕末復仇狂者 | Makoto Shishio / 神劍闖江湖 (Rurouni Kenshin) | cultural：浪客劍心經典大反派 |
| 31 | 63 | 夏娜 | 火霧戰士 | Shana / 灼眼的夏娜 | search-backed：『傲嬌四天王』、輕小說標誌角色 |
| 32 | 62 | 桔梗 | 除魔巫女 | Kikyō / 犬夜叉 (InuYasha) | search-backed：官方人氣榜第4名 |
| 33 | 62 | 莉娜因巴斯 | 黑魔導士 | Lina Inverse / 秀逗魔導士 (Slayers) | search-backed：90年代最具代表性魔法少女之一 |
| 34 | 62 | 阿瞞大人 | 曹操孟德 | Cao Cao / 三國 (曹操) | cultural：三國最知名人物之一（註：此英雄技能為佔位、暫借皮卡丘） |
| 35 | 62 | 妙蛙花 | 種子神奇寶貝 | 妙蛙種子/妙蛙花 (Bulbasaur/Venusaur) / Pokémon 御三家 | cultural：寶可夢初代御三家、高辨識度 |
| 36 | 58 | 龍宮禮奈 | 蟬在叫人壞掉 | Rena Ryūgū / 寒蟬鳴泣之時 (Higurashi) | cultural：Higurashi 招牌角色、meme 常客 |
| 37 | 58 | 令狐沖 | 笑傲江湖 | Linghu Chong / 笑傲江湖 (金庸) | cultural：金庸名作主角、華語圈高知名度 |
| 38 | 56 | 勇者小呆 | 傳說的龍騎士 | Dai / 達伊大冒險 (DQ: Dai) | cultural：DQ 衍生名作、近年重製動畫拉抬 |
| 39 | 56 | Berserker | 海克力斯 | Heracles (Berserker) / Fate/stay night | cultural：Fate 標誌性狂戰士 |
| 40 | 56 | 十六夜Sakuya | 完全而瀟灑的女僕 | Sakuya Izayoi / 東方Project (Touhou) | cultural：東方 Project 人氣角色、同人圈龐大 |
| 41 | 54 | 麻倉葉 | 通靈人 | Yoh Asakura / 通靈童子 (Shaman King) | search-backed：2000年代代表性少年漫主角 |
| 42 | 54 | 菲特·泰斯塔羅沙 | 時空管理局執務官 | Fate Testarossa / 魔法少女奈葉 (Nanoha) | search-backed：Nanoha 系列頭號人氣角色 |
| 43 | 52 | 高町奈葉 | 魔砲少女 | Nanoha Takamachi / 魔法少女奈葉 | cultural：魔法少女 cult 名作主角 |
| 44 | 51 | 賈修貝爾 | 慈悲的王者 | Zatch/Gash Bell / 魔法少年賈修 | search-backed：Toonami 話題作、cult 人氣、將推出續作 |
| 45 | 50 | 涅吉。史普林。菲爾德 | 魔法老師 | Negi Springfield / 魔法老師 (Negima) | cultural：Negima 主角、2000年代後宮戰鬥漫 |
| 46 | 50 | 憤怒的胖虎 | 地獄歌神 | Gian (剛田武) / 哆啦A夢 | cultural：國民級作品配角、高辨識度 |
| 47 | 50 | 依文潔琳 | 黑暗福音 | Evangeline A.K. McDowell / 魔法老師 (Negima) | search-backed：Negima 頭號人氣角色 |
| 48 | 48 | 佐佐木小次郎 | 殺人劍客 | Sasaki Kojirō (史實/Fate 等再創作) | cultural：歷史名劍客、經 Fate/漫畫廣傳 |
| 49 | 48 | 傑洛士 | 獸神官 | Xellos / 秀逗魔導士 (Slayers) | search-backed：Slayers 高人氣反派 |
| 50 | 46 | 蒼月潮 | 獸矛傳承使 | Ushio Aotsuki / 潮與虎 (魔力小馬) | cultural：90年代經典少年漫、中等知名度 |
| 51 | 46 | 揍敵客桀諾 | 揍敵客大家長 | Zeno Zoldyck / 獵人 (HxH) | search-backed：HxH 高人氣配角(揍敵客家族) |
| 52 | 46 | 涅吉。史普林。菲爾德 | 白色之翼 | Negi Springfield / 魔法老師 (第二版英雄) | cultural：同 Negi、獨立英雄編號 |
| 53 | 44 | 瘋狂假面 | 變態正義 | Hentai Kamen / 變態假面 | cultural：cult 搞笑漫、真人電影 |
| 54 | 44 | 巴恩大魔王 | 魔界霸主 | Vearn / 達伊大冒險 (DQ: Dai) | cultural：DQ Dai 最終魔王 |
| 55 | 44 | 克勞薩先生 | 死亡老二 | Krauser II / 搖滾狂潮 (Detroit Metal City) | cultural：cult 搞笑漫、meme 人氣 |
| 56 | 44 | 櫻綻剎那 | 神鳴流劍士 | Setsuna Sakurazaki / 魔法老師 (Negima) | cultural：Negima 人氣配角 |
| 57 | 44 | 草泥馬 | 看似憂鬱的神獸 | 草泥馬 (Grass Mud Horse) 中國網路迷因 | cultural：知名中國網路迷因(草泥馬) |
| 58 | 40 | 棗 真夜 | 天上天下 | Maya Natsume / 天上天下 (Tenjho Tenge) | cultural：2000年代格鬥漫、知名度中低 |
| 59 | 40 | 安云 | 戰國刺客Azumi | Azumi / あずみ | cultural：知名劍戟漫、真人電影 |
| 60 | 40 | 牧太郎 | 被剝削的勞工階級 | 牧場物語主角 / Harvest Moon | cultural：知名模擬遊戲、主角無固定形象 |
| 61 | 40 | 鬼畜狂刀KYO | 鬼畜紅王 | Demon Eyes Kyo / SAMURAI DEEPER KYO | cultural：2000年代人氣劍戟漫 |
| 62 | 40 | 約翰走路 | 姜窩肯 | Johnnie Walker (品牌吉祥物) | cultural：全球知名威士忌 logo、非角色型粉絲群 |
| 63 | 40 | 基廉列克 | 黑手黨老大 | Kirenenko / 監獄兔 (Usavich) | cultural：病毒短動畫、迷因人氣 |
| 64 | 38 | 木乃香 | 治癒系公主 | Konoka Konoe / 魔法老師 (Negima) | cultural：Negima 配角 |
| 65 | 38 | 藤井八雲 | 不死之身-無 | Yakumo Fujii / 三隻眼 (3×3 Eyes) | cultural：90年代人氣漫、現知名度中低 |
| 66 | 34 | 天地志狼 | 龍之子 | Tenchi Shirō / 龍狼傳 (Ryūrōden) | cultural：三國穿越名作、東亞中等知名度 |
| 67 | 34 | 撒尿牛丸 | 食神 | 撒尿牛丸 / 食神 (周星馳電影) | cultural：港片經典梗、華語圈迷因 |
| 68 | 30 | 皮卡娘 | 傲嬌電氣老鼠 | 皮卡丘擬人 / SATO×PICA (同人) | niche：皮卡丘同人擬人衍生 |
| 69 | 28 | 風魔小次郎 | 猿飛佐助 | Fūma Kotarō / 風魔の小次郎 | cultural：車田正美作、知名度偏低 |
| 70 | 26 | 鬼王達 | 魔鬼筋肉人 | 鬼王達 / 破壞之王 (周星馳電影) | cultural：港片反派、華語圈迷因 |
| 71 | 26 | 斑剎 | 地獄來襲者 | 天堂 (Lineage) 相關角色 / MMO | niche：天堂線上遊戲圈、確切角色未定 |
| 72 | 24 | 臭作 | 電車癡漢 | Shūsaku / 臭作 (成人遊戲) | niche：日本成人遊戲、圈外極低 |
| 73 | 18 | 黑人牙膏 | 美白大法師 | 黑人牙膏 (Darlie 品牌迷因) | meme：品牌迷因、圈外低 |
| 74 | 14 | 熊貓 | 國寶級的畜生 | GGD 原創角色 (去死團) | original：社群原創 |
| 75 | 14 | 金居福 | 夜市人生 | 夜市人生 (台灣本土劇) | local：台灣八點檔、圈外低 |
| 76 | 12 | 騜 | 皇者 | 騜（馬英九『馬皇』政治諷刺迷因） | local：台灣政治諷刺迷因 |
| 77 | 10 | 飛鼠先生 | 至尊學長 | GGD 原創角色 (去死團) | original：社群原創、無外部知名度 |
| 78 | 10 | 白木卡迪那 | 白木老樹精 | GGD 原創角色 (去死團逆襲) | original：社群原創 |
| 79 | 10 | 死之王 | 邪惡意念集合體 | GGD 原創角色 (去死團逆襲) | original：社群原創 |
| 80 | 10 | 清蒸 飛鼠先生 | 最M的魔法Jizz | GGD 原創角色 (去死團) | original：社群原創 |
| 81 | 10 | 傳說中的大刀 | 會叫的野獸 | GGD 校園迷因原創 | original：校園迷因原創 |
| 82 | 8 | 鄭先生 | 豪洨天王 | 台大 PTT 迷因人物 (local meme) | local：台灣校園/PTT 迷因、圈外近乎零知名度 |
| 83 | 6 | 小派 | 學姊 | GGD 原創角色（『現實人生』） | original：社群原創、無外部知名度 |
---

## 附錄 A：排除的條目 (共 30 個)

### A-1. 測試 / 佔位 / 原生單位 (7 個)

| 檔案 id | 名稱 | 排除原因 |
|---|---|---|
| `sela` | Sela, the Ember Sage | 英文範本佔位英雄；無中文名、無劇情、無技能 |
| `thorne` | Thorne, the Bramble Knight | 英文範本佔位英雄；同上 |
| `godie-u01q` | 測試英雄 - 索隆 | 名稱直接含『測試』，內容空白 |
| `godie-h02n` | 腦包英雄 - 打我阿笨蛋 | 劇情空白、無英雄編號，佔位玩笑條目 |
| `godie-u01f` | 萬夫莫敵 - 黑化張飛 | 劇情空白、無英雄編號，未完成替身 |
| `godie-h02s` | 死亡騎士 | WarCraft 原生死騎單位、無稱號、通用敘述；與 `h02z` 內容完全相同、共用編號 #91 |
| `godie-h02z` | 不良少年 | 與 `h02s` 完全相同的 WC3 死騎換皮、共用編號 #91 |

> 註：`codexData.ts` 的 `splitChampionName` 也把 `sela`、`thorne`、`死亡騎士`、`不良少年` 標為不符 `稱號 - 全名` 慣例的四個特例，佐證其佔位性質。

### A-2. 重複換皮 (duplicate stand-ins，23 個)

同一英雄編號、同一角色（或直接沿用他人劇情/技能的換皮）；各保留一個代表，其餘剔除。

| 編號 | 角色 | 保留 | 剔除 |
|---|---|---|---|
| #22 | 龍宮禮奈 | `e001` | `godie-e00n` |
| #20 | Saber/亞瑟王 | `e002` | `godie-e00l` |
| #12 | 天地志狼 | `e007` | `godie-ewar` |
| #19 | 安云 (Azumi) | `e00k` | `godie-e00z` |
| #77 | 櫻綻剎那 | `e00w` | `godie-e00x` |
| #79 | 黑崎一護 | `h01n` | `godie-h01o` |
| #90 | 妙蛙 (種子/花) | `h02r` | `godie-hgam`（同編號、同寶可夢演化線） |
| #92 | 草泥馬 | `h02u` | `godie-h02v` |
| #04 | 莉娜因巴斯 | `h020` | `godie-hjai` |
| #42 | 依文潔琳 | `n003` | `godie-n01g` |
| #08 | 勇者小呆 | `n01c` | `godie-nbbc` |
| #18 | 南野秀一/藏馬 | `n00p` | `godie-nsjs` |
| #58 | 皮卡丘 | `ofar` | `godie-o02l`（劇情空白） |
| #09 | 悟空 | `o00x` | `godie-ogrh` |
| #81 | 高町奈葉 | `o01z` | `godie-o02v` |
| #53 | 傑洛士 (Xellos) | `o00l` | `godie-o02s`（名為『涼宮八ㄦ匕』，但敘述/技能與傑洛士**完全相同**的換皮） |
| #11 | 索隆 | `u01u` | `godie-udre` |
| #25 | 拳四郎 | `u00l` | `godie-umal` |
| #38 | 飛影 | `u010` | `godie-uvng` |
| #06 | 傑 富力士 (Gon) | `u034` | `godie-ucrl` |
| #61 | 克勞薩 | `u011` | `godie-u012`（克勞薩II世，同 DMC 角色） |
| #76 | 魯夫 | `u00n` | `godie-u00o` |
| #05 | 賈修 (Zatch) | `hblm` | `godie-h021`（名為『阿強一號』，但技能為賈修咒語『薩喀爾/巴歐薩喀爾嘎』的換皮） |

## 附錄 B：辨識信心與備註

- **無「完全無法辨識」的角色**：83 位排名英雄全部都能對應到來源作品/角色。唯一**低信心**項為 **斑剎 (#41)**：確認來源為線上遊戲《天堂》(Lineage)，但無法確定確切角色（疑為召喚系角色/怪物），其指數為估計值。
- **同角色的多個英雄編號**（皆保留、非重複）：涅吉 #15（`emfr`）與 涅吉·白色之翼 #82（`h022`）為同一角色的兩個獨立英雄；皮卡丘 #58（`ofar`，正牌）與 皮卡娘 #86（`o00k`，同人擬人 SATO×PICA）亦為不同編號的獨立英雄。飛鼠先生亦有 #65 與 #75 兩個原創英雄。
- **阿瞞大人 (#87, 曹操)**：角色本身知名度高，但該英雄檔案劇情空白、技能暫借皮卡丘，屬**未完成內容**；指數依角色本身知名度給分並加註，策展時宜注意其 kit 仍為佔位。
- **在地/原創天然偏低**：飛鼠先生、白木卡迪那、死之王、熊貓、傳說中的大刀、小派、鄭先生（PTT）、黑人牙膏、金居福（本土劇）、騜（政治迷因）、撒尿牛丸/鬼王達（周星馳港片）等，屬《去死去死團》社群原創或台/港在地迷因，並非改編自主流 IP，故在「真實世界人氣」量表上天然偏低——此為預期結果，非辨識失敗。

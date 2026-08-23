# 英雄名冊 / Champion roster

> ⚠️ **本檔案由程式產生，請勿手動編輯。**
> 重新產生：`pnpm docs:reference`（或 `python3 tools/reference/gen_reference.py`）
> 產生自 contentVersion **`cv_7e68c9c193b7`**（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）
> 資料列：**71**　·　開放名單來源：`data/curation/whitelist.json`（updatedAt `2026-08-20T16:58:56.072938Z`）

`content/champions/*.json` 共 **71** 名英雄，其中 **49** 名在開放名單（OPEN roster）內。開放名單是營運策展狀態，不是程式常數：真相是 `data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` 提供，由 game-server 在建房時執行。

> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。
>
> **每名英雄有六個 slot：天生技（PASSIVE）＋ Q／W／E／R／EX。** 天生技是 w3x 的 `NN-00`，**等級 1 就擁有**，doc 是 `champion.passiveAbility` 指到的 `<id>.passive`（`exAbility` 的同款寫法）。68 名有天生技；3 名沒有 `passiveAbility` —— `godie-ogld`（有 `72-01..04` 與 `72-002`，但地圖裡不存在 `72-00`）、`sela`（非 w3x 原創英雄，沒有 `NN` 編號）、`thorne`（非 w3x 原創英雄，沒有 `NN` 編號） —— **那是還原出來的事實，不是待辦**。
>
> `稱號` / `全名` 是從 `name` 欄位拆出來的（慣例 `稱號 - 全名`），champion doc 上**沒有**獨立的稱號欄位；不符慣例的會顯示 `—`。
>
> `名言` 不在 champion doc 裡 —— 它在 `docs/champions.csv` 與 `content/assets/audio/voices/quotes/quotes.json`。

---

## 1. 開放名單 OPEN roster（49）

| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（天生 Q W E R EX） |
|---|---|---|---|---|---|---|---|
| `godie-e001` | 龍宮禮奈 | 蟬在叫人壞掉 | fighter | 近戰 | ✅ | 來自雛見澤的小女孩，喜歡把"好可愛"的東西帶回家。 | `godie-e001.passive` `godie-e001.q` `godie-e001.w` `godie-e001.e` `godie-e001.r` `godie-e001.ex` |
| `godie-e002` | Saber | 亞瑟王 | fighter | 近戰 | ✅ | 在偶然的情況下與衛宮士郎定下契約的 、外觀嬌小的女性SERVANT，就是被認為能力最高的聖… | `godie-e002.passive` `godie-e002.q` `godie-e002.w` `godie-e002.e` `godie-e002.r` `godie-e002.ex` |
| `godie-e008` | 夏娜 | 火霧戰士 | fighter | 近戰 | ✅ | 身分為火霧戰士，為了存在感稀薄的人而戰。 | `godie-e008.passive` `godie-e008.q` `godie-e008.w` `godie-e008.e` `godie-e008.r` `godie-e008.ex` |
| `godie-e00r` | 初號機 | 最終泛用人型決戰兵器 | fighter | 近戰 | ✅ | 『汎用人型決戰兵器』EVANGELION初號機，採用半生物機械的製造，因此雖然能力強大,但… | `godie-e00r.passive` `godie-e00r.q` `godie-e00r.w` `godie-e00r.e` `godie-e00r.r` `godie-e00r.ex` |
| `godie-e00s` | 白木卡迪那 | 白木老樹精 | marksman | 遠程 | ✅ | 白木家族是捍衛世界樹種族之一，與黃金龍族不同的是，通常處於被動守護狀態而不像黃金龍族常巡邏… | `godie-e00s.passive` `godie-e00s.q` `godie-e00s.w` `godie-e00s.e` `godie-e00s.r` `godie-e00s.ex` |
| `godie-e00w` | 櫻綻剎那 | 神鳴流劍士 | fighter | 近戰 | ✅ | 武道四天王之一，是在京都流傳已久的神鳴流劍術高手，也是個精通陰陽道的劍士。烏鴉族混血兒，由… | `godie-e00w.passive` `godie-e00w.q` `godie-e00w.w` `godie-e00w.e` `godie-e00w.r` `godie-e00w.ex` |
| `godie-edem` | 宇智波佐助 | 寫輪眼復仇者 | fighter | 近戰 | ✅ | 在忍者學校以第一名的成績畢業，是有名的"宇智波一族"的後代。復仇信念堅定，一心想殺了哥哥宇… | `godie-edem.passive` `godie-edem.q` `godie-edem.w` `godie-edem.e` `godie-edem.r` `godie-edem.ex` |
| `godie-efur` | 揍敵客桀諾 | 揍敵客大家長 | marksman | 近戰 | ✅ | 來自殺手世家揍敵客家族，其才能在揍敵客家族歷史也是非常優秀。擁有超強的念能力，可以任意操縱… | `godie-efur.passive` `godie-efur.q` `godie-efur.w` `godie-efur.e` `godie-efur.r` `godie-efur.ex` |
| `godie-emfr` | 涅吉。史普林。菲爾德 | 魔法老師 | marksman | 遠程 | ✅ | 英國某間魔法學校修行的首席畢業生涅吉，目前還只是個10歲的少年。他的目標是成為「出色的魔法… | `godie-emfr.passive` `godie-emfr.q` `godie-emfr.w` `godie-emfr.e` `godie-emfr.r` `godie-emfr.ex` |
| `godie-emns` | 夜神月 | 奇樂 | marksman | 遠程 | ✅ | 英俊瀟灑，謹慎且機智，雖然極有女人緣但對異性不感興趣。高中三年級時在學校撿到了死神路克遺留… | `godie-emns.passive` `godie-emns.q` `godie-emns.w` `godie-emns.e` `godie-emns.r` `godie-emns.ex` |
| `godie-etyr` | 木乃香 | 治癒系公主 | marksman | 遠程 | ✅ | 父母家在京都的關西咒術協會，父親近衛詠春是關西咒術協會會長，祖父是關東魔法協會會長與麻帆良… | `godie-etyr.passive` `godie-etyr.q` `godie-etyr.w` `godie-etyr.e` `godie-etyr.r` `godie-etyr.ex` |
| `godie-ewar` | 天地志狼 | 龍之子 | fighter | 近戰 | ✅ | 本是平凡的國中二年級學生，因為母親項鍊的神奇力量來到三國時代，而被當做龍之子，跟仙人學習仙… | `godie-ewar.passive` `godie-ewar.q` `godie-ewar.w` `godie-ewar.e` `godie-ewar.r` `godie-ewar.ex` |
| `godie-h00l` | 林克 | 時空勇者 | fighter | 近戰 | ✅ | 原本在森林中被當成『永遠不會長大的科奇利族人』般的生活著，直到某天因葛諾多夫的陰謀而知道自… | `godie-h00l.passive` `godie-h00l.q` `godie-h00l.w` `godie-h00l.e` `godie-h00l.r` `godie-h00l.ex` |
| `godie-h01n` | 黑崎一護 | 開外掛的死神 | fighter | 近戰 | ✅ | 黑崎一護除了能夠看見靈之外，是個很普通的高中生，但是有一天，出現了一個叫做〔虛〕的惡靈找上… | `godie-h01n.passive` `godie-h01n.q` `godie-h01n.w` `godie-h01n.e` `godie-h01n.r` `godie-h01n.ex` |
| `godie-h01u` | 呂布奉先 | 亂世癿王者 | fighter | 近戰 | ✅ | 呂布（公元151年—公元198年），字奉先，五原（今內蒙古包頭市）人。三國時代的著名武將。… | `godie-h01u.passive` `godie-h01u.q` `godie-h01u.w` `godie-h01u.e` `godie-h01u.r` `godie-h01u.ex` |
| `godie-h02k` | 熊貓 | 國寶級的畜生 | fighter | 近戰 | ✅ | 來自四川的熊貓，經歷過四川的地震以後，流落到馬戲團賣藝，雖然自稱賣藝不賣身，但是為了生活還… | `godie-h02k.passive` `godie-h02k.q` `godie-h02k.w` `godie-h02k.e` `godie-h02k.r` `godie-h02k.ex` |
| `godie-h02v` | 草泥馬 | 看似憂鬱的神獸 | fighter | 近戰 | ✅ | 草泥馬是中國網民惡搞的十大神獸之一，被《紐約時報》等媒體認為是中國網民對於中國大陸網路審查… | `godie-h02v.passive` `godie-h02v.q` `godie-h02v.w` `godie-h02v.e` `godie-h02v.r` `godie-h02v.ex` |
| `godie-hapm` | Berserker | 海克力斯 | fighter | 近戰 | ✅ | Berserker是希臘神話中著名的英雄海格力斯(Hercules) ，血統為半神半人，力… | `godie-hapm.passive` `godie-hapm.q` `godie-hapm.w` `godie-hapm.e` `godie-hapm.r` `godie-hapm.ex` |
| `godie-hart` | 克勞德 | 最終幻想 | fighter | 近戰 | ✅ | Cloud的名字暗示著他神祕，不清楚的過去以及他那不可預知的將來，為了過去奮戰們的朋友，使… | `godie-hart.passive` `godie-hart.q` `godie-hart.w` `godie-hart.e` `godie-hart.r` `godie-hart.ex` |
| `godie-hgam` | 妙蛙種子 | 種子神奇寶貝 | fighter | 近戰 | ✅ | 一出生背上就負著不可思議的種子。背上的種子裡面，擁有大量的營養 ，種子會跟著身體一起長大。 | `godie-hgam.passive` `godie-hgam.q` `godie-hgam.w` `godie-hgam.e` `godie-hgam.r` `godie-hgam.ex` |
| `godie-hjai` | 莉娜因巴斯 | 黑魔導士 | marksman | 遠程 | ✅ | 自稱天才美少女魔導士的莉娜，加入愛與和平純粹只是為了可以獲得賞金，正如同她的綽號"盜賊殺手… | `godie-hjai.passive` `godie-hjai.q` `godie-hjai.w` `godie-hjai.e` `godie-hjai.r` `godie-hjai.ex` |
| `godie-hpb1` | 蒼月潮 | 獸矛傳承使 | fighter | 近戰 | ✅ | 無意間破除光霸明宗所設的密室結界， 並意外成為獸矛這一世的傳承者。充滿熱血正義感的蒼月潮為… | `godie-hpb1.passive` `godie-hpb1.q` `godie-hpb1.w` `godie-hpb1.e` `godie-hpb1.r` `godie-hpb1.ex` |
| `godie-huth` | 魔人普烏 | 超級普烏 | fighter | 近戰 | ✅ | 看似貪玩可愛，骨子裡卻充滿邪惡的魔人普烏。擁有強大的分身再生能力，摧毀敵人也只不過是他的娛… | `godie-huth.passive` `godie-huth.q` `godie-huth.w` `godie-huth.e` `godie-huth.r` `godie-huth.ex` |
| `godie-hvsh` | Rider | 梅杜莎 | fighter | 近戰 | ✅ | 高爾根為蛇髮女怪，她們是海神Phorcys和ceto所生的三女妖：大姐司提娜(Stheno… | `godie-hvsh.passive` `godie-hvsh.q` `godie-hvsh.w` `godie-hvsh.e` `godie-hvsh.r` `godie-hvsh.ex` |
| `godie-hvwd` | 桔梗 | 除魔巫女 | marksman | 遠程 | ✅ | 原本是四魂之玉的守護巫女，為了守護世界的和平，只好再度轉生修練來對抗去死團的怨念。 | `godie-hvwd.passive` `godie-hvwd.q` `godie-hvwd.w` `godie-hvwd.e` `godie-hvwd.r` `godie-hvwd.ex` |
| `godie-n003` | 依文潔琳 | 黑暗福音 | marksman | 遠程 | ✅ | 吸血鬼的真祖〔以怪物來說是最強的等級而且是吸血鬼中屬於最高階的人物﹞，在15年以前是被稱為… | `godie-n003.passive` `godie-n003.q` `godie-n003.w` `godie-n003.e` `godie-n003.r` `godie-n003.ex` |
| `godie-n00b` | 哆拉A夢 | 小叮噹 | fighter | 近戰 | ✅ | 從21世紀來的機械貓，因為感受到體內KUSO魂呼喚，所以決定在去死團大闖天下。 | `godie-n00b.passive` `godie-n00b.q` `godie-n00b.w` `godie-n00b.e` `godie-n00b.r` `godie-n00b.ex` |
| `godie-nbbc` | 勇者小呆 | 傳說的龍騎士 | fighter | 近戰 | ✅ | 傳說中打敗魔王的勇者，為神魔人混血創造的龍騎士，為了維護世界和平，再度使用高超的阿邦快速劍… | `godie-nbbc.passive` `godie-nbbc.q` `godie-nbbc.w` `godie-nbbc.e` `godie-nbbc.r` `godie-nbbc.ex` |
| `godie-nsjs` | 南野秀一 | 妖狐藏馬 | marksman | 近戰 | ✅ | 魔界高級妖魔轉生寄宿為人類，為控制魔界植物的支配者。 | `godie-nsjs.passive` `godie-nsjs.q` `godie-nsjs.w` `godie-nsjs.e` `godie-nsjs.r` `godie-nsjs.ex` |
| `godie-o00k` | 皮卡娘 | 傲嬌電氣老鼠 | marksman | 遠程 | ✅ | 相當傲嬌的皮卡丘，從小就展現出超出一般水準的戰鬥能力，是個斗S，喜歡身為M的主人小智，。 | `godie-o00k.passive` `godie-o00k.q` `godie-o00k.w` `godie-o00k.e` `godie-o00k.r` `godie-o00k.ex` |
| `godie-o00l` | 傑洛士 | 獸神官 | marksman | 遠程 | ✅ | 隸屬於獸王底下的神官，是非常高等的魔族，擁有強大的魔法破壞力，不過通常隱身在幕後扮演調查和… | `godie-o00l.passive` `godie-o00l.q` `godie-o00l.w` `godie-o00l.e` `godie-o00l.r` `godie-o00l.ex` |
| `godie-o02p` | 初音 | 夢幻之星 | fighter | 近戰 | ✅ | 人類史上第一個紅遍全球的虛擬歌姬，儘管到了今日仍在發光發熱，甚至有專屬初音的感謝祭演場會。 | `godie-o02p.passive` `godie-o02p.q` `godie-o02p.w` `godie-o02p.e` `godie-o02p.r` `godie-o02p.ex` |
| `godie-ofar` | 皮卡丘 | 神奇寶貝兒 | marksman | 遠程 | ✅ | 自從皮卡丘成為國際巨星後，開始也擺起架勢把小智當傭人使喚，直到有一天在森林裡吃蘋果的時候，… | `godie-ofar.passive` `godie-ofar.q` `godie-ofar.w` `godie-ofar.e` `godie-ofar.r` `godie-ofar.ex` |
| `godie-ogld` | 黑人牙膏 | 美白大法師 | marksman | 遠程 | ✅ | 曾是魔法界首屈一指美白專家，個性善良；但在一次魔法決鬥中敗給飛鼠先生。自認為輸給飛鼠是因為… | `godie-ogld.q` `godie-ogld.w` `godie-ogld.e` `godie-ogld.r` `godie-ogld.ex` |
| `godie-ogrh` | 悟空 | 賽亞人 | fighter | 近戰 | ✅ | 七龍珠中不死的傳奇英雄，每當世界有難的時候總會亂入(!?)。 | `godie-ogrh.passive` `godie-ogrh.q` `godie-ogrh.w` `godie-ogrh.e` `godie-ogrh.r` `godie-ogrh.ex` |
| `godie-orkn` | 臭作 | 電車癡漢 | marksman | 遠程 | ✅ | 傳說中的變態色魔老頭，身懷眾多變態絕技，是去死團裡強大的怨念支柱，興趣是偷窺以及(嗶...… | `godie-orkn.passive` `godie-orkn.q` `godie-orkn.w` `godie-orkn.e` `godie-orkn.r` `godie-orkn.ex` |
| `godie-osam` | 殺生丸 | 犬妖 | fighter | 近戰 | ✅ | 犬夜叉同父異母的哥哥。他是完全的妖怪，能力要強得多，性格非常冷酷殘忍，對付自己的弟弟也是手… | `godie-osam.passive` `godie-osam.q` `godie-osam.w` `godie-osam.e` `godie-osam.r` `godie-osam.ex` |
| `godie-u00h` | 鬼畜狂刀KYO | 鬼畜紅王 | fighter | 近戰 | ✅ | 關原之戰後四年千人斬傳說復活！ | `godie-u00h.passive` `godie-u00h.q` `godie-u00h.w` `godie-u00h.e` `godie-u00h.r` `godie-u00h.ex` |
| `godie-u00j` | 賽菲洛斯 | 神性的流失 | fighter | 近戰 | ✅ | 賽菲洛斯是路克麗西亞和寶條博士的兒子。在胎兒時期被親生父親植入傑諾娃細胞，造成年輕的他成了… | `godie-u00j.passive` `godie-u00j.q` `godie-u00j.w` `godie-u00j.e` `godie-u00j.r` `godie-u00j.ex` |
| `godie-u00k` | 死之王 | 邪惡意念集合體 | marksman | 遠程 | ✅ | 所有邪惡的聚合體，從上古時代就誕生的惡魔，與飛鼠先生一戰後魂飛魄散，在此次戰役中被召喚回來。 | `godie-u00k.passive` `godie-u00k.q` `godie-u00k.w` `godie-u00k.e` `godie-u00k.r` `godie-u00k.ex` |
| `godie-u00n` | 蒙其.D.魯夫 | 草帽小子 | fighter | 近戰 | ✅ | 魯夫小時候崇拜海賊「紅髮傑克」而夢想將來做個海賊，某一天，魯夫因為誤食惡魔果實成了橡膠人，… | `godie-u00n.passive` `godie-u00n.q` `godie-u00n.w` `godie-u00n.e` `godie-u00n.r` `godie-u00n.ex` |
| `godie-u00v` | 基廉列克 | 黑手黨老大 | fighter | 近戰 | ✅ | 前黑手黨老大，被手下背叛炸爛後接合回去所以身上有須多接痕及顏色，平常安靜，必要時非常的暴躁… | `godie-u00v.passive` `godie-u00v.q` `godie-u00v.w` `godie-u00v.e` `godie-u00v.r` `godie-u00v.ex` |
| `godie-ubal` | 巴恩大魔王 | 魔界霸主 | fighter | 近戰 | ✅ | 巴恩為了永恆年輕的肉體，將自己精神轉移到老頭子身上，並將年輕肉體封印起來，只在重要戰役才有… | `godie-ubal.passive` `godie-ubal.q` `godie-ubal.w` `godie-ubal.e` `godie-ubal.r` `godie-ubal.ex` |
| `godie-ucrl` | 傑 富力士 | 職業獵人 | fighter | 近戰 | ✅ | 出身於鯨魚島，從小就在大自然中成長，鍛鍊出他一身恐怖的能力。在尋找父親的旅程中，莫名其妙捲… | `godie-ucrl.passive` `godie-ucrl.q` `godie-ucrl.w` `godie-ucrl.e` `godie-ucrl.r` `godie-ucrl.ex` |
| `godie-udea` | 飛鼠先生 | 至尊學長 | fighter | 近戰 | ✅ | 神秘的英雄，擅長以各種KUSO手法襲擊對手並加以推倒。 | `godie-udea.passive` `godie-udea.q` `godie-udea.w` `godie-udea.e` `godie-udea.r` `godie-udea.ex` |
| `godie-udre` | 索隆 | 三刀流劍士 | fighter | 近戰 | ✅ | 夢想成為世界第一的大劍客，使用自創的三刀流劍術擊遍天下劍客。為了在戰鬥中追尋武藝的卓越加入… | `godie-udre.passive` `godie-udre.q` `godie-udre.w` `godie-udre.e` `godie-udre.r` `godie-udre.ex` |
| `godie-umal` | 拳四郎 | 北斗神拳掌門人 | fighter | 近戰 | ✅ | 北斗神拳的唯一傳人，使用難以置信的秘穴(!?)拳法致敵人於死地。由於北斗星是不祥之星，與拳… | `godie-umal.passive` `godie-umal.q` `godie-umal.w` `godie-umal.e` `godie-umal.r` `godie-umal.ex` |
| `godie-uvng` | 飛影 | 邪眼師 | fighter | 近戰 | ✅ | 在魔界中有名的盜賊妖怪，除了是一位邪王炎殺拳的高手之外，也是一位用劍的高手。為了尋找妹妹雪… | `godie-uvng.passive` `godie-uvng.q` `godie-uvng.w` `godie-uvng.e` `godie-uvng.r` `godie-uvng.ex` |
| `godie-zombiex` | 喪標麥可 | 聖杯黑泥醬 | tank | 近戰 | ✅ | 黑化聖杯溢出的惡意黑泥受肉凝聚，本來在美國重生，但不小心被印度工程師當成咖喱帶回家鄉，成了… | `godie-zombiex.passive` `godie-zombiex.q` `godie-zombiex.w` `godie-zombiex.e` `godie-zombiex.r` `godie-zombiex.ex` |

## 2. 未開放 not in the open roster（22）

文件存在、資料完整，但白名單沒放行，所以選角畫面看不到、bot 也不會抽到。

| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（天生 Q W E R EX） |
|---|---|---|---|---|---|---|---|
| `godie-e007` | 天地志狼 | 龍之子 | marksman | 遠程 | — | 本是平凡的國中二年級學生，因為母親項鍊的神奇力量來到三國時代，而被當做龍之子，跟仙人學習仙… | `godie-e007.passive` `godie-e007.q` `godie-e007.w` `godie-e007.e` `godie-e007.r` `godie-e007.ex` |
| `godie-e00l` | Saber | 亞瑟王 | fighter | 近戰 | — | — | `godie-e00l.passive` `godie-e00l.q` `godie-e00l.w` `godie-e00l.e` `godie-e00l.r` `godie-e00l.ex` |
| `godie-e00n` | 龍宮禮奈 | 蟬在叫人壞掉 | fighter | 近戰 | — | — | `godie-e00n.passive` `godie-e00n.q` `godie-e00n.w` `godie-e00n.e` `godie-e00n.r` `godie-e00n.ex` |
| `godie-e00x` | 櫻綻剎那 | 神鳴流劍士 | fighter | 近戰 | — | 武道四天王之一，是在京都流傳已久的神鳴流劍術高手，也是個精通陰陽道的劍士。烏鴉族混血兒，由… | `godie-e00x.passive` `godie-e00x.q` `godie-e00x.w` `godie-e00x.e` `godie-e00x.r` `godie-e00x.ex` |
| `godie-e010` | 白木卡迪那 | 白木老樹精 | marksman | 遠程 | — | — | `godie-e010.passive` `godie-e010.q` `godie-e010.w` `godie-e010.e` `godie-e010.r` |
| `godie-h01o` | 黑崎一護 | 外掛開很大的死神 | fighter | 近戰 | — | — | `godie-h01o.passive` `godie-h01o.q` `godie-h01o.w` `godie-h01o.e` `godie-h01o.r` `godie-h01o.ex` |
| `godie-h020` | 莉娜因巴斯 | 黑魔導士 | marksman | 遠程 | — | 自稱天才美少女魔導士的莉娜，加入愛與和平純粹只是為了可以獲得賞金，正如同她的綽號"盜賊殺手… | `godie-h020.passive` `godie-h020.q` `godie-h020.w` `godie-h020.e` `godie-h020.r` `godie-h020.ex` |
| `godie-h02r` | 妙蛙花 | 種子神奇寶貝 | fighter | 近戰 | — | — | `godie-h02r.passive` `godie-h02r.q` `godie-h02r.w` `godie-h02r.e` `godie-h02r.r` `godie-h02r.ex` |
| `godie-h02u` | 草泥馬 | 看似憂鬱的神獸 | fighter | 近戰 | — | 草泥馬是中國網民惡搞的十大神獸之一，被《紐約時報》等媒體認為是中國網民對於中國大陸網路審查… | `godie-h02u.passive` `godie-h02u.q` `godie-h02u.w` `godie-h02u.e` `godie-h02u.r` `godie-h02u.ex` |
| `godie-n00p` | 南野秀一 | 妖狐藏馬 | marksman | 遠程 | — | 魔界高級妖魔轉生寄宿為人類，為控制魔界植物的支配者。 | `godie-n00p.passive` `godie-n00p.q` `godie-n00p.w` `godie-n00p.e` `godie-n00p.r` `godie-n00p.ex` |
| `godie-n01c` | 勇者小呆 | 傳說的龍騎士 | fighter | 近戰 | — | 傳說中打敗魔王的勇者，為神魔人混血創造的龍騎士，為了維護世界和平，再度使用高超的阿邦快速劍… | `godie-n01c.passive` `godie-n01c.q` `godie-n01c.w` `godie-n01c.e` `godie-n01c.r` `godie-n01c.ex` |
| `godie-n01g` | 依文潔琳 | 黑暗福音 | marksman | 遠程 | — | 吸血鬼的真祖〔以怪物來說是最強的等級而且是吸血鬼中屬於最高階的人物﹞，在15年以前是被稱為… | `godie-n01g.passive` `godie-n01g.q` `godie-n01g.w` `godie-n01g.e` `godie-n01g.r` `godie-n01g.ex` |
| `godie-o00x` | 悟空 | 超級賽亞人 | fighter | 近戰 | — | 七龍珠中不死的傳奇英雄，每當世界有難的時候總會亂入(!?)。 | `godie-o00x.passive` `godie-o00x.q` `godie-o00x.w` `godie-o00x.e` `godie-o00x.r` `godie-o00x.ex` |
| `godie-o02l` | 皮卡丘 | 神騎寶貝 | fighter | 近戰 | — | — | `godie-o02l.passive` `godie-o02l.q` `godie-o02l.w` `godie-o02l.e` `godie-o02l.r` `godie-o02l.ex` |
| `godie-o030` | 臭作 | 電車癡漢 | marksman | 遠程 | — | 傳說中的變態色魔老頭，身懷眾多變態絕技，是去死團裡強大的怨念支柱，興趣是偷窺以及(嗶...… | `godie-o030.passive` `godie-o030.q` `godie-o030.w` `godie-o030.e` `godie-o030.r` `godie-o030.ex` |
| `godie-u00l` | 拳四郎 | 北斗之鼠 | fighter | 近戰 | — | 北斗神拳的唯一傳人，使用難以置信的秘穴(!?)拳法致敵人於死地。由於北斗星是不祥之星，與拳… | `godie-u00l.passive` `godie-u00l.q` `godie-u00l.w` `godie-u00l.e` `godie-u00l.r` `godie-u00l.ex` |
| `godie-u00o` | 蒙其.D.魯夫 | 草帽小子 | fighter | 近戰 | — | 魯夫小時候崇拜海賊「紅髮傑克」而夢想將來做個海賊，某一天，魯夫因為誤食惡魔果實成了橡膠人，… | `godie-u00o.passive` `godie-u00o.q` `godie-u00o.w` `godie-u00o.e` `godie-u00o.r` `godie-u00o.ex` |
| `godie-u010` | 飛影 | 邪眼師 | fighter | 近戰 | — | 在魔界中有名的盜賊妖怪，除了是一位邪王炎殺拳的高手之外，也是一位用劍的高手。為了尋找妹妹雪… | `godie-u010.passive` `godie-u010.q` `godie-u010.w` `godie-u010.e` `godie-u010.r` `godie-u010.ex` |
| `godie-u01u` | 索隆 | 三刀流劍士 | fighter | 近戰 | — | 夢想成為世界第一的大劍客，使用自創的三刀流劍術擊遍天下劍客。為了在戰鬥中追尋武藝的卓越加入… | `godie-u01u.passive` `godie-u01u.q` `godie-u01u.w` `godie-u01u.e` `godie-u01u.r` `godie-u01u.ex` |
| `godie-u034` | 傑 富力士 | 職業獵人 | fighter | 近戰 | — | 出身於鯨魚島，從小就在大自然中成長，鍛鍊出他一身恐怖的能力。在尋找父親的旅程中，莫名其妙捲… | `godie-u034.passive` `godie-u034.q` `godie-u034.w` `godie-u034.e` `godie-u034.r` `godie-u034.ex` |
| `sela` | Sela, the Ember Sage | — | mage | 遠程 | — | — | `sela.q` `sela.w` `sela.e` `sela.r` |
| `thorne` | Thorne, the Bramble Knight | — | bruiser | 近戰 | — | — | `thorne.q` `thorne.w` `thorne.e` `thorne.r` |


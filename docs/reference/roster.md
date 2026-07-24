# 英雄名冊 / Champion roster

> ⚠️ **本檔案由程式產生，請勿手動編輯。**
> 重新產生：`pnpm docs:reference`（或 `python3 tools/reference/gen_reference.py`）
> 產生自 contentVersion **`cv_1c68c834dac0`**（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）
> 資料列：**113**　·　開放名單來源：`data/curation/whitelist.json`（updatedAt `2026-07-22T15:49:20.043229Z`）

`content/champions/*.json` 共 **113** 名英雄，其中 **48** 名在開放名單（OPEN roster）內。開放名單是營運策展狀態，不是程式常數：真相是 `data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` 提供，由 game-server 在建房時執行。

> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。
>
> **每名英雄有六個 slot：天生技（PASSIVE）＋ Q／W／E／R／EX。** 天生技是 w3x 的 `NN-00`，**等級 1 就擁有**，doc 是 `champion.passiveAbility` 指到的 `<id>.passive`（`exAbility` 的同款寫法）。108 名有天生技；5 名沒有 `passiveAbility` —— `godie-h02n`（原始地圖裡完全沒有技能）、`godie-ogld`（有 `72-01..04` 與 `72-002`，但地圖裡不存在 `72-00`）、`godie-u01q`（原始地圖裡完全沒有技能）、`sela`（非 w3x 原創英雄，沒有 `NN` 編號）、`thorne`（非 w3x 原創英雄，沒有 `NN` 編號） —— **那是還原出來的事實，不是待辦**。
>
> `稱號` / `全名` 是從 `name` 欄位拆出來的（慣例 `稱號 - 全名`），champion doc 上**沒有**獨立的稱號欄位；不符慣例的會顯示 `—`。
>
> `名言` 不在 champion doc 裡 —— 它在 `docs/champions.csv` 與 `content/assets/audio/voices/quotes/quotes.json`。

---

## 1. 開放名單 OPEN roster（48）

| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（天生 Q W E R EX） |
|---|---|---|---|---|---|---|---|
| `godie-e001` | 龍宮禮奈 | 蟬在叫人壞掉 | fighter | 近戰 | ✅ | 來自雛見澤的小女孩，喜歡把"好可愛"的東西帶回家。 | `godie-e001.passive` `godie-e001.q` `godie-e001.w` `godie-e001.e` `godie-e001.r` `godie-e001.ex` |
| `godie-e002` | Saber | 亞瑟王 | fighter | 近戰 | ✅ | 在偶然的情況下與衛宮士郎定下契約的 、外觀嬌小的女性SERVANT，就是被認為能力最高的聖… | `godie-e002.passive` `godie-e002.q` `godie-e002.w` `godie-e002.e` `godie-e002.r` `godie-e002.ex` |
| `godie-e007` | 天地志狼 | 龍之子 | marksman | 遠程 | ✅ | 本是平凡的國中二年級學生，因為母親項鍊的神奇力量來到三國時代，而被當做龍之子，跟仙人學習仙… | `godie-e007.passive` `godie-e007.q` `godie-e007.w` `godie-e007.e` `godie-e007.r` `godie-e007.ex` |
| `godie-e008` | 夏娜 | 火霧戰士 | fighter | 近戰 | ✅ | 身分為火霧戰士，為了存在感稀薄的人而戰。 | `godie-e008.passive` `godie-e008.q` `godie-e008.w` `godie-e008.e` `godie-e008.r` `godie-e008.ex` |
| `godie-e00k` | 安云 | 戰國刺客Azumi | fighter | 近戰 | ✅ | 少女殺手安云，是身手敏捷、拔刀神速，號稱百人斬的殺手刺客。在完成使命恢復自由之身後，決心投… | `godie-e00k.passive` `godie-e00k.q` `godie-e00k.w` `godie-e00k.e` `godie-e00k.r` `godie-e00k.ex` |
| `godie-e00r` | 初號機 | 最終泛用人型決戰兵器 | fighter | 近戰 | ✅ | 『汎用人型決戰兵器』EVANGELION初號機，採用半生物機械的製造，因此雖然能力強大,但… | `godie-e00r.passive` `godie-e00r.q` `godie-e00r.w` `godie-e00r.e` `godie-e00r.r` `godie-e00r.ex` |
| `godie-e00w` | 櫻綻剎那 | 神鳴流劍士 | fighter | 近戰 | ✅ | 武道四天王之一，是在京都流傳已久的神鳴流劍術高手，也是個精通陰陽道的劍士。烏鴉族混血兒，由… | `godie-e00w.passive` `godie-e00w.q` `godie-e00w.w` `godie-e00w.e` `godie-e00w.r` `godie-e00w.ex` |
| `godie-edem` | 宇智波佐助 | 寫輪眼復仇者 | fighter | 近戰 | ✅ | 在忍者學校以第一名的成績畢業，是有名的"宇智波一族"的後代。復仇信念堅定，一心想殺了哥哥宇… | `godie-edem.passive` `godie-edem.q` `godie-edem.w` `godie-edem.e` `godie-edem.r` `godie-edem.ex` |
| `godie-emfr` | 涅吉。史普林。菲爾德 | 魔法老師 | marksman | 遠程 | ✅ | 英國某間魔法學校修行的首席畢業生涅吉，目前還只是個10歲的少年。他的目標是成為「出色的魔法… | `godie-emfr.passive` `godie-emfr.q` `godie-emfr.w` `godie-emfr.e` `godie-emfr.r` `godie-emfr.ex` |
| `godie-emns` | 夜神月 | 奇樂 | marksman | 遠程 | ✅ | 英俊瀟灑，謹慎且機智，雖然極有女人緣但對異性不感興趣。高中三年級時在學校撿到了死神路克遺留… | `godie-emns.passive` `godie-emns.q` `godie-emns.w` `godie-emns.e` `godie-emns.r` `godie-emns.ex` |
| `godie-etyr` | 木乃香 | 治癒系公主 | marksman | 遠程 | ✅ | 父母家在京都的關西咒術協會，父親近衛詠春是關西咒術協會會長，祖父是關東魔法協會會長與麻帆良… | `godie-etyr.passive` `godie-etyr.q` `godie-etyr.w` `godie-etyr.e` `godie-etyr.r` `godie-etyr.ex` |
| `godie-h00l` | 林克 | 時空勇者 | fighter | 近戰 | ✅ | 原本在森林中被當成『永遠不會長大的科奇利族人』般的生活著，直到某天因葛諾多夫的陰謀而知道自… | `godie-h00l.passive` `godie-h00l.q` `godie-h00l.w` `godie-h00l.e` `godie-h00l.r` `godie-h00l.ex` |
| `godie-h01n` | 黑崎一護 | 開外掛的死神 | fighter | 近戰 | ✅ | 黑崎一護除了能夠看見靈之外，是個很普通的高中生，但是有一天，出現了一個叫做〔虛〕的惡靈找上… | `godie-h01n.passive` `godie-h01n.q` `godie-h01n.w` `godie-h01n.e` `godie-h01n.r` `godie-h01n.ex` |
| `godie-h01u` | 呂布奉先 | 亂世癿王者 | fighter | 近戰 | ✅ | 呂布（公元151年—公元198年），字奉先，五原（今內蒙古包頭市）人。三國時代的著名武將。… | `godie-h01u.passive` `godie-h01u.q` `godie-h01u.w` `godie-h01u.e` `godie-h01u.r` `godie-h01u.ex` |
| `godie-h020` | 莉娜因巴斯 | 黑魔導士 | marksman | 遠程 | ✅ | 自稱天才美少女魔導士的莉娜，加入愛與和平純粹只是為了可以獲得賞金，正如同她的綽號"盜賊殺手… | `godie-h020.passive` `godie-h020.q` `godie-h020.w` `godie-h020.e` `godie-h020.r` `godie-h020.ex` |
| `godie-h02k` | 熊貓 | 國寶級的畜生 | fighter | 近戰 | ✅ | 來自四川的熊貓，經歷過四川的地震以後，流落到馬戲團賣藝，雖然自稱賣藝不賣身，但是為了生活還… | `godie-h02k.passive` `godie-h02k.q` `godie-h02k.w` `godie-h02k.e` `godie-h02k.r` `godie-h02k.ex` |
| `godie-h02r` | 妙蛙花 | 種子神奇寶貝 | fighter | 近戰 | ✅ | — | `godie-h02r.passive` `godie-h02r.q` `godie-h02r.w` `godie-h02r.e` `godie-h02r.r` `godie-h02r.ex` |
| `godie-h02u` | 草泥馬 | 看似憂鬱的神獸 | fighter | 近戰 | ✅ | 草泥馬是中國網民惡搞的十大神獸之一，被《紐約時報》等媒體認為是中國網民對於中國大陸網路審查… | `godie-h02u.passive` `godie-h02u.q` `godie-h02u.w` `godie-h02u.e` `godie-h02u.r` `godie-h02u.ex` |
| `godie-hapm` | Berserker | 海克力斯 | fighter | 近戰 | ✅ | Berserker是希臘神話中著名的英雄海格力斯(Hercules) ，血統為半神半人，力… | `godie-hapm.passive` `godie-hapm.q` `godie-hapm.w` `godie-hapm.e` `godie-hapm.r` `godie-hapm.ex` |
| `godie-hart` | 克勞德 | 最終幻想 | fighter | 近戰 | ✅ | Cloud的名字暗示著他神祕，不清楚的過去以及他那不可預知的將來，為了過去奮戰們的朋友，使… | `godie-hart.passive` `godie-hart.q` `godie-hart.w` `godie-hart.e` `godie-hart.r` `godie-hart.ex` |
| `godie-hpal` | 藤井八雲 | 不死之身-無 | fighter | 近戰 | ✅ | 身為三隻眼的僕人，擁有不死之身的藤井八雲，雖然可以招喚威力強大的魔獸，卻要付出自身血肉作為… | `godie-hpal.passive` `godie-hpal.q` `godie-hpal.w` `godie-hpal.e` `godie-hpal.r` `godie-hpal.ex` |
| `godie-hpb1` | 蒼月潮 | 獸矛傳承使 | fighter | 近戰 | ✅ | 無意間破除光霸明宗所設的密室結界， 並意外成為獸矛這一世的傳承者。充滿熱血正義感的蒼月潮為… | `godie-hpb1.passive` `godie-hpb1.q` `godie-hpb1.w` `godie-hpb1.e` `godie-hpb1.r` `godie-hpb1.ex` |
| `godie-huth` | 魔人普烏 | 超級普烏 | fighter | 近戰 | ✅ | 看似貪玩可愛，骨子裡卻充滿邪惡的魔人普烏。擁有強大的分身再生能力，摧毀敵人也只不過是他的娛… | `godie-huth.passive` `godie-huth.q` `godie-huth.w` `godie-huth.e` `godie-huth.r` `godie-huth.ex` |
| `godie-hvsh` | Rider | 梅杜莎 | fighter | 近戰 | ✅ | 高爾根為蛇髮女怪，她們是海神Phorcys和ceto所生的三女妖：大姐司提娜(Stheno… | `godie-hvsh.passive` `godie-hvsh.q` `godie-hvsh.w` `godie-hvsh.e` `godie-hvsh.r` `godie-hvsh.ex` |
| `godie-hvwd` | 桔梗 | 除魔巫女 | marksman | 遠程 | ✅ | 原本是四魂之玉的守護巫女，為了守護世界的和平，只好再度轉生修練來對抗去死團的怨念。 | `godie-hvwd.passive` `godie-hvwd.q` `godie-hvwd.w` `godie-hvwd.e` `godie-hvwd.r` `godie-hvwd.ex` |
| `godie-n003` | 依文潔琳 | 黑暗福音 | marksman | 遠程 | ✅ | 吸血鬼的真祖〔以怪物來說是最強的等級而且是吸血鬼中屬於最高階的人物﹞，在15年以前是被稱為… | `godie-n003.passive` `godie-n003.q` `godie-n003.w` `godie-n003.e` `godie-n003.r` `godie-n003.ex` |
| `godie-n00b` | 哆拉A夢 | 小叮噹 | fighter | 近戰 | ✅ | 從21世紀來的機械貓，因為感受到體內KUSO魂呼喚，所以決定在去死團大闖天下。 | `godie-n00b.passive` `godie-n00b.q` `godie-n00b.w` `godie-n00b.e` `godie-n00b.r` `godie-n00b.ex` |
| `godie-n00p` | 南野秀一 | 妖狐藏馬 | marksman | 遠程 | ✅ | 魔界高級妖魔轉生寄宿為人類，為控制魔界植物的支配者。 | `godie-n00p.passive` `godie-n00p.q` `godie-n00p.w` `godie-n00p.e` `godie-n00p.r` `godie-n00p.ex` |
| `godie-n01c` | 勇者小呆 | 傳說的龍騎士 | fighter | 近戰 | ✅ | 傳說中打敗魔王的勇者，為神魔人混血創造的龍騎士，為了維護世界和平，再度使用高超的阿邦快速劍… | `godie-n01c.passive` `godie-n01c.q` `godie-n01c.w` `godie-n01c.e` `godie-n01c.r` `godie-n01c.ex` |
| `godie-nplh` | 麻倉葉 | 通靈人 | fighter | 近戰 | ✅ | 為了修練來到愛與和平，擁有安娜授予《超．占事略決》，得到了新的超越靈魂──阿隬陀丸in春雨… | `godie-nplh.passive` `godie-nplh.q` `godie-nplh.w` `godie-nplh.e` `godie-nplh.r` `godie-nplh.ex` |
| `godie-o00k` | 皮卡娘 | 傲嬌電氣老鼠 | marksman | 遠程 | ✅ | 相當傲嬌的皮卡丘，從小就展現出超出一般水準的戰鬥能力，是個斗S，喜歡身為M的主人小智，。 | `godie-o00k.passive` `godie-o00k.q` `godie-o00k.w` `godie-o00k.e` `godie-o00k.r` `godie-o00k.ex` |
| `godie-o00l` | 傑洛士 | 獸神官 | marksman | 遠程 | ✅ | 隸屬於獸王底下的神官，是非常高等的魔族，擁有強大的魔法破壞力，不過通常隱身在幕後扮演調查和… | `godie-o00l.passive` `godie-o00l.q` `godie-o00l.w` `godie-o00l.e` `godie-o00l.r` `godie-o00l.ex` |
| `godie-o00x` | 悟空 | 超級賽亞人 | fighter | 近戰 | ✅ | 七龍珠中不死的傳奇英雄，每當世界有難的時候總會亂入(!?)。 | `godie-o00x.passive` `godie-o00x.q` `godie-o00x.w` `godie-o00x.e` `godie-o00x.r` `godie-o00x.ex` |
| `godie-o02p` | 初音 | 夢幻之星 | fighter | 近戰 | ✅ | 人類史上第一個紅遍全球的虛擬歌姬，儘管到了今日仍在發光發熱，甚至有專屬初音的感謝祭演場會。 | `godie-o02p.passive` `godie-o02p.q` `godie-o02p.w` `godie-o02p.e` `godie-o02p.r` `godie-o02p.ex` |
| `godie-ofar` | 皮卡丘 | 神奇寶貝兒 | marksman | 遠程 | ✅ | 自從皮卡丘成為國際巨星後，開始也擺起架勢把小智當傭人使喚，直到有一天在森林裡吃蘋果的時候，… | `godie-ofar.passive` `godie-ofar.q` `godie-ofar.w` `godie-ofar.e` `godie-ofar.r` `godie-ofar.ex` |
| `godie-ogld` | 黑人牙膏 | 美白大法師 | marksman | 遠程 | ✅ | 曾是魔法界首屈一指美白專家，個性善良；但在一次魔法決鬥中敗給飛鼠先生。自認為輸給飛鼠是因為… | `godie-ogld.q` `godie-ogld.w` `godie-ogld.e` `godie-ogld.r` `godie-ogld.ex` |
| `godie-orkn` | 臭作 | 電車癡漢 | marksman | 遠程 | ✅ | 傳說中的變態色魔老頭，身懷眾多變態絕技，是去死團裡強大的怨念支柱，興趣是偷窺以及(嗶...… | `godie-orkn.passive` `godie-orkn.q` `godie-orkn.w` `godie-orkn.e` `godie-orkn.r` `godie-orkn.ex` |
| `godie-osam` | 殺生丸 | 犬妖 | fighter | 近戰 | ✅ | 犬夜叉同父異母的哥哥。他是完全的妖怪，能力要強得多，性格非常冷酷殘忍，對付自己的弟弟也是手… | `godie-osam.passive` `godie-osam.q` `godie-osam.w` `godie-osam.e` `godie-osam.r` `godie-osam.ex` |
| `godie-u00h` | 鬼畜狂刀KYO | 鬼畜紅王 | fighter | 近戰 | ✅ | 關原之戰後四年千人斬傳說復活！ | `godie-u00h.passive` `godie-u00h.q` `godie-u00h.w` `godie-u00h.e` `godie-u00h.r` `godie-u00h.ex` |
| `godie-u00j` | 賽菲洛斯 | 神性的流失 | fighter | 近戰 | ✅ | 賽菲洛斯是路克麗西亞和寶條博士的兒子。在胎兒時期被親生父親植入傑諾娃細胞，造成年輕的他成了… | `godie-u00j.passive` `godie-u00j.q` `godie-u00j.w` `godie-u00j.e` `godie-u00j.r` `godie-u00j.ex` |
| `godie-u00k` | 死之王 | 邪惡意念集合體 | marksman | 遠程 | ✅ | 所有邪惡的聚合體，從上古時代就誕生的惡魔，與飛鼠先生一戰後魂飛魄散，在此次戰役中被召喚回來。 | `godie-u00k.passive` `godie-u00k.q` `godie-u00k.w` `godie-u00k.e` `godie-u00k.r` `godie-u00k.ex` |
| `godie-u00l` | 拳四郎 | 北斗之鼠 | fighter | 近戰 | ✅ | 北斗神拳的唯一傳人，使用難以置信的秘穴(!?)拳法致敵人於死地。由於北斗星是不祥之星，與拳… | `godie-u00l.passive` `godie-u00l.q` `godie-u00l.w` `godie-u00l.e` `godie-u00l.r` `godie-u00l.ex` |
| `godie-u00n` | 蒙其.D.魯夫 | 草帽小子 | fighter | 近戰 | ✅ | 魯夫小時候崇拜海賊「紅髮傑克」而夢想將來做個海賊，某一天，魯夫因為誤食惡魔果實成了橡膠人，… | `godie-u00n.passive` `godie-u00n.q` `godie-u00n.w` `godie-u00n.e` `godie-u00n.r` `godie-u00n.ex` |
| `godie-u00v` | 基廉列克 | 黑手黨老大 | fighter | 近戰 | ✅ | 前黑手黨老大，被手下背叛炸爛後接合回去所以身上有須多接痕及顏色，平常安靜，必要時非常的暴躁… | `godie-u00v.passive` `godie-u00v.q` `godie-u00v.w` `godie-u00v.e` `godie-u00v.r` `godie-u00v.ex` |
| `godie-u010` | 飛影 | 邪眼師 | fighter | 近戰 | ✅ | 在魔界中有名的盜賊妖怪，除了是一位邪王炎殺拳的高手之外，也是一位用劍的高手。為了尋找妹妹雪… | `godie-u010.passive` `godie-u010.q` `godie-u010.w` `godie-u010.e` `godie-u010.r` `godie-u010.ex` |
| `godie-u01u` | 索隆 | 三刀流劍士 | fighter | 近戰 | ✅ | 夢想成為世界第一的大劍客，使用自創的三刀流劍術擊遍天下劍客。為了在戰鬥中追尋武藝的卓越加入… | `godie-u01u.passive` `godie-u01u.q` `godie-u01u.w` `godie-u01u.e` `godie-u01u.r` `godie-u01u.ex` |
| `godie-ubal` | 巴恩大魔王 | 魔界霸主 | fighter | 近戰 | ✅ | 巴恩為了永恆年輕的肉體，將自己精神轉移到老頭子身上，並將年輕肉體封印起來，只在重要戰役才有… | `godie-ubal.passive` `godie-ubal.q` `godie-ubal.w` `godie-ubal.e` `godie-ubal.r` `godie-ubal.ex` |
| `godie-udea` | 飛鼠先生 | 至尊學長 | fighter | 近戰 | ✅ | 神秘的英雄，擅長以各種KUSO手法襲擊對手並加以推倒。 | `godie-udea.passive` `godie-udea.q` `godie-udea.w` `godie-udea.e` `godie-udea.r` `godie-udea.ex` |

## 2. 未開放 not in the open roster（65）

文件存在、資料完整，但白名單沒放行，所以選角畫面看不到、bot 也不會抽到。

| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（天生 Q W E R EX） |
|---|---|---|---|---|---|---|---|
| `godie-e00j` | 騜 | 皇者 | fighter | 近戰 | — | 出生於東方之珠的真龍天子，一出生就有龍氣附身，註定是強者中的強者。不過在初次與扁皇的對決中… | `godie-e00j.passive` `godie-e00j.q` `godie-e00j.w` `godie-e00j.e` `godie-e00j.r` `godie-e00j.ex` |
| `godie-e00l` | Saber | 亞瑟王 | fighter | 近戰 | — | — | `godie-e00l.passive` `godie-e00l.q` `godie-e00l.w` `godie-e00l.e` `godie-e00l.r` `godie-e00l.ex` |
| `godie-e00n` | 龍宮禮奈 | 蟬在叫人壞掉 | fighter | 近戰 | — | — | `godie-e00n.passive` `godie-e00n.q` `godie-e00n.w` `godie-e00n.e` `godie-e00n.r` `godie-e00n.ex` |
| `godie-e00q` | 黑化Saber | 英靈-亞瑟王 | fighter | 近戰 | — | 被偽聖杯污染後的產物，她之所以會是最強，並不是因其作為劍士的能力，而是因為擁有龍之因子而得… | `godie-e00q.passive` `godie-e00q.q` `godie-e00q.w` `godie-e00q.e` `godie-e00q.r` `godie-e00q.ex` |
| `godie-e00s` | 白木卡迪那 | 白木老樹精 | marksman | 遠程 | — | 白木家族是捍衛世界樹種族之一，與黃金龍族不同的是，通常處於被動守護狀態而不像黃金龍族常巡邏… | `godie-e00s.passive` `godie-e00s.q` `godie-e00s.w` `godie-e00s.e` `godie-e00s.r` `godie-e00s.ex` |
| `godie-e00t` | 貞子 | 七夜怪談 | marksman | 遠程 | — | 傳說中帶有恐怖怨念的超能力者，擅長爬出電視機嚇人，惹火她的人將會死無葬身之地。 | `godie-e00t.passive` `godie-e00t.q` `godie-e00t.w` `godie-e00t.e` `godie-e00t.r` `godie-e00t.ex` |
| `godie-e00u` | 十六夜Sakuya | 完全而瀟灑的女僕 | marksman | 遠程 | — | (出自:東方Project) | `godie-e00u.passive` `godie-e00u.q` `godie-e00u.w` `godie-e00u.e` `godie-e00u.r` |
| `godie-e00v` | 維尼 | 百畝森林的霸主 | fighter | 近戰 | — | 小熊維尼是百畝森林裡最受歡迎的動物，約有22吋高，純真可愛，雖然有點笨拙，但心地善良。最愛… | `godie-e00v.passive` `godie-e00v.q` `godie-e00v.w` `godie-e00v.e` `godie-e00v.r` `godie-e00v.ex` |
| `godie-e00x` | 櫻綻剎那 | 神鳴流劍士 | fighter | 近戰 | — | 武道四天王之一，是在京都流傳已久的神鳴流劍術高手，也是個精通陰陽道的劍士。烏鴉族混血兒，由… | `godie-e00x.passive` `godie-e00x.q` `godie-e00x.w` `godie-e00x.e` `godie-e00x.r` `godie-e00x.ex` |
| `godie-e00z` | 安云 | 戰國刺客Azumi | fighter | 近戰 | — | — | `godie-e00z.passive` `godie-e00z.q` `godie-e00z.w` `godie-e00z.e` `godie-e00z.r` `godie-e00z.ex` |
| `godie-e012` | 佐佐木小次郎 | 殺人劍客 | fighter | 近戰 | — | 。 | `godie-e012.passive` `godie-e012.q` `godie-e012.w` `godie-e012.e` `godie-e012.r` |
| `godie-e015` | 金居福 | 夜市人生 | fighter | 近戰 | — | 方恰恰的老公，他是在元配過世之後，才娶了方恰恰的。從事營造業，個性喜好吹噓，但其實很小氣，… | `godie-e015.passive` `godie-e015.q` `godie-e015.w` `godie-e015.e` `godie-e015.r` `godie-e015.ex` |
| `godie-ecen` | 約翰走路 | 姜窩肯 | marksman | 遠程 | — | 酒不醉人人自醉，當初發跡是由一家小雜貨店開始。當時年紀才十五歲的約翰華克（John Wal… | `godie-ecen.passive` `godie-ecen.q` `godie-ecen.w` `godie-ecen.e` `godie-ecen.r` `godie-ecen.ex` |
| `godie-efur` | 揍敵客桀諾 | 揍敵客大家長 | marksman | 遠程 | — | 來自殺手世家揍敵客家族，其才能在揍敵客家族歷史也是非常優秀。擁有超強的念能力，可以任意操縱… | `godie-efur.passive` `godie-efur.q` `godie-efur.w` `godie-efur.e` `godie-efur.r` `godie-efur.ex` |
| `godie-ekee` | 傳說中的大刀 | 會叫的野獸 | marksman | 遠程 | — | 出現於世界各地，汲汲營營、毀人不倦，通常手下都有大量的菸酒生可供使喚，特技是壓榨學生&奪取… | `godie-ekee.passive` `godie-ekee.q` `godie-ekee.w` `godie-ekee.e` `godie-ekee.r` `godie-ekee.ex` |
| `godie-ewar` | 天地志狼 | 龍之子 | fighter | 近戰 | — | 本是平凡的國中二年級學生，因為母親項鍊的神奇力量來到三國時代，而被當做龍之子，跟仙人學習仙… | `godie-ewar.passive` `godie-ewar.q` `godie-ewar.w` `godie-ewar.e` `godie-ewar.r` `godie-ewar.ex` |
| `godie-ewrd` | 棗 真夜 | 天上天下 | fighter | 近戰 | — | 立誓要以"武術"征服全校， 身為統道學園劍道部社長棗真夜，有必要以廣告招收新社員，於是參加… | `godie-ewrd.passive` `godie-ewrd.q` `godie-ewrd.w` `godie-ewrd.e` `godie-ewrd.r` `godie-ewrd.ex` |
| `godie-h001` | 斑剎 | 地獄來襲者 | fighter | 近戰 | — | 來自天堂的召喚師，擁有召喚強力怪獸的能力，同樣是充滿怨念的角色。 | `godie-h001.passive` `godie-h001.q` `godie-h001.w` `godie-h001.e` `godie-h001.r` `godie-h001.ex` |
| `godie-h01o` | 黑崎一護 | 外掛開很大的死神 | fighter | 近戰 | — | — | `godie-h01o.passive` `godie-h01o.q` `godie-h01o.w` `godie-h01o.e` `godie-h01o.r` `godie-h01o.ex` |
| `godie-h021` | 阿強一號 | 破銅爛鐵 | marksman | 遠程 | — | 。 | `godie-h021.passive` `godie-h021.q` `godie-h021.w` `godie-h021.e` `godie-h021.r` |
| `godie-h022` | 涅吉。史普林。菲爾德 | 白色之翼 | fighter | 近戰 | — | 在魔法世界裡經父親以前的夥伴拉坎的協助，學會了依文潔琳百年前用的禁忌之術──「黑暗魔法」，… | `godie-h022.passive` `godie-h022.q` `godie-h022.w` `godie-h022.e` `godie-h022.r` `godie-h022.ex` |
| `godie-h02n` | 打我阿笨蛋 | 腦包英雄 | fighter | 近戰 | — | — | `godie-h02n.q` `godie-h02n.w` `godie-h02n.e` `godie-h02n.r` |
| `godie-h02s` | 死亡騎士 | — | fighter | 近戰 | — | 詳情請參考巫妖電視王-30秒說完巫妖王歷史。 | `godie-h02s.passive` `godie-h02s.q` `godie-h02s.w` `godie-h02s.e` `godie-h02s.r` `godie-h02s.ex` |
| `godie-h02v` | 草泥馬 | 看似憂鬱的神獸 | fighter | 近戰 | — | 草泥馬是中國網民惡搞的十大神獸之一，被《紐約時報》等媒體認為是中國網民對於中國大陸網路審查… | `godie-h02v.passive` `godie-h02v.q` `godie-h02v.w` `godie-h02v.e` `godie-h02v.r` `godie-h02v.ex` |
| `godie-h02y` | 志志雄真實 | 幕末復仇狂者 | fighter | 近戰 | — | 「強者生存，弱者滅亡」為其信念，認為去死團在對岸列強環伺下需要強權領導，現任作者太軟弱了，… | `godie-h02y.passive` `godie-h02y.q` `godie-h02y.w` `godie-h02y.e` `godie-h02y.r` `godie-h02y.ex` |
| `godie-h02z` | 不良少年 | — | fighter | 近戰 | — | 詳情請參考巫妖電視王-30秒說完巫妖王歷史。 | `godie-h02z.passive` `godie-h02z.q` `godie-h02z.w` `godie-h02z.e` `godie-h02z.r` `godie-h02z.ex` |
| `godie-harf` | 鄭先生 | 豪洨天王 | fighter | 近戰 | — | PTT傳說中的愛洨會最高層幹部之一，喜愛吞噬某樣液體成名。之所以會加入去死團，據說是愛洨會… | `godie-harf.passive` `godie-harf.q` `godie-harf.w` `godie-harf.e` `godie-harf.r` `godie-harf.ex` |
| `godie-hblm` | 賈修貝爾 | 慈悲的王者 | marksman | 遠程 | — | 與手持魔法紅書唸出咒語的清人並肩作戰，和同樣被送到人間，競爭角逐魔界之王的寶座，為了得到保… | `godie-hblm.passive` `godie-hblm.q` `godie-hblm.w` `godie-hblm.e` `godie-hblm.r` `godie-hblm.ex` |
| `godie-hgam` | 妙蛙種子 | 種子神奇寶貝 | fighter | 近戰 | — | 一出生背上就負著不可思議的種子。背上的種子裡面，擁有大量的營養 ，種子會跟著身體一起長大。 | `godie-hgam.passive` `godie-hgam.q` `godie-hgam.w` `godie-hgam.e` `godie-hgam.r` `godie-hgam.ex` |
| `godie-hjai` | 莉娜因巴斯 | 黑魔導士 | marksman | 遠程 | — | 自稱天才美少女魔導士的莉娜，加入愛與和平純粹只是為了可以獲得賞金，正如同她的綽號"盜賊殺手… | `godie-hjai.passive` `godie-hjai.q` `godie-hjai.w` `godie-hjai.e` `godie-hjai.r` `godie-hjai.ex` |
| `godie-hlgr` | 煌 | 鋼彈 | fighter | 近戰 | — | 煌 大和是操縱鋼彈的駕駛員，為了執行宇宙和平的使命，於是開著拼裝的工程用鋼彈加入愛與和平。 | `godie-hlgr.passive` `godie-hlgr.q` `godie-hlgr.w` `godie-hlgr.e` `godie-hlgr.r` `godie-hlgr.ex` |
| `godie-n01g` | 依文潔琳 | 黑暗福音 | marksman | 遠程 | — | 吸血鬼的真祖〔以怪物來說是最強的等級而且是吸血鬼中屬於最高階的人物﹞，在15年以前是被稱為… | `godie-n01g.passive` `godie-n01g.q` `godie-n01g.w` `godie-n01g.e` `godie-n01g.r` `godie-n01g.ex` |
| `godie-n01l` | 小派 | 學姊 | fighter | 近戰 | — | (出自:現實的人生) | `godie-n01l.passive` `godie-n01l.q` `godie-n01l.w` `godie-n01l.e` `godie-n01l.r` `godie-n01l.ex` |
| `godie-naka` | 風魔小次郎 | 猿飛佐助 | fighter | 近戰 | — | 神秘的忍者，藏在敵人的影子之中難以發現，暗殺的達人，不攻擊的時候甚至可以永久隱形。 | `godie-naka.passive` `godie-naka.q` `godie-naka.w` `godie-naka.e` `godie-naka.r` `godie-naka.ex` |
| `godie-nbbc` | 勇者小呆 | 傳說的龍騎士 | fighter | 近戰 | — | 傳說中打敗魔王的勇者，為神魔人混血創造的龍騎士，為了維護世界和平，再度使用高超的阿邦快速劍… | `godie-nbbc.passive` `godie-nbbc.q` `godie-nbbc.w` `godie-nbbc.e` `godie-nbbc.r` `godie-nbbc.ex` |
| `godie-nbst` | 瘋狂假面 | 變態正義 | fighter | 近戰 | — | 傳說瘋狂假面是一個實行變態正義的人，一旦套上小褲褲就會變成正義超人，擁有制裁罪惡的超能力。 | `godie-nbst.passive` `godie-nbst.q` `godie-nbst.w` `godie-nbst.e` `godie-nbst.r` `godie-nbst.ex` |
| `godie-nman` | 憤怒的胖虎 | 地獄歌神 | fighter | 近戰 | — | 身為孩子王的胖虎卻找不到女伴，如此大的怨念讓胖虎憤怒的成為去死團的戰士。 | `godie-nman.passive` `godie-nman.q` `godie-nman.w` `godie-nman.e` `godie-nman.r` `godie-nman.ex` |
| `godie-nsjs` | 南野秀一 | 妖狐藏馬 | marksman | 遠程 | — | 魔界高級妖魔轉生寄宿為人類，為控制魔界植物的支配者。 | `godie-nsjs.passive` `godie-nsjs.q` `godie-nsjs.w` `godie-nsjs.e` `godie-nsjs.r` `godie-nsjs.ex` |
| `godie-ntin` | 菲特·泰斯塔羅沙 | 時空管理局執務官 | fighter | 近戰 | — | 任職於時空管理局，擔任的職位是執務官。階級相當於一等尉。 轉任至機動六課後擔任的職位為搜查… | `godie-ntin.passive` `godie-ntin.q` `godie-ntin.w` `godie-ntin.e` `godie-ntin.r` `godie-ntin.ex` |
| `godie-o01z` | 高町奈葉 | 魔砲少女 | marksman | 遠程 | — | 傳說中的「白色惡魔」，在每一次的任務中，她總是能以「以砲交友」的方法把敵人降服成為碰友。其… | `godie-o01z.passive` `godie-o01z.q` `godie-o01z.w` `godie-o01z.e` `godie-o01z.r` `godie-o01z.ex` |
| `godie-o02l` | 皮卡丘 | 神騎寶貝 | fighter | 近戰 | — | — | `godie-o02l.passive` `godie-o02l.q` `godie-o02l.w` `godie-o02l.e` `godie-o02l.r` `godie-o02l.ex` |
| `godie-o02o` | 阿瞞大人 | 曹操孟德 | fighter | 近戰 | — | 。 | `godie-o02o.passive` `godie-o02o.q` `godie-o02o.w` `godie-o02o.e` `godie-o02o.r` |
| `godie-o02s` | 涼宮八ㄦ匕 | 憂鬱少女 | marksman | 遠程 | — | 隸屬於獸王底下的神官，是非常高等的魔族，擁有強大的魔法破壞力，不過通常隱身在幕後扮演調查和… | `godie-o02s.passive` `godie-o02s.q` `godie-o02s.w` `godie-o02s.e` `godie-o02s.r` |
| `godie-o02v` | 高町奈葉 | 白色惡魔 | marksman | 遠程 | — | 傳說中的「白色惡魔」，在每一次的任務中，她總是能以「以砲交友」的方法把敵人降服成為碰友。其… | `godie-o02v.passive` `godie-o02v.q` `godie-o02v.w` `godie-o02v.e` `godie-o02v.r` `godie-o02v.ex` |
| `godie-o02w` | 令狐沖 | 笑傲江湖 | fighter | 近戰 | — | 華山劍派之首席大弟子，為人大而化之不拘小節，且不喜世俗教條之束縛，因緣際會之下習得了武林奇… | `godie-o02w.passive` `godie-o02w.q` `godie-o02w.w` `godie-o02w.e` `godie-o02w.r` `godie-o02w.ex` |
| `godie-obla` | 牧太郎 | 被剝削的勞工階級 | fighter | 近戰 | — | 在牧場打工，領著低薪的低賤勞工，原名已經不詳，只知道大家叫他牧太郎。擅長砍樹﹑養雞﹑照顧動… | `godie-obla.passive` `godie-obla.q` `godie-obla.w` `godie-obla.e` `godie-obla.r` `godie-obla.ex` |
| `godie-ogrh` | 悟空 | 賽亞人 | fighter | 近戰 | — | 七龍珠中不死的傳奇英雄，每當世界有難的時候總會亂入(!?)。 | `godie-ogrh.passive` `godie-ogrh.q` `godie-ogrh.w` `godie-ogrh.e` `godie-ogrh.r` `godie-ogrh.ex` |
| `godie-opgh` | 趙子龍 | 常勝將軍 | fighter | 近戰 | — | 傳說中七進七出救大嫂，被劉備發現後怒摔阿斗。據漢水，縱橫於千軍萬馬之中，視數十萬大軍如草芥… | `godie-opgh.passive` `godie-opgh.q` `godie-opgh.w` `godie-opgh.e` `godie-opgh.r` `godie-opgh.ex` |
| `godie-oshd` | 鬼王達 | 魔鬼筋肉人 | marksman | 遠程 | — | 雜貨店的老闆，也是傳說中的懦夫救星、中國古拳法的掌門人-綽號魔鬼筋肉人。選擇加入去死團展現… | `godie-oshd.passive` `godie-oshd.q` `godie-oshd.w` `godie-oshd.e` `godie-oshd.r` `godie-oshd.ex` |
| `godie-othr` | 金鋼狼 | X戰警 | fighter | 近戰 | — | 名為金鋼狼，是因為全身硬梆梆像金鋼一樣。身材雖然臃腫，速度和力量卻不輸其他人，但是長相不如… | `godie-othr.passive` `godie-othr.q` `godie-othr.w` `godie-othr.e` `godie-othr.r` `godie-othr.ex` |
| `godie-u00b` | 清蒸 飛鼠先生 | 最M的魔法Jizz | fighter | 近戰 | — | — | `godie-u00b.passive` `godie-u00b.q` `godie-u00b.w` `godie-u00b.e` `godie-u00b.r` |
| `godie-u00o` | 蒙其.D.魯夫 | 草帽小子 | fighter | 近戰 | — | 魯夫小時候崇拜海賊「紅髮傑克」而夢想將來做個海賊，某一天，魯夫因為誤食惡魔果實成了橡膠人，… | `godie-u00o.passive` `godie-u00o.q` `godie-u00o.w` `godie-u00o.e` `godie-u00o.r` `godie-u00o.ex` |
| `godie-u011` | 克勞薩先生 | 死亡老二 | fighter | 近戰 | — | — | `godie-u011.passive` `godie-u011.q` `godie-u011.w` `godie-u011.e` `godie-u011.r` `godie-u011.ex` |
| `godie-u012` | 克勞薩II世 | 重金屬樂團的怪物 | fighter | 近戰 | — | 在一次"新人音樂家招募"活動中,意外加入了惡魔系重金屬樂隊"Detroit Metal C… | `godie-u012.passive` `godie-u012.q` `godie-u012.w` `godie-u012.e` `godie-u012.r` `godie-u012.ex` |
| `godie-u01f` | 黑化張飛 | 萬夫莫敵 | marksman | 遠程 | — | — | `godie-u01f.passive` `godie-u01f.q` `godie-u01f.w` `godie-u01f.e` `godie-u01f.r` |
| `godie-u01q` | 索隆 | 測試英雄 | fighter | 近戰 | — | — | `godie-u01q.q` `godie-u01q.w` `godie-u01q.e` `godie-u01q.r` |
| `godie-u034` | 傑 富力士 | 職業獵人 | fighter | 近戰 | — | 出身於鯨魚島，從小就在大自然中成長，鍛鍊出他一身恐怖的能力。在尋找父親的旅程中，莫名其妙捲… | `godie-u034.passive` `godie-u034.q` `godie-u034.w` `godie-u034.e` `godie-u034.r` `godie-u034.ex` |
| `godie-ucrl` | 傑 富力士 | 職業獵人 | fighter | 近戰 | — | 出身於鯨魚島，從小就在大自然中成長，鍛鍊出他一身恐怖的能力。在尋找父親的旅程中，莫名其妙捲… | `godie-ucrl.passive` `godie-ucrl.q` `godie-ucrl.w` `godie-ucrl.e` `godie-ucrl.r` `godie-ucrl.ex` |
| `godie-udre` | 索隆 | 三刀流劍士 | fighter | 近戰 | — | 夢想成為世界第一的大劍客，使用自創的三刀流劍術擊遍天下劍客。為了在戰鬥中追尋武藝的卓越加入… | `godie-udre.passive` `godie-udre.q` `godie-udre.w` `godie-udre.e` `godie-udre.r` `godie-udre.ex` |
| `godie-umal` | 拳四郎 | 北斗神拳掌門人 | fighter | 近戰 | — | 北斗神拳的唯一傳人，使用難以置信的秘穴(!?)拳法致敵人於死地。由於北斗星是不祥之星，與拳… | `godie-umal.passive` `godie-umal.q` `godie-umal.w` `godie-umal.e` `godie-umal.r` `godie-umal.ex` |
| `godie-usyl` | 異形 | 殺戮之牙 | marksman | 遠程 | — | 傳說中外太空的邪惡生物，殺戮是他們的天性，難以對付的敵人。 | `godie-usyl.passive` `godie-usyl.q` `godie-usyl.w` `godie-usyl.e` `godie-usyl.r` `godie-usyl.ex` |
| `godie-uvng` | 飛影 | 邪眼師 | fighter | 近戰 | — | 在魔界中有名的盜賊妖怪，除了是一位邪王炎殺拳的高手之外，也是一位用劍的高手。為了尋找妹妹雪… | `godie-uvng.passive` `godie-uvng.q` `godie-uvng.w` `godie-uvng.e` `godie-uvng.r` `godie-uvng.ex` |
| `godie-uwar` | 撒尿牛丸 | 食神 | marksman | 遠程 | — | 神秘的戰士，據說是被混在一起才變成撒尿牛丸的。 | `godie-uwar.passive` `godie-uwar.q` `godie-uwar.w` `godie-uwar.e` `godie-uwar.r` `godie-uwar.ex` |
| `sela` | Sela, the Ember Sage | — | mage | 遠程 | — | — | `sela.q` `sela.w` `sela.e` `sela.r` |
| `thorne` | Thorne, the Bramble Knight | — | bruiser | 近戰 | — | — | `thorne.q` `thorne.w` `thorne.e` `thorne.r` |


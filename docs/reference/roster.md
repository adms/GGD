# 英雄名冊 / Champion roster

> ⚠️ **本檔案由程式產生，請勿手動編輯。**
> 重新產生：`pnpm docs:reference`（或 `python3 tools/reference/gen_reference.py`）
> 產生自 contentVersion **`cv_4748bfda8d8d`**（`content/manifest.json`；它是 `content/**` 的純函數，改內容就會變）
> 資料列：**153**　·　開放名單來源：快照 `docs/reference/_curation-snapshot.json`（whitelist updatedAt `2026-09-10T06:39:58.329461Z`；英雄 130 · 道具 116 · 技能 650）；即時名單 `GET /api/v1/curation/whitelist`

`content/champions/*.json` 共 **153** 名英雄，其中 **130** 名在開放名單（OPEN roster）內。開放名單是營運策展狀態，不是程式常數：真相是 `data/curation/whitelist.json`，由 platform 的 `GET /api/v1/curation/whitelist` 提供，由 game-server 在建房時執行；本檔印的是它進版控的快照（表頭有 updatedAt）。

> 本檔的數值是 `content/` 的**原始值**，未套用 `combat-env` 全域倍率（`content/config/combat-env.json`）。遊戲內顯示的一律是乘算後的最終值，所以畫面上的冷卻／傷害／生命與這裡不會相同 —— 那是預期行為，不是資料錯誤。
>
> **每名英雄有六個 slot：天生技（PASSIVE）＋ Q／W／E／R／EX。** 天生技是 w3x 的 `NN-00`，**等級 1 就擁有**，doc 是 `champion.passiveAbility` 指到的 `<id>.passive`（`exAbility` 的同款寫法）。150 名有天生技；3 名沒有 `passiveAbility` —— `godie-ogld`（有 `72-01..04` 與 `72-002`，但地圖裡不存在 `72-00`）、`sela`（非 w3x 原創英雄，沒有 `NN` 編號）、`thorne`（非 w3x 原創英雄，沒有 `NN` 編號） —— **那是還原出來的事實，不是待辦**。
>
> `稱號` / `全名` 是從 `name` 欄位拆出來的（慣例 `稱號 - 全名`），champion doc 上**沒有**獨立的稱號欄位；不符慣例的會顯示 `—`。
>
> `名言` 不在 champion doc 裡 —— 它在 `docs/champions.csv` 與 `content/assets/audio/voices/quotes/quotes.json`。

---

## 1. 開放名單 OPEN roster（130）

| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（天生 Q W E R EX） |
|---|---|---|---|---|---|---|---|
| `b2-aladdin` | 阿拉丁 | — | mage | 遠程 | ✅ | 魔笛MAGI｜魔笛像大型吹風機，想幫忙卻把代理樂團叫來加班。GGD 惡搞改編，角色辨識元素… | `b2-aladdin.passive` `b2-aladdin.q` `b2-aladdin.w` `b2-aladdin.e` `b2-aladdin.r` `b2-aladdin.ex` |
| `b2-albus` | 阿爾巴斯 | — | fighter | 近戰 | ✅ | 勇者再次啟程｜勇者速通，NPC台詞一律跳過。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-albus.passive` `b2-albus.q` `b2-albus.w` `b2-albus.e` `b2-albus.r` `b2-albus.ex` |
| `b2-bojji` | 波吉 | — | fighter | 近戰 | ✅ | 國王排名｜你認真揮大刀，他認真幫你戳笑穴。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-bojji.passive` `b2-bojji.q` `b2-bojji.w` `b2-bojji.e` `b2-bojji.r` `b2-bojji.ex` |
| `b2-boxxo` | 阿箱＋拉蜜絲 | — | tank | 近戰 | ✅ | 轉生成自動販賣機｜拉蜜絲背著阿箱流動營業，商品比魔法還兇。GGD 惡搞改編，角色辨識元素與… | `b2-boxxo.passive` `b2-boxxo.q` `b2-boxxo.w` `b2-boxxo.e` `b2-boxxo.r` `b2-boxxo.ex` |
| `b2-elma` | 艾爾瑪 | — | tank | 近戰 | ✅ | 轉生重騎士無雙｜攻略寫要壓血，隊友以為他在送頭。GGD 惡搞改編，角色辨識元素與招式創編分… | `b2-elma.passive` `b2-elma.q` `b2-elma.w` `b2-elma.e` `b2-elma.r` `b2-elma.ex` |
| `b2-fushi` | 不死 | — | tank | 近戰 | ✅ | 致不滅的你｜學會新形態前先學會別把隊友認錯。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-fushi.passive` `b2-fushi.q` `b2-fushi.w` `b2-fushi.e` `b2-fushi.r` `b2-fushi.ex` |
| `b2-goblin` | 哥布林殺手 | — | fighter | 近戰 | ✅ | 哥布林殺手｜所有敵人都先填哥布林風險評估表。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-goblin.passive` `b2-goblin.q` `b2-goblin.w` `b2-goblin.e` `b2-goblin.r` `b2-goblin.ex` |
| `b2-guts` | 凱茲 | — | fighter | 近戰 | ✅ | 烙印勇士｜武器是大劍，實際職稱是大型垃圾清運。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-guts.passive` `b2-guts.q` `b2-guts.w` `b2-guts.e` `b2-guts.r` `b2-guts.ex` |
| `b2-haga` | 羽賀 | — | fighter | 遠程 | ✅ | 這個世界漏洞百出｜把敵人當重現步驟，把隊友當測試同事。GGD 惡搞改編，角色辨識元素與招式… | `b2-haga.passive` `b2-haga.q` `b2-haga.w` `b2-haga.e` `b2-haga.r` `b2-haga.ex` |
| `b2-kaede` | 楓 | — | mage | 近戰 | ✅ | 異世界轉移魔法劍士｜附魔裝太多，劍變成跳不停的更新視窗。GGD 惡搞改編，角色辨識元素與招… | `b2-kaede.passive` `b2-kaede.q` `b2-kaede.w` `b2-kaede.e` `b2-kaede.r` `b2-kaede.ex` |
| `b2-kaiji` | 伊藤開司 | — | fighter | 遠程 | ✅ | 賭博默示錄｜局內籌碼賭運氣，贏了就喊最後一把。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-kaiji.passive` `b2-kaiji.q` `b2-kaiji.w` `b2-kaiji.e` `b2-kaiji.r` `b2-kaiji.ex` |
| `b2-keyaru` | 凱亞爾 | — | mage | 近戰 | ✅ | 回復術士的重來人生｜只保留回復能力惡搞：醫療帳單換成護盾與魔力回饋。GGD 惡搞改編，角色… | `b2-keyaru.passive` `b2-keyaru.q` `b2-keyaru.w` `b2-keyaru.e` `b2-keyaru.r` `b2-keyaru.ex` |
| `b2-kisaragi` | 如月電車 | — | tank | 近戰 | ✅ | 如月車站・GGD原創｜一台誤點電車，把整團敵人載去隨機錯站。GGD 惡搞改編，角色辨識元素… | `b2-kisaragi.passive` `b2-kisaragi.q` `b2-kisaragi.w` `b2-kisaragi.e` `b2-kisaragi.r` `b2-kisaragi.ex` |
| `b2-klaus` | 克勞斯 | — | marksman | 遠程 | ✅ | 覺醒了自動機能｜把工作交給自動功能，自己只負責按錯確認。GGD 惡搞改編，角色辨識元素與招… | `b2-klaus.passive` `b2-klaus.q` `b2-klaus.w` `b2-klaus.e` `b2-klaus.r` `b2-klaus.ex` |
| `b2-kumoko` | 蜘蛛子 | — | fighter | 近戰 | ✅ | 轉生成蜘蛛又怎樣｜宅蜘蛛把整張地圖當自己租屋處。GGD 惡搞改編，角色辨識元素與招式創編分… | `b2-kumoko.passive` `b2-kumoko.q` `b2-kumoko.w` `b2-kumoko.e` `b2-kumoko.r` `b2-kumoko.ex` |
| `b2-luckyman` | 幸運超人 | — | tank | 近戰 | ✅ | 幸運超人｜對手每一步都像剛好踩到香蕉皮。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-luckyman.passive` `b2-luckyman.q` `b2-luckyman.w` `b2-luckyman.e` `b2-luckyman.r` `b2-luckyman.ex` |
| `b2-makoto` | 深澄真 | — | mage | 遠程 | ✅ | 月光下的異世界之旅｜商人試射新商品，順便把店面拆了。GGD 惡搞改編，角色辨識元素與招式創… | `b2-makoto.passive` `b2-makoto.q` `b2-makoto.w` `b2-makoto.e` `b2-makoto.r` `b2-makoto.ex` |
| `b2-maomao` | 貓貓 | — | fighter | 遠程 | ✅ | 藥師少女的獨語｜把戰場當試吃會，解毒服務需抽號碼牌。GGD 惡搞改編，角色辨識元素與招式創… | `b2-maomao.passive` `b2-maomao.q` `b2-maomao.w` `b2-maomao.e` `b2-maomao.r` `b2-maomao.ex` |
| `b2-maple` | 梅普露 | — | tank | 近戰 | ✅ | 怕痛的我把防禦力點滿｜不想被打，所以先把附近的人通通變奇怪。GGD 惡搞改編，角色辨識元素… | `b2-maple.passive` `b2-maple.q` `b2-maple.w` `b2-maple.e` `b2-maple.r` `b2-maple.ex` |
| `b2-matthias` | 馬提亞斯 | — | mage | 近戰 | ✅ | 失格紋的最強賢者｜拿舊課本批改敵人，分數直接扣血。GGD 惡搞改編，角色辨識元素與招式創編… | `b2-matthias.passive` `b2-matthias.q` `b2-matthias.w` `b2-matthias.e` `b2-matthias.r` `b2-matthias.ex` |
| `b2-misery` | 米瑟利 | — | mage | 遠程 | ✅ | 來自魔界｜免費贈品，代價寫在放大鏡也看不清的角落。GGD 惡搞改編，角色辨識元素與招式創編… | `b2-misery.passive` `b2-misery.q` `b2-misery.w` `b2-misery.e` `b2-misery.r` `b2-misery.ex` |
| `b2-naofumi` | 岩谷尚文 | — | tank | 近戰 | ✅ | 盾之勇者｜盾牌像交通警察，輸出要申請通行證。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-naofumi.passive` `b2-naofumi.q` `b2-naofumi.w` `b2-naofumi.e` `b2-naofumi.r` `b2-naofumi.ex` |
| `b2-ned` | 青蛙劍士 Ned | — | fighter | 近戰 | ✅ | AVARTH｜青蛙劍士認真揮劍，旁人只注意他到底會不會呱。GGD 惡搞改編，角色辨識元素與… | `b2-ned.passive` `b2-ned.q` `b2-ned.w` `b2-ned.e` `b2-ned.r` `b2-ned.ex` |
| `b2-noor` | 諾爾 | — | tank | 近戰 | ✅ | 我要招架一切｜能擋的擋掉，不能擋的假裝也是擋掉。GGD 惡搞改編，角色辨識元素與招式創編分… | `b2-noor.passive` `b2-noor.q` `b2-noor.w` `b2-noor.e` `b2-noor.r` `b2-noor.ex` |
| `b2-nube` | 鵺野鳴介 | — | tank | 近戰 | ✅ | 靈異教師神眉｜抓鬼兼點名，打架也不能逃早自習。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-nube.passive` `b2-nube.q` `b2-nube.w` `b2-nube.e` `b2-nube.r` `b2-nube.ex` |
| `b2-orphen` | 歐菲 | — | mage | 近戰 | ✅ | 魔術士歐菲｜咒語很帥，結尾永遠是請還錢。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-orphen.passive` `b2-orphen.q` `b2-orphen.w` `b2-orphen.e` `b2-orphen.r` `b2-orphen.ex` |
| `b2-popp` | 何布 | — | mage | 遠程 | ✅ | 神龍之謎｜撤退也是施法距離管理。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-popp.passive` `b2-popp.q` `b2-popp.w` `b2-popp.e` `b2-popp.r` `b2-popp.ex` |
| `b2-rem` | 蕾姆 | — | fighter | 近戰 | ✅ | Re:從零開始｜女僕服務包含拖地與拖走客人。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-rem.passive` `b2-rem.q` `b2-rem.w` `b2-rem.e` `b2-rem.r` `b2-rem.ex` |
| `b2-rin` | 遠坂凜 | — | mage | 遠程 | ✅ | Fate｜把寶石當一次性消耗品，報帳失敗才是致命傷。GGD 惡搞改編，角色辨識元素與招式創… | `b2-rin.passive` `b2-rin.q` `b2-rin.w` `b2-rin.e` `b2-rin.r` `b2-rin.ex` |
| `b2-shadow` | 闇影 | — | fighter | 近戰 | ✅ | 我想成為影之強者｜先安排觀眾站位，再用超大音量講低調。GGD 惡搞改編，角色辨識元素與招式… | `b2-shadow.passive` `b2-shadow.q` `b2-shadow.w` `b2-shadow.e` `b2-shadow.r` `b2-shadow.ex` |
| `b2-shinchan` | 野原新之助 | — | fighter | 遠程 | ✅ | 蠟筆小新｜把戰場當幼稚園運動會，只做童趣惡搞。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-shinchan.passive` `b2-shinchan.q` `b2-shinchan.w` `b2-shinchan.e` `b2-shinchan.r` `b2-shinchan.ex` |
| `b2-sinbad` | 辛巴達 | — | fighter | 近戰 | ✅ | 辛巴達的冒險｜用宴會與推銷開局，最後變成強制商業合作。GGD 惡搞改編，角色辨識元素與招式… | `b2-sinbad.passive` `b2-sinbad.q` `b2-sinbad.w` `b2-sinbad.e` `b2-sinbad.r` `b2-sinbad.ex` |
| `b2-takopi` | 章魚嗶 | — | fighter | 遠程 | ✅ | 章魚嗶的原罪｜開心道具全部誤用，但認真把隊友救回來。GGD 惡搞改編，角色辨識元素與招式創… | `b2-takopi.passive` `b2-takopi.q` `b2-takopi.w` `b2-takopi.e` `b2-takopi.r` `b2-takopi.ex` |
| `b2-touka` | 托卡・史考特 | — | fighter | 近戰 | ✅ | 勇者死了｜挖坑招募勇者，履歷要求不看地板。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-touka.passive` `b2-touka.q` `b2-touka.w` `b2-touka.e` `b2-touka.r` `b2-touka.ex` |
| `b2-uncle` | 異世界舅舅 | — | mage | 遠程 | ✅ | 異世界舅舅｜精靈客服與遊戲攻略，戰鬥全程社交事故。GGD 惡搞改編，角色辨識元素與招式創編… | `b2-uncle.passive` `b2-uncle.q` `b2-uncle.w` `b2-uncle.e` `b2-uncle.r` `b2-uncle.ex` |
| `b2-yogiri` | 高遠夜霧 | — | mage | 遠程 | ✅ | 秒殺外掛太強了｜秒殺外掛改成催眠式下班通知，不按通知的人更倒楣。GGD 惡搞改編，角色辨識… | `b2-yogiri.passive` `b2-yogiri.q` `b2-yogiri.w` `b2-yogiri.e` `b2-yogiri.r` `b2-yogiri.ex` |
| `b2-zenitsu` | 我妻善逸 | — | fighter | 近戰 | ✅ | 鬼滅之刃｜清醒時申請離職，睡著後開始加班。GGD 惡搞改編，角色辨識元素與招式創編分開。 | `b2-zenitsu.passive` `b2-zenitsu.q` `b2-zenitsu.w` `b2-zenitsu.e` `b2-zenitsu.r` `b2-zenitsu.ex` |
| `community-review-01-20260907` | 武藤遊戲 | — | mage | 遠程 | ✅ | 武藤遊戲 社群英雄功能驗收稿。作品：《遊戲王》 | `community-review-01-20260907.passive` `community-review-01-20260907.q` `community-review-01-20260907.w` `community-review-01-20260907.e` `community-review-01-20260907.r` `community-review-01-20260907.ex` |
| `community-review-02-20260907` | 八神庵 | — | fighter | 近戰 | ✅ | 八神庵 社群英雄功能驗收稿。作品：《THE KING OF FIGHTERS》 | `community-review-02-20260907.passive` `community-review-02-20260907.q` `community-review-02-20260907.w` `community-review-02-20260907.e` `community-review-02-20260907.r` `community-review-02-20260907.ex` |
| `community-review-03-20260907` | 不知火舞 | — | fighter | 近戰 | ✅ | 不知火舞 社群英雄功能驗收稿。作品：《THE KING OF FIGHTERS》 | `community-review-03-20260907.passive` `community-review-03-20260907.q` `community-review-03-20260907.w` `community-review-03-20260907.e` `community-review-03-20260907.r` `community-review-03-20260907.ex` |
| `community-review-04-20260907` | 空條承太郎 | — | fighter | 近戰 | ✅ | 空條承太郎 社群英雄功能驗收稿。作品：《JoJo 的奇妙冒險》 | `community-review-04-20260907.passive` `community-review-04-20260907.q` `community-review-04-20260907.w` `community-review-04-20260907.e` `community-review-04-20260907.r` `community-review-04-20260907.ex` |
| `community-review-05-20260907` | 洛克人 | — | marksman | 遠程 | ✅ | 洛克人 社群英雄功能驗收稿。作品：《Mega Man》 | `community-review-05-20260907.passive` `community-review-05-20260907.q` `community-review-05-20260907.w` `community-review-05-20260907.e` `community-review-05-20260907.r` `community-review-05-20260907.ex` |
| `community-review-06-20260907` | 卡比 | — | tank | 近戰 | ✅ | 卡比 社群英雄功能驗收稿。作品：《星之卡比》 | `community-review-06-20260907.passive` `community-review-06-20260907.q` `community-review-06-20260907.w` `community-review-06-20260907.e` `community-review-06-20260907.r` `community-review-06-20260907.ex` |
| `community-review-07-20260907` | 西索 | — | fighter | 近戰 | ✅ | 西索 社群英雄功能驗收稿。作品：《HUNTER×HUNTER》 | `community-review-07-20260907.passive` `community-review-07-20260907.q` `community-review-07-20260907.w` `community-review-07-20260907.e` `community-review-07-20260907.r` `community-review-07-20260907.ex` |
| `community-review-08-20260907` | 米卡莎 | — | fighter | 近戰 | ✅ | 米卡莎 社群英雄功能驗收稿。作品：《進擊的巨人》 | `community-review-08-20260907.passive` `community-review-08-20260907.q` `community-review-08-20260907.w` `community-review-08-20260907.e` `community-review-08-20260907.r` `community-review-08-20260907.ex` |
| `community-review-09-20260907` | 赫蘿 | — | fighter | 遠程 | ✅ | 赫蘿 社群英雄功能驗收稿。作品：《狼與辛香料》 | `community-review-09-20260907.passive` `community-review-09-20260907.q` `community-review-09-20260907.w` `community-review-09-20260907.e` `community-review-09-20260907.r` `community-review-09-20260907.ex` |
| `community-review-10-20260907` | 魯路修 | — | fighter | 遠程 | ✅ | 魯路修 社群英雄功能驗收稿。作品：《Code Geass 反叛的魯路修》 | `community-review-10-20260907.passive` `community-review-10-20260907.q` `community-review-10-20260907.w` `community-review-10-20260907.e` `community-review-10-20260907.r` `community-review-10-20260907.ex` |
| `community-review-11-20260907` | 利姆路 | — | mage | 近戰 | ✅ | 利姆路 社群英雄功能驗收稿。作品：《關於我轉生變成史萊姆這檔事》 | `community-review-11-20260907.passive` `community-review-11-20260907.q` `community-review-11-20260907.w` `community-review-11-20260907.e` `community-review-11-20260907.r` `community-review-11-20260907.ex` |
| `community-review-12-20260907` | 衛宮士郎 | — | mage | 近戰 | ✅ | 衛宮士郎 社群英雄功能驗收稿。作品：《Fate/stay night》 | `community-review-12-20260907.passive` `community-review-12-20260907.q` `community-review-12-20260907.w` `community-review-12-20260907.e` `community-review-12-20260907.r` `community-review-12-20260907.ex` |
| `community-review-13-20260907` | 朝田詩乃 | — | marksman | 遠程 | ✅ | 朝田詩乃 社群英雄功能驗收稿。作品：《刀劍神域》 | `community-review-13-20260907.passive` `community-review-13-20260907.q` `community-review-13-20260907.w` `community-review-13-20260907.e` `community-review-13-20260907.r` `community-review-13-20260907.ex` |
| `community-review-14-20260907` | 殺老師 | — | fighter | 近戰 | ✅ | 殺老師 社群英雄功能驗收稿。作品：《暗殺教室》 | `community-review-14-20260907.passive` `community-review-14-20260907.q` `community-review-14-20260907.w` `community-review-14-20260907.e` `community-review-14-20260907.r` `community-review-14-20260907.ex` |
| `community-review-15-20260907` | 比利海靈頓 | — | tank | 近戰 | ✅ | 比利海靈頓 社群英雄功能驗收稿。來源：摔角與網路迷因形象。 | `community-review-15-20260907.passive` `community-review-15-20260907.q` `community-review-15-20260907.w` `community-review-15-20260907.e` `community-review-15-20260907.r` `community-review-15-20260907.ex` |
| `community-review-16-20260907` | 魔法少女☆伊莉雅 | — | mage | 遠程 | ✅ | 魔法少女☆伊莉雅 社群英雄功能驗收稿。作品：《Fate/kaleid liner 魔法少女… | `community-review-16-20260907.passive` `community-review-16-20260907.q` `community-review-16-20260907.w` `community-review-16-20260907.e` `community-review-16-20260907.r` `community-review-16-20260907.ex` |
| `community-review-17-20260907` | 安茲·烏爾·恭 | — | mage | 遠程 | ✅ | 安茲·烏爾·恭 社群英雄功能驗收稿。作品：《OVERLORD》 | `community-review-17-20260907.passive` `community-review-17-20260907.q` `community-review-17-20260907.w` `community-review-17-20260907.e` `community-review-17-20260907.r` `community-review-17-20260907.ex` |
| `community-review-18-20260907` | 吉爾伽美什 | — | marksman | 遠程 | ✅ | 吉爾伽美什 社群英雄功能驗收稿。作品：《Fate》 | `community-review-18-20260907.passive` `community-review-18-20260907.q` `community-review-18-20260907.w` `community-review-18-20260907.e` `community-review-18-20260907.r` `community-review-18-20260907.ex` |
| `community-review-19-20260907` | 桐谷和人 | — | fighter | 近戰 | ✅ | 桐谷和人 社群英雄功能驗收稿。作品：《刀劍神域》 | `community-review-19-20260907.passive` `community-review-19-20260907.q` `community-review-19-20260907.w` `community-review-19-20260907.e` `community-review-19-20260907.r` `community-review-19-20260907.ex` |
| `community-review-20-20260907` | 御坂美琴 | — | mage | 遠程 | ✅ | 御坂美琴 社群英雄功能驗收稿。作品：《科學超電磁砲》 | `community-review-20-20260907.passive` `community-review-20-20260907.q` `community-review-20-20260907.w` `community-review-20-20260907.e` `community-review-20-20260907.r` `community-review-20-20260907.ex` |
| `community-review-21-20260907` | 鹿目圓 | — | fighter | 遠程 | ✅ | 鹿目圓 社群英雄功能驗收稿。作品：《魔法少女小圓》 | `community-review-21-20260907.passive` `community-review-21-20260907.q` `community-review-21-20260907.w` `community-review-21-20260907.e` `community-review-21-20260907.r` `community-review-21-20260907.ex` |
| `community-review-22-20260907` | 菜月昴 | — | tank | 近戰 | ✅ | 菜月昴 社群英雄功能驗收稿。作品：《Re:從零開始的異世界生活》 | `community-review-22-20260907.passive` `community-review-22-20260907.q` `community-review-22-20260907.w` `community-review-22-20260907.e` `community-review-22-20260907.r` `community-review-22-20260907.ex` |
| `community-review-23-20260907` | 坂田銀時 | — | fighter | 近戰 | ✅ | 坂田銀時 社群英雄功能驗收稿。作品：《銀魂》 | `community-review-23-20260907.passive` `community-review-23-20260907.q` `community-review-23-20260907.w` `community-review-23-20260907.e` `community-review-23-20260907.r` `community-review-23-20260907.ex` |
| `community-review-24-20260907` | 奇犽 | — | fighter | 近戰 | ✅ | 奇犽 社群英雄功能驗收稿。作品：《HUNTER×HUNTER》 | `community-review-24-20260907.passive` `community-review-24-20260907.q` `community-review-24-20260907.w` `community-review-24-20260907.e` `community-review-24-20260907.r` `community-review-24-20260907.ex` |
| `community-review-25-20260907` | 一拳超人 | — | fighter | 近戰 | ✅ | 一拳超人 社群英雄功能驗收稿。作品：《一拳超人》 | `community-review-25-20260907.passive` `community-review-25-20260907.q` `community-review-25-20260907.w` `community-review-25-20260907.e` `community-review-25-20260907.r` `community-review-25-20260907.ex` |
| `community-review-26-20260907` | 名偵探柯南 | — | marksman | 遠程 | ✅ | 名偵探柯南 社群英雄功能驗收稿。作品：《名偵探柯南》 | `community-review-26-20260907.passive` `community-review-26-20260907.q` `community-review-26-20260907.w` `community-review-26-20260907.e` `community-review-26-20260907.r` `community-review-26-20260907.ex` |
| `community-review-27-20260907` | 庫洛魔法使 | — | fighter | 遠程 | ✅ | 庫洛魔法使 社群英雄功能驗收稿。作品：《庫洛魔法使》 | `community-review-27-20260907.passive` `community-review-27-20260907.q` `community-review-27-20260907.w` `community-review-27-20260907.e` `community-review-27-20260907.r` `community-review-27-20260907.ex` |
| `community-review-28-20260907` | 艾莉絲·伯雷亞斯·格雷拉特 | — | fighter | 近戰 | ✅ | 艾莉絲·伯雷亞斯·格雷拉特 社群英雄功能驗收稿。作品：《無職轉生》 | `community-review-28-20260907.passive` `community-review-28-20260907.q` `community-review-28-20260907.w` `community-review-28-20260907.e` `community-review-28-20260907.r` `community-review-28-20260907.ex` |
| `community-review-29-20260907` | 芙莉蓮 | — | mage | 遠程 | ✅ | 芙莉蓮 社群英雄功能驗收稿。作品：《葬送的芙莉蓮》 | `community-review-29-20260907.passive` `community-review-29-20260907.q` `community-review-29-20260907.w` `community-review-29-20260907.e` `community-review-29-20260907.r` `community-review-29-20260907.ex` |
| `community-review-30-20260907` | 尼古貓貓 | — | mage | 遠程 | ✅ | 尼古貓貓 社群英雄功能驗收稿。作品識別：《ヤニねこ／尼古喵喵》 | `community-review-30-20260907.passive` `community-review-30-20260907.q` `community-review-30-20260907.w` `community-review-30-20260907.e` `community-review-30-20260907.r` `community-review-30-20260907.ex` |
| `community-review-31-20260907` | SUN樂 | — | fighter | 近戰 | ✅ | SUN樂 社群英雄功能驗收稿。作品：《香格里拉・開拓異境》 | `community-review-31-20260907.passive` `community-review-31-20260907.q` `community-review-31-20260907.w` `community-review-31-20260907.e` `community-review-31-20260907.r` `community-review-31-20260907.ex` |
| `community-review-32-20260907` | 阿薩謝爾 | — | mage | 近戰 | ✅ | 阿薩謝爾 社群英雄功能驗收稿。作品：《召喚惡魔／よんでますよ、アザゼルさん。》 | `community-review-32-20260907.passive` `community-review-32-20260907.q` `community-review-32-20260907.w` `community-review-32-20260907.e` `community-review-32-20260907.r` `community-review-32-20260907.ex` |
| `community-review-33-20260907` | 近衛刀太 | — | fighter | 近戰 | ✅ | 近衛刀太 社群英雄功能驗收稿。作品：《UQ HOLDER!》 | `community-review-33-20260907.passive` `community-review-33-20260907.q` `community-review-33-20260907.w` `community-review-33-20260907.e` `community-review-33-20260907.r` `community-review-33-20260907.ex` |
| `community-review-34-20260907` | 高速婆婆 | — | fighter | 近戰 | ✅ | 高速婆婆 社群英雄功能驗收稿。作品：《膽大黨》 | `community-review-34-20260907.passive` `community-review-34-20260907.q` `community-review-34-20260907.w` `community-review-34-20260907.e` `community-review-34-20260907.r` `community-review-34-20260907.ex` |
| `community-review-35-20260907` | 炭治郎 | — | fighter | 近戰 | ✅ | 炭治郎 社群英雄功能驗收稿。作品：《鬼滅之刃》 | `community-review-35-20260907.passive` `community-review-35-20260907.q` `community-review-35-20260907.w` `community-review-35-20260907.e` `community-review-35-20260907.r` `community-review-35-20260907.ex` |
| `community-review-36-20260907` | 鬼畜王蘭斯 | — | fighter | 近戰 | ✅ | 鬼畜王蘭斯 社群英雄功能驗收稿。作品：《鬼畜王蘭斯／Rance》 | `community-review-36-20260907.passive` `community-review-36-20260907.q` `community-review-36-20260907.w` `community-review-36-20260907.e` `community-review-36-20260907.r` `community-review-36-20260907.ex` |
| `community-review-37-20260907` | 吉伊卡哇 | — | tank | 近戰 | ✅ | 吉伊卡哇 社群英雄功能驗收稿。作品：《吉伊卡哇》 | `community-review-37-20260907.passive` `community-review-37-20260907.q` `community-review-37-20260907.w` `community-review-37-20260907.e` `community-review-37-20260907.r` `community-review-37-20260907.ex` |
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
| `lol-karthus` | 卡爾瑟斯 | — | mage | 遠程 | ✅ | 在陣地間敲響暮鐘，使用延遲爆破、持續領域與有預警的遠端轟擊。 | `lol-karthus.passive` `lol-karthus.q` `lol-karthus.w` `lol-karthus.e` `lol-karthus.r` `lol-karthus.ex` |
| `lol-leesin` | 李星 | — | fighter | 近戰 | ✅ | 以聲波探擊、短程進身、護身與踢離敵人的連續節奏作戰。 | `lol-leesin.passive` `lol-leesin.q` `lol-leesin.w` `lol-leesin.e` `lol-leesin.r` `lol-leesin.ex` |
| `lol-lux` | 拉克絲 | — | fighter | 遠程 | ✅ | 結合光束、短效束縛與護盾，以清楚的施法提示協助隊伍創造進攻空間。 | `lol-lux.passive` `lol-lux.q` `lol-lux.w` `lol-lux.e` `lol-lux.r` `lol-lux.ex` |
| `lol-missfortune` | 好運姐 | — | marksman | 遠程 | ✅ | 以雙重射擊、機動增益與持續彈雨控制交戰區域。 | `lol-missfortune.passive` `lol-missfortune.q` `lol-missfortune.w` `lol-missfortune.e` `lol-missfortune.r` `lol-missfortune.ex` |
| `lol-warwick` | 沃維克 | — | fighter | 近戰 | ✅ | 循血追擊的近戰獵手，以短程撲擊、持續汲取與壓制連段作戰。 | `lol-warwick.passive` `lol-warwick.q` `lol-warwick.w` `lol-warwick.e` `lol-warwick.r` `lol-warwick.ex` |
| `lol-xerath` | 齊勒斯 | — | mage | 遠程 | ✅ | 以蓄能光路、落點爆破與定身咒彈控制距離，施放有限次數的奧術轟擊。 | `lol-xerath.passive` `lol-xerath.q` `lol-xerath.w` `lol-xerath.e` `lol-xerath.r` `lol-xerath.ex` |
| `lol-yasuo` | 犽宿 | — | fighter | 近戰 | ✅ | 以短程穿行與風刃連擊掌握距離，使用防護姿態承受反擊。 | `lol-yasuo.passive` `lol-yasuo.q` `lol-yasuo.w` `lol-yasuo.e` `lol-yasuo.r` `lol-yasuo.ex` |

## 2. 未開放 not in the open roster（23）

文件存在、資料完整，但白名單沒放行，所以選角畫面看不到、bot 也不會抽到。

| id | 全名 | 稱號 | role | 攻擊 | 開放 | 一句話說明 | 技能 id（天生 Q W E R EX） |
|---|---|---|---|---|---|---|---|
| `b2-maple-alt-9769eb88b85b` | 梅普露（變身） | — | tank | 近戰 | — | 怕痛的我把防禦力點滿｜不想被打，所以先把附近的人通通變奇怪。GGD 惡搞改編，角色辨識元素… | `b2-maple.passive` `b2-maple.q` `b2-maple.w` `b2-maple.e` `b2-maple.r` `b2-maple.ex` |
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


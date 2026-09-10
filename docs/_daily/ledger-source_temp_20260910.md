# 逐則對票 · owner 原話全文 2026-09-10

> ⭐ `docs/_daily/2026-09-10.md` 的表格那一格是**截斷**過的,全文在這裡。
> 由 `scripts/message-ledger.sh` 從 session transcript 產生 —— ⛔ 不要手改。
> `scripts/asked-before.sh` 會 grep 這一份找 owner 的原話。

## 01:46

什麼時候81支才能上架阿？

## 02:00

fix #1157 #1158
你還要多久才能上架81支跟11回合

## 02:07

我給你一張清單 請你全部抓取模型下來 轉換成可以遊戲可使用的格式 包含 3d model 與動作

## 02:15

以為合併完編輯器的程式，剩下81個英雄只是透過編輯器匯入而已

編輯器程式合併、部署後，剩下就是把現有 81 份英雄專案透過編輯器匯入、投稿，再由後台核准上架。
目前處理的 22 個衝突，是兩個程式分支合併時的障礙。81 份英雄內容已備妥並完整保留；後續只處理實際匯入或上架失敗，不重新設計、逐招調整或重跑額外驗收。先前把這兩段工作混著說，讓流程顯得更複雜，是我說明不清。

## 02:15

合併衝突與兩份過期的契約指紋已修好；69 項檢查通過，修正後的協調文件檢查也通過。現在收尾既有 Editor 發行檢查與提交，接下來就交 Main 合併部署，再走你說的 81 份匯入上架流程。

## 02:17

login !

## 02:27

其實有很多支在 全角色模型盤點.md 裡面都有對應新模型了 所以可以設定為低優先權購買
此外，一些原創角色可暫時用 w3x 算是中優先權購買 剩下完全沒有模組才是高優先權
請你重新列出讓我取捨

請你記得全部做完要更新 全角色模型盤點.md 登錄對應模型可被使用到

## 02:35

什麼是通道上限？

## 02:38

太低了 至少要有 300以上每個

## 02:41

程式上限超過會怎樣嗎？ 一開始設定的理由是什麼？為什麼不能設定我的300

## 02:49

全角色模型盤點.md

## 02:49

新角色 81支裡的優先下載

## 02:57

LOL角色已經都有抓過模組跟動作了 不必考慮 只需要登記就好

不對 你應該是要以我給你的清單為最高準則對應角色 3d_model_great_again_plan.md

## 03:00

我給你的清單是最優先抓取的，但清單中有些是未上架或未實作的英雄 就列到最低優先權 這樣懂了嗎

Berserker	海克力斯 明明就有對應模組可以用 不優先考慮下載 你是不是搞錯了什麼？ 你可以查看看有一個轉換名單來自 300英雄才對 這個是不用付錢下載的 以及有些相近模組 或改貼圖也可接受 都是免費的

## 03:00

我說過 GGD原創角色是中優先度

## 03:03

新上架的81個英雄 你要列為高優先權購買阿 除非300英雄已經有直接或相似替代

## 03:06

等等你先別作

## 03:19

已更新盤點並 commit＋push：bb349af78。
- 可用的 300英雄本尊模型優先。
- 僅你列出的 11 組加工替身可納入預設。
- 其他相似模型只保留候選，不自動採用。
- 付費來源依此重新標記順位，尚未進行付費下載。
全角色模型盤點.md
統一共編入口

## 03:20

https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/asset-library/README.md

## 03:29

我儲值了 請你查看重新思考購買策略

## 03:36

你查看一下 全角色盤點模型.md 別的工作流很努力去找其他 mod 網站 魔獸自訂地圖網站 來抓取相同角色模型替代省錢

## 03:45

⇒ 我可以把這兩樣回寫進 download-sources.json，讓那條工作流不必重跑。要我做嗎？那是純資料合併，⛔ 不花一毛錢。 => ok

你自己也可以找 mod, war3 地圖網站等來源 自己轉換吧？ 如果三小時後你已經都找不到了，那你就重新整理購買清單來購買吧

## 13:37

你可以查看最新 全角色模型盤點.md 來看你可以找哪些角色模組進來

## 13:45

你抓的所有資源模組都要存起來 變成角色可以在後台下拉選單選擇的選項之一喔 切記  全角色盤點.md 的第一守則 因為同時會有很多平行工作流出去找 全部都要歸檔可被選擇

## 13:49

12 筆已對應、5 筆未對應（貞子／阿強一號／胖虎／異形／鋼彈 —— GGD 還沒有這些英雄卡）
=> 這些角色都有 只是未上架而已

買33

## 13:51

81支上架跟11回合 的進度如何 你已經跑一整個晚上了

## 17:12

給我中文

## 17:19

相似圖採用報告 你應該要自己打開擷真實圖

## 17:21

68 / 82（14 名盤點表記為「還沒有模型」）是哪14個

## 17:25

都可使用 標注來源就好

## 17:36

重建實拍台 記得每次都要留底 不要被刪

## 17:39

37 名英雄一句戰鬥語音都沒有	要錄音	技能喊招／受擊／擊殺／陣亡全缺。不擋選角，先前就紅
0 句名言刻意留空	要來源	每一句都有機器可讀的理由。查不到就留空——編一句會被當成原作台詞，而沒有測試分得出來

請你做一個81英雄語音補檔計劃書.md 裡面寫著如何透過我們之前寫好的 Cozyoice語音生成來自動話產生，我打算讓一個乾淨新工作流來製作

## 17:41

一起拍完

## 17:43

yes

## 17:45

我們上傳git的規則是 成品一律上傳至git, 剩下半成品、來源、準備材料等都進 S3

## 17:47

我們上傳git的規則是 成品一律上傳至git, 剩下半成品、來源、準備材料等都進 S3

## 17:50

我們這批轉換 其實已經有很多是GGD本來就有模型，所以要請你合併時小心是增量多選項 而不是覆蓋

## 17:55

我舉例 依文 已經有模型，現在你新增新模型 依文這個角色要能在後台下拉選單選擇哪個是預設，商店也要能選擇是否上架這個模型被選擇可讓玩家購買動態替換

## 17:56

我們上傳git的規則是 成品一律上傳至git, 剩下半成品、來源、準備材料等都進 S3 (本機全保留)

## 17:57

讀 /Users/Takuro/GGD/docs/81英雄語音補檔計劃書.md，照它執行。

任務：74 名新英雄（37 個 b2-* ＋ 37 個 community-review-*）一句戰鬥語音都沒有，
用 voice-reference-pipeline（CosyVoice 3）補完 11 格：
select · skill-name.{q,w,e,r,ex} · hurt · hurt-heavy · kill-1 · victory · defeat

⛔ 排除 LOL 7 名（lol-lux/missfortune/xerath/karthus/yasuo/warwick/leesin）——
owner 說他們有自己的語音檔。⚠️ 但那份是哪裡來的**要先問 owner**，
名言 lane 查證過 Data Dragon 沒有出語音行。

⭐ 核心原則：⛔ 不編造任何角色台詞。11 格拆三類——
A 技能喊招 5 格 ⇒ 用英雄自己的技能名（已驗 75/75 名四格全齊）
B 非語意發聲 4 格 ⇒ 吼／悶哼／喘／倒地，本來就不是句子
C select + victory 2 格 ⇒ 建議唸自己的名字＋稱號，⛔ 不要憑印象寫原作台詞

⭐ 開工前先做三件（前幾條 lane 每一條都踩到）：
1. 基準用**這個 checkout 的本機 main**，⛔ 不是 origin/main（後者落後 70+ commit 且從未 push）
2. 可能沒有 node_modules ⇒ pnpm install --frozen-lockfile（lockfile ⛔ 不可改）
3. 讀 /Users/Takuro/GGD/CLAUDE.md，它 override 一切預設

⭐ git/S3 分界（owner 2026-09-10）：成品一律進 git，半成品／來源／準備材料進 S3。
⇒ 戰鬥語音 mp3 與 manifest 進 git；incoming/ 參考音與 approved/processed 的
prompt_wav 進 S3（bucket ggd-390630837668-ap-east-2-an, profile vibe-coding, ap-east-2）。
⛔ 不要讀/印/改任何 AWS 憑證；AccessDenied ⇒ 回報是哪個 action+resource，⛔ 不要繞過。

⭐ 每個 mp3 驗兩個軸（長度 ≥0.15s 且 max_volume ≥ −60dB），
而且量尺要先自證兩個方向：已知靜音要量到 ≈−91dB、已知有聲要量到 ≈−1.4dB。
⛔ 量不到 ⇒ 這台量尺的結論全部作廢。（踩過：say -v Kyoko「貓貓」＝0.030 秒靜音）

⛔ 硬性：不要跑 pnpm skills:sync · 動 content/ 前先 bash scripts/genguard.sh <path> ·
commit 一律 git commit -F <msg> --pathspec-from-file=<清單>（⛔ 不要 git add／-a／--amend，
⚠️ 有檔名帶空白，⛔ 不要 tr '\n' ' '）· ⛔ 絕對不要 push/deploy/碰正式站 ·
測試預算 vitest ≤3 次、typecheck 1 次、突變一批一條 ·
用詞紀律：終端證據前只准說「鏈路已接上，⛔ 未驗收」

驗收：apps/client/src/audio/combatVoiceCoverage.test.ts 從 🔴 轉 🟢，
其餘語音閘（quotePackIntegrity · champQuotesGeneratorRuns · pnpm voices:check）保持綠。

## 17:58

要講什麼名言 請你給我名單就好 不要自己產 我會手動填寫

## 18:08

有除了模型跟語音以外的議題你可以處理嗎

## 18:10

⇒ 所以依文潔琳現在的狀態是：imported.long 是預設、ou99.470426 掛在 skin 上，⛔ 而下拉選單裡兩個都看不到。
=> 模型選項 不是替換skin而已吧？ 是替換模型

## 18:16

先查

## 18:21

OK

## 18:29

跑完

## 18:32

你自己上網查好嗎

## 18:50

我回答過好幾次了 你不是有對話開票 怎麼還來問我開11回合這種我回答到爛得問題

## 19:10

你待命幹嘛 你要把81英雄跟11回合搞完阿 模型跟音效語音別的工作流正在努力中

## 19:29

貼圖圖集跟減面的優化 還是可以做的 是獨立考量

## 19:43

先回報一個大問題 我們合成不講中文 只講日文 並且有原檔 已經足夠表達該意思 我們就直接採用 例如 卡比 不會唸出招式名稱 所以根本就不用合成直接用就好

## 19:58

已推送，可立即使用：

* [角色語音索引.md（本機）](/Users/Takuro/Dropbox/我的 Mac (Moriya.local\)/Documents/ABxVFX_EDIT/角色語音索引.md)
* [Git 共編版](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/hero-model-library/角色語音索引.md)

目前 78,756 個音訊檔，文件含一鍵複製說明、角色／來源查詢及本機絕對路徑。不用等 S3。
已 commit＋push：`85393154a`。

## 21:19

參考音聽審 根本出不來

## 21:23

部署完成跑煙霧測試 確定130個都上線進白名單  
補發講81英雄跟十一回合 dicord 跟 github都發詳細 因為這次是重大改版

## 21:30

我聽審完了 絕大部分音源檔 都是對的 但是合成音出來的聲線風格卻非常不像 你可以查看發生什麼事情了嗎？ 是合成模型 還是參數得問題？

## 21:37

重轉160 顆

哆啦A夢是 GGD 還沒有這位英雄的卡=> 小叮噹沒有嗎？

## 21:44

[角色語音索引](/Users/Takuro/Dropbox/我的 Mac (Moriya.local\)/Documents/ABxVFX_EDIT/GGD-hero-model-options/materials/hero-model-library/角色語音索引.md)。全庫目前 152,738 個音訊檔可直接讀本機 

請你重新對應所有角色語音(130+未上架) 如果有命中 做成一個頁面讓我播放檢查後 替換過去 舊檔就備份到S3歸檔 新檔上git

## 21:50

貼圖圖集 應該也可以縮小尺寸及壓縮到可接受的程度嗎 因為我們不是在做4k遊戲 頂多HD1080

## 21:53

驗收合併阿

## 22:15

你目前轉換完成的模型已經 commit + push 變成後台跟編輯器可以套用的選項了嗎？ 特別是對那些連預設模型的角色確保一定都有模型了

menu/dragon2.glb 根本只有剪影 貼圖根本沒差

## 22:27

PR 開好了 → 
#1182（分支 codex/model-pipeline-20260910，11 個 commit）請合併

## 22:30

17位佔位 是哪些列表給我

## 22:34

你得替換跟保留 我搞的好亂 替換哪個 保留又是哪個

## 22:37

⭐ ou99 有登記、標「優先下載」	6（#1–6）	⭐ 這條工作流 —— 我可以直接買下來轉換上架
⚠️ 被預算擋住的相似模型	2（#14–15）	
#1174 貼圖圖集做完就能
=> go!

## 22:43

我覺得你有點亂配 把 joke配對到受傷 以及一些技能招式 不是剛好對上 QWER 你要記得挪位 例如勝利約束之劍 在GGD不是R而是E 請你重新檢查過一輪我再來審查

## 22:44

然後我們有個規則是 只配對講日文 所以有些語音是中文 就不要配對上來了

## 22:45

語音跟模型 都還再陸續準備中

## 23:00

我看一下第二層是哪些

## 23:01

第三層呢

## 23:05

我再給你一次完整名單 你交叉比對一下

3d model great again plan

目前已補上相似或本尊的角色，待整合 
初號機 https://www.ou99.com/thread-498341-1-1.html
哆啦A夢 https://www.ou99.com/thread-496905-1-2.html
貞子 https://www.ou99.com/thread-480489-1-1.html
阿強一號 https://www.ou99.com/thread-485012-1-1.html
拳四郎 https://www.ou99.com/thread-464696-1-70.html (變身保持放大皮卡丘)
獵人 西索 https://www.ou99.com/thread-497211-1-3.html
狼與辛香料 赫蘿 https://www.ou99.com/thread-468771-1-49.html
轉生史萊姆 利姆路 https://www.ou99.com/forum.php?mod=viewthread&tid=457280
暗殺教室 殺老師 https://www.ou99.com/thread-472112-1-41.html
比利海靈頓 https://www.ou99.com/thread-457123-1-139.html
藥師少女的獨語 貓貓 https://www.ou99.com/thread-467165-1-56.html
去死團的逆襲 死之王 https://www.ou99.com/thread-459087-1-34.html
胖虎 https://www.ou99.com/thread-496746-1-1.html
轉生蜘蛛 蜘蛛子 https://www.ou99.com/thread-478121-1-1.html
鬼滅之刃 善逸 https://www.ou99.com/thread-454069-1-1.html
鬼滅之刃 炭治郎 https://www.ou99.com/thread-466002-1-1.html
去死團的逆襲 熊貓 https://www.ou99.com/thread-463344-1-1.html
志志雄真實 https://www.ou99.com/thread-476060-1-1.html
月光下的異世界之旅 深澄真https://www.ou99.com/thread-478642-1-71.html
吉伊卡哇 https://www.ou99.com/thread-459617-1-199.html
烙印勇士 凱茲 https://www.ou99.com/thread-460977-1-184.html
刀劍神域 阿絲娜 https://www.ou99.com/thread-470467-1-1.html
HUNTER×HUNTER 傑・富力士 https://www.ou99.com/thread-458241-1-1.html
HUNTER×HUNTER 揍敵客阿福 https://www.ou99.com/thread-472410-1-1.html
神龍之謎 巴恩大魔王(變身後) https://www.ou99.com/thread-457883-1-1.html
神龍之謎 巴恩大魔王(變身前) https://www.ou99.com/thread-472035-1-98.html
我要招架一切 諾爾 https://www.ou99.com/thread-453949-1-1.html
勇者死了 托卡・史考特 https://www.ou99.com/thread-459257-1-1.html
中華一番 小當家 https://www.ou99.com/thread-498407-1-1.html
犬夜叉 https://www.ou99.com/thread-452782-1-1.html
芙莉蓮 https://www.ou99.com/thread-457780-1-1.html
JoJo冒險野郎 空條承太郎 https://www.ou99.com/thread-497213-1-13.html 
魔笛 MAGI 阿拉丁 https://www.ou99.com/thread-473324-1-1.html
去死去死團的逆襲 白木卡迪那 https://www.ou99.com/thread-470225-1-107.html
盾之勇者成名錄 岩谷尚文 https://www.ou99.com/thread-470782-1-104.html (刀劍移除)
轉生成自動販賣機 阿箱＋拉蜜絲 https://www.ou99.com/thread-491448-1-32.html (外加一個白色矩形販賣機在背後)
魔笛 MAGI 辛巴達 https://www.ou99.com/thread-491497-1-32.html
魔術士歐菲 https://www.ou99.com/thread-496452-1-16.html
覺醒了自動機能的十五年無成冒險者 克勞斯 https://www.ou99.com/thread-487487-1-46.html
靈異教師神眉 鵺野鳴介 https://www.ou99.com/thread-487484-1-47.html
去死去死團的逆襲 黑人牙膏 https://www.ou99.com/thread-495978-1-18.html
臭作 https://www.ou99.com/thread-456546-1-240.html
異世界舅舅https://www.ou99.com/thread-454482-1-265.html
洛克人 https://www.ou99.com/thread-287871-1-716.html
KOF 八神庵 https://www.ou99.com/thread-313646-1-624.html
我想成為影之強者https://www.ou99.com/thread-481732-1-62.html
尼古貓貓 https://www.ou99.com/thread-498214-1-7.html
重騎士以遊戲知識開無雙 艾爾瑪  https://www.ou99.com/thread-472038-1-98.html
去死去死團的逆襲 至尊學長「飛鼠先生」https://www.ou99.com/thread-469191-1-111.html
Re:從零開始的異世界生活 菜月昴 https://www.ou99.com/thread-311294-1-694.html 
UQHOLDER 近衛刀太 https://www.ou99.com/thread-470087-1-1.html
膽大黨 高速婆婆 https://www.ou99.com/thread-458013-1-1.html
鬼畜王蘭斯 https://www.ou99.com/thread-493578-1-1.html
這個世界漏洞百出 羽賀 https://www.ou99.com/thread-495015-1-1.html
回復術士的重來人生 凱亞爾 https://www.ou99.com/thread-458777-1-1.html (斗篷綠色、頭髮黃色)
異世界転移魔法剣士 楓 https://www.ou99.com/thread-474258-1-1.html
失格紋的最強賢者 馬提亞斯  https://www.ou99.com/thread-465884-1-1.html
賭博默示錄 伊藤開司 https://www.ou99.com/thread-457710-1-1.html
致不滅的你 不死 https://www.ou99.com/thread-467227-1-1.html
蠟筆小新 野原新之助 https://www.ou99.com/thread-457874-1-1.html
AVARTH 青蛙劍士 Ned https://www.ou99.com/thread-456917-1-1.html
幸運超人 https://www.ou99.com/thread-457594-1-1.html (胸口補寫大吉)
科學超電磁砲 御坂美琴 https://www.ou99.com/thread-283718-1-718.html
異形 https://www.ou99.com/thread-312479-1-687.html
Fate 遠坂凜 https://www.ou99.com/thread-310996-1-697.html
Fate Berserker https://www.ou99.com/thread-328403-1-516.html
魯魯修 https://www.ou99.com/thread-413694-1-376.html
瘋狂假面 https://www.ou99.com/thread-455144-1-258.html
獵人 奇犽 https://www.ou99.com/thread-497400-1-12.html
英雄王吉爾伽美什 https://www.ou99.com/thread-497746-1-10.html 

此區為加購選項區
殺生丸 (可加購替換選項)
https://www.ou99.com/thread-463252-1-160.html
https://www.ou99.com/thread-474798-1-86.html
https://www.ou99.com/thread-467258-1-123.html
索隆 (可加購替換選項)
https://www.ou99.com/thread-454064-1-1.html
https://www.ou99.com/thread-455488-1-1.html
夜神月 (可加購替換選項)
https://www.ou99.com/thread-451392-1-1.html
https://www.ou99.com/thread-433442-1-335.html
鋼彈 (可加購替換選項)
https://www.ou99.com/thread-472273-1-1.html
https://www.ou99.com/thread-494307-1-1.html
https://www.ou99.com/thread-493659-1-24.html
魯夫 (可加購替換選項)
https://www.ou99.com/thread-497129-1-1.html
https://www.ou99.com/thread-497483-1-12.html
賽菲洛斯 (可加購替換選項)
https://www.ou99.com/thread-474312-1-1.html
https://www.ou99.com/thread-453337-1-280.html
夏娜 (可加購替換選項)
https://www.ou99.com/thread-478203-1-1.html
劍心 (可加購替換選項)
https://www.ou99.com/thread-487482-1-1.html
https://www.ou99.com/thread-470351-1-106.html
呂布 (可加購替換選項)
https://www.ou99.com/thread-487191-1-1.html
https://www.ou99.com/thread-407884-1-384.html
https://www.ou99.com/thread-498472-1-6.html
桔梗 (可加購替換選項)
https://www.ou99.com/thread-406299-1-388.html
皮卡丘  (可加購替換選項)
https://www.ou99.com/thread-497398-1-1.html
https://www.ou99.com/thread-478915-1-70.html
七龍珠 孫悟空  (可加購替換選項)
https://www.ou99.com/thread-499084-1-2.html
https://www.ou99.com/thread-497131-1-14.html
BLEACH 黑崎一護  (可加購替換選項)
https://www.ou99.com/thread-497434-1-12.html
Fate Saber (可加購替換選項)
https://www.ou99.com/thread-463625-1-1.html
https://www.ou99.com/thread-462157-1-1.html
https://www.ou99.com/thread-464207-1-1.html
https://www.ou99.com/thread-464483-1-1.html
https://www.ou99.com/thread-486403-1-1.html
https://www.ou99.com/thread-478062-1-1.html
https://www.ou99.com/thread-467889-1-25.html
https://www.ou99.com/thread-487742-1-1.html
https://www.ou99.com/thread-497018-1-1.html
https://www.ou99.com/thread-272513-1-724.html
https://www.ou99.com/thread-433987-1-332.html
https://www.ou99.com/thread-498517-1-5.html
https://www.ou99.com/thread-498515-1-5.html
https://www.ou99.com/thread-496859-1-15.html
https://www.ou99.com/thread-483692-1-56.html
https://www.ou99.com/thread-482763-1-59.html
https://www.ou99.com/thread-471669-1-100.html
https://www.ou99.com/thread-468447-1-115.html
Fate 黑化Saber (可加購替換選項)
 https://www.ou99.com/thread-466278-1-1.html
https://www.ou99.com/thread-495309-1-7.html
https://www.ou99.com/thread-466278-1-130.html
魔法老師 依文潔琳 (可加購替換選項)
https://www.ou99.com/thread-470426-1-21.html
 https://www.ou99.com/thread-482609-1-1.html
https://www.ou99.com/thread-312566-1-682.html
https://www.ou99.com/thread-470426-1-106.html
初音未來 (可加購替換選項)
https://www.ou99.com/thread-487887-1-16.html
https://www.ou99.com/thread-463318-1-159.html
https://www.ou99.com/thread-497433-1-1.html
https://www.ou99.com/thread-491161-1-34.html
魔力小馬 蒼月潮 (可加購替換選項)
https://www.ou99.com/thread-462013-1-172.html (頭髮改成黑色, 褲子藍色)
https://www.ou99.com/thread-465205-1-1.html
https://www.ou99.com/thread-495084-1-20.html
火影忍者 宇志波佐助 (可加購替換選項)
 https://www.ou99.com/thread-463198-1-160.html
https://www.ou99.com/thread-454858-1-1.html
https://www.ou99.com/thread-479248-1-69.html

## 23:07

我已經看不懂你再說什麼了

## 23:08

包括可加購替換選項

## 23:09

接上英雄 以及 A + B 那 17 帖也下載跟轉換接上選單

## 23:11

有 30 條舊工作分支裡面還有沒存檔的東西，我不敢刪。要不要刪，你說。 => 都先保留吧 但如果是這次81英雄跟11回合相關的你要盡量合併

## 23:12

如果只是單純喊叫 或是狀聲詞 不是唸一整串台詞 就不需要判斷語言

## 23:15

Lux、好運姐、狼人、犽宿、李星 你可以自己下載日文包

## 23:15

你就都買 反正作為後台跟編輯器下拉選單可選選項之一 選項越多越安全

## 23:16

但是你可以放第三批下載轉換

## 23:19

我已經儲值了

## 23:35

我充值完了

## 23:39

你這些檔案 包括轉換中半成品等 應該都會有一份在本機一份在S3 以及成品本機+git+正式站 對吧

## 23:53

GEOA 開票

## 23:58

278,874 個音訊檔 已更新 請你重新比對 注意你可以善用多開工作流來加速完成

## 23:59

你還有什麼票開著 你可以趁現在解決的嗎

## 23:59

請你儘速比對完成 更新 語音替換聽審

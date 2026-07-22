# 《GoDieEX22s.w3x》 匯入報告

原始地圖:去死團的逆襲 EX 2.2s(`GoDieEX22s.w3x`,6.28 MB,受保護的 MPQ)。
模型與貼圖皆為地圖作者自製素材(使用者聲明)。

## 一、檔案匯入總覽

- MPQ block table 共 **462** 筆,成功還原 **356** 個檔案。
- **104** 筆無法還原檔名(此圖為受保護地圖,`(listfile)` 與 `war3map.imp` 均被破壞;MPQ 只儲存檔名雜湊,無法逆推。依副檔名統計推測多為未被物編/腳本引用的音效與未使用素材)。
- 檔名還原方式:already-known(war3map.*)+ 物件編輯資料(w3u/w3a/w3t 等)字串欄位與 JASS 腳本中的路徑掃描 + MDX 貼圖引用(TEXS)遞迴補收。

| 類型 | 數量 | 說明 |
| --- | --- | --- |
| .blp | 188 | 貼圖(全部解碼為 PNG) |
| .mdx | 129 | 模型(全部轉出 glTF) |
| .mp3 | 21 | 音樂/音效(僅解出,未使用) |
| .txt | 2 |  |
| .w3e | 1 |  |
| .w3i | 1 |  |
| .wts | 1 | 字串表(繁中) |
| .j | 1 | JASS 腳本 |
| .shd | 1 |  |
| .tga | 1 |  |
| .mmp | 1 |  |
| .wpm | 1 |  |
| .doo | 1 |  |
| .w3u | 1 | 單位資料 |
| .w3t | 1 | 物品資料 |
| .w3a | 1 | 技能資料 |
| .w3b | 1 |  |
| .w3d | 1 |  |
| .w3q | 1 |  |
| .w3h | 1 |  |

完整逐檔清單(含大小與還原方式)見 [`inventory.md`](inventory.md)。

## 二、模型轉換(MDX → glTF)

- 129/129 個 .mdx 全數轉出 `.glb`(嵌入 PNG 貼圖),並通過 Babylon NullEngine 載入驗證。
- 其中 **64** 個判定為角色模型(具 Walk/Attack/Death 動作 + 骨架),65 個為特效/道具模型(可作場景裝飾)。
- 座標轉換:MDX 為 Z 朝上右手系 → glTF Y 朝上,直接烘焙 `(x,y,z)→s·(x,z,−y)`;四元數與縮放軌跡同步變換。
- 縮放:先把角色本體網格正規化為「usca=1.0 → 約 1.7 遊戲單位」的基準,再乘上地圖作者為每名英雄設定的縮放值(`usca`,單位資料 Scaling Value),讓大小英雄如地圖原意般有差異;有效身高鉗制於 0.6–3.0 單位以免過度變形。碰撞半徑 `collisionRadius` 仍由玩法決定,**不**隨視覺大小縮放(每名英雄的 usca→scale 記錄於 `models_report.json`)。
- 動畫:每個 WC3 序列輸出一條 glTF animation,線性軌跡原樣輸出、Hermite/Bezier 軌跡以 30fps 重取樣為線性;`clipMap` 依序列名稱自動對應 idle/run/attack/cast/hurt/death。
- 材質/透明度(本次修正):貼圖依 BLP alpha 通道與 WC3 filter mode 選定 glTF `alphaMode` — 不透明層 OPAQUE、1-bit 鏤空 MASK(alphaCutoff)、漸層 BLEND;武器/裝甲常見的「隊伍色底層 + 細節疊加層」材質,以往只取疊加層並套 BLEND 導致武器半透明(看似消失),現偵測到不透明底層時整體轉為 OPAQUE,武器/球體正常實體顯示。
- 隊伍色/發光:隊伍色區塊(replaceableId 1)以中性不透明色呈現並列入 `teamTintMaterials` 交由客戶端上色(不再是半透明灰色鬼影);隊伍發光(replaceableId 2)無法上色,直接丟棄避免灰色色塊;疊加(additive)發光幾何轉為 glTF emissive(`KHR_materials_emissive_strength`)呈現為光而非黑塊。
- 附掛物:調查後本圖英雄的武器/球體皆已內含於自身 geoset(無外掛模型引用── 單位 Art 欄位與 MDX ATCH 節點均無外部模型路徑);匯入器已支援把 ATCH 節點引用的獨立模型烘焙進主模型的對應附掛點,本圖需要烘焙的外掛模型為 0。能量特效型球體(如 Excalibur 金光)為粒子發射器,glTF 無粒子系統,無法還原。

## 三、英雄 → champion 文件(content/champions/)

WC3 自訂英雄共 71 名;其中 **46** 名使用自製模型、已寫入 content/ 並通過 schema 驗證;25 名使用暴雪內建模型(無法取得),草稿保留於 `drafts/champions/`。

另有 **45** 名「原始表」英雄(直接修改暴雪標準英雄 rawcode,如 `Hpal`、`Hart`;隨機英雄池引用)本次補匯入 content/:改過的欄位(中文名、屬性、技能)照常轉換,地圖未改的欄位以 WC3 標準英雄一級數值表(近似值,見 `w3xlib/drafts.py` `STANDARD_HERO_DEFAULTS`)補齊;其中 20 名的原模型為暴雪內建(無法匯出),以現有匯入模型代替(champion 文件標記 `standin-model` 標籤,對照表見下)。

### 顯示名稱合併(稱號 + 名字 → 單一名稱)

WC3 英雄的「名稱」欄(`unam`)在本圖存的是稱號/標題,「專有名稱」欄(`upro`)存的是角色本名;兩者合併為單一 `name`,格式「稱號 - 名字」(LoL 風格);只有其一者則單獨使用,不留多餘分隔號。以下為前 10 例對照(舊=僅稱號、新=合併後):

| champion id | 舊(僅 unam) | 新(合併 unam + upro) |
| --- | --- | --- |
| godie-e001 | 蟬在叫人壞掉 | 蟬在叫人壞掉 - 龍宮禮奈 |
| godie-e002 | 亞瑟王 | 亞瑟王 - Saber |
| godie-e007 | 龍之子 | 龍之子 - 天地志狼 |
| godie-e008 | 火霧戰士 | 火霧戰士 - 夏娜 |
| godie-e00j | 皇者 | 皇者 - 騜 |
| godie-e00k | 戰國刺客Azumi | 戰國刺客Azumi - 安云 |
| godie-e00l | 亞瑟王 | 亞瑟王 - Saber |
| godie-e00n | 蟬在叫人壞掉 | 蟬在叫人壞掉 - 龍宮禮奈 |
| godie-e00q | 英靈-亞瑟王 | 英靈-亞瑟王 - 黑化Saber |
| godie-e00w | 神鳴流劍士 | 神鳴流劍士 - 櫻綻剎那 |

### 每單位大小(usca → 模型 scale)

模型 `scale` 依地圖的 `usca` 逐英雄計算;有效身高鉗制 0.6–3.0 單位。最小與最大英雄如下(usca / 有效身高單位):

- 最矮:`heroichigo` (usca 0.7 → 1.19u)、`herosasuke` (usca 0.7 → 1.19u)、`long` (usca 0.7 → 1.19u)
- 最高:`picacugy` (usca 1.8 → 3.0u)、`heropikachu` (usca 2.0 → 3.0u)、`bulbasaur` (usca 3.0 → 3.0u)(均鉗制於 3.0u 上限)。

數值換算(WC3 → 本遊戲):距離 ×11/600(600 射程=11 單位)、移速 270–522 → 5.5–8(線性)、HP=(基礎HP+25×力量)×0.8、魔力=基礎+12×智力、攻擊=骰子期望+主屬性、攻速=1/攻擊間隔、護甲=基礎+0.3×敏捷;傷害/治療/冷卻/耗魔數值 1:1 保留。

| champion id | 名稱 | WC3 | 模型 | HP | AD | 護甲 | 移速 | Q / W / E / R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| godie-e001 | 蟬在叫人壞掉 - 龍宮禮奈 | E001 (Ewrd) | `imported.renaryugu2` | 460 | 38 | 9 | 5.8 | 鬼隱之擊 / 染血的柴刀 / 五吋釘 / 雛見澤症候群L5 |
| godie-e002 | 亞瑟王 - Saber | E002 (Ewrd) | `imported.herosaber` | 580 | 38 | 7 | 5.8 | 感知能力 / 風王結界 / 約束與勝利之劍 / Avalon-永恆的理想鄉 |
| godie-e007 | 龍之子 - 天地志狼 | E007 (Ewar) | `imported.herolingtong` | 480 | 34 | 9 | 5.8 | 鬥仙術 / 仙氣．採藥 / 破凰之心-徒手空破山 / 龍氣爆發 |
| godie-e008 | 火霧戰士 - 夏娜 | E008 (Ewrd) | `imported.heroshana` | 460 | 31 | 8 | 5.9 | 拔焰刀 / 火羽 / 赤焰爆發 / 討滅封絕 |
| godie-e00j | 皇者 - 騜 | E00J (Edem) | `imported.ma` | 560 | 32 | 7 | 5.9 | 謝謝指教 / 大和戰氣 / 皇者戰氣第五十重天 / 藍色戰氣一百重天 |
| godie-e00k | 戰國刺客Azumi - 安云 | E00K (Ewrd) | `imported.herokunoichi` | 460 | 31 | 8 | 5.9 | 斷末 / 迴切 / 瞬切百殺 / 幻影暗殺 |
| godie-e00l | 亞瑟王 - Saber | E00L (Ewrd) | `imported.herosaber` | 580 | 38 | 7 | 5.8 | 感知能力 / 風王結界 / 約束與勝利之劍 / Avalon-永恆的理想鄉 |
| godie-e00n | 蟬在叫人壞掉 - 龍宮禮奈 | E00N (Ewrd) | `imported.renaryugu2` | 460 | 93 | 9 | 6.8 | 鬼隱之擊 / 染血的柴刀 / 五吋釘 / 雛見澤症候群L5 |
| godie-e00q | 英靈-亞瑟王 - 黑化Saber | E00Q (Ewrd) | `imported.herosaber` | 560 | 42 | 7 | 5.5 | 力量強化 / 黑泥召喚 / 約束與勝利之劍 / 魔力增幅 |
| godie-e00w | 神鳴流劍士 - 櫻綻剎那 | E00W (Ewar) | `imported.mfls` | 480 | 34 | 9 | 5.8 | 百烈櫻華斬 / 雷鳴劍 / GLADIARIA ALAT / 真-雷光劍 |
| godie-e00x | 神鳴流劍士 - 櫻綻剎那 | E00X (Ewar) | `imported.mfls` | 480 | 34 | 9 | 8.0 | 百烈櫻華斬 / 雷鳴劍 / GLADIARIA ALAT / 真-雷光劍 |
| godie-e00z | 戰國刺客Azumi - 安云 | E00Z (Ewrd) | `imported.herokunoichi` | 460 | 31 | 8 | 8.0 | 斷末 / 迴切 / 瞬切百殺 / 幻影暗殺 |
| godie-e012 | 殺人劍客 - 佐佐木小次郎 | E012 (Eevi) | `imported.herohimurakenshin` | 480 | 34 | 8 | 5.8 | 飛龍閃 / 神速 / 九頭龍閃 / 天翔龍閃 |
| godie-h00l | 時空勇者 - 林克 | H00L (Hmkg) | `imported.linkstik` | 480 | 28 | 6 | 5.7 | 科奇利族的迴旋鏢 / 鎖鏈槍 / 海拉爾之盾的庇護 / 迴旋斬 |
| godie-h01n | 開外掛的死神 - 黑崎一護 | H01N (Hmkg) | `imported.heroichigo` | 480 | 28 | 7 | 5.7 | 瞬步 / 斬擊 / 月牙天衝 / 卍解 |
| godie-h01o | 外掛開很大的死神 - 黑崎一護 | H01O (Hmkg) | `imported.heroichigo` | 480 | 28 | 7 | 6.8 | 瞬步 / 斬擊 / 月牙天衝 / 卍解 |
| godie-h01u | 亂世癿王者 - 呂布奉先 | H01U (Hmkg) | `imported.lubu` | 640 | 32 | 7 | 5.8 | 天下無雙 / 弒鬼神 / 鬼神烈戟 / 赤兔咆哮 |
| godie-h020 | 黑魔導士 - 莉娜因巴斯 | H020 (Hjai) | `imported.linainvers` | 440 | 26 | 6 | 5.7 | 火球術 / 炸彈陣 / 龍破斬 / 神滅斬 |
| godie-h022 | 白色之翼 - 涅吉。史普林。菲爾德 | H022 (Hmkg) | `imported.negi` | 480 | 30 | 7 | 5.9 | 雷之斧 / 虛空瞬動 / 雷之投擲 / 闇之魔法 |
| godie-h02r | 種子神奇寶貝 - 妙蛙花 | H02R (Hgam) | `imported.bulbasaur` | 440 | 84 | 8 | 5.5 | 飛葉快刀 / 麻痺粉 / 藤鞭 / 陽光烈焰 |
| godie-h02u | 看似憂鬱的神獸 - 草泥馬 | H02U (Hpal) | `imported.horse` | 440 | 29 | 9 | 5.5 | 臥草泥馬 / 狂草泥馬 / 消化液 / 馬勒戈壁 |
| godie-h02v | 看似憂鬱的神獸 - 草泥馬 | H02V (Hpal) | `imported.horse` | 440 | 29 | 9 | 5.9 | 臥草泥馬 / 狂草泥馬 / 消化液 / 馬勒戈壁 |
| godie-n003 | 黑暗福音 - 依文潔琳 | N003 (Nbrn) | `imported.long` | 520 | 38 | 7 | 5.7 | 凍結的大地 / 吸血祭品 / 暗夜吹雪 / 世界終結 |
| godie-n00p | 妖狐藏馬 - 南野秀一 | N00P (Nsjs) | `imported.fox` | 440 | 99 | 8 | 5.8 | 風華圓舞陣 / 寄生種子 / 妖狐變化 / 億年樹 |
| godie-n01c | 傳說的龍騎士 - 勇者小呆 | N01C (Nbbc) | `imported.sd2` | 460 | 40 | 10 | 5.8 | 雙龍紋 / 萊丁快速劍 / 龍鬥氣砲咒文 / 阿邦快速劍X |
| godie-n01g | 黑暗福音 - 依文潔琳 | N01G (Nbrn) | `imported.long` | 520 | 38 | 7 | 5.5 | 凍結的大地 / 吸血祭品 / 暗夜吹雪 / 世界終結 |
| godie-o00k | 傲嬌電氣老鼠 - 皮卡娘 | O00K (Ofar) | `imported.pika` | 440 | 30 | 8 | 5.8 | 十萬伏特 / 電光一閃 / 神鳴 / 打雷絕招 |
| godie-o00l | 獸神官 - 傑洛士 | O00L (Oshd) | `imported.heroxelloss` | 460 | 34 | 6 | 5.7 | 獸王牙操彈 / 強化炸彈陣 / 破法對咒 / 暴爆咒 |
| godie-o00x | 超級賽亞人 - 悟空 | O00X (Ogrh) | `imported.goku` | 480 | 28 | 7 | 6.8 | 界王拳 / 瞬間移動 / 超級賽亞人 / 龜派氣功 |
| godie-o01z | 魔砲少女 - 高町奈葉 | O01Z (Oshd) | `imported.niya` | 480 | 35 | 7 | 5.7 | Barrel Shot / Acxel Shooter / Divine Buster Extention / Starlight Breaker Plus |
| godie-o02l | 神騎寶貝 - 皮卡丘 | O02L (Ofar) | `imported.picacugy` | 420 | 26 | 7 | 5.8 | 十萬伏特 / 鋼鐵尾巴 / 就決定是你了!小智 / 瘋狂皮卡丘 |
| godie-o02p | 夢幻之星 - 初音 | O02P (Opgh) | `imported.heromiku` | 480 | 35 | 5 | 5.9 | 甩蔥歌 / 最初的聲音 / 初音未來的消失 / 世界第一的公主殿下 |
| godie-o02s | 憂鬱少女 - 涼宮八ㄦ匕 | O02S (Oshd) | `imported.lgcr` | 460 | 34 | 6 | 5.7 | 強化炸彈陣 / 獸王牙操彈 / 暴爆咒 / 破法對咒 |
| godie-o02v | 白色惡魔 - 高町奈葉 | O02V (Oshd) | `imported.niya` | 480 | 35 | 7 | 5.8 | Barrel Shot / Acxel Shooter / Divine Buster Extention / Starlight Breaker Plus |
| godie-o02w | 笑傲江湖 - 令狐沖 | O02W (Osam) | `imported.hzyn` | 420 | 27 | 10 | 5.8 | 華山劍法 / 混元掌 / 吸星大法 / 獨孤九劍 |
| godie-u00h | 鬼畜紅王 - 鬼畜狂刀KYO | U00H (Uvng) | `imported.herokyo` | 420 | 36 | 10 | 5.9 | 無名神風流-白虎 / 無名神風流-朱雀 / 無名神風流-蛟龍 / 祕奧義．金色的神風 |
| godie-u00j | 神性的流失 - 賽菲洛斯 | U00J (Ubal) | `imported.herosephiroth` | 440 | 36 | 10 | 5.7 | 獄門 / 八刀一閃 / 闇之天使 / 最終殞落星 |
| godie-u00l | 北斗之鼠 - 拳四郎 | U00L (Umal) | `imported.heropikachu` | 480 | 34 | 8 | 5.8 | 北斗懺悔拳 / 北斗神拳秘訣轉龍呼吸法 / 北斗百裂拳 / ChangeDNA |
| godie-u00n | 草帽小子 - 蒙其.D.魯夫 | U00N (Udre) | `imported.luffe` | 480 | 32 | 6 | 5.9 | 伸縮自如的橡膠戰斧 / 伸縮自如的橡膠火箭砲 / 伸縮自如的槍亂打 / 三檔.巨人迴旋彈 |
| godie-u00o | 草帽小子 - 蒙其.D.魯夫 | U00O (Udre) | `imported.luffe` | 480 | 32 | 6 | 6.9 | 伸縮自如的橡膠戰斧 / 伸縮自如的橡膠火箭砲 / 伸縮自如的槍亂打 / 三檔.巨人迴旋彈 |
| godie-u00v | 黑手黨老大 - 基廉列克 | U00V (Udre) | `imported.rabbit` | 560 | 26 | 6 | 5.8 | 斬鐵拳 / 地走龍牙破 / 廬山昇龍破 / 死亡噴射肘擊 |
| godie-u010 | 邪眼師 - 飛影 | U010 (Uvng) | `imported.herohehi` | 420 | 36 | 10 | 6.4 | 邪王炎殺劍 / 邪王炎殺煉獄焦 / 邪王炎殺黑龍波 / 黑龍波吸收 |
| godie-u011 | 死亡老二 - 克勞薩先生 | U011 (Udre) | `imported.collision` | 100 | 22 | 5 | 5.5 | 惡魔球 / 霸獸盔甲 / 打屁股風林火豬 / 瘋狂怪物 |
| godie-u01q | 測試英雄 - 索隆 | U01Q (Udre) | `imported.heromusashimiyamoto` | 2840 | 26 | 6 | 5.5 | none / none / none / none |
| godie-u01u | 三刀流劍士 - 索隆 | U01U (Udre) | `imported.heromusashimiyamoto` | 560 | 26 | 6 | 5.9 | 燒鬼斬 / 虎狩獵 / 鬼氣九刀流-阿修羅壹霧銀 / 三千世界 |
| godie-u034 | 職業獵人 - 傑 富力士 | U034 (Ucrl) | `imported.herobiggon` | 620 | 26 | 6 | 6.4 | 山形修煉-放 / 山形修煉-變 / 山形修煉-強 / 傑桑變化 |

### 原始表英雄(本次補匯)

模型欄標「⚠ 代替」者:原模型為暴雪內建,以現有模型代替。

| champion id | 名稱 | WC3 | 模型 | HP | AD | 護甲 | 移速 | Q / W / E / R |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| godie-hart | 最終幻想 - 克勞德 | Hart | `imported.cloud` | 600 | 40 | 9 | 5.9 | 凶斬 / 隕石擊 / 畫龍點睛 / 超究武神霸斬 |
| godie-hvwd | 除魔巫女 - 桔梗 | Hvwd | `imported.kikyou` | 480 | 31 | 10 | 5.7 | 破魔之箭 / 明鏡止水 / 魂飛魄散 / 百鬼夜行 |
| godie-hlgr | 鋼彈 - 煌 | Hlgr | `imported.gumdam` | 700 | 51 | 8 | 5.8 | 詭雷 / 磁軌砲 / 鯨式電漿光束炮 / 全彈發射 |
| godie-hjai | 黑魔導士 - 莉娜因巴斯 | Hjai | `imported.linainvers` | 440 | 38 | 5 | 5.7 | 火球術 / 炸彈陣 / 龍破斬 / 神滅斬 |
| godie-hblm | 慈悲的王者 - 賈修貝爾 | Hblm | `imported.student` ⚠ 代替 | 460 | 36 | 5 | 5.8 | 薩喀爾 / 薩喀爾嘎 / 及喀爾度 / 巴歐．薩喀爾嘎 |
| godie-ucrl | 職業獵人 - 傑 富力士 | Ucrl | `imported.billy` ⚠ 代替 | 620 | 36 | 6 | 5.9 | 山形修煉-放 / 山形修煉-變 / 山形修煉-強 / 傑桑變化 |
| godie-hpb1 | 獸矛傳承使 - 蒼月潮 | Hpb1 | `imported.herotoshiiemaeda` | 640 | 37 | 8 | 5.9 | 臨、兵、鬥 / 者、皆、陣 / 列、在、前 / 神聖結界 |
| godie-nbbc | 傳說的龍騎士 - 勇者小呆 | Nbbc | `imported.sd2` | 460 | 33 | 12 | 5.8 | 雙龍紋 / 萊丁快速劍 / 龍鬥氣砲咒文 / 阿邦快速劍X |
| godie-ogrh | 賽亞人 - 悟空 | Ogrh | `imported.goku` | 480 | 29 | 9 | 5.9 | 界王拳 / 瞬間移動 / 超級賽亞人 / 龜派氣功 |
| godie-udre | 三刀流劍士 - 索隆 | Udre | `imported.heromusashimiyamoto` | 560 | 33 | 8 | 5.9 | 燒鬼斬 / 虎狩獵 / 鬼氣九刀流-阿修羅壹霧銀 / 三千世界 |
| godie-ewar | 龍之子 - 天地志狼 | Ewar | `imported.herolingtong` | 480 | 35 | 10 | 5.8 | 鬥仙術 / 仙氣．採藥 / 破凰之心-徒手空破山 / 龍氣爆發 |
| godie-efur | 揍敵客大家長 - 揍敵客桀諾 | Efur | `imported.heroryuk` ⚠ 代替 | 420 | 31 | 6 | 5.9 | 老樹盤根 / 變化念力 / 快步 / 暗殺奧義 |
| godie-etyr | 治癒系公主 - 木乃香 | Etyr | `imported.herooichi` | 420 | 41 | 7 | 5.7 | 東風繪扇、南風末廣 / 魔力應援 / 式神炸裂 / 聖夜降臨 |
| godie-emfr | 魔法老師 - 涅吉。史普林。菲爾德 | Emfr | `imported.negi` | 480 | 39 | 7 | 5.7 | 風精召喚 / 沉睡之霧 / 雷電風暴 / 千之雷 |
| godie-nplh | 通靈人 - 麻倉葉 | Nplh | `imported.ye-wuqi1` | 420 | 37 | 10 | 5.9 | 無無明亦無 / 超．占事略決 / 劍之精靈 / 阿彌陀流真空佛陀斬 |
| godie-ewrd | 天上天下 - 棗 真夜 | Ewrd | `imported.herogirl` | 480 | 29 | 8 | 5.9 | 鬼-真夜 / 殺無真空斬 / 空破圓斬 / 狂龍斬 |
| godie-nsjs | 妖狐藏馬 - 南野秀一 | Nsjs | `imported.fox2` | 440 | 36 | 8 | 5.8 | 風華圓舞陣 / 寄生種子 / 妖狐變化 / 億年樹 |
| godie-ntin | 時空管理局執務官 - 菲特·泰斯塔羅沙 | Ntin | `imported.herofate` | 520 | 41 | 10 | 6.0 | 電離光槍 - 繁星飛躍 / 超音型態 / 雷牙一閃˙雷牙烈霸 / 雷焰聖劍 |
| godie-nbst | 變態正義 - 瘋狂假面 | Nbst | `imported.txbbb` ⚠ 代替 | 580 | 42 | 8 | 5.9 | 這是我的豆皮壽司 / 變態根性 / 變態絕技悶絕地獄車 / 內褲變身 |
| godie-umal | 北斗神拳掌門人 - 拳四郎 | Umal | `imported.herokyo` ⚠ 代替 | 600 | 35 | 10 | 5.8 | 北斗懺悔拳 / 北斗神拳秘訣轉龍呼吸法 / 北斗百裂拳 / ChangeDNA |
| godie-harf | 豪洨天王 - 鄭先生 | Harf | `imported.herocloudstrife` ⚠ 代替 | 620 | 37 | 10 | 5.8 | 腳底按摩 / 亂入 / 熱血 / 開天闢地‧洨者聖臨 |
| godie-naka | 猿飛佐助 - 風魔小次郎 | Naka | `imported.herohanzouhattori` | 380 | 29 | 8 | 5.9 | 忍法風魔手裡劍 / 忍法鬼穿刺 / 忍法千變萬化之刀 / 忍法暗殺奧義-飛燕閃 |
| godie-huth | 超級普烏 - 魔人普烏 | Huth | `imported.herobuu` | 600 | 42 | 8 | 5.8 | 吃掉你 / 把你變成餅乾 / 分身 / 破滅能量彈 |
| godie-oshd | 魔鬼筋肉人 - 鬼王達 | Oshd | `imported.hero-turtle` ⚠ 代替 | 460 | 35 | 6 | 5.7 | 鐵砂掌 / 鬼王流星雨 / 有功夫無懦夫 / 電光毒龍鑽 |
| godie-orkn | 電車癡漢 - 臭作 | Orkn | `imported.charlie` ⚠ 代替 | 440 | 30 | 8 | 5.7 | 綁架 / 酒精灌腸 / 痴漢火焰 / 電車之狼衝擊 |
| godie-othr | X戰警 - 金鋼狼 | Othr | `imported.sesshomaru` ⚠ 代替 | 640 | 37 | 7 | 5.8 | 迴旋爪擊 / 重爪擊 / 野性的呼喚 / 不要踢我蛋蛋 |
| godie-opgh | 常勝將軍 - 趙子龍 | Opgh | `imported.zy3` | 420 | 30 | 12 | 5.9 | 一騎槍閃 / 橫掃千軍 / 閃光龍牙 / 狂龍霸體 |
| godie-obla | 被剝削的勞工階級 - 牧太郎 | Obla | `imported.billy` ⚠ 代替 | 540 | 32 | 10 | 5.9 | 放山雞 / 吃完的口香糖 / 地道突襲 / 動物拳法 |
| godie-osam | 犬妖 - 殺生丸 | Osam | `imported.sesshomaru` | 420 | 40 | 13 | 5.8 | 風華之爪 / 合氣斬 / 爆碎丸 / 奧義˙蒼龍破 |
| godie-hpal | 不死之身-無 - 藤井八雲 | Hpal | `imported.herosephiroth` ⚠ 代替 | 600 | 35 | 8 | 5.8 | 土爪 / 石絲 / 鏡蠱 / 光牙 |
| godie-ubal | 魔界霸主 - 巴恩大魔王 | Ubal | `imported.bahamut` ⚠ 代替 | 440 | 37 | 8 | 5.7 | 凱薩之鷹 / 災難之牆 / 黑核晶 / 魔界之王 |
| godie-uvng | 邪眼師 - 飛影 | Uvng | `imported.herohehi` | 420 | 37 | 12 | 5.9 | 邪王炎殺劍 / 邪王炎殺煉獄焦 / 邪王炎殺黑龍波 / 黑龍波吸收 |
| godie-nman | 地獄歌神 - 憤怒的胖虎 | Nman | `imported.hero-turtle` ⚠ 代替 | 544 | 44 | 10 | 5.9 | 威脅之拳 / 必殺！爆熱神音！ / 萬解-貓王胖虎 / 地獄搖滾 |
| godie-uwar | 食神 - 撒尿牛丸 | Uwar | `imported.xzz` ⚠ 代替 | 440 | 29 | 9 | 5.8 | 得罪了方丈還想走 / 打狗鏟 / 爆裂海景佛跳牆 / 少林絕學-火雲掌 |
| godie-emns | 奇樂 - 夜神月 | Emns | `imported.herolight` | 420 | 35 | 8 | 5.8 | 死神之眼 / 死神的規則 / 火車輾過 / 心臟麻痺 |
| godie-edem | 寫輪眼復仇者 - 宇智波佐助 | Edem | `imported.herosasuke` | 460 | 37 | 12 | 5.8 | 火遁-豪火龍之術 / 千鳥流 / 千鳥 / 哥哥 |
| godie-hvsh | 梅杜莎 - Rider | Hvsh | `imported.herorider` | 440 | 33 | 10 | 5.8 | 魔法鎖鏈 / 心眼 / 鮮血神殿 / 騎英之疆繩 |
| godie-usyl | 殺戮之牙 - 異形 | Usyl | `imported.bahamut` ⚠ 代替 | 400 | 27 | 7 | 5.8 | 遮斷獵殺 / 腐蝕毒液 / 蛻變 / 母體 |
| godie-hapm | 海克力斯 - Berserker | Hapm | `imported.lubu` ⚠ 代替 | 660 | 35 | 5 | 5.8 | 狂戰士之怒 / 蹂躪編年史 / 無銘斧劍 / 巨神一擊 |
| godie-ofar | 神奇寶貝兒 - 皮卡丘 | Ofar | `imported.heropikachu` | 420 | 29 | 6 | 6.0 | 十萬伏特 / 鋼鐵尾巴 / 就決定是你了!小智 / 瘋狂皮卡丘 |
| godie-ecen | 姜窩肯 - 約翰走路 | Ecen | `imported.heroxelloss` ⚠ 代替 | 500 | 40 | 7 | 5.7 | 威士忌攻擊 / 酒釀精華 / 工廠機器人 / 魔幻浮水印 |
| godie-udea | 至尊學長 - 飛鼠先生 | Udea | `imported.herotoshiiemaeda` ⚠ 代替 | 620 | 81 | 9 | 6.0 | 神出鬼沒 / 寒冰破碎 / 魔法膨脹 / 天譴 |
| godie-ogld | 美白大法師 - 黑人牙膏 | Ogld | `imported.heroxelloss` ⚠ 代替 | 440 | 39 | 6 | 5.5 | 洗刷刷 / 黑人牙菌斑 / 超亮白 / 黑化 |
| godie-hgam | 種子神奇寶貝 - 妙蛙種子 | Hgam | `imported.bulbasaur` | 440 | 35 | 9 | 5.8 | 飛葉快刀 / 麻痺粉 / 藤鞭 / 陽光烈焰 |
| godie-ekee | 會叫的野獸 - 傳說中的大刀 | Ekee | `imported.fox` ⚠ 代替 | 440 | 43 | 6 | 5.9 | 期末報告 / 抽點名 / 這次考試很簡單 / 當掉 |

### 隨機英雄池

地圖的隨機英雄模式從 JASS 腳本的 rawcode 陣列抽取(混淆變數 `zv`,共 **78** 名,自動解析;其中 6 筆索引以 JASS 十六進位字面值 `$A`–`$F` 寫入,簡單十進位掃描會漏掉)。狀態:已匯入=自訂表英雄、先前已進 content/;本次補匯=原始表英雄、本次新增;草稿=自訂表但模型未還原,僅存 `drafts/`;未還原=物編資料中找不到。

| # | rawcode | 名稱 | 狀態 |
| --- | --- | --- | --- |
| 1 | `Hart` | 最終幻想 | 本次補匯 |
| 2 | `Hvwd` | 除魔巫女 | 本次補匯 |
| 3 | `Hlgr` | 鋼彈 | 本次補匯 |
| 4 | `Hjai` | 黑魔導士 | 本次補匯 |
| 5 | `Hblm` | 慈悲的王者 | 本次補匯(模型代替) |
| 6 | `Ucrl` | 職業獵人 | 本次補匯(模型代替) |
| 7 | `Hpb1` | 獸矛傳承使 | 本次補匯 |
| 8 | `Nbbc` | 傳說的龍騎士 | 本次補匯 |
| 9 | `Ogrh` | 賽亞人 | 本次補匯 |
| 10 | `Udre` | 三刀流劍士 | 本次補匯 |
| 11 | `Ewar` | 龍之子 | 本次補匯 |
| 12 | `Efur` | 揍敵客大家長 | 本次補匯(模型代替) |
| 13 | `Etyr` | 治癒系公主 | 本次補匯 |
| 14 | `Emfr` | 魔法老師 | 本次補匯 |
| 15 | `Nplh` | 通靈人 | 本次補匯 |
| 16 | `Ewrd` | 天上天下 | 本次補匯 |
| 17 | `Nsjs` | 妖狐藏馬 | 本次補匯 |
| 18 | `E00K` | 戰國刺客Azumi | 已匯入 |
| 19 | `E002` | 亞瑟王 | 已匯入 |
| 20 | `E008` | 火霧戰士 | 已匯入 |
| 21 | `E001` | 蟬在叫人壞掉 | 已匯入 |
| 22 | `Ntin` | 時空管理局執務官 | 本次補匯 |
| 23 | `Nbst` | 變態正義 | 本次補匯(模型代替) |
| 24 | `Umal` | 北斗神拳掌門人 | 本次補匯(模型代替) |
| 25 | `Harf` | 豪洨天王 | 本次補匯(模型代替) |
| 26 | `Naka` | 猿飛佐助 | 本次補匯 |
| 27 | `Huth` | 超級普烏 | 本次補匯 |
| 28 | `Oshd` | 魔鬼筋肉人 | 本次補匯(模型代替) |
| 29 | `Orkn` | 電車癡漢 | 本次補匯(模型代替) |
| 30 | `Othr` | X戰警 | 本次補匯(模型代替) |
| 31 | `Opgh` | 常勝將軍 | 本次補匯 |
| 32 | `Obla` | 被剝削的勞工階級 | 本次補匯(模型代替) |
| 33 | `Osam` | 犬妖 | 本次補匯 |
| 34 | `Hpal` | 不死之身-無 | 本次補匯(模型代替) |
| 35 | `Ubal` | 魔界霸主 | 本次補匯(模型代替) |
| 36 | `Uvng` | 邪眼師 | 本次補匯 |
| 37 | `U00H` | 鬼畜紅王 | 已匯入 |
| 38 | `Nman` | 地獄歌神 | 本次補匯(模型代替) |
| 39 | `H001` | 地獄來襲者 | 草稿 |
| 40 | `N003` | 黑暗福音 | 已匯入 |
| 41 | `Uwar` | 食神 | 本次補匯(模型代替) |
| 42 | `Emns` | 奇樂 | 本次補匯 |
| 43 | `Edem` | 寫輪眼復仇者 | 本次補匯 |
| 44 | `Hvsh` | 梅杜莎 | 本次補匯 |
| 45 | `Usyl` | 殺戮之牙 | 本次補匯(模型代替) |
| 46 | `Hapm` | 海克力斯 | 本次補匯(模型代替) |
| 47 | `O00L` | 獸神官 | 已匯入 |
| 48 | `N00B` | 小叮噹 | 草稿 |
| 49 | `Ofar` | 神奇寶貝兒 | 本次補匯 |
| 50 | `E00R` | 最終泛用人型決戰兵器 | 草稿 |
| 51 | `H00L` | 時空勇者 | 已匯入 |
| 52 | `U012` | 重金屬樂團的怪物 | 草稿 |
| 53 | `Ecen` | 姜窩肯 | 本次補匯(模型代替) |
| 54 | `Udea` | 至尊學長 | 本次補匯(模型代替) |
| 55 | `E00T` | 七夜怪談 | 草稿 |
| 56 | `E00S` | 白木老樹精 | 草稿 |
| 57 | `U00K` | 邪惡意念集合體 | 草稿 |
| 58 | `Ogld` | 美白大法師 | 本次補匯(模型代替) |
| 59 | `U00J` | 神性的流失 | 已匯入 |
| 60 | `U00N` | 草帽小子 | 已匯入 |
| 61 | `E00W` | 神鳴流劍士 | 已匯入 |
| 62 | `U00V` | 黑手黨老大 | 已匯入 |
| 63 | `H01N` | 開外掛的死神 | 已匯入 |
| 64 | `H01U` | 亂世癿王者 | 已匯入 |
| 65 | `O01Z` | 魔砲少女 | 已匯入 |
| 66 | `H022` | 白色之翼 | 已匯入 |
| 67 | `E00V` | 百畝森林的霸主 | 草稿 |
| 68 | `O00K` | 傲嬌電氣老鼠 | 已匯入 |
| 69 | `H02K` | 國寶級的畜生 | 草稿 |
| 70 | `Hgam` | 種子神奇寶貝 | 本次補匯 |
| 71 | `H02S` | 死亡騎士 | 草稿 |
| 72 | `H02V` | 看似憂鬱的神獸 | 已匯入 |
| 73 | `Ekee` | 會叫的野獸 | 本次補匯(模型代替) |
| 74 | `E015` | 夜市人生 | 草稿 |
| 75 | `E00J` | 皇者 | 已匯入 |
| 76 | `O02W` | 笑傲江湖 | 已匯入 |
| 77 | `N01L` | 學姊 | 草稿 |
| 78 | `O02P` | 夢幻之星 | 已匯入 |

小計:本次補匯 45 名、已匯入 21 名、草稿 12 名。

池序同步輸出於 `parsed/random_pool.json`(content 的 config 集合schema 已凍結、無對應文件型別,故不寫入 content/config/)。

### 技能原型對應表(WC3 base rawcode → EffectDef)

| WC3 原型 | 次數 | 對應方式 |
| --- | --- | --- |
| `ANcl` | 28 | ⚠ trigger-scripted 'channel' ability (real behavior lives in JASS) → 佔位技能(TODO) |
| `AOsh` | 23 | shockwave → 依模板轉為傷害/狀態/增益效果 |
| `AEIl` | 20 | ⚠ illusions → 佔位技能(TODO) |
| `AHbh` | 18 | bash (passive) → 依模板轉為傷害/狀態/增益效果 |
| `AHtb` | 16 | storm bolt → 依模板轉為傷害/狀態/增益效果 |
| `AOcr` | 13 | critical strike (passive) → 依模板轉為傷害/狀態/增益效果 |
| `AOws` | 13 | war stomp → 依模板轉為傷害/狀態/增益效果 |
| `ANcs` | 12 | carrion swarm → 依模板轉為傷害/狀態/增益效果 |
| `ANsb` | 12 | soul burn → 依模板轉為傷害/狀態/增益效果 |
| `AHtc` | 11 | thunder clap → 依模板轉為傷害/狀態/增益效果 |
| `Absk` | 11 | berserk → 依模板轉為傷害/狀態/增益效果 |
| `AUcs` | 10 | carrion beetles/curse → 依模板轉為傷害/狀態/增益效果 |
| `AEer` | 8 | entangling roots → 依模板轉為傷害/狀態/增益效果 |
| `AEev` | 7 | evasion (passive) → 依模板轉為傷害/狀態/增益效果 |
| `ANc3` | 7 | cluster rockets → 依模板轉為傷害/狀態/增益效果 |
| `AUim` | 6 | impale → 依模板轉為傷害/狀態/增益效果 |
| `AUfn` | 6 | frost nova → 依模板轉為傷害/狀態/增益效果 |
| `Amls` | 6 | mana shield → 依模板轉為傷害/狀態/增益效果 |
| `AEbl` | 6 | blink → 依模板轉為傷害/狀態/增益效果 |
| `Aamk` | 6 | ⚠ attribute bonus (stat button) → 佔位技能(TODO) |
| `AEme` | 6 | metamorphosis → 依模板轉為傷害/狀態/增益效果 |
| `AEsh` | 5 | shadow strike → 依模板轉為傷害/狀態/增益效果 |
| `ACro` | 5 | bash (passive) → 依模板轉為傷害/狀態/增益效果 |
| `ANc1` | 5 | cluster rockets → 依模板轉為傷害/狀態/增益效果 |
| `AOw2` | 5 | war stomp → 依模板轉為傷害/狀態/增益效果 |
| `AHfs` | 5 | flame strike → 依模板轉為傷害/狀態/增益效果 |
| `AIpv` | 5 | periodic vamp/heal item → 依模板轉為傷害/狀態/增益效果 |
| `Alsh` | 5 | lightning shield→bolt → 依模板轉為傷害/狀態/增益效果 |
| `AOww` | 5 | bladestorm → 依模板轉為傷害/狀態/增益效果 |
| `ANfl` | 5 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANab` | 5 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANr3` | 4 | life drain → 依模板轉為傷害/狀態/增益效果 |
| `AOwk` | 4 | wind walk → 依模板轉為傷害/狀態/增益效果 |
| `AEtq` | 4 | tranquility → 依模板轉為傷害/狀態/增益效果 |
| `ACac` | 4 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANbr` | 4 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANin` | 4 | inferno → 依模板轉為傷害/狀態/增益效果 |
| `AOls` | 4 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AEim` | 4 | impale → 依模板轉為傷害/狀態/增益效果 |
| `ANfd` | 4 | fan of knives→dash → 依模板轉為傷害/狀態/增益效果 |
| `AOcl` | 4 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Asth` | 4 | hardened skin → 依模板轉為傷害/狀態/增益效果 |
| `ANss` | 3 | spirit walk? → 依模板轉為傷害/狀態/增益效果 |
| `Assk` | 3 | hardened skin → 依模板轉為傷害/狀態/增益效果 |
| `AOvd` | 3 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AHbz` | 3 | blizzard → 依模板轉為傷害/狀態/增益效果 |
| `Awfb` | 3 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANms` | 3 | mana shield → 依模板轉為傷害/狀態/增益效果 |
| `AEar` | 3 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Arai` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUdr` | 2 | dark ritual → 依模板轉為傷害/狀態/增益效果 |
| `ANrg` | 2 | rain of fire → 依模板轉為傷害/狀態/增益效果 |
| `AIre` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Aspb` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANdb` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUin` | 2 | ⚠ inferno summon → 佔位技能(TODO) |
| `Arsp` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANht` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ACfl` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANhs` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AIxk` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANb2` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANdh` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANso` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ACsh` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANca` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AOeq` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AEmb` | 2 | mana burn → 依模板轉為傷害/狀態/增益效果 |
| `Aven` | 2 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANdr` | 1 | life drain → 依模板轉為傷害/狀態/增益效果 |
| `AIsa` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Adef` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AIil` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `APsa` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AOsw` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Afrz` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUdd` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AEsb` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANto` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUls` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Aroa` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANmr` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AOhw` | 1 | healing wave → 依模板轉為傷害/狀態/增益效果 |
| `ACtc` | 1 | slam → 依模板轉為傷害/狀態/增益效果 |
| `AUau` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Aprg` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANfb` | 1 | fire bolt → 依模板轉為傷害/狀態/增益效果 |
| `ANic` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUav` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Aegr` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AOr2` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Awar` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Afbk` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AOae` | 1 | endurance aura → 依模板轉為傷害/狀態/增益效果 |
| `AChw` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUts` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AChx` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AEsf` | 1 | starfall → 依模板轉為傷害/狀態/增益效果 |
| `Aslo` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANrc` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Ainf` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANlm` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Aens` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANtm` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AOmi` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Arsg` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AUsl` | 1 | sleep → 依模板轉為傷害/狀態/增益效果 |
| `ANrf` | 1 | rain of fire → 依模板轉為傷害/狀態/增益效果 |
| `Acrs` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Aam2` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `AHad` | 1 | devotion aura → 依模板轉為傷害/狀態/增益效果 |
| `AIpm` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANef` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANmo` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ACpa` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Afae` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `ANsy` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |
| `Abof` | 1 | ⚠ 未知原型 → 佔位傷害技能(TODO) |

共 194 個技能無法忠實轉換(召喚/幻象/觸發腳本 `ANcl` 類),已以佔位技能代替並逐條記錄於 `import_report.json` → `notes`。

### 造型(skins)

- `skin.godie-u00l.heropika`
- `skin.godie-e008.heroshanawingsmall`
- `skin.godie-h02v.horsehead`

## 四、物品 → item 文件(content/items/)

共匯入 **208** 件物品(中文名稱、金價、階級全數保留);其中 63 件成功解析出屬性加成(+攻擊/+護甲/+生命…),其餘為主動效果或觸發式物品,屬性欄留空並記錄於 notes。階級由金價換算(<500→T1、<1500→T2、<3000→T3、<6000→T4、其餘 T5)。

| item id | 名稱 | 金價 | 階級 | 加成 |
| --- | --- | --- | --- | --- |
| godie-i000 | 丈八蛇矛 | 10000 | T5 |  |
| godie-i001 | 出動怨念射手兵團 | 1200 | T2 |  |
| godie-i002 | 武聖手鐲 | 950 | T2 | critChance+0.15 |
| godie-i003 | 聖光石 | 1450 | T2 | maxHealth+500.0 |
| godie-i004 | 魔戒 | 44444 | T5 | maxHealth+100, ad+5, maxMana+60 |
| godie-i005 | 初心者寶石 | 2450 | T3 | maxHealth+100, ad+5, maxMana+60 |
| godie-i006 | 雅典娜的驚嘆號 | 7500 | T5 | critChance+4.0 |
| godie-i007 | 妖刀村正 | 3350 | T4 |  |
| godie-i008 | 初級傳送捲軸 | 600 | T2 | maxHealth+100, ad+5, maxMana+60, maxHealth+20, ad+1, maxMana+12 |
| godie-i009 | 分手之鎚製作書 | 1150 | T2 |  |
| godie-i00a | 刺針製作書 | 500 | T2 |  |
| godie-i00b | 失心匕首製作書 | 4000 | T4 |  |
| godie-i00c | 風行天衣 | 5500 | T4 | armor+0.25 |
| godie-i00d | 出動戀愛戰士兵團 | 1600 | T3 |  |
| godie-i00e | 出動兄貴戰士兵團 | 1600 | T3 |  |
| godie-i00f | 霸王槍 | 7100 | T5 |  |
| godie-i00g | 奇美拉之翼 | 1750 | T3 | maxHealth+100, ad+5, maxMana+60, maxHealth+20, ad+1, maxMana+12 |
| godie-i00h | 風行天衣製作書 | 1000 | T2 |  |
| godie-i00i | 炎龍巨弩 | 7500 | T5 |  |
| godie-i00j | 奇門盾甲 | 6550 | T5 |  |
| godie-i00k | 女神之淚 | 2900 | T3 | armor+5 |
| godie-i00l | 落魂的嗜血劍 | 11500 | T5 | as+0.005 |
| godie-i00m | 米索莉護板 | 950 | T2 | armor+1, armor+7 |
| godie-i00n | 分手之鎚 | 4000 | T4 |  |
| godie-i00o | 金雞蛋 | 0 | T1 |  |
| godie-i00p | 聖誕之靴 | 1650 | T3 | maxHealth+6.0, ms+0.6 |
| godie-i00q | 伊娃之盾 | 4000 | T4 | armor+8 |
| godie-i00r | 山之書 | 2785 | T3 |  |
| godie-i00s | 黃金聖鬥衣 | 10000 | T5 | maxHealth+18.0, ms+0.6, maxHealth+100, ad+5, maxMana+60 |
| godie-i00t | 風之書 | 1950 | T3 |  |
| godie-i00u | 名刀-天狼 | 4000 | T4 | maxHealth+6.0 |
| godie-i00v | 四魂之玉的碎片-荒魂 | 0 | T1 |  |
| godie-i00w | 四魂之玉的碎片-和魂 | 0 | T1 | maxHealth+40, ad+2, maxMana+24, maxHealth+40, ad+2, maxMana+24 |
| godie-i00x | 四魂之玉的碎片-幸魂 | 0 | T1 |  |
| godie-i00y | 四魂之玉的碎片-奇魂 | 0 | T1 |  |
| godie-i00z | 四魂之玉 | 0 | T1 | maxHealth+100, ad+5, maxMana+60, maxHealth+100, ad+5, maxMana+60 |
| godie-i010 | 熱戀魔杖 | 1100 | T2 |  |
| godie-i011 | 名刀-天狼製作書 | 1750 | T3 |  |
| godie-i012 | 熾天使之弓 | 3350 | T4 |  |
| godie-i013 | 八取武士刀 | 3100 | T4 |  |
| godie-i014 | 天叢雲劍 | 5050 | T4 | maxHealth+100, ad+5, maxMana+60 |
| godie-i015 | 瑪那魔杖製作書 | 1500 | T3 |  |
| godie-i016 | 晨曦之光 | 5550 | T4 | maxHealth+100, ad+5, maxMana+60 |
| godie-i017 | 祕銀鎖子甲製作書 | 1500 | T3 |  |
| godie-i018 | 朗基努斯之槍 | 8050 | T5 |  |
| godie-i019 | 霸王槍製作書 | 3650 | T4 |  |
| godie-i01a | 好像有毒的生肉 | 0 | T1 |  |
| godie-i01b | 林之書 | 2550 | T3 |  |
| godie-i01c | 火之書 | 2040 | T3 |  |
| godie-i01d | 死之王的長槍 | 8600 | T5 | critChance+0.003, maxHealth+100, ad+5, maxMana+60 |
| godie-i01e | 和道一文字製作書 | 1200 | T2 |  |
| godie-i01f | 和道一文字 | 3100 | T4 | maxHealth+6.0 |
| godie-i01g | 貫雷槍 | 4300 | T4 |  |
| godie-i01h | 貫雷槍製作書 | 2000 | T3 |  |
| godie-i01i | 雷神之鎚 | 7990 | T5 |  |
| godie-i01j | 靈魂魔石 | 5650 | T4 | armor+0.25 |
| godie-i01k | 火焰泰坦腰帶 | 0 | T1 | armor+7 |
| godie-i01l | 雷神之鎚製作書 | 4000 | T4 |  |
| godie-i01m | 黑核晶 | 1800 | T3 |  |
| godie-i01n | 天堂之劍 | 0 | T1 | critChance+0.03 |
| godie-i01o | 死神裝束 | 6150 | T5 | maxHealth+12.0, maxHealth+100, ad+5, maxMana+60, ms+0.6 |
| godie-i01p | 聖誕之靴製作書 | 500 | T2 |  |
| godie-i01q | 光魔杖製作書 | 3700 | T4 |  |
| godie-i01r | 一克拉鑽戒製作書 | 150 | T1 |  |
| godie-i01s | 仙后座 | 0 | T1 | armor+0.25 |
| godie-i01t | 晨曦之光製作書 | 0 | T1 |  |
| godie-i01u | 伊娃之盾製作書 | 1500 | T3 |  |
| godie-i01v | 螺旋劍 | 9750 | T5 | maxHealth+100, ad+5, maxMana+60 |
| godie-i01w | 祕銀鎖子甲 | 3100 | T4 | armor+7 |
| godie-i01x | 思念的守護製作書 | 1000 | T2 |  |
| godie-i01y | 熾天使之弓製作書 | 500 | T2 |  |
| godie-i01z | 八取武士刀製作書 | 1000 | T2 |  |
| godie-i020 | 瑪那魔杖 | 3000 | T4 | critChance+2.75 |
| godie-i021 | 天叢雲劍製作書 | 1000 | T2 |  |
| godie-i022 | 龍騎士之劍製作書 | 800 | T2 |  |
| godie-i023 | 妖刀村正製作書 | 500 | T2 |  |
| godie-i024 | 朗基努斯之槍製作書 | 3750 | T4 |  |
| godie-i025 | 惡夢魔王碎片製作書 | 4500 | T4 |  |
| godie-i026 | 雅典娜的驚嘆號製作書 | 4500 | T4 |  |
| godie-i027 | 光魔杖 | 6700 | T5 |  |
| godie-i028 | 月神槍製作書 | 4150 | T4 |  |
| godie-i029 | 斬龍刀製作書 | 4500 | T4 |  |
| godie-i02a | 炎神弩製作書 | 4000 | T4 |  |
| godie-i02b | 妖物碎殺牙製作書 | 5500 | T4 |  |
| godie-i02c | 狂暴軒轅劍製作書 | 5000 | T4 |  |
| godie-i02d | 消失的密室 | 40000 | T5 | ad+100.0, maxHealth+40, ad+2, maxMana+24, ms+0.6 |
| godie-i02e | 狂暴軒轅劍 | 8100 | T5 |  |
| godie-i02f | 死神裝束製作書 | 4500 | T4 |  |
| godie-i02g | 奇美拉之翼(電腦) | 1750 | T3 | maxHealth+100, ad+5, maxMana+60, maxHealth+100, ad+5, maxMana+60 |
| godie-i02h | 戰旗 | 9065 | T5 | critChance+0.003 |
| godie-i02i | 泰坦之魂 | 0 | T1 |  |
| godie-i02j | 復仇之袍 | 9065 | T5 |  |
| godie-i02k | 惡魔吉他 | 9065 | T5 | as+0.006, ad+2.0 |
| godie-i02l | 舊系服 | 0 | T1 |  |
| godie-i02m | 牛蒡男 | 0 | T1 |  |
| godie-i02n | 斯巴達圓盾 | 0 | T1 |  |
| godie-i02o | 空罐頭 | 0 | T1 |  |
| godie-i02p | 網友手環 | 0 | T1 | armor+4 |
| godie-i02q | 澤之書 | 2785 | T3 |  |
| godie-i02r | 奇蹟之墜 | 6700 | T5 |  |
| godie-i02s | 奇蹟之墜製作書 | 2500 | T3 |  |
| godie-i02t | 盾甲天書 | 7635 | T5 |  |
| godie-i02u | 黑色魔書製作書 | 1500 | T3 |  |
| godie-i02v | 黑核晶製作書 | 150 | T1 |  |
| godie-i02w | 靈魂魔石製作書 | 2750 | T3 |  |
| godie-i02x | 斬岩刃 | 3450 | T4 |  |
| godie-i02y | 斬岩刃製作書 | 800 | T2 |  |
| godie-i02z | 盾甲天書製作書 | 2500 | T3 |  |
| godie-i030 | 黑色魔書 | 6235 | T5 |  |
| godie-i031 | 天生牙 | 6400 | T5 | manaRegen+7.2 |
| godie-i032 | 天生牙製作書 | 1500 | T3 |  |
| godie-i033 | 初心者護腕 | 1400 | T2 | armor+5, maxHealth+100, ad+5, maxMana+60 |
| godie-i034 | 大地泰坦角盔 | 0 | T1 | armor+7 |
| godie-i035 | 海潮泰坦護盾 | 0 | T1 | maxHealth+20000.0, armor+7 |
| godie-i036 | 嗜血邪書製作書 | 3000 | T4 |  |
| godie-i037 | 隱密介紹信 | 1000 | T2 |  |
| godie-i038 | 嗜血邪書 | 7735 | T5 |  |
| godie-i039 | 幻之匕首 | 7600 | T5 | maxHealth+10.0 |
| godie-i03a | 幻之匕首製作書 | 4500 | T4 |  |
| godie-i03b | 真．雅典娜的驚嘆號 | 16500 | T5 | critChance+10.0 |
| godie-i03c | 雅典娜的驚嘆號．改 | 12000 | T5 | critChance+7.0 |
| godie-i03d | 光明虎徹 | 5450 | T4 | maxHealth+100, ad+5, maxMana+60 |
| godie-i03e | 光明虎徹製作書 | 600 | T2 |  |
| godie-i03f | 甘豆腐之袍 | 8000 | T5 | armor+8 |
| godie-i03g | 甘豆腐之袍製作書 | 4000 | T4 |  |
| godie-i03h | 天地崩裂魔杖 | 7575 | T5 |  |
| godie-i03i | 天地崩裂魔杖製作書 | 2750 | T3 |  |
| godie-i03j | 黃昏公主的血脈 | 450 | T1 | maxHealth+100, ad+5, maxMana+60 |
| godie-i03l | 我愛一條柴 | 200 | T1 |  |
| godie-i03m | 反射之盾 | 10000 | T5 | armor+5 |
| godie-i03n | 餅乾 | 150 | T1 |  |
| godie-i03o | 死之王長槍的碎片 | 4300 | T4 |  |
| godie-i03p | 死之王意志的碎片 | 4600 | T4 |  |
| godie-i03q | 死之王神盾的碎片 | 4000 | T4 |  |
| godie-i03x | 破甲槍製作書 | 4000 | T4 |  |
| godie-i03z | 螺旋劍製作書 | 4700 | T4 |  |
| godie-i040 | 破甲槍 | 8000 | T5 |  |
| godie-i041 | 火閃電 | 2950 | T3 | ms+0.6, armor+0.25 |
| godie-i042 | 火閃電製作書 | 1500 | T3 |  |
| godie-i044 | 寂靜刃 - 詠月製作書 | 2200 | T3 |  |
| godie-i045 | 寂靜刃 - 詠月 | 4000 | T4 |  |
| godie-i049 | 賢者之石 | 3450 | T4 | maxHealth+100, ad+5, maxMana+60, maxHealth+100, ad+5, maxMana+60 |
| godie-i04a | 賢者之石製作書 | 1000 | T2 |  |
| godie-i04b | 冰晶虎魄 | 4150 | T4 |  |
| godie-i04c | 冰晶虎魄製作書 | 2000 | T3 |  |
| godie-i04d | 冰晶虎魄 - 改 | 7900 | T5 |  |
| godie-i04e | 冰晶虎魄 - 改製作書 | 3750 | T4 |  |
| godie-i04g | 奇門遁甲製作書 | 4700 | T4 |  |
| godie-i04h | 炎龍巨弩製作書 | 4150 | T4 |  |
| godie-i04i | 厄夜鐮刀 | 6590 | T5 |  |
| godie-i04j | 金幣(寶箱) | 0 | T1 |  |
| godie-i04k | 厄夜鐮刀製作書 | 2000 | T3 |  |
| godie-i04m | 殺豬刀製作書 | 5500 | T4 |  |
| godie-i04v | 正義之杖 | 100000 | T5 | maxHealth+40, ad+2, maxMana+24 |
| godie-i04y | 兌換空罐頭 | 0 | T1 |  |
| godie-i051 | 兌換仙后座 | 0 | T1 |  |
| godie-i053 | 仙后座殘骸 | 0 | T1 |  |
| godie-i054 | 認領寵物 | 0 | T1 |  |
| godie-i055 | 兌換牛蒡男 | 0 | T1 |  |
| godie-i056 | 交換寵物 | 0 | T1 |  |
| godie-i059 | 兌換舊系服 | 0 | T1 |  |
| godie-i05a | 兌換泰坦之魂 | 0 | T1 |  |
| godie-i05e | 兌換斯巴達圓盾 | 0 | T1 |  |
| godie-i05g | 世界樹的果實 | 1800 | T3 |  |
| godie-i05h | 失心匕首 | 8000 | T5 | maxHealth+10.0 |
| godie-i05k | 打我阿笨蛋卷軸 | 600 | T2 | maxHealth+20, ad+1, maxMana+12, maxHealth+100, ad+5, maxMana+60 |
| godie-i05l | 力量護腕 | 1400 | T2 | armor+5 |
| godie-i05m | 敏捷護腕 | 1400 | T2 | armor+5 |
| godie-i05n | 智慧護腕 | 1400 | T2 | armor+5 |
| godie-i05o | 刺針 | 5500 | T4 | maxHealth+100, ad+5, maxMana+60 |
| godie-i05q | 友情呼喚號角 | 2800 | T3 | maxHealth+10.0 |
| godie-i05r | 吸血石 | 1250 | T2 |  |
| godie-i05s | 嚇人假面 | 0 | T1 |  |
| godie-i05t | 定情戒指 | 400 | T1 |  |
| godie-i05u | 熱舞之靴 | 500 | T2 |  |
| godie-i05v | 破壞王手套 | 650 | T2 |  |
| godie-i05w | 觀音菩薩護身符 | 1650 | T3 |  |
| godie-i05x | 辣妹護腕 | 650 | T2 |  |
| godie-i05y | 蜂蜜罐 | 0 | T1 |  |
| godie-i05z | 出動正義射手兵團 | 1200 | T2 |  |
| godie-i060 | 死之王的意志 | 7500 | T5 |  |
| godie-i061 | 死之王的神盾 | 7100 | T5 | armor+10, armor+2 |
| godie-i062 | 飛鼠跳刀 | 1550 | T3 | ad+99999.0 |
| godie-i063 | 防狼電擊棒 | 1400 | T2 |  |
| godie-i065 | godie-i065 | 1150 | T2 |  |
| godie-i066 | 復仇之玉 | 1450 | T2 |  |
| godie-i067 | 惡夢魔王碎片 | 6300 | T5 |  |
| godie-i068 | 瑪那寶石 | 1250 | T2 |  |
| godie-i069 | 女神之淚製作書 | 350 | T1 |  |
| godie-i06a | 妖物碎殺牙 | 8850 | T5 |  |
| godie-i06b | 思念的守護 | 3050 | T4 |  |
| godie-i06c | 恐龍之斧 | 1050 | T2 |  |
| godie-i06d | 斬龍刀 | 7850 | T5 | critChance+0.3 |
| godie-i06e | 月牙魔杖 | 10000 | T5 |  |
| godie-i06f | 月神槍 | 7200 | T5 |  |
| godie-i06g | 殺豬刀 | 10000 | T5 |  |
| godie-i06h | 求生護腕 | 950 | T2 | maxHealth+100, ad+5, maxMana+60 |
| godie-i06i | 炎神弩 | 7350 | T5 |  |
| godie-i06j | 獸人船長十字鎬 | 0 | T1 | ad+11.0 |
| godie-i06k | 奧理哈魯根劍身 | 1600 | T3 |  |
| godie-i06l | 生肉 | 150 | T1 |  |
| godie-i06m | 真知之石 | 950 | T2 |  |
| godie-i06n | 老衲的棒子 | 0 | T1 |  |
| godie-i06o | 血染八月 | 12000 | T5 |  |
| godie-i06p | godie-i06p | 1250 | T2 |  |
| godie-i06q | 鍊金術之盾 | 15000 | T5 | armor+10, armor+5 |
| godie-i06r | 一克拉鑽戒 | 1850 | T3 | armor+4 |
| godie-i06s | 龍騎士之劍 | 3350 | T4 | critChance+0.15 |

## 五、地形 → 競技場(content/arenas/arena.godie.json)

本遊戲的競技場為「兩個圓形決鬥區」,與 WC3 的方形大地圖結構不同,採近似轉換:
- 解析 `war3map.wpm` 通行格(512×512, 每格 32 單位),以距離場找出兩塊最大的開放區域(格座標 [451, 403, 60] 與 [81, 85, 50]),分別映射為兩個決鬥區(半徑 24)。
- 區內不可通行的格子群聚 → 圓形障礙物(zone-0:3 個、zone-1:2 個)。
- `war3map.doo` 共 2490 個裝飾物,落在兩區內者轉為 decor(共 50 個),樹木類使用匯入的 `japanesecherry.glb`(自製櫻花樹模型)。

## 六、無法還原/轉換的部分

- **104 個 MPQ 區塊**無檔名可還原(受保護地圖,見上)。
- `(listfile)`、`(attributes)` 遭地圖保護破壞(解壓失敗,屬預期)。
- 暴雪內建模型本身(`units\...` 路徑)不在檔案內、不可匯出:自訂表英雄缺模型者僅產出草稿;隨機池的原始表英雄則以現有匯入模型代替(原模型為暴雪內建,以現有模型代替;見第三節對照表)。
- 召喚類/幻象類/`ANcl`(觸發腳本)技能:實際邏輯在 1.3MB 的 JASS 腳本內,無法自動轉為 EffectDef,以佔位技能標記 TODO。
- 模型附掛粒子特效(能量球體/刀光等)、GEOA 逐序列顯隱、全域序列(global sequence)軌跡未轉換。
- 疊加發光材質改以 glTF emissive 呈現(而非舊版半透明灰塊);隊伍發光(replaceableId 2)無法上色而丟棄。本次共移除 49 個模型上的隊伍發光灰塊、烘焙外掛模型 0 個(略過 0 個未還原者)。

## 七、驗證與授權

- `pnpm content:build` + `content:validate`:**835 份文件全數通過**(schema + 參照完整性)。
- 129 個 `.glb` 全數通過 Babylon NullEngine 載入測試(0 失敗);編輯器 Model Inspector 實機渲染確認(材質/骨架/動畫切換正常)。
- 測試套件 `w3x-import-unit`(tools/testrunner/suites.yaml)含 15 項測試:解密/explode 往返、物編解析(含原始表)、TRIGSTR、MDX 解析(含 ATCH 附掛路徑)、glTF 產出、clipMap 對應、隨機池解析、端對端管線與內容接線,以及本次三項修正:名稱合併、usca→scale、alpha/隊伍色材質、外掛模型烘焙,對應 `docs/todo/w3x-import.md`。
- 授權:匯入之 MDX 模型與 BLP 貼圖為地圖作者(使用者)自製素材;未匯入任何暴雪官方模型/貼圖(內建路徑素材一律以佔位圖代替)。

## 九、道具數值移植

承第四節:初次匯入 208 件物品時僅 **63** 件由屬性字串自動解出加成,其餘留空。本次針對留空與觸發式物品逐件比對 WC3 物編(w3t)描述與 JASS 腳本,補上被動屬性與命中觸發(on-hit)效果。移植後 **111** 件物品帶有效果(110 件含屬性 `modifiers`、13 件含 `passive` 命中鉤子,其中 12 件兩者兼具、1 件僅命中鉤子),**97** 件仍為空白(多為製作書與純主動/召喚道具)。item@1 schema 僅支援 `modifiers`(永久屬性)與 `passive`(命中鉤子,如 `onBasicAttack`),**無 `active` 主動技能欄位**,故凡「主動施放」類效果一律無法承載。

本次共處理 71 件(63 件既有加成不動),統計如下:

| 狀態 | 件數 | 說明 |
| --- | --- | --- |
| 移植(ported) | 20 | WC3 數值可 1:1 或依換算表忠實對應 |
| 近似(approximated) | 28 | 主體屬性照移,機率/範圍/主動等效果以合理近似或略過 |
| 略過(skipped) | 23 | 純主動/召喚/光環/獨特機制,無可映射屬性,保留空 stats |
| 製作書留空 | 55 | 合成配方書,WC3 本身即無屬性,維持空白 |

移植後含效果道具由 63 → 111 件(新增 20 移植 + 28 近似 = 48 件)。

### 代表道具

| 名稱 | 最終加成(一句話) | 狀態 |
| --- | --- | --- |
| 妖刀村正 | 攻擊+30、吸血25% | 移植 |
| 瑪那寶石 | 魔力+200 | 移植 |
| 恐龍之斧 | 力量+10 → 生命+220、攻擊+10 | 移植 |
| 熱舞之靴 | 移速+1.36(WC3 +75 依空間比例換算) | 移植 |
| 破壞王手套 | 攻擊速度+30% | 移植 |
| 冰晶虎魄 | 攻擊+35、生命+220、法強+10、魔力+150,普攻30%冰凍緩速0.4秒 | 移植 |
| 分手之鎚 | 攻擊+25,普攻削目標護甲7(5秒) | 移植 |
| 熾天使之弓 | 敏捷+10 → 護甲+3、攻速+20%,普攻附44火焰傷害 | 移植 |
| 復仇之玉 | 法球被動:普攻命中削目標護甲4(4秒),無自身屬性 | 移植 |
| 丈八蛇矛 | 攻擊+50、力量+30(生命+660、攻擊+30);擴散/穿透被動略過 | 近似 |
| 朗基努斯之槍 | 力量+15、敏捷+15、攻擊+50;淨化法球與機率閃電略過 | 近似 |
| 霸王槍 | 攻擊+40、力量+20;40%機率225範圍傷害近似為每次攻擊+90物理 | 近似 |
| 炎龍巨弩 | 敏捷+24 → 護甲+7.2、攻速+48%、攻擊+60;主動炎龍之怒略過 | 近似 |
| 破甲槍 | 攻擊+40,普攻削甲12(5秒);主動削甲10/7秒略過 | 近似 |
| 老衲的棒子 | 攻擊+44,普攻癱瘓4秒(以5秒內部冷卻近似10%機率) | 近似 |
| 血染八月 | 攻擊+158,普攻附88物理(50%機率與0.01秒暈眩近似為必觸發) | 近似 |
| 光魔杖 | 攻擊+30、智慧+24 → 法強+24、魔力+360,普攻附185魔法(連鎖閃電近似為單體) | 近似 |
| 辣妹護腕 | 減魔法傷害10% → 以魔抗11.11近似(100/(100+mr) 恰為10%) | 近似 |
| 月牙魔杖 | 減魔法傷害50% → 魔抗+100;每秒範圍流星光環略過 | 近似 |
| 奇門盾甲 | 生命+777、每秒回血+16;50%機率格擋略過 | 近似 |
| 山之書 | 純主動流星雨(650傷害/耗魔216),無被動屬性 | 略過 |
| 林之書 | 純主動範圍隱身25秒(隱身屬 unique),無被動屬性 | 略過 |
| 出動怨念射手兵團 | 召喚類,無數值與被動屬性 | 略過 |
| 復仇之袍 | 光環反彈70%傷害+受擊機率詛咒,無可映射屬性 | 略過 |
| 觀音菩薩護身符 | 抵擋一次指定法術(法術護盾),獨特效果 | 略過 |
| 真知之石 | 看穿隱形(真視),獨特偵測效果 | 略過 |
| 認領寵物 | 隨機給予九種寵物之一,無固定屬性 | 略過 |
| 餅乾 | 消耗品式回復(生命 500),非永久加成 | 略過 |

### 換算與近似原則

- **主屬性 → FinalStat**(與第三節英雄換算同源):力量 1 → 生命 +22、攻擊 +1;敏捷 1 → 護甲 +0.3、攻擊速度 +2%;智慧 1 → 法強 +1、魔力 +15。
- **移動速度**:WC3 移速加成依空間比例 ÷55 換算(如 +75 → +1.36)。
- **減魔法傷害 X%**:以魔抗 mr 近似,令減傷公式 100/(100+mr) 恰等於 X%(10% → mr 11.11、50% → mr 100)。
- **機率/範圍傷害**:X% 機率造成 N 點傷害者,近似為每次普攻附加 (X%·N) 的固定 on-hit 傷害(`onBasicAttack` + `damage`);高頻觸發改以 `internalCooldown` 近似觸發間隔;連鎖/彈跳/範圍擴散近似為單體命中;極短暈眩(0.01–0.1 秒)略過。
- **主動技能(active)**:item@1 無 `active` 欄位,凡主動施放(流星雨/宙斯之怒/死亡閃電/範圍隱身/放逐虛空/沉默/全滿回復等)一律略過,僅保留其被動屬性(若有)。
- **獨特機制**:召喚兵團、寵物、幻象、光環(反彈/減速/回血/護甲)、隱身、復活、真視、法力燒毀、指定法術格擋、無傷害格擋等,均無 schema 欄位可承載,保留空 stats 並於 `notes` 記錄;光環型護甲/回血在無範圍系統下近似為持有者自身平飛(flat)修正。

驗證:`content:build` 重建索引(items 集合 212 份)後,`content:validate` 首次即通過(835 份文件、contentVersion `cv_eb29c8f7a736`,0 schema 錯誤、0 懸空參照);另以沙盒 vitest 對 25 件樣本(12 純屬性 + 全 13 件命中觸發)實跑買入/授予並重算 FinalStat,確認無例外、無屬性倒退、每項正向平飛加成均提升對應屬性,且命中鉤子數與各道具 `passive[]` 長度一致。


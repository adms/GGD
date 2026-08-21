# 技能 in-game 可施放覆蓋矩陣 — Task #128

> 生成於 `packages/shared/src/sim/castabilitySweep.test.ts`（每次跑測試即重算）。
> 這是**診斷**：把 51 位英雄每一格 天生技/Q/W/E/R/EX + 普攻在真的 SimWorld 裡按下去，量測有沒有真的產生效果（傷害／投射物／狀態／護盾／補血／補魔／位移／變身），不修任何技能。⛔ **純特效（只有 spawnVfx）不算有效果**，它自成一類 🟡，⛔ 既不算 ✅ 也不併進 ❌ —— 見下方方法說明（GH#374）。

> **名單來源**：apps/platform/internal/curation/starter.go（49）＋ 版控內其餘可選英雄（2，扣掉變身態與已下架）＋ data/curation/whitelist.json 額外啟用（0）。
> 名單取自**版控內**的 `starterChampions`（新安裝套用的首發開放名單，Go 端 `TestFirstOpenRoster` 逐一釘死），所以任何 clone／worktree／CI 都掃同一份 49 人；營運白名單 `data/curation/whitelist.json` 是 gitignore 的機器狀態，存在時只**加掃**它額外開放的英雄，且不列入下方釘死的計數。
> 本機額外加掃（僅營運白名單開放、不在首發名單）：`sela`、`thorne`。

## 判定圖例

| 標記 | 意義 |
| --- | --- |
| ✅ PASS | 施放被接受且量到實際效果，過程無例外 |
| 🟣 PASSIVE | WC3 永久被動（原生 Cool=0、無可施放效果）；已驗證其 ModifierSource 確實掛上，非 bug |
| ❌ FAIL | 被拒絕／丟例外／接受了卻沒有任何可量測效果（no-op）；或英雄無法生成 |
| 🟡 只有特效 | 放得出去、冷卻真的付了、畫面上看得到東西 —— **而場上一個數字都沒動**（整棵效果樹只有 `spawnVfx`）。⛔ 它不算 ✅（GH#373 就是這樣上架的），也**不併進** ❌（「按不下去」跟「按得下去但是空的」要修的地方不同） |
| — 無此格 | 這位英雄根本沒有這一格（原作就沒有 NN-00 天生技／骨架示範英雄沒有 EX）；不計入下方比例的分子與分母 |
| 🔵 形態閘 | 這一階被動寫著 `whileForm:"alternate"`，**而這位英雄換不過去**（`transform.counterpartId` 缺失／指向未註冊的 doc）⇒ **本次未量測**；同 — 一樣不計入分子與分母。⭐ GH#412 之後「有替身身體」的那一種**不再是 🔵** —— 普查會真的走 `applyChampionForm` 換到替身身體再量一次 |

## 總計

- **格數**：51 英雄 × 7 槽 = **357**
- **✅ PASS：293 / 357**（82.1%）　🟣 PASSIVE：58　🟡 只有特效：0　❌ FAIL：1　— 無此格：5
- 把「正確的永久被動」算進可接受行為：**351 / 357**（98.3%）如預期運作，真正的缺口是 **1** 格（❌ 1 ＋ 🟡 0），另有 **0** 格 🔵 本次未量測（形態閘）。
- **閘 3 在看的那個數字**（只算版控首發名單那 49 人、扣掉「無此格」）：**341 / 342 = 99.71%**（棘輪下限 100.00%）。
- 英雄生成失敗：**0**（無）

## 近戰 vs 遠程（attackType 維度）

- 名單：**近戰 37**、**遠程 14**。
- **普攻形態**：遠程英雄中 **14/14** 的普攻確實射出投射物（`projectileSpawn`、事件 `ranged:true`）；近戰英雄中 **37/37** 的普攻是貼身直接傷害（無投射物、`ranged:false`）。這正是遠程與近戰在普攻上的行為差異，兩邊都被本次量到。
- **技能投射（skillshot castType）**：本名單中 skillshot 技能格 遠程 5 格、近戰 12 格；skillshot 一律用施法方向生成投射物，與施法者是遠程或近戰無關（castType 獨立於 attackType）。

## PASS 觸發頻道分佈（驗證非橡皮圖章）

> 每個 ✅ 記錄它**第一個**被觸發的頻道（傷害＞投射物＞補血＞補魔＞護盾＞狀態＞buff＞位移＞特效）。若全靠 `vfx` 過關代表量測太寬鬆；下表證明絕大多數是真正的 gameplay 頻道。

| 頻道 | PASS 格數 |
| --- | --: |
| damage | 180 |
| buff | 65 |
| projectile | 14 |
| status | 8 |
| heal | 8 |
| dash | 7 |
| championForm | 6 |
| shield | 3 |
| resourceSwap | 1 |
| taunt | 1 |

- 僅靠 `vfx` 頻道拿到 ✅ 的格數：**0**（GH#374 之後這個數字結構上就該是 0 —— 純特效已經自成一類 🟡，不再走 ✅）。

## 矩陣

| 英雄 | ID | 型 | Q | W | E | R | EX | 天生技 | 普攻 |
| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| 蟬在叫人壞掉 - 龍宮禮奈 | `godie-e001` | 近 | ✅ | 🟣 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 亞瑟王 - Saber | `godie-e002` | 近 | 🟣 | ✅ | ✅ | ✅ | 🟣 | 🟣 | ✅ |
| 火霧戰士 - 夏娜 | `godie-e008` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | 近 | 🟣 | 🟣 | 🟣 | ✅ | 🟣 | 🟣 | ✅ |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | 遠 | ✅ | 🟣 | ✅ | ✅ | 🟣 | ✅ | ✅ |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | 近 | ✅ | 🟣 | ✅ | ✅ | 🟣 | 🟣 | ✅ |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | 近 | ✅ | ✅ | ✅ | 🟣 | ✅ | 🟣 | ✅ |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | 近 | ✅ | ✅ | ✅ | ✅ | 🟣 | 🟣 | ✅ |
| 魔法老師 - 涅吉。史普林。菲爾德 | `godie-emfr` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 奇樂 - 夜神月 | `godie-emns` | 遠 | ✅ | 🟣 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 治癒系公主 - 木乃香 | `godie-etyr` | 遠 | ✅ | 🟣 | ✅ | ✅ | 🟣 | ✅ | ✅ |
| 龍之子 - 天地志狼 | `godie-ewar` | 近 | ✅ | ✅ | 🟣 | ✅ | ✅ | 🟣 | ✅ |
| 時空勇者 - 林克 | `godie-h00l` | 近 | ✅ | ✅ | 🟣 | ✅ | 🟣 | 🟣 | ✅ |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | 近 | ✅ | ✅ | ✅ | ✅ | 🟣 | 🟣 | ✅ |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | 近 | 🟣 | ✅ | ✅ | ✅ | 🟣 | 🟣 | ✅ |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | 近 | 🟣 | 🟣 | 🟣 | 🟣 | ✅ | 🟣 | ✅ |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | 近 | ✅ | 🟣 | 🟣 | ✅ | 🟣 | 🟣 | ✅ |
| 海克力斯 - Berserker | `godie-hapm` | 近 | ✅ | ✅ | 🟣 | ✅ | ✅ | 🟣 | ✅ |
| 最終幻想 - 克勞德 | `godie-hart` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 種子神奇寶貝 - 妙蛙種子 | `godie-hgam` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 黑魔導士 - 莉娜因巴斯 | `godie-hjai` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 獸矛傳承使 - 蒼月潮 | `godie-hpb1` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 超級普烏 - 魔人普烏 | `godie-huth` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 梅杜莎 - Rider | `godie-hvsh` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 除魔巫女 - 桔梗 | `godie-hvwd` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 黑暗福音 - 依文潔琳 | `godie-n003` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 小叮噹 - 哆拉A夢 | `godie-n00b` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 妖狐藏馬 - 南野秀一 | `godie-nsjs` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 傲嬌電氣老鼠 - 皮卡娘 | `godie-o00k` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 獸神官 - 傑洛士 | `godie-o00l` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 夢幻之星 - 初音 | `godie-o02p` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 神奇寶貝兒 - 皮卡丘 | `godie-ofar` | 遠 | ✅ | 🟣 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 美白大法師 - 黑人牙膏 | `godie-ogld` | 遠 | ✅ | ✅ | ✅ | ✅ | ❌ | — | ✅ |
| 賽亞人 - 悟空 | `godie-ogrh` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 電車癡漢 - 臭作 | `godie-orkn` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 犬妖 - 殺生丸 | `godie-osam` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 鬼畜紅王 - 鬼畜狂刀KYO | `godie-u00h` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 神性的流失 - 賽菲洛斯 | `godie-u00j` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 邪惡意念集合體 - 死之王 | `godie-u00k` | 遠 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 草帽小子 - 蒙其.D.魯夫 | `godie-u00n` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 黑手黨老大 - 基廉列克 | `godie-u00v` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 魔界霸主 - 巴恩大魔王 | `godie-ubal` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 職業獵人 - 傑 富力士 | `godie-ucrl` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 至尊學長 - 飛鼠先生 | `godie-udea` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 三刀流劍士 - 索隆 | `godie-udre` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 北斗神拳掌門人 - 拳四郎 | `godie-umal` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 邪眼師 - 飛影 | `godie-uvng` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 聖杯黑泥醬 - 喪標麥可 | `godie-zombiex` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | 🟣 | ✅ |
| Sela, the Ember Sage | `sela` | 遠 | ✅ | ✅ | ✅ | ✅ | — | — | ✅ |
| Thorne, the Bramble Knight | `thorne` | 近 | ✅ | ✅ | ✅ | ✅ | — | — | ✅ |

## FAIL 清單（英雄 + 槽 + 原因，交給技能保真／VFX 負責人）

| 英雄 | ID | 槽 | castType | 型 | 原因 |
| --- | --- | --- | --- | --- | --- |
| 美白大法師 - 黑人牙膏 | `godie-ogld` | EX | self | 遠 | ⚠️ **判定隨 seed 改變**（隨機節點 [randomArea]）：FAIL 18/24、PASS 6/24。⇒ 這一格今天是**擲骰**不是量測；照最壞的那一個記，理由見 SEED_DEPENDENT_CELLS。 |

## 🟡 只有特效清單（放得出去、但場上一個數字都沒動）

> ⛔ 這一張表**不是** FAIL 的子集，它是 GH#374 洞②之前**被算成 ✅** 的那一族：整棵效果樹只有 `spawnVfx`，玩家按下去看得到光，血量／位置／狀態一個都沒動。修法見 CLAUDE.md 第一·五守則（替換成做得到的效果，⛔ 不是刪掉描述）。

（無）

## 🔵 形態閘清單（本次未量測，⛔ 不是缺陷）

> ⭐ GH#412 之後這一張表只剩**唯一**一種成因：rank 區塊帶 `whileForm:"alternate"`，**而這位英雄沒有可解析的替身身體**，所以普查連換都換不過去。有替身身體的那一種現在會被真的量到 —— 普查走出貨的 `applyChampionForm` → `setBody` → `syncAbilityPassives` 換到替身形態再問一次「來源有沒有掛上」，量到就是 🟣，掛不上就是 ❌（⛔ 不再是「不知道」）。

（無）

## 🎲 隨機節點的跨 seed 量測（GH#407，每格 24 顆）

> 一支帶 `weightedBranch` / `chance` 條件葉 / `randomArea` 的技能，用**一顆** seed 量出來的 ✅／❌ 是一次**擲骰**：GH#374 收尾時實測 13-04 龍星群 **12/24** 顆 seed 命中、70-04 千年練成 **16/24** —— 同一支技能，換一顆 seed 就從 PASS 變 FAIL，而這是一條會擋 CI 的 gate。⇒ 這些格子改成跨 seed **全部量一遍**，⛔ 不是重骰到過為止（那是挑答案，不是量測）。名單由 `castabilityVerdict.ts::stochasticNodeKinds` 從效果樹**推導**，⛔ 不是一張會過期的技能清單。

| 英雄 | ID | 槽 | 隨機節點 | 跨 seed 判定分佈 | 穩定？ |
| --- | --- | --- | --- | --- | :-: |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | R | randomArea | PASS 24/24 | ✅ 是 |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | R | randomArea | PASS 24/24 | ✅ 是 |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | EX | weightedBranch | PASS 24/24 | ✅ 是 |
| 小叮噹 - 哆拉A夢 | `godie-n00b` | PASSIVE | weightedBranch | PASS 24/24 | ✅ 是 |
| 美白大法師 - 黑人牙膏 | `godie-ogld` | EX | randomArea | FAIL 18/24、PASS 6/24 | ⚠️ 否（擲骰） |

## 🟣 永久被動清單（非 bug，僅供對照）

| 英雄 | ID | 槽 | 掛載 |
| --- | --- | --- | --- |
| 蟬在叫人壞掉 - 龍宮禮奈 | `godie-e001` | W | passive:modifiers |
| 亞瑟王 - Saber | `godie-e002` | Q | passive:modifiers |
| 亞瑟王 - Saber | `godie-e002` | EX | passive:hooks |
| 亞瑟王 - Saber | `godie-e002` | PASSIVE | passive:hooks |
| 火霧戰士 - 夏娜 | `godie-e008` | PASSIVE | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | Q | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | W | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | E | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | EX | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | PASSIVE | passive:hooks |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | W | passive:hooks |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | EX | passive:hooks |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | W | passive:hooks |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | EX | passive:hooks |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | PASSIVE | passive:modifiers |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | R | passive:hooks |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | PASSIVE | passive:hooks |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | EX | passive:hooks |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | PASSIVE | passive:hooks |
| 魔法老師 - 涅吉。史普林。菲爾德 | `godie-emfr` | PASSIVE | passive:hooks |
| 奇樂 - 夜神月 | `godie-emns` | W | passive:hooks |
| 治癒系公主 - 木乃香 | `godie-etyr` | W | passive:modifiers |
| 治癒系公主 - 木乃香 | `godie-etyr` | EX | passive:modifiers |
| 龍之子 - 天地志狼 | `godie-ewar` | E | passive:modifiers |
| 龍之子 - 天地志狼 | `godie-ewar` | PASSIVE | passive:modifiers |
| 時空勇者 - 林克 | `godie-h00l` | E | passive:hooks |
| 時空勇者 - 林克 | `godie-h00l` | EX | passive:hooks |
| 時空勇者 - 林克 | `godie-h00l` | PASSIVE | passive:hooks |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | EX | passive:modifiers@alternate |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | PASSIVE | passive:hooks |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | Q | passive:hooks |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | EX | passive:modifiers |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | PASSIVE | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | Q | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | W | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | E | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | R | passive:modifiers |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | PASSIVE | passive:hooks |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | W | passive:hooks |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | E | passive:hooks |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | EX | passive:hooks |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | PASSIVE | passive:hooks |
| 海克力斯 - Berserker | `godie-hapm` | E | passive:hooks |
| 海克力斯 - Berserker | `godie-hapm` | PASSIVE | passive:marks |
| 最終幻想 - 克勞德 | `godie-hart` | PASSIVE | passive:hooks |
| 黑魔導士 - 莉娜因巴斯 | `godie-hjai` | PASSIVE | passive:hooks |
| 獸矛傳承使 - 蒼月潮 | `godie-hpb1` | PASSIVE | passive:hooks |
| 超級普烏 - 魔人普烏 | `godie-huth` | PASSIVE | passive:modifiers |
| 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` | PASSIVE | passive:hooks |
| 妖狐藏馬 - 南野秀一 | `godie-nsjs` | PASSIVE | passive:hooks |
| 夢幻之星 - 初音 | `godie-o02p` | PASSIVE | passive:modifiers |
| 神奇寶貝兒 - 皮卡丘 | `godie-ofar` | W | passive:hooks |
| 賽亞人 - 悟空 | `godie-ogrh` | PASSIVE | passive:hooks |
| 神性的流失 - 賽菲洛斯 | `godie-u00j` | PASSIVE | passive:modifiers |
| 邪惡意念集合體 - 死之王 | `godie-u00k` | PASSIVE | passive:hooks |
| 黑手黨老大 - 基廉列克 | `godie-u00v` | PASSIVE | passive:modifiers |
| 至尊學長 - 飛鼠先生 | `godie-udea` | PASSIVE | passive:modifiers |
| 聖杯黑泥醬 - 喪標麥可 | `godie-zombiex` | PASSIVE | passive:hooks |

## 方法與抽樣說明

- 每一格用一個**全新的 SimWorld**（SKELETON_ARENA）跑，避免冷卻／增益／狀態互相污染；施法者 + 一個敵方假人（射程內、貼身 1.35u）+ 一個友方假人（給只能指向友軍的補血／護盾／增益）。
- 依 castType 擺位：targeted→貼身敵人（友軍向技能→貼身友軍）、ground→敵人所在點、skillshot／dash→朝敵人、self→自己。
- 「有效果」= 下列任一頻道被觸發且無例外：`damage`／`heal`／`manaRestore`／`projectileSpawn`／`knockdown`／`championForm`／`resourceSwap` 事件，或全場護盾／狀態／buff 來源／投射物／【嘲弄】數量上升，或**金幣總額上升**（GH#407），或施法者位移（dash）。⛔ 金幣走的是**狀態差**不是 `goldGrant` 事件 —— 那個事件在付了 0 元時照樣發，收它會造出新的假 ✅。⛔ **`vfxSpawn` 不在名單上**（2026-08-18 / GH#374）：它唯一保證的是畫面上有東西，而一支只有畫面的技能改不動任何一個數字；在此之前它算 ✅，於是 GH#373 那 5 支「整棵樹只有 spawnVfx」的主動天生技在全綠的測試底下上架。回血／回魔前先把目標降到半血半魔，確保有回復空間；施法者法力設為剛好夠付，使自我回魔也量得到。被動回血（RegenSystem）不發 `heal` 事件，故不會誤判。
- 每次施放後的觀察窗是**逐支算出來的**（`observationWindow`）：基礎 **26 tick**　＋　吟唱 `castWindow` = round(castTimeSec × 30) + 1　＋　位移飛行 `leapWindow`。普攻另給 **40 tick** 讓第一次揮擊落地。本次實測最長的一格是 **117 tick**（`godie-e00r.r`）。
- ⛔ **它不是一個固定數字，而且不可以改回去**：2026-08-13 owner 把吟唱放寬到 0.06~4.00 秒（141 支技能吃到 ≥1 秒前搖）那天，一個寫死 26 tick 的窗口一次造出 **120 格假 ❌** —— 技能全部是好的，是**觀察者在該看的時候閉眼**。
- ⭐ 因此**沒有「前搖超出窗口」這種盲點**：窗口按定義涵蓋解析那一格（`abilitySystem` 用 round(castTimeSec ÷ dt)，而 `castWindow` 是同一個 round **加一**）。⚠️ 這一行以前是一段寫死的「已知量測盲點⋯下方唯一那格 ❌」警語，它在 `castWindow` 落地之後每跑一次就重生一份**自相矛盾**的文件（GH#46）—— 現在守它的是本檔的「觀察窗涵蓋解析 tick」那條閘。
- **完整跑遍全 51 英雄 × 7 槽 = 357 格，無抽樣**。
- **會變紅的八道閘**（(1)–(7) 都只看版控名單那 49 人，營運額外開放的英雄不影響）：(1) 掃描必須跑完 49×7；(2) 49 位英雄全部要能生成；(3) 可用格數（✅+🟣）佔比不得低於 **100.00%**（棘輪下限，比例不是絕對值 —— 名單長度會變）；(4) **逐格釘死的缺口名單**（`KNOWN_GAPS`）：冒出名單外的新缺口會紅、名單上的缺口修好了沒劃掉會紅、同一格從 ❌ 變 🟡（或反過來）也會紅 —— 替一支空技能補個特效不是修好它；(5) **形態閘名單**（`FORM_GATED_CELLS`，三個方向，GH#412）；(6) **seed 依賴名單**（`SEED_DEPENDENT_CELLS`，三個方向，GH#407）；(7) **跨 seed 量測儀器本身要活著** —— 一格都沒被跨 seed 量過就是偵測器壞了，那會讓 (6) 結構上永遠綠；(8) ⭐ **觀察窗涵蓋每一支技能自己的解析 tick**（GH#46，掃全部已註冊技能不只首發名單）—— 窗口接不住前搖就會把好技能記成假 ❌，2026-08-13 一次量到 120 格。個別既知 no-op 不會使測試變紅（它們是要回報的發現，列在上方兩張表），但既有可用的格子被改壞會。

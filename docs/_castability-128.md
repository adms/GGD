# 技能 in-game 可施放覆蓋矩陣 — Task #128

> 生成於 `packages/shared/src/sim/castabilitySweep.test.ts`（每次跑測試即重算）。
> 這是**診斷**：把 63 位英雄每一格 Q/W/E/R/EX + 普攻在真的 SimWorld 裡按下去，量測有沒有真的產生效果（傷害／投射物／狀態／護盾／補血／補魔／位移／特效），不修任何技能。

> **名單來源**：apps/platform/internal/curation/starter.go（53）＋ data/curation/whitelist.json 額外啟用（10）。
> 名單取自**版控內**的 `starterChampions`（新安裝套用的首發開放名單，Go 端 `TestFirstOpenRoster` 逐一釘死），所以任何 clone／worktree／CI 都掃同一份 53 人；營運白名單 `data/curation/whitelist.json` 是 gitignore 的機器狀態，存在時只**加掃**它額外開放的英雄，且不列入下方釘死的計數。
> 本機額外加掃（僅營運白名單開放、不在首發名單）：`godie-e007`、`godie-h020`、`godie-h02r`、`godie-h02u`、`godie-n00p`、`godie-n01c`、`godie-o00x`、`godie-u00l`、`godie-u010`、`godie-u01u`。

## 判定圖例

| 標記 | 意義 |
| --- | --- |
| ✅ PASS | 施放被接受且量到實際效果，過程無例外 |
| 🟣 PASSIVE | WC3 永久被動（原生 Cool=0、無可施放效果）；已驗證其 ModifierSource 確實掛上，非 bug |
| ❌ FAIL | 被拒絕／丟例外／接受了卻沒有任何可量測效果（no-op）；或英雄無法生成 |

## 總計

- **格數**：63 英雄 × 6 槽 = **378**
- **✅ PASS：226 / 378**（59.8%）　🟣 PASSIVE：29　❌ FAIL：123
- 把「正確的永久被動」算進可接受行為：**255 / 378**（67.5%）如預期運作，只有 **123** 格是真正的缺口。
- 英雄生成失敗：**0**（無）

## 近戰 vs 遠程（attackType 維度）

- 名單：**近戰 46**、**遠程 17**。
- **普攻形態**：遠程英雄中 **17/17** 的普攻確實射出投射物（`projectileSpawn`、事件 `ranged:true`）；近戰英雄中 **46/46** 的普攻是貼身直接傷害（無投射物、`ranged:false`）。這正是遠程與近戰在普攻上的行為差異，兩邊都被本次量到。
- **技能投射（skillshot castType）**：本名單中 skillshot 技能格 遠程 5 格、近戰 16 格；skillshot 一律用施法方向生成投射物，與施法者是遠程或近戰無關（castType 獨立於 attackType）。

## PASS 觸發頻道分佈（驗證非橡皮圖章）

> 每個 ✅ 記錄它**第一個**被觸發的頻道（傷害＞投射物＞補血＞補魔＞護盾＞狀態＞buff＞位移＞特效）。若全靠 `vfx` 過關代表量測太寬鬆；下表證明絕大多數是真正的 gameplay 頻道。

| 頻道 | PASS 格數 |
| --- | --: |
| damage | 147 |
| buff | 30 |
| projectile | 18 |
| dash | 11 |
| heal | 8 |
| status | 6 |
| championForm | 5 |
| shield | 1 |

- 僅靠 `vfx`（純特效、無 gameplay 頻道）過關：**0** 格。

## 矩陣

| 英雄 | ID | 型 | Q | W | E | R | EX | 普攻 |
| --- | --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| 蟬在叫人壞掉 - 龍宮禮奈 | `godie-e001` | 近 | ✅ | 🟣 | ✅ | ✅ | ❌ | ✅ |
| 亞瑟王 - Saber | `godie-e002` | 近 | 🟣 | ✅ | ❌ | ✅ | 🟣 | ✅ |
| 火霧戰士 - 夏娜 | `godie-e008` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 戰國刺客Azumi - 安云 | `godie-e00k` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | 近 | ❌ | 🟣 | 🟣 | ❌ | 🟣 | ✅ |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | 遠 | ✅ | 🟣 | ✅ | ❌ | 🟣 | ✅ |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | 近 | ✅ | 🟣 | ✅ | ❌ | 🟣 | ✅ |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | 近 | ❌ | ✅ | ❌ | 🟣 | ❌ | ✅ |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | 近 | ✅ | ✅ | ✅ | ❌ | 🟣 | ✅ |
| 魔法老師 - 涅吉。史普林。菲爾德 | `godie-emfr` | 遠 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 奇樂 - 夜神月 | `godie-emns` | 遠 | ❌ | 🟣 | ❌ | ❌ | ❌ | ✅ |
| 治癒系公主 - 木乃香 | `godie-etyr` | 遠 | ✅ | 🟣 | ✅ | ✅ | 🟣 | ✅ |
| 龍之子 - 天地志狼 | `godie-ewar` | 近 | ✅ | ❌ | 🟣 | ❌ | ❌ | ✅ |
| 時空勇者 - 林克 | `godie-h00l` | 近 | ✅ | ✅ | 🟣 | ❌ | 🟣 | ✅ |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | 近 | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | 近 | 🟣 | ✅ | ✅ | ✅ | 🟣 | ✅ |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | 近 | 🟣 | 🟣 | 🟣 | 🟣 | ✅ | ✅ |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | 近 | ✅ | 🟣 | 🟣 | ❌ | 🟣 | ✅ |
| 海克力斯 - Berserker | `godie-hapm` | 近 | ✅ | ❌ | 🟣 | ❌ | ❌ | ✅ |
| 最終幻想 - 克勞德 | `godie-hart` | 近 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 慈悲的王者 - 賈修貝爾 | `godie-hblm` | 遠 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 種子神奇寶貝 - 妙蛙種子 | `godie-hgam` | 近 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 黑魔導士 - 莉娜因巴斯 | `godie-hjai` | 遠 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 不死之身-無 - 藤井八雲 | `godie-hpal` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 獸矛傳承使 - 蒼月潮 | `godie-hpb1` | 近 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 超級普烏 - 魔人普烏 | `godie-huth` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 梅杜莎 - Rider | `godie-hvsh` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 除魔巫女 - 桔梗 | `godie-hvwd` | 遠 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 黑暗福音 - 依文潔琳 | `godie-n003` | 遠 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 小叮噹 - 哆拉A夢 | `godie-n00b` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` | 近 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 通靈人 - 麻倉葉 | `godie-nplh` | 近 | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 妖狐藏馬 - 南野秀一 | `godie-nsjs` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 傲嬌電氣老鼠 - 皮卡娘 | `godie-o00k` | 遠 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 獸神官 - 傑洛士 | `godie-o00l` | 遠 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 夢幻之星 - 初音 | `godie-o02p` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 神奇寶貝兒 - 皮卡丘 | `godie-ofar` | 遠 | ✅ | 🟣 | ✅ | ✅ | ❌ | ✅ |
| 美白大法師 - 黑人牙膏 | `godie-ogld` | 遠 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 賽亞人 - 悟空 | `godie-ogrh` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 電車癡漢 - 臭作 | `godie-orkn` | 遠 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 犬妖 - 殺生丸 | `godie-osam` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 鬼畜紅王 - 鬼畜狂刀KYO | `godie-u00h` | 近 | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 神性的流失 - 賽菲洛斯 | `godie-u00j` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 邪惡意念集合體 - 死之王 | `godie-u00k` | 遠 | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 草帽小子 - 蒙其.D.魯夫 | `godie-u00n` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 黑手黨老大 - 基廉列克 | `godie-u00v` | 近 | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| 魔界霸主 - 巴恩大魔王 | `godie-ubal` | 近 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 職業獵人 - 傑 富力士 | `godie-ucrl` | 近 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 至尊學長 - 飛鼠先生 | `godie-udea` | 近 | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 三刀流劍士 - 索隆 | `godie-udre` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 北斗神拳掌門人 - 拳四郎 | `godie-umal` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 邪眼師 - 飛影 | `godie-uvng` | 近 | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 聖杯黑泥醬 - 喪標麥可 | `godie-zombiex` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 龍之子 - 天地志狼 | `godie-e007` | 遠 | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| 黑魔導士 - 莉娜因巴斯 | `godie-h020` | 遠 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 種子神奇寶貝 - 妙蛙花 | `godie-h02r` | 近 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02u` | 近 | ✅ | ❌ | ✅ | ❌ | ❌ | ✅ |
| 妖狐藏馬 - 南野秀一 | `godie-n00p` | 遠 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 傳說的龍騎士 - 勇者小呆 | `godie-n01c` | 近 | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| 超級賽亞人 - 悟空 | `godie-o00x` | 近 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| 北斗之鼠 - 拳四郎 | `godie-u00l` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 邪眼師 - 飛影 | `godie-u010` | 近 | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 三刀流劍士 - 索隆 | `godie-u01u` | 近 | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ |

## FAIL 清單（英雄 + 槽 + 原因，交給技能保真／VFX 負責人）

| 英雄 | ID | 槽 | castType | 型 | 原因 |
| --- | --- | --- | --- | --- | --- |
| 蟬在叫人壞掉 - 龍宮禮奈 | `godie-e001` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 亞瑟王 - Saber | `godie-e002` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 火霧戰士 - 夏娜 | `godie-e008` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 火霧戰士 - 夏娜 | `godie-e008` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 戰國刺客Azumi - 安云 | `godie-e00k` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 戰國刺客Azumi - 安云 | `godie-e00k` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | Q | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | R | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | R | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | R | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | Q | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | R | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 魔法老師 - 涅吉。史普林。菲爾德 | `godie-emfr` | Q | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 魔法老師 - 涅吉。史普林。菲爾德 | `godie-emfr` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 奇樂 - 夜神月 | `godie-emns` | Q | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 奇樂 - 夜神月 | `godie-emns` | E | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 奇樂 - 夜神月 | `godie-emns` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 奇樂 - 夜神月 | `godie-emns` | EX | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 龍之子 - 天地志狼 | `godie-ewar` | W | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 龍之子 - 天地志狼 | `godie-ewar` | R | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 龍之子 - 天地志狼 | `godie-ewar` | EX | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 時空勇者 - 林克 | `godie-h00l` | R | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | W | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 開外掛的死神 - 黑崎一護 | `godie-h01n` | EX | self | 近 | passive-only but no modifier/hook source attaches (inert) |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | R | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 海克力斯 - Berserker | `godie-hapm` | W | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 海克力斯 - Berserker | `godie-hapm` | R | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 海克力斯 - Berserker | `godie-hapm` | EX | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 最終幻想 - 克勞德 | `godie-hart` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 最終幻想 - 克勞德 | `godie-hart` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 最終幻想 - 克勞德 | `godie-hart` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 慈悲的王者 - 賈修貝爾 | `godie-hblm` | E | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 慈悲的王者 - 賈修貝爾 | `godie-hblm` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 慈悲的王者 - 賈修貝爾 | `godie-hblm` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 種子神奇寶貝 - 妙蛙種子 | `godie-hgam` | E | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 種子神奇寶貝 - 妙蛙種子 | `godie-hgam` | R | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 種子神奇寶貝 - 妙蛙種子 | `godie-hgam` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 黑魔導士 - 莉娜因巴斯 | `godie-hjai` | E | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑魔導士 - 莉娜因巴斯 | `godie-hjai` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑魔導士 - 莉娜因巴斯 | `godie-hjai` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 不死之身-無 - 藤井八雲 | `godie-hpal` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 不死之身-無 - 藤井八雲 | `godie-hpal` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 獸矛傳承使 - 蒼月潮 | `godie-hpb1` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 超級普烏 - 魔人普烏 | `godie-huth` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 超級普烏 - 魔人普烏 | `godie-huth` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 梅杜莎 - Rider | `godie-hvsh` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 梅杜莎 - Rider | `godie-hvsh` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 除魔巫女 - 桔梗 | `godie-hvwd` | E | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 除魔巫女 - 桔梗 | `godie-hvwd` | EX | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑暗福音 - 依文潔琳 | `godie-n003` | E | skillshot | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑暗福音 - 依文潔琳 | `godie-n003` | R | skillshot | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑暗福音 - 依文潔琳 | `godie-n003` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 小叮噹 - 哆拉A夢 | `godie-n00b` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 小叮噹 - 哆拉A夢 | `godie-n00b` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 傳說的龍騎士 - 勇者小呆 | `godie-nbbc` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 通靈人 - 麻倉葉 | `godie-nplh` | Q | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 通靈人 - 麻倉葉 | `godie-nplh` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 妖狐藏馬 - 南野秀一 | `godie-nsjs` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 妖狐藏馬 - 南野秀一 | `godie-nsjs` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 傲嬌電氣老鼠 - 皮卡娘 | `godie-o00k` | E | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 傲嬌電氣老鼠 - 皮卡娘 | `godie-o00k` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 獸神官 - 傑洛士 | `godie-o00l` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 獸神官 - 傑洛士 | `godie-o00l` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 神奇寶貝兒 - 皮卡丘 | `godie-ofar` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 美白大法師 - 黑人牙膏 | `godie-ogld` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 賽亞人 - 悟空 | `godie-ogrh` | R | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 賽亞人 - 悟空 | `godie-ogrh` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 電車癡漢 - 臭作 | `godie-orkn` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 犬妖 - 殺生丸 | `godie-osam` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 犬妖 - 殺生丸 | `godie-osam` | EX | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 鬼畜紅王 - 鬼畜狂刀KYO | `godie-u00h` | W | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 鬼畜紅王 - 鬼畜狂刀KYO | `godie-u00h` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 鬼畜紅王 - 鬼畜狂刀KYO | `godie-u00h` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 神性的流失 - 賽菲洛斯 | `godie-u00j` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 神性的流失 - 賽菲洛斯 | `godie-u00j` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪惡意念集合體 - 死之王 | `godie-u00k` | Q | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 邪惡意念集合體 - 死之王 | `godie-u00k` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 邪惡意念集合體 - 死之王 | `godie-u00k` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 草帽小子 - 蒙其.D.魯夫 | `godie-u00n` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 草帽小子 - 蒙其.D.魯夫 | `godie-u00n` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 黑手黨老大 - 基廉列克 | `godie-u00v` | W | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 黑手黨老大 - 基廉列克 | `godie-u00v` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 黑手黨老大 - 基廉列克 | `godie-u00v` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 職業獵人 - 傑 富力士 | `godie-ucrl` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 至尊學長 - 飛鼠先生 | `godie-udea` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 三刀流劍士 - 索隆 | `godie-udre` | E | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 三刀流劍士 - 索隆 | `godie-udre` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 北斗神拳掌門人 - 拳四郎 | `godie-umal` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 北斗神拳掌門人 - 拳四郎 | `godie-umal` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪眼師 - 飛影 | `godie-uvng` | Q | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪眼師 - 飛影 | `godie-uvng` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪眼師 - 飛影 | `godie-uvng` | EX | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 聖杯黑泥醬 - 喪標麥可 | `godie-zombiex` | R | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 聖杯黑泥醬 - 喪標麥可 | `godie-zombiex` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 龍之子 - 天地志狼 | `godie-e007` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑魔導士 - 莉娜因巴斯 | `godie-h020` | E | ground | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑魔導士 - 莉娜因巴斯 | `godie-h020` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 黑魔導士 - 莉娜因巴斯 | `godie-h020` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 種子神奇寶貝 - 妙蛙花 | `godie-h02r` | E | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 種子神奇寶貝 - 妙蛙花 | `godie-h02r` | R | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 種子神奇寶貝 - 妙蛙花 | `godie-h02r` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02u` | W | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02u` | R | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02u` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 妖狐藏馬 - 南野秀一 | `godie-n00p` | R | targeted | 遠 | cast accepted but produced no measurable effect (no-op) |
| 妖狐藏馬 - 南野秀一 | `godie-n00p` | EX | self | 遠 | cast accepted but produced no measurable effect (no-op) |
| 傳說的龍騎士 - 勇者小呆 | `godie-n01c` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 傳說的龍騎士 - 勇者小呆 | `godie-n01c` | R | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 傳說的龍騎士 - 勇者小呆 | `godie-n01c` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 超級賽亞人 - 悟空 | `godie-o00x` | R | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 超級賽亞人 - 悟空 | `godie-o00x` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 北斗之鼠 - 拳四郎 | `godie-u00l` | E | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 北斗之鼠 - 拳四郎 | `godie-u00l` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪眼師 - 飛影 | `godie-u010` | Q | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪眼師 - 飛影 | `godie-u010` | E | skillshot | 近 | cast accepted but produced no measurable effect (no-op) |
| 邪眼師 - 飛影 | `godie-u010` | EX | ground | 近 | cast accepted but produced no measurable effect (no-op) |
| 三刀流劍士 - 索隆 | `godie-u01u` | E | targeted | 近 | cast accepted but produced no measurable effect (no-op) |
| 三刀流劍士 - 索隆 | `godie-u01u` | EX | self | 近 | cast accepted but produced no measurable effect (no-op) |

## 🟣 永久被動清單（非 bug，僅供對照）

| 英雄 | ID | 槽 | 掛載 |
| --- | --- | --- | --- |
| 蟬在叫人壞掉 - 龍宮禮奈 | `godie-e001` | W | passive:modifiers |
| 亞瑟王 - Saber | `godie-e002` | Q | passive:modifiers |
| 亞瑟王 - Saber | `godie-e002` | EX | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | W | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | E | passive:hooks |
| 最終泛用人型決戰兵器 - 初號機 | `godie-e00r` | EX | passive:hooks |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | W | passive:hooks |
| 白木老樹精 - 白木卡迪那 | `godie-e00s` | EX | passive:hooks |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | W | passive:hooks |
| 神鳴流劍士 - 櫻綻剎那 | `godie-e00w` | EX | passive:hooks |
| 寫輪眼復仇者 - 宇智波佐助 | `godie-edem` | R | passive:hooks |
| 揍敵客大家長 - 揍敵客桀諾 | `godie-efur` | EX | passive:hooks |
| 奇樂 - 夜神月 | `godie-emns` | W | passive:hooks |
| 治癒系公主 - 木乃香 | `godie-etyr` | W | passive:modifiers |
| 治癒系公主 - 木乃香 | `godie-etyr` | EX | passive:modifiers |
| 龍之子 - 天地志狼 | `godie-ewar` | E | passive:modifiers |
| 時空勇者 - 林克 | `godie-h00l` | E | passive:hooks |
| 時空勇者 - 林克 | `godie-h00l` | EX | passive:hooks |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | Q | passive:hooks |
| 亂世癿王者 - 呂布奉先 | `godie-h01u` | EX | passive:modifiers |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | Q | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | W | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | E | passive:hooks |
| 國寶級的畜生 - 熊貓 | `godie-h02k` | R | passive:modifiers |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | W | passive:hooks |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | E | passive:hooks |
| 看似憂鬱的神獸 - 草泥馬 | `godie-h02v` | EX | passive:hooks |
| 海克力斯 - Berserker | `godie-hapm` | E | passive:hooks |
| 神奇寶貝兒 - 皮卡丘 | `godie-ofar` | W | passive:hooks |

## 方法與抽樣說明

- 每一格用一個**全新的 SimWorld**（SKELETON_ARENA）跑，避免冷卻／增益／狀態互相污染；施法者 + 一個敵方假人（射程內、貼身 1.35u）+ 一個友方假人（給只能指向友軍的補血／護盾／增益）。
- 依 castType 擺位：targeted→貼身敵人（友軍向技能→貼身友軍）、ground→敵人所在點、skillshot／dash→朝敵人、self→自己。
- 「有效果」= 下列任一頻道被觸發且無例外：`damage`／`heal`／`manaRestore`／`projectileSpawn`／`vfxSpawn`／`knockdown` 事件，或全場護盾／狀態／buff 來源／投射物數量上升，或施法者位移（dash）。回血／回魔前先把目標降到半血半魔，確保有回復空間；施法者法力設為剛好夠付，使自我回魔也量得到。被動回血（RegenSystem）不發 `heal` 事件，故不會誤判。
- 每次施放後步進 **26 tick**（涵蓋 0.8s=24 tick 以內的施法前搖）讓有前搖的技能結算；普攻給 **40 tick** 讓第一次揮擊落地。
- ⚠️ **已知量測盲點**：全樹最長前搖是 `godie-u00n.r`／`godie-u00o.r` 的 **0.9s = 27 tick**，比本觀測窗多 1 tick，所以下方唯一那格 ❌ 很可能是「觀測太早收手」而非技能真的沒效果。改 WINDOW 會改變量測定義，歸 #128／#198 處理，本次不動。
- **完整跑遍全 63 英雄 × 6 槽 = 378 格，無抽樣**。
- **會變紅的三道閘**（都只看版控名單那 53 人，營運額外開放的英雄不影響）：(1) 掃描必須跑完 53×6；(2) 53 位英雄全部要能生成；(3) 可用格數（✅+🟣）不得低於 **300**（棘輪下限）。個別內容 no-op 不會使測試變紅（no-op 本身就是要回報的發現，列在下方 FAIL 清單），但既有可用的格子被改壞會。

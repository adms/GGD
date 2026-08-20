# 退場：12 位英雄的「推薦出裝」梯子（`champion@1.buildPriority`）

> owner 2026-08-18：「66 位英雄的推薦出裝變成空的 => **不需要推薦出裝**」
> owner 2026-08-20（GH#474 逐字裁決）：
> 「**拔乾淨**，現在 bot 都是**半價購買隨機寶具**，但**隨機三選一還是會根據自己屬性
>  購買有利的選項**（不會變成法師買近戰暴擊武器）」／「`[v] A　清乾淨 + 拔後台欄`」

⭐ 這一份存在的理由只有一個：**知識不可以無聲消失**（第〇·六守則「分開不是丟掉」）。
下面是被清空的那 12 條梯子的**逐字內容**，清空當下（2026-08-20）從 `content/champions/` 讀出來的。

⛔ **它不是規格**：`buildPriority` 這一格在出貨內容裡現在**一律是空陣列**，
而且 `botBuildPriorityRetired.test.ts` 會在任何一份重新長出非空梯子時變紅。
要復活它需要 owner 的新裁決，⛔ 不是照抄這一份。

## 為什麼要拔（量到的）

`apps/game-server/src/ai/Tier0Brain.ts` 的購買分支是 `if (梯子還有下一階) … else (買隨機寶具)`。
⇒ 帶著梯子的那 12 位**優先走自己的梯子**，其餘 59 位走「半價 + 隨機寶具」——
**同一場比賽裡兩種 bot 經濟行為並存**，而只有其中一種是 owner 現在要的。

| 英雄 id | 名字 | 件數 | 梯子（依序） |
|---|---|---:|---|
| `godie-e001` | 蟬在叫人壞掉 - 龍宮禮奈 | 3 | `godie-i002`（武聖手鐲） → `godie-i05r`（吸血石） → `godie-i06s`（龍騎士之劍） |
| `godie-e008` | 火霧戰士 - 夏娜 | 3 | `godie-i06c`（恐龍之斧） → `godie-i068`（瑪那寶石） → `godie-i02x`（斬岩刃） |
| `godie-edem` | 寫輪眼復仇者 - 宇智波佐助 | 3 | `godie-i002`（武聖手鐲） → `godie-i05o`（刺針） → `godie-i007`（虛哭神去） |
| `godie-etyr` | 治癒系公主 - 木乃香 | 4 | `godie-i05t`（定情戒指） → `godie-i02r`（奇蹟之墜） → `godie-i03d`（光明虎徹） → `godie-i045`（寂靜刃 - 詠月） |
| `godie-h01u` | 亂世癿王者 - 呂布奉先 | 4 | `godie-i06c`（恐龍之斧） → `godie-i068`（瑪那寶石） → `godie-i03d`（光明虎徹） → `godie-i02x`（斬岩刃） |
| `godie-h020` | 黑魔導士 - 莉娜因巴斯 | 4 | `godie-i05x`（辣妹護腕） → `godie-i041`（火閃電） → `godie-i03d`（光明虎徹） → `godie-i04b`（冰晶虎魄） |
| `godie-hart` | 最終幻想 - 克勞德 | 3 | `godie-i05r`（吸血石） → `godie-i05o`（刺針） → `godie-i02x`（斬岩刃） |
| `godie-hpb1` | 獸矛傳承使 - 蒼月潮 | 5 | `godie-i05x`（辣妹護腕） → `godie-i00m`（米索莉護板） → `godie-i03d`（光明虎徹） → `godie-i01w`（祕銀鎖子甲） → `godie-i00j`（奇門盾甲） |
| `godie-n003` | 黑暗福音 - 依文潔琳 | 4 | `godie-i02r`（奇蹟之墜） → `godie-i068`（瑪那寶石） → `godie-i03d`（光明虎徹） → `godie-i045`（寂靜刃 - 詠月） |
| `godie-o00k` | 傲嬌電氣老鼠 - 皮卡娘 | 4 | `godie-i041`（火閃電） → `godie-i02r`（奇蹟之墜） → `godie-i03d`（光明虎徹） → `godie-i04b`（冰晶虎魄） |
| `godie-o02p` | 夢幻之星 - 初音 | 4 | `godie-i02r`（奇蹟之墜） → `godie-i068`（瑪那寶石） → `godie-i03d`（光明虎徹） → `godie-i045`（寂靜刃 - 詠月） |
| `godie-ofar` | 神奇寶貝兒 - 皮卡丘 | 4 | `godie-i05v`（破壞王手套） → `godie-i002`（武聖手鐲） → `godie-i06s`（龍騎士之劍） → `godie-i06i`（炎神弩） |

**合計 12 位 · 45 個梯級。**

## 一起退場的東西

| 何處 | 做了什麼 |
|---|---|
| `content/champions/*.json` | 12 份的 `buildPriority` 清成 `[]`（⛔ 欄位本身留著：它仍是 `champion@1` 的必填格，而骨架註冊表用得到） |
| `apps/admin/src/contentFields.ts` | 「推薦出裝」欄位**拔掉** |
| `apps/admin/src/ui/NewHeroPage.tsx` · `heroTemplate.ts` | 新英雄表單的那一格**拔掉**（送出時一律 `[]`） |
| `apps/game-server/src/ai/Tier0Brain.ts` | 那句「還寫著推薦出裝的那 12 位英雄照走自己的梯子（那是刻意的內容）」的註解已經是假的 → 改掉（第三守則） |
| `apps/game-server/src/ai/buildPath.test.ts` | 「authored starter ladders are executable」整個 describe 被**取代**成退場守衛 —— ⛔ 不是刪掉 |

⚠️ ⛔ **沒有做成開關**：owner 明說這不是暫時偏好而是設計方向（「拔乾淨」），
而第〇·六守則的開關是**為了回頭**用的 —— 這裡沒有要回頭的那條路。


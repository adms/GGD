# owner-knobs.json note 全文另存 —— 2026-09-15（GH#1260 B2）

> ⚠️ `config.owner-knobs@1.note` 有 2000 字上限（Zod）。依 CLAUDE.md 第一·五守則「撞到字數上限時：另存，不是壓縮取代」，這一段全文住這裡，note 只留指標。

⭐ 2026-09-15（GH#1260 B2）：`agiToArmor` 那一列的 `quote`／`on` 從「未授權」改成帶日期的授權列 —— ⚠️ **授權狀態由 Claude 依 transcript 原話補，待 owner 覆核**（⛔ 不是 owner 自己來改的；⛔ 值 0.3 沒動）。出處 transcript `13aa0f88` L45357（2026-07-30 00:20 台北，真人訊息）；那一則是十幾項需求的清單，`quote` 只取相連的兩行、逐字。⚠️ 第二行 `=>` 之前那段「敏捷 → 護甲agiToArmor: 每 1 點敏捷增加的護甲 AgiDefenseBonus=0.15」看起來是從後台欄位標籤貼過來的上下文（Claude 的判讀），裁決是 `=>` 之後的 0.3；兩行照送出的原樣保留，⛔ 不改寫。`strToAttackDamage` 0.24：0.4 是 owner 2026-08-13 02:22 台北（transcript `13aa0f88` L78895，真人訊息）從 Claude 列的六組配套裡**自己挑的第六組**「intToAbilityPower 2→4 · strToAttackDamage 1→0.4 · multipliers.attackDamage 1.0→0.6」—— 格式沿用 Claude 的提問句，⭐ 數字是 owner 選的（Claude 推薦的是第五組 0.5；`combatEnv.ts` 註解「六組配套算過之後 owner 選了最激進的那一組」同一件事）。× 0.6 那一折來自 08-22「fix折進卡片」的提案，⛔ 而那則提案沒點名這一格 ⇒ **0.24 這個乘積**仍標未授權。（2026-09-15 更正 c91f38794 寫錯的「那一行是 Claude 寫的」）

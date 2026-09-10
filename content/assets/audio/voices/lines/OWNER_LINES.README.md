# OWNER_LINES.csv —— owner 手填的角色台詞（⛔ 產生器不編造）

owner 2026-09-10（逐字）：「要講什麼名言 請你給我名單就好 不要自己產 我會手動填寫」

⇒ 這份 CSV 就是那份名單。**74 名新英雄（b2-* ＋ community-review-*）一列一位**，
需要台詞的格子留白給你填；`build-combat-lines.mjs` 讀它，**只合成填了字的格子**。

## 欄位

| 欄 | 是什麼 | 要不要填 |
|---|---|---|
| `championId` `name` `work` | 英雄 id、顯示名、作品（從 `content/champions/<id>.json` 的 description 抽的） | ⛔ 不要改 |
| `lang` | 這一位台詞的語言：`zh`（中文，照字面唸）或 `ja`（日文） | 預設 `zh` |
| `taunt` `respond.ok` `respond.no` `love` `thanks` `puzzled` | 選角**點擊**的語音池（`select`）從這六格湊；**填任一格**就有選角語音 | ⭐ 至少一格 |
| `victory` | 勝利宣言 | ⭐ 要 |
| `quote` | 角色名言（`note` 寫「留空」的那 53 位，`quotes.json` 今天沒有名言） | 建議 |
| `defeat` `kill-1` | 今天用**擬聲**（`COMBAT_GRUNTS.json`）；填了字就改用你的台詞 | 選填 |
| `note` | 我的備註 | ⛔ 不要改 |

## 規則

- ⭐ **日文台詞**（`lang=ja`）要附片假名讀音：格子寫成 `台詞|カナヨミ`（管線符號分隔，
  讀音**全片假名、以空格分詞**，⛔ 不可含漢字）。例：`いくぞ！|イクゾ`。
  CosyVoice 3 讀漢字會唸成中文，所以沒有讀音的日文格子產生器會**指名跳過**，⛔ 不會猜。
- 中文台詞（`lang=zh`）照字面唸，繁體直接寫，⛔ 不要轉簡體。
- 長度上限見 `CATEGORIES.json` 的 `maxSeconds`（victory／defeat／quote ≤4 秒，其餘 ≤2 秒）。
- 其餘 29 類（stun／poison／…／kill-5）今天**沒有**列在這裡；要加就**加一個以類別 id 為名的欄**，產生器會認。
- LOL 7 名不在這份名單（owner 2026-09-10：「LOL7個角色應該有自己語音檔 可以排除」）。

## 填完之後

```bash
pnpm combat:build                                   # 讀 CSV → status.json（pending）→ MANIFEST
node tools/voice-gen/src/run-combat-gen.mjs         # 只合成 pending 的格子（CosyVoice 3）
pnpm combat:build                                   # 重新索引（--check 會逼你跑這一步）
```

# ⛔ 兩條要傳給 #450 / #541 的更正（2026-08-22 主 session 查證）

## ① owner 說的「莉娜**龍破斬**」是 `godie-h020.e`（04-03），⛔ 不是 `.r`

| 槽 | 技能 | rawcode | JASS |
|---|---|---|---|
| E | ⭐ **04-03 龍破斬** | **`A04R`** | `war3map.j:29887` / `:29938`；傷害 `udg_DragonSlaverDamage = 等級×500 + 200`（`:29957`） |
| R | 04-04 神滅斬 | `A07F` | `Trig_LinaS_Actions` @29777（連段掃描掃到的是**這一支**） |

⛔ 我在連段掃描裡把 `Trig_LinaS` 串到 `.r`，那是對的 —— **但它不是 #450 的驗收標的**。
#450 的莉娜標的是 **`godie-h020.e` / `godie-hjai.e`**（兩張卡都要，STRICT 鏡射）。

## ② Saber 理想鄉 `A0SP` 與莉娜 EX `A0OE` 在 `war3map.j` 裡**一次都沒出現**

⇒ 它們不是用 `GetSpellAbilityId` 派送的：
· 理想鄉走 `Trig_ExcaliburMAX`（**傷害事件**觸發：`udg_saber` + `udg_EX_Mode` + `udg_IsAvalonReady` + 魔力≥70%）
· 莉娜 EX 的演出走 **w3a 的 buff art 欄位**（`B02B` FaerieFireTarget / `B02W` LargeBuildingFire），⛔ 不是 JASS

⭐ ⇒ 連段模板必須吃得下「**反擊型**」（傷害事件觸發），⛔ 不能只做「施法型」。

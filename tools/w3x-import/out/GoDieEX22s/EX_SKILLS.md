# 《GoDieEX22s.w3x》 — 「EX 技能」調查結論

原始地圖:**去死團的逆襲 EX 2.2s**(`GoDieEX22s.w3x`)。以下為對 map 內「EX 技能」系統的調查與結論,供 `content/augments/ex-*.json`(GGD 回合三選一抽卡)取材依據。

## 一、結論:map 沒有「獨立的、英雄無關的 EX 技能池 / EX 商店 / EX 三選一」

證據(全部來自 `raw/scripts__war3map.j`(1.3MB JASS)、`parsed/abilities.json`、`parsed/random_pool.json`):

1. **`EX` 是這張圖的「版本 / 資料片」名稱,不是一個技能子系統。** REPORT.md 標題即「去死團的逆襲 **EX** 2.2s」。JASS 中唯一的中文 `EX` 字串是 `"EX測試模式!"`(EX test mode,除錯開關),沒有任何「三選一 / 選擇技能 / 技能書商店 / 隨機技能」的字串(`grep 三選一|選擇技能|技能書|隨機技能` → 0 筆)。
2. **JASS 裡的全域 `unit EX=null`** 只是「觸發單位(the casting hero)」的變數名(`set EX=GetTriggerUnit()` 出現在數十個法術觸發函式),**與技能系統無關**。這是導致「EX」四處出現的假訊號。
3. **`random_pool.json`(`zv` 陣列,78 筆)是「隨機英雄池」**,內容全是英雄/單位 rawcode(`Hart`/`Ucrl`/`Ogrh`…),不是技能。玩家在這張圖是「隨機/選一名英雄」,英雄本身就自帶完整技能組(含其強化技能),**不是抽 EX 技能**。
4. **`EX法術書`(`A0D9`)是「單一英雄(01 號 克勞德)的技能書升級」**:JASS `SetUnitAbilityLevelSwapped('A0D9',u,2)` 觸發後解鎖 `A0AR,A001`(究極魔劍效果)。它是 per-hero 的 EX 升級機制,而非通用道具(items.json 208 筆中沒有任何名為 EX/法術書/技能 的物品)。

## 二、「EX 技能」的真正身分:EX 資料片各英雄的「強化 / 究極 / 必殺」招式

`parsed/abilities.json` 的技能命名慣例是 `HH-SS 名稱`(`HH`=英雄編號、`SS`=技能槽;`04`=大絕/R、`002`=EX 升級槽)。以名稱標記(`EX / 究極 / 極 / 強化 / 奧義 / 絕 / 覺醒 / 解放 / 必殺 / 無限 …`)掃描,得到一組連貫的「EX 版強化招式」。字面含 `EX/Ex` 的僅 6 個,但整組「EX 強化招式」有數十個:

| rawcode | 名稱 | [型別] 效果(map tooltip 原文擷要) |
| --- | --- | --- |
| A0CD | 破光擊EX | [被動] 攻擊一定造成 **2 倍**傷害(氣刃雙重傷害) |
| A0DP/A0AR | 究極魔劍 | [被動] 100% 造成 1.5 倍傷害且絕不失誤;移速 **+30%** |
| A0D9 | EX法術書 | 升級槽,解鎖 A0AR/A001 |
| A10I | EX變態針刺 | [主動] 針刺(w3a:800 傷害 / cd65 / 265 魔) |
| A10Q | 60-EX 絕空斬 | [主動] 900 射程直線(w3a:325 傷害) |
| A00S | 暗殺奧義 | [被動] 攻擊 **7% 機率造成 3 倍**攻擊 |
| A03R | 無限再生 | [被動] 每秒回復 **12** 點生命 |
| A031 | 力量強化 | [被動] 力量 **+4**(→ 攻/防/HP) |
| A09Q | 防禦強化 | [被動] 降低 **24** 點物理傷害 |
| Aamk | 屬性提升 | [被動] 力量/敏捷/智慧各 **+2** |
| A10P | 絕光斬 | [被動] HP<45% 時每次攻擊放劍氣造 **325** 傷害 |
| A07Z | 暴雷無限刃 | [主動] 雷刃隨機斬擊 **50**×15 |
| A0FP | 奧義˙蒼龍破 | [主動] 直線 **600** 傷害 |
| A00D | 少林絕學-火雲掌 | [主動] 範圍減速 **35%** 持續 6 秒 |
| AEah | 北斗神拳究極奧義-無想轉生 | [被動] 攻擊者受 **7% 反彈**傷害 |
| A0HB | 討滅封絕 | [輔助] 結界內擊殺英雄 → 全能力+2、回滿 HP/魔 |
| A0SP | 解放.約束勝利劍MAX | [被動] 受傷且魔>70% 時七連斬 + 1800 傷 |
| A0SD | 絕對屏障 | [輔助] 小範圍無敵 5 秒 |
| ANr3 | 究極魔法流星雨 | [主動] 隕石 350×2 |
| A0SO | 究極暴走黑龍波 | [被動] 大範圍 2500 傷 |
| A0DJ | 祕奧義．金色的神風 | [主動] 333+敏捷 傷 + 暈 1 秒 |
| A07I | 必殺！爆熱神音！ | [主動] 範圍 175 傷 |
| A0SL | 打雷絕招 | [主動] 連鎖雷 250 × 傳遞 16 |
| A0YH | 終極秘劍-火產靈神 | [主動] 每秒 200 + 火柱 30×10 |
| A0B1 | 超究武神霸斬-改 | [主動] 七連斬 630+力量*4.5 |

(數量:含 `EX/Ex` 字面 6 個;整組「EX 資料片強化招式」以名稱標記計 30+ 個。)

## 三、移植決策(→ `content/augments/ex-*.json`)

- GGD 的augment僅支援 **被動能力**(`modifiers` 改數值 + `hooks`:onBasicAttack/onAbilityHit/onAbilityCast/onKill/onDamageTaken → damage/heal/shield/applyStatus/applyBuff)。**castable 的主動招式無法新增施法槽**(那是 sim/client 的工作,本次不碰),故:
  - 純被動/數值招式 → 直接對應 `modifiers`(無限再生→healthRegen、力量強化→ad/hp、屬性提升→ad/ap/armor、防禦強化→armor)。
  - 「攻擊觸發/受傷觸發/擊殺觸發」的被動招式 → `hooks`(破光擊EX/絕光斬/暴雷無限刃→onBasicAttack;蒼龍破/火雲掌→onAbilityHit;無想轉生/約束勝利劍→onDamageTaken;討滅封絕→onKill;絕對屏障→onAbilityCast)。
  - **主動 nuke(流星雨/黑龍波/金色神風/爆熱神音/絕空斬…)**:無法作被動,**近似為最接近的觸發 proc 或略過**(見各卡描述註記)。
- **STR/AGI/INT**:GGD 無屬性系統,依 WC3 慣例把「力量→攻擊/生命」「屬性→攻/法/護甲」譯為對應衍生數值(非自創,是把 map 招式的效果落到現有 stat 模型)。
- **超大數字**(1800/2500/325/×15…)依 arena 平衡下修,並於卡片 `description` 保留 map 原名與原效果語意。
- **分級**:map 未把 EX 招式分成 silver/gold/prismatic;依威力鋪到既有三階(純數值→silver、觸發傷害/控場→gold、build-around/大招→prismatic),使既有 `arena-rules.json` 回合表零改動即可抽到 EX 卡。

共產出 **15 張 `ex-*` 卡**(silver 5 / gold 5 / prismatic 5),全部使用 map 真實中文名 + 由 tooltip 推導的描述。清單見 `content/augments/ex-*.json` 與 `docs/todo/ex-skills.md`。

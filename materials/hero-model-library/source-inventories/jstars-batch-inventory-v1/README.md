# J-STARS 批次轉換與上架清單

本清單由現有 CPK、身分與音訊收據重建，不重跑已完成的 1,596 段音訊解碼。「已獲得／已分流」不等於已轉換、已註冊或已部署。

- 公開名單：52 名（可操作 39／支援 13）
- 原生 token：58 組，其中 56 組有 partial STPK 內部名
- CPK 成員雜湊：19,471 筆
- 優先四名：356 個 payload／360 個本機檔（含 manifest）；日文 WAV 候選 1,596 段／1817.984 秒
- RPCS3／韌體：已驗證；標題畫面唯讀記憶體 capture 1 份（STPK 0）；角色已載入標記 capture 0 份
- 現況：模型已轉換 0／後台已註冊 0／正式站已部署 0

## 優先四名

| 角色 | token | 來源成員 | 模型／骨架／動作 | VFX／SFX | 日文音訊 | 轉換／註冊／部署 |
|---|---:|---:|---|---|---:|---|
| 小傑·富力士 | `017` | 89 payload／90 含 manifest | 3／3／82 | 63／5 | 399 | 0／0／0；`source-ready-conversion-blocked` |
| 鵺野鳴介／神眉 | `041` | 89 payload／90 含 manifest | 3／3／82 | 63／5 | 399 | 0／0／0；`source-ready-conversion-blocked` |
| 幸運超人 | `037` | 89 payload／90 含 manifest | 3／3／82 | 63／5 | 399 | 0／0／0；`source-ready-conversion-blocked` |
| 飛影 | `012` | 89 payload／90 含 manifest | 3／3／82 | 63／5 | 399 | 0／0／0；`source-ready-conversion-blocked` |

RPCS3 工具、4.70 韌體與 `BLUS31519 / 01.00` 啟動均已驗證；標題畫面基準 capture 沒有 STPK。四名共同阻擋是必須先在遊戲內逐一載入角色，再取得帶角色 ID 的記憶體 capture，才能接續 `$CH0`／PS3 SRD／SRDI／SRDV 轉換。音訊只是已解碼的聽審候選，數字 cue 名不足以證明說話者或技能事件，所以 runtime 綁定仍為 0。

## 52 名公開名單對應

| # | 角色 | 作品 | 類型 | token | GGD 英雄 | 狀態 |
|---:|---|---|---|---:|---|---|
| 1 | 殺老師 | 暗殺教室 | playable | 待對照 | `community-review-14-20260907` | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 2 | 男鹿辰巳＋小貝魯 | 惡魔奶爸 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 3 | 黑崎一護 | BLEACH 死神 | playable | 待對照 | `godie-h01o`、`godie-h01n` | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 4 | 藍染惣右介 | BLEACH 死神 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 5 | 波波波＋首領巴奇 | 鼻毛真拳 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 6 | 山田太郎 | 珍遊記 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 7 | 則卷阿拉蕾＋卡斯拉 | 怪博士與機器娃娃 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 8 | 孫悟空 | 七龍珠 | playable | 待對照 | `godie-ogrh`、`godie-o00x` | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 9 | 貝吉塔 | 七龍珠 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 10 | 弗利沙 | 七龍珠 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 11 | 拳四郎 | 北斗神拳 | playable | 待對照 | `godie-u00l`、`godie-umal` | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 12 | 拉歐 | 北斗神拳 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 13 | 坂田銀時 | 銀魂 | playable | `028` | `community-review-23-20260907` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 14 | 鵺野鳴介 | 靈異教師神眉 | playable | `041` | `b2-nube` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 15 | 小傑·富力士 | HUNTER×HUNTER | playable | `017` | `godie-ucrl` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 16 | 奇犽·揍敵客 | HUNTER×HUNTER | playable | `018` | `community-review-24-20260907` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 17 | 喬納森·喬斯達 | JoJo 的奇妙冒險 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 18 | 喬瑟夫·喬斯達 | JoJo 的奇妙冒險 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 19 | 兩津勘吉 | 烏龍派出所 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 20 | 黑神目瀧 | 最強學生會長 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 21 | 漩渦鳴人 | 火影忍者 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 22 | 宇智波佐助 | 火影忍者 | playable | 待對照 | `godie-edem` | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 23 | 宇智波斑 | 火影忍者 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 24 | 蒙其·D·魯夫 | ONE PIECE | playable | `000` | `godie-u00n`、`godie-u00o` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 25 | 波特卡斯·D·艾斯 | ONE PIECE | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 26 | 波雅·漢考克 | ONE PIECE | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 27 | 赤犬／薩卡斯基 | ONE PIECE | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 28 | 澤田綱吉＋里包恩 | 家庭教師HITMAN REBORN! | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 29 | 緋村劍心 | 神劍闖江湖 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 30 | 志志雄真實 | 神劍闖江湖 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 31 | 天馬座星矢 | 聖鬥士星矢 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 32 | 劍桃太郎 | 魁!!男塾 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 33 | 齊木楠雄 | 齊木楠雄的災難 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 34 | 幸運超人 | 幸運超人 | playable | `037` | `b2-luckyman` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 35 | 阿虜 | 美食獵人 TORIKO | playable | `013` | 待設計 | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 36 | 澤布拉 | 美食獵人 TORIKO | playable | `014` | 待設計 | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 37 | 浦飯幽助 | 幽遊白書 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 38 | 飛影 | 幽遊白書 | playable | `012` | `godie-u010`、`godie-uvng` | `native-id-confirmed-source-containers-hashed`；轉換／註冊／部署 0／0／0 |
| 39 | 戶愚呂弟 | 幽遊白書 | playable | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 40 | 朽木露琪亞 | BLEACH 死神 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 41 | 亞連·沃克 | D.Gray-man | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 42 | 神樂＋定春 | 銀魂 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 43 | 日向翔陽 | 排球少年!! | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 44 | 西索 | HUNTER×HUNTER | support | 待對照 | `community-review-07-20260907` | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 45 | 黑子哲也 | 影子籃球員 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 46 | 球磨川禊 | 最強學生會長 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 47 | 腦嚙涅羅 | 魔人偵探腦嚙涅羅 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 48 | 桐崎千棘 | 偽戀 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 49 | 皮尤彥／捷豹 | 搞怪吹笛手 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 50 | 江田島平八 | 魁!!男塾 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 51 | SKET 團三人組 | SKET DANCE | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |
| 52 | 菈菈·撒塔林·戴比路克 | 出包王女 | support | 待對照 | 待設計 | `roster-listed-native-id-unconfirmed`；轉換／註冊／部署 0／0／0 |

## 原生 token 容器組

| token | 內部名 | payload | 模型 | 動作 | VFX | 轉換／註冊／部署 |
|---:|---|---:|---:|---:|---:|---|
| `000` | luffy | 83 | 3 | 76 | 57 | 0／0／0 |
| `001` | ace | 89 | 3 | 82 | 63 | 0／0／0 |
| `002` | hancock | 89 | 3 | 82 | 63 | 0／0／0 |
| `003` | akainu | 89 | 3 | 82 | 63 | 0／0／0 |
| `004` | naruto | 89 | 3 | 80 | 61 | 0／0／0 |
| `005` | sasuke | 87 | 3 | 80 | 61 | 0／0／0 |
| `006` | madara | 89 | 3 | 82 | 63 | 0／0／0 |
| `007` | goku | 85 | 3 | 76 | 57 | 0／0／0 |
| `008` | frieza | 89 | 3 | 82 | 63 | 0／0／0 |
| `009` | vegeta | 89 | 3 | 82 | 63 | 0／0／0 |
| `010` | yusuke | 89 | 3 | 82 | 63 | 0／0／0 |
| `011` | toguro | 89 | 3 | 82 | 63 | 0／0／0 |
| `012` | hiei | 89 | 3 | 82 | 63 | 0／0／0 |
| `013` | toriko | 83 | 3 | 76 | 57 | 0／0／0 |
| `014` | zebra, zebura | 89 | 3 | 82 | 63 | 0／0／0 |
| `015` | ichigo | 85 | 3 | 76 | 57 | 0／0／0 |
| `016` | aizen | 89 | 3 | 82 | 63 | 0／0／0 |
| `017` | gon | 89 | 3 | 82 | 63 | 0／0／0 |
| `018` | killua | 89 | 3 | 82 | 63 | 0／0／0 |
| `019` | jotaro | 22 | 3 | 19 | 0 | 0／0／0 |
| `020` | dio | 22 | 3 | 19 | 0 | 0／0／0 |
| `021` | dai | 22 | 3 | 19 | 0 | 0／0／0 |
| `022` | kenshin | 89 | 3 | 82 | 63 | 0／0／0 |
| `023` | shishio | 89 | 3 | 82 | 63 | 0／0／0 |
| `024` | seiya | 89 | 3 | 82 | 63 | 0／0／0 |
| `025` | kenshiro | 89 | 3 | 82 | 63 | 0／0／0 |
| `026` | raoh, raou | 89 | 3 | 82 | 63 | 0／0／0 |
| `027` | tatsumi | 91 | 3 | 82 | 63 | 0／0／0 |
| `028` | gintoki | 83 | 3 | 76 | 57 | 0／0／0 |
| `029` | medaka | 89 | 3 | 82 | 63 | 0／0／0 |
| `030` | kankichi | 89 | 3 | 82 | 63 | 0／0／0 |
| `031` | arale, gajira | 91 | 3 | 82 | 63 | 0／0／0 |
| `032` | korosensei | 89 | 3 | 82 | 63 | 0／0／0 |
| `033` | kusuo | 89 | 3 | 82 | 63 | 0／0／0 |
| `034` | momotaro | 89 | 3 | 82 | 63 | 0／0／0 |
| `035` | bobobo | 93 | 3 | 82 | 63 | 0／0／0 |
| `036` | tsuna | 93 | 3 | 82 | 63 | 0／0／0 |
| `037` | luckyman | 89 | 3 | 82 | 63 | 0／0／0 |
| `038` | yamada | 93 | 3 | 82 | 63 | 0／0／0 |
| `039` | jonathan | 89 | 3 | 82 | 63 | 0／0／0 |
| `040` | joseph | 89 | 3 | 82 | 63 | 0／0／0 |
| `041` | nueno | 89 | 3 | 82 | 63 | 0／0／0 |
| `200` | neuro | 80 | 3 | 73 | 63 | 0／0／0 |
| `201` | misogi | 80 | 3 | 73 | 63 | 0／0／0 |
| `202` | rukia | 80 | 3 | 73 | 63 | 0／0／0 |
| `203` | chitoge | 80 | 3 | 73 | 63 | 0／0／0 |
| `204` | hisoka | 80 | 3 | 73 | 63 | 0／0／0 |
| `205` | heihachi | 80 | 3 | 73 | 63 | 0／0／0 |
| `206` | kagura | 80 | 3 | 73 | 63 | 0／0／0 |
| `207` | jaguar | 80 | 3 | 73 | 63 | 0／0／0 |
| `208` | asakurayoh | 13 | 3 | 10 | 0 | 0／0／0 |
| `209` | kuroko | 80 | 3 | 73 | 63 | 0／0／0 |
| `210` | sket, sketdan, sketodan | 88 | 3 | 73 | 63 | 0／0／0 |
| `211` | lala | 80 | 3 | 73 | 63 | 0／0／0 |
| `212` | allen | 80 | 3 | 73 | 63 | 0／0／0 |
| `213` | hinata | 80 | 3 | 73 | 63 | 0／0／0 |
| `700` | 未得到內部名 | 2 | 0 | 0 | 0 | 0／0／0 |
| `701` | 未得到內部名 | 2 | 0 | 0 | 0 | 0／0／0 |

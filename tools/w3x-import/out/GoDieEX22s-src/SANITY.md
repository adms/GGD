# SANITY — source-map enrichment vs content/

Source map: `src_gogodieEX227s.w3x`  
WTS strings recovered: **11,337** (stock wts.py caught only 330)

## Whole-set coverage (source OBJECTS.json)

| object | count | with real name | with tooltip/ubertip |
|---|---:|---:|---:|
| abilities | 1538 | 1135 | 759 |
| heroes | 127 | 122 | — |
| items | 241 | 234 | 227 |

## Champion ability slots (Q/W/E/R) — before vs after

Matched content champion → source hero: **428** ability slots

| field | content/ has it | source resolves it |
|---|---:|---:|
| ability name | 428 | 428 |
| ability tooltip/description | 0 | 428 |

> content/ currently stores **0** ability descriptions; the source resolves **428** rich multi-line tooltips for the same slots.

## Items — before vs after

Matched content item → source item: **208**

| field | content/ has it | source resolves it |
|---|---:|---:|
| description/flavor | 0 | 207 |

## 20 sampled abilities — content name/tip → source tooltip

### godie-e002 E · `A0D5`
- **content**: name='約束與勝利之劍', tooltip chars=0
- **source name**: 20-03 約束與勝利之劍
- **source tooltip**: [主動攻擊] / 60秒冷卻時間 /  / 集結了人們的意念而形成的星星的結晶。是一把精鍊的神造兵裝，被譽為「最強的幻想(Last Phantasm)」。 / 在聖劍這個分類上位於最頂端的位置。它會將所有者的魔力轉換成光之後收束並加速以增加其動能，可以讓所有者使用出神靈等級的魔法。 / 其斬擊看似是放出了一道光帶，但是能讓前方直線敵人受到魔力*0.4+350點傷害。

### godie-e00l E · `A0D5`
- **content**: name='約束與勝利之劍', tooltip chars=0
- **source name**: 20-03 約束與勝利之劍
- **source tooltip**: [主動攻擊] / 60秒冷卻時間 /  / 集結了人們的意念而形成的星星的結晶。是一把精鍊的神造兵裝，被譽為「最強的幻想(Last Phantasm)」。 / 在聖劍這個分類上位於最頂端的位置。它會將所有者的魔力轉換成光之後收束並加速以增加其動能，可以讓所有者使用出神靈等級的魔法。 / 其斬擊看似是放出了一道光帶，但是能讓前方直線敵人受到魔力*0.4+350點傷害。

### godie-e00q E · `A0D5`
- **content**: name='約束與勝利之劍', tooltip chars=0
- **source name**: 20-03 約束與勝利之劍
- **source tooltip**: [主動攻擊] / 60秒冷卻時間 /  / 集結了人們的意念而形成的星星的結晶。是一把精鍊的神造兵裝，被譽為「最強的幻想(Last Phantasm)」。 / 在聖劍這個分類上位於最頂端的位置。它會將所有者的魔力轉換成光之後收束並加速以增加其動能，可以讓所有者使用出神靈等級的魔法。 / 其斬擊看似是放出了一道光帶，但是能讓前方直線敵人受到魔力*0.4+350點傷害。

### godie-naka E · `A03I`
- **content**: name='忍法千變萬化之刀', tooltip chars=0
- **source name**: 27-03 忍法千變萬化之刀
- **source tooltip**: [傷害加成] / 60秒冷卻時間 /  / 窮究一切武藝和自然元素的精隨，讓小次郎悟出深奧的忍法理論，可以隨機以不同的屬性來攻擊他的敵人，最多6次攻擊，持續30秒。 /  / 火屬性給予20點傷害，持續15秒 / 冰屬性緩慢敵人2.0秒 / 地屬性暈眩敵人0.75秒 / 風屬性給予多個敵人130點傷害 /  / 本技能為法球效應 / 本技能只對英雄有效

### godie-e002 R · `A0CT`
- **content**: name='Avalon-永恆的理想鄉', tooltip chars=0
- **source name**: 20-04 Avalon-永恆的理想鄉
- **source tooltip**: [輔助] / 60秒冷卻時間 /  / Saber手中握著的石中劍的劍鞘，可以發動傳說中EX級寶具Avalon－永恆的理想鄉，是個可以將任何魔法反彈的最強寶具，使Saber在一定時間內受到技能攻擊時，能夠給予對手強大的反擊，基礎威力為等級*30+力量*5，聚集的敵人越多和敵方技能越高，額外的傷害就越高，承受時間2秒。

### godie-e00l R · `A0CT`
- **content**: name='Avalon-永恆的理想鄉', tooltip chars=0
- **source name**: 20-04 Avalon-永恆的理想鄉
- **source tooltip**: [輔助] / 60秒冷卻時間 /  / Saber手中握著的石中劍的劍鞘，可以發動傳說中EX級寶具Avalon－永恆的理想鄉，是個可以將任何魔法反彈的最強寶具，使Saber在一定時間內受到技能攻擊時，能夠給予對手強大的反擊，基礎威力為等級*30+力量*5，聚集的敵人越多和敵方技能越高，額外的傷害就越高，承受時間2秒。

### godie-n01c R · `A0EZ`
- **content**: name='阿邦快速劍X', tooltip chars=0
- **source name**: 08-04 阿邦快速劍X
- **source tooltip**: [主動攻擊] / 60秒冷卻時間 /  / 小呆獨自思考和特訓中，所創出的新阿邦式快速劍，將A式(Arrow)與B式(Break)兩種快速劍同時使用(A+B)，造成威力強大的兩段式傷害( X ) ，造成一直線敵人450點傷害，距離550交叉在X中給予(技能等級*敏捷*7)的額外傷害，是個令人錯愕的超級必殺劍法。

### godie-nbbc R · `A0EZ`
- **content**: name='阿邦快速劍X', tooltip chars=0
- **source name**: 08-04 阿邦快速劍X
- **source tooltip**: [主動攻擊] / 60秒冷卻時間 /  / 小呆獨自思考和特訓中，所創出的新阿邦式快速劍，將A式(Arrow)與B式(Break)兩種快速劍同時使用(A+B)，造成威力強大的兩段式傷害( X ) ，造成一直線敵人450點傷害，距離550交叉在X中給予(技能等級*敏捷*7)的額外傷害，是個令人錯愕的超級必殺劍法。

### godie-u01u E · `A06P`
- **content**: name='鬼氣九刀流-阿修羅壹霧銀', tooltip chars=0
- **source name**: 11-03 鬼氣九刀流-阿修羅壹霧銀
- **source tooltip**: [主動傷害] / 45秒冷卻時間 /  / 以鬥氣創造出鬼神阿修羅幻象的"鬼氣九刀流 阿修羅"，使出將對手斬擊都能霧化的必殺技"阿修羅 壹霧銀"，使敵人受到300傷害，並暈眩1秒，只能對英雄施展。 /  / 點選三刀流持續期間，可增加威力(力量*2) / 點選武裝霸王色持續期間，可增加威力(力量*3)，並可與三刀流效果疊加

### godie-udre E · `A06P`
- **content**: name='鬼氣九刀流-阿修羅壹霧銀', tooltip chars=0
- **source name**: 11-03 鬼氣九刀流-阿修羅壹霧銀
- **source tooltip**: [主動傷害] / 45秒冷卻時間 /  / 以鬥氣創造出鬼神阿修羅幻象的"鬼氣九刀流 阿修羅"，使出將對手斬擊都能霧化的必殺技"阿修羅 壹霧銀"，使敵人受到300傷害，並暈眩1秒，只能對英雄施展。 /  / 點選三刀流持續期間，可增加威力(力量*2) / 點選武裝霸王色持續期間，可增加威力(力量*3)，並可與三刀流效果疊加

### godie-edem R · `A0U7`
- **content**: name='哥哥', tooltip chars=0
- **source name**: 45-04 哥哥
- **source tooltip**: [被動] / 0秒冷卻時間 /  / 「我愚蠢的弟弟啊！憎恨吧！怨恨把！帶著你對我的仇恨，醜陋的苟延殘喘的活下去。」對哥哥鼬的怨念，使得佐助不斷地變強。增加12點敏捷，並且使千鳥的命中率及速度小幅度提昇；在火遁攻擊完後3秒鐘內，使用千鳥再次攻擊該目標會引發麒麟，造成目標周圍600範圍內敏捷*2點落電傷害。

### godie-h02y Q · `ANic`
- **content**: name='壹之秘劍-焰靈', tooltip chars=0
- **source name**: 97-01 壹之秘劍-焰靈
- **source tooltip**: [被動] / 0秒冷卻時間 /  / 每一次的攻擊都會因為黏附在目標身上的火焰而加強。這些火焰會在第一次攻擊時增加20點傷害力，第二次攻擊則提升為兩倍，第三次攻擊則增加為三倍，以此類推。如果目標在擁有火焰附著的狀況下死去，就會產生爆炸，對所有附近敵對部隊造成 50點的傷害。火焰的附著可以持續2秒。

### godie-e00j Q · `A0Y7`
- **content**: name='謝謝指教', tooltip chars=0
- **source name**: 95-01 謝謝指教
- **source tooltip**: [主動傷害] / 25秒冷卻時間 /  / 左手是謝謝，右手是指教，談笑間將目標擊飛，每滑行50距離便會受到30點傷害，最遠距離400。被打中的人不會有任何的怨恨，眼神只會透露出如火一般的尊敬。 /  / 《龍氣》 - 擊飛的同時將勁力打入目標體內，若因撞到物體而停止時勁力將會爆發，造成範圍傷害80點。

### godie-u01u R · `A0MQ`
- **content**: name='三千世界', tooltip chars=0
- **source name**: 11-04 三千世界
- **source tooltip**: [主動傷害] / 60秒冷卻時間 /  / 三刀流的奧義，也是索隆最強的招式。把3把刀像風車般旋轉的姿態，會產生強勁的風。然後使出的斬刀幾乎沒可能看穿。給予直線單位333傷害。 /  / 點選三刀流持續期間，可增加威力(力量*3) / 點選武裝霸王色持續期間，可增加威力(力量*5)，並可與三刀流效果疊加

### godie-udre R · `A0MQ`
- **content**: name='三千世界', tooltip chars=0
- **source name**: 11-04 三千世界
- **source tooltip**: [主動傷害] / 60秒冷卻時間 /  / 三刀流的奧義，也是索隆最強的招式。把3把刀像風車般旋轉的姿態，會產生強勁的風。然後使出的斬刀幾乎沒可能看穿。給予直線單位333傷害。 /  / 點選三刀流持續期間，可增加威力(力量*3) / 點選武裝霸王色持續期間，可增加威力(力量*5)，並可與三刀流效果疊加

### godie-e00j E · `A0Y8`
- **content**: name='皇者戰氣第五十重天', tooltip chars=0
- **source name**: 95-03 皇者戰氣第五十重天
- **source tooltip**: [主動攻擊] / 45秒冷卻時間 /  / 把發揮到五十重天金黃色的皇者戰氣纏繞在身上，飛行到目標身旁給予沉痛的一擊，給予600點傷害。由於威力過於強大，若敵方偏移瞄準地點將不會受到傷害。 /  / 《龍氣》 - 擊中目標後將全身勁力炸開，造成大規模的毀滅性打擊，傷害值等於飛行距離的一半。

### godie-n00p R · `A0P7`
- **content**: name='億年樹', tooltip chars=0
- **source name**: 18-04 億年樹
- **source tooltip**: [主動攻擊] / 75秒冷卻時間 /  / 讓魔界最具強大魔力的億年樹在現世甦醒，億年樹擁有500點生命，出現時造成附近敵軍300傷害，每秒回復附近友軍4%生命，降低敵軍30%攻擊速度、20%移動速度，當敵人攻擊藏馬的時候將有10%的機率受到老樹盤根的攻擊，持續8秒。

### godie-nsjs R · `A0P7`
- **content**: name='億年樹', tooltip chars=0
- **source name**: 18-04 億年樹
- **source tooltip**: [主動攻擊] / 75秒冷卻時間 /  / 讓魔界最具強大魔力的億年樹在現世甦醒，億年樹擁有500點生命，出現時造成附近敵軍300傷害，每秒回復附近友軍4%生命，降低敵軍30%攻擊速度、20%移動速度，當敵人攻擊藏馬的時候將有10%的機率受到老樹盤根的攻擊，持續8秒。

### godie-e00t R · `A0IC`
- **content**: name='靈壓震撼', tooltip chars=0
- **source name**: 66-04  靈壓震撼
- **source tooltip**: [輔助] / <A0IC,Cool1>秒冷卻時間 /  / 貞子發出凜人的靈壓，造成周圍<A0ID,Area1>範圍內的敵方單位減慢<A0ID,DataB1,%>%的攻擊速度與<A0ID,DataA1,%>%的移動速度。 /  / 每秒消耗<A0IC,DataB1>點法力。

### godie-h020 E · `A04R`
- **content**: name='龍破斬', tooltip chars=0
- **source name**: 04-03 龍破斬
- **source tooltip**: [主動攻擊] / 60秒冷卻時間 /  / 藉由赤眼魔王沙布蘭尼古之力使用的咒文，以範圍廣和強大的破壞力自誇，具有一擊可殺死巨龍及毀滅一個小鎮的威力。給予範圍內的敵人最多700點傷害。 /  / (對建築傷害*50%) /  / 點選惡夢魔王碎片增幅後，可增加威力(智慧*7)

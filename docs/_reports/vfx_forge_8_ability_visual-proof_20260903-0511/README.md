# VFX Forge 八招候選畫面驗收（2026-09-02T21:21:38.284Z）

> 這份報告驗的是「Editor 能否用積木拼出候選」，不是遊戲主程式內容變更。
> 八份皆為 `editor-capability-fixture`、`promotable:false`；人工通過也永久不能 Promote。

## 驗收身分與量尺

- 來源：`docs/_review/ai-proposals` 的 hash-locked proposal framebuffer
- 對戰：真 Sim／真 VfxSystem／真 CameraRig／雙方真 3D 外觀；目標固定為非替身、非鏡像的 `godie-e001`
- 雙向量尺：通過（亮 739600／暗亮點 4550／暗顯影 9465）
- 每招保留兩個由時間軸事件選出的完整 Runtime 關鍵格（可採系統建議或人工精確秒數）；不是只截資料面板
- `reviewHash` 同時綁定 JSON、擷圖、說明與 GPU 收據，任一變更都必須重新人工審查
- 視覺稽核資格：全部為 @3 且逐張通過，可進人工裁決
- 自動分數僅供人工分流，不代表原作還原、動作正確或已通過

## 八招摘要

| 技能 | Owner 目標 | 候選／審查 hash | GPU 衛生分流 | 人工裁決 |
|---|---|---|---:|---|
| 04-03 莉娜 · 龍破斬 | 投射後一段距離爆炸 | `5f776f8cbaa4`／`7ba4c1b6ffab` | 5.5/10 | 待 Owner 於後台 pass/fail |
| 04-04 莉娜 · 神滅斬 | dash 後斬擊 | `1c5b252172bd`／`8a6babd79e01` | 9.5/10 | 待 Owner 於後台 pass/fail |
| 01-04 克勞德 · 超究武神霸斬 | 動畫連斬＋黃藍直立光束砲 | `9224c85b1e77`／`976554c9a64d` | 8.5/10 | 待 Owner 於後台 pass/fail |
| 08-04 小呆 · 阿邦快速劍X | A 衝擊波＋B dash 斬擊 | `e7a34768ee19`／`e6c8653885f3` | 9.5/10 | 待 Owner 於後台 pass/fail |
| 08-03 小呆 · 龍鬥氣砲咒文 | 橫向藍色氣功砲 | `c73e7655b998`／`c4323adfaf05` | 8/10 | 待 Owner 於後台 pass/fail |
| 09-04 悟空 · 龜派氣功 | 橫向橘色氣功砲 | `3ce68ae7f639`／`5a722fc5b292` | 7.5/10 | 待 Owner 於後台 pass/fail |
| 20-002 Saber · 理想鄉 EX | 反擊＋動畫連斬＋氣功砲 | `efdfa3f57040`／`826066f442e9` | 7.5/10 | 待 Owner 於後台 pass/fail |
| 48-04 Rider · 騎英之手綱 | dash＋橫向藍色氣功砲 | `89529cad3544`／`c882388d8c4a` | 8/10 | 待 Owner 於後台 pass/fail |

## 04-03 莉娜 · 龍破斬

- Owner 目標：投射後一段距離爆炸
- Main 目前：ability 已有 line-blast／抵達爆炸；script 補詠唱法陣，但沿途與爆炸層次仍不完整。
- JASS：Fire_NOVA 詠唱後，DragonSlaveMove 以 0.03 秒週期推進 FireBlast，抵達後展開爆炸鏈。
- JASS／蝗蟲群：h013 MarkOfChaosTarget 聚氣法陣＋h014 FireBlast 投射物；原作沿途及終點另建立效果。
- 來源判定：partial:Owner 與 JASS 的投射→爆炸順序一致；以 Owner 的紅橘、體積火焰為視覺目標，保留 JASS 時序。
- 候選：`5f776f8cbaa4`；審查材料：`7ba4c1b6ffab`；base：`655fe3834e5c`
- GPU 完整時間軸：42 格；衛生分流 5.5/10；最差 1.067 秒；粒子峰值 176／系統 50
- 稽核資格：@3 current

![godie-hjai.e vs godie-e001 · 1.434秒 · 證據1](./04-03_godie-hjai.e_01_1434ms.png)

1434ms · side
![godie-hjai.e vs godie-e001 · 1.550秒 · 證據3](./04-03_godie-hjai.e_02_1550ms.png)

1550ms · side

## 04-04 莉娜 · 神滅斬

- Owner 目標：dash 後斬擊
- Main 目前：Main 只有 ability 演出，沒有出貨 godie-hjai.r 專用 vfx-script；dash、角色動作與紫黑斬擊目前只存在 Editor 驗收 fixture。
- JASS：命中後先造成傷害，0.5 秒後啟用 LinaS_Effect 推動目標，並對附近玩家震屏。
- JASS／蝗蟲群：施法點 HeroCloudCyd；推動路徑使用 UndeadDissipate、ImpaleTargetDust，另有 WispExplode。
- 來源判定：owner-override:JASS 核心是推動受害者，不是施法者 dash；依 Owner 最新目標改成 dash 斬擊，但在審查頁永久標示此偏離。
- 候選：`1c5b252172bd`；審查材料：`8a6babd79e01`；base：`none`
- GPU 完整時間軸：34 格；衛生分流 9.5/10；最差 1.133 秒；粒子峰值 49／系統 21
- 稽核資格：@3 current

![godie-hjai.r vs godie-e001 · 1.084秒 · 證據1](./04-04_godie-hjai.r_01_1084ms.png)

1084ms · side
![godie-hjai.r vs godie-e001 · 1.448秒 · 證據2](./04-04_godie-hjai.r_02_1448ms.png)

1448ms · side

## 01-04 克勞德 · 超究武神霸斬

- Owner 目標：動畫連斬＋黃藍直立光束砲
- Main 目前：已有 combo、無敵與豐富 script，是八招中最完整的 main 基線；逐刀站位與加速仍需校準。
- JASS：七段斬擊逐刀換位，第三段升空，後段播放速度逐步提高，最後一刀另有終結演出。
- JASS／蝗蟲群：ResurrectTarget 武器光柱＋h002 幻影；施法者與受害者依段次改位置、高度、面向與動畫速度。
- 來源判定：partial:多段與終結方向一致；必須補足逐刀身體位置、升空曲線與逐段加速後才可人工通過。
- 候選：`9224c85b1e77`；審查材料：`976554c9a64d`；base：`9b1af8fd531f`
- GPU 完整時間軸：87 格；衛生分流 8.5/10；最差 4.600 秒；粒子峰值 75／系統 32
- 稽核資格：@3 current

![godie-hart.r vs godie-e001 · 2.578秒 · 證據1](./01-04_godie-hart.r_01_2578ms.png)

2578ms · side
![godie-hart.r vs godie-e001 · 4.620秒 · 證據2](./01-04_godie-hart.r_02_4620ms.png)

4620ms · side

## 08-04 小呆 · 阿邦快速劍X

- Owner 目標：A 衝擊波＋B dash 斬擊
- Main 目前：ability 有直線傷害、標記、延遲位移與落點傷害；script 有隱藏本體與 RedDragonMissile。
- JASS：原作在出發點放 e003，隱藏本體約一秒後固定移動 550 wc3u，落點造成範圍傷害。
- JASS／蝗蟲群：e003 RedDragonMissile＋ImpaleTargetDust；受害者腳下 ThunderClapCaster。
- 來源判定：partial:B 段 dash 與 JASS 接近；A 段藍色衝擊波採 Owner／影片版本，須避免 ability 與 script 重複畫同一層。
- 候選：`e7a34768ee19`；審查材料：`e6c8653885f3`；base：`fff26c131b41`
- GPU 完整時間軸：33 格；衛生分流 9.5/10；最差 0.867 秒；粒子峰值 23／系統 15
- 稽核資格：@3 current

![godie-nbbc.r vs godie-e001 · 1.411秒 · 證據1](./08-04_godie-nbbc.r_01_1411ms.png)

1411ms · side
![godie-nbbc.r vs godie-e001 · 1.411秒 · 證據2](./08-04_godie-nbbc.r_02_1411ms.png)

1411ms · top

## 08-03 小呆 · 龍鬥氣砲咒文

- Owner 目標：橫向藍色氣功砲
- Main 目前：Main 沒有專用 vfx-script；ability 仍是火焰 beam 加十顆紅龍飛彈。藍白聚能、寬光束與持續核心目前只存在 Editor 驗收 fixture。
- JASS：同一幀沿施法面向每 150 wc3u 建立一個 e003，共十個，存活一秒；另有震屏與地形波紋。
- JASS／蝗蟲群：10× e003 RedDragonMissile，比例 4.0；兩秒後清理同型 dummy。
- 來源判定：owner-override:JASS 是十顆紅龍飛彈列陣；Owner 已明確指定藍色經典光束，因此保留十段節奏作參考，視覺改採藍色 beam。
- 候選：`c73e7655b998`；審查材料：`c4323adfaf05`；base：`none`
- GPU 完整時間軸：42 格；衛生分流 8/10；最差 0.867 秒；粒子峰值 113／系統 16
- 稽核資格：@3 current

![godie-nbbc.e vs godie-e001 · 0.953秒 · 證據1](./08-03_godie-nbbc.e_01_953ms.png)

953ms · side
![godie-nbbc.e vs godie-e001 · 1.383秒 · 證據2](./08-03_godie-nbbc.e_02_1383ms.png)

1383ms · side

## 09-04 悟空 · 龜派氣功

- Owner 目標：橫向橘色氣功砲
- Main 目前：ability 已有 ReviveHuman、FragDriller、六段 FlameStrike 與震屏；script 補槍口層。
- JASS：槍口前 150 wc3u 建立 ReviveHuman 與 FragDriller，並在 200～1200 wc3u 同幀建立六個 FlameStrike。
- JASS／蝗蟲群：h007 ReviveHuman＋h008 FragDriller＋6× h006 FlameStrike1，兩秒後清除鏡頭噪動。
- 來源判定：partial:組成與時序接近；橫向拉伸 beam 是為 Owner 可讀性做的明確改編，不宣稱是 JASS 1:1。
- 候選：`3ce68ae7f639`；審查材料：`5a722fc5b292`；base：`c2f67c69c2a9`
- GPU 完整時間軸：42 格；衛生分流 7.5/10；最差 0.867 秒；粒子峰值 101／系統 16
- 稽核資格：@3 current

![godie-ogrh.r vs godie-e001 · 0.953秒 · 證據1](./09-04_godie-ogrh.r_01_953ms.png)

953ms · side
![godie-ogrh.r vs godie-e001 · 1.383秒 · 證據2](./09-04_godie-ogrh.r_02_1383ms.png)

1383ms · side

## 20-002 Saber · 理想鄉 EX

- Owner 目標：反擊＋動畫連斬＋氣功砲
- Main 目前：reflectSuccess 接縫與 17 段 script 已存在；目前角色模型 primitive／貼圖問題阻擋視覺核准。
- JASS：Avalon 反彈窗由受傷事件判定；成功後進入 ExcaliburMAX 七刀與第八擊終結鏈。
- JASS／蝗蟲群：MonsoonBolt、鏈鎖閃電、拖曳與多段斬擊效果；EX 演出綁 Saber 受傷事件而非獨立 A0SP。
- 來源判定：partial:事件與三段敘事一致；模型資產、拖曳、隨機間隔與逐刀站位未通過前維持 fixture-pending。
- 候選：`efdfa3f57040`；審查材料：`826066f442e9`；base：`e4edec42414d`
- GPU 完整時間軸：41 格；衛生分流 7.5/10；最差 1.200 秒；粒子峰值 183／系統 68
- 稽核資格：@3 current

![godie-e002.ex vs godie-e001 · 0.878秒 · 證據1](./20-002_godie-e002.ex_01_878ms.png)

878ms · side
![godie-e002.ex vs godie-e001 · 1.250秒 · 證據2](./20-002_godie-e002.ex_02_1250ms.png)

1250ms · side

## 48-04 Rider · 騎英之手綱

- Owner 目標：dash＋橫向藍色氣功砲
- Main 目前：Main 沒有專用 vfx-script；ability 只有三層 modelFx 與 arcane beam，尚無 Rider 本體 bodyMove。dash、藍白橫向光砲與落點演出目前只存在 Editor 驗收 fixture。
- JASS：依 EX 狀態分兩條路；普通路隱藏 Rider，用 h024 每 0.01 秒移動 50 wc3u，落點十二次 ThunderClap。
- JASS／蝗蟲群：h02D 光環、h015 翅膀、h02H Shockwave、h02I 法陣；普通路 h024／h025 與路徑特效群。
- 來源判定：owner-override:w3x 是魔法陣與蝗蟲群的曲線衝刺，並非藍色長光束；依 Owner 最新目標製作 dash＋beam，但完整保留偏離紀錄。
- 候選：`89529cad3544`；審查材料：`c882388d8c4a`；base：`none`
- GPU 完整時間軸：44 格；衛生分流 8/10；最差 1.067 秒；粒子峰值 145／系統 24
- 稽核資格：@3 current

![godie-hvsh.r vs godie-e001 · 1.120秒 · 證據1](./48-04_godie-hvsh.r_01_1120ms.png)

1120ms · side
![godie-hvsh.r vs godie-e001 · 1.550秒 · 證據2](./48-04_godie-hvsh.r_02_1550ms.png)

1550ms · side

## 判定邊界

- PNG 是送審候選的實際 framebuffer；報告不以 schema 通過冒充視覺通過。
- 舊稽核未檢出棋盤載體的分數已作廢；後台與 Promote 只接受 `ggd-vfx-visual-audit@3` 的正向裁決。
- 自動掃描只負責不透明底板／可讀性分流；顏色、方向、節奏、原作忠實度仍由人工 0～10 分與 pass/fail 決定。
- 本工具只讀 proposal 並輸出報告，不寫 `content/vfx-scripts/`，不會把八招套回遊戲。

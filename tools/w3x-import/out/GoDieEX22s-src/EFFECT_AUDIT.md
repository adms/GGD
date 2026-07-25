# EFFECT_AUDIT — all-hero JASS→content 三軸掃描 (傷害/特效/音效)

Scanned **654 ability instances** across 111 champions.
Join: {'hero-numbers': 243, 'name': 368, 'UNRESOLVED': 43}  ·  Damage verdicts: {'ZERO': 18, 'TRIVIAL': 4, 'NO_DAMAGE_EFFECT': 20, 'SUSPECT': 122, 'UNVERIFIED': 23, 'OK': 152, 'N/A': 315}
VFX verdicts: {'MISSING': 0, 'NONE_EITHER': 47, 'OK': 607}  ·  SFX: {'wc3_has_sound': 98, 'content_sound_field_exists': False}

> Ground truth: JASS trigger > object data / ubertip colour-span > prose.
> This report FINDS AND CITES; edits stay reviewed per-batch (mirror model,
> line edits, `pnpm content:build`, guard tests). Content has NO per-ability
> sound field yet — SFX axis is the inventory for that future surface.

## 傷害 axis — actionable, worst-first

| ability | name | rawcode | verdict | content perRank | JASS damage (cited) |
|---|---|---|---|---|---|
| godie-e00j.e | 95-03 皇者戰氣第五十重天 | A0Y8 | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | — |
| godie-e00s.q | 70-01 伸卡球 | A0UJ | **ZERO** | [[0.0, 0.0, 0.0, 0.0, 0.0]] | `WoodStone` j:47914 |
| godie-e00t.r | 66-04  靈壓震撼 | A0IC | **ZERO** | [[0.0, 0.0, 0.0]] | — |
| godie-h01n.q | 79-01 瞬步 | A0RX | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | `Bleach_Rush` j:37410; `Bleach_Rush` j:37418 |
| godie-h01o.q | 79-01 瞬步 | A0RX | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | `Bleach_Rush` j:37410; `Bleach_Rush` j:37418 |
| godie-h022.e | 82-03 雷之投擲 | A0Q5 | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | `ThunderMove` j:35470 |
| godie-h02r.r | 90-04 陽光烈焰 | A0R4 | **ZERO** | [[0.0, 0.0, 0.0]] | `SunFire` j:26757 |
| godie-hgam.r | 90-04 陽光烈焰 | A0R4 | **ZERO** | [[0.0, 0.0, 0.0]] | `SunFire` j:26757 |
| godie-n00p.w | 18-02 寄生種子 | A0RV | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | `plant` j:27914; `plant` j:27947 |
| godie-nsjs.w | 18-02 寄生種子 | ? | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | — |
| godie-o00l.q | 53-01 獸王牙操彈 | A0K1 | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | `KaoLight` j:40121 |
| godie-o00x.r | 09-04 龜派氣功 | A03S | **ZERO** | [[0.0, 0.0, 0.0]] | `Turtle_Power` j:31855; `Turtle_Power` j:31857 |
| godie-o01z.w | 81-02 Acxel Shooter | A0LB | **ZERO** | [[0.0, 0.0, 0.0, 0.0, 0.0]] | `AcxelShooter` j:35845 |
| godie-o02s.w | 53-01 獸王牙操彈 | A0K1 | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | `KaoLight` j:40121 |
| godie-o02v.w | 81-02 Acxel Shooter | A0LB | **ZERO** | [[0.0, 0.0, 0.0, 0.0, 0.0]] | `AcxelShooter` j:35845 |
| godie-obla.e | 33-03 地道突襲 | A07D | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | — |
| godie-ogrh.r | 09-04 龜派氣功 | A03S | **ZERO** | [[0.0, 0.0, 0.0]] | `Turtle_Power` j:31855; `Turtle_Power` j:31857 |
| godie-u00v.w | 78-02 地走龍牙破 | A0L4 | **ZERO** | [[0.0, 0.0, 0.0, 0.0]] | — |
| godie-e00k.r | 19-04 幻影暗殺 | A02Y | **NO_DAMAGE_EFFECT** | [] | `AzumiShadowNew` j:27785 |
| godie-e00z.r | 19-04 幻影暗殺 | A02Y | **NO_DAMAGE_EFFECT** | [] | `AzumiShadowNew` j:27785 |
| godie-edem.r | 45-04 哥哥 | A0U7 | **NO_DAMAGE_EFFECT** | [] | `LightCutRun` j:41894; `LightCutRun` j:41971 |
| godie-h01n.w | 79-02 斬擊 | A0LK | **NO_DAMAGE_EFFECT** | [] | `Bleach_Strike` j:37477 |
| godie-h01o.w | 79-02 斬擊 | A0LK | **NO_DAMAGE_EFFECT** | [] | `Bleach_Strike` j:37477 |
| godie-h02k.e | 89-03 憤怒的胸毛 | A0TN | **NO_DAMAGE_EFFECT** | [] | `Saber_in_pandaDie` j:52630 |
| godie-h02k.ex | 89-002 俄羅斯輪盤 | A0TU | **NO_DAMAGE_EFFECT** | [] | `Saber_in_pandaEX` j:52893; `Saber_in_pandaEX` j:52918 |
| godie-h02u.r | 92-04 馬勒戈壁 | A06Y | **NO_DAMAGE_EFFECT** | [] | `MLGBTempSteal` j:45511 |
| godie-h02u.w | 92-03 狂草泥馬 | A0WB | **NO_DAMAGE_EFFECT** | [] | `NewTrdHorse` j:45373 |
| godie-h02v.r | 92-04 馬勒戈壁 | A06Y | **NO_DAMAGE_EFFECT** | [] | `MLGBTempSteal` j:45511 |
| godie-h02v.w | 92-03 狂草泥馬 | A0WB | **NO_DAMAGE_EFFECT** | [] | `NewTrdHorse` j:45373 |
| godie-naka.e | 27-03 忍法千變萬化之刀 | A03I | **NO_DAMAGE_EFFECT** | [] | `Deal_Elemental_Effect` j:41536 |
| godie-nplh.ex | 16-002 布都御魂 | A06M | **NO_DAMAGE_EFFECT** | [] | `ComOne` j:31616 |
| godie-o02w.q | 96-01 華山劍法 | A0XS | **NO_DAMAGE_EFFECT** | [] | `HuashanSword` j:44820 |
| godie-u00b.w | 75-02 幻影鬥氣 | A07W | **NO_DAMAGE_EFFECT** | [] | `MoriyaShadow` j:47241 |
| godie-u034.q | 06-01 山形修煉-放 | A08X | **NO_DAMAGE_EFFECT** | [] | `XHunterStone` j:26922; `XHunterStone` j:26975 |
| godie-u034.w | 06-02 山形修煉-變 | A08W | **NO_DAMAGE_EFFECT** | [] | `XHunterStone` j:26922; `XHunterStone` j:26975 |
| godie-ucrl.q | 06-01 山形修煉-放 | A08X | **NO_DAMAGE_EFFECT** | [] | `XHunterStone` j:26922; `XHunterStone` j:26975 |
| godie-ucrl.w | 06-02 山形修煉-變 | A08W | **NO_DAMAGE_EFFECT** | [] | `XHunterStone` j:26922; `XHunterStone` j:26975 |
| godie-uwar.e | 43-04 爆裂海景佛跳牆 | ANfd | **NO_DAMAGE_EFFECT** | [] | `godJumpWall` j:37959 |
| godie-n003.r | 42-04 世界終結 | A05D | **TRIVIAL** | [[1.0, 1.0, 1.0]] | `The_End_ofWorldStart` j:37761 |
| godie-n01g.r | 42-04 世界終結 | A05D | **TRIVIAL** | [[1.0, 1.0, 1.0]] | `The_End_ofWorldStart` j:37761 |
| godie-u00o.e | 76-03 伸縮自如的槍亂打 | A0IV | **TRIVIAL** | [[1.0, 1.0, 1.0, 1.0]] | `Luf_gun` j:36424 |
| godie-uvng.e | 38-03 邪王炎殺黑龍波 | A09I | **TRIVIAL** | [[1.0, 1.0, 1.0, 1.0]] | `DarkDragonEXMove` j:44305; `DarkDragonEXMove` j:44307 |
| godie-e001.passive | 22-00 嗚鎖打! | A0CL | **SUSPECT** | [[150.0]] | — |
| godie-e002.e | 20-03 約束與勝利之劍 | A0D5 | **SUSPECT** | [[250.0, 400.0, 550.0, 700.0]] | `Excalibur` j:32255 |
| godie-e002.r | 20-04 Avalon-永恆的理想鄉 | A0CT | **SUSPECT** | [[250.0, 500.0, 750.0]] | `avalonStart` j:32434 |
| godie-e002.w | 20-01 風王結界 | A0DZ | **SUSPECT** | [[160.0, 160.0, 160.0]] | `Air` j:32102 |
| godie-e007.e | 12-03 破凰之心-徒手空破山 | A02W | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-e007.r | 12-04 龍氣爆發 | A04X | **SUSPECT** | [[4.01, 4.01, 4.01]] | — |
| godie-e00j.q | 95-01 謝謝指教 | A0Y7 | **SUSPECT** | [[240.0, 360.0, 480.0, 600.0, 600.0]] | — |
| godie-e00j.r | 95-04 藍色戰氣一百重天 | A0Y9 | **SUSPECT** | [[0.0, 5.0, 5.0]] | `Hundred_Sky` j:54636 |
| godie-e00l.e | 20-03 約束與勝利之劍 | A0D5 | **SUSPECT** | [[250.0, 400.0, 550.0, 700.0]] | `Excalibur` j:32255 |
| godie-e00l.r | 20-04 Avalon-永恆的理想鄉 | A0CT | **SUSPECT** | [[250.0, 500.0, 750.0]] | `avalonStart` j:32434 |
| godie-e00l.w | 20-01 風王結界 | A0DZ | **SUSPECT** | [[160.0, 160.0, 160.0]] | `Air` j:32102 |
| godie-e00n.passive | 22-00 嗚鎖打! | A0CL | **SUSPECT** | [[150.0]] | — |
| godie-e00q.w | 69-02 黑泥召喚 | AOsw | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-e00s.e | 70-03 木束縛之術 | A0GR | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-e00s.r | 70-04 千年練成 | A0GN | **SUSPECT** | [[75.0, 75.0, 75.0]] | — |
| godie-e00t.e | 66-03 七夜怪談 | A0IB | **SUSPECT** | [[7.0, 12.0, 17.0, 22.0]] | — |
| godie-e00t.w | 66-02 驚駭 | A0I8 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-e00v.w | 84-02 保齡球 | A0CV | **SUSPECT** | [[150.0, 250.0, 350.0, 450.0, 550.0]] | — |
| godie-e00w.e | 77-03 GLADIARIA ALAT | A0JG | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-e00w.r | 77-04 真-雷光劍 | A0UB | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-e00x.e | 77-03 GLADIARIA ALAT | A0JG | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-e00x.passive | 77-00 浮雲-旋一閃 | A0JD | **SUSPECT** | [[250.0]] | — |
| godie-e00x.r | 77-04 真-雷光劍 | A0UB | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-e015.q | 94-01 北斗爆橘拳 | A0OV | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | `Oran` j:53869; `Oran` j:53871 |
| godie-ecen.e | 64-03 工廠機器人 | ANrc | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-ecen.r | 64-04 魔幻浮水印 | A0A3 | **SUSPECT** | [[80.0, 120.0, 160.0]] | `Marking` j:46703; `Marking` j:46705 |
| godie-ecen.w | 64-02 酒釀精華 | A0A7 | **SUSPECT** | [[4.01, 4.01, 4.01, 4.01]] | `Wine_Extract_Initiate` j:46552; `Wine_Extract_Initiate` j:46559 |
| godie-edem.e | 45-03 千鳥 | A0IJ | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-edem.w | 45-02 千鳥流 | A0JX | **SUSPECT** | [[75.0, 150.0, 225.0, 300.0, 300.0]] | — |
| godie-efur.q | 13-01 老樹盤根 | AEer | **SUSPECT** | [[75.0, 75.0, 75.0, 75.0]] | — |
| godie-efur.w | 13-02 變化念力 | A00X | **SUSPECT** | [[0.0, 99.0, 99.0, 99.0]] | — |
| godie-ekee.e | 93-03 這次考試很簡單 | A0NG | **SUSPECT** | [[100.0, 200.0, 300.0, 400.0]] | — |
| godie-emfr.q | 15-01 風精召喚 | A0D3 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-emfr.w | 15-02 沉睡之霧 | A054 | **SUSPECT** | [[75.0, 75.0, 75.0, 75.0]] | — |
| godie-emns.q | 44-01 死神之眼 | A0IK | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-emns.r | 44-04 心臟麻痺 | A05I | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-etyr.e | 14-02 式神炸裂 | A0JM | **SUSPECT** | [[250.0, 400.0, 550.0, 700.0]] | `SlaveExp` j:30451; `SlaveExp` j:30501 |
| godie-ewar.e | 12-03 破凰之心-徒手空破山 | A02W | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-ewar.r | 12-04 龍氣爆發 | A04X | **SUSPECT** | [[4.01, 4.01, 4.01]] | — |
| godie-ewar.w | 12-02 仙氣．採藥 | A02K | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-ewrd.r | 17-04 狂龍斬 | A07N | **SUSPECT** | [[75.0, 75.0, 75.0]] | — |
| godie-h001.r | 41-04 究極魔法流星雨 | ANr3 | **SUSPECT** | [[75.0, 75.0, 75.0]] | — |
| godie-h001.w | 41-02 地裂術 | A0Z2 | **SUSPECT** | [[90.0, 90.0, 90.0, 90.0]] | — |
| godie-h01u.r | 80-04 赤兔咆哮 | A0MZ | **SUSPECT** | [[90.0, 20.0, 30.0]] | — |
| godie-h01u.w | 80-02 弒鬼神 | A0MY | **SUSPECT** | [[150.0, 250.0, 350.0, 0.0, 0.0]] | — |
| godie-h020.w | 04-02 炸彈陣 | A021 | **SUSPECT** | [[110.0, 170.0, 230.0, 290.0]] | — |
| godie-h022.passive | 82-00 天生法術書 | A0Q0 | **SUSPECT** | [[100.0]] | — |
| godie-h02s.e | 91-03 碎心打擊 | A0W1 | **SUSPECT** | [[225.0, 300.0, 375.0, 450.0]] | `HeartStrike` j:53354; `HeartStrike` j:53360 |
| godie-h02z.e | 91-03 碎心打擊 | A0W1 | **SUSPECT** | [[225.0, 300.0, 375.0, 450.0]] | `HeartStrike` j:53354; `HeartStrike` j:53360 |
| godie-hapm.w | 52-02 蹂躪編年史 | A0U1 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-hart.q | 01-01 凶斬 | A072 | **SUSPECT** | [[150.0, 220.0, 290.0, 360.0, 360.0]] | `XFight` j:33419 |
| godie-hart.r | 01-04 超究武神霸斬 | A077 | **SUSPECT** | [[75.0, 75.0, 75.0]] | `SuperFF7` j:33915; `SuperFF7` j:33921 |
| godie-hart.w | 01-02 隕石擊 | A0UX | **SUSPECT** | [[200.0, 400.0, 600.0, 800.0, 1000.0]] | — |
| godie-hjai.w | 04-02 炸彈陣 | A021 | **SUSPECT** | [[110.0, 170.0, 230.0, 290.0]] | — |
| godie-hlgr.q | 03-02 詭雷 | ANab | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-hlgr.r | 03-04 全彈發射 | A04N | **SUSPECT** | [[320.0, 470.0, 620.0]] | `Allbullet` j:32854; `Allbullet` j:32856 |
| godie-hpal.e | 35-03 鏡蠱 | A06H | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-hpal.q | 35-01 土爪 | A06G | **SUSPECT** | [[120.0, 240.0, 360.0, 480.0]] | `EightCloud` j:42974 |
| godie-hpal.w | 35-02 石絲 | A06J | **SUSPECT** | [[75.0, 75.0, 75.0, 75.0]] | — |
| godie-hpb1.e | 07-03 列、在、前 | A0G3 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-hpb1.w | 07-02 者、皆、陣 | A0G2 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | `MoonKnock` j:34382 |
| godie-huth.q | 28-01 吃掉你 | A0GB | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-hvsh.e | 48-03 鮮血神殿 | A06C | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | `Blood` j:38492 |
| godie-hvsh.r | 48-04 騎英之疆繩 | A0RQ | **SUSPECT** | [[80.0, 120.0, 160.0]] | `RidermovelineDam` j:38360 |
| godie-n00b.r | 57-04 竹蜻蜓 | A0JN | **SUSPECT** | [[75.0, 75.0, 75.0]] | — |
| godie-n00b.w | 57-03 複製鏡 | A0NE | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-n00p.e | 18-03 妖狐變化 | A0IH | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-naka.q | 27-01 忍法風魔手裡劍 | A03A | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-naka.w | 27-02 忍法鬼穿刺 | AUim | **SUSPECT** | [[90.0, 90.0, 90.0, 90.0]] | — |
| godie-nbst.e | 24-03 變態絕技悶絕地獄車 | A0AP | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | `Crazy_Movement` j:25563; `Crazy_Movement` j:25572 |
| godie-nbst.w | 24-02 變態根性 | A074 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-nman.e | 40-03 萬解-貓王胖虎 | A0ND | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-nman.r | 40-04 地獄搖滾 | A0LZ | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-nplh.e | 16-04 劍之精靈 | A043 | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-nplh.w | 16-01 超．占事略決 | A041 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-nsjs.e | 18-03 妖狐變化 | A0IH | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-ntin.q | 23-01 電離光槍 - 繁星飛躍 | A0NA | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-ntin.r | 23-04 雷焰聖劍 | A0OD | **SUSPECT** | [[75.0, 75.0, 75.0]] | `HolySword` j:31235 |
| godie-o00l.r | 53-04 暴爆咒 | A0UE | **SUSPECT** | [[80.0, 120.0, 160.0]] | `AnKiMagic_Effect` j:40035; `AnKiMagic_Effect` j:40039 |
| godie-o00l.w | 53-02 強化炸彈陣 | A0DQ | **SUSPECT** | [[300.0, 600.0, 900.0, 1200.0]] | — |
| godie-o00x.e | 09-03 超級賽亞人 | A09E | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-o01z.q | 81-01 Barrel Shot | A0XG | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | `BarrelShot` j:35933 |
| godie-o02l.r | 58-04 瘋狂皮卡丘 | A040 | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-o02o.e | 87-03 天下號令 | A0DB | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-o02o.q | 87-01 大紅蓮斬 | A0DE | **SUSPECT** | [[250.0, 550.0, 850.0, 0.0, 0.0]] | — |
| godie-o02s.q | 53-02 強化炸彈陣 | A0DQ | **SUSPECT** | [[300.0, 600.0, 900.0, 1200.0]] | — |
| godie-o02v.q | 81-01 Barrel Shot | A0XG | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | `BarrelShot` j:35933 |
| godie-obla.q | 33-01 放山雞 | A02L | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-ofar.r | 58-04 瘋狂皮卡丘 | A040 | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-ogld.r | 72-04 黑化 | A0CO | **SUSPECT** | [[77.0, 77.0, 77.0]] | `BlackTooth` j:47360 |
| godie-ogrh.e | 09-03 超級賽亞人 | A09E | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-orkn.r | 30-04 電車之狼衝擊 | A01P | **SUSPECT** | [[800.0, 800.0, 800.0]] | — |
| godie-orkn.w | 30-02 酒精灌腸 | ANdh | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-oshd.e | 29-03 有功夫無懦夫 | AOvd | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-oshd.q | 29-01 鐵砂掌 | A06U | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-oshd.r | 29-04 電光毒龍鑽 | A00Z | **SUSPECT** | [[200.0, 400.0, 600.0]] | — |
| godie-oshd.w | 29-02 鬼王流星雨 | AEsf | **SUSPECT** | [[450.0, 600.0, 750.0, 900.0]] | — |
| godie-othr.q | 31-01 迴旋爪擊 | A0I4 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u00b.q | 75-01 超．祕技略決 | A075 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u00h.e | 39-03 無名神風流-蛟龍 | A0DO | **SUSPECT** | [[90.0, 90.0, 90.0, 90.0]] | — |
| godie-u00j.w | 74-02 八刀一閃 | A0ET | **SUSPECT** | [[150.0, 250.0, 350.0, 450.0, 550.0]] | — |
| godie-u00k.e | 71-03 厄夜靈魂 | A0HJ | **SUSPECT** | [[80.0, 160.0, 240.0, 320.0]] | — |
| godie-u00k.r | 71-04 萬惡歸宗 | A0HK | **SUSPECT** | [[150.0, 300.0, 450.0]] | `AllSinReturn` j:48274; `AllSinReturn` j:48276 |
| godie-u00k.w | 71-02 靈魂吸取 | A08T | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-u00l.q | 25-01 北斗懺悔拳 | A0AF | **SUSPECT** | [[150.0, 300.0, 450.0, 600.0, 750.0]] | `YouDie` j:38624; `YouDie` j:38626 |
| godie-u00l.r | 25-04 ChangeDNA | A0HW | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-u00n.q | 76-01 伸縮自如的橡膠戰斧 | A0IS | **SUSPECT** | [[75.0, 75.0, 75.0, 75.0]] | — |
| godie-u00o.q | 76-01 伸縮自如的橡膠戰斧 | A0IS | **SUSPECT** | [[75.0, 75.0, 75.0, 75.0]] | — |
| godie-u010.q | 38-01 邪王炎殺劍 | A0OG | **SUSPECT** | [[250.0, 350.0, 450.0, 550.0, 650.0]] | — |
| godie-u010.w | 38-02 邪王炎殺煉獄焦 | A09H | **SUSPECT** | [[250.0, 400.0, 550.0, 700.0, 850.0]] | `FireSword` j:43663 |
| godie-u011.w | 61-02 霸獸盔甲 | A0OQ | **SUSPECT** | [[12.0, 24.0, 36.0, 48.0]] | — |
| godie-u012.w | 61-02 霸獸盔甲 | A0OQ | **SUSPECT** | [[12.0, 24.0, 36.0, 48.0]] | — |
| godie-u034.e | 06-03 山形修煉-強 | A020 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | `XHunterStone` j:26922; `XHunterStone` j:26975 |
| godie-ubal.r | 37-04 魔界之王 | A01Z | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-ucrl.e | 06-03 山形修煉-強 | A020 | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | `XHunterStone` j:26922; `XHunterStone` j:26975 |
| godie-udea.e | 65-03 魔法膨脹 | A0CH | **SUSPECT** | [[200.0, 400.0, 600.0, 800.0, 800.0]] | `MagicUp` j:46927 |
| godie-umal.q | 25-01 北斗懺悔拳 | A0AF | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | `YouDie` j:38624; `YouDie` j:38626 |
| godie-umal.r | 25-04 ChangeDNA | A0HW | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-usyl.e | 49-03 蛻變 | A0BV | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-uvng.q | 38-01 邪王炎殺劍 | A0OG | **SUSPECT** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-uvng.w | 38-02 邪王炎殺煉獄焦 | A09H | **SUSPECT** | [[250.0, 400.0, 550.0, 700.0, 850.0]] | `FireSword` j:43663 |
| godie-uwar.r | 43-03 少林絕學-火雲掌 | A00D | **SUSPECT** | [[80.0, 120.0, 160.0]] | — |
| godie-e00q.e | 69-03 約束與勝利之劍 | ? | **UNVERIFIED** | [[350.0, 500.0, 650.0, 800.0]] | — |
| godie-e00u.e | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-e00u.q | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-e00u.r | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0]] | — |
| godie-e00u.w | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-h02n.e | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-h02n.q | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-h02n.r | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0]] | — |
| godie-h02n.w | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-harf.w | 26-02 亂入 | ? | **UNVERIFIED** | [[0.0, 25.0, 25.0, 25.0]] | — |
| godie-hgam.e | 90-03 藤鞭 | ? | **UNVERIFIED** | [[350.0, 500.0, 650.0, 800.0]] | — |
| godie-hpal.r | 35-04 光牙 | ? | **UNVERIFIED** | [[600.0, 1000.0, 1400.0]] | — |
| godie-o00k.q | 86-01 十萬伏特 | ? | **UNVERIFIED** | [[175.0, 275.0, 375.0, 375.0, 375.0]] | — |
| godie-ogld.w | 72-02 黑人牙菌斑 | ? | **UNVERIFIED** | [[20.0, 30.0, 40.0]] | — |
| godie-u00b.e | 75-02 龍捲風 | ANto | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0]] | — |
| godie-u01f.e | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u01f.q | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u01f.r | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0]] | — |
| godie-u01f.w | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u01q.e | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u01q.q | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |
| godie-u01q.r | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0]] | — |
| godie-u01q.w | none | ? | **UNVERIFIED** | [[80.0, 120.0, 160.0, 200.0, 240.0]] | — |

## 特效 axis — WC3 spawns visuals but content shows nothing

| ability | name | jass models | jass dummy units |
|---|---|---|---|

## 音效 axis — WC3 sounds per ability (content field TBD)

| ability | name | gg_snd refs |
|---|---|---|
| godie-e008.q | 21-02 拔焰刀 | gg_snd_FlareTarget3 |
| godie-e008.r | 21-04 討滅封絕 | gg_snd_FlareTarget1, gg_snd_SoulPreservation |
| godie-e00k.e | 19-03 瞬切百殺 | gg_snd_FlareTarget2 |
| godie-e00q.ex | 69-002 固有結界-黑洞 | gg_snd_Parasite |
| godie-e00r.r | 59-04 野戰型陽電子砲 | gg_snd_MarkOfChaos |
| godie-e00s.q | 70-01 伸卡球 | gg_snd_TreantReady1 |
| godie-e00t.w | 66-02 驚駭 | gg_snd_NecropolisUpgrade2 |
| godie-e00w.q | 77-01 百烈櫻華斬 | gg_snd_DarkSummoningLaunch1 |
| godie-e00x.q | 77-01 百烈櫻華斬 | gg_snd_DarkSummoningLaunch1 |
| godie-e00z.e | 19-03 瞬切百殺 | gg_snd_FlareTarget2 |
| godie-e015.q | 94-01 北斗爆橘拳 | gg_snd_PeonDeath |
| godie-edem.r | 45-04 哥哥 | gg_snd_ThunderBoltMissileDeath |
| godie-emfr.w | 15-02 沉睡之霧 | gg_snd_AkamaPissed8 |
| godie-emns.q | 44-01 死神之眼 | gg_snd_FountainOfLifeWhat1, gg_snd_GruntYesAttack1 |
| godie-emns.e | 44-03 火車輾過 | gg_snd_RokhanWhat2 |
| godie-emns.r | 44-04 心臟麻痺 | gg_snd_GruntYesAttack3 |
| godie-emns.ex | 44-002 交換筆記本 | gg_snd_KaelYesAttack3 |
| godie-h00l.q | 60-01 科奇利族的迴旋鏢 | gg_snd_DruidOfTheTalonMissileLaunch2, gg_snd_WitchDoctorCastAttack1 |
| godie-h00l.w | 60-02 鎖鏈槍 | gg_snd_HeadHunterYes4 |
| godie-h00l.r | 60-04 迴旋斬 | gg_snd_AxeMissileLaunch1 |
| godie-h01u.w | 80-02 弒鬼神 | gg_snd_DefendCaster |
| godie-h01u.r | 80-04 赤兔咆哮 | gg_snd_DefendCaster |
| godie-h02k.w | 89-02 憤怒的菊花 | gg_snd_PandarenBrewmasterPissed8 |
| godie-h02k.e | 89-03 憤怒的胸毛 | gg_snd_PandarenBrewmasterWarcry1 |
| godie-h02k.r | 89-04 憤怒的簡諧運動 | gg_snd_PandarenBrewmasterYes1 |
| godie-h02k.ex | 89-002 俄羅斯輪盤 | gg_snd_MortarImpact |
| godie-h02s.q | 91-01 死亡之握 | gg_snd_HeadHunterYes4 |
| godie-h02u.w | 92-03 狂草泥馬 | gg_snd_Taunt |
| godie-h02v.w | 92-03 狂草泥馬 | gg_snd_Taunt |
| godie-h02z.q | 91-01 死亡之握 | gg_snd_HeadHunterYes4 |
| godie-hpb1.w | 07-02 者、皆、陣 | gg_snd_DarkSummoningLaunch1, gg_snd_moongo |
| godie-hpb1.e | 07-03 列、在、前 | gg_snd_moonjump |
| godie-huth.w | 28-02 把你變成餅乾 | gg_snd_EggSackDeath1 |
| godie-n00b.w | 57-03 複製鏡 | gg_snd_SpellbreakerPissed4 |
| godie-n00p.w | 18-02 寄生種子 | gg_snd_SpiritOfVengeanceYes3 |
| godie-n00p.e | 18-03 妖狐變化 | gg_snd_AltarOfEldersWhat1 |
| godie-n01c.e | 08-03 龍鬥氣砲咒文 | gg_snd_ThunderClapCaster |
| godie-nbbc.e | 08-03 龍鬥氣砲咒文 | gg_snd_ThunderClapCaster |
| godie-nbst.ex | 24-002 來~快點吃吧 | gg_snd_PeasantPissed3 |
| godie-nman.w | 40-02 必殺！爆熱神音！ | gg_snd_BloodlustTarget, gg_snd_StampedeCaster1 |
| godie-nman.r | 40-04 地獄搖滾 | gg_snd_ShamanReady1 |
| godie-nsjs.e | 18-03 妖狐變化 | gg_snd_AltarOfEldersWhat1 |
| godie-o00k.passive | 86-00 裝可愛 | gg_snd_nocute |
| godie-o00l.e | 53-03 破法對咒 | gg_snd_WayGateWhat1 |
| godie-o00l.r | 53-04 暴爆咒 | gg_snd_Taunt |
| godie-o01z.q | 81-01 Barrel Shot | gg_snd_DefendCaster, gg_snd_FlareTarget3 |
| godie-o01z.w | 81-02 Acxel Shooter | gg_snd_DefendCaster, gg_snd_FlareTarget3 |
| godie-o01z.e | 81-03 Divine Buster Extention | gg_snd_MarkOfChaos, gg_snd_SnapDragonMissileLaunch1, gg_snd_SoulGem |
| godie-o01z.r | 81-04 Starlight Breaker Plus | gg_snd_SnapDragonMissileLaunch1, gg_snd_SoulGem |
| godie-o02l.e | 58-03 就決定是你了!小智 | gg_snd_sawch |
| godie-o02s.r | 53-03 破法對咒 | gg_snd_WayGateWhat1 |
| godie-o02v.q | 81-01 Barrel Shot | gg_snd_DefendCaster, gg_snd_FlareTarget3 |
| godie-o02v.w | 81-02 Acxel Shooter | gg_snd_DefendCaster, gg_snd_FlareTarget3 |
| godie-o02v.e | 81-03 Divine Buster Extention | gg_snd_MarkOfChaos, gg_snd_SnapDragonMissileLaunch1, gg_snd_SoulGem |
| godie-o02v.r | 81-04 Starlight Breaker Plus | gg_snd_SnapDragonMissileLaunch1, gg_snd_SoulGem |
| godie-obla.q | 33-01 放山雞 | gg_snd_ChickenWhat1 |
| godie-obla.e | 33-03 地道突襲 | gg_snd_GlueScreenMeteorHit1, gg_snd_GlueScreenMeteorHit2 |
| godie-obla.r | 33-04 動物拳法 | gg_snd_FarmWhat1, gg_snd_SealWhat2 |
| godie-ofar.e | 58-03 就決定是你了!小智 | gg_snd_sawch |
| godie-opgh.e | 32-03 閃光龍牙 | gg_snd_NazgrelYes2 |
| godie-orkn.q | 30-01 綁架 | gg_snd_HeadHunterYes4 |
| godie-u00h.e | 39-03 無名神風流-蛟龍 | gg_snd_FlareTarget2 |
| godie-u00h.r | 39-04 祕奧義．金色的神風 | gg_snd_DragonYes2 |
| godie-u00j.w | 74-02 八刀一閃 | gg_snd_SnapDragonMissileLaunch1 |
| godie-u00k.e | 71-03 厄夜靈魂 | gg_snd_Parasite |
| godie-u00k.r | 71-04 萬惡歸宗 | gg_snd_Taunt |
| godie-u00l.q | 25-01 北斗懺悔拳 | gg_snd_GruntWhat2, gg_snd_PeonDeath, gg_snd_PeonWhat2 |
| godie-u00l.r | 25-04 ChangeDNA | gg_snd_nocute |
| godie-u00n.e | 76-03 伸縮自如的槍亂打 | gg_snd_DemonHunterMissileHit3, gg_snd_WaterElementalMissile3 |
| godie-u00n.passive | 76-00 二檔 | gg_snd_TrollWoodWorksWhat1 |
| godie-u00o.e | 76-03 伸縮自如的槍亂打 | gg_snd_DemonHunterMissileHit3, gg_snd_WaterElementalMissile3 |
| godie-u00o.passive | 76-00 二檔 | gg_snd_TrollWoodWorksWhat1 |
| godie-u00v.w | 78-02 地走龍牙破 | gg_snd_GlueScreenMeteorHit1, gg_snd_GlueScreenMeteorHit2 |
| godie-u00v.e | 78-03 廬山昇龍破 | gg_snd_DragonYes2 |
| godie-u010.q | 38-01 邪王炎殺劍 | gg_snd_DarkSummoningLaunch1 |
| godie-u010.w | 38-02 邪王炎殺煉獄焦 | gg_snd_HCancelBuilding |
| godie-u010.e | 38-03 邪王炎殺黑龍波 | gg_snd_DragonYes2, gg_snd_ShimmeringPortalDeath |
| godie-u010.r | 38-04 黑龍波吸收 | gg_snd_DragonRoostWhat1, gg_snd_FlashBack1Second |
| godie-u011.e | 61-03 打屁股風林火豬 | gg_snd_GruntPissed3 |
| godie-u012.e | 61-03 打屁股風林火豬 | gg_snd_GruntPissed3 |
| godie-u034.q | 06-01 山形修煉-放 | gg_snd_MortarTeamPissed9 |
| godie-u034.w | 06-02 山形修煉-變 | gg_snd_MortarTeamPissed9 |
| godie-u034.e | 06-03 山形修煉-強 | gg_snd_MortarTeamPissed9 |
| godie-u034.passive | 06-00 猜猜拳 | gg_snd_MortarTeamPissed9 |
| godie-ubal.w | 37-03 災難之牆 | gg_snd_HCancelBuilding, gg_snd_TrollbatriderPissed2 |
| godie-ubal.r | 37-04 魔界之王 | gg_snd_ShadowHunterReady1, gg_snd_TreantReady1 |
| godie-ucrl.q | 06-01 山形修煉-放 | gg_snd_MortarTeamPissed9 |
| godie-ucrl.w | 06-02 山形修煉-變 | gg_snd_MortarTeamPissed9 |
| godie-ucrl.e | 06-03 山形修煉-強 | gg_snd_MortarTeamPissed9 |
| godie-ucrl.passive | 06-00 猜猜拳 | gg_snd_MortarTeamPissed9 |
| godie-udea.e | 65-03 魔法膨脹 | gg_snd_Taunt |
| godie-umal.q | 25-01 北斗懺悔拳 | gg_snd_GruntWhat2, gg_snd_PeonDeath, gg_snd_PeonWhat2 |
| godie-umal.r | 25-04 ChangeDNA | gg_snd_nocute |
| godie-usyl.e | 49-03 蛻變 | gg_snd_MercenaryWhat1 |
| godie-uvng.q | 38-01 邪王炎殺劍 | gg_snd_DarkSummoningLaunch1 |
| godie-uvng.w | 38-02 邪王炎殺煉獄焦 | gg_snd_HCancelBuilding |
| godie-uvng.e | 38-03 邪王炎殺黑龍波 | gg_snd_DragonYes2, gg_snd_ShimmeringPortalDeath |
| godie-uvng.r | 38-04 黑龍波吸收 | gg_snd_DragonRoostWhat1, gg_snd_FlashBack1Second |

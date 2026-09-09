# 37 + 37 兩批英雄交付總表

共 **74 名英雄、444 槽技能、74 個唯一 workId**。以下是兩個獨立本機平台的投稿、管理員發布與署名來源還原收據彙整；不是單一正式服務 74 名已部署的證明。

| 批次 | 數量 | 本機平台 | 收據 contentVersion | 本輪處理 | PR |
|---|---:|---|---|---|---|
| 第一批 | 37 名／222 槽 | `http://127.0.0.1:8098/api/v1` | `cv_b9b47052d2e3` | 引用已提交收據，本輪未重跑 | [#1135](https://github.com/adms/GGD/pull/1135)（Draft） |
| 第二批 | 37 名／222 槽 | `http://127.0.0.1:8099/api/v1` | `cv_d3b33838b6cc` | 37 名依對齊服務重新建包、投稿、發布 | [#1153](https://github.com/adms/GGD/pull/1153)（Draft） |

兩批 gameRevision 均為 `417abec9d90424b5ccbe7948331a60f98dd0f689`，但 runtime overlay 與 contentVersion 不同，不能把兩份隔離收據合稱一次共同服務驗收。

第一批收據的本機 bytes 已與固定 commit `2cdc3f902b4dbc0c45b2b49b4b74ed0436ff3d8b` 的 Git blob 逐位元組比對；第二批使用本 PR 內新的 `receipts/aligned-current/` 收據。完整版本 digest、target、submissionId、收據 SHA-256 和逐列 JSON pointer 均列於 [機器總表](two-batch-handoff.json)。

| 收據 | SHA-256 |
|---|---|
| [batch1.publication](https://github.com/adms/GGD/blob/2cdc3f902b4dbc0c45b2b49b4b74ed0436ff3d8b/materials/community-hero-forge/refinements/parody-publication-proof.json) | `05d820dd0864a4c9769f5f648d895a68751d941b908ef62b75d1b1029cc06eea` |
| [batch1.build](https://github.com/adms/GGD/blob/2cdc3f902b4dbc0c45b2b49b4b74ed0436ff3d8b/materials/community-hero-forge/refinements/parody-service-proof.json) | `f76c013514b1e9ebf5980d7e46072d2d14ef25a6b83145d25105c312cc70dcfa` |
| [batch2.publication](receipts/aligned-current/publication-proof.json) | `0c53efc38e4b9b10f403fbbf2998003865a5ed51822edec3c591158449ff55af` |
| [batch2.build](receipts/aligned-current/service-proof.json) | `a7ea4bae2c7878c88a3289a5bb2420b09ec5afd14f5ca6d37371cd1fa333b03d` |

## 驗收範圍

- 74 列的名字、workId、六槽數、package/source/archive digest 均由 build 與 publication 收據交叉核對；每列皆有版本及來源還原成功紀錄。
- 第二批 37 份原稿 SHA-256 與 [source-lock.json](source-lock.json) 一致，保留上游 [#1144](https://github.com/adms/GGD/pull/1144) 的角色內容。
- 模型維持現有綁定／代理素材，待 Owner 統一整理；此表不代表完成模型對應、骨架重綁或視覺驗收。
- 此表不證明 74 名全部實際進場、444 槽逐招驗收或整體畫面驗收；任何另外記錄的第二批兩席抽樣也只涵蓋該抽樣。
- 正式部署仍待 Main 審查、合併及整合版本驗收。

## 74 名逐項清單

表內版本顯示完整 SHA-256 的前 12 碼便於閱讀；完整值請依 workId 查 [JSON 總表](two-batch-handoff.json)。槽數均來自對應 build 收據。

| 批次 | 角色名稱 | workId | 槽數 | 版本 digest 短碼 | 發布修訂 |
|---|---|---|---:|---|---:|
| 第一批 | 武藤遊戲 | `community-review-01-20260907` | 6 | `82987ae59b77` | 3 |
| 第一批 | 八神庵 | `community-review-02-20260907` | 6 | `69f9e76a121c` | 6 |
| 第一批 | 不知火舞 | `community-review-03-20260907` | 6 | `774e66c51d8e` | 6 |
| 第一批 | 空條承太郎 | `community-review-04-20260907` | 6 | `b39fb6730d0d` | 6 |
| 第一批 | 洛克人 | `community-review-05-20260907` | 6 | `f1f8aa9b6f73` | 6 |
| 第一批 | 卡比 | `community-review-06-20260907` | 6 | `c8806eaaf364` | 6 |
| 第一批 | 西索 | `community-review-07-20260907` | 6 | `6d5030ea6536` | 6 |
| 第一批 | 米卡莎 | `community-review-08-20260907` | 6 | `bb7eb8e8a49d` | 6 |
| 第一批 | 赫蘿 | `community-review-09-20260907` | 6 | `580f2c909867` | 6 |
| 第一批 | 魯路修 | `community-review-10-20260907` | 6 | `2d917821dce4` | 6 |
| 第一批 | 利姆路 | `community-review-11-20260907` | 6 | `1ef1dd27373e` | 6 |
| 第一批 | 衛宮士郎 | `community-review-12-20260907` | 6 | `76581c864944` | 6 |
| 第一批 | 朝田詩乃 | `community-review-13-20260907` | 6 | `bbc83b8034f1` | 6 |
| 第一批 | 殺老師 | `community-review-14-20260907` | 6 | `41998c01ac78` | 6 |
| 第一批 | 比利海靈頓 | `community-review-15-20260907` | 6 | `35d3bcc612f2` | 6 |
| 第一批 | 魔法少女☆伊莉雅 | `community-review-16-20260907` | 6 | `b2c9d2299841` | 6 |
| 第一批 | 安茲·烏爾·恭 | `community-review-17-20260907` | 6 | `853d11e6cd4b` | 6 |
| 第一批 | 吉爾伽美什 | `community-review-18-20260907` | 6 | `ca2c934a641c` | 6 |
| 第一批 | 桐谷和人 | `community-review-19-20260907` | 6 | `46038521ab11` | 6 |
| 第一批 | 御坂美琴 | `community-review-20-20260907` | 6 | `b69d2b184063` | 6 |
| 第一批 | 鹿目圓 | `community-review-21-20260907` | 6 | `028970e2c341` | 6 |
| 第一批 | 菜月昴 | `community-review-22-20260907` | 6 | `95e6afbb6615` | 6 |
| 第一批 | 坂田銀時 | `community-review-23-20260907` | 6 | `c464f30886e6` | 3 |
| 第一批 | 奇犽 | `community-review-24-20260907` | 6 | `d7726452bea1` | 3 |
| 第一批 | 一拳超人 | `community-review-25-20260907` | 6 | `1b479feaae7b` | 6 |
| 第一批 | 名偵探柯南 | `community-review-26-20260907` | 6 | `84e7e3959d65` | 6 |
| 第一批 | 庫洛魔法使 | `community-review-27-20260907` | 6 | `18fee4ef46f7` | 6 |
| 第一批 | 艾莉絲·伯雷亞斯·格雷拉特 | `community-review-28-20260907` | 6 | `4964b954701a` | 3 |
| 第一批 | 芙莉蓮 | `community-review-29-20260907` | 6 | `42603d0744b5` | 6 |
| 第一批 | 尼古貓貓 | `community-review-30-20260907` | 6 | `90e7331529cb` | 6 |
| 第一批 | SUN樂 | `community-review-31-20260907` | 6 | `ee09e3de60a7` | 3 |
| 第一批 | 阿薩謝爾 | `community-review-32-20260907` | 6 | `7c7c4e6a71d4` | 6 |
| 第一批 | 近衛刀太 | `community-review-33-20260907` | 6 | `2b024b490bf4` | 6 |
| 第一批 | 高速婆婆 | `community-review-34-20260907` | 6 | `fe5052a0b2bc` | 6 |
| 第一批 | 炭治郎 | `community-review-35-20260907` | 6 | `72a476940ccd` | 6 |
| 第一批 | 鬼畜王蘭斯 | `community-review-36-20260907` | 6 | `e92cd25bbd1b` | 6 |
| 第一批 | 吉伊卡哇 | `community-review-37-20260907` | 6 | `3315adc00e03` | 6 |
| 第二批 | 阿拉丁 | `b2-aladdin` | 6 | `d210953b06cc` | 6 |
| 第二批 | 阿爾巴斯 | `b2-albus` | 6 | `a6296ce712c0` | 6 |
| 第二批 | 波吉 | `b2-bojji` | 6 | `c4d1a3c11745` | 6 |
| 第二批 | 阿箱＋拉蜜絲 | `b2-boxxo` | 6 | `892647cc78ee` | 6 |
| 第二批 | 艾爾瑪 | `b2-elma` | 6 | `47cb5ebd20ac` | 6 |
| 第二批 | 不死 | `b2-fushi` | 6 | `3b70541ae8eb` | 6 |
| 第二批 | 哥布林殺手 | `b2-goblin` | 6 | `d9be713c6df2` | 6 |
| 第二批 | 凱茲 | `b2-guts` | 6 | `28315cc151e1` | 6 |
| 第二批 | 羽賀 | `b2-haga` | 6 | `eb3dcd57b830` | 6 |
| 第二批 | 楓 | `b2-kaede` | 6 | `dceb4c5db321` | 6 |
| 第二批 | 伊藤開司 | `b2-kaiji` | 6 | `71d87f5a4b78` | 6 |
| 第二批 | 凱亞爾 | `b2-keyaru` | 6 | `2e63a0b04605` | 6 |
| 第二批 | 如月電車 | `b2-kisaragi` | 6 | `52bedd5e4c7c` | 6 |
| 第二批 | 克勞斯 | `b2-klaus` | 6 | `ba96e82b56ca` | 6 |
| 第二批 | 蜘蛛子 | `b2-kumoko` | 6 | `48933b2d64b1` | 6 |
| 第二批 | 幸運超人 | `b2-luckyman` | 6 | `fce76f7e5631` | 6 |
| 第二批 | 深澄真 | `b2-makoto` | 6 | `10bf9bb1ecf7` | 6 |
| 第二批 | 貓貓 | `b2-maomao` | 6 | `0d5934189961` | 6 |
| 第二批 | 梅普露 | `b2-maple` | 6 | `dcec008f8964` | 6 |
| 第二批 | 馬提亞斯 | `b2-matthias` | 6 | `71c6af070702` | 6 |
| 第二批 | 米瑟利 | `b2-misery` | 6 | `a23c8788cbd1` | 6 |
| 第二批 | 岩谷尚文 | `b2-naofumi` | 6 | `a3e7f049b17f` | 6 |
| 第二批 | 青蛙劍士 Ned | `b2-ned` | 6 | `3a584cab19bc` | 6 |
| 第二批 | 諾爾 | `b2-noor` | 6 | `796c05db68b8` | 6 |
| 第二批 | 鵺野鳴介 | `b2-nube` | 6 | `8bc996b3ffc2` | 6 |
| 第二批 | 歐菲 | `b2-orphen` | 6 | `dfec4c00f8bb` | 6 |
| 第二批 | 何布 | `b2-popp` | 6 | `19b2e8a07410` | 6 |
| 第二批 | 蕾姆 | `b2-rem` | 6 | `9bd0a5f5e991` | 6 |
| 第二批 | 遠坂凜 | `b2-rin` | 6 | `304da9901aa2` | 6 |
| 第二批 | 闇影 | `b2-shadow` | 6 | `6203a267ea4d` | 6 |
| 第二批 | 野原新之助 | `b2-shinchan` | 6 | `5a6e4c3bf52b` | 6 |
| 第二批 | 辛巴達 | `b2-sinbad` | 6 | `3e5ad2740df3` | 6 |
| 第二批 | 章魚嗶 | `b2-takopi` | 6 | `52bb27439a16` | 6 |
| 第二批 | 托卡・史考特 | `b2-touka` | 6 | `1ff6dc713934` | 6 |
| 第二批 | 異世界舅舅 | `b2-uncle` | 6 | `f9751fe505e3` | 6 |
| 第二批 | 高遠夜霧 | `b2-yogiri` | 6 | `b34ecc5d9e90` | 6 |
| 第二批 | 我妻善逸 | `b2-zenitsu` | 6 | `3ab46aef5f38` | 6 |

# scenery-cc0 — 下載素材帳本（GH#362 資產缺口，第二批）

**53 件**，全部 **CC0**，抓取日期 **2026-08-18**，合計 **32.5 MB**。

這個目錄與 `tools/scenery-gen/` 出的 15 件是**相反的來源**：那 15 件一個位元組都沒下載
（`scenery/README.md`：「不存在的來源不需要證明」），這 53 件**每一個位元組都是下載來的**，
所以它們需要的正是那一份證明。這份檔案就是。

---

## 一 · 授權：三段證明鏈

⚠️ 這三段是**分開的三個 repo**，逐段往上追到原始權利人。

| 段 | 是什麼 | 說了什麼 |
|---:|---|---|
| **1** | 登錄表 [`ToxSam/open-source-3D-assets`](https://github.com/ToxSam/open-source-3D-assets) 的 `data/projects.json` | 每一個 collection 標 `"license": "CC0"` |
| **2** | 轉檔 repo [`ToxSam/cc0-models-Polygonal-Mind`](https://github.com/ToxSam/cc0-models-Polygonal-Mind) 的 README | 「CC0-licensed 3D environments and props」 |
| **3** | ⭐ **原始發布者** [`PolygonalMind/initiative-opensource-release`](https://github.com/PolygonalMind/initiative-opensource-release) 的 README | 逐字：「This projects falls under the license **CC0**, which means that you are free to use, modify, and distribute our work **without any restrictions, even for commercial purposes, and without having to attribute**」 |

### ⚠️ 這條鏈的弱點（誠實記錄，⛔ 不要在別處把它講成 SPDX 那麼強）

**兩個 repo 都沒有 `LICENSE` 檔** —— 宣告只寫在 README 的散文裡。
這比一份 SPDX `LICENSE` 檔**弱一級**：散文可以被改寫、可以有歧義、
而且沒有任何機器讀得到它。

留著它的理由是第 3 段是**原始權利人自己**、講得明確且無歧義（「without any
restrictions」「without having to attribute」都是逐字的），而且第 1 段的機器可讀
欄位（`"license": "CC0"`）與它一致。⭐ 但這是一個**判斷**，不是一份契約 ——
owner 要推翻它就整個目錄刪掉，⛔ 不要只刪幾件。

⚠️ 三段都是 **2026-08-18** 當天讀到的狀態。上游日後改了 README，這份帳本不會自己知道。

---

## 二 · 這些位元組被動過什麼（以及為什麼**必須**動）

### 動了什麼：只有 scene 根節點的 Y 位移

`tools/scenery-cc0/normalize.ts` 把每一件的世界 bbox 最低點推到 **y = 0**。
53 件裡 **34 件**被推過，**19 件**上游就已經座地、
因此**逐位元組等於上游**。

⭐ 改的是**唯一一種不影響外觀**的東西：`node.translation[1]`（或 `node.matrix[13]`）。
**BIN chunk 逐位元組原封不動** —— 幾何、UV、法線、貼圖、accessor 一個 bit 都沒被碰過。
所以這個轉換在結構上不可能弄壞模型，只可能把它上下移動。（實測：4 件抽樣重抓上游，
`BIN identical: true` / `JSON changed: true`。）

### 為什麼非動不可 —— 因為（當時）**沒有內容側的槓桿**

`zDecor`（`packages/shared/src/content/schema/arena.ts`）在 2026-08-18 只有五格：
`model` · `x` · `z` · `rotQuarter` · `scale` —— **沒有 `y`**。
而 `dressArena()`（`apps/client/src/render/ArenaScene.ts`）把每一件放在 y=0 之後
只做「太高就壓扁」，⛔ **不會重新座地**。

> ⭐ **2026-08-19 更新（GH#386 ③）**：`decor[].y` 已經補上（見五之③）。
> ⚠️ 但這**不會**讓上面的正規化變成多餘 —— `y` 的預設是 0，而 `dressArena()`
> 仍然**不會重新座地**：一件 minY = −0.74 的模型填 `y: 0` 照樣陷進地板，
> 只是現在作者「知道要填 0.74」才救得回來。座地留在資產層（一次、可重現、對全部
> 53 件一致），`y` 是給「架在別的東西上面」用的 —— 兩件事，⛔ 不要拿其中一件取代另一件。

⇒ 一件 bbox 最低點是 −0.74 的屋頂，在 GGD 裡**沒有任何辦法**把它拉上來，
它就是會陷進地板 —— 失敗形態①（算出來但畫在地板下），而且**畫面上看起來很正常**，
只是矮了一截。最嚴重的三件：

| 件 | 上游 minY |
|---|---:|
| `crystal-crossroads__Crystal_Cluster` | **-0.798** |
| `tomb-chaser-2__TempleRoof01_Art` | **-0.740** |
| `tomb-chaser-2__TempleRoof02_Art` | **-0.292** |

### ⭐ Provenance 不會因此變弱：整條管線**逐位元組可重現**

```sh
# 1. 重抓上游（下面那張表的「上游 sha256」欄逐件比對）
curl -sSO "https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/<collection>/<Name>.glb"
# 2. 跑同一支正規化
npx tsx tools/scenery-cc0/normalize.ts
# 3. 得到的就是磁碟上這一份（下面那張表的「本地 sha256」欄）
```

**實測（2026-08-18）**：53 件全部重抓 → 53/53 的 sha256 等於下表的「上游」欄；
重抓後跑一次 `normalize.ts` → **53/53 逐位元組等於出貨的那一份**。

```sh
npx tsx tools/scenery-cc0/normalize.ts --check   # 有一件沒座地就回 1（唯讀）
```

---

## 三 · 帳本（一件一列）

上游 URL 一律是 `https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/main/projects/<collection>/<Name>.glb`。
`dy` = 為了座地套用的 Y 位移（`0` = 逐位元組等於上游）。

| 檔名 | collection | 上游名 | 授權 | 抓取日 | 上游 sha256 | dy | 本地 sha256 |
|---|---|---|---|---|---|---:|---|
| `christmas__Fence.glb` | `christmas` | `Fence` | CC0 | 2026-08-18 | `8626e45637365313…` | 0 | `8626e45637365313…` |
| `christmas__Lamp01.glb` | `christmas` | `Lamp01` | CC0 | 2026-08-18 | `8448ea614b6c7c96…` | +0.00498 | `71f333e371d22f80…` |
| `christmas__MiniTree.glb` | `christmas` | `MiniTree` | CC0 | 2026-08-18 | `093732f34ceb2d79…` | -0.00058 | `26b0d9a0711620fe…` |
| `christmas__SnowBall.glb` | `christmas` | `SnowBall` | CC0 | 2026-08-18 | `82f37f0ad89269d0…` | 0 | `82f37f0ad89269d0…` |
| `crystal-crossroads__Column_SmallBroken_01.glb` | `crystal-crossroads` | `Column_SmallBroken_01` | CC0 | 2026-08-18 | `51b4e7f64825388b…` | +0.00048 | `17d0e0dde5d90fba…` |
| `crystal-crossroads__Crystal_Base.glb` | `crystal-crossroads` | `Crystal_Base` | CC0 | 2026-08-18 | `339d9f43c61d2696…` | +0.00196 | `ec64d59025d4e74c…` |
| `crystal-crossroads__Crystal_Cluster.glb` | `crystal-crossroads` | `Crystal_Cluster` | CC0 | 2026-08-18 | `42985985987e549c…` | +0.79777 | `a5f0d790977e850f…` |
| `crystal-crossroads__Crystal_ClusterSurrounded.glb` | `crystal-crossroads` | `Crystal_ClusterSurrounded` | CC0 | 2026-08-18 | `e22bcff71e695892…` | +0.09493 | `9442e89fe524a927…` |
| `crystal-crossroads__Crystal_Small_01.glb` | `crystal-crossroads` | `Crystal_Small_01` | CC0 | 2026-08-18 | `a6aa2ae598d406a0…` | +0.01520 | `178726357efa1cf4…` |
| `crystal-crossroads__Crystal_Small_02.glb` | `crystal-crossroads` | `Crystal_Small_02` | CC0 | 2026-08-18 | `45031babbdd2a80e…` | +0.01091 | `1fd00cd4d9bf4dae…` |
| `crystal-crossroads__Crystal_Small_03.glb` | `crystal-crossroads` | `Crystal_Small_03` | CC0 | 2026-08-18 | `80dee22d0973b038…` | +0.01881 | `d4771d694d31b8cd…` |
| `crystal-crossroads__Crystal_Small_04.glb` | `crystal-crossroads` | `Crystal_Small_04` | CC0 | 2026-08-18 | `14073becde8bbac8…` | +0.01173 | `85c88980a04040e4…` |
| `crystal-crossroads__Platform_Step.glb` | `crystal-crossroads` | `Platform_Step` | CC0 | 2026-08-18 | `2ec120b8554e1ab4…` | +0.00376 | `7004ea03863dbac3…` |
| `crystal-crossroads__Roof_Hole_01.glb` | `crystal-crossroads` | `Roof_Hole_01` | CC0 | 2026-08-18 | `24e4b12adf9b6269…` | 0 | `24e4b12adf9b6269…` |
| `crystal-crossroads__Stairs.glb` | `crystal-crossroads` | `Stairs` | CC0 | 2026-08-18 | `68d5f8bc6c8b6bae…` | -0.02825 | `0e5c7f4be8ab4c6f…` |
| `crystal-crossroads__Vase_Broken.glb` | `crystal-crossroads` | `Vase_Broken` | CC0 | 2026-08-18 | `5c66bf3e2ef124f3…` | +0.00953 | `9fe57d9c5ce522ab…` |
| `crystal-crossroads__Vase_Large.glb` | `crystal-crossroads` | `Vase_Large` | CC0 | 2026-08-18 | `033852560672f188…` | +0.00516 | `697e59a26d7f46c3…` |
| `crystal-crossroads__Wall_Broken_01.glb` | `crystal-crossroads` | `Wall_Broken_01` | CC0 | 2026-08-18 | `a3c806a3e45309fb…` | +0.00047 | `7690409dd3056e85…` |
| `crystal-crossroads__Wall_CornerBroken.glb` | `crystal-crossroads` | `Wall_CornerBroken` | CC0 | 2026-08-18 | `b57a3065c7ddad54…` | +0.00273 | `b180ba769e24edc2…` |
| `crystal-crossroads__Wall_Small_01.glb` | `crystal-crossroads` | `Wall_Small_01` | CC0 | 2026-08-18 | `de69e4c539dc4bd3…` | 0 | `de69e4c539dc4bd3…` |
| `lunar-year__ArchBanner.glb` | `lunar-year` | `ArchBanner` | CC0 | 2026-08-18 | `b51e2aacce001465…` | +0.00439 | `999528dc6d76d8cc…` |
| `lunar-year__Banner.glb` | `lunar-year` | `Banner` | CC0 | 2026-08-18 | `59c95a8ceb44276b…` | 0 | `59c95a8ceb44276b…` |
| `lunar-year__Bell.glb` | `lunar-year` | `Bell` | CC0 | 2026-08-18 | `7ae9b08b6bc805a4…` | 0 | `7ae9b08b6bc805a4…` |
| `lunar-year__BellStructure.glb` | `lunar-year` | `BellStructure` | CC0 | 2026-08-18 | `a006137aafe5c41c…` | 0 | `a006137aafe5c41c…` |
| `lunar-year__Column.glb` | `lunar-year` | `Column` | CC0 | 2026-08-18 | `1a3f75f96f4d7eb3…` | 0 | `1a3f75f96f4d7eb3…` |
| `lunar-year__ColumnBase.glb` | `lunar-year` | `ColumnBase` | CC0 | 2026-08-18 | `81bdf1119b9d796a…` | 0 | `81bdf1119b9d796a…` |
| `lunar-year__Door.glb` | `lunar-year` | `Door` | CC0 | 2026-08-18 | `ac3ab7bcf2948dbe…` | +0.00773 | `b352c5e22a853a60…` |
| `lunar-year__EntranceStairs.glb` | `lunar-year` | `EntranceStairs` | CC0 | 2026-08-18 | `9cbcb8ac02647c51…` | +0.00340 | `f18bf6255443908d…` |
| `lunar-year__Fence01.glb` | `lunar-year` | `Fence01` | CC0 | 2026-08-18 | `5753df9cb943dea1…` | 0 | `5753df9cb943dea1…` |
| `lunar-year__Fence02.glb` | `lunar-year` | `Fence02` | CC0 | 2026-08-18 | `1347c186044e831d…` | +0.00426 | `8a8c823ff8b4220e…` |
| `lunar-year__Lamp01.glb` | `lunar-year` | `Lamp01` | CC0 | 2026-08-18 | `289340f16d545bf2…` | -0.00729 | `baac0528aa71931f…` |
| `lunar-year__Lamp02.glb` | `lunar-year` | `Lamp02` | CC0 | 2026-08-18 | `11f7480a1ae67d68…` | -0.00227 | `90ffe422ae6d7405…` |
| `lunar-year__Lamp03.glb` | `lunar-year` | `Lamp03` | CC0 | 2026-08-18 | `c2a340dfe8310315…` | +0.00054 | `eef3f470f4561ebc…` |
| `lunar-year__Lamp04.glb` | `lunar-year` | `Lamp04` | CC0 | 2026-08-18 | `109693d5fca2ae8e…` | +0.00085 | `06d6b26e81e50bfd…` |
| `lunar-year__LampWreath.glb` | `lunar-year` | `LampWreath` | CC0 | 2026-08-18 | `3319dc59c7621b3b…` | -0.00090 | `0c311f569210f322…` |
| `lunar-year__MainAltar.glb` | `lunar-year` | `MainAltar` | CC0 | 2026-08-18 | `d7ff0041eeb17380…` | +0.00105 | `98325c2cb49bd922…` |
| `lunar-year__OutterLamp.glb` | `lunar-year` | `OutterLamp` | CC0 | 2026-08-18 | `f165973aa6257ff8…` | 0 | `f165973aa6257ff8…` |
| `lunar-year__Rock01.glb` | `lunar-year` | `Rock01` | CC0 | 2026-08-18 | `a28580bcdecd251d…` | +0.00154 | `e83c46082d3fdd4e…` |
| `lunar-year__Rock02.glb` | `lunar-year` | `Rock02` | CC0 | 2026-08-18 | `ae0d7768f6f82851…` | +0.01376 | `f5e99a09dd1f6300…` |
| `lunar-year__RoomDoor.glb` | `lunar-year` | `RoomDoor` | CC0 | 2026-08-18 | `7dfdc13c310eb7c3…` | -0.00083 | `61d0203635ba37db…` |
| `lunar-year__RoomRoof.glb` | `lunar-year` | `RoomRoof` | CC0 | 2026-08-18 | `02e3b7676aaefc82…` | +0.00001 | `1fcc05b898878b2d…` |
| `medieval-fair__Fair_Flags_Line.glb` | `medieval-fair` | `Fair_Flags_Line` | CC0 | 2026-08-18 | `4029b96a1c00b726…` | 0 | `4029b96a1c00b726…` |
| `medieval-fair__Lamp.glb` | `medieval-fair` | `Lamp` | CC0 | 2026-08-18 | `fa3b52daa6cd78b1…` | 0 | `fa3b52daa6cd78b1…` |
| `medieval-fair__Roof.glb` | `medieval-fair` | `Roof` | CC0 | 2026-08-18 | `9a60bf32ad88f1bd…` | +0.00307 | `7461f82a9405d3d7…` |
| `tomb-chaser-2__Column01_Art.glb` | `tomb-chaser-2` | `Column01_Art` | CC0 | 2026-08-18 | `e0fa2b611a8ebfe2…` | 0 | `e0fa2b611a8ebfe2…` |
| `tomb-chaser-2__Rock01_Art.glb` | `tomb-chaser-2` | `Rock01_Art` | CC0 | 2026-08-18 | `a83601b3b3b0edc8…` | 0 | `a83601b3b3b0edc8…` |
| `tomb-chaser-2__Shrine_Art.glb` | `tomb-chaser-2` | `Shrine_Art` | CC0 | 2026-08-18 | `bc81fcbcb3fb0ee9…` | 0 | `bc81fcbcb3fb0ee9…` |
| `tomb-chaser-2__TempleBaseStaircase_Art.glb` | `tomb-chaser-2` | `TempleBaseStaircase_Art` | CC0 | 2026-08-18 | `0663bbc3daed421b…` | +0.00000 | `01ef07721273657e…` |
| `tomb-chaser-2__TempleBeam01_Art.glb` | `tomb-chaser-2` | `TempleBeam01_Art` | CC0 | 2026-08-18 | `87b70db7715a5b44…` | 0 | `87b70db7715a5b44…` |
| `tomb-chaser-2__TempleColumn_Art.glb` | `tomb-chaser-2` | `TempleColumn_Art` | CC0 | 2026-08-18 | `c2acdcc5ed025dee…` | 0 | `c2acdcc5ed025dee…` |
| `tomb-chaser-2__TempleRoof01_Art.glb` | `tomb-chaser-2` | `TempleRoof01_Art` | CC0 | 2026-08-18 | `f93fbd16651ffb0b…` | +0.73965 | `2036448f9d96e986…` |
| `tomb-chaser-2__TempleRoof02_Art.glb` | `tomb-chaser-2` | `TempleRoof02_Art` | CC0 | 2026-08-18 | `bd380d3d512ebc3f…` | +0.29211 | `3cf1d8c49ce05657…` |
| `tomb-chaser-2__TempleWall01_Art.glb` | `tomb-chaser-2` | `TempleWall01_Art` | CC0 | 2026-08-18 | `ab0977891be90876…` | 0 | `ab0977891be90876…` |

<details><summary>完整 sha256（64 字，逐件）</summary>

```
christmas__Fence.glb
  upstream 8626e45637365313c1bc24b4ac542664a00a16d3219cb02f7a09dff61e6563a8
  local    8626e45637365313c1bc24b4ac542664a00a16d3219cb02f7a09dff61e6563a8
christmas__Lamp01.glb
  upstream 8448ea614b6c7c9682f2fae8357f4c56af11cea18bca0ec40ab0975683f539e4
  local    71f333e371d22f80988ec61f840d3080c3ac9c1ba7e720d75c9c68e3e539c2c5
christmas__MiniTree.glb
  upstream 093732f34ceb2d7921917dc7dafc2ae9b763a55d943be91b9b3d79aa563c788f
  local    26b0d9a0711620febeec12d69f58e6b29f95b742fac83fa0fcb4701fb1c3a408
christmas__SnowBall.glb
  upstream 82f37f0ad89269d0054cddd95cb0aeddc7317d2740c5ddc4b846938f4a20559b
  local    82f37f0ad89269d0054cddd95cb0aeddc7317d2740c5ddc4b846938f4a20559b
crystal-crossroads__Column_SmallBroken_01.glb
  upstream 51b4e7f64825388bf32d68b8356237474717e6aa8caf0e2c44620a93c137920f
  local    17d0e0dde5d90fba8ae555c33373cf8ec798acc4391b19f6a46014c388924084
crystal-crossroads__Crystal_Base.glb
  upstream 339d9f43c61d26964cdcfef6900347ade436f9f3c8634b67eae6fef2b268594c
  local    ec64d59025d4e74ce593d4317157d1b12025845b165d7b3fe5be7e9d354985fe
crystal-crossroads__Crystal_Cluster.glb
  upstream 42985985987e549c126b6b4b57c0e504ef5109cdc4f566ecb08752f671377bdc
  local    a5f0d790977e850ffb52e62a3868efbe8486f7f997320edfaba86a6ca0bd14b5
crystal-crossroads__Crystal_ClusterSurrounded.glb
  upstream e22bcff71e695892a34b66f3cf78eab5cc96ae144045224d727657753734dd2b
  local    9442e89fe524a9279783e0b37cae8a356ccad33dcc7cc2529c6339f57acfadda
crystal-crossroads__Crystal_Small_01.glb
  upstream a6aa2ae598d406a0ced9c294e7040afc1440b8d405210c924fae00762e1f9ca6
  local    178726357efa1cf47eaa12ee5757cb795eae9fe48e1a90db0372780fb6e53081
crystal-crossroads__Crystal_Small_02.glb
  upstream 45031babbdd2a80e809c7022f82c294c5f60dd8d10a4b1b6974c817eeefff6b3
  local    1fd00cd4d9bf4daec005546d4204aba5e4b2727ad1153aad686f8286cc0f5a2b
crystal-crossroads__Crystal_Small_03.glb
  upstream 80dee22d0973b03853c99855db5e09a1cfc3f02e3ef3bb137fdab1f798f53af8
  local    d4771d694d31b8cd7277c1ae20e3c1a2476b67bcef566626ec84c443eee1e19b
crystal-crossroads__Crystal_Small_04.glb
  upstream 14073becde8bbac8264481b582693ff90737200a34463403271c584d9ec4d9aa
  local    85c88980a04040e4e82d84bbd926a84caffd3f64c2354cca3bc726cd57df8e94
crystal-crossroads__Platform_Step.glb
  upstream 2ec120b8554e1ab405ef82e58bbc524359fd947cd17750997124f0946dd9bc87
  local    7004ea03863dbac30eca3bee5a7b37098bb9450198599144c288bd249e4ecf4e
crystal-crossroads__Roof_Hole_01.glb
  upstream 24e4b12adf9b6269895932e7edda94534aa84dd350eb027d958f0f77be3a0256
  local    24e4b12adf9b6269895932e7edda94534aa84dd350eb027d958f0f77be3a0256
crystal-crossroads__Stairs.glb
  upstream 68d5f8bc6c8b6baeed3ebc347f57914ada57e5dc2861f5e4a8b0aa645e1ded5f
  local    0e5c7f4be8ab4c6fca8d9dc4924a6d70f30137d94f2263949d70c142e016b30b
crystal-crossroads__Vase_Broken.glb
  upstream 5c66bf3e2ef124f333fbfeccb673fe41a6d499b0894aef4b14cd485ac0c0ce48
  local    9fe57d9c5ce522abc3008f57a9793ea32a792b857db9a4f3a4e817b8b6176042
crystal-crossroads__Vase_Large.glb
  upstream 033852560672f188794d548286a3fbb49fec74632777ca427a8af07d4663a25e
  local    697e59a26d7f46c33ddaf83aed5335eef77225f2f328bcb13373c3c2e6832fe2
crystal-crossroads__Wall_Broken_01.glb
  upstream a3c806a3e45309fb5e9fb4fc0c0307619730858a1da98dc6e5e3776eeb724071
  local    7690409dd3056e85159e5820f69067389940b995074214085480be27d3749b8f
crystal-crossroads__Wall_CornerBroken.glb
  upstream b57a3065c7ddad54b41d931e024c480a7cb01ffec1038389fbd473eec970a48c
  local    b180ba769e24edc2ea235dd03008d0d6b5cfe38dce4535865cd2c1d4deb1b8b2
crystal-crossroads__Wall_Small_01.glb
  upstream de69e4c539dc4bd31874b12d908c286a0dab1897bc4ebe7b1aa4c50f2502dc03
  local    de69e4c539dc4bd31874b12d908c286a0dab1897bc4ebe7b1aa4c50f2502dc03
lunar-year__ArchBanner.glb
  upstream b51e2aacce0014655cb9c6b6c10d53cb41a6a11b910d378d9c83113aab151187
  local    999528dc6d76d8ccbb1a4996abcec2f1454f5c44757fac4ca251a2a4e46a8aad
lunar-year__Banner.glb
  upstream 59c95a8ceb44276b07efa63ee0172bbcf3ce66f360fc41c63957ef8d9751ebae
  local    59c95a8ceb44276b07efa63ee0172bbcf3ce66f360fc41c63957ef8d9751ebae
lunar-year__Bell.glb
  upstream 7ae9b08b6bc805a495e984b31b6282e4cf590ea2f883e975f7befa3c9911e4b2
  local    7ae9b08b6bc805a495e984b31b6282e4cf590ea2f883e975f7befa3c9911e4b2
lunar-year__BellStructure.glb
  upstream a006137aafe5c41cae1a18f3ce87b80c108d9945178ad0a51c9b6af6aab52692
  local    a006137aafe5c41cae1a18f3ce87b80c108d9945178ad0a51c9b6af6aab52692
lunar-year__Column.glb
  upstream 1a3f75f96f4d7eb35b322210eaa4cc953b04663fb7ce1a8e92770e53a2c60865
  local    1a3f75f96f4d7eb35b322210eaa4cc953b04663fb7ce1a8e92770e53a2c60865
lunar-year__ColumnBase.glb
  upstream 81bdf1119b9d796a08c8b30673672c20d79fabd0170bbbf99e02e08d2804c293
  local    81bdf1119b9d796a08c8b30673672c20d79fabd0170bbbf99e02e08d2804c293
lunar-year__Door.glb
  upstream ac3ab7bcf2948dbef738f9b7299c8a4c914cb833817986a4d25d97edc389fac2
  local    b352c5e22a853a6088a044e96020e861471ade6c9ea2a5dfeebc86550aa9b813
lunar-year__EntranceStairs.glb
  upstream 9cbcb8ac02647c510655a95fa906e854430b46cd13800cfe3e92e906d3c27ff4
  local    f18bf6255443908d66de6cca6ce44643d6f717b8b0b402dd43e918c3846b8504
lunar-year__Fence01.glb
  upstream 5753df9cb943dea1411c317c6b1547fc1d856382ff4ada5bbbe0ebcad7f19f24
  local    5753df9cb943dea1411c317c6b1547fc1d856382ff4ada5bbbe0ebcad7f19f24
lunar-year__Fence02.glb
  upstream 1347c186044e831d0f718e5d494a4fba567ed5f17f4966a0b4fa863c05872791
  local    8a8c823ff8b4220e4378594a3aca37973e35e6007979481795fbacfc42208391
lunar-year__Lamp01.glb
  upstream 289340f16d545bf2ec550eeb1cc6c27a1177f1e92f44d0c161576e15b086a89b
  local    baac0528aa71931f8ae0efc3c56068e8bfceba1b8e51eefbb38c32680199c7b0
lunar-year__Lamp02.glb
  upstream 11f7480a1ae67d6810ad2594972311effd6cea0738ab1f83217348ae84621d62
  local    90ffe422ae6d7405e79233414685ed73b046ae0d12412d6b9d86ce10f6ca7c9f
lunar-year__Lamp03.glb
  upstream c2a340dfe83103155383cd83ed08ad3271cd54247226db2399bbce84b45a7558
  local    eef3f470f4561ebcae125c1907fc2da0044de838bb3ec3eb9c0cf0f5f641e6aa
lunar-year__Lamp04.glb
  upstream 109693d5fca2ae8eb98ed0cf5729f1e65fb6d1c9dc401518851f3bd0f1f7efcb
  local    06d6b26e81e50bfd68b8816a89108ac776f59b6b7636946616845f6cab45b087
lunar-year__LampWreath.glb
  upstream 3319dc59c7621b3bf649036356cbe199e64f0d4fed0497ecb502c4f77f5ecabc
  local    0c311f569210f322518f19da7999512bf8e02521b80a3f622dd564391bc24f7e
lunar-year__MainAltar.glb
  upstream d7ff0041eeb17380aec080e8ab52a075cba4578119ac65d7a58c353ad178da12
  local    98325c2cb49bd9220e3e610da1e7831c1aeeec9114acf8d35ddce253bd1e79dd
lunar-year__OutterLamp.glb
  upstream f165973aa6257ff8febbeb9c1ec96fa5704c60918410d49b73cf8bdf7804d7ad
  local    f165973aa6257ff8febbeb9c1ec96fa5704c60918410d49b73cf8bdf7804d7ad
lunar-year__Rock01.glb
  upstream a28580bcdecd251d6ef12400f73499040b50ab1d9f378d7935332c8cfd9b48ba
  local    e83c46082d3fdd4e0e8caa33eacd96209217fb6f4ff5b168455979d275a06ac1
lunar-year__Rock02.glb
  upstream ae0d7768f6f8285137d866802b737a638f5eab2083513c054ae2a9550fc05348
  local    f5e99a09dd1f630095307f0471cd3222f2ef01307c4eede59d28fb21e535fd31
lunar-year__RoomDoor.glb
  upstream 7dfdc13c310eb7c3b58d22c204dbfaa11ee90b37835e6428a6570c8e624732c8
  local    61d0203635ba37db1a7a3ad0f2f7ead90d10a1f959c2102c2358530e43ce51cd
lunar-year__RoomRoof.glb
  upstream 02e3b7676aaefc82c2c318647aedea31d83e845e5c966c040b864118bf1834c7
  local    1fcc05b898878b2d054258c5349e6e2e8c788ac4a0c46ca63f1540fb1b300135
medieval-fair__Fair_Flags_Line.glb
  upstream 4029b96a1c00b726ed90fa05f022c63f25f6f39841050f16e8ae5f95c2b336f6
  local    4029b96a1c00b726ed90fa05f022c63f25f6f39841050f16e8ae5f95c2b336f6
medieval-fair__Lamp.glb
  upstream fa3b52daa6cd78b12007f151d0ccf65a9af855cced148231e904b979e463b3dc
  local    fa3b52daa6cd78b12007f151d0ccf65a9af855cced148231e904b979e463b3dc
medieval-fair__Roof.glb
  upstream 9a60bf32ad88f1bdf907d4be7fb454782d029510e096e49c103c1ba23fd8289e
  local    7461f82a9405d3d743c12d9f974007c2dff37285da456186f9cf89dbe60d091b
tomb-chaser-2__Column01_Art.glb
  upstream e0fa2b611a8ebfe2d42fe661d10371f9bb91764caba200415bbca4cf12d432b6
  local    e0fa2b611a8ebfe2d42fe661d10371f9bb91764caba200415bbca4cf12d432b6
tomb-chaser-2__Rock01_Art.glb
  upstream a83601b3b3b0edc8f36061ff166ba4604a288c98e27399ef78a1159fdbaff22a
  local    a83601b3b3b0edc8f36061ff166ba4604a288c98e27399ef78a1159fdbaff22a
tomb-chaser-2__Shrine_Art.glb
  upstream bc81fcbcb3fb0ee94e9307440d616c5d6bd44cdf445fc8a32ca98f9e1fb02121
  local    bc81fcbcb3fb0ee94e9307440d616c5d6bd44cdf445fc8a32ca98f9e1fb02121
tomb-chaser-2__TempleBaseStaircase_Art.glb
  upstream 0663bbc3daed421b9c59db7f29920f88ff392cf58430f690ea6655db98e351e2
  local    01ef07721273657e43d03e883d3a380188934027afe8a1deef6214a2d3485382
tomb-chaser-2__TempleBeam01_Art.glb
  upstream 87b70db7715a5b4457dce7a4df847db699f7f377ad90e11fb0b91db928740258
  local    87b70db7715a5b4457dce7a4df847db699f7f377ad90e11fb0b91db928740258
tomb-chaser-2__TempleColumn_Art.glb
  upstream c2acdcc5ed025dee6c99105fae5a21a3e34ccbfd6350aeb5e38a52c7afde8f53
  local    c2acdcc5ed025dee6c99105fae5a21a3e34ccbfd6350aeb5e38a52c7afde8f53
tomb-chaser-2__TempleRoof01_Art.glb
  upstream f93fbd16651ffb0b70fafecfed9eda781f74f59849d4611993545e4c4c057a69
  local    2036448f9d96e986046950483c1a6da576089978ed95c4c12ba6ca597620a70b
tomb-chaser-2__TempleRoof02_Art.glb
  upstream bd380d3d512ebc3ff510a7c9f9cd66b9601ecf1dd89d1f43fb678be2953dc69e
  local    3cf1d8c49ce05657b809ae02c2a73fdf183e9bc75ac5787658c5bb5b4dbf40b1
tomb-chaser-2__TempleWall01_Art.glb
  upstream ab0977891be90876f73824cf9e4a92b5cd8d5824a8a55af9e187de40a082c803
  local    ab0977891be90876f73824cf9e4a92b5cd8d5824a8a55af9e187de40a082c803
```

</details>

---

## 四 · 量測與整合（一件一列）

量尺是**現成的**：`tools/model-budget`（`budget:guard --role arena-decor`）出三角面／
draw call／貼圖邊長，bbox 由 `normalize.ts::worldBox()` 走節點階層算出（accessor 的
min/max 是**區域座標**，這些模型帶節點 TRS，⛔ 直接讀 accessor 會錯）。

| 欄 | 意思 |
|---|---|
| **面** | 三角面數（閘：warn 4,000 / limit 8,000，與 `arena-decor` 一字不差）|
| **DC** | draw call = 節點×primitive，每個材質一個（閘：`arena-decor-cc0` 的 **warn 3 / limit 6**，見五之①）|
| **材** | 材質數 |
| **bbox** | 寬 × **高** × 深（u），scale 1.0 時。最低點已經是 y=0 |
| **scale** | 建議寫進 `decor[].scale` 的值 |
| **@scale** | 套用後的高度。⚠️ 2.4u = `ArenaScene.SIGHTLINE_HEIGHT_CAP` |
| **級** | **A** 場內可放（≤2.4u）· **B** 只放圈外／邊緣（含**架高**，見五之③）· **C** ⛔ 不建議 |

| 檔名 | 面 | KB | DC | 材 | bbox (w×h×d) | scale | @scale | 級 | 說明 |
|---|---:|---:|---:|---:|---|---:|---:|:-:|---|
| `christmas__Fence` | 6 | 44 | 1 | 1 | 3.14×**1.48**×0.65 | 1.00 | 1.48 | A | ⭐ 3.1×1.48u 圍欄，**6 面 / 44 KB** —— 全批最便宜 |
| `christmas__Lamp01` | 262 | 155 | 2 | 2 | 0.74×**3.46**×0.64 | 0.64 | 2.21 | A | 路燈。1.0 是 3.46u；0.64 → 2.21u |
| `christmas__MiniTree` | 24 | 113 | 1 | 1 | 0.73×**0.83**×0.11 | 1.00 | 0.83 | A | 小樹，0.83u（近乎平面，24 面） |
| `christmas__SnowBall` | 204 | 119 | 1 | 1 | 0.42×**0.45**×0.42 | 1.00 | 0.45 | A | 雪球，0.45u |
| `crystal-crossroads__Column_SmallBroken_01` | 564 | 328 | 3 | 3 | 1.01×**1.83**×1.01 | 1.00 | 1.83 | A | 斷柱，1.83u |
| `crystal-crossroads__Crystal_Base` | 352 | 23 | 2 | 2 | 5.33×**1.43**×4.84 | 1.00 | 1.43 | A | ⭐ 5.3×4.8u 水晶基座台，1.43u 高 **只有 24 KB** —— 全批 CP 值第一 |
| `crystal-crossroads__Crystal_Cluster` | 3540 | 258 | 2 | 2 | 6.23×**15.47**×6.75 | 0.14 | 2.17 | A | ⭐ 大水晶叢。1.0 是 15.47u；0.14 → 2.17u。3,540 面（全批最重） |
| `crystal-crossroads__Crystal_ClusterSurrounded` | 2950 | 233 | 2 | 2 | 8.04×**14.74**×7.51 | 0.15 | 2.21 | A | 帶基座的水晶叢。1.0 是 14.74u；0.15 → 2.21u |
| `crystal-crossroads__Crystal_Small_01` | 314 | 127 | 2 | 2 | 1.09×**4.74**×1.72 | 0.46 | 2.18 | A | 水晶柱。1.0 是 4.74u；0.46 → 2.18u |
| `crystal-crossroads__Crystal_Small_02` | 284 | 128 | 2 | 2 | 1.13×**3.20**×0.96 | 0.69 | 2.21 | A | 水晶。1.0 是 3.20u；0.69 → 2.21u |
| `crystal-crossroads__Crystal_Small_03` | 284 | 128 | 2 | 2 | 1.23×**1.91**×1.05 | 1.00 | 1.91 | A | 小水晶，1.91u |
| `crystal-crossroads__Crystal_Small_04` | 284 | 128 | 2 | 2 | 0.69×**2.73**×0.68 | 0.80 | 2.19 | A | 水晶。1.0 是 2.73u；0.80 → 2.19u |
| `crystal-crossroads__Platform_Step` | 74 | 301 | 3 | 3 | 2.34×**0.20**×0.66 | 1.00 | 0.20 | A | 踏階，0.20u |
| `crystal-crossroads__Roof_Hole_01` | 2692 | 508 | 4 | 4 | 9.85×**1.28**×5.72 | 1.00 | 1.28 | B | 9.8×5.7u 的破頂平板，1.28u 薄 —— 貼地當殘骸也成立 |
| `crystal-crossroads__Stairs` | 916 | 348 | 3 | 3 | 6.25×**7.72**×3.22 | 0.28 | 2.16 | A | 階梯。1.0 是 7.72u；0.28 → 2.16u。⭐ 或 1.0 放圈外 |
| `crystal-crossroads__Vase_Broken` | 2539 | 409 | 3 | 3 | 2.33×**1.04**×2.34 | 1.00 | 1.04 | A | 破甕，1.04u。⚠️ 2,539 面 —— 這一系列最重的地面件 |
| `crystal-crossroads__Vase_Large` | 1672 | 366 | 3 | 3 | 1.40×**2.15**×0.82 | 1.00 | 2.15 | A | 大甕，2.15u |
| `crystal-crossroads__Wall_Broken_01` | 368 | 318 | 3 | 3 | 4.04×**3.51**×0.46 | 0.63 | 2.21 | A | 破牆。1.0 是 3.51u；0.63 → 2.21u |
| `crystal-crossroads__Wall_CornerBroken` | 124 | 304 | 3 | 3 | 1.84×**0.33**×1.91 | 1.00 | 0.33 | A | 牆角殘骸，0.33u |
| `crystal-crossroads__Wall_Small_01` | 148 | 306 | 3 | 3 | 4.04×**1.26**×0.46 | 1.00 | 1.26 | A | 矮牆，4.0u 寬 × 1.26u |
| `lunar-year__ArchBanner` | 112 | 761 | 3 | 3 | 5.20×**5.13**×0.59 | 1.00 | 5.13 | B | 5.13u 拱門幡 —— 當入場門 |
| `lunar-year__Banner` | 276 | 985 | 3 | 3 | 2.09×**3.27**×0.08 | 0.67 | 2.19 | A | 直幡。1.0 是 3.27u；0.67 → 2.19u |
| `lunar-year__Bell` | 132 | 837 | 2 | 2 | 1.05×**2.34**×1.05 | 1.00 | 2.34 | A | 梵鐘 |
| `lunar-year__BellStructure` | 240 | 1207 | 3 | 3 | 3.69×**3.41**×0.78 | 0.64 | 2.18 | A | 鐘樓架。scale 1.0 是 3.41u，會被壓扁；0.64 → 2.18u |
| `lunar-year__Column` | 144 | 1122 | 3 | 3 | 1.49×**6.58**×1.49 | 1.00 | 6.58 | B | 6.58u 廊柱。⭐ 配 ColumnBase 當外圈列柱 |
| `lunar-year__ColumnBase` | 120 | 341 | 1 | 1 | 1.95×**0.21**×1.95 | 1.00 | 0.21 | A | 柱礎，0.21u。單放也是不錯的矮台 |
| `lunar-year__Door` | 252 | 1129 | 3 | 3 | 6.72×**5.68**×0.96 | 1.00 | 5.68 | B | 5.68u 山門 |
| `lunar-year__EntranceStairs` | 136 | 711 | 2 | 2 | 4.03×**1.82**×4.57 | 1.00 | 1.82 | A | 入口石階，1.82u |
| `lunar-year__Fence01` | 108 | 1122 | 3 | 3 | 6.11×**1.86**×0.58 | 1.00 | 1.86 | A | 6.1u 一段圍欄，1.86u 高 |
| `lunar-year__Fence02` | 498 | 1140 | 3 | 3 | 15.46×**1.86**×22.76 | 1.00 | 1.86 | B | ⚠️ 15.5×22.8u ——**整圈**院牆不是一段。一張圖放 1 件當外圍 |
| `lunar-year__Lamp01` | 194 | 464 | 2 | 2 | 1.28×**1.85**×1.10 | 1.00 | 1.85 | A | 石燈籠。真實尺度即 1.85u，正好一個英雄高 |
| `lunar-year__Lamp02` | 197 | 464 | 2 | 2 | 1.28×**1.85**×1.09 | 1.00 | 1.85 | A | 同 Lamp01 的另一款 |
| `lunar-year__Lamp03` | 221 | 461 | 2 | 2 | 1.40×**1.78**×1.27 | 1.00 | 1.78 | A | 同上，較寬 |
| `lunar-year__Lamp04` | 221 | 461 | 2 | 2 | 1.40×**1.78**×1.27 | 1.00 | 1.78 | A | 同上，較寬 |
| `lunar-year__LampWreath` | 625 | 893 | 3 | 3 | 6.66×**2.15**×0.82 | 1.00 | 2.15 | A | 燈籠花環，6.7u 寬 —— 當一整段掛飾用，不要密排 |
| `lunar-year__MainAltar` | 86 | 1537 | 4 | 4 | 2.92×**1.24**×2.08 | 1.00 | 1.24 | A | 主祭壇，1.24u。⭐ 場中央的焦點物件 |
| `lunar-year__OutterLamp` | 578 | 772 | 2 | 2 | 1.75×**2.35**×1.66 | 1.00 | 2.35 | A | 外庭燈，2.34u 剛好卡在 2.4 上限下 |
| `lunar-year__Rock01` | 30 | 364 | 1 | 1 | 1.16×**0.48**×1.08 | 1.00 | 0.48 | A | 小石，0.48u |
| `lunar-year__Rock02` | 90 | 366 | 1 | 1 | 1.81×**0.92**×1.68 | 1.00 | 0.92 | A | 中石，0.92u |
| `lunar-year__RoomDoor` | 156 | 709 | 2 | 2 | 10.79×**7.88**×0.15 | 1.00 | 7.88 | B | 10.8×7.9×0.15u 的**平板**牆面 —— 當立面背板用，正面朝內 |
| `lunar-year__RoomRoof` | 92 | 780 | 2 | 2 | 10.79×**0.15**×16.03 | 1.00 | 0.15 | B | 10.8×16.0×0.15u 的天花板平板。⭐ 五之③ 補上 `decor[].y` 之後可用：架在圈外的牆／柱上當屋簷 |
| `medieval-fair__Fair_Flags_Line` | 1268 | 1986 | 4 | 3 | 19.64×**7.13**×0.79 | 1.00 | 7.13 | B | 19.6u 長的萬國旗串（含旗桿），7.13u 高。一張圖 1–2 件 |
| `medieval-fair__Lamp` | 733 | 597 | 3 | 3 | 7.20×**4.98**×7.21 | 0.44 | 2.19 | A | 四頭燈柱。1.0 是 4.98u；0.44 → 2.19u |
| `medieval-fair__Roof` | 2962 | 1794 | 6 | 5 | 41.80×**25.08**×40.82 | 1.00 | 25.08 | C | ⛔ **仍是 C**（跟 y 無關）：41.8×25.1×40.8u 的整座市集棚頂比整張場地還大，6 draw call / 1.75 MB |
| `tomb-chaser-2__Column01_Art` | 192 | 211 | 1 | 1 | 1.64×**4.31**×1.64 | 0.51 | 2.20 | A | 斷柱。1.0 是 4.31u；0.51 → 2.20u |
| `tomb-chaser-2__Rock01_Art` | 30 | 624 | 1 | 1 | 0.45×**0.04**×0.43 | 1.00 | 0.04 | C | ⛔ **仍是 C**（跟 y 無關）：0.45×0.043u 的地面小石 —— 625 KB 換一顆 4 公分的石頭 |
| `tomb-chaser-2__Shrine_Art` | 186 | 633 | 1 | 1 | 1.94×**3.56**×1.44 | 0.62 | 2.21 | A | 神龕。1.0 是 3.56u；0.62 → 2.21u |
| `tomb-chaser-2__TempleBaseStaircase_Art` | 106 | 1175 | 2 | 2 | 8.00×**4.50**×10.17 | 0.49 | 2.21 | A | 階梯基座。1.0 是 4.5u；0.49 → 2.21u。⭐ 或 1.0 放圈外 |
| `tomb-chaser-2__TempleBeam01_Art` | 30 | 671 | 1 | 1 | 8.00×**0.74**×0.23 | 1.00 | 0.74 | B | 8u 橫梁（30 面、單 DC）。⭐ 五之③ 之後可用：`y` 架上柱頂當楣樑，⚠️ 671 KB（整張 atlas 跟著走）所以一張圖用它就別再用同系列的另一件 |
| `tomb-chaser-2__TempleColumn_Art` | 42 | 671 | 1 | 1 | 1.21×**7.00**×1.21 | 1.00 | 7.00 | B | 7.0u 神廟柱。⭐ 外圈列柱首選（42 面、單 draw call） |
| `tomb-chaser-2__TempleRoof01_Art` | 26 | 1838 | 4 | 4 | 8.00×**4.03**×8.65 | 1.00 | 4.03 | B | 屋頂構件：設計上要架在柱頂 —— 五之③ 補上 `decor[].y` 之後**正是這件事**。4 draw call / 1.8 MB，配 `TempleColumn_Art` 用 |
| `tomb-chaser-2__TempleRoof02_Art` | 20 | 1338 | 3 | 3 | 8.00×**10.27**×14.05 | 1.00 | 10.27 | B | 同上（8×10.3×14.0u）——⚠️ 只放圈外：這個體積壓在打鬥區上空會被視線上限整個壓回地面 |
| `tomb-chaser-2__TempleWall01_Art` | 2 | 427 | 1 | 1 | 8.00×**7.00**×0.00 | 1.00 | 7.00 | B | ⭐ 8×7u 的**2 面**平板牆，427 KB、單 draw call —— 外圈立面 CP 值最高的一件 |

---

## 五 · 三件待裁決的事 —— **owner 2026-08-19 核准，三條全部落地**（GH#386）

> 底下保留每一條原本的診斷（那是**為什麼**），並在後面接上**做了什麼**。
> ⛔ 不要把診斷刪掉改寫成結論：下一輪要看的是這個決定當初面對的是什麼。

### ① draw call：原本 **23 件 OVER，18 件 WARN**，只有 12 件乾淨 → 現在 **0 OVER**

`arena-decor` 閘是 `meshes: warn 1, limit 2`，理由寫在 `tools/model-budget/limits.ts`：
一件擺設會被放 50 份（現已修正為量到的 78 份），所以單件不得吃掉超過 1/4 的 mesh 額度。

**這批的 draw call 不是「多個 mesh」，是「一個 mesh 多個 primitive，每個材質一個」** ——
Babylon 對每個 primitive 開一個 mesh，所以 **draw call ≈ 材質數**。實際成因有兩種：

| 成因 | 誰 | 例 |
|---|---|---|
| **trim sheet 分材質** | `lunar-year` 全系列 | `Column` = `Trim01`/`Trim02`/`Trim03` 三張貼圖 → 3 DC |
| ⚠️ **描邊殼**（`Outliner_Mat`） | `crystal-crossroads` **全系列** | 反面外擴的輪廓線殼 —— 它同時**讓面數翻倍** |

⛔ **沒有合併它們。** 合併材質＝重做貼圖 atlas＝那不是「下載」是「重新製作」，
而且會讓上面那條「BIN 逐位元組不變」的證明整個消失。

**⇒ 採用方案 (b)：`arena-decor-cc0` 一條自己的 gate**（`tools/model-budget/limits.ts`）。

| | 值 | 從哪來 |
|---|---:|---|
| 擺放數（除數） | **10** | 地標不是草。出貨 13 張圖對這批的最大用量是 **8 份**（colosseum 的 `TempleColumn_Art`） |
| draw call | **warn 3 / limit 6** | 跟 `arena-decor` 同一條算術：擺設額度 120 mesh，單件不得超過 1/4（30）→ 30÷10 = 3；硬上限用一半（60）÷10 = 6 |
| 面數 · 貼圖邊長 · 動畫通道 | 4,000/8,000 · 512/1024 · 0/0 | **一字不差沿用 `arena-decor`** —— 10 份而不是 78 份代表同樣的面數便宜 7.8 倍，放寬它沒有理由 |

**結果**：53 件在新閘下 **0 OVER · 5 WARN · 48 OK**（已被 arena 引用的 32 件是 30 OK / 2 WARN），
`tools/model-budget/baseline.json` 因此少掉 **12 筆** 被接受的 draw call 破線（32 → 20）。

⭐ **而「一張圖 10 份」⛔ 不是一句註解 —— 它是一條會紅的線。**
`tools/model-budget/placement.test.ts` 逐張 arena 數出每個模型的擺放數
（手擺的 `decor[]` + 散佈規則的 `count × 分區數`），跟那條 gate 宣告的 `simultaneous` 比。

⚠️ **寫這條守衛的當下就抓到一個過期的假設**：`arena-decor` 的
「godie 放了 50 棵 japanesecherry」在 GH#362 把散佈規則加進來之後其實是 **78 份**
（50 列手擺 + 一條 count 14 的規則 × 2 分區），而 `limits.ts` 的那句話原封不動留著，
**沒有任何東西會紅**。已改成 78，並且現在由同一條守衛守著。

### ② `crystal-crossroads` 的描邊殼 → **一格後台開關**，預設**維持原樣**

全系列帶 `Outliner_Mat`（反面外擴輪廓）。GGD 的英雄是 168 面的平面著色方塊人，
⛔ 沒有描邊。⇒ 這 16 件放進場會**自帶一圈黑邊**，跟旁邊的東西不同調。
這是視覺決定不是缺陷 —— 但它是**量到的**，不是品味：材質名逐字叫 `Outliner_Mat`
（53 件裡剛好 16 件有，逐檔掃過 glTF 的 `materials[].name`）。

⇒ 第一守則：**做成開關，⛔ 不自己挑一個**。

| | |
|---|---|
| 欄位 | `config/ambient-vfx@1` → `scenery.outlineShells`（後台「場地環境」那一頁） |
| 出貨值 | **`true` = 留著** —— 那是今天畫面上真的長的樣子；開關存在是為了能改，⛔ 不是為了觀望 |
| 關掉時 | `dressArena()` 把材質名命中的 **primitive** `setEnabled(false)`，⛔ 不是整件道具（本體必須留著） |
| 順帶 | 那 16 件的 draw call 會少掉大約一半（描邊殼是獨立的一份幾何） |

⚠️ 這一格刻意**沒有**寫進 `content/config/ambient-vfx.json`，用 Zod 的 `.default(true)` 表達 ——
往那個檔案加一把新鑰匙，會被**還沒更新的映像**的 `.strict()` 整份拒絕（2026-08-02 事故的形狀），
而這一格的出貨值就是「今天的樣子」，用預設值表達零風險、零 drift。

### ③ 六件 C 級 → **根因是引擎缺口，不是模型**。`decor[].y` 已經補上，剩 2 件

六件 C 級（`lunar-year__RoomRoof` · `medieval-fair__Roof` ·
`tomb-chaser-2__{Rock01_Art, TempleBeam01_Art, TempleRoof01_Art, TempleRoof02_Art}`）
裡有四件的理由**是同一句話**：屋頂／橫梁／天花板設計上要架在別的東西上面，
而 `zDecor` 沒有 `y` ⇒ 它們只會平躺在地板上。

**查證結果：這個缺口是真的。** `zDecor`（`packages/shared/src/content/schema/arena.ts`）
出貨時逐字只有 `model · x · z · rotQuarter · scale`，而 `dressArena()`
（`apps/client/src/render/ArenaScene.ts`）把每一件 `root.position.set(x, 0, z)` ——
**那個 `0` 是字面值**，沒有任何內容側的槓桿碰得到它。

⇒ **補上 `decor[].y`**（世界單位，預設 0，上下界 −4 … 24），四個地方一起：

| 落點 | 檔 |
|---|---|
| 執行期 schema | `content/schema/arena.ts` 的 `zDecor` |
| 作者端 schema | `content/schema/map.ts` 的 `zProp`（`map@1` → `arena@1` 的來源） |
| 編譯器 | `map/compile.ts` —— ⚠️ `y === 0` 時**整格省略**，所以 13 張圖重新編譯出來逐位元組不變 |
| 渲染 + 編輯器預覽 | `render/ArenaScene.ts` 的 `placeInstance()` · `editor/preview3d/decor.ts` |

⚠️ **架高 ⛔ 不能穿過視線上限。** 壓在打鬥區上空的道具照樣被壓回
`SIGHTLINE_HEIGHT_CAP`（2.4u），而且是**連 `position.y` 一起乘** ——
只縮 `scaling.y` 會讓一個作者填了 `y` 的屋頂靜默地撤銷攝影機保證（#218 的教訓）。
⇒ 架高在**圈外**（列柱、山門、外圈立面）才是完整生效的地方，那也正是這四件的用途。
守衛：`apps/client/src/render/arenaScenery.test.ts` 的「decor 的 y」那一條（兩個方向一起讀）。

**補完之後：4 件從 C 升到 B（圈外架高），剩 2 件仍然是 C，而且理由跟 `y` 無關：**

| 仍是 C | 為什麼（⛔ 不是 y 的問題） |
|---|---|
| `medieval-fair__Roof` | 41.8×25.1×40.8u 的整座市集棚頂，比整張場地還大；1.75 MB / 6 DC。縮到 scale 0.1 才進得了場，那就是花 1.75 MB 買一座小涼亭 |
| `tomb-chaser-2__Rock01_Art` | 0.45×0.043u 的地面小石，625 KB —— 4 公分的石頭不值這個下載量 |

⚠️ **這一版沒有任何 arena 真的填 `y`**（機制上線、內容 0 筆）。刻意的：
`zDecor` 是 `.strict()`，一份帶著 `y` 的 arena 文件會被**還沒更新的映像**整份拒絕 ——
⇒ 要用它的那一版必須是**完整重建映像**的部署，⛔ 不可以 `--content-only`。

### ④ 下載量：33 MB / 53 件，⛔ 面數從來不是問題

三角面**全部在閘內**（最重 3,540 面 < warn 4,000）。體積全部是**貼圖**：
512px（51 件）與 1024px（2 件）的 atlas，而 trim sheet 的每一張材質都帶一張。
扣掉 C 級之後可用的是 **25.6 MB**。

⚠️ **這 33 MB ⛔ 不會一次全載** —— `dressArena()` 只載那張圖 `decor[]` 用到的。
單場的實際下載量 = 那張圖用到的件數 × 平均 0.6 MB。⭐ 一張圖用 8 件 ≈ 5 MB。

---

## 六 · ⛔ 這個目錄不碰 `content/arenas/*.json`

哪張圖放哪幾件的**建議**在 GH#362 的整合表裡。
這裡只負責「檔案在、量過、授權清楚、座地了」。

守衛：`packages/shared/src/ops/sceneryCc0Provenance.test.ts` ——
**雙向**比對這份帳本與磁碟（帳本有的檔案要在、磁碟有的檔案要在帳本裡），
並且真的把 `normalize.ts --check` 跑起來（⛔ 不是掃字串）。

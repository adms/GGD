# MODEL_USAGE — 模型 → 引用點反向索引

`python3 tools/w3x-import/build_model_usage.py`

**673 種模型 / 3682 個引用點**（其中 204 個被作者清空的欄位不算引用，也**擋掉**繼承）

## 依來源

| provenance | 引用點 |
| --- | ---: |
| `jass-literal` | 560 |
| `jass-spawn` | 406 |
| `stock-inherited` | 1274 |
| `w3a-override` | 707 |
| `w3h-override` | 175 |
| `w3u-override` | 560 |

## 依欄位

| channel | 引用點 |
| --- | ---: |
| `ability.areaEffectArt` | 36 |
| `ability.casterArt` | 249 |
| `ability.effectArt` | 101 |
| `ability.missileArt` | 324 |
| `ability.specialArt` | 176 |
| `ability.targetArt` | 375 |
| `buff.effectArt` | 16 |
| `buff.specialArt` | 19 |
| `buff.targetArt` | 197 |
| `jass.AddSpecialEffectLocBJ` | 241 |
| `jass.AddSpecialEffectTargetUnitBJ` | 317 |
| `jass.literal` | 2 |
| `jass.unitSpawn` | 406 |
| `unit.attack1Missile` | 176 |
| `unit.attack2Missile` | 8 |
| `unit.model` | 588 |
| `unit.specialArt` | 451 |

## owner 指定的 21 個家族（33/33 個模型有引用）

### 衝擊波環 `shockwaveRing` — 273 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `warstompcaster` | 150 | 5 種 1.0–5.0 | 4 | chest×19, hand×1, origin×2, overhead×1, weapon×7 |
| `thunderclapcaster` | 123 | 3 種 2.0–3.5 | 2 | body×6, cheat×2, chest×12, hand×1, origin×15, weapon×3 |

### 閃現 `blink` — 118 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `blinktarget` | 89 | 1 種 5.0–5.0 | 1 | origin×1, overhead×75 |
| `blinkcaster` | 29 | — | 0 | chest×4 |

### 爆裂 `burst` — 115 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `stampedemissiledeath` | 42 | 2 種 1.0–3.0 | 2 | chest×15, foot×2, hand×2, head×4 |
| `neutralbuildingexplosion` | 15 | — | 0 | chest×2, origin×1 |
| `steamtankimpact` | 18 | 2 種 1.0–2.0 | 2 | chest×5, origin×1 |
| `abominationexplosion` | 11 | 2 種 0.9–1.1 | 1 | chest×4 |
| `firelorddeathexplode` | 8 | — | 0 | weapon×1 |
| `doomdeath` | 21 | 2 種 2.0–8.0 | 2 | chest×3, right,hand×1 |

### 消散 `dissipate` — 63 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `nagadeath` | 19 | 1 種 1.5–1.5 | 1 | chest×5, weapon×1 |
| `hcanceldeath` | 24 | 4 種 0.7–3.0 | 2 | chest×2, origin×1 |
| `undeaddissipate` | 20 | — | 0 | chest×13, origin×1 |

### 飛彈 `missile` — 43 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `phoenix_missile` | 21 | 1 種 4.0–4.0 | 1 | chest×3, hand,right×2, weapon×5 |
| `ancientprotectormissile` | 22 | 4 種 1.0–10.0 | 2 | weapon×1 |

### 雷擊 `boltStrike` — 42 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `monsoonbolttarget` | 42 | 4 種 2.0–10.0 · 實效 1 種 30.0–30.0 | 3 | chest×5 |

### 龍捲 `tornado` — 32 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `tornadoelemental` | 22 | 4 種 1.0–4.0 · 實效 1 種 7.2–7.2 | 7 | left,hand×1 |
| `tornadoelementalsmall` | 10 | — | 0 | — |

### 地面塵土 `groundDust` — 28 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `impaletargetdust` | 28 | — | 0 | — |

### 火柱 `flamePillar` — 27 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `flamestriketarget` | 27 | 1 種 1.1–1.1 | 1 | — |

### 分身 `mirrorImage` — 25 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `mirrorimagecaster` | 25 | — | 0 | chest×6, origin×1 |

### 復活光 `resurrect` — 25 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `resurrecttarget` | 14 | 1 種 3.0–3.0 | 1 | chest×3, weapon×3 |
| `resurrectcaster` | 11 | 1 種 0.9–0.9 | 1 | origin×1 |

### 印記 `mark` — 24 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `markofchaostarget` | 24 | 2 種 1.0–5.0 · 實效 1 種 2.3–2.3 | 2 | chest×2, origin×1, weapon×5 |

### 書/光柱 `lightColumn` — 19 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `tomeofretrainingcaster` | 19 | 4 種 1.25–6.0 · 實效 1 種 4.375–4.375 | 4 | chest×1 |

### 傳送門 `portal` — 14 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `darkportaltarget` | 14 | 1 種 2.0–2.0 | 1 | weapon×3 |

### 吐息 `breath` — 13 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `bloodbreathstream` | 13 | — | 0 | chest×10, hand×1 |

### 升級光 `levelUp` — 12 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `levelupcaster` | 12 | — | 0 | weapon×3 |

### 未分類（自訂匯入） `uncategorised` — 12 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `boomnl` | 12 | 1 種 1.0–1.0 | 1 | chest×5 |

### 雲 `cloud` — 10 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `herocloudcyd` | 10 | — | 0 | chest×6, weapon×1 |

### 閃光 `shine` — 9 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `supershinythingy` | 9 | — | 0 | chest×3, hand,left×2, hand,right×1, handleft×1, lefthand×1 |

### 血 `blood` — 9 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `herobloodelfblood` | 9 | — | 0 | chest×3, foot×2, hand×2, head×2 |

### 星墜 `starfall` — 9 個引用點

| 模型 | 引用點 | scale 分佈 | tint 變體 | 錨點 |
| --- | ---: | --- | ---: | --- |
| `starfalltarget` | 9 | — | 0 | chest×1 |

## 引用最多的 40 個模型

| 模型 | 家族 | 來源 | 引用點 | scale 種數 | tint 種數 |
| --- | --- | --- | ---: | ---: | ---: |
| `warstompcaster` | shockwaveRing | blizzard-stock | 150 | 5 | 4 |
| `` | — | map-imported | 133 | 4 | 2 |
| `thunderclapcaster` | shockwaveRing | blizzard-stock | 123 | 3 | 2 |
| `humanlargedeathexplode` | — | blizzard-stock | 119 | 27 | 16 |
| `orcsmalldeathexplode` | — | blizzard-stock | 113 | 29 | 24 |
| `blinktarget` | blink | blizzard-stock | 89 | 1 | 1 |
| `undeadlargedeathexplode` | — | blizzard-stock | 80 | 19 | 19 |
| `bloodelfball` | — | blizzard-stock | 77 | 2 | 1 |
| `monsoonbolttarget` | boltStrike | blizzard-stock | 42 | 4 | 3 |
| `stampedemissiledeath` | burst | blizzard-stock | 42 | 2 | 2 |
| `deathpacttarget` | — | blizzard-stock | 41 | 1 | 1 |
| `nightelflargedeathexplode` | — | blizzard-stock | 33 | 9 | 6 |
| `boltimpact` | — | blizzard-stock | 32 | 0 | 0 |
| `orclargedeathexplode` | — | blizzard-stock | 31 | 14 | 7 |
| `blinkcaster` | blink | blizzard-stock | 29 | 0 | 0 |
| `wispexplode` | — | blizzard-stock | 29 | 11 | 9 |
| `impaletargetdust` | groundDust | blizzard-stock | 28 | 0 | 0 |
| `flamestriketarget` | flamePillar | blizzard-stock | 27 | 1 | 1 |
| `demonlargedeathexplode` | — | blizzard-stock | 25 | 13 | 11 |
| `mirrorimagecaster` | mirrorImage | blizzard-stock | 25 | 0 | 0 |
| `hcanceldeath` | dissipate | blizzard-stock | 24 | 4 | 2 |
| `markofchaostarget` | mark | blizzard-stock | 24 | 2 | 2 |
| `ancientprotectormissile` | missile | blizzard-stock | 22 | 4 | 2 |
| `tornadoelemental` | tornado | blizzard-stock | 22 | 4 | 7 |
| `chimaeraacidmissile` | — | blizzard-stock | 21 | 5 | 7 |
| `doomdeath` | burst | blizzard-stock | 21 | 2 | 2 |
| `phoenix_missile` | missile | blizzard-stock | 21 | 1 | 1 |
| `farseermissile` | — | blizzard-stock | 20 | 7 | 2 |
| `undeaddissipate` | dissipate | blizzard-stock | 20 | 0 | 0 |
| `nagadeath` | dissipate | blizzard-stock | 19 | 1 | 1 |
| `roarcaster` | — | blizzard-stock | 19 | 2 | 2 |
| `tomeofretrainingcaster` | lightColumn | blizzard-stock | 19 | 4 | 4 |
| `steamtankimpact` | burst | blizzard-stock | 18 | 2 | 2 |
| `ucanceldeath` | — | blizzard-stock | 17 | 4 | 2 |
| `lightningboltmissile` | — | blizzard-stock | 16 | 0 | 0 |
| `waterelementalmissile` | — | blizzard-stock | 16 | 7 | 3 |
| `neutralbuildingexplosion` | burst | blizzard-stock | 15 | 0 | 0 |
| `none` | — | map-imported | 15 | 5 | 1 |
| `ailbspecialart` | — | blizzard-stock | 14 | 1 | 1 |
| `darkportaltarget` | portal | blizzard-stock | 14 | 1 | 1 |

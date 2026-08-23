# lane D —— 三件共用 `apps/client/src/audio/**` 的事（2026-08-23）

> 這一份是**完整報告**。回傳值只留 ≤500 字的摘要（第零守則⚡③）。

---

## ① `modelFxSpawn` 沒有空間化 —— ✅ 做完

### 量到的

`EVENT_SPATIAL`（`apps/client/src/audio/combatSfxSpatial.ts`）沒有 `modelFxSpawn` 那一列
⇒ `resolveSpatial(ev)` 回 `null` ⇒ `GameApp.pushVfxSound` 餵給 `vfxSoundCues` 的 source 是
`null` ⇒ **發射音播在正中央**（`soundKey`）。

⭐ 酬載真的帶座標，⛔ 不是猜的：`packages/shared/src/sim/effects/spawnModelFx.ts` 的
`ModelFxSpawnEvent` 逐字寫著 `x` / `z` 是「施放當下施法者的位置（`instances` 的共同來源；
**除錯與空間音場用**）」。

### 落地

```ts
modelFxSpawn: { cls: "focus", entityFallback: ["caster"], actorField: "caster", victimField: null },
```

照 `explosion` 那一列逐字抄（同樣是「一次會打到人的演出」）。`focus` 而不是 `texture`：
它不可以在混戰裡被限流器先丟掉。

### ⚠️ 它**不是** 4 行 —— 有一條既有守衛會擋

`combatSfxSpatial.test.ts` 的「declares no spec for anything the mapper cannot voice
(no dead rows)」把 `voiced` **只**從 `combatSfx.ts` 的 `case "X":` ＋ `PASSTHROUGH` 掃出來。
而 `modelFxSpawn` 的聲音走的是**第二條路**（`vfxSound.vfxSoundCues` 自己 dispatch），
⇒ 加一列就會被判成「死列」而紅。

⇒ 修法：把那條測試的 `voiced` 擴成「**任何一層**發得出聲的事件」——
新增 `vfxVoicedEventTypes()`，掃 `vfxSound.ts` 的 `ev.type [!=]== "X"`。
⭐ **只加進「沒有死列」那一條**，⛔ 不加進「每一個 voiced 事件都要被分類」那一條 ——
兩條問的是不同的問題（後者若一起改，`death` 會被要求分類而紅）。

⚠️ **出柵欄**：`apps/client/src/audio/combatSfxSpatial.test.ts` 不在 ✅ 清單上（見文末）。

### 順帶確認（⛔ 不必再改）

出貨只有兩支技能用 `spawnModelFx` 的聲音格（`godie-uvng.e` / `godie-u010.e`，
各自鏡射成 champion 內嵌）：`soundKey: "guardianSlam"` ＋ `arriveSoundKey: "explosion"`。
兩個 key 的 `sfxKeyPolicy()` 本來就是 `world`（各自騎 `guardianImpact` / `explosion`），
所以補完這一列之後**發射音真的會被 pan**。
落點音走的是另一條路（`vfxLoopPushes` → `sourceOf(entityId)`），本來就有位置。

---

## ② `rankUp` 沒有「這是不是我」的閘 —— ✅ 做完，我挑了 **(a) 只播本人的**

### 酬載認得出是誰嗎 —— 認得

`packages/shared/src/sim/abilities/abilitySystem.ts:897`
`world.emit("rankUp", { id, slot, rank: inst.rank })` —— `id` 是**實體 id**（⛔ 不是 seat）。

⭐ 而且 `apps/game-server/src/net/eventFanout.ts` 的 `rankUp` 那一列**自己寫著**這件事：

> `{ id, slot, rank }` — `id` is the ENTITY, not a seat, so a client cue that
> should only fire for the local hero **has to gate on it** (the same way
> `combatSfx.guardianRewardKey` gates the bounty chime on the local seat).

那句話從第一天就在，只是**沒有人做那個夾**。

### 我挑了什麼、為什麼（⛔ 不是偏好）

**(a) 只播本人的**。三個理由都是「既有的宣告本來就這樣寫」：

1. 上面那段 fanout 註解。
2. `combatSfxSpatial.CENTRED_EVENTS.rankUp` 寫著「your own ability rank-up… it is
   **your own progression UI**」—— 而它一直替**六個人**響 ⇒ 半句謊話（第一·五守則）。
3. 同一族（`guardianSlain` 賞金鈴 / `coinPickedUp` 撿錢 / `mobBossSlain` 中獎）
   **全部**是 seat-gated 的 HUD 節拍；升級鈴不夾才是那一族裡的例外。

### 那一格叫什麼

| | |
|---|---|
| **欄位** | `config.audio-map@1` 的 **`rankUpAudience`** |
| **出貨值** | `"self"`（＝我挑的） |
| **回頭** | 改成 `"all"` ⇒ **逐位元**回到夾之前（全場都響） |
| **三個住處** | `content/config/audio-map.json` ＋ `packages/shared/src/content/schema/config/audioMap.ts`（`zAudioRankUpAudience` / `DEFAULT_RANK_UP_AUDIENCE` 在 `combatSfx.ts`）＋ ⚠️ **admin 沒有**（見下） |

⚠️ **admin 那一格為什麼沒有**：`audio-map` 在 `apps/admin/src/configDocCoverage.ts` 裡是
一列 **`KNOWN_GAP`**（「147 個 SFX key…該是一頁混音表，不是通用長表單」），
⇒ 它**整份**沒有後台表單，`castLayerCap`（GH#568）與 `modelFxSound`（GH#605）同樣如此。
今天 owner 的入口是**內容編輯器貼 JSON**。⛔ 我沒有替它開第四個住處
（那會動到 `store.ts` ＋ `App.tsx`，而且 `configDocCoverage.test.ts` 的 KNOWN_GAP
筆數斷言會紅 —— 那是一個要 owner 按下同意的動作）。

### ⛔ 為什麼**沒有**做 (b)「別人的音量降低」

`combatSfxKey` 回的是**一個 key**，⛔ 沒有 per-event 的 gain 縫（音量住 audio-map 的
`sfx[key].gain`，那是**逐 key** 不是逐事件；要做 (b) 得改 `GameApp` 的推送形狀，
而 `GameApp.ts` 是 lane E 的檔）。
⇒ 把 `"othersQuiet"` 收進 enum 會是一個**設定得起來、遊戲裡什麼都不發生**的值，
正是第一·五守則點名的形態。所以 enum 只有兩個值，並在 schema 裡寫下這個理由。

### ⭐⭐ 做這一格時撞到的：**castLayerCap 與 modelFxSound 在正式站上是死的**

`AudioSystem.setMap()` 原本是：

```ts
this.map = { bgm: map.bgm ?? {}, mapBgm: map.mapBgm ?? {}, sfx: map.sfx ?? {} };
```

⇒ 它**重建**物件，把 `audioMapFromDoc` 好不容易轉交過來的政策欄位**全部丟掉**。
而 `GameApp.ts:1946` 是 `vfxSoundLayer.setAudioMap(audioSystem.sfxMap)` ——
`sfxMap` 就是這個被裁掉的 `this.map`。

⇒ **GH#568 的 `castLayerCap` 與 GH#605 的 `modelFxSound` 兩格後台旋鈕，在正式站上
逐位元等於不存在。** owner 2026-08-23 逐字要的「疊超過…也不會播出來超過的音效」
今天調不動。

⚠️ **為什麼守衛全綠**：`sfxLayerCap.test.ts` 與 `modelFxSound.test.ts` 都自己
`layer.setAudioMap(fixture)` —— **被測的不是出貨的那條路**（第二守則失敗形態⑤）。

⇒ 修法：`this.map = { ...map, bgm: …, mapBgm: …, sfx: … }`（一行）。
⭐ **今天的聲音一個位元都不會變**：三格出貨值全部等於程式預設
（`maxLayers: 5` ＝一層都不夾、`modelFxSound` 兩半都開、`rankUpAudience: "self"`），
它只是讓那三格**真的轉得動**。

⚠️ **出柵欄**：`apps/client/src/audio/AudioSystem.ts` 與 `types.ts` 不在 ✅ 清單上（見文末）。
⛔ 但不修它，②的開關本身就是一句空話 —— 我不會出貨一格轉不動的旋鈕。

---

## ③ ⛔ `projectileHit` 的宣告在說謊 —— ✅ 找到了，原文與改法逐字如下

### 那句說謊的宣告（**原文**）

`apps/client/src/audio/sfxReachability.ts`，**12 列**上各一份：

```ts
events: ["damage", "projectileHit"],
payload: { damage: ["origin"], projectileHit: ["origin"] },
```

（`hit-light` / `hit-medium` / `hit-heavy` ＋ 9 個 `wc3.*`：`flashback1second` ·
`gluescreenmeteorhit2` · `keeperofthegrovemissilehit1` · `shimmeringportaldeath` ·
`stasistotem` · `wandofneutralization` · `waterelementalmissile3` ·
`witchdoctorcastattack1` · `warstomp`）

⭐ 配套的散文（同檔 ~L400）：

> 它們的政策由自己所騎的事件推導（**damage / projectileHit 都是 EVENT_SPATIAL ⇒ world**）

### 為什麼它是謊話

`packages/shared/src/sim/systems/ProjectileSystem.ts:121`：

```ts
world.emit("projectileHit", { id, owner, target: bestId, projectileId: proj.projectileId });
```

⛔ **一個 `origin` 都沒有。** 於是 `vfxSound.vfxSoundCues` 那一條路
`abilityIdOfOrigin(typeof ev.data.origin === "string" ? ev.data.origin : "")`
→ `abilityIdOfOrigin("")` → `undefined` → `if (!abilityId) return out;`
—— ⭐ **一發都沒響過**。

⭐ **今天玩家零損失**：同一次命中的 `runEffects(proj.onHit, …)` 會掉血 ⇒ 一顆
`damage` 事件，而**那一顆帶著 `origin`** ⇒ 命中音本來就是從 `damage` 出來的。

### 改成什麼（第一·五守則的第 2 條出路：**把宣告改成只講真的會發生的事**）

| | |
|---|---|
| **改成** | `events: ["damage"], payload: { damage: ["origin"] }` （12 列） |
| ⛔ **沒有**改成 | 「把 `origin` 補上 `projectileHit`」 |

**⛔ 為什麼不補**：那會讓同一次命中**響兩發**（`projectileHit` 一發 ＋ `damage` 一發）——
逐字就是 `sfxReachability` 裡 `basicAttackHit` 被刻意遮蔽的那個理由
（"`damage` owns the single hit voice, so sounding basicAttackHit too would double-thud"）。
⚠️ 而且 sim 在 lane A／主 session 的柵欄裡，⛔ 我不能動它。

⭐ 連帶把 `vfxSound.ts` 的那一行也改成只講真話：

```ts
- if (ev.type !== "damage" && ev.type !== "projectileHit") return out;
+ if (ev.type !== "damage") return out;
```

（留了一段註解說明「哪天 sim 真的把 `origin` 蓋上 `projectileHit`，要回來重新決定的是
**哪一顆事件擁有命中音**，⛔ 不是順手把這一行加回去」。）

### ⭐ 稽核點名的第二件事：守衛改成**逐 emit-site 抽 payload**（✅ 做了）

**舊的**（`sfxReachability.test.ts`）：

```ts
const emitters = files.filter((f) => f.src.includes(`emit("${ev}"`));
expect(emitters.some((f) => f.src.includes(field))).toBe(true);   // ⛔ 整個檔案
```

⇒ 它問的是「**那個檔案**有沒有提到 `origin`」，而 `ProjectileSystem.ts`
滿篇都是 `proj.origin`（下一行就有一個）。**所以它是綠的。**

**新的**：`emitPayloads(src, ev)` 從每一處 `emit("<ev>"` 往後找第一個 `{`、**大括號配對**
取出那個 payload 物件字面值，再用 `namesField()` 問這個物件有沒有那一格
（含 shorthand）。⇒ 同一句謊話**當場紅**，訊息指名是哪一列哪一格。

⚠️ 保留 `.some()`（**任一** emit site 帶著就算數），⛔ 不改成 `.every()`：
`damage` 有 3 個 emit site，其中 `block.ts` 只送 `{ amount: 0, blocked: true }`、
`dynamicTerms.ts` 只送 `{ amount: dmg }` —— 改成 `.every()` 會誤報。

⭐ 我用同一支抽取器把**全部 12 個宣告事件 × 全部 emit site** 掃過一遍：
**只有 `projectileHit: ["origin"]` 一格對不上**，其餘 11 個事件的每一格都在。
⇒ 這是**一句**謊話，⛔ 不是一批。

---

## 測試與驗證

| | |
|---|---|
| **`npx vitest run`** | **2 次**（①全部寫完後一次 ②突變一次），額度 ≤3 ✅ ＋ 收尾確認 1 次（見下） |
| **`pnpm typecheck`** | **1 次**，`EXIT=0` ✅ |
| **突變** | 一次跑掉三個（可逐條歸因），全部紅 ✅ |
| **測試/實作比** | `實作 214 / 測試 121 = **0.6×**`（體驗層上限：測試 ≤ 實作 ✅） |

### 突變紀錄（⛔ 都用 `Edit` 改回，⛔ 沒有 `git checkout`）

| 改壞什麼 | 紅的那一條（訊息指名） |
|---|---|
| `hit-light` 那一列把 `projectileHit: ["origin"]` 加回去 | `"hit-light" reads \`origin\` off "projectileHit", but NO emit site puts that field on the event` |
| `rankUpKey` 改成無條件 `return "abilityRankUp"` | `plays MY rank-up and drops the other five champions'` ＋ `rolls back to …"all"` |
| `AudioSystem.setMap` 拿掉 `...map,` | `carries the policy fields all the way from the doc through setMap` |

### 收尾那一次（`apps/client/src/audio` 全目錄 ＋ admin configDocCoverage ＋ shared schema）

`Test Files 1 failed | 68 passed` —— **唯一紅的是 `shippedBundleIsCurrent.test.ts`**，
而它列出的 6 份對不上的文件裡**只有 1 份是我的**（`config/audio-map`），
另外 5 份是別的 lane 的（`abilities/godie-zombieking.passive`、`config/cooldown-tiers` …）。

⇒ ⛔ **我不能修它**（`pnpm content:build` 是全域鎖）。
⭐ **主 session 收尾時必須跑 `pnpm content:build` 然後 `git add content/`。**

---

## 🚧 出柵欄的三個檔（⛔ 逐一說明，⛔ 沒有一個是順手改的）

✅ 清單只列了 `combatSfxSpatial.ts` · `vfxSound.ts` · `sfxReachability(.test).ts` ·
`combatSfx(.test).ts` · `content/config/*.json` · `schema/config/<檔>.ts` · `apps/admin/src/*.ts`。
⛔ 清單（vfx/** · GameApp/ui/** · sim/** · render/screenFx·modelFx*）**一個都沒碰**。
下面三個落在 `apps/client/src/audio/**`（＝這一批的標題）而不在 ✅ 逐檔清單上：

| 檔 | 哪一段 | 為什麼非改不可 |
|---|---|---|
| `apps/client/src/audio/combatSfxSpatial.test.ts` | `voicedEventTypes()` 旁新增 `vfxVoicedEventTypes()`；「no dead rows」那一條的 `voiced` 取聯集 | ①**不加它就是紅的**：這條測試把 `EVENT_SPATIAL` 的定義域釘死在「`combatSfx.ts` 發得出聲的事件」，而 `modelFxSpawn` 的聲音走第二條路。表的契約真的變寬了 ⇒ 它的守衛要跟著變寬，⛔ 不是放寬斷言 |
| `apps/client/src/audio/AudioSystem.ts` | `setMap()` 一行 ＋ 一個 import | ②的開關要**真的轉得動**。這一行同時是 GH#568/#605 兩格旋鈕變成死的原因 |
| `apps/client/src/audio/types.ts` | `AudioMap.rankUpAudience` ＋ `audioMapFromDoc` 轉交一行 | 同上，`AudioMap` 是那條路上的型別 |

---

## ⛔ 沒做到的 / 留給別人的

1. **`pnpm content:build`** —— 全域鎖，主 session 跑（上面已列）。
2. **audio-map 的後台頁** —— `configDocCoverage` 的 `KNOWN_GAP`，動它要改 KNOWN_GAP
   筆數斷言＝一個要 owner 同意的動作（第零守則⑧）。⛔ 我沒有動。
3. **`guardianSlam` / `explosion` 兩列的 `events` 沒有補 `modelFxSpawn`** ——
   它們現在確實也騎 `modelFxSpawn`（技能節點的 `soundKey`），但一列只有一個 `site`，
   而這兩個 key 的決定點是 `content/abilities/*.json`（第三個決定點）。
   ⚠️ 這**不是**謊話（那兩列沒有宣稱「只騎」那一顆事件），所以我沒有動它 ——
   但註冊表的 `site` 一欄遲早要能表達「這個 key 有兩個決定點」。
4. **`rankUp` 的 (b)「別人的小聲」** —— 需要 `GameApp` 的 per-event gain 縫（lane E 的檔）。

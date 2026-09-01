# Editor 接縫 —— 交接（分支 `feat/editor-seam-20260902`）

> ⭐ 這一份是給**下一條分支**讀的。session 在此中止，⛔ 不是因為做完了。
> ⚠️ 用詞紀律：底下寫「⭐ 落地」的才有終端證據；🟡 是**鏈路已接上，⛔ 未驗收**。

## 0. ⛔ 先讀這一格 —— 兩個會咬人的東西

| | |
|---|---|
| ⛔ `editorSourceSurvivesSync.test.ts` | 它**真的跑產生器**、**真的改** `tools/skill-remake/heroes/godie-e00s.py`。⭐ 2026-09-02 它把那份 16,633 bytes 的來源寫成 33 bytes（見下）。⇒ ⭐ **不要在別的 lane 在跑的時候跑它**，⛔ 也不要 kill 它（`finally` 還沒還原） |
| ⭐ 隔離區 | 那條測試跑 `genrun.sh` ⇒ **解鎖**產物。中途被 kill ⇒ 隔離區停在解鎖狀態。⭐ 收工前一定要 `bash scripts/product-quarantine.sh status` 確認回到「鎖著 334」 |

## 1. ⛔⛔ 已發生的事故（根因與規矩）

`tools/skill-remake/heroes/godie-e00s.py` 被寫成 **33 bytes**。

| 段 | |
|---|---|
| ① 形狀 | CAS 那條測試斷言「檔案**不會**被改」⇒ ⛔ 我因此**沒有寫 `finally` 還原** |
| ② 引爆 | 突變驗證的定義就是「把 CAS 拿掉」⇒ ⭐ **那個寫入真的發生了** |
| ③ 救回 | 靠一份手動 `cp` 的備份（驗過 == HEAD） |

⇒ ⭐ **規矩**：任何會寫**真實 repo 檔**的測試，`finally` 一律**無條件**還原 ——
⛔ 不是「這條測試理論上不會寫」。（已補進 `editorSourceRoutes.test.ts` ④）
帳本：`bash scripts/rule-slip.sh` 第 190 筆（`0-備份` / `憑印象`）。

## 2. 六節的誠實進度

| 節 | 狀態 | 落點 |
|---|---|---|
| **五** Asset Manifest | ⭐ **落地** | `tools/asset-manifest/gen.ts` → `content/assets-manifest.json`（**1,640 筆 / 102,902,938 bytes**）。`assetManifestDigest` 從「只 hash 一份 `assets/models/_lod.json`」換成**完整 manifest** 的 canonical digest。deterministic + tamper 測試綠 |
| **六** effectiveVfxLimits | ⭐ **落地** | `packages/shared/src/content/import/effectiveVfxLimits.ts`（8 格）。⭐ 取值走**遊戲自己的 clamp**（`clampMaxParticlesPerSystem` / `clampMaxRatePerSystem`），⛔ **不是** schema 的 `.max()` |
| **二** source adapter | 🟡 | 見 §3 |
| **一** runtime-direct | 🟡 | 見 §4 |
| **四** 審後才上 | 🟡 | `apps/platform/internal/submissions/submissions.go` 有骨架（verdict 綁 `ApprovedDigest`，candidate 一個 byte 變 ⇒ 舊 verdict 失效）。⛔ **權限分離與 promote 沒做**；⛔ 八支 fixture 的永久 `promotable=false` 沒做 |
| **三** G2 importer | ⛔ **沒開始** |

## 3. 第二節 —— source adapter（🟡）

**綠的**：`editorSource.test.ts` 7 passed · `editorSourceRoutes.test.ts` 6 passed。

- `GET /content-api/editor-source?collection=&id=` 回**規格指定的 shape**
  （`outputPath` / `ownership{kind,producer,sourcePaths,regenerateCommand,editableMembers}` / `writePolicy`）
- 擁有權三分（`hand-authored` / `generator-owned` / `normalizer-only`）**從量出來的戶籍表推導**
  （`sync-io.json` ＋ `normalizers.json`），⛔ 不是手寫名單
- `registerProductWriteGuard` 掛 `onRequest` ⇒ **一支 curl 也擋得住**（409 `GENERATOR_OWNED_PRODUCT`）
- CAS 對的是**來源**的 sha256，⛔ 不是產物（產物會被正規化器就地改 ⇒ 拿它當 base 會假衝突）

### ⭐⭐ 一個量到、會改變驗收條件的事實

把來源的 `cooldown: [90,90,90]` 改成 `[77,77,77]`、跑完重生成 ⇒ **回來仍是 90**。

⛔ **那不是接縫壞掉。** `tierize()` 是「值 → 級別 → 值」，而 77 與 90 落在**同一個級距**（大）
⇒ 兩者都解析回 90。⭐ 那正是第〇·四守則要的行為。

⇒ ⭐ 但**編輯器不知道**：它寫 77、拿回 90、會判定接縫壞了並開一張假票。
⇒ 回應多一格 `normalizedFields`（`cooldown` / `cooldownTier` / `description` /
`manaCost` / `manaCostTier` / `range` / `rangeTier`），⭐ 而它有一條閘**逐字讀
`tools/skill-remake/tierize.py` 的 `doc["…"] =` 寫入端**再比對 ——
⛔ 不是在 TS 抄一份 python 清單（那就是第二個住處）。

### ⛔ 還沒做完的
- `editorSourceSurvivesSync.test.ts` —— 規格 §5「證明修改經 `skills:sync` 後仍存在」。
  ⭐ **正確的錨點是非級距欄位**：實測 `effects[0].scatterRadius = 6.0` 原樣存活。
  ⛔ 現在檔裡用的還是 `cooldown`（＝上面那個必然失敗的錨點）⇒ **它是紅的**。
- POST 的收尾（重生成失敗時還原來源那條路已寫，⛔ 未突變驗證）

## 4. 第一節 —— runtime-direct（🟡，⛔ 還沒接線）

**矛盾已定位**（三份 receipt 互相打架）：

| 誰 | 說什麼 |
|---|---|
| `content/editor-target-profile.json` | `compiler.{contractVersion,fingerprint} = null`，理由「砍掉編譯器那一層」 |
| `packageSchema.ts:294` | `compiler: { contractVersion: zShort, fingerprint: zShort }` ⛔ **必填非空** |
| `GGD_EDITOR_PACKAGE_SPEC.md` | Draft 0.4 的四層 compiler ＋ `expectedCompiled` |

⇒ 照 profile 做 ⇒ manifest 過不了 schema；照 schema 做 ⇒ 填假指紋 ⇒ 對方去實作
「重編比對」而我們永遠不比對。⛔ **兩條路都通不了。**

**已寫好但⛔ 沒接線**：`packages/shared/src/content/import/authoringProcessor.ts`
- `authoringProcessor { kind:"runtime-direct", contractVersion:"runtime-direct@1", fingerprint }`
- fingerprint = **七個共用實作面**的 canonical receipt（JCS + sha256 前 12）——
  ability/item Zod · exact-ref collector · capability applicability · authoring rules ·
  runtime loader · derived rebuild rules · golden vectors
- ⭐ 表上列的檔**不存在就擲例外**（⛔ 靜靜跳過會產出一個「穩定但涵蓋不到東西」的指紋）

**⛔ 下一步要做的**：
1. `zPackageManifest` 收 `authoringProcessor`，`compiler` 改成 optional（⛔ **不要塞假的 `none`**）
2. `targetProfile.ts` ＋ `buildEditorTargetProfile.ts` 出這一格
3. `GGD_EDITOR_PACKAGE_SPEC.md` 改掉 Draft 0.4 的四層描述
4. 反方向的閘（失敗形態⑫）：**參與驗證的檔沒有被任何一面涵蓋 ⇒ 紅**

## 5. 檔案清單（這一輪新增）

```
packages/shared/src/content/import/editorSource.ts          擁有權推導 + normalizedFields + membersOf
packages/shared/src/content/import/editorSource.test.ts     7 passed
packages/shared/src/content/import/authoringProcessor.ts    ①的指紋（⛔ 未接線）
apps/content-api/src/editorSourceRoutes.ts                  GET/POST + 產物寫入守衛
apps/content-api/src/editorSourceRoutes.test.ts             6 passed
apps/content-api/src/editorSourceSurvivesSync.test.ts       ⛔ 紅（錨點選錯，見 §3）
```

⚠️ `content/abilities/godie-etyr.*` 與 `content/champions/godie-etyr.json` 的改動
**⛔ 不是這條接縫的** —— 那是 **#903** 召喚接線的在飛工作，⭐ 不要跟接縫一起關。

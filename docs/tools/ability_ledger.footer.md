
---

## 怎麼重算

```bash
# md（這一份）
python3 docs/tools/ability_ledger.py > docs/_ability-fidelity-ledger.md

# JSON（編輯器吃的那一份，形狀見 docs/legacy/_ability-ledger-editor-spec.md §7）
python3 docs/tools/ability_ledger.py --json

# 兩份一起（同一份記憶體資料，不會分岔）
python3 docs/tools/ability_ledger.py --json --md > docs/_ability-fidelity-ledger.md
```

**產生器會先跑三條健全性檢查，任何一條失敗就 `EXIT 2` 且什麼都不寫**（規格 §7.4）：
技能數與 `content/abilities/` 的實際檔數與 id 集合、每個模板 ref 都存在、
兩張晉升表的兩種獨立解析互相對得上且指到的都是真的技能。

決定性：所有 dict 依 key 排序、浮點走 Python repr。
`GGD_LEDGER_NOW=2026-08-03T00:00:00Z` 可以釘住時間戳，讓「跑兩次 `cmp` 相同」直接可驗。

資料來源：
- `content/bundle.json` — 出貨的技能／模板／特效文件（`contentVersion` 進 fingerprint）
- `content/ability-templates/*.json` — 33 份模板（型別／上下界／預設一律讀這裡）
- `docs/ability-templates.csv` — JASS 對照帳本（498 列、`rawcode` 與 `JASS行為模板` 是 join key）
- `apps/client/src/render/vfx/w3xAbilityArt.ts` — 硬表晉升（34 支）
- `apps/client/src/render/vfx/w3xFamilyArt.ts` — 家族晉升（表上 258 列，實際說了算 236 支）
- `apps/client/src/render/vfx/w3xArtFamilies.ts` — 21 個族原型（形狀／預設外觀／普查引用數）
- `apps/client/src/render/vfx/artParams.ts` — 每次呼叫可覆寫的旋鈕（`ArtParams`）
- `apps/platform/internal/curation/starter.go` — 53 隻出貨名單

⚠️ **這份帳本會過期。** 它是某一次 `content:build` 的切片，不是活的守衛，
而且**沒有任何 CI 在跑這支腳本**。真正會擋回歸的是各套件裡的普查測試；
這一份的用途是**看 P1/P2 的進度**。

---

## 相關工具

```bash
# 英雄檔裡的內嵌鏡像 ← 獨立檔（方向不可反向；預設 dry-run，有漂移回 1）
python3 docs/tools/sync_ability_mirror.py
python3 docs/tools/sync_ability_mirror.py --write
```


---

## 怎麼重算

```bash
python3 docs/tools/ability_ledger.py > docs/_ability-fidelity-ledger.md
```

資料來源：
- `content/bundle.json` — 出貨的技能／模板／特效文件
- `docs/ability-templates.csv` — JASS 對照帳本（498 列、`rawcode` 與 `JASS行為模板` 兩欄是 join key）
- `apps/client/src/render/vfx/w3xAbilityArt.ts` — 硬表晉升（34 支）
- `apps/client/src/render/vfx/w3xFamilyArt.ts` — 家族晉升（258 支）
- `apps/platform/internal/curation/starter.go` — 53 隻出貨名單

⚠️ **這份帳本會過期。** 它是某一次 `content:build` 的切片，不是活的守衛。
真正會擋回歸的是各套件裡的普查測試；這一份的用途是**看 P1/P2 的進度**。

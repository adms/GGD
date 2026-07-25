# 「鑄技工坊」計畫 (Project Skill Forge) — 技能模板編輯器設計

> 狀態: **設計定稿, 等待實作** · 起案 2026-07-26 · owner: Takuro
> 前置資產: [ability-templates.md](ability-templates.md) (29 類行為模板總覽) ·
> [ability-templates.csv](ability-templates.csv) (498 技能 × 35 欄) ·
> `tools/w3x-import/out/GoDieEX22s-src/JASS_BEHAVIOR.json` (309 筆 JASS 行為記錄)
> 關聯任務: #78 (1:1 WC3 fidelity) · #128 (castability)

## 一、目標

讓設計者在編輯器裡「選行為模板 → 填參數 → 即時試放 → 一鍵寫回」完成技能設計,
不再手寫 EffectDef JSON、不再手動同步鏡像雙副本。模板 = **參數化的行為原型**,
取自 90 英雄 JASS 逆向的 29 類行為分類 (龍破斬=行進波動、蒼月潮 Jump=跳躍落地
這些「範本中的範本」)。

## 二、核心設計

### 2.1 資料層 — `template@1` 文件 (`content/ability-templates/*.json`)

每個模板宣告: 身分、參數槽、sim 能力需求、範本出處。

```jsonc
{
  "id": "tpl-traveling-wave",          // 行進波動
  "schema": "template@1",
  "name": "行進波動",
  "description": "傷害點沿直線逐步推進, 可帶終點爆發",
  "params": {
    "stepSize":      { "type": "number",  "default": 45,   "range": [20, 200], "unit": "wc3u" },
    "stepCount":     { "type": "number",  "default": 20,   "range": [3, 41] },
    "aoePerStep":    { "type": "number",  "default": 200 },
    "terminalBurst": { "type": "number",  "default": 450,  "optional": true },
    "damage":        { "type": "scaling" },                 // 共用 zScaling
    "damageType":    { "type": "enum",    "values": ["magic", "physical", "true"] }
  },
  "requires": ["projectile"],           // 對照 sim 能力表
  "exemplar": { "skill": "04-03 龍破斬", "jass": "war3map.j:30098" }
}
```

- 參數槽的型別/範圍/預設值 **來自 JASS_BEHAVIOR.json 的實測樣本** (309 筆記錄的
  幾何/時序欄就是取值分布), 不憑空發明。
- 29 類先建 29 個模板文件; 每類的範本預設值 = 該類 exemplar 的 JASS 實測參數。

### 2.2 展開器 (expander) — `packages/shared/src/content/templates/expand.ts`

```
expand(template, params) → { castType, effects[], radius?, castTimeSec?, vfx 錨點 }
```

- **純函式**, sim 與編輯器共用同一顆 — 保證「表單看到的」=「遊戲跑的」。
- 技能文件存 `templateRef + params`, **不存展開結果**:
  ```jsonc
  { "template": { "ref": "tpl-traveling-wave", "params": { "stepSize": 45, … } } }
  ```
  registry 註冊時展開。模板升級 (例如 sim 新增終點爆發詞彙) → 全部引用技能
  重展開自動受益。
- **eject 機制**: 需要特調時可一鍵展開成裸 EffectDef 脫離模板 (等同現況手寫)。
- 展開結果必須通過既有 `zAbilityDoc` 校驗 — 模板系統蓋在 schema 之上, 不繞過。

### 2.3 編輯器流程 (蓋在 `apps/editor` 既有機制上)

| 步驟 | 內容 | 依託的現成機制 |
|---|---|---|
| 1 選模板 | 29 張卡片, 附範本名 + 引擎支援度 badge (綠 ≥7 / 黃 4-6 / 紅 ≤3, 取自實作落差分) | ability-templates.csv 的落差分 |
| 2 填參數 | 表單由 template@1 schema 自動生成, 預設值=範本實測 | zod 表單 walker (`effect.ts` 已為 union 卡片設計) |
| 3 即時試放 | 展開結果灌進 3D 預覽場景放一發看手感 | `PreviewController` 的 `overrideAbilities: true` |
| 4 寫回 | 同時產出 standalone + embedded 兩份, 跑 `pnpm content:build` | 鏡像規則寫進寫入器, 人不碰同步 |

### 2.4 落差治理 (內建, 不做事後驚訝)

- 模板 `requires` 對照 **sim 能力表** (`packages/shared` 匯出常數):
  `projectile / dash / hooks / auras / leap / knockback / summon / combo …`
- 能力缺席時編輯器明示降級方案與分數: 「跳躍落地: 拋物線未支援, 將以
  dash+落點傷害近似 (5/10)」— 設計師知情選擇。
- 落差分規則沿用 `tools/ability-templates/score_gap.py`, 模板卡片 badge 與
  CSV 同源。

## 三、漸進路線

| Phase | 範圍 | 前置 | 覆蓋 | 驗收 |
|---|---|---|---|---|
| **P1** | 高分模板 8 類: 單體斬擊/瞬發點爆/原地震波/直線分段掃擊/行進波動/攻擊觸發/受擊反應/變身強化(數值面) | 無 — 詞彙現成 | ~60% 技能 | template@1 schema + 展開器 + 選卡表單上線; 用鑄技工坊重做 1 個現有技能 diff 為零 |
| **P2** | 位移家族: 跳躍落地/衝鋒推撞/拉扯投擲/瞬移突斬 | sim 新詞彙 `leap`(拋物線+落地效果) `knockback`(敵方位移) | +33 技能 | 蒼月潮三招用模板重現, playtest 過 |
| **P3** | 召喚代理 (52 技能最大缺口) + 鎖定連段 + 週期領域(DoT) | sim `summon`/`combo`/`periodicDamage` 詞彙 | +71 技能 | 龍破斬終點爆發 + 一個真召喚技能上線 |

## 四、新代碼面 (P1)

1. `packages/shared/src/content/schema/template.ts` — `zTemplateDoc` (`template@1`)
2. `packages/shared/src/content/templates/expand.ts` — 展開器 + 能力表
3. `content/ability-templates/` — 29 個模板文件 (P1 先 8 個啟用, 其餘標 `draft`)
4. `apps/editor` — 選卡頁 + 參數表單 + 試放接線 + 鏡像寫回器
5. 測試: 展開器 golden test (範本參數 → 預期 EffectDef)、模板往返 (重做現有技能
   diff=0)、`fieldAdoption` 為 `template` 欄位建 debt 條目直到內容採用

## 五、風險與對策

- **鏡像寫回破壞 Python float 格式** → 寫入器沿用行編輯 (經 #78 批次驗證的做法),
  絕不 JSON round-trip champion 文件。
- **模板升級改變舊技能行為** → templateRef 帶 `version`; 展開器對 breaking 版本
  要求顯式遷移。
- **併發 session 衝突** → 寫回器逐路徑 stage; 遵守 concurrent-session 紀律。
- **eject 後回不去** → eject 在 git 一個 commit 內完成, 可 revert。

## 六、非目標 (本計畫不做)

- 不改 sim 戰鬥數值平衡 (只管行為形狀)
- 不做模板市集/分享 (單機編輯器內用)
- P1 不動 sim 詞彙 — 有缺口的模板明示降級, 不偷偷擴 schema

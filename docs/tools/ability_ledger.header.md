# 技能保真度帳本 — 三欄現況

> **自動產生。**重跑方式見檔尾的「怎麼重算」。
> 基準：`content/bundle.json`（v0.9.24）+ `docs/ability-templates.csv` + 兩張執行期晉升表。
> 用途：**P1（模板開 vfx 欄位）與 P2（接上零採用模板）的進度對照表** ——
> 做完一批就重跑一次，看 ✘ 變 ✔ 了幾支。
>
> 📦 **要寫程式讀這份資料的話，讀 `docs/_ability-fidelity-ledger.json`，不要 parse 這份 md。**
> 兩份是同一支產生器、同一份記憶體資料產的（`ability_ledger.py --json --md`），
> JSON 版多帶 `castType` / `cooldown` / `isPassiveOnly` / `vfxAuthority` / `vfxEditable` /
> `effectsSource` 這些介面需要、md 表格塞不下的欄位。形狀見
> `docs/legacy/_ability-ledger-editor-spec.md` §7。
>
> 這份 md 有四節：**總覽 → 特效由誰說了算 → 技能模板 → vfx 族 → 逐支明細**。

---

## 三欄的判準（寫死在這裡，讓數字可以被重算與質疑）

### 欄 1 · w3x 內建對照
以 `docs/ability-templates.csv` 的 `rawcode` 欄 join。

| 記號 | 意思 |
|---|---|
| `✔` | 有 rawcode，且出貨數值**不是**匯入器 placeholder |
| `⚠` | 有 rawcode，但傷害 `perRank` 命中 placeholder 指紋（`[80,120,160,200]` / 五階同值 / `[80,120,160]`）—— **數值是猜的** |
| `—` | 不在對照表，或沒有 rawcode |

### 欄 2 · JASS 實作
以 CSV 的 `JASS行為模板` 分類 + 「該分類的簽章 effect kind 有沒有出現在出貨文件裡」判定。
**模板展開後的 kind 也算**（143 支綁模板的技能 `effects` 是空的，只看原始陣列會全部誤判為未實作）。

| 記號 | 意思 |
|---|---|
| `✔` | 該分類的簽章 kind 出現了 —— 原作那件事**真的做出來了** |
| `✘` | 分類有可測簽章，但出貨文件沒有 —— **原作行為缺席** |
| `?` | 分類存在但沒有可測簽章（無法自動判定，要人看） |
| `—` | CSV 標「物件資料技能(無觸發)」或「純演出」—— 本來就沒有 JASS 行為 |

⚠️ **簽章對照表是我定義的，不是資料自帶的**（出貨資料裡零個 provenance 欄位）。
換一組定義數字會變。目前的對照：召喚代理→`summon`、變身強化→`championForm`、
衝鋒推撞→`dash`/`knockback`、攻擊觸發與受擊反應→`passive.hooks`、週期領域→`dot`、
跳躍落地→`leap`、瞬移突斬→`dash`、拉扯投擲→`knockback`、死亡機制→`revive`、
資源運營→`grantGold`/`restore`、行進波動→`spawnProjectile`/`damageLine`、原地震波→`damageArea`。

### 欄 3 · 特效綁定（單位 model / 粒子 / 球體 / 蝗蟲群）
⚠️ **只看 `vfxKey` 會嚴重低估** —— 執行期有兩張表會改寫它。

| 記號 | 意思 |
|---|---|
| `✔` | 綁到**真的原作 emitter**：硬表逐支晉升（34 支）／`fx.w3x.*`／`godie-*`／自訂 `vfxLayers` |
| `◐` | **家族晉升**（258 支）—— 執行期換成家族原型，比通用替身好，但不是這一支自己的原作特效 |
| `△` | `fx.prim.*` 程序原語，**沒有晉升** —— 就是通用替身 |
| `✘` | 完全沒有 `vfxKey` |

---


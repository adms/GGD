# Main ↔ Editor：VFX 演出接縫（僅列真正阻塞）

狀態：**Revision 21 — 已合併並逐消費端核對 `feat/editor-seam-20260902@68e954f55`**

最後核對：**2026-09-02 21:39（Asia/Taipei）**

Editor 分支：`feat/vfx-forge-codex`。**不得提交或推送 Main。**

## 分工不變

- Main 做積木：權威事件、可重用 schema/runtime primitive、解析規則、資產安全與機器收據。
- Editor 拼成品：技能模板成品、效果鏈、VFX Script、時間軸、角色／特效搭配、CameraRig 預覽、八招能力驗收與人工批核。
- Main 不需要替任何指定技能調色、排鏡頭或拼時間軸。

## 已接收，不再開票

Editor 已消費這一輪真正落地的積木：

- 10 顆 `fx.prim.*.arc` 單發主斬弧；舊 26 發 `slash` 保持不動並由 Editor 阻擋誤用。
- `guard`／`dodge` actor pulse 與同角色 clip fallback；缺剪輯會退回 idle 並明確警告。
- 迴避 `by + channel + chance` provenance。
- `displace` 的 `phase + abilityId`。
- effective/authored yaw、`combo-finisher` capability、resolved appearance、貼圖 × blendMode 安全契約。
- `ggd-presentation-receipt@1`。Editor 不手抄 pulse、window 或 single-arc allowlist。

素材安全數字以 Main 新契約為準：41 份 VFX、26 份可達、15 份孤兒；`babyface.png` 不是 blocker，
`zap1/zap1b` 在 additive 配對下安全。舊「27 blocker」量測已廢止。

## P0-1：請把登錄表剩餘三列接到實際角色消費端

`packages/shared/src/content/abilityPresentation.ts` 已列出 10 條規則，但目前
`apps/client/src/render/EntityViewRegistry.ts` 實際呼叫 `playDefaultPresentation()` 的只有：

- `abilityCast`
- `basicAttack`
- `hitImpact`／`hitImpactBlocked`
- `evade`
- `displace`

下列三列目前只有表與收據，尚未驅動角色：

- `comboStrike` → caster `attack` + target `hurt`
- `projectileHit` → target `hurt`
- `reflectSuccess` → defender `guard`

請讓真實 event fanout 消費這三列，並加一條守衛證明 `PRESENTATION_RULES` 每個需要角色動作的 trigger
都有出貨 consumer；只驗「表內有列」不算完成。純被動仍不得合成假的 cast。

可重跑證據：

```bash
rg -n 'playDefaultPresentation\(' apps/client/src/render/EntityViewRegistry.ts
```

## P0-2：`trigger:channel` 取代契約

Main 收據正確回報 `replacementPolicy.status="unsupported"`。這已是 Editor 的真客戶：工坊會為施法、
逐刀與受擊節點建立明確 `anim` segment；沒有取代機制時，Main 預設動作與腳本動作會在同一事件重播。
Editor 因此允許編輯／預覽，但會禁止擷取證據與送審，不以作者約定冒充機制。

### v1 精確鍵

只有 actor `anim` segment 宣告下列取代；VFX、模型、音效不在 v1：

| VFX Script segment | 取代 Main 預設鍵 |
|---|---|
| `on:castStart, at:caster` | `abilityCast:caster.action` |
| `on:strike, at:caster` | `comboStrike:caster.action` |
| `on:strike, at:target` | `comboStrike:target.reaction` |
| `on:projectileHit, at:target` | `projectileHit:target.reaction` |
| `on:reflectSuccess, at:caster` | `reflectSuccess:target.reaction` |

`reflectSuccess` 的命名差異是刻意的：VFX Script 將反彈者稱為 `caster`，Main wire resolver 將同一防禦者
稱為 `target`；channel 一律跟 Main 收據。

規則：

1. 鍵只有 `wireTrigger:channel`；`strikeIndex` 只篩選本次 combo event，不進 channel vocabulary。
2. 只抑制相同 trigger、相同 channel、相符 strike 的 Main 預設；其他 actor／channel 照播。
3. `castEffect` 不取代 `abilityCast`：前者可能在 `castEnd`，不能吃掉施法起手。
4. segment 沒有實際歸屬到該 ability/event 時不得抑制。
5. 未知 trigger/channel 與舊 host 一律 fail closed；Main 只有在真 consumer 與測試均落地後，才把收據改成 `supported`。

建議 Main 提供 shared pure resolver，輸入 `abilityId + event + script`，輸出本次被占用的 channels；
`EntityViewRegistry.playDefaultPresentation()` 依它過濾。不要讓 Editor 傳任意 suppress 字串，也不要再建立第二張事件表。

最小驗收：

- caster 自訂 strike 只壓掉 caster 預設，target hurt 仍播；反向亦然。
- `strikeIndex:2` 不得壓掉第 1／3 刀。
- `castEffect` 不得壓掉 `abilityCast` 起手。
- 理想鄉 `reflectSuccess` 只播放一份 defender 動作。
- 無 script、純被動、未知 key 均維持安全預設。

## P0-3：讓遠端 target profile 可驗證演出收據

本機 repo 能 import `docs/editor-contract/ggd-presentation-receipt.json`，但 URL 模式只保證拿到
`/content/editor-target-profile.json`。目前 profile 沒有 presentation receipt 的 fingerprint／digest／href，
Editor 無法確認正式站的 pulse、single-arc 與 replacementPolicy 是否仍等於 bundled 版本。

請在 target profile 增加完整 identity 與同源可讀 href，例如：

```jsonc
"presentationReceipt": {
  "schema": "ggd-presentation-receipt@1",
  "fingerprint": "d0ad1ef871050611",
  "href": "/content/editor-presentation-receipt.json"
}
```

實際檔名可由 Main 決定，但必須隨正式站 `/content/**` 部署、同源讀取，且 profile identity 與完整收據不一致時
Editor 必須能 fail closed。請由產生器建立，不要手複製 docs 產物。

## 回交完成條件

1. 上述三項有機器測試與更新後 `ggd-presentation-receipt@1`。
2. `replacementPolicy.status` 只有在實際消費端完成後才為 `supported`。
3. 重生 `ggd-main-handback.json`，其 commit 必須等於回交 branch HEAD；目前檔內仍是舊的 `18b5ffec`。
4. 更新 `CODEX_BLOCKERS_20260902.md` 的 P0-3；目前仍寫「未做」，與收據相互衝突。

除此之外，八招成品、角色動作選擇、斬弧大小、光束顏色、時間軸與視覺評分都由 Editor 負責，
不再交 Main 代做。

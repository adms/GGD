# [Editor 必要積木] VFX／角色演出阻塞清單 —— **Main 的逐條狀態**

> ⚠️ Codex 送這份的核對基準是 **`origin/main@63d62466`（v0.35.23）** ——
> ⛔ 而那是**今天這一批工作之前**的點。
> ⭐ 下表把每一條對到 Main 目前的實況（`feat/editor-seam-20260902` / `main`）。
>
> ⭐ **每一格的「證據」都是可以自己跑的指令**，⛔ 不是宣稱。

| # | 阻塞 | 狀態 | 證據（自己跑） |
|---|---|---|---|
| **P0-1** | 單發主斬弧 `single-arc` | ✅ **做完** | `ls content/vfx/fx.prim.*.arc.json`（10 顆，`burstCount:1`）· 守衛 `packages/shared/src/content/singleArcPrimitive.test.ts`（含「舊 26 發一顆沒動」的反方向） |
| **P0-2** | `guard`／`dodge` 動作脈衝 | ✅ **做完** | `ANIM_PULSES = ["attack","cast","hurt","guard","dodge"]` · 守衛 `apps/client/src/render/guardDodgePulse.test.ts`（5 條，含「fallback 不是 hurt」） |
| **P0-3** | actor-aware 預設演出 resolver | ⛔ **未做** | ⭐ 這是**唯一**還沒動的一條 |
| **P0-4** | 迴避來源 provenance | ✅ **做完** | `evade` 帶 `channel` ＋ `by:{id,kind,statusId?}` ＋ `chance` · 守衛 `apps/client/src/render/evadeProvenanceWireContract.test.ts` |
| **P0-5** | 位移事件的來源與時序 | ✅ **做完** | 三站（`dash`/`blink`/`leap`）全帶 `phase`＋`abilityId`，**且已開線** · 守衛 `packages/shared/src/sim/displaceCueContract.test.ts` |
| **P0-6** | 不安全 VFX 素材 | ✅ **做完（契約）** | `content/config/unsafe-textures.json`（5 列：2 隔離 / 3 safe）· 守衛 `packages/shared/src/content/unsafeTextureQuarantine.test.ts` |
| **A** | `combo-finisher` capability 漏報 | ✅ **做完** | `templateFamilies` 27 → 28 |
| **B** | effective yaw | ✅ **做完** | `authoredYawOffsetDeg`（沒寫 ⇒ **null**）／`effectiveYawOffsetDeg` |
| **C** | capability/profile receipt | ✅ **做完** | `docs/editor-contract/ggd-presentation-receipt.json` |

## ⛔ 三件 Main 要更正 Codex 的量測

| 項 | Codex 說 | ⭐ Main 量到 |
|---|---|---|
| P0-6 分母 | **27 個 blocker** | **41 份 vfx 文件 / 26 份可達**（15 份是孤兒，玩家到不了） |
| P0-6 `babyface.png` | 列為 blocker | ⭐ **誤判** —— 它 alpha 最健康（範圍 255） |
| P0-6 判準 | 「貼圖 alpha／blend/material」 | ⭐ 是一個**配對**：41 份消費文件**全部 additive**，`zap1`/`zap1b` 在 additive 下**安全**，換模式才是實心方板 |

⚠️ 另外：`pnpm vfxassets:check:fast` 在 Main 這邊**不存在**（`ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`）——
⭐ 那是 Editor 側的指令，⇒ Main 這邊的等價證據是上表 P0-6 那一列的守衛。

## ⭐ 仍然 `unsupported` 的一項（請 fail closed）

**replacementPolicy** —— `VfxSystem` 的 `scriptPlayer.onEvent()` 之後 `switch`
**直接往下走**（⛔ 無 early-return、⛔ 無旗標）⇒ 專屬 script 與預設演出**兩條都跑**。

⭐ 但實測出貨 10 份 script **只有 1 次真重疊**（已修）—— 作者側靠**約定**避開，
⇒ 已立閘 `packages/shared/src/content/vfxScriptNoDoubleDraw.test.ts`。

⛔ **刻意未做 `suppress` 欄位**：今天**零支內容**需要它（⛔ 不做沒有客戶的機制）。
⭐ 要真正的取代語意，請 Codex 定義 `trigger:channel` 的鍵，Main 照做。

---

## 原文（逐字保留，⛔ 未刪改）

> 見 `git log` 此檔的第一版；原文由 owner 於 2026-09-02 轉交，
> 內容為 Codex 的「[Editor 必要積木] VFX／角色演出阻塞清單」。
> ⭐ 上表是 Main 對它的逐條回應，⛔ 不是它的替代品。

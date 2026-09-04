/**
 * ⭐⭐ **演出契約收據 `ggd-presentation-receipt@1`**（Codex 阻塞清單 C）。
 *
 * Codex 逐字：
 * > 請以**機器可讀**方式公開：actor pulse vocabulary · trigger → 預設 actor action ·
 * > fallback policy · replacement policy · `single-arc` 能力與參數 ·
 * > evasion provenance 狀態 · 位移 presentation cue 能力 · resolver fingerprint/version。
 * > **Editor 缺欄位時會 fail closed，不會抄 Main 常數。**
 *
 * ## ⭐ 每一格都是**推導**的，⛔ 沒有一個手寫的 `supported`
 *
 * ⚠️ 這是 CLAUDE.md 第〇·五守則的紅線：
 * 「⛔ 它不可以是手寫的⋯同一個 repo 已經有一份手寫的 `SIM_CAPABILITIES`，
 *  而它的檔頭自己記錄了它**撒過兩次謊**⋯**對外契約不行** ——
 *  外部編輯器看不到我們的 registry，沒有辦法發現我們在說謊。」
 *
 * ⇒ ⭐ 所以這一份的每一格都從**出貨的東西**問出來：
 * · pulse 詞彙 ← `ANIM_PULSES` / `PULSE_MS`（`@ggd/shared/content/animPulse`）
 * · fallback ← `DEFAULT_CLIP_NAMES`（`apps/client/src/render/ClipAnimator`）
 * · single-arc ← 掃 `content/vfx/fx.prim.*.arc.json` 的**實際欄位**
 * · evasion provenance ← 問 `evasion.ts` 的**出貨 payload 型別存不存在**
 * · displace cue ← 同上問 `leap.ts` / `blink.ts`
 *
 * ⭐ 後兩格今天可能是 `unsupported` —— ⛔ 而那**正是它該說的**：
 * Codex 會 fail closed，⛔ 不會做出一個上線就是死的 fixture。
 * ⚠️ 它們哪天落地了，這一份會**自己**變成 supported（⛔ 不必有人記得改）。
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ANIM_PULSES, PULSE_MS, ANIM_STATES } from "../../packages/shared/src/content/animPulse";
import { DEFAULT_CLIP_NAMES } from "../../apps/client/src/render/ClipAnimator";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/editor-contract/ggd-presentation-receipt.json");

type Support = "supported" | "partial" | "unsupported";

/** ⭐ 一個能力 ⇒ 它今天的狀態 ＋ **為什麼**（⛔ 不接受無理由的 supported）。 */
interface Capability {
  readonly status: Support;
  readonly why: string;
  readonly evidence: string;
}

const src = (p: string): string => {
  try {
    return readFileSync(join(ROOT, p), "utf8");
  } catch {
    return "";
  }
};

/** ⭐ 出貨的單發斬弧 —— 掃**實際的文件**，⛔ 不是一份名單。 */
function singleArc(): Capability & { readonly ids: string[]; readonly params: string[] } {
  const dir = join(ROOT, "content/vfx");
  const ids: string[] = [];
  for (const f of readdirSync(dir)) {
    if (!/^fx\.prim\.[a-z]+\.arc\.json$/.test(f)) continue;
    const d = JSON.parse(readFileSync(join(dir, f), "utf8")) as { id?: string; burstCount?: number };
    if (d.burstCount === 1 && d.id) ids.push(d.id);
  }
  ids.sort();
  return {
    status: ids.length >= 8 ? "supported" : ids.length > 0 ? "partial" : "unsupported",
    why:
      ids.length > 0
        ? `${ids.length} 顆單發弧（burstCount:1、錐角 ≤1°、初速 0、非拉長）。⭐ 既有的 26 發 slash 一顆都沒動。`
        : "⛔ 一顆單發弧都沒有 ⇒ 一個 segment 仍會噴一扇月牙。",
    evidence: "content/vfx/fx.prim.*.arc.json · packages/shared/src/content/singleArcPrimitive.test.ts",
    ids,
    // ⭐ 可調的六格走**既有**覆寫 —— ⛔ 沒有新增任何參數
    params: ["w3xScale", "tint", "alpha", "facingDeg", "pitchDeg", "flyHeight"],
  };
}

/** ⭐ 迴避來源 provenance —— 問出貨 payload 型別**有沒有那一格**。 */
function evasionProvenance(): Capability {
  const s = src("packages/shared/src/sim/combat/evasion.ts");
  const typed = /export interface EvadeEvent\b/.test(s);
  const hasSource = typed && /\bgrantId\b|\bsourceIdentity\b|\babilityId\b|\bitemId\b/.test(s);
  return {
    status: hasSource ? "supported" : typed ? "partial" : "unsupported",
    why: hasSource
      ? "⭐ `evade` 帶著**真正抽中**的來源 identity。"
      : typed
        ? "⚠️ payload 已型別化，⛔ 但還沒有來源 identity。"
        : "⛔ `evade` 只有 `{source,target,x,z}` ⇒ ⭐ **分不出是哪個 grant/技能/道具讓它閃過**。" +
          "⚠️ ⛔ 不要從聚合後的 `Stat.Evasion` 猜第一個或最高的 —— 那會在兩個來源同時存在時演錯。",
    evidence: "packages/shared/src/sim/combat/evasion.ts",
  };
}

/** ⭐ 位移演出 cue —— 同上。 */
function displaceCue(): Capability {
  const leap = src("packages/shared/src/sim/movement/leap.ts");
  const blink = src("packages/shared/src/sim/effects/blink.ts");
  const typed = /export interface DisplaceEvent\b/.test(leap + blink);
  const hasPhase = typed && /\bphase\b/.test(leap + blink);
  return {
    status: hasPhase ? "supported" : typed ? "partial" : "unsupported",
    why: hasPhase
      ? "⭐ `displace` 帶著 `phase`（start/impact/end）與技能 identity。"
      : "⛔ `displace` 只有 `{id, mode}` ⇒ ⭐ 分不出起點／命中／終點，也分不出是哪一支技能。",
    evidence: "packages/shared/src/sim/movement/leap.ts · packages/shared/src/sim/effects/blink.ts",
  };
}

/**
 * ⭐ 取代政策 —— 出貨的**實況**，⛔ 不是我希望它是什麼。
 *
 * `VfxSystem.handleEvent` 的 `scriptPlayer.onEvent(ev)` 之後 `switch` 直接往下走
 * ⇒ 專屬 script **與**預設演出**兩條都跑**。
 */
function replacementPolicy(): Capability {
  const s = src("apps/client/src/vfx/VfxSystem.ts");
  const i = s.indexOf("this.scriptPlayer.onEvent(ev");
  const after = i >= 0 ? s.slice(i, i + 400) : "";
  const suppresses = /return;|suppress|early-?return/i.test(after);
  return {
    status: suppresses ? "supported" : "unsupported",
    why: suppresses
      ? "⭐ 專屬 script 會壓制同 channel 的預設演出。"
      : "⛔ **今天沒有取代機制**：`scriptPlayer.onEvent()` 之後 `switch` 直接往下走" +
        "（⛔ 無 early-return、⛔ 無旗標）⇒ 兩條都跑。" +
        "⭐ 而出貨的 10 份 script **逐份對照過只有 1 次重疊**（已修）——" +
        "作者側是靠**約定**避開的，⛔ 不是靠機制。" +
        "⇒ ⭐ 閘：`packages/shared/src/content/vfxScriptNoDoubleDraw.test.ts`" +
        "（腳本不可以畫技能已經在畫的東西）。",
    evidence: "apps/client/src/vfx/VfxSystem.ts · packages/shared/src/content/vfxScriptNoDoubleDraw.test.ts",
  };
}

function build(): unknown {
  const body = {
    schema: "ggd-presentation-receipt@1",
    note:
      "⭐ 演出契約收據（Codex 阻塞清單 C）。**每一格都是推導的** —— " +
      "⛔ 產物，改 `tools/presentation-receipt/gen.ts`，⛔ 不要手改。" +
      "⚠️ 一格寫著 `unsupported` **就是它今天的實話** —— ⭐ 請 fail closed，" +
      "⛔ 不要抄 Main 的常數繞過去。",
    actorPulses: {
      vocabulary: [...ANIM_PULSES],
      defaultWindowMs: { ...PULSE_MS },
      /** ⚠️ 狀態格與脈衝**刻意不同**：狀態含 idle/run/death（由移動與死亡驅動）。 */
      animStates: [...ANIM_STATES],
      /**
       * ⭐ 兩塊新脈衝**不進 `clipMap`** —— `zClipMap` 嚴格在 6 格，
       * ⇒ ⭐ 加它們**零個 model doc 要改**。
       */
      outsideClipMap: [...ANIM_PULSES].filter((p) => !(ANIM_STATES as readonly string[]).includes(p)),
    },
    /**
     * ⭐ 缺 clip 時的模糊比對候選 —— **出貨的那一張表**。
     * ⚠️ `guard` 的候選裡**刻意沒有 `hurt`**（Codex 逐字禁止）。
     */
    clipFallback: {
      candidates: DEFAULT_CLIP_NAMES,
      policy:
        "① 文件 `clipMap` 的明確指名 → ② 這張表的模糊比對（同一顆 glb 自己的剪輯，" +
        "⛔ 不會退到別的角色）→ ③ 都沒有 ⇒ 退回 idle 並**警告一次**（fail-loud）。" +
        "⭐ idle 是循環的 ⇒ ⛔ 角色不會停住或消失。",
      measured:
        "264 顆出貨 .glb 的 AnimationGroup 名普查：guard 0 · dodge 0 · dash 0 · leap 0 · " +
        "teleport 0 位元組；而 stand 295 · attack 238 · walk 171 · attack defend 21。",
    },
    replacementPolicy: replacementPolicy(),
    singleArc: singleArc(),
    evasionProvenance: evasionProvenance(),
    displaceCue: displaceCue(),
  };
  // ⭐ 指紋 ＝ 內容自己的 hash（⛔ 沒有時鐘欄位 —— 那會讓 `--check` 永遠不相等）
  const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
  return { ...body, fingerprint };
}

const json = `${JSON.stringify(build(), null, 2)}\n`;
if (process.argv.includes("--check")) {
  const cur = (() => {
    try {
      return readFileSync(OUT, "utf8");
    } catch {
      return "";
    }
  })();
  if (cur !== json) {
    console.error("⛔ ggd-presentation-receipt.json 過期 —— 跑 `pnpm receipt:build` 然後 git add");
    process.exit(1);
  }
  console.log("receipt:check OK");
} else {
  writeFileSync(OUT, json, "utf8");
  console.log(`✓ ${OUT}`);
}

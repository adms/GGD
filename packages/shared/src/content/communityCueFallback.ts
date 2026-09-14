/**
 * ⭐ 社群技能「作者沒有挑施法特效」的**載入時**退路（lane lol-vfx，2026-09-15）。
 *
 * ── 它補的洞 ─────────────────────────────────────────────────────────────
 * 七名 LOL 英雄（`tools/ship-81/lol7.py` 上架）× Q/W/E/R/EX ＝ 35 支主動技**沒有 `vfxKey`**：
 * 它們的作者稿（`heroForge/communityExamples.ts` 的預設演出）只有身體動作＋浮字，
 * 而 `lol7.py` 沒有像 `gen.py` 那樣接 `resolvedVfxId`（它們的 recipe 根本沒有那一格）。
 * ⇒ `VfxSystem` 的 `abilityCast` 讀 `Abilities.tryGet(id).vfxKey` 拿到 undefined ⇒ 施法畫不出粒子
 * （失敗形態②：做了、出貨了，玩家看不到）。
 *
 * ── ⭐ 這一支**不發明規則** ───────────────────────────────────────────────
 * 挑哪一份特效由 `communityCastCue`（`heroForge/communityAcquiredPresentation.ts`）決定 ——
 * 那是編輯器替社群範例英雄產施法提示的**同一支**函式（模板家族 → 光束／脈衝、自身／落點／目標）。
 * ⛔ 沒有任何一行認得 `lol-`，⛔ 沒有逐 id 手挑（第〇·五守則）。
 *
 * ── 為什麼在**載入時**（第〇·四守則）───────────────────────────────────
 * 值從規則解析、⛔ 不烘進 `content/abilities/*.json`：規則一改，每一支跟著變。
 * 接在 `registries.ts` 的技能註冊接縫（standalone 與 champion-embedded 兩條路），
 * 與級距解析同一格 ⇒ 遊戲、客戶端、後台預覽讀到同一個答案。
 *
 * ── 誰**不**歸它管（回傳 null，原封不動）─────────────────────────────────
 * · 作者已經寫了 `vfxKey` 或 `vfxLayers`（作者的判斷永遠贏）
 * · 不是施法格（PASSIVE／道具／增益卡）
 * · 不是**單一**模板卡的技能（規則讀的是一個模板家族；多卡堆疊讀不懂 ⇒ ⛔ 不硬塞）
 * · 模板家族屬於「學到的被動佔主動格」（沒有施法事件）
 * · 規則要求「投射物命中時」才播 —— 施法層表達不了命中時機 ⇒ ⛔ 不假裝翻過去
 *
 * ── rollback ─────────────────────────────────────────────────────────────
 * `config.vfx-scripts@1.communityCueFallback:false` ⇒ `withCommunityCueFallback` 回傳**同一個物件**
 * （逐位元回到這一支存在之前）。
 */
import type { TemplateDoc } from "./schema/template";
import type { AbilityVfxLayer } from "./schema/abilityVfx";
import { DEFAULT_VFX_SCRIPTS } from "./schema/config/vfxScripts";
import { normalizeTemplateBinding } from "./templates/expand";
import {
  communityCastCue,
  communityThemeFor,
  isCastlessCommunityMove,
} from "./heroForge/communityAcquiredPresentation";

const CAST_SLOTS: ReadonlySet<string> = new Set(["Q", "W", "E", "R", "EX"]);
/** 規則的錨點 → 施法層的 `attachTo`。⚠️ `target` 沒有對應（同 `tools/ship-81/gen.py` 記過的引擎缺口）⇒ 省略＝施法者。 */
const ATTACH: Readonly<Record<string, AbilityVfxLayer["attachTo"]>> = { self: "caster", point: "point" };

export interface CommunityCuePick {
  readonly vfxKey: string;
  readonly vfxLayers: readonly AbilityVfxLayer[];
  /** 規則說了、而施法層表達不了的那幾格 —— 逐支回報，⛔ 不假裝翻過去了。 */
  readonly unexpressed: readonly string[];
}

function hasAuthoredVfx(doc: Readonly<Record<string, unknown>>): boolean {
  const layers = doc["vfxLayers"];
  return Boolean(doc["vfxKey"]) || (Array.isArray(layers) && layers.length > 0);
}

/** 這一支技能照社群施法提示規則該補什麼；`null` ＝ 不歸這條規則管（見檔頭）。 */
export function communityCueFallbackFor(
  doc: Readonly<Record<string, unknown>>,
  templates: ReadonlyMap<string, TemplateDoc>,
  slot: unknown = doc["slot"],
): CommunityCuePick | null {
  if (!CAST_SLOTS.has(String(slot)) || hasAuthoredVfx(doc)) return null;
  if (doc["template"] === undefined || doc["template"] === null) return null;
  let cards;
  try {
    cards = normalizeTemplateBinding(doc["template"]).cards;
  } catch {
    return null;
  }
  if (cards.length !== 1) return null;
  const family = templates.get(cards[0]!.ref)?.family;
  if (!family) return null;
  // ⭐ 出貨的 58 份 `tpl-*` 全部是 `id === "tpl-" + family`，編譯出來的 `hero-template.*` 帶著同一個 family。
  const move = { ref: `tpl-${family}`, params: (cards[0]!.params ?? {}) as Record<string, unknown>, abilityOverrides: doc };
  if (isCastlessCommunityMove(move)) return null;
  const cue = communityCastCue(move, communityThemeFor(String(doc["id"] ?? "").split(".")[0] ?? ""));
  if (cue.on !== "castEffect") return null;
  // 規則省略 `at` ⇒ 與施法層省略 `attachTo` 同義（施法者）。
  const attachTo = cue.at === undefined ? undefined : ATTACH[cue.at];
  const unexpressed = [
    ...(cue.at !== undefined && !attachTo ? [`at:${cue.at}`] : []),
    ...(cue.offsetForwardU !== undefined ? [`offsetForwardU:${cue.offsetForwardU}`] : []),
  ];
  const layer: AbilityVfxLayer = {
    vfxKey: cue.vfxId,
    ...(attachTo ? { attachTo } : {}),
    ...(cue.tint ? { tint: cue.tint } : {}),
    ...(cue.w3xScale !== undefined ? { w3xScale: cue.w3xScale } : {}),
    ...(cue.flyHeight !== undefined ? { flyHeight: cue.flyHeight } : {}),
  };
  return { vfxKey: cue.vfxId, vfxLayers: [layer], unexpressed };
}

/** 後台那一格：`config.vfx-scripts@1.communityCueFallback`。缺文件／缺欄位 ⇒ 出貨預設（開）。 */
export function communityCueFallbackEnabled(configDocs: readonly { schema?: string }[]): boolean {
  const doc = configDocs.find((c) => c.schema === "config.vfx-scripts@1") as { communityCueFallback?: boolean } | undefined;
  return doc?.communityCueFallback ?? DEFAULT_VFX_SCRIPTS.communityCueFallback;
}

/**
 * 註冊接縫用：`resolved` 是展開＋級距解析之後的技能，`source` 是磁碟上那一份（帶 `template`）。
 * 開關關掉、或規則不歸它管 ⇒ 回傳**同一個物件**。
 */
export function withCommunityCueFallback<T extends object>(
  resolved: T,
  source: Readonly<Record<string, unknown>>,
  templates: ReadonlyMap<string, TemplateDoc>,
  enabled: boolean,
  slot?: string,
): T {
  if (!enabled || hasAuthoredVfx(resolved as Record<string, unknown>)) return resolved;
  const pick = communityCueFallbackFor(source, templates, slot ?? source["slot"]);
  return pick ? { ...resolved, vfxKey: pick.vfxKey, vfxLayers: pick.vfxLayers } : resolved;
}

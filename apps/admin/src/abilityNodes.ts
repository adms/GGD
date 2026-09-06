/**
 * 🧩 技能積木 —— 後台的**節點編輯**那一半（GH#992 Scope 2）。
 *
 * owner 2026-09-05：「後台編輯器的抽象化、完整性、視覺化可操作性很重要，因為所有功能
 * 都要可JSON操作設定，並且也有 no code 遊戲引擎等級的操作介面」。
 *
 * ════════════════════════════════════════════════════════════════════════════
 * 三件事，三個來源，⛔ 沒有第四個
 * ════════════════════════════════════════════════════════════════════════════
 * | 東西 | 來源 | 為什麼只有這一個 |
 * |---|---|---|
 * | **有哪些積木** | `docs/editor-contract/ggd-bricks.json`（#989 的清冊，`bricks:build` 的產物） | 第〇·四守則：清冊已經是「有哪些積木、誰在用」的唯一答案；這裡再從 union 抄一份就是第二個住處。`abilityNodes.test.ts` 逐顆對出貨的 `zEffectDefUnion`，兩邊都要 |
 * | **每顆積木的表單** | 出貨的 Zod（`zEffectDefUnion.optionsMap`）走 `walkZod` | 與後台設定引擎同一支走訪器（`configForms/engine.ts` 的檔頭講過為什麼不寫第二支） |
 * | **試放** | `apps/editor/src/preview/PreviewController.ts` 的 `createSimPreviewController()`（`editor:accept` 的 sim-preview harness） | 票文：「預覽借 `editor:accept` 的 sim-preview／framebuffer harness，⛔ 不另寫渲染」 |
 *
 * ⚠️ **試放的是線上生效的那一份**（bundle ⊕ overlay 走 `registerAll`），⛔ 不是草稿：
 * 草稿要先儲存。理由：把一份 authoring JSON 變成 sim 讀的 `AbilityDef` 要走模板展開與
 * 五級距解析（`registerAll` 做的事），而在這裡再走一次就是第二條會漂的路。
 *
 * ⚠️ **這裡只有「鏈路已接上」**：試放回傳的是 SimWorld 排出來的事件（資料），⛔ 不是
 * 像素。玩家看得到的畫面由 `editor:accept` 的 framebuffer harness 負責（`editorQaUrl`
 * 開的就是那一條路），沒有 `@visual-proof` 證據前不准說「預覽做完」。
 *
 * ⚠️ 這個模組**沒有 React**：頁面在 `ui/AbilityNodesPage.tsx`，邏輯在這裡，測試餵真的
 * Zod 與真的清冊，⛔ 不掃字串。
 */
import bricksJson from "../../../docs/editor-contract/ggd-bricks.json";
import { zEffectDefUnion } from "@ggd/shared/content/schema/effects/index";
import {
  BundleContentSource,
  ContentLoader,
  OverlayContentSource,
  emptyOverlayBundle,
  registerAll,
  type OverlayBundle,
} from "@ggd/shared/content";
import { Abilities, Champions } from "@ggd/shared/sim/content/registry";
import type { AbilityId, ChampionId } from "@ggd/shared/ids";
import type { CastableSlot } from "@ggd/shared/sim";
import { walkZod, defaultValueFor } from "../../editor/src/form/walk";
import type { UINode } from "../../editor/src/form/uiSchema";
import { createSimPreviewController } from "../../editor/src/preview/PreviewController";
import { api } from "./api";
import { validateOverlayDoc } from "./contentOverlay";

// ─────────────────────────────────────────────────────── 積木清冊 ──────────

interface BrickRecord {
  id: string;
  layer: string;
  params: { name: string; type: string; optional?: boolean }[];
  usedBy?: number;
  adminForm?: boolean;
  editorForm?: boolean;
}

const BRICKS = bricksJson as unknown as { schema: string; bricks: BrickRecord[] };

/** 清冊上 `layer: "effect"` 的那 47 顆 —— 「可以加哪一顆」的**唯一**來源。 */
/** 🧩 技能積木頁存進哪個 collection —— `tools/brick-census/bricks.ts::adminSurface()` 讀這一格（後台開得了 abilities 的證據來自頁面本身）。 */
export const ABILITY_NODES_COLLECTION = "abilities" as const;

export const EFFECT_BRICKS: readonly BrickRecord[] = BRICKS.bricks.filter((b) => b.layer === "effect");

/** 積木下拉：用得多的排前面（`usedBy` 是清冊量到的引用數）。 */
export function brickPalette(): { id: string; params: number; usedBy: number }[] {
  return [...EFFECT_BRICKS]
    .map((b) => ({ id: b.id, params: b.params.length, usedBy: b.usedBy ?? 0 }))
    .sort((a, b) => b.usedBy - a.usedBy || a.id.localeCompare(b.id));
}

/** 出貨 union 的 kind 清單（`abilityNodes.test.ts` 拿它對清冊，兩個方向）。 */
export function shippedEffectKinds(): string[] {
  return zEffectDefUnion.options.map((o) => String(o.shape.kind.value));
}

// ─────────────────────────────────────────────────────── 表單推導 ──────────

/** 一格：純量畫輸入框；`json` 是走訪器歸成分支的東西（陣列／巢狀 effect），畫 JSON 框。 */
export interface BrickRow {
  path: string;
  kind: "number" | "boolean" | "enum" | "text" | "json";
  zh: string;
  note: string;
  optional: boolean;
  options?: string[];
  optionLabels?: Record<string, string>;
  int?: boolean;
  min?: number;
  max?: number;
}

const DIRECTIVE = /^@(zh|note|opt|order)[ \t]+([\s\S]*?)(?=\n@(?:zh|note|opt|order)[ \t]|$)/gm;

/** 與 `configForms/schemaToForm.ts` 同一套行首指令；沒有指令 ⇒ 整段當 note。 */
function labelOf(node: UINode): Pick<BrickRow, "zh" | "note" | "optionLabels"> {
  const raw = node.description;
  const out: Pick<BrickRow, "zh" | "note" | "optionLabels"> = { zh: "", note: "" };
  if (!raw) return out;
  let matched = false;
  const opt: Record<string, string> = {};
  for (const m of raw.matchAll(DIRECTIVE)) {
    matched = true;
    const value = m[2]!.trim();
    if (m[1] === "zh") out.zh = value;
    else if (m[1] === "note") out.note = value;
    else if (m[1] === "opt") {
      const sep = value.search(/[ \t]/);
      if (sep > 0) opt[value.slice(0, sep)] = value.slice(sep + 1).trim();
    }
  }
  if (!matched) out.note = raw.trim();
  if (Object.keys(opt).length > 0) out.optionLabels = opt;
  return out;
}

/** 表單走多深：一顆積木自己的欄位 ＋ 兩層巢狀物件；再深的（巢狀 effect 陣列）走 JSON 框。 */
export const BRICK_FORM_DEPTH = 3;

/** 出貨 union 裡這一顆 kind 的 schema；清冊上有而 union 沒有 ⇒ 回 null（測試會先抓到）。 */
export function brickSchema(kind: string): unknown | null {
  return zEffectDefUnion.optionsMap.get(kind) ?? null;
}

/**
 * 一顆積木 ⇒ 一張表單（從 Zod 推導，⛔ 不手打）。
 *
 * `kind` 那一格是 literal，⛔ 不畫（它是這顆積木的身分，改它等於換一顆）。
 */
export function brickForm(kind: string): BrickRow[] {
  const schema = brickSchema(kind);
  return schema ? formFromSchema(schema, kind) : [];
}

/** 同上，但吃任何一顆 Zod（測試拿 `.omit()` 過的變體驗「拿掉一格 ⇒ 少一列」）。 */
export function formFromSchema(schema: unknown, label: string): BrickRow[] {
  const root = walkZod(schema as never, "", label, { maxDepth: BRICK_FORM_DEPTH });
  const rows: BrickRow[] = [];
  const visit = (node: UINode): void => {
    if (node.path === "kind") return;
    switch (node.kind) {
      case "object":
        for (const f of node.fields) visit(f);
        return;
      case "number":
        rows.push({
          path: node.path,
          kind: "number",
          optional: node.optional,
          int: node.int,
          ...(node.min !== undefined ? { min: node.min } : {}),
          ...(node.max !== undefined ? { max: node.max } : {}),
          ...labelOf(node),
        });
        return;
      case "boolean":
        rows.push({ path: node.path, kind: "boolean", optional: node.optional, ...labelOf(node) });
        return;
      case "enum":
        rows.push({
          path: node.path,
          kind: "enum",
          optional: node.optional,
          options: node.options.map(String),
          ...labelOf(node),
        });
        return;
      case "text":
        rows.push({ path: node.path, kind: "text", optional: node.optional, ...labelOf(node) });
        return;
      case "literal":
        return;
      default:
        // 陣列／record／巢狀 union／超過深度的 —— 誠實地畫 JSON 框，⛔ 不假裝它是純量。
        rows.push({ path: node.path, kind: "json", optional: node.optional, ...labelOf(node) });
        return;
    }
  };
  visit(root);
  return rows;
}

/** 一顆新積木的起始值：required 欄位帶走訪器的預設（滿足自己的上下界），`kind` 帶上。 */
export function newEffect(kind: string): Record<string, unknown> {
  const schema = brickSchema(kind);
  if (!schema) return { kind };
  const root = walkZod(schema as never, "", kind, { maxDepth: BRICK_FORM_DEPTH });
  const seeded = defaultValueFor(root);
  const base = seeded && typeof seeded === "object" && !Array.isArray(seeded) ? (seeded as Record<string, unknown>) : {};
  return { ...base, kind };
}

// ─────────────────────────────────────────────────────── 文件操作 ──────────

/** 點路徑取值（`amount.flat`）。 */
export function getAt(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const k of path.split(".")) {
    if (!cur || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

/** 點路徑寫值（不可變）；`value === undefined` ⇒ 刪掉那一格（選填欄位留白）。 */
export function setAt(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split(".");
  const rec = (cur: Record<string, unknown>, i: number): Record<string, unknown> => {
    const k = keys[i]!;
    const next = { ...cur };
    if (i === keys.length - 1) {
      if (value === undefined) delete next[k];
      else next[k] = value;
      return next;
    }
    const child = cur[k];
    next[k] = rec(child && typeof child === "object" && !Array.isArray(child) ? (child as Record<string, unknown>) : {}, i + 1);
    return next;
  };
  return rec(obj, 0);
}

/** 一格輸入框的字面值 ⇒ 要寫進文件的值，或一句拒絕理由。 */
export function parseRowInput(row: BrickRow, text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = text.trim();
  if (t === "") {
    if (row.optional) return { ok: true, value: undefined };
    return { ok: false, error: "必填" };
  }
  switch (row.kind) {
    case "number": {
      const n = Number(t);
      if (!Number.isFinite(n)) return { ok: false, error: "要是一個數字" };
      if (row.int && !Number.isInteger(n)) return { ok: false, error: "要是整數" };
      if (row.min !== undefined && n < row.min) return { ok: false, error: `不可以小於 ${row.min}` };
      if (row.max !== undefined && n > row.max) return { ok: false, error: `不可以大於 ${row.max}` };
      return { ok: true, value: n };
    }
    case "boolean":
      if (t === "true" || t === "false") return { ok: true, value: t === "true" };
      return { ok: false, error: "只收 true / false" };
    case "enum":
      if (row.options?.includes(t)) return { ok: true, value: t };
      return { ok: false, error: `只收 ${row.options?.join(" / ")}` };
    case "text":
      return { ok: true, value: t };
    case "json":
      try {
        return { ok: true, value: JSON.parse(t) };
      } catch (e) {
        return { ok: false, error: `不是合法 JSON：${e instanceof Error ? e.message : String(e)}` };
      }
  }
}

/** 畫面上那一格的字面值（讀文件）。 */
export function rowInputValue(row: BrickRow, effect: Record<string, unknown>): string {
  const v = getAt(effect, row.path);
  if (v === undefined) return "";
  if (row.kind === "json") return JSON.stringify(v, null, 2);
  return String(v);
}

/** 效果清單那一列的一句話：kind ＋ 幾個一眼看得出差別的純量。 */
export function summarizeEffect(effect: Record<string, unknown>): string {
  const kind = String(effect.kind ?? "?");
  const bits: string[] = [];
  for (const [k, v] of Object.entries(effect)) {
    if (k === "kind") continue;
    if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") bits.push(`${k}=${String(v)}`);
    else if (v && typeof v === "object") bits.push(`${k}={…}`);
    if (bits.length >= 4) break;
  }
  return bits.length > 0 ? `${kind} · ${bits.join(" ")}` : kind;
}

export function effectsOf(doc: unknown): Record<string, unknown>[] {
  const arr = (doc as { effects?: unknown } | null)?.effects;
  return Array.isArray(arr) ? (arr as Record<string, unknown>[]) : [];
}

export function docWithEffects(doc: unknown, effects: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { ...(doc as Record<string, unknown>), effects: [...effects] };
}

export function moveEffect<T>(list: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return [...list];
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to, 0, it!);
  return out;
}

/** 整份技能文件過出貨 Zod（`putOverlayDoc` 寫入前的那一道閘，同一支函式）。 */
export function validateAbilityDoc(id: string, doc: unknown): string | null {
  const v = validateOverlayDoc(ABILITY_NODES_COLLECTION, id, doc);
  return v.ok ? null : v.error;
}

// ─────────────────────────────────────────────────────── 試放 ──────────────

export interface PreviewSummary {
  accepted: boolean;
  reason: string | null;
  route: "cast" | "passive";
  eventCount: number;
  /** 事件型別 → 次數（照第一次出現的順序）。 */
  eventTypes: { type: string; count: number }[];
  manaBefore: number;
  manaAfter: number;
  cooldownTicks: number;
}

let registriesReady: Promise<string> | null = null;

/** 平台的覆蓋層 bundle（`getOverlayDoc` 讀的同一個端點）；讀不到就當空的 —— 試放仍然走出貨。 */
async function fetchOverlayBundle(): Promise<OverlayBundle> {
  try {
    const body = await api.request<Partial<OverlayBundle>>("/content-overlay/bundle");
    return {
      generation: typeof body?.generation === "number" ? body.generation : 0,
      docs: body?.docs ?? {},
      deleted: body?.deleted ?? {},
    };
  } catch {
    return emptyOverlayBundle();
  }
}

/**
 * 把**線上生效**的內容樹（出貨 bundle ⊕ 覆蓋層）灌進 sim 的登錄表 —— 與 shard 開機同一條
 * `registerAll`。回傳 contentVersion。`force` ＝ 存檔之後重灌一次（覆蓋層變了）。
 */
export function ensureRegistries(force = false): Promise<string> {
  if (registriesReady && !force) return registriesReady;
  registriesReady = (async () => {
    const overlay = await fetchOverlayBundle();
    const base = new BundleContentSource({
      baseUrl: "/content",
      fetchFn: (input, init) => globalThis.fetch(input, init),
    });
    const result = await new ContentLoader(new OverlayContentSource(base, overlay)).load({ policy: "fail-closed" });
    registerAll(result.store);
    return result.manifest.contentVersion;
  })();
  registriesReady.catch(() => {
    registriesReady = null;
  });
  return registriesReady;
}

export function championIdOf(abilityId: string): string {
  return abilityId.slice(0, abilityId.lastIndexOf("."));
}

/**
 * 真的把這一發打出去：`PreviewDriver → IntentFrame → world.step()`（`editor:accept` 的
 * `audit-sim-preview.ts` 走的同一支 controller）。純被動走 `triggerPassiveAbility`。
 */
export async function previewCast(abilityId: string): Promise<PreviewSummary> {
  await ensureRegistries();
  const ability = Abilities.tryGet(abilityId as AbilityId);
  if (!ability) throw new Error(`登錄表裡沒有 ${abilityId} —— 它不在出貨 bundle 也不在覆蓋層裡`);
  const champion = Champions.tryGet(championIdOf(abilityId) as ChampionId);
  if (!champion) throw new Error(`登錄表裡沒有英雄 ${championIdOf(abilityId)}`);
  const controller = createSimPreviewController();
  try {
    const passive = ability.slot === "PASSIVE" || ability.effects.length === 0;
    const trace = passive
      ? controller.triggerPassiveAbility(champion, ability.id, { level: 18, rank: 1 })
      : controller.castAbility(champion, ability.slot as CastableSlot, { level: 18, rank: 1 });
    const counts = new Map<string, number>();
    for (const ev of trace.events) counts.set(ev.type, (counts.get(ev.type) ?? 0) + 1);
    return {
      accepted: trace.accepted,
      reason: trace.reason ?? null,
      route: passive ? "passive" : "cast",
      eventCount: trace.events.length,
      eventTypes: [...counts].map(([type, count]) => ({ type, count })),
      manaBefore: trace.manaBefore,
      manaAfter: trace.manaAfter,
      cooldownTicks: trace.cooldownTicks,
    };
  } finally {
    controller.dispose();
  }
}

/**
 * `editor:accept` 的 framebuffer 擷取走的那一條路：鑄技工坊的 QA 路由
 * （`tools/editor-acceptance/capture-browser-proof.mjs` 開的就是 `/editor/vfx-forge?qa=accept-46&ids=…`）。
 * ⚠️ 這裡只給連結 —— 像素證據由那支 harness 產，⛔ 後台不另寫渲染。
 */
export function editorQaUrl(editorBase: string, abilityId: string): string {
  const origin = editorBase.replace(/\/editor\/?$/, "").replace(/\/+$/, "");
  return `${origin}/editor/vfx-forge?qa=accept-46&ids=${encodeURIComponent(abilityId)}`;
}

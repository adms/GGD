import { z } from "zod";
import rawTypeCatalog from "../../../../docs/editor-contract/ggd-type-catalog.json";

/**
 * Main-owned machine contract for the Skill Forge template picker.
 *
 * Do not infer availability from template.status. Main deliberately measures a
 * real expand(defaults) call and publishes the result here; a green declaration
 * is not proof that a type produces anything.
 */
const zFillsVia = z.enum(["spawnModelFx.preset", "template.ref → expand()"]);
const zCatalogParam = z.object({
  fillsVia: zFillsVia,
  inert: z.string().min(1).nullable(),
}).passthrough();
const zCatalogType = z.object({
  id: z.string().min(1),
  expands: z.boolean(),
  wiring: z.enum(["node", "doc", "both"]),
  inertParams: z.array(z.string()),
  params: z.record(z.string(), zCatalogParam),
}).passthrough();
const zTypeCatalog = z.object({
  schema: z.literal("ggd-type-catalog@1"),
  counts: z.object({
    templates: z.number().int().nonnegative(),
    pickable: z.number().int().nonnegative(),
    analysedButUnwired: z.number().int().nonnegative(),
    shells: z.number().int().nonnegative(),
    sentinels: z.number().int().nonnegative(),
    inertParamsAcrossPickable: z.number().int().nonnegative(),
  }).passthrough(),
  howToFailClosed: z.array(z.string()).min(6),
  types: z.array(zCatalogType),
  analysedButUnwired: z.array(z.object({ id: z.string().min(1) }).passthrough()),
  shells: z.array(z.object({ id: z.string().min(1) }).passthrough()),
  sentinels: z.array(z.object({ id: z.string().min(1) }).passthrough()),
}).passthrough();

export type TypeCatalog = z.infer<typeof zTypeCatalog>;
export type TypeCatalogEntry = z.infer<typeof zCatalogType>;
export type TemplateWiringContext = "doc" | "node";

export interface TemplateSelectionDecision {
  readonly selectable: boolean;
  readonly reason: string | null;
  readonly entry: TypeCatalogEntry | null;
}

export interface TemplateParamDecision {
  readonly editable: boolean;
  readonly reason: string | null;
  readonly fillsVia: z.infer<typeof zFillsVia> | null;
}

const parsed = zTypeCatalog.safeParse(rawTypeCatalog as unknown);

export const GGD_TYPE_CATALOG: TypeCatalog | null = parsed.success ? parsed.data : null;
export const GGD_TYPE_CATALOG_ERROR = parsed.success
  ? null
  : `ggd-type-catalog.json 不符合 ggd-type-catalog@1：${parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"} ${issue.message}`)
      .join("；")}`;

const byId = new Map((GGD_TYPE_CATALOG?.types ?? []).map((entry) => [entry.id, entry] as const));
const analysedButUnwired = new Set(
  (GGD_TYPE_CATALOG?.analysedButUnwired ?? []).map((entry) => entry.id),
);
const shells = new Set((GGD_TYPE_CATALOG?.shells ?? []).map((entry) => entry.id));
const sentinels = new Set((GGD_TYPE_CATALOG?.sentinels ?? []).map((entry) => entry.id));

function routeAllowed(entry: TypeCatalogEntry, context: TemplateWiringContext): boolean {
  return entry.wiring === "both" || entry.wiring === context;
}

export function templateSelectionDecision(
  templateId: string,
  context: TemplateWiringContext,
): TemplateSelectionDecision {
  if (GGD_TYPE_CATALOG === null) {
    return { selectable: false, reason: GGD_TYPE_CATALOG_ERROR ?? "type catalog 無法讀取", entry: null };
  }
  const entry = byId.get(templateId) ?? null;
  if (entry === null) {
    const reason = analysedButUnwired.has(templateId)
      ? "分析已完成但 Main 尚未接上展開路徑"
      : shells.has(templateId)
        ? "目前只有空殼，沒有可執行的展開結果"
        : sentinels.has(templateId)
          ? "這是分類哨兵，不是可建立技能的模板"
          : "Main type catalog 沒有此模板；依 fail-closed 規則禁止選用";
    return { selectable: false, reason, entry: null };
  }
  if (!entry.expands) {
    return { selectable: false, reason: "Main 實測 expand(defaults) 失敗", entry };
  }
  if (!routeAllowed(entry, context)) {
    return {
      selectable: false,
      reason: context === "doc"
        ? `此模板 wiring=${entry.wiring}，只能填入 spawnModelFx.preset，不能當技能模板卡`
        : `此模板 wiring=${entry.wiring}，只能填入 template.ref，不能當節點 preset`,
      entry,
    };
  }
  return { selectable: true, reason: null, entry };
}

export function pickableTemplateIds(context: TemplateWiringContext): ReadonlySet<string> {
  if (GGD_TYPE_CATALOG === null) return new Set();
  return new Set(
    GGD_TYPE_CATALOG.types
      .filter((entry) => entry.expands && routeAllowed(entry, context))
      .map((entry) => entry.id),
  );
}

export function templateParamDecision(
  templateId: string,
  paramName: string,
  context: TemplateWiringContext,
): TemplateParamDecision {
  const selection = templateSelectionDecision(templateId, context);
  const slot = selection.entry?.params[paramName];
  if (slot === undefined) {
    return {
      editable: false,
      reason: selection.reason ?? "Main type catalog 未列出此參數；依 fail-closed 規則鎖定",
      fillsVia: null,
    };
  }
  if (slot.inert !== null || selection.entry?.inertParams.includes(paramName)) {
    return {
      editable: false,
      reason: `本版不生效：${slot.inert ?? "Main 將此欄列入 inertParams"}`,
      fillsVia: slot.fillsVia,
    };
  }
  const expected = context === "doc" ? "template.ref → expand()" : "spawnModelFx.preset";
  if (slot.fillsVia !== expected) {
    return {
      editable: false,
      reason: `此欄只能透過 ${slot.fillsVia} 填寫；目前正在編輯 ${expected}`,
      fillsVia: slot.fillsVia,
    };
  }
  return { editable: selection.selectable, reason: selection.reason, fillsVia: slot.fillsVia };
}

export function templateContractBlockers(
  templateIds: readonly string[],
  context: TemplateWiringContext,
): string[] {
  return [...new Set(templateIds.flatMap((id) => {
    const decision = templateSelectionDecision(id, context);
    return decision.selectable ? [] : [`模板 ${id} 不可寫入：${decision.reason ?? "未知契約錯誤"}`];
  }))];
}

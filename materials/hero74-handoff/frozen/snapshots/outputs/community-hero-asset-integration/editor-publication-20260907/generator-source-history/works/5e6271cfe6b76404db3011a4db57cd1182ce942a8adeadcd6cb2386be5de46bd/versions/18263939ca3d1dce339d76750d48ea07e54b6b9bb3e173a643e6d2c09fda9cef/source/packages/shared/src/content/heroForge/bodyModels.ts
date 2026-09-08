import { zModelDoc } from "../schema/model";

/** One selection rule for the Editor catalog and Main's trusted importer. */
export function heroBodyModelIds(documents: Iterable<readonly [string, unknown]>): string[] {
  const bound = new Set<string>();
  const models: Array<{ id: string; heroBody?: boolean }> = [];
  for (const [key, raw] of documents) {
    if (key.startsWith("champions/") && raw && typeof raw === "object" && "modelKey" in raw && typeof raw.modelKey === "string") {
      bound.add(raw.modelKey);
    } else if (key.startsWith("models/")) {
      const parsed = zModelDoc.safeParse(raw);
      if (parsed.success && key === `models/${parsed.data.id}`) models.push(parsed.data);
    }
  }
  return [...new Set(models.filter((model) => model.heroBody === true || (model.heroBody !== false && bound.has(model.id))).map((model) => model.id))].sort();
}

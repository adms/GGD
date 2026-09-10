import { contentSha256, canonicalizeJcs } from "@ggd/shared/content/import/jcs";
import { zTemplateDoc, type TemplateDoc } from "@ggd/shared/content/schema/template";
import { ImportStore } from "./importStore";

const workId = (id: string) => `ggd-template.${contentSha256(id).slice(7)}`;

/** Accept only server-owned sources. This store retains definitions, never executable code. */
export function retainHeroTemplates(store: ImportStore, templates: Iterable<unknown>) {
  for (const raw of templates) {
    const parsed = zTemplateDoc.safeParse(raw);
    // Incomplete editor documents remain in full catalog history, but cannot
    // become approved compiler inputs until they satisfy the template schema.
    if (!parsed.success) continue;
    const template = parsed.data, digest = contentSha256(template), id = workId(template.id);
    store.putWorkVersion({ workId: id, projectId: id, packageDigest: digest }, new Map([
      ["template.json", new TextEncoder().encode(canonicalizeJcs(template))],
    ]));
  }
}

export function readHeroTemplateVersion(store: ImportStore, id: string, digest: string): TemplateDoc | undefined {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) return undefined;
  const bytes = store.readWorkFile(workId(id), digest, "template.json");
  if (!bytes) return undefined;
  const template = zTemplateDoc.parse(JSON.parse(bytes.toString("utf8")));
  if (template.id !== id || contentSha256(template) !== digest) throw new Error("模板歷史內容與版本不一致");
  return template;
}

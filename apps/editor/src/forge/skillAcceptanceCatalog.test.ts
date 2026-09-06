import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { ORIGINS, originOf } from "@ggd/shared/content/statNormalization";
import { SKILL_TYPE_PRESETS } from "./skillTypePresets";
import { VFX_FORGE_FIXTURE_SCENES, VFX_FORGE_REFERENCE_SCENES } from "../vfx-forge/acceptanceFixtures";
import { resolveTemplateExpansion } from "@ggd/shared/content/templates/resolve";
import { zTemplateDoc, type TemplateDoc } from "@ggd/shared/content/schema/template";
import { join as joinPath } from "node:path";
import {
  CAPABILITY_ONLY_CONDITION_KINDS,
  CAPABILITY_ONLY_EFFECT_KINDS,
  CAPABILITY_ONLY_HOOK_EVENTS,
  SKILL_ACCEPTANCE_CANDIDATES,
  SKILL_ACCEPTANCE_THEME_IDS,
  STRICT_VISUAL_ACCEPTANCE,
  STRICT_VISUAL_ACCEPTANCE_IDS,
  skillAcceptanceThemeId,
} from "./skillAcceptanceCatalog";

const REPO = fileURLToPath(new URL("../../../../", import.meta.url));
const TPL_DIR_FOR_SCAN = join(REPO, "content/ability-templates");

// ⭐ GH#1067（2026-09-07）：變身技能的 `championForm` 現在住在 `template.params`（`tpl-transform`）——
//   讀原始 JSON 的掃描看不到它（實測：可達變身 14 → 9、`godie-nsjs` 整隻消失）。
//   ⇒ 用**出貨那一支**展開器攤開再掃，⛔ 不是加一張「哪些模板算變身」的手寫表。
const TPL_FOR_SCAN = new Map<string, TemplateDoc>(
  readdirSync(TPL_DIR_FOR_SCAN)
    .filter((f) => f.startsWith("tpl-") && f.endsWith(".json"))
    .map((f) => {
      const t = zTemplateDoc.parse(JSON.parse(readFileSync(join(TPL_DIR_FOR_SCAN, f), "utf8")));
      return [t.id, t] as const;
    }),
);
function expandForScan<T>(doc: T): T {
  const d = doc as unknown as Record<string, unknown>;
  if (!d || typeof d !== "object" || d["template"] === undefined) return doc;
  const res = resolveTemplateExpansion(d, TPL_FOR_SCAN);
  return res.ok ? (res.merged as unknown as T) : doc;
}

const readJson = <T>(path: string): T => expandForScan(JSON.parse(readFileSync(path, "utf8")) as T);

interface CapabilityDoc {
  readonly effectKinds: readonly string[];
  readonly hookEvents: readonly string[];
  readonly conditionLeafKinds: readonly string[];
}

interface AbilityDoc {
  readonly id?: string;
  readonly name?: string;
  readonly slot?: string;
  readonly castType?: string;
  readonly template?: { readonly ref?: string; readonly cards?: readonly { readonly ref?: string }[] };
  readonly [key: string]: unknown;
}

const capabilities = readJson<CapabilityDoc>(join(REPO, "docs/editor-contract/ggd-runtime-capabilities.json"));
const effectVocabulary = new Set(capabilities.effectKinds);
const hookVocabulary = new Set(capabilities.hookEvents);
const conditionVocabulary = new Set(capabilities.conditionLeafKinds);

const abilities = new Map(
  readdirSync(join(REPO, "content/abilities"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<AbilityDoc>(join(REPO, "content/abilities", name)))
    .filter((doc): doc is AbilityDoc & { readonly id: string } => typeof doc.id === "string")
    .map((doc) => [doc.id, doc] as const),
);

const champions = new Map(
  readdirSync(join(REPO, "content/champions"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => readJson<Record<string, unknown>>(join(REPO, "content/champions", name)))
    .filter((doc) => typeof doc.id === "string")
    .map((doc) => [String(doc.id), doc] as const),
);

interface Surface {
  readonly effects: Set<string>;
  readonly hooks: Set<string>;
  readonly conditions: Set<string>;
}

function surfaceOf(value: unknown): Surface {
  const surface: Surface = { effects: new Set(), hooks: new Set(), conditions: new Set() };
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (typeof record.kind === "string") {
      if (effectVocabulary.has(record.kind)) surface.effects.add(record.kind);
      if (conditionVocabulary.has(record.kind)) surface.conditions.add(record.kind);
    }
    if (typeof record.on === "string" && hookVocabulary.has(record.on)) surface.hooks.add(record.on);
    for (const child of Object.values(record)) walk(child);
  };
  walk(value);
  return surface;
}

function templateRefs(doc: AbilityDoc): Set<string> {
  return new Set([
    ...(typeof doc.template?.ref === "string" ? [doc.template.ref] : []),
    ...(doc.template?.cards ?? []).flatMap((card) => typeof card.ref === "string" ? [card.ref] : []),
  ]);
}

function union<K extends keyof Surface>(docs: readonly AbilityDoc[], key: K): Set<string> {
  return new Set(docs.flatMap((doc) => [...surfaceOf(doc)[key]]));
}

describe("鑄技工坊 47 份現有技能驗收清單", () => {
  it("清單固定為 43 個技能主題／47 份實際技能：26 份 Owner 聯集＋21 份 runtime 覆蓋（2026-09-06 GH#1020 ＋小傑猜猜拳）", () => {
    expect(SKILL_ACCEPTANCE_CANDIDATES).toHaveLength(47);
    expect(SKILL_ACCEPTANCE_THEME_IDS.size).toBe(43);
    expect(SKILL_ACCEPTANCE_CANDIDATES.filter((row) => row.group === "owner-union")).toHaveLength(26);
    expect(SKILL_ACCEPTANCE_CANDIDATES.filter((row) => row.group === "runtime-coverage")).toHaveLength(21);
    expect(new Set(SKILL_ACCEPTANCE_CANDIDATES.map((row) => row.id)).size).toBe(47);
    for (const row of SKILL_ACCEPTANCE_CANDIDATES) expect(row.acceptance.length, row.id).toBeGreaterThan(20);
  });

  it("46→42 只來自三組已知鏡像與一條 Avalon 連鎖，沒有名稱碰巧相同造成的暗中合併", () => {
    const grouped = new Map<string, string[]>();
    for (const row of SKILL_ACCEPTANCE_CANDIDATES) {
      const key = skillAcceptanceThemeId(row);
      grouped.set(key, [...(grouped.get(key) ?? []), row.id]);
    }
    expect([...grouped.values()].filter((ids) => ids.length > 1)).toEqual([
      ["godie-hjai.e", "godie-h020.e"],
      ["godie-ogrh.r", "godie-o00x.r"],
      ["godie-e002.ex", "godie-e00l.r", "godie-e00l.ex"],
    ]);
  });

  it("每個候選都指向目前出貨技能，名稱與宣告的必要機制沒有漂移", () => {
    for (const row of SKILL_ACCEPTANCE_CANDIDATES) {
      const doc = abilities.get(row.id);
      expect(doc, `${row.id} 不存在`).toBeDefined();
      expect(doc?.name, `${row.id} 名稱漂移`).toBe(row.name);
      const surface = surfaceOf(doc);
      for (const kind of row.requiredEffectKinds ?? []) {
        expect(surface.effects.has(kind), `${row.id} 缺 effect ${kind}`).toBe(true);
      }
      for (const hook of row.requiredHooks ?? []) {
        expect(surface.hooks.has(hook), `${row.id} 缺 hook ${hook}`).toBe(true);
      }
      for (const kind of row.requiredConditionKinds ?? []) {
        expect(surface.conditions.has(kind), `${row.id} 缺 condition ${kind}`).toBe(true);
      }
      const refs = templateRefs(doc ?? {});
      for (const id of row.requiredTemplateIds ?? []) {
        expect(refs.has(id), `${row.id} 缺 template ${id}`).toBe(true);
      }
    }
  });

  it("14 種快速技能類型、原八個參考場景與 Main 嚴格十一文件一個不少", () => {
    expect(new Set(SKILL_ACCEPTANCE_CANDIDATES.flatMap((row) => row.forgeTypeId ?? []))).toEqual(
      new Set(SKILL_TYPE_PRESETS.map((preset) => preset.id)),
    );
    const vfxIds = new Set(SKILL_ACCEPTANCE_CANDIDATES.filter((row) => row.vfxFixture).map((row) => row.id));
    expect(vfxIds).toEqual(new Set(VFX_FORGE_FIXTURE_SCENES.map(([id]) => id)));
    expect(VFX_FORGE_REFERENCE_SCENES).toHaveLength(8);
    for (const id of STRICT_VISUAL_ACCEPTANCE_IDS) expect(vfxIds.has(id), id).toBe(true);
  });

  it("嚴格八主題直接採用 Main 機器契約，展開後正好 11 份且都在 46 份內", () => {
    expect(STRICT_VISUAL_ACCEPTANCE).toHaveLength(8);
    expect(STRICT_VISUAL_ACCEPTANCE_IDS.size).toBe(11);
    const candidates = new Set(SKILL_ACCEPTANCE_CANDIDATES.map((row) => row.id));
    for (const id of STRICT_VISUAL_ACCEPTANCE_IDS) expect(candidates.has(id), id).toBe(true);
  });

  it("覆蓋目前正式技能實際採用的全部 effect、hook 與 condition", () => {
    const all = [...abilities.values()];
    const selected = SKILL_ACCEPTANCE_CANDIDATES.map((row) => abilities.get(row.id)!);
    expect(union(selected, "effects")).toEqual(union(all, "effects"));
    expect(union(selected, "hooks")).toEqual(union(all, "hooks"));
    expect(union(selected, "conditions")).toEqual(union(all, "conditions"));
  });

  it("capability-only 清單正好是契約有、正式技能沒採用的格，不能冒充已驗收", () => {
    const all = [...abilities.values()];
    const usedEffects = union(all, "effects");
    const usedHooks = union(all, "hooks");
    const usedConditions = union(all, "conditions");
    expect(new Set(CAPABILITY_ONLY_EFFECT_KINDS)).toEqual(
      new Set(capabilities.effectKinds.filter((kind) => !usedEffects.has(kind))),
    );
    expect(new Set(CAPABILITY_ONLY_HOOK_EVENTS)).toEqual(
      new Set(capabilities.hookEvents.filter((hook) => !usedHooks.has(hook))),
    );
    expect(new Set(CAPABILITY_ONLY_CONDITION_KINDS)).toEqual(
      new Set(capabilities.conditionLeafKinds.filter((kind) => !usedConditions.has(kind))),
    );
  });

  it("十種出身、六種技能欄與四種施放型態都有真實候選", () => {
    const selected = SKILL_ACCEPTANCE_CANDIDATES.map((row) => abilities.get(row.id)!);
    const origins = new Set(SKILL_ACCEPTANCE_CANDIDATES.flatMap((row) => {
      const champion = champions.get(row.id.replace(/\.(?:passive|q|w|e|r|ex)$/i, ""));
      return champion ? [originOf(champion as never)] : [];
    }));
    expect(origins).toEqual(new Set(ORIGINS));
    expect(new Set(selected.flatMap((doc) => doc.slot ?? []))).toEqual(
      new Set(["PASSIVE", "Q", "W", "E", "R", "EX"]),
    );
    expect(new Set(selected.flatMap((doc) => doc.castType ?? []))).toEqual(
      new Set(["self", "targeted", "ground", "skillshot"]),
    );
  });

  it("已知鏡像與理想鄉事件鏈仍完整存在", () => {
    const pairs = SKILL_ACCEPTANCE_CANDIDATES.flatMap((row) => row.mirrorOf ? [[row.id, row.mirrorOf]] : []);
    expect(pairs).toEqual(expect.arrayContaining([
      ["godie-h020.e", "godie-hjai.e"],
      ["godie-o00x.r", "godie-ogrh.r"],
      ["godie-e00l.ex", "godie-e002.ex"],
    ]));
    expect(SKILL_ACCEPTANCE_CANDIDATES.filter((row) => row.chain === "avalon-ex").map((row) => row.id)).toEqual([
      "godie-e002.ex", "godie-e00l.r", "godie-e00l.ex",
    ]);
  });
});

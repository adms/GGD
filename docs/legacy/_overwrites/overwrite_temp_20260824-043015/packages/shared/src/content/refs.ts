/**
 * Referential integrity. The REFERENCES table knows, per collection, how to
 * extract every cross-collection reference from a parsed doc. HARD refs
 * (items, projectiles, models, abilities) produce DanglingRefError; SOFT refs
 * (vfx, status-effects — content that may not be authored yet) only warn.
 */
import type { CoreAbilitySlot } from "../sim/intents";
import type { EffectDef } from "../sim/effects/effect";
import type { HookDef } from "../sim/stats/modifiers";
import { DanglingRefError } from "./errors";
import type { ContentStore } from "./store";
import type { CollectionName } from "./schema/index";
import type { AbilityDoc } from "./schema/ability";
import type { ChampionDoc } from "./schema/champion";
import type { ItemDoc } from "./schema/item";
import type { AugmentDoc } from "./schema/augment";
import type { ProjectileDoc } from "./schema/projectile";
import type { LootTableDoc } from "./schema/lootTable";
import type { SkinDoc } from "./schema/skin";
import type { AnyConfigDoc } from "./schema/config";
import type { VfxDoc, RibbonDoc, AttachmentDoc } from "./schema/vfx";

export interface RefEdge {
  /** dot path of the referencing field inside the doc */
  field: string;
  targetCollection: CollectionName;
  targetId: string;
  /** soft = warn only when dangling */
  soft?: boolean;
}

const SLOTS: readonly CoreAbilitySlot[] = ["Q", "W", "E", "R"];

function effectRefs(effects: readonly EffectDef[] | undefined, base: string, out: RefEdge[]): void {
  if (!effects) return;
  effects.forEach((e, i) => {
    const p = `${base}.${i}`;
    if (e.kind === "spawnProjectile") {
      out.push({ field: `${p}.projectileId`, targetCollection: "projectiles", targetId: e.projectileId });
      effectRefs(e.onHit, `${p}.onHit`, out);
    } else if (e.kind === "applyStatus") {
      out.push({ field: `${p}.statusId`, targetCollection: "status-effects", targetId: e.statusId, soft: true });
    } else if (e.kind === "spawnVfx") {
      out.push({ field: `${p}.vfxId`, targetCollection: "vfx", targetId: e.vfxId, soft: true });
    } else if (e.kind === "spawnModelFx") {
      // GH#566 —— 這兩格在 2026-08-24 之前**不在這張表裡**,於是一個打錯字的
      // `modelKey` 或 `preset` 在載入時**一個字都不會說**。理由和 champions.modelKey
      // 同一條(失敗形態 ②):畫面上「指到一具不存在的模型」與「這支技能本來就沒有
      // 模型特效」長得一模一樣。
      //
      // ⚠️ 兩格都是 **HARD**,而且 ⛔ 不對稱地只驗一格是不夠的:
      //   · `modelKey` 缺席時由 `preset` 的模板預設補(`spawnModelFx.ts` 的 refine),
      //     所以指不到模板 = 連「該用哪一具模型」都問不出來。
      //   · 出貨語料量到 9 個字面 `modelKey` + 3 個 `preset`,dangling **0** ——
      //     ⭐ 這條閘是在**現況已經乾淨**的時候關上的,⛔ 不是拿它去追既有的債。
      // ⭐ 註冊之後才被模板補上的那些 modelKey 由 `modelFxStagingContract.test.ts`
      //   的第 ⑥ 條驗(它讀**註冊後**的技能);這裡驗的是**作者寫下的**那一份。
      if (e.modelKey !== undefined) {
        out.push({ field: `${p}.modelKey`, targetCollection: "models", targetId: e.modelKey });
      }
      if (e.preset !== undefined) {
        out.push({
          field: `${p}.preset`,
          targetCollection: "ability-templates",
          targetId: e.preset,
        });
      }
    }
  });
}

function hookRefs(hooks: readonly HookDef[] | undefined, base: string, out: RefEdge[]): void {
  if (!hooks) return;
  hooks.forEach((h, i) => effectRefs(h.effects, `${base}.${i}.effects`, out));
}

function abilityRefs(a: Omit<AbilityDoc, "schema">, base: string, out: RefEdge[]): void {
  effectRefs(a.effects, base ? `${base}.effects` : "effects", out);
  // 【跨技能強化】的目標是 **HARD** ref —— 這就是計畫 §13 要的 fail closed:
  // 指到一支不存在(或被改名)的技能,內容在**載入時**就丟 DanglingRefError 並
  // 指名這一格。⛔ 不可以做成 soft: 一個指不到目標的強化在遊戲裡跟正常的完全
  // 一樣,玩家只會覺得「這張 EX 好像沒作用」(CLAUDE.md 失敗形態 ②)。
  (a.augment?.targets ?? []).forEach((t, i) =>
    out.push({
      field: base ? `${base}.augment.targets.${i}.abilityId` : `augment.targets.${i}.abilityId`,
      targetCollection: "abilities",
      targetId: t.abilityId,
    }),
  );
  if (a.vfxKey !== undefined) {
    out.push({
      field: base ? `${base}.vfxKey` : "vfxKey",
      targetCollection: "vfx",
      targetId: a.vfxKey,
      soft: true,
    });
  }
}

/** REFERENCES: per-collection reference extractors. */
export const REFERENCES: Partial<Record<CollectionName, (doc: never) => RefEdge[]>> = {
  champions: (doc: ChampionDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    for (const slot of SLOTS) {
      // implicit: the embedded ability must also exist as a standalone doc
      out.push({
        field: `abilities.${slot}.id`,
        targetCollection: "abilities",
        targetId: doc.abilities[slot].id,
      });
      abilityRefs(doc.abilities[slot], `abilities.${slot}`, out);
    }
    // the per-hero EX ability must exist as a standalone ability doc
    if (doc.exAbility) {
      out.push({ field: "exAbility", targetCollection: "abilities", targetId: doc.exAbility });
    }
    // the per-hero 天生技 (slot "PASSIVE", the level-1 6th slot) likewise
    if (doc.passiveAbility) {
      out.push({
        field: "passiveAbility",
        targetCollection: "abilities",
        targetId: doc.passiveAbility,
      });
    }
    hookRefs(doc.passive?.hooks, "passive.hooks", out);
    doc.buildPriority.forEach((itemId, i) =>
      out.push({ field: `buildPriority.${i}`, targetCollection: "items", targetId: itemId }),
    );
    out.push({ field: "modelKey", targetCollection: "models", targetId: doc.modelKey });
    return out;
  },
  abilities: (doc: AbilityDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    abilityRefs(doc, "", out);
    return out;
  },
  items: (doc: ItemDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    hookRefs(doc.passive, "passive", out);
    // 套裝 pieces are HARD refs: a typo'd id is a set that can never complete,
    // and nothing at runtime would say so — the card just never pays out
    // (CLAUDE.md 失敗形態 ②). The other two set invariants (every piece repeats
    // the block; the declaring doc is one of its own pieces) are cross-document
    // shape rules rather than references — see `sim/economy/itemSets.auditItemSets`.
    (doc.sets ?? []).forEach((s, i) =>
      s.pieces.forEach((piece, j) =>
        out.push({
          field: `sets.${i}.pieces.${j}`,
          targetCollection: "items",
          targetId: piece,
        }),
      ),
    );
    return out;
  },
  augments: (doc: AugmentDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    hookRefs(doc.hooks, "hooks", out);
    return out;
  },
  projectiles: (doc: ProjectileDoc): RefEdge[] => {
    const out: RefEdge[] = [];
    if (doc.vfxKey !== undefined) {
      out.push({ field: "vfxKey", targetCollection: "vfx", targetId: doc.vfxKey, soft: true });
    }
    return out;
  },
  "loot-tables": (doc: LootTableDoc): RefEdge[] =>
    doc.entries.map((e, i) => ({
      field: `entries.${i}.itemId`,
      targetCollection: "items",
      targetId: e.itemId,
    })),
  skins: (doc: SkinDoc): RefEdge[] => [
    { field: "championId", targetCollection: "champions", targetId: doc.championId },
    { field: "modelKey", targetCollection: "models", targetId: doc.modelKey },
  ],
  // GH#392 —— `attachment@1` 穿的那個模型是 **HARD** ref。理由和 champions.modelKey
  // 同一條：打錯一個字 = 那顆球體**永遠載不到**，而畫面上跟「這隻本來就沒有掛件」
  // 長得一模一樣（失敗形態 ②）。vfx@1 / ribbon@1 沒有跨集合參照。
  vfx: (doc: VfxDoc | RibbonDoc | AttachmentDoc): RefEdge[] =>
    doc.schema === "attachment@1"
      ? [{ field: "modelKey", targetCollection: "models", targetId: doc.modelKey }]
      : [],
  // config docs are mostly parameter tables; only the w3x tint ledger names
  // other documents, and its champion ids must resolve (task #49).
  config: (doc: AnyConfigDoc): RefEdge[] => {
    // arena-rules names LOOT TABLES in three places, and until 2026-08-01 none
    // of them was checked: `MatchController` reads the round card's table with
    // `LootTables.tryGet`, so a typo'd id produced NO card and NO error — 失敗
    // 形態 ② with a spelling mistake as the cause. HARD, because every one of
    // the three is a real payout door: a dangling id means a player silently
    // gets nothing on a round the table promises a free legendary.
    if (doc.schema === "config.arena-rules@1") {
      const out: RefEdge[] = [];
      for (const key of Object.keys(doc.rounds).sort((a, b) => Number(a) - Number(b))) {
        const table = doc.rounds[key]?.weaponLootTable;
        if (table !== undefined) {
          out.push({
            field: `rounds.${key}.weaponLootTable`,
            targetCollection: "loot-tables",
            targetId: table,
          });
        }
      }
      if (doc.gacha) {
        out.push({
          field: "gacha.lootTable",
          targetCollection: "loot-tables",
          targetId: doc.gacha.lootTable,
        });
      }
      // "" is the authored 「沒有備援」 value, not a table id.
      if (doc.itemDraft && doc.itemDraft.fallbackTable !== "") {
        out.push({
          field: "itemDraft.fallbackTable",
          targetCollection: "loot-tables",
          targetId: doc.itemDraft.fallbackTable,
        });
      }
      return out;
    }
    // #249 GH#288 — 變身外觀表 names BOTH a champion and a model doc per entry.
    // Both are HARD: a typo'd `attachModelKey` would mean 悟空 transforms into
    // an identical body with no head change and nothing anywhere would say so.
    if (doc.schema === "config.form-visuals@1") {
      const out: RefEdge[] = [];
      for (const [championId, entry] of Object.entries(doc.forms)) {
        out.push({
          field: `forms.${championId}`,
          targetCollection: "champions",
          targetId: championId,
        });
        if (entry.attachModelKey !== undefined) {
          out.push({
            field: `forms.${championId}.attachModelKey`,
            targetCollection: "models",
            targetId: entry.attachModelKey,
          });
        }
      }
      return out;
    }
    if (doc.schema !== "config.unit-tints@1") return [];
    const out: RefEdge[] = [];
    for (const [rawcode, entry] of Object.entries(doc.units)) {
      if (entry.championId === undefined) continue;
      out.push({
        field: `units.${rawcode}.championId`,
        targetCollection: "champions",
        targetId: entry.championId,
      });
    }
    doc.transient.forEach((s, i) =>
      out.push({
        field: `transient.${i}.championId`,
        targetCollection: "champions",
        targetId: s.championId,
      }),
    );
    return out;
  },
};

/** Extract every ref edge from one parsed doc. */
export function extractRefs(collection: CollectionName, doc: unknown): RefEdge[] {
  const fn = REFERENCES[collection] as ((d: unknown) => RefEdge[]) | undefined;
  return fn ? fn(doc) : [];
}

export interface RefReport {
  errors: DanglingRefError[];
  /** soft refs that dangle (vfx / status-effects not authored yet) */
  warnings: DanglingRefError[];
}

/** Check every reference in the store. Hard dangles -> errors, soft -> warnings. */
export function validateReferences(store: ContentStore): RefReport {
  const errors: DanglingRefError[] = [];
  const warnings: DanglingRefError[] = [];
  for (const collection of Object.keys(REFERENCES) as CollectionName[]) {
    for (const doc of store.all<{ id: string }>(collection)) {
      for (const edge of extractRefs(collection, doc)) {
        if (store.has(edge.targetCollection, edge.targetId)) continue;
        const err = new DanglingRefError(
          collection,
          doc.id,
          edge.field,
          edge.targetCollection,
          edge.targetId,
        );
        (edge.soft ? warnings : errors).push(err);
      }
    }
  }
  return { errors, warnings };
}

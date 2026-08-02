/**
 * 一支技能的模板壞掉，不可以帶走整個內容集 — THE FAIL-SOFT GUARD.
 *
 * THE DEFECT THIS PINS. `registries.ts` used to do, inside `registerAll`'s loop:
 *
 *     const t = templates.get(link.ref);
 *     if (t === undefined) throw new Error(`ability ${doc.id}: template …`);
 *
 * One ability doc with a stale `template.ref` therefore aborted the registration
 * of EVERY champion in the process. On the client `main.tsx` fails OPEN to a
 * 2-hero skeleton, which is precisely the 2026-08-01 outage: site up, lobby up,
 * version badge right, champion-select screen EMPTY. And
 * `ForgeWriteback.FORGE_OWNED_MEMBERS[0] === "template"` — the Forge can save
 * such a doc today, so the blast radius grows with template adoption.
 *
 * WHY THIS FILE USES THE REAL PIPELINE (失敗形態 ⑤「被測的不是出貨的那個」).
 * Every case below loads `content/` off disk through the real `ContentLoader` +
 * `FsContentSource`, breaks ONE doc, and calls the REAL `registerAll` — then
 * reads the REAL `Champions` / `Abilities` registries the sim reads. A
 * hand-rolled fixture store would prove the fixture works; the previous round's
 * `stack.test.ts` was caught claiming a registry path it never imported.
 *
 * MUTATION LOG (第二守則 — every one of these was actually run):
 *   · `handleFailure`: `if (onFailure === "throw") throw` → throw unconditionally
 *     (i.e. restore the old behaviour)
 *       → 「其他英雄全部照常註冊」 red: registerAll throws, 0 champions.
 *   · `handleFailure`: delete the `sink.push({…})` record
 *       → 「留下事後查得到的紀錄」 red (0 failures logged).
 *   · `registerAll`: delete the `console.error(…)` block
 *       → 「開機日誌喊得出聲」 red (console.error never called).
 *   · `handleFailure`: drop the `out["description"] = DEGRADED_ABILITY_NOTE + …`
 *       → 「降級的技能自己說得出壞掉了」 red (tooltip unchanged, i.e. 靜默降級).
 *   · `handleFailure`: keep `out["template"]` instead of deleting it
 *       → 「降級後不再自稱是模板技能」 red.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ContentLoader } from "./loader";
import { ContentStore } from "./store";
import { FsContentSource } from "./node/FsContentSource";
import { COLLECTION_NAMES } from "./schema/index";
import {
  Arenas,
  Configs,
  DEGRADED_ABILITY_NOTE,
  Models,
  RibbonDefs,
  Skins,
  StatusEffects,
  VfxDefs,
  registerAll,
} from "./registries";
import {
  clearTemplateExpansionFailures,
  templateExpansionFailures,
} from "./templates/failures";
import {
  Abilities,
  Augments,
  Champions,
  Items,
  LootTables,
  Projectiles,
} from "../sim/content/registry";
import type { AbilityDef, ChampionDef } from "../sim/content/defs";
import type { AbilityId, ChampionId } from "../ids";

const CONTENT_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../../content");

/** The id nothing on disk answers to — the whole point of the exercise. */
const MISSING_REF = "tpl-this-template-was-renamed-away";

function clearRegistries(): void {
  for (const r of [Champions, Abilities, Items, Augments, Projectiles, LootTables]) r.clear();
  for (const r of [Arenas, Configs, Models, VfxDefs, RibbonDefs, StatusEffects, Skins]) r.clear();
  clearTemplateExpansionFailures();
}

/** A private copy of the loaded set, so one test's sabotage cannot leak. */
function cloneStore(src: ContentStore): ContentStore {
  const out = new ContentStore();
  for (const c of COLLECTION_NAMES) for (const id of src.ids(c)) out.add(c, id, src.get(c, id));
  return out;
}

let pristine: ContentStore;
/** a REAL champion + a REAL ability of his, picked off disk rather than invented */
let victimChampionId: ChampionId;
let victimAbilityId: AbilityId;

beforeAll(async () => {
  const res = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load();
  pristine = res.store;
  const champ = pristine
    .all<ChampionDef>("champions")
    .find((c) => pristine.has("abilities", c.abilities.Q.id));
  if (champ === undefined) throw new Error("no champion has a standalone Q ability doc");
  victimChampionId = champ.id;
  victimAbilityId = champ.abilities.Q.id;
});

/**
 * Break exactly ONE thing: point the victim's Q at a template that does not
 * exist, in BOTH copies (standalone doc + the champion's embedded twin), which
 * is what a real stale ref looks like after the mirror rule has done its job.
 */
function storeWithBrokenTemplateRef(): ContentStore {
  const store = cloneStore(pristine);
  const ability = store.get<AbilityDef>("abilities", victimAbilityId);
  const broken = { ...ability, template: { ref: MISSING_REF, params: {} } };
  store.add("abilities", victimAbilityId, broken);
  const champ = store.get<ChampionDef>("champions", victimChampionId);
  store.add("champions", victimChampionId, {
    ...champ,
    abilities: {
      ...champ.abilities,
      Q: { ...champ.abilities.Q, template: { ref: MISSING_REF, params: {} } },
    },
  });
  return store;
}

describe("模板展開失敗 → 只降級那一支，不炸掉整包內容", () => {
  beforeEach(() => {
    clearRegistries();
    vi.restoreAllMocks();
  });

  it("控制組：完整內容照常註冊，一筆失敗紀錄都沒有", () => {
    registerAll(cloneStore(pristine));
    expect(Champions.ids().length).toBeGreaterThan(50);
    expect(templateExpansionFailures()).toEqual([]);
  });

  it("一個壞掉的模板 ref：其他英雄一隻不少，全部照常註冊", () => {
    // control run first, in this same test, so the comparison cannot drift with
    // test ordering (七種失敗形態 ⑤ — assert against what shipping content
    // really produces, not against a number typed into the file).
    registerAll(cloneStore(pristine));
    const before = Champions.ids().sort();
    const beforeAbilities = Abilities.ids().length;

    clearRegistries();
    registerAll(storeWithBrokenTemplateRef());

    expect(Champions.ids().sort()).toEqual(before);
    expect(Abilities.ids().length).toBe(beforeAbilities);
    // the victim's OWN champion survives too — degrading a skill must not
    // delist the hero who owns it
    expect(Champions.ids()).toContain(victimChampionId);
  });

  it("降級的那一支：技能還在，但沒有模板效果，而且自己說得出壞掉了", () => {
    registerAll(storeWithBrokenTemplateRef());

    const degraded = Abilities.get(victimAbilityId) as unknown as Record<string, unknown>;
    // still registered — a champion whose Q vanished would crash the ability bar
    expect(degraded).toBeDefined();
    // 降級成什麼：只留人手寫的東西，不猜。模板承諾的效果一個都不補。
    expect(degraded["effects"]).toEqual(
      (pristine.get<AbilityDef>("abilities", victimAbilityId) as unknown as Record<string, unknown>)[
        "effects"
      ],
    );
    // 降級後不再自稱是模板技能 — a link that cannot expand must not look expandable
    expect(degraded["template"]).toBeUndefined();
    // 靜默降級是這個專案最痛的形態，所以壞掉的技能要在玩家看得到的地方講出來
    expect(String(degraded["description"])).toContain(DEGRADED_ABILITY_NOTE);
  });

  it("鏡像的那一份也降級（英雄槽位裡的那一份才是 sim 讀的）", () => {
    registerAll(storeWithBrokenTemplateRef());
    const champ = Champions.get(victimChampionId);
    const embedded = champ.abilities.Q as unknown as Record<string, unknown>;
    expect(String(embedded["description"])).toContain(DEGRADED_ABILITY_NOTE);
    expect(embedded["template"]).toBeUndefined();
  });

  it("留下事後查得到的紀錄 —— 不是只有當下那一行 console", () => {
    registerAll(storeWithBrokenTemplateRef());

    const failures = templateExpansionFailures();
    // both copies of the ability failed, and the record says WHICH copy
    expect(failures.map((f) => f.where).sort()).toEqual(["embedded", "standalone"]);
    const standalone = failures.find((f) => f.where === "standalone")!;
    expect(standalone.abilityId).toBe(victimAbilityId);
    expect(standalone.phase).toBe("ref");
    expect(standalone.missingRefs).toEqual([MISSING_REF]);
    // the record has to name the champion+slot, or「哪個英雄的哪一格壞了」is a
    // question nobody can answer after the fact
    const embedded = failures.find((f) => f.where === "embedded")!;
    expect(embedded.championId).toBe(victimChampionId);
    expect(embedded.slot).toBe("Q");
  });

  it("開機日誌喊得出聲 —— 一行，指名不見的模板", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registerAll(storeWithBrokenTemplateRef());
    const said = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(said).toContain(MISSING_REF);
    expect(said).toContain(victimAbilityId);
  });

  it("控制組不吵：內容沒問題時一句話都不印", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    registerAll(cloneStore(pristine));
    expect(spy).not.toHaveBeenCalled();
  });

  it("離線工具仍可以選擇硬失敗（onTemplateFailure: \"throw\"）", () => {
    expect(() => registerAll(storeWithBrokenTemplateRef(), { onTemplateFailure: "throw" })).toThrow(
      MISSING_REF,
    );
  });

  it("陣列形狀的 template 綁定也不會炸掉整包（舊解析器只讀 link.ref）", () => {
    // The schema has accepted `[{ref,params}, …]` since the stack landed, and the
    // pre-2026-08-02 resolver read `link.ref` off the ARRAY — `undefined` — so a
    // perfectly legal doc detonated the whole registration. Now it either expands
    // or degrades alone.
    const store = cloneStore(pristine);
    const ability = store.get<AbilityDef>("abilities", victimAbilityId);
    store.add("abilities", victimAbilityId, {
      ...ability,
      template: [{ ref: MISSING_REF, params: {} }],
    });
    expect(() => registerAll(store)).not.toThrow();
    expect(Champions.ids()).toContain(victimChampionId);
    expect(templateExpansionFailures()[0]?.missingRefs).toEqual([MISSING_REF]);
  });
});

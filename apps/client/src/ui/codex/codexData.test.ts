/**
 * codex-live-load / codex-normalise / codex-live-reload / codex-load-tolerant:
 * the codex's data layer. Node env, no DOM — `loadCodex` takes an injected
 * fetch, so the whole "read the real content tree" path is exercised against an
 * in-memory tree.
 *
 * THE LOAD-BEARING TEST IS `codex-live-reload`: mutate the fake content tree
 * between two loads and the second load must return the NEW text. That is the
 * 「動態即時非寫死」 requirement expressed as an assertion — if anyone ever bakes
 * a snapshot into this directory, that test goes red (and codexLive.test.ts
 * catches the import itself).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  bucketOf,
  championIdOfAbility,
  loadCodex,
  normaliseAbility,
  normaliseChampion,
  normaliseItem,
  skillIndexFromAbilityName,
  splitChampionName,
  whitelistFrom,
  type FetchFn,
} from "./codexData";

// ---------------------------------------------------------------------------
// an in-memory /content tree
// ---------------------------------------------------------------------------

function abilityDoc(champ: string, slot: string, name: string, description: string): Record<string, unknown> {
  return {
    id: `${champ}.${slot.toLowerCase()}`,
    schema: "ability@1",
    name,
    description,
    slot,
    castType: "ground",
    maxRank: 3,
    cooldown: [12, 11, 10],
    manaCost: [60, 60, 60],
    range: 11,
    effects: [{ kind: "damage", damageType: "magic" }],
    vfxKey: "fx.ember-bolt-cast",
  };
}

function makeTree(): Map<string, unknown> {
  const tree = new Map<string, unknown>();
  tree.set("/c/manifest.json", {
    contentVersion: "cv_test0001",
    collections: {
      champions: { count: 1, path: "champions/_index.json" },
      items: { count: 2, path: "items/_index.json" },
      abilities: { count: 2, path: "abilities/_index.json" },
    },
  });
  tree.set("/c/champions/_index.json", { entries: [{ id: "hero-a", path: "champions/hero-a.json" }] });
  tree.set("/c/champions/hero-a.json", {
    id: "hero-a",
    schema: "champion@1",
    name: "劍之王 - 亞瑟",
    description: "故事：測試用英雄。",
    role: "fighter",
    attackType: "melee",
    modelKey: "imported.test",
    icon: "assets/icons/champions/hero-a.png",
    baseStats: { maxHealth: 580, ad: 38 },
    growth: { maxHealth: 54, ad: 1.8 },
    abilities: {
      Q: { id: "hero-a.q", name: "20-01 風王結界", slot: "Q" },
      W: { id: "hero-a.w", name: "20-02 感知能力", slot: "W" },
    },
    exAbility: "hero-a.ex",
    buildPriority: ["item-final"],
    tags: ["wc3-import"],
  });
  tree.set("/c/abilities/_index.json", {
    entries: [
      { id: "hero-a.q", path: "abilities/hero-a.q.json" },
      { id: "hero-a.ex", path: "abilities/hero-a.ex.json" },
    ],
  });
  tree.set("/c/abilities/hero-a.q.json", abilityDoc("hero-a", "Q", "20-01 風王結界", "吹風。"));
  tree.set("/c/abilities/hero-a.ex.json", abilityDoc("hero-a", "EX", "20-002 解放", "大絕。"));
  tree.set("/c/items/_index.json", {
    entries: [
      { id: "item-final", path: "items/item-final.json" },
      { id: "item-book", path: "items/item-book.json" },
    ],
  });
  tree.set("/c/items/item-final.json", {
    id: "item-final",
    schema: "item@1",
    name: "妖刀村正",
    description: "武器\n合成配方：\n妖刀村正製作書\n\n效能\n攻擊力+30",
    cost: 3000,
    tier: 4,
    modifiers: [{ stat: "ad", op: "flat", value: 30 }],
    tags: ["wc3-import"],
  });
  tree.set("/c/items/item-book.json", {
    id: "item-book",
    schema: "item@1",
    name: "妖刀村正製作書",
    cost: 500,
    tier: 2,
    tags: ["wc3-import"],
  });
  tree.set("/wl", { champions: ["hero-a"], items: [], abilities: ["hero-a.q"] });
  return tree;
}

function fetchFrom(tree: Map<string, unknown>): FetchFn {
  return async (url: string) => {
    const hit = tree.get(url);
    return hit === undefined
      ? { ok: false, json: async () => null }
      : { ok: true, json: async () => hit };
  };
}

const OPTS = { base: "/c", whitelistUrl: "/wl", now: () => 1_000 };

// ---------------------------------------------------------------------------

describe("codex data layer", () => {
  it("loads every collection from the live content mount", async () => {
    cover("codex-live-load");
    const tree = makeTree();
    const seen: string[] = [];
    const fetchFn: FetchFn = (url) => {
      seen.push(url);
      return fetchFrom(tree)(url);
    };
    const data = await loadCodex({ ...OPTS, fetchFn });

    // it really went through /content/<collection>/_index.json + each doc path
    expect(seen).toContain("/c/manifest.json");
    expect(seen).toContain("/c/champions/_index.json");
    expect(seen).toContain("/c/champions/hero-a.json");
    expect(seen).toContain("/c/items/item-book.json");

    expect(data.contentVersion).toBe("cv_test0001");
    expect(data.champions).toHaveLength(1);
    expect(data.items).toHaveLength(2);
    expect(data.abilities).toHaveLength(2);
    expect(data.loadErrors).toEqual([]);
    expect(data.loadedAt).toBe(1_000);
    // manifest counts are reported next to what actually loaded (staleness)
    expect(data.counts.champion).toEqual({ manifest: 1, indexed: 1, loaded: 1 });
  });

  it("reports the whitelist, and never reads 'unreachable' as 'disabled'", async () => {
    cover("codex-live-load");
    const tree = makeTree();
    const enforced = await loadCodex({ ...OPTS, fetchFn: fetchFrom(tree) });
    expect(enforced.whitelist.enforced).toBe(true);
    expect(enforced.whitelist.champions.has("hero-a")).toBe(true);
    expect(enforced.whitelist.items.size).toBe(0);

    tree.delete("/wl");
    const offline = await loadCodex({ ...OPTS, fetchFn: fetchFrom(tree) });
    expect(offline.whitelist.enforced).toBe(false);
  });

  it("LIVE: editing a content doc changes the page's data on the next load", async () => {
    cover("codex-live-reload");
    const tree = makeTree();
    const before = await loadCodex({ ...OPTS, fetchFn: fetchFrom(tree) });
    expect(before.items[0]?.name).toBe("妖刀村正");

    // …someone edits content/items/item-final.json and reloads the codex…
    tree.set("/c/items/item-final.json", {
      ...(tree.get("/c/items/item-final.json") as Record<string, unknown>),
      name: "改名後的刀",
      description: "改過的說明",
      cost: 4242,
    });
    const after = await loadCodex({ ...OPTS, fetchFn: fetchFrom(tree) });

    expect(after.items[0]?.name).toBe("改名後的刀");
    expect(after.items[0]?.description).toBe("改過的說明");
    expect(after.items[0]?.cost).toBe(4242);
    // and the search index followed the edit rather than a baked copy
    expect(after.items[0]?.searchKey).toContain("改名後的刀");
  });

  it("stays loadable when content is broken (that is what it must report)", async () => {
    cover("codex-load-tolerant");
    const tree = makeTree();
    tree.delete("/c/manifest.json");
    tree.delete("/c/items/item-book.json");
    const data = await loadCodex({ ...OPTS, fetchFn: fetchFrom(tree) });

    expect(data.contentVersion).toBeNull();
    expect(data.items).toHaveLength(1); // the readable one still loads
    expect(data.loadErrors.some((e) => e.includes("manifest.json"))).toBe(true);
    expect(data.loadErrors.some((e) => e.includes("item-book"))).toBe(true);
    expect(data.counts.item).toEqual({ manifest: null, indexed: 2, loaded: 1 });
  });

  it("never throws when the whole mount is gone", async () => {
    cover("codex-load-tolerant");
    const data = await loadCodex({
      ...OPTS,
      fetchFn: async () => {
        throw new Error("network down");
      },
    });
    expect(data.champions).toEqual([]);
    expect(data.loadErrors.length).toBeGreaterThan(0);
  });
});

describe("codex normalisation", () => {
  it("splits 稱號 - 全名 the way the identity rule does", () => {
    cover("codex-normalise");
    expect(splitChampionName("蟬在叫人壞掉 - 龍宮禮奈")).toEqual({
      title: "蟬在叫人壞掉",
      fullName: "龍宮禮奈",
    });
    // an UNSPACED hyphen belongs to the token itself
    expect(splitChampionName("英靈-亞瑟王 - 黑化Saber")).toEqual({
      title: "英靈-亞瑟王",
      fullName: "黑化Saber",
    });
    // the four dash-less names keep the whole string as the full name
    expect(splitChampionName("不良少年")).toEqual({ title: null, fullName: "不良少年" });
  });

  it("reads the hero 編號 off the ability names (identity), not the model", () => {
    cover("codex-normalise");
    const champ = normaliseChampion({
      id: "c1",
      name: "王 - 甲",
      role: "fighter",
      attackType: "melee",
      abilities: {
        Q: { id: "c1.q", name: "69-01 力量強化", slot: "Q" },
        W: { id: "c1.w", name: "69-02 黑泥召喚", slot: "W" },
      },
    });
    expect(champ?.heroNumber).toBe("69");
    expect(champ?.abilityIds).toEqual(["c1.q", "c1.w"]);

    // abilities that DISAGREE are ambiguous → no number claimed
    const mixed = normaliseChampion({
      id: "c2",
      name: "王 - 乙",
      role: "fighter",
      attackType: "melee",
      abilities: {
        Q: { id: "c2.q", name: "20-01 甲", slot: "Q" },
        W: { id: "c2.w", name: "69-02 乙", slot: "W" },
      },
    });
    expect(mixed?.heroNumber).toBeNull();
  });

  it("parses ability id → owner champion, slot index and clean name", () => {
    cover("codex-normalise");
    expect(championIdOfAbility("godie-e002.ex")).toBe("godie-e002");
    expect(championIdOfAbility("no-dot")).toBeNull();
    expect(skillIndexFromAbilityName("20-002 解放")).toBe("002");
    expect(skillIndexFromAbilityName("沒有編號")).toBeNull();

    const ab = normaliseAbility(abilityDoc("hero-a", "EX", "20-002 解放.約束勝利劍MAX", "說明"));
    expect(ab?.slot).toBe("EX");
    expect(ab?.heroNumber).toBe("20");
    expect(ab?.cleanName).toBe("解放.約束勝利劍MAX");
    expect(ab?.championId).toBe("hero-a");
  });

  it("keeps the raw doc so the detail view shows the file itself", () => {
    cover("codex-normalise");
    const item = normaliseItem({ id: "i", name: "n", cost: 1, tier: 1, tags: [], extraFieldNobodyMapped: 7 });
    expect(item?.doc["extraFieldNobodyMapped"]).toBe(7);
  });

  it("drops documents with no id rather than inventing one", () => {
    cover("codex-load-tolerant");
    expect(normaliseItem({ name: "no id" })).toBeNull();
    expect(normaliseChampion(null)).toBeNull();
    expect(normaliseAbility("nope")).toBeNull();
  });

  it("item bucket: an authored bucket (task #70) wins over the derived guess", () => {
    cover("codex-normalise");
    expect(bucketOf({ bucket: "final", name: "某某製作書", cost: 0 })).toEqual({
      bucket: "final",
      source: "doc",
    });
    expect(bucketOf({ name: "妖刀村正製作書", cost: 500 })).toEqual({
      bucket: "recipe-book",
      source: "derived",
    });
    // ⭐⭐ GH#912 —— 這一行在此之前斷言「`cost: 0` ⇒ 任務獎勵」，而**那是錯的**：
    //   這個遊戲**沒有任何任務**（`quest-rewards` 表 owner 2026-08-01 已裁決退場，
    //   而 `ex-release-weapons.json` 的 note 逐字：「『任務道具』是舊時代 DOTA 玩法的
    //   標籤，**競技場新玩法完全不考慮它**」）。
    //   ⚠️ 而畫面上那四個字讓 owner 合理地推論「這些永遠拿不到」——⭐ 它們每一場都抽得到。
    //   ⇒ ⛔ 這條紅不是回歸，是**前提消失**（票文自己預告了它會紅）。
    expect(bucketOf({ name: "四魂之玉", cost: 0 })).toEqual({
      bucket: "no-modifiers",
      source: "derived",
    });
    // ⭐ 而它**在掉落表裡**的時候，說得出真正的來源。
    expect(
      bucketOf({ id: "four-souls-jewel", name: "四魂之玉", cost: 0 }, new Set(["four-souls-jewel"])),
    ).toEqual({ bucket: "loot-drop", source: "derived" });
    // ⛔ 反方向：不在表裡的**不可以**被標成抽選來源（⚠️ 同一個病換一邊）。
    expect(bucketOf({ id: "some-token", cost: 0 }, new Set(["four-souls-jewel"])).bucket).not.toBe(
      "loot-drop",
    );
    // ⭐ 文件明寫的 `quest-reward` 仍然贏（⛔ 拿掉的是**推導**，不是那個 bucket）。
    expect(bucketOf({ bucket: "quest-reward", cost: 0 }).source).toBe("doc");
    expect(bucketOf({ name: "劍", cost: 900, modifiers: [{ stat: "ad", op: "flat", value: 1 }] })).toEqual({
      bucket: "with-modifiers",
      source: "derived",
    });
    expect(bucketOf({ name: "牌子", cost: 100 })).toEqual({ bucket: "no-modifiers", source: "derived" });
  });

  it("whitelist parsing tolerates junk", () => {
    cover("codex-load-tolerant");
    expect(whitelistFrom({ champions: ["a", 1, ""], items: null }).champions.has("a")).toBe(true);
    expect(whitelistFrom(null).enforced).toBe(false);
  });
});

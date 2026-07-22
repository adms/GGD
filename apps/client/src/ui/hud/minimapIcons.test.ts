/**
 * client-23 (hud-minimap-portrait): champion PORTRAITS are what turn the
 * minimap's markers from anonymous dots into "that's the enemy jungler".
 *
 * The canvas cannot use <IconImg>, so PortraitCache re-expresses the same rule
 * as an image cache: resolve through the shared `championIconUrl` helper, load
 * once, and settle permanently on failure so the marker falls back to a
 * team-coloured dot instead of a blank hole or a 12 Hz retry storm.
 *
 * (Client vitest env is node, so the loader is injected — the same fixture
 * approach as ui/icons.test.ts, which owns the URL-resolution rules.)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { Champions } from "@ggd/shared/sim/content/registry";
import type { ChampionId } from "@ggd/shared/ids";
import type { ChampionDef } from "@ggd/shared/sim/content/defs";
import { contentAssetUrl } from "../../content/ContentDb";
import { championIconUrl } from "../icons";
import { PortraitCache, type PortraitImage, type PortraitLoader } from "./minimapIcons";

const WITH_ICON = "godie-minimap-portrait" as ChampionId;
const NO_ICON = "godie-minimap-stockart" as ChampionId;
const ICON_PATH = "assets/icons/champions/godie-minimap-portrait.png";

const champion = (id: ChampionId, icon?: string): ChampionDef => {
  const def: ChampionDef = {
    id,
    name: `小地圖測試 ${id}`,
    role: "fighter",
    attackType: "melee",
    modelKey: "champ.test",
    baseStats: {},
    growth: {},
    abilities: {},
    skillOrder: [],
    buildPriority: [],
    tags: ["wc3-import"],
  } as unknown as ChampionDef;
  if (icon !== undefined) def.icon = icon;
  return def;
};

beforeAll(() => {
  // Champions.register (not registerChampion): these fixtures exist only to
  // exercise the icon lookup, so they deliberately carry no Q/W/E/R defs.
  Champions.register(WITH_ICON, champion(WITH_ICON, ICON_PATH));
  Champions.register(NO_ICON, champion(NO_ICON)); // WC3 stock art → no icon field
});

/** A loader that hands back controllable outcomes and records every request. */
function scriptedLoader(): {
  loader: PortraitLoader;
  urls: string[];
  resolve(index: number): void;
  reject(index: number): void;
} {
  const urls: string[] = [];
  const pending: { ok: (img: PortraitImage) => void; fail: () => void }[] = [];
  return {
    urls,
    loader: (url, onLoad, onError) => {
      urls.push(url);
      pending.push({ ok: onLoad, fail: onError });
    },
    resolve: (i) => pending[i]!.ok({ width: 64, height: 64 } as unknown as PortraitImage),
    reject: (i) => pending[i]!.fail(),
  };
}

describe("minimap champion portraits (hud-minimap-portrait)", () => {
  it("loads a champion's w3x portrait ONCE and serves it from then on", () => {
    cover("hud-minimap-portrait");
    const s = scriptedLoader();
    const cache = new PortraitCache(s.loader);

    // first ask starts the load and draws the fallback meanwhile
    expect(cache.portraitFor(WITH_ICON)).toBeNull();
    expect(cache.stateOf(WITH_ICON)).toBe("loading");
    expect(s.urls).toEqual([contentAssetUrl(ICON_PATH)]);
    expect(s.urls[0]).toBe(championIconUrl(WITH_ICON)); // the SHARED resolver

    // a redraw at 12 Hz must not fire a second request
    for (let i = 0; i < 10; i++) cache.portraitFor(WITH_ICON);
    expect(s.urls).toHaveLength(1);
    expect(cache.requests).toBe(1);

    s.resolve(0);
    expect(cache.stateOf(WITH_ICON)).toBe("ready");
    const img = cache.portraitFor(WITH_ICON);
    expect(img).not.toBeNull();
    expect(cache.portraitFor(WITH_ICON)).toBe(img);
    expect(s.urls).toHaveLength(1);
  });

  it("FALLBACK: a champion with no w3x art never requests anything", () => {
    cover("hud-minimap-portrait");
    const s = scriptedLoader();
    const cache = new PortraitCache(s.loader);
    // stock-art heroes have no icon field — the marker draws a team dot instead
    expect(championIconUrl(NO_ICON)).toBeNull();
    expect(cache.portraitFor(NO_ICON)).toBeNull();
    expect(cache.stateOf(NO_ICON)).toBe("failed"); // settled, not retried
    for (let i = 0; i < 10; i++) cache.portraitFor(NO_ICON);
    expect(s.urls).toEqual([]);
    expect(cache.requests).toBe(0);
  });

  it("FALLBACK: a 404 settles permanently instead of retrying every frame", () => {
    cover("hud-minimap-portrait");
    const s = scriptedLoader();
    const cache = new PortraitCache(s.loader);
    cache.portraitFor(WITH_ICON);
    s.reject(0);
    expect(cache.stateOf(WITH_ICON)).toBe("failed");
    for (let i = 0; i < 12; i++) expect(cache.portraitFor(WITH_ICON)).toBeNull();
    expect(cache.requests).toBe(1);
  });

  it("ignores empty/unknown champion ids (flowers, unpicked seats)", () => {
    cover("hud-minimap-portrait");
    const s = scriptedLoader();
    const cache = new PortraitCache(s.loader);
    // neutral entities carry "" and seats before champ-select resolve too
    expect(cache.portraitFor("")).toBeNull();
    expect(cache.portraitFor(null)).toBeNull();
    expect(cache.portraitFor(undefined)).toBeNull();
    expect(s.urls).toEqual([]);
    // an id that is not in the registry at all settles like stock art
    expect(cache.portraitFor("godie-does-not-exist")).toBeNull();
    expect(cache.stateOf("godie-does-not-exist")).toBe("failed");
    expect(s.urls).toEqual([]);
  });

  it("clear() drops everything (map teardown)", () => {
    cover("hud-minimap-portrait");
    const s = scriptedLoader();
    const cache = new PortraitCache(s.loader);
    cache.portraitFor(WITH_ICON);
    s.resolve(0);
    cache.clear();
    expect(cache.stateOf(WITH_ICON)).toBe("missing");
    expect(cache.requests).toBe(0);
    cache.portraitFor(WITH_ICON);
    expect(s.urls).toHaveLength(2);
  });
});

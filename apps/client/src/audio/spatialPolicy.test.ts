/**
 * spatialPolicy — THE BOUNDARY IS EXHAUSTIVE, OR THE SUITE IS RED.
 *
 * The failure this file exists to prevent is not "a sound is panned wrongly
 * today" — it is 「下個月新增一個 UI 音就會悄悄被 pan 掉」. A judgement spread over
 * forty call sites decays silently; a table that MUST cover two independently
 * generated inventories cannot.
 *
 * The inventories are not written by hand and not written by this feature:
 *   • `SFX_REACHABILITY` — one row per audio-map SFX key, and `sfxReachability
 *     .test.ts` already asserts that row set EQUALS the map's key set;
 *   • the shipped champion voice-pack MANIFEST's own category list (46).
 * So a new sound in either place lands here unclassified.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  CLIENT_SFX_POLICY,
  VOICE_CATEGORY_POLICY,
  combatEventPolicy,
  dormantVoiceCategories,
  isWorldVoice,
  voicePolicyFor,
  type SpatialPolicy,
} from "./spatialPolicy";
import { SFX_REACHABILITY } from "./sfxReachability";
import { CENTRED_EVENTS, EVENT_SPATIAL } from "./combatSfxSpatial";
import { VOICE_PACK_MANIFEST_PATH } from "./selectVoiceLadder";
import { PERFORM_VOICE_CATEGORIES } from "./shopPerformVoice";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../../.."); // src/audio → apps/client → apps → repo root

/** Every category the shipped voice pack can actually speak. */
function manifestCategories(): string[] {
  const doc = JSON.parse(readFileSync(join(ROOT, "content", VOICE_PACK_MANIFEST_PATH), "utf8")) as {
    champions: Record<string, { lines?: Record<string, unknown> }>;
  };
  const out = new Set<string>();
  for (const entry of Object.values(doc.champions ?? {})) {
    for (const cat of Object.keys(entry.lines ?? {})) out.add(cat);
  }
  return [...out].sort();
}

describe("every SFX key is classified — no silent default (spatial-policy-sfx)", () => {
  it("every client-played key has a policy AND a reason", () => {
    cover("spatial-policy-sfx");
    const unclassified: string[] = [];
    for (const row of SFX_REACHABILITY) {
      if (row.kind !== "client") continue;
      const p = CLIENT_SFX_POLICY[row.key];
      if (!p) unclassified.push(row.key);
      else expect(p.reason.length, `${row.key} needs a real reason`).toBeGreaterThan(8);
    }
    expect(
      unclassified,
      `these client-played SFX keys are not on either side of the spatial boundary. ` +
        `Add a row to CLIENT_SFX_POLICY saying whether the sound has a place IN THE ` +
        `WORLD the player should hunt for by ear (almost every UI/HUD/announcer sound ` +
        `does NOT):\n  ` + unclassified.join("\n  "),
    ).toEqual([]);
  });

  it("the table has no rows for keys that no longer exist (it cannot rot)", () => {
    cover("spatial-policy-sfx");
    const clientKeys = new Set(SFX_REACHABILITY.filter((r) => r.kind === "client").map((r) => r.key));
    const stale = Object.keys(CLIENT_SFX_POLICY).filter((k) => !clientKeys.has(k));
    expect(stale, `CLIENT_SFX_POLICY rows whose key is gone from the audio map`).toEqual([]);
  });

  it("every COMBAT key's events are classified in combatSfxSpatial, both ways", () => {
    cover("spatial-policy-sfx");
    const unclassified: string[] = [];
    for (const row of SFX_REACHABILITY) {
      if (row.kind !== "combat") continue;
      for (const ev of row.events ?? []) {
        if (combatEventPolicy(ev) === null) unclassified.push(`${row.key} ← ${ev}`);
      }
    }
    expect(unclassified).toEqual([]);
    // and an event may never be BOTH placed and deliberately centred
    const both = Object.keys(EVENT_SPATIAL).filter((k) => k in CENTRED_EVENTS);
    expect(both, "events declared placed AND centred at the same time").toEqual([]);
  });

  it("the ONLY client key that moves is the remote footstep", () => {
    cover("spatial-policy-sfx");
    const moving = Object.entries(CLIENT_SFX_POLICY)
      .filter(([, p]) => p.policy === "world")
      .map(([k]) => k);
    expect(moving).toEqual(["footstep"]);
  });

  it("the login dragons keep their OWN screen-space law — not world, not deleted", () => {
    cover("spatial-policy-sfx");
    // the login scene has no world listener; the dragon is a visible object in
    // the frame, panned from its NDC. Migrating it onto the combat engine would
    // be wrong, and so would flattening it for being "not world".
    for (const k of ["dragonRoar", "dragonRoarBig"]) {
      expect(CLIENT_SFX_POLICY[k]!.policy).toBe<SpatialPolicy>("screen");
    }
    const auth = readFileSync(join(HERE, "../ui/platform/AuthScreen.tsx"), "utf8");
    expect(auth).toMatch(/playSfx\([\s\S]{0,80}pan/);
  });

  it("the whole UI / shop / draft / announcer family is flat, with no exception", () => {
    cover("spatial-policy-sfx");
    const mustBeFlat = [
      "uiClick", "uiHover", "uiHoverCyber", "uiTabSwitch", "uiToggle", "uiType",
      "uiDenied", "uiCancel", "panelOpen", "shopPurchase", "goldGain",
      "draftConfirm", "draftCardReveal", "legendaryRoll", "legendaryWin",
      "matchStart", "matchStartGong", "roundStart", "vsReveal", "matchEndGong",
      "champSelectConfirm", "settlementReveal", "countTick", "countFinal",
      "crowdCheer", "crowdCheerBig", "arenaAmbience", "merchantAmbience",
      "kill", "multiKill", "death", "allySlain", "levelUp", "exUnlock", "lowHealth",
    ];
    for (const k of mustBeFlat) {
      expect(CLIENT_SFX_POLICY[k]?.policy, `${k} must stay flat`).toBe<SpatialPolicy>("flat");
    }
  });
});

describe("every voice category is classified (spatial-policy-voice)", () => {
  it("the table covers the shipped manifest exactly — both directions", () => {
    cover("spatial-policy-voice");
    const cats = manifestCategories();
    expect(cats.length).toBeGreaterThan(40); // sanity: we read the real manifest
    const missing = cats.filter((c) => !voicePolicyFor(c));
    expect(
      missing,
      `these voice categories exist in the pack but have no spatial policy. Decide ` +
        `whether the line belongs to a BODY in the arena (world) or to the local ` +
        `player (self):\n  ` + missing.join("\n  "),
    ).toEqual([]);
    const stale = Object.keys(VOICE_CATEGORY_POLICY).filter((c) => !cats.includes(c));
    expect(stale, "policy rows for categories the pack no longer ships").toEqual([]);
  });

  it("a voice is only ever `world` or `self` — never UI chrome", () => {
    cover("spatial-policy-voice");
    for (const [cat, row] of Object.entries(VOICE_CATEGORY_POLICY)) {
      expect(["world", "self"], `${cat}`).toContain(row.policy);
      expect(row.reason.length).toBeGreaterThan(8);
    }
  });

  it("the five categories any champion can speak are ALL placed", () => {
    cover("spatial-policy-voice");
    // these are the ones #223 fanned out to the whole arena and #259 places
    for (const c of ["hurt", "hurt-heavy", "defeat", "crit", "attack-heavy"]) {
      expect(isWorldVoice(c), `${c} must be placed`).toBe(true);
    }
    for (const slot of ["q", "w", "e", "r", "ex"]) {
      expect(isWorldVoice(`skill-name.${slot}`), `skill-name.${slot}`).toBe(true);
    }
    for (const c of ["stun", "slow", "bind"]) expect(isWorldVoice(c)).toBe(true);
  });

  it("the local-only categories stay flat — they are answers to YOUR input", () => {
    cover("spatial-policy-voice");
    for (const c of [
      "block", "dodge", "healed", "attack-light", "sprint", "hum", "quote",
      "select", "victory", "first-blood", "kill-1", "kill-5", "unstoppable", "curse",
    ]) {
      expect(voicePolicyFor(c)!.policy, `${c}`).toBe<SpatialPolicy>("self");
      expect(isWorldVoice(c)).toBe(false);
    }
  });

  it("every category the client actually dispatches is marked dispatched", () => {
    cover("spatial-policy-voice");
    // ⭐ GH#441 —— 這一條以前只讀**兩個**檔（GameApp / AudioDirector），於是
    // `shopPerformVoice` 播的六個類別（taunt / charge / thanks / thumbs-up /
    // watch / free-move）在表上全部寫著 `dispatched: false` —— 一份說謊的政策宣告，
    // 而守衛是綠的。⭐ 修法不是「再加一個檔名」：`PERFORM_VOICE_CATEGORIES` 是一張
    // **真的表**，直接讀它，⛔ 不要掃它的原始碼。
    const dispatchTables = new Set(Object.values(PERFORM_VOICE_CATEGORIES).flat());
    const src = [
      readFileSync(join(HERE, "../GameApp.ts"), "utf8"),
      readFileSync(join(HERE, "../ui/AudioDirector.tsx"), "utf8"),
    ]
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\n]*/g, "");
    const wrong: string[] = [];
    for (const [cat, row] of Object.entries(VOICE_CATEGORY_POLICY)) {
      if (row.dispatched) continue;
      if (dispatchTables.has(cat) || src.includes(`"${cat}"`)) wrong.push(cat);
    }
    expect(wrong, "categories marked dormant that a call site names").toEqual([]);
  });

  it("every dormant category says WHICH kind of nothing is stopping it", () => {
    cover("spatial-policy-voice");
    // ⭐ GH#441 owner「補阿」。上面那一條只答「它有沒有被叫」；這一條答**補它要
    // 做什麼** —— 而那是兩件成本差一個數量級的事（做一個機制 vs 接一條線）。
    // ⛔ 判準治不了：`dormant` 是宣告，所以 `no-wiring` 宣稱的訊號逐個回去讀
    // `content/status-effects/`。訊號被改名或撤掉 → 紅，⛔ 不是靜默腐爛。
    const shipped = new Set(
      readdirSync(join(ROOT, "content/status-effects"))
        .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
        .map((f) => f.slice(0, -5)),
    );
    expect(shipped.size).toBeGreaterThan(20); // sanity: we read the real collection
    for (const [cat, row] of Object.entries(VOICE_CATEGORY_POLICY)) {
      if (row.dispatched) {
        expect(row.dormant, `${cat} is dispatched — it must not carry a dormant verdict`)
          .toBeUndefined();
        continue;
      }
      const d = row.dormant;
      expect(d, `${cat} fires nowhere and does not say why`).toBeDefined();
      expect(d!.note.length, `${cat} needs a real note`).toBeGreaterThan(8);
      if (d!.cause === "no-wiring") {
        const ids = d!.statusIds ?? [];
        expect(ids.length, `${cat} claims the signal ships — name it`).toBeGreaterThan(0);
        const ghosts = ids.filter((id) => !shipped.has(id));
        expect(
          ghosts,
          `${cat} claims these status-effect docs ship, and they do not: ${ghosts.join(", ")}`,
        ).toEqual([]);
      } else {
        expect(d!.statusIds, `${cat} is no-signal — it must not name one`).toBeUndefined();
      }
    }
    // and the export the next lane will read agrees with the table
    expect(dormantVoiceCategories().map(([c]) => c).sort()).toEqual(
      Object.entries(VOICE_CATEGORY_POLICY)
        .filter(([, r]) => !r.dispatched)
        .map(([c]) => c)
        .sort(),
    );
  });
});

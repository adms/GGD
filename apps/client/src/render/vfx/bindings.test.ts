/**
 * Roster VFX bindings (task #79): all 265 abilities of the 53 whitelisted
 * champions are bound to a real element/primitive — NOT the generic fire
 * placeholder — and 依文潔琳's ice spells resolve to an ICE primitive (the
 * flagship symptom). Every generated curated doc is schema-valid.
 *
 * ---------------------------------------------------------------------------
 * WHERE THE ROSTER COMES FROM — and why it is NOT the operator document
 * ---------------------------------------------------------------------------
 * This file used to read the expected roster straight out of
 * `data/curation/whitelist.json`. That source was wrong TWICE:
 *
 *   1. It is GITIGNORED runtime state (`.gitignore` → `/data/**`). It exists
 *      only on a machine that has actually run the platform, so in a fresh
 *      clone, a git worktree or CI the whole suite died at collection time
 *      with `ENOENT … data/curation/whitelist.json` — 0 tests, not 1 failure.
 *   2. It is the OPERATOR's live document, and the operator legitimately
 *      enables things that are not pickable heroes. Task #215 added
 *      「聖杯黑泥醬 - 喪標麥可」(`godie-zombiex`), a MONSTER-team mob
 *      (`packages/shared/src/sim/mobs.ts`: no ChampionComp, never in
 *      champ-select, spawned in edge waves from round 3). It is whitelisted
 *      with ONE ability (`godie-zombiex.ex`), yet the 48×5 coverage assertion
 *      read it as a 49th hero and demanded five VFX classification rows for a
 *      creep. Nothing was missing from `bindings.ts` — the yardstick moved.
 *
 * The TRACKED source of truth for the shipped roster is `starterChampions` in
 * `apps/platform/internal/curation/starter.go` (that block carries a NOTE
 * telling you it is parsed as exactly that). It is the same source
 * `apps/game-server/src/curation/whitelist.test.ts` and
 * `curationVsContentModel.test.ts` parse, for exactly this reason.
 *
 * The operator document is NOT dropped — the last test still audits it when it
 * is present (or when `GGD_WHITELIST_FILE` points at an exported one), so a
 * champion opened by hand with no bindings behind it still fails loudly. What
 * changed is that the audit now asks for EVIDENCE (a real vfx doc behind every
 * ability the operator enabled) instead of assuming every whitelisted id is a
 * five-slot hero.
 */
import { beforeAll, describe, it, expect } from "vitest";
// GH#384 —— 逐技能特效綁定住在 content/；⛔ 少了這一行從 repo 根跑單檔會看到空的綁定。
import "./shippedAbilityArt.testkit";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { isAlternateForm, zVfxDoc } from "@ggd/shared/content";
import { ContentLoader } from "@ggd/shared/content/loader";
import { FsContentSource } from "@ggd/shared/content/node/FsContentSource";
import { registerAll } from "@ggd/shared/content/registries";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { rosterBindings, abilityVfxKeys, curatedDocs, vfxKeyFor } from "./bindings";
import { abilityArtRows } from "./abilityArtContent";

import { readStarterRoster } from "@ggd/shared/testkit/starterRoster";

/** `config/roster.json` 的 `retiredChampions` —— ⛔ 不抄一份 id 清單。 */
function retiredChampionIds(): string[] {
  const doc = JSON.parse(
    readFileSync(join(REPO, "content/config/roster.json"), "utf8"),
  ) as { retiredChampions?: string[] };
  return doc.retiredChampions ?? [];
}

const REPO = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const STARTER_GO = join(REPO, "apps/platform/internal/curation/starter.go");
const CONTENT = join(REPO, "content");
/** The operator's live document — gitignored, so absent on a build agent. */
const OPERATOR_DOC = process.env["GGD_WHITELIST_FILE"] ?? join(REPO, "data/curation/whitelist.json");

/** How to audit a whitelist this repo cannot see. Printed, not just commented. */
const AUDIT_THE_LIVE_HOST =
  "curl -s <host>/api/v1/curation/whitelist -o /tmp/wl.json && " +
  "GGD_WHITELIST_FILE=/tmp/wl.json pnpm --filter @ggd/client test -- src/render/vfx/bindings.test.ts";

/** Pull one `name = []string{ … }` block's quoted ids out of the Go source. */
function goList(src: string, name: string): string[] {
  const start = src.indexOf(`${name} = []string{`);
  if (start < 0) throw new Error(`starter.go no longer declares ${name} — update this test`);
  const open = src.indexOf("{", start);
  const close = src.indexOf("\n\t}", open);
  if (close < 0) throw new Error(`could not find the end of ${name} in starter.go`);
  // Drop `//` line comments FIRST: the per-entry annotations are prose and can
  // themselves contain quoted words, which the id regex would otherwise scrape.
  const body = src.slice(open, close).replace(/\/\/[^\n]*/g, "");
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
}

const roster: string[] = goList(readFileSync(STARTER_GO, "utf8"), "starterChampions");

/**
 * The shipped roster size, asserted rather than derived — a hard number is what
 * makes a silently-truncated parse fail instead of passing vacuously. It is a
 * RATCHET in the same spirit as #128's castability floor: it moves up when the
 * operator genuinely opens heroes (48 → 50 when task #212 opened 賈修貝爾
 * `godie-hblm` and 揍敵客桀諾 `godie-efur`), and every id it counts must also
 * carry art for its five casts — a `bindings.ts` ROSTER row, or (forge-authored
 * heroes since GH#1165, see `inArtTable`) a real vfx doc bound in its own
 * ability docs — so opening a hero without art behind its casts still fails here. 51 → 53 on 2026-07-30 when the owner opened
 * 白木卡迪那 `godie-e00s` and 傑富力士 `godie-ucrl`; both owed rows and got them.
 */
// ⭐ 名單長度**從 starter.go 推導**（`starterRosterSize`），⛔ 不再抄一份數字。
//    2026-08-16 owner 下架四位（53→49）時，這個數字的四份副本讓四條測試
//    同時紅，而每一條都在講自己的功能壞了 —— 沒有一條說出「名單變短了」。
const ROSTER_SIZE = readStarterRoster(REPO).length;

/**
 * ⭐⭐ 一位上架英雄「五招畫什麼」住在**哪一個住處** —— 從出貨內容推導，⛔ 不手寫 id。
 *
 * ⚠️ 下面那條主守衛以前假設「上架名單上**每一位**都在分類表
 * （`content/config/vfx-ability-art.json` 的 `prim`）裡有五列」。
 * 那在 task #79 時是真的：名單全是 w3x 英雄，分類是讀技能中文名分出來的。
 * ⛔ 2026-09-10 起不再是：`4b5713641`／`503dd557b`／`5f7d222ef`（GH#1165）經
 * hero-forge 編譯上架了 81 位，它們招式的特效由**作者稿**決定（recipe 的
 * `resolvedVfxId` → 技能文件自己的 `vfxKey`，`tools/ship-81/gen.py`）——
 * 分類表**不是它們的住處**；替它們在表裡再抄一份 ＝ 第〇·四守則的第二個住處
 * （作者改 recipe 的那一天，表裡那份就是謊話）。
 * ⇒ 兩個住處、各自一條證據，⛔ 沒有一位可以兩邊都不是：
 *   · 表裡**有任何一列**（prim／family／owner／promoted）⇒ 五格都要有 `prim` 列
 *     （`w3xAbilityArt.primitiveFallbackFor` 的第 3 階只讀這一格 —— 那一位的家族美術
 *     解不出來時，就靠它不畫空白）。⭐ 這一半與改動前逐字相同。
 *   · 表裡**一列都沒有** ⇒ 五格註冊完的技能都要帶 `vfxKey`（技能文件自己寫的，或載入時由
 *     `communityCueFallback.ts` 照社群施法提示規則解析的 —— ⭐ 量的是 `Abilities.tryGet`）、⛔ 不是火焰佔位、
 *     而且指向一份**真的畫得出東西**的 vfx 文件 —— ⭐ 與本檔 operator 稽核同一把尺
 *     （`abilityArtProblem`），⛔ 不是「文件存在就算」。
 */
function inArtTable(champ: string): boolean {
  return Object.keys(abilityArtRows()).some((id) => id.startsWith(`${champ}.`));
}

/** 這一份 vfx 文件真的畫得出東西嗎？`null` ＝ 是；否則回傳理由。⭐ 本檔兩條守衛共用這一把尺。 */
function vfxKeyProblem(vfxKey: string | undefined): string | null {
  if (!vfxKey) return "has no vfxKey — it would cast with nothing";
  if (vfxKey === "fx.ember-bolt-cast") return "still points at the generic fire placeholder";
  const vfxPath = join(CONTENT, "vfx", `${vfxKey}.json`);
  if (!existsSync(vfxPath)) return `→ ${vfxKey} names a vfx doc that does not exist`;
  const vfx = JSON.parse(readFileSync(vfxPath, "utf8")) as {
    schema?: string;
    mode?: string;
    rate?: number;
    burstCount?: number;
    lifetimeSec?: { min: number; max: number };
    size?: { start: number };
    lifespanSec?: number;
    widthAbove?: number;
  };
  if (vfx.schema === "ribbon@1") {
    // A swept trail: it is visible iff it lives and has width.
    if (!((vfx.lifespanSec ?? 0) > 0)) return `→ ${vfxKey} is a ribbon with no lifespan`;
    if (!((vfx.widthAbove ?? 0) > 0)) return `→ ${vfxKey} is a ribbon with no width`;
    return null;
  }
  const emission = vfx.mode === "burst" ? (vfx.burstCount ?? 0) : (vfx.rate ?? 0);
  if (!(emission > 0)) return `→ ${vfxKey} emits no particles (${vfx.mode})`;
  if (!((vfx.lifetimeSec?.max ?? 0) > 0)) return `→ ${vfxKey} particles die instantly`;
  if (!((vfx.size?.start ?? 0) > 0)) return `→ ${vfxKey} particles have zero size`;
  return null;
}

/**
 * ⭐ 讀的是 `VfxSystem` 讀的那一份 —— 出貨載入器註冊完的 `Abilities.tryGet(id)`
 * （`VfxSystem.ts` 的 `case "abilityCast"` → `this.doc(def?.vfxKey)`），⛔ 不是磁碟上的 JSON。
 * 載入時才解析的欄位（`@ggd/shared/content/communityCueFallback`：作者沒挑施法特效的社群技能）
 * 只在註冊表看得到；拿磁碟那一份量 ＝ 被測的不是出貨的那個（失敗形態⑤）。
 */
beforeAll(async () => {
  registerAll((await new ContentLoader(new FsContentSource(CONTENT)).load()).store);
}, 120_000);

/** 一支技能（出貨的 `content/abilities/<id>.json`，經出貨載入器註冊）綁的特效畫得出東西嗎？ */
function abilityArtProblem(abilityId: string): string | null {
  const abilityPath = join(CONTENT, "abilities", `${abilityId}.json`);
  if (!existsSync(abilityPath)) return "has no content doc";
  const ability = Abilities.tryGet(abilityId as AbilityId) as { vfxKey?: string } | undefined;
  if (!ability) return "has a content doc but the shipped loader did not register it";
  const problem = vfxKeyProblem(ability.vfxKey);
  if (!problem || ability.vfxKey) return problem;
  // ⭐ 說清楚它**還剩什麼**：有 vfx-script 的話，列出那份 script 的段落種類 ——
  //   ⛔ 不讓「cast with nothing」蓋掉「身體動作／浮字／子型別呼叫其實在」這個事實。
  const scriptPath = join(CONTENT, "vfx-scripts", `${abilityId}.json`);
  if (!existsSync(scriptPath)) return problem;
  const script = JSON.parse(readFileSync(scriptPath, "utf8")) as { segments?: Record<string, unknown>[] };
  const kinds = (script.segments ?? []).map((s) => {
    const kind = s["kind"];
    return typeof kind === "string" ? kind : "call";
  });
  return `has no vfxKey — only its vfx-script draws for it (segments: ${kinds.join(", ")})`;
}

const PLAYER_SLOTS = ["q", "w", "e", "r", "ex"] as const;

describe("roster bindings cover every whitelisted champion (ability-vfx-bindings)", () => {
  it("binds every ability of every roster champion (none missing)", () => {
    cover("ability-vfx-bindings");
    // Guard the parse itself: a silently-empty goList would make every
    // assertion below vacuous, which is the failure mode this file just had.
    expect(roster.length, "starter.go yielded no champions — the parse broke").toBe(ROSTER_SIZE);
    const binds = rosterBindings();
    const tableRoster = roster.filter(inArtTable);
    const authoredRoster = roster.filter((champ) => !inArtTable(champ));
    // ⛔ 分類表沒載入時「每一位都是作者稿」會讓表那一半結構上永遠綠 —— 先自證。
    expect(tableRoster.length, "⛔ 分類表裡一位上架英雄都沒有 —— 表沒載入？（量尺壞了）").toBeGreaterThan(0);
    for (const champ of tableRoster) {
      const slots = binds.filter((b) => b.abilityId.startsWith(`${champ}.`)).map((b) => b.abilityId);
      expect(new Set(slots)).toEqual(new Set(PLAYER_SLOTS.map((slot) => `${champ}.${slot}`)));
    }
    // ⭐ 作者稿那一半 —— 一次撈全部再紅（⛔ 不是停在第一支），逐支指名。
    const unbound = authoredRoster.flatMap((champ) =>
      PLAYER_SLOTS.flatMap((slot) => {
        const problem = abilityArtProblem(`${champ}.${slot}`);
        return problem ? [`${champ}.${slot} ${problem}`] : [];
      }),
    );
    expect(
      unbound,
      "⛔ 這些上架技能在分類表裡沒有列，⛔ 註冊完的技能（技能文件＋載入時解析）也沒有綁到畫得出東西的特效：\n  " +
        unbound.join("\n  "),
    ).toEqual([]);
    // The table COVERS the roster; anything beyond it must be a 變身 form. Task
    // #249 swapped 10 roster slots from the alternate body to the base, and the
    // alternate rows were KEPT rather than deleted — the two halves of a pair
    // share one kit, so the alt already needs the same bindings the moment the
    // transform mechanic (task #119) can put a player in that body. An extra
    // row that is NOT an alternate form is a mistake and still fails here.
    const rosterIds = new Set(roster);
    const extra = [...new Set(binds.map((b) => b.abilityId.replace(/\.[a-z]+$/, "")))].filter(
      (id) => !rosterIds.has(id),
    );
    // ⭐ 2026-08-16 —— 第三種合法身分：**已下架**（`config/roster.json` 的
    //    `retiredChampions`）。owner 下架四位之後它們掉出 roster，而綁定列還在，
    //    於是這條把「資料留著」報成「多了一列錯的」。
    // ⛔ 正解不是刪掉那些綁定 —— 下架在這個專案是**可逆的**（roster.json 的註解
    //    自己寫著「技能補完之後把 id 從這裡拿掉就是重新上架，不用改程式」）。
    //    綁定跟著英雄走，重新上架那天它們要在原地。⇒ 補上這一類就好。
    const retired = new Set(retiredChampionIds());
    for (const id of extra) {
      if (retired.has(id)) continue;
      expect(isAlternateForm(id), `${id} is bound but is neither on the roster nor a 變身 form`).toBe(
        true,
      );
    }
    expect(binds).toHaveLength((tableRoster.length + extra.length) * PLAYER_SLOTS.length);
  });

  it("no roster ability keeps the generic fire placeholder", () => {
    cover("ability-vfx-bindings");
    for (const key of Object.values(abilityVfxKeys())) {
      expect(key).not.toBe("fx.ember-bolt-cast");
      expect(key.startsWith("fx.prim.")).toBe(true);
    }
  });

  it("依文潔琳 (godie-n003): Q/E/R resolve to an ICE primitive (the ice spells now have ice)", () => {
    cover("ability-vfx-bindings");
    const keys = abilityVfxKeys();
    expect(keys["godie-n003.q"]).toContain("fx.prim.ice.");
    expect(keys["godie-n003.e"]).toContain("fx.prim.ice.");
    expect(keys["godie-n003.r"]).toContain("fx.prim.ice.");
    // and the generated ice doc actually reads cold (blue-dominant tint)
    const iceDoc = curatedDocs().get(keys["godie-n003.e"]!)!;
    const tint = iceDoc.colorStops![1]![1];
    expect(tint[2]).toBeGreaterThan(tint[0]);
  });

  it("EX / R ultimates scale up vs Q/W/E of the same element+primitive (task #50)", () => {
    cover("ability-vfx-bindings");
    // godie-e008 夏娜: E fire explosion (md) vs R fire explosion (lg)
    const keys = abilityVfxKeys();
    expect(keys["godie-e008.e"]).toBe("fx.prim.fire.explosion");
    expect(keys["godie-e008.r"]).toBe("fx.prim.fire.explosion-lg");
    const docs = curatedDocs();
    const md = docs.get("fx.prim.fire.explosion")!;
    const lg = docs.get("fx.prim.fire.explosion-lg")!;
    expect(lg.sizeStops![1]![1]).toBeGreaterThan(md.sizeStops![1]![1]);
  });

  it("every distinct curated doc is schema-valid and its id equals its vfxKey", () => {
    cover("ability-vfx-bindings");
    const docs = curatedDocs();
    expect(docs.size).toBeGreaterThan(10); // a real palette, reused across abilities
    for (const [key, doc] of docs) {
      expect(doc.id).toBe(key);
      expect(() => zVfxDoc.parse(doc)).not.toThrow();
    }
  });

  it("vfxKeyFor is stable and encodes element + primitive + size", () => {
    cover("ability-vfx-bindings");
    expect(vfxKeyFor({ element: "ice", primitive: "nova", size: "md" })).toBe("fx.prim.ice.nova");
    expect(vfxKeyFor({ element: "fire", primitive: "explosion", size: "lg" })).toBe("fx.prim.fire.explosion-lg");
    expect(vfxKeyFor({ element: "void", primitive: "pulse", size: "sm" })).toBe("fx.prim.void.pulse-sm");
  });
});

// ---------------------------------------------------------------------------
// OPERATOR-DOCUMENT DRIFT
//
// The starter set above is what we SHIP; the operator document is what a given
// box actually serves, and it may open ids the starter set never had (task #212
// 賈修/揍敵客 is queued to do exactly that). This audit catches that drift
// without assuming every whitelisted id is a five-slot hero:
//
//   - anything the operator enabled must have a REAL vfx doc behind it — the
//     ability doc exists, names a vfxKey that is not the generic fire
//     placeholder, and that doc exists in content/vfx with non-zero emission,
//     lifetime and size (a doc that emits nothing is not a binding);
//   - and any champion whose FIVE player slots (q/w/e/r/ex) are all enabled is
//     by definition pickable, so it must carry a `bindings.ts` ROSTER row.
//     `godie-zombiex` (task #215 mob, `.ex` only) is therefore not asked for
//     five rows — on the evidence in the document, not on a hard-coded excuse.
//
// When the document is absent the test does NOT silently skip: it runs, its
// NAME says the document was not present, and it prints how to point the audit
// at a deployed host.
// ---------------------------------------------------------------------------
interface WhitelistDoc {
  champions?: string[];
  abilities?: string[];
}

const operatorPresent = existsSync(OPERATOR_DOC);

describe("operator whitelist vs bindings (ability-vfx-bindings)", () => {
  it(
    operatorPresent
      ? "every champion the operator opened has real vfx behind every ability it enabled"
      : "operator whitelist is NOT present on this machine — only the shipped starter set was audited",
    () => {
      cover("ability-vfx-bindings");
      if (!operatorPresent) {
        // Not a skip: the starter-set audit above already ran and is the thing
        // CI can prove. Say out loud what was NOT covered, and how to cover it.
        expect(roster.length).toBe(ROSTER_SIZE);
        console.info(`[bindings] no operator whitelist at ${OPERATOR_DOC}; audit a host with:\n  ${AUDIT_THE_LIVE_HOST}`);
        return;
      }

      const doc = JSON.parse(readFileSync(OPERATOR_DOC, "utf8")) as WhitelistDoc;
      const champions = doc.champions ?? [];
      const abilities = doc.abilities ?? [];
      expect(champions.length, `${OPERATOR_DOC} lists no champions`).toBeGreaterThan(0);

      const bound = new Set(rosterBindings().map((b) => b.abilityId));
      // ⭐ GH#479（2026-08-20）：**已下架**的英雄即使還勾在 operator 白名單上也進不了
      // 選人畫面（下架刻意住在白名單之外，手動與隨機兩條路都擋），而他們的技能檔已隨
      // 退場批次進了 `content/_legacy/` ⇒ 對他們斷言「有出貨的 vfx」是在量一個
      // 玩家永遠看不到的東西。⛔ 清單從 roster.json 推導，⛔ 不手寫 id。
      const retiredNow = new Set(retiredChampionIds());

      for (const champ of champions.filter((c) => !retiredNow.has(c))) {
        const enabled = abilities.filter((a) => a.startsWith(`${champ}.`));
        expect(enabled.length, `${champ} is whitelisted but no ability of it is enabled`).toBeGreaterThan(0);

        // A champion with all five player slots open is pickable — it owes a
        // bindings.ts row for each, or its casts fall back to the placeholder.
        // ⭐ …when its art lives in the classification table at all. A forge-
        // authored hero (no table row of any kind — see `inArtTable`) owes the
        // per-ability evidence below instead, which every enabled ability gets.
        const allFiveOpen = PLAYER_SLOTS.every((s) => enabled.includes(`${champ}.${s}`));
        if (allFiveOpen && inArtTable(champ)) {
          for (const slot of PLAYER_SLOTS) {
            expect(
              bound.has(`${champ}.${slot}`),
              `${champ}.${slot} is whitelisted and pickable but has no ROSTER row in bindings.ts — ` +
                `add its (element, primitive) classification there`,
            ).toBe(true);
          }
        }

        for (const abilityId of enabled) {
          // ⭐ Same yardstick as the starter-set audit above (`abilityArtProblem`):
          // doc exists → vfxKey present, not the fire placeholder → that vfx doc
          // exists and actually emits (ribbon: lives and has width).
          const problem = abilityArtProblem(abilityId);
          expect(problem, `${abilityId} is whitelisted but ${problem}`).toBeNull();
        }
      }
    },
  );
});

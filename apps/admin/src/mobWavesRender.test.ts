/**
 * 殭屍波系統 — THE "玩家/owner 真的拿得到" GUARDS.
 *
 * This project's signature failure is a thing that was built and cannot be
 * reached, so the logic suite (mobWaves.test.ts) is not enough on its own: it
 * would stay green if the page rendered nothing, if the nav row were deleted, or
 * if a knob existed in the registry but had no input on screen. The three checks
 * here are exactly the three ways that happens:
 *
 *   1. THE ROUTE EXISTS AND IS EAGER — the nav entry, the mount, the Page union
 *      and the session gate are all asserted in ui/App.tsx / store.ts SOURCE
 *      (comments stripped, so prose cannot satisfy a check). Delete the sidebar
 *      row and this file goes red.
 *   2. EVERY FIELD HAS A REAL CONTROL — the page is server-rendered and each of
 *      the 22 knobs must appear as an input carrying `data-field="<key>"`, not
 *      merely as a label. Delete one input from the form and this file goes red.
 *   3. THE SAVE NEVER GOES TO THE LOOPBACK CONTENT-API — a NEGATIVE source
 *      check, which is the one thing a rendered page cannot demonstrate: an
 *      absent call produces no output to assert on.
 *
 * WHAT THIS FILE DELIBERATELY NO LONGER CLAIMS. It used to "guard" the durable
 * write with `expect(src).toMatch(/putOverlayDoc\(ARENA_RULES_COLLECTION…/)`.
 * That asserts the call EXISTS and nothing about its PAYLOAD: swapping
 * `configFromForm(form)` for `SHIPPED_MOB_WAVES` — the owner's 22 edits thrown
 * away on every save — left this file, and the whole console suite, green.
 * The payload, the champion `<select>`, and the per-round column are now
 * asserted by DRIVING the page in `mobWavesSave.test.ts`. Do not re-add a
 * source regex here and call the write guarded.
 *
 * `renderToString` needs no DOM (the console's vitest runs in plain node), and
 * effects do not fire under SSR — so what is asserted is the FIRST PAINT, seeded
 * from the shipped block, which is precisely the state an operator sees before
 * any request lands.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { MobWavesPage } from "./ui/MobWavesPage";
import { MOB_WAVES_LABELS, type MobWavesFieldKey } from "./mobWaves";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

/** Strip comments so this repo's long doc blocks cannot satisfy a source check. */
const code = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const APP_SRC = read("apps/admin/src/ui/App.tsx");
const STORE_SRC = read("apps/admin/src/store.ts");
const PAGE_SRC = read("apps/admin/src/ui/MobWavesPage.tsx");

const NAV_LABEL = "殭屍波系統";

/** The 22 knobs, written out by hand — see mobWaves.test.ts for why. */
const EVERY_FIELD: readonly MobWavesFieldKey[] = [
  "fromRound",
  "firstWaveSec",
  "waveIntervalSec",
  "mobsPerWaveCap",
  "maxAlivePerZone",
  "mob.maxHp",
  "mob.attackDamage",
  "mob.moveSpeed",
  "mob.attackRange",
  "mob.attackCdSec",
  "mob.radius",
  "mob.modelKey",
  "mob.championId",
  "mob.baseLevel",
  "mob.levelPerRound",
  "mob.baseHp",
  "mob.hpPerLevel",
  "mob.baseRegen",
  "mob.regenPerLevel",
  "reward.gold",
  "reward.xp",
  "reward.killsPerLevel",
];

const HTML = renderToString(createElement(MobWavesPage));

// ---------------------------------------------------------------------------

describe("the route exists, is eager, and is session-gated", () => {
  it("App.tsx carries the sidebar entry", () => {
    cover("admin-mob-waves");
    const src = code(APP_SRC);
    // the NAV row itself — delete it and the page becomes unreachable
    expect(src).toMatch(/\{\s*page:\s*"mobWaves",\s*label:\s*"殭屍波系統"/);
    expect(src).toContain(NAV_LABEL);
  });

  it("App.tsx mounts the page on that route", () => {
    cover("admin-mob-waves");
    const src = code(APP_SRC);
    expect(src).toMatch(/page === "mobWaves" && <MobWavesPage \/>/);
  });

  it("the import is TOP-LEVEL and STATIC — never a dev-gated dynamic import", () => {
    cover("admin-mob-waves");
    const src = code(APP_SRC);
    expect(src).toMatch(/^import \{ MobWavesPage \} from ["']\.\/MobWavesPage["'];/m);
    // the shape rollup dead-folds out of a production build
    expect(src).not.toMatch(/import\(\s*["']\.\/MobWavesPage["']\s*\)/);
    // and it must not be smuggled into the dev-only 內容管理 chunk
    expect(src).not.toMatch(/CONTENT_SUITE_PAGES[\s\S]{0,400}"mobWaves"/);
  });

  it("store.ts declares the route and puts it behind an operator session", () => {
    cover("admin-mob-waves");
    const src = code(STORE_SRC);
    expect(src).toContain('| "mobWaves"');
    expect(src).toMatch(/SESSION_REQUIRED_PAGES[\s\S]*?"mobWaves"[\s\S]*?\]\)/);
  });
});

describe("the save cannot go to the loopback content-api", () => {
  // The POSITIVE claims about the write — that it targets config/arena-rules,
  // that the payload is the operator's form, that the sibling blocks ride along
  // — are asserted by calling the page's real onSave in mobWavesSave.test.ts.
  // Only the NEGATIVE one lives here, because "this call is absent" leaves
  // nothing behind to observe at runtime.
  it("never touches the loopback content-api (it has no production route)", () => {
    cover("admin-mob-waves");
    const src = code(PAGE_SRC);
    expect(src).not.toContain("contentApi");
    expect(src).not.toContain("/content-api");
  });
});

describe("the page renders, and every knob is really on screen", () => {
  it("paints its title and the two things an operator must understand", () => {
    cover("admin-mob-waves");
    expect(HTML).toContain(NAV_LABEL);
    // 「改了會不會被部署蓋掉」 — answered on the page, not only in a report
    expect(HTML).toContain("git pull");
    expect(HTML).toContain("耐久覆蓋層");
    // and the honest admission about the per-round champion column
    expect(HTML).toContain("對戰端還沒有讀它");
  });

  it("EVERY field has an input carrying its own data-field", () => {
    cover("admin-mob-waves");
    for (const key of EVERY_FIELD) {
      expect(HTML, `${key} has NO control on the page`).toContain(`data-field="${key}"`);
    }
  });

  it("EVERY field shows its 中文名 and its 影響 line, not a bare box", () => {
    cover("admin-mob-waves");
    for (const key of EVERY_FIELD) {
      const spec = MOB_WAVES_LABELS[key];
      expect(HTML, `${key} 中文名 missing`).toContain(spec.zh);
      expect(HTML, `${key} 影響說明 missing`).toContain(spec.note.slice(0, 10));
    }
  });

  it("prints the value CURRENTLY IN FORCE next to the boxes", () => {
    cover("admin-mob-waves");
    expect(HTML).toContain("目前生效");
    // …and the shipped comparison, so an edit is legible as a delta
    expect(HTML).toContain("出貨版");
  });
});

describe("the per-round table reads as a curve", () => {
  it("has one row per round, including the rounds before waves start", () => {
    cover("admin-mob-waves");
    for (let round = 1; round <= 10; round++) {
      expect(HTML, `round ${round} missing`).toContain(`第 ${round} 回合`);
    }
    expect(HTML).toContain("還沒開始出殭屍");
  });

  it("每波數量 / 場上上限 / 由誰擔任 are the columns", () => {
    cover("admin-mob-waves");
    expect(HTML).toContain("每波數量");
    expect(HTML).toContain("場上上限");
    expect(HTML).toContain("由誰擔任");
  });

  it("the scheduled rounds are EDITABLE, champion column included", () => {
    cover("admin-mob-waves");
    for (const round of [6, 7, 8, 9, 10]) {
      expect(HTML, `round ${round} caps not editable`).toContain(
        `data-field="schedule.${round}.mobsPerWaveCap"`,
      );
      expect(HTML).toContain(`data-field="schedule.${round}.maxAlivePerZone"`);
      expect(HTML, `round ${round} has no 由誰擔任 control`).toContain(
        `data-field="schedule.${round}.championId"`,
      );
    }
  });

  it("round 10's 0/0 is labelled as DELIBERATE, not left looking like a typo", () => {
    cover("admin-mob-waves");
    expect(HTML).toContain("乾淨總決賽");
  });

  it("shows the derived 等級 and 每隻血量 for the active rounds", () => {
    cover("admin-mob-waves");
    // round 3 = level 3 (baseLevel), round 10 = level 10
    expect(HTML).toContain("Lv 3");
    expect(HTML).toContain("Lv 10");
    // hp at level 3 = 20 + 20*2 = 60
    expect(HTML).toContain(">60<");
  });
});

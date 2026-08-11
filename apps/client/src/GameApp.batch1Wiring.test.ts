/**
 * Batch-1 visible-correctness wiring guard (1B-1 + 1B-2). GameApp drives the
 * canvas imperatively and cannot be instantiated headlessly (Babylon engine,
 * sockets, render seam), so — in the same spirit as architecture.test.ts —
 * this is a SOURCE scan that pins the two callers the plan found were missing.
 * Their whole failure mode was "dead code the internal unit tests still passed
 * for": StatusAuraFx and enemyUnitsFor were green in isolation, but nothing in
 * the frame loop ever CALLED them for the champions / neutrals that needed it.
 *
 *   · 1B-1  the per-frame champion pass registers each live champion's flags
 *           with the status-aura layer, so a stun/root/slow finally reads on the
 *           body (`vfx.statusFx.set(...)` had ZERO production callers before);
 *   · 1B-2  the enemy pick list admits the neutral objectives (guardian tower +
 *           harvest flower), so a human can click / attack-move / auto-acquire
 *           them — not just bots via direct AI orders.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { stripComments } from "@ggd/shared/testkit/stripComments";

/**
 * GameApp source with comments stripped, so prose can't satisfy the assertions.
 *
 * ⚠️ REPAIRED BY #272. This used to be `.replace(block).replace(line)`, and
 * GameApp line 489 (`// render/** may not read it …`) opened a phantom block
 * comment there that swallowed the next 231 LINES of real code — this file's
 * own assertions passed only because their targets happen to sit outside that
 * window. `stripComments` scans once with an alternation so whichever comment
 * opens first wins; see its module doc.
 */
const SRC = stripComments(readFileSync(fileURLToPath(new URL("./GameApp.ts", import.meta.url)), "utf8"));

describe("1B-1 status-aura layer has a live per-frame caller (status-aura-wiring)", () => {
  it("the frame loop feeds each champion's flags into vfx.statusFx.set", () => {
    cover("status-aura-wiring");
    // the exact caller the plan said was absent (grep count was 0 in production)
    expect(SRC).toMatch(/this\.vfx\.statusFx\.set\(\s*es\.id\s*,\s*es\.flags\s*,/);
  });

  it("only registers auras for LIVE champions (dead bodies stay quiet)", () => {
    cover("status-aura-wiring");
    // the guard immediately above the set() call gates on champion + alive
    expect(SRC).toMatch(/es\.kind !== KIND_CHAMPION \|\| !es\.alive\)\s*return;\s*const p = this\.views\.posOf/);
  });
});

describe("1B-2 neutral objectives are pickable enemy units (neutral-pick-wiring)", () => {
  it("enemyUnitsFor admits guardians, flowers AND mobs — not just kind 0", () => {
    cover("neutral-pick-wiring");
    // ⚠️ 這一條是**掃原始碼字串**（CLAUDE.md 失敗形態⑥）。它擋得住「有人把
    //    kind 從過濾器拿掉」，擋不住「過濾對了但選取數學是錯的」。
    //    真正驗行為的那一條在 `src/input/mobTargeting.test.ts`（GH#315，
    //    兩個突變都驗過會紅）—— 兩條要一起看。
    // the old gate `es.kind !== 0` filtered BOTH neutrals out of every pick path
    expect(SRC).not.toMatch(/if \(es\.kind !== 0 \|\| !es\.alive\) return;/);
    // ⭐ GH#315（2026-08-11）：KIND_MOB 加進來了。#215 的殭屍波是在這個過濾器
    //    之後才上架的，於是第 3 回合起場上最多 60 隻殭屍**一隻都點不到** ——
    //    而三條輸入路徑（滑鼠/手把/觸控）共用這一份清單。
    for (const kind of ["KIND_CHAMPION", "KIND_GUARDIAN", "KIND_FLOWER", "KIND_MOB"]) {
      expect(SRC, `enemyUnitsFor 的過濾器少了 ${kind} —— 那一類敵人任何裝置都指不到`)
        .toMatch(new RegExp(`es\\.kind !== ${kind}`));
    }
  });
});

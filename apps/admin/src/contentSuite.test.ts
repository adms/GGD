/**
 * content-suite (owner directive 2026-07-25) — the 內容·素材管理 back-office. The
 * three properties the owner's CONSTRAINTS pin:
 *
 *   • the nav REGROUP drops nothing — every previously-reachable page is still
 *     listed in App's NAV (checked against the shell source);
 *   • the NEW editable collections' inline-create skeletons are minimal-VALID
 *     (a bare {id} 422s), so a create never produces content the sim/loader
 *     rejects;
 *   • the dev content routes stay OUT of SESSION_REQUIRED_PAGES, preserving the
 *     loopback no-login editing parity with "content"/"voiceGen".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import { COLLECTIONS } from "@ggd/shared/content";
import { pageRequiresSession, type Page } from "./store";
import { CONTENT_ROUTES, CREATABLE, DELETABLE, skeletonDoc } from "./ui/ContentPage";

const APP_SRC = readFileSync(fileURLToPath(new URL("./ui/App.tsx", import.meta.url)), "utf8");

describe("the nav regroup keeps every prior page reachable", () => {
  it("still lists all 15 pre-existing routes in NAV", () => {
    cover("content-admin-gate");
    // every route the console had BEFORE this back-office reorg. The regroup may
    // move them between sections but must never drop one.
    const PRIOR: readonly Page[] = [
      "hub",
      "approvals",
      "players",
      "matches",
      "replays",
      "announcements",
      "curation",
      "combatEnv",
      "serverOps",
      "ai",
      "modelBudget",
      "iconTracking",
      "mcoinGrant",
      "invites",
      "audit",
    ];
    for (const p of PRIOR) {
      expect(APP_SRC, `NAV lost the ${p} route`).toContain(`page: "${p}"`);
    }
  });

  it("groups the nav under the owner's four section headers", () => {
    cover("content-admin-gate");
    for (const s of ["營運", "內容·素材管理", "資產產線", "系統"]) {
      expect(APP_SRC).toContain(s);
    }
  });
});

describe("the 內容·素材管理 dev routes", () => {
  it("cover every content-editor collection over per-collection routes", () => {
    cover("content-admin-gate");
    // champions / abilities(+augments) / items(+loot-tables) / vfx / arenas each
    // route to the SAME editor engine via `only`; audio + newHero are siblings.
    const pages = CONTENT_ROUTES.map((r) => r.page);
    // 鑄形工坊 (task #229) is the third sibling page: it renders its own
    // component (the voxel studio) rather than the ContentPage editor, so like
    // audio/newHero it carries no `only` list.
    expect(pages).toEqual([
      "audio",
      "champions",
      "newHero",
      "abilities",
      "items",
      "vfx",
      "arenas",
      "voxelStudio",
      // 🎨 特效工坊 · 演出腳本（GH#838）—— 第四個「自己的元件」頁（iframe studio）。
      "vfxStudio",
    ]);
    const only = new Set(CONTENT_ROUTES.flatMap((r) => r.only ?? []));
    for (const c of ["champions", "abilities", "augments", "items", "loot-tables", "vfx", "arenas"]) {
      expect(only.has(c as never), `no route surfaces ${c}`).toBe(true);
    }
  });

  it("stay OUT of SESSION_REQUIRED_PAGES (loopback no-login editing preserved)", () => {
    cover("content-admin-gate");
    for (const p of [
      "audio",
      "champions",
      "newHero",
      "abilities",
      "items",
      "vfx",
      "arenas",
      "voxelStudio",
    ] as const) {
      expect(pageRequiresSession(p), `${p} must not be session-gated`).toBe(false);
    }
  });
});

describe("inline-create skeletons are minimal-VALID for the new collections", () => {
  it("the vfx skeleton passes zVfxCollectionDoc (a bare {id} would 422)", () => {
    cover("content-admin-gate");
    const doc = skeletonDoc("vfx", "fx.new-thing");
    expect(COLLECTIONS.vfx.schema.safeParse(doc).success).toBe(true);
    expect(COLLECTIONS.vfx.schema.safeParse({ id: "fx.new-thing" }).success).toBe(false);
  });

  it("the arena skeleton passes zArenaDoc, spawns inside the boundary", () => {
    cover("content-admin-gate");
    const doc = skeletonDoc("arenas", "arena.new-place");
    const r = COLLECTIONS.arenas.schema.safeParse(doc);
    expect(r.success, r.success ? "" : JSON.stringify(r.error.issues)).toBe(true);
    expect(COLLECTIONS.arenas.schema.safeParse({ id: "arena.new-place" }).success).toBe(false);
  });

  it("the augment skeleton still validates (unchanged behaviour)", () => {
    cover("content-admin-gate");
    expect(COLLECTIONS.augments.schema.safeParse(skeletonDoc("augments", "aug.x")).success).toBe(true);
  });
});

describe("create / delete policy split", () => {
  it("vfx + arenas are both creatable and deletable; champions is neither inline", () => {
    cover("content-admin-gate");
    for (const c of ["augments", "vfx", "arenas"] as const) {
      expect(CREATABLE.has(c)).toBe(true);
      expect(DELETABLE.has(c)).toBe(true);
    }
    // champions is create-via-wizard-only and NOT deletable (imported roster +
    // would orphan embedded ability twins).
    expect(CREATABLE.has("champions")).toBe(false);
    expect(DELETABLE.has("champions")).toBe(false);
    // abilities / items / loot-tables stay edit-only.
    for (const c of ["abilities", "items", "loot-tables"] as const) {
      expect(CREATABLE.has(c)).toBe(false);
      expect(DELETABLE.has(c)).toBe(false);
    }
  });
});

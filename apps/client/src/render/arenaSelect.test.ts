/**
 * arenaSelect (task #145) — the pure per-round arena-id resolver. Guards the
 * two things that matter: a per-round field WINS over mapId when present, and a
 * missing/empty per-round field can never blank out the working mapId (which
 * would leave the client with no arena to build).
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { resolveArenaId } from "./arenaSelect";

describe("resolveArenaId (per-round arena swap)", () => {
  it("returns '' when the state is missing or exposes no arena id", () => {
    cover("client-arena-swap-absent");
    expect(resolveArenaId(null)).toBe("");
    expect(resolveArenaId(undefined)).toBe("");
    expect(resolveArenaId({})).toBe("");
  });

  it("falls back to the match-level mapId when no per-round field is present", () => {
    cover("client-arena-swap-fallback");
    expect(resolveArenaId({ mapId: "arena.skeleton" })).toBe("arena.skeleton");
  });

  it("prefers a per-round arena id over mapId", () => {
    cover("client-arena-swap-perround");
    expect(resolveArenaId({ mapId: "arena.skeleton", roundArenaId: "arena.forest" })).toBe(
      "arena.forest",
    );
    expect(resolveArenaId({ mapId: "arena.skeleton", arenaId: "arena.desert" })).toBe("arena.desert");
  });

  it("an empty/absent per-round field never blanks out mapId", () => {
    cover("client-arena-swap-noblank");
    expect(resolveArenaId({ mapId: "arena.skeleton", roundArenaId: "" })).toBe("arena.skeleton");
    expect(resolveArenaId({ mapId: "arena.skeleton", roundArenaId: undefined })).toBe(
      "arena.skeleton",
    );
  });

  it("resolves per-round candidates in most-specific-first order", () => {
    cover("client-arena-swap-priority");
    expect(
      resolveArenaId({ mapId: "m", arenaId: "a", roundMapId: "rm", roundArenaId: "ra" }),
    ).toBe("ra");
    expect(resolveArenaId({ mapId: "m", arenaId: "a", roundMapId: "rm" })).toBe("rm");
    expect(resolveArenaId({ mapId: "m", arenaId: "a" })).toBe("a");
  });
});

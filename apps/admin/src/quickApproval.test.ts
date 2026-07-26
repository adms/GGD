/**
 * Quick Approval (task #242) — the derivation, the union contract and the
 * warning that must fire.
 *
 * Every fixture here is SYNTHETIC. That is deliberate and it is the point of
 * the design: the page must contain no baked answer about today's roster, so
 * these tests cannot assert "the delta is {賈修, 揍敵客}" either — they assert
 * the RULE that produces it, which is the thing that has to stay true after the
 * next re-import, on the family host, and on a deploy whose whitelist nobody
 * here has ever seen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { cover } from "@ggd/shared/testkit/cover";
import {
  ABILITY_SLOTS,
  abilityIdsFor,
  auditStats,
  buildPlan,
  buildRows,
  describePlan,
  disableChampionRequest,
  editorExposureRow,
  halfEnabledChampions,
  median,
  missingAbilitySlots,
  parseChampionStats,
  peerBaseline,
  planBulkRequests,
  planIsEmpty,
  rosterDelta,
  rowsNeedingSecondConfirm,
  secondConfirmText,
  summarizeResult,
  type BuildRowsInput,
  type ChampionStats,
} from "./quickApproval";

// --------------------------------------------------------------- fixtures --

/** A healthy champion, near the middle of a normal roster. */
function healthy(id: string, name = id): ChampionStats {
  return { id, name, role: "fighter", maxHealth: 480, growthHealth: 54, armor: 6, mr: 28, ms: 5.9 };
}

/**
 * The shape the owner's brief is about: a champion sheet retuned to serve a
 * trash-mob avatar — a fraction of peer HP, no resistances, half move speed.
 * Named after nothing: the check must fire on the NUMBERS.
 */
function mobLike(id: string, name = id): ChampionStats {
  return { id, name, role: "tank", maxHealth: 100, growthHealth: 100, armor: 0, mr: 0, ms: 3.0 };
}

function statsMap(...s: ChampionStats[]): Map<string, ChampionStats> {
  return new Map(s.map((x) => [x.id, x]));
}

const NO_PROBE = { status: 404, servesEditor: false };

function input(over: Partial<BuildRowsInput> = {}): BuildRowsInput {
  return {
    declaredChampions: [],
    liveChampions: [],
    liveAbilities: [],
    stats: new Map(),
    pendingAccounts: [],
    editorProbe: NO_PROBE,
    ...over,
  };
}

// ------------------------------------------------------------ the deltas --

describe("roster delta — both directions, computed from live state", () => {
  it("forward: declared in the version-controlled set but not enabled here", () => {
    cover("adminui-quick-approval");
    const d = rosterDelta(["a", "b", "c"], ["a", "c"]);
    expect(d.waiting).toEqual(["b"]);
    expect(d.undeclared).toEqual([]);
  });

  it("reverse: enabled here but declared nowhere — the opposite meaning", () => {
    cover("adminui-quick-approval");
    const d = rosterDelta(["a"], ["a", "zz"]);
    expect(d.waiting).toEqual([]);
    expect(d.undeclared).toEqual(["zz"]);
  });

  it("is empty in both directions once the two sides agree", () => {
    cover("adminui-quick-approval");
    expect(rosterDelta(["b", "a"], ["a", "b"])).toEqual({ waiting: [], undeclared: [] });
  });

  it("a row disappears by itself once the id is enabled — nothing to clean up", () => {
    cover("adminui-quick-approval");
    const before = buildRows(input({ declaredChampions: ["x"], stats: statsMap(healthy("x")) }));
    expect(before.filter((r) => r.kind === "champion-open")).toHaveLength(1);
    const after = buildRows(
      input({
        declaredChampions: ["x"],
        liveChampions: ["x"],
        liveAbilities: abilityIdsFor("x"),
        stats: statsMap(healthy("x")),
      }),
    );
    expect(after.filter((r) => r.kind === "champion-open")).toHaveLength(0);
    expect(after.filter((r) => r.kind === "ability-fill")).toHaveLength(0);
  });
});

describe("half-enabled champions", () => {
  it("names the five slots the platform's starter builder uses", () => {
    cover("adminui-quick-approval");
    expect([...ABILITY_SLOTS]).toEqual(["q", "w", "e", "r", "ex"]);
    expect(abilityIdsFor("hero")).toEqual([
      "hero.q",
      "hero.w",
      "hero.e",
      "hero.r",
      "hero.ex",
    ]);
  });

  it("flags an enabled champion carrying only its EX — the sim's one gated slot", () => {
    cover("adminui-quick-approval");
    const half = halfEnabledChampions(["hero"], ["hero.ex"]);
    expect(half).toEqual([{ id: "hero", missing: ["hero.q", "hero.w", "hero.e", "hero.r"] }]);
  });

  it("says nothing about a fully wired champion", () => {
    cover("adminui-quick-approval");
    expect(halfEnabledChampions(["hero"], abilityIdsFor("hero"))).toEqual([]);
  });

  it("missingAbilitySlots is what the approval row unions in", () => {
    cover("adminui-quick-approval");
    expect(missingAbilitySlots("hero", new Set(["hero.q"]))).toEqual([
      "hero.w",
      "hero.e",
      "hero.r",
      "hero.ex",
    ]);
  });
});

// ------------------------------------------------------------- the 體檢 ----

describe("數值體檢 — a rule about numbers, not a list of names", () => {
  it("parses the champion doc shape actually on disk", () => {
    cover("adminui-quick-approval");
    const s = parseChampionStats("h", {
      name: "英雄",
      role: "tank",
      baseStats: { maxHealth: 100, armor: 0, mr: 0, ms: 3.0 },
      growth: { maxHealth: 100 },
    });
    expect(s).toEqual({
      id: "h",
      name: "英雄",
      role: "tank",
      maxHealth: 100,
      growthHealth: 100,
      armor: 0,
      mr: 0,
      ms: 3.0,
    });
  });

  it("leaves unreadable fields UNDEFINED rather than defaulting them to 0", () => {
    cover("adminui-quick-approval");
    // a 0 default would read as "no armour" and fire a false warning; a missing
    // number must stay missing so the row can say "I could not check this".
    const s = parseChampionStats("h", { name: "x", baseStats: { maxHealth: "lots" } });
    expect(s.maxHealth).toBeUndefined();
    expect(s.armor).toBeUndefined();
  });

  it("median handles even/odd/empty", () => {
    cover("adminui-quick-approval");
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([undefined, 5])).toBe(5);
    expect(median([])).toBeUndefined();
    expect(median([undefined])).toBeUndefined();
  });

  it("passes a champion that sits near the roster median", () => {
    cover("adminui-quick-approval");
    const peers = [healthy("a"), healthy("b"), healthy("c")];
    const audit = auditStats(healthy("d"), peerBaseline(peers));
    expect(audit.ok).toBe(true);
    expect(audit.unknown).toBe(false);
    expect(audit.findings).toEqual([]);
    // the readout is printed either way — approving safely is also information
    expect(audit.line).toContain("血量 480");
  });

  it("fails a mob-tuned sheet and names EVERY axis, with the numbers", () => {
    cover("adminui-quick-approval");
    const audit = auditStats(mobLike("z"), peerBaseline([healthy("a"), healthy("b")]));
    expect(audit.ok).toBe(false);
    expect(audit.findings).toHaveLength(4); // HP, armour, MR, move speed
    const all = audit.findings.join(" ");
    expect(all).toContain("100");
    expect(all).toContain("480");
    expect(all).toContain("護甲");
    expect(all).toContain("魔抗");
    expect(all).toContain("移速");
  });

  it("FAILS CLOSED when the numbers cannot be read at all", () => {
    cover("adminui-quick-approval");
    // "I could not check" must never render as "checked and fine" — that is the
    // exact failure mode that hands the family a 100-HP hero.
    const unknownCand = auditStats({ id: "z", name: "z", role: "" }, peerBaseline([healthy("a")]));
    expect(unknownCand.ok).toBe(false);
    expect(unknownCand.unknown).toBe(true);
    const noPeers = auditStats(healthy("z"), peerBaseline([]));
    expect(noPeers.ok).toBe(false);
    expect(noPeers.unknown).toBe(true);
  });

  it("does not cry wolf over a merely below-average champion", () => {
    cover("adminui-quick-approval");
    const squishy: ChampionStats = { ...healthy("s"), maxHealth: 420, ms: 5.5 };
    expect(auditStats(squishy, peerBaseline([healthy("a"), healthy("b")])).ok).toBe(true);
  });
});

// -------------------------------------------------------------- the rows --

describe("rows carry a reason and a risk — never a bare label", () => {
  const rows = buildRows(
    input({
      declaredChampions: ["good", "bad"],
      liveChampions: ["peer1", "peer2", "extra"],
      liveAbilities: [...abilityIdsFor("peer1"), ...abilityIdsFor("peer2"), "extra.ex"],
      stats: statsMap(healthy("peer1"), healthy("peer2"), healthy("good"), mobLike("extra"), mobLike("bad")),
      pendingAccounts: [{ id: "acc1", username: "表哥", waited: "等了 3 分鐘" }],
      editorProbe: { status: 200, servesEditor: true },
    }),
  );

  it("every row states what/why/effect and a risk, in 中文", () => {
    cover("adminui-quick-approval");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      for (const field of [r.what, r.why, r.effect]) {
        expect(field.length, `${r.key}: ${field}`).toBeGreaterThan(8);
      }
      expect(r.risk, `${r.key} must state its risk`).not.toBeNull();
      expect(r.title.length).toBeGreaterThan(0);
    }
  });

  it("NOTHING is pre-ticked — the page opens with an empty plan", () => {
    cover("adminui-quick-approval");
    // a pre-selected page is a rubber stamp, which is worse than no page
    const plan = buildPlan(rows, new Set());
    expect(planIsEmpty(plan)).toBe(true);
    expect(describePlan(plan)).toBe("沒有勾選任何項目");
  });

  it("a healthy candidate is tickable with no second confirmation", () => {
    cover("adminui-quick-approval");
    const row = rows.find((r) => r.key === "champion:good");
    expect(row?.tickable).toBe(true);
    expect(row?.needsSecondConfirm).toBe(false);
    expect(row?.tone).toBe("ok");
  });

  it("a mob-tuned candidate is red, unticked and demands a second confirmation", () => {
    cover("adminui-quick-approval");
    const row = rows.find((r) => r.key === "champion:bad");
    expect(row?.tickable).toBe(true);
    expect(row?.needsSecondConfirm).toBe(true);
    expect(row?.tone).toBe("danger");
    expect(row?.risk).toContain("血量 100");
  });

  it("an ALREADY-ENABLED, never-declared champion is a WARNING, not an approval", () => {
    cover("adminui-quick-approval");
    // he is already live; no tick can "approve" him, and pretending otherwise
    // would be a lie in the UI
    const row = rows.find((r) => r.key === "undeclared:extra");
    expect(row?.tickable).toBe(false);
    expect(row?.tone).toBe("danger");
    expect(row?.effect).toContain("不參與送出");
    expect(row?.risk).toContain("移速");
  });

  it("the same champion also shows up as half-enabled, with the missing slots", () => {
    cover("adminui-quick-approval");
    const row = rows.find((r) => r.key === "abilities:extra");
    expect(row?.tickable).toBe(true);
    expect(row?.abilities).toEqual(["extra.q", "extra.w", "extra.e", "extra.r"]);
  });

  it("a pending account is a row with the wait time and a link to 帳號審核", () => {
    cover("adminui-quick-approval");
    const row = rows.find((r) => r.key === "account:acc1");
    expect(row?.title).toBe("表哥");
    expect(row?.subtitle).toBe("等了 3 分鐘");
    expect(row?.accountId).toBe("acc1");
    expect(row?.ownerPage?.page).toBe("approvals");
  });

  it("the /editor/ exposure row is READ-ONLY and reports the live probe", () => {
    cover("adminui-quick-approval");
    const reachable = editorExposureRow({ status: 200, servesEditor: true });
    expect(reachable.tickable).toBe(false);
    expect(reachable.stats).toContain("200");
    expect(reachable.effect).toContain("不參與送出");
    const absent = editorExposureRow({ status: 404, servesEditor: false });
    expect(absent.tone).toBe("dim");
    const failed = editorExposureRow({ status: null, error: "network down" });
    expect(failed.stats).toContain("network down");
  });

  /**
   * #241 REGRESSION. Once /editor/ stopped being a production route, a request
   * for it falls through to `location /` + `try_files … /index.html` and comes
   * back **200 with the game client's HTML**. The old row keyed off the status
   * code alone, so it would have kept shouting 「確實對外開著」 on precisely the
   * deploys where the exposure had been fixed. A permanent false positive is
   * worse than no row: the owner learns to skip it.
   */
  it("a 200 that is the SPA fallback, not the editor, reads as NOT exposed", () => {
    cover("adminui-editor-probe");
    const fellThrough = editorExposureRow({ status: 200, servesEditor: false });
    expect(fellThrough.tone).toBe("dim");
    expect(fellThrough.stats).toContain("不是編輯器");
    expect(fellThrough.stats).toContain("沒有提供");

    const reallyExposed = editorExposureRow({ status: 200, servesEditor: true });
    expect(reallyExposed.tone).toBe("warn");
    expect(reallyExposed.stats).toContain("編輯器本體");

    // An old caller that only sent HEAD cannot know. It must say so rather than
    // silently picking a side — and it stays a warning, because "unknown" on a
    // security row is not "fine".
    const cannotTell = editorExposureRow({ status: 200 });
    expect(cannotTell.tone).toBe("warn");
    expect(cannotTell.stats).toContain("無法分辨");
  });

  it("every champion row deep-links to the page that OWNS the whitelist", () => {
    cover("adminui-quick-approval");
    for (const r of rows.filter((x) => x.kind === "champion-open")) {
      expect(r.ownerPage?.page).toBe("curation");
    }
  });
});

// -------------------------------------------------------------- the plan --

describe("the submit plan — union only, and honest about what it skipped", () => {
  const rows = buildRows(
    input({
      declaredChampions: ["good"],
      liveChampions: ["peer1", "peer2", "extra"],
      liveAbilities: [...abilityIdsFor("peer1"), ...abilityIdsFor("peer2"), "extra.ex"],
      stats: statsMap(healthy("peer1"), healthy("peer2"), healthy("good"), mobLike("extra")),
      pendingAccounts: [{ id: "acc1", username: "表哥", waited: "剛剛註冊" }],
    }),
  );

  it("a ticked champion unions the champion AND all five ability ids", () => {
    cover("adminui-quick-approval");
    // half-enabling is the bug the starter set's own R3 gate exists to prevent:
    // a champion with no `.ex` is pickable with a dead ultimate hotkey.
    const plan = buildPlan(rows, new Set(["champion:good"]));
    expect(plan.champions).toEqual(["good"]);
    expect(plan.abilities).toEqual([...abilityIdsFor("good")].sort());
  });

  it("NEVER emits a disable — the operator's extra entries must survive", () => {
    cover("adminui-quick-approval");
    const plan = buildPlan(rows, new Set(["champion:good", "abilities:extra", "account:acc1"]));
    const reqs = planBulkRequests(plan);
    expect(reqs.map((r) => r.kind).sort()).toEqual(["abilities", "champions"]);
    for (const r of reqs) {
      expect(r.disable, `${r.kind} must never disable anything`).toEqual([]);
      expect(r.enable.length).toBeGreaterThan(0);
    }
  });

  it("the untickable rows are reported as skipped, WITH the reason", () => {
    cover("adminui-quick-approval");
    const plan = buildPlan(rows, new Set(["champion:good"]));
    const keys = plan.skipped.map((s) => s.key);
    expect(keys).toContain("undeclared:extra");
    expect(keys).toContain("exposure:editor");
    expect(keys).toContain("account:acc1"); // simply not ticked
    for (const s of plan.skipped) expect(s.why.length).toBeGreaterThan(4);
    expect(plan.skipped.find((s) => s.key === "account:acc1")?.why).toContain("沒有打勾");
  });

  it("an untickable row can never contribute an id to a write", () => {
    cover("adminui-quick-approval");
    // even if its key is somehow in the tick set (a stale set after a reload)
    const plan = buildPlan(rows, new Set(["undeclared:extra", "exposure:editor"]));
    expect(planIsEmpty(plan)).toBe(true);
    expect(planBulkRequests(plan)).toEqual([]);
  });

  it("approving accounts is a separate list, not a whitelist write", () => {
    cover("adminui-quick-approval");
    const plan = buildPlan(rows, new Set(["account:acc1"]));
    expect(plan.accounts).toEqual(["acc1"]);
    expect(planBulkRequests(plan)).toEqual([]);
    expect(describePlan(plan)).toContain("通過帳號 1");
  });

  it("the second confirmation NAMES the consequence rather than asking 「確定嗎」", () => {
    cover("adminui-quick-approval");
    const risky = buildRows(
      input({
        declaredChampions: ["bad"],
        liveChampions: ["peer1", "peer2"],
        stats: statsMap(healthy("peer1"), healthy("peer2"), mobLike("bad", "喪標型")),
      }),
    );
    const needing = rowsNeedingSecondConfirm(risky, new Set(["champion:bad"]));
    expect(needing).toHaveLength(1);
    const text = secondConfirmText(needing);
    expect(text).toContain("喪標型");
    expect(text).toContain("血量 100");
    expect(text).not.toBe("確定嗎？");
    // and an unticked risky row raises no dialog at all
    expect(rowsNeedingSecondConfirm(risky, new Set())).toEqual([]);
  });

  it("停用 is its own request, reachable only outside the batch", () => {
    cover("adminui-quick-approval");
    const req = disableChampionRequest("extra");
    expect(req).toEqual({ kind: "champions", enable: [], disable: ["extra"] });
    // …and nothing the batch produces can ever look like it
    const plan = buildPlan(rows, new Set(rows.map((r) => r.key)));
    for (const r of planBulkRequests(plan)) expect(r.disable).toEqual([]);
  });

  it("summarizeResult reports per-step outcome plus the untouched rows", () => {
    cover("adminui-quick-approval");
    const plan = buildPlan(rows, new Set(["champion:good"]));
    const ok = summarizeResult([{ label: "開放英雄", ok: true, detail: "ok" }], plan);
    expect(ok.allOk).toBe(true);
    expect(ok.skipped.length).toBe(plan.skipped.length);
    const bad = summarizeResult(
      [
        { label: "開放英雄", ok: true, detail: "ok" },
        { label: "通過帳號", ok: false, detail: "boom" },
      ],
      plan,
    );
    expect(bad.allOk).toBe(false);
  });
});

// ------------------------------------------------------- the write seams --

describe("it forks no second way to write the whitelist", () => {
  it("imports neither the draft-diff machinery nor the PUT replace", () => {
    cover("adminui-quick-approval");
    // saveWhitelist/diffDoc compute a `disable` array from a local draft. That
    // is correct for a full editor and catastrophic here: the live document
    // holds entries this page never loads, and one click would delete them.
    const src = new URL("./quickApproval.ts", import.meta.url);
    const page = new URL("./ui/QuickApprovalPage.tsx", import.meta.url);
    for (const url of [src, page]) {
      const text = readFileSync(url, "utf8");
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(code, `${url.pathname} must not import saveWhitelist`).not.toMatch(/\bsaveWhitelist\b/);
      expect(code, `${url.pathname} must not import diffDoc`).not.toMatch(/\bdiffDoc\b/);
      expect(code, `${url.pathname} must not import putWhitelist`).not.toMatch(/\bputWhitelist\b/);
    }
  });
});

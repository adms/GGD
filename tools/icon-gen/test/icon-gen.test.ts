/**
 * icon-gen gate suite (task #72, docs/todo/icons.md "generation half").
 *
 * Shells the real planner and the real runner against the real content tree.
 * There is no fixture here on purpose: the properties being pinned are about
 * THIS repository's actual live surfaces, and a synthetic tree would prove
 * nothing about whether the shop is about to lose a picture.
 *
 * The two things worth failing a build over:
 *
 *   1. NO DROPPED ENTRY IS REACHABLE. The drop list is the justification for
 *      spending less money; if it ever swallows something a player can be
 *      offered, the codex shows a live row with no art and the batch will
 *      never fix it because it was told not to.
 *   2. NOTHING SPENDS BY ACCIDENT. The dry run must call nothing, and a live
 *      run must refuse every way it can before it reaches a provider.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
// Relative, not `@ggd/shared/testkit/cover`: this tool has no package.json of
// its own, so a bare workspace specifier has no node_modules to resolve
// through when vitest runs from the repo root. Adding a package would churn
// the lockfile for one import.
import { cover } from "../../../packages/shared/testkit/cover";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const REPO = join(ROOT, "..", "..");
const PLAN = join(ROOT, "src", "plan.py");
const GEN = join(ROOT, "src", "generate.py");

/** A python3 that can import the planner's deps (Pillow is optional here). */
function findPython(): string[] | null {
  for (const c of [["python3"], ["arch", "-arm64", "python3"], ["/usr/bin/python3"]]) {
    try {
      execFileSync(c[0]!, [...c.slice(1), "-c", "import json,glob,hashlib"], { stdio: "pipe" });
      return c;
    } catch {
      /* next */
    }
  }
  return null;
}
const PYCMD = findPython();
const pyOk = PYCMD !== null;

/** Run a tool; returns {out, code}. Never throws on a non-zero exit. */
function run(script: string, args: string[]): { out: string; code: number } {
  try {
    const out = execFileSync(PYCMD![0]!, [...PYCMD!.slice(1), script, ...args], {
      cwd: REPO,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, GGD_PLATFORM_TOKEN: "" },
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return { out: `${err.stdout ?? ""}${err.stderr ?? ""}`, code: err.status ?? 1 };
  }
}

interface Plan {
  contentDigest: string;
  counts: { total: Record<string, number> };
  dropped: Record<string, { ids: string[] }>;
  blocked: Record<string, { ids: string[] }>;
  generate: { tier1: { id: string }[]; tier2: { id: string }[] };
  vetoed: string[];
  missingSurfaceFiles: string[];
}

function loadPlan(): Plan {
  const path = join(REPO, "content", "config", "icon-plan.json");
  if (!existsSync(path)) {
    run(PLAN, ["--write"]);
  }
  return JSON.parse(readFileSync(path, "utf8")) as Plan;
}

describe.runIf(pyOk)("icon-gen planner", () => {
  it("never drops anything a live surface can offer", () => {
    cover("icon-gen-drop-safety");
    const plan = loadPlan();

    // Re-derive the live-surface id set INDEPENDENTLY of the planner: read the
    // same files and pull every id-shaped token out of them here. If the
    // planner's own scrape silently narrowed (a renamed file, a changed path),
    // this test still sees the truth.
    const surfaces = [
      "apps/platform/internal/curation/starter.go",
      "content/loot-tables/legendary-weapons.json",
      // ⭐ owner 2026-08-18 的三階寶具池 —— `ex-*` 是同一天新增的兩張。
      "content/loot-tables/ex-release-weapons.json",
      "content/loot-tables/ex-origin-weapons.json",
      // ⛔⛔ `quest-rewards` / `round-reward` 在 2026-08-18 **整張搬進 `_legacy/`**。
      //   ⭐ 這裡改指 `_legacy/` 的那一份,⛔ 不是把它們從清單裡刪掉 ——
      //   因為這條測試問的是「**否決集合有沒有變窄**」:一張退休的池子裡的 id
      //   如果今天仍然被別的地方引用,把它從否決集合拿掉就會讓 icon-gen 丟掉它的圖。
      //   ⇒ ⭐ 保守的做法是**繼續保護它們**,直到有人量到「零個引用」。
      //   ⚠️ 而這份清單**刻意**與 `plan.py` 的 `LIVE_SURFACE_FILES` 分開維護
      //   (見上面那段註解:它要獨立於 planner 自己的抓取)——
      //   ⛔ 所以不要改成從 `plan.py` 推導,那會讓交叉驗證變成自己驗自己。
      "content/_legacy/loot-tables/quest-rewards.json",
      "content/_legacy/loot-tables/round-reward.json",
      "content/config/store.json",
      "packages/shared/src/sim/content/skeleton.ts",
    ];
    const live = new Set<string>();
    for (const rel of surfaces) {
      const path = join(REPO, rel);
      expect(existsSync(path), `live surface ${rel} moved — the veto is now too narrow`).toBe(true);
      for (const m of readFileSync(path, "utf8").matchAll(/"([a-z0-9][a-z0-9-]{2,}(?:\.[a-z]{1,2})?)"/g)) {
        live.add(m[1]!);
      }
    }
    expect(live.size).toBeGreaterThan(50); // the scrape actually found something

    const dropped = Object.values(plan.dropped).flatMap((b) => b.ids);
    const blocked = Object.values(plan.blocked).flatMap((b) => b.ids);
    expect(dropped.length).toBeGreaterThan(0);
    expect(dropped.filter((id) => live.has(id))).toEqual([]);
    // A blocked entry is still NEEDED, so one on a live surface is a real
    // problem too — it means a champion is playable with no portrait and no
    // route to one until someone rules on the IP question.
    expect(blocked.filter((id) => live.has(id))).toEqual([]);
  });

  it("never queues art for a doc that already has the map author's own", () => {
    cover("icon-gen-drop-safety");
    const plan = loadPlan();
    const mapPath = join(REPO, "tools/w3x-import/out/GoDieEX22s/ICON_MAP.json");
    if (!existsSync(mapPath)) return; // importer output is not always present
    const iconMap = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, { resolution: string }>;
    const extracted = new Set(
      Object.entries(iconMap).filter(([, r]) => r.resolution === "archive").map(([id]) => id),
    );
    expect(extracted.size).toBeGreaterThan(100);
    const queued = [...plan.generate.tier1, ...plan.generate.tier2].map((e) => e.id);
    expect(queued.filter((id) => extracted.has(id))).toEqual([]);
  });

  it("is deterministic — replanning unchanged content changes nothing", () => {
    cover("icon-gen-deterministic");
    const a = run(PLAN, []);
    const b = run(PLAN, []);
    expect(a.code).toBe(0);
    expect(a.out).toBe(b.out);
    // and every surface file it wants was found, so the veto is at full width
    expect(loadPlan().missingSurfaceFiles).toEqual([]);
  });
});

describe.runIf(pyOk)("icon-gen runner money gates", () => {
  it("dry run calls nothing, bills nothing, and says so", () => {
    cover("icon-gen-dry-run");
    const { out, code } = run(GEN, ["--dry-run", "--tier", "1"]);
    expect(code).toBe(0);
    expect(out).toMatch(/DRY RUN — nothing was called, nothing was billed/);
    // it must still produce a real, actionable number
    expect(out).toMatch(/TO GENERATE\s+\d+/);
    expect(out).toMatch(/COST\s+\$\d+\.\d\d/);
  });

  it("refuses a live run until the pricing quote has been confirmed", () => {
    cover("icon-gen-dry-run");
    const { out, code } = run(GEN, ["--tier", "1"]);
    expect(code).not.toBe(0);
    expect(out).toMatch(/--i-have-confirmed-pricing/);
  });

  it("refuses a live run that would exceed the spend ceiling", () => {
    cover("icon-gen-dry-run");
    // The ceiling is proven against the LIVE estimate, not a hard-coded batch
    // size. Once coverage is complete the generate queue is empty and the
    // estimate is $0.00, so a fixed tiny ceiling like 0.01 can never be
    // exceeded and the gate looks broken when it is merely idle. Read the real
    // estimate from a dry run and set the ceiling just below it, so the same
    // assertion exercises the guard whether the queue costs $1.83 or $0.00.
    const dry = run(GEN, ["--dry-run", "--tier", "1"]);
    const cost = Number(dry.out.match(/COST\s+\$(\d+\.\d\d)/)?.[1] ?? "0");
    const ceiling = (cost - 0.01).toFixed(2); // strictly below the estimate
    const { out, code } = run(GEN, [
      "--tier", "1", "--i-have-confirmed-pricing", "--max-spend", ceiling,
    ]);
    expect(code).not.toBe(0);
    expect(out).toMatch(/exceeds --max-spend/);
  });

  it("refuses to price a model it has no rate for, rather than guessing", () => {
    cover("icon-gen-dry-run");
    const { out, code } = run(GEN, [
      "--tier", "1", "--model", "no-such-model", "--i-have-confirmed-pricing",
    ]);
    expect(code).not.toBe(0);
    expect(out).toMatch(/no known rate/);
  });

  it("needs a PLATFORM token, and has nowhere to put a provider key", () => {
    cover("icon-gen-no-key");
    const { out, code } = run(GEN, [
      "--tier", "1", "--i-have-confirmed-pricing", "--max-spend", "99",
    ]);
    expect(code).not.toBe(0);
    expect(out).toMatch(/GGD_PLATFORM_TOKEN/);
    // The tool must never grow a way to accept a provider key directly: the
    // key lives server-side and the operator sets it in the admin console.
    const src = readFileSync(GEN, "utf8") + readFileSync(join(ROOT, "src", "plan.py"), "utf8");
    expect(src).not.toMatch(/OPENAI_API_KEY|ANTHROPIC_API_KEY|--api-key|apiKey\s*=/);
  });
});

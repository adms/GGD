import { describe, it, expect } from "vitest";
import { parseTodoMarkdown } from "./parse";
import { checkStatic, checkRuntime, parseCoverage } from "./check";

const GOOD = `# Auth — TODO

| ID | Item | Test ID | Category | Status |
| --- | --- | --- | --- | --- |
| auth-01 | Register unique | auth-register-unique | unit | done |
| auth-02 | Reject dup username | auth-register-dup | unit | pending |
`;

describe("parseTodoMarkdown", () => {
  it("parses a well-formed table", () => {
    const { items, errors } = parseTodoMarkdown("auth.md", GOOD);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "auth-01",
      testId: "auth-register-unique",
      category: "unit",
      status: "done",
    });
  });
});

describe("checkStatic", () => {
  it("passes a valid set", () => {
    const { items, errors } = parseTodoMarkdown("auth.md", GOOD);
    const rep = checkStatic(items, errors);
    expect(rep.ok).toBe(true);
    expect(rep.counts.total).toBe(2);
  });

  it("flags duplicate test ids", () => {
    const dup = GOOD.replace("auth-register-dup", "auth-register-unique");
    const { items, errors } = parseTodoMarkdown("auth.md", dup);
    const rep = checkStatic(items, errors);
    expect(rep.ok).toBe(false);
    expect(rep.errors.join()).toMatch(/duplicate Test ID/);
  });

  it("flags a missing test id", () => {
    const bad = GOOD.replace("auth-register-unique", "");
    const { items, errors } = parseTodoMarkdown("auth.md", bad);
    const rep = checkStatic(items, errors);
    expect(rep.ok).toBe(false);
    expect(rep.errors.join()).toMatch(/missing Test ID/);
  });

  it("flags an invalid category", () => {
    const bad = GOOD.replace("| unit | done", "| banana | done");
    const { items, errors } = parseTodoMarkdown("auth.md", bad);
    const rep = checkStatic(items, errors);
    expect(rep.ok).toBe(false);
    expect(rep.errors.join()).toMatch(/invalid category/);
  });
});

describe("checkRuntime", () => {
  it("requires done items to be covered; ignores pending", () => {
    const { items } = parseTodoMarkdown("auth.md", GOOD);
    // Nothing covered yet -> the "done" item auth-01 fails.
    const empty = checkRuntime(items, new Set());
    expect(empty.ok).toBe(false);
    expect(empty.uncoveredDone.map((i) => i.id)).toEqual(["auth-01"]);

    // Cover the done item -> passes. pending item is exempt.
    const covered = checkRuntime(items, new Set(["auth-register-unique"]));
    expect(covered.ok).toBe(true);
  });

  it("reports orphan beacons that match no item", () => {
    const { items } = parseTodoMarkdown("auth.md", GOOD);
    const rep = checkRuntime(items, new Set(["auth-register-unique", "ghost-test"]));
    expect(rep.orphanBeacons).toContain("ghost-test");
  });
});

describe("parseCoverage", () => {
  it("reads NDJSON cover beacons and ignores junk", () => {
    const nd = `{"cover":"a"}\n\n{"cover":"b"}\nnot-json\n{"nope":1}\n`;
    const set = parseCoverage(nd);
    expect([...set].sort()).toEqual(["a", "b"]);
  });
});

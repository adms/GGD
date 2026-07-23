/**
 * 系統運維 pure logic (ops-adm-01..ops-adm-08).
 *
 * The page renders entirely from server-supplied descriptors, so what is worth
 * testing here is the parsing, the three-state (編輯中 / 已儲存 / 生效中)
 * display that a mixed-safety page needs, and the pre-flight mirror of the
 * platform's rules — including the coupled snapshot/interpolation rule, which
 * the platform REJECTS rather than warns about.
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../packages/shared/testkit/cover";
import {
  APPLY_NOTE,
  DRAINING_NOTE,
  SAFETY_LABEL,
  changedKeys,
  coupledSnapshotWarning,
  effectFor,
  emptyOpsPayload,
  formFromPayload,
  formValid,
  interpFloorLine,
  isDirty,
  isLocked,
  lockedNote,
  nonDefaultKeys,
  normalizeOpsPayload,
  resetAll,
  resetField,
  setField,
  toSavePayload,
  validateField,
  validateForm,
  type OpsDescriptor,
  type OpsPayload,
} from "./serverOps";

const maxRooms: OpsDescriptor = {
  key: "maxRooms",
  default: 50,
  min: 1,
  max: 500,
  integer: true,
  unit: "場",
  safety: "live",
  zhLabel: "同時對戰上限",
  zhNote: "同時進行的對戰數",
  zhApplies: "立即生效（不影響進行中對戰）",
  env: "GGD_MAX_ROOMS",
  where: "roomRegistry.ts",
};

const snapshotHz: OpsDescriptor = {
  key: "snapshotHz",
  default: 30,
  min: 15,
  max: 30,
  integer: false,
  unit: "Hz",
  safety: "nextMatch",
  zhLabel: "快照頻率",
  zhNote: "每秒送出幾次狀態封包",
  zhApplies: "下一場對戰生效",
  env: "GGD_SNAPSHOT_HZ",
  where: "snapshotRate.ts",
};

function payload(values: Record<string, number>, stored = true): OpsPayload {
  return {
    doc: { version: 1, updatedAt: "2026-07-23T00:00:00Z", values },
    stored,
    defaults: { maxRooms: 50, snapshotHz: 30 },
    descriptors: [maxRooms, snapshotHz],
    info: [],
    clientInterpDelayMs: 66,
  };
}

describe("server-ops console: parsing", () => {
  it("ops-adm-01: the wire payload survives junk, and an unconfigured platform stays distinguishable", () => {
    cover("ops-adm-01");
    const p = normalizeOpsPayload({
      doc: { version: 1, updatedAt: "t", values: { maxRooms: 24, junk: "x" } },
      stored: true,
      defaults: { maxRooms: 50 },
      descriptors: [{ key: "maxRooms", default: 50, min: 1, max: 500, integer: true }],
      info: [{ key: "tickHz", value: "30 Hz", safety: "never" }],
      clientInterpDelayMs: 66,
    });
    expect(p.doc.values).toEqual({ maxRooms: 24 });
    expect(p.stored).toBe(true);
    expect(p.descriptors[0]?.zhLabel).toBe("maxRooms"); // falls back to the key
    expect(p.info[0]?.safety).toBe("never");
    expect(p.clientInterpDelayMs).toBe(66);

    // "never configured" must survive the trip: the page says 尚未設定 rather
    // than implying somebody chose the defaults.
    expect(normalizeOpsPayload({ doc: {}, stored: false }).stored).toBe(false);

    // Total garbage degrades to an empty page, not a crash.
    expect(normalizeOpsPayload(null)).toEqual(emptyOpsPayload());
    expect(normalizeOpsPayload("nope")).toEqual(emptyOpsPayload());
    expect(normalizeOpsPayload({ descriptors: "no", info: 3 }).descriptors).toEqual([]);
  });
});

describe("server-ops console: validation mirrors the server", () => {
  it("ops-adm-02: bounds come from the descriptor, not from a second copy in this file", () => {
    cover("ops-adm-02");
    expect(validateField(maxRooms, "50")).toBe("");
    expect(validateField(maxRooms, "1")).toBe("");
    expect(validateField(maxRooms, "500")).toBe("");
    expect(validateField(maxRooms, "0")).toContain("1");
    expect(validateField(maxRooms, "501")).toContain("500");
    expect(validateField(maxRooms, "12.5")).toBe("必須是整數");
    expect(validateField(maxRooms, "")).toBe("請輸入數值");
    expect(validateField(maxRooms, "abc")).toBe("必須是數字");
    // A non-integer IS allowed where the descriptor says so.
    expect(validateField(snapshotHz, "29.5")).toBe("");

    const p = payload({ maxRooms: 50, snapshotHz: 30 });
    expect(formValid(p, { maxRooms: "50", snapshotHz: "30" })).toBe(true);
    expect(validateForm(p, { maxRooms: "0", snapshotHz: "30" })).toHaveProperty("maxRooms");
  });

  it("ops-adm-03: the snapshot/interpolation coupling is surfaced before the round-trip", () => {
    cover("ops-adm-03");
    const p = payload({ maxRooms: 50, snapshotHz: 30 });

    // 30 Hz needs exactly 66 ms and the fleet has 66 — fine.
    expect(coupledSnapshotWarning(p, { maxRooms: "50", snapshotHz: "30" })).toBe("");
    expect(interpFloorLine({ snapshotHz: "30" })).toContain("66 ms");

    // 20 Hz needs 100 ms and the fleet has 66 — the platform will reject it, and
    // the page must say WHY rather than letting the save look arbitrary.
    const warn = coupledSnapshotWarning(p, { maxRooms: "50", snapshotHz: "20" });
    expect(warn).toContain("100");
    expect(warn).toContain("66");
    expect(warn).toContain("拒絕");
    expect(interpFloorLine({ snapshotHz: "20" })).toContain("100 ms");
  });
});

describe("server-ops console: saved vs in effect", () => {
  it("ops-adm-04: a live knob and a next-match knob describe their effect differently", () => {
    cover("ops-adm-04");
    const p = payload({ maxRooms: 24, snapshotHz: 30 });
    const clean = formFromPayload(p);
    expect(clean).toEqual({ maxRooms: "24", snapshotHz: "30" });

    // Saved and in effect agree while the form is clean…
    const live = effectFor(p, clean, maxRooms);
    expect(live.saved).toBe("24");
    expect(live.effect).toContain("目前生效：24");
    expect(live.savedIsDefault).toBe(false);

    const next = effectFor(p, clean, snapshotHz);
    expect(next.effect).toContain("下一場對戰使用：30");
    expect(next.effect).toContain("進行中的對戰維持各自開始時的設定");

    // …and diverge the moment the operator types. THIS is the distinction the
    // page exists to make: an unsaved number has no effect anywhere.
    const edited = setField(clean, "maxRooms", "8");
    const dirtyLive = effectFor(p, edited, maxRooms);
    // saved is still what the platform stores, not what is in the box
    expect(dirtyLive.saved).toBe("24");
    expect(dirtyLive.effect).toContain("目前生效：24");
    expect(dirtyLive.effect).toContain("尚未儲存");
    expect(isDirty(p, edited)).toBe(true);
    expect(changedKeys(p, edited)).toEqual(["maxRooms"]);
  });

  it("ops-adm-05: an unconfigured platform labels every value as the built-in default", () => {
    cover("ops-adm-05");
    const p = payload({ maxRooms: 50, snapshotHz: 30 }, false);
    expect(effectFor(p, formFromPayload(p), maxRooms).savedIsDefault).toBe(true);
    expect(nonDefaultKeys(p, formFromPayload(p))).toEqual([]);
  });

  it("ops-adm-07: with NOTHING saved the page must not claim to know what is running", () => {
    cover("ops-adm-07");
    // The trap. `stored: false` means the platform serves an EMPTY table, so
    // the game-server keeps its own compiled/env value — which may be
    // GGD_MAX_ROOMS=200 on that shard, not the 50 this console would show. The
    // 生效中 line used to print 「目前生效：50場（遊戲伺服器最多 5 秒內套用）」
    // regardless: a confident, checkable, wrong statement about a value the
    // console cannot see. It now says it does not know, and names where the
    // real value comes from.
    const p = payload({ maxRooms: 50, snapshotHz: 30 }, false);
    const eff = effectFor(p, formFromPayload(p), maxRooms);
    expect(eff.effect).toContain("尚未設定");
    expect(eff.effect).toContain("GGD_MAX_ROOMS");
    expect(eff.effect).not.toContain("目前生效");

    // Once an operator saves, the console does know, and says so plainly.
    const saved = payload({ maxRooms: 50, snapshotHz: 30 }, true);
    expect(effectFor(saved, formFromPayload(saved), maxRooms).effect).toContain("目前生效：50");
  });

  it("ops-adm-08: a knob whose advertised range admits one value renders as locked", () => {
    cover("ops-adm-08");
    // Not hypothetical: snapshotHz's floor is derived from the interpolation
    // delay the shipped clients compile with, and at 66 ms the only rate the
    // fleet can absorb is 30 Hz — so the platform advertises min == max == 30.
    // An editable box that rejects every value except the one already in it is
    // worse than a sentence saying why.
    const locked: OpsDescriptor = { ...snapshotHz, min: 30, max: 30 };
    expect(isLocked(locked)).toBe(true);
    expect(lockedNote(locked)).toContain("30");
    expect(isLocked(maxRooms)).toBe(false);
  });
});

describe("server-ops console: save payload + copy", () => {
  it("ops-adm-06: the body is always the COMPLETE table, and the apply note is exact", () => {
    cover("ops-adm-06");
    const p = payload({ maxRooms: 24, snapshotHz: 30 });

    // PUT-replace: every key ships, so what the operator sees is what is stored.
    expect(toSavePayload(p, { maxRooms: "12", snapshotHz: "30" })).toEqual({
      values: { maxRooms: 12, snapshotHz: 30 },
    });
    // A garbage box falls back to the compiled default rather than to 0 — the
    // page gates Save on formValid, so this is only the safety net.
    expect(toSavePayload(p, { maxRooms: "", snapshotHz: "" })).toEqual({
      values: { maxRooms: 50, snapshotHz: 30 },
    });

    expect(resetField(formFromPayload(p), maxRooms).maxRooms).toBe("50");
    expect(resetAll(p)).toEqual({ maxRooms: "50", snapshotHz: "30" });

    // The one thing an operator MUST read before saving, and the one sentence
    // that stops a lowered cap from looking like an outage.
    expect(APPLY_NOTE).toContain("立即生效");
    expect(APPLY_NOTE).toContain("下一場對戰生效");
    expect(APPLY_NOTE).toContain("不影響進行中對戰");
    expect(DRAINING_NOTE).toContain("不會結束任何進行中的對戰");
    expect(SAFETY_LABEL.live).toBe("立即生效");
    expect(SAFETY_LABEL.nextMatch).toBe("下一場生效");
    expect(SAFETY_LABEL.restart).toBe("需重啟");
  });
});

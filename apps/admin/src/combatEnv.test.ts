/**
 * adminui-combatenv      — the 戰鬥系統 page's data logic: tolerant parse of the
 *                          platform doc, exhaustive zh-Hant labels/groups over
 *                          the SIM's key list, form seeding, per-row + global
 *                          reset, ±step, dirty/non-neutral summaries.
 * adminui-combatenv-save — validation (bounds mirror the platform's 400) and the
 *                          PUT-replace payload, proven over a mocked API
 *                          round-trip; plus the operator-facing note that a save
 *                          applies to the NEXT match only.
 */
import { describe, it, expect, vi } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import {
  APPLY_NOTE,
  COMBAT_ENV_GROUPS,
  COMBAT_ENV_KEYS,
  COMBAT_ENV_LABELS,
  MAX_FACTOR,
  MIN_FACTOR,
  NEUTRAL,
  STEP,
  changedKeys,
  defaultForKey,
  emptyCombatEnvDoc,
  isAttributeEnvKey,
  formFromDoc,
  formValid,
  formatFactor,
  groupsCoverAllKeys,
  isDirty,
  loadErrorText,
  neutralForm,
  nonNeutralDocKeys,
  nonNeutralKeys,
  normalizeCombatEnvDoc,
  parseFactor,
  resetAll,
  resetField,
  saveErrorText,
  setField,
  stepField,
  toSavePayload,
  validateFactor,
  validateForm,
} from "./combatEnv";
import { ApiClient, type TokenStorage } from "./session";
import type { TokenPair } from "./types";

const SAVED = {
  version: 1,
  updatedAt: "2026-07-22T12:00:00Z",
  multipliers: {
    cooldown: 0.8,
    damageDealt: 1.2,
    defense: 1,
    attackDamage: 1,
    abilityPower: 1,
    maxHealth: 1.5,
    healthRegen: 1,
    maxMana: 1,
    manaRegen: 1,
    moveSpeed: 1,
    attackSpeed: 1,
    healing: 1,
    shield: 1,
    critChance: 1,
    critDamage: 1,
    lifesteal: 1,
    attackRange: 1,
  },
};

describe("combat-env doc parse + labels (adminui-combatenv)", () => {
  it("tolerant parse: bare doc, envelope, garbage, and partial → neutral backfill", () => {
    cover("adminui-combatenv");
    expect(normalizeCombatEnvDoc(SAVED).multipliers.cooldown).toBe(0.8);
    expect(normalizeCombatEnvDoc({ combatEnv: SAVED }).multipliers.damageDealt).toBe(1.2);
    expect(normalizeCombatEnvDoc({ doc: SAVED }).multipliers.maxHealth).toBe(1.5);
    expect(normalizeCombatEnvDoc(null)).toEqual(emptyCombatEnvDoc());
    expect(normalizeCombatEnvDoc("nope")).toEqual(emptyCombatEnvDoc());
    expect(normalizeCombatEnvDoc([])).toEqual(emptyCombatEnvDoc());

    // a partial table backfills the missing keys with the neutral 1.0…
    const partial = normalizeCombatEnvDoc({ multipliers: { cooldown: 2 } });
    expect(partial.multipliers.cooldown).toBe(2);
    expect(partial.multipliers.healing).toBe(NEUTRAL);
    expect(Object.keys(partial.multipliers)).toHaveLength(COMBAT_ENV_KEYS.length);

    // …and junk values (string / NaN / unknown key) never leak into the table.
    const junk = normalizeCombatEnvDoc({
      multipliers: { cooldown: "fast", damageDealt: Number.NaN, bogus: 3, healing: 1.4 },
    });
    expect(junk.multipliers.cooldown).toBe(NEUTRAL);
    expect(junk.multipliers.damageDealt).toBe(NEUTRAL);
    expect(junk.multipliers.healing).toBe(1.4);
    expect("bogus" in junk.multipliers).toBe(false);
  });

  it("every sim key is labelled in zh-Hant and shown in exactly one group", () => {
    cover("adminui-combatenv");
    // the page's key list IS the sim's — no drift possible.
    // 18 ×factors + the 8 三圍 coefficients #248 added to the same table.
    expect(COMBAT_ENV_KEYS).toHaveLength(26);
    for (const k of COMBAT_ENV_KEYS) {
      expect(COMBAT_ENV_LABELS[k].zh, `label for ${k}`).toBeTruthy();
      expect(COMBAT_ENV_LABELS[k].note, `note for ${k}`).toBeTruthy();
      // zh-Hant, not an English fallback
      expect(COMBAT_ENV_LABELS[k].zh).toMatch(/[一-鿿]/);
    }
    expect(groupsCoverAllKeys()).toBe(true);
    const flat = COMBAT_ENV_GROUPS.flatMap((g) => g.keys);
    expect(new Set(flat).size).toBe(flat.length); // no key rendered twice
  });

  it("form seeds from the doc and formats factors without trailing zeros", () => {
    cover("adminui-combatenv");
    expect(formatFactor(1)).toBe("1");
    expect(formatFactor(1.05)).toBe("1.05");
    expect(formatFactor(0.8)).toBe("0.8");
    expect(formatFactor(Number.NaN)).toBe("1");

    const form = formFromDoc(normalizeCombatEnvDoc(SAVED));
    expect(form.cooldown).toBe("0.8");
    expect(form.damageDealt).toBe("1.2");
    expect(form.healing).toBe("1");
    expect(Object.keys(form)).toHaveLength(COMBAT_ENV_KEYS.length);
  });
});

describe("combat-env form editing (adminui-combatenv)", () => {
  const doc = normalizeCombatEnvDoc(SAVED);

  it("per-row reset returns just that key to its default; 全部重設 does the table", () => {
    cover("adminui-combatenv");
    const form = formFromDoc(doc);
    const oneReset = resetField(form, "cooldown");
    expect(oneReset.cooldown).toBe("1");
    expect(oneReset.damageDealt).toBe("1.2"); // other rows untouched
    expect(form.cooldown).toBe("0.8"); // pure: the input form is not mutated

    const all = resetAll();
    expect(all).toEqual(neutralForm());
    // #248: "reset" is the SHIPPED value, not a blanket 1.0 — resetting
    // 力量→生命 to 1 would not be neutral, it would delete 96% of every
    // champion's health. Only the eighteen ×factors go back to 1.
    for (const k of COMBAT_ENV_KEYS) {
      expect(all[k], k).toBe(isAttributeEnvKey(k) ? String(defaultForKey(k)) : "1");
    }
    expect(resetField(form, "strToMaxHealth").strToMaxHealth).toBe("25");
    expect(resetField(form, "intToMaxMana").intToMaxMana).toBe("15");
  });

  it("± step nudges by 0.05 and clamps to the legal range", () => {
    cover("adminui-combatenv");
    const form = neutralForm();
    expect(stepField(form, "cooldown", STEP).cooldown).toBe("1.05");
    expect(stepField(form, "cooldown", -STEP).cooldown).toBe("0.95");
    // clamps at both ends rather than producing a value the platform would 400
    expect(stepField(setField(form, "cooldown", "0.1"), "cooldown", -STEP).cooldown).toBe(String(MIN_FACTOR));
    expect(stepField(setField(form, "cooldown", "10"), "cooldown", STEP).cooldown).toBe(String(MAX_FACTOR));
    // stepping from a garbage box starts at the neutral value
    expect(stepField(setField(form, "cooldown", "abc"), "cooldown", STEP).cooldown).toBe("1.05");
  });

  it("dirty + non-neutral summaries drive the badges", () => {
    cover("adminui-combatenv");
    const clean = formFromDoc(doc);
    expect(changedKeys(clean, doc)).toEqual([]);
    expect(isDirty(clean, doc)).toBe(false);
    // three keys differ from 1.0 in SAVED
    expect(nonNeutralKeys(clean).sort()).toEqual(["cooldown", "damageDealt", "maxHealth"]);
    expect(nonNeutralDocKeys(doc).sort()).toEqual(["cooldown", "damageDealt", "maxHealth"]);

    const edited = setField(clean, "healing", "1.3");
    expect(changedKeys(edited, doc)).toEqual(["healing"]);
    expect(isDirty(edited, doc)).toBe(true);

    // resetting an already-tuned row is itself an unsaved change
    expect(changedKeys(resetField(clean, "cooldown"), doc)).toEqual(["cooldown"]);
    // an emptied box counts as dirty (and as an error, below)
    expect(changedKeys(setField(clean, "shield", ""), doc)).toEqual(["shield"]);
    // a neutral doc + neutral form → nothing tuned, nothing dirty
    const fresh = emptyCombatEnvDoc();
    expect(nonNeutralKeys(formFromDoc(fresh))).toEqual([]);
    expect(isDirty(formFromDoc(fresh), fresh)).toBe(false);
  });
});

describe("combat-env validation + save payload (adminui-combatenv-save)", () => {
  it("field validation mirrors the platform's [0.1, 10] bounds", () => {
    cover("adminui-combatenv-save");
    expect(validateFactor("1")).toBe("");
    expect(validateFactor("0.1")).toBe(""); // the exact floor is legal
    expect(validateFactor("10")).toBe(""); // the exact ceiling is legal
    expect(validateFactor(" 2.5 ")).toBe("");

    // each rejection carries a zh-Hant message the page can print verbatim
    for (const bad of ["", "   ", "abc", "0.05", "10.5", "-1", "0", "Infinity"]) {
      const msg = validateFactor(bad);
      expect(msg, `"${bad}" must be rejected`).not.toBe("");
      expect(msg).toMatch(/[一-鿿]/);
    }
    expect(validateFactor("0.05")).toContain(String(MIN_FACTOR));
    expect(validateFactor("11")).toContain(String(MAX_FACTOR));
    expect(parseFactor("")).toBeNull();
    expect(parseFactor("abc")).toBeNull();
    expect(parseFactor(" 1.25 ")).toBe(1.25);
  });

  it("form validation gates Save and reports only the failing rows", () => {
    cover("adminui-combatenv-save");
    const good = neutralForm();
    expect(validateForm(good)).toEqual({});
    expect(formValid(good)).toBe(true);

    const bad = setField(setField(good, "cooldown", "99"), "healing", "");
    const errs = validateForm(bad);
    expect(Object.keys(errs).sort()).toEqual(["cooldown", "healing"]);
    expect(formValid(bad)).toBe(false);
  });

  it("the payload is ALWAYS the complete table (PUT-replace semantics)", () => {
    cover("adminui-combatenv-save");
    const form = setField(setField(neutralForm(), "cooldown", "0.75"), "damageDealt", " 1.4 ");
    const body = toSavePayload(form);
    expect(Object.keys(body.multipliers)).toHaveLength(COMBAT_ENV_KEYS.length);
    expect(body.multipliers.cooldown).toBe(0.75);
    expect(body.multipliers.damageDealt).toBe(1.4);
    expect(body.multipliers.healing).toBe(NEUTRAL);
    // values are numbers on the wire, not the raw input strings
    for (const k of COMBAT_ENV_KEYS) expect(typeof body.multipliers[k]).toBe("number");
    // safety net: an invalid box degrades to neutral rather than sending NaN
    expect(toSavePayload(setField(form, "shield", "oops")).multipliers.shield).toBe(NEUTRAL);
  });

  it("the operator-facing note says the change applies to the NEXT match", () => {
    cover("adminui-combatenv-save");
    expect(APPLY_NOTE).toBe("儲存後下一場對戰生效（進行中對戰不受影響）");
    expect(saveErrorText(new Error("multiplier cooldown must be between 0.1 and 10"))).toContain(
      "multiplier cooldown must be between 0.1 and 10",
    );
    expect(saveErrorText(new Error("x"))).toMatch(/^儲存失敗/);
    expect(loadErrorText(new Error("x"))).toMatch(/^讀取戰鬥系統設定失敗/);
  });
});

// ---- API round-trip via a mocked fetch --------------------------------------

function memStorage(initial: TokenPair | null): TokenStorage {
  let cur = initial;
  return { load: () => cur, save: (t) => void (cur = t) };
}
const TOKENS: TokenPair = { accessToken: "acc-1", refreshToken: "ref-1", expiresIn: 900 };

function jsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("combat-env API round-trip (adminui-combatenv-save)", () => {
  it("GET seeds the table; PUT sends the full table and re-seeds from the server truth", async () => {
    cover("adminui-combatenv-save");
    const puts: Record<string, unknown>[] = [];
    const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/admin/combat-env") && (init?.method ?? "GET") === "GET") {
        return jsonRes(200, SAVED);
      }
      if (u.endsWith("/admin/combat-env") && init?.method === "PUT") {
        const body = JSON.parse(String(init?.body)) as { multipliers: Record<string, number> };
        puts.push(body);
        // the platform echoes the stored doc with a server-owned updatedAt
        return jsonRes(200, {
          ...SAVED,
          updatedAt: "2026-07-22T13:00:00Z",
          multipliers: body.multipliers,
        });
      }
      return jsonRes(404, { error: { code: "not_found", message: "no" } });
    });

    const client = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });
    const doc = normalizeCombatEnvDoc(await client.request<unknown>("/admin/combat-env"));
    expect(doc.multipliers.cooldown).toBe(0.8);
    const form = formFromDoc(doc);
    expect(isDirty(form, doc)).toBe(false);

    // tune one row, reset another, then save
    const edited = resetField(setField(form, "healing", "1.25"), "maxHealth");
    expect(formValid(edited)).toBe(true);
    const saved = normalizeCombatEnvDoc(
      await client.request<unknown>("/admin/combat-env", { method: "PUT", body: toSavePayload(edited) }),
    );

    expect(puts).toHaveLength(1);
    const sent = (puts[0]?.multipliers ?? {}) as Record<string, number>;
    expect(Object.keys(sent)).toHaveLength(COMBAT_ENV_KEYS.length);
    expect(sent.healing).toBe(1.25);
    expect(sent.maxHealth).toBe(NEUTRAL); // the reset row is sent explicitly as 1.0
    expect(sent.cooldown).toBe(0.8); // untouched rows keep their stored value

    expect(saved.multipliers.healing).toBe(1.25);
    expect(saved.updatedAt).toBe("2026-07-22T13:00:00Z");
    // re-seeding from the response clears the dirty markers
    expect(isDirty(formFromDoc(saved), saved)).toBe(false);
  });

  it("a rejected save surfaces the platform's 400 message and keeps the edits", async () => {
    cover("adminui-combatenv-save");
    const fetchFn = vi.fn(async () =>
      jsonRes(400, { error: { code: "bad_request", message: "multiplier cooldown must be between 0.1 and 10" } }),
    );
    const client = new ApiClient({ fetchFn: fetchFn as unknown as typeof fetch, storage: memStorage(TOKENS) });

    const doc = normalizeCombatEnvDoc(SAVED);
    const edited = setField(formFromDoc(doc), "cooldown", "0.5");
    let text = "";
    try {
      await client.request<unknown>("/admin/combat-env", { method: "PUT", body: toSavePayload(edited) });
    } catch (err) {
      text = saveErrorText(err);
    }
    expect(text).toBe("儲存失敗：multiplier cooldown must be between 0.1 and 10");
    // the failed save left the local edit in place (the page keeps the form)
    expect(edited.cooldown).toBe("0.5");
    expect(isDirty(edited, doc)).toBe(true);
  });
});

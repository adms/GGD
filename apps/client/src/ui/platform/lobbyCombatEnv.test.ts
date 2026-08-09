/**
 * lobbyCombatEnv — the pre-match combat-env resolution (task #258 / #125).
 *
 * The claim under test is narrow and load-bearing: a champion profile shown in
 * the LOBBY must print the same finals combat would, which means the lobby has
 * to resolve content-defaults + admin-override itself instead of falling back
 * to the neutral all-1.0 table `useDisplayEnv()` returns outside a match.
 */
import { describe, it, expect } from "vitest";
import { cover } from "@ggd/shared/testkit/cover";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  fetchAdminCombatEnv,
  mergeCombatEnv,
  parseAdminCombatEnv,
  pickKnown,
} from "./lobbyCombatEnv";
import { DEFAULT_COMBAT_ENV } from "@ggd/shared/sim/combatEnv";
import { displayFinal, displayFinalText } from "../displayFinal";

const SHIPPED = JSON.parse(
  readFileSync(resolve(__dirname, "../../../../../content/config/combat-env.json"), "utf8"),
) as { multipliers: Record<string, number> };

describe("lobbyCombatEnv", () => {
  it("keeps only known, finite keys", () => {
    expect(pickKnown({ cooldown: 0.2, nope: 5, abilityRange: "x", maxHealth: Number.NaN })).toEqual({
      cooldown: 0.2,
    });
    expect(pickKnown(null)).toEqual({});
    expect(pickKnown("garbage")).toEqual({});
  });

  it("parses the platform body and rejects anything that is not a table", () => {
    expect(parseAdminCombatEnv({ multipliers: { cooldown: 0.5 } })).toEqual({ cooldown: 0.5 });
    expect(parseAdminCombatEnv({})).toBeNull();
    expect(parseAdminCombatEnv(null)).toBeNull();
    expect(parseAdminCombatEnv({ multipliers: null })).toBeNull();
  });

  it("admin beats content per key, and content survives where admin is silent", () => {
    cover("valhalla-env-merge");
    const env = mergeCombatEnv({ cooldown: 0.2, abilityRange: 0.6 }, { cooldown: 0.5 });
    expect(env.cooldown).toBe(0.5);
    expect(env.abilityRange).toBe(0.6);
  });

  it("no admin table at all ⇒ the content defaults, NOT neutral", () => {
    const env = mergeCombatEnv({ cooldown: 0.2 }, null);
    expect(env.cooldown).toBe(0.2);
    expect(DEFAULT_COMBAT_ENV.cooldown).toBe(1);
  });

  it("an unreachable / erroring platform resolves to null (fail-safe to content)", async () => {
    const boom = (): Promise<Response> => Promise.reject(new Error("offline"));
    expect(await fetchAdminCombatEnv("/x", boom as unknown as typeof fetch)).toBeNull();
    const notOk = (): Promise<Response> => Promise.resolve({ ok: false } as Response);
    expect(await fetchAdminCombatEnv("/x", notOk as unknown as typeof fetch)).toBeNull();
  });

  it("THE BUG: the shipped table's cooldown is NOT the neutral one, and it reaches displayFinal", () => {
    cover("valhalla-env-125");
    // If this ever stops being true the lobby could safely use the neutral
    // table — but as long as it IS true, showing base cooldowns in the lobby is
    // a lie, and that is exactly what this module exists to prevent.
    //
    // ⛔ 這裡曾經寫死 `cooldown === 0.2` / `abilityRange === 0.6` / `12`。那三個
    // 都是出貨值的**第四個住處**(content/config + Zod DEFAULT_* + admin SHIPPED_*
    // 已經有三個,而且彼此有 drift 測試在守),所以 owner 2026-08-10 調平衡
    // (abilityRange 0.6→0.8)的那一刻,它用「lobby 壞了」的訊息紅 —— 而 lobby
    // 好得很。守的機制是**出貨表真的流過 merge → displayFinal**,不是那些數字。
    const cdFactor = SHIPPED.multipliers.cooldown;
    const rangeFactor = SHIPPED.multipliers.abilityRange;
    // 夾具前提，不是被測的性質：出貨表真的有這兩格（少了就不是「lobby 壞了」）。
    if (typeof cdFactor !== "number" || typeof rangeFactor !== "number") {
      throw new Error("content/config/combat-env.json 少了 cooldown / abilityRange");
    }
    const shipped = mergeCombatEnv(pickKnown(SHIPPED.multipliers), null);
    expect(shipped.cooldown).toBe(cdFactor);
    expect(shipped.abilityRange).toBe(rangeFactor);
    // the premise of the whole module: shipped ≠ neutral, so the lobby MUST resolve
    expect(shipped.cooldown).not.toBe(DEFAULT_COMBAT_ENV.cooldown);
    const final = 60 * cdFactor;
    expect(displayFinal(60, "cooldown", shipped)).toBeCloseTo(final, 6);
    expect(displayFinal(60, "cooldown", DEFAULT_COMBAT_ENV)).toBe(60);
    expect(displayFinalText(60, "cooldown", { env: shipped })).toBe(
      String(Number(final.toFixed(3))),
    );
  });
});

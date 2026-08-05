/**
 * E1 硬約束（owner 核准，#278）——「這一批新增的每一個 effect kind 都帶 `shape`」，
 * 而且**清單是從註冊表推導的，不是手抄的名字**。
 *
 * ── 為什麼這一條不能寫成 `const NEW_KINDS = ["dispel", "shieldBreak", …]` ──
 * 那樣寫的話，下一個人加第七個 kind 而忘了 `shape`，這條測試會**綠**——
 * 因為他的名字不在我抄的那張紙上。守衛就變成了一張紀念品
 *（七種失敗形態 ⑥：用掃字串代替行為）。
 *
 * 所以這裡的作法是 `simCapabilityDrift.test.ts` 的那一招：**問出貨的註冊表**
 * `EFFECT_HANDLERS` 有哪些 kind，再扣掉一份**明確列舉的既有 kind 名單**。
 * 差集就是「這一批（以及以後每一批）新增的」，一個都跑不掉。
 *
 * ⚠️ `PRE_A4_KINDS` 是一條**歷史線**，不是豁免表。它記的是 2026-08-05 之前
 * 就存在的 kind —— 那些是在 `shape` 這條約束成立**之前**上架的，回頭補
 * `shape` 是一次跨 1,900 份文件的遷移，而不是這一批的範圍。
 * ⛔ 任何人都不可以往這張名單裡「加一個新名字讓測試變綠」——
 * 加進去的那一刻它就在說謊（它宣稱那個 kind 是 A4 之前就有的）。
 *
 * ── `shape` 到底要求什麼 ──────────────────────────────────────────────────
 * 「這個 kind 的作用範圍講得清楚」。判準是 schema 認不認得 `shape` 這一格 ——
 * 讀的是**出貨的 Zod**，不是原始碼字串。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { EFFECT_HANDLERS } from "../../sim/effects/effectRegistry";
import { zEffectDef } from "./effect";

/**
 * 2026-08-05（A4b）之前就註冊的 effect kind。
 *
 * 用 `git show HEAD:…/effectRegistry.ts` 從**那一版真的註冊表**抓出來（不是憑記憶列，
 * 第一版我憑印象寫了 30 個名字，其中 6 個根本不存在），之後**只減不增**：
 * 一個 kind 被刪掉時把它從這裡拿掉，新增的 kind 永遠不進來。
 */
const PRE_A4_KINDS: ReadonlySet<string> = new Set([
  "applyBuff",
  "applyStatus",
  "championForm",
  "cycleBuff",
  "damage",
  "damageArea",
  "damageLine",
  "dash",
  "dot",
  "evasion",
  "grantAttribute",
  "grantGold",
  "heal",
  "invulnerable",
  "knockback",
  "leap",
  "restore",
  "revive",
  "shield",
  "spawnProjectile",
  "spawnVfx",
  "spendMana",
  "summon",
  "taunt",
]);

/** 一份最小可解析的文件，只為了問「schema 收不收 `shape`」。 */
function acceptsShape(kind: string): boolean {
  const probe = { kind, shape: "single" } as unknown;
  const r = zEffectDef.safeParse(probe);
  if (r.success) return true;
  // 沒過也可能只是缺其他必填欄位 —— 只要沒有人抱怨 `shape` 這一格，就算收。
  return !r.error.issues.some((i) => i.path[0] === "shape");
}

describe("E1：新 effect kind 一律帶 shape", () => {
  it("清單是從出貨註冊表推導的,不是手抄的", () => {
    cover("e1-kinds-derived");
    const registered = Object.keys(EFFECT_HANDLERS);
    // 夾具前提:註冊表真的有東西(空物件會讓下面每一條都空轉而全綠)。
    expect(registered.length).toBeGreaterThan(PRE_A4_KINDS.size);

    // 歷史線只能減不能增:出現在名單裡卻已經從註冊表消失的,要順手清掉。
    const stale = [...PRE_A4_KINDS].filter((k) => !registered.includes(k));
    expect(stale, "PRE_A4_KINDS 裡有已經不存在的 kind,把它們刪掉").toEqual([]);
  });

  it("A4 之後新增的每一個 kind 都收 shape", () => {
    cover("e1-new-kinds-have-shape");
    const newKinds = Object.keys(EFFECT_HANDLERS).filter((k) => !PRE_A4_KINDS.has(k));
    // 這一批至少有一個(dispel),否則就是註冊表接錯了而這條測試在空轉。
    expect(newKinds.length).toBeGreaterThan(0);
    const missing = newKinds.filter((k) => !acceptsShape(k));
    expect(missing, "這些新 kind 沒有 shape —— 它們的作用範圍講不清楚").toEqual([]);
  });

  it('shape:"circle" 沒寫 radius 的文件進不來 —— 而且是載入時擋,不是執行期靜默退化', () => {
    cover("e1-circle-needs-radius");
    const bad = zEffectDef.safeParse({ kind: "dispel", shape: "circle", polarity: "debuff" });
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.path.includes("radius"))).toBe(true);
    }
    // 反面:補上半徑就進得來(否則上面那一條會被一個「dispel 整個不合法」的
    // 實作騙過去 —— 失敗形態 ④)。
    const good = zEffectDef.safeParse({
      kind: "dispel",
      shape: "circle",
      radius: 8,
      polarity: "debuff",
    });
    expect(good.success).toBe(true);
  });
});

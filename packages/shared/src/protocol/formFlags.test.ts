/**
 * 變身 FORM BITS on the wire (task #249, wave G2) + the ENTITY_FLAG BIT BUDGET.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BUDGET IS A TEST AND NOT JUST A COMMENT
 * ---------------------------------------------------------------------------
 * `EntityState.flags` was a **uint16** until 2026-08-18; owner widened it to
 * **uint32** ("ENTITY_FLAG expand!") because the 16-bit budget was exhausted and
 * [EX∅ 根源] needed three more player-visible states. The budget still has to be
 * guarded — widening bought room, it did not remove the failure mode. Two features
 * have already collided here: #244 黑泥吞噬 and #247 leap both authored 512, and
 * the unmerged side had to move (see `ENTITY_FLAG.AIRBORNE`'s own note). A
 * comment saying "these bits are free" is exactly the artefact that failed the
 * first two times, because nobody re-reads it while adding a flag. These tests
 * fail the build instead:
 *
 *   · every flag is a distinct power of two,
 *   · every flag fits inside uint32,
 *   · the FREE list is disjoint from the used ones and complete,
 *   · 2^31 stays OUT of the free list (JS `&` is int32-signed — see the schema).
 *
 * A third collision cannot be silent again: the two features would then share a
 * bit, and a live client would render a champion as transformed because it is
 * burning — with no error anywhere.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  EntityState,
  ENTITY_FLAG,
  ENTITY_FLAG_FREE_BITS,
  ENTITY_FLAG_RESERVED_BIT,
  formFlagsForIndex,
  formIndexFromFlags,
  growthTierFromFlags,
} from "./schema";

const UINT16_MAX = 0xffff;
/** ⭐ 2026-08-18 加寬之後的上界。 */
const UINT32_MAX = 0xffffffff;

describe("formIndexFromFlags — the client's only 變身 read", () => {
  it("decodes the four ordinals", () => {
    expect(formIndexFromFlags(0)).toBe(0);
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_A)).toBe(1);
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_B)).toBe(2);
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_A | ENTITY_FLAG.FORM_B)).toBe(3);
  });

  it("FORM_B alone is 2, not 'tier 1 with extra' — a form is a NUMBER, not a threshold", () => {
    // The neighbouring `growthTierFromFlags` IS a threshold ladder (high bit
    // wins, low bit implied). Copying that shape here would silently collapse
    // form 2 onto form 1. This is the test that would have caught it.
    expect(formIndexFromFlags(ENTITY_FLAG.FORM_B)).not.toBe(
      formIndexFromFlags(ENTITY_FLAG.FORM_A),
    );
    expect(growthTierFromFlags(ENTITY_FLAG.MUD_BOSS)).toBe(2); // the ladder, for contrast
  });

  it("ignores every unrelated bit — a burning, airborne, tier-2 alternate is still form 1", () => {
    const noise =
      ENTITY_FLAG.BURNING |
      ENTITY_FLAG.AIRBORNE |
      ENTITY_FLAG.MUD_SWELL |
      ENTITY_FLAG.MUD_BOSS |
      ENTITY_FLAG.STUNNED |
      ENTITY_FLAG.CASTING;
    expect(formIndexFromFlags(noise)).toBe(0);
    expect(formIndexFromFlags(noise | ENTITY_FLAG.FORM_A)).toBe(1);
  });

  it("does not disturb the growth read, and the growth read does not disturb it", () => {
    const both = ENTITY_FLAG.FORM_A | ENTITY_FLAG.MUD_BOSS | ENTITY_FLAG.MUD_SWELL;
    expect(formIndexFromFlags(both)).toBe(1);
    expect(growthTierFromFlags(both)).toBe(2);
  });

  it("round-trips through formFlagsForIndex, which is the snapshot's encoder", () => {
    for (const i of [0, 1, 2, 3]) {
      expect(formIndexFromFlags(formFlagsForIndex(i))).toBe(i);
    }
    // an out-of-range index clamps to the BASE body rather than emitting a bit
    // pattern the decoder cannot name (a body the client cannot resolve is the
    // one thing that must never ride the wire).
    for (const bad of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(formFlagsForIndex(bad)).toBe(0);
      expect(formIndexFromFlags(formFlagsForIndex(bad))).toBe(0);
    }
  });

  it("the encoder writes ONLY the two form bits", () => {
    for (const i of [0, 1, 2, 3]) {
      const written = formFlagsForIndex(i);
      expect(written & ~(ENTITY_FLAG.FORM_A | ENTITY_FLAG.FORM_B)).toBe(0);
    }
  });
});

describe("ENTITY_FLAG bit budget — uint32, and the third collision must not be silent", () => {
  const values = Object.values(ENTITY_FLAG) as number[];

  it("every flag is a distinct power of two inside uint32", () => {
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
      expect(v).toBeLessThanOrEqual(UINT32_MAX);
      expect(v & (v - 1)).toBe(0); // exactly one bit set
    }
  });

  it("the declared FREE bits are genuinely free, and used+free+reserved fill uint32", () => {
    const used = values.reduce((a, b) => a | b, 0);
    for (const free of ENTITY_FLAG_FREE_BITS) {
      expect(used & free).toBe(0);
      expect(free & (free - 1)).toBe(0);
      expect(free).toBeLessThanOrEqual(UINT32_MAX);
      // ⛔ 2^31 must never be handed out as "free" — `flags & 2**31` is NEGATIVE
      // in JS, so any `> 0` read of it silently returns false.
      expect(free).not.toBe(ENTITY_FLAG_RESERVED_BIT);
    }
    const free = (ENTITY_FLAG_FREE_BITS as readonly number[]).reduce((a, b) => a | b, 0);
    // No gap and no overlap: if a flag is added without deleting its bit from
    // the FREE list, this fails; if one is removed without returning its bit,
    // this fails too. The budget can only be wrong loudly.
    // `>>> 0` because the reserved bit makes the OR negative as a signed int32.
    expect((used | free | ENTITY_FLAG_RESERVED_BIT) >>> 0).toBe(UINT32_MAX);
    expect(used & free).toBe(0);
  });

  /**
   * ★ **承重的那一條** —— 讀的是**線路上真的那一格**，⛔ 不是常數陣列。
   *
   * ⚠️ 沒有這一條的話，把 `defineTypes` 的 `flags` 改回 `"uint16"` 而 15 格 FREE 留著，
   * **整個檔仍然全綠**：所有斷言驗的都是 `ENTITY_FLAG_FREE_BITS` 這個字面陣列，
   * 沒有一條問過那些 bit 送不送得出去。那正是失敗形態⑤（被測的不是出貨的那個）——
   * 而後果是 65536 以上的旗標在伺服器上被設起來、在線路上被截掉，畫面什麼都不會發生。
   *
   * `Symbol.metadata` 是 Colyseus 記 `defineTypes` 結果的地方，也就是編碼器真的會讀的表。
   */
  it("★ EntityState.flags 在線路上真的是 uint32（讀 defineTypes 的產物，不是註解）", () => {
    const meta = (EntityState as unknown as Record<symbol, unknown>)[Symbol.metadata] as
      | Record<string, { type: string; name: string }>
      | undefined;
    expect(meta, "讀不到 Colyseus 的欄位表 —— 這條守衛在空轉").toBeDefined();
    const flags = Object.values(meta!).find((f) => f?.name === "flags");
    expect(flags, "EntityState 上找不到 flags 這一欄").toBeDefined();
    expect(
      flags!.type,
      "flags 不是 uint32 —— 高半部（65536 以上）的旗標會在線路上被截掉，" +
        "伺服器設得起來、客戶端收不到，而畫面上跟「功能沒做」一模一樣",
    ).toBe("uint32");
    // 每一顆宣告可用的 bit 都要真的送得出去。
    for (const b of ENTITY_FLAG_FREE_BITS) expect(b).toBeLessThanOrEqual(UINT32_MAX);
  });

  it("★ the OLD 16-bit flags all still sit inside the low half — the wire is pinned", () => {
    // ⭐ 加寬**不可以**順手重編號：伺服器編碼器與客戶端解碼器是分開編譯的，
    // 而舊的 16 個字面值已經在線路上跑了好幾版。加寬只增加高半部的可用空間。
    //
    // ⚠️ 2026-08-18 這一條被改過一次，改的是**斷言的範圍**而不是它的意思：
    // 原文是 `for (const v of values)`（＝「每一顆 flag 都在低半部」），而那句話
    // 在高半部被真的用掉的那一刻就與加寬本身互相矛盾 —— 照它寫下去，那 15 格
    // 永遠開不了。要釘的一直是**舊的那 16 個**，所以現在逐名列舉它們。
    const OLD_16 = [
      "DASHING", "ROOTED", "STUNNED", "SLOWED", "CASTING", "WINDUP",
      "CHANNELLING", "CONTESTED", "BURNING", "MUD_SWELL", "MUD_BOSS",
      "AIRBORNE", "FORM_A", "FORM_B", "INVISIBLE", "MOB_ELITE",
    ] as const;
    for (const name of OLD_16) {
      expect(ENTITY_FLAG[name], `${name} 被重編號了 —— 線上的舊分頁會 desync 而且不報錯`)
        .toBeLessThanOrEqual(UINT16_MAX);
    }
    // 高半部只給**加寬之後**新增的那些，⛔ 沒有第三個地方。
    const highHalf = values.filter((v) => v > UINT16_MAX);
    expect(highHalf.length).toBe(values.length - OLD_16.length);
    expect(ENTITY_FLAG_FREE_BITS.every((b) => b > UINT16_MAX)).toBe(true);
  });

  it("FORM_A / FORM_B are 4096 / 8192 — the literals the wire is pinned to", () => {
    // Pinned because both halves (server encoder, client decoder) are compiled
    // separately and a renumber would desync a client mid-match with no error.
    expect(ENTITY_FLAG.FORM_A).toBe(4096);
    expect(ENTITY_FLAG.FORM_B).toBe(8192);
    // 隱形原語 took 16384 (INVISIBLE) and 精英小怪 took 32768 (MOB_ELITE) — that
    // exhausted the uint16. owner 2026-08-18 widened the field to uint32, so the
    // low half is full and the high half is open. (This comment used to say
    // 「ONE bit is left」 while the line under it asserted the list was empty:
    // GH#285's exact shape, inside the guard for it.)
    // ⚠️ 2026-08-18（同一天，稍晚）：[EX∅ 根源] 拿走了高半部最低的四顆
    //（CARRIED · TEAM_OVERRIDE · TEAM_OVERRIDE_A · TEAM_OVERRIDE_B）——
    // 那正是加寬那一次逐字說明要給它的四顆，所以額度從 15 降到 11。
    // ⛔ 這個數字要跟 CLAUDE.md 一起動（下面那一條在守）。
    expect(ENTITY_FLAG_FREE_BITS.length).toBe(11);
  });

  /**
   * …AND CLAUDE.md HAS TO AGREE (GH#285).
   *
   * The budget above was already guarded on the CODE side, loudly, in this very
   * file. It still went wrong where it mattered: `CLAUDE.md` — the document
   * everybody is told to read FIRST — went on saying 「目前剩 16384 / 32768 兩格」
   * for months after both were taken. Nothing read that sentence, so nothing
   * could contradict it. This does.
   */
  it("CLAUDE.md's ENTITY_FLAG sentence agrees with ENTITY_FLAG_FREE_BITS", () => {
    const doc = readFileSync(
      fileURLToPath(new URL("../../../../CLAUDE.md", import.meta.url)),
      "utf8",
    );
    const line = doc.split("\n").find((l) => l.includes("ENTITY_FLAG"));
    expect(line, "CLAUDE.md no longer mentions ENTITY_FLAG at all — the bit budget is the kind " +
      "of irreversible constraint that has to stay in the rules, not only in a schema comment")
      .toBeDefined();
    const claimsExhausted = /用光|用盡|沒有了|空陣列|zero|exhaust/i.test(doc.slice(doc.indexOf(line!), doc.indexOf(line!) + 600));
    expect(
      claimsExhausted,
      `ENTITY_FLAG_FREE_BITS has ${ENTITY_FLAG_FREE_BITS.length} bit(s) left, but CLAUDE.md says:\n` +
        `  ${line!.trim()}\n` +
        "When the budget is empty CLAUDE.md must say so; when bits come back (only by WIDENING the " +
        "field) it must say how many. A rule nobody can falsify is the thing GH#285 was about.",
      // ⚠️ `as number`：`ENTITY_FLAG_FREE_BITS` 是 `as const`，所以 `.length` 是一個
      // **字面型別**（今天是 11），而 `11 === 0` 會被 TS2367 當成「不可能成立的比較」
      // 直接拒編。⛔ 這條斷言要的正是那個布林值（額度空了 → CLAUDE.md 必須說空了），
      // 所以退到 number 讓它是一個**執行期**的問題，⛔ 不是把斷言改掉。
    ).toBe((ENTITY_FLAG_FREE_BITS.length as number) === 0);
    // ⭐ 有額度的時候，CLAUDE.md 要說出**幾格** —— 「還有空間」這種模糊句子
    // 正是 GH#285 那句謊話的形狀（它當時說的也是一個數字，只是過期了）。
    if (ENTITY_FLAG_FREE_BITS.length > 0) {
      expect(
        doc.slice(doc.indexOf(line!), doc.indexOf(line!) + 600),
        `CLAUDE.md 沒有寫出剩餘格數（現在是 ${ENTITY_FLAG_FREE_BITS.length} 格）`,
      ).toContain(String(ENTITY_FLAG_FREE_BITS.length));
    }
  });
});

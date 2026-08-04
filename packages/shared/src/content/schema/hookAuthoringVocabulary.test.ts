/**
 * 批 1 · D/E —— 寫卡片的人打錯字時，**載入這份文件的當下**就要響。
 *
 * 這一檔守的是 CLAUDE.md 的 fail-loud 條款那一半：批 1 的 D 與 E 兩項刻意
 * **不新增任何欄位**（新增只會產出同義詞），代價是「作者照 owner 的 TSV
 * 字面寫」的那幾種寫法必須有東西擋。擋的地方有兩層：
 *
 *   ① `.strict()` —— `op:"conversion"` / `op:"set"` / `conditions:[…]` /
 *      `interval:0.5` 這幾個 key 根本不在 schema 裡，所以解析直接失敗，
 *      而 `SchemaValidationError` 會冠上 collection 與文件 id。
 *   ② `refineHookDamageContext` 的 `onInterval` 段 —— ①擋得到「拼錯」卻擋不到
 *      **漏填**：`onInterval` 沒有 `internalCooldown` 是合法的（03-00 相轉移
 *      裝甲的常駐魔免就要每 tick 發），但配上一顆每次評估都要付錢的條件葉子
 *      就是 30 次/秒的抽籤。那一組才是被拒的。
 *
 * ⚠️ 這一檔跑的是**真的 Zod**（`zHookDef` / `zItemHookDef` 兩個出貨入口），
 * 不是掃原始碼字串。失敗形態 ⑥。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../testkit/cover";
import { zHookDef } from "./effect";
import { zItemHookDef } from "./item";

const TAG = "hook-authoring-vocabulary";

/** 一條合法的、最小的 `onInterval` hook —— 每一組案例都從它長出來。 */
const base = {
  on: "onInterval" as const,
  target: "self" as const,
  effects: [{ kind: "heal" as const, amount: { flat: 10 } }],
};

describe("D · onInterval 漏填節奏 → 載入失敗", () => {
  it("★ onInterval + chance 葉子 + 沒有 internalCooldown → 拒絕", () => {
    cover(TAG);
    const res = zHookDef.safeParse({ ...base, condition: { kind: "chance", p: 0.5 } });
    expect(res.success, "每 tick 抽一次籤的 hook 被收下了").toBe(false);
    if (!res.success) {
      // 訊息要能讓作者知道**填哪一格**，不是只說「有問題」。
      expect(res.error.issues.some((i) => i.message.includes("internalCooldown"))).toBe(true);
    }
  });

  it("★ 巢狀在 all/any/not 裡的葉子一樣抓得到", () => {
    cover(TAG);
    for (const condition of [
      { all: [{ kind: "chance", p: 0.5 }] },
      { any: [{ kind: "kind", subject: "self", is: "champion" }, { kind: "chance", p: 0.1 }] },
      { not: { kind: "chance", p: 0.9 } },
    ]) {
      expect(zHookDef.safeParse({ ...base, condition }).success, JSON.stringify(condition)).toBe(
        false,
      );
    }
  });

  it("★ 三個對照組 —— 這條閘不可以擋到合法的寫法", () => {
    cover(TAG);
    // (a) 填了節奏 → 合法（絕大多數出貨文件長這樣）
    expect(
      zHookDef.safeParse({ ...base, internalCooldown: 0.5, condition: { kind: "chance", p: 0.5 } })
        .success,
    ).toBe(true);
    // (b) 沒有條件 → 每 tick 發是刻意的（03-00 相轉移裝甲的常駐魔免）
    expect(zHookDef.safeParse(base).success).toBe(true);
    // (c) 條件裡沒有「每次評估都要付錢」的葉子 → 純比大小，每 tick 做無妨
    expect(
      zHookDef.safeParse({
        ...base,
        condition: { kind: "stat", subject: "self", stat: "hp", mode: "percent", op: "<", value: 0.5 },
      }).success,
    ).toBe(true);
    // (d) 別的事件上有 chance 葉子而沒有 ICD → 那是被動 proc 的正常寫法
    expect(
      zHookDef.safeParse({
        ...base,
        on: "onBasicAttack",
        condition: { kind: "chance", p: 0.5 },
      }).success,
    ).toBe(true);
  });

  it("★ 道具入口套的是同一條規則（zHookDef 與 zItemHookDef 不可以分歧）", () => {
    cover(TAG);
    expect(zItemHookDef.safeParse({ ...base, condition: { kind: "chance", p: 0.5 } }).success).toBe(
      false,
    );
    expect(zItemHookDef.safeParse({ ...base, internalCooldown: 1, condition: { kind: "chance", p: 0.5 } }).success).toBe(true);
  });
});

describe("E · 三項純拼寫 —— 引擎已經有對應的欄位，不新增同義詞", () => {
  it("★ `interval` 這個 key 不存在，寫了就解析失敗", () => {
    cover(TAG);
    expect(zHookDef.safeParse({ ...base, interval: 0.5 }).success).toBe(false);
    // …而正確的寫法通過。這一對就是「它不是缺的功能，是拼寫」。
    expect(zHookDef.safeParse({ ...base, internalCooldown: 0.5 }).success).toBe(true);
  });

  it("★ `conditions: [...]` 不存在，正確的寫法是 `condition: { all: [...] }`", () => {
    cover(TAG);
    expect(
      zHookDef.safeParse({
        ...base,
        internalCooldown: 1,
        conditions: [{ kind: "chance", p: 0.5 }],
      }).success,
    ).toBe(false);
    expect(
      zHookDef.safeParse({
        ...base,
        internalCooldown: 1,
        condition: { all: [{ kind: "chance", p: 0.5 }] },
      }).success,
    ).toBe(true);
  });

  it("★ `op: \"conversion\"` / `op: \"set\"` 不存在，percentOf / override 才是", () => {
    cover(TAG);
    const buff = (op: string, extra: Record<string, unknown> = {}) => ({
      ...base,
      effects: [
        {
          kind: "applyBuff",
          duration: 5,
          modifiers: [{ stat: "ms", op, value: 0.5, ...extra }],
        },
      ],
    });
    expect(zHookDef.safeParse(buff("conversion", { from: "as" })).success).toBe(false);
    expect(zHookDef.safeParse(buff("set")).success).toBe(false);
    // 出貨的那兩個名字通得過 —— 證明上面兩條紅的是**那個字**，不是整份文件。
    expect(zHookDef.safeParse(buff("percentOf", { from: "as" })).success).toBe(true);
    expect(zHookDef.safeParse(buff("override")).success).toBe(true);
  });
});

describe("A/B/C · 新成員真的進得了 schema（不然 sim 那一半永遠等不到文件）", () => {
  it("★ 三個 victim 成員 + 兩個 damageSource 成員 + 一格 scope", () => {
    cover(TAG);
    for (const victim of ["enemyChampion", "allyChampion", "enemy"]) {
      expect(zHookDef.safeParse({ ...base, on: "onKill", victim }).success, victim).toBe(true);
    }
    for (const damageSource of ["ability", "other"]) {
      expect(
        zHookDef.safeParse({ ...base, on: "onDamageTaken", damageSource }).success,
        damageSource,
      ).toBe(true);
    }
    for (const internalCooldownScope of ["source", "perAbilitySlot"]) {
      expect(
        zHookDef.safeParse({ ...base, on: "onAbilityCast", internalCooldown: 1, internalCooldownScope })
          .success,
        internalCooldownScope,
      ).toBe(true);
    }
    // 對照組：一個不存在的成員照樣要被拒（不然上面那些過了也不代表什麼）。
    expect(zHookDef.safeParse({ ...base, on: "onKill", victim: "enemyMob" }).success).toBe(false);
    expect(
      zHookDef.safeParse({ ...base, on: "onAbilityCast", internalCooldownScope: "perAbilityId" })
        .success,
    ).toBe(false);
  });
});

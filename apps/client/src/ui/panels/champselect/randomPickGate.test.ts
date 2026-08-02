/**
 * randomPickGate.test — owner 2026-08-02「隨機選角的時候，只能隨機到自己有解鎖
 * 的角色」的**決策層**守衛。
 *
 * ⚠️ 這個檔案刻意先釘住那個「假修法」。#201 之前寫的是
 * `if (meta.available) pool = selectableIdsByOwnership(pool, meta.prices, meta.owned)`，
 * 而看到 fail-open 的人第一反應是「把 if 拿掉就好」。第一組測試證明那樣改
 * **一個位元都不會變**：`meta.available === false` 時 `prices` 是空 Map，
 * `lockStateOf` 對沒價格的英雄回 "free"，過濾器就是恆等函式（失敗形態 ③）。
 * 所以閘必須建在「擁有權可不可見」（OwnershipVisibility）上。
 *
 * 渲染層的接線（🎲 真的走這條路嗎）在 ../champSelectRandomOwnership.test.ts，
 * 那裡是掛真的 <ChampSelectPanel/> 在 jsdom 上按真的按鈕 —— 這個檔案只保證
 * 決策本身是對的，不保證有人叫它。兩個都要有，缺一個就是失敗形態 ③ 或 ⑤。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectableIdsByOwnership } from "./walletMeta";
import {
  SHIPPED_RANDOM_PICK_OWNERSHIP,
  planRandomPick,
  randomPickBlockedHint,
  randomPickOwnershipMode,
} from "./randomPickGate";
import { pickRandomId } from "../champSelectFilter";

/** 白名單母體：3 支付費 + 1 支免費。 */
const ROSTER = ["free-one", "paid-a", "paid-b", "paid-c"];
const PRICES = new Map<string, number>([
  ["paid-a", 300],
  ["paid-b", 300],
  ["paid-c", 300],
  ["free-one", 0],
]);
const OWNS_ONE = new Set(["paid-b"]);

describe("為什麼「把 if 拿掉」修不好（假修法的解剖）", () => {
  it("擁有權讀不到時 prices 是空的，所以擁有權過濾器是恆等函式", () => {
    // 這就是「無條件套 selectableIdsByOwnership」會發生的事：整個白名單原封不動。
    expect(selectableIdsByOwnership(ROSTER, new Map(), new Set())).toEqual(ROSTER);
  });
});

describe("擁有權讀得到（known）—— 沒解鎖的抽不到", () => {
  it("整個 rng 值域掃過去，抽出來的永遠只有 free-one / paid-b", () => {
    const plan = planRandomPick({
      whitelisted: ROSTER,
      ownership: "known",
      prices: PRICES,
      owned: OWNS_ONE,
      mode: "block",
    });
    expect(plan).toEqual({ kind: "draw", pool: ["free-one", "paid-b"] });
    if (plan.kind !== "draw") throw new Error("unreachable");

    // 不是斷言「池子長度是 2」（那是屬性，失敗形態 ⑦），是真的抽 1000 次。
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      const id = pickRandomId(plan.pool, () => i / 1000);
      expect(id).not.toBeNull();
      seen.add(id!);
    }
    expect([...seen].sort()).toEqual(["free-one", "paid-b"]);
    for (const locked of ["paid-a", "paid-c"]) expect(seen.has(locked)).toBe(false);
  });

  it("一支都沒解鎖 → 不抽（**不是**退回白名單）", () => {
    // 退回白名單正是要禁的那件事：那等於「沒解鎖也抽得到」。
    const plan = planRandomPick({
      whitelisted: ["paid-a", "paid-b"],
      ownership: "known",
      prices: PRICES,
      owned: new Set(),
      mode: "block",
    });
    expect(plan).toEqual({ kind: "blocked", reason: "none-unlocked" });
  });
});

describe("擁有權讀不到（unknown）—— 缺陷就在這個分支，所以它有自己的斷言", () => {
  it("出貨模式 block：有 session 但錢包讀不到就不抽，一支都不抽", () => {
    const plan = planRandomPick({
      whitelisted: ROSTER,
      ownership: "unknown",
      // 這正是那個狀態的真實資料形狀：空 prices、空 owned。
      prices: new Map(),
      owned: new Set(),
      mode: SHIPPED_RANDOM_PICK_OWNERSHIP,
    });
    expect(plan).toEqual({ kind: "blocked", reason: "ownership-unknown" });
  });

  it("後台切成 whitelist：照抽全白名單（2026-08-02 之前的行為，留給 owner 切回去）", () => {
    const plan = planRandomPick({
      whitelisted: ROSTER,
      ownership: "unknown",
      prices: new Map(),
      owned: new Set(),
      mode: "whitelist",
    });
    expect(plan).toEqual({ kind: "draw", pool: ROSTER });
  });

  it("兩種模式在同一組輸入下結論相反 —— 這個欄位真的在決定事情", () => {
    const base = { whitelisted: ROSTER, ownership: "unknown" as const, prices: new Map(), owned: new Set<string>() };
    expect(planRandomPick({ ...base, mode: "block" }).kind).toBe("blocked");
    expect(planRandomPick({ ...base, mode: "whitelist" }).kind).toBe("draw");
  });
});

describe("沒有帳號（anonymous）—— 本機開發不可以變成死按鈕", () => {
  it("沒有 session 就照抽白名單，而且不受後台欄位影響", () => {
    for (const mode of ["block", "whitelist"] as const) {
      expect(
        planRandomPick({
          whitelisted: ROSTER,
          ownership: "anonymous",
          prices: new Map(),
          owned: new Set(),
          mode,
        }),
      ).toEqual({ kind: "draw", pool: ROSTER });
    }
  });
});

describe("被擋下來一定要說話", () => {
  it("兩種理由給的是兩句不同的、講得出下一步的中文", () => {
    const a = randomPickBlockedHint("ownership-unknown");
    const b = randomPickBlockedHint("none-unlocked");
    expect(a).not.toBe(b);
    // 「按了沒反應」是這一版最可能的退化，所以文字必須非空且能指路。
    expect(a.length).toBeGreaterThan(10);
    expect(b.length).toBeGreaterThan(10);
    expect(a).toContain("解鎖");
    expect(b).toContain("解鎖");
  });
});

describe("後台欄位 config.store@1.randomPickOwnership", () => {
  it("讀得到 whitelist / block，缺欄位或壞值一律回出貨預設 block", () => {
    expect(randomPickOwnershipMode(() => ({ randomPickOwnership: "whitelist" }))).toBe("whitelist");
    expect(randomPickOwnershipMode(() => ({ randomPickOwnership: "block" }))).toBe("block");
    expect(randomPickOwnershipMode(() => ({}))).toBe("block"); // 舊 overlay 沒有這一欄
    expect(randomPickOwnershipMode(() => ({ randomPickOwnership: "sure" }))).toBe("block");
    expect(randomPickOwnershipMode(() => null)).toBe("block");
    expect(randomPickOwnershipMode(() => undefined)).toBe("block");
  });

  it("出貨的 content/config/store.json 真的帶著 owner 明說的那個值", () => {
    // 出貨值不是靠註解宣稱的（第三守則）—— 直接讀那個檔。
    const raw = readFileSync(resolve(__dirname, "../../../../../../content/config/store.json"), "utf8");
    const doc = JSON.parse(raw) as { schema?: string; randomPickOwnership?: string };
    expect(doc.schema).toBe("config.store@1");
    expect(doc.randomPickOwnership).toBe("block");
    expect(SHIPPED_RANDOM_PICK_OWNERSHIP).toBe(doc.randomPickOwnership);
  });
});

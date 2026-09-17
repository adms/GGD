/**
 * Guards the guard. `readStarterRoster` exists so suites stop reading the
 * gitignored operator whitelist (`data/curation/whitelist.json`) — a read that
 * worked on one machine and threw ENOENT everywhere else, turning
 * castabilitySweep.test.ts into a permanent "1 skipped".
 *
 * The replacement only helps if its two properties hold: the tracked block is
 * really there, and a starter.go that stops declaring it FAILS LOUDLY instead of
 * yielding an empty roster (an empty roster sweeps nothing while staying green,
 * which is the same disease under a new name).
 */
import { describe, it, expect } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { goStringSlice, readStarterRoster, STARTER_GO_REL } from "./starterRoster";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../.."); // testkit -> repo root

/**
 * The pinned roster size. A RATCHET, not a fact of nature: it moves only when
 * the owner genuinely opens or closes heroes, and moving it is the signal that
 * the rest of the roster's obligations (bindings.ts rows, a voice pack, the
 * store price) have to be checked too.
 *
 * 48 (#138) → 50 (#212) → 51 (GH#29 喪標麥可) → 53 (owner 2026-07-30: 白木卡迪那
 * `godie-e00s` #70 and 傑富力士 `godie-ucrl` #06, both as the BASE body per R6).
 */
// ⭐ 名單長度**從 starter.go 推導**（`starterRosterSize`），⛔ 不再抄一份數字。
//    2026-08-16 owner 下架四位（53→49）時，這個數字的四份副本讓四條測試
//    同時紅，而每一條都在講自己的功能壞了 —— 沒有一條說出「名單變短了」。
const ROSTER_SIZE = readStarterRoster(ROOT).length;

describe("tracked first open roster", () => {
  it("parses a non-empty, unique id list out of the committed starter.go", () => {
    const ids = readStarterRoster(ROOT);
    expect(ids.length, `${STARTER_GO_REL} must declare the pinned ${ROSTER_SIZE}`).toBe(ROSTER_SIZE);
    expect(new Set(ids).size).toBe(ROSTER_SIZE);
    // ⭐⭐ 2026-09-11（GH#1211）：這裡本來是 `/^godie-[a-z0-9]+$/`。
    // ⚠️ 那是**名單只有 w3x 匯入英雄**那個年代寫的 —— 今天名單上還有
    // `community-review-*`（第一批社群 37）·`b2-*`（第二批 37）·`lol-*`（7）。
    // ⇒ ⛔ 它紅不是因為名單壞了，是因為**前提消失**（世界長大了，而這一行沒跟上）。
    //
    // ⭐ 這一條要問的是「**id 形狀合法**」（⛔ 不是「它屬於哪一批」）：
    //   小寫開頭 · 只有小寫字母/數字/連字號 · ⛔ 不含空白、底線、大寫、路徑分隔符。
    // ⇒ 一個手滑貼進 `"Godie E00S"` 或 `"../x"` 仍然會紅。
    for (const id of ids) expect(id, `${id} 不是合法的英雄 id 形狀`).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it("throws when the block is gone, rather than returning an empty roster", () => {
    expect(() => goStringSlice("package curation\n", "starterChampions")).toThrow(
      /no longer declares/,
    );
    expect(() => readStarterRoster("/nonexistent-root")).toThrow(/cannot read the tracked/);
  });

  it("drops `//` annotations so prose quotes cannot leak in as ids", () => {
    const src = 'x = []string{\n\t"godie-a", // kept the "real" one\n\t"godie-b",\n\t}\n';
    expect(goStringSlice(src, "x")).toEqual(["godie-a", "godie-b"]);
  });
});

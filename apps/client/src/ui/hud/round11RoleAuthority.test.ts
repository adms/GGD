/**
 * ⭐⭐ 換邊／旁觀身分改用**伺服器的權威答案**（GH#922）。
 *
 * ⛔⛔ 在這之前客戶端只能**推**，而推導有一個記錄在案的洞：
 * `A 死 → B 用復活圈救 A → B 之後才死` ⇒ 兩格都 `roundDeaths > 0`
 * 而 A 活著 ⇒ ⛔ **A 被誤報成王**。
 *
 * ⭐ 根因：換邊在快照上**與復活長得一模一樣** ——
 * `convertWipedTeamsToBosses()` 重用同一個 `entityId` 並把 `hp.alive` 設回 true。
 * ⇒ ⭐ 位元層級無法區分，⛔ 所以再聰明的推導都關不掉這個洞。
 */
import { describe, it, expect } from "vitest";
import { round11SelfRole } from "./round11Model";

const base = {
  active: true,
  deadPlayersControlBoss: true,
  alive: true,
  roundDeaths: 0,
  teamAllDiedThisRound: false,
};

describe("⭐ 權威答案贏過推導（GH#922）", () => {
  it("⭐⭐ 送 `boss` ⇒ 就是 boss（⛔ 即使推導會說 champion）", () => {
    expect(round11SelfRole({ ...base, wireRole: "boss" })).toBe("boss");
  });

  it("⭐⭐ 那個**記錄在案的洞**被關掉了 —— A 被復活圈救回來，⛔ 不再被誤報成王", () => {
    // ⚠️ A 死過（roundDeaths > 0）、全隊都死過、而 A 現在活著（被圈救回來）
    //   ⇒ ⭐ 舊的推導會回 "boss"，⛔ 而 A 其實是活著的英雄。
    const derived = round11SelfRole({
      ...base,
      alive: true,
      roundDeaths: 1,
      teamAllDiedThisRound: true,
    });
    expect(derived, "⭐ 先證明那個洞真的存在（⛔ 不是我編的）").toBe("boss");
    // ⭐ 而伺服器知道真相：
    const authoritative = round11SelfRole({
      ...base,
      alive: true,
      roundDeaths: 1,
      teamAllDiedThisRound: true,
      wireRole: "champion",
    });
    expect(authoritative, "⭐ 權威答案把它修正回來").toBe("champion");
  });

  it("⭐ 送 `spectator` ⇒ 旁觀（⛔ 即使 `alive` 是 true）", () => {
    expect(round11SelfRole({ ...base, alive: true, wireRole: "spectator" })).toBe("spectator");
  });

  it("⛔ 空字串／缺席 ⇒ **退回推導**（⭐ 舊伺服器相容）", () => {
    expect(round11SelfRole({ ...base, alive: false, wireRole: "" })).toBe("spectator");
    expect(round11SelfRole({ ...base, alive: false })).toBe("spectator");
  });

  it("⛔ 認不得的值 ⇒ **退回推導**，⛔ 不是原樣照用", () => {
    // ⚠️ ⭐ 一個新版伺服器送來的新字串,⛔ 不可以讓舊客戶端顯示一個它不認得的身分。
    expect(round11SelfRole({ ...base, alive: false, wireRole: "wat" })).toBe("spectator");
  });
});

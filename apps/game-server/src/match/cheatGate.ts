/**
 * Cheat hard-gate — the ONLY predicate that decides whether MSG.CHEAT is
 * honored. Pure so it unit-tests without a Colyseus room.
 *
 * TWO ways in, and they are different questions:
 *
 *   1. **dev 模式** —— no platform shared secret (the same gate that lets clients
 *      joinOrCreate directly) and the devCheats flag on (default ON in dev; set
 *      GGD_DEV_CHEATS=0 to disable). A configured PLATFORM_GAME_SHARED_SECRET
 *      (i.e. production / platform-brokered matches) closes this one outright.
 *
 *   2. **練習房**（GH#343，owner 2026-08-17「可以使用各種功能測試碼」）—— a
 *      practice room is a SINGLE-PLAYER SANDBOX: no enemy team, no settlement,
 *      ⛔ 不發水晶、⛔ 不動 MMR、⛔ 不寫任何玩家資料. Because it touches neither
 *      the economy nor the ladder, opening cheats inside one is not an exploit:
 *      there is nothing on the other side of the cheat to take. This is the path
 *      that makes the feature real ON https://ggd.adms.ai/ — where a shared
 *      secret is always configured and path 1 is therefore always shut.
 *
 * ⚠️ `practiceRoom` MUST be the room's own SERVER-RESOLVED identity — the value
 * `resolvePracticeRules()` computed in `onCreate` from the (createToken-verified)
 * room options plus `config.practice@1`. ⛔ 它不可以是 CheatMessage 上的一個旗標：
 * 客戶端說自己是練習房不算數，那等於把整個閘交給要被擋的那一方。The client's
 * "I'm offline" claim was never consulted for the same reason and still isn't.
 *
 * GGD_DEV_CHEATS=0 now shuts BOTH doors, so an operator keeps one kill switch
 * over the whole cheat channel. (In production path 1 was already false, so this
 * is a strict superset of the old behaviour with exactly one new opening.)
 */
export function cheatsEnabled(
  sharedSecret: string,
  devCheatsEnv: string | undefined,
  practiceRoom = false,
): boolean {
  if (devCheatsEnv === "0") return false; // operator kill switch — both doors
  if (practiceRoom) return true; // 練習房：沙盒本身就是它存在的理由
  return !sharedSecret; // dev mode only; prod (secret set) stays shut
}

/**
 * ⭐ 「這台 shard 在跑哪一版」—— GH#949。
 *
 * ⛔⛔ **它在正式站上一直是 `"dev"`，而那不只是一欄難看的字。**
 *
 * `buildStamp()`（`./replay/fingerprint.ts`）是三階：
 * ① `GGD_BUILD_STAMP` → ② `.git/HEAD` 的短 sha → ③ `"dev"`。
 * 而正式站**前兩階必然落空**：容器裡沒有 checkout（②），
 * 而部署腳本只在 `docker compose build` 那一行給了 stamp、
 * `up -d` 那一行**沒有**（①）—— ⭐ 於是每一場比賽都是第 ③ 階。
 *
 * ⚠️ **代價是一條靜默死掉的柵欄**：同一顆值寫進每一份錄影的 header
 * （`./replay/headerCodec.ts`），而 `./replay/Player.ts` 拿它比對 ——
 * ⇒ 兩份都是 `"dev"` ⇒ **任兩份永遠判「相同版本」**，
 * 而診斷會逐字說「所以問題不是版本落差」⇒ ⭐ **把查的人往錯的方向帶**。
 *
 * ⭐ 所以這一格存在的理由與 `replay.writable` / `contentCache` 同一條
 * （CLAUDE.md：**fail-open 沒錯，靜默才是缺陷**）：
 * 退回 `"dev"` 是對的設計（本機開發不該被版本戳擋住），
 * ⛔ 但「它退回了」必須有人說得出來，而在此之前 `/healthz` 一個字都沒提。
 */
import { buildStamp } from "./replay/fingerprint";

export interface BuildHealthSnapshot {
  /** 這個行程認定的建置編號 —— ⭐ 就是寫進錄影 header 的那一顆。 */
  readonly stamp: string;
  /**
   * ⭐ **真的被戳記了嗎。** `false` ＝ 落到 `"dev"` 回退
   * ⇒ 錄影的版本柵欄在這台上是**關著的**（任兩份都會判相同版本）。
   */
  readonly stamped: boolean;
  /** 哪一階給的答案 —— ⭐ 直接指出要修哪裡，⛔ 不必去猜。 */
  readonly source: "env" | "git-head" | "fallback";
  /** ⭐ 未戳記時的一句人話，⛔ 不是 undefined。 */
  readonly note: string | null;
}

/**
 * ⭐ 出貨的判準：**光禿禿的 `"dev"` 就是回退**。
 *
 * ⚠️ ⛔ 不要寫成 `stamp.startsWith("dev")` —— `apps/game-server/src/stats/damageBoard.ts`
 * 曾經有一句註解宣稱 dev 是「`dev-<pid>` 那一族」，⭐ 而那是假的：
 * `dev-xxxxxxxx` 是 `matchId`／`accountId`，**跟建置編號完全無關**。
 * 一個寬鬆的前綴判斷會把某天真的叫 `dev-2` 的版本也判成未戳記。
 */
const FALLBACK_STAMP = "dev";

/**
 * ⭐ **純函式，⛔ 而且它就是出貨路徑在用的那一個。**
 *
 * ⚠️ 為什麼要抽出來：`buildStamp()` 在**開發機上必然有答案**（repo 有 `.git`）
 * ⇒ 一支只呼叫 `buildHealth()` 的測試**永遠跑不到回退那一支**
 * ⇒ ⭐ 那正是 CLAUDE.md 的失敗形態⑩（守衛是靠環境才綠的）與
 *   「一把只驗過單邊的尺不算自證過」。
 * ⇒ 把判斷抽成純函式之後，測試可以驗**兩個方向**，
 *   ⛔ 而且它驗的仍然是伺服器真的會跑的那幾行（⛔ 不是一份夾具）。
 */
export function classifyBuildStamp(stamp: string, fromEnv: string): BuildHealthSnapshot {
  const stamped = stamp !== FALLBACK_STAMP;
  const source: BuildHealthSnapshot["source"] = !stamped
    ? "fallback"
    : fromEnv.trim() === stamp
      ? "env"
      : "git-head";
  return {
    stamp,
    stamped,
    source,
    note: stamped
      ? null
      : "⛔ 這台沒有建置編號（GGD_BUILD_STAMP 未帶進 `up`，容器裡也沒有 .git）" +
        " ⇒ ⭐ 錄影的版本柵欄在這台上是**關著的**：任兩份錄影都會被判成同一版。",
  };
}

export function buildHealth(): BuildHealthSnapshot {
  return classifyBuildStamp(buildStamp(), process.env.GGD_BUILD_STAMP ?? "");
}

/**
 * ⭐ 未戳記時 `/healthz` 要不要判 unhealthy —— **一格旋鈕，出貨預設 `warn`**。
 *
 * ⛔ 預設刻意**不擋**：照 `GGD_REPLAY_HEALTHZ_STATUS` 的前例（那一格的註解逐字
 * 警告「503 here can let a liveness probe kill a live shard」）——
 * 一個沒有版本戳的 shard 仍然可以好好地服務十二個家人打完一場，
 * ⭐ 而**部署不可以被一格徽章卡死**。
 *
 * ⭐ 但 body 永遠說實話（`stamped: false` 一直在那裡），
 * 所以打開這一格只是把「已經看得到的事」升級成探針看得到。
 */
export function buildStampGateMode(): "warn" | "unhealthy" {
  return (process.env.GGD_BUILD_STAMP_HEALTHZ ?? "").trim() === "unhealthy"
    ? "unhealthy"
    : "warn";
}

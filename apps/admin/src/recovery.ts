/**
 * 忘記密碼 / 無法登入 — the operator-recovery GUIDANCE shown on the login screen.
 *
 * THIS MODULE IS TEXT. It has no imports, calls nothing, and names no endpoint,
 * and recovery.test.ts enforces all three by reading this file's own source.
 * That is the whole design, not an implementation detail:
 *
 * The console is served by a vite server bound to 127.0.0.1, but the PLATFORM it
 * talks to is not. `apps/client` publishes a vite dev server on the LAN
 * (`--host 0.0.0.0`, so a phone on the wifi can play), and that server proxies
 * /api straight through to the platform — which means every remote client
 * already arrives at the platform as 127.0.0.1. Any "you're on localhost, here's
 * a reset button" mechanism would therefore be reachable by every device on the
 * network, and would hand out the ADMINISTRATOR's password. The Go side refuses
 * to grow one (internal/server/devsurface_test.go bans address-based trust
 * outright), so the console must not pretend to have one either.
 *
 * What actually authorises a reset is a shell on the machine that holds
 * DATA_DIR — proof of host access, the same currency GGD_OWNER_BOOTSTRAP_TOKEN
 * trades in. A browser cannot supply that, so the honest thing for the login
 * screen to show is the exact command to run and where to run it. A form here
 * would either be a lie or a hole.
 *
 * Keep every string here in Traditional Chinese with an English echo, matching
 * the rest of the console.
 */

/** The Go command that performs the reset, and its two companions. */
export const RECOVERY_COMMANDS = {
  /** Who are this deploy's administrators? (changes nothing) */
  list: "go -C apps/platform run ./cmd/ownerreset -list",
  /** Reset, choosing the new password at a no-echo prompt. */
  reset: "go -C apps/platform run ./cmd/ownerreset -username <你的帳號>",
  /** Reset with a machine-generated password, printed once. */
  generate: "go -C apps/platform run ./cmd/ownerreset -username <你的帳號> -generate",
} as const;

/** One numbered step of the recovery runbook. */
export interface RecoveryStep {
  /** Short imperative heading (zh + en). */
  readonly heading: string;
  /** The explanation under it. */
  readonly body: string;
  /** The shell command to run, if this step has one. */
  readonly command?: string;
}

export const RECOVERY_TITLE = "忘記密碼 / 無法登入";

export const RECOVERY_SUBTITLE =
  "重設管理員密碼要在「跑平台的那台機器」上用終端機執行，網頁上沒有、也不會有這個按鈕。";

/**
 * WHY there is no button. Shown in full — an operator who does not understand
 * the reason will keep looking for the button, or ask someone to add one.
 */
export const RECOVERY_WHY =
  "唯一能證明「你就是這台機器的擁有者」的憑據，是你能在這台機器上開終端機。" +
  "不能用「從 127.0.0.1 連進來」判斷：遊戲用的 vite 伺服器會把手機的連線代理進平台，" +
  "平台看到的來源全都是 127.0.0.1 —— 那等於把管理員密碼開放給同一個 Wi-Fi 上的任何裝置。" +
  "（English: host access is the credential. A loopback check would be inverted here — the " +
  "LAN dev proxy makes every phone on the wifi look like 127.0.0.1 to the platform.）";

export const RECOVERY_STEPS: readonly RecoveryStep[] = [
  {
    heading: "1. 到跑平台的那台機器，開終端機 / open a terminal on the host",
    body:
      "必須是實際執行 GGD 平台的那台電腦（不是手機、不是別台機器）。切換到 GGD 專案根目錄。" +
      "English: on the machine actually running the platform, cd to the GGD repo root.",
  },
  {
    heading: "2. 確認管理員帳號名稱 / confirm the administrator's username",
    body:
      "忘記密碼時通常也忘了當初用哪個帳號。這個指令只會列出管理員，不會更動任何東西。" +
      "English: lists the administrators; changes nothing.",
    command: RECOVERY_COMMANDS.list,
  },
  {
    heading: "3. 重設密碼 / reset the password",
    body:
      "把 <你的帳號> 換成上一步看到的名稱。它會要你輸入兩次新密碼，輸入時螢幕不會顯示 —— " +
      "密碼絕不會出現在指令列，因為那會被存進 shell 歷史紀錄、也會被 ps 看到。" +
      "English: prompts twice with the echo off; there is no flag that takes a password.",
    command: RECOVERY_COMMANDS.reset,
  },
  {
    heading: "3b.（可選）改由系統產生強密碼 / or have one generated",
    body:
      "不想自己想密碼、或在沒有終端機互動的環境下，加 -generate：它會產生一組強密碼並只顯示這一次。" +
      "登入後請馬上用左下角的「變更密碼」改成你自己的。" +
      "English: prints a strong password once; change it in the console right after signing in.",
    command: RECOVERY_COMMANDS.generate,
  },
  {
    heading: "4. 回到這個畫面登入 / come back here and sign in",
    body:
      "平台不需要重新啟動，新密碼立刻生效。該帳號在其他裝置上的登入會全部失效（避免被偷走的工作階段活過這次重設），" +
      "帳號若被停權或卡在待審核也會一併解除。這次重設會寫進後台的 Audit log。" +
      "English: no restart needed; every other session of that account is revoked, a ban/pending state is cleared, " +
      "and the reset is recorded in the audit log.",
  },
];

/**
 * The environment caveat, kept separate because it is the single most common
 * way the command "works" and yet appears to do nothing: DATA_DIR defaults to a
 * RELATIVE path, so a platform started with a custom DATA_DIR (as
 * .claude/launch.json does) has its accounts somewhere else entirely, and the
 * command run without it would open an empty store beside the real one.
 */
export const RECOVERY_ENV_NOTE =
  "如果平台是用自訂的 DATA_DIR 啟動的，指令前面要加上同一個 DATA_DIR，否則會開到另一個（空的）資料夾。" +
  "指令啟動時會印出它實際使用的 DATA_DIR，對一下就知道有沒有搞錯。" +
  "English: pass the SAME DATA_DIR the platform runs with; the command prints the one it opened.";

/**
 * Last resort, unchanged from before this feature existed: it grants the role
 * and clears a ban, but it CANNOT change a password — which is exactly the gap
 * cmd/ownerreset closes. Stated so nobody reaches for it expecting a reset.
 */
export const RECOVERY_LAST_RESORT =
  "註：ADMIN_BOOTSTRAP_USERNAME=<帳號> + 重啟平台 只能把某個「已註冊」的帳號變成可用的管理員，" +
  "不會、也不能重設密碼。密碼要用上面的指令。" +
  "English: ADMIN_BOOTSTRAP_USERNAME grants the role, it never changes a credential.";

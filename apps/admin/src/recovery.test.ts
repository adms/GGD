/**
 * adminui-login-recovery — the 忘記密碼 / 無法登入 affordance on the login screen.
 *
 * There are two halves to this, and the second one is the important one:
 *
 *   A. the guidance is CORRECT and complete enough to act on — it names the
 *      command, the machine to run it on, and the DATA_DIR trap that otherwise
 *      makes a successful command look like a no-op;
 *   B. the guidance is ONLY guidance. It exposes no endpoint, performs no
 *      request, and takes no input. A reset reachable from a browser would be
 *      reachable from every phone on the wifi (the LAN dev proxy makes them all
 *      look like 127.0.0.1 to the platform), so this half is asserted against
 *      the module's own SOURCE rather than against its exports — a future
 *      "helpful" fetch() would slip past any test that only read the strings.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cover } from "@ggd/shared/testkit/cover";
import {
  RECOVERY_COMMANDS,
  RECOVERY_ENV_NOTE,
  RECOVERY_LAST_RESORT,
  RECOVERY_STEPS,
  RECOVERY_SUBTITLE,
  RECOVERY_TITLE,
  RECOVERY_WHY,
} from "./recovery";

const recoverySource = (): string =>
  readFileSync(fileURLToPath(new URL("./recovery.ts", import.meta.url)), "utf8");

const loginScreenSource = (): string =>
  readFileSync(fileURLToPath(new URL("./ui/LoginScreen.tsx", import.meta.url)), "utf8");

const allCommands = Object.values(RECOVERY_COMMANDS);
const allText = [
  RECOVERY_TITLE,
  RECOVERY_SUBTITLE,
  RECOVERY_WHY,
  RECOVERY_ENV_NOTE,
  RECOVERY_LAST_RESORT,
  ...RECOVERY_STEPS.flatMap((s) => [s.heading, s.body, s.command ?? ""]),
].join("\n");

// ---------------------------------------------------------------------------
// A. the guidance is actionable
// ---------------------------------------------------------------------------

describe("A: the recovery guidance is actionable", () => {
  it("every command invokes the host-side reset command and nothing else", () => {
    cover("adminui-login-recovery");
    expect(allCommands.length).toBeGreaterThan(0);
    for (const cmd of allCommands) {
      expect(cmd, cmd).toContain("./cmd/ownerreset");
      expect(cmd, cmd).toMatch(/^go -C apps\/platform run /);
    }
  });

  it("no command carries a password — argv is world-readable and lands in shell history", () => {
    cover("adminui-login-recovery");
    for (const cmd of allCommands) {
      expect(cmd, cmd).not.toMatch(/-{1,2}(password|passwd|pw|secret)\b/i);
    }
    // …and the same must hold for every rendered string, so a copy-pasteable
    // example cannot reintroduce it in prose.
    expect(allText).not.toMatch(/-{1,2}(password|passwd|pw|secret)[= ]\S/i);
  });

  it("names the reset step, the who-am-I step and the generate variant", () => {
    cover("adminui-login-recovery");
    expect(RECOVERY_COMMANDS.list).toContain("-list");
    expect(RECOVERY_COMMANDS.reset).toContain("-username");
    expect(RECOVERY_COMMANDS.generate).toContain("-generate");
    expect(RECOVERY_STEPS.length).toBeGreaterThanOrEqual(4);
    for (const step of RECOVERY_STEPS) {
      expect(step.heading.trim()).not.toBe("");
      expect(step.body.trim()).not.toBe("");
    }
    // at least one step actually carries a command to run
    expect(RECOVERY_STEPS.filter((s) => s.command !== undefined).length).toBeGreaterThanOrEqual(2);
  });

  it("says WHERE to run it, and warns about the DATA_DIR that makes it look like a no-op", () => {
    cover("adminui-login-recovery");
    expect(allText).toContain("終端機"); // "a terminal", i.e. on the host
    expect(RECOVERY_ENV_NOTE).toContain("DATA_DIR");
  });

  it("states that the old escape hatch cannot reset a password", () => {
    cover("adminui-login-recovery");
    // Reaching for ADMIN_BOOTSTRAP_USERNAME expecting a password change is the
    // exact wrong turn this feature exists to end.
    expect(RECOVERY_LAST_RESORT).toContain("ADMIN_BOOTSTRAP_USERNAME");
    expect(RECOVERY_LAST_RESORT).toContain("不會");
  });

  it("is written in Traditional Chinese, as the owner asked", () => {
    cover("adminui-login-recovery");
    expect(RECOVERY_TITLE).toContain("忘記密碼");
    expect(RECOVERY_TITLE).toContain("無法登入");
    // Simplified-only forms that would mean the copy was machine-converted.
    for (const bad of ["帐号", "密码", "无法", "后台", "执行"]) {
      expect(allText, bad).not.toContain(bad);
    }
  });
});

// ---------------------------------------------------------------------------
// B. it is guidance, never a mechanism
// ---------------------------------------------------------------------------

describe("B: the console exposes no reset mechanism", () => {
  it("the module makes no request and imports nothing", () => {
    cover("adminui-login-recovery");
    const src = recoverySource();
    for (const forbidden of ["fetch(", "XMLHttpRequest", "axios", "WebSocket", "navigator."]) {
      expect(src, forbidden).not.toContain(forbidden);
    }
    // No imports at all: it cannot reach the API client, the session store, or
    // anything that could grow into a call.
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/\brequire\(/);
  });

  it("the module names no API path — there is no endpoint to find", () => {
    cover("adminui-login-recovery");
    const src = recoverySource();
    expect(src).not.toContain("/api/v1");
    expect(src).not.toMatch(/["'`]\/api\//);
    // and specifically nothing reset-shaped on the platform
    expect(src).not.toMatch(/\/(auth|admin|account)\/[a-z-]*reset/i);
  });

  it("the login screen renders the guidance without a reset call or a new input", () => {
    cover("adminui-login-recovery");
    const src = loginScreenSource();
    // it really does show the affordance …
    expect(src).toContain("RECOVERY_TITLE");
    expect(src).toContain("./recovery");
    // … and does not smuggle in a reset request or a field to type a token into
    expect(src).not.toContain("fetch(");
    expect(src).not.toMatch(/reset\s*\(/i);
    expect(src).not.toMatch(/bootstrapToken/i);
  });
});

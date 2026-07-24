import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "../../..");

/**
 * public-endpoint-not-loopback — the guard for the defect that made EVERY remote
 * match bounce the instant you pressed 一鍵開打.
 *
 * `GAME_PUBLIC_ENDPOINT` is the address the PLAYER'S BROWSER is told to connect
 * to: the game server puts it in the /_internal/matches response, the platform
 * forwards it as `match_ready.endpoint`, and the client feeds it to
 * `new Client(...)`. Unset, index.ts defaults it to `ws://localhost:${PORT}` —
 * so every family member's browser opened a socket to their OWN machine, found
 * nothing listening, and failed immediately.
 *
 * Why nothing caught it:
 *   • On the owner's machine localhost:2567 IS the game server, so playing
 *     locally worked perfectly, every time.
 *   • No test connects from a remote browser, so no test could see it.
 *   • The symptom reads as a game bug ("按了沒反應"), not as a missing env var.
 *
 * Two independent guards, because either alone is escapable: the runtime one in
 * index.ts refuses to boot a non-dev tier on a loopback endpoint, and this one
 * pins that the shipping compose file actually sets a public value.
 */
describe("the browser is told a reachable endpoint (public-endpoint-not-loopback)", () => {
  it("the family deploy sets GAME_PUBLIC_ENDPOINT to a public wss:// route", () => {
    const compose = readFileSync(join(ROOT, "docker/compose.family.yaml"), "utf8");
    const m = /GAME_PUBLIC_ENDPOINT:\s*"([^"]+)"/.exec(compose);
    expect(
      m,
      "docker/compose.family.yaml must set GAME_PUBLIC_ENDPOINT — without it index.ts hands every " +
        "browser ws://localhost:2567 and every remote join fails instantly",
    ).not.toBeNull();
    const url = m![1]!;
    expect(url, `${url} must be wss:// — the site is served over https`).toMatch(/^wss:\/\//);
    expect(url, `${url} points at loopback; that is the bug this guard exists for`).not.toMatch(
      /^wss?:\/\/(localhost|127\.|\[?::1)/i,
    );
  });

  it("index.ts refuses to boot a non-dev tier on a loopback endpoint", () => {
    const src = readFileSync(join(HERE, "index.ts"), "utf8");
    // The runtime guard must be FATAL, not a warning. A warning joins a dozen
    // other boot lines and is read by nobody — which is how this shipped.
    expect(src, "the loopback guard must exit(1), not merely warn").toMatch(
      /GAME_PUBLIC_ENDPOINT is[\s\S]{0,900}?process\.exit\(1\)/,
    );
    expect(src).toMatch(/GGD_DEPLOY_TIER/);
  });
});

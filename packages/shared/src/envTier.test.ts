import { describe, expect, it } from "vitest";

import { cover } from "../testkit/cover";
import {
  classifyEnvTier,
  isPublicPeer,
  mayServeRestrictedContent,
  type EnvTier,
} from "./envTier";

// One table drives the whole classifier: [input peer address/host, expected tier].
// If the vite middleware and the nginx `geo` block ever disagree with this, the
// copyright gate has a hole — this is the single source of truth for the rule.
const CASES: ReadonlyArray<[string | undefined | null, EnvTier]> = [
  // ---- loopback -----------------------------------------------------------
  ["127.0.0.1", "loopback"],
  ["127.0.0.53", "loopback"],
  ["127.255.255.255", "loopback"],
  ["::1", "loopback"],
  ["0:0:0:0:0:0:0:1", "loopback"],
  ["[::1]", "loopback"],
  ["[::1]:39527", "loopback"],
  ["::ffff:127.0.0.1", "loopback"], // IPv4-mapped IPv6 loopback
  ["localhost", "loopback"],
  ["LOCALHOST", "loopback"], // case-insensitive
  ["ip6-localhost", "loopback"],
  ["localhost.localdomain", "loopback"],
  ["foo.localhost", "loopback"], // RFC 6761 reserved suffix
  ["127.0.0.1:8080", "loopback"], // bare host:port

  // ---- lan (private / link-local — a phone on the wifi MUST be served) -----
  ["10.0.0.1", "lan"],
  ["10.255.255.254", "lan"],
  ["172.16.0.1", "lan"],
  ["172.20.10.5", "lan"], // iPhone personal-hotspot range
  ["172.31.255.255", "lan"],
  ["192.168.0.106", "lan"], // the documented client-lan phone-test address
  ["192.168.1.42:39527", "lan"],
  ["169.254.13.37", "lan"], // link-local
  ["::ffff:192.168.0.106", "lan"], // IPv4-mapped private
  ["fd00::1", "lan"], // IPv6 ULA
  ["fc00::abcd", "lan"],
  ["fe80::1%en0", "lan"], // IPv6 link-local with a zone id
  ["macbook.local", "lan"], // mDNS
  ["someones-iphone.local:39527", "lan"],

  // ---- public (genuinely outward-facing ⇒ DENY) ---------------------------
  ["203.0.113.7", "public"], // TEST-NET-3, a routable address
  ["8.8.8.8", "public"],
  ["172.15.0.1", "public"], // just BELOW the 172.16/12 private block
  ["172.32.0.1", "public"], // just ABOVE it
  ["192.169.0.1", "public"], // not 192.168
  ["169.253.0.1", "public"], // not 169.254
  ["2606:4700:4700::1111", "public"], // Cloudflare — a global IPv6
  ["play.example.com", "public"], // a real hostname
  ["0.0.0.0", "public"], // unspecified / bind-all is not a private client
  ["255.255.255.255", "public"],
  ["not-an-address", "public"],
  ["", "public"], // fail-safe
  [undefined, "public"], // fail-safe
  [null, "public"], // fail-safe
  ["   ", "public"], // whitespace only
];

describe("classifyEnvTier", () => {
  cover("copyright-env-tier");

  it.each(CASES)("classifies %j as %s", (input, expected) => {
    expect(classifyEnvTier(input)).toBe(expected);
  });

  it("mayServeRestrictedContent allows loopback + lan and denies public", () => {
    expect(mayServeRestrictedContent("loopback")).toBe(true);
    expect(mayServeRestrictedContent("lan")).toBe(true);
    expect(mayServeRestrictedContent("public")).toBe(false);
  });

  it("isPublicPeer is the negation of the serve decision", () => {
    for (const [input] of CASES) {
      const tier = classifyEnvTier(input);
      expect(isPublicPeer(input)).toBe(!mayServeRestrictedContent(tier));
    }
  });

  it("a phone on the wifi is served; the open internet is refused", () => {
    // the exact decision both serving layers make, pinned end-to-end
    const serve = (peer: string) => mayServeRestrictedContent(classifyEnvTier(peer));
    expect(serve("192.168.0.106")).toBe(true); // LAN phone
    expect(serve("127.0.0.1")).toBe(true); // this machine
    expect(serve("203.0.113.7")).toBe(false); // a public host
  });
});

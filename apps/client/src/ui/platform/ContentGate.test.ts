/**
 * login-speed-boot (content readiness gate): the app shell must paint WITHOUT
 * waiting on the content load, and only the match transition holds until the
 * registries are populated. Client vitest runs in the `node` environment (no
 * DOM), so components are proven by server-rendering them to static markup —
 * the same node-only approach the shop/icon tests use.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { cover } from "@ggd/shared/testkit/cover";
import { HttpContentSource } from "@ggd/shared/content";
import { ensureContentLoaded, __resetContentBoot } from "../../content/bootContent";
import { MatchContentGate, useContentReady } from "./ContentGate";

/** fetch-like that 404s everything → ContentLoader throws → skeleton fallback,
 *  which still flips the readiness signal to ready (the registry is usable). */
const notFound = (() =>
  Promise.resolve({ ok: false, status: 404, json: async () => ({}) })) as unknown as typeof fetch;

/** Probe: renders the readiness hook's value so it can be asserted via SSR. */
function Probe(): React.JSX.Element {
  return createElement("span", null, useContentReady() ? "ready" : "loading");
}

beforeEach(() => {
  __resetContentBoot();
});

describe("content readiness gate (login-speed boot)", () => {
  it("MatchContentGate renders a lightweight placeholder with no content loaded", () => {
    cover("client-content-boot");
    // The gate paints purely from theme constants — it needs no registry, so it
    // can never throw on an empty/partly-loaded content set.
    const html = renderToStaticMarkup(createElement(MatchContentGate));
    expect(html).toContain("載入中");
    expect(html).toContain("match-content-gate");
  });

  it("useContentReady is false until the background load settles, then true", async () => {
    cover("client-content-boot");
    // Shell paints while content is still loading — the readiness hook returns
    // false and the component renders (no throw, no await-gate on first paint).
    expect(renderToStaticMarkup(createElement(Probe))).toContain(">loading<");

    const p = ensureContentLoaded({
      source: new HttpContentSource({ baseUrl: "/content", fetchFn: notFound }),
    });
    // Fire-and-track: kicking the load off does not synchronously flip readiness.
    expect(renderToStaticMarkup(createElement(Probe))).toContain(">loading<");

    await p;
    // Once the load settles the match transition may proceed.
    expect(renderToStaticMarkup(createElement(Probe))).toContain(">ready<");
  });
});

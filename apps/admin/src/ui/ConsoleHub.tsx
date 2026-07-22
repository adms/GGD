/**
 * Console Hub — the "收編所有網址" home page: a card per GGD surface with a live
 * health ping (🟢/🔴). URLs resolve from Vite env (dev defaults / PROD preset);
 * pings run on mount and on a refresh interval.
 */
import { useEffect, useMemo, useState } from "react";
import { resolveHubLinks, type HubEnv, type HubLink } from "../config";
import { applyPingResults, initHealth, pingOnce, startChecking, type HealthState } from "../health";
import { Btn, Panel, StatusDot } from "./widgets";
import { PANEL_BG, PANEL_BORDER, TEXT_DIM, TEXT_MAIN } from "./theme";

function readEnv(): { env: HubEnv; mode: "dev" | "prod" } {
  const raw = (import.meta as unknown as { env: Record<string, string | undefined> }).env ?? {};
  return { env: raw, mode: raw.PROD ? "prod" : "dev" };
}

export function ConsoleHub(): React.JSX.Element {
  const { links, initialKeys } = useMemo(() => {
    const { env, mode } = readEnv();
    const l = resolveHubLinks(env, mode);
    return { links: l, initialKeys: l.map((x) => x.key) };
  }, []);
  const [health, setHealth] = useState<HealthState>(() => initHealth(initialKeys));

  async function pingAll(): Promise<void> {
    const pingable = links.filter((l) => l.healthUrl);
    setHealth((h) => {
      let next = h;
      for (const l of pingable) next = startChecking(next, l.key);
      return next;
    });
    const results = await Promise.all(
      pingable.map(async (l) => [l.key, await pingOnce(l.healthUrl as string)] as const),
    );
    setHealth((h) => applyPingResults(h, Object.fromEntries(results)));
  }

  useEffect(() => {
    void pingAll();
    const timer = setInterval(() => void pingAll(), 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Panel
      title="控制台 · Console Hub"
      right={
        <Btn small onClick={() => void pingAll()}>
          Re-check
        </Btn>
      }
    >
      <div style={{ fontSize: 12, color: TEXT_DIM, marginBottom: 14 }}>
        Every GGD surface in one place. 🟢 up · 🔴 down · 🟡 checking. URLs are configurable via VITE_* env.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
        {links.map((l) => (
          <HubCard key={l.key} link={l} status={health[l.key] ?? "unknown"} />
        ))}
      </div>
    </Panel>
  );
}

function HubCard(props: { link: HubLink; status: string }): React.JSX.Element {
  const { link, status } = props;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        background: PANEL_BG,
        border: PANEL_BORDER,
        borderRadius: 10,
        padding: 14,
        textDecoration: "none",
        color: TEXT_MAIN,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 22 }}>{link.emoji}</span>
        {link.healthUrl ? <StatusDot status={status} /> : <span style={{ fontSize: 11, color: TEXT_DIM }}>—</span>}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{link.label}</div>
      <div style={{ fontSize: 11, color: TEXT_DIM, marginTop: 2 }}>{link.sub}</div>
      <div style={{ fontSize: 10, color: TEXT_DIM, marginTop: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {link.url}
      </div>
    </a>
  );
}

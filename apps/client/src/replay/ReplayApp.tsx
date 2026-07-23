/**
 * ReplayApp (task #175) — the self-contained replay viewer entry.
 *
 * WHY A DEDICATED ENTRY, AND HOW IT REUSES THE RENDERER. A replay is watched
 * from a link the admin console hands the owner (`#replay=<id>&ticket=<t>`), not
 * from inside the normal login→lobby→match flow, so it boots on its own here
 * rather than adding a screen mode to the contended platform reducer. But it
 * does NOT build a second renderer: it constructs the ordinary `GameApp`, points
 * it at the "replay" room (which speaks the same MatchState schema as a live
 * match), and mounts only the transport-control overlay on top. Everything the
 * owner sees — the arena, the champions, the HUD, the interpolation between
 * ticks — is the exact renderer his family played on.
 */
import { useEffect, useRef, useState } from "react";
import type { Room } from "colyseus.js";
import type { MatchState } from "@ggd/shared/protocol/schema";
import { GameApp } from "../GameApp";
import { ensureContentLoaded, isContentReady } from "../content/bootContent";
import { bindReplayRoom, ReplayControls } from "./ReplayControls";

/** Parse `#replay=<id>&ticket=<t>` from the URL. */
export function parseReplayHash(hash: string): { id: string; ticket: string } | null {
  const m = /(?:^#|&)replay=([^&]+)/.exec(hash);
  if (!m) return null;
  const t = /(?:^#|&)ticket=([^&]+)/.exec(hash);
  return { id: decodeURIComponent(m[1]!), ticket: t ? decodeURIComponent(t[1]!) : "" };
}

export function ReplayApp({ id, ticket }: { id: string; ticket: string }): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [room, setRoom] = useState<Room<MatchState> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let app: GameApp | null = null;
    let unbind: (() => void) | null = null;
    let disposed = false;

    void (async () => {
      if (!isContentReady()) await ensureContentLoaded();
      if (disposed || !canvasRef.current) return;
      app = new GameApp(canvasRef.current, { accountId: "replay-viewer" });
      app.start();
      try {
        const r = await app.connectReplay(id, ticket);
        if (disposed) return;
        unbind = bindReplayRoom(r);
        setRoom(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "無法連線到回放伺服器");
      }
    })();

    return () => {
      disposed = true;
      unbind?.();
      app?.dispose();
    };
  }, [id, ticket]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#05070c" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {error ? (
        <div
          role="alert"
          style={{
            position: "fixed",
            top: 16,
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(80,60,12,.96)",
            border: "1px solid #e0a13a",
            borderRadius: 10,
            padding: "12px 16px",
            color: "#fff",
          }}
        >
          {error}
        </div>
      ) : (
        <ReplayControls room={room} />
      )}
    </div>
  );
}

/**
 * ExUnlockToast — shows「EX 技能解鎖！」when the local champion's per-hero EX
 * skill unlocks. Keys off the SeatState.exRank 0→1 transition in the reliable
 * snapshot (the authoritative unlock signal — the sim also emits an `exUnlock`
 * event, but the snapshot transition is what the client can observe directly).
 */
import { useEffect, useRef, useState } from "react";
import { Abilities } from "@ggd/shared/sim/content/registry";
import type { AbilityId } from "@ggd/shared/ids";
import { useHud } from "../../net/RoomStore";

const SHOW_MS = 3200;

export function ExUnlockToast(): React.JSX.Element | null {
  const seat = useHud((s) =>
    s.localSeatId === null ? null : (s.seats.find((v) => v.seatId === s.localSeatId) ?? null),
  );
  const exRank = seat?.exRank ?? 0;
  const exAbilityId = seat?.exAbilityId ?? "";
  const prevRank = useRef(exRank);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prevRank.current <= 0 && exRank > 0) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), SHOW_MS);
      prevRank.current = exRank;
      return () => clearTimeout(t);
    }
    prevRank.current = exRank;
  }, [exRank]);

  if (!visible) return null;
  const exName = (exAbilityId && Abilities.tryGet(exAbilityId as AbilityId)?.name) || "";

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "26%",
        transform: "translateX(-50%)",
        padding: "10px 22px",
        borderRadius: 10,
        background: "rgba(30, 20, 6, 0.92)",
        border: "2px solid #f2a13c",
        boxShadow: "0 0 20px #f2a13c66",
        color: "#ffcf87",
        fontSize: 20,
        fontWeight: "bold",
        textAlign: "center",
        pointerEvents: "none",
        letterSpacing: 1,
      }}
    >
      EX 技能解鎖！
      {exName && <div style={{ fontSize: 13, color: "#f2a13c", marginTop: 3 }}>{exName}</div>}
    </div>
  );
}

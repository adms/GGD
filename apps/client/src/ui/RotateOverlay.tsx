/**
 * RotateOverlay — the game is landscape-only on touch devices; portrait shows
 * a full-screen "rotate your device" prompt. Orientation changes are discrete
 * events (resize/orientationchange), so plain React state is fine here.
 */
import { useEffect, useState } from "react";
import { isTouchDevice, readTouchEnv, shouldShowRotateOverlay } from "../input/mobileDetect";
import { TEXT_DIM, TEXT_MAIN } from "./theme";

function viewport(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export function RotateOverlay(): React.JSX.Element | null {
  const [size, setSize] = useState(viewport);

  useEffect(() => {
    const onChange = (): void => setSize(viewport());
    window.addEventListener("resize", onChange);
    window.addEventListener("orientationchange", onChange);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("orientationchange", onChange);
    };
  }, []);

  const touch = isTouchDevice(readTouchEnv());
  if (!shouldShowRotateOverlay({ touch, width: size.width, height: size.height })) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "#0b0e14",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        pointerEvents: "auto",
        color: TEXT_MAIN,
      }}
    >
      <div style={{ fontSize: 44, transform: "rotate(90deg)" }}>📱</div>
      <div style={{ fontSize: 17, fontWeight: "bold" }}>Rotate to landscape</div>
      <div style={{ fontSize: 12, color: TEXT_DIM }}>GGD plays sideways on phones</div>
    </div>
  );
}

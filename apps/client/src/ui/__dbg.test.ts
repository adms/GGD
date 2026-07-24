import { it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { hudStore, resetHudStore, useHud } from "../net/RoomStore";
import { useActiveHudPanels } from "./hud/useHudPanels";
import { useInputMode } from "./inputMode";
import { hudTouch } from "./hud/HudSlot";
it("dbg", () => {
  resetHudStore();
  hudStore.setState({ connected: true, phase: "combat", round: 1, localPlayers: [] });
  const Probe = (): React.JSX.Element => {
    const phase = useHud((s) => s.phase);
    const round = useHud((s) => s.round);
    const lp = useHud((s) => s.localPlayers.length);
    const panels = useActiveHudPanels();
    const mode = useInputMode();
    return createElement("i", null, `${phase}|${round}|${lp}|${panels.length}|${mode}|${hudTouch()}`);
  };
  console.log("probe:", renderToStaticMarkup(createElement(Probe)));
});

import { describe, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Console } from "./ui/App";
import { appStore, pageRequiresSession } from "./store";
describe("p", () => { it("d", () => {
  appStore.setState({ account: null, page: "players" });
  const s = appStore.getState();
  console.log("PAGE", s.page, "ACCOUNT", s.account, "REQ", pageRequiresSession("players"), "DEV", (s as never as {devDropIn:boolean}).devDropIn);
  const h = renderToString(createElement(Console));
  console.log("HAS_NEEDLOGIN", h.includes("Operator sign-in"), "HAS_PLAYERS", h.includes("玩家"), "FOOTERS", (h.match(/console-footer/g)??[]).length);
}); });

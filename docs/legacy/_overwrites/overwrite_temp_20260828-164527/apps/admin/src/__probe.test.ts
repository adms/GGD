import { describe, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Console } from "./ui/App";
import { appStore } from "./store";
describe("p", () => { it("d", () => {
  appStore.setState({ account: null, page: "players" });
  const h = renderToString(createElement(Console));
  const i = h.indexOf("console-footer");
  console.log("FOOTER_AT", i, "LEN", h.length);
  console.log("TAIL", h.slice(Math.max(0,i-700), i+200));
}); });

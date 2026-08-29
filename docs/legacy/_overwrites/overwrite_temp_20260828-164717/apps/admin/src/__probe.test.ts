import { describe, it } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { Console } from "./ui/App";
import { appStore } from "./store";
describe("p", () => { it("d", () => {
  appStore.setState({ account: null, page: "players" });
  const h = renderToString(createElement(Console));
  const i = h.indexOf('data-testid="content-pane"');
  console.log("MAIN_HEAD>>>", h.slice(i, i + 500));
}); });

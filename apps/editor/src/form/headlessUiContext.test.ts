import { expect, it } from "vitest";
import { createElement } from "react";
import { hookImpls, mount } from "../../../../packages/shared/testkit/headlessUi";

it("scopes nested context providers, propagates changed values and restores defaults", () => {
  const context = hookImpls.createContext("default");
  const Read = () => createElement("span", null, hookImpls.useContext(context));
  const Root = () => {
    const [value, setValue] = hookImpls.useState("outer");
    return createElement("div", null,
      createElement(context.Provider, { value }, createElement(Read), createElement(context.Provider, { value: "inner" }, createElement(Read)), createElement(Read)),
      createElement(Read), createElement("button", { onClick: () => setValue("changed") }, "change"));
  };
  const h = mount(createElement(Root));
  expect(h.text()).toBe("outerinnerouterdefaultchange");
  h.click("change");
  expect(h.text()).toBe("changedinnerchangeddefaultchange");
  expect(mount(createElement(Read)).text()).toBe("default");
});

import { createElement, useState } from "react";
import { z } from "zod";
import { expect, it, vi } from "vitest";
import { mount, type RenderedNode } from "@ggd/shared/testkit/headlessUi";
import { setAt } from "@ggd/shared/content/editModel";
import { walkZod } from "./walk";

vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls }));
import { FormRenderer } from "./FormRenderer";

function disabledFields(nodes: readonly RenderedNode[], inherited = false): Map<string, boolean> {
  const result = new Map<string, boolean>();
  for (const node of nodes) {
    if (typeof node === "string") continue;
    const disabled = inherited || node.props.disabled === true;
    if (typeof node.props["data-field"] === "string") result.set(node.props["data-field"], disabled);
    for (const [path, blocked] of disabledFields(node.children, disabled)) result.set(path, blocked);
  }
  return result;
}

it("retains contract locks through object, array, union and record nesting while other controls remain editable", () => {
  const schema = z.object({ entries: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("limits"), buckets: z.record(z.object({ limit: z.number(), editable: z.number() })) }),
    z.object({ kind: z.literal("empty") }),
  ])) });
  const node = walkZod(schema);
  let value = { entries: [{ kind: "limits", buckets: { first: { limit: 12, editable: 4 } } }] };
  function Host() {
    const [current, update] = useState(value);
    return createElement(FormRenderer, { node, value: current, dataPath: "", errors: {},
      readOnlyReasons: new Map([["entries[].buckets.*.limit", "此值由遊戲規則決定"]]),
      onChange(path, next) { value = setAt(current, path, next); update(value); } });
  }
  let form = mount(createElement(Host));
  const locked = "entries.0.buckets.first.limit", editable = "entries.0.buckets.first.editable";
  expect(disabledFields(form.nodes()).get(locked)).toBe(true);
  expect(disabledFields(form.nodes()).get(editable)).toBe(false);
  expect(form.text()).toContain("此值由遊戲規則決定");
  // Never call a child handler behind a disabled fieldset as fake browser input.
  form.enter(form.field(editable), "9");
  value = JSON.parse(JSON.stringify(value));
  form = mount(createElement(Host));
  expect(value.entries[0]!.buckets.first).toEqual({ limit: 12, editable: 9 });
  expect(disabledFields(form.nodes()).get(locked)).toBe(true);
});

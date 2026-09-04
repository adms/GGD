import { describe, expect, it } from "vitest";
import { docEntryMatchesQuery } from "./Sidebar";

const entry = { id: "godie-e002", hash: "29b43780f167" };

describe("document-list search", () => {
  it.each(["", "  ", "GODIE-E002", "e002", "29B437", "f167"])(
    "matches ID and content fingerprint: %s",
    (query) => expect(docEntryMatchesQuery(entry, query)).toBe(true),
  );

  it("rejects unrelated text", () => {
    expect(docEntryMatchesQuery(entry, "godie-hart")).toBe(false);
  });
});

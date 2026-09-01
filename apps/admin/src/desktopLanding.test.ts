import { describe, expect, it } from "vitest";
import { desktopLandingPage } from "./store";

describe("desktop admin landing", () => {
  it("deep-links only the local AI approval page in a desktop build", () => {
    expect(desktopLandingPage("?desktopPage=aiChangeReview", true)).toBe("aiChangeReview");
    expect(desktopLandingPage("?desktopPage=contentOverlay", true)).toBeNull();
    expect(desktopLandingPage("?desktopPage=aiChangeReview", false)).toBeNull();
  });
});

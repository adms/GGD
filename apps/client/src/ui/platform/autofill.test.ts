import { describe, it, expect } from "vitest";
import {
  passwordAutoComplete,
  USERNAME_AUTOCOMPLETE,
  EMAIL_AUTOCOMPLETE,
  CODE_AUTOCOMPLETE,
} from "./autofill";

describe("credential autofill hints (task #185)", () => {
  it("uses current-password on sign-in and new-password on register", () => {
    // Backwards is worse than nothing: new-password on the sign-in screen makes
    // Chrome offer to GENERATE a password instead of filling the saved one.
    expect(passwordAutoComplete("login")).toBe("current-password");
    expect(passwordAutoComplete("register")).toBe("new-password");
  });

  it("uses the SAME username token in both modes", () => {
    // There is no "new-username" token; matching tokens is what lets the record
    // saved at registration be re-matched on the next visit's sign-in screen.
    expect(USERNAME_AUTOCOMPLETE).toBe("username");
  });

  it("marks the email field as email", () => {
    expect(EMAIL_AUTOCOMPLETE).toBe("email");
  });

  it("keeps the invite / owner-token fields OUT of the credential pair", () => {
    // Never "one-time-code": these codes are read off a chat message or the
    // host console, not delivered to this device, and that hint is exactly what
    // keeps the box classified as credential-adjacent — the reason Chrome saved
    // the invite code as the username on the family deploy.
    expect(CODE_AUTOCOMPLETE).toBe("off");
    expect(CODE_AUTOCOMPLETE).not.toBe("one-time-code");
  });

  it("never lets a code field collide with the real credential tokens", () => {
    expect([USERNAME_AUTOCOMPLETE, passwordAutoComplete("login"), passwordAutoComplete("register")]).not.toContain(
      CODE_AUTOCOMPLETE,
    );
  });
});

import { defineConfig } from "vitest/config";
import { RESOLVE_TS_FIRST } from "../../vitest.shared";

// This package is the one that mixes bare `@ggd/shared/*` specifiers (resolved
// through the package `exports` map) with @ggd/shared's own extensionless
// relative imports, so it is where the dual-instance registry trap bites first
// — see vitest.shared.ts for the full story.
export default defineConfig({
  resolve: RESOLVE_TS_FIRST,
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

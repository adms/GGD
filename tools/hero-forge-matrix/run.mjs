import { spawnSync } from "node:child_process";

const executable = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const result = spawnSync(executable, [
  "--filter", "@ggd/shared", "exec", "vitest", "run", "src/content/heroForge/catalogMatrix.test.ts",
], {
  stdio: "inherit",
  env: { ...process.env, GGD_HERO_EXHAUSTIVE_MATRIX: "1" },
});

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

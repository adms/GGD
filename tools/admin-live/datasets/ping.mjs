/** 煙霧測試用：驗 /__live 的請求鏈是通的。 */
export const deps = ["package.json"];
export async function build(repoRoot) {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
  return { pong: true, repo: pkg.name };
}

import { readFileSync } from "node:fs";
import { validateDoc } from "./packages/shared/src/content/loader";
for (const [col, p] of [
  ["abilities", "content/abilities/godie-hart.r.json"],
  ["champions", "content/champions/godie-hart.json"],
] as const) {
  const raw = JSON.parse(readFileSync(p, "utf-8"));
  const r = validateDoc(col as never, raw);
  console.log(p, r.ok ? "OK" : JSON.stringify((r as { issues: unknown }).issues, null, 1));
}

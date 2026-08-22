import { readFileSync } from "node:fs";
import { validateDoc } from "../../content/loader";
const doc = JSON.parse(readFileSync("content/abilities/godie-e002.ex.json", "utf8"));
console.log("ABILITY:", JSON.stringify(validateDoc("abilities", doc)).slice(0, 2000));
for (const id of ["fx.avalon.reflect-burst", "fx.avalon.reflect-spark"]) {
  const v = JSON.parse(readFileSync(`content/vfx/${id}.json`, "utf8"));
  console.log(id, JSON.stringify(validateDoc("vfx", v)).slice(0, 800));
}

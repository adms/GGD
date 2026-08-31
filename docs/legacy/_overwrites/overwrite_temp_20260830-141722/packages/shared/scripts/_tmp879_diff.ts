import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
const __dirname = dirname(fileURLToPath(import.meta.url));
import { ContentLoader, registerAll } from "../src/content/index";
import { FsContentSource } from "../src/content/node/index";
import { Abilities } from "../src/sim/content/registry";
import { deriveCastTime } from "../src/content/castTimeFormula";
const CONTENT_DIR = process.env.GGD_CONTENT_DIR ?? join(__dirname, "../../../content");
const result = await new ContentLoader(new FsContentSource(CONTENT_DIR)).load({ policy: "fail-closed" });
registerAll(result.store);
const all = Abilities.all();
const envDoc = result.store.tryGet<{ multipliers: Record<string, number> }>("config", "combat-env");
const cdMult = envDoc?.multipliers.cooldown ?? 1;
console.log("abilities", all.length, "cdMult", cdMult);
let n = 0;
for (const d of all) {
  const want = deriveCastTime(d, cdMult).castTimeSec;
  const p = join(CONTENT_DIR, "abilities", `${d.id}.json`);
  let doc: any;
  try { doc = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
  const got = doc.castTimeSec;
  const gotP = doc?.template?.params?.castTimeSec;
  if (got !== want || (doc?.template?.params && "castTimeSec" in doc.template.params && gotP !== (want ?? 0))) {
    n++;
    console.log(`DIFF ${d.id.padEnd(18)} disk=${String(got)} params=${String(gotP)} formula=${String(want)}`);
  }
}
console.log("total diffs", n);

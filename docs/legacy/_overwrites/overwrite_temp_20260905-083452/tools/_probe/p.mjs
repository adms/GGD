import { loadContentCached } from "../../packages/shared/src/content/cache/index";
import { registerAll, Abilities } from "../../packages/shared/src/content/registry";
const loaded = await loadContentCached({ rootDir: "content" });
registerAll(loaded.store);
for (const id of ["godie-e00w.r","godie-e00s.r","godie-edem.q"]) {
  const d = Abilities.tryGet(id);
  console.log(id, "castTimeSec=", d?.castTimeSec, "tier=", d?.castTimeTier);
}

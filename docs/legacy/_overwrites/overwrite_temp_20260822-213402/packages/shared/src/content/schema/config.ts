/**
 * config@1 — system parameter documents. The canonical doc is `config.match`
 * (tick constants, match timers, economy values, progression, draft schedule).
 * Values mirror the engine defaults in constants.ts / economy/*.ts; the
 * game-server will consume this doc when it switches to the ContentLoader.
 *
 * config.store@1 — the M COIN store document (`config/store.json`): champion
 * unlock prices and per-placement match rewards. Lives in the same `config`
 * collection; the collection schema is a discriminated union on `schema`.
 */
/**
 * ⭐ 2026-08-22：這個檔案**被拆開了**。它從 9,169 行縮成一扇門 ——
 * 每一份 config schema 現在住 `schema/config/<名字>.ts`，union 住
 * `schema/config/index.ts`。
 *
 * ⛔ **這個門面不可以刪**：全 repo 有 100 個地方寫著 `from ".../schema/config"`，
 * 而拆檔的目的是讓 6 條 lane 不要撞在同一個檔上，⛔ 不是叫 100 個 import 端一起改。
 *
 * ⭐ 新增一份 config：**新開 `schema/config/<名字>.ts`**，然後在
 * `schema/config/index.ts` 的 union 加一行。漏了那一行不會靜靜過去 ——
 * `schema/config/configUnionCoversDirectory.test.ts` 會紅並指名那個檔。
 */
export * from "./config/index";

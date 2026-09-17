/**
 * 🖼 玩家**預設載入**的英雄身體貼圖超過 256 ⇒ 註冊一個 256 版本並切成作用中。
 *
 * owner（逐字）：
 * > 2026-09-10「貼圖降低到 256² 貼圖 這個應該變成上架前 後台＆編輯器的內建 script 吧 避免上架到過大的貼圖」
 * > 2026-09-10「場景也是阿 不應該有貼圖超過 256」
 * > 2026-09-12「我不是有卡 script 在啟動的地方自動轉換256跟過高面數嗎?」
 *
 * ⭐ GH#1173 起這支只是 `register-normalized-version.mts --reason texture-256` 的別名 ——
 *   同一條「走 `ModelVersions.prepare` 註冊新版本、舊版本留在下拉」的流程，⛔ 不再各抄一份。
 *
 *   node --import tsx tools/model-fix/register-texture-256.mts [--write] [heroId…]
 */
process.argv.splice(2, 0, "--reason", "texture-256");
await import("./register-normalized-version.mts");

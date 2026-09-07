/**
 * 🧩 GH#990 —— 特效子模組：`vfx-script` 呼叫段的展開器與登錄表（純、決定性、可進瀏覽器）。
 * node 側的磁碟讀取住 `./loadFromDir`（⛔ 刻意不從這裡 re-export —— 它 import `node:fs`）。
 */
export * from "./expand";

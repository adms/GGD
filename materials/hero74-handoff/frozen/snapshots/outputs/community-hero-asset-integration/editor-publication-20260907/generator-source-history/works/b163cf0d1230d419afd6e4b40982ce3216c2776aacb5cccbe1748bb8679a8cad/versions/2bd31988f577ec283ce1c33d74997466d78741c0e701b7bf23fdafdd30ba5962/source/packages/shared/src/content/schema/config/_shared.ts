/**
 * `config` 集合的**跨文件共用零件**。
 *
 * ⭐ 只有被**兩份以上** config schema 用到的東西才住這裡 ——
 * 2026-08-22 拆檔時量到的是兩個。一份 config 自己用得到的私有零件
 * ⛔ 不要搬進來，那會把這個檔養成第二個 9,000 行的瓶頸。
 */
import { z } from "zod";

// ⚠️ 拆檔前它是 `config.ts` 的**檔案私有** const；現在跨檔共用，所以必須 export。
// ⛔ `config/index.ts` 刻意**不**把它再匯出 —— 對外的公開面要跟拆檔前一字不差。

/** 音檔路徑（`assets/` 相對路徑）。⭐ `config.audio-map@1` 的段落說明在 `./audioMap.ts`。 */
export const zAudioAssetPath = z
  .string()
  .min(1)
  .regex(/^assets\//, "audio path must be relative to content/ and start with assets/");
// ⚠️ 拆檔前它是 `config.ts` 的**檔案私有** const；現在跨檔共用，所以必須 export。
// ⛔ `config/index.ts` 刻意**不**把它再匯出 —— 對外的公開面要跟拆檔前一字不差。

/**
 * `#rrggbb`, and nothing else. A colour is a value with a **shape**, and the
 * shape is this field's upper bound in exactly the sense #277 means: without it
 * an operator can type 「紅」 into the form, the PUT succeeds, and the game
 * silently keeps the old colour — 「存了但畫面沒變」, the failure form this repo
 * hates most. Six digits only (no `#rgb`, no `rgba()`): one accepted spelling
 * means one parser on the client and one thing to assert in a test.
 */
export const zColorHex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "顏色必須是 #rrggbb");

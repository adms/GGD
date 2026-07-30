/**
 * `config.vfx-cleanup@1` — 出貨的文件、schema、和程式裡的保險絲必須說同一件事
 * (task #262)。
 *
 * 三個地方存在的理由各自不同:
 *   1. `content/config/vfx-cleanup.json` — 出貨值,操作者會改
 *      (content/ 是 live bind-mount:存檔就是部署)
 *   2. `zConfigVfxCleanupDoc`            — 內容載入器接受的形狀
 *   3. `DEFAULT_VFX_CLEANUP`             — 文件不在時客戶端退回的那一份
 * 任兩份 drift 掉是**靜默的**:遊戲照樣開,只是清場的力道跟磁碟上的檔說的不一樣。
 *
 * ⚠️ 也是**註冊守衛**。`content:build` 會把 `content/config/` 底下每一個 .json
 * 收進索引,載入器用 `zConfigDoc` 這個 discriminatedUnion 解它。一個沒有被加進
 * union 的 variant 不會「只是載不進來」—— 它會 throw,把整個內容啟動一起帶走。
 * 下面那條 union 斷言就是在守未來某次重構把成員拿掉。
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_VFX_CLEANUP,
  zConfigDoc,
  zConfigVfxCleanupDoc,
  type ConfigVfxCleanupDoc,
} from "./schema/config";

const CONTENT_DIR = join(__dirname, "../../../../content");

function shippedDoc(): unknown {
  return JSON.parse(readFileSync(join(CONTENT_DIR, "config/vfx-cleanup.json"), "utf-8"));
}

describe("config.vfx-cleanup@1", () => {
  it("出貨的文件解得開 —— 而且是走 UNION,跟載入器讀它的方式一樣", () => {
    const viaVariant = zConfigVfxCleanupDoc.parse(shippedDoc());
    const viaUnion = zConfigDoc.parse(shippedDoc());
    expect(viaUnion.schema).toBe("config.vfx-cleanup@1");
    expect(viaUnion).toEqual(viaVariant);
  });

  it("出貨的文件和 DEFAULT_VFX_CLEANUP 一格一格對得起來", () => {
    const shipped = zConfigVfxCleanupDoc.parse(shippedDoc()) as ConfigVfxCleanupDoc;
    expect(shipped.enabled).toBe(DEFAULT_VFX_CLEANUP.enabled);
    expect(shipped.purgeSharedPoolsOnRoundEnd).toBe(DEFAULT_VFX_CLEANUP.purgeSharedPoolsOnRoundEnd);
    expect(shipped.maxPooledRings).toBe(DEFAULT_VFX_CLEANUP.maxPooledRings);
    expect(shipped.id).toBe(DEFAULT_VFX_CLEANUP.id);
  });

  it("每一個數字欄位**兩邊**都有界 —— 只有下界的話 24 打成 240 會靜默通過", () => {
    // 第一守則的附註:`validateField` 在 2026-07-29 之前只檢查 min,
    // 所以一個沒有上界的欄位讓 50 被打成 500、過表單、然後在下游被夾掉(#277)。
    expect(zConfigVfxCleanupDoc.safeParse({ ...DEFAULT_VFX_CLEANUP, maxPooledRings: -1 }).success).toBe(false);
    expect(zConfigVfxCleanupDoc.safeParse({ ...DEFAULT_VFX_CLEANUP, maxPooledRings: 513 }).success).toBe(false);
    expect(zConfigVfxCleanupDoc.safeParse({ ...DEFAULT_VFX_CLEANUP, maxPooledRings: 1.5 }).success).toBe(false);
    expect(zConfigVfxCleanupDoc.safeParse({ ...DEFAULT_VFX_CLEANUP, maxPooledRings: 0 }).success).toBe(true);
    expect(zConfigVfxCleanupDoc.safeParse({ ...DEFAULT_VFX_CLEANUP, maxPooledRings: 512 }).success).toBe(true);
  });

  it("多打一個欄位會被拒 —— strict,所以拼錯的鍵不會被靜默忽略", () => {
    expect(
      zConfigVfxCleanupDoc.safeParse({ ...DEFAULT_VFX_CLEANUP, maxPooledRing: 8 }).success,
    ).toBe(false);
  });
});

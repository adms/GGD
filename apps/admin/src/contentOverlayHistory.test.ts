import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./api", () => ({
  getOverlayDocVersions: vi.fn(),
  restoreOverlayDoc: vi.fn(),
  restoreOverlayVersion: vi.fn(),
}));
import { getOverlayDocVersions, restoreOverlayDoc, restoreOverlayVersion } from "./api";
import { docHistory, restoreDocVersion } from "./contentOverlayHistory";

/**
 * ⭐⭐ GH#730 批 C —— **版本／還原**。
 *
 * ⭐ 兩件會**靜默**出錯的事：
 * ① ⭐ **「讀不到」⛔ 不等於「沒有歷史」** —— `api.ts:338` 逐字寫過這句警告，
 *    ⚠️ 而兩者在 UI 上都是空清單 ⇒ 使用者會以為「這份從來沒被改過」。
 * ② ⭐ **還原一份 ⛔ 不是還原整批** —— `restoreOverlayVersion` 會把**整個覆蓋層**
 *    倒回那一代，⛔ 而使用者在版本頁點的是**這一份**。兩者差一個數量級，
 *    ⚠️ 而它們在 UI 上都叫「還原」。
 */
describe("GH#730 批C 覆蓋層版本史", () => {
  beforeEach(() => {
    vi.mocked(getOverlayDocVersions).mockReset();
    vi.mocked(restoreOverlayDoc).mockReset();
    vi.mocked(restoreOverlayVersion).mockReset();
  });

  it("有歷史 ⇒ 逐版帶回來（⭐ 含 by / summary / current 三格，⛔ 不壓成 BackupEntry）", async () => {
    vi.mocked(getOverlayDocVersions).mockResolvedValue({
      entries: [{ hash: "h1", short: "h1", at: "2026-08-31", by: "owner", generation: 3, summary: "改了傷害", current: true }],
    } as never);
    const h = await docHistory("abilities" as never, "a");
    expect(h.versions[0]?.by).toBe("owner");
    expect(h.versions[0]?.current).toBe(true);
    expect(h.unavailable).toBeNull();
  });

  it("★ ⭐ **「讀不到」與「沒有歷史」分得出來**（⛔ 兩者都畫空清單就是靜默）", async () => {
    vi.mocked(getOverlayDocVersions).mockResolvedValue({ entries: [], unavailable: "git 歷史不可用" } as never);
    const unreadable = await docHistory("abilities" as never, "a");
    vi.mocked(getOverlayDocVersions).mockResolvedValue({ entries: [] } as never);
    const empty = await docHistory("abilities" as never, "b");
    expect(unreadable.versions).toEqual([]);
    expect(empty.versions).toEqual([]);
    expect(
      unreadable.unavailable,
      "⛔ 讀不到卻回 null ⇒ 使用者會以為這份文件從來沒被改過",
    ).not.toBeNull();
    expect(empty.unavailable).toBeNull();
  });

  it("⭐ 網路失敗也是「讀不到」，⛔ 不是「沒有歷史」", async () => {
    vi.mocked(getOverlayDocVersions).mockRejectedValue(new Error("401"));
    expect((await docHistory("items" as never, "x")).unavailable).toContain("401");
  });

  it("★ ⭐ 還原走**逐文件**，⛔ 不是整批（那會倒回整個覆蓋層）", async () => {
    vi.mocked(restoreOverlayDoc).mockResolvedValue({} as never);
    const r = await restoreDocVersion("h1", "abilities" as never, "a");
    expect(r.ok).toBe(true);
    expect(vi.mocked(restoreOverlayDoc)).toHaveBeenCalledWith("h1", "abilities", "a");
    expect(
      vi.mocked(restoreOverlayVersion),
      "⛔ 用了整批還原 ⇒ 使用者點「這一份」而整個覆蓋層被倒回去",
    ).not.toHaveBeenCalled();
  });
});

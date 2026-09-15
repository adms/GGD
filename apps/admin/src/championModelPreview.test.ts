/**
 * 🔭 後台「上線模型版本」下拉選單：**選了就載入預覽，⛔ 不會套用**（owner 2026-09-15
 * 「下拉式選單 要能即時載入御覽」）。
 *
 * ⭐ 驗出貨的東西：狀態來自 content-api 的 `ModelVersions.state()` 讀**出貨的** b2-popp（三個原作法杖版本），
 * 模型文件由出貨的 content/models 回答；只有「怎麼畫」換成樁 —— 無 DOM 的測試環境跑不了 Babylon，
 * 3D 那一半是編輯器 `ModelPanel` 自己的守衛（modelInspector.test.ts）。
 *
 * MUTATION：把 `data-field="model-preview"` 那一段拿掉 ⇒ 第一個斷言紅。
 */
import { createElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls,
}));

import { mount } from "@ggd/shared/testkit/headlessUi";
import { ModelVersions } from "../../content-api/src/modelVersions";
import { ChampionModelVersions, type ModelSelectionApi } from "./ui/ChampionModelVersions";

const CONTENT = join(import.meta.dirname, "../../../content");

describe("上線模型版本的即時預覽", () => {
  it("選一個版本 ⇒ 立刻畫那一版的模型；⛔ 沒有送出任何上線指令", async () => {
    const state = new ModelVersions(CONTENT).state("b2-popp");
    expect(state.versions.length, "b2-popp 應該有多個出貨版本可選").toBeGreaterThan(2);
    const update = vi.fn();
    const api: ModelSelectionApi = {
      fetchDoc: async (_c, id) => ({ doc: JSON.parse(readFileSync(join(CONTENT, "models", `${id}.json`), "utf8")) }),
      modelVersions: { read: async () => ({ state, error: null }), update, catalog: async () => ({ ids: [], error: null }) },
    };
    const view = mount(createElement(ChampionModelVersions, {
      api, championId: "b2-popp", document: {}, disabled: false, dirty: false, allowRegister: false,
      onBusy: () => {}, onSaved: () => {},
      preview: (doc) => createElement("i", { "data-previewed": String(doc.glbPath) }),
    }));
    await view.flush();
    const other = state.versions.find((v) => v.modelKey !== state.activeModelKey)!;
    view.enter(view.hosts().find((n) => n.props["aria-label"] === "上線模型版本")!, other.modelKey);
    await view.flush();
    const want = JSON.parse(readFileSync(join(CONTENT, "models", `${other.modelKey}.json`), "utf8")).glbPath;
    expect(view.field("model-preview").props["data-glb"], "選了之後沒有畫那一版").toBe(want);
    expect(view.hosts().some((n) => n.props["data-previewed"] === want), "預覽拿到的不是選中的那份文件").toBe(true);
    expect(update, "⛔ 預覽不可以偷偷套用").not.toHaveBeenCalled();
  });
});

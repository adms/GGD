/**
 * 🛒 GH#1177 後台「模型版本 → 造型」上架：⛔ 不預填售價；上架寫出一份**出貨 schema 收得下**的 skin@1；下架寫 listed:false、⛔ 不刪檔。
 *
 * ⭐ 版本清單讀**出貨的** b2-popp（content-api `ModelVersions.state()`）；只有寫入端換成記憶體樁（寫前先過真的 zSkinDoc）。
 * MUTATION（接線類，2026-09-15 做過）：ChampionModelVersions.tsx 拿掉 `<ChampionModelVersionShop …/>` 那一行 ⇒ 第一條紅。
 */
import { createElement } from "react";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  ...(await import("@ggd/shared/testkit/headlessUi")).hookImpls,
}));

import { mount } from "@ggd/shared/testkit/headlessUi";
import { zSkinDoc, type SkinDoc } from "@ggd/shared/content/schema/skin";
import { ModelVersions } from "../../content-api/src/modelVersions";
import { ChampionModelVersions } from "./ui/ChampionModelVersions";
import { ChampionModelVersionShop } from "./ui/ChampionModelVersionShop";

const state = new ModelVersions(join(import.meta.dirname, "../../../content")).state("b2-popp");

describe("模型版本商店上架（GH#1177）", () => {
  it("上線模型版本面板裡每一個版本都有一列上架", async () => {
    const view = mount(createElement(ChampionModelVersions, {
      api: { fetchDoc: async () => ({ doc: null }), modelVersions: { read: async () => ({ state, error: null }), update: vi.fn(), catalog: async () => ({ ids: [], error: null }) } },
      championId: "b2-popp", document: {}, disabled: false, dirty: false, allowRegister: false, onBusy: () => {}, onSaved: () => {}, preview: () => null,
    }));
    await view.flush();
    expect(view.fields("model-shop-row").length, "⛔ 面板沒有掛上架那一段").toBe(state.versions.length);
  });

  it("填了售價才上架；上架＝合法 skin@1；下架＝listed:false 且檔案還在", async () => {
    const disk = new Map<string, SkinDoc>();
    const saved: SkinDoc[] = [];
    const api = {
      listSkins: async () => ({ docs: [...disk.values()], error: null }),
      saveSkin: async (doc: SkinDoc) => {
        expect(zSkinDoc.safeParse(doc).success, `出貨 schema 收不下：${JSON.stringify(doc)}`).toBe(true);
        saved.push(doc); disk.set(doc.id, doc);
        return { ok: true, issues: [], error: null };
      },
    };
    const view = mount(createElement(ChampionModelVersionShop, { championId: "b2-popp", versions: state.versions, disabled: false, api }));
    await view.flush();
    const key = state.versions[0]!.modelKey;
    const listBtn = () => view.field(`model-shop-list:${key}`);
    expect(listBtn().props.disabled, "⛔ 沒填售價就能上架 —— 售價是 owner 的旋鈕").toBe(true);

    view.type(`model-shop-price:${key}`, "300");
    view.press(listBtn());
    await view.flush();
    expect(saved.at(-1)).toMatchObject({ schema: "skin@1", championId: "b2-popp", modelKey: key, mcoinPrice: 300 });
    expect(saved.at(-1)!.listed, "上架的文件不帶 listed（缺席＝上架）").toBeUndefined();
    expect(view.fields("model-shop-row").find((n) => n.props["data-model-key"] === key)!.props["data-status"]).toBe("listed");

    view.press(view.field(`model-shop-delist:${key}`));
    await view.flush();
    expect(saved.at(-1)).toMatchObject({ id: saved[0]!.id, listed: false, mcoinPrice: 300 });
    expect(disk.has(saved[0]!.id), "⛔ 下架把檔案刪了").toBe(true);
    expect(view.fields("model-shop-row").find((n) => n.props["data-model-key"] === key)!.props["data-status"]).toBe("delisted");
  });
});

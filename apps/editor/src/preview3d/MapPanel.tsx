/**
 * MAP 3D panel —— 把**整條地圖流程**搬進編輯器（GH#324，owner 2026-08-14）。
 *
 * > 「我記得你之前有個場地生成編輯器，記得把所有規則流程都整合進去，
 * >  之後新增場景盡量自動化」
 *
 * ## ⭐ 這一頁跑的是**出貨的那一份**，⛔ 不是一份長得像的預覽
 *
 * `pnpm map:gen` 這支 CLI 只做 I/O：真正的邏輯（模板／編譯／圖論／驗證）全在
 * `@ggd/shared/map/*`。所以這一頁**直接呼叫 `compileMap()`** ——
 * 編輯器算出來的牆、出生點、導航、驗證報告，跟 CLI 寫進 `content/arenas/` 的
 * 那一份是**同一段程式的同一次呼叫**。
 *
 * ⚠️ 這正是失敗形態⑤（被測的不是出貨的那個）在編輯器上的樣子：一個自己畫一遍
 * tiles 的預覽會很好寫，然後它會慢慢跟產生器分岔，而**畫面上不會有任何異狀** ——
 * 直到有人照著預覽擺完一張圖、跑 `map:gen`、發現被拒絕。
 *
 * ## 這一頁替作者做掉的三件事
 *
 * | | 以前 | 現在 |
 * |---|---|---|
 * | 畫 tiles | 手打 18 行 × 24 個 `#`／`.` | ⭐ 按一下「用模板重新產生」 |
 * | 知道合不合格 | 存檔 → 跑 CLI → 讀終端機 | ⭐ 打字的當下就看到九項指標 |
 * | 知道背景長怎樣 | ⛔ 完全看不到 | ⭐ 3D 裡直接畫出來 |
 *
 * ⛔ **「用模板重新產生」會蓋掉手改過的 tiles**，所以它要按兩下（確認）——
 * 一鍵毀掉半小時的手工是這種按鈕最常見的死法。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { zMapDoc, type MapDoc } from "@ggd/shared/content";
import { DEFAULT_MAP_SPEC } from "@ggd/shared/content";
import { compileMap } from "@ggd/shared/map/compile";
import type { MapReport } from "@ggd/shared/map/validate";
import { generateTiles } from "@ggd/shared/map/templates";
import { backdropSeed, buildBackdropLayer } from "@ggd/shared/map/backdrop";
import { BabylonCanvas, type BabylonStage } from "./BabylonCanvas";
import { createFlatDisc, flatColorMaterial } from "./stage";
import { useDebounced } from "./useDebounced";
import { useEditorStore } from "../store";

/** 互動點的顏色 —— 跟引擎的消費端對應，⛔ 不是隨便挑的四個色。 */
const INTERACTION_COLORS: Record<string, string> = {
  pickup: "#4ad07a", // 治療花開在這裡
  capture: "#f0b429", // 守衛塔站在這裡
  toggleGate: "#4aa8d0", // 玩家站著撐開的門
  channel: "#8c8c8c", // ⚠️ 還沒有消費端（灰色＝這一點目前不會發生任何事）
};

/** 一個矩形盒的四面牆用一個扁盒畫出來。 */
function boxMesh(
  scene: BabylonStage["scene"],
  name: string,
  center: { x: number; z: number },
  halfW: number,
  halfD: number,
  y: number,
  height: number,
): Mesh {
  const m = new Mesh(name, scene);
  const vd = new VertexData();
  const [x0, x1] = [center.x - halfW, center.x + halfW];
  const [z0, z1] = [center.z - halfD, center.z + halfD];
  const [y0, y1] = [y, y + height];
  vd.positions = [
    x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, // bottom
    x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, // top
  ];
  vd.indices = [
    4, 6, 5, 4, 7, 6, // top
    0, 1, 5, 0, 5, 4, // -z
    1, 2, 6, 1, 6, 5, // +x
    2, 3, 7, 2, 7, 6, // +z
    3, 0, 4, 3, 4, 7, // -x
  ];
  const normals: number[] = [];
  VertexData.ComputeNormals(vd.positions, vd.indices, normals);
  vd.normals = normals;
  vd.applyToMesh(m);
  return m;
}

function ReportTable({ report }: { report: MapReport }) {
  const spec = DEFAULT_MAP_SPEC;
  // ⚠️ 上下界從 spec 推導，⛔ 不抄字面值 —— 抄一份就是第四個住處（第二守則）。
  const rows: { label: string; value: string; ok: boolean }[] = [
    {
      label: "區域數",
      value: `${report.regions}`,
      ok: report.regions >= spec.topology.regionsMin && report.regions <= spec.topology.regionsMax,
    },
    { label: "不連通區塊", value: `${report.disconnectedAreas}`, ok: report.disconnectedAreas <= 1 },
    { label: "死路", value: `${report.deadEnds}`, ok: report.deadEnds <= spec.topology.deadEndsMax },
    { label: "迴圈", value: `${report.loops}`, ok: report.loops >= spec.topology.loopsMin },
    {
      label: "瓶頸",
      value: `${report.chokepoints}`,
      ok:
        report.chokepoints >= spec.topology.chokepointsMin &&
        report.chokepoints <= spec.topology.chokepointsMax,
    },
    {
      label: "捷徑",
      value: `${report.shortcuts}`,
      ok: report.shortcuts <= spec.topology.shortcutsMax,
    },
    {
      label: "互動點",
      value: `${report.interactions}`,
      ok:
        report.interactions >= spec.interactions.countMin &&
        report.interactions <= spec.interactions.countMax,
    },
    {
      label: "橫跨秒數",
      value: `${report.estimatedTraversalSec}s`,
      ok:
        report.estimatedTraversalSec >= spec.traversal.secMin &&
        report.estimatedTraversalSec <= spec.traversal.secMax,
    },
    { label: "對戰分區", value: `${report.duelZones}`, ok: report.duelZones >= 2 },
  ];
  return (
    <table className="map-report">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th>{r.label}</th>
            <td>{r.value}</td>
            <td className={r.ok ? "map-ok" : "map-warn"}>{r.ok ? "✓" : "⚠"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function MapPanel({ doc }: { doc: unknown }) {
  const parsed = useMemo(() => {
    const r = zMapDoc.safeParse(doc);
    return r.success ? r.data : null;
  }, [doc]);
  const debounced = useDebounced(parsed, 300);
  const [confirmRegen, setConfirmRegen] = useState(false);

  // ⭐ 出貨的那一段程式，就地跑一次。編譯失敗（罕見：schema 過了但拓撲爆掉）
  //    不可以讓整個編輯器白畫面 —— 這裡 catch 起來當成「沒有結果」。
  const compiled = useMemo(() => {
    if (!debounced) return null;
    try {
      return compileMap(debounced, DEFAULT_MAP_SPEC);
    } catch {
      return null;
    }
  }, [debounced]);

  const stageRef = useRef<BabylonStage | null>(null);
  const layoutRef = useRef<TransformNode | null>(null);

  const onReady = useCallback((stage: BabylonStage) => {
    stageRef.current = stage;
    return () => {
      layoutRef.current?.dispose();
      layoutRef.current = null;
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !compiled || !debounced) return;
    const scene = stage.scene;
    layoutRef.current?.dispose();
    const layout = new TransformNode("map-layout", scene);
    layoutRef.current = layout;

    // ⚠️ 只畫**第一個**對戰分區。第二個是同一份佈局的複本擺在 +x，
    //    畫兩份只會讓相機退得更遠、每一格更小 —— 作者要看的是版面不是數量。
    const zone = compiled.arena.zones[0];
    if (!zone) return;
    const halfW = debounced.grid.cols * debounced.grid.tileSize * 0.5;
    const halfD = debounced.grid.rows * debounced.grid.tileSize * 0.5;

    // ---- 圓盤外的 2D 景深背景（先畫，它在最下面）----
    if (compiled.arena.backdrop) {
      const seed = backdropSeed(compiled.arena.id);
      compiled.arena.backdrop.layers.forEach((layer, li) => {
        // ⭐ 本體 + 逆光邊緣，跟客戶端**同一個函式、同一組參數** ——
        // 編輯器看到的剪影就是玩家看到的剪影。
        const parts: [string, string, number | undefined, number][] = [["", layer.color, undefined, 0]];
        if (layer.rim) parts.push(["-rim", layer.rim.color, layer.rim.width, 0.02]);
        for (const [suffix, hex, rimWidth, lift] of parts) {
          const geo = buildBackdropLayer(layer, zone.boundaryRadius, seed, rimWidth);
          const m = new Mesh(`backdrop-${li}${suffix}`, scene);
          const vd = new VertexData();
          vd.positions = geo.positions;
          vd.indices = geo.indices;
          vd.normals = geo.positions.map((_, i) => (i % 3 === 1 ? 1 : 0));
          vd.applyToMesh(m);
          m.material = flatColorMaterial(scene, `backdrop-${li}${suffix}-mat`, hex, {
            alpha: layer.alpha,
          });
          m.position.set(zone.center.x, lift, zone.center.z);
          m.parent = layout;
        }
      });
    }

    // ---- 地板 ----
    const floor = boxMesh(scene, "map-floor", zone.center, halfW, halfD, -0.2, 0.2);
    floor.material = flatColorMaterial(scene, "map-floor-mat", "#3a3f4c");
    floor.parent = layout;

    // ---- 地圖區域（半透明色塊，讓「4–6 個區」看得見）----
    const REGION_COLORS = ["#5b7fd0", "#d07a5b", "#5bd0a8", "#c05bd0", "#d0c25b", "#7a7a7a"];
    debounced.regions.forEach((rg: MapDoc["regions"][number], ri: number) => {
      rg.rects.forEach((rc, k: number) => {
        const cx = zone.center.x - halfW + (rc.col + rc.w / 2) * debounced.grid.tileSize;
        const cz = zone.center.z - halfD + (rc.row + rc.h / 2) * debounced.grid.tileSize;
        const m = boxMesh(
          scene,
          `region-${ri}-${k}`,
          { x: cx, z: cz },
          (rc.w * debounced.grid.tileSize) / 2,
          (rc.h * debounced.grid.tileSize) / 2,
          0.01,
          0.01,
        );
        m.material = flatColorMaterial(
          scene,
          `region-${ri}-mat`,
          REGION_COLORS[ri % REGION_COLORS.length]!,
          { alpha: 0.22 },
        );
        m.parent = layout;
      });
    });

    // ---- 牆（產生器合併出來的矩形 —— 這就是碰撞真相）----
    // ⭐ 會開關的門畫成另一個顏色 —— 「這面牆有時候不在」是玩家要記住的事。
    // ⚠️ 兩個材質**在迴圈外面建一次**：合併後仍有十幾塊牆，逐塊建材質就是十幾份
    //    一模一樣的 shader 綁定（而且它們的名字會撞在一起）。
    const wallMat = flatColorMaterial(scene, "map-wall-mat", "#6b7180");
    const gateMat = flatColorMaterial(scene, "map-gate-mat", "#c8622b", { alpha: 0.75 });
    zone.obstacles.forEach((ob, i) => {
      if (ob.kind !== "box") return;
      const m = boxMesh(scene, `wall-${i}`, ob.center, ob.halfW, ob.halfD, 0, 1.2);
      m.material = ob.gateGroup === undefined ? wallMat : gateMat;
      m.parent = layout;
    });

    // ---- 出生點 ----
    const SPAWN_COLORS = ["#4a7fd0", "#f0a020"];
    zone.spawns.forEach((side, si) => {
      side.forEach((p, k) => {
        const d = createFlatDisc(scene, `spawn-${si}-${k}`, p, 0.9, SPAWN_COLORS[si]!, {
          alpha: 0.9,
          y: 0.05,
        });
        d.parent = layout;
      });
    });

    // ---- 互動點（顏色 = 哪一個引擎系統會用它）----
    (zone.interactions ?? []).forEach((it, i) => {
      const d = createFlatDisc(
        scene,
        `interaction-${i}`,
        it.at,
        it.radius,
        INTERACTION_COLORS[it.kind] ?? "#ffffff",
        { alpha: 0.45, y: 0.06 },
      );
      d.parent = layout;
    });

    // ---- 鏡頭框住整張圖（含最外圈背景）----
    const outer =
      compiled.arena.backdrop && compiled.arena.backdrop.layers.length > 0
        ? Math.max(...compiled.arena.backdrop.layers.map((l) => l.toRadius)) * zone.boundaryRadius
        : Math.max(halfW, halfD);
    stage.camera.target.set(zone.center.x, 0, zone.center.z);
    stage.camera.radius = outer * 1.6;
    stage.camera.upperRadiusLimit = outer * 5;
  }, [compiled, debounced]);

  const regenerate = () => {
    if (!parsed) return;
    if (!confirmRegen) {
      setConfirmRegen(true);
      return;
    }
    const tiles = generateTiles(parsed.template, {
      cols: parsed.grid.cols,
      rows: parsed.grid.rows,
    });
    useEditorStore.getState().update("tiles", tiles);
    setConfirmRegen(false);
  };

  const hard = compiled?.report.issues.filter((i) => i.kind === "hard") ?? [];
  const softs = compiled?.report.issues.filter((i) => i.kind === "soft") ?? [];

  return (
    <div className="preview3d">
      <BabylonCanvas onReady={onReady} cameraRadius={90} cameraTarget={[0, 0, 0]} height={300} />
      {parsed === null ? (
        <p className="preview-note preview3d-error">
          文件還不是合法的 map@1 —— 顯示的是上一份有效的版面。
        </p>
      ) : null}

      <div className="map-tools">
        <button type="button" onClick={regenerate} disabled={!parsed}>
          {confirmRegen ? "⚠ 再按一次會覆蓋現有 tiles" : `用 ${parsed?.template ?? "模板"} 重新產生 tiles`}
        </button>
        {confirmRegen ? (
          <button type="button" onClick={() => setConfirmRegen(false)}>
            取消
          </button>
        ) : null}
      </div>

      {compiled ? (
        <>
          <p className={compiled.report.ok ? "map-verdict map-ok" : "map-verdict map-warn"}>
            {compiled.report.ok
              ? "✓ 通過 —— `pnpm map:gen` 會接受這張圖"
              : "⛔ 未通過 —— `pnpm map:gen` 會拒絕輸出"}
          </p>
          <ReportTable report={compiled.report} />
          {hard.length > 0 ? (
            <ul className="map-issues map-warn">
              {hard.map((i, k) => (
                <li key={k}>
                  <strong>{i.check}</strong>：{i.message}
                </li>
              ))}
            </ul>
          ) : null}
          {softs.length > 0 ? (
            <ul className="map-issues">
              {softs.map((i, k) => (
                <li key={k}>
                  {i.severity === "error" ? "⛔" : "⚠"} <strong>{i.check}</strong>：{i.message}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <p className="preview-note">
        灰 = 牆（碰撞真相，由產生器合併）· 橘 = 會開關的門 · 藍/橙圓 = 出生點 · 綠 = 治療花錨點 ·
        黃 = 守衛塔錨點 · 淡色塊 = 地圖區域 · 圓盤外的環帶 = 2D 景深背景。
        指標與 <code>pnpm map:gen</code> 跑的是<strong>同一段程式</strong>。
      </p>
    </div>
  );
}

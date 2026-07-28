/**
 * The CLI half: 裁決表 actually reaching disk.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM `barcodeExtract.test.ts`.
 * That file proves the guards decide correctly. This one proves the decision
 * SURVIVES THE TRIP — the repo's number-one failure mode is ②「算出來但沒送到
 * 消費端」, and an extractor whose verdicts never leave memory is exactly that
 * failure. So every assertion below re-READS the written files from disk and
 * parses them, rather than inspecting the in-memory report object.
 *
 * Everything is written into a throwaway temp directory. Nothing here touches
 * `content/`, `docs/`, or any shipped file.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CSV_HEADER,
  buildReport,
  championIdFromFile,
  listReferenceImages,
  toCsv,
  writeReport,
} from "./extract";
import {
  CLEAN_FIVE,
  cleanFiveBand,
  duplicatePair,
  mudColumn,
  toPng,
  twoBandFigure,
  type Canvas,
} from "./testImages";

let root: string;
let inDir: string;
let outDir: string;

function put(name: string, c: Canvas): void {
  fs.writeFileSync(path.join(inDir, name), toPng(c));
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "ggd-voxel-extract-"));
  inDir = path.join(root, "refs");
  outDir = path.join(root, "out");
  fs.mkdirSync(inDir, { recursive: true });
  const [twinA, twinB] = duplicatePair();
  put("aa-good.png", cleanFiveBand());
  put("bb-mud.png", mudColumn());
  put("cc-two.png", twoBandFigure());
  put("dd-twin1.png", twinA);
  put("ee-twin2.png", twinB);
  // a file the decoder genuinely cannot read — the corpus really does hold .webp
  fs.writeFileSync(path.join(inDir, "ff-webp.webp"), Buffer.from("RIFF????WEBPVP8 "));
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("listReferenceImages", () => {
  it("returns every reference image in name order, including undecodable ones", () => {
    const got = listReferenceImages(inDir).map((f) => path.basename(f));
    expect(got).toEqual([
      "aa-good.png",
      "bb-mud.png",
      "cc-two.png",
      "dd-twin1.png",
      "ee-twin2.png",
      "ff-webp.webp",
    ]);
  });

  it("keys a champion off the file stem", () => {
    expect(championIdFromFile("/x/y/godie-e001.png")).toBe("godie-e001");
  });
});

describe("裁決表 written to disk", () => {
  it("writes both files", () => {
    const { jsonPath, csvPath } = writeReport(inDir, outDir);
    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(csvPath)).toBe(true);
  });

  it("the JSON on disk carries every champion's verdict and its barcode", () => {
    const { jsonPath } = writeReport(inDir, outDir);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const byId = new Map<string, any>(parsed.rows.map((r: any) => [r.championId, r]));
    expect(byId.get("aa-good").verdict).toBe("PASS");
    expect(byId.get("bb-mud").verdict).toBe("FAIL");
    expect(byId.get("cc-two").verdict).toBe("SUSPECT");
    expect(byId.get("ee-twin2").verdict).toBe("DUPLICATE");
    expect(byId.get("ee-twin2").duplicateOf).toBe("dd-twin1");
    expect(byId.get("ff-webp").verdict).toBe("FAIL");
  });

  it("the barcode that survives the JSON round-trip still holds the painted hexes", () => {
    const { jsonPath } = writeReport(inDir, outDir);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    const row = parsed.rows.find((r: any) => r.championId === "aa-good");
    const order = [
      "hair",
      "hatBand",
      "hatBrim",
      "face",
      "collar",
      "chestTrim",
      "top",
      "waist",
      "pants",
      "shin",
      "shoe",
    ];
    const present = order.map((s) => row.barcode.bands[s]).filter(Boolean);
    expect(present.map((b: any) => b.hex)).toEqual([...CLEAN_FIVE]);
    expect(row.barcode.source).toBe("extracted");
  });

  it("the counts on disk add up to the row count", () => {
    const { jsonPath } = writeReport(inDir, outDir);
    const c = JSON.parse(fs.readFileSync(jsonPath, "utf8")).counts;
    expect(c.PASS + c.SUSPECT + c.FAIL + c.DUPLICATE).toBe(c.total);
    expect(c.total).toBe(6);
  });

  it("the CSV on disk is parseable and its verdict column matches the JSON", () => {
    const { jsonPath, csvPath } = writeReport(inDir, outDir);
    const rows = JSON.parse(fs.readFileSync(jsonPath, "utf8")).rows as any[];
    const lines = fs.readFileSync(csvPath, "utf8").trim().split("\n");
    expect(lines[0]).toBe(CSV_HEADER.join(","));
    expect(lines).toHaveLength(rows.length + 1);
    for (let i = 0; i < rows.length; i++) {
      const cells = lines[i + 1]!.split(",");
      expect(cells[0]).toBe(rows[i]!.championId);
      expect(cells[1]).toBe(rows[i]!.verdict);
    }
  });

  it("quotes any field containing a comma so the columns cannot shift", () => {
    /** Minimal RFC 4180 reader — the point of the test is that a CONFORMING
     *  reader still sees exactly twelve columns. */
    const parseCsvLine = (line: string): string[] => {
      const out: string[] = [];
      let cell = "";
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else if (ch === '"') quoted = false;
          else cell += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ",") {
          out.push(cell);
          cell = "";
        } else cell += ch;
      }
      out.push(cell);
      return out;
    };

    const csv = toCsv([
      {
        championId: "x",
        refImage: "x.png",
        barcode: null,
        verdict: "FAIL",
        reasons: ["a,b", 'he said "hi"'],
        metrics: {
          foregroundRatio: 0,
          bboxHeightRatio: 0,
          maxPairwiseDeltaE: 0,
          rawRunCount: 0,
          bandCount: 0,
          framesDropped: 0,
          distinctColors: 0,
        },
        hash: "",
        tones: [],
        duplicateOf: null,
      },
    ]);
    const body = csv.trim().split("\n")[1]!;
    // a naive splitter would see thirteen fields — the comma is really there
    expect(body.split(",").length).toBeGreaterThan(CSV_HEADER.length);
    // a conforming reader sees exactly twelve, with the reasons intact
    const fields = parseCsvLine(body);
    expect(fields).toHaveLength(CSV_HEADER.length);
    expect(fields[fields.length - 1]).toBe('a,b ｜ he said "hi"');
  });

  it("re-running on an unchanged corpus produces byte-identical files", () => {
    const first = writeReport(inDir, outDir);
    const jsonA = fs.readFileSync(first.jsonPath, "utf8");
    const csvA = fs.readFileSync(first.csvPath, "utf8");
    const second = writeReport(inDir, path.join(root, "out2"));
    expect(fs.readFileSync(second.jsonPath, "utf8")).toBe(jsonA);
    expect(fs.readFileSync(second.csvPath, "utf8")).toBe(csvA);
  });
});

describe("undecodable references", () => {
  it("come back as a FAIL row with the reason spelled out, not silently skipped", () => {
    const report = buildReport(inDir);
    const row = report.rows.find((r) => r.championId === "ff-webp")!;
    expect(row.verdict).toBe("FAIL");
    expect(row.barcode).toBeNull();
    expect(row.reasons.join(" ")).toMatch(/解碼失敗/);
  });
});

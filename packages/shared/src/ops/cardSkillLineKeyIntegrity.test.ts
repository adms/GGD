/**
 * `skill_line_audit.py::key_integrity()` 的**承重守衛**（GH#814，補 `67244347` 的洞）。
 *
 * ⚠️⚠️ 為什麼要有這一條：`championCardSkillLine.test.ts` 跑的是 `--check`，而
 * `--check` 今天**接錯 0 格** ⇒ ⭐ 把 `key_integrity()` 整支換成 `return []`，
 * `--check` 照樣 **exit 0**、那條測試照樣綠（實測）。⇒ 這個 repo 唯一的
 * 「技能被覆蓋掉」偵測器（#764 草泥馬 `h02u` 那種資料毀損）**沒有東西在守它** ——
 * CLAUDE.md 失敗形態⑨/⑩：一條永遠不會紅的分支＝一條不存在的分支。
 *
 * ⭐ `67244347` 的作者**做過**這個突變，⛔ 但那是手做一次、沒留下任何東西 ——
 * ⇒ 這一條把那次一次性的突變變成**站著的閘**。
 * ⭐ **兩個方向都驗**（「一把只驗過單邊的尺不算自證過」）：join key 毀損**必須**紅；
 * 草泥馬那種**槽位互換必須不紅**（CLAUDE.md 逐字：編號↔技能綁死，**技能↔槽位是設計
 * 偏好**）。少了後面那一半，「更嚴格」會變成把 owner 的擺放判成缺陷。
 * ⛔ 不抄任何會變的數字（62／45／0 都不在斷言裡）——只驗**規則的行為**。
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { cover } from "../../testkit/cover";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const SCRIPT = join(ROOT, "tools/champion-cards/skill_line_audit.py");

/** join key 毀損的形狀 —— 取自 #764 真的發生過的那一次。 */
const BROKEN: Record<string, Record<string, string | null>> = {
  "編號重複（一支技能被另一支覆蓋掉）": { Q: "22-01", W: "22-01", E: "22-03", R: "22-04" },
  "英雄段不一致（這一格是別位英雄的）": { Q: "22-01", W: "99-02", E: "22-03", R: "22-04" },
  "槽位段 01..04 缺號（有技能不見了）": { Q: "22-01", W: "22-02", E: "22-03", R: "22-09" },
  "沒有編號前綴（join 不到原作）": { Q: "22-01", W: null, E: "22-03", R: "22-04" },
};

/** ⭐ 反方向 —— 這兩種是**對的**，判成缺陷就是誤報。 */
const CLEAN: Record<string, Record<string, string | null>> = {
  "四格齊全": { Q: "22-01", W: "22-02", E: "22-03", R: "22-04" },
  "槽位互換（草泥馬 h02u，owner 的設計偏好）": { Q: "92-02", W: "92-03", E: "92-01", R: "92-04" },
};

const PY = [
  "import importlib.util, json, sys",
  `spec = importlib.util.spec_from_file_location("sla", ${JSON.stringify(SCRIPT)})`,
  "m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)",
  "cases = json.loads(sys.argv[1])",
  "print(json.dumps({k: m.key_integrity({'codes': v}) for k, v in cases.items()}))",
].join("\n");

function keyIntegrity(cases: Record<string, Record<string, string | null>>) {
  const out = execFileSync("python3", ["-c", PY, JSON.stringify(cases)], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return JSON.parse(out) as Record<string, string[]>;
}

describe("卡面技能行的 join key 自洽性偵測器", () => {
  it("⭐ 三種 join key 毀損都指名得出來，而槽位互換不誤報", () => {
    cover("champion-card-key-integrity");

    const broken = keyIntegrity(BROKEN);
    for (const [shape, problems] of Object.entries(broken)) {
      expect(
        problems.length,
        `🚨 key_integrity() 對「${shape}」沉默了。\n` +
          "  ⛔ 不要改這條測試 —— 它守的是 #764 那種「技能被整支覆蓋掉」的資料毀損，\n" +
          "  而出貨資料今天零實例 ⇒ `--check` 綠**證明不了**這個偵測器還活著。",
      ).toBeGreaterThan(0);
    }

    const clean = keyIntegrity(CLEAN);
    for (const [shape, problems] of Object.entries(clean)) {
      expect(
        problems,
        `⛔ key_integrity() 把「${shape}」誤判成缺陷。\n` +
          "  CLAUDE.md 逐字：編號↔技能是 join key（綁死），**技能↔槽位是設計偏好**。\n" +
          "  ⇒ 判準是「這支技能還在不在」（集合完整），⛔ 不是「它掛在哪一格」。",
      ).toEqual([]);
    }
  });
});

/**
 * ⛔⛔ **AWS 金鑰不可以進 repo**（GH#1116）。
 *
 * owner 2026-09-08 設定 S3 存取時逐字寫了一整段安全規則，其中：
 *   「Never expose AWS credentials in: source code / .env files / logs /
 *     terminal output / Git / GitHub / documentation / chat messages」
 *
 * ⚠️ 而那是**判準** —— 這份 repo 已經記錄了五次判準失效。
 * ⇒ ⭐ 這一條把它換成**會紅的閘**。
 *
 * ⚠️⚠️ **金鑰進了 git 就拿不掉** —— 與素材那件事同一個理由：
 * `git rm` 只讓未來的 checkout 沒有它，⛔ 歷史還在，而且對方早就抓走了。
 * ⇒ ⭐ 真的外洩時唯一有效的動作是**在 AWS 停用那把鑰匙**，
 *   ⛔ 不是從 git 刪掉那一行。⇒ 所以這條閘要在**提交之前**響。
 *
 * ⭐ 掃的是 **git 追蹤的檔**（`git ls-files`），⛔ 不是工作區 ——
 * 因為問題是「有沒有進版控」，⛔ 不是「這台機器上有沒有」。
 * ⚠️ 這一點是刻意的：`~/.aws/credentials` 本來就該存在，而它不在 repo 裡。
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "../../../..");

/** 追蹤中的文字檔（⛔ 排除二進位與鎖檔，它們不會夾帶金鑰而且很大）。 */
function trackedTextFiles(): string[] {
  // ⚠️ `maxBuffer` 是必要的：這個 repo 追蹤一萬多個檔，預設的 1 MB 會讓 execFileSync
  //   擲 `ENOBUFS` —— ⭐ 而那看起來像「閘壞了」，⛔ 不像「輸出太大」。
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((p) => !/\.(png|webp|jpe?g|glb|mdx|mp3|ogg|wav|dds|blp|ico|woff2?|zip|safetensors)$/i.test(p))
    .filter((p) => !p.endsWith("pnpm-lock.yaml") && !p.includes("/node_modules/"));
}

/**
 * ⭐ 兩種形狀，兩種都要抓：
 * · `AKIA…` / `ASIA…` —— AWS 存取金鑰 ID 的字面樣子（20 碼大寫英數）
 * · `aws_secret_access_key = …` —— 憑證檔的欄位名帶著一個值
 *
 * ⚠️ ⛔ **不寫「40 碼 base64」那種通則** —— 它會把一堆雜湊、base64 圖、
 * minified JS 全部誤報成金鑰，而一條天天誤報的閘會被關掉，
 * ⭐ 而被關掉的閘等於沒有閘。
 */
const PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["AWS 存取金鑰 ID（AKIA/ASIA…）", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["憑證欄位帶值（aws_secret_access_key = …）", /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+=]{20,}/i],
  ["憑證欄位帶值（AWS_SECRET_ACCESS_KEY=…）", /AWS_SECRET_ACCESS_KEY\s*[=:]\s*["']?[A-Za-z0-9/+=]{20,}/],
];

describe("⛔ AWS 金鑰不可以進 repo（GH#1116）", () => {
  it("★★ ⭐ 追蹤中的每一個文字檔都沒有 AWS 金鑰", () => {
    const hits: string[] = [];
    for (const rel of trackedTextFiles()) {
      let text: string;
      try {
        text = readFileSync(join(ROOT, rel), "utf8");
      } catch {
        continue; // 檔案被刪了但索引還在 —— 與這條閘無關
      }
      for (const [what, re] of PATTERNS) {
        if (re.test(text)) hits.push(`${rel} —— ${what}`);
      }
    }
    expect(
      hits,
      "⛔⛔ 有 AWS 金鑰進了版控 ⇒\n" +
        "  ⭐ **先去 AWS 停用那把鑰匙**（⛔ 不是先從 git 刪掉那一行 —— 歷史還在）。\n" +
        "  ⭐ 正確的存放處：`~/.aws/credentials` 的 profile（`chmod 600`），\n" +
        "     ⛔ 不是 repo、⛔ 不是 `docker/.env`（它會注入**每一個容器**）。\n" +
        `  命中：\n${hits.map((h) => `    · ${h}`).join("\n")}`,
    ).toEqual([]);
  });

  it("⭐⭐ **sentinel**：檢查器對一個假金鑰真的會叫（⛔ 否則上面那條永遠綠）", () => {
    // ⚠️ 這是**虛構的**字串，形狀對而值是編的 —— ⛔ 不是任何真實憑證。
    const fake = "AKIA" + "IOSFODNN7EXAMPLE".slice(0, 16);
    expect(
      PATTERNS.some(([, re]) => re.test(`aws_access_key_id = ${fake}`)),
      "⛔ 檢查器連一個形狀正確的假金鑰都抓不到 ⇒ 上面那條的『沒有命中』毫無意義",
    ).toBe(true);
  });

  it("⭐ **反方向**：正常內容不會被誤報（⛔ 一條天天誤報的閘會被關掉）", () => {
    const innocent = [
      "const sha256 = 'e8c7fdcbc9ed61fb1cc3ebedc9e0d7022fc6b87ebcfc1bded66136bcf3a76893';",
      "AWS_PROFILE=vibe-coding aws s3 ls s3://ggd-390630837668-ap-east-2-an/",
      "arn:aws:sts::390630837668:assumed-role/vibe-coding-s3-role/botocore-session-1",
      "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==",
    ];
    for (const line of innocent) {
      expect(
        PATTERNS.filter(([, re]) => re.test(line)).map(([w]) => w),
        `⛔ 誤報：這一行沒有金鑰 —— ${line.slice(0, 60)}`,
      ).toEqual([]);
    }
  });
});

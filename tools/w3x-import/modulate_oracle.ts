/**
 * 🔮 **判準⑤ 的 CLI 出口** —— 讓 python 的抽取器問到**同一支** TypeScript。(GH#711)
 *
 * ```bash
 * echo '{"queries":[{"texturePath":"/abs/smoke_09.png","colors":[[1,1,1,1]]}]}' \
 *   | node_modules/.bin/tsx tools/w3x-import/modulate_oracle.ts
 * # -> {"threshold":0.00392…,"verdicts":[{"delta":0.18923…,"reason":null}]}
 * ```
 *
 * ⚠️⚠️ **為什麼是一支子行程，⛔ 不是一份 python 抄本**（GH#711 的核心取捨）：
 * `extract_stock_vfx.py` 在 GH#711 之前自己判「這支 modulate emitter 是不是恆等」，
 * 用的是 `WHITE_RGB_MIN = 0.98`（只看文件顏色）。那條規則**在算術上是錯的** ——
 * Babylon 的 MULTIPLY 是兩段式而且會取樣貼圖，所以白色 doc 顏色**不足以**恆等。
 * 它因此丟掉了 `MarkOfChaosTarget` 的 `BlizParticle05white02` / `white03`
 * （實測 δ=0.189 ≈ **48 倍**門檻 —— 它們是看得見的暗煙）。
 *
 * ⭐ 那是「同一個判準有兩份實作」必然的結局：兩份會漂，而漂掉的那一份**不會紅**。
 * ⇒ 判準只有一個住處：`packages/shared/src/content/modulateIdentity.ts`。
 *   出貨態掃描（`vfxDocsBirthVisibility.test.ts`）import 它；
 *   抽取器（python）透過這一支 CLI 呼叫它。**兩邊拿到的是同一個 δ 與同一句話。**
 *
 * ⚠️ 為什麼**不是**「產一份 TexStats 側車給 python 讀」：側車只搬得動**資料**，
 * δ 的那一行代數還是會留在 python 裡 —— 而 GH#709 更正的正是**那一行代數**
 * （混色式），⛔ 不是某個數字。側車還會多出第三份產物與它自己的過期閘。
 *
 * ⭐ **fail-loud**：貼圖讀不到就非零離開並指名它。⛔ 靜默跳過 = 判準對它「瞎了」，
 * 而「瞎」與「過」在輸出上長得一模一樣（CLAUDE.md 的 fail-open 那一節）。
 *
 * 輸入（stdin，一份 JSON）：`{ queries: [{ texturePath, colors: [[r,g,b,a], …] }] }`
 * 輸出（stdout，一份 JSON）：`{ threshold, verdicts: [{ delta, reason }] }`
 *   `reason === null` ⇒ 這一支動得了畫面。
 */
import { readFileSync } from "node:fs";
import {
  MODULATE_IDENTITY_DELTA,
  decodePng,
  modulateIdentityReason,
  modulateMaxDelta,
  texStatsFromRgba,
  type Rgba,
} from "../../packages/shared/src/content/modulateIdentity";

interface Query {
  texturePath: string;
  colors: Rgba[];
}

function main(): number {
  const raw = readFileSync(0, "utf8");
  const { queries } = JSON.parse(raw) as { queries: Query[] };
  const verdicts: { delta: number; reason: string | null }[] = [];
  for (const q of queries) {
    let stats;
    try {
      stats = texStatsFromRgba(decodePng(readFileSync(q.texturePath)).rgba);
    } catch (e) {
      // ⭐ fail-loud，見檔頭：讀不到貼圖 ⇒ 這一支對它是瞎的，⛔ 不是通過。
      process.stderr.write(`modulate_oracle: 讀不到貼圖 ${q.texturePath} —— ${String(e)}\n`);
      return 2;
    }
    verdicts.push({
      delta: modulateMaxDelta(q.colors, stats),
      reason: modulateIdentityReason(q.colors, stats),
    });
  }
  process.stdout.write(JSON.stringify({ threshold: MODULATE_IDENTITY_DELTA, verdicts }) + "\n");
  return 0;
}

process.exit(main());

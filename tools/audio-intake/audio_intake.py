#!/usr/bin/env python3
"""語音／音效上架檢查與轉換 —— ⭐ **遊戲讀得到的每一個音檔都要過一次**。

> owner 2026-09-15（逐字）：「請你多設計一個 script 給語音及音效使用跟模型、圖片上架的檢查及轉換類似，
>  實際遊戲會使用的語音跟音效是 128bit 44khz mp3 而不是更高音質的聲音檔
>  (若原本音質就更低就不用轉換浪費空間了) 然後全部檢查轉換所有上架角色語音，
>  轉換上架的檔案會上 git，原始素材或半成品等上 S3，還沒用到/上架的語音檔保持原始沒關係」
>  （「128bit 44khz」＝ 128 kbps、44.1 kHz 的 mp3）

形狀照 `tools/w3x-import/model_intake.py`（CLAUDE.md 第一·四之零）：只檢查／`--fix` 順便轉／`--all --check` 當閘。

逐檔問七件事：
  ① 解碼得開（含「解出來的長度與標頭對得上」—— 截斷檔的標頭長度照舊，⛔ 只有真的解碼問得出來）
  ② 長度：語音 ≥ 0.15 秒 · 音效 ≥ 0.02 秒   ③ 不是靜音（峰值 ≥ −60 dB）
  ④ 容器是 mp3   ⑤ 位元率 ≤ 128 kbps   ⑥ 取樣率 ≤ 44.1 kHz   ⑦ 語音是單聲道

⭐ 「有沒有被用到」從**讀取端**推導（`READERS`：每一列寫明哪一支程式讀那份文件，開跑時逐列驗那一行還在），
   ⛔ 不是看資料夾。沒被引用的檔**不轉、不計**，只列在分帳與報告（owner：「還沒用到/上架的語音檔保持原始沒關係」）。
   ⭐ 反方向也走：content/ 裡任何一份**沒登記**的文件引用了音檔 ⇒ 停（exit 2），⛔ 不靜默少數一批。
⭐ 門檻只住一處（第〇·四守則）—— 這支**讀**，⛔ 不抄：
   · 128 kbps／44.1 kHz ⇐ `packages/shared/src/content/audioAssetPolicy.ts`（#158 天花板在 repo 裡唯一有型別的住處）
   · 語音 0.15 秒／−60 dB ⇐ `tools/voice-gen/src/combatLinesLib.mjs`（語音管線「每一格出貨都要過的兩軸」）
   讀不到 ⇒ exit 2（⛔ 不退回預設值）。
⭐ 量尺先自證（第一守則「一把只驗過單邊的尺，不算自證過」）：每次開跑先合成「超標」「合格」「數位靜音」三顆，
   三個方向讀不對 ⇒ exit 2。

`--fix` 只轉「比標準高」的：
  · 位元率 > 天花板、取樣率 > 天花板、或語音不是單聲道 ⇒ libmp3lame，位元率 = min(天花板, 原位元率)、
    取樣率 = min(天花板, 原取樣率) ⇒ ⛔ 不升取樣、不升位元率
  · ⛔ 已經 ≤128k／≤44.1k 的 mp3 **不重轉**（二次壓縮只會失真、浪費空間）
  · ⛔ 只超位元率而**轉了不會變小** ⇒ 不轉、算合格（極短檔的 128k CBR ＋ LAME 標頭反而更大：
    `sfx/ui-type.mp3` 1,348 → 1,715 B）
  · ⛔ 非 mp3（例 `wc3/*.wav`）**不轉**：轉了就改路徑 ⇒ 只列出誰引用它、試轉省多少、改引用的做法（`--report`）
  · ⭐ 原檔先放 `--archive <outbox>/audio-intake/<時間戳>/<content 相對路徑>`（⛔ 沒給 --archive 就不轉），
    `--s3`（或事後 `--upload`）上 S3 `ggd-390630837668-ap-east-2-an/audio-intake/<時間戳>/`，
    ⭐ 上傳後整批抓回來逐檔比 SHA-256（「sync 離開碼 0」⛔ 不是上去了的證據）
  · ⭐ `voices/lines/<英雄>/<格>.mp3` 的 bytes／hash 記在同目錄 `status.json` 的 `current`：
    轉之前先驗它對得上磁碟（⛔ 對不上就不轉），轉完用語音管線自己的 `writeJsonAtomic` 重蓋
    （⛔ 否則 `index-lines.mjs` 以 byte mismatch 擋下整位英雄、`run-combat-gen.mjs` 會把它當沒算圖而重新合成）

用法：
    python3 tools/audio-intake/audio_intake.py <路徑…>                        # 只檢查（預設）
    python3 tools/audio-intake/audio_intake.py --all --check                  # 閘：有不合格就回非零（逐檔原因＋分帳）
    python3 tools/audio-intake/audio_intake.py --all --ratchet tools/audio-intake/intake-ratchet.txt
    python3 tools/audio-intake/audio_intake.py --all --report tools/audio-intake/REPORT-<日期>.json
    python3 tools/audio-intake/audio_intake.py --all --fix --archive <outbox> [--s3]
    python3 tools/audio-intake/audio_intake.py --upload <outbox>/audio-intake/<時間戳> [--dry-run]
  content/ 以外的路徑（匯入前的候選檔）沒有引用關係可查 ⇒ 一律照 `--kind`（預設 voice）檢查／轉換。
離開碼：0 合格 · 1 不合格／棘輪變了 · 2 跑不起來（⛔ 不是「沒問題」）· 3 轉檔失敗 · 4 S3 失敗
"""
import argparse, datetime, hashlib, json, os, re, shutil, subprocess, sys, tempfile, urllib.parse
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
#: ⚠️ `--content` 只給量尺自證的測試換一棵假內容樹（作者／CI 才會轉 ⇒ 旗標，⛔ 不進後台）。
CONTENT = os.path.join(ROOT, "content")
AUDIO_EXT = (".mp3", ".wav", ".ogg", ".oga", ".opus", ".flac", ".m4a", ".aac", ".aif", ".aiff", ".webm")

POLICY_TS = "packages/shared/src/content/audioAssetPolicy.ts"
VOICE_LIB = "tools/voice-gen/src/combatLinesLib.mjs"
#: ⭐ 音效的長度下限 —— **這支是它唯一的住處**。0.02 秒 ＜ 一個 MP3 幀（1152／44100 ≈ 26 ms）⇒ ＝「至少有一幀聲音」。
#: ⛔ 不套語音的 0.15 秒：出貨的 11 支音效本來就比 0.15 秒短（`sfx/fx/tick.mp3` 0.04 秒、`sfx/ui-type.mp3` 0.045 秒、
#:    `sfx/fx/footstep.mp3` 0.07 秒…），那是設計（UI／打擊的「一下」），⛔ 不是壞檔（2026-09-15 實測）。
SFX_MIN_SECONDS = 0.02
#: ⑦ 語音單聲道：主 session 2026-09-15 規格「（語音）單聲道」；語音管線 `engine.py` 與 `import-original-direct.py` 本來就出 `-ac 1`。
VOICE_CHANNELS = 1
#: 解出來的長度與標頭差多少算截斷：max(0.1 秒, 5%)。
TRUNCATION_TOLERANCE = (0.1, 0.05)
#: 轉檔前後長度漂移上限（`tools/audio-optimize/optimize.sh` 同一個數：換位元率 ⛔ 不應該動到長度）。
MAX_DRIFT_SECONDS = 0.06
MP3_KBPS = (8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320)
SILENT_DB = -999.0  # volumedetect 的 -inf（JSON 存不了 -inf）
BUCKET, PROFILE, REGION, S3_PREFIX = "ggd-390630837668-ap-east-2-an", "vibe-coding", "ap-east-2", "audio-intake"
PROBE_VERSION = "audio-intake-probe@1"
CACHE_PATH = os.environ.get("GGD_AUDIO_INTAKE_CACHE") or os.path.join(
    os.path.expanduser("~"), ".cache", "ggd-audio-intake", "measure.json")

#: 頂層目錄 → 類別。⚠️ 這張表只決定「照哪一類的規則驗」（語音要單聲道／0.15 秒），⛔ 不決定「有沒有被用到」。
KIND_BY_TOP = {"voices": "voice", "voice-taunt": "voice", "announcer": "voice", "voice-jp": "voice",
               "sfx": "sfx", "wc3": "sfx", "bgm": "bgm"}
KIND_TITLE = {"voice": "語音", "sfx": "音效", "bgm": "BGM（範圍外）", "other": "未分類（照音效驗）"}

#: ⭐ 讀取端（遊戲執行期真的會 fetch 的文件）。每一列：(content 相對路徑, 讀它的程式, 那支程式裡一定要出現的字串, 用途)。
#: ⛔ 讀取端的那一行不見了 ⇒ exit 2（它換了讀法，這張表就是過期的散文）。
READERS = (
    ("config/audio-map.json", "apps/client/src/audio/AudioSystem.ts", '"config/audio-map.json"', "BGM／音效表（bgm · mapBgm · sfx）"),
    ("config/victory-taunts.json", "apps/client/src/audio/victoryTaunt.ts", '"config/victory-taunts.json"', "勝利嘲諷語音"),
    ("config/champion-voices.json", "apps/client/src/audio/championVoice.ts", '"config/champion-voices.json"', "英雄選取語音"),
    ("assets/audio/voices/champions/MANIFEST.json", "apps/client/src/audio/selectVoiceLadder.ts",
     '"assets/audio/voices/champions/MANIFEST.json"', "英雄語音包（選取＋戰鬥情境；combat:build 從 status.json 產生）"),
    ("assets/audio/voices/names/MANIFEST.json", "apps/client/src/audio/nameVoice.ts",
     '"assets/audio/voices/names/MANIFEST.json"', "選角喊名"),
    ("assets/audio/voices/quotes/quotes.json", "apps/client/src/audio/nameVoice.ts",
     '"assets/audio/voices/quotes/quotes.json"', "選角名言"),
)
#: 程式裡寫死的音檔路徑（⛔ 註解行不算）。
CODE_READERS = (("apps/client/src/audio/bgmVariants.ts", "Samantha 輪播 BGM"),)
#: 引用了音檔、但**不是**播放端的文件 —— 每一列一個能被反駁的理由。
NOT_RUNTIME = {
    "bundle.json": "content:build 的產物：內嵌 content/config/*.json ⇒ 引用與來源文件相同（過期由 committedBundleMatchesSources 守）",
    "assets-manifest.json": "assets:manifest 的產物：被引用資產的 bytes／sha256 清單（記錄引用，⛔ 不播放）",
    "assets/audio/wc3/PROVENANCE.json": "出處帳本：credits 頁讀它顯示來源（blizzardVfxCredits.ts），播放綁定走 config/audio-map.json",
}
LINES_PREFIX = "assets/audio/voices/lines/"
FIXABLE = ("bitrate", "samplerate", "channels")


class Stop(Exception):
    """跑不起來 ⇒ exit 2（⛔ 不是「沒問題」）。"""


# ═══════════════════════════════════════════════════════════════════════════
#  門檻（讀它們的住處）與編碼參數 —— `import-original-direct.py` 也呼叫這裡
# ═══════════════════════════════════════════════════════════════════════════
def _repo_text(rel: str) -> str:
    with open(os.path.join(ROOT, rel), encoding="utf-8") as fh:
        return fh.read()


def load_policy() -> dict:
    """⭐ 門檻在載入時從住處讀（⛔ 這支不抄第二份）。讀不到 ⇒ Stop。"""
    try:
        ts, lib = _repo_text(POLICY_TS), _repo_text(VOICE_LIB)
    except OSError as exc:
        raise Stop(f"讀不到門檻的住處：{exc}") from exc
    block = re.search(r"export const GENERATED_COMBAT_FX_AUDIO_POLICY = \{(.*?)\} as const;", ts, re.S)

    def num(src, pattern, what):
        m = re.search(pattern, src or "", re.M)
        if not m:
            raise Stop(f"{what} 讀不到 ⇒ 住處改了形狀，先更新 load_policy()（⛔ 不退回預設值）")
        return float(m.group(1).replace("_", ""))

    body = block.group(1) if block else None
    return {
        "bitrateKbpsMax": int(num(body, r"bitrateKbpsMax:\s*([\d_]+)", f"{POLICY_TS} 的 bitrateKbpsMax")),
        "sampleRateHzMax": int(num(body, r"sampleRateHz:\s*([\d_]+)", f"{POLICY_TS} 的 sampleRateHz")),
        "voiceMinSeconds": num(lib, r"^export const MIN_SECONDS\s*=\s*([\d.]+)\s*;", f"{VOICE_LIB} 的 MIN_SECONDS"),
        "silencePeakDb": num(lib, r"^export const MIN_MAX_VOLUME_DB\s*=\s*(-?[\d.]+)\s*;", f"{VOICE_LIB} 的 MIN_MAX_VOLUME_DB"),
        "sfxMinSeconds": SFX_MIN_SECONDS,
        "voiceChannels": VOICE_CHANNELS,
        "codec": "libmp3lame",
        "sources": {
            "bitrateKbpsMax／sampleRateHzMax": f"{POLICY_TS}（GENERATED_COMBAT_FX_AUDIO_POLICY；audioAssets.test.ts 檔頭：整個音訊庫同一個 #158 天花板）",
            "voiceMinSeconds／silencePeakDb": f"{VOICE_LIB}（MIN_SECONDS／MIN_MAX_VOLUME_DB）",
            "sfxMinSeconds": "tools/audio-intake/audio_intake.py SFX_MIN_SECONDS（理由見該行）",
            "voiceChannels": "tools/audio-intake/audio_intake.py VOICE_CHANNELS",
        },
    }


def encode_args(policy: dict, kind: str, sample_rate=None, bitrate_kbps=None, channels=None) -> list:
    """⭐ 上架音檔的 ffmpeg 編碼參數只從這裡出。

    預設就是天花板本身（`-b:a 128k -ar 44100`，語音再加 `-ac 1`）—— `import-original-direct.py` 用預設；
    `--fix` 另外傳 min(原值, 天花板) ⇒ ⛔ 不升取樣、不升位元率。
    """
    args = ["-c:a", policy["codec"], "-b:a", f"{bitrate_kbps or policy['bitrateKbpsMax']}k",
            "-ar", str(sample_rate or policy["sampleRateHzMax"])]
    ch = policy["voiceChannels"] if kind == "voice" else channels
    return args + (["-ac", str(ch)] if ch else [])


def floor_problems(policy: dict, kind: str, seconds, peak_db) -> list:
    """② 過短 ③ 靜音 —— 語音匯入（import-original-direct.py）與這支共用同一條判準。回傳 [(代碼, 說明)]。"""
    out = []
    floor = policy["voiceMinSeconds"] if kind == "voice" else policy["sfxMinSeconds"]
    if not (seconds or 0) >= floor:
        out.append(("short", f"長度 {seconds or 0:.3f} 秒 < {floor:g} 秒"))
    if peak_db is None or peak_db < policy["silencePeakDb"]:
        shown = "−∞" if peak_db is None or peak_db <= SILENT_DB else f"{peak_db:g}"
        out.append(("silent", f"峰值 {shown} dB < {policy['silencePeakDb']:g} dB（靜音）"))
    return out


# ═══════════════════════════════════════════════════════════════════════════
#  量尺
# ═══════════════════════════════════════════════════════════════════════════
def _run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def _tail(text, n=200):
    return (text or "").strip()[-n:]


def _int(v):
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def measure(path: str) -> dict:
    """ffprobe（容器／編碼／取樣率／聲道／位元率／標頭長度）＋ 真的解碼一次（峰值、解出來的長度、錯誤訊息）。"""
    m = {"decodes": False, "container": None, "codec": None, "sampleRate": 0, "channels": 0, "bitrate": 0,
         "headerSeconds": 0.0, "seconds": 0.0, "peakDb": None, "error": None}
    p = _run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
              "format=format_name,duration,bit_rate:stream=codec_name,sample_rate,channels,bit_rate,duration",
              "-of", "json", path])
    try:
        j = json.loads(p.stdout or "{}") if p.returncode == 0 else {}
    except ValueError:
        j = {}
    st, fm = (j.get("streams") or [None])[0], j.get("format") or {}
    if not st:
        m["error"] = _tail(p.stderr) or "沒有音訊串流"
        return m
    m.update(container=fm.get("format_name"), codec=st.get("codec_name"), sampleRate=_int(st.get("sample_rate")),
             channels=_int(st.get("channels")), bitrate=_int(st.get("bit_rate")) or _int(fm.get("bit_rate")),
             headerSeconds=_float(fm.get("duration")) or _float(st.get("duration")))
    v = _run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "level+info", "-i", path,
              "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"])
    errors = [ln for ln in v.stderr.splitlines() if "[error]" in ln or "[fatal]" in ln]
    samples = re.findall(r"n_samples:\s*(\d+)", v.stderr)
    peaks = re.findall(r"max_volume:\s*(-?inf|-?[\d.]+)\s*dB", v.stderr)
    if v.returncode != 0 or errors or not peaks or not samples:
        m["error"] = "解碼有錯：" + _tail("\n".join(errors) or v.stderr, 160)
        return m
    per_second = (m["sampleRate"] or 1) * (m["channels"] or 1)
    m["seconds"] = round(int(samples[-1]) / per_second, 4)   # ⭐ 解出來的長度（⛔ 不是標頭說的）
    m["peakDb"] = SILENT_DB if "inf" in peaks[-1] else float(peaks[-1])
    m["decodes"] = True
    return m


def problems_of(policy: dict, kind: str, m: dict) -> list:
    """一個音檔的問題清單（純函式：量尺、閘、--fix 共用同一份判準）。回傳 [(代碼, 說明)]。"""
    if m is None:
        return [("missing", "引用到但檔案不存在")]
    if not m["decodes"]:
        return [("decode", f"解碼不開：{m['error']}")]
    out = []
    head, got = m["headerSeconds"], m["seconds"]
    if head and abs(head - got) > max(TRUNCATION_TOLERANCE[0], TRUNCATION_TOLERANCE[1] * head):
        out.append(("truncated", f"標頭說 {head:.3f} 秒、解出來只有 {got:.3f} 秒（截斷？）"))
    out += floor_problems(policy, kind, got, m["peakDb"])
    if not (m["container"] == "mp3" and m["codec"] == "mp3"):
        out.append(("container", f"不是 mp3（{m['container']}／{m['codec']} {m['sampleRate']} Hz {m['channels']}ch）⇒ 轉成 mp3 會改路徑"))
        return out
    ceiling = policy["bitrateKbpsMax"] * 1000
    if not m["bitrate"]:
        out.append(("bitrate-unknown", "讀不到位元率（⛔ 不當成合格）"))
    elif m["bitrate"] > ceiling:
        out.append(("bitrate", f"位元率 {m['bitrate'] / 1000:g} kbps > {policy['bitrateKbpsMax']} kbps"))
    if m["sampleRate"] > policy["sampleRateHzMax"]:
        out.append(("samplerate", f"取樣率 {m['sampleRate']} Hz > {policy['sampleRateHzMax']} Hz"))
    if kind == "voice" and m["channels"] > policy["voiceChannels"]:
        out.append(("channels", f"語音是 {m['channels']} 聲道 ⇒ 要單聲道"))
    return out


def fix_target(policy: dict, kind: str, m: dict) -> list:
    """`--fix` 的編碼參數：位元率／取樣率取 min(原值, 天花板) ⇒ ⛔ 不升。"""
    kbps = max([k for k in MP3_KBPS if k <= min(policy["bitrateKbpsMax"], (m["bitrate"] or 0) // 1000)] or [policy["bitrateKbpsMax"]])
    return encode_args(policy, kind, sample_rate=min(policy["sampleRateHzMax"], m["sampleRate"] or policy["sampleRateHzMax"]),
                       bitrate_kbps=kbps, channels=m["channels"] or None)


def ffmpeg_encode(src: str, dst: str, args: list):
    return _run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-map", "0:a:0", *args, dst])


def calibrate(policy: dict) -> list:
    """⭐ 量尺自證：超標檔要讀成超標、合格檔要讀成合格、數位靜音要讀成靜音。三個方向缺一 ⇒ Stop。"""
    tmp = tempfile.mkdtemp(prefix="audio-intake-calib-")
    try:
        ok_sr, ok_kbps = policy["sampleRateHzMax"], policy["bitrateKbpsMax"]
        over_kbps = next((k for k in MP3_KBPS if k > ok_kbps), None)
        over_sr = next((r for r in (48000,) if r > ok_sr), None)
        files = {"over": (over_sr or ok_sr, over_kbps or ok_kbps, "sine=frequency=440:duration=1"),
                 "ok": (ok_sr, ok_kbps, "sine=frequency=440:duration=1"),
                 "silence": (ok_sr, ok_kbps, f"anullsrc=r={ok_sr}:cl=mono")}
        got = {}
        for name, (sr, kbps, src) in files.items():
            out = os.path.join(tmp, f"{name}.mp3")
            r = _run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", src,
                      "-t", "1", "-ar", str(sr), "-ac", "1", "-c:a", "libmp3lame", "-b:a", f"{kbps}k", out])
            if r.returncode != 0:
                raise Stop(f"量尺自證合成不出 {name}：{_tail(r.stderr)}")
            got[name] = measure(out)
        codes = {k: {c for c, _ in problems_of(policy, "voice", v)} for k, v in got.items()}
        over_axes = ({"bitrate"} if over_kbps else set()) | ({"samplerate"} if over_sr else set())
        verdicts = [
            (bool(over_axes) and over_axes <= codes["over"], f"超標檔（{over_sr or ok_sr} Hz／{over_kbps or ok_kbps}k）讀成超標"),
            (not codes["ok"], f"合格檔（{ok_sr} Hz／{ok_kbps}k）讀成合格"),
            ("silent" in codes["silence"], "數位靜音讀成靜音"),
        ]
        bad = [what for ok, what in verdicts if not ok]
        if bad:
            raise Stop(f"量尺沒有自證（{'、'.join(bad)} 不成立；讀到 {codes}）⇒ 這一輪的每一個結論都作廢")
        return [what for _ok, what in verdicts]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def ffmpeg_version() -> str:
    r = _run(["ffmpeg", "-version"])
    return (r.stdout.splitlines() or ["?"])[0]


class Cache:
    """量測結果以**位元組的 sha256** 為鍵（＋量尺版本＋ffmpeg 版本）⇒ 同一份位元組量一次就好，⛔ 不會拿舊結論配新檔。"""

    def __init__(self, enabled: bool):
        self.enabled, self.dirty = enabled, False
        self.key = f"{PROBE_VERSION}|{ffmpeg_version()}"
        self.data = {"key": self.key, "measure": {}, "trial": {}}
        if enabled and os.path.exists(CACHE_PATH):
            try:
                with open(CACHE_PATH, encoding="utf-8") as fh:
                    old = json.load(fh)
                if old.get("key") == self.key:
                    self.data = old
            except (OSError, ValueError):
                pass

    def get(self, table, key):
        return self.data[table].get(key) if self.enabled else None

    def put(self, table, key, value):
        if self.enabled:
            self.data[table][key], self.dirty = value, True

    def save(self):
        if not (self.enabled and self.dirty):
            return
        try:
            os.makedirs(os.path.dirname(CACHE_PATH), exist_ok=True)
            tmp = f"{CACHE_PATH}.{os.getpid()}.tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self.data, fh)
            os.replace(tmp, CACHE_PATH)
        except OSError as exc:
            print(f"   ⚠️ 量測快取寫不進 {CACHE_PATH}（{exc}）—— 不影響結論，下一次重量")


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ═══════════════════════════════════════════════════════════════════════════
#  引用關係（誰讀它）
# ═══════════════════════════════════════════════════════════════════════════
def audio_refs(doc, ptr="") -> list:
    """(路徑, JSON pointer)。規則與 `packages/shared/src/content/assetReferences.ts` 的 referencedAssetPaths 同形：
    字串**值**以 `assets/` 開頭且副檔名是媒體（這裡只收音訊）。"""
    out = []
    if isinstance(doc, dict):
        for k, v in doc.items():
            out += audio_refs(v, f"{ptr}/{str(k).replace('~', '~0').replace('/', '~1')}")
    elif isinstance(doc, list):
        for i, v in enumerate(doc):
            out += audio_refs(v, f"{ptr}/{i}")
    elif isinstance(doc, str) and doc.startswith("assets/audio/") and doc.lower().endswith(AUDIO_EXT):
        out.append((doc, ptr or "/"))
    return out


def reader_line(reader: str, needle: str) -> int:
    try:
        lines = _repo_text(reader).splitlines()
    except OSError as exc:
        raise Stop(f"讀取端 {reader} 不見了（{exc}）⇒ 先更新 READERS（⛔ 不靜默少數一份引用）") from exc
    for i, line in enumerate(lines, 1):
        if needle in line:
            return i
    raise Stop(f"讀取端 {reader} 裡找不到 {needle} ⇒ 它換了讀法或位置，先更新 READERS（⛔ 不靜默少數一份引用）")


def collect_references(fake_tree: bool):
    """回傳 (refs, readers)。refs：content 相對路徑 → [{doc, pointer, reader}]。"""
    refs, readers, notes = {}, [], []
    for doc_rel, reader, needle, what in READERS:
        where = f"{reader}:{reader_line(reader, needle)}"
        path = os.path.join(CONTENT, doc_rel)
        if not os.path.exists(path):
            if fake_tree:
                notes.append(doc_rel)
                continue
            raise Stop(f"讀取端要的 content/{doc_rel} 不存在（{where}）")
        with open(path, encoding="utf-8") as fh:
            found = audio_refs(json.load(fh))
        for rel, ptr in found:
            refs.setdefault(rel, []).append({"doc": doc_rel, "pointer": ptr, "reader": where})
        readers.append({"doc": doc_rel, "reader": where, "what": what, "refs": len(found), "files": len({r for r, _ in found})})
    literal = re.compile(r"""["'`](assets/audio/[^"'`\s]+?\.(?:mp3|wav|ogg))["'`]""")
    for reader, what in () if fake_tree else CODE_READERS:     # 假內容樹裡沒有程式寫死的那幾個檔
        found = []
        for i, line in enumerate(_repo_text(reader).splitlines(), 1):
            if not line.lstrip().startswith(("*", "//", "/*")):
                found += [(hit, f"{reader}:{i}") for hit in literal.findall(line)]
        for rel, where in found:
            refs.setdefault(rel, []).append({"doc": reader, "pointer": None, "reader": where})
        readers.append({"doc": reader, "reader": reader, "what": what, "refs": len(found), "files": len({r for r, _ in found})})
    registered = {d for d, *_ in READERS}
    stray = []
    for d, dirs, names in os.walk(CONTENT):
        dirs[:] = sorted(x for x in dirs if not x.startswith(".") and x not in ("_legacy", "node_modules"))
        for n in sorted(names):
            if not n.endswith(".json"):
                continue
            p = os.path.join(d, n)
            rel = os.path.relpath(p, CONTENT)
            if rel in registered or rel in NOT_RUNTIME:
                continue
            with open(p, encoding="utf-8", errors="replace") as fh:
                text = fh.read()
            if '"assets/audio/' not in text:
                continue
            try:
                if audio_refs(json.loads(text)):
                    stray.append(rel)
            except ValueError:
                continue
    if stray:
        raise Stop("這幾份文件引用了音檔，但既不在 READERS 也不在 NOT_RUNTIME ⇒ 先登記（誰讀它？）："
                   + "、".join(f"content/{s}" for s in stray))
    if notes:
        print(f"   ⚠️ --content 假內容樹：缺 {'、'.join(notes)}，當成沒有引用")
    return refs, readers


# ═══════════════════════════════════════════════════════════════════════════
#  逐檔分類
# ═══════════════════════════════════════════════════════════════════════════
def audio_rel(abs_path: str):
    base = os.path.join(CONTENT, "assets", "audio")
    rel = os.path.relpath(abs_path, base)
    return None if rel.startswith("..") else rel.replace(os.sep, "/")


def group_of(rel_audio: str) -> str:
    parts = rel_audio.split("/")
    if len(parts) >= 3 and parts[0] in ("voices", "voice-taunt", "sfx", "announcer", "voice-jp"):
        return f"{parts[0]}/{parts[1]}"
    return parts[0] if len(parts) >= 2 else "(audio 根目錄)"


def gather(paths, scan_all):
    targets = list(paths) or ([os.path.join(CONTENT, "assets", "audio")] if scan_all else [])
    files = []
    for p in targets:
        if os.path.isdir(p):
            for d, _dirs, names in os.walk(p):
                files += [os.path.join(d, n) for n in names if n.lower().endswith(AUDIO_EXT)]
        elif p.lower().endswith(AUDIO_EXT):
            files.append(p)
    return sorted({os.path.abspath(f) for f in files})


def build_rows(files, refs, policy, cache, jobs, scan_all, external_kind):
    rows = []
    for f in files:
        rel = audio_rel(f)
        if rel is None:
            rows.append({"abs": f, "path": os.path.relpath(f, ROOT), "group": "(content 以外的候選)", "kind": external_kind,
                         "content": None, "refs": [{"doc": "(匯入候選：沒有引用關係可查)", "pointer": None, "reader": None}]})
            continue
        content_rel = f"assets/audio/{rel}"
        kind = KIND_BY_TOP.get(rel.split("/")[0], "other")
        rows.append({"abs": f, "path": os.path.relpath(f, ROOT), "group": group_of(rel), "kind": kind,
                     "content": content_rel, "refs": refs.get(content_rel, [])})
    if scan_all:
        have = {r["content"] for r in rows}
        for content_rel in sorted(set(refs) - have):
            rel = content_rel[len("assets/audio/"):]
            rows.append({"abs": os.path.join(CONTENT, content_rel), "path": os.path.relpath(os.path.join(CONTENT, content_rel), ROOT),
                         "group": group_of(rel), "kind": KIND_BY_TOP.get(rel.split("/")[0], "other"),
                         "content": content_rel, "refs": refs[content_rel], "missing": True})
    with ThreadPoolExecutor(jobs) as ex:
        shas = list(ex.map(lambda r: None if r.get("missing") or not os.path.exists(r["abs"]) else sha256_file(r["abs"]), rows))
    todo = []
    for r, sha in zip(rows, shas):
        r["sha256"], r["bytes"] = sha, (os.path.getsize(r["abs"]) if sha else 0)
        r["m"] = cache.get("measure", sha) if sha else None
        if sha and r["m"] is None:
            todo.append(r)
    with ThreadPoolExecutor(jobs) as ex:
        for r, m in zip(todo, ex.map(lambda r: measure(r["abs"]), todo)):
            r["m"] = m
            cache.put("measure", r["sha256"], m)
    for r in rows:
        r["referenced"] = bool(r["refs"])
        r["inScope"] = r["referenced"] and r["kind"] != "bgm"
        r["problems"] = problems_of(policy, "sfx" if r["kind"] == "other" else r["kind"], r["m"])
        r["note"], r["trial"] = None, None
    return rows


def trial(r, policy, cache):
    """試轉到暫存目錄量大小（以位元組 sha＋參數快取）。回傳 {bytes, args, problems}。"""
    kind = "sfx" if r["kind"] == "other" else r["kind"]
    args = fix_target(policy, kind, r["m"])
    key = f"{r['sha256']}|{' '.join(args)}"
    hit = cache.get("trial", key)
    if hit is None:
        tmp = tempfile.mkdtemp(prefix="audio-intake-trial-")
        try:
            out = os.path.join(tmp, "trial.mp3")
            e = ffmpeg_encode(r["abs"], out, args)
            if e.returncode != 0:
                hit = {"bytes": None, "args": args, "problems": [["encode", f"試轉失敗：{_tail(e.stderr)}"]]}
            else:
                mo = measure(out)
                probs = [list(p) for p in problems_of(policy, kind, mo)]
                if mo["decodes"] and abs(mo["seconds"] - r["m"]["seconds"]) > MAX_DRIFT_SECONDS:
                    probs.append(["drift", f"長度漂移 {r['m']['seconds']:.3f} → {mo['seconds']:.3f} 秒"])
                hit = {"bytes": os.path.getsize(out), "args": args, "problems": probs}
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        cache.put("trial", key, hit)
    return hit


def settle_never_grow(rows, policy, cache, jobs):
    """只超位元率的 mp3：試轉不會變小 ⇒ 不轉、算合格（owner：「若原本音質就更低就不用轉換浪費空間了」）。"""
    cands = [r for r in rows if (r["inScope"] or r["content"] is None) and {c for c, _ in r["problems"]} == {"bitrate"}]
    with ThreadPoolExecutor(jobs) as ex:
        for r, t in zip(cands, ex.map(lambda r: trial(r, policy, cache), cands)):
            r["trial"] = t
            if t["bytes"] is not None and not t["problems"] and t["bytes"] >= r["bytes"]:
                r["note"] = f"位元率 {r['m']['bitrate'] / 1000:g} kbps 超過，但試轉 {r['bytes']:,} → {t['bytes']:,} B 不會變小 ⇒ 保留原檔（算合格）"
                r["problems"] = []


def is_fixable(r) -> bool:
    codes = {c for c, _ in r["problems"]}
    return bool(codes) and codes <= set(FIXABLE) and (r["inScope"] or r["content"] is None)


# ═══════════════════════════════════════════════════════════════════════════
#  --fix（先留底再改）＋ 語音包 status.json 重蓋 ＋ S3
# ═══════════════════════════════════════════════════════════════════════════
def status_target(content_rel):
    """`assets/audio/voices/lines/<英雄>/<格>.mp3` → (status.json 絕對路徑, 格)。"""
    if not content_rel or not content_rel.startswith(LINES_PREFIX):
        return None
    parts = content_rel[len(LINES_PREFIX):].split("/")
    if len(parts) != 2 or not parts[1].endswith(".mp3"):
        return None
    return os.path.join(CONTENT, "assets", "audio", "voices", "lines", parts[0], "status.json"), parts[1][:-4]


def status_matches(target, r) -> str:
    """⛔ 先驗鑰匙：status.json 的 current 要對得上**轉之前**的磁碟位元組，否則回傳原因（不轉）。"""
    path, cat = target
    try:
        with open(path, encoding="utf-8") as fh:
            cur = ((json.load(fh).get("lines") or {}).get(cat) or {}).get("current")
    except (OSError, ValueError) as exc:
        return f"讀不到 {os.path.relpath(path, ROOT)}（{exc}）"
    if not cur:
        return f"{os.path.relpath(path, ROOT)} 沒有 lines[{cat}].current"
    if cur.get("bytes") != r["bytes"] or cur.get("hash") != r["sha256"]:
        return f"{os.path.relpath(path, ROOT)} 的 current 本來就對不上磁碟 ⇒ 先跑 combat:build 對齊（⛔ 不在過期的紀錄上疊一次轉檔）"
    return ""


RESTAMP_MJS = """
import { readFileSync } from "node:fs";
import { writeJsonAtomic } from %s;
const out = [];
for (const e of JSON.parse(readFileSync(0, "utf8"))) {
  const doc = JSON.parse(readFileSync(e.status, "utf8"));
  const cur = doc?.lines?.[e.cat]?.current;
  if (!cur || cur.bytes !== e.beforeBytes || cur.hash !== e.beforeSha256) { out.push({ ...e, restamped: false }); continue; }
  Object.assign(cur, { bytes: e.afterBytes, hash: e.afterSha256, seconds: e.afterSeconds });
  writeJsonAtomic(e.status, doc);
  out.push({ ...e, restamped: true });
}
process.stdout.write(JSON.stringify(out));
"""


def restamp_status(edits) -> list:
    """用語音管線自己的 `writeJsonAtomic`（同一種序列化）重蓋 current —— ⛔ 不用 python 的 json.dumps 猜 JS 的格式。"""
    lib_url = json.dumps("file://" + urllib.parse.quote(os.path.join(ROOT, VOICE_LIB)))
    tmp = tempfile.mkdtemp(prefix="audio-intake-restamp-")
    try:
        script = os.path.join(tmp, "restamp.mjs")
        with open(script, "w", encoding="utf-8") as fh:
            fh.write(RESTAMP_MJS % lib_url)
        r = _run(["node", script], input=json.dumps(edits))
        if r.returncode != 0:
            return [{**e, "restamped": False, "error": _tail(r.stderr)} for e in edits]
        return json.loads(r.stdout)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def fix_rows(rows, policy, cache, archive_root, stamp):
    stamp_dir = os.path.join(os.path.abspath(archive_root), S3_PREFIX, stamp)
    receipts, failed, skipped = [], [], []
    for r in [x for x in rows if is_fixable(x)]:
        kind = "sfx" if r["kind"] == "other" else r["kind"]
        target = status_target(r["content"])
        why = status_matches(target, r) if target else ""
        if why:
            skipped.append((r["path"], why))
            continue
        args = fix_target(policy, kind, r["m"])     # ⭐ 「轉了不會變小」在 settle_never_grow() 已經先分掉了
        tmp = tempfile.mkdtemp(prefix="audio-intake-fix-")
        try:
            out = os.path.join(tmp, "out.mp3")
            e = ffmpeg_encode(r["abs"], out, args)
            mo = measure(out) if e.returncode == 0 else None
            probs = problems_of(policy, kind, mo) if mo else [("encode", f"轉檔失敗：{_tail(e.stderr)}")]
            if mo and mo["decodes"] and abs(mo["seconds"] - r["m"]["seconds"]) > MAX_DRIFT_SECONDS:
                probs.append(("drift", f"長度漂移 {r['m']['seconds']:.3f} → {mo['seconds']:.3f} 秒"))
            if probs:
                failed.append((r["path"], "；".join(p[1] for p in probs)))
                continue
            # ⭐ 留底：先複製、驗 sha，再動原檔。
            keep = os.path.join(stamp_dir, r["content"] if r["content"] else os.path.join("external", os.path.basename(r["abs"])))
            os.makedirs(os.path.dirname(keep), exist_ok=True)
            shutil.copy2(r["abs"], keep)
            if sha256_file(keep) != r["sha256"]:
                failed.append((r["path"], f"留底 {keep} 的 sha256 對不上 ⇒ ⛔ 不動原檔"))
                continue
            staged = f"{r['abs']}.audio-intake.tmp"
            shutil.copyfile(out, staged)
            os.replace(staged, r["abs"])
            after = {"sha256": sha256_file(r["abs"]), "bytes": os.path.getsize(r["abs"]), "seconds": mo["seconds"]}
            receipts.append({"path": r["path"], "archived": os.path.relpath(keep, stamp_dir), "args": args,
                             "before": {"sha256": r["sha256"], "bytes": r["bytes"], "bitrate": r["m"]["bitrate"],
                                        "sampleRate": r["m"]["sampleRate"], "channels": r["m"]["channels"]},
                             "after": {**after, "bitrate": mo["bitrate"], "sampleRate": mo["sampleRate"], "channels": mo["channels"]}})
            if target:
                res = restamp_status([{"status": target[0], "cat": target[1], "beforeBytes": r["bytes"], "beforeSha256": r["sha256"],
                                       "afterBytes": after["bytes"], "afterSha256": after["sha256"], "afterSeconds": after["seconds"]}])
                if not (res and res[0].get("restamped")):
                    shutil.copy2(keep, r["abs"])          # ⛔ 重蓋失敗 ⇒ 還原，⛔ 不留一個 status.json 對不上的轉檔
                    receipts.pop()
                    failed.append((r["path"], f"status.json 重蓋失敗、已還原原檔：{(res or [{}])[0].get('error', '鑰匙在轉檔期間變了')}"))
                    continue
            r["m"], r["sha256"], r["bytes"], r["problems"] = mo, after["sha256"], after["bytes"], []
            cache.put("measure", after["sha256"], mo)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
    if receipts:
        os.makedirs(stamp_dir, exist_ok=True)
        path = os.path.join(stamp_dir, "RECEIPT.json")
        old = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"conversions": []}
        old.update(schema="ggd-audio-intake-receipt@1", tool="tools/audio-intake/audio_intake.py",
                   s3=f"s3://{BUCKET}/{S3_PREFIX}/{stamp}/", conversions=old["conversions"] + receipts)
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(old, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
    return stamp_dir, receipts, failed, skipped


def mentions(basenames) -> dict:
    """轉完之後，content/ 裡還提到這些檔名的地方（bytes／位元率／雜湊的描述可能要跟著動）。

    ⛔ 不列讀取端文件與兩份產物：它們只以**路徑**引用（路徑沒變），而語音包 MANIFEST／assets-manifest／bundle
    的雜湊由印出來的重生成指令處理。"""
    hits = {b: [] for b in basenames}
    skip = {os.path.join(CONTENT, d) for d, *_ in READERS} | {os.path.join(CONTENT, "bundle.json"), os.path.join(CONTENT, "assets-manifest.json")}
    for d, dirs, names in os.walk(CONTENT):
        dirs[:] = [x for x in dirs if not x.startswith(".") and x != "_legacy"]
        for n in names:
            p = os.path.join(d, n)
            if not n.endswith((".json", ".md")) or p in skip:
                continue
            try:
                with open(p, encoding="utf-8", errors="replace") as fh:
                    lines = fh.read().splitlines()
            except OSError:
                continue
            for b in basenames:
                rows = [i for i, ln in enumerate(lines, 1) if b in ln]
                if rows:
                    hits[b].append(f"{os.path.relpath(p, ROOT)}:{','.join(map(str, rows[:4]))}")
    return hits


def _tree_sha(base: str) -> dict:
    return {os.path.relpath(os.path.join(d, n), base): sha256_file(os.path.join(d, n))
            for d, _dirs, names in os.walk(base) for n in names}


def upload_archive(stamp_dir: str, dry_run: bool) -> int:
    """留底上 S3，⭐ 整批抓回來逐檔比 SHA-256（照 `tools/voice-gen/import-original-direct.py` 的寫法）。"""
    stamp_dir = os.path.abspath(stamp_dir)
    stamp = os.path.basename(stamp_dir.rstrip(os.sep))
    if not re.fullmatch(r"\d{8}-\d{6}", stamp) or os.path.basename(os.path.dirname(stamp_dir)) != S3_PREFIX:
        print(f"⛔ --upload 要指到 <outbox>/{S3_PREFIX}/<YYYYMMDD-HHMMSS>（收到 {stamp_dir}）")
        return 2
    local = _tree_sha(stamp_dir)
    if not local:
        print(f"⛔ {stamp_dir} 是空的")
        return 2
    dest = f"s3://{BUCKET}/{S3_PREFIX}/{stamp}"
    sync = ["aws", "s3", "sync", stamp_dir, dest, "--profile", PROFILE, "--region", REGION, "--only-show-errors"]
    if dry_run:
        print(f"（dry-run）會上傳 {len(local)} 檔：{' '.join(sync)}\n（dry-run）之後 aws s3 cp {dest}/ <暫存> --recursive 抓回來逐檔比 SHA-256")
        return 0
    s = _run(sync)
    if s.returncode != 0:
        print(f"⛔ S3 留底上傳失敗（{len(local)} 檔）：action=s3:PutObject resource={dest}\n{_tail(s.stderr, 400)}")
        return 4
    back = tempfile.mkdtemp(prefix="audio-intake-back-")
    try:
        g = _run(["aws", "s3", "cp", f"{dest}/", back, "--recursive", "--profile", PROFILE, "--region", REGION, "--only-show-errors"])
        remote = _tree_sha(back)
    finally:
        shutil.rmtree(back, ignore_errors=True)
    same = g.returncode == 0 and local == remote
    print(f"S3 留底：上傳 {len(local)} 檔 · 讀回 {len(remote)} 檔 · SHA-256 {'全部相符' if same else '⛔ 不相符'} → {dest}/")
    return 0 if same else 4


# ═══════════════════════════════════════════════════════════════════════════
#  分帳、報告、棘輪
# ═══════════════════════════════════════════════════════════════════════════
LEDGER_COLS = (("files", "檔數"), ("referenced", "被引用"), ("ok", "合格"), ("toConvert", "待轉"), ("nonMp3", "非mp3"),
               ("silent", "靜音"), ("short", "過短"), ("broken", "壞檔"), ("unreferenced", "未引用"), ("unrefOver", "未引用超標"))
RATCHET_KEYS = ("voice", "sfx")


def ledger(rows) -> dict:
    groups = {}
    for r in rows:
        g = groups.setdefault(r["group"], {k: 0 for k, _ in LEDGER_COLS} | {"kind": r["kind"], "bytes": 0})
        codes = {c for c, _ in r["problems"]}
        g["files"] += 0 if r.get("missing") else 1
        g["bytes"] += r["bytes"]
        if not r["referenced"]:
            g["unreferenced"] += 1
            g["unrefOver"] += bool(codes & {"bitrate", "samplerate", "channels", "container"})
            continue
        g["referenced"] += 1
        g["ok"] += not codes                      # BGM 也量（只是不轉、不進棘輪）
        g["toConvert"] += is_fixable(r)
        g["nonMp3"] += "container" in codes
        g["silent"] += "silent" in codes
        g["short"] += "short" in codes
        g["broken"] += bool(codes & {"decode", "truncated", "missing", "bitrate-unknown"})
    return dict(sorted(groups.items()))


def read_ratchet(path: str) -> dict:
    """基準線：一行一個 `鍵=數字`。⛔ 缺一個就停（⛔ 不當成 0）。"""
    got = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.fullmatch(r"\s*([a-z_]+)\s*=\s*(\d+)\s*", line)
            if m:
                got[m.group(1)] = int(m.group(2))
    if set(got) != set(RATCHET_KEYS):
        raise Stop(f"{os.path.relpath(path, ROOT)} 要有 {'／'.join(k + '=…' for k in RATCHET_KEYS)} 兩行（讀到 {sorted(got)}）")
    return got


#: 非 mp3 的目錄 → 改引用的做法。⛔ 這一輪不改引用（主 session 2026-09-15）；新出現的目錄走 `_generic`。
NON_MP3_PLAYBOOK = {
    "assets/audio/wc3/": [
        "寫入端是 tools/w3x-import/build_vfx_sound_bindings.py（CLIP_URL = \"assets/audio/wc3/\"、out_name = … + \".wav\"；"
        "它同時寫 config/audio-map.json 的 wc3.* files 與 wc3/PROVENANCE.json／.md）⇒ ⛔ 不要手改 audio-map.json 的副檔名（下一次重跑就被打回來）。",
        "① 改寫入端：抽出 WAV 之後用 audio_intake.encode_args(policy, 'sfx', sample_rate=min(原取樣率, 天花板)) 轉 mp3，"
        "out_name 改 .mp3；PROVENANCE 的 file／bytes／sha256 改記 mp3，另加 sourceSha256 記 MPQ 抽出的 WAV（出處仍逐位元組可驗）。",
        "② 原 WAV 放 outbox 的 audio-intake/<時間戳>/assets/audio/wc3/，`audio_intake.py --upload` 上 S3 並抓回比 SHA-256；git 刪掉 WAV。",
        "③ 重跑寫入端 → `pnpm assets:manifest` → `content:build`；client 的 blizzardVfxCredits.ts 直接 import PROVENANCE.json（顯示出處）要一起看。",
        "④ `audio_intake.py --all --check`、wc3SoundClips.test.ts（key → 檔案存在）、audioAssets.test.ts（引用的檔存在）綠；intake-ratchet.txt 的 sfx= 降 132。",
    ],
    "_generic": [
        "⛔ 不要只改引用文件的副檔名：先找寫入端（toolsMentioningThisDir 裡寫出這個路徑的那一支）改成直接出 mp3，重跑它。",
        "原檔放 outbox 的 audio-intake/<時間戳>/ 上 S3（--upload 抓回比 SHA-256）；重跑 assets:manifest → content:build；--check 綠後把棘輪降下來。",
    ],
}


def writers_of(prefix: str) -> list:
    """tools/ 與 scripts/ 裡**提到**這個目錄路徑的行（寫入端在其中；⚠️ 也可能只是說明文字，逐行看）。"""
    out = []
    for base in ("tools", "scripts"):
        for d, dirs, names in os.walk(os.path.join(ROOT, base)):
            dirs[:] = [x for x in dirs if x not in ("node_modules", "out", "__pycache__", "audio-intake") and not x.startswith(".")]
            for n in names:
                if n.endswith((".py", ".ts", ".mts", ".mjs", ".js", ".sh")):
                    p = os.path.join(d, n)
                    with open(p, encoding="utf-8", errors="replace") as fh:
                        rows = [i for i, ln in enumerate(fh.read().splitlines(), 1) if prefix in ln]
                    if rows:
                        out.append(f"{os.path.relpath(p, ROOT)}:{','.join(map(str, rows[:5]))}")
    return sorted(out)


def _mentions_prefix(doc_rel: str, prefix: str) -> bool:
    try:
        with open(os.path.join(CONTENT, doc_rel), encoding="utf-8", errors="replace") as fh:
            return f'"{prefix}' in fh.read()
    except OSError:
        return False


def build_report(rows, groups, readers, policy, calib, cache, jobs) -> dict:
    to_convert = [r for r in rows if is_fixable(r)]
    non_mp3 = [r for r in rows if r["inScope"] and "container" in {c for c, _ in r["problems"]}]
    with ThreadPoolExecutor(jobs) as ex:
        for r, t in zip(to_convert + non_mp3, ex.map(lambda r: r["trial"] or trial(r, policy, cache), to_convert + non_mp3)):
            r["trial"] = t

    def saved(r):
        return r["bytes"] - r["trial"]["bytes"] if r["trial"] and r["trial"]["bytes"] is not None else None

    def one(r):
        m = r["m"] or {}
        return {"path": r["path"], "kind": r["kind"], "codec": m.get("codec"), "container": m.get("container"),
                "bitrateKbps": round((m.get("bitrate") or 0) / 1000, 1), "sampleRateHz": m.get("sampleRate"), "channels": m.get("channels"),
                "seconds": m.get("seconds"), "bytes": r["bytes"], "problems": [p[1] for p in r["problems"]],
                "trialBytes": (r["trial"] or {}).get("bytes"), "savedBytes": saved(r), "trialArgs": (r["trial"] or {}).get("args"),
                "referencedBy": r["refs"]}

    by_dir = {}
    for r in non_mp3:
        by_dir.setdefault(r["content"].rsplit("/", 1)[0] + "/", []).append(r)
    unref_over = [r for r in rows if not r["referenced"] and {c for c, _ in r["problems"]} & {"bitrate", "samplerate", "channels", "container"}]
    info_short_sfx = [{"path": r["path"], "seconds": r["m"]["seconds"]} for r in rows
                      if r["inScope"] and r["kind"] != "voice" and r["m"] and r["m"]["decodes"] and r["m"]["seconds"] < policy["voiceMinSeconds"]]
    return {
        "schema": "ggd-audio-intake-report@1",
        "generatedBy": "python3 tools/audio-intake/audio_intake.py --all --report <這個檔>",
        "owner": "2026-09-15「實際遊戲會使用的語音跟音效是 128bit 44khz mp3 而不是更高音質的聲音檔 (若原本音質就更低就不用轉換浪費空間了) "
                 "然後全部檢查轉換所有上架角色語音，轉換上架的檔案會上 git，原始素材或半成品等上 S3，還沒用到/上架的語音檔保持原始沒關係」",
        "policy": policy,
        "rulerSelfProof": calib,
        "readers": readers,
        "notRuntime": NOT_RUNTIME,
        "totals": {
            "files": sum(g["files"] for g in groups.values()),
            "bytes": sum(g["bytes"] for g in groups.values()),
            **{k: sum(g[k] for g in groups.values() if g["kind"] != "bgm") for k, _ in LEDGER_COLS if k not in ("files",)},
            "toConvertSavedBytes": sum(saved(r) or 0 for r in to_convert),
            "nonMp3SavedBytesIfConverted": sum(saved(r) or 0 for r in non_mp3),
        },
        "groups": groups,
        "toConvert": [one(r) for r in to_convert],
        "keptBecauseReencodeDoesNotShrink": [{"path": r["path"], "note": r["note"]} for r in rows if r["note"]],
        "nonMp3": {
            "count": len(non_mp3),
            "byDirectory": {d: {"files": len(rs), "bytes": sum(r["bytes"] for r in rs), "trialMp3Bytes": sum((r["trial"] or {}).get("bytes") or 0 for r in rs),
                                "docsReferencing": sorted({x["doc"] for r in rs for x in r["refs"]}),
                                "alsoRecordedIn": sorted(doc for doc in NOT_RUNTIME if _mentions_prefix(doc, d)),
                                "toolsMentioningThisDir": writers_of(d),
                                "playbook": NON_MP3_PLAYBOOK.get(d, NON_MP3_PLAYBOOK["_generic"])}
                            for d, rs in sorted(by_dir.items())},
            "files": [one(r) for r in non_mp3],
        },
        "unreferencedOverSpecKeptOriginal": [{"path": r["path"], "problems": [p[1] for p in r["problems"]], "bytes": r["bytes"]} for r in unref_over],
        "infoShortSfx": info_short_sfx,
    }


def print_ledger(groups):
    print("   分帳（被引用的才算合格／不合格；BGM 範圍外只量不轉）：")
    head = f"   {'目錄':<32}{'類別':<8}" + "".join(f"{t:>8}" for _k, t in LEDGER_COLS) + f"{'MB':>9}"
    print(head)
    short = {"voice": "語音", "sfx": "音效", "bgm": "BGM範圍外", "other": "其他"}
    for name, g in groups.items():
        print(f"   {name:<32}{short[g['kind']]:<8}" + "".join(f"{g[k]:>8}" for k, _t in LEDGER_COLS) + f"{g['bytes'] / 1048576:>9.2f}")


def main() -> int:
    global CONTENT
    ap = argparse.ArgumentParser(description="語音／音效上架檢查與轉換（owner 2026-09-15：128 kbps／44.1 kHz mp3）")
    ap.add_argument("paths", nargs="*")
    ap.add_argument("--all", action="store_true", help="掃 content/assets/audio")
    ap.add_argument("--check", action="store_true", help="有不合格就回非零（閘模式）")
    ap.add_argument("--fix", action="store_true", help="⛔ 就地轉「比標準高」的（要 --archive 留底）")
    ap.add_argument("--archive", metavar="DIR", help="--fix 的原檔留底 outbox（寫進 DIR/audio-intake/<時間戳>/）")
    ap.add_argument("--s3", action="store_true", help="--fix 之後把這一批留底上 S3 並抓回比 SHA-256")
    ap.add_argument("--upload", metavar="STAMP_DIR", help="只上傳一批既有留底（DIR/audio-intake/<時間戳>）")
    ap.add_argument("--dry-run", action="store_true", help="--upload／--s3 只印要做什麼")
    ap.add_argument("--ratchet", metavar="FILE", help="棘輪：被引用的不合格檔數（voice／sfx）與基準線比")
    ap.add_argument("--report", metavar="OUT", help="寫出 JSON 報告（各目錄檔數、待轉、試轉省多少、非 mp3 與引用者）")
    ap.add_argument("--kind", choices=("voice", "sfx"), default="voice", help="content 以外的候選檔照哪一類驗")
    ap.add_argument("--content", metavar="DIR", help="⚠️ 只給量尺自證的測試：換一棵內容樹")
    ap.add_argument("--no-cache", action="store_true", help=f"不讀寫量測快取（{CACHE_PATH}）")
    ap.add_argument("--jobs", type=int, default=min(16, os.cpu_count() or 4))
    a = ap.parse_args()
    if a.upload:
        return upload_archive(a.upload, a.dry_run)
    if a.content:
        CONTENT = os.path.abspath(a.content)
    if a.fix and not a.archive:
        print("⛔ --fix 一定要 --archive <outbox>：⛔ 沒有留底就不轉（原檔之後要上 S3）")
        return 2
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        print("⛔ 找不到 ffmpeg／ffprobe ⇒ 跑不起來（⛔ 不是「沒問題」）")
        return 2
    try:
        policy = load_policy()
        calib = calibrate(policy)
        files = gather(a.paths, a.all)
        if not files:
            print("⛔ 沒有指定任何音檔（用 --all 掃 content/assets/audio）")
            return 2
        refs, readers = collect_references(bool(a.content)) if (a.all or any(audio_rel(f) for f in files)) else ({}, [])
        base = read_ratchet(a.ratchet) if a.ratchet else None
    except Stop as exc:
        print(f"⛔ {exc}")
        return 2
    cache = Cache(not a.no_cache)
    rows = build_rows(files, refs, policy, cache, a.jobs, a.all, a.kind)
    settle_never_grow(rows, policy, cache, a.jobs)
    print(f"⭐ 音訊入庫檢查：天花板 {policy['bitrateKbpsMax']} kbps／{policy['sampleRateHzMax']} Hz（讀 {POLICY_TS}）"
          f" · 語音 ≥{policy['voiceMinSeconds']:g} 秒、峰值 ≥{policy['silencePeakDb']:g} dB（讀 {VOICE_LIB}）· 音效 ≥{SFX_MIN_SECONDS:g} 秒")
    print(f"   量尺自證：{' · '.join(calib)} ✓")
    code = 0
    if a.fix:
        stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        stamp_dir, receipts, failed, skipped = fix_rows(rows, policy, cache, a.archive, stamp)
        print(f"\n⭐ --fix：轉了 {len(receipts)} 檔（省 {sum(x['before']['bytes'] - x['after']['bytes'] for x in receipts):,} B）"
              f" · ⛔ 失敗 {len(failed)} · 跳過 {len(skipped)}")
        for x in receipts:
            b, f = x["before"], x["after"]
            print(f"   {x['path']}  {b['bitrate'] / 1000:g}k/{b['sampleRate']}Hz/{b['channels']}ch {b['bytes']:,} B → "
                  f"{f['bitrate'] / 1000:g}k/{f['sampleRate']}Hz/{f['channels']}ch {f['bytes']:,} B")
        for p, why in failed + skipped:
            print(f"   ⛔ {p} —— {why}")
        if receipts:
            print(f"   留底：{stamp_dir}（RECEIPT.json 逐檔記 sha256）")
            hits = mentions(sorted({os.path.basename(x["path"]) for x in receipts}))
            touched = [h for hs in hits.values() for h in hs]
            if touched:
                print("   ⚠️ content/ 裡提到這些檔名的地方（位元組／位元率／雜湊的描述可能要跟著動，逐檔核對）：")
                for h in sorted(set(touched))[:30]:
                    print(f"      {h}")
            print("   ⇒ 接著（主 session，產生器有全域鎖）：`pnpm assets:manifest`（被引用資產的 sha256）"
                  + ("；`bash scripts/genrun.sh combat:build`（語音包 MANIFEST 的 hash）" if any(x["path"].find("/voices/lines/") >= 0 for x in receipts) else "")
                  + "；然後 `content:build`。")
            if a.s3:
                code = max(code, upload_archive(stamp_dir, a.dry_run))
            else:
                print(f"   ⇒ 原檔上 S3：python3 tools/audio-intake/audio_intake.py --upload {stamp_dir}")
        if failed:
            code = max(code, 3)
    groups = ledger(rows)
    in_scope_bad = [r for r in rows if r["inScope"] or r["content"] is None]
    in_scope_bad = [r for r in in_scope_bad if r["problems"]]
    n_ref = sum(1 for r in rows if r["referenced"] and not r.get("missing"))
    n_missing = sum(1 for r in rows if r.get("missing"))
    print(f"\n⭐ 掃了 {sum(g['files'] for g in groups.values())} 檔 · 被引用 {n_ref} · 未引用 {len(rows) - n_ref - n_missing}（不轉、不計）"
          + (f" · 引用到但不存在 {n_missing}" if n_missing else "") + f" · ⛔ 不合格 {len(in_scope_bad)}")
    for r in rows:
        if r["note"] and r["inScope"]:
            print(f"   ⭐ {r['path']} —— {r['note']}")
    if not a.ratchet:
        for r in in_scope_bad:
            where = r["refs"][0]
            label = "待轉（--fix）" if is_fixable(r) else ("要改引用（非 mp3）" if "container" in {c for c, _ in r["problems"]} else "要人處理")
            print(f"   ⛔ {r['path']} [{KIND_TITLE[r['kind']]} · {where['doc']}{'#' + where['pointer'] if where['pointer'] else ''}] {label}：{'；'.join(p[1] for p in r['problems'])}")
    print_ledger(groups)
    if a.report:
        report = build_report(rows, groups, readers, policy, calib, cache, a.jobs)
        with open(a.report, "w", encoding="utf-8") as fh:
            json.dump(report, fh, ensure_ascii=False, indent=1)
            fh.write("\n")
        t = report["totals"]
        print(f"   報告 → {os.path.relpath(os.path.abspath(a.report), ROOT)}：待轉 {t['toConvert']} 檔試轉省 {t['toConvertSavedBytes']:,} B"
              f" · 非 mp3 {report['nonMp3']['count']} 檔試轉省 {t['nonMp3SavedBytesIfConverted']:,} B（要改引用）")
    cache.save()
    if base:
        count = {"voice": sum(1 for r in in_scope_bad if r["kind"] == "voice"),
                 "sfx": sum(1 for r in in_scope_bad if r["kind"] != "voice")}
        for k in RATCHET_KEYS:
            if count[k] > base[k]:
                code = max(code, 1)
                print(f"\n⛔⛔ {KIND_TITLE[k]}不合格 {base[k]} → {count[k]} —— 這一次帶進了新的壞音檔：")
                for r in [x for x in in_scope_bad if (x["kind"] == "voice") == (k == "voice")][:30]:
                    print(f"   {r['path']}：{'；'.join(p[1] for p in r['problems'])}")
            elif count[k] < base[k]:
                code = max(code, 1)
                print(f"\n⭐ {KIND_TITLE[k]}不合格 {base[k]} → {count[k]} ⇒ 把 {os.path.relpath(a.ratchet, ROOT)} 的 {k}= 改成 {count[k]} 並 commit"
                      "（⛔ 不改的話棘輪會鬆掉）")
        if code == 0:
            print(f"   棘輪持平：voice={count['voice']} · sfx={count['sfx']}（存量，只能變少）")
        return code
    if a.check and in_scope_bad:
        return max(code, 1)
    return code


if __name__ == "__main__":
    raise SystemExit(main())

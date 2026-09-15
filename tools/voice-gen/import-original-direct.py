#!/usr/bin/env python3
"""原作語音**直接對應**進戰鬥語音包 —— 一份對應表（語音格 → 原檔）就是全部的判斷。

owner（逐字）：
  2026-09-10「有原檔 已經足夠表達該意思 我們就直接採用」
  2026-09-10「替換過去 舊檔就備份到S3歸檔 新檔上git」
  2026-09-15「原作語音優先預設取代掉之前合成語音，但沒有原作語音還是可以用合成比什麼都沒有好」
  2026-09-15「我說過有個原則 如果有原板語音就直接對應使用 不需要轉錄生成」

⇒ ⛔ 不聽寫、不合成：對應表（`tools/voice-gen/originals/<hero>.<來源>.json`）逐格寫明「哪個檔、為什麼」，
   這支只做搬運：比對雜湊 → 轉 mp3（編碼參數與「轉出來合不合格」都呼叫 tools/audio-intake/audio_intake.py，
   ⛔ 不在這裡抄第二份 128k／44.1k／單聲道／0.15 秒／−60 dB）→ 寫進 lines/<hero>/<格>.mp3 → 在
   COMBAT_ORIGINALS.json 記出處。之後 `pnpm combat:build` 會把 status.json 蓋成 textSource=original。
⛔ 目前已經是原作的格**不蓋**（原作不互相取代）；只新增 `.2`／`.3` 這種額外句。
⭐ 被取代的合成檔：git HEAD 那一份先放進 outbox，`--archive` 時同步到 S3 voice-archive/<時間戳>/<hero>/。

  python3 tools/voice-gen/import-original-direct.py tools/voice-gen/originals/godie-h020.mba-chara02.json            # 試算
  python3 tools/voice-gen/import-original-direct.py tools/voice-gen/originals/godie-h020.mba-chara02.json --write    # 寫入 lines/
  python3 tools/voice-gen/import-original-direct.py <對應表> --write --archive <outbox 目錄>                          # 同時歸檔到 S3
"""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
LINES = ROOT / "content/assets/audio/voices/lines"
ASSET_ROOT = pathlib.Path(os.environ.get("GGD_ABXVFX_ROOT", "/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT"))
BUCKET, PROFILE, REGION = "ggd-390630837668-ap-east-2-an", "vibe-coding", "ap-east-2"
# ⭐ owner 2026-09-15「實際遊戲會使用的語音跟音效是 128bit 44khz mp3」⇒ 規則只住 audio_intake（它再讀 audioAssetPolicy.ts／combatLinesLib.mjs）
sys.path.insert(0, str(ROOT / "tools/audio-intake"))
import audio_intake  # noqa: E402
try:
    POLICY = audio_intake.load_policy()
except audio_intake.Stop as exc:
    print(f"⛔ {exc}"); sys.exit(2)
WRITE = "--write" in sys.argv
ARCHIVE = pathlib.Path(sys.argv[sys.argv.index("--archive") + 1]) if "--archive" in sys.argv else None
spec = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
hero, group, src_root = spec["hero"], spec.get("group", ""), spec.get("sourceRoot", "")
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


def probe(p):
    """(秒數, 峰值 dB)"""
    d = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(p)], capture_output=True, text=True)
    v = subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-i", str(p), "-af", "volumedetect", "-f", "null", "-"], capture_output=True, text=True)
    peak = next((float(l.split(":")[1].split()[0]) for l in v.stderr.splitlines() if "max_volume" in l), -99.0)
    return float(d.stdout.strip() or 0), peak


orig_path = LINES / "COMBAT_ORIGINALS.json"
originals = json.loads(orig_path.read_text(encoding="utf-8"))
rows = originals["champions"].setdefault(hero, {})
plan, problems = [], []
for slot, m in spec["map"].items():
    # ⭐ 一包可以混多個來源：逐格寫 `src`（相對素材庫根）就用它，否則用 sourceRoot＋file
    src = ASSET_ROOT / (m["src"] if m.get("src") else f"{src_root}/{m['file']}")
    if not src.exists():
        problems.append(f"{slot}: 原檔不存在 {src}"); continue
    existing = rows.get(slot)
    if existing and existing.get("sha256") != sha(src):
        problems.append(f"{slot}: 已經是原作（{existing.get('group')}:{existing.get('name')}）⛔ 原作不互相取代"); continue
    plan.append((slot, m, src))
if problems:
    print("\n".join("⛔ " + p for p in problems)); sys.exit(2)

tmp = pathlib.Path(tempfile.mkdtemp(prefix="orig-direct-"))
report = []
for slot, m, src in plan:
    out = tmp / f"{slot}.mp3"
    norm = ["-af", "loudnorm=I=-16.0:TP=-1.5:LRA=11"] if spec.get("loudnorm", True) else []   # LoL 包保留原音量
    r = subprocess.run(["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", str(src), *norm,
                        *audio_intake.encode_args(POLICY, "voice"), str(out)], capture_output=True, text=True)
    if r.returncode != 0:
        print(f"⛔ {slot}: 轉檔失敗 {r.stderr[-200:]}"); sys.exit(3)
    secs, peak = probe(out)
    # ⭐ 與上架閘同一份判準：過短／靜音／截斷／mp3／≤128k／≤44.1k／單聲道
    bad = audio_intake.problems_of(POLICY, "voice", audio_intake.measure(str(out)))
    if bad:
        print(f"⛔ {slot}: 轉出來不合格（{'；'.join(why for _code, why in bad)}；ffprobe {secs:.2f}s, 峰值 {peak} dB）"); sys.exit(3)
    dst = LINES / hero / f"{slot}.mp3"
    head = subprocess.run(["git", "-C", str(ROOT), "cat-file", "-e", f"HEAD:{dst.relative_to(ROOT)}"], capture_output=True).returncode == 0
    report.append({"slot": slot, "file": m.get("file") or src.name, "seconds": round(secs, 2), "replaces": "git HEAD 合成檔" if head else "（新格）", "why": m["why"]})
    if not WRITE:
        continue
    if head and ARCHIVE:
        a = ARCHIVE / "voice-archive" / stamp / hero / f"{slot}.mp3"
        a.parent.mkdir(parents=True, exist_ok=True)
        a.write_bytes(subprocess.run(["git", "-C", str(ROOT), "show", f"HEAD:{dst.relative_to(ROOT)}"], capture_output=True, check=True).stdout)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(out), str(dst))
    rows[slot] = {"src": m.get("src") or f"{src_root}/{m['file']}", "name": pathlib.Path(m.get("file") or src.name).stem, "group": m.get("group") or group, "sha256": sha(src),
                  "seconds": round(secs, 2), "assignedBy": "direct-map", "why": m["why"],
                  "map": str(pathlib.Path(sys.argv[1]).resolve().relative_to(ROOT)), "importedAt": datetime.datetime.now(datetime.timezone.utc).isoformat()}

if WRITE:
    originals["champions"][hero] = dict(sorted(rows.items()))
    tmpj = orig_path.with_suffix(".json.tmp")
    tmpj.write_text(json.dumps(originals, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmpj, orig_path)
    if ARCHIVE:
        n = sum(1 for p in (ARCHIVE / "voice-archive" / stamp).rglob("*.mp3"))
        s = subprocess.run(["aws", "s3", "sync", str(ARCHIVE / "voice-archive" / stamp), f"s3://{BUCKET}/voice-archive/{stamp}", "--profile", PROFILE, "--region", REGION, "--only-show-errors"], capture_output=True, text=True)
        if s.returncode != 0:
            print(f"⛔ S3 歸檔失敗（{n} 檔）：action=s3:PutObject resource=s3://{BUCKET}/voice-archive/{stamp}\n{s.stderr[-400:]}"); sys.exit(4)
        # ⭐ 「sync 離開碼 0」⛔ 不是上去了的證據（fd90b7a3d 記過）⇒ 整批抓回來逐檔比 SHA-256
        back = pathlib.Path(tempfile.mkdtemp(prefix="orig-direct-back-"))
        g = subprocess.run(["aws", "s3", "cp", f"s3://{BUCKET}/voice-archive/{stamp}/", str(back), "--recursive", "--profile", PROFILE, "--region", REGION, "--only-show-errors"], capture_output=True, text=True)
        local = {p.relative_to(ARCHIVE / "voice-archive" / stamp): sha(p) for p in (ARCHIVE / "voice-archive" / stamp).rglob("*.mp3")}
        remote = {p.relative_to(back): sha(p) for p in back.rglob("*.mp3")}
        verdict = "全部相符" if local == remote else "⛔ 不相符"
        print(f"S3 歸檔：上傳 {n} 檔 · 讀回 {len(remote)} 檔 · SHA-256 {verdict} → s3://{BUCKET}/voice-archive/{stamp}/")
        if g.returncode != 0 or local != remote: sys.exit(4)
print(json.dumps({"write": WRITE, "hero": hero, "group": group, "slots": report}, ensure_ascii=False, indent=1))

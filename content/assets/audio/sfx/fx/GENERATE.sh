#!/usr/bin/env bash
# Procedurally generate the neutral "mechanical" combat SFX (fx/*.wav).
#
# WHY: the 21 imported w3x clips (../*.mp3) are ALL Chinese voice quips — great
# for kills/deaths/announces, useless for the high-frequency combat events
# (swing / hit / damage tick / projectile / cast). This script synthesises a
# small set of short, band-limited, non-verbal clips for those.
#
# WHY .wav and not .mp3: MP3 carries encoder delay/padding that browsers apply
# inconsistently through decodeAudioData; on a 40 ms transient that reads as a
# late, mushy hit. These clips are tiny (<= ~70 KB) so raw PCM costs nothing and
# is sample-accurate. 16-bit / 44.1 kHz / MONO (mono is required for WebAudio
# PannerNode spatialisation).
#
# Deterministic: same ffmpeg -> same bytes (anoisesrc seeds are pinned).
# Every clip is peak-normalised to -3.0 dBFS; relative loudness between events
# is set by `gain` in content/config/audio-map.json, NOT by the file.
#
#   bash content/assets/audio/sfx/fx/GENERATE.sh
set -euo pipefail

OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# synth <name> <ffmpeg-args...>  -> peak-normalised 16-bit mono wav in $OUT
synth() {
  local name="$1"; shift
  ffmpeg -y -v error -nostdin "$@" -ac 1 -ar 44100 -c:a pcm_f32le "$TMP/$name.wav"
  # measure peak, then apply the gain that lands it on -3.0 dBFS.
  # NOTE: volumedetect reports at ffmpeg's *info* level — `-v error` would eat
  # the line and silently skip normalisation, so keep -hide_banner/-nostats.
  local peak
  peak="$(ffmpeg -hide_banner -nostats -nostdin -i "$TMP/$name.wav" -af volumedetect -f null - 2>&1 \
          | sed -n 's/.*max_volume: \(-*[0-9.]*\) dB.*/\1/p')"
  [ -n "$peak" ] || { echo "FATAL: no peak measured for $name" >&2; exit 1; }
  local gain
  gain="$(awk -v p="$peak" 'BEGIN{printf "%.4f", -3.0 - p}')"
  ffmpeg -y -v error -nostdin -i "$TMP/$name.wav" -af "volume=${gain}dB" \
    -ac 1 -ar 44100 -c:a pcm_s16le "$OUT/$name.wav"
}

# --- basicAttack: air swing (pink-noise whoosh, swells then drops) -----------
synth swing \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.20:a=1:seed=11" \
  -af "highpass=f=650,highpass=f=650,lowpass=f=6000,afade=t=in:st=0:d=0.045:curve=qsin,afade=t=out:st=0.045:d=0.155:curve=exp"

# --- attackWindup: soft low "tk" tell just before the swing ------------------
synth windup \
  -f lavfi -i "anoisesrc=r=44100:c=brown:d=0.09:a=1:seed=12" \
  -af "lowpass=f=1100,afade=t=in:st=0:d=0.004,afade=t=out:st=0.004:d=0.086:curve=exp"

# --- basicAttackHit: meaty thud (150->60 Hz body + bright transient) ---------
synth thud \
  -f lavfi -i "aevalsrc='sin(2*PI*(150*t-250*t*t))':d=0.24:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.05:a=0.55:seed=13" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.003,afade=t=out:st=0.003:d=0.237:curve=exp[body];\
[1:a]highpass=f=900,lowpass=f=4500,afade=t=out:st=0:d=0.05:curve=exp[snap];\
[body][snap]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- damage: tiny high tick (fires on EVERY damage packet: must be small) ----
synth tick \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.04:a=1:seed=14" \
  -af "highpass=f=1600,lowpass=f=5200,afade=t=in:st=0:d=0.002,afade=t=out:st=0.002:d=0.038:curve=exp"

# --- projectileSpawn: descending "pew" (1200 -> 300 Hz in 120 ms) ------------
synth launch \
  -f lavfi -i "aevalsrc='0.7*sin(2*PI*(1200*t-3750*t*t))':d=0.14:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.03:a=0.3:seed=15" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.004,afade=t=out:st=0.05:d=0.09:curve=exp[b];\
[1:a]highpass=f=2000,afade=t=out:st=0:d=0.03:curve=exp[c];\
[b][c]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- projectileHit: splat (band-passed burst + short 260 Hz body) ------------
synth impact \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.14:a=1:seed=16" \
  -f lavfi -i "aevalsrc='0.5*sin(2*PI*260*t)':d=0.14:s=44100" \
  -filter_complex "[0:a]highpass=f=350,lowpass=f=4800,afade=t=out:st=0:d=0.14:curve=exp[n];\
[1:a]afade=t=out:st=0:d=0.12:curve=exp[b];\
[n][b]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- castBegin: rising chirp 300 -> 900 Hz (+ octave shimmer) ----------------
synth cast_begin \
  -f lavfi -i "aevalsrc='0.6*sin(2*PI*(300*t+857*t*t))+0.22*sin(4*PI*(300*t+857*t*t))':d=0.36:s=44100" \
  -af "afade=t=in:st=0:d=0.05:curve=qsin,afade=t=out:st=0.24:d=0.12:curve=qsin"

# --- castEnd: bright release ping (A5 + E6) ---------------------------------
synth cast_end \
  -f lavfi -i "aevalsrc='0.6*sin(2*PI*880*t)+0.3*sin(2*PI*1320*t)':d=0.28:s=44100" \
  -af "afade=t=in:st=0:d=0.004,afade=t=out:st=0.004:d=0.276:curve=exp"

# --- castInterrupt: down-sweep 700 -> 150 Hz + muffled thump ----------------
synth cast_break \
  -f lavfi -i "aevalsrc='0.65*sin(2*PI*(700*t-1100*t*t))':d=0.25:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=brown:d=0.12:a=0.5:seed=17" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.005,afade=t=out:st=0.005:d=0.245:curve=exp[s];\
[1:a]lowpass=f=1400,afade=t=out:st=0:d=0.12:curve=exp[n];\
[s][n]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- flowerSpawn: soft two-note chime (E5 + B5), quiet + slow attack --------
synth chime_soft \
  -f lavfi -i "aevalsrc='0.5*sin(2*PI*659.25*t)+0.3*sin(2*PI*987.77*t)':d=0.60:s=44100" \
  -af "afade=t=in:st=0:d=0.03:curve=qsin,afade=t=out:st=0.03:d=0.57:curve=exp"

# --- flowerBurst: brighter three-note bloom (A5 + E6 + A6) + sparkle -------
synth chime_burst \
  -f lavfi -i "aevalsrc='0.45*sin(2*PI*880*t)+0.3*sin(2*PI*1318.5*t)+0.2*sin(2*PI*1760*t)':d=0.80:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.25:a=0.18:seed=18" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.012:curve=qsin,afade=t=out:st=0.012:d=0.788:curve=exp[b];\
[1:a]highpass=f=6000,afade=t=out:st=0:d=0.25:curve=exp[s];\
[b][s]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# ===========================================================================
# COMBAT-JUICE clips (task #3): distinct 物理/魔法/防禦/破防 + crit/whiff/
# knockdown/footstep voices for the per-frame combat-feedback layer. The
# type-differentiated HIT voice is driven by the enriched `damage` event.
# ===========================================================================

# --- hitMagic (魔法): arcane "fzzt" — descending hi sine + bandpassed noise ---
synth hit_magic \
  -f lavfi -i "aevalsrc='0.5*sin(2*PI*(900*t-1500*t*t))':d=0.16:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.10:a=0.4:seed=21" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.004,afade=t=out:st=0.02:d=0.14:curve=exp[b];\
[1:a]highpass=f=1800,lowpass=f=7000,afade=t=out:st=0:d=0.10:curve=exp[n];\
[b][n]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- hitTrue (true dmg): clean bright bell ping (D6 + high fifth) -----------
synth hit_true \
  -f lavfi -i "aevalsrc='0.55*sin(2*PI*1200*t)+0.3*sin(2*PI*1800*t)':d=0.20:s=44100" \
  -af "afade=t=in:st=0:d=0.002,afade=t=out:st=0.004:d=0.196:curve=exp"

# --- block (防禦): short metallic guard clank (hi noise + mid ring) ---------
synth guard \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.12:a=0.8:seed=22" \
  -f lavfi -i "aevalsrc='0.4*sin(2*PI*520*t)+0.25*sin(2*PI*780*t)':d=0.12:s=44100" \
  -filter_complex "[0:a]highpass=f=1200,lowpass=f=6000,afade=t=in:st=0:d=0.002,afade=t=out:st=0.01:d=0.11:curve=exp[n];\
[1:a]afade=t=out:st=0:d=0.10:curve=exp[b];\
[n][b]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- guardBreak (破防): glassy shatter — descending sweep + bright burst -----
synth guard_break \
  -f lavfi -i "aevalsrc='0.6*sin(2*PI*(1100*t-1800*t*t))':d=0.34:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.28:a=0.5:seed=23" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.004,afade=t=out:st=0.05:d=0.29:curve=exp[b];\
[1:a]highpass=f=2500,afade=t=out:st=0:d=0.28:curve=exp[n];\
[b][n]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- crit: sharp bright "shing" — fast up-chirp + hi transient --------------
synth crit \
  -f lavfi -i "aevalsrc='0.6*sin(2*PI*(700*t+3000*t*t))':d=0.22:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.05:a=0.4:seed=24" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.003,afade=t=out:st=0.04:d=0.18:curve=exp[b];\
[1:a]highpass=f=3000,afade=t=out:st=0:d=0.05:curve=exp[n];\
[b][n]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- whiff: airy over-commit miss — highpassed pink whoosh (higher/airier) --
synth whiff \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.22:a=1:seed=25" \
  -af "highpass=f=900,highpass=f=900,lowpass=f=8000,afade=t=in:st=0:d=0.06:curve=qsin,afade=t=out:st=0.06:d=0.16:curve=exp"

# --- knockdown: heavy body-fall "whump" — low sine thump + brown debris -----
synth knockdown \
  -f lavfi -i "aevalsrc='sin(2*PI*(110*t-90*t*t))':d=0.40:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=brown:d=0.22:a=0.6:seed=26" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.004,afade=t=out:st=0.05:d=0.35:curve=exp[b];\
[1:a]lowpass=f=1600,afade=t=out:st=0:d=0.22:curve=exp[n];\
[b][n]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# --- footstep: soft short low "tp" (very quiet; local player only) ----------
synth footstep \
  -f lavfi -i "anoisesrc=r=44100:c=brown:d=0.07:a=1:seed=27" \
  -af "lowpass=f=900,afade=t=in:st=0:d=0.003,afade=t=out:st=0.008:d=0.062:curve=exp"

# ===========================================================================
# WEIGHT-TIERED HIT VOICES (hit-feel audit P1: the audible 收尾精準).
# One ImpactProfile.tier drives every impact channel; the SFX channel needs a
# matching light / medium / heavy / crit voice so a 12-dmg jab and a 400-dmg
# smash do NOT play the identical thud (audit finding: "one identical thud for
# every physical hit"). The client channel agent plays these by the key
# convention hit-light / hit-medium / hit-heavy / hit-crit / block-hit.
#
# The recipe grammar is the reference `thud` envelope (a descending sine BODY +
# a band-passed noise TRANSIENT, both exp-decayed): the SHARED shape keeps the
# four tiers reading as one family, while three knobs scale the WEIGHT:
#   1. body fundamental drops with weight (220 -> 155 -> 120 Hz): heavier = lower.
#   2. sub-150 Hz energy grows (light none, heavy adds a 62 Hz octave-down layer).
#   3. length + snap darkness grow, but the exp tail always dies to silence well
#      before the file ends — a hit is a POP, never a ring (收尾精準, tail < ~0.35s).
# crit is the medium body plus a bright up-chirp "shing" so a lucky hit reads as
# sharper, not merely louder. seeds 51-55 (unused elsewhere) keep this det.

# hit-light: quick jab — high body, no sub, thin bright snap (~0.14s)
synth hit-light \
  -f lavfi -i "aevalsrc='sin(2*PI*(220*t-380*t*t))':d=0.14:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.04:a=0.5:seed=51" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.002,afade=t=out:st=0.003:d=0.137:curve=exp[body];\
[1:a]highpass=f=1200,lowpass=f=5200,afade=t=out:st=0:d=0.04:curve=exp[snap];\
[body][snap]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# hit-medium: solid connect — mid body + fuller snap (~0.20s)
synth hit-medium \
  -f lavfi -i "aevalsrc='sin(2*PI*(155*t-300*t*t))':d=0.20:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.05:a=0.55:seed=52" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.003,afade=t=out:st=0.004:d=0.196:curve=exp[body];\
[1:a]highpass=f=950,lowpass=f=4600,afade=t=out:st=0:d=0.05:curve=exp[snap];\
[body][snap]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# hit-heavy: 破碎 smash — low body + a 62 Hz sub power layer + dark snap (~0.30s,
# tail exp-dead by ~60%). The one tier that carries real sub-150 Hz weight.
synth hit-heavy \
  -f lavfi -i "aevalsrc='sin(2*PI*(120*t-150*t*t))':d=0.30:s=44100" \
  -f lavfi -i "aevalsrc='0.6*sin(2*PI*(62*t-40*t*t))':d=0.30:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=pink:d=0.06:a=0.5:seed=53" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.003,afade=t=out:st=0.006:d=0.294:curve=exp[body];\
[1:a]afade=t=in:st=0:d=0.004,afade=t=out:st=0.006:d=0.294:curve=exp[sub];\
[2:a]highpass=f=750,lowpass=f=4000,afade=t=out:st=0:d=0.06:curve=exp[snap];\
[body][sub][snap]amix=inputs=3:duration=longest:normalize=0[a]" -map "[a]"

# hit-crit: sharp read — medium body + a bright up-chirp shing + hi transient
# (~0.24s). Distinct from heavy by BRIGHTNESS, not weight.
synth hit-crit \
  -f lavfi -i "aevalsrc='sin(2*PI*(150*t-220*t*t))':d=0.24:s=44100" \
  -f lavfi -i "aevalsrc='0.5*sin(2*PI*(900*t+2600*t*t))':d=0.20:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.04:a=0.4:seed=54" \
  -filter_complex "[0:a]afade=t=in:st=0:d=0.003,afade=t=out:st=0.005:d=0.235:curve=exp[body];\
[1:a]afade=t=in:st=0:d=0.003,afade=t=out:st=0.04:d=0.16:curve=exp[shing];\
[2:a]highpass=f=3000,afade=t=out:st=0:d=0.04:curve=exp[snap];\
[body][shing][snap]amix=inputs=3:duration=longest:normalize=0[a]" -map "[a]"

# block-hit: CRISP guard clank — front-loaded metal transient + a fast-dying mid
# ring (~0.12s). Re-cut of the audit's RINGING block voice (lab/block-clash +
# block-shield lingered to ~0.5-0.66s): here the peak is in the first ~1% and the
# whole clip is silent by ~0.12s — a clean deflect, NOT mush (收尾精準).
synth block-hit \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.10:a=0.85:seed=55" \
  -f lavfi -i "aevalsrc='0.42*sin(2*PI*560*t)+0.26*sin(2*PI*840*t)':d=0.10:s=44100" \
  -filter_complex "[0:a]highpass=f=1400,lowpass=f=6800,afade=t=in:st=0:d=0.001,afade=t=out:st=0.006:d=0.094:curve=exp[n];\
[1:a]afade=t=in:st=0:d=0.001,afade=t=out:st=0:d=0.08:curve=exp[ring];\
[n][ring]amix=inputs=2:duration=longest:normalize=0[a]" -map "[a]"

# ===========================================================================
# CHAMP-SELECT COUNTDOWN clips (task #30): the last-5-seconds ticks and the
# final-second cue. These fire OVER the champSelect BGM bed, so both are
# deliberately narrow-band and tonal (a noise transient would be swallowed by
# the music); the rising loudness across 5→2 s is the per-call `volume` on
# playSfx, NOT a different render — both files are peak-normalised like the
# rest of the set.
# ===========================================================================

# --- countTick / countFinal: recipes moved -----------------------------------
# The ORIGINAL beeps (880 Hz tick / 1320 Hz rising GO) that used to live here
# were REJECTED by the user and replaced by the ringside-bell tick (330 Hz,
# inharmonic partials) and the race-start trill (1180 Hz) — see the current
# recipes further down (search "ringside" / "race-start"). The dead originals
# were DELETED, not kept: a sequential script overwrites earlier outputs with
# later ones, so two same-named recipes in one file means the first is silent
# dead code — and it cost task #86's verifier a full false alarm ("count-tick
# was rewritten!") because it read the first block as the intended state.
# One name, one recipe. If a countdown sound changes again, EDIT the live
# block; never add a second.

echo "generated:"
ls -l "$OUT"/*.wav

# --- uiHoverCyber: ELECTRIC ZAP  咻咻電流  (task #86, redone) ----------------
# User (2026-07-22): 「按鈕 hover 聲音變成鼓聲非常奇怪，應該是科技感咻咻電流才有賽博味」.
# The previous #86 recipe was a 1.55 s LOW craft-flyby; its falling low body read
# as a DRUM (鼓聲) — measured centroid 906 Hz, 100% of energy under 500 Hz. The
# ask is the opposite: a short, BRIGHT, electric zap-swoosh — 咻咻 (two quick
# swooshes) + 電流 (electric buzz).
#
# HOW: a rising saw-ish carrier (1500->3800 Hz sweep, so it ZAPS up not floats
# up) shaped by TWO Gaussian bumps at 28 ms and 118 ms = 咻咻; amplitude-
# modulated at 88 Hz = the 電流 buzz; a sub-octave term adds body so it is a zap
# with weight, not a thin hiss. An airy band-passed noise layer (850 Hz-8 kHz)
# under the same two bumps is the swoosh air. A SHORT bright echo tail keeps a
# hint of the Akira ring the user liked, low-passed to 6 kHz so it does not
# smear. Total 0.45 s (was 1.55 s) so it fits a 55 ms-cooldown hover cleanly.
#
# MEASURED (why it can never be the drum again): centroid ~6.8 kHz, 0% under
# 500 Hz, 61% in the 2-6 kHz zap band, 12% mid body. NEVER PLAYED — the user
# tests on this machine (task #62); judged by spectrum only. Peak-normalised to
# -3.0 dBFS below.
ffmpeg -y -v error -nostdin \
  -f lavfi -i "aevalsrc='st(0,2*PI*(1500+2300*(t/0.22))*t);st(1,0.5+0.5*sin(2*PI*88*t));st(2,exp(-pow((t-0.028)/0.020,2))+0.9*exp(-pow((t-0.118)/0.026,2)));0.85*ld(2)*ld(1)*(0.45*sin(0.5*ld(0))+sin(ld(0))+0.5*sin(2*ld(0))+0.3*sin(3*ld(0))+0.16*sin(4*ld(0)))':d=0.45:s=44100" \
  -f lavfi -i "anoisesrc=r=44100:c=white:d=0.45:a=1:seed=311" \
  -f lavfi -i "aevalsrc='exp(-pow((t-0.026)/0.022,2))+0.85*exp(-pow((t-0.118)/0.030,2))':d=0.45:s=44100" \
  -filter_complex "[1:a]highpass=f=850:p=2,lowpass=f=8000:p=2[nzf];[nzf][2:a]amultiply,volume=1.4[air];[0:a][air]amix=inputs=2:normalize=0:duration=longest[body];[body]aeval=exprs='tanh(1.1*val(0))/1.1'[sat];[sat]asplit=2[dry][wet];[wet]aecho=0.85:0.35:41|73:0.32|0.18,aecho=0.85:0.30:131|191:0.15|0.08,lowpass=f=6000:p=2,volume=0.8[tail];[dry][tail]amix=inputs=2:normalize=0:duration=longest,afade=t=in:st=0:d=0.004:curve=qsin,afade=t=out:st=0.30:d=0.15:curve=exp,highpass=f=140:p=2,aformat=channel_layouts=stereo[out]" \
  -map "[out]" \
  -t 0.45 -ac 2 -ar 44100 -c:a pcm_f32le "$TMP/uihc_raw.wav"

# peak-normalise to -3.0 dBFS (astats on the FLOAT samples — see note above)
PEAK="$(ffmpeg -hide_banner -nostats -nostdin -i "$TMP/uihc_raw.wav" \
        -af astats=measure_perchannel=none -f null - 2>&1 \
        | sed -n 's/.*Peak level dB: *\(-*[0-9.]*\).*/\1/p' | head -1)"
[ -n "$PEAK" ] || { echo "FATAL: no peak measured for ui-hover-cyber" >&2; exit 1; }
UIHC_GAIN="$(awk -v p="$PEAK" 'BEGIN{printf "%.4f", -3.0 - p}')"
ffmpeg -y -v error -nostdin -i "$TMP/uihc_raw.wav" -af "volume=${UIHC_GAIN}dB" \
  -ac 2 -ar 44100 -c:a pcm_s16le "$OUT/ui-hover-cyber.mp3"
echo "ui-hover-cyber.mp3: peak ${PEAK} dBFS -> -3.0 dBFS (applied ${UIHC_GAIN} dB)"

# --- countTick / countFinal: RINGSIDE BELL --------------------------------
# User (2026-07-22): 「戰鬥選擇英雄倒數應該用擂台的中低音鐘聲比較適合氣氛」.
# Replaces the first cut's plain 880 Hz / 1364 Hz beeps — correct pitches, wrong
# WORLD. This is a boxing-ring bell: an arena announcing that time is running out.
#
# What makes a struck bell read as a BELL and not as a sine beep, in order of
# importance:
#   1. INHARMONIC PARTIALS. A bell's overtones are NOT integer multiples — the
#      classic strike spectrum is roughly f, 2.0f, 2.4f, 3.0f, 4.2f (hum, prime,
#      tierce, quint, nominal). The 2.4f minor-third partial is the single most
#      identifiable "bell" ingredient; drop it and this becomes an organ.
#   2. PER-PARTIAL DECAY. High partials must die FASTER than the fundamental —
#      that is the shimmer collapsing into a hum. One shared envelope sounds
#      synthetic no matter how good the spectrum is.
#   3. A HARD STRIKE. ~2 ms attack; a bell is hit, not faded in. (Deliberately
#      the OPPOSITE of the uiHoverCyber cue above, which must never read as a
#      transient — different jobs, different envelopes.)
# 中低音 per the request: fundamental 330 Hz (E4) for the tick, 247 Hz (B3) for
# the final, so the last beat lands lower and heavier rather than higher.

synth count-tick \
  -f lavfi -i "aevalsrc='0.50*exp(-3.2*t)*sin(2*PI*330*t) + 0.30*exp(-4.6*t)*sin(2*PI*660*t) + 0.26*exp(-5.4*t)*sin(2*PI*792*t) + 0.16*exp(-7.0*t)*sin(2*PI*990*t) + 0.10*exp(-9.5*t)*sin(2*PI*1386*t)':d=1.20:s=44100" \
  -af "highpass=f=180,lowpass=f=7000,afade=t=in:st=0:d=0.002:curve=qsin,afade=t=out:st=0.85:d=0.35:curve=exp"

# THE FINAL BEAT — A RACE-START BELL, NOT A RING BELL.
# User (2026-07-22): 「開始的鐘聲最後三下很奇怪，應該是賽馬起跑的高音結尾」.
# The first cut went LOWER on the last beat (247 Hz B3) reasoning that heavier =
# more final. Wrong instinct for a countdown: a boxing bell says "stop", a
# racetrack bell says "GO", and it says it HIGH and FAST. It also muddied the
# tail — a 1.2 s low ring under another low double-clang is three overlapping
# low tones, which is what read as 很奇怪.
# So: fundamental jumps UP to ~1180 Hz, and instead of one struck note it is a
# rapid TRILL (a clapper bouncing on the bell) — 14 strikes over 0.9 s, each a
# short bright inharmonic ping, decaying as a group. Urgent, not heavy.
synth count-final \
  -f lavfi -i "aevalsrc='(0.42*exp(-26*mod(t,0.064))*sin(2*PI*1180*t) + 0.24*exp(-30*mod(t,0.064))*sin(2*PI*2832*t) + 0.16*exp(-34*mod(t,0.064))*sin(2*PI*3540*t) + 0.09*exp(-40*mod(t,0.064))*sin(2*PI*4956*t))*exp(-1.9*t)':d=1.05:s=44100" \
  -af "highpass=f=700,lowpass=f=11000,afade=t=in:st=0:d=0.002:curve=qsin,afade=t=out:st=0.72:d=0.32:curve=exp"

# ===========================================================================
# DRAFT-CONFIRM cue (task #110): the 3-choose-1 card "lock-in". User asked for
# a 厲害的科技音效 on picking a card. It must sit in the SAME low, weighty,
# mechanical world as the #86 cyber hover (a low craft flyby) — NOT bright or
# bubbly — and be unmistakably distinct from BOTH the hover and the two
# countdown bells it shares the intermission/select flow with.
#
# The falsifiable difference (measure, never describe — see GATE-draft-confirm.py):
#   HARD onset (~6 ms) vs the hover's 34 ms SWELL; a LOW ~405 Hz spectral
#   centroid vs the hover's 1860 Hz and count-final's 2678 Hz; ~0.85 of the
#   energy under 500 Hz (weighty) ; ~0.6 s — decisive, half the length of
#   count-tick (1.2 s) / count-final (1.05 s) / hover (1.6 s).
#
# Three layers strike TOGETHER at t=0 (a mechanism seating, not a beep):
#   chunk : brown-noise transient band-limited 150-1300 Hz  — CONTACT (loudest,
#           so the onset reads as a machined strike rather than a tone).
#   body  : sub sine dropping 140->55 Hz + an octave-down 70->28 Hz power layer
#           — the WEIGHT; exp-decayed so it rings down cleanly.
#   lock  : two DETUNED descending resonators (520->300, 660->380 Hz) + a fast
#           metallic 1560->860 partial — DESCENDING = terminal/confirm (tech).
# Finished with ONE short 55 ms echo tap (a small chamber, deliberately NOT the
# hover's long Akira ring-out) and a dark master (hp 42, lp 5000) to keep it low.
synth draft-confirm \
  -f lavfi -i "anoisesrc=r=44100:c=brown:d=0.10:a=1:seed=41" \
  -f lavfi -i "aevalsrc='0.92*exp(-6.5*t)*sin(2*PI*(140*t-85*t*t))+0.40*exp(-5.5*t)*sin(2*PI*(70*t-42*t*t))':d=0.55:s=44100" \
  -f lavfi -i "aevalsrc='0.58*exp(-4.0*t)*sin(2*PI*(520*t-220*t*t))+0.42*exp(-4.4*t)*sin(2*PI*(660*t-280*t*t))+0.15*exp(-8.0*t)*sin(2*PI*(1560*t-700*t*t))':d=0.55:s=44100" \
  -filter_complex "[0:a]highpass=f=150,lowpass=f=1300,afade=t=in:st=0:d=0.0008,afade=t=out:st=0.008:d=0.092:curve=exp,volume=1.35[chunk];\
[1:a]afade=t=in:st=0:d=0.0015,afade=t=out:st=0.34:d=0.21:curve=exp[body];\
[2:a]afade=t=in:st=0:d=0.0015,afade=t=out:st=0.32:d=0.23:curve=exp[lock];\
[chunk][body][lock]amix=inputs=3:duration=longest:normalize=0,\
aecho=0.85:0.30:55:0.26,highpass=f=42,lowpass=f=5000[a]" -map "[a]"

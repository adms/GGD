#!/usr/bin/env python3
"""Which engine speaks which line, and why.

CosyVoice 3 is the default for every line. A line moves to IndexTTS-2 only
because something SAID SO — a measurement, a manifest field, or an explicit
operator flag — and whatever said so is recorded in the clip's sidecar as
`engineReason`. There is no hidden table that quietly reroutes categories.

That last point is deliberate. The measured weak spots (shouts, grunts, proper
nouns) are a tempting thing to hard-code as "always use IndexTTS for hurt
lines". It is not done, for two reasons: IndexTTS-2 cannot speak Japanese at all
without a hand-written romaji field, so it is not automatically the better
answer for a Japanese grunt; and a built-in table would mean the corpus is
shaped by a guess from seven sample lines. `qa.py` measures the real corpus and
writes real pins. Until it has, everything is CosyVoice 3.

PRECEDENCE, highest first
-------------------------
  1. `--force-engine` / `--force-variant`   operator override, whole run
  2. a pin from `--pins FILE`               written by qa.py from measurements
  3. the manifest entry's `engine` field     author's per-line decision
  4. `--engine-for CATEGORY=ENGINE[:VARIANT]` operator rule, repeatable
  5. `--engine` / `--variant`                this run's default
  6. built-in                                cosyvoice3 / base

A line's CATEGORY is its `category` field, or, absent that, the part of its id
after the last dot — so `godie-e001.hurt` is category `hurt` for free.
"""
from __future__ import annotations

import json
import os
import sys

import engine as core


def category_of(entry: dict) -> str:
    cat = (entry.get("category") or "").strip()
    if cat:
        return cat
    eid = str(entry.get("id") or "")
    return eid.rsplit(".", 1)[-1] if "." in eid else ""


def parse_rule(spec: str) -> tuple[str, str, str | None]:
    """`hurt=indextts` or `hurt=cosyvoice3:rl` -> (category, engine, variant)."""
    if "=" not in spec:
        sys.exit(f"voice-gen: --engine-for expects CATEGORY=ENGINE[:VARIANT], got {spec!r}")
    cat, _, target = spec.partition("=")
    name, _, variant = target.partition(":")
    cat, name, variant = cat.strip(), name.strip(), variant.strip() or None
    if name not in core.REGISTRY:
        sys.exit(f"voice-gen: --engine-for {spec!r}: unknown engine {name!r} "
                 f"(have: {', '.join(core.REGISTRY)})")
    if not cat:
        sys.exit(f"voice-gen: --engine-for {spec!r}: empty category")
    return cat, name, variant


def load_pins(path: str | None) -> dict[str, dict]:
    """JSONL of {"id", "engine", optional "variant", optional "reason"}.

    This is qa.py's output and a human-editable file. An unknown id is kept
    rather than rejected: pins outlive manifest edits, and a stale pin that
    matches nothing is harmless.
    """
    if not path:
        return {}
    if not os.path.exists(path):
        sys.exit(f"voice-gen: --pins file not found: {path}")
    pins: dict[str, dict] = {}
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("#"):
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                sys.exit(f"voice-gen: {path}:{n}: {e}")
            if not row.get("id") or not row.get("engine"):
                sys.exit(f"voice-gen: {path}:{n}: a pin needs at least `id` and `engine`")
            if row["engine"] not in core.REGISTRY:
                sys.exit(f"voice-gen: {path}:{n}: unknown engine {row['engine']!r}")
            pins[row["id"]] = row
    return pins


class Router:
    """Resolves (engine, variant, reason) for every line. Pure data, no models."""

    def __init__(self, default_engine=None, default_variant=None, rules=None,
                 pins=None, force_engine=None, force_variant=None):
        self.default_engine = default_engine or core.DEFAULT_ENGINE
        self.default_variant = default_variant
        self.rules = dict(rules or {})          # category -> (engine, variant)
        self.pins = dict(pins or {})
        self.force_engine = force_engine
        self.force_variant = force_variant

    def choose(self, entry: dict) -> tuple[str, str | None, str]:
        eid = str(entry.get("id") or "")
        cat = category_of(entry)

        if self.force_engine:
            return (self.force_engine,
                    self.force_variant or self.default_variant,
                    "--force-engine")

        pin = self.pins.get(eid)
        if pin:
            reason = pin.get("reason") or "pinned"
            return (pin["engine"],
                    pin.get("variant") or self.force_variant or self.default_variant,
                    f"pin: {reason}")

        if entry.get("engine"):
            name = entry["engine"]
            if name not in core.REGISTRY:
                sys.exit(f"voice-gen: entry {eid!r}: unknown engine {name!r}")
            return (name,
                    entry.get("variant") or self.force_variant or self.default_variant,
                    "manifest entry")

        if cat in self.rules:
            name, variant = self.rules[cat]
            return (name,
                    variant or self.force_variant or self.default_variant,
                    f"--engine-for {cat}")

        return (self.default_engine,
                self.force_variant or self.default_variant,
                "default")

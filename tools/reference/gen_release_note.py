#!/usr/bin/env python3
"""把 release note 的正文印到 stdout —— 同一個產生器，同一份 JSON。

    python3 tools/reference/gen_release_note.py v0.19.0 "標題" > /tmp/note.md
    gh release edit v0.19.0 --notes-file /tmp/note.md
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_reference as G  # noqa: E402
import gen_grail as GR  # noqa: E402

if len(sys.argv) < 3:
    sys.exit("用法：gen_release_note.py <version> <headline>")
ctx = G.build_context()
sys.stdout.write(GR.gen_release_note(ctx, G.CONTENT, sys.argv[1], sys.argv[2]))

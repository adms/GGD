#!/usr/bin/env python3
"""tools/status/test_gen_status.py — the anti-drift gate for the status page.

Why this file exists: the generator used to carry a HAND-TRANSCRIBED task list.
It stopped at 131 rows (129 unique — #85 and #93 were transcribed twice) while
the ledger held 172, so the page advertised a denominator that was wrong by 43
tasks and nothing went red. Every assertion below exists to make that specific
failure impossible to reintroduce:

  * the rendered row count == the ledger task count (no drift, no dedup loss)
  * per-status counts == the ledger's own pending / in_progress / completed
  * no task inventory lives in gen_status.py (the source-code list is gone and
    must stay gone)
  * an unreadable / unknown-status / missing ledger EXITS NON-ZERO instead of
    quietly emitting a short list

Run:  python3 tools/status/test_gen_status.py        (stdlib only, no deps)
      python3 tools/status/gen_status.py --check     (the CI gate itself)
"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
GEN = os.path.join(HERE, "gen_status.py")
sys.path.insert(0, HERE)

import gen_status as G  # noqa: E402


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def write_ledger(dirpath, tasks):
    for t in tasks:
        with open(os.path.join(dirpath, f"{t['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(t, f)


# deliberately high ids: they must NOT collide with task_meta.json, so these
# rows exercise the "ledger subject + auto-classified domain" fallback path.
FIXTURE = [
    {"id": "9001", "subject": "BGM loop 修正", "status": "completed"},
    {"id": "9002", "subject": "shop panel overlaps the HUD", "status": "pending"},
    {"id": "9003", "subject": "three", "status": "in_progress"},
]


class LedgerIsTheSourceOfTruth(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.ledger = os.path.join(self.tmp, "ledger")
        os.makedirs(self.ledger)
        write_ledger(self.ledger, FIXTURE)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_row_count_equals_ledger_count(self):
        res = G.build(self.ledger)
        self.assertEqual(len(res["rows"]), len(FIXTURE))
        self.assertEqual(res["total"], len(FIXTURE))

    def test_added_task_appears_without_touching_the_generator(self):
        before = G.build(self.ledger)["total"]
        src_before = read(GEN)
        write_ledger(self.ledger, [{"id": "9099", "subject": "brand new", "status": "pending"}])
        after = G.build(self.ledger)
        self.assertEqual(after["total"], before + 1)
        self.assertIn("| 9099 |", after["text"])
        self.assertEqual(src_before, read(GEN),
                         "the generator must not need editing when the ledger grows")

    def test_statuses_are_the_ledger_statuses_not_inferred(self):
        res = G.build(self.ledger)
        self.assertEqual(res["counts"]["done"], 1)       # completed
        self.assertEqual(res["counts"]["pending"], 1)    # pending
        self.assertEqual(res["counts"]["flight"], 1)     # in_progress
        self.assertEqual(sum(res["counts"].values()), len(FIXTURE))

    def test_rendered_total_row_matches_the_ledger(self):
        res = G.build(self.ledger)
        m = G.TOTAL_RE.search(res["text"])
        self.assertIsNotNone(m, "the 合計 row must be present")
        self.assertEqual(int(m.group(1)), len(FIXTURE))
        marks = "".join(G.MARK.values())
        rows = re.findall(rf"^\| [{marks}] \| (\d+) \| ", res["text"], re.M)
        self.assertEqual(sorted(int(r) for r in rows), sorted(int(t["id"]) for t in FIXTURE),
                         "every ledger task must be rendered exactly once")

    def test_label_falls_back_to_the_ledger_subject(self):
        """No metadata for the id → the page shows the ledger's own subject, never a blank row."""
        res = G.build(self.ledger)
        self.assertIn("three", res["text"])

    def test_no_task_inventory_hardcoded_in_the_generator(self):
        src = read(GEN)
        self.assertNotIn("\nTASKS = [", src,
                         "the hand-transcribed TASKS table is what drifted to 131 — it must not come back")


class FailsLoud(unittest.TestCase):
    """Every one of these used to be a silent short list. They must exit non-zero."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def _ledger_with(self, obj, name="1.json"):
        d = os.path.join(self.tmp, "l")
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            f.write(obj if isinstance(obj, str) else json.dumps(obj))
        return d

    def test_unparseable_task_file(self):
        d = self._ledger_with("{not json")
        with self.assertRaises(G.LedgerError):
            G.resolve_ledger(d)

    def test_unknown_status_is_not_collapsed_into_pending(self):
        d = self._ledger_with({"id": "1", "subject": "x", "status": "wontfix"})
        with self.assertRaises(G.LedgerError) as cm:
            G.resolve_ledger(d)
        self.assertIn("wontfix", str(cm.exception))

    def test_missing_field(self):
        d = self._ledger_with({"id": "1", "subject": "x"})
        with self.assertRaises(G.LedgerError):
            G.resolve_ledger(d)

    def test_empty_directory(self):
        d = os.path.join(self.tmp, "empty")
        os.makedirs(d)
        with self.assertRaises(G.LedgerError):
            G.resolve_ledger(d)

    def test_missing_path(self):
        with self.assertRaises(G.LedgerError):
            G.resolve_ledger(os.path.join(self.tmp, "nope"))

    def test_cli_exits_non_zero_on_a_broken_ledger(self):
        d = self._ledger_with("{not json")
        p = subprocess.run([sys.executable, GEN, "--ledger", d], capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("LEDGER ERROR", p.stdout + p.stderr)

    def test_cli_check_exits_non_zero_when_the_page_undercounts(self):
        """The 131-vs-172 bug itself, reproduced against a scratch copy of the page."""
        # --check never writes, so this is safe to run against the real page.
        d = self._ledger_with({"id": "1", "subject": "x", "status": "pending"})
        p = subprocess.run([sys.executable, GEN, "--ledger", d, "--check"],
                           capture_output=True, text=True)
        self.assertNotEqual(p.returncode, 0)
        self.assertIn("UNDERCOUNT", (p.stdout + p.stderr).upper())


class LivePage(unittest.TestCase):
    """The page in the tree must agree with the ledger this machine can see."""

    def test_check_mode_passes(self):
        p = subprocess.run([sys.executable, GEN, "--check"], capture_output=True, text=True)
        self.assertEqual(p.returncode, 0, p.stdout + p.stderr)

    def test_snapshot_matches_the_page(self):
        snap = G.load_ledger_json(G.MIRROR)
        page = read(G.OUT)
        self.assertEqual(int(G.TOTAL_RE.search(page).group(1)), len(snap))


if __name__ == "__main__":
    unittest.main(verbosity=2)

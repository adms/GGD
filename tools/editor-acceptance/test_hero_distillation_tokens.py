import importlib.util
from pathlib import Path
import unittest

SPEC = importlib.util.spec_from_file_location("distill", Path(__file__).with_name("hero-distillation-tokens.py"))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class Tokenizer:
    def apply_chat_template(self, messages, tokenize, add_generation_prompt, enable_thinking):
        assert not tokenize and not enable_thinking
        prefix = M.compact(messages[:2]) + "<model>"
        return prefix + ("<|channel>thought\n<channel|>" if add_generation_prompt else messages[-1]["content"] + "<turn|>\n")

    def encode(self, text, add_special_tokens):
        assert not add_special_tokens
        return list(text.encode())


class Tests(unittest.TestCase):
    def test_all_bytes_are_sized_without_truncation(self):
        stats = M.sequence(Tokenizer(), {"source": "需求"}, {"skills": "長" * 20000})
        self.assertGreater(stats["totalTokens"], 60000)
        self.assertEqual(stats["totalTokens"], stats["inputTokens"] + stats["outputTokens"])
        self.assertEqual(stats["completionMaskStart"], stats["inputTokens"] - 1)

    def test_catalog_cost_is_counted(self):
        a = M.sequence(Tokenizer(), {}, {})
        b = M.sequence(Tokenizer(), {}, {}, {"catalog": "x" * 1000})
        self.assertGreater(b["inputTokens"], a["inputTokens"] + 1000)
        self.assertEqual(a["outputTokens"], b["outputTokens"])

    def test_summary_and_empty_group(self):
        self.assertEqual(M.summarize([])["max"], None)
        s = M.summarize(list(range(1, 101)))
        self.assertEqual((s["p50"], s["p95"], s["max"]), (50, 95, 100))

    def test_tokenizer_drift_is_not_silently_patched(self):
        class Broken(Tokenizer):
            def apply_chat_template(self, *args, **kwargs):
                return "different"
        with self.assertRaisesRegex(ValueError, "UNEXPECTED_NO_THINKING_PREFIX"):
            M.sequence(Broken(), {}, {})


if __name__ == "__main__":
    unittest.main()

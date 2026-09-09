import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('compact_generation', ROOT / 'tools/editor-acceptance/hero-distillation-compact-generation.py')
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class Tokenizer:
    def apply_chat_template(self, messages, **kwargs):
        return '|'.join(message['content'] for message in messages)
    def encode(self, text, **kwargs):
        return list(range(len(text)))


class Item:
    def __init__(self, text):
        self.text, self.finish_reason, self.generation_tokens = text, 'stop', 3


class CompactGenerationTest(unittest.TestCase):
    def test_rejects_fences_and_uses_one_fixed_contract(self):
        self.assertEqual(M.decoding_contract()['max_tokens'], 4096)
        self.assertRaisesRegex(AssertionError, 'COMPACT_JSON_REJECTED', M.strict_object, '```json\n{}\n```')

    def test_generates_without_retry_and_keeps_raw_record(self):
        values = iter(['{}'])
        def factory(prompt, ids, settings):
            self.assertEqual(settings, M.decoding_contract())
            return iter([Item(next(values))])
        result = M.generate_one('hero:HERO:select', 'select', [{'role': 'system', 'content': 's'}, {'role': 'user', 'content': 'u'}], Tokenizer(), factory, lambda *a, **k: None)
        self.assertTrue(result['complete'])
        self.assertEqual(result['json'], {})
        self.assertEqual(result['attempts'], 1)


if __name__ == '__main__':
    unittest.main()

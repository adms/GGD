"""CPU-only generation boundary tests; never load model weights."""
import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('generation', Path(__file__).with_name('hero-distillation-generation.py'))
g = importlib.util.module_from_spec(spec)
spec.loader.exec_module(g)


def case():
    content = g.compact({'outputContract': {'heroId': 'test', 'slot': 'HERO', 'format': 'hero-plan'}})
    messages = [{'role': 'system', 'content': '系統'}, {'role': 'user', 'content': content}]
    return {'id': 'test:HERO', 'heroId': 'test', 'groupId': 'test', 'slot': 'HERO',
            'format': 'hero-plan', 'engineRevision': 'fixed', 'inputSha256': g.sha(content),
            'messagesSha256': g.sha(g.compact(messages)), 'messages': messages}


class Tokenizer:
    def apply_chat_template(self, messages, **kwargs):
        assert kwargs == {'tokenize': False, 'add_generation_prompt': True, 'enable_thinking': False}
        return g.compact(messages)

    def encode(self, prompt, **kwargs):
        assert kwargs == {'add_special_tokens': False}
        return list(prompt.encode())


class GenerationTests(unittest.TestCase):
    def test_rejects_teacher_and_input_drift(self):
        g.validate_cases([case()])
        for mutate in [lambda r: r.update(answer='secret'),
                       lambda r: r['messages'].append({'role': 'assistant', 'content': 'secret'}),
                       lambda r: r.update(messagesSha256='bad'),
                       lambda r: r.update(format='native-content')]:
            row = case(); mutate(row)
            with self.assertRaises(AssertionError): g.validate_cases([row])
        with self.assertRaises(AssertionError): g.validate_cases([case(), case()])

    def test_wrapper_does_not_repair_or_choose_answers(self):
        for raw in ['{}', '```json\n{}\n```', '```\n{}\n```']:
            self.assertTrue(g.parse_output(raw)['parsed'])
        for raw in ['{"a":1,"a":2}', '{"a":{"b":1,"b":2}}', '{"a":NaN}', '{"a":1e999}',
                    '[]', 'null', '{} {}', 'answer: {}', '{"a":1,}', '```json\n{}\n``` tail']:
            self.assertFalse(g.parse_output(raw)['parsed'], raw)

    def run_case(self, finish='stop', raw='{"format":"hero-plan"}'):
        records, calls = [], []
        def stream(prompt, ids, settings):
            calls.append((prompt, ids, copy.deepcopy(settings)))
            yield SimpleNamespace(text=raw, finish_reason=finish, generation_tokens=10)
        g.generate_cases([case()], Tokenizer(), stream, records.append, lambda *a, **k: None)
        return records[0], calls[0]

    def test_exact_full_prompt_and_shared_decoding(self):
        record, call = self.run_case()
        self.assertEqual(call[1], list(call[0].encode()))
        self.assertEqual(record['promptTokens'], len(call[1]))
        self.assertEqual(call[2], g.decoding_contract())
        self.assertTrue(record['complete'] and record['outputFormatMatches'])
        self.assertFalse(record['fullHeroE2EProven'])
        self.assertEqual(record['humanRepairs'], 0)

    def test_truncated_valid_json_and_unknown_stop_fail(self):
        for reason in ['length', None, 'error']:
            record, _ = self.run_case(reason)
            self.assertTrue(record['json']['parsed'])
            self.assertFalse(record['complete'])

    def test_wrong_format_is_not_success(self):
        record, _ = self.run_case(raw='{"format":"native-content"}')
        self.assertTrue(record['complete'])
        self.assertFalse(record['outputFormatMatches'])

    def test_partial_stream_error_persisted_once_without_retry(self):
        records, attempts = [], []
        def stream(*args):
            attempts.append(1)
            yield SimpleNamespace(text='{"format":', finish_reason=None, generation_tokens=2)
            raise RuntimeError('GPU failure fixture')
        with self.assertRaisesRegex(RuntimeError, 'GPU failure fixture'):
            g.generate_cases([case()], Tokenizer(), stream, records.append, lambda *a, **k: None)
        self.assertEqual(len(attempts), 1)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0]['raw'], '{"format":')
        self.assertFalse(records[0]['complete'])


if __name__ == '__main__': unittest.main()

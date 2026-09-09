"""CPU-only admission, immutable pairing and supervisor lifecycle tests."""
import importlib.util
from pathlib import Path
import signal
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('infer', Path(__file__).with_name('hero-distillation-infer.py'))
i = importlib.util.module_from_spec(spec); spec.loader.exec_module(i)
START = {'acPower': True, 'batteryPercent': 100, 'availableBytes': 64*i.t.GIB, 'swapUsedBytes': 0}
GUARD = {'minAvailableGiB': 6, 'maxSwapGrowthGiB': 2, 'maxBatteryDropPoints': 2}


def fixture(root):
    run, evaluation, out = root/'training', root/'evaluation', root/'inference'
    checkpoint = run/'train/checkpoint-0001'; checkpoint.mkdir(parents=True)
    evaluation.mkdir()
    p = {'epochs': 1, 'steps': 1, 'numLayers': 2, 'loraParameters': {'rank': 8},
         'frozenManifestSha256': 'dataset', 'modelRevision': 'revision',
         'modelDirectory': str(root/'base'), 'baseFiles': [], 'guard': GUARD,
         'minimumAvailableBytes': 24*i.t.GIB, 'metalLimitGiB': 28}
    i.t.atomic(run/'manifest.json', p)
    i.t.atomic(run/'train/state.json', {'status': 'completed', 'workerPid': None,
        'manifestSha256': i.t.digest(run/'manifest.json')})
    i.t.atomic(checkpoint/'adapter_config.json', {'fine_tune_type': 'lora', 'num_layers': 2,
                                                  'lora_parameters': p['loraParameters']})
    (checkpoint/'adapters.safetensors').write_bytes(b'CPU fixture, not a real adapter')
    i.t.atomic(run/'train/adapter-roundtrip.json', {'passed': True, 'tensorKeys': [str(n) for n in range(8)]})
    i.t.atomic(run/'train/result.json', {'steps': 1, 'uniqueTrainingTasks': 1,
        'checkpoint': {'step': 1, 'path': checkpoint.name, 'sha256': i.t.digest(checkpoint/'adapters.safetensors')}})
    content = i.g.compact({'outputContract': {'heroId': 'test', 'slot': 'HERO', 'format': 'hero-plan'}})
    messages = [{'role': 'system', 'content': '系統'}, {'role': 'user', 'content': content}]
    row = {'id': 'test:HERO', 'heroId': 'test', 'groupId': 'test', 'slot': 'HERO',
           'format': 'hero-plan', 'engineRevision': 'fixed', 'messages': messages,
           'inputSha256': i.g.sha(content), 'messagesSha256': i.g.sha(i.g.compact(messages))}
    (evaluation/'public-cases.jsonl').write_text(i.g.compact(row)+'\n')
    i.t.atomic(evaluation/'plan.json', {'sourceManifestSha256': 'dataset',
        'split': 'internal-dev', 'blindTest': False,
        'arms': {'base': {'modelRevision': 'revision'}}, 'primaryCaseIds': [row['id']],
        'secondaryCaseIds': [], 'counts': {'tasks': 1, 'primaryWholeHeroes': 1, 'secondarySlots': 0}})
    i.t.atomic(evaluation/'manifest.json', {'sourceManifestSha256': 'dataset', 'outputs': {
        name: i.t.digest(evaluation/name) for name in ['public-cases.jsonl', 'plan.json']}})
    return run, evaluation, out


def make_blind(run, evaluation, overlap=False, leak=False):
    data = run.parent/'data'; data.mkdir()
    i.t.atomic(data/'manifest.json', {'schema': 'fixture-dataset'})
    frozen = i.t.digest(data/'manifest.json')
    content = i.g.compact({'outputContract': {'heroId': 'test', 'slot': 'HERO', 'format': 'hero-plan'}})
    messages = [{'role': 'system', 'content': '系統'}, {'role': 'user', 'content': content}]
    training_row = {'id': ('test' if overlap else 'seen') + ':HERO', 'heroId': 'test' if overlap else 'seen',
        'groupId': 'training', 'slot': 'HERO', 'format': 'hero-plan', 'engineRevision': 'fixed',
        'messages': messages, 'inputSha256': i.g.sha(content), 'messagesSha256': i.g.sha(i.g.compact(messages))}
    for name in ['train.jsonl', 'dev.jsonl']:
        (data/name).write_text(i.g.compact(training_row)+'\n')
    manifest = i.t.read(run/'manifest.json'); manifest.update(frozenManifestSha256=frozen, dataDirectory=str(data))
    i.t.atomic(run/'manifest.json', manifest)
    state = i.t.read(run/'train/state.json'); state['manifestSha256'] = i.t.digest(run/'manifest.json')
    i.t.atomic(run/'train/state.json', state)
    protocol = {'teacherAnswersVisibleToCandidate': leak, 'usedForTraining': False,
                'usedForTuning': False, 'checkpointSelectedBeforeGeneration': True}
    plan = i.t.read(evaluation/'plan.json'); plan.update(sourceManifestSha256='blind-source',
        trainingFrozenManifestSha256=frozen, split='blind-user-batch', blindTest=True, blindProtocol=protocol)
    i.t.atomic(evaluation/'plan.json', plan)
    i.t.atomic(evaluation/'manifest.json', {'sourceManifestSha256': 'blind-source', 'outputs': {
        name: i.t.digest(evaluation/name) for name in ['public-cases.jsonl', 'plan.json']}})


class InferenceTests(unittest.TestCase):
    def test_prepare_copies_only_public_inputs_and_binds_final_adapter(self):
        with tempfile.TemporaryDirectory() as tmp:
            run, evaluation, out = fixture(Path(tmp))
            self.assertFalse((evaluation/'private-teachers.jsonl').exists())
            p = i.prepare(run, evaluation, out)
            self.assertEqual(p['caseIds'], ['test:HERO'])
            self.assertEqual(p['decoding'], i.g.decoding_contract())
            self.assertFalse((out/'private-teachers.jsonl').exists())
            self.assertEqual(i.verify_bundle(out)[0], p)
            self.assertNotIn('mlx.core', sys.modules)
            with self.assertRaisesRegex(AssertionError, 'REFUSE_OVERWRITE'): i.prepare(run, evaluation, out)

    def test_blind_prepare_binds_checkpoint_and_rejects_overlap_or_teacher_leak(self):
        with tempfile.TemporaryDirectory() as tmp:
            run, evaluation, out = fixture(Path(tmp)); make_blind(run, evaluation)
            manifest = i.prepare(run, evaluation, out)
            self.assertTrue(manifest['blindTest'])
            self.assertFalse(manifest['blindProtocol']['teacherAnswersVisibleToCandidate'])
            self.assertFalse((out/'private-teachers.jsonl').exists())
        with tempfile.TemporaryDirectory() as tmp:
            run, evaluation, out = fixture(Path(tmp)); make_blind(run, evaluation, overlap=True)
            with self.assertRaisesRegex(AssertionError, 'BLIND_HERO_OVERLAP:test'):
                i.prepare(run, evaluation, out)
        with tempfile.TemporaryDirectory() as tmp:
            run, evaluation, out = fixture(Path(tmp)); make_blind(run, evaluation, leak=True)
            with self.assertRaisesRegex(AssertionError, 'INVALID_BLIND_PROTOCOL'):
                i.prepare(run, evaluation, out)

    def test_blind_plan_builder_output_is_accepted_without_contract_translation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run, evaluation, _ = fixture(root)
            data = root/'data'; data.mkdir()
            i.t.atomic(data/'manifest.json', {'schema': 'fixture-dataset'})
            frozen = i.t.digest(data/'manifest.json')
            for name in ['train.jsonl', 'dev.jsonl']:
                (data/name).write_text(i.g.compact({'id': 'seen:HERO', 'heroId': 'seen'})+'\n')
            manifest = i.t.read(run/'manifest.json')
            manifest.update(frozenManifestSha256=frozen, dataDirectory=str(data))
            i.t.atomic(run/'manifest.json', manifest)
            state = i.t.read(run/'train/state.json'); state['manifestSha256'] = i.t.digest(run/'manifest.json')
            i.t.atomic(run/'train/state.json', state)
            blind = root/'blind-evaluation'
            command = ['node', str(Path(__file__).with_name('hero-distillation-blind-eval-plan.mjs')),
                       str(run), str(evaluation/'public-cases.jsonl'), str(blind)]
            completed = i.subprocess.run(command, check=True, capture_output=True, text=True)
            self.assertEqual(completed.returncode, 0)
            prepared = i.prepare(run, blind, root/'blind-inference')
            self.assertTrue(prepared['blindTest'])
            self.assertEqual(prepared['caseIds'], ['test:HERO'])

    def test_running_training_or_nonfinal_checkpoint_cannot_prepare(self):
        for changes, file, message in [({'status': 'running', 'workerPid': 123}, 'state.json', 'TRAIN_NOT_TERMINAL_SUCCESS'),
                ({'steps': 0}, 'result.json', 'INCOMPLETE_EPOCH'),
                ({'passed': False}, 'adapter-roundtrip.json', 'ROUNDTRIP_REQUIRED')]:
            with tempfile.TemporaryDirectory() as tmp:
                run, evaluation, out = fixture(Path(tmp))
                target = run/'train'/file
                i.t.atomic(target, {**i.t.read(target), **changes})
                with self.assertRaisesRegex(AssertionError, message): i.prepare(run, evaluation, out)
                self.assertFalse(out.exists())

    def test_input_adapter_and_snapshot_drift_fail_closed(self):
        for target, message in [('public-cases.jsonl', 'PUBLIC_INPUT_DRIFT'),
                                ('source/hero-distillation-generation.py', 'SNAPSHOT_DRIFT')]:
            with tempfile.TemporaryDirectory() as tmp:
                run, evaluation, out = fixture(Path(tmp)); i.prepare(run, evaluation, out)
                (out/target).write_text('changed')
                with self.assertRaisesRegex(AssertionError, message): i.verify_bundle(out)
        with tempfile.TemporaryDirectory() as tmp:
            run, evaluation, out = fixture(Path(tmp))
            (run/'train/checkpoint-0001/adapters.safetensors').write_bytes(b'changed')
            with self.assertRaisesRegex(AssertionError, 'ADAPTER_DRIFT'): i.prepare(run, evaluation, out)

    def test_existing_training_lock_is_never_removed_and_no_child_spawned(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run, evaluation, out = fixture(root); i.prepare(run, evaluation, out)
            lock = root/'gpu.lock'; i.t.atomic(lock, {'token': 'training-worker'})
            with patch.object(i.t, 'LOCK', lock), patch.object(i.t, 'resources', return_value=START), patch.object(i.subprocess, 'Popen') as spawn:
                with self.assertRaises(SystemExit): i.supervise(out, 'base')
                spawn.assert_not_called()
            self.assertEqual(i.t.read(lock)['token'], 'training-worker')
            self.assertFalse((out/'base').exists())

    def test_spawn_failure_releases_only_owned_lock_and_preserves_handlers(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run, evaluation, out = fixture(root); i.prepare(run, evaluation, out)
            lock = root/'gpu.lock'
            handlers = {sig: signal.getsignal(sig) for sig in [signal.SIGINT, signal.SIGTERM]}
            with patch.object(i.t, 'LOCK', lock), patch.object(i.t, 'resources', return_value=START), patch.object(i.subprocess, 'Popen', side_effect=OSError('spawn fixture')):
                with self.assertRaises(SystemExit): i.supervise(out, 'base')
            self.assertFalse(lock.exists())
            self.assertEqual(i.t.read(out/'base/state.json')['status'], 'stopped-or-failed')
            self.assertEqual(handlers, {sig: signal.getsignal(sig) for sig in handlers})
            self.assertFalse((out/'lora').exists())

    def test_unplugged_does_not_spawn(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run, evaluation, out = fixture(root); i.prepare(run, evaluation, out)
            with patch.object(i.t, 'resources', return_value={**START, 'acPower': False}), patch.object(i.subprocess, 'Popen') as spawn:
                with self.assertRaisesRegex(AssertionError, 'RESOURCE_ADMISSION'): i.supervise(out, 'base')
                spawn.assert_not_called()

    def test_time_limit_joins_worker_and_keeps_partial_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); run, evaluation, out = fixture(root); p = i.prepare(run, evaluation, out)
            p['secondsMaximumPerArm'] = -1
            child = MagicMock(pid=456); child.poll.return_value = None
            with patch.object(i, 'verify_bundle', return_value=(p, [])), patch.object(i.t, 'LOCK', root/'gpu.lock'), \
                 patch.object(i.t, 'resources', return_value=START), patch.object(i.subprocess, 'Popen', return_value=child), \
                 patch.object(i.time, 'sleep'), patch.object(i.os, 'killpg') as kill:
                with self.assertRaises(SystemExit): i.supervise(out, 'base')
                kill.assert_called_once_with(456, signal.SIGTERM); child.wait.assert_called_once_with(timeout=5)
            self.assertIn('RUN_TIME_LIMIT', i.t.read(out/'base/state.json')['error'])
            self.assertIsNone(i.t.read(out/'base/state.json')['workerPid'])
            self.assertTrue((out/'base/resources.jsonl').exists())
            self.assertFalse((root/'gpu.lock').exists())

    def test_arithmetic_context_restores_original_and_rejects_unknown_cache(self):
        original = object(); language = SimpleNamespace(scaled_dot_product_attention=original)
        with self.assertRaisesRegex(AssertionError, 'UNTESTED_KV_CACHE'):
            with i.fp32_attention(None, language):
                language.scaled_dot_product_attention(None, None, None, object(), 1, None)
        self.assertIs(language.scaled_dot_product_attention, original)

    def test_z_actual_cpu_attention_masks_gqa_and_output_dtype(self):
        import mlx.core as mx
        mx.set_default_device(mx.cpu)
        from mlx_vlm.models.gemma4 import language
        from mlx_vlm.models.cache import KVCache, RotatingKVCache
        mx.random.seed(7)
        original = language.scaled_dot_product_attention
        q = mx.random.normal((1, 4, 3, 8)).astype(mx.bfloat16)
        k = mx.random.normal((1, 1, 5, 8)).astype(mx.bfloat16)
        v = mx.random.normal((1, 1, 5, 8)).astype(mx.bfloat16)
        mask = mx.arange(5)[None, :] <= mx.arange(2, 5)[:, None]
        expected = mx.fast.scaled_dot_product_attention(q.astype(mx.float32), k.astype(mx.float32),
                    v.astype(mx.float32), scale=1.0, mask=mask).astype(q.dtype)
        with i.fp32_attention(mx, language):
            for cache in [None, KVCache(), RotatingKVCache(max_size=5)]:
                actual = language.scaled_dot_product_attention(q, k, v, cache=cache, scale=1.0, mask=mask)
                mx.eval(actual, expected)
                self.assertEqual(actual.dtype, mx.bfloat16)
                self.assertTrue(mx.array_equal(actual, expected).item())
            causal = language.scaled_dot_product_attention(q, k[:, :, :3], v[:, :, :3],
                                                          cache=None, scale=1.0, mask='causal')
            mx.eval(causal)
            self.assertTrue(mx.all(mx.isfinite(causal)).item())
        self.assertIs(language.scaled_dot_product_attention, original)


if __name__ == '__main__': unittest.main()

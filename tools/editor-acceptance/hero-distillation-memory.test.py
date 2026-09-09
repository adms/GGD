"""CPU-only forward/gradient equivalence; no model weights or GPU tensors."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import mlx.core as mx
import mlx.nn as nn

mx.set_default_device(mx.cpu)
spec = importlib.util.spec_from_file_location('distillation_memory', Path(__file__).with_name('hero-distillation-memory.py'))
memory = importlib.util.module_from_spec(spec); spec.loader.exec_module(memory)


class MemoryTests(unittest.TestCase):
    def test_value_leaf_roundtrips_and_deliberately_detaches(self):
        for dtype in [mx.float32,mx.float16,mx.bfloat16]:
            value=mx.array([1.125,-2.5,0.0,17.75],dtype=dtype)
            clone=memory.evaluated_leaf(mx,value)
            self.assertEqual(clone.dtype,dtype)
            self.assertTrue(mx.array_equal(clone,value).item())
        detached=mx.grad(lambda x: mx.sum(memory.evaluated_leaf(mx,x*x)))(mx.array([2.0,3.0]))
        self.close(detached,mx.zeros((2,)))

    def close(self, a, b, tolerance=2e-5):
        mx.eval(a, b)
        self.assertLessEqual(mx.max(mx.abs(a.astype(mx.float32) - b.astype(mx.float32))).item(), tolerance)

    def test_attention_outputs_and_all_qkv_gradients(self):
        for length, heads, kv_heads, width, window in [(1, 2, 1, 16, None), (35, 4, 2, 32, None),
                (35, 4, 2, 32, 9), (17, 2, 1, 256, 5), (17, 2, 1, 512, None)]:
            with self.subTest(length=length, width=width, window=window):
                mx.random.seed(7)
                q = mx.random.normal((1, heads, length, width))
                k = mx.random.normal((1, kv_heads, length, width))
                v = mx.random.normal((1, kv_heads, length, width))
                cotangent = mx.random.normal(q.shape)
                qi = mx.arange(length)[:, None]; ki = mx.arange(length)[None, :]
                mask = qi >= ki
                if window: mask = mask & (ki > qi - window)
                native = lambda q, k, v: mx.fast.scaled_dot_product_attention(q, k, v, scale=width ** -0.5, mask=mask)
                bounded = memory.make_attention(mx, scale=width ** -0.5, window=window, block_size=7)
                a, ga = mx.vjp(native, [q, k, v], [cotangent])
                b, gb = mx.vjp(bounded, [q, k, v], [cotangent])
                self.close(a[0], b[0])
                for x, y in zip(ga, gb): self.close(x, y)

    def test_completion_loss_and_hidden_gradient_preserve_every_answer_token(self):
        mx.random.seed(9)
        hidden = mx.random.normal((1, 31, 13))
        weights = mx.random.normal((67, 13))
        targets = mx.arange(31)[None, :]
        project = lambda x: x @ weights.T
        native = lambda x: nn.losses.cross_entropy(project(x), targets, reduction='mean')
        bounded = memory.make_completion_loss(mx, nn, project, targets, block_size=7)
        la, ga = mx.value_and_grad(native)(hidden)
        lb, gb = mx.value_and_grad(bounded)(hidden)
        self.close(la, lb); self.close(ga, gb)
        self.assertGreater(mx.sum(mx.abs(gb[:, -1])).item(), 0)

    def test_frozen_mlp_outputs_gradients_scope_and_restoration(self):
        class MLP(nn.Module):
            def __init__(self):
                super().__init__();self.up=nn.Linear(8,17);self.down=nn.Linear(17,8)
            def __call__(self,x): return self.down(nn.gelu_approx(self.up(x)))
        mx.random.seed(15);mlp=MLP();other=MLP();original=MLP.__call__
        h=mx.random.normal((1,35,8));dy=mx.random.normal(h.shape)
        with self.assertRaisesRegex(AssertionError,'MLP_MUST_BE_FROZEN'):
            with memory.frozen_mlp_policy(mx,[SimpleNamespace(mlp=mlp)],block_size=7): pass
        mlp.freeze()
        expected=mx.vjp(lambda x:mlp(x),[h],[dy])
        with memory.frozen_mlp_policy(mx,[SimpleNamespace(mlp=mlp)],block_size=7):
            actual=mx.vjp(lambda x:mlp(x),[h],[dy])
            self.close(other(h),original(other,h))
        self.assertIs(MLP.__call__,original)
        self.close(expected[0][0],actual[0][0]);self.close(expected[1][0],actual[1][0])

    def test_four_dimensional_frozen_q_norm_preserves_gradients(self):
        norm=nn.RMSNorm(16);norm.freeze()
        mx.random.seed(17);h=mx.random.normal((1,35,4,16));dy=mx.random.normal(h.shape)
        expected=mx.vjp(lambda x:norm(x),[h],[dy])
        bounded=memory.make_tokenwise_frozen(mx,norm,block_size=7)
        actual=mx.vjp(bounded,[h],[dy])
        self.close(expected[0][0],actual[0][0]);self.close(expected[1][0],actual[1][0])

    def test_unsupported_cached_sequence_shape_is_rejected(self):
        fn = memory.make_attention(mx, scale=1, block_size=4)
        with self.assertRaisesRegex(AssertionError, 'UNCACHED_SELF_ATTENTION_ONLY'):
            fn(mx.ones((1, 2, 3, 16)), mx.ones((1, 1, 7, 16)), mx.ones((1, 1, 7, 16)))

    def test_bfloat_inputs_share_float32_reference_and_patch_is_restored(self):
        class StubModel:
            def _make_masks(self, h, cache, mm_token_type_ids=None): return ['causal']
        original_attention = object()
        original_masks = StubModel._make_masks
        module = SimpleNamespace(scaled_dot_product_attention=original_attention, Gemma4TextModel=StubModel)
        model = StubModel(); model.layers = [SimpleNamespace(layer_type='full_attention')]; model.window_size = 5
        mx.random.seed(23)
        q = mx.random.normal((1, 4, 35, 32)).astype(mx.bfloat16)
        k = mx.random.normal((1, 2, 35, 32)).astype(mx.bfloat16)
        v = mx.random.normal((1, 2, 35, 32)).astype(mx.bfloat16)
        dy = mx.random.normal(q.shape).astype(mx.bfloat16)
        outputs = []
        with patch.object(memory.importlib, 'import_module', return_value=module):
            for reference in [True, False]:
                with memory.gemma_attention_policy(mx, block_size=7, reference=reference):
                    mask = model._make_masks(None, [None])[0]
                    fn = lambda q, k, v: module.scaled_dot_product_attention(q, k, v, cache=None, scale=32 ** -0.5, mask=mask)
                    outputs.append(mx.vjp(fn, [q, k, v], [dy]))
                self.assertIs(module.scaled_dot_product_attention, original_attention)
                self.assertIs(StubModel._make_masks, original_masks)
        self.close(outputs[0][0][0], outputs[1][0][0], 0.002)
        for a, b in zip(outputs[0][1], outputs[1][1]): self.close(a, b, 0.002)

    def test_frozen_prefix_partition_preserves_outputs_and_trainable_gradients(self):
        from mlx.utils import tree_flatten
        class Layer(nn.Module):
            def __init__(self):
                super().__init__(); self.linear = nn.Linear(8, 8); self.layer_type = 'full_attention'
            def __call__(self, h, mask, cache, **kwargs): return mx.tanh(self.linear(h)), None, 0
        class Body(nn.Module):
            def __init__(self):
                super().__init__(); self.embed_tokens = nn.Embedding(31, 8); self.embed_scale = 1.0
                self.layers = [Layer(), Layer(), Layer()]; self.norm = nn.LayerNorm(8)
                self.previous_kvs = [0, 1, 2]; self.hidden_size_per_layer_input = 0; self.window_size = 5
            def _make_masks(self, h, cache, mm_token_type_ids=None): return ['causal'] * 3
        class Model(nn.Module):
            def __init__(self):
                super().__init__(); self.language_model = nn.Module(); self.language_model.model = Body()
        mx.random.seed(55); model = Model(); model.freeze(); model.language_model.model.layers[-1].unfreeze()
        ids = mx.array([[1, 2, 3, 4, 5]])
        def full(m):
            b = m.language_model.model; h = b.embed_tokens(ids) * b.embed_scale
            for layer in b.layers: h, _, _ = layer(h, None, None)
            return mx.sum(b.norm(h) ** 2)
        module = SimpleNamespace(scaled_dot_product_attention=object(), Gemma4TextModel=Body)
        with patch.object(memory.importlib, 'import_module', return_value=module):
            prefix = memory.frozen_prefix(mx, model, ids, tail_layers=1)
            def tail(m): return mx.sum(memory.tail_hidden(mx, m, prefix, tail_layers=1) ** 2)
            la, ga = nn.value_and_grad(model, full)(model)
            lb, gb = nn.value_and_grad(model, tail)(model)
        self.close(la, lb)
        a, b = dict(tree_flatten(ga)), dict(tree_flatten(gb))
        self.assertEqual(set(a), set(b))
        for key in a: self.close(a[key], b[key])

        # Exercise the entire two-layer chain rule with a frozen vocabulary
        # head and completion-only labels, not just an isolated primitive.
        model.language_model.model.layers[-2].unfreeze()
        head=mx.random.normal((31,8))
        model.language_model.logits_from_hidden=lambda h:h@head.T
        targets=mx.array([[4,5,6]])
        before=dict(tree_flatten(model.trainable_parameters()))
        with patch.object(memory.importlib,'import_module',return_value=module):
            prefix=memory.frozen_prefix(mx,model,ids,tail_layers=2)
            def dense(m):
                h=memory.tail_hidden(mx,m,prefix,tail_layers=2,reference=True)[:,-3:]
                return nn.losses.cross_entropy(m.language_model.logits_from_hidden(h),targets,reduction='mean')
            la,ga=nn.value_and_grad(model,dense)(model)
            lb,gb=memory.tail_value_and_grad(mx,nn,model,prefix,targets,tail_layers=2,block_size=2,loss_block_size=2)
        self.close(la,lb)
        a,b=dict(tree_flatten(ga)),dict(tree_flatten(gb))
        self.assertEqual(set(a),set(b))
        for key in a:self.close(a[key],b[key])
        after=dict(tree_flatten(model.trainable_parameters()))
        self.assertEqual(set(before),set(after))
        for key in before:self.assertTrue(mx.array_equal(before[key],after[key]).item())


if __name__ == '__main__': unittest.main()

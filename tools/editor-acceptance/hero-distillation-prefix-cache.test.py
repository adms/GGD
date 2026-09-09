"""CPU tests using actual Gemma4 decoder layers, not a cache-shaped stub."""
import importlib.util
from pathlib import Path
import unittest
import mlx.core as mx
import mlx.nn as nn
from mlx.utils import tree_flatten
from mlx_vlm.models.gemma4.config import TextConfig
from mlx_vlm.models.gemma4.language import Gemma4TextModel

mx.set_default_device(mx.cpu)
def load(name):
    spec=importlib.util.spec_from_file_location(name,Path(__file__).with_name(name+'.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
memory=load('hero-distillation-memory');cache=load('hero-distillation-prefix-cache')

class PrefixTests(unittest.TestCase):
    def model(self,k_eq_v=False):
        config=TextConfig(hidden_size=32,intermediate_size=64,num_hidden_layers=4,num_attention_heads=4,
            num_key_value_heads=2,head_dim=8,global_head_dim=16,vocab_size=73,
            num_kv_shared_layers=0,hidden_size_per_layer_input=0,sliding_window=5,
            layer_types=['full_attention','sliding_attention','sliding_attention','full_attention'],
            attention_k_eq_v=k_eq_v,num_global_key_value_heads=1 if k_eq_v else None)
        model=nn.Module();model.language_model=nn.Module();model.language_model.model=Gemma4TextModel(config)
        model.language_model.logits_from_hidden=lambda h:h@model.language_model.model.embed_tokens.weight.T
        model.freeze();model.language_model.model.layers[-1].self_attn.q_proj.unfreeze()
        model.language_model.model.layers[-2].self_attn.o_proj.unfreeze()
        return model
    def close(self,a,b,tol=2e-5):
        self.assertLessEqual(mx.max(mx.abs(a.astype(mx.float32)-b.astype(mx.float32))).item(),tol)
    def test_full_hidden_and_tail_gradient_with_reused_sliding_and_full_prefix(self):
        mx.random.seed(24);model=self.model();prefix=[1,2,3,4,5,6,7,8,9]
        saved=cache.FrozenPrefixCache(mx,memory,model,prefix,block_size=3)
        host_bytes=[k.data.tobytes()+v.data.tobytes() for k,v,_,_ in saved.layers]
        for suffix in [[10],[11,12,13,14,15,16,17],[19,18,17]]:
            ids=prefix+suffix
            native=memory.frozen_prefix(mx,model,mx.array([ids]),tail_layers=2,block_size=3)
            reused=saved.hidden_for(ids);self.close(native,reused)
            targets=mx.array([[3,4,5]])
            la,ga=memory.tail_value_and_grad(mx,nn,model,native,targets,tail_layers=2,block_size=3,loss_block_size=2)
            lb,gb=memory.tail_value_and_grad(mx,nn,model,reused,targets,tail_layers=2,block_size=3,loss_block_size=2)
            self.close(la,lb)
            a,b=dict(tree_flatten(ga)),dict(tree_flatten(gb));self.assertEqual(set(a),set(b))
            for key in a:self.close(a[key],b[key])
        self.assertEqual(host_bytes,[k.data.tobytes()+v.data.tobytes() for k,v,_,_ in saved.layers])
        self.close(saved.hidden_for(prefix),memory.frozen_prefix(mx,model,mx.array([prefix]),tail_layers=2,block_size=3))
        # A subsequent optimizer state must still run the trainable tail;
        # the shared cache may contain no old tail activations or answers.
        projection=model.language_model.model.layers[-1].self_attn.q_proj
        projection.weight=projection.weight+0.07*mx.random.normal(projection.weight.shape)
        native=memory.frozen_prefix(mx,model,mx.array([ids]),tail_layers=2,block_size=3)
        reused=saved.hidden_for(ids);self.close(native,reused)
        changed_loss,changed_grads=memory.tail_value_and_grad(mx,nn,model,native,targets,tail_layers=2,block_size=3,loss_block_size=2)
        cached_loss,cached_grads=memory.tail_value_and_grad(mx,nn,model,reused,targets,tail_layers=2,block_size=3,loss_block_size=2)
        self.close(changed_loss,cached_loss)
        self.assertGreater(abs(changed_loss.item()-la.item()),1e-7)
        a,b=dict(tree_flatten(changed_grads)),dict(tree_flatten(cached_grads))
        for key in a:self.close(a[key],b[key])
    def test_prefix_drift_and_trainable_prefix_fail_closed(self):
        model=self.model();saved=cache.FrozenPrefixCache(mx,memory,model,[1,2,3])
        with self.assertRaisesRegex(AssertionError,'PREFIX_MISMATCH'):saved.hidden_for([1,7,3,4])
        model.language_model.model.layers[0].unfreeze()
        with self.assertRaisesRegex(AssertionError,'PREFIX_LAYER_TRAINABLE'):saved.hidden_for([1,2,3,4])
    def test_global_k_eq_v_single_head_matches_actual_12b_architecture(self):
        mx.random.seed(28);model=self.model(k_eq_v=True);prefix=list(range(1,10));ids=prefix+list(range(20,28))
        saved=cache.FrozenPrefixCache(mx,memory,model,prefix,block_size=3)
        native=memory.frozen_prefix(mx,model,mx.array([ids]),tail_layers=2,block_size=3)
        reused=saved.hidden_for(ids);self.close(native,reused)
        targets=mx.array([[3,4,5]])
        la,ga=memory.tail_value_and_grad(mx,nn,model,native,targets,tail_layers=2,block_size=3,loss_block_size=2)
        lb,gb=memory.tail_value_and_grad(mx,nn,model,reused,targets,tail_layers=2,block_size=3,loss_block_size=2)
        self.close(la,lb)
        a,b=dict(tree_flatten(ga)),dict(tree_flatten(gb))
        for key in a:self.close(a[key],b[key])
    def test_host_bfloat_roundtrip_and_one_use_kv(self):
        value=mx.arange(32).reshape(1,2,4,4).astype(mx.bfloat16)
        host=cache.HostTensor(mx,value);self.close(host.device(mx),value,0)
        kv=cache.PrefixKV(mx,host,host,4,0);kv.update_and_fetch(value,value)
        with self.assertRaisesRegex(AssertionError,'ONE_USE'):kv.update_and_fetch(value,value)

if __name__=='__main__':unittest.main()

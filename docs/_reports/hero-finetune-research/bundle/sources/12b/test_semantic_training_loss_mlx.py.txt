"""Tiny numerical CPU proof; no model weights and no GPU compute."""
import unittest
import mlx.core as mx
import mlx.nn as nn
from semantic_training_loss import masked_next_token_loss
mx.set_default_device(mx.cpu)

class Toy(nn.Module):
    def __init__(self):
        super().__init__(); self.scores = mx.arange(42, dtype=mx.float32).reshape(1,6,7)/100
    def __call__(self, tokens, **kwargs):
        class Output: pass
        out=Output();out.logits=self.scores;return out

class NumericalMaskTests(unittest.TestCase):
    def test_selected_loss_and_gradients_equal_dense_reference(self):
        ids=[0,1,2,3,4,5,6];labels=[0,0,1,0,1,0,1];net=Toy()
        def selected(m): return masked_next_token_loss(m,ids,labels,mx,nn)
        def dense(m):
            losses=nn.losses.cross_entropy(m.scores[0],mx.array(ids[1:]),reduction='none')
            keep=mx.array(labels[1:],dtype=mx.float32);return (losses*keep).sum()/keep.sum()
        v,g=nn.value_and_grad(net,selected)(net);rv,rg=nn.value_and_grad(net,dense)(net)
        mx.eval(v,g,rv,rg);self.assertAlmostEqual(v.item(),rv.item(),places=6)
        self.assertLess(mx.max(mx.abs(g['scores']-rg['scores'])).item(),1e-6)
        for i,keep in enumerate(labels[1:]):
            magnitude=mx.abs(g['scores'][0,i]).sum().item()
            if keep:self.assertGreater(magnitude,0)
            else:self.assertEqual(magnitude,0)
        self.assertIn('cpu',str(mx.default_device()).lower())

if __name__=='__main__': unittest.main()

"""Process-local, frozen-layers-only public-prefix cache for Gemma4 text.

No dataset/teacher lookup, no disk weights, no training-state cache. Host arrays
are immutable; each suffix receives a fresh one-use KV view and absolute RoPE
offset. The trainable tail still processes the COMPLETE sequence every step.
"""
from contextlib import contextmanager
import importlib
import numpy as np


class HostTensor:
    def __init__(self,mx,value):
        self.dtype=value.dtype
        safe=value.astype(mx.float32) if value.dtype==mx.bfloat16 else value
        self.data=np.array(safe,copy=True)
        self.data.flags.writeable=False
    def device(self,mx):return mx.array(self.data).astype(self.dtype)
    @property
    def nbytes(self):return self.data.nbytes


class PrefixKV:
    def __init__(self,mx,keys,values,offset,key_start):
        self.mx=mx;self.keys=keys;self.values=values
        self.offset=offset;self.key_start=key_start;self.used=False
    def update_and_fetch(self,keys,values):
        assert not self.used,'PREFIX_KV_IS_ONE_USE'
        assert keys.shape[:-2]==self.keys.data.shape[:-2]
        self.used=True
        return (self.mx.concatenate([self.keys.device(self.mx),keys],axis=-2),
                self.mx.concatenate([self.values.device(self.mx),values],axis=-2))


@contextmanager
def cached_attention_policy(mx,block_size=256,observer=None):
    """Causal/sliding attention for a frozen suffix; no autodiff is used here."""
    module=importlib.import_module('mlx_vlm.models.gemma4.language')
    original=module.scaled_dot_product_attention
    def attention(q,k,v,*,cache,scale,mask,sinks=None):
        assert isinstance(cache,PrefixKV) and cache.used and sinks is None,'PREFIX_CACHE_REQUIRED'
        assert isinstance(mask,tuple) and mask[0]=='ggd-prefix-causal','PREFIX_MASK_REQUIRED'
        window=mask[1];dtype=q.dtype;pieces=[]
        assert k.shape[-2]==v.shape[-2]==cache.offset-cache.key_start+q.shape[-2]
        for begin in range(0,q.shape[-2],block_size):
            end=min(begin+block_size,q.shape[-2])
            query_begin=cache.offset+begin
            key_begin=max(cache.key_start,query_begin-window+1) if window else cache.key_start
            key_end=cache.offset+end
            lo,hi=key_begin-cache.key_start,key_end-cache.key_start
            qi=mx.arange(query_begin,cache.offset+end)[:,None]
            ki=mx.arange(key_begin,key_end)[None,:]
            allowed=qi>=ki
            if window:allowed=allowed&(ki>qi-window)
            piece=mx.fast.scaled_dot_product_attention(q[:,:,begin:end].astype(mx.float32),
                k[:,:,lo:hi].astype(mx.float32),v[:,:,lo:hi].astype(mx.float32),scale=scale,mask=allowed).astype(dtype)
            mx.eval(piece);pieces.append(piece)
            if observer:observer('cached-attention-block',begin=begin,end=end)
        return mx.concatenate(pieces,axis=-2)
    module.scaled_dot_product_attention=attention
    try:yield
    finally:module.scaled_dot_product_attention=original


class FrozenPrefixCache:
    def __init__(self,mx,memory,model,prefix_ids,*,tail_layers=2,block_size=256,observer=None):
        self.mx=mx;self.memory=memory;self.model=model;self.tail_layers=tail_layers
        self.block_size=block_size;self.observer=observer
        self.ids=tuple(int(x) for x in prefix_ids);assert self.ids,'EMPTY_PREFIX'
        body,split=memory._partition(model,tail_layers)
        self._frozen(body,split)
        self.layers=[]
        with memory.gemma_attention_policy(mx,block_size=block_size,observer=observer):
            h=body.embed_tokens(mx.array([self.ids],dtype=mx.int32))*body.embed_scale
            masks=body._make_masks(h,[None]*len(body.layers))
            for index,layer in enumerate(body.layers[:split]):
                h,kv,_=layer(h,masks[index],None,per_layer_input=None,shared_kv=None,offset=None)
                mx.eval(h,kv)
                window=body.window_size if layer.layer_type=='sliding_attention' else None
                start=max(0,len(self.ids)-window+1) if window else 0
                self.layers.append((HostTensor(mx,kv[0][:,:,start:]),HostTensor(mx,kv[1][:,:,start:]),start,window))
                if observer:observer('prefix-cache-build',layer=index,hostCacheBytes=self.nbytes)
            self.hidden=HostTensor(mx,h)
    @property
    def nbytes(self):
        return sum(k.nbytes+v.nbytes for k,v,_,_ in self.layers)+getattr(getattr(self,'hidden',None),'nbytes',0)
    @staticmethod
    def _frozen(body,split):
        from mlx.utils import tree_flatten
        assert not tree_flatten(body.embed_tokens.trainable_parameters()),'PREFIX_EMBEDDING_TRAINABLE'
        assert all(not tree_flatten(layer.trainable_parameters()) for layer in body.layers[:split]),'PREFIX_LAYER_TRAINABLE'
    def hidden_for(self,input_ids):
        mx=self.mx;ids=tuple(int(x) for x in input_ids)
        assert ids[:len(self.ids)]==self.ids,'PUBLIC_PREFIX_MISMATCH'
        body,split=self.memory._partition(self.model,self.tail_layers)
        self._frozen(body,split)
        if len(ids)==len(self.ids):return self.hidden.device(mx)
        h=body.embed_tokens(mx.array([ids[len(self.ids):]],dtype=mx.int32))*body.embed_scale
        with cached_attention_policy(mx,self.block_size,self.observer):
            for index,layer in enumerate(body.layers[:split]):
                keys,values,start,window=self.layers[index]
                cache=PrefixKV(mx,keys,values,len(self.ids),start)
                h,_,_=layer(h,('ggd-prefix-causal',window),cache,per_layer_input=None,shared_kv=None,offset=None)
                mx.eval(h)
                if self.observer:self.observer('cached-frozen-layer',layer=index,hostCacheBytes=self.nbytes)
                del cache
        result=mx.concatenate([self.hidden.device(mx),h],axis=1);mx.eval(result)
        return mx.stop_gradient(result)


def diagnose_partition(mx,memory,model,input_ids,prefix_tokens,*,block_size=256,observer=None):
    """Bounded forward-only localization, NOT capacity or training admission.

    Compare the original and block-aligned public-prefix boundary at the first
    layer and first full-attention layer. Every comparison uses all input tokens.
    No model parameter, training setting, or stored dataset is changed.
    """
    import gc
    body=model.language_model.model
    depths=sorted({1,next(i+1 for i,layer in enumerate(body.layers) if layer.layer_type=='full_attention')})
    assert max(depths)<=6 and max(depths)<len(body.layers),'BOUNDED_DIAGNOSTIC_ONLY'
    boundaries=sorted({prefix_tokens,prefix_tokens//block_size*block_size})
    assert min(boundaries)>0 and max(boundaries)<len(input_ids),'INVALID_PUBLIC_PREFIX'
    def relative(a,b):
        a,b=a.astype(mx.float32),b.astype(mx.float32)
        return (mx.sqrt(mx.sum((a-b)**2))/mx.maximum(mx.sqrt(mx.sum(a*a)),1e-12)).item()
    rows=[]
    for depth in depths:
        tail=len(body.layers)-depth
        native=memory.frozen_prefix(mx,model,mx.array([input_ids],dtype=mx.int32),
            tail_layers=tail,block_size=block_size,observer=observer)
        for boundary in boundaries:
            saved=FrozenPrefixCache(mx,memory,model,input_ids[:boundary],tail_layers=tail,
                block_size=block_size,observer=observer)
            reused=saved.hidden_for(input_ids)
            row={'frozenDepth':depth,'publicPrefixTokens':boundary,'totalTokens':len(input_ids),
                'blockAligned':boundary%block_size==0,'hiddenRelativeL2':relative(native,reused),
                'prefixRelativeL2':relative(native[:,:boundary],reused[:,:boundary]),
                'suffixRelativeL2':relative(native[:,boundary:],reused[:,boundary:])}
            # A full-vs-segmented GEMM control distinguishes projection shape
            # differences from errors introduced only after attention masking.
            if depth==1:
                h=body.layers[0].input_layernorm(body.embed_tokens(mx.array([input_ids],dtype=mx.int32))*body.embed_scale)
                row['projectionRelativeL2']={}
                for name in ['q_proj','k_proj','v_proj']:
                    project=getattr(body.layers[0].self_attn,name)
                    whole=project(h);parts=mx.concatenate([project(h[:,:boundary]),project(h[:,boundary:])],axis=1)
                    row['projectionRelativeL2'][name]=relative(whole,parts)
                    del whole,parts
                del h
            rows.append(row)
            del saved,reused
            gc.collect();mx.clear_cache()
        del native
        gc.collect();mx.clear_cache()
    return {'diagnosticOnly':True,'optimizerSteps':0,'allInputTokensPreserved':True,
            'rows':rows,'fullFrozenStackVerified':False,'cacheAdmitted':False}

"""Bounded exact-context attention and frozen-head completion loss for MLX.

No installed library files are changed. Text-only, uncached teacher forcing;
full/sliding causal masks are preserved. A custom VJP recomputes each attention
block with explicit first-order SDPA derivatives, accumulating K/V gradients in float32. All source and
answer tokens remain present. CPU equivalence tests precede GPU admission.
"""
from contextlib import contextmanager
import importlib
import numpy as np


def evaluated_leaf(mx, value):
    """Copy evaluated values into a new leaf, not an identity/stop-gradient op.

    MLX keeps evaluated graphs while an outer gradient trace is active. A
    stop_gradient node still owns its inputs. This explicit host copy severs
    those references. Used only inside FIRST-ORDER custom forward/VJP blocks;
    the custom VJP supplies all required derivatives. Not a higher-order API.
    BF16 values roundtrip exactly through float32; arithmetic is unchanged.
    """
    dtype = value.dtype
    safe = value.astype(mx.float32) if dtype == mx.bfloat16 else value
    result = mx.array(np.array(safe, copy=True)).astype(dtype)
    mx.eval(result)
    return result


def _partition(model, tail_layers):
    body = model.language_model.model
    assert 0 < tail_layers < len(body.layers)
    assert not body.hidden_size_per_layer_input, 'PER_LAYER_INPUT_PARTITION_UNSUPPORTED'
    assert body.previous_kvs == list(range(len(body.layers))), 'SHARED_KV_PARTITION_UNSUPPORTED'
    return body, len(body.layers) - tail_layers


def frozen_prefix(mx, model, inputs, *, tail_layers, block_size=256, observer=None):
    """Compute genuinely frozen layers outside value_and_grad, once per row."""
    body, split = _partition(model, tail_layers)
    with gemma_attention_policy(mx, block_size=block_size, observer=observer):
        hidden = body.embed_tokens(inputs) * body.embed_scale
        masks = body._make_masks(hidden, [None] * len(body.layers))
        for index, (layer, mask) in enumerate(zip(body.layers[:split], masks[:split])):
            hidden, _, _ = layer(hidden, mask, None, per_layer_input=None, shared_kv=None, offset=None)
            mx.eval(hidden)
            if observer: observer('frozen-layer', layer=index)
    return mx.stop_gradient(hidden)


def tail_hidden(mx, model, prefix, *, tail_layers, block_size=256, reference=False, observer=None):
    body, split = _partition(model, tail_layers)
    with gemma_attention_policy(mx, block_size=block_size, reference=reference, observer=observer), \
            frozen_mlp_policy(mx, body.layers[split:], block_size=block_size, reference=reference, observer=observer):
        hidden = prefix
        masks = body._make_masks(hidden, [None] * len(body.layers))
        for layer, mask in zip(body.layers[split:], masks[split:]):
            hidden, _, _ = layer(hidden, mask, None, per_layer_input=None, shared_kv=None, offset=None)
        return body.norm(hidden)


def tail_value_and_grad(mx, nn, model, prefix, targets, *, tail_layers, block_size=256, loss_block_size=128, observer=None):
    """First-order chain rule across tail layers, without one enclosing trace.

    Checkpoint each layer's full hidden state, then recompute/VJP ONE layer at
    a time. All prompt positions and every trainable tail tensor participate.
    Frozen prefix and vocabulary head get no parameter gradients by design.
    """
    from mlx.utils import tree_flatten,tree_unflatten
    body,split=_partition(model,tail_layers)
    assert not tree_flatten(body.norm.trainable_parameters()),'FINAL_NORM_MUST_BE_FROZEN'
    allowed=tuple(f'language_model.model.layers.{i}.' for i in range(split,len(body.layers)))
    expected=dict(tree_flatten(model.trainable_parameters()))
    assert expected and all(key.startswith(allowed) for key in expected),'OUTSIDE_TAIL_TRAINABLE'
    checkpoints=[prefix]
    with gemma_attention_policy(mx,block_size=block_size,observer=observer), \
            frozen_mlp_policy(mx,body.layers[split:],block_size=block_size,observer=observer):
        masks=body._make_masks(prefix,[None]*len(body.layers))
        for index in range(split,len(body.layers)):
            hidden,_,_=body.layers[index](checkpoints[-1],masks[index],None,per_layer_input=None,shared_kv=None,offset=None)
            mx.eval(hidden);checkpoints.append(hidden)
        normalized=body.norm(checkpoints[-1]);mx.eval(normalized)
        n=targets.shape[1]
        assert 0<n<=normalized.shape[1]
        answer=normalized[:,-n:,:]
        loss_function=make_completion_loss(mx,nn,model.language_model.logits_from_hidden,targets,block_size=loss_block_size,observer=observer)
        loss,answer_gradient=mx.value_and_grad(loss_function)(answer)
        mx.eval(loss,answer_gradient)
        gradient=mx.concatenate([mx.zeros_like(normalized[:,:-n,:]),answer_gradient],axis=1)
        norm_outputs,norm_gradients=mx.vjp(body.norm,[checkpoints[-1]],[gradient])
        gradient=norm_gradients[0];mx.eval(gradient)
        del norm_outputs,norm_gradients,normalized,answer,answer_gradient
        checkpoints.pop()  # Final output is no longer needed after norm VJP.
        del hidden
        collected=[]
        for index in range(len(body.layers)-1,split-1,-1):
            layer=body.layers[index];pairs=tree_flatten(layer.trainable_parameters())
            names=[name for name,_ in pairs];original=[value for _,value in pairs]
            def forward(hidden,*parameters):
                layer.update(tree_unflatten(list(zip(names,parameters))))
                return layer(hidden,masks[index],None,per_layer_input=None,shared_kv=None,offset=None)[0]
            try:
                outputs,values=mx.vjp(forward,[checkpoints[index-split],*original],[gradient])
                mx.eval(values)
            finally:
                layer.update(tree_unflatten(list(zip(names,original))))
            gradient=values[0]
            collected.extend((f'language_model.model.layers.{index}.{name}',value) for name,value in zip(names,values[1:]))
            del outputs,values
            checkpoints.pop()
            if observer: observer('tail-layer-backward',layer=index)
        assert {name for name,_ in collected}==set(expected),'MISSING_TAIL_GRADIENT'
        return loss,tree_unflatten(collected)


def make_tokenwise_frozen(mx, function, *, block_size=256, observer=None):
    """Exact token-independent frozen function; its input still gets gradients."""
    assert block_size > 0

    @mx.custom_function
    def forward(hidden):
        assert hidden.ndim >= 3
        pieces=[]
        for begin in range(0,hidden.shape[1],block_size):
            end=min(begin+block_size,hidden.shape[1])
            pieces.append(evaluated_leaf(mx,function(hidden[:,begin:end])))
            if observer: observer('mlp-forward-block',begin=begin,end=end)
        return mx.concatenate(pieces,axis=1)

    @forward.vjp
    def backward(hidden,cotangent,output):
        pieces=[]
        for begin in range(0,hidden.shape[1],block_size):
            end=min(begin+block_size,hidden.shape[1])
            _,gradients=mx.vjp(function,[hidden[:,begin:end]],[cotangent[:,begin:end]])
            pieces.append(evaluated_leaf(mx,gradients[0]))
            if observer: observer('mlp-backward-block',begin=begin,end=end)
        return mx.concatenate(pieces,axis=1)

    return forward


@contextmanager
def frozen_mlp_policy(mx,layers,*,block_size,reference=False,observer=None):
    """Block supplied frozen MLPs/norms, not trainable attention projections."""
    from mlx.utils import tree_flatten
    modules=[layer.mlp for layer in layers if hasattr(layer,'mlp')]
    for layer in layers:
        modules.extend(getattr(layer,name) for name in ['input_layernorm','post_attention_layernorm',
            'pre_feedforward_layernorm','post_feedforward_layernorm'] if hasattr(layer,name))
        attention=getattr(layer,'self_attn',None)
        if attention is not None:
            modules.extend(getattr(attention,name) for name in ['q_norm','k_norm','v_norm'] if hasattr(attention,name))
    assert all(not getattr(layer,'enable_moe',False) for layer in layers),'DENSE_ONLY_MLP_POLICY'
    assert all(not tree_flatten(module.trainable_parameters()) for module in modules),'MLP_MUST_BE_FROZEN'
    originals={type(module):type(module).__call__ for module in modules}
    targets={id(module):module for module in modules}
    functions={}
    def call(module,hidden):
        original=originals[type(module)]
        if reference or id(module) not in targets: return original(module,hidden)
        if id(module) not in functions:
            functions[id(module)]=make_tokenwise_frozen(mx,lambda h:original(module,h),block_size=block_size,observer=observer)
        return functions[id(module)](hidden)
    try:
        for cls in originals: cls.__call__=call
        yield
    finally:
        for cls,original in originals.items(): cls.__call__=original


def make_attention(mx, *, scale, window=None, block_size=256, observer=None):
    assert block_size > 0 and (window is None or window > 0)

    def bounds(begin, end, length):
        return (max(0, begin - window + 1) if window else 0), min(end, length)

    def block(q, k, v, begin, key_begin):
        qi = mx.arange(begin, begin + q.shape[-2])[:, None]
        ki = mx.arange(key_begin, key_begin + k.shape[-2])[None, :]
        mask = qi >= ki
        if window is not None: mask = mask & (ki > qi - window)
        return mx.fast.scaled_dot_product_attention(q, k, v, scale=scale, mask=mask)

    @mx.custom_function
    def attention(q, k, v):
        assert q.ndim == k.ndim == v.ndim == 4
        assert q.shape[-2] == k.shape[-2] == v.shape[-2], 'UNCACHED_SELF_ATTENTION_ONLY'
        assert q.shape[0] == k.shape[0] == v.shape[0]
        assert q.shape[1] % k.shape[1] == 0 and k.shape[1] == v.shape[1]
        # The custom VJP below owns ALL derivatives. In MLX 0.32.2 the
        # decorated forward runs before custom_function applies stop_gradient
        # to its outputs. Leaving these inputs traced retains every evaluated
        # block's scores until the function returns: quadratic peak memory.
        # Detach ONLY the internal forward; the decorator retains the original
        # primals and our VJP still returns gradients for q, k, and v.
        q, k, v = (mx.stop_gradient(item) for item in (q, k, v))
        pieces = []
        for begin in range(0, q.shape[-2], block_size):
            end = min(begin + block_size, q.shape[-2])
            lo, hi = bounds(begin, end, k.shape[-2])
            piece = block(q[:, :, begin:end], k[:, :, lo:hi], v[:, :, lo:hi], begin, lo)
            piece = evaluated_leaf(mx, piece)
            if observer: observer('attention-forward-block', begin=begin, end=end)
            pieces.append(piece)
        return mx.concatenate(pieces, axis=-2)

    @attention.vjp
    def attention_vjp(primals, cotangent, output):
        q, k, v = primals
        dk = mx.zeros(k.shape, dtype=mx.float32)
        dv = mx.zeros(v.shape, dtype=mx.float32)
        dq = []
        for begin in range(0, q.shape[-2], block_size):
            end = min(begin + block_size, q.shape[-2])
            lo, hi = bounds(begin, end, k.shape[-2])
            # Explicit first-order SDPA derivative. Nested per-block mx.vjp
            # kept trace-owned intermediates alive inside the layer VJP.
            # GQA groups share K/V; reduce their contributions in float32.
            batch,heads,_,width=q.shape;kv_heads=k.shape[1];groups=heads//kv_heads
            qb=q[:,:,begin:end].reshape(batch,kv_heads,groups,end-begin,width)
            kb=k[:,:,None,lo:hi,:];vb=v[:,:,None,lo:hi,:]
            dy=cotangent[:,:,begin:end].reshape(batch,kv_heads,groups,end-begin,width).astype(mx.float32)
            qi=mx.arange(begin,end)[:,None];ki=mx.arange(lo,hi)[None,:]
            mask=qi>=ki
            if window is not None:mask=mask&(ki>qi-window)
            scores=(qb@mx.swapaxes(kb,-1,-2))*scale
            probabilities=mx.softmax(mx.where(mask,scores,-float('inf')),axis=-1)
            dp=dy@mx.swapaxes(vb,-1,-2)
            ds=probabilities*(dp-mx.sum(dp*probabilities,axis=-1,keepdims=True))*scale
            gq=(ds@kb).reshape(batch,heads,end-begin,width)
            gk=mx.sum(mx.swapaxes(ds,-1,-2)@qb,axis=2)
            gv=mx.sum(mx.swapaxes(probabilities,-1,-2)@dy,axis=2)
            dk[:, :, lo:hi] = dk[:, :, lo:hi] + gk.astype(mx.float32)
            dv[:, :, lo:hi] = dv[:, :, lo:hi] + gv.astype(mx.float32)
            # Prevent the outer trace retaining every local VJP/accumulation.
            gq, dk, dv = (evaluated_leaf(mx, item) for item in (gq, dk, dv))
            del qb,kb,vb,dy,scores,probabilities,dp,ds,gk,gv
            if observer: observer('attention-backward-block', begin=begin, end=end)
            dq.append(gq)
        return mx.concatenate(dq, axis=-2), dk.astype(k.dtype), dv.astype(v.dtype)

    return attention


def make_completion_loss(mx, nn, project_frozen_head, targets, *, block_size=128, observer=None):
    """The vocabulary head must be frozen; only hidden-state gradients flow."""
    assert targets.ndim == 2 and targets.shape[0] == 1 and targets.shape[1] > 0
    assert block_size > 0
    length = targets.shape[1]

    def block(hidden, begin, end):
        logits = project_frozen_head(hidden).astype(mx.float32)
        return nn.losses.cross_entropy(logits, targets[:, begin:end], reduction='sum') / length

    @mx.custom_function
    def loss(hidden):
        assert hidden.shape[:2] == targets.shape
        hidden = mx.stop_gradient(hidden)  # Derivatives are supplied by loss_vjp.
        total = mx.array(0, dtype=mx.float32)
        for begin in range(0, length, block_size):
            end = min(begin + block_size, length)
            total = total + block(hidden[:, begin:end], begin, end)
            total = evaluated_leaf(mx, total)
            if observer: observer('loss-forward-block', begin=begin, end=end)
        return total

    @loss.vjp
    def loss_vjp(primals, cotangent, output):
        hidden = primals
        pieces = []
        for begin in range(0, length, block_size):
            end = min(begin + block_size, length)
            def local(h): return block(h, begin, end)
            _, gradients = mx.vjp(local, [hidden[:, begin:end]], [cotangent])
            gradient = evaluated_leaf(mx, gradients[0])
            if observer: observer('loss-backward-block', begin=begin, end=end)
            pieces.append(gradient)
        return mx.concatenate(pieces, axis=1)

    return loss


@contextmanager
def gemma_attention_policy(mx, *, block_size=256, reference=False, observer=None):
    """Temporary process-local patch; never edits the installed MLX package.

    Only the pinned Gemma4 text model's uncached path is supported. Fail closed
    on vision/audio/caches/sinks instead of silently changing their semantics.
    """
    module = importlib.import_module('mlx_vlm.models.gemma4.language')
    original_attention = module.scaled_dot_product_attention
    original_masks = module.Gemma4TextModel._make_masks
    functions = {}

    def masks(model, h, cache, mm_token_type_ids=None):
        assert mm_token_type_ids is None, 'TEXT_ONLY_MEMORY_POLICY'
        assert all(item is None for item in cache), 'NO_CACHE_MEMORY_POLICY'
        assert set(layer.layer_type for layer in model.layers) <= {'full_attention', 'sliding_attention'}
        return [('ggd-causal', model.window_size if layer.layer_type == 'sliding_attention' else None)
                for layer in model.layers]

    def attention(q, k, v, *, cache, scale, mask, sinks=None):
        assert cache is None and sinks is None, 'UNCACHED_NO_SINKS_ONLY'
        # Cast before the custom primitive so each K/V gradient is rounded
        # only once, after ALL query-block contributions are accumulated.
        # Dense reference and bounded path use the same declared arithmetic.
        dtype = q.dtype
        q, k, v = (item.astype(mx.float32) for item in (q, k, v))
        if reference:
            return mx.fast.scaled_dot_product_attention(q, k, v, scale=scale, mask=mask).astype(dtype)
        assert isinstance(mask, tuple) and len(mask) == 2 and mask[0] == 'ggd-causal', 'EXPLICIT_MEMORY_MASK_REQUIRED'
        key = (float(scale), mask[1])
        if key not in functions: functions[key] = make_attention(mx, scale=scale, window=mask[1], block_size=block_size, observer=observer)
        return functions[key](q, k, v).astype(dtype)

    module.scaled_dot_product_attention = attention
    if not reference: module.Gemma4TextModel._make_masks = masks
    try:
        yield
    finally:
        module.scaled_dot_product_attention = original_attention
        module.Gemma4TextModel._make_masks = original_masks

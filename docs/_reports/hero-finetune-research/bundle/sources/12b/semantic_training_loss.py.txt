"""Loss primitive for future masked mechanism SFT, no GPU startup on import.
The caller owns hardware admission, model lifecycle, and dataset admission.
"""
def prediction_positions(ids, label_mask):
    assert len(ids) == len(label_mask) and len(ids) >= 2, 'TOKEN_MASK_LENGTH'
    assert all(type(x) is int and x in (0, 1) for x in label_mask), 'BINARY_LABEL_MASK'
    assert label_mask[0] == 0, 'FIRST_TOKEN_HAS_NO_PREDICTION'
    positions = [i - 1 for i, keep in enumerate(label_mask) if keep]
    assert positions, 'EMPTY_DIRECT_LOSS'
    return positions, [ids[i + 1] for i in positions]

def masked_next_token_loss(net, ids, label_mask, mx, nn):
    positions, targets = prediction_positions(ids, label_mask)
    batch = mx.array([ids[:-1]], dtype=mx.int32)
    logits = net(batch, pixel_values=None, mask=None, cache=None).logits
    assert logits.shape[:2] == (1, len(ids) - 1), 'LOGIT_TOKEN_ALIGNMENT'
    # Select BEFORE casting/CE. Do not allocate float32 logits+CE for the long
    # excluded prompt merely to multiply its loss by zero afterwards.
    selected = mx.take(logits[0], mx.array(positions, dtype=mx.int32), axis=0).astype(mx.float32)
    loss = nn.losses.cross_entropy(selected, mx.array(targets, dtype=mx.int32), reduction='mean')
    return loss

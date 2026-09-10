"""Default eligibility is separate from an asset passing format validation."""

def eligible(policy, hero_id, source_id, model_key, kind):
    if kind != 'style-proxy':
        return True
    return any(a['heroId'] == hero_id and a['sourceId'] == source_id and a['modelKey'] == model_key
               for a in policy['approvedDerivatives'])


def selection_class(policy, hero_id, source_id, model_key, source):
    if any(a['heroId'] == hero_id and a['sourceId'] == source_id and a['modelKey'] == model_key
           for a in policy['approvedDerivatives']):
        return policy['approvedDerivativePriority']
    fallback = 'similar-proxy' if source.get('kind') == 'style-proxy' else source['tier']
    return policy.get('sourceClassOverrides', {}).get(source_id, source.get('selectionClass', fallback))


def selection_rank(policy, hero_id, source_id, model_key, source):
    return policy['priority'].index(selection_class(policy, hero_id, source_id, model_key, source))

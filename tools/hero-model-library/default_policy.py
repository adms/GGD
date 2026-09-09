"""Default eligibility is separate from an asset passing format validation."""

def eligible(policy, hero_id, source_id, model_key, kind):
    if kind != 'style-proxy':
        return True
    return any(a['heroId'] == hero_id and a['sourceId'] == source_id and a['modelKey'] == model_key
               for a in policy['approvedDerivatives'])

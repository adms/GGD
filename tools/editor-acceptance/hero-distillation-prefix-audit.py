"""CPU-only opportunity audit. Does NOT rewrite the frozen dataset or run a model."""
import argparse
import hashlib
import json
import os
from pathlib import Path

os.environ['HF_HUB_OFFLINE']='1'
os.environ['TRANSFORMERS_OFFLINE']='1'
os.environ['TOKENIZERS_PARALLELISM']='false'


def dumps(value):return json.dumps(value,ensure_ascii=False,separators=(',',':'))
def digest(value):return hashlib.sha256(value).hexdigest()
def lcp(a,b):
    n=min(len(a),len(b));i=0
    while i<n and a[i]==b[i]:i+=1
    return a[:i]


def audit(data,model,out):
    assert not out.exists(),'REFUSE_OVERWRITE'
    manifest=json.loads((data/'manifest.json').read_text())
    raw=(data/'examples.json').read_bytes()
    assert digest(raw)==manifest['outputs']['examples.json'],'DATA_DRIFT'
    from transformers import AutoTokenizer
    tokenizer=AutoTokenizer.from_pretrained(str(model),local_files_only=True,trust_remote_code=False)
    groups={};totals={'oldPromptTokens':0,'reorderedPromptTokens':0}
    for row in json.loads(raw):
        messages=row['messages']
        user=json.loads(messages[1]['content'])
        shared={key:user[key] for key in ['allowedCatalog','assets']}
        revised={**shared,**{key:value for key,value in user.items() if key not in shared}}
        assert json.loads(dumps(revised))==user,'INFORMATION_CHANGED'
        changed=[dict(message) for message in messages[:2]]
        changed[1]['content']=dumps(revised)
        old=tokenizer.apply_chat_template(messages[:2],tokenize=True,return_dict=False,add_generation_prompt=True,enable_thinking=False)
        new=tokenizer.apply_chat_template(changed,tokenize=True,return_dict=False,add_generation_prompt=True,enable_thinking=False)
        assert isinstance(old,list) and isinstance(new,list) and all(isinstance(x,int) for x in old+new),'TOKEN_IDS_REQUIRED'
        key=digest(dumps([messages[0],shared]).encode())
        group=groups.setdefault(key,{'trainTasks':0,'devTasks':0,'oldPrefix':old,'newPrefix':new})
        group[row['split']+'Tasks']+=1
        group['oldPrefix']=lcp(group['oldPrefix'],old);group['newPrefix']=lcp(group['newPrefix'],new)
        totals['oldPromptTokens']+=len(old);totals['reorderedPromptTokens']+=len(new)
    result={'schema':'ggd-shared-prefix-opportunity@1','scriptSha256':digest(Path(__file__).read_bytes()),'sourceExamplesSha256':digest(raw),'counts':manifest['counts'],
        'groups':[{**{key:value for key,value in group.items() if not key.endswith('Prefix')},
                   'catalogAndSystemSha256':key,'oldCommonPrefixTokens':len(group['oldPrefix']),
                   'reorderedCommonPrefixTokens':len(group['newPrefix'])} for key,group in groups.items()],
        **totals,'datasetModified':False,'gpuStarted':False,'speedupMeasured':False,
        'limitations':['Only JSON member order changes in this hypothetical measurement; all information and target answers remain intact.',
            'Cache is NOT implemented or admitted. Must verify causal suffix KV positions, exact frozen hidden states, and gradient equivalence.',
            'Only frozen prefix layers may share cache; trainable tail states must never be reused across optimizer steps.',
            'Use public catalog/system only; no teacher-specific prefix or dev-answer cache; host RAM and GPU guards still apply.',
            'Do not convert reusable token counts into speedup or silently replace the current frozen version.']}
    out.parent.mkdir(parents=True,exist_ok=True)
    with out.open('x') as stream:json.dump(result,stream,ensure_ascii=False,indent=2);stream.write('\n')
    print(dumps(result),flush=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data',type=Path,required=True);parser.add_argument('--model',type=Path,required=True)
    parser.add_argument('--out',type=Path,required=True);args=parser.parse_args()
    audit(args.data.resolve(),args.model.resolve(),args.out.resolve())

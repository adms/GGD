#!/usr/bin/env python3
"""Acquire a public Steam Workshop file using Valve's documented metadata API.

No Steam login or API key is used. Items without a public file_url remain
unacquired. Downloads are inert intake files, never executed or made defaults.
https://partner.steamgames.com/doc/webapi/ISteamRemoteStorage#GetPublishedFileDetails
"""
import argparse
import datetime
import hashlib
import json
import lzma
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse

API = 'https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/'
CDN_HOSTS = {'cdn.steamusercontent.com','steamusercontent-a.akamaihd.net','steamuserimages-a.akamaihd.net'}
MAX_BYTES = 2_000_000_000


def public_details(metadata, item_id):
    records = metadata.get('response',{}).get('publishedfiledetails',[])
    if len(records)!=1:
        raise ValueError('Expected exactly one Workshop metadata record')
    record = records[0]
    if str(record.get('publishedfileid'))!=str(item_id):
        raise ValueError('Workshop item ID mismatch')
    if record.get('result')!=1 or record.get('visibility')!=0 or record.get('banned',False):
        raise ValueError('Workshop item is not available as a public file')
    url = urlparse(record.get('file_url',''))
    if url.scheme!='https' or url.hostname not in CDN_HOSTS or url.username or url.password:
        raise ValueError('No supported public Steam CDN file_url returned')
    size = int(record.get('file_size',0))
    if not 0<size<=MAX_BYTES:
        raise ValueError('Workshop file size is missing or exceeds 2 GB')
    return record


def acquire(item_id, home):
    home.mkdir(parents=True,exist_ok=True)
    if (home/'acquisition.json').exists():
        raise ValueError('Existing acquisition receipt: verify or use another intake directory')
    raw_metadata = subprocess.check_output(['curl','--fail','--location','--silent','--show-error',
        '--max-time','45','--data-urlencode','itemcount=1','--data-urlencode',f'publishedfileids[0]={item_id}',API])
    metadata = json.loads(raw_metadata)
    (home/'steam-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    record = public_details(metadata,item_id)
    (home/'raw').mkdir(exist_ok=True)
    part = home/'raw/workshop.part'
    subprocess.run(['curl','--fail','--location','--silent','--show-error','--max-time','180',
        '--max-filesize',str(record['file_size']),record['file_url'],'--output',str(part)],check=True)
    data = part.read_bytes()
    if len(data)!=int(record['file_size']):
        raise ValueError('Downloaded byte count differs from Valve metadata')
    extension = '.bin'
    if data.startswith(b'GMAD'): extension = '.gma'
    elif data.startswith(b'PK'): extension = '.zip'
    else:
        try:
            decoder = lzma.LZMADecompressor(format=lzma.FORMAT_ALONE,memlimit=536870912)
            if decoder.decompress(data,max_length=4)==b'GMAD': extension = '.gma.lzma'
        except lzma.LZMAError:
            pass
    path = home/'raw'/('workshop-'+str(item_id)+extension)
    if path.exists(): raise ValueError('Destination file already exists')
    part.rename(path)
    receipt = {'id':home.name,'itemId':str(item_id),'pageUrl':f'https://steamcommunity.com/sharedfiles/filedetails/?id={item_id}',
        'downloadUrl':record['file_url'],'title':record.get('title'),'consumerAppId':record.get('consumer_app_id'),
        'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
        'file':str(path),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
        'acquisitionMethod':'Valve public GetPublishedFileDetails API, returned public file_url',
        'scope':'Bytes verified only; extraction, identity and standardization require separate evidence'}
    (home/'acquisition.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:receipt[k] for k in ['id','title','bytes','sha256','file']},ensure_ascii=False))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('item_id')
    parser.add_argument('intake',type=Path)
    args=parser.parse_args()
    if not re.fullmatch(r'[0-9]+',args.item_id):parser.error('item_id must be a numeric Workshop ID')
    acquire(args.item_id,args.intake)

#!/usr/bin/env python3
"""Build separate front and side contact sheets from render_motion_glb output."""
import argparse
from pathlib import Path
from PIL import Image,ImageDraw

STATES=['idle','run','attack','cast','hurt','death']
SAMPLES=['start','quarter','middle','threequarter','end']

def build(source:Path,target:Path,view:str):
    thumb,top,left=280,34,130
    sheet=Image.new('RGB',(left+thumb*len(SAMPLES),(thumb+top)*len(STATES)),(30,30,34))
    draw=ImageDraw.Draw(sheet)
    for row,state in enumerate(STATES):
        draw.text((10,row*(thumb+top)+top+thumb//2-8),state,fill='white')
        for col,label in enumerate(SAMPLES):
            path=source/f'ggd-procedural-{state}-{label}-{view}.png'
            image=Image.open(path).convert('RGB').resize((thumb,thumb),Image.Resampling.LANCZOS)
            x,y=left+col*thumb,row*(thumb+top)+top
            sheet.paste(image,(x,y));draw.text((x+8,row*(thumb+top)+8),label,fill='white')
    sheet.save(target,quality=92)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('source',type=Path);parser.add_argument('output_prefix',type=Path)
    args=parser.parse_args()
    for view in ('front','side'):
        target=args.output_prefix.with_name(args.output_prefix.name+'-'+view+'.jpg')
        build(args.source,target,view);print(target)

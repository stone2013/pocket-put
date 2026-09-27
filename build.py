#!/usr/bin/env python3
"""Build the offline game from the editable source files. Python 3, no dependencies."""
from pathlib import Path
import argparse
ROOT=Path(__file__).resolve().parent

def build(destination: Path) -> Path:
    html=(ROOT/'template.html').read_text(encoding='utf-8')
    for tag,filename in [('CSS','style.css'),('ASSETS','assets.js'),('ENGINE','engine.js'),('GAME','game.js')]:
        marker='/*__'+tag+'__*/'
        if marker not in html:
            raise ValueError(f'Missing build marker: {marker}')
        content=(ROOT/filename).read_text(encoding='utf-8')
        if tag!='CSS':
            content=content.replace('</script','<\\/script')
        html=html.replace(marker,content)
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(html,encoding='utf-8')
    print(f'Built {destination} ({destination.stat().st_size:,} bytes)')
    return destination

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'index.html')
    args=parser.parse_args()
    build(args.output.resolve())

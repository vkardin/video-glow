#!/usr/bin/env python3
"""Vendor the local UI kit into sibling repositories. Run from any directory.
python ui-kit/sync.py --workspace /path/to/checkouts [--check]
"""
from pathlib import Path
import argparse,json,os,re,sys
p=argparse.ArgumentParser();p.add_argument('--workspace',type=Path,default=Path(__file__).resolve().parents[2]);p.add_argument('--check',action='store_true');args=p.parse_args()
source=Path(__file__).resolve().parent;tokens=json.loads((source/'tokens.json').read_text())
def variables(name):return ''.join('--'+k+':'+v+';' for k,v in tokens[name].items())
css='/* vkardin UI '+tokens['version']+'; source: video-glow/ui-kit. */\n:root:not([data-theme]),:root[data-theme=cinema]{'+variables('dark')+'color-scheme:dark}\n@media(prefers-color-scheme:light){:root:not([data-theme]){'+variables('light')+'color-scheme:light}}\n'+(source/'components.css').read_text()
js=(source/'controls.js').read_text()
targets={'video-glow':'extension','leveler':'extension/shared','video-drift':'extension/shared','snapt':'extension/src','uni-homebot':'homebot/web/static'}
errors=[]
for repo,directory in targets.items():
 root=args.workspace/repo
 if not root.is_dir():continue
 dest=root/directory
 for name,data in [('family-ui.css',css),('family-ui.js',js)]:
  path=dest/name
  if args.check:
   if not path.exists() or path.read_text()!=data:errors.append(str(path))
  else:path.parent.mkdir(parents=True,exist_ok=True);path.write_text(data)
 if args.check:continue
 htmlroot=root/('extension' if repo in ['video-glow','leveler','video-drift'] else 'extension/src' if repo=='snapt' else 'homebot/web/static')
 for path in htmlroot.rglob('*.html'):
  if path.name=='offscreen.html':continue
  text=path.read_text()
  if repo=='uni-homebot':text=text.replace('src="family-ui.js"','src="/static/family-ui.js"').replace('href="family-ui.css"','href="/static/family-ui.css"')
  text=re.sub(r'<html(?![^>]*data-family-app)',f'<html data-family-app="{repo}"',text,count=1)
  rel=Path(os.path.relpath(dest,path.parent)).as_posix();rel='' if rel=='.' else rel+'/'
  if repo=='uni-homebot':rel='/static/'
  if 'family-ui.css' not in text:text=text.replace('</head>',f'<link rel="stylesheet" href="{rel}family-ui.css">\n</head>',1)
  if 'family-ui.js' not in text:
   script=f'<script src="{rel}family-ui.js"></script>\n'
   if '<script' in text:text=text.replace('<script',script+'<script',1)
   else:text=text.replace('</head>',script+'</head>',1)
  path.write_text(text)
if errors:sys.exit('UI copies differ: '+', '.join(errors))
print('UI kit '+tokens['version']+': '+('verified' if args.check else 'synchronized'))

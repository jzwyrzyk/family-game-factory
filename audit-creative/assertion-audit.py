import csv, hashlib, subprocess, sys, os, re
from collections import defaultdict, Counter
from pathlib import Path
root=Path(__file__).resolve().parent.parent
head=sys.argv[1]
repo=root/'creative'
def git(*args):return subprocess.check_output(['git','-C',str(repo),*args])
source=list(csv.DictReader(open(root/'evidence/source-test-assertions.csv')))
source=[r for r in source if 196<=int(r['pr'])<=217 and r['pr']!='203']
paths={}
for item in git('ls-tree','-rz',head).split(b'\0'):
 if not item:continue
 left,p=item.split(b'\t',1);p=p.decode();sha=left.decode().split()[2];paths[p]=sha
files={r['path'] for r in source}
for p in paths:
 if (p.startswith('tests/') or p.startswith('scripts/') or p.startswith('tools/ui-review/')) and re.search(r'\.(cjs|mjs|js|ts|tsx|json)$',p):files.add(p)
lines=defaultdict(set);blobs=defaultdict(list)
for p,h in paths.items():blobs[h].append(p)
for p in files:
 if p not in paths:continue
 for l in git('cat-file','blob',paths[p]).decode(errors='replace').splitlines():lines[l.strip()].add(p)
rows=[]
for r in source:
 p=r['path'];h=r['git blob'];l=r['source line'].strip(); matches=lines.get(l,set()); status='unmapped'
 if paths.get(p)==h:status='identical entire file'; target=p
 elif h in blobs:status='identical relocated file';target=' | '.join(blobs[h])
 elif p in matches:status='identical original assertion line in changed file';target=p
 elif matches:status='identical line under other path';target=' | '.join(sorted(matches))
 else:target=''
 rows.append(dict(r,classification=status,candidate_path=target))
out=root/'audit-creative'/('assertions-'+head[:8]+'.csv');
with out.open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
print('Rows',len(rows),'unique source assertions',len({(r['git blob'],r['line']) for r in rows}),'class',Counter(r['classification'] for r in rows));
u=[r for r in rows if r['classification']=='unmapped'];print('unmapped by path, distinct source lines:')
for p in sorted({r['path'] for r in u}):print(p,len({r['source line'] for r in u if r['path']==p}),','.join(sorted({r['pr'] for r in u if r['path']==p})))

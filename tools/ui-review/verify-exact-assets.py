import base64
import hashlib
import json
import subprocess
import sys
from pathlib import Path

repo, output = map(Path, sys.argv[1:])
artifact = repo / 'dist-review/jems-ui-review.html'
html = artifact.read_bytes()
marker = b'const PAYLOAD='
payload, _ = json.JSONDecoder().raw_decode(html[html.index(marker) + len(marker):].decode('utf-8'))
expected = subprocess.check_output(['git', '-C', str(repo), 'rev-parse', 'HEAD'], text=True).strip()
assert payload['sha'] == expected
assert payload['manifest']['assetPackaging']=='Exact original bytes', 'Exact-source artifact required'
root=repo/'public'
suffixes={'.webp','.png','.svg','.woff','.woff2','.ttf','.json'}
required={f.relative_to(root).as_posix() for f in root.rglob('*') if f.is_file() and f.suffix in suffixes and f.relative_to(root).as_posix()!='factory-config.json'}
actual=set(payload['assets'])
assert actual==required, {'missing':sorted(required-actual), 'extra':sorted(actual-required)}
items = []
for key, (_, encoded) in payload['assets'].items():
    original = (repo / 'public' / key).read_bytes()
    assert original == base64.b64decode(encoded, validate=True), key
    items.append({'path': key, 'sha256': hashlib.sha256(original).hexdigest(), 'bytes': len(original)})
receipt = {'source': expected, 'packaging': payload['manifest']['assetPackaging'],
           'artifactSha256': hashlib.sha256(html).hexdigest(), 'bytes': len(html),
           'matchingAssets': len(items), 'assets': items}
output.parent.mkdir(parents=True,exist_ok=True)
output.write_text(json.dumps(receipt, indent=2) + '\n')
print({k: v for k,v in receipt.items() if k != 'assets'})

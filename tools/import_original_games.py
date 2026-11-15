#!/usr/bin/env python3
"""Import recovered originals without executing HTML or changing live game code.

Usage: python tools/import_original_games.py --sources /path/to/source-inputs --repo .
Outputs original reference HTML, byte-identical PNG sprites, and provenance hashes.
Existing different files are never overwritten. Source bytes are pinned deliberately.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import re
from pathlib import Path

EXPECTED = {
    'Dragon_Island_Rescue_SOLO_BALANCED.html': 'bb34ec66824282d70b60d949d48b91332105164694e76d8819d310bc85bf3320',
    'Splash_or_Pass_Choose_or_Randomize.html': 'eda572f39f60bd9ac120c76848c6a5cb4ef7b09f4a7ed24b221ff72b90b6d763',
}

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def plan(sources: Path, repo: Path) -> dict[Path, bytes]:
    outputs: dict[Path, bytes] = {}
    manifest: dict = {'schemaVersion': 1, 'originals': [], 'assets': [],
        'status': 'Reference recovery only; game integration and design acceptance are separate gates.'}
    html: dict[str, str] = {}
    for name, expected in EXPECTED.items():
        data = (sources / name).read_bytes()
        actual = sha256(data)
        if actual != expected:
            raise ValueError(f'Source checksum mismatch for {name}: expected {expected}, received {actual}')
        outputs[repo / 'references/original-games' / name] = data
        html[name] = data.decode('utf-8')
        manifest['originals'].append({'file': name, 'sha256': actual, 'bytes': len(data)})
    dragon = html['Dragon_Island_Rescue_SOLO_BALANCED.html']
    marker = 'const INLINE_ASSETS = '
    if marker not in dragon:
        raise ValueError('Expected original dragon inline-asset manifest is missing')
    assets, _ = json.JSONDecoder().raw_decode(dragon.split(marker, 1)[1])
    if not isinstance(assets, dict) or len(assets) != 23:
        raise ValueError('Expected 23 original dragon PNG assets')
    for name, data_url in assets.items():
        if not re.fullmatch(r'dragon_island_assets/[a-z0-9_]+\.png', name):
            raise ValueError(f'Unexpected or unsafe asset path: {name!r}')
        prefix = 'data:image/png;base64,'
        if not isinstance(data_url, str) or not data_url.startswith(prefix):
            raise ValueError(f'Asset {name} is not a PNG data URL')
        raw = base64.b64decode(data_url[len(prefix):], validate=True)
        if not raw.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError(f'Asset {name} does not contain a PNG')
        relative = 'public/assets/original-dragon/' + Path(name).name
        outputs[repo / relative] = raw
        manifest['assets'].append({'source': name, 'file': relative, 'sha256': sha256(raw),
            'bytes': len(raw), 'transformation': 'none; decoded original bytes'})
    outputs[repo / 'references/original-games/provenance.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    for path, data in outputs.items():
        if path.exists() and path.read_bytes() != data:
            raise FileExistsError(f'Refusing to overwrite changed file: {path}')
    return outputs

def run(sources: Path, repo: Path) -> dict:
    outputs = plan(sources.resolve(), repo.resolve())
    for path, data in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
    return {'originals': len(EXPECTED), 'png_assets': 23, 'files_verified': len(outputs),
            'repo': str(repo.resolve()), 'integration_status': 'not performed'}

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, required=True)
    parser.add_argument('--repo', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args.sources, args.repo), indent=2))
    except (OSError, ValueError, KeyError, json.JSONDecodeError) as exc:
        parser.exit(1, f'Import stopped: {exc}\n')

if __name__ == '__main__':
    main()

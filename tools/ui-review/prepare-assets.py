"""Review-only display derivatives. Original repository artwork is never changed."""
from pathlib import Path
from PIL import Image
import concurrent.futures
source=Path('public/jems-pals'); target=Path('work/ui-review/assets/jems-pals')
def convert(p):
    out=target/p.relative_to(source)
    out.parent.mkdir(parents=True,exist_ok=True)
    if out.exists() and out.stat().st_mtime>=p.stat().st_mtime:return
    with Image.open(p) as image:
        image.thumbnail((768,768),Image.Resampling.LANCZOS)
        image.save(out,'WEBP',quality=90,method=4)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(convert,source.rglob('*.webp')))
print('Prepared 768px Gem Pal display derivatives; source assets unchanged.')

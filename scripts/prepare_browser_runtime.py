"""Package verified Silicon and Actwright's AST converter for the static site."""
import json
import os
from pathlib import Path

from generate_metadata import ROOT, REVISION, verified_sources


def prepare():
    default = ROOT.parent / 'si' if (ROOT.parent / 'si/silicon').exists() else Path('/tmp/actwright-silicon')
    sources = verified_sources(Path(os.environ.get('SILICON_SOURCE', default)))
    for name in ('__init__.py', 'blocks.py', 'scripts.py'):
        path = ROOT / 'backend/app/analysis' / name
        sources[f'actwright_analysis/{name}'] = path.read_text()
    sources['actwright_browser.py'] = (ROOT / 'backend/app/runtime/browser.py').read_text()
    sources['nitrogen.py'] = (ROOT / 'backend/app/runtime/browser_nitrogen.py').read_text()
    output = ROOT / 'frontend/public/python-runtime.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'revision': REVISION, 'sources': sources}))
    print(f'Packaged verified Silicon {REVISION} for the browser')


if __name__ == '__main__':
    prepare()

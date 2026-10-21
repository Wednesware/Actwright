"""Generate reviewed built-in metadata from a verified external Silicon checkout."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
from app.analysis.components import analyze_source

REVISION = '9a8db8bd5187011e20f16ad1d0964aeb251ff1eb'
SOURCES = {
    'silicon/__init__.py': '9fbcf1ed180739a1ec458a240446b1990548015d',
    'silicon/components.py': 'f3ef030734a6bdc81e8cf6536c605ebbf8ca39ff',
    'silicon/integrations.py': 'e8a305ca3c935f961eeb35789a04bd8264b9487d',
    'silicon/syntax.py': '495049e5334255a274a077472c907695ddeb11f2',
    'silicon/utils.py': 'ad5bcd062a0e5de6901d749964624cce984ec49a',
}


def verified_sources(checkout):
    result = {}
    for path, expected in SOURCES.items():
        content = (checkout / path).read_bytes()
        digest = hashlib.sha1(f'blob {len(content)}\0'.encode() + content).hexdigest()
        if digest != expected:
            raise ValueError(f'{path}: source differs from pinned Silicon revision; refusing compatibility claims')
        result[path] = content.decode('utf-8')
    return result


def generate(checkout):
    sources = verified_sources(checkout)
    definitions = []
    for path in ('silicon/__init__.py', 'silicon/components.py', 'silicon/integrations.py'):
        module = 'silicon' if path.endswith('__init__.py') else path[:-3].replace('/', '.')
        definitions.extend(analyze_source(sources[path], module=module, path=path, revision=REVISION)['definitions'])
    categories = {
        'Flow': ['Timer', 'TurnManager', 'GameControl', 'StateMachine'],
        'Entities': ['Entity', 'Effect', 'Traits', 'Effects', 'CharacterSelection'],
        'Grid': ['Stage2D', 'StageRenderer', 'InputMap', 'GridMovement'],
        'Physics': ['Transform2D', 'Velocity', 'Gravity', 'Collision2D', 'Lifetime'],
        'Gameplay': ['Health', 'Inventory', 'Score', 'Randomizer'],
        'Integrations': ['FrontEnd', 'App', 'Multiplayer', 'SoundEffects', 'SoundPlayer', 'ShellInput', 'CommandOptions'],
    }
    for definition in definitions:
        definition['category'] = next((k for k, names in categories.items() if definition['name'] in names), 'Core')
        definition['provider'] = 'silicon'
        definition['module'] = 'silicon'  # All catalog components are re-exported here.
        definition['optionalDependencies'] = {
            'App': ['sulfur', 'fluorine'], 'Multiplayer': ['beryllium', 'fluorine'],
            'SoundEffects': ['carbon'], 'SoundPlayer': ['carbon'],
        }.get(definition['name'], [])
        if definition['name'] == 'ShellInput':
            definition['warnings'].append('Iodine is optional when iodine=True; read() is blocking.')
        if definition['constructor']['strategy'] == 'inherited':
            definition['constructor'] = {'strategy': '__component__', 'parameters': []}
            definition['serialization']['status'] = 'basePattern'
        # Base hooks and configuration methods are verified in Component itself.
        definition['lifecycleHooks'] = sorted(['on_attach', 'on_detach', 'on_start', 'on_pause', 'on_resume', 'on_stop'])
    return {'schemaVersion': 1, 'provider': 'silicon', 'revision': REVISION,
            'sources': SOURCES, 'root': {'name': 'Game', 'module': 'silicon',
            'parameters': [
                {'name': 'name', 'annotation': None, 'kind': 'positionalOrKeyword', 'default': {'kind': 'literal', 'value': 'Game'}},
                {'name': 'seed', 'annotation': None, 'kind': 'positionalOrKeyword', 'default': {'kind': 'literal', 'value': None}},
                {'name': 'tick_rate', 'annotation': None, 'kind': 'keywordOnly', 'default': {'kind': 'literal', 'value': 60}}],
            'triggers': ['start', 'pause', 'resume', 'stop'], 'asyncRun': True},
            'definitions': sorted(definitions, key=lambda d: d['id'])}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=Path(os.environ.get('SILICON_SOURCE', '/tmp/actwright-silicon')))
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    output = ROOT / 'frontend/src/core/registry/silicon.json'
    try:
        content = json.dumps(generate(args.source), indent=2, ensure_ascii=False) + '\n'
        if args.check:
            if output.read_text() != content:
                raise ValueError('Shipped metadata is stale; regenerate and review the diff')
            print('Metadata matches verified Silicon source.')
        else:
            output.write_text(content)
            print(f'Generated {output.relative_to(ROOT)}')
    except (OSError, ValueError) as exc:
        parser.exit(1, f'{exc}\n')

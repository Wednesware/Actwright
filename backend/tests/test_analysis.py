import ast
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT / 'scripts'))
from app.analysis.components import analyze_source, expression
from generate_metadata import generate, verified_sources


class StaticAnalysisTests(unittest.TestCase):
    def test_aliases_decorators_state_and_constructors(self):
        source = '''from silicon import Component as C, input as receive, output, trigger, State as S, update, register
@register('pack.Player', version=2)
class Player(C):
    local = S(10, scope='game')
    shared = S([1])
    positional = S(0, 'game')
    def __component__(self, label='player'): self.label = label
    @receive
    def damage(self, amount: int = 1): self.local -= amount
    @output
    def changed(self, value: int): pass
    @trigger
    def spawn(self): pass
    @update(rate=20)
    def tick(self, dt): pass
    def on_start(self, game): pass
'''
        result = analyze_source(source)
        self.assertEqual(result['source'], source)
        definition = result['definitions'][0]
        self.assertEqual(definition['id'], 'pack.Player')
        self.assertEqual(definition['version'], 2)
        self.assertEqual([s['scope']['value'] for s in definition['state']], ['game', 'shared', 'game'])
        self.assertEqual(definition['constructor']['strategy'], '__component__')
        members = {m['name']: m for m in definition['members']}
        self.assertEqual(members['damage']['kind'], 'input')
        self.assertEqual(members['changed']['kind'], 'output')
        self.assertEqual(members['spawn']['kind'], 'trigger')
        self.assertEqual(members['tick']['rate']['value'], 20)
        self.assertEqual(members['on_start']['kind'], 'lifecycle')

    def test_import_never_executes_user_code(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'executed'
            source = f'''import silicon as si
from pathlib import Path
Path({str(marker)!r}).write_text('wrong')
@dangerous_decorator()
class Example(si.Component):
    value = si.State(explode())
    def __init__(self): raise RuntimeError('must never run')
'''
            result = analyze_source(source)
            self.assertFalse(marker.exists())
            self.assertEqual(result['definitions'][0]['state'][0]['default'], {'kind': 'source', 'source': 'explode()'})
            self.assertEqual(result['source'], source)

    def test_invalid_python_and_unsupported_literal_preservation(self):
        source = 'class Broken(:\n'
        result = analyze_source(source)
        self.assertEqual(result['source'], source)
        self.assertEqual(result['diagnostics'][0]['code'], 'python.syntax')
        for value in ["{'x': (1, 2)}", "{1: 'value'}", "b'bytes'", '{1, 2}']:
            self.assertEqual(expression(ast.parse(value, mode='eval').body)['kind'], 'source')

    def test_known_component_subclasses_and_function_wrappers(self):
        result = analyze_source('''from silicon import Entity as E, component
class Player(E): pass
class Sub(Player): pass
@component
def double(value: int): return value * 2
''')
        self.assertEqual([d['name'] for d in result['definitions']], ['Player', 'Sub', 'double'])
        self.assertEqual(result['definitions'][-1]['kind'], 'function')
        self.assertEqual([m['name'] for m in result['definitions'][-1]['members']], ['value', 'result'])

    def test_plain_module_is_preserved_and_size_limit_does_not_execute(self):
        result = analyze_source('# comment\nanswer = 42\n')
        self.assertEqual(result['definitions'], [])
        self.assertEqual(analyze_source(' ' * 2_000_001)['diagnostics'][0]['code'], 'python.limit')


class MetadataTests(unittest.TestCase):
    def test_shipped_snapshot_matches_verified_external_source(self):
        import os
        checkout = Path(os.environ.get('SILICON_SOURCE', '/tmp/actwright-silicon'))
        if not checkout.exists():
            self.skipTest('Set SILICON_SOURCE to a checkout of the documented pinned revision')
        expected = generate(checkout)
        actual = json.loads((ROOT / 'frontend/src/core/registry/silicon.json').read_text())
        self.assertEqual(actual, expected)

    def test_incorrect_source_revision_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'silicon'
            path.mkdir()
            (path / '__init__.py').write_text('raise RuntimeError("do not import")\n')
            with self.assertRaisesRegex(ValueError, 'differs from pinned'):
                verified_sources(Path(directory))

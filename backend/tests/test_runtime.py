import io
import json
import os
from pathlib import Path
import tempfile
import time
import unittest

from backend.app.analysis.scripts import analyze_script
from backend.app.runtime.server import Runtime, handler

SOURCE = Path(os.environ.get('SILICON_SOURCE', '/tmp/actwright-silicon'))


class ScriptAnalysisTests(unittest.TestCase):
    def test_static_validation_preserves_source_and_does_not_execute(self):
        with tempfile.TemporaryDirectory() as directory:
            marker = Path(directory) / 'executed'
            source = f'from pathlib import Path\nPath({str(marker)!r}).touch()\nreturn 42\n'
            result = analyze_script(source)
            self.assertEqual(result['diagnostics'], [])
            region = next(iter(result['program']['regions'].values()))
            self.assertEqual(region['source'], source)
            self.assertFalse(marker.exists())

    def test_output_discovery_is_static_and_rejects_invalid_socket_names(self):
        result = analyze_script('emit("points", 3)\nif True:\n    emit("place", "player", 2, y=4)\nemit("points", 1)')
        self.assertEqual(result['outputs'], ['points', 'place'])
        self.assertEqual(result['diagnostics'], [])
        self.assertTrue(analyze_script('emit("bad name", 1)')['diagnostics'])

    def test_nested_generators_are_valid_synchronous_callback_code(self):
        result = analyze_script('def values():\n    yield 1\nprint(list(values()))')
        self.assertIsNotNone(result['program'])
        self.assertEqual(result['diagnostics'], [])

    def test_invalid_bodies_and_limits_report_diagnostics(self):
        for source in ('print(', 'break', 'await hello()', 'yield 1', 'a' * 256_001, None):
            result = analyze_script(source)
            self.assertIsNone(result['program'])
            self.assertTrue(result['diagnostics'])

    def test_http_rejects_cross_origin_and_requires_token_without_opening_sockets(self):
        from email.message import Message
        class Fake:
            allowed = handler(None).allowed
            def __init__(self, host, origin, client):
                self.headers = Message()
                self.headers['Host'] = host
                if origin: self.headers['Origin'] = origin
                if client: self.headers['X-Actwright-Client'] = client
                self.status = None
            def reply(self, status, _): self.status = status
        for host, origin, client in [('evil.example', None, 'workspace'), ('localhost:8765', 'https://evil.example', 'workspace'), ('127.0.0.1:8765', None, None)]:
            fake = Fake(host, origin, client)
            self.assertFalse(fake.allowed()); self.assertEqual(fake.status, 403)
        self.assertTrue(Fake('127.0.0.1:8765', 'http://127.0.0.1:5173', 'workspace').allowed())

    def test_mutation_rejects_missing_or_wrong_companion_token(self):
        from email.message import Message
        from types import SimpleNamespace
        runtime = SimpleNamespace(token='expected-secret')
        Handler = handler(runtime)
        for token in (None, 'wrong-token'):
            request = object.__new__(Handler)
            request.headers = Message()
            request.headers['Host'] = '127.0.0.1:8765'
            request.headers['X-Actwright-Client'] = 'workspace'
            if token: request.headers['X-Actwright-Token'] = token
            replies = []
            request.reply = lambda status, data: replies.append((status, data))
            request.do_POST()
            self.assertEqual(replies[0][0], 403)


@unittest.skipUnless(SOURCE.exists(), 'Set SILICON_SOURCE to the pinned external checkout')
class RuntimeTests(unittest.TestCase):
    def setUp(self): self.runtime = Runtime(SOURCE)
    def tearDown(self): self.runtime.stop()
    def wait(self, predicate):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            result = self.runtime.snapshot()
            if predicate(result): return result
            time.sleep(0.01)
        self.fail(f'Worker did not reach expected state: {self.runtime.snapshot()}')
    def test_worker_runs_real_lifecycle_logs_pause_resume_stop_and_restart(self):
        source = '''from silicon import Game

def build_game():
    game = Game("Test")
    game.start >> (lambda game: print("hello"))
    game.pause >> (lambda game: print("paused"))
    game.resume >> (lambda game: print("resumed"))
    game.stop >> (lambda game: print("bye"))
    return game
'''
        first = self.runtime.start(source)['runId']
        self.wait(lambda s: any(e.get('message') == 'hello' for e in s['events']))
        self.runtime.command('pause', {'runId': first})
        self.wait(lambda s: s['status'] == 'paused')
        self.runtime.command('resume', {'runId': first})
        self.wait(lambda s: any(e.get('message') == 'resumed' for e in s['events']))
        stopped = self.runtime.command('stop', {'runId': first})
        self.assertEqual(stopped['status'], 'stopped')
        self.assertTrue(any(e.get('message') == 'bye' for e in stopped['events']))
        second = self.runtime.start(source)['runId']
        self.assertNotEqual(first, second)
        self.wait(lambda s: any(e.get('message') == 'hello' for e in s['events']))
        with self.assertRaises(ValueError): self.runtime.command('pause', {'runId': first})

    def test_exceptions_are_visible_and_infinite_startup_can_be_stopped(self):
        self.runtime.start('def build_game():\n    raise RuntimeError("broken script")\n')
        result = self.wait(lambda s: s['status'] == 'error')
        self.wait(lambda s: any('broken script' in e.get('message', '') for e in s['events']))
        started = self.runtime.start('def build_game():\n    while True: pass\n')
        before = time.monotonic()
        result = self.runtime.command('stop', {'runId': started['runId']})
        self.assertLess(time.monotonic() - before, 3)
        self.assertIn(result['status'], ('stopped', 'error'))
        self.assertIsNone(self.runtime.process)

    def test_python_input_handles_sequential_prompts_and_rejects_stale_replies(self):
        source = '''from silicon import Game

def build_game():
    game = Game()
    def start(game):
        identifier = input("Entity ID: ")
        name = input("Entity name: ")
        print(repr((identifier, name)))
    game.start >> start
    return game
'''
        run_id = self.runtime.start(source)['runId']
        first = self.wait(lambda s: s.get('pendingInput'))['pendingInput']
        self.assertEqual(first['prompt'], 'Entity ID: ')
        with self.assertRaises(ValueError): self.runtime.command('input_reply', {'runId': run_id, 'requestId': 'stale', 'text': 'bad'})
        with self.assertRaises(ValueError): self.runtime.command('input_reply', {'runId': run_id, 'requestId': first['requestId'], 'text': 'two\nlines'})
        self.runtime.command('input_reply', {'runId': run_id, 'requestId': first['requestId'], 'text': 'friend'})
        second = self.wait(lambda s: s.get('pendingInput') and s['pendingInput']['requestId'] != first['requestId'])['pendingInput']
        self.assertEqual(second['prompt'], 'Entity name: ')
        with self.assertRaises(ValueError): self.runtime.command('input_reply', {'runId': run_id, 'requestId': first['requestId'], 'text': 'duplicate'})
        self.runtime.command('input_reply', {'runId': run_id, 'requestId': second['requestId'], 'text': "O'Brien \"雪\""})
        result = self.wait(lambda s: s['status'] == 'running')
        self.assertIsNone(result['pendingInput'])
        self.assertTrue(any('friend' in e.get('message', '') and '雪' in e.get('message', '') for e in result['events']))

    def test_stop_and_restart_cancel_pending_python_input(self):
        source = 'from silicon import Game\ndef build_game():\n    game = Game()\n    game.start >> (lambda game: input("Waiting: "))\n    return game\n'
        first = self.runtime.start(source)['runId']
        self.wait(lambda s: s.get('pendingInput'))
        stopped = self.runtime.command('stop', {'runId': first})
        self.assertEqual(stopped['status'], 'stopped')
        self.assertIsNone(stopped['pendingInput'])
        self.assertFalse(any(e.get('level') == 'error' for e in stopped['events']))
        second = self.runtime.start(source)['runId']
        self.assertNotEqual(first, second)
        self.wait(lambda s: s.get('pendingInput'))
        with self.assertRaises(ValueError): self.runtime.command('input_reply', {'runId': first, 'requestId': 'old', 'text': 'old'})

    def test_ticking_and_keyboard_input_reach_silicon(self):
        source = '''from silicon import Game, Component, InputMap, input, update
class Receiver(Component):
    @input
    def action(self, value): print("key:", value)
    @update()
    def advance(self, dt):
        if self._active_game.time > 0.05: print("tick")
def build_game():
    game = Game()
    keys, receiver = InputMap(), Receiver()
    game.add(keys, id="keys")
    game.add(receiver, id="receiver")
    game["keys"].out.action >> game["receiver"].ins.action
    game.actwright_components = {"keys": keys}
    return game
'''
        started = self.runtime.start(source)
        self.wait(lambda s: s['status'] == 'running')
        self.runtime.command('input', {'runId': started['runId'], 'componentId': 'keys', 'text': 'd'})
        self.wait(lambda s: any('key:' in e.get('message', '') for e in s['events']))
        self.wait(lambda s: any(e.get('message') == 'tick' for e in s['events']))


@unittest.skipUnless(SOURCE.exists(), 'Set SILICON_SOURCE to the pinned external checkout')
class ExportIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import subprocess
        import sys
        from backend.app.runtime.server import ROOT
        sys.path.insert(0, str(ROOT / 'scripts'))
        from generate_metadata import verified_sources
        verified_sources(SOURCE)
        sys.path.insert(0, str(SOURCE))
        cls.directory = tempfile.TemporaryDirectory(prefix='actwright-export-tests-')
        try:
            subprocess.run(['node', 'scripts/runtime-fixtures.ts', cls.directory.name], cwd=ROOT, check=True, capture_output=True, text=True, timeout=20)
        except BaseException:
            cls.directory.cleanup()
            raise
    @classmethod
    def tearDownClass(cls): cls.directory.cleanup()
    def load(self, name):
        import runpy
        return runpy.run_path(str(Path(self.directory.name) / name), run_name='export_test')['build_game']
    def test_downloaded_export_loads_silicon_through_nitrogen_and_emits_warning(self):
        import sys
        import types
        import warnings
        from unittest.mock import patch
        import silicon
        calls = []
        nitrogen = types.ModuleType('nitrogen')
        def require(publication):
            calls.append(publication)
            return silicon
        nitrogen.require = require
        with patch.dict(sys.modules, {'nitrogen': nitrogen}):
            factory = self.load('nitrogen.py')
        self.assertEqual(calls, ['si'])
        with warnings.catch_warnings(record=True) as messages:
            game = factory()
            game.start()
            game.stop()
        self.assertEqual([str(message.message) for message in messages], ['Careful'])
        source = (Path(self.directory.name) / 'warning.py').read_text()
        runtime = Runtime(SOURCE)
        try:
            runtime.start(source)
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                if any(event.get('level') == 'warning' and event.get('message') == 'Careful' for event in runtime.snapshot()['events']): break
                time.sleep(0.01)
            else: self.fail('Warning did not reach the runtime event stream')
        finally:
            runtime.stop()

    def test_exported_startup_pause_resume_stop_and_fresh_restart(self):
        from contextlib import redirect_stdout
        output = io.StringIO()
        factory = self.load('lifecycle.py')
        with redirect_stdout(output):
            game = factory(); game.start(); game.pause(); game.resume(); game.stop()
            second = factory(); second.start(); second.stop()
        self.assertIsNot(game, second)
        self.assertEqual(output.getvalue(), 'start\npause\nresume\nstop\nstart\nstop\n')
    def test_exported_tree_links_signals_and_triggers_keep_real_identity(self):
        from silicon import Stage2D, Entity
        from contextlib import redirect_stdout
        output = io.StringIO()
        with redirect_stdout(output):
            game = self.load('graph.py')(); game.start()
        self.assertTrue(game[Stage2D:'stage'][Entity:'player'].spawned)
        self.assertIs(game[Entity:'player'].component, game[Stage2D:'stage'][Entity:'hero'].component)
        self.assertEqual(len(game.connections), 1)
        self.assertEqual(output.getvalue(), 'hello\n')
        game.stop()
    def test_exported_numbered_selector_stays_live(self):
        from silicon import Entity
        game = self.load('numbered.py')()
        game[Entity('Newest'):'enemy1']
        game.start()
        self.assertTrue(game[Entity:'enemy1'].spawned)
        self.assertFalse(game[Entity:'enemy0'].spawned)
        game.stop()
    def test_exported_multiline_strings_keep_exact_whitespace(self):
        from contextlib import redirect_stdout
        output = io.StringIO()
        with redirect_stdout(output):
            game = self.load('literal.py')(); game.start(); game.stop()
        self.assertEqual(output.getvalue(), "'hello\\nworld'\n")

    def test_script_outputs_forward_positional_and_named_payloads_and_bind_parent(self):
        from silicon import Score, Stage2D
        from contextlib import redirect_stdout
        output = io.StringIO()
        with redirect_stdout(output):
            game = self.load('outputs.py')(); game.start()
        self.assertEqual(game[Score:'score'].value, 3)
        self.assertEqual(game[Stage2D:'stage'].cells['player'], [2, 4])
        self.assertEqual(output.getvalue(), '3\nbound parent\n')
        game.stop()

    def test_creation_helpers_return_bound_references_preserve_parents_and_reject_duplicates(self):
        from contextlib import redirect_stdout
        from silicon import Stage2D, Entity, Score
        output = io.StringIO()
        with redirect_stdout(output):
            game = self.load('creation.py')(); game.start()
        player = game[Stage2D:'board'][Entity:'player']
        self.assertEqual(player.name, 'Nova')
        self.assertTrue(player.spawned)
        self.assertEqual(player[Score].value, 5)
        self.assertEqual(game[Stage2D:'board'].cells['player'], [2, 1])
        self.assertEqual(output.getvalue(), 'created Nova 5\n')
        game.stop()

    def test_interactive_example_creates_real_entity_with_terminal_id_and_name(self):
        from contextlib import redirect_stdout
        from unittest.mock import patch
        import runpy
        from backend.app.runtime.server import ROOT
        from silicon import Stage2D, Entity
        import sys
        from types import ModuleType
        from unittest.mock import patch
        import silicon
        nitrogen = ModuleType('nitrogen')
        nitrogen.require = lambda publication: silicon if publication == 'si' else None
        with patch.dict(sys.modules, {'nitrogen': nitrogen}):
            factory = runpy.run_path(str(ROOT / 'examples/interactive-player-board.py'), run_name='example_check')['build_game']
        game = factory()
        output = io.StringIO()
        with patch('builtins.input', side_effect=['player', 'friend', '', 'Nova']), redirect_stdout(output):
            game.start()
        entity = game[Stage2D:'board'][Entity:'friend']
        self.assertEqual(entity.name, 'Nova')
        self.assertTrue(entity.spawned)
        self.assertTrue(game[Stage2D:'board'][Entity:'player'].spawned)
        self.assertEqual(game[Stage2D:'board'].cells['friend'], [2, 1])
        self.assertIn('Created entity ID: friend | name: Nova', output.getvalue())
        self.assertEqual(output.getvalue().count('|..@...|'), 1)
        self.assertEqual(output.getvalue().count('|..N...|'), 1)
        game.stop()
